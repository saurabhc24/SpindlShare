/* The footer's Chladni plate at film resolution: the shipped wave and constants,
   many more grains, and a fixed-step simulation that can be sought to any time. */

import * as THREE from "three";

const MODES = [[2, 5], [3, 5], [2, 7], [4, 9], [1, 6], [5, 8], [3, 10], [4, 7]];
const STEP = 1 / 120;

/** Standing wave on a free square plate; sand gathers where it is zero. */
const wave = (x, y, n, m) => Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) - Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * modeAt(t) -> { index, changedAt }; rate(t) -> how fast time runs for the sand (1, or less
 * as the tape stops); hum(t) -> extra shaking from the music.
 */
export function createSand(parent, { width = 1920, height = 1080, grains = 60000, plates = 2, from, modeAt, rate, hum }) {
  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, { position: "absolute", left: "0px", top: "0px", width: `${width}px`, height: `${height}px` });
  parent.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  const aspect = width / height;
  const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0, 1);
  const scene = new THREE.Scene();
  const positions = new Float32Array(grains * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uSize: { value: 2.4 }, uColor: { value: new THREE.Color("#f3ede3") }, uOpacity: { value: 0.6 } },
    vertexShader: "uniform float uSize; void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = uSize; }",
    fragmentShader: "uniform vec3 uColor; uniform float uOpacity; void main() { float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.18, d); gl_FragColor = vec4(uColor, a * uOpacity); }",
    transparent: true,
    depthWrite: false,
  });
  scene.add(new THREE.Points(geometry, material));

  const cell = aspect / plates;
  let simT = -Infinity;
  const snapshots = new Map();

  function reset() {
    const random = rng(4242);
    for (let i = 0; i < grains; i++) {
      positions[i * 3] = (random() * 2 - 1) * aspect;
      positions[i * 3 + 1] = random() * 2 - 1;
    }
    // Settled on the first figure before the scene opens, so it lands on the drop already drawn.
    for (let k = 0; k < 220; k++) step(from - 3, 1, { n: MODES[0][0], m: MODES[0][1], kick: 0, hum: 0 });
    simT = from;
  }

  const random = rng(99);
  function step(t, amount, forced) {
    let n, m, kick, extra;
    if (forced) ({ n, m, kick, hum: extra } = forced);
    else {
      const md = modeAt(t);
      [n, m] = MODES[md.index % MODES.length];
      kick = Math.exp(-(t - md.changedAt) / 0.7);
      extra = hum(t);
    }
    const shakeBase = 0.0045 + 0.035 * kick + extra;
    const drift = 0.0022 * amount * (1 - 0.6 * kick);
    const jitter = Math.sqrt(amount);
    for (let i = 0; i < grains; i++) {
      const k = i * 3;
      let x = positions[k];
      let y = positions[k + 1];
      const tt = (x + aspect) / (2 * cell);
      const u = (tt - Math.floor(tt)) * 2 - 1;
      const f = wave(u, y, n, m);
      const gx = (wave(u + 0.002, y, n, m) - f) / 0.002;
      const gy = (wave(u, y + 0.002, n, m) - f) / 0.002;
      const shake = (Math.min(1, Math.abs(f)) * 0.03 + shakeBase) * jitter;
      x += -f * gx * drift + (random() - 0.5) * shake;
      y += -f * gy * drift + (random() - 0.5) * shake;
      if (x < -aspect) x += 2 * aspect;
      if (x > aspect) x -= 2 * aspect;
      positions[k] = x;
      positions[k + 1] = y < -1 ? -1 : y > 1 ? 1 : y;
    }
  }

  /** Brings the sand to time t: forward in fixed steps, or back from the nearest snapshot. */
  function seek(t) {
    if (t < simT - 1e-6 || simT === -Infinity) {
      let best = -Infinity;
      for (const k of snapshots.keys()) if (k <= t && k > best) best = k;
      if (best > -Infinity) {
        positions.set(snapshots.get(best));
        simT = best;
      } else reset();
    }
    while (simT + STEP <= t + 1e-9) {
      const r = rate(simT);
      if (r > 0.0001) step(simT, 0.5 * r);
      simT += STEP;
      const sec = Math.round(simT * 2) / 2;
      if (Math.abs(simT - sec) < STEP / 2 && !snapshots.has(sec)) snapshots.set(sec, positions.slice());
    }
  }

  return {
    canvas,
    material,
    draw(t) {
      seek(t);
      geometry.attributes.position.needsUpdate = true;
      renderer.render(scene, camera);
    },
  };
}
