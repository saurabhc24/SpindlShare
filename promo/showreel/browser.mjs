/* Opens the stage in a headless browser and drives it over the DevTools protocol:
   the recorder and the preview tool both film through this. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function openStage({ browser = process.env.BROWSER || EDGE } = {}) {
  const port = 9600 + Math.floor(Math.random() * 300);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "spindl-reel-"));
  const shell = /headless-shell/i.test(browser);
  const proc = spawn(browser, [
    ...(shell ? [] : ["--headless=new"]),
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--hide-scrollbars",
    "--mute-audio",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    "--ignore-gpu-blocklist",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1920,1080",
    "about:blank",
  ], { stdio: "ignore" });

  let wsurl;
  for (let i = 0; i < 120 && !wsurl; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) wsurl = (await r.json()).webSocketDebuggerUrl;
    } catch {}
    if (!wsurl) await sleep(250);
  }
  if (!wsurl) throw new Error("the browser did not start");
  const ws = new WebSocket(wsurl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));

  let id = 1;
  const pending = new Map();
  const seen = [];
  const logs = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(JSON.stringify(m.error)));
      else res(m.result);
      return;
    }
    if (m.method) seen.push(m.method);
    if (m.method === "Runtime.exceptionThrown") logs.push("exception: " + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
    if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) {
      logs.push(`${m.params.type}: ` + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
    }
  });
  let sid;
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = id++;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params, ...(sid ? { sessionId: sid } : {}) }));
    });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  ({ sessionId: sid } = await send("Target.attachToTarget", { targetId, flatten: true }));
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

  const run = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 600));
    return r.result.value;
  };

  seen.length = 0;
  await send("Page.navigate", { url: pathToFileURL(path.join(HERE, "stage.html")).href });
  for (let i = 0; i < 300 && !seen.includes("Page.loadEventFired"); i++) await sleep(100);
  const ok = await Promise.race([run("window.__ready"), sleep(90000).then(() => "timeout")]);
  if (ok !== true) throw new Error(`the stage never became ready (${ok}); ${logs.join(" | ")}`);

  return {
    logs,
    run,
    duration: await run("window.__duration"),
    frame: (t) => run(`window.__frame(${t})`),
    async capture(format = "jpeg", quality = 95) {
      const s = await send("Page.captureScreenshot", { format, ...(format === "png" ? {} : { quality }), captureBeyondViewport: false });
      return Buffer.from(s.data, "base64");
    },
    close() {
      try { ws.close(); } catch {}
      try { proc.kill(); } catch {}
    },
  };
}

/** ffmpeg: FFMPEG, then ffmpeg-static if installed, then whatever is on the path. */
export async function ffmpegPath() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  try {
    const { createRequire } = await import("node:module");
    const bin = createRequire(path.join(HERE, "..", "..", "package.json"))("ffmpeg-static");
    if (bin && fs.existsSync(bin)) return bin;
  } catch {}
  return "ffmpeg";
}
