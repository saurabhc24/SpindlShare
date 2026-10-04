/* Stills of the film at chosen moments, for checking a shot without rendering the whole thing.
 *
 *   node promo/showreel/preview.mjs <outDir> 1.5 2.25 9 ...     one JPEG per time
 *   node promo/showreel/preview.mjs <outDir> --every 0.5 0 64   and a contact sheet
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "./build.mjs";
import { openStage, ffmpegPath } from "./browser.mjs";

const [out, ...args] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
let times = args.map(Number);
let sheet = false;
if (args[0] === "--every") {
  const [step, from, to] = args.slice(1).map(Number);
  times = [];
  for (let t = from; t < to - 1e-9; t += step) times.push(+t.toFixed(4));
  sheet = true;
}

await build();
const stage = await openStage();
const files = [];
try {
  for (const t of times) {
    const t0 = Date.now();
    await stage.frame(t);
    const file = path.join(out, `t${t.toFixed(3).padStart(7, "0")}.jpg`);
    fs.writeFileSync(file, await stage.capture("jpeg", 90));
    files.push(file);
    console.log(`${t.toFixed(3)}s  ${Date.now() - t0} ms`);
  }
  if (stage.logs.length) console.log(stage.logs.join("\n"));
} finally {
  stage.close();
}

if (sheet) {
  const cols = 6;
  const rows = Math.ceil(files.length / cols);
  const list = path.join(out, "list.txt");
  fs.writeFileSync(list, files.map((f) => `file '${path.resolve(f).replace(/\\/g, "/")}'`).join("\n"));
  const r = spawnSync(await ffmpegPath(), [
    "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", `scale=384:216,tile=${cols}x${rows}:padding=4:color=white`, "-frames:v", "1", path.join(out, "sheet.jpg"),
  ], { encoding: "utf8" });
  if (r.status !== 0) console.log(r.stderr);
  else console.log("sheet:", path.join(out, "sheet.jpg"));
}
process.exit(0);
