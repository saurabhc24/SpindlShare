/* 0:56 The back cover. The sand settles into the footer's band, the wordmark drops
   in letter by letter, the pill is pressed, and then the power goes: everything
   sags with the tape stop, the needle lifts, and the reel ends on a still record. */

import { SCENES, at, TAPE_STOP, TAPE_STOP_LEN, NEEDLE_LIFT } from "../score.mjs";
import { base } from "./base.mjs";
import { div, el, tf, kernedLine } from "../lib/dom.mjs";
import { E, tw, move, lerp, spring, rng } from "../lib/anim.mjs";

export default function end(ctx) {
  const s = base(ctx, SCENES.end);
  const [start, stop] = SCENES.end;
  const stopEnd = TAPE_STOP + TAPE_STOP_LEN;

  div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(90% 90% at 50% 45%, #cf2037 0%, #c3192f 55%, #a5121f 100%)" });

  // The footer's giant wordmark, 2% in from each side, as on the site.
  const markBox = div("", s.fg, { position: "absolute", left: "0", top: "760px", width: "1920px", height: "320px" });
  const mark = kernedLine(markBox, "SpindlShare", "wordmark", { fontSize: "271px", lineHeight: "0.74", top: "40px", color: "#f3ede3" });

  const head = div("", s.fg, { position: "absolute", left: "140px", top: "150px", width: "1700px", height: "130px", overflow: "hidden" });
  const headLine = kernedLine(head, "Your shelf is one link away.", "display", { fontSize: "104px", left: "0", top: "8px" });
  const pill = div("", s.fg, {
    position: "absolute", left: "144px", top: "328px", padding: "26px 48px", borderRadius: "999px",
    background: "linear-gradient(180deg, #f3dca3, #d8b36a)", color: "#15100b", fontSize: "36px", fontWeight: "800",
    boxShadow: "0 18px 44px rgba(90,20,10,0.45), inset 0 1px 0 rgba(255,255,255,0.55)", transformOrigin: "50% 50%",
  });
  pill.textContent = "Claim your link";
  const site = div("", s.fg, { position: "absolute", left: "560px", top: "352px", fontSize: "40px", fontWeight: "700", color: "#f3ede3" });
  site.textContent = "spindlshare.com";
  const ring = div("", s.fg, { position: "absolute", width: "60px", height: "60px", borderRadius: "50%", border: "3px solid #fff5dc", opacity: "0" });
  const cursor = el("div", "", s.fg, { position: "absolute", left: "0", top: "0", width: "40px", height: "48px" });
  cursor.innerHTML = '<svg viewBox="0 0 20 24" width="40" height="48"><path d="M2 1.5v18.2l4.6-4.4 3 7 3.2-1.4-3-6.8h6.3z" fill="#15100b" stroke="#fff5dc" stroke-width="1.4" stroke-linejoin="round"/></svg>';

  // Power off, then the last card.
  const dark = div("", s.fg, { position: "absolute", inset: "0", background: "#050404", opacity: "0" });
  const card = div("", s.fg, { position: "absolute", inset: "0", opacity: "0" });
  const disc = div("", card, {
    position: "absolute", left: "900px", top: "360px", width: "120px", height: "120px", borderRadius: "50%",
    background: "repeating-radial-gradient(circle, #171513 0 1.5px, #0c0b0a 1.5px 3px)", boxShadow: "0 0 0 1px rgba(231,197,122,0.25)",
  });
  div("", disc, { position: "absolute", left: "38px", top: "38px", width: "44px", height: "44px", borderRadius: "50%", background: "#c3192f" });
  div("", disc, { position: "absolute", left: "38px", top: "56px", width: "20px", height: "8px", background: "#f3ede3", borderRadius: "2px" });
  div("", disc, { position: "absolute", left: "57px", top: "57px", width: "6px", height: "6px", borderRadius: "50%", background: "#0c0b0a" });
  const url = div("", card, { position: "absolute", left: "0", width: "1920px", top: "530px", textAlign: "center", fontSize: "40px", fontWeight: "700" });
  url.textContent = "spindlshare.com";
  const line = div("tag", card, { position: "absolute", left: "0", width: "1920px", top: "600px", textAlign: "center", fontSize: "17px", color: "rgba(243,237,227,0.6)" });
  line.textContent = "Everything you've got spinning.";

  const sag = [];
  const random = rng(31);

  s.init = () => {
    mark.split();
    headLine.split();
    // Centred with the 2% gap either side, from the letters' own measured width.
    mark.line.style.left = `${(1920 - mark.width) / 2}px`;
    mark.letters.forEach(() => sag.push({ y: 30 + random() * 50, r: (random() - 0.5) * 12 }));
  };

  if (ctx.sand) s.extra.push(ctx.sand.canvas);

  s.render = (t) => {
    if (ctx.sand) {
      ctx.sand.canvas.style.display = t < stopEnd + 0.3 ? "" : "none";
      ctx.sand.canvas.style.visibility = "visible";
      ctx.sand.draw(t);
      // The plate narrows to the footer's band, as the site ends.
      const band = tw(t, start, start + 1.2, E.inOutCubic);
      const edge = lerp(0, 58, band);
      ctx.sand.canvas.style.maskImage = band > 0 ? `linear-gradient(180deg, transparent ${edge.toFixed(1)}%, #000 ${(edge + 16).toFixed(1)}%)` : "none";
      ctx.sand.canvas.style.webkitMaskImage = ctx.sand.canvas.style.maskImage;
    }

    // Letters drop in on the eighth notes, and slump when the power goes.
    const power = tw(t, TAPE_STOP, stopEnd, E.inQuad);
    mark.letters.forEach((g, i) => {
      const t0 = start + i * 0.125;
      const drop = spring(t, t0, 2.4, 0.45);
      const y = t < t0 ? -700 : (1 - drop) * -700;
      tf(g.el, { y: y + sag[i].y * power, r: sag[i].r * power, o: t < t0 ? 0 : 1 });
    });

    headLine.letters.forEach((g, i) => tf(g.el, { y: (1 - tw(t, at(29, 4) + i * 0.012, at(29, 4) + i * 0.012 + 0.6, E.outExpo)) * 140 }));
    const press = t >= at(30, 3) ? 1 - 0.07 * Math.sin(Math.PI * Math.min(1, (t - at(30, 3)) / 0.18)) : 1;
    tf(pill, { s: t < at(30) ? 0 : spring(t, at(30), 3, 0.42) * press, o: t < at(30) ? 0 : 1 });
    tf(site, { x: move(t, at(30, 2), at(30, 2.8), -20, 0), o: tw(t, at(30, 2), at(30, 2.6), E.outCubic) });

    // The cursor comes in and presses the pill.
    const c = E.inOutCubic(tw(t, at(30, 1.6), at(30, 2.9), E.linear));
    const cx = lerp(1560, 330, c);
    const cy = lerp(920, 372, c) + Math.sin(c * Math.PI) * -80;
    tf(cursor, { x: cx, y: cy, s: t >= at(30, 3) && t < at(30, 3.4) ? 0.9 : 1, o: tw(t, at(30, 1.5), at(30, 1.9), E.linear) * (1 - tw(t, at(31), at(31, 1.5), E.linear)) });
    const rp = tw(t, at(30, 3), at(30, 3) + 0.6, E.outCubic);
    ring.style.left = "300px";
    ring.style.top = "342px";
    tf(ring, { s: 1 + rp * 3.5, o: t >= at(30, 3) ? 1 - rp : 0 });

    // The tape stops: the frame dims and drops away to black.
    const dim = 0.4 * power + tw(t, stopEnd - 0.05, stopEnd + 0.2, E.inCubic) * 0.6;
    dark.style.opacity = dim.toFixed(3);
    for (const n of [head, pill, site]) n.style.filter = power > 0.01 ? `saturate(${(1 - 0.6 * power).toFixed(2)})` : "none";

    // The last card: a small record that turns, and stops as the needle lifts.
    const cardIn = tw(t, stopEnd + 0.2, stopEnd + 0.6, E.outCubic);
    const cardOut = tw(t, stop - 0.7, stop - 0.05, E.inCubic);
    card.style.opacity = (cardIn * (1 - cardOut)).toFixed(3);
    const slow = tw(t, NEEDLE_LIFT, NEEDLE_LIFT + 1.1, E.outCubic);
    const angle = 200 * (Math.min(t, NEEDLE_LIFT) - stopEnd) + 200 * 1.1 * slow * 0.5;
    tf(disc, { r: angle, origin: "60px 60px" });
    tf(url, { y: move(t, stopEnd + 0.3, stopEnd + 0.9, 20, 0) });
  };
  return s;
}
