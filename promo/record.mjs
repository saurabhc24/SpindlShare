/* Films the SpindlShare feature video from the running app.
 *
 *   npm run dev
 *   node promo/record.mjs http://localhost:3000
 *
 * The stage plays in real time and the screencast captures it with real
 * timestamps, so motion in the file runs at the speed it ran on screen. Run it
 * on chrome-headless-shell (BROWSER=...): full browsers open panels in the
 * window mid-run and the screencast films the window, so they crop the film.
 * The shelf shots are the shipped Deck and Arc, driven through DevTools, and
 * each interaction is checked so a silent no-op cannot pass. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] || "http://localhost:3000";
const USER = process.argv[3] || "saurabhchandra";
const OUT = path.join(HERE, "spindlshare-feature.mp4");
const FPS = 30;
// chrome-headless-shell, ideally: full browsers open panels and bars in the
// window mid-run, and the screencast films the window, so they crop the film.
const BROWSER =
  process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SHELL = /headless-shell/i.test(BROWSER);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findFfmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  try {
    const bin = createRequire(path.join(HERE, "..", "package.json"))("ffmpeg-static");
    if (bin && fs.existsSync(bin)) return bin;
  } catch {}
  return "ffmpeg";
}

/* ---------------------------------------------------------------- browser */
const FRAMES = fs.mkdtempSync(path.join(os.tmpdir(), "spindl-frames-"));
const PORT = 9500 + Math.floor(Math.random() * 80);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "spindl-promo-"));
const browser = spawn(
  BROWSER,
  [
    ...(SHELL ? [] : ["--headless=new"]),
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    "--window-size=1920,1080",
    "about:blank",
  ],
  { stdio: "ignore" }
);

let wsurl;
for (let i = 0; i < 120; i++) {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) { wsurl = (await r.json()).webSocketDebuggerUrl; break; }
  } catch {}
  await sleep(250);
}
if (!wsurl) throw new Error("the browser did not start");

const ws = new WebSocket(wsurl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let nextId = 1;
const pending = new Map();
const seen = [];
const frames = [];
let capturing = false;
let sessionId;
const children = [];
let t0 = 0;
const marks = { scenes: {} };

ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    return;
  }
  if (!m.method) return;
  seen.push(m.method);
  if (m.method === "Page.screencastFrame") {
    const { data, metadata, sessionId: frameSession } = m.params;
    if (capturing) {
      const file = path.join(FRAMES, `f${String(frames.length).padStart(6, "0")}.jpg`);
      fs.writeFileSync(file, Buffer.from(data, "base64"));
      frames.push({ file, ts: metadata.timestamp });
    }
    send("Page.screencastFrameAck", { sessionId: frameSession }, sessionId).catch(() => {});
  }
  if (m.method === "Target.attachedToTarget" && m.params.targetInfo.type === "iframe") {
    const child = m.params.sessionId;
    children.push({ url: m.params.targetInfo.url, sid: child });
    // Held at start, so the beacon is blocked before the frame's first request.
    (async () => {
      await send("Network.enable", {}, child).catch(() => {});
      await send("Network.setBlockedURLs", { urls: ["*/api/visit*"] }, child).catch(() => {});
      await send("Runtime.runIfWaitingForDebugger", {}, child).catch(() => {});
    })();
  }
});

function send(method, params = {}, sid) {
  return new Promise((res, rej) => {
    const i = nextId++;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
({ sessionId } = await send("Target.attachToTarget", { targetId, flatten: true }));
await send("Page.enable", {}, sessionId);
await send("Network.enable", {}, sessionId);
// Filming is not a visit; without this every run adds one to the admin count.
await send("Network.setBlockedURLs", { urls: ["*/api/visit*"] }, sessionId);
// The app's frames load out of process, so each is its own target to attach to.
await send("Target.setAutoAttach",
  { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);

// Pinned, so the page is always 1920x1080 however the window around it changes.
await send("Emulation.setDeviceMetricsOverride",
  { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false }, sessionId);

async function run(expression, sid) {
  const r = await send("Runtime.evaluate",
    { expression, returnByValue: true, awaitPromise: true }, sid || sessionId);
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 240));
  return r.result.value;
}

/* The app's frames, each attached as its own target: a cross-origin frame's
   DOM is out of the stage's reach, which is what the last version got wrong. */
async function frameContext(match) {
  // Attached before they navigated, so ask each frame where it ended up.
  for (let i = 0; i < 80; i++) {
    for (const c of children) {
      c.url = await run("location.href", c.sid).catch(() => c.url);
      if (match(c.url)) return c.sid;
    }
    await sleep(250);
  }
  throw new Error("no frame matched; attached " + JSON.stringify(children.map((c) => c.url)));
}

/* -------------------------------------------------------------- the stage */
const stage = pathToFileURL(path.join(HERE, "stage.html")).href +
  `?app=${encodeURIComponent(APP)}&u=${encodeURIComponent(USER)}`;
seen.length = 0;
await send("Page.navigate", { url: stage }, sessionId);
for (let i = 0; i < 200 && !seen.includes("Page.loadEventFired"); i++) await sleep(100);

// Fonts, cover art, and three copies of the app all have to be up first.
let ready;
for (let i = 0; i < 60; i++) {
  ready = JSON.parse(await run("PROMO.ready()"));
  if (ready.fonts === "loaded" && ready.images) break;
  await sleep(500);
}
console.log("stage:", JSON.stringify(ready));

const ctx = {
  stacked: await frameContext((u) => u.includes("/embed/stacked") && !u.includes("shot=play")),
  arc: await frameContext((u) => u.includes("/embed/arc")),
  play: await frameContext((u) => u.includes("shot=play")),
};
for (const [name, id] of Object.entries(ctx)) {
  let cards = 0;
  for (let i = 0; i < 60 && cards < 1; i++) {
    cards = await run("document.querySelectorAll('[data-card], [data-cover]').length", id);
    if (!cards) await sleep(500);
  }
  if (!cards) throw new Error(`the ${name} frame never rendered its shelf`);
  console.log(`frame ${name}: ${cards} cards`);
}
await sleep(1500);

const checks = [];
const check = (label, ok, detail) => {
  checks.push({ label, ok });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}  ${detail ?? ""}`);
};

const FIRST_TRANSFORM =
  "getComputedStyle(document.querySelector('[data-card], [data-cover]')).transform";
const WHEEL = `(() => {
  const s = document.querySelector('.touch-none') || document.body;
  s.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true }));
  return 1;
})()`;
const FRONT = `(document.querySelector('[data-cover][aria-current="true"]')
  || document.querySelectorAll('[data-card], [data-cover]')[0])`;

/* ------------------------------------------------------------- recording */
await send("Page.startScreencast",
  { format: "jpeg", quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 }, sessionId);
capturing = true;
t0 = Date.now() / 1000;
console.log("Recording...");

// 0. Logo
marks.scenes[0] = 0; await run("PROMO.go(0)");
await sleep(4500);

// 01. One link
marks.scenes[1] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(1)");
await sleep(5600);

// 02. Paste: held long enough that the toggle is seen after it flips.
marks.scenes[2] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(2)");
await sleep(6200);

// 03. The shelf, scrolled for real
marks.scenes[3] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(3)");
await sleep(1500);
let before = await run(FIRST_TRANSFORM, ctx.stacked);
for (let i = 0; i < 4; i++) {
  await run(WHEEL, ctx.stacked);
  await sleep(1150);
}
check("the stacked shelf moved", (await run(FIRST_TRANSFORM, ctx.stacked)) !== before);

// 04. The arc
marks.scenes[4] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(4)");
await sleep(1400);
before = await run(FIRST_TRANSFORM, ctx.arc);
for (let i = 0; i < 3; i++) {
  await run(WHEEL, ctx.arc);
  await sleep(1250);
}
check("the arc moved", (await run(FIRST_TRANSFORM, ctx.arc)) !== before);

// 05. Lift a card, open it, play a song
marks.scenes[5] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(5)");
await sleep(1100);
await run(`${FRONT}.click()`, ctx.play);
await sleep(1100);
await run(`${FRONT}.click()`, ctx.play);
await sleep(1800);
const opened = await run(
  "!!document.querySelector('[role=\"dialog\"][aria-modal=\"true\"][aria-hidden=\"false\"]')", ctx.play);
check("the player opened", opened);
await run("(() => { const r = document.querySelectorAll('[role=\"dialog\"] ol li'); if (r[2]) r[2].click(); return r.length; })()", ctx.play);
await sleep(2600);
const playing = await run(
  "(() => { const a = document.querySelector('[role=\"dialog\"] audio'); return !!a && !a.paused && a.currentTime > 0; })()",
  ctx.play);
check("a song is actually playing", playing);

// 06. Curate
marks.scenes[6] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(6)");
await sleep(5000);

// Outro
marks.scenes[7] = +(Date.now() / 1000 - t0).toFixed(2); await run("PROMO.go(7)");
await sleep(5200);

capturing = false;
const t1 = Date.now() / 1000;
await send("Page.stopScreencast", {}, sessionId);
await run("(() => { document.querySelectorAll('iframe').forEach(f => { try { f.remove(); } catch {} }); return 1; })()");
await send("Target.closeTarget", { targetId });
ws.close();
browser.kill();

/* ---------------------------------------------------------------- encode */
function jpegSize(file) {
  const b = fs.readFileSync(file);
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 0, h: 0 };
}
const sizes = new Map();
for (const f of frames) {
  const { w, h } = jpegSize(f.file);
  f.full = w === 1920 && h === 1080;
  const key = `${w}x${h}`;
  sizes.set(key, (sizes.get(key) || 0) + 1);
}
console.log("frame sizes:", JSON.stringify(Object.fromEntries(sizes)));
const inWindow = frames.filter((f) => f.ts >= t0 - 0.05);
const kept = inWindow.filter((f) => f.full);
check("every frame is full size", kept.length === inWindow.length,
  `${kept.length}/${inWindow.length}`);
// A dropped run of frames shows up as a freeze, so the longest gap must stay short.
let longest = 0, at = 0;
for (let i = 1; i < kept.length; i++) {
  const gap = kept[i].ts - kept[i - 1].ts;
  if (gap > longest) { longest = gap; at = kept[i - 1].ts - t0; }
}
const slow = [];
for (let i = 1; i < kept.length; i++) {
  const gap = kept[i].ts - kept[i - 1].ts;
  if (gap > 0.12) slow.push(`${(kept[i - 1].ts - t0).toFixed(2)}s+${(gap * 1000) | 0}ms`);
}
console.log("gaps over 120ms:", slow.join(", ") || "none");
console.log("scene starts:", JSON.stringify(marks.scenes));
check("no visible freeze between frames", longest < 0.25, `${(longest * 1000).toFixed(0)}ms`);
if (kept.length < 10) throw new Error(`only ${kept.length} frames were captured`);
console.log(`Captured ${kept.length} frames over ${(t1 - t0).toFixed(1)}s, ${(kept.length / (t1 - t0)).toFixed(1)} fps`);

// Each frame holds until the next arrives; the screencast only sends changes.
const lines = [];
for (let i = 0; i < kept.length; i++) {
  const end = i + 1 < kept.length ? kept[i + 1].ts : t1;
  lines.push(`file '${kept[i].file.replace(/\\/g, "/")}'`);
  lines.push(`duration ${Math.max(0.001, end - kept[i].ts).toFixed(4)}`);
}
lines.push(`file '${kept[kept.length - 1].file.replace(/\\/g, "/")}'`);
const list = path.join(FRAMES, "list.txt");
fs.writeFileSync(list, lines.join("\n"));

const ffmpeg = findFfmpeg();
console.log("Encoding with", ffmpeg);
const enc = spawnSync(ffmpeg, [
  "-y",
  "-f", "concat", "-safe", "0", "-i", list,
  "-vf", `fps=${FPS},scale=1920:1080:flags=lanczos,format=yuv420p`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20",
  "-movflags", "+faststart",
  OUT,
], { encoding: "utf8" });
if (enc.status !== 0) {
  console.log((enc.stderr || "").split("\n").slice(-12).join("\n"));
  throw new Error("ffmpeg failed");
}
fs.rmSync(FRAMES, { recursive: true, force: true });

const failed = checks.filter((c) => !c.ok).length;
console.log(`\nWrote ${OUT}  (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`);
console.log(failed ? `${failed} interaction check(s) FAILED` : "every interaction check passed");
process.exit(failed ? 1 : 0);
