/* Bundles the film for the browser: src/ plus three and the product's turntable.
 *
 *   node promo/showreel/build.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const esbuild = createRequire(path.join(ROOT, "package.json"))("esbuild");
const DIST = path.join(HERE, "dist");
fs.mkdirSync(DIST, { recursive: true });

// The module keeps its parts private; the film builds its own shots from them.
const expose = {
  name: "expose-turntable",
  setup(b) {
    b.onLoad({ filter: /turntable-3d\.ts$/ }, async (a) => ({
      loader: "ts",
      contents:
        (await fs.promises.readFile(a.path, "utf8")) +
        "\nexport { grooveMaps, makeRecord, makeTurntable, studio, playAngle, drawLabel, PLATTER_C, MAT_TOP, LABEL_HALF, STACK_T, HOLD_BASE, SPINDLE_TOP, DECK_Y, PLINTH_H, RPM_33 };\n",
    }));
  },
};

export async function build() {
  const t0 = Date.now();
  await esbuild.build({
    entryPoints: [path.join(HERE, "src", "main.mjs")],
    bundle: true,
    format: "iife",
    target: "es2022",
    outfile: path.join(DIST, "showreel.js"),
    alias: { "@turntable": path.join(ROOT, "app", "_landing", "turntable-3d.ts") },
    nodePaths: [path.join(ROOT, "node_modules")],
    plugins: [expose],
    logLevel: "warning",
  });
  const shelf = JSON.parse(fs.readFileSync(path.join(HERE, "shelf.json"), "utf8"));
  fs.writeFileSync(path.join(DIST, "shelf.js"), `window.SHELF = ${JSON.stringify(shelf)};\n`);
  console.log(`built in ${Date.now() - t0} ms`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await build();
