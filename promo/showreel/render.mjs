/* Films the showreel frame by frame and encodes it with its soundtrack.
 *
 *   node promo/showreel/render.mjs            1080p60, motion blur, → promo/spindlshare-showreel.mp4
 *   node promo/showreel/render.mjs --draft    30 fps, no blur, quick, → dist/draft.mp4
 *
 * Every frame is rendered at its exact time, so nothing depends on how fast the
 * machine is. Motion blur comes from three sub-frames across half of each frame
 * (a 180° shutter), averaged by ffmpeg. */

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";
import { openStage, ffmpegPath } from "./browser.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(HERE, "dist");
const draft = process.argv.includes("--draft");
const FPS = draft ? 30 : 60;
const SUB = draft ? 1 : 3;
const SHUTTER = 0.5;
const OUT = draft ? path.join(DIST, "draft.mp4") : path.join(HERE, "..", "spindlshare-showreel.mp4");
const MASTER = path.join(DIST, "master.mp4");

if (!fs.existsSync(path.join(DIST, "soundtrack.wav")) || process.argv.includes("--music")) {
  const r = spawnSync(process.execPath, [path.join(HERE, "music.mjs")], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("the soundtrack did not build");
}
await build();
const ffmpeg = await ffmpegPath();
const stage = await openStage();
const frames = Math.round(stage.duration * FPS);

// Shaders compile on first use; warm every scene up so no frame pays for it mid-shot.
for (let t = 0; t < stage.duration; t += 4) await stage.frame(t);

const target = draft ? OUT : MASTER;
const vf = SUB > 1
  ? `tmix=frames=${SUB}:weights=${Array(SUB).fill(1).join(" ")},select='eq(mod(n\\,${SUB})\\,${SUB - 1})',setpts=N/${FPS}/TB,format=yuv420p`
  : "format=yuv420p";
const enc = spawn(ffmpeg, [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS * SUB), "-c:v", "mjpeg", "-i", "-",
  "-i", path.join(DIST, "soundtrack.wav"),
  "-vf", vf, "-r", String(FPS),
  "-c:v", "libx264", "-preset", draft ? "veryfast" : "slow", "-crf", draft ? "23" : "14", "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "256k", "-shortest", "-movflags", "+faststart", target,
], { stdio: ["pipe", "inherit", "inherit"] });
const done = new Promise((res, rej) => enc.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited ${code}`)))));

const t0 = Date.now();
try {
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < SUB; k++) {
      const t = f / FPS + (k * SHUTTER) / FPS / SUB;
      await stage.frame(t);
      const jpg = await stage.capture("jpeg", 94);
      if (!enc.stdin.write(jpg)) await new Promise((r) => enc.stdin.once("drain", r));
    }
    if (f % FPS === 0) {
      const el = (Date.now() - t0) / 1000;
      const eta = f ? (el / f) * (frames - f) : 0;
      console.log(`${(f / FPS).toFixed(0).padStart(2)}s of ${stage.duration}s  ${el.toFixed(0)}s elapsed, ~${eta.toFixed(0)}s to go`);
    }
  }
} finally {
  enc.stdin.end();
  stage.close();
}
await done;
if (stage.logs.filter((l) => !/X4122|Program Info Log/.test(l)).length) console.log(stage.logs.filter((l) => !/X4122|Program Info Log/.test(l)).join("\n"));

if (!draft) {
  // The master stays local; the copy in the repo is sized for the web.
  const web = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", MASTER,
    "-c:v", "libx264", "-preset", "slow", "-crf", "22", "-maxrate", "9M", "-bufsize", "18M", "-pix_fmt", "yuv420p",
    "-profile:v", "high", "-level", "4.2", "-c:a", "copy", "-movflags", "+faststart", OUT,
  ], { stdio: "inherit" });
  if (web.status !== 0) throw new Error("the web copy did not encode");
}
const mb = (p) => (fs.statSync(p).size / 1e6).toFixed(1);
console.log(`\nWrote ${OUT} (${mb(OUT)} MB)${draft ? "" : `, master ${MASTER} (${mb(MASTER)} MB)`} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
process.exit(0);
