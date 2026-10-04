/* 0:08 The drop. Out of the spindle and back to the whole changer; a record falls
   onto the platter on beat three of every bar while the numbers roll up beside it. */

import { SCENES, LANDINGS, at } from "../score.mjs";
import { base } from "./base.mjs";
import { div, tf } from "../lib/dom.mjs";
import { E, tw, lerp, kf } from "../lib/anim.mjs";
import { PLATTER_C, REST_Y, STACK_T, RPM_33, heldY } from "../lib/deck3d.mjs";

const P = [PLATTER_C.x, PLATTER_C.y, PLATTER_C.z];
const FALL_FROM = heldY(0);
const LAND_Y = REST_Y + STACK_T;
const FALL = Math.sqrt((2 * (FALL_FROM - LAND_Y)) / 9.8);
const spinAt = (t) => -RPM_33 * t;
const HELD = 4;

/** Camera on an orbit round a target, as the landing page frames its changer. */
function orbit(target, r, el, az, fov = 30) {
  return {
    pos: [target[0] + r * Math.cos(el) * Math.sin(az), target[1] + r * Math.sin(el), target[2] + r * Math.cos(el) * Math.cos(az)],
    target, fov,
  };
}
const mixCam = (a, b, u) => ({
  pos: a.pos.map((v, i) => lerp(v, b.pos[i], u)),
  target: a.target.map((v, i) => lerp(v, b.target[i], u)),
  fov: lerp(a.fov, b.fov, u),
  roll: lerp(a.roll ?? 0, b.roll ?? 0, u),
});

export default function changer(ctx) {
  const s = base(ctx, SCENES.changer);
  const [start, end] = SCENES.changer;
  const { deck, records, shelf } = ctx;

  div("", s.bg, {
    position: "absolute", inset: "0",
    background: "radial-gradient(60% 70% at 62% 55%, rgba(231,197,122,0.10), rgba(0,0,0,0) 70%), #0e0b09",
  });
  div("", s.bg, {
    position: "absolute", inset: "0", opacity: "0.6",
    backgroundImage: "radial-gradient(rgba(243,237,227,0.06) 1.3px, transparent 1.8px)", backgroundSize: "22px 22px",
    maskImage: "radial-gradient(60% 80% at 62% 55%, #000 20%, transparent 80%)",
  });
  // A soft dark wash on the left, so the numbers read over any shot.
  div("", s.fg, { position: "absolute", inset: "0", background: "linear-gradient(90deg, rgba(10,8,7,0.72) 0%, rgba(10,8,7,0.35) 30%, rgba(10,8,7,0) 48%)" });

  // The numbers.
  const counters = [
    { at: at(6), to: 8, word: "playlists" },
    { at: at(7), to: 308, word: "songs" },
    { at: at(8), to: 1, word: "link" },
  ].map((c) => {
    const box = div("", s.fg, { position: "absolute", left: "140px", top: "300px", width: "800px", height: "480px" });
    const num = div("display", box, { position: "absolute", left: "0", top: "0", fontSize: "330px", lineHeight: "1", fontVariantNumeric: "tabular-nums" });
    const word = div("tag", box, { position: "absolute", left: "10px", top: "350px", fontSize: "30px", color: "#e7c57a" });
    word.textContent = c.word;
    return { ...c, box, num, word };
  });

  // Now spinning, as the landing page captions its changer.
  const cap = div("", s.fg, { position: "absolute", left: "0", width: "1920px", bottom: "76px", display: "flex", justifyContent: "center", alignItems: "baseline", gap: "22px" });
  const capTag = div("tag", cap, { fontSize: "18px", color: "#e7c57a" });
  capTag.textContent = "Now spinning";
  const capTitleBox = div("", cap, { position: "relative", height: "56px", overflow: "hidden", minWidth: "520px" });
  const titles = records.map((r, i) => {
    const n = div("display", capTitleBox, { position: "absolute", left: "0", top: "0", fontSize: "50px", whiteSpace: "nowrap" });
    n.textContent = r.title;
    const meta = div("", capTitleBox, { position: "absolute", top: "20px", fontSize: "22px", color: "rgba(243,237,227,0.62)", whiteSpace: "nowrap" });
    meta.textContent = `${shelf.playlists[i].songs} songs · ${r.service}`;
    return { n, meta };
  });

  s.init = () => {
    titles.forEach(({ n, meta }) => {
      meta.style.left = `${n.getBoundingClientRect().width + 18}px`;
    });
  };

  /** Which record is on the platter, which is falling, and where the stack is, at time t. */
  function recordsAt(t) {
    const out = [];
    const landed = LANDINGS.filter((L) => t >= L).length;
    const drops = LANDINGS.filter((L) => t >= L - FALL).length;

    // The platter: the last record down, turning from wherever it landed.
    const plat = { i: landed, platter: true, pos: [0, REST_Y, 0], rot: [0, 0, 0] };
    if (landed > 0) {
      const L = LANDINGS[landed - 1];
      const u = tw(t, L, L + 0.42, E.linear);
      const damp = 1 - u;
      plat.pos = [0, LAND_Y + (REST_Y - LAND_Y) * E.outCubic(u) + Math.sin(u * Math.PI * 3) * 0.012 * damp, 0];
      plat.rot = [Math.sin(u * Math.PI * 4) * 0.02 * damp, landed * 1.7 - spinAt(L), Math.cos(u * Math.PI * 4) * 0.02 * damp];
    }
    out.push(plat);

    // A record in the air, falling under gravity with a little wobble.
    LANDINGS.forEach((L, k) => {
      if (t < L - FALL || t >= L) return;
      const u = (t - (L - FALL)) / FALL;
      const r = k + 1;
      out.push({
        i: r, platter: false,
        pos: [P[0], lerp(FALL_FROM, LAND_Y, u * u), P[2]],
        rot: [0.04 * Math.sin(u * Math.PI) * (k % 2 ? 1 : -1), r * 1.7, 0.035 * Math.sin(u * Math.PI)],
      });
    });

    // The stack: each record steps down a slot as the one beneath drops away, and a new
    // record is set on top once the last one lands.
    for (let r = 1; r < records.length; r++) {
      if (r <= LANDINGS.length && t >= LANDINGS[r - 1] - FALL) continue;
      const arrive = r <= HELD ? -Infinity : (LANDINGS[r - HELD - 1] ?? Infinity) + 0.12;
      if (t < arrive) continue;
      const slot = r - 1 - drops;
      if (slot < 0 || slot >= HELD) continue;
      const settle = drops > 0 ? tw(t, LANDINGS[drops - 1] - FALL, LANDINGS[drops - 1] - FALL + 0.3, E.outCubic) : 1;
      let y = heldY(slot) + STACK_T * (1 - settle);
      let opacity = 1;
      if (r > HELD) {
        const u = tw(t, arrive, arrive + 0.62, E.outCubic);
        y = heldY(slot) + 0.45 * (1 - u);
        opacity = u;
      }
      out.push({ i: r, platter: false, pos: [P[0], y, P[2]], rot: [0, r * 1.7, 0], opacity });
    }
    return out;
  }

  /** The arm lifts clear before each drop and swings back once the record lands. */
  function arm(t) {
    const play = deck.armPlay;
    let angle = play;
    let lift = 0;
    for (const L of LANDINGS) {
      if (t >= L - 0.95 && t < L + 0.95) {
        angle = kf(t, [[L - 0.95, play], [L - 0.5, 0, E.inOutCubic], [L + 0.2, 0], [L + 0.78, play, E.inOutCubic]]);
        lift = kf(t, [[L - 0.95, 0], [L - 0.85, 0.11, E.outCubic], [L + 0.78, 0.11], [L + 0.93, 0, E.inOutCubic]]);
      }
    }
    return { angle, lift };
  }

  const shots = [
    { from: start, to: at(6), cam: (t) => {
      const u = tw(t, start, start + 1.6, E.outExpo);
      const top = { pos: [P[0] + 0.05, 2.05, P[2] + 0.28], target: [P[0], 1.08, P[2]], fov: 42, roll: 0.6 };
      const drift = orbit([0.3, 0.3, 0], 8.6, 0.42, lerp(-0.26, -0.16, tw(t, start + 1.6, at(6), E.linear)));
      return mixCam(top, { ...drift, roll: 0 }, u);
    } },
    { from: at(6), to: at(7), cam: (t) => {
      const u = tw(t, at(6), at(7), E.outCubic);
      const az = lerp(-0.78, -0.62, u);
      const target = [P[0] + 0.05, 0.5, P[2]];
      return { ...orbit(target, 4.3 - 0.35 * u, 0.1, az, 31), roll: -0.02 };
    } },
    { from: at(7), to: at(8), cam: (t) => {
      const u = tw(t, at(7), at(8), E.outCubic);
      return { pos: [P[0] + 1.3 - 0.22 * u, 1.2 - 0.06 * u, P[2] + 1.6 - 0.15 * u], target: [P[0] - 0.42, 0.9, P[2] - 0.2], fov: 30, roll: 0.02 };
    } },
    { from: at(8), to: end, cam: (t) => {
      const az = lerp(-0.75, 0.15, tw(t, at(8), at(8, 4), E.inOutSine)) + 1.6 * E.inExpo(tw(t, at(8, 4), end, E.linear));
      return { ...orbit([0.25, 0.28, 0], 7.6, 0.48, az), roll: 0.35 * E.inExpo(tw(t, at(8, 4), end, E.linear)) };
    } },
  ];

  s.render = (t) => {
    const shot = shots.find((sh) => t >= sh.from && t < sh.to) ?? shots[shots.length - 1];
    const a = arm(t);
    ctx.useDeck({
      cam: shot.cam(t),
      spin: spinAt(t),
      armAngle: a.angle,
      armLift: a.lift,
      changer: true,
      records: recordsAt(t),
    });

    counters.forEach((c, k) => {
      const next = counters[k + 1];
      const inU = tw(t, c.at + 0.06, c.at + 0.6, E.outExpo);
      const outU = next ? tw(t, next.at - 0.12, next.at + 0.06, E.inCubic) : tw(t, end - 0.45, end - 0.1, E.inCubic);
      const on = t >= c.at - 0.01;
      c.box.style.display = on && outU < 1 ? "" : "none";
      const value = Math.round(c.to * E.outExpo(tw(t, c.at, c.at + 0.8, E.linear)));
      c.num.textContent = String(value);
      tf(c.box, { y: (1 - inU) * 120 - outU * 160, o: inU * (1 - outU) });
      tf(c.word, { x: (1 - tw(t, c.at + 0.15, c.at + 0.6, E.outExpo)) * -40, o: tw(t, c.at + 0.15, c.at + 0.5, E.outCubic) });
    });

    // The caption rolls to the record that just landed.
    titles.forEach(({ n, meta }, i) => {
      const inAt = i === 0 ? start : LANDINGS[i - 1];
      const outAt = LANDINGS[i];
      if (inAt === undefined) {
        n.style.opacity = meta.style.opacity = "0";
        return;
      }
      const inU = i === 0 ? 1 : tw(t, inAt, inAt + 0.45, E.outExpo);
      const outU = outAt !== undefined ? tw(t, outAt, outAt + 0.3, E.inCubic) : 0;
      const live = t >= inAt && (outAt === undefined || t < outAt + 0.3);
      const y = (1 - inU) * 60 - outU * 60;
      tf(n, { y, o: live ? inU * (1 - outU) : 0 });
      tf(meta, { y, o: live ? inU * (1 - outU) : 0 });
    });
    tf(cap, { o: tw(t, start + 0.6, start + 1.2, E.outCubic) * (1 - tw(t, end - 0.4, end - 0.1, E.inCubic)) });
  };
  return s;
}
