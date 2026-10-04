/* The showreel: nine scenes on one clock. The recorder calls __frame(t) for each
   frame it films; nothing moves between calls. */

import { DURATION } from "./score.mjs";
import { div } from "./lib/dom.mjs";
import { createDeck } from "./lib/deck3d.mjs";
import { createFx } from "./fx.mjs";
import needle from "./scenes/needle.mjs";
import title from "./scenes/title.mjs";
import changer from "./scenes/changer.mjs";
import links from "./scenes/links.mjs";
import steps from "./scenes/steps.mjs";
import shelf from "./scenes/shelf.mjs";
import player from "./scenes/player.mjs";
import sand from "./scenes/sand.mjs";
import end from "./scenes/end.mjs";

const W = 1920;
const H = 1080;
const stage = document.getElementById("stage");
const world = div("world", stage);
const layers = { bg: div("layer", world), gl: div("layer", world), fg: div("layer", world) };
const fxLayer = div("layer", stage);

/** Pressings, as the landing page's changer colours them. */
const PRESS = {
  ruby: "#c3192f", cobalt: "#2b3fe0", marigold: "#f6b526", jade: "#12a37f",
  lilac: "#9d80ff", bone: "#e9e1d3", smoke: "#56504a", black: "#151211",
};
const pressing = [PRESS.ruby, PRESS.black, PRESS.marigold, PRESS.cobalt, PRESS.bone, PRESS.jade, PRESS.lilac, PRESS.smoke];

const SHELF = window.SHELF;
const records = SHELF.playlists.map((p, i) => ({
  id: `p${i}`, title: p.title, service: p.service, songs: p.songs, cover: p.cover,
  letterboxed: p.letterboxed, color: pressing[i % pressing.length],
}));

const deck = createDeck(layers.gl, { records, width: W, height: H });
const ctx = {
  W, H, layers, fxLayer, stage, world, shelf: SHELF, env: window.ENV, records, deck, PRESS,
  deckUsed: false,
  fade: 0,
  /** Draws the shared turntable this frame. */
  useDeck(state) {
    ctx.deckUsed = true;
    deck.draw(state);
  },
};

const scenes = [needle, title, changer, links, steps, shelf, player, sand, end].map((make) => make(ctx));
const fx = createFx(ctx);

window.__ready = (async () => {
  await document.fonts.load('500 100px "SR Display"');
  await document.fonts.load('500 100px "SR Wordmark"');
  await document.fonts.load('800 20px "Manrope"');
  await document.fonts.load('500 20px "Manrope"');
  await document.fonts.load('700 20px "JetBrains Mono"');
  await document.fonts.ready;
  await Promise.all([deck.ready, ...scenes.map((s) => s.ready)]);
  // Text is measured for per-letter motion, which needs the scene laid out.
  for (const s of scenes) {
    s.show(true);
    await s.init();
    s.show(false);
  }
  return true;
})();

window.__frame = (t) => {
  ctx.deckUsed = false;
  ctx.fade = 0;
  // Everything leaving hides before anything arriving shows: scenes share some layers.
  const next = scenes.map((s) => t >= s.from && t < s.to);
  scenes.forEach((s, i) => {
    if (s.on && !next[i]) {
      s.on = false;
      s.show(false);
    }
  });
  scenes.forEach((s, i) => {
    if (!s.on && next[i]) {
      s.on = true;
      s.show(true);
    }
  });
  for (const s of scenes) if (s.on) s.render(t);
  deck.canvas.style.visibility = ctx.deckUsed ? "visible" : "hidden";
  fx.render(t, world);
  return true;
};

window.__duration = DURATION;
