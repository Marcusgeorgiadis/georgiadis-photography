/* Georgiadis Photography: the site takes on the colours of the photograph in front of it.
   GP.tint.set(photo) eases the accent (links, kickers, buttons, the progress of a slideshow) to
   the photograph's most colourful tone, made dark or light enough to read, and washes the page
   behind it with soft pools of its palette. GP.tint.set(null) lets the site's own colours back.
   Views call it for their featured photograph; galleries follow the photograph nearest the middle
   of the screen as you scroll. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const T = { el: null, layers: [], slot: 0, key: "", base: null, follow: null };

  const hexRgb = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  function rgbHsl([r, g, b]) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslHex(h, s, l) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  const lum = (hex) => { const c = hexRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const dark = () => { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; };

  // The palette's most colourful tone, at a lightness that reads against the page.
  function accentOf(pal) {
    const cands = (pal || []).map(hexRgb).filter(Boolean).map(rgbHsl);
    if (!cands.length) return null;
    const pick = cands.slice().sort((a, b) => b[1] * (1 - Math.abs(2 * b[2] - 1)) - a[1] * (1 - Math.abs(2 * a[2] - 1)))[0];
    const chroma = pick[1] * (1 - Math.abs(2 * pick[2] - 1));
    if (chroma < 0.06) return null; // a grey photograph keeps the house brass
    const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || (dark() ? "#0e100f" : "#e8eae5");
    const s = Math.min(0.62, Math.max(0.32, pick[1]));
    let l = dark() ? 0.68 : 0.36, c = hslHex(pick[0], s, l);
    for (let i = 0; i < 12 && contrast(c, bg) < 4.6; i++) { l += dark() ? 0.03 : -0.03; c = hslHex(pick[0], s, l); }
    return { accent: c, ink: lum(c) > 0.32 ? "#14120c" : "#fbf8f0" };
  }
  function ensure() {
    if (T.el) return;
    T.el = document.createElement("div");
    T.el.className = "gp-tint";
    T.el.setAttribute("aria-hidden", "true");
    T.el.innerHTML = "<i></i><i></i>";
    T.layers = [...T.el.children];
    document.body.prepend(T.el);
  }
  function wash(pal) {
    const c = (pal || []).filter((p) => hexRgb(p));
    if (!c.length) return "none";
    const a = dark() ? 0.26 : 0.2;
    const rgba = (hx, k) => { const v = hexRgb(hx); return `rgba(${v[0]},${v[1]},${v[2]},${(a * k).toFixed(3)})`; };
    return [
      `radial-gradient(60vw 52vh at 0% 0%, ${rgba(c[0], 1)}, transparent 70%)`,
      `radial-gradient(54vw 48vh at 100% 6%, ${rgba(c[1] || c[0], 0.9)}, transparent 70%)`,
      `radial-gradient(70vw 60vh at 70% 100%, ${rgba(c[2] || c[0], 0.75)}, transparent 72%)`,
      `radial-gradient(50vw 50vh at 10% 90%, ${rgba(c[3] || c[1] || c[0], 0.6)}, transparent 70%)`,
    ].join(",");
  }
  // Apply a photograph's colours (or null for the site's own).
  function set(x, o = {}) {
    const pal = x && x.pal && x.pal.length ? x.pal : null;
    const key = pal ? pal.join() + (dark() ? "d" : "l") : "";
    if (key === T.key && !o.force) return;
    T.key = key;
    T.cur = x || null;
    // the soundscape listens for the same photograph
    document.dispatchEvent(new CustomEvent("gp:photo-context", { detail: { x: T.cur } }));
    ensure();
    const root = document.documentElement.style;
    const ac = pal ? accentOf(pal) : null;
    if (ac) { root.setProperty("--accent", ac.accent); root.setProperty("--accent-ink", ac.ink); root.setProperty("--tint-on", "1"); }
    else { root.removeProperty("--accent"); root.removeProperty("--accent-ink"); root.removeProperty("--tint-on"); }
    document.documentElement.classList.toggle("tinted", !!pal);
    // cross-fade the wash between two layers
    const next = T.layers[1 - T.slot], prev = T.layers[T.slot];
    next.style.backgroundImage = pal ? wash(pal) : "none";
    next.classList.add("on"); prev.classList.remove("on");
    T.slot = 1 - T.slot;
    if (reduced()) T.el.classList.add("still");
  }
  // A page's own photograph, kept so the viewer and the player can hand the colours back.
  function page(x) { T.base = x || null; set(T.base); }
  function restore() { set(T.base); }

  // Galleries: the photograph nearest the middle of the screen sets the colours, gently.
  function follow(root, signal) {
    if (!("IntersectionObserver" in window)) return;
    const vis = new Set();
    let t = 0;
    const pick = () => {
      t = 0;
      const mid = innerHeight / 2;
      let best = null, bd = Infinity;
      for (const el of vis) { const r = el.getBoundingClientRect(); const d = Math.abs(r.top + r.height / 2 - mid); if (d < bd) { bd = d; best = el; } }
      const x = best && GP.app.model.byId.get(best.dataset.id);
      if (x && !(GP.viewer && GP.viewer.isOpen()) && !document.querySelector(".ex2")) { T.base = x; set(x); }
    };
    const io = new IntersectionObserver((es) => { for (const e of es) (e.isIntersecting ? vis.add(e.target) : vis.delete(e.target)); }, { rootMargin: "-30% 0px -30% 0px" });
    const watch = () => root.querySelectorAll(".tile[data-id]").forEach((el) => io.observe(el));
    watch();
    const mo = new MutationObserver(() => watch());
    mo.observe(root, { childList: true, subtree: true });
    const onScroll = () => { if (!t) t = setTimeout(pick, 700); };
    addEventListener("scroll", onScroll, { passive: true, signal });
    setTimeout(pick, 400);
    signal.addEventListener("abort", () => { io.disconnect(); mo.disconnect(); clearTimeout(t); });
  }
  // The theme changing changes what reads: redo the accent for the same photograph.
  new MutationObserver(() => { if (T.key) set(T.cur, { force: true }); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  GP.tint = { set, page, restore, follow, accentOf, get base() { return T.base; }, get current() { return T.cur || null; } };
})(window.GP = window.GP || {});
