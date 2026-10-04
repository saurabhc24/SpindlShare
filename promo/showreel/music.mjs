/* The showreel's soundtrack, synthesised from nothing: no samples, no licences.
 *
 *   node promo/showreel/music.mjs
 *
 * Writes dist/soundtrack.wav (48 kHz stereo) and dist/envelopes.js, which carries
 * the cue times and a per-frame spectrum so the picture can move with the sound. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  BEAT, BAR, BARS, DURATION, FPS, at, chordAt, inPart, NEEDLE_DROP, LANDINGS,
  TAPE_STOP, TAPE_STOP_LEN, NEEDLE_LIFT, SCRATCH, scratchPosition,
} from "./src/score.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "dist");
fs.mkdirSync(OUT, { recursive: true });

const SR = 48000;
const LEN = Math.round(DURATION * SR);
const TAU = Math.PI * 2;

/* ------------------------------------------------------------- basics */

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
const R = rng(20260930);
const noise = () => R() * 2 - 1;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const dbToGain = (db) => 10 ** (db / 20);

class Bus {
  constructor() {
    this.L = new Float32Array(LEN);
    this.R = new Float32Array(LEN);
  }
}

/** Adds a mono or stereo signal into a bus at t0, with an equal-power pan. */
function place(bus, sig, t0, gain = 1, pan = 0) {
  const i0 = Math.round(t0 * SR);
  if (sig instanceof Float32Array) {
    const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
    const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
    for (let i = 0; i < sig.length; i++) {
      const j = i0 + i;
      if (j < 0 || j >= LEN) continue;
      bus.L[j] += sig[i] * gl;
      bus.R[j] += sig[i] * gr;
    }
  } else {
    for (let i = 0; i < sig.L.length; i++) {
      const j = i0 + i;
      if (j < 0 || j >= LEN) continue;
      bus.L[j] += sig.L[i] * gain;
      bus.R[j] += sig.R[i] * gain;
    }
  }
}

/** RBJ biquad; coefficients can be reset per block for sweeps. */
class Biquad {
  constructor(type, f, q = 0.707, gainDb = 0) {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.set(type, f, q, gainDb);
  }
  set(type, f, q = 0.707, gainDb = 0) {
    const w = (TAU * Math.min(f, SR * 0.45)) / SR;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    let a0 = 1 + alpha;
    if (type === "pk") {
      const A = 10 ** (gainDb / 40);
      b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A;
      this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
      this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha / A) / a0;
      return;
    }
    if (type === "lp") {
      b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
    } else if (type === "hp") {
      b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
    } else {
      b0 = alpha; b1 = 0; b2 = -alpha;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0; this.a2 = (1 - alpha) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

/** A short fade at both ends, so no note starts or stops with a click. */
function declick(sig, ms = 3) {
  const n = Math.round((ms / 1000) * SR);
  const chans = sig instanceof Float32Array ? [sig] : [sig.L, sig.R];
  for (const c of chans) {
    for (let i = 0; i < n && i < c.length; i++) {
      const g = i / n;
      c[i] *= g;
      c[c.length - 1 - i] *= g;
    }
  }
  return sig;
}

/* -------------------------------------------------------------- drums */

function kick(vel = 1) {
  const n = Math.round(0.55 * SR);
  const out = new Float32Array(n);
  const click = new Biquad("bp", 3200, 1.2);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 46 + 118 * Math.exp(-t * 32) + 24 * Math.exp(-t * 9);
    ph += (TAU * f) / SR;
    const amp = t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) * 7.6);
    let s = Math.sin(ph) * amp;
    if (t < 0.008) s += click.run(noise()) * 0.35 * (1 - t / 0.008);
    out[i] = Math.tanh(s * 1.7) * 0.92 * vel;
  }
  return declick(out, 2);
}

function clap(vel = 1) {
  const n = Math.round(0.45 * SR);
  const out = new Float32Array(n);
  const bp = new Biquad("bp", 1350, 0.8);
  const hp = new Biquad("hp", 500, 0.7);
  const hits = [0, 0.0095, 0.019, 0.029];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let env = 0;
    for (const h of hits) if (t >= h) env = Math.max(env, Math.exp(-(t - h) * 230));
    if (t >= 0.029) env = Math.max(env, 0.5 * Math.exp(-(t - 0.029) * 15));
    out[i] = hp.run(bp.run(noise())) * env * 1.9 * vel;
  }
  return declick(out, 1);
}

function snare(vel = 1) {
  const n = Math.round(0.28 * SR);
  const out = new Float32Array(n);
  const bp = new Biquad("bp", 1900, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (185 + 40 * Math.exp(-t * 60))) / SR;
    const body = Math.sin(ph) * Math.exp(-t * 32) * 0.55;
    const wires = bp.run(noise()) * Math.exp(-t * 24) * 1.3;
    out[i] = (body + wires) * vel;
  }
  return declick(out, 1);
}

function hat(open = false, vel = 1) {
  const n = Math.round((open ? 0.42 : 0.07) * SR);
  const out = new Float32Array(n);
  const hp = new Biquad("hp", 7600, 0.8);
  const bp = new Biquad("bp", 10500, 1.4);
  const decay = open ? 8.5 : 62;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const x = noise();
    out[i] = (hp.run(x) * 0.7 + bp.run(x) * 0.5) * Math.exp(-t * decay) * vel;
  }
  return declick(out, 1);
}

function crash(vel = 1) {
  const n = Math.round(2.6 * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  const hl = new Biquad("hp", 5200, 0.6);
  const hr = new Biquad("hp", 5600, 0.6);
  const bl = new Biquad("bp", 8200, 0.9);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const env = (t < 0.002 ? t / 0.002 : 1) * Math.exp(-t * 1.7);
    const a = noise();
    const b = noise();
    L[i] = (hl.run(a) + bl.run(a) * 0.4) * env * vel;
    Rr[i] = hr.run(b) * env * vel;
  }
  return declick({ L, R: Rr }, 1);
}

/* -------------------------------------------------------------- tones */

/** Tape wow on the intro keys: the record is not quite flat. */
const wow = (t) => 1 + 0.0035 * Math.sin(TAU * 0.55 * t) + 0.0012 * Math.sin(TAU * 3.1 * t);

/** An FM electric piano: a ratio-1 modulator for the body, a fast ratio-14 one for the tine. */
function rhodes(m, dur, vel, t0, wobble) {
  const f = mtof(m);
  const rel = 0.45;
  const n = Math.round((dur + rel) * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  let pc1 = 0, pc2 = 0, pm = 0, pt = 0;
  const det = 2 ** (4 / 1200);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const w = wobble ? wow(t0 + t) : 1;
    const fi = f * w;
    const index = (1.6 * Math.exp(-t * 4) + 0.45) * (0.55 + 0.6 * vel);
    const tine = 0.75 * Math.exp(-t * 34) * vel;
    pm += (TAU * fi) / SR;
    pt += (TAU * fi * 14) / SR;
    const mod = Math.sin(pm) * index + Math.sin(pt) * tine;
    pc1 += (TAU * fi) / SR;
    pc2 += (TAU * fi * det) / SR;
    const amp = (t < 0.004 ? t / 0.004 : Math.exp(-t * 0.85)) * (t > dur ? Math.exp(-(t - dur) * 11) : 1);
    const a = Math.sin(pc1 + mod);
    const b = Math.sin(pc2 + mod * 0.92);
    L[i] = (a * 0.62 + b * 0.38) * amp * vel;
    Rr[i] = (a * 0.38 + b * 0.62) * amp * vel;
  }
  return declick({ L, R: Rr }, 4);
}

/** Detuned saws, darkened: the wide bed under the final drop. */
function pad(notes, dur, cutoff) {
  const att = 0.5, rel = 0.9;
  const n = Math.round((dur + rel) * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  const cents = [-14, -7, 0, 7, 14];
  const voices = [];
  notes.forEach((m) => cents.forEach((c, k) => voices.push({ f: mtof(m) * 2 ** (c / 1200), ph: R(), side: k % 2 ? 1 : -1 })));
  const f1 = [new Biquad("lp", cutoff, 0.6), new Biquad("lp", cutoff, 0.6)];
  const f2 = [new Biquad("lp", cutoff, 0.6), new Biquad("lp", cutoff, 0.6)];
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let l = 0, r = 0;
    for (const v of voices) {
      const dt = v.f / SR;
      v.ph += dt;
      if (v.ph >= 1) v.ph -= 1;
      const s = 2 * v.ph - 1 - polyblep(v.ph, dt);
      if (v.side < 0) l += s; else r += s;
      l += s * 0.35; r += s * 0.35;
    }
    const env = Math.min(1, t / att) * (t > dur ? Math.exp(-(t - dur) * 5) : 1);
    L[i] = f2[0].run(f1[0].run(l)) * env * 0.05;
    Rr[i] = f2[1].run(f1[1].run(r)) * env * 0.05;
  }
  return declick({ L, R: Rr }, 6);
}

/** A saw pluck with a snapping filter: the sixteenth-note arpeggio. */
function pluck(m, vel, bright) {
  const f = mtof(m);
  const n = Math.round(0.42 * SR);
  const out = new Float32Array(n);
  const lp = new Biquad("lp", 4000, 1.1);
  let ph = R();
  const dt = f / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    if (i % 32 === 0) lp.set("lp", 600 + bright * 6800 * Math.exp(-t * 20), 1.1);
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - polyblep(ph, dt);
    out[i] = lp.run(saw) * Math.exp(-t * 9) * vel;
  }
  return declick(out, 2);
}

/** An inharmonic FM bell for the last drop's counter-melody. */
function bell(m, vel) {
  const f = mtof(m);
  const n = Math.round(2.2 * SR);
  const out = new Float32Array(n);
  let pc = 0, pm = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    pm += (TAU * f * 3.5) / SR;
    pc += (TAU * f) / SR;
    const index = 2.2 * Math.exp(-t * 3.2) + 0.2;
    out[i] = Math.sin(pc + Math.sin(pm) * index) * Math.exp(-t * 2.1) * (t < 0.003 ? t / 0.003 : 1) * vel;
  }
  return declick(out, 3);
}

/** Sub sine for the whole note, plus a darker saw an octave up so small speakers hear it. */
function bass(m, dur, vel) {
  const f = mtof(m);
  const n = Math.round((dur + 0.05) * SR);
  const out = new Float32Array(n);
  const lp = new Biquad("lp", 320, 0.9);
  let ps = 0, pw = R();
  const dt = (f * 2) / SR;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ps += (TAU * f) / SR;
    pw += dt;
    if (pw >= 1) pw -= 1;
    const saw = 2 * pw - 1 - polyblep(pw, dt);
    const env = Math.min(1, t / 0.006) * (t > dur ? Math.exp(-(t - dur) * 60) : 1);
    out[i] = (Math.sin(ps) * 0.9 + lp.run(saw) * 0.22) * env * vel;
  }
  return declick(out, 3);
}

/* ---------------------------------------------------------------- fx */

function riser(dur) {
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  const bl = new Biquad("bp", 400, 2.4);
  const br = new Biquad("bp", 400, 2.4);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) {
      const fc = 350 * (9500 / 350) ** (u ** 1.3);
      bl.set("bp", fc, 2.4);
      br.set("bp", fc * 1.07, 2.4);
    }
    ph += (TAU * (180 * 6 ** (u ** 1.5))) / SR;
    const g = u ** 2.2;
    L[i] = (bl.run(noise()) * 1.4 + Math.sin(ph) * 0.12) * g;
    Rr[i] = (br.run(noise()) * 1.4 + Math.sin(ph * 1.003) * 0.12) * g;
  }
  return declick({ L, R: Rr }, 5);
}

/** A cymbal played backwards, swelling into a downbeat. */
function reverseCymbal(dur) {
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  const hl = new Biquad("hp", 4800, 0.6);
  const hr = new Biquad("hp", 5000, 0.6);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const env = Math.exp(-(1 - u) * 5.5) * u;
    L[i] = hl.run(noise()) * env;
    Rr[i] = hr.run(noise()) * env;
  }
  return declick({ L, R: Rr }, 2);
}

function impact(vel = 1) {
  const n = Math.round(2.2 * SR);
  const out = new Float32Array(n);
  const lp = new Biquad("lp", 900, 0.7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (30 + 42 * Math.exp(-t * 4))) / SR;
    const boom = Math.sin(ph) * Math.exp(-t * 2.1) * (t < 0.004 ? t / 0.004 : 1);
    const crack = lp.run(noise()) * Math.exp(-t * 11) * 0.7;
    out[i] = Math.tanh((boom + crack) * 1.4) * vel;
  }
  return declick(out, 2);
}

function whoosh(dur = 0.55, up = true) {
  const n = Math.round(dur * SR);
  const L = new Float32Array(n);
  const Rr = new Float32Array(n);
  const b = new Biquad("bp", 600, 1.6);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) b.set("bp", up ? 300 * 20 ** u : 6000 / 20 ** u, 1.6);
    const env = Math.sin(Math.PI * u) ** 2;
    const s = b.run(noise()) * env * 1.6;
    const pan = -0.8 + 1.6 * u;
    L[i] = s * Math.cos(((pan + 1) * Math.PI) / 4);
    Rr[i] = s * Math.sin(((pan + 1) * Math.PI) / 4);
  }
  return declick({ L, R: Rr }, 2);
}

function tick(freq = 3400, vel = 1) {
  const n = Math.round(0.03 * SR);
  const out = new Float32Array(n);
  const b = new Biquad("bp", freq, 3);
  for (let i = 0; i < n; i++) out[i] = b.run(noise()) * Math.exp(-(i / SR) * 260) * vel * 2.2;
  return declick(out, 0.5);
}

/** A soft wooden tap for a finger on glass. */
function tap(vel = 1) {
  const n = Math.round(0.12 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (1100 * Math.exp(-t * 18) + 380)) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 45) * vel;
  }
  return declick(out, 0.5);
}

/** The stylus landing: a thump through the tonearm, then the groove. */
function needleDrop() {
  const n = Math.round(0.5 * SR);
  const out = new Float32Array(n);
  const lp = new Biquad("lp", 700, 0.8);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (TAU * (64 + 30 * Math.exp(-t * 30))) / SR;
    out[i] = Math.sin(ph) * Math.exp(-t * 16) * 0.9 + lp.run(noise()) * Math.exp(-t * 60) * 0.6;
  }
  return declick(out, 1);
}

function needleLift() {
  const n = Math.round(0.25 * SR);
  const out = new Float32Array(n);
  const b = new Biquad("bp", 1800, 1.5);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] = b.run(noise()) * Math.exp(-t * 70) * 0.9 + Math.sin(TAU * 90 * t) * Math.exp(-t * 30) * 0.3;
  }
  return declick(out, 1);
}

/** A sung "hey": a buzzing voice through two vowel formants, the scratch's raw material. */
function voiceSample() {
  const n = Math.round(1.2 * SR);
  const out = new Float32Array(n);
  const f1 = new Biquad("bp", 650, 5);
  const f2 = new Biquad("bp", 1250, 6);
  const f3 = new Biquad("bp", 2600, 7);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = 196 * (1 + 0.015 * Math.sin(TAU * 5.2 * t)) * (1 - 0.06 * t);
    const dt = f / SR;
    ph += dt;
    if (ph >= 1) ph -= 1;
    const saw = 2 * ph - 1 - polyblep(ph, dt);
    const env = Math.min(1, t / 0.02) * Math.exp(-t * 0.8);
    out[i] = (f1.run(saw) * 1.0 + f2.run(saw) * 0.7 + f3.run(saw) * 0.35) * env * 3;
  }
  return out;
}

/** The scratch: read the voice at the record's position, with the fader cutting the back strokes. */
function scratch() {
  const src = voiceSample();
  const [s, e] = SCRATCH;
  const n = Math.round((e - s + 0.1) * SR);
  const out = new Float32Array(n);
  const hp = new Biquad("hp", 280, 0.7);
  const lp = new Biquad("lp", 5200, 0.7);
  let prev = scratchPosition(s);
  for (let i = 0; i < n; i++) {
    const t = s + i / SR;
    const p = scratchPosition(t);
    const speed = (p - prev) * SR;
    prev = p;
    const x = Math.max(0, Math.min(src.length - 2, p * SR));
    const k = Math.floor(x);
    const fr = x - k;
    const v = src[k] * (1 - fr) + src[k + 1] * fr;
    // A still record makes no sound; the fader is open on the forward strokes only.
    const moving = Math.min(1, Math.abs(speed) * 1.6);
    const fader = speed >= 0 ? 1 : 0.25;
    out[i] = lp.run(hp.run(v)) * moving * fader;
  }
  return declick(out, 3);
}

/* ---------------------------------------------------------------- vinyl */

/** Crackle and hiss for the whole film, loudest where the music is quietest. */
function vinyl(bus) {
  const hissLp = [new Biquad("lp", 4200, 0.7), new Biquad("lp", 4200, 0.7)];
  const hissHp = [new Biquad("hp", 350, 0.7), new Biquad("hp", 350, 0.7)];
  const level = (t) => {
    if (t < NEEDLE_DROP) return 0;
    if (t >= NEEDLE_LIFT) return 0;
    const bar = Math.floor(t / BAR) + 1;
    if (inPart(bar, "intro")) return 1;
    if (inPart(bar, "build1", "breakdown")) return 0.55;
    if (inPart(bar, "outro")) return 0.9;
    return 0.22;
  };
  let smooth = 0;
  const pop = new Biquad("bp", 2400, 0.9);
  for (let i = 0; i < LEN; i++) {
    const t = i / SR;
    smooth += (level(t) - smooth) * 0.0006;
    if (smooth < 1e-4) continue;
    bus.L[i] += hissHp[0].run(hissLp[0].run(noise())) * 0.012 * smooth;
    bus.R[i] += hissHp[1].run(hissLp[1].run(noise())) * 0.012 * smooth;
  }
  // Clicks: many faint, a few loud, scattered at random.
  const rate = 26;
  for (let t = NEEDLE_DROP; t < NEEDLE_LIFT; t += -Math.log(1 - R()) / rate) {
    const g = level(t);
    if (!g) continue;
    const size = R() ** 3;
    const n = Math.round((0.0008 + size * 0.003) * SR);
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = pop.run(noise()) * Math.exp(-(i / n) * 5);
    place(bus, c, t, (0.05 + size * 0.5) * g, R() * 1.4 - 0.7);
  }
}

/* ---------------------------------------------------------------- mix */

const drums = new Bus();
const bassBus = new Bus();
const keys = new Bus();
const padBus = new Bus();
const arpBus = new Bus();
const bellBus = new Bus();
const fx = new Bus();
const vinylBus = new Bus();
const send = new Bus();

const events = { kick: [], clap: [], snare: [], hat: [], impact: [], landing: [], tap: [], tick: [], whoosh: [] };
const kickTimes = [];

function playKick(t, vel = 1) {
  place(drums, kick(vel), t, 0.85);
  kickTimes.push(t);
  events.kick.push(+t.toFixed(4));
}

for (let bar = 1; bar <= BARS; bar++) {
  const b0 = at(bar);
  const full = inPart(bar, "dropA", "grooveB", "dropB");
  // Kick: four on the floor in the grooves, a quiet count-in before the first drop.
  if (full || bar === 23) for (let k = 0; k < 4; k++) playKick(b0 + k * BEAT, bar === 23 ? 0.9 : 1);
  if (bar === 4) for (let k = 0; k < 4; k++) playKick(b0 + k * BEAT, 0.55);
  if (bar === 31) for (let k = 0; k < 3; k++) playKick(b0 + k * BEAT, 1);
  // Clap on two and four.
  if (full || bar === 31) {
    for (const k of bar === 31 ? [1] : [1, 3]) {
      const c = clap(1);
      place(drums, c, b0 + k * BEAT, 0.72, 0.05);
      place(send, c, b0 + k * BEAT, 0.18);
      events.clap.push(+(b0 + k * BEAT).toFixed(4));
    }
  }
  // Hats: offbeats, sixteenth ghosts once the groove thickens.
  if (full || inPart(bar, "build1")) {
    for (let k = 0; k < 4; k++) {
      place(drums, hat(false, 1), b0 + (k + 0.5) * BEAT, inPart(bar, "build1") ? 0.2 : 0.34, 0.25);
      events.hat.push(+(b0 + (k + 0.5) * BEAT).toFixed(4));
      if (inPart(bar, "grooveB", "dropB")) {
        place(drums, hat(false, 0.6), b0 + (k + 0.25) * BEAT, 0.1, -0.3);
        place(drums, hat(false, 0.6), b0 + (k + 0.75) * BEAT, 0.13, -0.3);
      }
    }
    if (full && bar % 2 === 0) place(drums, hat(true, 1), b0 + 3.5 * BEAT, 0.14, 0.3);
  }
  // Snare rolls into each drop, accelerating.
  if (bar === 4) {
    for (let k = 0; k < 8; k++) {
      const t = b0 + 2 * BEAT + k * (BEAT / 4);
      place(drums, snare(0.35 + k * 0.08), t, 0.5);
      events.snare.push(+t.toFixed(4));
    }
  }
  if (bar === 23 || bar === 24) {
    const steps = bar === 23 ? 8 : 16;
    for (let k = 0; k < steps; k++) {
      const t = b0 + (k * BAR) / steps;
      const u = (bar - 23 + k / steps) / 2;
      place(drums, snare(0.25 + u * 0.75), t, 0.45 + u * 0.3);
      place(send, snare(0.3), t, 0.08);
      events.snare.push(+t.toFixed(4));
    }
    if (bar === 24) {
      for (let k = 0; k < 8; k++) {
        const t = b0 + 3 * BEAT + (k * BEAT) / 8;
        place(drums, snare(0.9 + k * 0.02), t, 0.7);
        events.snare.push(+t.toFixed(4));
      }
    }
  }
}

// Sidechain: everything melodic ducks under the kick, which is what makes it pump.
const duck = new Float32Array(LEN).fill(1);
for (const tk of kickTimes) {
  const i0 = Math.round(tk * SR);
  const n = Math.round(0.42 * SR);
  for (let i = 0; i < n && i0 + i < LEN; i++) {
    const d = 1 - 0.88 * Math.exp(-(i / SR) / 0.085);
    duck[i0 + i] = Math.min(duck[i0 + i], d);
  }
}
const applyDuck = (bus, depth) => {
  for (let i = 0; i < LEN; i++) {
    const g = 1 - depth * (1 - duck[i]);
    bus.L[i] *= g;
    bus.R[i] *= g;
  }
};

// Bass: sub for the bar, offbeat stabs on top in the grooves.
for (let bar = 1; bar <= BARS; bar++) {
  const b0 = at(bar);
  const ch = chordAt(bar);
  if (inPart(bar, "dropA", "grooveB", "dropB") || bar === 23) {
    place(bassBus, bass(ch.bass, BAR - 0.02, 0.55), b0);
    for (let k = 0; k < 4; k++) place(bassBus, bass(ch.bass + 12, 0.16, 0.28), b0 + (k + 0.5) * BEAT);
  }
  if (bar === 31) place(bassBus, bass(ch.bass, BAR, 0.55), b0);
}

// Keys: sustained and wobbling in the intro, comping in the grooves, stabs into the drops.
for (let bar = 1; bar <= BARS; bar++) {
  const b0 = at(bar);
  const ch = chordAt(bar);
  const hit = (t, dur, vel) => ch.keys.forEach((m) => place(keys, rhodes(m, dur, vel, t, bar <= 4), t, 0.26));
  if (bar === 1) hit(NEEDLE_DROP, at(2) - NEEDLE_DROP - 0.05, 0.62);
  else if (inPart(bar, "intro", "breakdown")) hit(b0, BAR - 0.05, 0.62);
  else if (inPart(bar, "build1")) { hit(b0, BEAT * 1.4, 0.7); hit(b0 + 1.5 * BEAT, BEAT * 2.3, 0.62); }
  else if (inPart(bar, "dropA", "grooveB", "dropB")) {
    hit(b0, BEAT * 1.3, 0.8);
    hit(b0 + 1.5 * BEAT, BEAT * 0.45, 0.62);
    hit(b0 + 3 * BEAT, BEAT * 0.8, 0.68);
  } else if (bar === 23) for (let k = 0; k < 4; k++) hit(b0 + k * BEAT, BEAT * 0.4, 0.62 + k * 0.04);
  else if (bar === 24) for (let k = 0; k < 8; k++) hit(b0 + (k * BEAT) / 2, BEAT * 0.22, 0.6 + k * 0.03);
  else if (bar === 31) hit(b0, BAR * 2, 0.75);
}

// The keys' filter: closed in the intro and opening into the drop; half-shut in the breakdown.
{
  const fl = new Biquad("lp", 800, 0.8);
  const fr = new Biquad("lp", 800, 0.8);
  for (let i = 0; i < LEN; i++) {
    const t = i / SR;
    if (i % 64 === 0) {
      let fc = 9000;
      if (t < at(3)) fc = 750;
      else if (t < at(5)) fc = 750 * (9000 / 750) ** ((t - at(3)) / (at(5) - at(3))) ** 2;
      else if (t >= at(13) && t < at(15)) fc = 2200;
      else if (t >= at(23) && t < at(25)) fc = 1400 * (9000 / 1400) ** ((t - at(23)) / (at(25) - at(23)));
      fl.set("lp", fc, 0.8);
      fr.set("lp", fc, 0.8);
    }
    keys.L[i] = fl.run(keys.L[i]);
    keys.R[i] = fr.run(keys.R[i]);
  }
  // Out of the bass's way, and forward in the mids where the ear finds a keyboard.
  const shape = [0, 1].map(() => [new Biquad("hp", 170, 0.7), new Biquad("pk", 2300, 0.9, 4)]);
  for (let i = 0; i < LEN; i++) {
    keys.L[i] = shape[0][1].run(shape[0][0].run(keys.L[i]));
    keys.R[i] = shape[1][1].run(shape[1][0].run(keys.R[i]));
  }
}

// Pad: under the breakdown, the second groove and the final drop.
for (let bar = 1; bar <= BARS; bar++) {
  const ch = chordAt(bar);
  if (inPart(bar, "breakdown", "grooveB", "dropB")) {
    const cutoff = inPart(bar, "dropB") ? 2600 : 1500;
    place(padBus, pad(ch.keys.map((m) => m + 12), BAR, cutoff), at(bar), inPart(bar, "dropB") ? 0.9 : 0.6);
  }
}

// Arpeggio: sixteenths through the chord, brighter as the song goes on.
for (let bar = 1; bar <= BARS; bar++) {
  if (!inPart(bar, "grooveB", "build2", "dropB")) continue;
  const ch = chordAt(bar);
  for (let k = 0; k < 16; k++) {
    const t = at(bar) + (k * BEAT) / 4;
    const bright = inPart(bar, "dropB") ? 0.85 : inPart(bar, "build2") ? 0.4 + ((bar - 23) * 16 + k) / 64 : 0.55;
    const vel = k % 4 === 0 ? 0.55 : 0.36;
    place(arpBus, pluck(ch.arp[k % ch.arp.length], vel, bright), t, 0.5, k % 2 ? 0.35 : -0.35);
  }
}
// A dotted-eighth ping-pong on the arpeggio, so it fills the room without muddying it.
{
  const d = Math.round(BEAT * 0.75 * SR);
  const fb = 0.38;
  const lp = [new Biquad("lp", 3200, 0.7), new Biquad("lp", 3200, 0.7)];
  const L = new Float32Array(LEN);
  const Rr = new Float32Array(LEN);
  for (let i = 0; i < LEN; i++) {
    const inL = arpBus.L[i];
    const inR = arpBus.R[i];
    const dl = i >= d ? Rr[i - d] : 0;
    const dr = i >= d ? L[i - d] : 0;
    L[i] = lp[0].run(inR * 0.5 + dl * fb);
    Rr[i] = lp[1].run(inL * 0.5 + dr * fb);
  }
  for (let i = 0; i < LEN; i++) {
    arpBus.L[i] += L[i] * 0.55;
    arpBus.R[i] += Rr[i] * 0.55;
  }
}

// The bell line over the final drop: a four-bar answer to the keys.
{
  const line = [
    [0, 84], [0.75, 80], [1.5, 79], [2.5, 77], [3.5, 75],
    [4, 77], [4.75, 80], [5.5, 84], [6.5, 82],
    [8, 79], [8.75, 82], [9.5, 84], [10.5, 87], [11.5, 84],
    [12, 82], [12.75, 79], [13.5, 77], [14.5, 75], [15, 77],
  ];
  for (let rep = 0; rep < 3; rep++) {
    for (const [beat, m] of line) {
      const t = at(25) + rep * 4 * BAR + beat * BEAT;
      if (t >= at(31)) continue;
      const b = bell(m, 0.34);
      place(bellBus, b, t, 0.5, 0.1);
      place(send, b, t, 0.22);
    }
  }
}

// Effects: risers into the drops, impacts on them, whooshes on the cuts.
place(fx, needleDrop(), NEEDLE_DROP, 0.9);
events.impact.push(NEEDLE_DROP);
place(fx, riser(at(5) - at(3)), at(3), 0.3);
place(fx, riser(at(25) - at(23)), at(23), 0.34);
for (const t of [at(5), at(15), at(25)]) place(fx, reverseCymbal(BEAT * 2), t - BEAT * 2, 0.32);
for (const [t, v] of [[at(5), 1], [at(15), 0.55], [at(25), 1], [at(29), 0.6]]) {
  place(fx, impact(v), t, 0.85);
  const c = crash(1);
  place(fx, c, t, 0.24);
  place(send, c, t, 0.12);
  events.impact.push(t);
}
for (const t of LANDINGS) {
  // The record meets the platter: a felt thump under the kick.
  const th = new Float32Array(Math.round(0.25 * SR));
  let ph = 0;
  for (let i = 0; i < th.length; i++) {
    const u = i / SR;
    ph += (TAU * (90 + 60 * Math.exp(-u * 40))) / SR;
    th[i] = Math.sin(ph) * Math.exp(-u * 22);
  }
  place(fx, declick(th, 1), t, 0.45);
  events.landing.push(t);
}
for (const t of [at(2, 4.8), at(8, 4), at(11, 1.2), at(12, 4), at(14, 4.2), at(20, 1), at(24, 4)]) {
  const w = whoosh(0.6, true);
  place(fx, w, t - 0.3, 0.42);
  place(send, w, t - 0.3, 0.1);
  events.whoosh.push(t);
}
// Typing, a name spinning like a slot machine, taps on glass.
for (let k = 0; k < 14; k++) {
  const t = at(13, 3) + k * (BEAT / 4) * 0.5;
  place(fx, tick(3000 + (k % 3) * 400, 0.8), t, 0.22, 0.2);
  events.tick.push(+t.toFixed(4));
}
for (let k = 0; k < 5; k++) {
  const t = at(12) + k * (BEAT / 2);
  place(fx, tick(2400 + k * 90, 1), t, 0.28, -0.2);
  events.tick.push(+t.toFixed(4));
}
// The wordmark's letters landing on the end card, one per eighth.
for (let k = 0; k < 11; k++) {
  const t = at(29) + k * (BEAT / 4) * 1;
  place(fx, tick(1700 + k * 130, 0.9), t, 0.2, -0.5 + k * 0.1);
  events.tick.push(+t.toFixed(4));
}
for (const t of [at(14, 1), at(14, 1.5), at(19, 3), at(21, 3), at(30, 3)]) {
  place(fx, tap(1), t, 0.35);
  events.tap.push(t);
}
place(fx, scratch(), SCRATCH[0], 0.6, -0.1);

vinyl(vinylBus);

applyDuck(bassBus, 1);
applyDuck(keys, 0.35);
applyDuck(padBus, 0.6);
applyDuck(arpBus, 0.3);
applyDuck(bellBus, 0.2);

// A little reverb on the keys too.
for (let i = 0; i < LEN; i++) {
  send.L[i] += keys.L[i] * 0.16 + padBus.L[i] * 0.2 + arpBus.L[i] * 0.12;
  send.R[i] += keys.R[i] * 0.16 + padBus.R[i] * 0.2 + arpBus.R[i] * 0.12;
}

/* ------------------------------------------------------------- reverb */

function freeverb(inL, inR, room = 0.86, damp = 0.28) {
  const scale = SR / 44100;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const aps = [556, 441, 341, 225];
  const spread = Math.round(23 * scale);
  const make = (offset) => ({
    combs: combs.map((c) => ({ buf: new Float32Array(Math.round(c * scale) + offset), i: 0, store: 0 })),
    aps: aps.map((a) => ({ buf: new Float32Array(Math.round(a * scale) + offset), i: 0 })),
  });
  const chans = [make(0), make(spread)];
  const outs = [new Float32Array(LEN), new Float32Array(LEN)];
  const ins = [inL, inR];
  for (let ch = 0; ch < 2; ch++) {
    const { combs: cs, aps: as } = chans[ch];
    const input = ins[ch];
    const out = outs[ch];
    for (let n = 0; n < LEN; n++) {
      const x = (input[n] + ins[1 - ch][n]) * 0.5 * 0.015;
      let acc = 0;
      for (const c of cs) {
        const y = c.buf[c.i];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.i] = x + c.store * room;
        c.i = (c.i + 1) % c.buf.length;
        acc += y;
      }
      for (const a of as) {
        const b = a.buf[a.i];
        const y = -acc + b;
        a.buf[a.i] = acc + b * 0.5;
        a.i = (a.i + 1) % a.buf.length;
        acc = y;
      }
      out[n] = acc;
    }
  }
  return { L: outs[0], R: outs[1] };
}
const verb = freeverb(send.L, send.R);

/* ------------------------------------------------------------- master */

const levels = { drums: 1, bass: 0.42, keys: 1.1, pad: 0.8, arp: 0.85, bell: 0.85, fx: 0.9, vinyl: 1, verb: 2.2 };
const mL = new Float32Array(LEN);
const mR = new Float32Array(LEN);
for (let i = 0; i < LEN; i++) {
  mL[i] = drums.L[i] * levels.drums + bassBus.L[i] * levels.bass + keys.L[i] * levels.keys + padBus.L[i] * levels.pad +
    arpBus.L[i] * levels.arp + bellBus.L[i] * levels.bell + fx.L[i] * levels.fx + verb.L[i] * levels.verb;
  mR[i] = drums.R[i] * levels.drums + bassBus.R[i] * levels.bass + keys.R[i] * levels.keys + padBus.R[i] * levels.pad +
    arpBus.R[i] * levels.arp + bellBus.R[i] * levels.bell + fx.R[i] * levels.fx + verb.R[i] * levels.verb;
}

// Brought to a known level first, so the compressor's threshold means the same thing every run.
let preMix = 0;
for (let i = 0; i < LEN; i++) preMix = Math.max(preMix, Math.abs(mL[i]), Math.abs(mR[i]));
console.log(`mix peak before the master: ${(20 * Math.log10(preMix)).toFixed(2)} dBFS`);
for (let i = 0; i < LEN; i++) {
  mL[i] /= preMix;
  mR[i] /= preMix;
}

// Glue: a gentle compressor on the whole mix.
{
  let env = 0;
  const att = Math.exp(-1 / (0.012 * SR));
  const rel = Math.exp(-1 / (0.18 * SR));
  const thresh = dbToGain(-15);
  for (let i = 0; i < LEN; i++) {
    const x = Math.max(Math.abs(mL[i]), Math.abs(mR[i]));
    env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
    let g = 1;
    if (env > thresh) g = (env / thresh) ** (1 / 2.4 - 1);
    mL[i] *= g;
    mR[i] *= g;
  }
}

// Tape stop: the platter loses power, and everything slides down in pitch to a halt.
{
  const i0 = Math.round(TAPE_STOP * SR);
  const n = Math.round(TAPE_STOP_LEN * SR);
  const srcL = mL.slice(i0);
  const srcR = mR.slice(i0);
  let pos = 0;
  const lp = [new Biquad("lp", 12000, 0.7), new Biquad("lp", 12000, 0.7)];
  for (let i = 0; i < LEN - i0; i++) {
    if (i < n) {
      const u = i / n;
      const rate = (1 - u) ** 1.8;
      if (i % 32 === 0) {
        lp[0].set("lp", 300 + 11000 * rate, 0.7);
        lp[1].set("lp", 300 + 11000 * rate, 0.7);
      }
      const k = Math.floor(pos);
      const f = pos - k;
      const l = (srcL[k] ?? 0) * (1 - f) + (srcL[k + 1] ?? 0) * f;
      const r = (srcR[k] ?? 0) * (1 - f) + (srcR[k + 1] ?? 0) * f;
      const fade = u > 0.85 ? (1 - u) / 0.15 : 1;
      mL[i0 + i] = lp[0].run(l) * fade;
      mR[i0 + i] = lp[1].run(r) * fade;
      pos += rate;
    } else {
      mL[i0 + i] = 0;
      mR[i0 + i] = 0;
    }
  }
}

// The vinyl sits outside the tape stop: the groove keeps crackling until the needle lifts.
for (let i = 0; i < LEN; i++) {
  mL[i] += vinylBus.L[i];
  mR[i] += vinylBus.R[i];
}
{
  const lift = needleLift();
  const i0 = Math.round(NEEDLE_LIFT * SR);
  for (let i = 0; i < lift.length && i0 + i < LEN; i++) {
    mL[i0 + i] += lift[i] * 0.5;
    mR[i0 + i] += lift[i] * 0.5;
  }
  events.impact.push(NEEDLE_LIFT);
}

// A broad tilt: less box at 450 Hz, a little presence and air on top.
{
  const eq = [0, 1].map(() => [new Biquad("pk", 450, 0.9, -3), new Biquad("pk", 3000, 0.8, 2.5), new Biquad("pk", 10000, 0.5, 4)]);
  for (let i = 0; i < LEN; i++) {
    mL[i] = eq[0][2].run(eq[0][1].run(eq[0][0].run(mL[i])));
    mR[i] = eq[1][2].run(eq[1][1].run(eq[1][0].run(mR[i])));
  }
}

// DC and rumble out, a soft clip on the peaks, then normalise to -1 dBFS.
{
  const hp = [new Biquad("hp", 32, 0.7), new Biquad("hp", 32, 0.7)];
  let peak = 0;
  for (let i = 0; i < LEN; i++) {
    mL[i] = Math.tanh(hp[0].run(mL[i]) * 1.15);
    mR[i] = Math.tanh(hp[1].run(mR[i]) * 1.15);
    peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
  }
  const g = dbToGain(-1) / peak;
  for (let i = 0; i < LEN; i++) {
    mL[i] *= g;
    mR[i] *= g;
  }
  // The last half second fades to nothing, so the film ends in silence.
  const f0 = LEN - Math.round(0.5 * SR);
  for (let i = f0; i < LEN; i++) {
    const g2 = (LEN - i) / (LEN - f0);
    mL[i] *= g2;
    mR[i] *= g2;
  }
}

/* -------------------------------------------------------------- write */

function writeWav(file, L, Rr) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  const d = rng(7);
  for (let i = 0; i < n; i++) {
    const dither = (d() - d()) / 32768;
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((L[i] + dither) * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((Rr[i] + dither) * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
writeWav(path.join(OUT, "soundtrack.wav"), mL, mR);

/* ----------------------------------------------------------- analysis */

// A spectrum per video frame, so bars and pulses on screen follow the actual sound.
const N = 2048;
const hann = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((TAU * i) / (N - 1)));
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}
const BANDS = 24;
const edges = Array.from({ length: BANDS + 1 }, (_, k) => 40 * (14000 / 40) ** (k / BANDS));
const frames = Math.round(DURATION * FPS);
const bands = [];
const rms = [];
const smooth = new Float32Array(BANDS);
for (let f = 0; f < frames; f++) {
  const c = Math.round(((f + 0.5) / FPS) * SR);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  let e = 0;
  for (let i = 0; i < N; i++) {
    const j = c - N / 2 + i;
    const x = j >= 0 && j < LEN ? (mL[j] + mR[j]) * 0.5 : 0;
    re[i] = x * hann[i];
    if (Math.abs(i - N / 2) < SR / FPS / 2) e += x * x;
  }
  rms.push(+Math.min(1, Math.max(0, (10 * Math.log10(e / (SR / FPS) + 1e-10) + 42) / 36)).toFixed(3));
  fft(re, im);
  const row = [];
  for (let k = 0; k < BANDS; k++) {
    const lo = Math.max(1, Math.floor((edges[k] * N) / SR));
    const hi = Math.max(lo + 1, Math.ceil((edges[k + 1] * N) / SR));
    let p = 0;
    for (let b = lo; b < hi; b++) p = Math.max(p, re[b] * re[b] + im[b] * im[b]);
    const db = 10 * Math.log10(p + 1e-12);
    const v = Math.min(1, Math.max(0, (db - 8 + k * 0.55) / 42));
    smooth[k] = v > smooth[k] ? v : smooth[k] * 0.84 + v * 0.16;
    row.push(+smooth[k].toFixed(3));
  }
  bands.push(row);
}
for (const k of Object.keys(events)) events[k].sort((a, b) => a - b);
fs.writeFileSync(
  path.join(OUT, "envelopes.js"),
  `/* Generated by music.mjs: cue times and a per-frame spectrum of the soundtrack. */\nwindow.ENV = ${JSON.stringify({ fps: FPS, rms, bands, events })};\n`
);

let peakDb = -Infinity;
for (let i = 0; i < LEN; i++) peakDb = Math.max(peakDb, Math.abs(mL[i]), Math.abs(mR[i]));
console.log(`soundtrack: ${DURATION}s, ${SR} Hz, peak ${(20 * Math.log10(peakDb)).toFixed(2)} dBFS`);
console.log(`cues: ${Object.entries(events).map(([k, v]) => `${k} ${v.length}`).join(", ")}`);
