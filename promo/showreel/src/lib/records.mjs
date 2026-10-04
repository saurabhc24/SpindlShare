/* Records seen from above at chosen points on the screen, each drawn live from the
   product's own model: the grooves keep catching the light as they turn. */

import * as THREE from "three";
import { grooveMaps, makeRecord, studio, drawLabel } from "@turntable";

export function createRecords(parent, { records, width = 1920, height = 1080 }) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", left: "0px", top: "0px", width: `${width}px`, height: `${height}px` });
  parent.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;
  const key = new THREE.DirectionalLight("#fff3e2", 2.2);
  key.position.set(-3, 5, 2);
  scene.add(key);
  // As the landing page bakes its sleeves: slightly off vertical, so the grooves catch the softboxes.
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 30);
  camera.position.set(0.9, 5.2, 1.4);
  camera.lookAt(0, 0, 0);

  const grooves = grooveMaps(1024, 17, maxAniso);
  const models = records.map((r) => makeRecord(r, grooves, maxAniso));
  models.forEach((m) => {
    m.group.visible = false;
    scene.add(m.group);
  });
  const ready = Promise.all(models.map((m) => m.ready))
    .then(() => document.fonts.ready)
    .then(() => models.forEach((m) => drawLabel(m.label, m.record)));

  /** Draws each record centred at (x, y) screen pixels, `size` across, turned `rot` radians. */
  function draw(items) {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, width, height);
    renderer.clear();
    renderer.setScissorTest(true);
    for (const it of items) {
      if (it.size < 2 || (it.opacity ?? 1) <= 0.001) continue;
      models.forEach((m, i) => (m.group.visible = i === it.i));
      const m = models[it.i];
      m.group.rotation.set(it.tilt ?? 0, it.rot ?? 0, 0);
      const op = it.opacity ?? 1;
      for (const mat of m.materials) {
        const fade = op < 0.999;
        if (mat.transparent !== fade) {
          mat.transparent = fade;
          mat.needsUpdate = true;
        }
        mat.opacity = op;
      }
      const x0 = Math.round(it.x - it.size / 2);
      const y0 = Math.round(height - (it.y + it.size / 2));
      const sz = Math.round(it.size);
      renderer.setViewport(x0, y0, sz, sz);
      renderer.setScissor(x0, y0, sz, sz);
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
  }

  return { canvas, draw, ready };
}
