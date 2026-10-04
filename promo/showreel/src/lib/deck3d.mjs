/* The product's own turntable (app/_landing/turntable-3d.ts), rebuilt around a
   camera the film controls. Nothing here animates by itself: each frame hands it
   the whole state, so a shot can be rendered at any time in any order. */

import * as THREE from "three";
import {
  grooveMaps, makeRecord, makeTurntable, studio, playAngle, drawLabel,
  PLATTER_C, MAT_TOP, LABEL_HALF, STACK_T, HOLD_BASE, SPINDLE_TOP, DECK_Y, PLINTH_H, RPM_33,
} from "@turntable";

export { PLATTER_C, MAT_TOP, LABEL_HALF, STACK_T, HOLD_BASE, SPINDLE_TOP, DECK_Y, RPM_33 };

/** Where a record rests on the platter, in the platter's own frame. */
export const REST_Y = MAT_TOP + LABEL_HALF;
/** Height of a record held on the changer's spindle, by slot from the bottom. */
export const heldY = (slot) => HOLD_BASE + LABEL_HALF + slot * STACK_T;

export function createDeck(parent, { records, width = 1920, height = 1080 }) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", left: "0px", top: "0px", width: `${width}px`, height: `${height}px` });
  parent.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(studio(), 0.02).texture;

  // The product's lighting, unchanged: a warm key with soft shadows, a brass rim, a low fill.
  const key = new THREE.DirectionalLight("#fff3e2", 2.4);
  key.position.set(-3.5, 6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -3.4, right: 3.4, top: 3.4, bottom: -3.4, near: 1, far: 16 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 9;
  key.shadow.blurSamples = 16;
  scene.add(key);
  const rim = new THREE.SpotLight("#e7c57a", 40, 14, 0.6, 0.8, 1.6);
  rim.position.set(2.6, 3.6, -4.4);
  rim.target.position.set(-0.2, 0, 0);
  scene.add(rim, rim.target);
  scene.add(new THREE.HemisphereLight("#fff4e6", "#1b120c", 0.35));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = DECK_Y - PLINTH_H - 0.12;
  floor.receiveShadow = true;
  scene.add(floor);

  const deck = makeTurntable(maxAniso);
  scene.add(deck.root);
  const armPlay = playAngle(deck, 0.93);

  // The changer's tall spindle with the shoulder its stack rests on, and the single deck's short pin.
  const spindle = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, SPINDLE_TOP + 0.1, 32), deck.chrome);
  post.position.set(PLATTER_C.x, (SPINDLE_TOP - 0.1) / 2, PLATTER_C.z);
  post.castShadow = true;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.021, 24, 12), deck.chrome);
  cap.position.set(PLATTER_C.x, SPINDLE_TOP, PLATTER_C.z);
  const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 32), deck.chrome);
  shoulder.position.set(PLATTER_C.x, HOLD_BASE - 0.015, PLATTER_C.z);
  shoulder.castShadow = true;
  spindle.add(post, cap, shoulder);
  scene.add(spindle);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 24), deck.chrome);
  pin.position.set(0, 0.04, 0);
  deck.spin.add(pin);

  const grooves = [grooveMaps(1024, 11, maxAniso), grooveMaps(1024, 29, maxAniso), grooveMaps(1024, 47, maxAniso)];
  const models = records.map((r, i) => makeRecord(r, grooves[i % grooves.length], maxAniso));
  const labels = models.map((m) => ({ title: m.label.title, meta: m.label.meta }));
  models.forEach((m) => {
    m.group.visible = false;
    scene.add(m.group);
  });

  const camera = new THREE.PerspectiveCamera(30, width / height, 0.01, 80);
  const ready = Promise.all(models.map((m) => m.ready))
    .then(() => document.fonts.ready)
    .then(() => models.forEach((m) => drawLabel(m.label, m.record)));

  const stylusWorld = () => {
    deck.root.updateMatrixWorld(true);
    return deck.head.localToWorld(deck.stylusLocal.clone());
  };

  function place(cam) {
    camera.fov = cam.fov ?? 30;
    camera.position.set(cam.pos[0], cam.pos[1], cam.pos[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    if (cam.roll) camera.rotateZ(cam.roll);
    camera.updateProjectionMatrix();
    // project() reads the world matrix, which otherwise only updates when the scene renders.
    camera.updateMatrixWorld(true);
  }

  function draw(state) {
    place(state.cam);
    deck.spin.rotation.y = state.spin ?? 0;
    deck.swing.rotation.y = state.armAngle ?? 0;
    deck.lift.position.y = state.armLift ?? 0;
    deck.lift.rotation.x = -(state.armLift ?? 0) * 0.35;
    spindle.visible = !!state.changer;
    pin.visible = !state.changer;
    models.forEach((m) => (m.group.visible = false));
    for (const r of state.records ?? []) {
      const m = models[r.i];
      const host = r.platter ? deck.spin : scene;
      if (m.group.parent !== host) host.add(m.group);
      m.group.position.set(r.pos[0], r.pos[1], r.pos[2]);
      m.group.rotation.set(r.rot?.[0] ?? 0, r.rot?.[1] ?? 0, r.rot?.[2] ?? 0);
      m.group.visible = true;
      const op = r.opacity ?? 1;
      for (const mat of m.materials) {
        const fade = op < 0.999;
        if (mat.transparent !== fade) {
          mat.transparent = fade;
          mat.needsUpdate = true;
        }
        mat.opacity = op;
      }
      const want = r.label;
      if (want && (want.title !== labels[r.i].title || want.meta !== labels[r.i].meta)) {
        m.label.title = want.title;
        m.label.meta = want.meta;
        drawLabel(m.label, m.record);
        labels[r.i] = { title: want.title, meta: want.meta };
      }
    }
    renderer.toneMappingExposure = state.exposure ?? 1.05;
    renderer.render(scene, camera);
  }

  /** Screen position of a world point under the last camera drawn. */
  function project(v) {
    const p = new THREE.Vector3(v[0], v[1], v[2]).project(camera);
    return { x: ((p.x + 1) / 2) * width, y: ((1 - p.y) / 2) * height };
  }

  return { canvas, renderer, draw, place, project, armPlay, models, ready, deck, camera, stylusWorld };
}
