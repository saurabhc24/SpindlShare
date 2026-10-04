import { div } from "../lib/dom.mjs";

/**
 * A scene owns a background layer (under the 3D canvas) and a foreground layer
 * (over it). It is on from `from - lead` to `to + tail`, so neighbours can overlap
 * for a transition.
 */
export function base(ctx, [from, to], { lead = 0, tail = 0 } = {}) {
  const bg = div("scene", ctx.layers.bg);
  const fg = div("scene", ctx.layers.fg);
  const s = {
    start: from,
    end: to,
    from: from - lead,
    to: to + tail,
    bg,
    fg,
    on: false,
    extra: [],
    ready: Promise.resolve(),
    init() {},
    show(on) {
      for (const n of [bg, fg, ...s.extra]) n.style.display = on ? "" : "none";
    },
    render() {},
  };
  s.show(false);
  return s;
}
