/* The DOM half of the frame: elements are built once, then only transformed. */

export function el(tag, cls, parent, style) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (style) Object.assign(n.style, style);
  if (parent) parent.appendChild(n);
  return n;
}

export const div = (cls, parent, style) => el("div", cls, parent, style);

/** Transform and opacity in one call; only what is given is set. */
export function tf(n, { x = 0, y = 0, s = 1, sx, sy, r = 0, rx = 0, ry = 0, z = 0, o, blur, origin } = {}) {
  let t = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px)`;
  if (rx) t += ` rotateX(${rx.toFixed(3)}deg)`;
  if (ry) t += ` rotateY(${ry.toFixed(3)}deg)`;
  if (r) t += ` rotate(${r.toFixed(3)}deg)`;
  if (sx !== undefined || sy !== undefined) t += ` scale(${(sx ?? s).toFixed(4)}, ${(sy ?? s).toFixed(4)})`;
  else if (s !== 1) t += ` scale(${s.toFixed(4)})`;
  n.style.transform = t;
  if (origin) n.style.transformOrigin = origin;
  if (o !== undefined) n.style.opacity = String(Math.max(0, Math.min(1, o)).toFixed(3));
  if (blur !== undefined) n.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
}

export const show = (n, on) => {
  n.style.display = on ? "" : "none";
};

/**
 * A line of text split into letters that keep the font's own kerning: the text is
 * laid out whole, each glyph's position measured, then the glyphs placed there.
 */
export function kernedLine(parent, text, cls, style) {
  const line = el("div", cls, parent, { position: "absolute", whiteSpace: "pre", ...style });
  const probe = el("span", "", line);
  probe.textContent = text;
  const letters = [];
  const measure = () => {
    const base = line.getBoundingClientRect();
    const node = probe.firstChild;
    const range = document.createRange();
    const out = [];
    for (let i = 0; i < text.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      out.push({ ch: text[i], x: r.left - base.left, w: r.width });
    }
    return { out, width: probe.getBoundingClientRect().width, height: base.height };
  };
  return {
    line,
    letters,
    /** Call once fonts are loaded: swaps the probe for positioned glyphs. */
    split() {
      if (letters.length) return this;
      const m = measure();
      this.width = m.width;
      this.height = m.height;
      probe.remove();
      for (const g of m.out) {
        const span = el("span", "", line, { position: "absolute", left: `${g.x}px`, top: "0px", display: "inline-block", whiteSpace: "pre" });
        span.textContent = g.ch;
        letters.push({ el: span, ch: g.ch, x: g.x, w: g.w });
      }
      line.style.width = `${m.width}px`;
      line.style.height = `${m.height}px`;
      return this;
    },
  };
}

/** Words as masked blocks, for reveals that rise out of a line. */
export function maskedWords(parent, text, cls, style) {
  const line = el("div", cls, parent, { position: "absolute", whiteSpace: "nowrap", ...style });
  const words = text.split(" ").map((w, i, all) => {
    const mask = el("span", "", line, { display: "inline-block", overflow: "hidden", verticalAlign: "top", paddingBottom: "0.08em", marginBottom: "-0.08em" });
    const inner = el("span", "", mask, { display: "inline-block", whiteSpace: "pre" });
    inner.textContent = i < all.length - 1 ? `${w} ` : w;
    return { mask, inner };
  });
  return { line, words };
}

/** An <img> that is ready once decoded, for the frame to wait on. */
export function img(src, parent, style, cls = "") {
  const n = el("img", cls, parent, style);
  n.crossOrigin = "anonymous";
  n.decoding = "sync";
  const ready = new Promise((res) => {
    n.onload = () => res(true);
    n.onerror = () => res(false);
  });
  n.src = src;
  return { el: n, ready };
}

export const icons = {
  // The product's own glyphs (components/provider-badge.tsx), coloured by currentColor.
  spotify: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.52 17.34c-.24.36-.66.48-1.02.24-2.82-1.74-6.36-2.10-10.56-1.14-.42.12-.78-.18-.9-.54-.12-.42.18-.78.54-.9 4.56-1.02 8.52-.6 11.64 1.32.42.18.48.66.3 1.02zm1.44-3.30c-.30.42-.84.60-1.26.30-3.24-1.98-8.16-2.58-11.94-1.38-.48.12-1.02-.12-1.14-.60-.12-.48.12-1.02.60-1.14 4.38-1.32 9.780-.66 13.5 1.62.36.18.54.78.24 1.20zm.12-3.36C15.24 8.46 8.82 8.22 5.16 9.36c-.60.18-1.20-.18-1.38-.72-.18-.60.18-1.20.72-1.38 4.26-1.26 11.28-1.02 15.72 1.62.54.30.72 1.02.42 1.56-.30.42-1.02.60-1.56.24z"/></svg>',
  youtube: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.08 0 12 0 12s0 3.92.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.92 24 12 24 12s0-3.92-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>',
  play: '<svg viewBox="0 0 12 14" width="100%" height="100%"><path d="M1 1.2v11.6a1 1 0 0 0 1.5.9l9-5.8a1 1 0 0 0 0-1.7l-9-5.8A1 1 0 0 0 1 1.2Z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 12 14" width="100%" height="100%"><rect x="1" y="1" width="3.6" height="12" rx="1" fill="currentColor"/><rect x="7.4" y="1" width="3.6" height="12" rx="1" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="100%" height="100%"><path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
