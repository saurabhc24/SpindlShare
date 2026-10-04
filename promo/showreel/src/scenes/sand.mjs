/* 0:48 The final drop. Sand on a vibrating plate jumps to a new figure on every
   bar; the pitch lands, then the liner notes run past one beat each. */

import { SCENES, at, TAPE_STOP, TAPE_STOP_LEN } from "../score.mjs";
import { base } from "./base.mjs";
import { div, tf, kernedLine } from "../lib/dom.mjs";
import { E, tw, pulse } from "../lib/anim.mjs";
import { createSand } from "../lib/sand.mjs";

const NOTES = [
  ["Works with", "Spotify & YouTube Music."],
  ["Setup", "Paste a link."],
  ["Each playlist", "Cover, name, 100 songs."],
  ["Playback", "Tap and it plays."],
  ["Layouts", "Stacked or arc."],
  ["For visitors", "Nothing to install."],
  ["Accounts to connect", "None."],
  ["Price", "Free."],
];

export default function sand(ctx) {
  const s = base(ctx, SCENES.sand, { lead: 0.5 });
  const [start, end] = SCENES.sand;
  const kicks = ctx.env.events.kick;

  div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(90% 90% at 50% 45%, #cf2037 0%, #c3192f 55%, #a5121f 100%)" });

  // One plate, shared with the end card, where it becomes the footer's band.
  const plate = createSand(ctx.layers.gl, {
    from: start - 0.5,
    modeAt: (t) => (t < start ? { index: 0, changedAt: -99 } : { index: 1 + Math.floor((t - start) / 2), changedAt: start + 2 * Math.floor((t - start) / 2) }),
    rate: (t) => (t < TAPE_STOP ? 1 : t > TAPE_STOP + TAPE_STOP_LEN ? 0 : (1 - (t - TAPE_STOP) / TAPE_STOP_LEN) ** 1.8),
    hum: (t) => 0.012 * pulse(t, kicks, 11),
  });
  ctx.sand = plate;
  s.extra.push(plate.canvas);

  const lines = [
    { text: "Your shelf", top: 150, at: start },
    { text: "is one", top: 350, at: start + 0.5 },
    { text: "link away.", top: 550, at: start + 1 },
  ].map((l) => {
    const box = div("", s.fg, { position: "absolute", left: "140px", top: `${l.top}px`, width: "1500px", height: "220px", overflow: "hidden" });
    return { ...l, box, k: kernedLine(box, l.text, "display", { fontSize: "206px", left: "0", top: "6px" }) };
  });

  const notes = NOTES.map(([term, detail], i) => {
    const t0 = at(27) + i * 0.5;
    const box = div("", s.fg, { position: "absolute", left: "140px", top: "380px", width: "1700px", height: "330px" });
    const idx = div("mono", box, { position: "absolute", left: "4px", top: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "0.2em", color: "rgba(243,237,227,0.7)" });
    idx.textContent = `${String(i + 1).padStart(2, "0")} / ${String(NOTES.length).padStart(2, "0")}`;
    const termBox = div("", box, { position: "absolute", left: "4px", top: "50px", height: "40px", overflow: "hidden" });
    const termEl = div("tag", termBox, { fontSize: "26px", color: "#f3ede3" });
    termEl.textContent = term;
    const detBox = div("", box, { position: "absolute", left: "0", top: "100px", width: "1700px", height: "170px", overflow: "hidden" });
    const det = div("display", detBox, { fontSize: "122px", whiteSpace: "nowrap" });
    det.textContent = detail;
    return { t0, box, termEl, det };
  });
  // Eight ticks that fill as the notes pass.
  const ticks = NOTES.map((_, i) => div("", s.fg, { position: "absolute", left: `${144 + i * 34}px`, top: "760px", width: "24px", height: "5px", borderRadius: "3px", background: "#f3ede3" }));

  s.init = () => lines.forEach((l) => l.k.split());

  s.render = (t) => {
    plate.draw(t);
    // The iris out of the label is solid ruby; the sand cuts in with the drop itself.
    plate.canvas.style.visibility = t < start ? "hidden" : "visible";
    // The end card narrows the plate to a band; here it is the whole frame.
    plate.canvas.style.maskImage = plate.canvas.style.webkitMaskImage = "none";
    const beat = pulse(t, kicks, 9);
    plate.material.uniforms.uOpacity.value = 0.52 + 0.14 * beat;
    s.bg.style.opacity = String(tw(t, start - 0.5, start - 0.05, E.linear));

    lines.forEach((l) => {
      l.k.letters.forEach((g, i) => {
        const inU = tw(t, l.at + i * 0.02, l.at + i * 0.02 + 0.6, E.outExpo);
        const outU = tw(t, at(26, 3.7) + i * 0.012, at(26, 3.7) + i * 0.012 + 0.35, E.inCubic);
        tf(g.el, { y: (1 - inU) * 220 - outU * 240 });
      });
    });

    notes.forEach((nt, i) => {
      const last = i === notes.length - 1;
      const inU = tw(t, nt.t0, nt.t0 + 0.2, E.outExpo);
      const outU = last ? tw(t, end - 0.15, end, E.inCubic) : tw(t, nt.t0 + 0.5, nt.t0 + 0.62, E.inCubic);
      const on = t >= nt.t0 && (last || t < nt.t0 + 0.62);
      nt.box.style.display = on ? "" : "none";
      tf(nt.det, { y: (1 - inU) * 170 - outU * 170 });
      tf(nt.termEl, { y: (1 - inU) * 40 - outU * 40 });
    });
    ticks.forEach((tk, i) => {
      const lit = t >= at(27) + i * 0.5;
      tf(tk, { o: t < at(27) - 0.1 || t > end ? 0 : lit ? 1 : 0.28 });
    });
  };
  return s;
}
