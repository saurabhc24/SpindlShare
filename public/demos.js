/* Live prototypes for the case study.
   Each one runs the real geometry from the product, in miniature, so the page
   demonstrates the motion instead of describing it. */

(function () {
  "use strict";

  var SHELF = window.SHELF || [];

  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }

  /* ------------------------------------------------------- LAYOUT SHIFT
     The thing the floating card was built to avoid: a note that pushes the
     rows below it. Both halves run the same content, one inline, one fixed. */
  function buildShift(host) {
    var wrap = el("div", "demo-shift", host);

    ["inline", "float"].forEach(function (mode) {
      var col = el("div", "demo-shift-col", wrap);
      var head = el("p", "demo-shift-head", col);
      head.textContent = mode === "inline" ? "Inline note" : "Floating card";

      var panel = el("div", "demo-shift-panel", col);
      var row = el("div", "demo-shift-row", panel);
      row.textContent = "Chosen 5 out of 5";

      var note = el("div", mode === "inline" ? "demo-shift-note" : "demo-shift-note demo-shift-fixed", panel);
      note.textContent = "5 playlists checked";
      note.style.display = "none";

      for (var i = 0; i < 3; i++) {
        var item = el("div", "demo-shift-item", panel);
        item.textContent = SHELF[i] ? SHELF[i].title : "Playlist";
      }

      var btn = el("button", "demo-btn", col);
      btn.type = "button";
      btn.textContent = "Show the note";
      var on = false;
      btn.addEventListener("click", function () {
        on = !on;
        note.style.display = on ? "block" : "none";
        btn.textContent = on ? "Hide the note" : "Show the note";
        // Report how far the first row actually moved.
        var first = panel.querySelector(".demo-shift-item");
        var moved = Math.round(first.getBoundingClientRect().top - panel.getBoundingClientRect().top);
        readout.textContent = "first row at " + moved + "px";
      });
      var readout = el("p", "demo-shift-readout", col);
      var first0 = panel.querySelector(".demo-shift-item");
      readout.textContent = "first row at " +
        Math.round(first0.getBoundingClientRect().top - panel.getBoundingClientRect().top) + "px";
    });
  }

  /* -------------------------------------------------------------- SPINNER
     The refresh control, with its real timings and its real report. */
  function buildSpinner(host) {
    var wrap = el("div", "demo-spin", host);
    var btn = el("button", "demo-spin-btn", wrap);
    btn.type = "button";
    btn.setAttribute("aria-label", "Refresh playlists");
    btn.innerHTML =
      '<svg viewBox="0 0 19 19" width="18" height="18" aria-hidden="true">' +
      '<path fill="currentColor" d="M9.5 3.17a7.9 7.9 0 0 1 3.95 1.39h-1.38a.79.79 0 1 0 0 1.58h3.16a.79.79 0 0 0 .8-.79V2.18a.79.79 0 0 0-1.59 0v1.15A7.92 7.92 0 0 0 1.58 9.5a.79.79 0 0 0 1.59 0A6.34 6.34 0 0 1 9.5 3.17Zm7.13 5.54a.79.79 0 0 0-.8.79 6.33 6.33 0 0 1-10.47 4.94h1.38a.79.79 0 1 0 0-1.58H3.57a.79.79 0 0 0-.8.79v3.17a.79.79 0 0 0 1.59 0v-1.15a7.92 7.92 0 0 0 12.86-6.17.79.79 0 0 0-.79-.79Z"/>' +
      "</svg>";
    var note = el("span", "demo-spin-note", wrap);

    var busy = false;
    btn.addEventListener("click", function () {
      if (busy) return;
      busy = true;
      btn.classList.add("is-busy");
      btn.setAttribute("aria-label", "Refreshing playlists");
      note.textContent = "Refreshing...";
      note.classList.remove("is-fading");
      setTimeout(function () {
        btn.classList.remove("is-busy");
        btn.setAttribute("aria-label", "Refresh playlists");
        note.textContent = "5 playlists checked, 197 songs, nothing changed.";
        note.classList.add("is-fading");
        busy = false;
      }, 2200);
    });
  }

  /* ------------------------------------------------------------- CYMATICS
     The footer's Chladni plate: the shipped modes, wave and constants, drawn
     on a 2D canvas here instead of in three.js. */
  var MODES = [[3, 5], [2, 7], [4, 9], [1, 6], [5, 8], [3, 10]];
  var MODE_MS = 3000;

  // Standing wave on a free square plate; sand gathers where it is zero.
  function wave(x, y, n, m) {
    return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) -
      Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
  }

  function buildSand(host) {
    var stage = el("div", "demo-sand", host);
    var canvas = el("canvas", "", stage);
    var bar = el("div", "demo-sand-bar", host);
    var btn = el("button", "demo-btn", bar);
    btn.type = "button";
    btn.textContent = "Next frequency";
    var readout = el("span", "demo-sand-readout", bar);

    var ctx = canvas.getContext("2d");
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var W = 0, H = 0, aspect = 1, plate = 1.2, count = 0, alpha = 0.5;
    var pos = new Float32Array(0);
    var mode = 0, changedAt = -1, skip = false, visible = false;
    var pointer = { x: 9, y: 9 };

    function label() {
      readout.textContent = "Mode (" + MODES[mode][0] + ", " + MODES[mode][1] + ") · " +
        count.toLocaleString("en") + " grains";
    }

    // The shipped rules: a phone gets a 160px band of 2.5:1 plates, anything wider near-square
    // ones, and the grain count follows the length of the lines rather than the area.
    function seed() {
      W = stage.clientWidth;
      var phone = W < 700;
      H = phone ? 160 : 220;
      stage.style.height = H + "px";
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      aspect = W / H;
      plate = phone ? 2.5 : 1.2;
      var plates = Math.max(1, Math.round(aspect / plate));
      count = Math.min(14000, Math.round(plates * Math.sqrt((W / plates) * H) * 10));
      alpha = phone ? 0.7 : 0.5;
      pos = new Float32Array(count * 2);
      for (var i = 0; i < count; i++) {
        pos[i * 2] = (Math.random() * 2 - 1) * aspect;
        pos[i * 2 + 1] = Math.random() * 2 - 1;
      }
      label();
    }

    function step(now, amount) {
      if (changedAt < 0) changedAt = now;
      if (skip || now - changedAt > MODE_MS) {
        mode = (mode + 1) % MODES.length;
        changedAt = now;
        skip = false;
        label();
      }
      var n = MODES[mode][0], m = MODES[mode][1];
      // A new frequency kicks the whole plate hard, then eases back to a steady hum.
      var kick = Math.exp(-(now - changedAt) / 700);
      var hum = 0.0045 + 0.035 * kick;
      var cell = aspect / Math.max(1, Math.round(aspect / plate));
      var drift = 0.0022 * amount * (1 - 0.6 * kick);
      for (var i = 0; i < count; i++) {
        var k = i * 2;
        var x = pos[k], y = pos[k + 1];
        var t = (x + aspect) / (2 * cell);
        var u = (t - Math.floor(t)) * 2 - 1;
        var f = wave(u, y, n, m);
        var gx = (wave(u + 0.002, y, n, m) - f) / 0.002;
        var gy = (wave(u, y + 0.002, n, m) - f) / 0.002;
        var shake = (Math.min(1, Math.abs(f)) * 0.03 + hum) * amount;
        x += -f * gx * drift + (Math.random() - 0.5) * shake;
        y += -f * gy * drift + (Math.random() - 0.5) * shake;
        var dx = x - pointer.x, dy = y - pointer.y;
        if (dx * dx + dy * dy < 0.02) {
          x += (Math.random() - 0.5) * 0.06;
          y += (Math.random() - 0.5) * 0.06;
        }
        if (x < -aspect) x += 2 * aspect;
        if (x > aspect) x -= 2 * aspect;
        pos[k] = x;
        pos[k + 1] = Math.max(-1, Math.min(1, y));
      }
    }

    // One rect per grain, so grains piling onto a line brighten it the way blended points do.
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "#f3ede3";
      ctx.globalAlpha = alpha;
      var sx = W / (2 * aspect), sy = H / 2;
      for (var i = 0; i < count; i++) {
        ctx.fillRect((pos[i * 2] + aspect) * sx - 0.75, (1 - pos[i * 2 + 1]) * sy - 0.75, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
    }

    // With reduced motion a figure is settled in one go and shown still, as on the site.
    function settle() {
      changedAt = 0;
      for (var i = 0; i < 400; i++) step(MODE_MS - 1, 1);
      draw();
    }

    function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;
      step(now, 1);
      draw();
    }

    btn.addEventListener("click", function () {
      if (calm) {
        mode = (mode + 1) % MODES.length;
        label();
        settle();
      } else {
        // Taken up by the next frame, so the change is timed on the frame clock like the rest.
        skip = true;
      }
    });

    canvas.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 * aspect - aspect;
      pointer.y = 1 - ((e.clientY - r.top) / r.height) * 2;
    });
    canvas.addEventListener("pointerleave", function () {
      pointer.x = 9;
    });

    seed();
    var lastW = W;
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }).observe(stage);
    new ResizeObserver(function () {
      if (stage.clientWidth === lastW) return;
      lastW = stage.clientWidth;
      seed();
      if (calm) settle();
    }).observe(stage);

    if (calm) settle();
    else requestAnimationFrame(loop);
  }

  /* ------------------------------------------------------------ MOUNTING */
  function boot() {
    var shiftHost = document.getElementById("demo-shift");
    var spinHost = document.getElementById("demo-spin");
    var sandHost = document.getElementById("demo-sand");

    if (shiftHost) buildShift(shiftHost);
    if (spinHost) buildSpinner(spinHost);
    if (sandHost) buildSand(sandHost);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
