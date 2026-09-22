/* Records the SpindlShare promo.
 *
 * Drives the stage shot by shot in a headless browser, captures a frame at a
 * fixed cadence, then muxes them with ffmpeg. Frames are pulled one at a time
 * rather than streamed, so the output is deterministic: the same run produces
 * the same video, however slow the machine is that day. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMES = path.join(HERE, "frames");
const OUT = path.join(HERE, "spindlshare-promo.mp4");
const FPS = 25;
const APP = process.argv[2] || "http://localhost:3000";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------------------------------------- browser */
const PORT = 9410 + Math.floor(Math.random() * 60);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "promo-"));
const browser = spawn(
  EDGE,
  [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--autoplay-policy=no-user-gesture-required",
    "--force-device-scale-factor=1",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let wsurl;
for (let i = 0; i < 100; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) { wsurl = (await r.json()).webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
if (!wsurl) throw new Error("browser did not start");

const ws = new WebSocket(wsurl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 1;
const pending = new Map();
const events = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  } else if (m.method) events.push(m.method);
});
const send = (method, params = {}, sid) =>
  new Promise((res, rej) => {
    const i = id++;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
await send("Page.enable", {}, sessionId);
await send("Emulation.setDeviceMetricsOverride",
  { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);

const run = async (expr) => {
  const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) {
    console.log("  EVAL:", JSON.stringify(r.exceptionDetails).slice(0, 180));
  }
  return r.result.value;
};

/* ------------------------------------------------------------- recording */
let frame = 0;
async function grab() {
  const shot = await send("Page.captureScreenshot", { format: "png" }, sessionId);
  fs.writeFileSync(
    path.join(FRAMES, `f${String(frame++).padStart(5, "0")}.png`),
    Buffer.from(shot.data, "base64")
  );
}
/** Holds the current state for `seconds`, capturing at the target rate. */
async function hold(seconds) {
  const n = Math.round(seconds * FPS);
  for (let i = 0; i < n; i++) await grab();
}

const stage = "file:///" + path.join(HERE, "stage.html").replace(/\\/g, "/");
events.length = 0;
await send("Page.navigate", { url: stage }, sessionId);
for (let i = 0; i < 150 && !events.includes("Page.loadEventFired"); i++) await sleep(100);
await sleep(700);

const say = (eyebrow, line, sub) =>
  run(`PROMO.caption(${JSON.stringify(eyebrow)},${JSON.stringify(line)},${JSON.stringify(sub)})`);

console.log("Recording...");

/* 1. Title ---------------------------------------------------------------- */
console.log("  1/8 title");
await run("PROMO.reset()");
await run(
  'PROMO.card("Spindl<em>Share</em>", "One link for every playlist you have made", false)'
);
await hold(3.2);
await run("PROMO.fadeAll()");
await hold(0.5);

/* 2. The problem ---------------------------------------------------------- */
console.log("  2/8 the problem");
await run("PROMO.reset()");
await say(
  "The problem",
  "Your playlists are split across Spotify and YouTube.",
  "Sharing them means sending three links and explaining which is which."
);
await run(`PROMO.scatter([
  { x: 1120, y: 210, r: -4, c: "#1ed760", name: "OG B-TOWN", svc: "Spotify" },
  { x: 1360, y: 360, r: 3,  c: "#1ed760", name: "Hollywood", svc: "Spotify" },
  { x: 1080, y: 520, r: -2, c: "#ff3d3d", name: "Road Trip", svc: "YouTube" },
  { x: 1330, y: 665, r: 5,  c: "#1ed760", name: "Bhajans", svc: "Spotify" },
  { x: 1140, y: 820, r: -3, c: "#ff3d3d", name: "Late Night", svc: "YouTube" }
])`);
await hold(4.6);
await run("PROMO.fadeAll()");
await hold(0.5);

/* 3. Paste ---------------------------------------------------------------- */
console.log("  3/8 paste");
await run("PROMO.reset()");
await say(
  "The setup",
  "Paste any playlist link.",
  "No account to connect, and no permissions to grant."
);
await run("PROMO.pasteShow()");
await hold(1.0);

// Typed a chunk at a time, so the caret reads as someone entering a URL.
const URL_TEXT = "https://open.spotify.com/playlist/4X9STQs4rZQjXHLlhjVaNY";
for (let i = 6; i <= URL_TEXT.length; i += 3) {
  await run(`PROMO.pasteType(${JSON.stringify(URL_TEXT.slice(0, i))})`);
  await grab();
}
await hold(0.6);
await run("PROMO.pastePress()");
await hold(0.8);
await run("PROMO.fadeAll()");
await hold(0.5);

/* 4. It arrives ----------------------------------------------------------- */
console.log("  4/8 it arrives");
await run("PROMO.reset()");
await say(
  "The setup",
  "The cover art arrives with it.",
  "That is the entire setup."
);
await run(`PROMO.phoneImage("${APP}/cs-shots/dashboard.png")`);
await hold(3.8);
await run("PROMO.fadeAll()");
await hold(0.5);

/* 5. The shelf, live ------------------------------------------------------ */
console.log("  5/8 the shelf");
await run("PROMO.reset()");
await say(
  "The page",
  "Your playlists become a shelf people flick through.",
  "Endless in both directions, and the list never repeats."
);
await run(`PROMO.phoneFrame("${APP}/embed/stacked?u=saurabhchandra")`);
await hold(1.6);
// Scroll the real deck, so the motion in frame is the product's own.
for (let i = 0; i < 4; i++) {
  await run(`(() => {
    const f = document.querySelector('#phoneInner iframe');
    const d = f && f.contentDocument;
    if (!d) return 0;
    const s = d.querySelector('.touch-none') || d.body;
    s.dispatchEvent(new f.contentWindow.WheelEvent('wheel',
      { deltaY: 120, bubbles: true, cancelable: true }));
    return 1;
  })()`);
  await hold(0.85);
}
await run("PROMO.fadeAll()");
await hold(0.5);

/* 6. The arc -------------------------------------------------------------- */
console.log("  6/8 the arc");
await run("PROMO.reset()");
await say(
  "The page",
  "Or an arc, if you have a lot of them.",
  "Same shelf, your choice on the settings page."
);
await run(`PROMO.phoneFrame("${APP}/embed/arc?u=saurabhchandra")`);
await hold(1.6);
for (let i = 0; i < 3; i++) {
  await run(`(() => {
    const f = document.querySelector('#phoneInner iframe');
    const d = f && f.contentDocument;
    if (!d) return 0;
    const s = d.querySelector('.touch-none') || d.body;
    s.dispatchEvent(new f.contentWindow.WheelEvent('wheel',
      { deltaY: 120, bubbles: true, cancelable: true }));
    return 1;
  })()`);
  await hold(0.85);
}
await run("PROMO.fadeAll()");
await hold(0.5);

/* 7. It plays ------------------------------------------------------------- */
console.log("  7/8 it plays");
await run("PROMO.reset()");
await say(
  "The payoff",
  "Open one and the songs are there, ready to play.",
  "Thirty-second previews, with no sign-in needed."
);
await run(`PROMO.phoneImage("${APP}/cs-shots/real-songs.png")`);
await hold(2.2);
// Swap to the playing still, so the shot ends on something sounding.
await run(`PROMO.phoneImage("${APP}/cs-shots/real-player.png")`);
await hold(2.6);
await run("PROMO.fadeAll()");
await hold(0.5);

/* 8. The address ---------------------------------------------------------- */
console.log("  8/8 the address");
await run("PROMO.reset()");
await run(
  'PROMO.card("spindlshare.vercel.app/<em>yourname</em>", "Claim yours in under a minute.", true)'
);
await hold(3.6);
await run("PROMO.fadeAll()");
await hold(0.6);

console.log(`Captured ${frame} frames (${(frame / FPS).toFixed(1)}s)`);

await send("Target.closeTarget", { targetId });
ws.close();
browser.kill();

/* ---------------------------------------------------------------- encode */
const ffmpeg = path.join(HERE, "..", "node_modules", "ffmpeg-static", "ffmpeg.exe");
if (!fs.existsSync(ffmpeg)) throw new Error("ffmpeg-static not found at " + ffmpeg);

const args = [
  "-y",
  "-framerate", String(FPS),
  "-i", path.join(FRAMES, "f%05d.png"),
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "19",
  // Even dimensions and yuv420p, or the file will not play in most players.
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  OUT,
];
console.log("Encoding...");
const enc = spawnSync(ffmpeg, args, { encoding: "utf8" });
if (enc.status !== 0) {
  console.log((enc.stderr || "").split("\n").slice(-14).join("\n"));
  throw new Error("ffmpeg failed");
}
const size = fs.statSync(OUT).size;
console.log(`\nWrote ${OUT}`);
console.log(`${(size / 1e6).toFixed(1)} MB, ${(frame / FPS).toFixed(1)}s, 1920x1080 @ ${FPS}fps`);
