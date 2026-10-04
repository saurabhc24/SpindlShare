/* What sits over every shot: film grain, a vignette, flashes on the drops, and a
   camera shake whenever something lands. */

import { DROPS, LANDINGS, NEEDLE_DROP, at } from "./score.mjs";
import { div, el } from "./lib/dom.mjs";
import { rng, shake, clamp } from "./lib/anim.mjs";

export function createFx(ctx) {
  const { fxLayer } = ctx;

  // Grain: sixteen frames of noise at half resolution, cycled per frame.
  const grain = el("canvas", "", fxLayer, {
    position: "absolute", left: "0", top: "0", width: "1920px", height: "1080px",
    mixBlendMode: "overlay", opacity: "0.16", imageRendering: "auto",
  });
  grain.width = 960;
  grain.height = 540;
  const g2d = grain.getContext("2d");
  const random = rng(1234);
  const tiles = Array.from({ length: 16 }, () => {
    const data = g2d.createImageData(960, 540);
    for (let i = 0; i < data.data.length; i += 4) {
      const v = 128 + ((random() + random() + random()) / 3 - 0.5) * 150;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 255;
    }
    return data;
  });

  div("", fxLayer, {
    position: "absolute", inset: "0",
    background: "radial-gradient(120% 95% at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.42) 100%)",
  });
  const flash = div("", fxLayer, { position: "absolute", inset: "0", background: "#f3ede3", opacity: "0" });
  const fade = div("", fxLayer, { position: "absolute", inset: "0", background: "#000", opacity: "0" });

  // Hits, in seconds, with how hard each shakes the frame.
  const hits = [
    [NEEDLE_DROP, 0.25, 6],
    [DROPS[0], 0.6, 22],
    [DROPS[1], 0.6, 22],
    [at(15), 0.35, 8],
    [at(29), 0.4, 10],
    ...LANDINGS.map((t) => [t, 0.3, 9]),
  ];
  const flashes = [
    [DROPS[0], 0.55, 0.32],
    [DROPS[1], 0.6, 0.34],
    [at(3), 0.35, 0.22],
  ];

  return {
    render(t, world) {
      const f = Math.floor(t * 60 + 1e-6);
      g2d.putImageData(tiles[f % tiles.length], 0, 0);

      let x = 0, y = 0, r = 0;
      for (const [t0, dur, amp] of hits) {
        const s = shake(t, t0, dur, amp, Math.round(t0 * 10));
        x += s.x;
        y += s.y;
        r += s.r;
      }
      const moving = Math.abs(x) + Math.abs(y) > 0.01;
      world.style.transform = moving ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${r.toFixed(3)}deg) scale(1.02)` : "";

      let fl = 0;
      for (const [t0, peak, dur] of flashes) if (t >= t0 && t < t0 + dur) fl = Math.max(fl, peak * (1 - (t - t0) / dur) ** 2);
      flash.style.opacity = fl.toFixed(3);
      fade.style.opacity = clamp(ctx.fade ?? 0).toFixed(3);
    },
  };
}
