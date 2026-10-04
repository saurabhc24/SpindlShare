/* 0:00 Cold open. A ring draws itself like a groove; the needle drops on the cut,
   and four macro shots of the real deck land one per beat. */

import { SCENES, NEEDLE_DROP } from "../score.mjs";
import { base } from "./base.mjs";
import { div, tf } from "../lib/dom.mjs";
import { E, tw, move, clamp, lerp } from "../lib/anim.mjs";
import { PLATTER_C, REST_Y, RPM_33 } from "../lib/deck3d.mjs";

const NS = "http://www.w3.org/2000/svg";
const svgEl = (tag, parent, attrs) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  parent.appendChild(n);
  return n;
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mix = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];

export default function needle(ctx) {
  const s = base(ctx, SCENES.needle);
  const { deck } = ctx;
  div("", s.bg, { position: "absolute", inset: "0", background: "#0b0908" });

  // The groove before the needle: a ring drawn once round, with the stylus riding its end.
  const svg = svgEl("svg", s.fg, { width: "1920", height: "1080", viewBox: "0 0 1920 1080" });
  svg.style.position = "absolute";
  const R0 = 250;
  const C = 2 * Math.PI * R0;
  const grooves = Array.from({ length: 9 }, (_, k) =>
    svgEl("circle", svg, { cx: 960, cy: 540, r: 118 + k * 14, fill: "none", stroke: "#e7c57a", "stroke-width": 1, opacity: 0 })
  );
  const ring = svgEl("circle", svg, {
    cx: 960, cy: 540, r: R0, fill: "none", stroke: "#e7c57a", "stroke-width": 2.2,
    "stroke-dasharray": `${C}`, "stroke-dashoffset": `${C}`, transform: "rotate(-90 960 540)", "stroke-linecap": "round",
  });
  const glow = svgEl("circle", svg, { cx: 0, cy: 0, r: 18, fill: "#ffe2a6", opacity: 0.18 });
  const dot = svgEl("circle", svg, { cx: 0, cy: 0, r: 4.5, fill: "#fff4dc" });
  const side = div("tag", s.fg, { position: "absolute", left: "0", width: "1920px", top: "528px", textAlign: "center", fontSize: "15px", color: "#e7c57a", opacity: "0" });
  side.textContent = "Side A";

  // A camera report in the corners, as if the reel were being shot on set.
  const hud = div("mono", s.fg, { position: "absolute", inset: "0", fontSize: "15px", letterSpacing: "0.22em", color: "rgba(243,237,227,0.72)", opacity: "0" });
  const corner = (css, text) => {
    const n = div("", hud, { position: "absolute", ...css });
    n.textContent = text;
    return n;
  };
  corner({ left: "72px", top: "60px" }, "SPINDLSHARE — REEL 26");
  corner({ right: "72px", top: "60px" }, "SIDE A · 33⅓ RPM");
  const tc = corner({ right: "72px", bottom: "60px" }, "");
  const shotBox = div("", hud, { position: "absolute", left: "72px", bottom: "60px", height: "22px", width: "600px", overflow: "hidden" });
  const recDot = div("", hud, { position: "absolute", left: "72px", top: "98px", width: "10px", height: "10px", borderRadius: "50%", background: "#c3192f" });

  const P = [PLATTER_C.x, PLATTER_C.y, PLATTER_C.z];
  let S = [0, 0, 0];
  const shots = [
    { from: 1.0, to: 2.0, name: "01  GROOVE", cam: (u) => ({
      pos: mix(add(P, [0.7, 0.09, 0.62]), add(P, [0.5, 0.068, 0.45]), E.outCubic(u)),
      target: mix(add(P, [0.02, 0.03, 0.03]), add(P, [0, 0.028, 0]), u), fov: lerp(38, 33, u), roll: lerp(-0.05, 0.02, u) }) },
    { from: 2.0, to: 2.5, name: "02  STYLUS", cam: (u) => ({
      pos: mix(add(S, [-0.3, 0.075, 0.42]), add(S, [-0.24, 0.06, 0.34]), E.outCubic(u)),
      target: add(S, [0.02, 0.0, -0.02]), fov: 30, roll: 0.05 }) },
    { from: 2.5, to: 3.0, name: "03  STROBE", cam: (u) => ({
      pos: mix([P[0] - 1.62, 0.05, P[2] + 1.28], [P[0] - 1.5, 0.03, P[2] + 1.18], E.outCubic(u)),
      target: [P[0] - 0.72, -0.07, P[2] + 0.82], fov: 29, roll: -0.04 }) },
    { from: 3.0, to: 3.5, name: "04  LABEL", cam: (u) => ({
      pos: mix(add(P, [0.4, 0.68, 0.52]), add(P, [0.27, 0.6, 0.44]), E.outCubic(u)),
      target: add(P, [0, 0.035, 0]), fov: 27, roll: lerp(0.18, 0.06, u) }) },
    { from: 3.5, to: 4.0, name: "05  33⅓", cam: (u) => ({
      pos: [P[0] + 0.55, 3.3, P[2] + 0.8], target: P,
      fov: u < 0.44 ? 34 : lerp(34, 1.6, E.inExpo((u - 0.44) / 0.56)), roll: lerp(0, 0.9, E.inCubic(u)) }) },
  ];
  const labels = shots.map((sh) => {
    const n = div("", shotBox, { position: "absolute", left: "0", top: "0", whiteSpace: "pre" });
    n.textContent = sh.name;
    return n;
  });

  s.init = () => {
    // The stylus as it sits in the groove at the play angle.
    deck.deck.swing.rotation.y = deck.armPlay;
    deck.deck.lift.position.y = 0;
    const v = deck.stylusWorld();
    S = [v.x, v.y, v.z];
  };

  s.render = (t) => {
    const pre = t < NEEDLE_DROP;
    svg.style.display = pre ? "" : "none";
    side.style.display = pre ? "" : "none";
    if (pre) {
      const p = tw(t, 0.08, 0.86, E.inOutCubic);
      ring.setAttribute("stroke-dashoffset", `${C * (1 - p)}`);
      const a = -Math.PI / 2 + p * Math.PI * 2;
      const tighten = tw(t, 0.86, 1.0, E.inExpo);
      const r = R0 * (1 - 0.06 * tighten);
      ring.setAttribute("r", `${r}`);
      const x = 960 + Math.cos(a) * r;
      const y = 540 + Math.sin(a) * r;
      dot.setAttribute("cx", x);
      dot.setAttribute("cy", y);
      glow.setAttribute("cx", x);
      glow.setAttribute("cy", y);
      dot.setAttribute("opacity", p > 0 ? 1 : 0);
      glow.setAttribute("opacity", p > 0 ? 0.18 + 0.4 * tighten : 0);
      grooves.forEach((g, k) => g.setAttribute("opacity", (0.07 * tw(t, 0.25 + k * 0.05, 0.75 + k * 0.05, E.outCubic)).toFixed(3)));
      tf(side, { y: move(t, 0.3, 0.8, 8, 0), o: tw(t, 0.3, 0.8, E.outCubic) * (1 - tighten) });
      ring.setAttribute("stroke-width", `${2.2 + tighten * 2}`);
      hud.style.opacity = "0";
      return;
    }

    // The macro shots, cut on the beat; the platter never stops turning under them.
    const shot = shots.find((sh) => t >= sh.from && t < sh.to) ?? shots[shots.length - 1];
    const u = clamp((t - shot.from) / (shot.to - shot.from));
    const lift = shot === shots[1] ? 0.036 * (1 - tw(t, 2.0, 2.3, E.inOutCubic)) : 0;
    ctx.useDeck({
      cam: shot.cam(u),
      spin: -RPM_33 * t,
      armAngle: deck.armPlay,
      armLift: lift,
      changer: false,
      records: [{ i: 0, platter: true, pos: [0, REST_Y, 0] }],
      exposure: 1.05 + 0.5 * Math.exp(-(t - NEEDLE_DROP) * 9),
    });

    hud.style.opacity = tw(t, NEEDLE_DROP, NEEDLE_DROP + 0.25, E.outCubic).toFixed(3);
    labels.forEach((n, k) => {
      const sh = shots[k];
      const inY = move(t, sh.from, sh.from + 0.28, 24, 0);
      const outY = move(t, sh.to, sh.to + 0.2, 0, -24, E.inCubic);
      tf(n, { y: t < sh.to ? inY : outY, o: t >= sh.from && t < sh.to + 0.2 ? 1 : 0 });
    });
    const f = Math.floor(t * 60);
    const ff = (v) => String(v).padStart(2, "0");
    tc.textContent = `TC 00:00:${ff(Math.floor(f / 60))}:${ff(f % 60)}`;
    recDot.style.opacity = Math.floor(t * 2) % 2 === 0 ? "1" : "0.25";
  };
  return s;
}
