/* 0:28 A shelf, not a list. The real deck's geometry, one card per beat round the
   back; the layout switch morphs every cover from the stack onto the arc; a tap
   lifts one out of the phone, and it spins off to become the next record's label. */

import { SCENES, at } from "../score.mjs";
import { base } from "./base.mjs";
import { div, el, tf, kernedLine, icons } from "../lib/dom.mjs";
import { E, tw, move, lerp, clamp, pulse, spring } from "../lib/anim.mjs";

const BONE = "#f3ede3";
const PHONE = { cx: 1330, cy: 540, w: 392, h: 852, bezel: 14 };
const SCREEN = { x: PHONE.cx - PHONE.w / 2, y: PHONE.cy - PHONE.h / 2 };
const K = PHONE.w / 412;

/** The deck at a depth, measured off the live page at 412px and scaled to this screen. */
function deckPose(d) {
  return {
    x: K * (16 + 46.5 * d - 0.95 * d * d),
    y: K * (503 - 42.6 * d + 0.8 * d * d) - 22,
    size: K * 194 * 0.977 ** d,
    r: 0,
  };
}

/** The arc: covers riding a circle whose centre sits far off to the left. */
function arcPose(j) {
  const R = 1300;
  const phi = j * 0.1346;
  const cx = 140 - R * (1 - Math.cos(phi));
  const cy = 458 + R * Math.sin(phi);
  const size = 156;
  return { x: K * (cx - size / 2), y: K * (cy - size / 2) - 22, size: K * size, r: (phi * 180) / Math.PI };
}

const wrap = (x, n) => ((x % n) + n) % n;
const ADVANCES = [0, 0.5, 1, 1.5, 2, 2.5].map((b) => at(15, 3) + b);
const SCROLLS = Array.from({ length: 8 }, (_, k) => at(17, 3) + k * 0.5);
const MORPH = at(17);
const TAP = at(19, 3);

export default function shelf(ctx) {
  const s = base(ctx, SCENES.shelf, { tail: 0 });
  const [start, end] = SCENES.shelf;
  const { shelf: data } = ctx;
  const n = data.playlists.length;

  div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(75% 85% at 70% 50%, #3549f0 0%, #2b3fe0 55%, #2233c4 100%)" });
  const svgNS = "http://www.w3.org/2000/svg";
  const rings = document.createElementNS(svgNS, "svg");
  rings.setAttribute("viewBox", "0 0 1920 1080");
  Object.assign(rings.style, { position: "absolute", inset: "0", width: "1920px", height: "1080px" });
  s.bg.appendChild(rings);
  const circles = Array.from({ length: 44 }, () => {
    const c = document.createElementNS(svgNS, "circle");
    c.setAttribute("cx", PHONE.cx);
    c.setAttribute("cy", PHONE.cy);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "#0d1a8a");
    c.setAttribute("stroke-width", "1.8");
    rings.appendChild(c);
    return c;
  });

  // The copy on the left.
  const lines = [
    { text: "A shelf,", top: 250, at: start },
    { text: "not a list.", top: 410, at: start + 0.5 },
  ].map((l) => {
    const box = div("", s.fg, { position: "absolute", left: "140px", top: `${l.top}px`, width: "900px", height: "170px", overflow: "hidden" });
    return { ...l, box, k: kernedLine(box, l.text, "display", { fontSize: "156px", left: "0", top: "8px" }) };
  });
  const sub = div("", s.fg, { position: "absolute", left: "146px", top: "618px", width: "760px", fontSize: "32px", fontWeight: "500", lineHeight: "1.4", color: "rgba(243,237,227,0.8)" });
  sub.textContent = "Visitors flick through your playlists the way they'd dig through records.";
  const sw = div("", s.fg, { position: "absolute", left: "146px", top: "760px", width: "316px", height: "72px", borderRadius: "36px", background: "rgba(8,12,70,0.4)", border: "1px solid rgba(255,255,255,0.2)" });
  const knob = div("", sw, { position: "absolute", left: "6px", top: "6px", width: "150px", height: "58px", borderRadius: "29px", background: BONE });
  const swLabels = ["Stacked", "Arc"].map((t, i) => {
    const n = div("", sw, { position: "absolute", left: `${6 + i * 154}px`, top: "6px", width: "150px", height: "58px", display: "grid", placeItems: "center", fontSize: "25px", fontWeight: "800" });
    n.textContent = t;
    return n;
  });
  const notes = ["A deck you flick through, one sleeve at a time.", "The whole shelf fanned out along a curve."].map((t) => {
    const n = div("", s.fg, { position: "absolute", left: "150px", top: "856px", fontSize: "25px", fontWeight: "500", color: "rgba(243,237,227,0.72)" });
    n.textContent = t;
    return n;
  });

  // The phone.
  const tilt = div("", s.fg, { position: "absolute", inset: "0", perspective: "1800px", perspectiveOrigin: `${PHONE.cx}px ${PHONE.cy}px` });
  const phone = div("", tilt, {
    position: "absolute", left: `${SCREEN.x - PHONE.bezel}px`, top: `${SCREEN.y - PHONE.bezel}px`,
    width: `${PHONE.w + PHONE.bezel * 2}px`, height: `${PHONE.h + PHONE.bezel * 2}px`, borderRadius: "66px",
    background: "linear-gradient(145deg, #3a3633, #121110 40%, #0b0a09)", boxShadow: "0 60px 120px rgba(6,10,60,0.55), inset 0 0 0 2px rgba(255,255,255,0.1)",
    transformOrigin: "50% 50%",
  });
  const screen = div("", phone, {
    position: "absolute", left: `${PHONE.bezel}px`, top: `${PHONE.bezel}px`, width: `${PHONE.w}px`, height: `${PHONE.h}px`,
    borderRadius: "52px", overflow: "hidden", background: "radial-gradient(90% 60% at 50% 0%, #1c1612, #0b0907 70%)",
  });
  const status = div("", screen, { position: "absolute", left: "0", top: "0", width: "100%", height: "54px", fontSize: "17px", fontWeight: "700" });
  div("", status, { position: "absolute", left: "34px", top: "17px" }).textContent = "9:41";
  div("", status, { position: "absolute", left: "136px", top: "12px", width: "120px", height: "34px", borderRadius: "17px", background: "#000" });
  div("", status, { position: "absolute", right: "30px", top: "20px", width: "27px", height: "13px", borderRadius: "4px", border: "1.5px solid rgba(243,237,227,0.8)" });
  // The profile's own header and footer.
  const header = div("", screen, { position: "absolute", left: "0", top: "62px", width: "100%", height: "70px" });
  div("", header, { position: "absolute", left: "22px", top: "8px", width: "46px", height: "46px", borderRadius: "50%", background: "#5b3fd6", display: "grid", placeItems: "center", fontSize: "22px", fontWeight: "700" }).textContent = "S";
  div("", header, { position: "absolute", left: "80px", top: "6px", fontSize: "20px", fontWeight: "600" }).textContent = data.user;
  div("", header, { position: "absolute", left: "80px", top: "33px", fontSize: "15px", fontWeight: "500", color: "rgba(243,237,227,0.66)" }).textContent =
    `${n} playlists · ${data.playlists.reduce((a, p) => a + p.songs, 0)} tracks`;
  div("", header, { position: "absolute", right: "20px", top: "6px", padding: "11px 18px", borderRadius: "12px", background: "linear-gradient(180deg, #f3dca3, #d8b36a)", color: "#1a1410", fontSize: "17px", fontWeight: "700" }).textContent = "Share";
  const footer = div("", screen, { position: "absolute", left: "0", bottom: "22px", width: "100%", textAlign: "center" });
  div("", footer, { fontSize: "14px", color: "rgba(243,237,227,0.45)" }).textContent = `spindlshare.com/${data.user}`;
  div("wordmark", footer, { fontSize: "22px", marginTop: "6px" }).textContent = "SpindlShare";

  const deckArea = div("", screen, { position: "absolute", inset: "0" });
  const cards = data.playlists.map((p) => {
    const c = div("", deckArea, { position: "absolute", left: "0", top: "0", borderRadius: "10px", overflow: "hidden", boxShadow: "0 12px 30px rgba(0,0,0,0.5)", transformOrigin: "0 0", background: "#111" });
    const im = el("img", "", c, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover", transform: p.letterboxed ? "scale(1.36)" : "none" });
    im.crossOrigin = "anonymous";
    im.src = p.cover;
    div("", c, { position: "absolute", inset: "0", background: "linear-gradient(200deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 32%, rgba(0,0,0,0) 55%)" });
    const label = div("", c, { position: "absolute", right: "10px", top: "9px", fontSize: "13.5px", fontWeight: "800", letterSpacing: "0.02em", textTransform: "uppercase", textShadow: "0 1px 4px rgba(0,0,0,0.85)", whiteSpace: "nowrap" });
    label.textContent = p.title;
    return { c, im, p };
  });
  // The arc's detail panel.
  const detail = div("", screen, { position: "absolute", left: `${K * 244}px`, top: `${K * 418 - 22}px`, height: "80px", borderLeft: "3px solid #e7c57a", paddingLeft: "14px" });
  const dTitle = div("", detail, { fontSize: "19px", fontWeight: "700", whiteSpace: "nowrap" });
  const dMeta = div("", detail, { fontSize: "14px", marginTop: "4px", color: "rgba(243,237,227,0.7)" });
  const dIcon = div("", detail, { width: "20px", height: "20px", marginTop: "8px", color: "#1ed760" });
  const ripple = div("", screen, { position: "absolute", left: "0", top: "0", width: "40px", height: "40px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.9)", opacity: "0" });

  // The cover that leaves the phone.
  const flyer = div("", s.fg, { position: "absolute", left: "0", top: "0", width: "600px", height: "600px", overflow: "hidden", transformOrigin: "0 0", boxShadow: "0 40px 90px rgba(0,0,0,0.5)" });
  const flyImg = el("img", "", flyer, { position: "absolute", inset: "0", width: "100%", height: "100%", objectFit: "cover" });
  flyImg.crossOrigin = "anonymous";
  flyImg.src = data.playlists[0].cover;
  const flyHole = div("", flyer, { position: "absolute", left: "50%", top: "50%", width: "40px", height: "40px", margin: "-20px 0 0 -20px", borderRadius: "50%", background: "#0b0a09", opacity: "0" });

  s.ready = Promise.all(cards.map(({ im }) => new Promise((res) => (im.complete ? res() : ((im.onload = res), (im.onerror = res))))));
  s.init = () => lines.forEach((l) => l.k.split());

  /** Where the deck is, in cards advanced: starting two in, so the last advance brings the first playlist round. */
  const deckPos = (t) => 2 + ADVANCES.reduce((a, t0) => a + E.inOutCubic(tw(t, t0, t0 + 0.44, E.linear)), 0);
  const arcSel = (t) => SCROLLS.reduce((a, t0) => a + E.inOutCubic(tw(t, t0, t0 + 0.4, E.linear)), 0);

  /** A card's stacked pose, including the trip round the back when it leaves the front. */
  function stacked(i, pos) {
    const raw = wrap(i - pos + 1, n) - 1;
    if (raw >= 0) {
      const p = deckPose(raw);
      return { ...p, z: 100 - Math.round(raw * 10), o: raw > 6.4 ? clamp(1 - (raw - 6.4) / 1.2) : 1 };
    }
    const u = -raw;
    const p0 = deckPose(0);
    const pb = deckPose(n - 1);
    const a = E.inOutCubic(clamp(u / 0.32));
    const xa = p0.x + 0.05 * p0.size * a;
    const ya = p0.y + 0.92 * p0.size * a;
    const sa = p0.size * (1 - 0.1 * a);
    if (u <= 0.32) return { x: xa, y: ya, size: sa, r: 0, z: 200, o: 1 };
    const v = E.inOutCubic((u - 0.32) / 0.68);
    const ax = p0.x + 0.05 * p0.size;
    const ay = p0.y + 0.92 * p0.size;
    const cx = pb.x + 260;
    const cy = (ay + pb.y) / 2 + 60;
    return {
      x: (1 - v) ** 2 * ax + 2 * (1 - v) * v * cx + v * v * pb.x,
      y: (1 - v) ** 2 * ay + 2 * (1 - v) * v * cy + v * v * pb.y,
      size: lerp(sa, pb.size, v),
      r: Math.sin(v * Math.PI) * 8,
      z: 1,
      o: 1,
    };
  }

  function arced(i, sel) {
    let j = wrap(i - sel + n / 2, n) - n / 2;
    const p = arcPose(j);
    const far = Math.abs(j);
    return { ...p, z: 100 - Math.round(far * 10), o: far > 1.6 ? clamp(1 - (far - 1.6) * 0.45) : 1, blur: far > 1.2 ? (far - 1.2) * 3.2 : 0 };
  }

  s.render = (t) => {
    const kick = pulse(t, ctx.env.events.kick, 7);
    circles.forEach((c, k) => {
      const r = ((k * 30 + (t - start) * 46) % (circles.length * 30)) + 120;
      c.setAttribute("r", r.toFixed(1));
      const fadeOut = clamp(1 - (r - 900) / 500);
      c.setAttribute("opacity", (0.55 * fadeOut * (0.75 + 0.5 * kick)).toFixed(3));
    });

    lines.forEach((l) => l.k.letters.forEach((g, i) => tf(g.el, { y: (1 - tw(t, l.at + i * 0.018, l.at + i * 0.018 + 0.65, E.outExpo)) * 180 })));
    const copyOut = tw(t, at(19), at(19, 1.8), E.inCubic);
    for (const l of lines) tf(l.box, { x: -copyOut * 120, o: 1 - copyOut });
    tf(sub, { y: move(t, start + 1.0, start + 1.7, 30, 0) - 0, x: -copyOut * 120, o: tw(t, start + 1.0, start + 1.6, E.outCubic) * (1 - copyOut) });
    tf(sw, { y: move(t, start + 1.5, start + 2.2, 30, 0), x: -copyOut * 120, o: tw(t, start + 1.5, start + 2.1, E.outCubic) * (1 - copyOut) });
    const toArc = spring(t, MORPH, 3, 0.55);
    tf(knob, { x: t < MORPH ? 0 : 154 * toArc });
    swLabels[0].style.color = t < MORPH + 0.1 ? "#2b3fe0" : BONE;
    swLabels[1].style.color = t < MORPH + 0.1 ? BONE : "#2b3fe0";
    tf(notes[0], { x: -copyOut * 120, o: tw(t, start + 1.8, start + 2.3, E.outCubic) * (1 - tw(t, MORPH, MORPH + 0.2, E.linear)) });
    tf(notes[1], { x: -copyOut * 120, o: tw(t, MORPH + 0.1, MORPH + 0.4, E.outCubic) * (1 - copyOut) });

    // The phone comes up with the scene, and turns toward us for the tap.
    const rise = tw(t, start - 0.05, start + 0.9, E.outExpo);
    const turn = tw(t, at(19), at(19, 2.6), E.inOutCubic) * (1 - tw(t, at(19, 4.2), at(20), E.inOutCubic));
    tf(phone, { y: (1 - rise) * 900, ry: -18 * turn, rx: 4 * turn, x: -150 * turn, s: 1 + 0.12 * turn });

    // Covers: stacked and advancing, then morphing onto the arc, then scrolling along it.
    const pos = deckPos(t);
    const sel = arcSel(t);
    const tapLift = spring(t, TAP, 3.2, 0.5);
    cards.forEach(({ c }, i) => {
      const a = stacked(i, pos);
      const b = arced(i, sel);
      const depth = wrap(i - Math.round(pos), n);
      const m = E.inOutCubic(tw(t, MORPH + depth * 0.035, MORPH + 0.72 + depth * 0.035, E.linear));
      let x = lerp(a.x, b.x, m);
      let y = lerp(a.y, b.y, m);
      let size = lerp(a.size, b.size, m);
      const r = lerp(a.r, b.r, m);
      const o = lerp(a.o, b.o, m);
      const isSel = i === 0 && t >= TAP;
      if (isSel) {
        const grow = 1 + 0.18 * tapLift;
        x -= (size * (grow - 1)) / 2;
        y -= (size * (grow - 1)) / 2;
        size *= grow;
      }
      c.style.width = `${size.toFixed(2)}px`;
      c.style.height = `${size.toFixed(2)}px`;
      c.style.zIndex = String(isSel ? 500 : m > 0.5 ? b.z : a.z);
      tf(c, { x, y, r, o: isSel && t >= at(20) ? 0 : o, blur: m > 0.01 ? (b.blur ?? 0) * m : 0 });
    });

    // The arc's details follow the selection.
    const cur = wrap(Math.round(sel), n);
    const p = data.playlists[cur];
    dTitle.textContent = p.title;
    dMeta.textContent = `${p.service} · ${p.songs} tracks`;
    dIcon.innerHTML = p.service === "Spotify" ? icons.spotify : icons.youtube;
    dIcon.style.color = p.service === "Spotify" ? "#1ed760" : "#ff3d3d";
    const frac = sel - Math.floor(sel);
    const moving = frac > 0.02 && frac < 0.98;
    tf(detail, { y: moving ? (frac < 0.5 ? -frac * 30 : (1 - frac) * 30) : 0, o: (moving ? 1 - Math.sin(frac * Math.PI) * 0.8 : 1) * tw(t, MORPH + 0.5, MORPH + 0.9, E.outCubic) * (1 - tw(t, TAP, TAP + 0.3, E.linear)) });

    // The tap.
    const sp = arcPose(0);
    const rp = tw(t, TAP, TAP + 0.55, E.outCubic);
    ripple.style.left = `${sp.x + sp.size / 2 - 20}px`;
    ripple.style.top = `${sp.y + sp.size / 2 - 20}px`;
    tf(ripple, { s: 1 + rp * 4, o: t >= TAP ? (1 - rp) * 0.9 : 0 });

    // The lifted cover leaves the phone and spins down into a record's label.
    const f0 = at(20);
    const target = ctx.labelTarget ?? { x: 700, y: 560, r: 150 };
    if (t >= f0 && t < end + 0.01) {
      const grow = 1 + 0.18;
      const sx = SCREEN.x + sp.x - (sp.size * (grow - 1)) / 2;
      const sy = SCREEN.y + sp.y - (sp.size * (grow - 1)) / 2;
      const ss = sp.size * grow;
      const u1 = tw(t, f0, f0 + 0.85, E.outExpo);
      const u2 = tw(t, at(20, 2.6), end, E.inOutCubic);
      const big = 820;
      let cx = lerp(sx + ss / 2, 960, u1);
      let cy = lerp(sy + ss / 2, 540, u1);
      let size = lerp(ss, big, u1);
      cx = lerp(cx, target.x, u2);
      cy = lerp(cy, target.y, u2);
      size = lerp(size, target.r * 2 * 0.7, u2);
      flyer.style.width = flyer.style.height = `${size.toFixed(1)}px`;
      flyer.style.borderRadius = `${lerp(10, size / 2, tw(t, f0, f0 + 0.6, E.outCubic)).toFixed(1)}px`;
      const spin = 280 * tw(t, f0, end, E.linear) ** 1.3;
      flyer.style.transformOrigin = `${size / 2}px ${size / 2}px`;
      tf(flyer, { x: cx - size / 2, y: cy - size / 2, r: -spin, o: 1 - tw(t, end - 0.12, end, E.linear) });
      flyHole.style.opacity = tw(t, f0 + 0.3, f0 + 0.7, E.linear).toFixed(3);
    } else {
      tf(flyer, { o: 0 });
    }
    tf(tilt, { o: 1 - tw(t, at(20, 1.4), at(20, 3), E.inCubic) });
    s.bg.style.opacity = String(1 - tw(t, at(20, 2.4), end, E.linear));
  };
  return s;
}
