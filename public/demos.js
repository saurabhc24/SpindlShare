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
     The refresh control, with its real timings. */
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
        note.textContent = "5 playlists checked, nothing changed.";
        note.classList.add("is-fading");
        busy = false;
      }, 2200);
    });
  }

  /* ------------------------------------------------------------ MOUNTING */
  function boot() {
    var shiftHost = document.getElementById("demo-shift");
    var spinHost = document.getElementById("demo-spin");

    if (shiftHost) buildShift(shiftHost);
    if (spinHost) buildSpinner(spinHost);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
