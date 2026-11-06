/* Georgiadis Photography: the viewfinder and the loupe.
   Viewfinder: with a mouse, the cursor over a photograph becomes a small reticle with the
   exposure under it, green over the subject (its stored focus point).
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
  // Over a photograph the cursor becomes a lens: a small reticle with the camera's readout under
  // it, which turns green over the subject (the photograph's stored focus point) once it settles.
  const VF = { ret: null, target: null, t: 0, hint: 0, box: null, lock: false, raf: 0, px: 0, py: 0, scrollT: 0 };
  function vfEnsure() {
    if (VF.ret) return;
    VF.ret = document.createElement("div");
    VF.ret.className = "vf-ret";
    VF.ret.setAttribute("aria-hidden", "true");
    VF.ret.innerHTML = `<span class="vf-ring"><i class="t"></i><i class="r"></i><i class="b"></i><i class="l"></i><i class="c"></i></span><span class="vf-lcd"></span>`;
    document.body.append(VF.ret);
  }
  function lcd(x) {
    const e = x.exif || {}, out = [];
    if (e.ss) out.push(`<b>${GP.model.shutter(e.ss).replace(/ s$/, "")}</b>`);
    if (e.f) out.push(`<b>F${+(+e.f).toFixed(1)}</b>`);
    // the exposure meter, its needle at the compensation that was dialled in
    const eb = Math.max(-2, Math.min(2, +e.eb || 0));
    out.push(`<span class="vf-meter" style="--eb:${((eb + 2) / 4 * 100).toFixed(0)}%"><i></i><i></i><i></i><i class="z"></i><i></i><i></i><i></i><em></em></span>`);
    if (e.iso) out.push(`<b>ISO ${e.iso}</b>`);
    if (e.fl) out.push(`<b>${Math.round(e.fl)}mm</b>`);
    out.push(`<span class="vf-ok">●</span>`);
    return out.join("");
  }
  function retMove() {
    VF.raf = 0;
    if (!VF.ret) return;
    VF.ret.style.transform = `translate3d(${VF.px}px, ${VF.py}px, 0)`;
    const b = VF.box;
    VF.ret.classList.toggle("focus", !!(b && VF.lock && VF.px > b[0] && VF.px < b[2] && VF.py > b[1] && VF.py < b[3]));
  }
  function vfShow(el) {
    const x = photoOf(el), img = imgOf(el);
    if (!x || !img) return vfHide();
    vfEnsure();
    const g = geometry(img, x), r = el.getBoundingClientRect();
    if (r.width < 90 || r.height < 70) return vfHide();
    // the subject: a square around the focus point, kept inside the frame
    const fp = x.fp || [0.5, 0.5];
    const side = Math.max(44, Math.min(150, Math.min(r.width, r.height) * 0.36));
    const cx = Math.max(r.left + side / 2 + 4, Math.min(r.right - side / 2 - 4, g.ox + fp[0] * g.W));
    const cy = Math.max(r.top + side / 2 + 4, Math.min(r.bottom - side / 2 - 4, g.oy + fp[1] * g.H));
    if (VF.target && VF.target !== el) VF.target.classList.remove("vf-on");
    VF.target = el;
    el.classList.add("vf-on");
    VF.box = [cx - side / 2, cy - side / 2, cx + side / 2, cy + side / 2];
    VF.lock = false;
    VF.ret.querySelector(".vf-lcd").innerHTML = lcd(x);
    VF.ret.classList.add("on");
    clearTimeout(VF.t);
    VF.t = setTimeout(() => { if (VF.target !== el) return; VF.lock = true; retMove(); }, reduced() ? 0 : 340);
    // first time: tell people about the loupe
    if (!store.get("gp-loupe-hint") && !VF.hint) {
      VF.hint = setTimeout(() => {
        if (VF.target === el && !L.on) { store.set("gp-loupe-hint", "1"); app().toast("Tip: hold Shift over a photograph for a loupe"); }
        VF.hint = 0;
      }, 1800);
    }
  }
  function vfHide() {
    if (VF.target) VF.target.classList.remove("vf-on");
    VF.target = null;
    VF.box = null;
    VF.lock = false;
    clearTimeout(VF.t);
    if (VF.hint) { clearTimeout(VF.hint); VF.hint = 0; }
    if (!VF.ret) return;
    VF.ret.classList.remove("on", "focus");
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
    if (el.closest(".veiled") || img.classList.contains("veiled-img")) return false;
    lEnsure();
    L.on = true; L.target = el; L.x = x; L.touch = touch; L.fullTried = false;
    L.mag = touch ? 2.6 : L.mag || 3;
    // start from what's already on screen, then fetch something sharper
    L.img.src = img.currentSrc || img.src;
    L.have = img.naturalWidth || 0;
    L.el.classList.toggle("touch", touch);
    L.el.classList.add("on");
    document.documentElement.classList.add("gp-louping");
    // Only while the loupe is up may a finger or wheel steer it instead of moving the page: a
    // listener that can stop scrolling, left on the whole page, would make every scroll on a phone
    // wait for this script first. A long-press began before the listener existed, so the page
    // itself is held still too.
    document.documentElement.classList.toggle("gp-louping-touch", !!touch);
    document.addEventListener(touch ? "touchmove" : "wheel", touch ? onLoupeTouch : onLoupeWheel, { passive: false });
    vfHide();
    lMove(px, py);
    lSharpen();
    return true;
  }
  function lClose() {
    if (!L.on) return;
    L.on = false; L.target = null; L.x = null;
    L.el.classList.remove("on");
    document.documentElement.classList.remove("gp-louping", "gp-louping-touch");
    document.removeEventListener("touchmove", onLoupeTouch, { passive: false });
    document.removeEventListener("wheel", onLoupeWheel, { passive: false });
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
    // photographs sliding under a still pointer while the page scrolls don't wake the lens
    if (el && performance.now() - VF.scrollT < 250) return;
    if (el && el !== VF.target && finePointer() && !document.documentElement.classList.contains("gp-selecting")) { VF.px = e.clientX; VF.py = e.clientY; vfShow(el); retMove(); }
    else if (!el && VF.target) vfHide();
  }, { passive: true });
  document.addEventListener("pointermove", (e) => {
    last = { x: e.clientX, y: e.clientY, el: e.target };
    // the pointer moving again after a scroll brings the lens back over the photograph it's on
    if (!VF.target && !L.on && e.pointerType === "mouse" && performance.now() - VF.scrollT > 250 && !viewerOpen() && finePointer() && !document.documentElement.classList.contains("gp-selecting")) {
      const el = targetAt(e.target, VF_SEL);
      if (el) { VF.px = e.clientX; VF.py = e.clientY; vfShow(el); retMove(); }
    }
    if (VF.target && VF.ret && e.pointerType === "mouse") { VF.px = e.clientX; VF.py = e.clientY; if (!VF.raf) VF.raf = requestAnimationFrame(retMove); }
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
  addEventListener("scroll", () => { VF.scrollT = performance.now(); if (VF.target) vfHide(); if (L.on && !L.touch) lClose(); }, { passive: true });
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
  function onLoupeWheel(e) {
    if (!L.on) return;
    e.preventDefault();
    const d = e.deltaY || e.deltaX; // Shift turns vertical wheels sideways in some browsers
    lZoom(Math.exp(-d * 0.0022));
  }

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
  // While the loupe is up the finger steers it instead of scrolling the page (added in lOpen).
  function onLoupeTouch(e) {
    if (!(L.on && L.touch)) return;
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    if (t) lMove(t.clientX, t.clientY);
  }
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

  GP.lens = { open: (el, x, y, touch) => lOpen(el, x, y, !!touch), close: lClose, zoom: lZoom, get state() { return { on: L.on, mag: L.mag, have: L.have, reticle: !!(VF.ret && VF.ret.classList.contains("on")), focus: !!(VF.ret && VF.ret.classList.contains("focus")) }; }, hideViewfinder: vfHide };
})(window.GP = window.GP || {});
