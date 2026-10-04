/* 0:24 The breakdown: three steps, set as record sleeves. The link lands on the
   first, a playlist types itself into the second, and on the scratch the records
   in all three rock back and forth with the sound. */

import { SCENES, at, scratchPosition, SCRATCH } from "../score.mjs";
import { base } from "./base.mjs";
import { div, el, tf, kernedLine, icons } from "../lib/dom.mjs";
import { E, tw, move, lerp, clamp, spring } from "../lib/anim.mjs";
import { createRecords } from "../lib/records.mjs";
import { PILL } from "./links.mjs";

const INK = "#15100b";
const BONE = "#f3ede3";
const SLEEVE = { w: 520, h: 580, top: 452, gap: 40, left: 140, r: 34, disc: 470 };
const xOf = (k) => SLEEVE.left + k * (SLEEVE.w + SLEEVE.gap);
const PASTED = "open.spotify.com/playlist/4X9STQs4rZQjXHLlhjVaNY";

export default function steps(ctx) {
  const s = base(ctx, SCENES.steps, { lead: 0.5 });
  const [start, end] = SCENES.steps;
  const t0 = start - 0.5;
  const { shelf } = ctx;

  const bg = div("", s.bg, { position: "absolute", inset: "0", background: "radial-gradient(70% 80% at 50% 30%, #1d1712 0%, #0e0b09 70%)" });

  // Live records for the three sleeves: a bone pressing for the name, then two real playlists.
  const recs = createRecords(ctx.layers.gl, {
    records: [
      { id: "name", title: "spindlshare.com/yourname", service: "", songs: null, cover: null, letterboxed: false, color: "#e9e1d3", labelColor: "#c3192f" },
      { id: "p0", title: shelf.playlists[0].title, service: "Spotify", songs: shelf.playlists[0].songs, cover: shelf.playlists[0].cover, letterboxed: false, color: "#f6b526" },
      { id: "p3", title: shelf.playlists[3].title, service: "Spotify", songs: shelf.playlists[3].songs, cover: shelf.playlists[3].cover, letterboxed: false, color: "#12a37f" },
    ],
  });
  s.extra.push(recs.canvas);
  s.ready = recs.ready;

  const head = div("", s.fg, { position: "absolute", left: `${SLEEVE.left}px`, top: "88px", width: "1400px", height: "120px", overflow: "hidden" });
  const headLine = kernedLine(head, "Set up in three steps.", "display", { fontSize: "92px", left: "0", top: "6px" });

  const colours = ["#c3192f", "#2b3fe0", "#f6b526"];
  const sleeves = colours.map((c, k) => {
    const light = k === 2;
    const n = div("", s.fg, {
      position: "absolute", left: `${xOf(k)}px`, top: `${SLEEVE.top}px`, width: `${SLEEVE.w}px`, height: `${SLEEVE.h}px`,
      borderRadius: `${SLEEVE.r}px`, overflow: "hidden", color: light ? INK : BONE,
      background: `linear-gradient(160deg, rgba(255,255,255,0.14), rgba(255,255,255,0) 42%), ${c}`,
      boxShadow: "0 30px 70px rgba(0,0,0,0.45)",
    });
    // The record's outline, pressed through the paper.
    div("", n, {
      position: "absolute", left: `${SLEEVE.w / 2 - SLEEVE.disc / 2}px`, top: `${18 - SLEEVE.disc / 2}px`, width: `${SLEEVE.disc}px`, height: `${SLEEVE.disc}px`,
      borderRadius: "50%", border: `2px solid ${light ? "rgba(21,16,11,0.1)" : "rgba(255,255,255,0.12)"}`,
    });
    const content = div("", n, { position: "absolute", inset: "0" });
    const num = div("wordmark", content, { position: "absolute", left: "36px", top: "26px", fontSize: "124px", lineHeight: "1" });
    num.textContent = String(k + 1);
    const title = div("display", content, { position: "absolute", left: "40px", top: "396px", fontSize: "52px", width: "460px", lineHeight: "1" });
    const text = div("", content, { position: "absolute", left: "40px", top: "468px", width: "440px", fontSize: "23px", fontWeight: "500", lineHeight: "1.4", color: light ? "rgba(21,16,11,0.74)" : "rgba(243,237,227,0.78)" });
    return { n, content, title, text, num };
  });
  sleeves[0].title.textContent = "Claim your name";
  sleeves[0].text.textContent = "It becomes your link. Change it any time.";
  sleeves[1].title.textContent = "Paste your links";
  sleeves[1].text.textContent = "The cover, the name and the songs come with it.";
  sleeves[2].title.textContent = "Share one link";
  sleeves[2].text.textContent = "Anyone can browse your shelf and press play.";

  // Step one: the name ticket.
  const ticket = div("", sleeves[0].content, {
    position: "absolute", left: "40px", top: "196px", padding: "16px 26px 14px", borderRadius: "16px",
    background: BONE, color: INK, boxShadow: "0 18px 40px rgba(0,0,0,0.3)", transform: "rotate(-4deg)",
  });
  div("", ticket, { fontSize: "25px", fontWeight: "600", color: "rgba(21,16,11,0.55)" }).textContent = "spindlshare.com/";
  div("display", ticket, { fontSize: "56px", lineHeight: "1.02" }).textContent = "yourname";

  // Step two: a real link, typed, and what came back from it.
  const field = div("mono", sleeves[1].content, {
    position: "absolute", left: "40px", top: "186px", width: "440px", height: "62px", borderRadius: "14px",
    background: "rgba(8,12,70,0.38)", border: "1px solid rgba(255,255,255,0.2)", fontSize: "19px", fontWeight: "700",
    display: "flex", alignItems: "center", padding: "0 18px", boxSizing: "border-box", whiteSpace: "nowrap", overflow: "hidden",
  });
  const typed = el("span", "", field);
  const caret = el("span", "", field, { display: "inline-block", width: "2px", height: "26px", background: BONE, marginLeft: "2px" });
  const result = div("", sleeves[1].content, {
    position: "absolute", left: "40px", top: "262px", width: "440px", height: "92px", borderRadius: "16px",
    background: BONE, color: INK, boxShadow: "0 16px 36px rgba(0,0,0,0.3)",
  });
  const cover = el("img", "", result, { position: "absolute", left: "13px", top: "13px", width: "66px", height: "66px", borderRadius: "9px", objectFit: "cover" });
  cover.crossOrigin = "anonymous";
  cover.src = shelf.playlists[0].cover;
  div("", result, { position: "absolute", left: "94px", top: "17px", fontSize: "25px", fontWeight: "800" }).textContent = shelf.playlists[0].title;
  const meta = div("", result, { position: "absolute", left: "94px", top: "52px", fontSize: "18px", fontWeight: "600", color: "rgba(21,16,11,0.6)", display: "flex", alignItems: "center", gap: "7px" });
  const sp = el("span", "", meta, { display: "inline-block", width: "18px", height: "18px", color: "#1db954" });
  sp.innerHTML = icons.spotify;
  el("span", "", meta).textContent = `${shelf.playlists[0].songs} songs · Spotify`;
  const added = div("", result, {
    position: "absolute", right: "14px", top: "28px", padding: "7px 14px 7px 10px", borderRadius: "999px",
    background: "#d4f3e1", color: "#0b6b3c", fontSize: "18px", fontWeight: "800", display: "flex", alignItems: "center", gap: "5px",
  });
  const tick = el("span", "", added, { display: "inline-block", width: "18px", height: "18px" });
  tick.innerHTML = icons.check;
  el("span", "", added).textContent = "Added";

  // Step three: the page a visitor gets.
  const bio = div("", sleeves[2].content, {
    position: "absolute", left: "40px", top: "190px", width: "440px", height: "128px", borderRadius: "18px",
    background: "rgba(21,16,11,0.1)", color: INK,
  });
  const av = div("", bio, { position: "absolute", left: "20px", top: "30px", width: "68px", height: "68px", borderRadius: "50%", background: INK, color: BONE, display: "grid", placeItems: "center", fontSize: "30px", fontWeight: "800" });
  av.textContent = "Y";
  div("", bio, { position: "absolute", left: "106px", top: "22px", fontSize: "25px", fontWeight: "800" }).textContent = "yourname";
  div("", bio, { position: "absolute", left: "106px", top: "56px", fontSize: "19px", fontWeight: "500", color: "rgba(21,16,11,0.65)" }).textContent = "playlists for every mood";
  div("", bio, { position: "absolute", left: "106px", top: "86px", fontSize: "19px", fontWeight: "800", color: "#2b3fe0" }).textContent = "spindlshare.com/yourname";

  // The link from the last scene, flying in to become the ticket.
  const flyer = div("display", s.fg, {
    position: "absolute", left: "0", top: "0", height: `${PILL.h}px`, borderRadius: `${PILL.h / 2}px`,
    background: INK, color: BONE, fontSize: `${PILL.font}px`, display: "flex", alignItems: "center",
    padding: `0 ${PILL.pad}px`, whiteSpace: "nowrap", boxSizing: "border-box", transformOrigin: "0 0",
  });
  const flyHost = el("span", "", flyer, { color: "rgba(243,237,227,0.52)" });
  flyHost.textContent = "spindlshare.com/";
  el("span", "", flyer).textContent = "yourname";

  s.init = () => {
    headLine.split();
    s.flyW = flyer.getBoundingClientRect().width;
    s.ticketBox = { w: ticket.offsetWidth, h: ticket.offsetHeight };
  };

  s.render = (t) => {
    // The frame changes colour out from the point where the link was.
    const wipe = tw(t, t0, t0 + 0.42, E.outCubic);
    const exit = tw(t, at(14, 4.1), end, E.inOutExpo);
    bg.style.clipPath = wipe < 1 ? `circle(${(wipe * 1250).toFixed(1)}px at ${PILL.cx}px ${PILL.cy}px)` : "none";

    headLine.letters.forEach((g, i) => {
      const u = tw(t, start + i * 0.012, start + i * 0.012 + 0.6, E.outExpo);
      tf(g.el, { y: (1 - u) * 120 });
    });
    tf(head, { o: 1 - tw(t, at(14, 4.1), at(14, 4.5), E.linear) });

    // The scratch: the hand on the records moves the whole row a little too.
    const sp0 = scratchPosition(t);
    const sp1 = scratchPosition(t - 1 / 120);
    const speed = (sp0 - sp1) * 120;
    const nudge = t >= SCRATCH[0] ? clamp(speed, -3, 3) * 5 : 0;

    const items = [];
    sleeves.forEach((sl, k) => {
      const rise = tw(t, t0 + 0.1 + k * 0.1, t0 + 0.9 + k * 0.1, E.outExpo);
      const y = (1 - rise) * 780;
      const expand = k === 1 ? exit : 0;
      const away = k === 1 ? 0 : exit;
      if (k === 1 && expand > 0) {
        // The cobalt sleeve opens out to fill the frame: the next scene is its colour.
        const x = lerp(xOf(1), 0, expand);
        const top = lerp(SLEEVE.top, 0, expand);
        sl.n.style.left = `${x}px`;
        sl.n.style.top = `${top}px`;
        sl.n.style.width = `${lerp(SLEEVE.w, 1920, expand)}px`;
        sl.n.style.height = `${lerp(SLEEVE.h, 1080, expand)}px`;
        sl.n.style.borderRadius = `${lerp(SLEEVE.r, 0, expand)}px`;
        tf(sl.n, { o: 1 });
      } else {
        sl.n.style.left = `${xOf(k)}px`;
        sl.n.style.top = `${SLEEVE.top}px`;
        sl.n.style.width = `${SLEEVE.w}px`;
        sl.n.style.height = `${SLEEVE.h}px`;
        sl.n.style.borderRadius = `${SLEEVE.r}px`;
        tf(sl.n, { x: nudge, y: y + away * 260, o: 1 - away });
      }
      tf(sl.content, { o: 1 - tw(t, at(14, 4.1), at(14, 4.35), E.linear) });
      tf(sl.title, { y: move(t, start + 0.3 + k * 0.15, start + 0.9 + k * 0.15, 30, 0), o: tw(t, start + 0.3 + k * 0.15, start + 0.8 + k * 0.15, E.outCubic) });
      tf(sl.text, { y: move(t, start + 0.45 + k * 0.15, start + 1.05 + k * 0.15, 24, 0), o: tw(t, start + 0.45 + k * 0.15, start + 0.95 + k * 0.15, E.outCubic) });

      // The record slides up out of its sleeve and keeps turning.
      const out = E.outBack(tw(t, start + 0.15 + k * 0.15, start + 0.85 + k * 0.15, E.linear));
      const cy = SLEEVE.top + y + lerp(260, 18, out) + away * 260;
      const scratchTurn = t >= SCRATCH[0] ? sp0 * 900 * (Math.PI / 180) : 0;
      items.push({
        i: k,
        x: xOf(k) + SLEEVE.w / 2 + nudge,
        y: cy,
        size: SLEEVE.disc,
        rot: -((t - t0) * 1.4 + k * 1.3) - scratchTurn,
        opacity: (1 - away) * (1 - tw(t, at(14, 4.1), at(14, 4.4), E.linear)),
      });
    });
    recs.draw(items);

    // The link lands on the first sleeve and becomes its ticket.
    const land = tw(t, t0, start + 0.05, E.inOutCubic);
    const tx = xOf(0) + 40;
    const ty = SLEEVE.top + 196;
    const sx = (s.ticketBox?.w ?? 300) / (s.flyW || 1);
    const x = lerp(PILL.cx - (s.flyW ?? 0) / 2, tx, land);
    const yy = lerp(PILL.cy - PILL.h / 2, ty, land);
    tf(flyer, { x, y: yy, s: lerp(1, sx, land), r: lerp(0, -4, land), o: 1 - tw(t, start - 0.05, start + 0.06, E.linear) });
    const tk = spring(t, start + 0.02, 3.2, 0.38);
    tf(ticket, { r: -4, s: t < start ? 0 : 0.85 + 0.15 * tk, o: t < start + 0.02 ? 0 : 1 });

    // Step two, in real time.
    const chars = Math.round(PASTED.length * tw(t, at(13, 3), at(13, 4.7), E.linear));
    typed.textContent = PASTED.slice(0, chars);
    caret.style.opacity = t < at(13, 4.7) && Math.floor(t * 4) % 2 === 0 ? "1" : t < at(13, 3) ? (Math.floor(t * 4) % 2 ? "0" : "1") : "0";
    const pop = spring(t, at(14), 3.4, 0.45);
    tf(result, { y: (1 - tw(t, at(14), at(14, 1.4), E.outExpo)) * 30, s: t < at(14) ? 0.8 : 0.9 + 0.1 * pop, o: tw(t, at(14), at(14, 1.3), E.outCubic) });
    tf(added, { s: t < at(14, 1.5) ? 0 : spring(t, at(14, 1.5), 4, 0.4), o: t < at(14, 1.5) ? 0 : 1 });
    tf(bio, { y: move(t, at(13, 4), at(14, 0.8 + 0.2), 30, 0), o: tw(t, at(13, 4), at(14), E.outCubic) });
  };
  return s;
}
