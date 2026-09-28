import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/*
 * A turntable modelled in real units of a record's radius (R = 1). Vinyl shines the way it
 * does because its grooves are concentric: anisotropic reflection along them gives the
 * radial streak that stays put while the record turns, and that is what sells it.
 */

export type DeckRecord = {
  id: string;
  title: string;
  service: string;
  songs: number | null;
  cover: string | null;
  letterboxed: boolean;
  color: string;
  /** What the label is printed on when there is no cover to print. */
  labelColor?: string;
};

export type TurntableController = {
  dispose(): void;
  setPlaying(on: boolean): void;
  setLabel(title: string, meta: string): void;
};

type Options = {
  mode: "changer" | "single";
  records: DeckRecord[];
  reducedMotion: boolean;
  onNowPlaying?: (index: number) => void;
  onReady?: () => void;
};

const LABEL_R = 0.37;
const MUSIC_IN = 0.39;
const MUSIC_OUT = 0.965;
const HALF = 0.009;
const LABEL_HALF = 0.012;
const STACK_T = 2 * LABEL_HALF + 0.002;
const PLATTER_R = 1.07;
const PLATTER_H = 0.13;
const MAT_TOP = 0.014;
const DECK_Y = -0.19;
const PLINTH_H = 0.4;
const PLATTER_C = new THREE.Vector3(-0.32, 0, 0.06);
const PIVOT = new THREE.Vector3(1.38, DECK_Y, -0.86);
const HOLD_BASE = 1.02;
const SPINDLE_TOP = 1.5;
const RPM_33 = (2 * Math.PI) / 1.8;
const CYCLE_MS = 5600;

/* ------------------------------------------------------------ textures */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dataTexture(data: Uint8Array, size: number, maxAniso: number) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = maxAniso;
  tex.needsUpdate = true;
  return tex;
}

/** Groove relief, gloss and direction for the music side, with glossy gaps between tracks. */
function grooveMaps(size: number, seed: number, maxAniso: number) {
  const random = rng(seed);
  const inner = MUSIC_IN / MUSIC_OUT;
  const gaps: number[] = [];
  const count = 4 + Math.floor(random() * 4);
  for (let i = 0; i < count; i++) gaps.push(0.46 + random() * 0.5);
  const loud = Array.from({ length: 64 }, () => 0.55 + random() * 0.45);

  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const aniso = new Uint8Array(size * size * 4);
  const period = 2.8 / (size / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy) || 1e-6;
      let amp = 0;
      let gloss = 0.3;
      let strength = 0;
      if (r > inner && r <= 1) {
        const gap = gaps.some((g) => Math.abs(r - g) < 0.0055);
        const leadIn = r > 0.982;
        const runOut = r < inner + 0.035;
        if (gap || leadIn) {
          amp = 0.05;
          gloss = 0.1;
          strength = 0.45;
        } else if (runOut) {
          amp = 0.18;
          gloss = 0.16;
          strength = 0.6;
        } else {
          const band = loud[Math.floor(r * 63)];
          amp = 0.35 + 0.45 * band;
          gloss = 0.26 + 0.14 * (1 - band);
          strength = 1;
        }
      }
      const slope = amp * Math.cos((r / period) * Math.PI * 2);
      const nx = (-slope * dx) / r;
      const ny = (-slope * dy) / r;
      const inv = 1 / Math.hypot(nx, ny, 1);
      normal[i] = (nx * inv * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      normal[i + 2] = (inv * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
      rough[i] = rough[i + 1] = rough[i + 2] = gloss * 255;
      rough[i + 3] = 255;
      aniso[i] = ((-dy / r) * 0.5 + 0.5) * 255;
      aniso[i + 1] = ((dx / r) * 0.5 + 0.5) * 255;
      aniso[i + 2] = strength * 255;
      aniso[i + 3] = 255;
    }
  }
  return {
    normal: dataTexture(normal, size, maxAniso),
    rough: dataTexture(rough, size, maxAniso),
    aniso: dataTexture(aniso, size, maxAniso),
  };
}

/** Circular brushing for machined aluminium: direction only, no relief. */
function brushedAniso(size: number, maxAniso: number) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy) || 1e-6;
      data[i] = ((-dy / r) * 0.5 + 0.5) * 255;
      data[i + 1] = ((dx / r) * 0.5 + 0.5) * 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size, maxAniso);
}

function canvasTexture(canvas: HTMLCanvasElement, maxAniso: number, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

/** Four rings of strobe dots, the kind a DJ reads the platter speed from. */
function strobeCanvas() {
  const c = document.createElement("canvas");
  c.width = 2048;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "#9ea2a8");
  g.addColorStop(0.5, "#e4e6e9");
  g.addColorStop(1, "#8d9197");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const rows = [
    { y: 0.2, n: 180 },
    { y: 0.4, n: 167 },
    { y: 0.6, n: 150 },
    { y: 0.8, n: 138 },
  ];
  ctx.fillStyle = "#1a1b1d";
  for (const row of rows) {
    const step = c.width / row.n;
    for (let k = 0; k < row.n; k++) ctx.fillRect(k * step + step * 0.25, row.y * c.height - 7, step * 0.5, 14);
  }
  return c;
}

/** Book-matched walnut, warped value noise stretched along the grain. */
function walnutCanvas() {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  const random = rng(7);
  const lattice = Array.from({ length: 256 }, () => random());
  const hash = (x: number, y: number) => lattice[(Math.imul(x, 73) ^ Math.imul(y, 151)) & 255];
  const noise2 = (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * sx;
    const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * sx;
    return a + (b - a) * sy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const warp = noise2(x * 0.004, y * 0.01) * 26 + noise2(x * 0.015, y * 0.04) * 6;
      const line = 0.5 + 0.5 * Math.sin((y + warp) * 0.19);
      const figure = Math.pow(line, 2.2);
      const streak = noise2(x * 0.02, y * 0.9);
      const pore = noise2(x * 0.5, y * 2.2) > 0.86 ? -0.1 : 0;
      const t = Math.max(0, Math.min(1, 0.26 + figure * 0.16 + streak * 0.2 + noise2(x * 0.002, y * 0.006) * 0.28 + pore * 0.6));
      const i = (y * size + x) * 4;
      img.data[i] = 30 + t * 74;
      img.data[i + 1] = 18 + t * 44;
      img.data[i + 2] = 11 + t * 24;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function fontFamily(variable: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value || fallback;
}

/** Text set along a circle, upright across the top or along the bottom. */
function arcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  bottom: boolean,
  spacing: number
) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0);
  let angle = (bottom ? Math.PI / 2 : -Math.PI / 2) + ((bottom ? 1 : -1) * total) / radius / 2;
  [...text].forEach((ch, i) => {
    const step = widths[i] / radius;
    const mid = angle + ((bottom ? -1 : 1) * step) / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(mid) * radius, cy + Math.sin(mid) * radius);
    ctx.rotate(bottom ? mid - Math.PI / 2 : mid + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    angle += (bottom ? -1 : 1) * step;
  });
}

type Label = { canvas: HTMLCanvasElement; texture: THREE.CanvasTexture; image: HTMLImageElement | null; title: string; meta: string };

/** A printed paper label: the playlist's cover in the middle, the credits round the rim. */
function drawLabel(label: Label, record: DeckRecord) {
  const size = label.canvas.width;
  const ctx = label.canvas.getContext("2d")!;
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, size, size);

  const art = c * 0.7;
  ctx.save();
  ctx.beginPath();
  ctx.arc(c, c, art, 0, Math.PI * 2);
  ctx.clip();
  const img = label.image;
  if (img && img.naturalWidth) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const content = record.letterboxed ? (w * 9) / 16 : Math.min(w, h);
    const side = Math.min(content, w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, c - art, c - art, art * 2, art * 2);
  } else {
    ctx.fillStyle = record.labelColor ?? record.color;
    ctx.fillRect(0, 0, size, size);
  }
  // Paper takes ink with a slight tooth; a faint vignette keeps the art on the label, not over it.
  const vignette = ctx.createRadialGradient(c, c, art * 0.6, c, c, art);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(20,12,6,0.28)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();

  ctx.strokeStyle = "#a9853f";
  ctx.lineWidth = size * 0.007;
  ctx.beginPath();
  ctx.arc(c, c, art + size * 0.004, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = size * 0.004;
  ctx.beginPath();
  ctx.arc(c, c, c * 0.955, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#1c1611";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `500 ${size * 0.066}px ${fontFamily("--font-wordmark", "sans-serif")}`;
  arcText(ctx, "SpindlShare", c, c, c * 0.835, false, size * 0.004);
  ctx.font = `800 ${size * 0.04}px ${fontFamily("--font-manrope", "sans-serif")}`;
  const bottom = (label.meta ? `${label.title}  ·  ${label.meta}` : label.title).toUpperCase();
  arcText(ctx, bottom.length > 34 ? `${bottom.slice(0, 33)}…` : bottom, c, c, c * 0.835, true, size * 0.006);
  ctx.font = `800 ${size * 0.03}px ${fontFamily("--font-manrope", "sans-serif")}`;
  ctx.save();
  ctx.translate(c - c * 0.835, c);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("SIDE A", 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(c + c * 0.835, c);
  ctx.rotate(Math.PI / 2);
  ctx.fillText("33⅓ RPM", 0, 0);
  ctx.restore();

  const random = rng(3);
  for (let k = 0; k < 2200; k++) {
    ctx.fillStyle = `rgba(90,70,40,${random() * 0.06})`;
    ctx.fillRect(random() * size, random() * size, 1.4, 1.4);
  }
  ctx.restore();

  ctx.fillStyle = "#0b0a09";
  ctx.beginPath();
  ctx.arc(c, c, c * 0.075, 0, Math.PI * 2);
  ctx.fill();
  label.texture.needsUpdate = true;
}

/* ------------------------------------------------------------ models */

type Grooves = ReturnType<typeof grooveMaps>;

type RecordModel = {
  group: THREE.Group;
  label: Label;
  materials: THREE.MeshPhysicalMaterial[];
  record: DeckRecord;
  ready: Promise<void>;
};

function makeRecord(record: DeckRecord, grooves: Grooves, maxAniso: number): RecordModel {
  const color = new THREE.Color(record.color);
  const black = color.getHSL({ h: 0, s: 0, l: 0 }).l < 0.12;
  const vinyl = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.3,
    roughnessMap: grooves.rough,
    normalMap: grooves.normal,
    normalScale: new THREE.Vector2(0.28, 0.28),
    anisotropy: 1,
    anisotropyMap: grooves.aniso,
    clearcoat: 1,
    clearcoatRoughness: black ? 0.05 : 0.035,
    envMapIntensity: black ? 0.9 : 0.5,
  });
  const rim = new THREE.MeshPhysicalMaterial({ color, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.55 });

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const label: Label = {
    canvas,
    texture: canvasTexture(canvas, maxAniso),
    image: null,
    title: record.title,
    meta: `${record.songs ? `${record.songs} songs · ` : ""}${record.service}`,
  };
  drawLabel(label, record);
  const paper = new THREE.MeshPhysicalMaterial({ map: label.texture, roughness: 0.78, sheen: 0.3, sheenColor: new THREE.Color("#fff6e4") });
  const sideB = new THREE.MeshPhysicalMaterial({ color: "#e8dfcd", roughness: 0.8 });

  const ready = new Promise<void>((resolve) => {
    if (!record.cover) return resolve();
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      label.image = img;
      drawLabel(label, record);
      resolve();
    };
    img.onerror = () => resolve();
    img.src = record.cover;
  });

  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y: number, flip: boolean) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = flip ? Math.PI / 2 : -Math.PI / 2;
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const music = new THREE.RingGeometry(MUSIC_IN, MUSIC_OUT, 180, 1);
  add(music, vinyl, HALF, false);
  add(music, vinyl, -HALF, true);
  add(new THREE.RingGeometry(LABEL_R, MUSIC_IN, 128, 1), rim, HALF + 0.0015, false);
  add(new THREE.CircleGeometry(LABEL_R, 96), paper, LABEL_HALF, false);
  add(new THREE.CircleGeometry(LABEL_R, 96), sideB, -LABEL_HALF, true);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(MUSIC_IN, MUSIC_IN, 2 * LABEL_HALF - 0.001, 128, 1, true), rim);
  hub.castShadow = true;
  group.add(hub);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.975, 0.975, 2 * HALF, 180, 1, true), rim);
  body.castShadow = true;
  group.add(body);
  const bead = new THREE.Mesh(new THREE.TorusGeometry(0.978, 0.0135, 16, 220), rim);
  bead.scale.set(1, 1, 0.62);
  bead.rotation.x = -Math.PI / 2;
  bead.castShadow = true;
  bead.receiveShadow = true;
  group.add(bead);

  return { group, label, materials: [vinyl, rim, paper, sideB], record, ready };
}

function makeTurntable(maxAniso: number) {
  const root = new THREE.Group();
  const shadow = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const walnut = canvasTexture(walnutCanvas(), maxAniso);
  const wood = new THREE.MeshPhysicalMaterial({ map: walnut, roughness: 0.58, clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.55 });
  const plinth = shadow(new THREE.Mesh(new RoundedBoxGeometry(3.9, PLINTH_H, 2.9, 6, 0.1), wood));
  plinth.position.set(0.1, DECK_Y - PLINTH_H / 2, -0.05);
  root.add(plinth);

  const brass = new THREE.MeshPhysicalMaterial({ color: "#d9ad5c", metalness: 1, roughness: 0.24 });
  const chrome = new THREE.MeshPhysicalMaterial({ color: "#eceef0", metalness: 1, roughness: 0.07 });
  const anodised = new THREE.MeshPhysicalMaterial({ color: "#18181a", metalness: 0.7, roughness: 0.32, clearcoat: 0.4 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#121111", roughness: 0.95 });

  // A brass inlay round the deck, the one bright line on the cabinet.
  const inlay = new THREE.Mesh(new RoundedBoxGeometry(3.74, 0.012, 2.74, 4, 0.006), brass);
  inlay.position.set(0.1, DECK_Y + 0.003, -0.05);
  root.add(inlay);
  const deck = shadow(new THREE.Mesh(new RoundedBoxGeometry(3.7, 0.02, 2.7, 4, 0.01), wood));
  deck.position.set(0.1, DECK_Y + 0.006, -0.05);
  root.add(deck);

  for (const [x, z] of [
    [-1.6, 1.15],
    [1.8, 1.15],
    [-1.6, -1.25],
    [1.8, -1.25],
  ]) {
    const foot = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.12, 32), anodised));
    foot.position.set(x, DECK_Y - PLINTH_H - 0.06, z);
    root.add(foot);
  }

  // Platter: machined aluminium, strobe dots on the rim, rubber mat on top.
  const platter = new THREE.Group();
  platter.position.copy(PLATTER_C);
  root.add(platter);
  const spin = new THREE.Group();
  platter.add(spin);
  const strobe = canvasTexture(strobeCanvas(), maxAniso);
  const side = new THREE.MeshPhysicalMaterial({ map: strobe, metalness: 1, roughness: 0.26 });
  const sideMesh = shadow(new THREE.Mesh(new THREE.CylinderGeometry(PLATTER_R, PLATTER_R * 0.985, PLATTER_H, 200, 1, true), side));
  sideMesh.position.y = -PLATTER_H / 2;
  spin.add(sideMesh);
  const lip = new THREE.MeshPhysicalMaterial({ color: "#d5d8dc", metalness: 1, roughness: 0.2, anisotropy: 1, anisotropyMap: brushedAniso(512, maxAniso) });
  const lipMesh = shadow(new THREE.Mesh(new THREE.RingGeometry(1.03, PLATTER_R, 200, 1), lip));
  lipMesh.rotation.x = -Math.PI / 2;
  lipMesh.position.y = 0.001;
  spin.add(lipMesh);
  const mat = shadow(new THREE.Mesh(new THREE.CylinderGeometry(1.03, 1.03, MAT_TOP, 160), rubber));
  mat.position.y = MAT_TOP / 2;
  spin.add(mat);

  // The strobe lamp, which lights those dots from the front corner.
  const lampAt = new THREE.Vector3(PLATTER_C.x - 1.02, DECK_Y, PLATTER_C.z + 0.95);
  const lamp = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 32), anodised));
  lamp.position.set(lampAt.x, DECK_Y + 0.08, lampAt.z);
  root.add(lamp);
  const lens = new THREE.Mesh(new THREE.SphereGeometry(0.045, 24, 16), new THREE.MeshStandardMaterial({ color: "#ff8a2a", emissive: "#ff6a00", emissiveIntensity: 3 }));
  lens.position.set(lampAt.x + 0.05, DECK_Y + 0.12, lampAt.z - 0.05);
  root.add(lens);
  const glow = new THREE.PointLight("#ff7a1a", 1.6, 1.6, 2);
  glow.position.copy(lens.position);
  root.add(glow);

  // Start button and the two speed buttons, 33 lit.
  const start = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.05, 0.24, 4, 0.02), anodised));
  start.position.set(-1.45, DECK_Y + 0.03, 1.12);
  root.add(start);
  const startRing = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.012, 0.28, 4, 0.006), brass);
  startRing.position.set(-1.45, DECK_Y + 0.008, 1.12);
  root.add(startRing);
  [-0.88, -0.62].forEach((x, i) => {
    const button = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.04, 32), brass));
    button.position.set(x, DECK_Y + 0.02, 1.18);
    root.add(button);
    if (i === 0) {
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), new THREE.MeshStandardMaterial({ color: "#ffd48a", emissive: "#ffb347", emissiveIntensity: 4 }));
      led.position.set(x, DECK_Y + 0.02, 1.02);
      root.add(led);
    }
  });

  // Tonearm: gimballed on its base, S-shaped tube, brass counterweight.
  const arm = new THREE.Group();
  arm.position.copy(PIVOT);
  root.add(arm);
  const base = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 48), anodised));
  base.position.y = 0.05;
  arm.add(base);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 12, 64), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.1;
  arm.add(collar);
  const post = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 32), chrome));
  post.position.y = 0.18;
  arm.add(post);
  const swing = new THREE.Group();
  swing.position.y = 0.27;
  arm.add(swing);
  const lift = new THREE.Group();
  swing.add(lift);
  const gimbal = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.07, 32, 16), anodised));
  lift.add(gimbal);
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -0.42),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, 0.55),
    new THREE.Vector3(0.02, 0, 1.0),
    new THREE.Vector3(-0.1, -0.01, 1.34),
    new THREE.Vector3(-0.2, -0.02, 1.5),
  ]);
  lift.add(shadow(new THREE.Mesh(new THREE.TubeGeometry(curve, 96, 0.021, 16, false), chrome)));
  const weight = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.2, 48), brass));
  weight.rotation.x = Math.PI / 2;
  weight.position.z = -0.5;
  lift.add(weight);
  const weightCap = new THREE.Mesh(new THREE.CylinderGeometry(0.086, 0.086, 0.03, 48), anodised);
  weightCap.rotation.x = Math.PI / 2;
  weightCap.position.z = -0.61;
  lift.add(weightCap);
  const head = new THREE.Group();
  head.position.set(-0.2, -0.02, 1.5);
  head.rotation.y = -0.38;
  lift.add(head);
  const shell = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.03, 0.26, 4, 0.012), anodised));
  shell.position.z = 0.1;
  head.add(shell);
  const cart = shadow(new THREE.Mesh(new RoundedBoxGeometry(0.085, 0.07, 0.12, 3, 0.01), new THREE.MeshPhysicalMaterial({ color: "#c23a2b", roughness: 0.35, clearcoat: 1 })));
  cart.position.set(0, -0.045, 0.14);
  head.add(cart);
  const fingerCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.05, 0.01, 0.16), new THREE.Vector3(0.13, 0.02, 0.18), new THREE.Vector3(0.18, 0.05, 0.16)]);
  head.add(new THREE.Mesh(new THREE.TubeGeometry(fingerCurve, 24, 0.008, 8, false), brass));
  const stylusLocal = new THREE.Vector3(0, -0.085, 0.19);

  // The rest post the arm parks on.
  const restAt = new THREE.Vector3(PIVOT.x - 0.02, DECK_Y, PIVOT.z + 1.42);
  const rest = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.26, 16), anodised));
  rest.position.set(restAt.x, DECK_Y + 0.13, restAt.z);
  root.add(rest);
  const cup = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.01, 8, 24, Math.PI), brass);
  cup.position.set(restAt.x, DECK_Y + 0.27, restAt.z);
  root.add(cup);

  return { root, spin, arm, swing, lift, head, stylusLocal, chrome, brass };
}

/** The swing angle that puts the stylus on the record's lead-in. */
function playAngle(t: ReturnType<typeof makeTurntable>, radius: number) {
  const probe = new THREE.Vector3();
  let best = 0;
  let bestErr = Infinity;
  for (let a = -1.4; a <= 0.2; a += 0.002) {
    t.swing.rotation.y = a;
    t.root.updateMatrixWorld(true);
    probe.copy(t.stylusLocal);
    t.head.localToWorld(probe);
    const err = Math.abs(Math.hypot(probe.x - PLATTER_C.x, probe.z - PLATTER_C.z) - radius);
    if (err < bestErr) {
      bestErr = err;
      best = a;
    }
  }
  t.swing.rotation.y = 0;
  return best;
}

/* ------------------------------------------------------------ scene */

/** A dark studio with a few softboxes: reflections come out as crisp highlights, not a white wash. */
function studio() {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: "#0c0907", side: THREE.BackSide })));
  const panel = (w: number, h: number, color: string, power: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(power), side: THREE.DoubleSide })
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(12, 4, "#ffffff", 5, 0, 11, 1);
  panel(2.4, 12, "#fff1df", 4, -11, 4, 5);
  panel(2, 9, "#e7c57a", 4, 9, 4, -8);
  panel(9, 1.6, "#ffffff", 1.6, 0, 1.5, 12);
  panel(3, 3, "#ffd9a0", 2.2, 10, 7, 6);
  return env;
}

const ease = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  fall: (t: number) => t * t,
};

type Tween = { start: number; dur: number; update: (t: number) => void; done?: () => void };

export function createTurntable(container: HTMLElement, options: Options): TurntableController {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  container.appendChild(renderer.domElement);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(studio(), 0.02);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 1;

  const key = new THREE.DirectionalLight("#fff3e2", 2.4);
  key.position.set(-3.5, 6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -3.4;
  key.shadow.camera.right = 3.4;
  key.shadow.camera.top = 3.4;
  key.shadow.camera.bottom = -3.4;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 16;
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

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.5 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = DECK_Y - PLINTH_H - 0.12;
  floor.receiveShadow = true;
  scene.add(floor);

  const deck = makeTurntable(maxAniso);
  scene.add(deck.root);
  const armPlay = playAngle(deck, 0.93);

  const grooveSize = window.innerWidth < 700 ? 768 : 1024;
  const grooves = [grooveMaps(grooveSize, 11, maxAniso), grooveMaps(grooveSize, 29, maxAniso), grooveMaps(grooveSize, 47, maxAniso)];
  const models = options.records.map((r, i) => makeRecord(r, grooves[i % grooves.length], maxAniso));
  // Labels are printed in the brand faces, which may still be loading on the first draw.
  document.fonts?.ready.then(() => models.forEach((m) => drawLabel(m.label, m.record)));

  const camera = new THREE.PerspectiveCamera(options.mode === "changer" ? 30 : 27, 1, 0.1, 60);
  const target = options.mode === "changer" ? new THREE.Vector3(0.3, 0.3, 0.0) : new THREE.Vector3(0.18, -0.2, 0.02);
  const orbit = options.mode === "changer" ? { r: 8.6, el: 0.42, az: -0.26 } : { r: 8.3, el: 0.9, az: -0.22 };
  const look = { x: 0, y: 0, tx: 0, ty: 0 };
  const placeCamera = () => {
    const el = orbit.el + look.y * 0.05;
    const az = orbit.az + look.x * 0.09;
    camera.position.set(
      target.x + orbit.r * Math.cos(el) * Math.sin(az),
      target.y + orbit.r * Math.sin(el),
      target.z + orbit.r * Math.cos(el) * Math.cos(az)
    );
    camera.lookAt(target);
  };

  // Spindle, with the shoulder a changer's stack rests on.
  if (options.mode === "changer") {
    const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, SPINDLE_TOP + 0.1, 32), deck.chrome);
    spindle.position.set(PLATTER_C.x, (SPINDLE_TOP - 0.1) / 2, PLATTER_C.z);
    spindle.castShadow = true;
    scene.add(spindle);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.021, 24, 12), deck.chrome);
    cap.position.set(PLATTER_C.x, SPINDLE_TOP, PLATTER_C.z);
    scene.add(cap);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.03, 0.03, 32), deck.chrome);
    shoulder.position.set(PLATTER_C.x, HOLD_BASE - 0.015, PLATTER_C.z);
    shoulder.castShadow = true;
    scene.add(shoulder);
  } else {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.12, 24), deck.chrome);
    pin.position.set(0, 0.04, 0);
    deck.spin.add(pin);
  }

  /* ---- layout and motion ---- */
  const n = models.length;
  const held = options.mode === "changer" ? Math.min(4, Math.max(0, n - 1)) : 0;
  const restY = MAT_TOP + LABEL_HALF;
  const heldY = (slot: number) => HOLD_BASE + LABEL_HALF + slot * STACK_T;
  let cursor = 0;

  const worldAt = (y: number) => new THREE.Vector3(PLATTER_C.x, y, PLATTER_C.z);
  models.forEach((m, i) => {
    m.group.visible = false;
    if (i === 0) {
      deck.spin.add(m.group);
      m.group.position.set(0, restY, 0);
      m.group.visible = true;
    } else if (i <= held) {
      scene.add(m.group);
      m.group.position.copy(worldAt(heldY(i - 1)));
      m.group.rotation.y = i * 1.7;
      m.group.visible = true;
    } else {
      scene.add(m.group);
    }
  });

  const tweens: Tween[] = [];
  let clock = 0;
  const tween = (delay: number, dur: number, update: (t: number) => void, done?: () => void) =>
    tweens.push({ start: clock + delay, dur, update, done });

  let armAngle = options.mode === "changer" ? armPlay : 0;
  let armLift = 0;
  let spinSpeed = options.mode === "changer" && !options.reducedMotion ? RPM_33 : 0;
  let targetSpin = spinSpeed;
  let drift = 0;
  const setArm = (a: number, l: number) => {
    armAngle = a;
    armLift = l;
  };

  const inward = Math.sign(armPlay) || -1;
  const armOut = (delay: number) => {
    const from = armAngle + inward * drift;
    drift = 0;
    tween(delay, 320, (t) => setArm(from, ease.out(t) * 0.11));
    tween(delay + 320, 720, (t) => setArm(from + (0 - from) * ease.inOut(t), 0.11));
    tween(delay + 1040, 260, (t) => setArm(0, 0.11 * (1 - ease.out(t))));
  };
  const armIn = (delay: number) => {
    drift = 0;
    tween(delay, 260, (t) => setArm(0, ease.out(t) * 0.11));
    tween(delay + 260, 900, (t) => setArm(armPlay * ease.inOut(t), 0.11));
    tween(delay + 1160, 340, (t) => setArm(armPlay, 0.11 * (1 - ease.inOut(t))));
  };

  const cycle = () => {
    if (n < 2) return;
    const dropping = models[(cursor + 1) % n];
    const leaving = models[cursor];
    armOut(0);
    const fallFrom = dropping.group.position.y;
    const landY = restY + STACK_T;
    const fall = Math.sqrt((2 * (fallFrom - landY)) / 9.8) * 1000;
    const wobble = { x: (Math.random() - 0.5) * 0.08, z: (Math.random() - 0.5) * 0.08 };
    tween(1100, fall, (t) => {
      dropping.group.position.y = fallFrom + (landY - fallFrom) * ease.fall(t);
      dropping.group.rotation.x = wobble.x * Math.sin(t * Math.PI);
      dropping.group.rotation.z = wobble.z * Math.sin(t * Math.PI);
    }, () => {
      // Caught by the platter: it takes the spin from here, and the one beneath is gone.
      deck.spin.attach(dropping.group);
      leaving.group.visible = false;
      scene.attach(leaving.group);
      cursor = (cursor + 1) % n;
      options.onNowPlaying?.(cursor);
      tween(0, 420, (t) => {
        const damp = 1 - t;
        dropping.group.position.y = landY + (restY - landY) * ease.out(t) + Math.sin(t * Math.PI * 3) * 0.012 * damp;
        dropping.group.rotation.x = Math.sin(t * Math.PI * 4) * 0.02 * damp;
        dropping.group.rotation.z = Math.cos(t * Math.PI * 4) * 0.02 * damp;
      });
      // The next record is set on top of the stack.
      const incoming = models[(cursor + held) % n];
      if (incoming !== dropping) {
        const toY = heldY(held - 1);
        incoming.group.position.copy(worldAt(toY + 0.45));
        incoming.group.rotation.set(0, Math.random() * Math.PI * 2, 0);
        incoming.group.visible = true;
        incoming.materials.forEach((mat) => {
          mat.transparent = true;
          mat.opacity = 0;
        });
        tween(120, 620, (t) => {
          incoming.group.position.y = toY + 0.45 * (1 - ease.out(t));
          incoming.materials.forEach((mat) => (mat.opacity = ease.out(t)));
        }, () => incoming.materials.forEach((mat) => (mat.transparent = false)));
      }
    });
    // The rest of the stack settles by one record as the bottom one leaves.
    for (let k = 2; k <= held; k++) {
      const m = models[(cursor + k) % n];
      const from = m.group.position.y;
      tween(1100, 300, (t) => (m.group.position.y = from - STACK_T * ease.out(t)));
    }
    armIn(1100 + fall + 500);
  };

  const size = () => {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(container);

  const onPointer = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    look.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    look.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const pointerHost = container.closest("section") ?? container;
  if (!options.reducedMotion) pointerHost.addEventListener("pointermove", onPointer as EventListener);

  let visible = false;
  let lastCycle = -Infinity;
  const io = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
  });
  io.observe(container);

  let last = performance.now();
  let first = true;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!visible && !first) return;
    clock += dt * 1000;

    if (options.mode === "changer" && !options.reducedMotion && n > 1 && clock - lastCycle > CYCLE_MS) {
      if (lastCycle === -Infinity) lastCycle = clock - CYCLE_MS + 2200;
      else {
        lastCycle = clock;
        cycle();
      }
    }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      if (clock < tw.start) continue;
      const t = Math.min(1, (clock - tw.start) / tw.dur);
      tw.update(t);
      if (t >= 1) {
        tweens.splice(i, 1);
        tw.done?.();
      }
    }

    spinSpeed += (targetSpin - spinSpeed) * Math.min(1, dt * 2.2);
    deck.spin.rotation.y -= spinSpeed * dt;
    // The stylus creeps inward while it plays, the way a groove carries it.
    if (armLift === 0 && armAngle !== 0 && !options.reducedMotion) drift = Math.min(0.06, drift + dt * 0.004);
    deck.swing.rotation.y = armAngle + (armLift === 0 && armAngle !== 0 ? inward * drift : 0);
    deck.lift.position.y = armLift;
    deck.lift.rotation.x = -armLift * 0.35;

    look.x += (look.tx - look.x) * Math.min(1, dt * 3);
    look.y += (look.ty - look.y) * Math.min(1, dt * 3);
    placeCamera();
    renderer.render(scene, camera);
    if (first) {
      first = false;
      options.onReady?.();
    }
  };
  placeCamera();
  renderer.setAnimationLoop(frame);

  return {
    setPlaying(on: boolean) {
      if (options.mode !== "single") return;
      targetSpin = on && !options.reducedMotion ? RPM_33 : 0;
      if (on) {
        if (armAngle === 0) armIn(0);
      } else if (armAngle !== 0) {
        armOut(0);
      }
    },
    setLabel(title: string, meta: string) {
      const m = models[0];
      if (!m) return;
      m.label.title = title;
      m.label.meta = meta;
      drawLabel(m.label, m.record);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      ro.disconnect();
      io.disconnect();
      pointerHost.removeEventListener("pointermove", onPointer as EventListener);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      grooves.forEach((g) => [g.normal, g.rough, g.aniso].forEach((t) => t.dispose()));
      models.forEach((m) => m.label.texture.dispose());
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

/** Renders records straight down, once, into images: for places that show a record but don't need a live scene. */
export async function bakeRecords(records: DeckRecord[], size = 640): Promise<string[]> {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(studio(), 0.02);
  scene.environment = env.texture;
  const key = new THREE.DirectionalLight("#fff3e2", 2.2);
  key.position.set(-3, 5, 2);
  scene.add(key);
  // Slightly off vertical, so the grooves catch the softboxes the way a record in hand does.
  const camera = new THREE.PerspectiveCamera(22, 1, 0.1, 30);
  camera.position.set(0.9, 5.2, 1.4);
  camera.lookAt(0, 0, 0);
  const grooves = grooveMaps(768, 17, maxAniso);
  await document.fonts?.ready;

  const out: string[] = [];
  for (const record of records) {
    const model = makeRecord(record, grooves, maxAniso);
    await model.ready;
    scene.add(model.group);
    renderer.render(scene, camera);
    out.push(renderer.domElement.toDataURL("image/webp", 0.92));
    scene.remove(model.group);
    model.group.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    model.materials.forEach((m) => m.dispose());
    model.label.texture.dispose();
  }
  [grooves.normal, grooves.rough, grooves.aniso].forEach((t) => t.dispose());
  env.dispose();
  pmrem.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
