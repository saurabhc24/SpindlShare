/* 0:40 Tap a song, hear it. The cover lands as the label of the real turntable;
   a row is tapped, the arm swings in and drops on the downbeat, and the build
   spins the platter up until a ruby iris opens out of the label into the drop. */

import { SCENES, at } from "../score.mjs";
import { base } from "./base.mjs";
import { div, el, tf, kernedLine, icons } from "../lib/dom.mjs";
import { E, tw, move, lerp, kf, pulse } from "../lib/anim.mjs";
import { PLATTER_C, REST_Y, LABEL_HALF, RPM_33 } from "../lib/deck3d.mjs";

const P = [PLATTER_C.x, PLATTER_C.y, PLATTER_C.z];
const RUBY = "#c3192f";
const TAP = at(21, 3);
const LABEL = [P[0], REST_Y + LABEL_HALF, P[2]];

/** Turns of the platter so far, in units of 33⅓ rpm seconds: still, spinning up, steady, then racing. */
function turns(t) {
  if (t <= TAP) return 0;
  const u = Math.min(1, t - TAP);
  let f = u ** 3 - u ** 4 / 2;
  if (t <= TAP + 1) return f;
  f += Math.min(t, at(24)) - (TAP + 1);
  if (t <= at(24)) return f;
  const v = Math.min(1, (t - at(24)) / 1.9);
  f += (t - at(24)) + 9 * 1.9 * (v ** 4) / 4;
  if (t > at(24) + 1.9) f += 9 * (t - at(24) - 1.9);
  return f;
}

/** Which song is playing: the tapped row, then one per beat into the build, then one per eighth. */
function playing(t) {
  if (t < TAP) return -1;
  if (t < at(23)) return 1;
  if (t < at(24)) return (2 + Math.floor((t - at(23)) / 0.5)) % 6;
  return (Math.floor((t - at(24)) / 0.25) + 3) % 6;
}

function orbit(target, r, el, az, fov) {
  return {
    pos: [target[0] + r * Math.cos(el) * Math.sin(az), target[1] + r * Math.sin(el), target[2] + r * Math.cos(el) * Math.cos(az)],
    target, fov,
  };
}

export default function player(ctx) {
  const s = base(ctx, SCENES.player, { lead: 0.6 });
  const [start, end] = SCENES.player;
  const { deck, shelf } = ctx;
  const songs = shelf.songs;

  div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(60% 75% at 30% 55%, rgba(231,197,122,0.10), rgba(0,0,0,0) 70%), #0e0b09" });

  const cam = (t) => {
    const close = { pos: [P[0] + 0.26, 2.15, P[2] + 1.05], target: [P[0], 0, P[2]], fov: 26, roll: 0.25 };
    const az = lerp(-0.34, -0.22, tw(t, start + 1, at(24), E.inOutSine));
    const frame = { ...orbit([1.62, -0.2, 0.05], 8.0, 0.8, az, 27), roll: 0 };
    const out = E.inOutCubic(tw(t, start, start + 1.3, E.linear));
    const push = E.inCubic(tw(t, at(24), end, E.linear));
    const near = { pos: [P[0] + 0.5, 1.6, P[2] + 1.3], target: LABEL, fov: 24, roll: -0.6 };
    const mix = (a, b, u) => ({
      pos: a.pos.map((v, i) => lerp(v, b.pos[i], u)), target: a.target.map((v, i) => lerp(v, b.target[i], u)),
      fov: lerp(a.fov, b.fov, u), roll: lerp(a.roll, b.roll, u),
    });
    return mix(mix(close, frame, out), near, push);
  };

  const heading = [
    { text: "Tap a song.", top: 118, at: start },
    { text: "Hear it.", top: 252, at: start + 0.5 },
  ].map((h) => {
    const box = div("", s.fg, { position: "absolute", left: "1060px", top: `${h.top}px`, width: "820px", height: "150px", overflow: "hidden" });
    return { ...h, box, k: kernedLine(box, h.text, "display", { fontSize: "132px", left: "0", top: "6px" }) };
  });

  // The play bar and the rows, as the profile's player draws them.
  const bar = div("", s.fg, { position: "absolute", left: "1060px", top: "424px", width: "760px", height: "112px", borderRadius: "24px", background: "#17120e", border: "1px solid rgba(231,197,122,0.28)" });
  const btn = div("", bar, { position: "absolute", left: "22px", top: "20px", width: "72px", height: "72px", borderRadius: "50%", background: "linear-gradient(180deg, #f3dca3, #d8b36a)", color: "#15100b", display: "grid", placeItems: "center" });
  const btnIcon = div("", btn, { width: "24px", height: "26px", marginLeft: "4px" });
  const barTitle = div("", bar, { position: "absolute", left: "118px", top: "24px", fontSize: "27px", fontWeight: "700", whiteSpace: "nowrap" });
  const barMeta = div("", bar, { position: "absolute", left: "118px", top: "62px", fontSize: "19px", fontWeight: "500", color: "rgba(243,237,227,0.66)", whiteSpace: "nowrap" });
  const barEq = div("", bar, { position: "absolute", right: "30px", top: "32px", width: "150px", height: "48px" });
  const eqBars = Array.from({ length: 12 }, (_, k) => div("", barEq, { position: "absolute", left: `${k * 13}px`, bottom: "0", width: "8px", borderRadius: "4px", background: "#e7c57a" }));

  const rows = songs.slice(0, 5).map((sg, i) => {
    const r = div("", s.fg, { position: "absolute", left: "1060px", top: `${566 + i * 88}px`, width: "760px", height: "84px", borderBottom: "1px solid rgba(243,237,227,0.1)", borderRadius: "12px" });
    const num = div("", r, { position: "absolute", left: "18px", top: "24px", width: "26px", textAlign: "right", fontSize: "21px", color: "rgba(243,237,227,0.55)" });
    num.textContent = String(i + 1);
    const eq = div("", r, { position: "absolute", left: "18px", top: "26px", width: "26px", height: "30px", opacity: "0" });
    const bars = [0, 1, 2].map((k) => div("", eq, { position: "absolute", left: `${k * 10}px`, bottom: "0", width: "6px", borderRadius: "3px", background: "#e7c57a" }));
    div("", r, { position: "absolute", left: "66px", top: "12px", fontSize: "26px", fontWeight: "700", whiteSpace: "nowrap" }).textContent = sg.title;
    div("", r, { position: "absolute", left: "66px", top: "48px", fontSize: "19px", fontWeight: "500", color: "rgba(243,237,227,0.58)", whiteSpace: "nowrap" }).textContent = sg.artist;
    div("", r, { position: "absolute", right: "18px", top: "28px", fontSize: "20px", color: "rgba(243,237,227,0.55)", fontVariantNumeric: "tabular-nums" }).textContent = sg.time;
    return { r, num, eq, bars };
  });
  const ripple = div("", s.fg, { position: "absolute", width: "60px", height: "60px", borderRadius: "50%", border: "3px solid rgba(243,237,227,0.9)", opacity: "0" });

  // What plays, for whom.
  const tags = [
    { at: at(22, 2), icon: icons.spotify, color: "#1ed760", text: "Spotify · 30-second previews" },
    { at: at(22, 3), icon: icons.youtube, color: "#ff3d3d", text: "YouTube Music · whole songs" },
  ].map((g, i) => {
    const n = div("", s.fg, {
      position: "absolute", left: `${140 + i * 470}px`, top: "968px", padding: "16px 24px", borderRadius: "999px",
      background: "rgba(243,237,227,0.07)", border: "1px solid rgba(243,237,227,0.14)", display: "flex", alignItems: "center", gap: "12px",
      fontSize: "22px", fontWeight: "700", whiteSpace: "nowrap",
    });
    const ic = el("span", "", n, { display: "inline-block", width: "26px", height: "26px", color: g.color });
    ic.innerHTML = g.icon;
    el("span", "", n).textContent = g.text;
    return { ...g, n };
  });

  const iris = div("", s.fg, { position: "absolute", inset: "0", background: RUBY, clipPath: "circle(0px at 50% 50%)" });

  s.init = () => {
    heading.forEach((h) => h.k.split());
    // Where the label sits on screen as the scene opens: the last scene's cover lands on it.
    deck.place(cam(start));
    const c = deck.project(LABEL);
    const e1 = deck.project([LABEL[0] + 0.37, LABEL[1], LABEL[2]]);
    const e2 = deck.project([LABEL[0], LABEL[1], LABEL[2] + 0.37]);
    ctx.labelTarget = { x: c.x, y: c.y, r: (Math.hypot(e1.x - c.x, e1.y - c.y) + Math.hypot(e2.x - c.x, e2.y - c.y)) / 2 };
  };

  s.render = (t) => {
    s.bg.style.opacity = String(tw(t, start - 0.6, start - 0.1, E.linear));
    const now = playing(t);
    const armAngle = t < TAP ? 0 : deck.armPlay * E.inOutCubic(tw(t, TAP, TAP + 0.88, E.linear));
    const armLift = t < TAP ? 0 : kf(t, [[TAP, 0], [TAP + 0.12, 0.11, E.outCubic], [TAP + 0.88, 0.11], [TAP + 1.02, 0, E.inOutCubic]]);
    const song = now >= 0 ? songs[now] : null;
    const c = cam(t);
    ctx.useDeck({
      cam: c,
      spin: -RPM_33 * turns(t) - 0.9,
      armAngle,
      armLift,
      changer: false,
      records: [{ i: 0, platter: true, pos: [0, REST_Y, 0], label: song ? { title: song.title, meta: song.artist } : undefined }],
      exposure: 1.05 + 0.35 * E.inQuad(tw(t, at(24), end, E.linear)),
    });

    const fadeOut = tw(t, at(24, 2.5), at(24, 4), E.inCubic);
    heading.forEach((h) => {
      h.k.letters.forEach((g, i) => tf(g.el, { y: (1 - tw(t, h.at + i * 0.02, h.at + i * 0.02 + 0.6, E.outExpo)) * 160 }));
      tf(h.box, { o: 1 - fadeOut });
    });

    // Rows cascade in, then the tapped one lights up; the playing row moves with the song.
    const f = Math.min(ctx.env.bands.length - 1, Math.max(0, Math.floor(t * 60)));
    const bands = ctx.env.bands[f];
    rows.forEach((row, i) => {
      const inU = tw(t, start + 0.6 + i * 0.07, start + 1.2 + i * 0.07, E.outExpo);
      const on = now === i;
      tf(row.r, { x: (1 - inU) * 80, o: inU * (1 - fadeOut) });
      row.r.style.background = on ? "rgba(231,197,122,0.12)" : "transparent";
      row.num.style.opacity = on ? "0" : "1";
      row.eq.style.opacity = on ? "1" : "0";
      if (on) row.bars.forEach((b, k) => (b.style.height = `${(8 + 22 * bands[3 + k * 6]).toFixed(1)}px`));
    });
    tf(bar, { y: move(t, start + 0.5, start + 1.1, 40, 0), o: tw(t, start + 0.5, start + 1.0, E.outCubic) * (1 - fadeOut) });
    barTitle.textContent = song ? song.title : "Tap a song to play";
    barMeta.textContent = song ? song.artist : "30-second previews";
    btnIcon.innerHTML = song ? icons.pause : icons.play;
    eqBars.forEach((b, k) => (b.style.height = `${(song ? 6 + 42 * bands[2 + k] : 4).toFixed(1)}px`));
    tags.forEach((g) => tf(g.n, { y: move(t, g.at, g.at + 0.5, 40, 0), o: tw(t, g.at, g.at + 0.4, E.outCubic) * (1 - fadeOut) }));

    // The tap.
    const rp = tw(t, TAP, TAP + 0.55, E.outCubic);
    ripple.style.left = `${1060 + 36 - 30}px`;
    ripple.style.top = `${566 + 88 + 42 - 30}px`;
    tf(ripple, { s: 1 + rp * 5, o: t >= TAP ? (1 - rp) * 0.9 : 0 });

    // Out through the label: a ruby iris opens from its centre into the drop.
    const kick = pulse(t, ctx.env.events.snare, 14);
    const open = E.inExpo(tw(t, at(24, 3.6), end, E.linear));
    if (open > 0) {
      const lc = deck.project(LABEL);
      iris.style.clipPath = `circle(${(open * 2300).toFixed(1)}px at ${lc.x.toFixed(1)}px ${lc.y.toFixed(1)}px)`;
    } else {
      iris.style.clipPath = "circle(0px at 50% 50%)";
    }
    tf(s.fg, { s: 1 + 0.006 * kick * tw(t, at(23), at(24), E.linear) });
  };
  return s;
}
