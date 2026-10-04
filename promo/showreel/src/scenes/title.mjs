/* 0:04 The headline. The words rise on the beat, and the letters of "spinning."
   start life printed round a record's label and fly off it into the line. */

import { SCENES, at } from "../score.mjs";
import { base } from "./base.mjs";
import { div, el, tf, kernedLine } from "../lib/dom.mjs";
import { E, tw, move, clamp, lerp, pulse, noise1 } from "../lib/anim.mjs";

const CX = 1480;
const CY = 560;
const GOLD = "linear-gradient(180deg, #f5dfa8 0%, #e2bd72 55%, #c99a4c 100%)";

/** The label's angle in degrees: 33⅓ rpm, spinning up hard into the drop. */
function labelAngle(t) {
  const base = 200 * (t - at(3));
  const t0 = at(4, 3);
  const d = 0.95;
  if (t <= t0) return base;
  const u = Math.min(t, t0 + d) - t0;
  let extra = 1800 * (d / 4) * (u / d) ** 4;
  if (t > t0 + d) extra += 1800 * (t - t0 - d);
  return base + extra;
}

export default function title(ctx) {
  const s = base(ctx, SCENES.title);
  const [start] = SCENES.title;

  div("", s.bg, {
    position: "absolute", inset: "0",
    background: "radial-gradient(55% 75% at 76% 52%, rgba(231,197,122,0.11), rgba(0,0,0,0) 70%), #0e0b09",
  });
  div("", s.bg, {
    position: "absolute", inset: "0", opacity: "0.55",
    backgroundImage: "radial-gradient(rgba(243,237,227,0.07) 1.3px, transparent 1.8px)", backgroundSize: "20px 20px",
    maskImage: "radial-gradient(70% 90% at 72% 50%, #000 20%, transparent 75%)",
  });

  // The record: grooves that do not move, a label that does, and light that stays put.
  const rec = div("", s.bg, { position: "absolute", left: `${CX - 470}px`, top: `${CY - 470}px`, width: "940px", height: "940px" });
  div("", rec, {
    position: "absolute", inset: "0", borderRadius: "50%",
    background: "repeating-radial-gradient(circle at 50% 50%, #151312 0 1.6px, #0b0a09 1.6px 3.4px)",
    boxShadow: "0 40px 90px rgba(0,0,0,0.6), inset 0 0 0 10px #0a0908, inset 0 0 0 11px rgba(231,197,122,0.18)",
  });
  div("", rec, {
    position: "absolute", inset: "0", borderRadius: "50%", mixBlendMode: "screen",
    background: "conic-gradient(from 24deg, rgba(255,255,255,0) 0deg, rgba(255,244,220,0.22) 16deg, rgba(255,255,255,0) 42deg, rgba(255,255,255,0) 186deg, rgba(255,244,220,0.14) 204deg, rgba(255,255,255,0) 232deg)",
    maskImage: "radial-gradient(circle, transparent 0 37%, #000 39%)",
  });
  const spinner = div("", rec, { position: "absolute", inset: "0", transformOrigin: "470px 470px" });
  const label = div("", spinner, {
    position: "absolute", left: "300px", top: "300px", width: "340px", height: "340px", borderRadius: "50%",
    background: "#efe6d4", boxShadow: "0 0 0 2px #a9853f inset",
  });
  const art = el("img", "", label, { position: "absolute", left: "51px", top: "51px", width: "238px", height: "238px", borderRadius: "50%", objectFit: "cover" });
  art.crossOrigin = "anonymous";
  s.ready = new Promise((res) => {
    art.onload = () => res();
    art.onerror = () => res();
  });
  art.src = ctx.shelf.playlists[0].cover;
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 340 340");
  Object.assign(svg.style, { position: "absolute", inset: "0", width: "340px", height: "340px" });
  svg.innerHTML = `<defs><path id="rim" d="M170,170 m-142,0 a142,142 0 1,1 284,0 a142,142 0 1,1 -284,0"/></defs>
    <circle cx="170" cy="170" r="121" fill="none" stroke="#a9853f" stroke-width="2"/>
    <text font-family="Manrope" font-weight="800" font-size="15" letter-spacing="4.2" fill="#1c1611"><textPath href="#rim">SPINDLSHARE ✦ SIDE A ✦ 33⅓ RPM ✦ EVERYTHING YOU'VE GOT ✦</textPath></text>`;
  label.appendChild(svg);
  div("", label, { position: "absolute", left: "159px", top: "159px", width: "22px", height: "22px", borderRadius: "50%", background: "#0b0a09" });

  // The headline.
  const lines = [];
  const lineAt = (text, top, masked) => {
    const box = div("", s.fg, { position: "absolute", left: "150px", top: `${top}px`, width: "1500px", height: "230px", overflow: masked ? "hidden" : "visible" });
    const k = kernedLine(box, text, "display", { fontSize: "198px", left: "0px", top: "8px" });
    lines.push(k);
    return k;
  };
  const l1 = lineAt("Everything", 170, true);
  const l2 = lineAt("you've got", 362, true);
  const l3 = lineAt("spinning.", 554, false);
  const sub = div("", s.fg, { position: "absolute", left: "156px", top: "832px", fontSize: "36px", fontWeight: "500", color: "rgba(243,237,227,0.74)" });
  sub.textContent = "One link for every playlist you've made.";

  s.init = () => {
    lines.forEach((k) => k.split());
    for (const g of l3.letters) {
      g.el.style.background = GOLD;
      g.el.style.webkitBackgroundClip = "text";
      g.el.style.backgroundClip = "text";
      g.el.style.color = "transparent";
      g.el.style.transformOrigin = "50% 60%";
    }
  };

  // Where each letter of "spinning." sits on the record before it flies.
  const RING = 208;
  const RING_SCALE = 0.3;

  s.render = (t) => {
    const theta = labelAngle(t);
    const beat = pulse(t, [0, 1, 2, 3, 4, 5, 6, 7].map((k) => start + k * 0.5), 10);
    tf(spinner, { r: theta });
    const zoom = lerp(1, 150, E.inExpo(tw(t, at(4, 4.2), at(5) - 0.01, E.linear)));
    const recScale = (1 + 0.012 * beat) * move(t, start, start + 1.2, 0.92, 1, E.outCubic);
    tf(rec, { s: recScale, origin: "470px 470px" });
    for (const layer of [s.bg, s.fg]) {
      layer.style.transformOrigin = `${CX}px ${CY}px`;
      layer.style.transform = zoom > 1.0001 ? `scale(${zoom.toFixed(4)})` : "";
    }

    // Lines one and two rise out of their masks, a letter at a time.
    [[l1, start], [l2, start + 0.5]].forEach(([k, t0]) => {
      k.letters.forEach((g, i) => {
        const u = tw(t, t0 + i * 0.022, t0 + i * 0.022 + 0.75, E.outExpo);
        tf(g.el, { y: (1 - u) * 230, r: (1 - u) * 6 });
      });
    });

    // "spinning.": printed on the ring until the beat, then off the record and into the line.
    const lineX = 150;
    const lineY = 554 + 8;
    const jitter = tw(t, at(4, 3), at(5), E.inQuad);
    l3.letters.forEach((g, i) => {
      const n = l3.letters.length;
      const arcStep = (g.w * RING_SCALE + 3) / RING;
      const offset = (i - (n - 1) / 2) * arcStep;
      const phiAt = (tt) => ((labelAngle(tt) - 118) * Math.PI) / 180 + offset;
      const d0 = start + 1.0 + i * 0.045;
      const u = tw(t, d0, d0 + 0.78, E.inOutCubic);
      const phi = phiAt(Math.min(t, d0));
      const rx = CX + Math.cos(phi) * RING - g.w / 2;
      const ry = CY + Math.sin(phi) * RING - 100;
      const fx = lineX + g.x;
      const fy = lineY;
      // A curved flight: out from the record first, then across.
      const cx = lerp(rx, fx, 0.35) + 60;
      const cy = Math.min(ry, fy) - 220;
      const bx = (1 - u) ** 2 * rx + 2 * (1 - u) * u * cx + u * u * fx;
      const by = (1 - u) ** 2 * ry + 2 * (1 - u) * u * cy + u * u * fy;
      const rot0 = (phi * 180) / Math.PI + 90;
      const rot = lerp(rot0 - 360 * Math.round(rot0 / 360), 0, E.outCubic(u));
      const sc = lerp(RING_SCALE, 1, E.outBackSoft(clamp(u)));
      const jx = noise1(t * 30, i + 3) * 4 * jitter;
      const jy = noise1(t * 30, i + 11) * 4 * jitter;
      g.el.style.left = "0px";
      tf(g.el, { x: bx - lineX + jx, y: by - lineY + jy, r: rot, s: sc, o: tw(t, start + 0.2, start + 0.6, E.outCubic) });
    });

    tf(sub, { y: move(t, start + 2.0, start + 2.7, 40, 0), o: tw(t, start + 2.0, start + 2.6, E.outCubic) });
    const tremble = jitter * 3;
    tf(lines[0].line, { x: noise1(t * 24, 1) * tremble, y: noise1(t * 24, 2) * tremble });
    tf(lines[1].line, { x: noise1(t * 24, 3) * tremble, y: noise1(t * 24, 4) * tremble });
  };
  return s;
}
