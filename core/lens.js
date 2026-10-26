/* Georgiadis Photography: the viewfinder and the loupe.
   Viewfinder: with a mouse, focus brackets close in on the subject of the photograph under the
   pointer (its stored focus point), lock with a pulse and show the exposure.
   Loupe: hold Shift over a photograph (or long-press it on a touch screen) for a round
   magnifier that loads a sharper copy, then the original when the magnification needs it.
   The mouse wheel changes the magnification while the loupe is up. */
(function (GP) {
  "use strict";
  const VF_SEL = ".tile[data-id], .mini-flow [data-id], .wall-item figure[data-id], .sp-hero[data-open], .cab-spec[data-id]";
  const LOUPE_SEL = VF_SEL + ", .slide img[data-id], .chapter-hero img[data-open]";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const app = () => GP.app;
  const viewerOpen = () => GP.viewer && GP.viewer.isOpen();

  function photoOf(el) {
    const m = app() && app().model;
    if (!m) return null;
    const id = el._frame || el.dataset.id || el.dataset.open;
    return id ? m.byId.get(id) || null : null;
  }
  function imgOf(el) { return el.tagName === "IMG" ? el : el.querySelector("img"); }
  // Where the photograph actually sits inside an object-fit: cover box.
  function geometry(img, x) {
    const r = img.getBoundingClientRect();
    const ar = x.ar || (img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5);
    const W = Math.max(r.width, r.height * ar), H = W / ar;
    const op = (getComputedStyle(img).objectPosition || "50% 50%").split(/\s+/).map((v) => (/%$/.test(v) ? parseFloat(v) / 100 : 0.5));
    return { r, W, H, ox: r.left + (r.width - W) * (op[0] ?? 0.5), oy: r.top + (r.height - H) * (op[1] ?? 0.5) };
  }

  /* ---------- viewfinder ---------- */
  const VF = { el: null, read: null, target: null, t: 0, hint: 0 };
  function vfEnsure() {
    if (VF.el) return;
    VF.el = document.createElement("div");
    VF.el.className = "vf";
    VF.el.setAttribute("aria-hidden", "true");
    VF.el.innerHTML = `<i class="vf-c tl"></i><i class="vf-c tr"></i><i class="vf-c bl"></i><i class="vf-c br"></i><i class="vf-dot"></i>`;
    VF.read = document.createElement("div");
    VF.read.className = "vf-read";
    VF.read.setAttribute("aria-hidden", "true");
    document.body.append(VF.el, VF.read);
  }
  function exposure(x) {
    const e = x.exif || {}, a = [];
    if (e.ss) a.push(GP.model.shutter(e.ss).replace(/ s$/, ""));
    if (e.f) a.push("f/" + +(+e.f).toFixed(1));
    if (e.iso) a.push("ISO " + e.iso);
    if (e.fl) a.push(Math.round(e.fl) + " mm");
    return a.join("  ");
  }
  function vfShow(el) {
    const x = photoOf(el), img = imgOf(el);
    if (!x || !img) return vfHide();
    vfEnsure();
    const g = geometry(img, x), r = el.getBoundingClientRect();
    if (r.width < 90 || r.height < 70) return vfHide();
    const fp = x.fp || [0.5, 0.5];
    const side = Math.max(44, Math.min(150, Math.min(r.width, r.height) * 0.36));
    const cx = Math.max(r.left + side / 2 + 4, Math.min(r.right - side / 2 - 4, g.ox + fp[0] * g.W));
    const cy = Math.max(r.top + side / 2 + 4, Math.min(r.bottom - side / 2 - 4, g.oy + fp[1] * g.H));
    const box = VF.el.style;
    VF.target = el;
    VF.el.classList.remove("lock", "on");
    VF.read.classList.remove("on");
    clearTimeout(VF.t);
    // start at the frame's edges, then close in on the subject
    VF.el.style.transition = "none";
    Object.assign(box, { left: r.left + 8 + "px", top: r.top + 8 + "px", width: r.width - 16 + "px", height: r.height - 16 + "px" });
    void VF.el.offsetWidth;
    VF.el.style.transition = "";
    VF.el.classList.add("on");
    const settle = () => {
      Object.assign(box, { left: cx - side / 2 + "px", top: cy - side / 2 + "px", width: side + "px", height: side + "px" });
      VF.t = setTimeout(() => {
        if (VF.target !== el) return;
        VF.el.classList.add("lock");
        const txt = exposure(x);
        if (!txt) return;
        VF.read.textContent = txt;
        const above = cy - side / 2 - r.top > 30;
        VF.read.style.left = cx + "px";
        VF.read.style.top = (above ? cy - side / 2 - 8 : cy + side / 2 + 8) + "px";
        VF.read.classList.toggle("below", !above);
        VF.read.classList.add("on");
      }, reduced() ? 0 : 340);
    };
    if (reduced()) settle(); else requestAnimationFrame(settle);
    // first time: tell people about the loupe
    if (!store.get("gp-loupe-hint") && !VF.hint) {
      VF.hint = setTimeout(() => {
        if (VF.target === el && !L.on) { store.set("gp-loupe-hint", "1"); app().toast("Tip: hold Shift over a photograph for a loupe"); }
        VF.hint = 0;
      }, 1800);
    }
  }
  function vfHide() {
    VF.target = null;
    clearTimeout(VF.t);
    if (VF.hint) { clearTimeout(VF.hint); VF.hint = 0; }
    if (!VF.el) return;
    VF.el.classList.remove("on", "lock");
    VF.read.classList.remove("on");
  }

  /* ---------- loupe ---------- */
  const L = { el: null, img: null, tag: null, on: false, target: null, x: null, mag: 3, px: 0, py: 0, touch: false, have: 0, loading: 0, fullTried: false, lp: null, swallow: false };
  function lEnsure() {
    if (L.el) return;
    L.el = document.createElement("div");
    L.el.className = "loupe";
    L.el.setAttribute("aria-hidden", "true");
    L.el.innerHTML = `<div class="loupe-glass"><img alt="" draggable="false"><i class="loupe-ret"></i></div><span class="loupe-tag"></span>`;
    L.img = L.el.querySelector("img");
    L.tag = L.el.querySelector(".loupe-tag");
    document.body.appendChild(L.el);
  }
  function lOpen(el, px, py, touch) {
    const x = photoOf(el), img = imgOf(el);
    if (!x || !img) return false;
    lEnsure();
    L.on = true; L.target = el; L.x = x; L.touch = touch; L.fullTried = false;
    L.mag = touch ? 2.6 : L.mag || 3;
    // start from what's already on screen, then fetch something sharper
    L.img.src = img.currentSrc || img.src;
    L.have = img.naturalWidth || 0;
    L.el.classList.toggle("touch", touch);
    L.el.classList.add("on");
    document.documentElement.classList.add("gp-louping");
    vfHide();
    lMove(px, py);
    lSharpen();
    return true;
  }
  function lClose() {
    if (!L.on) return;
    L.on = false; L.target = null; L.x = null;
    L.el.classList.remove("on");
    document.documentElement.classList.remove("gp-louping");
  }
  function lNeed() {
    const img = imgOf(L.target);
    if (!img) return 0;
    const g = geometry(img, L.x);
    return g.W * L.mag * Math.min(2, devicePixelRatio || 1);
  }
  function lSharpen() {
    if (!L.on) return;
    const x = L.x, need = lNeed(), A = app().adapter;
    const load = (url, w, label) => {
      if (!url) return;
      const token = x.id + "|" + w;
      L.loading = token;
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { if (L.on && L.x === x && L.loading === token && w > L.have) { L.img.src = url; L.have = w; lLabel(label); } };
      im.src = url;
    };
    if (L.have < Math.min(2560, need) * 0.9 && L.have < 2400) load(app().helpers.src(x, Math.min(2560, Math.max(1280, need))), 2560, "");
    // past what the largest rendition holds, the original takes over
    if (need > 2400 && !L.fullTried && A.full) {
      L.fullTried = true;
      Promise.resolve(A.full(x)).then((u) => { if (u && L.on && L.x === x) load(u, x.W || 6000, "full resolution"); }).catch(() => {});
    }
    lLabel(L.have >= (x.W || 6000) ? "full resolution" : "");
  }
  function lLabel(extra) {
    const full = L.x && L.have >= (L.x.W || 6000);
    L.tag.textContent = `${L.mag.toFixed(1)}×` + (extra || full ? " · full resolution" : "");
  }
  function lMove(px, py) {
    if (!L.on) return;
    L.px = px; L.py = py;
    const img = imgOf(L.target);
    if (!img || !img.isConnected) return lClose();
    const g = geometry(img, L.x);
    const size = L.el.offsetWidth || 220, R = size / 2;
    // on touch the glass floats above the finger so the finger doesn't hide what it shows
    const cx = px, cy = L.touch ? py - R - 36 : py;
    L.el.style.transform = `translate(${cx - R}px, ${Math.max(4, cy - R)}px)`;
    const u = (px - g.ox) / g.W, v = (py - g.oy) / g.H;
    const w = g.W * L.mag, hgt = g.H * L.mag;
    Object.assign(L.img.style, { width: w + "px", height: hgt + "px", transform: `translate(${R - u * w}px, ${R - v * hgt}px)` });
    L.el.classList.toggle("off-photo", u < 0 || u > 1 || v < 0 || v > 1);
  }
  function lZoom(f) {
    L.mag = Math.max(1.5, Math.min(12, L.mag * f));
    lMove(L.px, L.py);
    lLabel();
    lSharpen();
  }

  /* ---------- events ---------- */
  let last = { x: 0, y: 0, el: null };
  function targetAt(t, sel) { return t && t.closest ? t.closest(sel) : null; }
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || viewerOpen()) return;
    const el = targetAt(e.target, VF_SEL);
    if (L.on) return;
    if (el && el !== VF.target && finePointer() && !document.documentElement.classList.contains("gp-selecting")) vfShow(el);
    else if (!el && VF.target) vfHide();
  }, { passive: true });
  document.addEventListener("pointermove", (e) => {
    last = { x: e.clientX, y: e.clientY, el: e.target };
    if (L.on) {
      if (L.touch && e.pointerType !== "touch") return;
      const el = targetAt(e.target, LOUPE_SEL);
      if (!L.touch && el && el !== L.target) { lClose(); lOpen(el, e.clientX, e.clientY, false); return; }
      if (!L.touch && !el) { lClose(); return; }
      lMove(e.clientX, e.clientY);
    }
    if (L.lp && Math.hypot(e.clientX - L.lp.x, e.clientY - L.lp.y) > 10) { clearTimeout(L.lp.t); L.lp = null; }
  }, { passive: true });
  document.addEventListener("pointerout", (e) => {
    if (VF.target && !(e.relatedTarget && VF.target.contains(e.relatedTarget)) && e.target.closest && e.target.closest(VF_SEL) === VF.target) vfHide();
  }, { passive: true });
  addEventListener("scroll", () => { if (VF.target) vfHide(); if (L.on && !L.touch) lClose(); }, { passive: true });
  addEventListener("resize", () => { vfHide(); lClose(); });

  // Shift held: the loupe
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Shift" || e.repeat || L.on || viewerOpen()) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    const el = targetAt(document.elementFromPoint(last.x, last.y), LOUPE_SEL);
    if (el) lOpen(el, last.x, last.y, false);
  });
  document.addEventListener("keyup", (e) => { if (e.key === "Shift" && L.on && !L.touch) { lClose(); if (VF.target === null) { const el = targetAt(document.elementFromPoint(last.x, last.y), VF_SEL); if (el && finePointer()) vfShow(el); } } });
  addEventListener("blur", lClose);
  document.addEventListener("wheel", (e) => {
    if (!L.on) return;
    e.preventDefault();
    const d = e.deltaY || e.deltaX; // Shift turns vertical wheels sideways in some browsers
    lZoom(Math.exp(-d * 0.0022));
  }, { passive: false });

  // long-press on touch screens
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || viewerOpen()) return;
    const el = targetAt(e.target, LOUPE_SEL);
    if (!el) return;
    const at = { x: e.clientX, y: e.clientY };
    L.lp = { ...at, t: setTimeout(() => {
      if (!L.lp) return;
      L.lp = null;
      if (lOpen(el, at.x, at.y, true)) { L.swallow = true; if (navigator.vibrate) try { navigator.vibrate(8); } catch (err) { /* not allowed */ } }
    }, 380) };
  }, { passive: true });
  const endTouch = (e) => {
    if (e.pointerType !== "touch") return;
    if (L.lp) { clearTimeout(L.lp.t); L.lp = null; }
    if (L.on && L.touch) {
      lClose();
      if (!store.get("gp-loupe-hint-t")) store.set("gp-loupe-hint-t", "1");
      setTimeout(() => { L.swallow = false; }, 400);
    }
  };
  document.addEventListener("pointerup", endTouch, { passive: true });
  document.addEventListener("pointercancel", (e) => { if (L.on && L.touch) return; endTouch(e); }, { passive: true });
  // While the loupe is up the finger steers it instead of scrolling the page.
  document.addEventListener("touchmove", (e) => {
    if (!(L.on && L.touch)) return;
    e.preventDefault();
    const t = e.touches[0];
    if (t) lMove(t.clientX, t.clientY);
  }, { passive: false });
  document.addEventListener("touchend", (e) => { if (L.on && L.touch && !e.touches.length) { lClose(); setTimeout(() => { L.swallow = false; }, 400); } });
  document.addEventListener("click", (e) => { if (L.swallow) { L.swallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener("contextmenu", (e) => { if ((L.on && L.touch) || (L.lp && targetAt(e.target, LOUPE_SEL))) e.preventDefault(); });

  // Touch screens: a one-time tip after the first photograph is closed.
  let shownTouchTip = false;
  document.addEventListener("gp:viewer-close", () => {
    if (shownTouchTip || finePointer() || store.get("gp-loupe-hint-t")) return;
    shownTouchTip = true;
    store.set("gp-loupe-hint-t", "1");
    setTimeout(() => app().toast("Tip: long-press any photograph for a loupe"), 600);
  });

  GP.lens = { open: (el, x, y, touch) => lOpen(el, x, y, !!touch), close: lClose, zoom: lZoom, get state() { return { on: L.on, mag: L.mag, have: L.have }; }, hideViewfinder: vfHide };
})(window.GP = window.GP || {});
