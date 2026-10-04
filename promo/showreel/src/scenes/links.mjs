/* 0:16 The problem. Every playlist is its own link: rows of them stream across a
   tilted plane, get struck out, then are pulled into a single address. */

import { SCENES, at } from "../score.mjs";
import { base } from "./base.mjs";
import { div, tf, kernedLine } from "../lib/dom.mjs";
import { E, tw, move, lerp, noise1, pulse } from "../lib/anim.mjs";

const INK = "#15100b";
const RUBY = "#c3192f";
export const PILL = { cx: 960, cy: 560, h: 152, font: 96, pad: 60 };
export const NAMES = [
  [-Infinity, "yourname"],
  [at(12), "saurabhchandra"],
  [at(12, 1.5), "maya"],
  [at(12, 2), "dj.khan"],
  [at(12, 2.5), "sunday.mix"],
  [at(12, 3), "yourname"],
];

/** Distance a row has travelled, in units of its base speed: steady, then racing. */
function travel(t, start) {
  const base = t - start;
  const a0 = at(10);
  if (t <= a0) return base;
  const u = Math.min(1, (t - a0) / 2);
  let extra = (10 / 3) * u ** 3;
  if (t > a0 + 2) extra += 5 * (t - a0 - 2);
  return base + extra;
}

export default function links(ctx) {
  const s = base(ctx, SCENES.links);
  const [start, end] = SCENES.links;
  const urls = ctx.shelf.urls.map((u) => u.replace(/^https:\/\//, ""));

  div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(80% 90% at 50% 45%, #fbc440 0%, #f6b526 55%, #e9a514 100%)" });

  // The links, on a plane tipped away from the camera.
  const stage3d = div("", s.bg, { position: "absolute", inset: "0", perspective: "1500px", perspectiveOrigin: "50% 40%" });
  const plane = div("", stage3d, { position: "absolute", left: "-640px", top: "-460px", width: "3200px", height: "2000px", transformOrigin: "1600px 1000px" });
  const rows = Array.from({ length: 12 }, (_, r) => {
    const row = div("mono", plane, {
      position: "absolute", left: "0", top: `${r * 160 + 40}px`, whiteSpace: "nowrap",
      fontSize: "52px", fontWeight: "700", color: `rgba(21,16,11,${r % 3 === 1 ? 0.34 : 0.2})`,
    });
    const seq = [...urls.slice(r % urls.length), ...urls.slice(0, r % urls.length)];
    row.textContent = [...seq, ...seq, ...seq].join("      ");
    return { row, dir: r % 2 ? 1 : -1, speed: 70 + (r % 4) * 22, width: 0 };
  });

  // Foreground: what those links are, then the verdict.
  const copy = [
    { text: "Spotify links.", top: 214, at: start, color: INK, strike: at(10) },
    { text: "YouTube links.", top: 354, at: start + 0.5, color: INK, strike: at(10, 1.5) },
    { text: "YouTube Music links.", top: 494, at: start + 1.0, color: INK, strike: at(10, 2) },
    { text: "Too many links.", top: 634, at: start + 1.5, color: RUBY },
  ].map((c) => {
    const box = div("", s.fg, { position: "absolute", left: "150px", top: `${c.top}px`, width: "1700px", height: "150px", overflow: "hidden" });
    const line = kernedLine(box, c.text, "display", { fontSize: "124px", left: "0", top: "6px", color: c.color });
    const bar = div("", s.fg, { position: "absolute", left: "146px", top: `${c.top + 70}px`, height: "14px", width: "0px", background: RUBY, borderRadius: "7px" });
    return { ...c, box, line, bar };
  });

  // The one address.
  const pill = div("", s.fg, {
    position: "absolute", left: `${PILL.cx}px`, top: `${PILL.cy - PILL.h / 2}px`, height: `${PILL.h}px`,
    background: INK, borderRadius: `${PILL.h / 2}px`, overflow: "hidden",
    boxShadow: "0 40px 90px rgba(80,40,0,0.35)",
  });
  const pillText = div("display", pill, { position: "absolute", left: `${PILL.pad}px`, top: "0", height: `${PILL.h}px`, display: "flex", alignItems: "center", fontSize: `${PILL.font}px`, whiteSpace: "nowrap" });
  const host = div("", pillText, { color: "rgba(243,237,227,0.52)" });
  host.textContent = "spindlshare.com/";
  const nameBox = div("", pillText, { position: "relative", height: `${PILL.h}px`, overflow: "hidden", display: "flex", alignItems: "center" });
  const names = NAMES.map(([, name]) => {
    const n = div("", nameBox, { position: "absolute", left: "0", top: `${PILL.h / 2 - PILL.font * 0.62}px`, color: "#f3ede3", whiteSpace: "nowrap" });
    n.textContent = name;
    return { n, w: 0 };
  });
  const kicker = div("", s.fg, { position: "absolute", left: "0", width: "1920px", top: "388px", textAlign: "center", fontSize: "38px", fontWeight: "800", color: INK });
  kicker.textContent = "All of those links, behind one.";

  s.init = () => {
    copy.forEach((c) => c.line.split());
    rows.forEach((r) => (r.width = r.row.getBoundingClientRect().width / 3));
    names.forEach((x) => (x.w = x.n.getBoundingClientRect().width));
    s.hostW = host.getBoundingClientRect().width;
    ctx.pillStart = { w: s.hostW + names[0].w + PILL.pad * 2, h: PILL.h };
  };

  s.render = (t) => {
    const suck = tw(t, at(11), at(11, 2.8), E.inExpo);
    const kick = pulse(t, ctx.env.events.kick, 9);

    // The plane: rows drifting, then racing, then drawn into the centre.
    tf(plane, { rx: 38 * (1 - suck), r: lerp(-14, 160, suck), s: lerp(1.3, 0.001, suck) * (1 + 0.012 * kick), origin: "1600px 1000px" });
    rows.forEach((r) => {
      const d = travel(t, start) * r.speed;
      const w = r.width || 1;
      const x = r.dir > 0 ? -w + (d % w) : -((d % w));
      tf(r.row, { x });
    });

    copy.forEach((c) => {
      c.line.letters.forEach((g, i) => {
        const u = tw(t, c.at + i * 0.014, c.at + i * 0.014 + 0.55, E.outExpo);
        tf(g.el, { y: (1 - u) * 160 });
      });
      if (c.strike) {
        const w = c.line.width ? c.line.width + 8 : 0;
        c.bar.style.width = `${(w * tw(t, c.strike, c.strike + 0.32, E.outExpo)).toFixed(1)}px`;
      }
      // Pulled into the centre with the plane.
      const cx = 960 - 150;
      const cy = 540 - c.top;
      const sc = lerp(1, 0.001, suck);
      const shakeX = c.color === RUBY ? noise1(t * 26, 5) * 6 * tw(t, at(10, 3), at(11), E.linear) : 0;
      for (const n of [c.box, c.bar]) {
        n.style.transformOrigin = `${cx}px ${cy}px`;
        tf(n, { x: shakeX, s: sc, r: lerp(0, 90, suck), o: 1 - tw(t, at(11, 2.4), at(11, 2.9), E.linear) });
      }
    });

    // The pill grows out of the point everything vanished into.
    const grow = tw(t, at(11, 2.6), at(11, 4), E.outExpo);
    let current = 0;
    NAMES.forEach(([from], i) => {
      if (t >= from) current = i;
    });
    const nameW = (() => {
      const [from] = NAMES[current];
      const prev = names[Math.max(0, current - 1)].w;
      return lerp(prev, names[current].w, current === 0 ? 1 : tw(t, from, from + 0.2, E.outExpo));
    })();
    const full = (s.hostW ?? 900) + nameW + PILL.pad * 2;
    const w = lerp(PILL.h, full, grow);
    const punch = 1 + 0.06 * Math.exp(-Math.max(0, t - NAMES[NAMES.length - 1][0]) * 10) * (t >= NAMES[NAMES.length - 1][0] ? 1 : 0);
    pill.style.width = `${w.toFixed(1)}px`;
    nameBox.style.width = `${nameW.toFixed(1)}px`;
    tf(pill, { x: -w / 2, s: grow > 0 ? lerp(0.2, 1, E.outBack(tw(t, at(11, 2.6), at(11, 3.4), E.linear))) * punch : 0, o: grow > 0 && t < at(12, 4) ? 1 : 0, origin: `${w / 2}px ${PILL.h / 2}px` });
    tf(pillText, { o: tw(t, at(11, 3.1), at(11, 3.8), E.outCubic) });
    names.forEach((x, i) => {
      const [from] = NAMES[i];
      const next = NAMES[i + 1]?.[0] ?? Infinity;
      const inU = i === 0 ? 1 : tw(t, from, from + 0.12, E.outCubic);
      // The last name has nothing after it; easing towards infinity would come out as NaN and hide it.
      const outU = Number.isFinite(next) ? tw(t, next, next + 0.08, E.inCubic) : 0;
      const live = t >= from - 0.001 && t < next + 0.08;
      tf(x.n, { y: (1 - inU) * PILL.h - outU * PILL.h, o: live ? 1 - outU * 0.6 : 0 });
    });
    tf(kicker, { y: move(t, at(11, 3.4), at(11, 4.2), 30, 0), o: tw(t, at(11, 3.4), at(11, 4), E.outCubic) * (1 - tw(t, at(12, 3.8), end, E.linear)) });
  };
  return s;
}
