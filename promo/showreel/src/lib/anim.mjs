/* Time is the only input: every value on screen is a function of t, so any frame
   can be rendered in any order and comes out the same. */

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const prog = (t, t0, t1) => clamp((t - t0) / (t1 - t0));

const c1 = 1.70158;
export const E = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  inCubic: (x) => x ** 3,
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  inQuart: (x) => x ** 4,
  outQuart: (x) => 1 - (1 - x) ** 4,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  outQuint: (x) => 1 - (1 - x) ** 5,
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  inExpo: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
  outExpo: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  inBack: (x) => (c1 + 1) * x ** 3 - c1 * x * x,
  outBack: (x) => 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2,
  outBackSoft: (x) => 1 + 1.9 * (x - 1) ** 3 + 0.9 * (x - 1) ** 2,
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outSine: (x) => Math.sin((x * Math.PI) / 2),
  outElastic: (x) => (x === 0 || x === 1 ? x : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** Eased progress between t0 and t1. */
export const tw = (t, t0, t1, ease = E.outExpo) => ease(prog(t, t0, t1));
/** A value moving from a to b between t0 and t1. */
export const move = (t, t0, t1, a, b, ease = E.outExpo) => lerp(a, b, tw(t, t0, t1, ease));

/** Keyframes as [time, value, ease into this key]; holds before the first and after the last. */
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, ease = E.inOutCubic] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return lerp(v0, v1, ease(prog(t, t0, t1)));
  }
  return keys[keys.length - 1][1];
}

/** Keyframes of vectors. */
export function kfv(t, keys) {
  const n = keys[0][1].length;
  return Array.from({ length: n }, (_, k) => kf(t, keys.map(([time, v, ease]) => [time, v[k], ease])));
}

/** How far into a decay from the most recent of the given times; 0 before the first. */
export function pulse(t, times, decay = 8) {
  let last = -Infinity;
  for (const x of times) {
    if (x <= t) last = x;
    else break;
  }
  return last === -Infinity ? 0 : Math.exp(-(t - last) * decay);
}

/** A damped spring's response to a step at t0: 0 to 1 with a little overshoot. */
export function spring(t, t0, freq = 2.6, damp = 0.42) {
  if (t <= t0) return 0;
  const x = t - t0;
  const w = 2 * Math.PI * freq;
  return 1 - Math.exp(-damp * w * x) * Math.cos(w * Math.sqrt(1 - damp * damp) * x);
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth value noise in [-1, 1], for handheld drift and shakes. */
export function noise1(x, seed = 0) {
  const h = (n) => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return h(i) + (h(i + 1) - h(i)) * u;
}

/** A shake that starts hard at t0 and settles over dur seconds. */
export function shake(t, t0, dur, amp, seed = 1) {
  if (t < t0 || t > t0 + dur) return { x: 0, y: 0, r: 0 };
  const k = (1 - (t - t0) / dur) ** 2 * amp;
  const f = 28;
  return {
    x: noise1((t - t0) * f, seed) * k,
    y: noise1((t - t0) * f, seed + 9) * k,
    r: noise1((t - t0) * f, seed + 17) * k * 0.02,
  };
}

/** Deterministic pick of an item by index. */
export const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];
