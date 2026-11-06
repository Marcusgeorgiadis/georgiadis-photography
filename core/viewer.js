/* Georgiadis Photography: the viewer.
   GP.viewer.open(list, index, fromImg) flies the photo out of its tile; zoom with the wheel,
   a pinch or a double tap; drag to pan with inertia; swipe to move on or down to close. */
(function (GP) {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";
  const H = () => GP.app.helpers;

  const V = { el: null, open: false, list: [], i: 0, x: null, k: 1, tx: 0, ty: 0, bw: 0, bh: 0, sw: 0, sh: 0, kmax: 3, full: null, ptrs: new Map(), g: null, idleT: 0, lastTap: 0, token: 0, pre: new Map(), anim: null };

  function build() {
    if (V.el) return;
    const I = H().ICON;
    const el = document.createElement("div");
    el.className = "vw";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Photograph");
    el.innerHTML = `<div class="vw-bg"><div class="amb"></div><div class="amb"></div></div>
<div class="vw-stage"><img class="vw-img" alt="" draggable="false"><img class="vw-peek" alt="" draggable="false" aria-hidden="true"><div class="vw-fxbox" aria-hidden="true"></div>
  <div class="vw-veil" hidden><b>Sensitive photograph</b><span>This photograph may be upsetting.</span><button class="btn" data-v="unveil">Show photo</button></div>
  <div class="vw-ui">
    <div class="vw-top"><div class="t"><b></b><span></span></div>
      <button class="icon-btn vw-live" data-v="live" title="Play the burst (V)" aria-label="Play this burst as the moment it was" aria-pressed="false" hidden><span>LIVE</span></button>
      <button class="icon-btn" data-v="zoom" title="Zoom (Z)" aria-label="Zoom to full resolution" aria-pressed="false">${I.zoom}</button>
      <a class="icon-btn" data-v="download" title="Download the original (D)" aria-label="Download the original" target="_blank" rel="noopener">${I.download}</a>
      <button class="icon-btn" data-v="fav" title="Favourite (L)" aria-label="Add to your favourites" aria-pressed="false">${I.heart}</button>
      <button class="icon-btn" data-v="play" title="Play from here (P)" aria-label="Play these photographs as an exhibition">${I.play}</button>
      <button class="icon-btn" data-v="share" title="Share" aria-label="Share">${I.share}</button>
      <button class="icon-btn" data-v="info" title="Specimen label (I)" aria-label="Show details" aria-pressed="false">${I.info}</button>
      <button class="icon-btn" data-v="fs" title="Full screen (F)" aria-label="Full screen">${I.expand}</button>
      <button class="icon-btn" data-v="close" title="Close (Esc)" aria-label="Close">${I.close}</button>
    </div>
    <button class="vw-nav vw-prev" data-v="prev" aria-label="Previous photograph">${I.left}</button>
    <button class="vw-nav vw-next" data-v="next" aria-label="Next photograph">${I.right}</button>
    <div class="vw-bottom"><span class="vw-badge mono" aria-live="polite"></span><div class="vw-frames" hidden><button class="vw-fstep" data-v="fprev" title="Previous frame (↑)" aria-label="Previous frame">${I.left}</button><div class="vw-strip" role="listbox" aria-label="Frames in this burst"></div><button class="vw-fstep" data-v="fnext" title="Next frame (↓)" aria-label="Next frame">${I.right}</button></div></div>
    <div class="vw-mini" hidden><img alt=""><i></i></div>
  </div>
</div>
<aside class="vw-info" aria-label="Details"><div class="in"></div></aside>`;
    document.body.appendChild(el);
    V.el = el;
    V.stage = $(".vw-stage", el);
    V.img = $(".vw-img", el);
    V.peek = $(".vw-peek", el);
    V.ambs = [...el.querySelectorAll(".amb")];
    V.ambI = 0;
    V.info = $(".vw-info .in", el);
    V.mini = $(".vw-mini", el);
    V.fxbox = $(".vw-fxbox", el);
    el.addEventListener("click", onClick);
    V.stage.addEventListener("pointerdown", onDown);
    V.stage.addEventListener("pointermove", onMove);
    V.stage.addEventListener("pointerup", onUp);
    V.stage.addEventListener("pointercancel", onUp);
    V.stage.addEventListener("wheel", onWheel, { passive: false });
    V.stage.addEventListener("dblclick", (e) => { if (e.target === V.img || e.target === V.stage) toggleZoom(e.clientX, e.clientY); });
    el.addEventListener("pointermove", wake, { passive: true });
    el.addEventListener("keydown", trapTab);
    V.info.addEventListener("focusout", () => setTimeout(() => {
      if (V.infoStale && V.open && !V.info.contains(document.activeElement)) { V.infoStale = false; renderInfo(cur()); }
    }, 0));
    window.addEventListener("resize", () => { if (V.open) { layout(); fit(false); } });
    document.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", () => { const b = $('[data-v="fs"]', el); if (b) b.setAttribute("aria-pressed", String(!!document.fullscreenElement)); });
  }

  /* ---------- open / close ---------- */
  function open(list, i, fromImg, frame) {
    build();
    // A close that is still going back through history would land after this open and undo it.
    if (V.backPending) {
      const go = () => { window.removeEventListener("popstate", go); clearTimeout(t); V.backPending = false; open(list, i, fromImg, frame); };
      const t = setTimeout(go, 350);
      window.addEventListener("popstate", go);
      return;
    }
    // Cancel anything left from a close still animating.
    V.ctok = (V.ctok || 0) + 1;
    document.querySelectorAll(".vw-fly").forEach((f) => f.remove());
    V.img.getAnimations().forEach((a) => a.cancel());
    if (V.anim) { clearTimeout(V.slideT); V.anim = null; }
    hidePeek();
    V.el.classList.remove("sliding");
    V.img.style.visibility = "";
    $(".vw-ui", V.el).style.opacity = "";
    const opener = document.activeElement;
    V.opener = opener;
    V.list = list.filter(Boolean);
    V.i = Math.max(0, Math.min(V.list.length - 1, i));
    V.frame = null;
    V.ff = GP.app.frameFilter;
    // a list from opened bursts already holds every frame: step them as single photographs
    V.loose = !!GP.app.burstsExpanded;
    // a burst opens on the frame its tile was showing (flicked to by hover or swipe)
    if (frame && !V.loose && framesOf(V.list[V.i]).includes(frame)) V.frame = frame;
    const wasOpen = V.open;
    V.open = true;
    V.el.hidden = false;
    document.documentElement.style.overflow = "hidden";
    if (!wasOpen) {
      const x = V.list[V.i];
      const h = GP.app.parseHash();
      if (h.q.get("p") !== x.id) { h.q.set("p", x.id); history.pushState({ gpViewer: 1 }, "", GP.app.hashFor(h.parts, h.q)); V.pushed = true; }
    }
    if (!wasOpen) { let pref = null; try { pref = localStorage.getItem("gp-info"); } catch (e) { /* ignore */ } V.el.classList.toggle("info", pref === "1" && innerWidth > 860); $('[data-v="info"]', V.el).setAttribute("aria-pressed", String(V.el.classList.contains("info"))); }
    requestAnimationFrame(() => V.el.classList.add("open"));
    show({ fly: !wasOpen ? fromImg : null });
    $('[data-v="close"]', V.el).focus({ preventScroll: true });
    wake();
  }
  function close(o = {}) {
    clearTimeout(V.bigT); clearTimeout(V.fullT);
    if (!V.open) return;
    V.open = false;
    V.tinted = false;
    if (V.anim) { clearTimeout(V.slideT); V.anim = null; }
    hidePeek();
    V.el.classList.remove("sliding");
    clearTimeout(V.idleT);
    fxClear();
    if (GP.tint) GP.tint.restore();
    document.dispatchEvent(new CustomEvent("gp:viewer-close"));
    const x = cur();
    const tok = (V.ctok = (V.ctok || 0) + 1);
    const done = () => {
      if (tok !== V.ctok) return; // reopened meanwhile
      V.el.hidden = true;
      V.el.classList.remove("open", "info", "idle", "dragging", "sliding");
      if (V.anim) { clearTimeout(V.slideT); V.anim = null; }
      hidePeek();
      V.img.removeAttribute("src");
      document.documentElement.style.overflow = "";
      if (V.opener && V.opener.focus && document.contains(V.opener)) V.opener.focus({ preventScroll: true });
    };
    if (!o.fromRoute) {
      const h = GP.app.parseHash();
      if (h.q.get("p")) {
        if (V.pushed && history.state && history.state.gpViewer) {
          V.backPending = true;
          window.addEventListener("popstate", () => { V.backPending = false; }, { once: true });
          setTimeout(() => { V.backPending = false; }, 1000);
          history.back();
        }
        else { h.q.delete("p"); history.replaceState(null, "", GP.app.hashFor(h.parts, h.q)); }
      }
    }
    V.pushed = false;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const target = !o.instant && !reduced() && x ? findTile(x) : null;
    V.el.classList.remove("open");
    if (target) {
      const r = target.getBoundingClientRect(), ir = V.img.getBoundingClientRect();
      if (r.width && r.bottom > 0 && r.top < innerHeight && ir.width) {
        const fly = flyEl(V.img.currentSrc || V.img.src, ir);
        V.img.style.visibility = "hidden";
        $(".vw-ui", V.el).style.opacity = "0";
        const a = fly.animate([{ left: ir.left + "px", top: ir.top + "px", width: ir.width + "px", height: ir.height + "px" }, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" }], { duration: 380, easing: EASE, fill: "forwards" });
        a.onfinish = () => { fly.remove(); V.img.style.visibility = ""; $(".vw-ui", V.el).style.opacity = ""; done(); };
        return;
      }
    }
    if (o.instant || reduced()) done();
    else { V.img.animate([{ opacity: 1 }, { opacity: 0, scale: "0.96" }], { duration: 240, easing: EASE, fill: "forwards" }).onfinish = (a) => { done(); if (a && a.target) a.target.cancel(); }; }
  }
  function findTile(x) {
    const ids = [x.id, x.burst && x.burst.hero.id].filter(Boolean);
    for (const id of ids) {
      const t = document.querySelector(`#gp-main [data-id="${CSS.escape(id)}"] img, #gp-main img[data-id="${CSS.escape(id)}"]`);
      if (t) return t;
    }
    return null;
  }
  function flyEl(srcUrl, r) {
    const f = document.createElement("img");
    f.className = "vw-fly";
    f.src = srcUrl;
    Object.assign(f.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
    document.body.appendChild(f);
    return f;
  }

  /* ---------- showing a photograph ---------- */
  const cur = () => V.frame || V.list[V.i];
  // The frames of a photograph's burst this viewer shows: in a filtered gallery only the ones the
  // filter lets through (as its tile did), otherwise all of them.
  function framesOf(x) {
    const b = x && x.burst;
    if (!b) return x ? [x] : [];
    const f = GP.model.framesOf(b, V.ff);
    return f.includes(x) ? f : b.frames;
  }
  /* ---------- the photograph on stage: its colours, its depth, its light, its burst ---------- */
  function fxClear() {
    clearTimeout(V.fxT);
    if (V.liveStop) { V.liveStop(); V.liveStop = null; }
    if (V.surf) { V.surf.destroy(); V.surf = null; }
    if (V.fxbox) { V.fxbox.innerHTML = ""; V.fxbox.removeAttribute("data-ripple"); }
    const lb = $('[data-v="live"]', V.el);
    if (lb) lb.setAttribute("aria-pressed", "false");
  }
  function fxFor(x, tok) {
    const sp = x.spKey ? GP.app.model.speciesByKey.get(x.spKey) : null;
    if (sp && sp.call) V.fxbox.setAttribute("data-ripple", sp.slug);
    V.fxbox.style.setProperty("--fx", (x.fp[0] * 100).toFixed(1) + "%");
    V.fxbox.style.setProperty("--fy", (x.fp[1] * 100).toFixed(1) + "%");
    if (!GP.fx) return;
    GP.fx.leak(V.fxbox, x);
    const lb = $('[data-v="live"]', V.el);
    const burst = framesOf(x).length >= 2;
    if (lb) lb.hidden = !burst;
    if (x.explicit && GP.app.isRevealed && !GP.app.isRevealed(x)) return; // nothing moves under the veil
    // a burst opens still, to step through frame by frame (LIVE or V plays it); a still floats in
    // front of its background
    if (burst) return;
    V.fxT = setTimeout(() => {
      if (tok !== V.token || V.k > 1.01) return;
      V.surf = GP.fx.surface(V.img, x, { listen: V.stage, ripple: true, amount: 0.016, cls: "vw-surface", src: V.large, onReady: () => sync() });
      sync();
    }, 900);
  }
  // the overlays move and scale with the photograph
  function sync() {
    const t = V.img.style.transform;
    V.fxbox.style.width = V.bw + "px"; V.fxbox.style.height = V.bh + "px"; V.fxbox.style.transform = t;
    if (V.surf && V.surf.el) { V.surf.el.style.transformOrigin = "0 0"; V.surf.el.style.transform = t; V.surf.hide(V.k > 1.01 || V.el.classList.contains("dragging")); }
  }
  function live(once) {
    const x = cur();
    const fr = framesOf(x);
    if (!GP.fx || !x || fr.length < 2) return;
    const lb = $('[data-v="live"]', V.el);
    if (V.liveStop) { V.liveStop(); V.liveStop = null; if (lb) lb.setAttribute("aria-pressed", "false"); return; }
    if (V.surf) { V.surf.destroy(); V.surf = null; }
    if (lb) lb.setAttribute("aria-pressed", "true");
    const w = Math.min(2048, Math.max(V.bw, V.bh) * Math.min(2, devicePixelRatio || 1));
    const strip = $(".vw-strip", V.el);
    V.liveStop = GP.fx.play(V.img, x, {
      width: w, once: !!once, crossfade: false, frames: fr,
      onFrame: (k) => { strip.querySelectorAll("[data-frame]").forEach((b, n) => b.classList.toggle("live", n === k)); badge(`live · frame ${k + 1} of ${fr.length}`); },
      onEnd: () => { V.liveStop = null; if (lb) lb.setAttribute("aria-pressed", "false"); strip.querySelectorAll(".live").forEach((b) => b.classList.remove("live")); badge(); },
    });
  }
  function show(o = {}) {
    const x = cur();
    if (!x) return;
    const tok = ++V.token;
    V.full = null;
    fxClear();
    layout();
    // the page takes the photograph's colours as the viewer opens; stepping on doesn't restyle it
    if (GP.tint) { if (V.tinted && GP.tint.context) GP.tint.context(x); else GP.tint.set(x); V.tinted = true; }
    const h = H();
    // Whatever copy is already here shows at once (never a blank); the preview and then a copy
    // sized to the screen replace it as each finishes arriving (see upgrade()).
    const small = o.src || (o.fly && o.fly.currentSrc ? o.fly.currentSrc : readySrc(x));
    const large = h.src(x, bigW());
    V.large = large || small;
    V.img.src = small;
    V.img.alt = h.titleOf(x);
    V.img.style.width = V.bw + "px";
    V.img.style.height = V.bh + "px";
    fit(false);
    upgrade(x, tok, small, large);
    if (o.fly && !reduced()) {
      const r = o.fly.getBoundingClientRect(), ir = V.img.getBoundingClientRect();
      if (r.width && ir.width) {
        const fly = flyEl(small, r);
        V.img.style.visibility = "hidden";
        fly.animate([{ left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: "2px" }, { left: ir.left + "px", top: ir.top + "px", width: ir.width + "px", height: ir.height + "px", borderRadius: "0px" }], { duration: 460, easing: EASE, fill: "forwards" }).onfinish = () => { V.img.style.visibility = ""; fly.remove(); };
      }
    } else if (o.dir && !reduced()) {
      V.img.animate([{ opacity: 0, translate: `${o.dir * 48}px 0` }, { opacity: 1, translate: "0 0" }], { duration: 340, easing: EASE });
    }
    ambient(x);
    paintVeil(x);
    $(".vw-top .t b", V.el).textContent = h.titleOf(x);
    $(".vw-top .t span", V.el).textContent = [h.fmtDate(x.t), h.fmtTime(x), x.outing].filter(Boolean).join(" · ");
    const dl = $('[data-v="download"]', V.el);
    const d = GP.app.adapter.download ? GP.app.adapter.download(x) : null;
    dl.hidden = !d;
    if (d && typeof d === "string") { dl.href = d; dl.setAttribute("download", x.name); } else dl.removeAttribute("href");
    $$('[data-v="share"]', V.el).forEach((b) => { b.hidden = !shareUrl(x); });
    paintFav(x);
    const steps = V.list.length > 1 || framesOf(x).length > 1;
    $(".vw-prev", V.el).hidden = !steps;
    $(".vw-next", V.el).hidden = !steps;
    strip(x);
    badge();
    renderInfo(x);
    preload();
    sync();
    fxFor(x, tok);
    document.dispatchEvent(new CustomEvent("gp:viewer-show", { detail: { x } }));
    const hh = GP.app.parseHash();
    if (hh.q.get("p") && hh.q.get("p") !== x.id) { hh.q.set("p", x.id); history.replaceState(history.state, "", GP.app.hashFor(hh.parts, hh.q)); }
  }
  // The room behind the photograph glows with its colours: the tiny preview, enlarged (it is soft
  // already, so no blur filter has to be redrawn), cross-fading between two layers by opacity as
  // the photographs change. A sensitive one, still veiled, lends only its palette.
  function ambient(x) {
    const pal = (x.pal || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    const veiled = x.explicit && !GP.app.isRevealed(x);
    const bg = x.lq && !veiled ? `url("${x.lq}")` : pal.length ? `radial-gradient(70% 70% at 30% 35%, ${pal[0]}, transparent 75%), radial-gradient(70% 70% at 75% 70%, ${pal[1] || pal[0]}, transparent 75%), ${pal[2] || pal[0]}` : "none";
    const a = V.ambs[V.ambI], b = V.ambs[1 - V.ambI];
    if (a.dataset.bg === bg) return;
    b.style.background = bg.startsWith("url") ? `${bg} center / cover no-repeat` : bg;
    b.dataset.bg = bg;
    b.classList.add("on"); a.classList.remove("on");
    V.ambI = 1 - V.ambI;
  }
  // A photograph marked sensitive stays blurred, with its notice, until the visitor asks to see it.
  function paintVeil(x) {
    const on = !!(x && x.explicit && GP.app.isRevealed && !GP.app.isRevealed(x));
    V.el.classList.toggle("veiled", on);
    $(".vw-veil", V.el).hidden = !on;
  }
  // The burst's frames under the photograph. Stepping within the same burst only moves the
  // highlight; the strip scrolls itself (never the page behind) once the photograph has landed.
  function strip(x) {
    const s = $(".vw-strip", V.el), fr = framesOf(x), box = $(".vw-frames", V.el);
    if (fr.length < 2) { box.hidden = true; s.innerHTML = ""; s.dataset.key = ""; return; }
    box.hidden = false;
    const key = fr.map((f) => f.id).join(",");
    const same = s.dataset.key === key;
    if (!same) {
      const h = H();
      s.innerHTML = fr.map((f, i) => `<button role="option" data-frame="${i}" class="${f.explicit && !GP.app.isRevealed(f) ? "veiled" : ""}" aria-selected="false" aria-label="Frame ${i + 1} of ${fr.length}"><img src="${h.esc(h.src(f, 160))}" alt="" loading="lazy"></button>`).join("");
      s.dataset.key = key;
    }
    const k = fr.indexOf(x);
    [...s.children].forEach((b, i) => { b.classList.toggle("on", i === k); b.setAttribute("aria-selected", String(i === k)); });
    requestAnimationFrame(() => {
      const on = s.children[k];
      if (!on || !s.isConnected) return;
      const left = on.offsetLeft - (s.clientWidth - on.offsetWidth) / 2;
      if (same && !reduced()) s.scrollTo({ left, behavior: "smooth" }); else s.scrollLeft = left;
    });
  }
  function badge(extra) {
    const x = cur(), fr = framesOf(x);
    const parts = [];
    if (V.list.length > 1) parts.push(`${V.i + 1} / ${V.list.length}`);
    if (fr.length > 1) parts.push(`frame ${fr.indexOf(x) + 1} of ${fr.length}`);
    parts.push(extra || (V.full ? `full resolution · ${x.W} × ${x.H}` : V.k > 1.02 ? `${Math.round(V.k * 100)}%` : ""));
    $(".vw-badge", V.el).textContent = parts.filter(Boolean).join(" · ");
  }
  function bigW() { return Math.min(2560, Math.max(V.sw, V.sh) * Math.min(2, devicePixelRatio || 1)); }
  /* ---------- loading: preview first, then the photograph at the screen's size ---------- */
  // The preview is quick to fetch (in the Workshop it is the preview the Workshop made; on the site,
  // Google's small copy of the public photograph). The copy sized to the screen replaces it only
  // once it has fully arrived and been decoded, so the swap is instant and never a blank.
  const PREVIEW = 720, SIZES = [360, 540, 720, 960, 1280, 1600, 2048, 2560];
  const loaded = (u) => { const im = u && V.pre.get(u); return !!(im && im.complete && im.naturalWidth); };
  function warm(u) {
    if (!u || V.pre.has(u)) return V.pre.get(u);
    const im = new Image();
    im.decoding = "async";
    im.src = u;
    V.pre.set(u, im);
    if (V.pre.size > 48) V.pre = new Map([...V.pre].slice(-24));
    return im;
  }
  // how sharp a copy is: its width, as far as it can be told (the blurred placeholder counts as 0)
  function widthOf(y, u, large) {
    if (!u || u.startsWith("data:")) return 0;
    if (u === large) return 1e5;
    const h = H();
    for (const w of SIZES) if (h.src(y, w) === u) return w;
    return 1;
  }
  function upgrade(x, tok, first, large) {
    const h = H(), pre = h.src(x, PREVIEW);
    V.sharp = widthOf(x, first, large);
    // the big copy of the photograph before, if it is still on its way, gives way to this one's
    for (const im of V.loads || []) if (!im.complete) { V.pre.delete(im.src); im.src = ""; }
    V.loads = [];
    const step = (u, w, big) => {
      if (!u || V.sharp >= w) return;
      const im = warm(u);
      if (big) V.loads.push(im);
      const ready = im.decode ? im.decode() : new Promise((res, rej) => { im.onload = res; im.onerror = rej; });
      ready.then(() => {
        if (tok !== V.token || V.full || V.sharp >= w) return;
        V.img.src = u;
        V.sharp = w;
        if (big) preloadNext();
      }, () => {});
    };
    step(pre, PREVIEW, false);
    // the big copy once the photograph has been looked at for a moment, not for each one flicked past
    clearTimeout(V.bigT);
    V.bigT = setTimeout(() => { if (tok === V.token) step(large, 1e5, true); }, loaded(large) ? 0 : 160);
    // where originals can be had (the Workshop), the original follows on its own
    clearTimeout(V.fullT);
    if (GP.app.adapter.autoFull) V.fullT = setTimeout(() => { if (tok === V.token && V.open) loadFull(); }, 900);
  }
  // the neighbours' previews at once (cheap), so a swipe or arrow always lands on one
  function preload() {
    const h = H();
    for (const d of [1, -1]) { const t = target(d); if (t) warm(h.src(t.x, PREVIEW)); }
  }
  // once this photograph is sharp, the neighbours' big copies too, where the connection allows
  function preloadNext() {
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g|3g/.test(c.effectiveType || ""))) return;
    const h = H(), w = bigW();
    for (const d of [1, -1]) { const t = target(d); if (t) warm(h.src(t.x, w)); }
  }
  function moreLike(x) {
    const h = H(), list = similar(x);
    V.similar = list;
    if (!list.length) return "";
    return `<div class="vw-more"><div class="sc">More like this</div><div class="vw-more-grid">${list.map((y, i) => `<button data-similar="${i}" title="${h.esc(h.titleOf(y) + " · " + h.fmtShort(y.t))}" aria-label="${h.esc(h.titleOf(y) + ", " + h.fmtDate(y.t))}">${h.cover(y, 240)}</button>`).join("")}</div></div>`;
  }
  function renderInfo(x) {
    const h = H(), ws = GP.app.workshop;
    const sp = x.spKey ? GP.app.model.speciesByKey.get(x.spKey) : null;
    const stars = ws && ws.rate
      ? `<div class="stars" role="radiogroup" aria-label="Rating">${[1, 2, 3, 4, 5].map((n) => `<button role="radio" aria-checked="${x.rating === n}" class="${n <= x.rating ? "on" : ""}" data-rate="${n}" aria-label="${n} star${n > 1 ? "s" : ""}">★</button>`).join("")}</div>`
      : x.rating ? `<div class="stars" aria-label="${x.rating} of 5">${"★".repeat(x.rating)}<span style="color:var(--line)">${"★".repeat(5 - x.rating)}</span></div>` : "";
    const pal = x.pal.length ? `<div class="pal" aria-label="Palette">${x.pal.map((c) => `<button style="background:${h.esc(c)}" data-colour="${h.esc(c)}" title="${h.esc(c)}" aria-label="Colour ${h.esc(c)}"></button>`).join("")}</div>` : "";
    const dl = GP.app.adapter.download ? GP.app.adapter.download(x) : null;
    V.info.innerHTML = `
<div class="kicker">${h.esc([x.famName, x.light].filter(Boolean).join(" · ") || "Photograph")}</div>
<h2${sp ? ` data-sing="${h.esc(sp.slug)}"` : ""}>${h.esc(h.titleOf(x))}</h2>${x.sci && x.common ? `<div class="binomial">${h.esc(x.sci)}${x.unsure ? " · probable" : ""}</div>` : ""}
${stars}
${sp && sp.call && GP.calls ? GP.calls.player(sp, true) : ""}
${x.caption ? `<p>${h.esc(x.caption)}</p>` : ""}
${sp && sp.note ? `<p class="note">${h.esc(sp.note)}</p>` : ""}
${h.specimenTag(x)}
${GP.shot ? GP.shot.panel(x) + GP.shot.almanac(x) : ""}
${pal}
<div class="acts">${dl ? `<a class="btn primary" data-v="download" ${typeof dl === "string" ? `href="${h.esc(dl)}" download="${h.esc(x.name)}"` : ""} target="_blank" rel="noopener">${h.ICON.download} Download original</a>` : ""}${shareUrl(x) ? `<button class="btn" data-v="share">${h.ICON.share} Share</button>` : ""}</div>
<div class="acts">${sp ? `<a class="btn ghost" href="#/species/${h.esc(sp.slug)}">All ${h.esc(sp.name)} ${h.ICON.arrow}</a>` : ""}<a class="btn ghost" href="#/outings/${h.esc(x.oid || x.fid)}">This outing ${h.ICON.arrow}</a></div>
${moreLike(x)}
${ws && ws.infoExtra ? ws.infoExtra(x) : ""}`;
    if (GP.shot && V.el.classList.contains("info")) GP.shot.mount(V.info);
  }

  /* ---------- geometry ---------- */
  function layout() {
    const x = cur();
    const r = V.stage.getBoundingClientRect();
    V.sw = r.width || innerWidth; V.sh = r.height || innerHeight;
    const pad = V.sw < 700 ? 0 : 0.035;
    const fk = Math.min((V.sw * (1 - pad * 2)) / x.ar, V.sh * (1 - pad * 2.4));
    V.bh = Math.round(fk); V.bw = Math.round(fk * x.ar);
    if (V.bw > V.sw) { V.bw = Math.round(V.sw); V.bh = Math.round(V.sw / x.ar); }
    V.img.style.width = V.bw + "px";
    V.img.style.height = V.bh + "px";
    V.kmax = Math.max(3, Math.min(10, (x.W || V.bw) / V.bw * 1.25));
  }
  function clampXY(k, tx, ty, rubber = false) {
    const cw = V.bw * k, ch = V.bh * k;
    const lim = (t, c, s) => {
      if (c <= s) return (s - c) / 2;
      const lo = s - c, hi = 0;
      if (t > hi) return rubber ? hi + (t - hi) * 0.3 : hi;
      if (t < lo) return rubber ? lo + (t - lo) * 0.3 : lo;
      return t;
    };
    return [lim(tx, cw, V.sw), lim(ty, ch, V.sh)];
  }
  function apply(anim) {
    V.img.style.transition = anim ? `transform ${anim}ms ${EASE}` : "none";
    V.img.style.transform = `translate3d(${V.tx}px,${V.ty}px,0) scale(${V.k})`;
    V.img.classList.toggle("grab", V.k > 1.01);
    $('[data-v="zoom"]', V.el).setAttribute("aria-pressed", String(V.k > 1.01));
    minimap();
    if (V.fxbox) sync();
  }
  function fit(anim = true) {
    V.k = 1;
    [V.tx, V.ty] = clampXY(1, 0, 0);
    apply(anim ? 380 : 0);
    badge();
  }
  function zoomTo(k, px, py, anim) {
    k = Math.max(1, Math.min(V.kmax, k));
    const cx = (px - V.tx) / V.k, cy = (py - V.ty) / V.k;
    V.k = k;
    [V.tx, V.ty] = clampXY(k, px - cx * k, py - cy * k);
    apply(anim);
    if (k > 1.6) loadFull();
    badge();
  }
  function toggleZoom(cx, cy) {
    const r = V.stage.getBoundingClientRect();
    const px = cx == null ? V.sw / 2 : cx - r.left, py = cy == null ? V.sh / 2 : cy - r.top;
    if (V.k > 1.02) fit(true);
    else zoomTo(Math.min(V.kmax, Math.max(2.5, (cur().W || V.bw) / V.bw)), px, py, 420);
  }
  function loadFull() {
    const x = cur();
    if (V.full || V.fullLoading === x.id || !GP.app.adapter.full) return;
    V.fullLoading = x.id;
    const tok = V.token;
    badge("loading full resolution…");
    Promise.resolve(GP.app.adapter.full(x)).then((url) => {
      if (!url) throw new Error("no original");
      return new Promise((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => res(url); im.onerror = rej; im.src = url; });
    }).then((url) => {
      if (tok !== V.token) return;
      V.full = url; V.img.src = url; badge();
    }).catch(() => { if (tok === V.token) badge(); }).finally(() => { if (V.fullLoading === x.id) V.fullLoading = null; });
  }
  function minimap() {
    if (!V.mini) return;
    if (V.k <= 1.02) { V.mini.hidden = true; return; }
    V.mini.hidden = false;
    const mi = V.mini.querySelector("img"), box = V.mini.querySelector("i");
    const s = H().src(cur(), 320);
    if (mi.getAttribute("src") !== s) mi.src = s;
    const cw = V.bw * V.k, ch = V.bh * V.k;
    const l = Math.max(0, -V.tx / cw), t = Math.max(0, -V.ty / ch), w = Math.min(1, V.sw / cw), h = Math.min(1, V.sh / ch);
    Object.assign(box.style, { left: l * 100 + "%", top: t * 100 + "%", width: w * 100 + "%", height: h * 100 + "%" });
  }

  /* ---------- navigation ---------- */
  function go(d) {
    if (V.list.length < 2) return;
    const n = V.i + d;
    if (n < 0 || n >= V.list.length) { nudge(d); return; }
    V.i = n; V.frame = null;
    show({ dir: d });
  }
  // Left and right (keys, side arrows, swipes): through every frame of a burst first, then on to
  // the next photograph. Coming into a burst forwards starts at its first frame, backwards at its
  // last, so nothing in it is skipped either way.
  // What a step left or right would show, without going there.
  function target(d) {
    const x = cur(), fr = framesOf(x);
    if (fr.length > 1 && !V.loose) {
      const i = fr.indexOf(x) + d;
      if (i >= 0 && i < fr.length) return { i: V.i, frame: fr[i], x: fr[i] };
    }
    const n = V.i + d;
    if (V.list.length < 2 || n < 0 || n >= V.list.length) return null;
    const nf = framesOf(V.list[n]);
    const frame = nf.length > 1 && !V.loose ? nf[d > 0 ? 0 : nf.length - 1] : null;
    return { i: n, frame, x: frame || V.list[n] };
  }
  function commit(t, o = {}) { V.i = t.i; V.frame = t.frame; show(o); }
  // Keys, the side arrows and a trackpad's sideways swipe slide the next frame or photograph in,
  // exactly as a swipe does (a frame of a burst and the next photograph move the same way).
  function step(d) {
    if (V.anim) V.anim.finish();
    if (V.liveStop) { V.liveStop(); V.liveStop = null; }
    const t = target(d);
    if (!t) { nudge(d); return; }
    if (reduced() || V.k > 1.01 || !V.sw) { commit(t, { dir: d }); return; }
    const pk = peekFor(t, d);
    V.peek.style.transition = "none";
    placePeek(pk, 0);
    V.el.classList.add("sliding");
    if (V.surf) V.surf.hide(true);
    requestAnimationFrame(() => slideIn(t, d, pk, 0, 0));
  }

  /* ---------- swiping: the next frame or photograph comes in beside this one ---------- */
  const GAP = 28, SLIDE_EASE = "cubic-bezier(.22,.72,.2,1)";
  // the box a photograph fits on this stage, centred (as layout() fits the current one)
  function boxFor(y) {
    const pad = V.sw < 700 ? 0 : 0.035;
    const fk = Math.min((V.sw * (1 - pad * 2)) / y.ar, V.sh * (1 - pad * 2.4));
    let bh = Math.round(fk), bw = Math.round(fk * y.ar);
    if (bw > V.sw) { bw = Math.round(V.sw); bh = Math.round(V.sw / y.ar); }
    return { w: bw, h: bh, x: (V.sw - bw) / 2, y: (V.sh - bh) / 2 };
  }
  // The sharpest copy already here, so the incoming photograph shows the moment it is needed: its
  // big copy or preview if loaded, else its picture on the page behind (a tile, a print, a card),
  // else its blurred placeholder, which is always to hand.
  function readySrc(y) {
    const h = H(), big = h.src(y, bigW()), pre = h.src(y, PREVIEW);
    if (loaded(big)) return big;
    if (loaded(pre)) return pre;
    const id = CSS.escape(y.id);
    for (const el of document.querySelectorAll(`#gp-main [data-id="${id}"], #gp-main [data-open="${id}"]`)) {
      if (el._frame && el._frame !== y.id) continue; // a burst's tile flicked to another frame
      const im = el.tagName === "IMG" ? el : el.querySelector("img");
      if (im && im.complete && im.naturalWidth && im.currentSrc) return im.currentSrc;
    }
    return y.lq || pre;
  }
  function peekFor(t, d) {
    const y = t.x, b = boxFor(y), src = readySrc(y);
    if (V.peek.dataset.src !== src) { V.peek.src = src; V.peek.dataset.src = src; }
    V.peek.style.width = b.w + "px"; V.peek.style.height = b.h + "px";
    V.peek.classList.toggle("veiled", !!(y.explicit && !GP.app.isRevealed(y)));
    V.peek.style.visibility = "visible";
    return { b, off: d * (V.sw + GAP) };
  }
  function placePeek(pk, dx) { V.peek.style.transform = `translate3d(${pk.b.x + pk.off + dx}px,${pk.b.y}px,0)`; }
  function hidePeek() { if (!V.peek) return; V.peek.style.transition = "none"; V.peek.style.visibility = "hidden"; }
  function glide(el, tf, ms) { el.style.transition = ms ? `transform ${ms}ms ${SLIDE_EASE}` : "none"; el.style.transform = tf; }
  // Both photographs travel together: this one out, the next to where it will rest. The speed
  // carries on from the finger's, and the photograph that lands is the one already drawn.
  function slideIn(t, d, pk, dx, vx) {
    const dist = V.sw + GAP - Math.abs(dx);
    const ms = reduced() ? 0 : Math.round(Math.min(360, Math.max(180, dist / Math.max(1.2, Math.abs(vx)))));
    V.el.classList.add("sliding");
    glide(V.img, `translate3d(${V.tx - d * (V.sw + GAP)}px,${V.ty}px,0)`, ms);
    glide(V.peek, `translate3d(${pk.b.x}px,${pk.b.y}px,0)`, ms);
    const src = V.peek.dataset.src;
    let over = false;
    const finish = () => {
      if (over) return;
      over = true; clearTimeout(V.slideT); V.anim = null;
      V.el.classList.remove("sliding");
      commit(t, { src });
      hidePeek();
    };
    V.anim = { finish };
    V.slideT = setTimeout(finish, ms + 30);
  }
  function slideBack(pk) {
    const ms = reduced() ? 0 : 260;
    glide(V.img, `translate3d(${V.tx}px,${V.ty}px,0) scale(1)`, ms);
    if (pk) glide(V.peek, `translate3d(${pk.b.x + pk.off}px,${pk.b.y}px,0)`, ms);
    clearTimeout(V.slideT);
    V.slideT = setTimeout(() => { if (!V.g) { hidePeek(); V.el.classList.remove("sliding"); sync(); } }, ms + 30);
  }
  function frame(d) {
    if (V.liveStop) { V.liveStop(); V.liveStop = null; }
    const x = cur(), fr = framesOf(x);
    if (fr.length < 2) return;
    // round and round: from the last frame the next is the first
    const i = (fr.indexOf(x) + d + fr.length) % fr.length;
    V.frame = fr[i];
    show({});
  }
  function nudge(d) {
    if (reduced()) return;
    V.img.animate([{ translate: "0 0" }, { translate: `${-d * 18}px 0` }, { translate: "0 0" }], { duration: 300, easing: EASE });
  }

  /* ---------- gestures ---------- */
  function onDown(e) {
    if (e.target.closest(".vw-ui > *:not(.vw-mini)") && e.target !== V.stage) return;
    if (e.target.closest(".vw-veil")) return; // its Show photo button takes the click, not a drag
    if (V.anim) V.anim.finish();
    V.stage.setPointerCapture(e.pointerId);
    V.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelInertia();
    const r = V.stage.getBoundingClientRect();
    if (V.ptrs.size === 1) {
      V.g = { mode: "pan", x0: e.clientX, y0: e.clientY, tx0: V.tx, ty0: V.ty, moved: false, t0: performance.now(), samples: [], left: r.left, top: r.top, onImg: e.target === V.img };
    } else if (V.ptrs.size === 2) {
      const [a, b] = [...V.ptrs.values()];
      V.g = { mode: "pinch", d0: Math.hypot(a.x - b.x, a.y - b.y), k0: V.k, mx0: (a.x + b.x) / 2 - r.left, my0: (a.y + b.y) / 2 - r.top, tx0: V.tx, ty0: V.ty, moved: true, left: r.left, top: r.top };
    }
    V.img.style.willChange = "transform";
  }
  function onMove(e) {
    if (!V.ptrs.has(e.pointerId) || !V.g) return;
    V.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = V.g;
    if (g.mode === "pinch" && V.ptrs.size >= 2) {
      const [a, b] = [...V.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2 - g.left, my = (a.y + b.y) / 2 - g.top;
      const k = Math.max(0.7, Math.min(V.kmax * 1.15, g.k0 * (d / g.d0)));
      const cx = (g.mx0 - g.tx0) / g.k0, cy = (g.my0 - g.ty0) / g.k0;
      V.k = k;
      [V.tx, V.ty] = clampXY(k, mx - cx * k, my - cy * k, true);
      apply(0);
      if (k > 1.6) loadFull();
      return;
    }
    if (g.mode !== "pan") return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < 6) return;
    g.moved = true;
    const now = performance.now();
    g.samples.push({ t: now, x: e.clientX, y: e.clientY });
    while (g.samples.length > 5) g.samples.shift();
    if (V.k > 1.01) {
      [V.tx, V.ty] = clampXY(V.k, g.tx0 + dx, g.ty0 + dy, true);
      V.img.classList.add("grabbing");
      apply(0);
    } else {
      // at fit: horizontal swipes page, a downward drag dismisses
      if (!g.axis) g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      V.el.classList.add("dragging");
      if (g.axis === "x") {
        if (!g.nb) { g.nb = { 1: target(1), "-1": target(-1) }; if (V.surf) V.surf.hide(true); }
        const d = dx < 0 ? 1 : -1, t = g.nb[d];
        // at either end of the list the photograph pulls against the finger
        const mx = t ? dx : dx * 0.32;
        V.img.style.transition = "none";
        V.img.style.transform = `translate3d(${V.tx + mx}px,${V.ty}px,0) scale(1)`;
        if (t) { if (g.pd !== d) { V.peek.style.transition = "none"; g.pk = peekFor(t, d); g.pd = d; } placePeek(g.pk, dx); }
        else if (g.pd) { hidePeek(); g.pd = 0; g.pk = null; }
      }
      else if (g.axis === "y" && dy > 0) {
        const s = 1 - Math.min(0.25, dy / 1600);
        V.img.style.transition = "none";
        V.img.style.transform = `translate3d(${V.tx + dx * 0.4 + (V.bw * (1 - s)) / 2}px,${V.ty + dy}px,0) scale(${s})`;
        $(".vw-bg", V.el).style.opacity = String(Math.max(0.15, 1 - dy / 500));
      }
    }
  }
  function onUp(e) {
    if (!V.ptrs.has(e.pointerId)) return;
    V.ptrs.delete(e.pointerId);
    const g = V.g;
    if (!g) return;
    if (g.mode === "pinch") {
      if (V.ptrs.size === 1) { const [p] = [...V.ptrs.values()]; V.g = { mode: "pan", x0: p.x, y0: p.y, tx0: V.tx, ty0: V.ty, moved: true, samples: [], left: g.left, top: g.top }; return; }
      V.g = null;
      settle();
      return;
    }
    if (V.ptrs.size) return;
    V.g = null;
    V.img.classList.remove("grabbing");
    V.el.classList.remove("dragging");
    sync();
    $(".vw-bg", V.el).style.opacity = "";
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved) { tap(e, g); return; }
    const v = velocity(g.samples);
    if (V.k > 1.01) { inertia(v); return; }
    if (g.axis === "x") {
      const d = dx < 0 ? 1 : -1, t = g.nb && g.nb[d];
      const flick = Math.abs(v.x) > 0.35 && Math.sign(v.x) === Math.sign(dx);
      if (t && g.pk && (Math.abs(dx) > Math.min(70, V.sw * 0.18) || flick)) { slideIn(t, d, g.pk, dx, v.x); return; }
      slideBack(g.pd ? g.pk : null);
      return;
    }
    if (g.axis === "y" && (dy > 110 || v.y > 0.7)) { close(); return; }
    apply(260);
  }
  function tap(e, g) {
    const now = performance.now();
    if (e.pointerType !== "mouse" && now - V.lastTap < 300) { V.lastTap = 0; clearTimeout(V.tapT); toggleZoom(e.clientX, e.clientY); return; }
    V.lastTap = now;
    if (e.pointerType === "mouse") {
      if (!g.onImg && V.k <= 1.01) close();
      return;
    }
    clearTimeout(V.tapT);
    V.tapT = setTimeout(() => V.el.classList.toggle("idle"), 260);
  }
  function velocity(s) {
    if (s.length < 2) return { x: 0, y: 0 };
    const a = s[0], b = s[s.length - 1], dt = Math.max(1, b.t - a.t);
    if (performance.now() - b.t > 80) return { x: 0, y: 0 };
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }
  function inertia(v) {
    let vx = v.x * 16, vy = v.y * 16;
    const step = () => {
      vx *= 0.93; vy *= 0.93;
      const [nx, ny] = clampXY(V.k, V.tx + vx, V.ty + vy, false);
      if (nx !== V.tx + vx) vx = 0;
      if (ny !== V.ty + vy) vy = 0;
      V.tx = nx; V.ty = ny;
      apply(0);
      if (Math.abs(vx) + Math.abs(vy) > 0.4) V.raf = requestAnimationFrame(step);
      else settle();
    };
    if (reduced()) { settle(); return; }
    V.raf = requestAnimationFrame(step);
  }
  function cancelInertia() { cancelAnimationFrame(V.raf); }
  function settle() {
    if (V.k < 1) { fit(true); V.img.style.willChange = ""; return; }
    V.k = Math.min(V.kmax, V.k);
    [V.tx, V.ty] = clampXY(V.k, V.tx, V.ty);
    apply(280);
    badge();
    setTimeout(() => { if (!V.g) V.img.style.willChange = ""; }, 320);
  }
  function onWheel(e) {
    if (!V.open) return;
    e.preventDefault();
    const r = V.stage.getBoundingClientRect();
    if (!e.ctrlKey && V.k <= 1.01 && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5 && Math.abs(e.deltaX) > 30) {
      // a sideways trackpad swipe pages through
      if (!V.wheelLock) { V.wheelLock = true; step(e.deltaX > 0 ? 1 : -1); setTimeout(() => (V.wheelLock = false), 450); }
      return;
    }
    if (!e.ctrlKey && V.k > 1.01 && e.deltaMode === 0 && Math.abs(e.deltaX) > 0) {
      [V.tx, V.ty] = clampXY(V.k, V.tx - e.deltaX, V.ty - e.deltaY);
      apply(0);
      return;
    }
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0022));
    V.img.style.willChange = "transform";
    zoomTo(V.k * f, e.clientX - r.left, e.clientY - r.top, 0);
    clearTimeout(V.wheelT);
    V.wheelT = setTimeout(() => { V.img.style.willChange = ""; }, 200);
  }

  /* ---------- controls ---------- */
  function onClick(e) {
    const f = e.target.closest("[data-frame]");
    if (f) { V.frame = framesOf(cur())[+f.dataset.frame]; show({}); return; }
    const rate = e.target.closest("[data-rate]");
    if (rate && GP.app.workshop && GP.app.workshop.rate) {
      const n = +rate.dataset.rate, x = cur();
      const stars = rate.parentElement;
      stars.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i < n));
      stars.classList.remove("glint"); void stars.offsetWidth; stars.classList.add("glint");
      GP.app.workshop.rate(x, n === x.rating ? 0 : n);
      return;
    }
    const sim = e.target.closest("[data-similar]");
    if (sim && V.similar) { const list = V.similar.slice(); open(list, +sim.dataset.similar, sim.querySelector("img")); return; }
    const col = e.target.closest("[data-colour]");
    if (col) { const name = colourName(col.dataset.colour); if (name) { close({ instant: true, fromRoute: true }); location.hash = GP.app.hashFor(["gallery"], new URLSearchParams({ q: name })); } return; }
    const b = e.target.closest("[data-v]");
    if (!b) {
      if (e.target.closest(".vw-info a[href^='#']")) close({ instant: true, fromRoute: true });
      return;
    }
    const v = b.dataset.v;
    if (v === "close") close();
    else if (v === "unveil") { const x = cur(); if (GP.app.reveal) GP.app.reveal(x.id); paintVeil(x); strip(x); }
    else if (v === "prev") step(-1);
    else if (v === "next") step(1);
    else if (v === "info") toggleInfo();
    else if (v === "zoom") toggleZoom();
    else if (v === "fs") fullscreen();
    else if (v === "share") share();
    else if (v === "fav") fav();
    else if (v === "play") playFrom();
    else if (v === "live") live(false);
    else if (v === "fprev" || v === "fnext") { if (V.liveStop) live(false); frame(v === "fnext" ? 1 : -1); }
    else if (v === "download") { const d = GP.app.adapter.download && GP.app.adapter.download(cur()); if (d && typeof d !== "string") { e.preventDefault(); Promise.resolve(d).then((u) => { if (u) window.open(u, "_blank", "noopener"); }); } }
  }
  function colourName(hex) {
    const [h, s, l] = GP.model.hexHsl(hex);
    if (l > 0.84 && s < 0.35) return "white";
    if (l < 0.11) return "black";
    if (s < 0.12) return "grey";
    if (h >= 345 || h < 14) return "red";
    if (h < 40) return l < 0.45 ? "brown" : "orange";
    if (h < 66) return "yellow";
    if (h < 165) return "green";
    if (h < 195) return "teal";
    if (h < 255) return "blue";
    if (h < 300) return "purple";
    return "pink";
  }
  function toggleInfo(force) {
    const on = force == null ? !V.el.classList.contains("info") : force;
    V.el.classList.toggle("info", on);
    $('[data-v="info"]', V.el).setAttribute("aria-pressed", String(on));
    store("gp-info", on ? "1" : "0");
    if (on && GP.shot) GP.shot.mount(V.info);
    setTimeout(() => { layout(); fit(false); }, 400);
    if (on) V.el.classList.remove("idle");
  }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (V.el.requestFullscreen) V.el.requestFullscreen().catch(() => {});
  }
  function shareUrl(x) {
    const a = GP.app.adapter;
    if (a.shareUrl) return a.shareUrl(x);
    const h = GP.app.parseHash();
    h.q.set("p", x.id);
    return location.origin + location.pathname + GP.app.hashFor(h.parts, h.q);
  }
  function share() {
    const x = cur();
    const url = shareUrl(x);
    if (!url) return;
    const title = `${H().titleOf(x)} · ${GP.app.site.title || "Georgiadis Photography"}`;
    const copy = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => GP.app.toast("Link copied"), () => GP.app.toast(url));
      else GP.app.toast(url);
    };
    // Phones get the share sheet; elsewhere (and wherever sharing is refused) the link is copied.
    if (navigator.share && matchMedia("(pointer: coarse)").matches) navigator.share({ title, url }).catch((e) => { if (!e || e.name !== "AbortError") copy(); });
    else copy();
  }
  /* ---------- favourites, playing on, more like this ---------- */
  function paintFav(x) {
    const b = $('[data-v="fav"]', V.el);
    if (!b) return;
    // the Workshop has its own ratings; favourites belong to visitors of the public site
    b.hidden = !GP.visitor || !!GP.app.workshop;
    if (b.hidden) return;
    const on = GP.visitor.isFav(x.id);
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", on ? "Remove from your favourites" : "Add to your favourites");
    b.innerHTML = on ? H().ICON.heartOn : H().ICON.heart;
    b.classList.toggle("on", on);
  }
  function fav() {
    const x = cur();
    if (!x || !GP.visitor || GP.app.workshop) return;
    const on = GP.visitor.toggleFav(x.id);
    paintFav(x);
    const b = $('[data-v="fav"]', V.el);
    if (b && on) { b.classList.remove("pop"); void b.offsetWidth; b.classList.add("pop"); }
    GP.app.toast(on ? "Saved to your favourites" : "Removed from your favourites", on ? { label: "See them", run: () => { close({ instant: true, fromRoute: true }); location.hash = "#/rooms/favourites"; } } : null);
  }
  function playFrom() {
    if (!GP.exhibit || !V.list.length) return;
    const list = V.list.slice(V.i).concat(V.list.slice(0, V.i));
    close({ instant: true });
    setTimeout(() => GP.exhibit(list, { title: "From the viewer" }), 60);
  }
  function hueDist(a, b) {
    const pa = (a.hsl || [])[0], pb = (b.hsl || [])[0];
    if (!pa || !pb) return 1;
    const dh = Math.min(Math.abs(pa[0] - pb[0]), 360 - Math.abs(pa[0] - pb[0])) / 180;
    return dh * Math.min(pa[1], pb[1]) + Math.abs(pa[2] - pb[2]) + Math.abs(pa[1] - pb[1]) * 0.5;
  }
  // The same species from other days first, then frames that share its colour and light.
  function similar(x, n = 8) {
    const m = GP.app.model, out = [], seen = new Set([x.burst ? x.burst.id : x.id]);
    const add = (y) => { const k = y.burst ? y.burst.id : y.id; if (seen.has(k) || out.length >= n) return; seen.add(k); out.push(y); };
    const s = x.spKey ? m.speciesByKey.get(x.spKey) : null;
    if (s) {
      const other = s.heroes.filter((y) => y.oid !== x.oid), same = s.heroes.filter((y) => y.oid === x.oid);
      other.slice(0, 4).forEach(add); same.slice(0, 5 - out.length).forEach(add);
    }
    const pool = m.heroes.filter((y) => y.spKey !== x.spKey && (y.group === x.group || x.group === "scene"));
    pool.map((y) => [y, hueDist(x, y) + (y.light === x.light ? 0 : 0.15) - y.score * 0.02]).sort((a, b) => a[1] - b[1]).forEach(([y]) => add(y));
    return out;
  }
  function onKey(e) {
    if (!V.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") e.target.blur(); return; }
    const k = e.key;
    if (k === "Escape") { if (V.k > 1.02) fit(true); else close(); }
    else if (k === "ArrowRight") step(1);
    else if (k === "ArrowLeft") step(-1);
    else if (k === "ArrowDown") frame(1);
    else if (k === "ArrowUp") frame(-1);
    else if (k === "i" || k === "I") toggleInfo();
    else if (k === "z" || k === "Z") toggleZoom();
    else if (k === "0") fit(true);
    else if (k === "+" || k === "=") zoomTo(V.k * 1.5, V.sw / 2, V.sh / 2, 260);
    else if (k === "-") { if (V.k / 1.5 <= 1.02) fit(true); else zoomTo(V.k / 1.5, V.sw / 2, V.sh / 2, 260); }
    else if (k === "f" || k === "F") fullscreen();
    else if ((k === "l" || k === "L") && GP.visitor && !GP.app.workshop) fav();
    else if (k === "p" || k === "P") playFrom();
    else if (k === "v" || k === "V") live(false);
    else if ((k === "h" || k === "H") && !(GP.app.workshop && GP.app.workshop.key)) { toggleInfo(true); setTimeout(() => { const sh = V.info.querySelector(".shot"); if (sh) sh.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }); }, 120); }
    else if (k === "d" || k === "D") { const a = $('.vw-top [data-v="download"]', V.el); if (a && !a.hidden) a.click(); }
    else if (GP.app.workshop && GP.app.workshop.rate && /^[1-5]$/.test(k)) { GP.app.workshop.rate(cur(), +k); }
    else if (!(GP.app.workshop && GP.app.workshop.key && GP.app.workshop.key(k, cur()))) return;
    e.preventDefault();
    wake();
  }
  function trapTab(e) {
    if (e.key !== "Tab") return;
    const f = [...V.el.querySelectorAll("button:not([hidden]), a[href]:not([hidden]), [tabindex]:not([tabindex='-1'])")].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
    else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
  }
  function wake(e) {
    if (e && e.pointerType === "touch") return;
    V.el.classList.remove("idle");
    clearTimeout(V.idleT);
    V.idleT = setTimeout(() => {
      if (!V.open || V.el.classList.contains("info")) return;
      if (V.el.querySelector(".vw-ui :hover")) return;
      V.el.classList.add("idle");
    }, 2600);
  }
  function refresh(model) {
    if (!V.open) return;
    const ids = V.list.map((x) => x.id), fid = V.frame && V.frame.id;
    V.list = ids.map((id) => model.byId.get(id)).filter(Boolean);
    V.i = Math.min(V.i, V.list.length - 1);
    V.frame = fid ? model.byId.get(fid) : null;
    const x = cur();
    if (!x) { close({ instant: true }); return; }
    // Don't redraw the details panel under someone typing in it; catch up when they leave it.
    const ae = document.activeElement;
    if (ae && V.info.contains(ae) && ae.matches("input, textarea, select")) V.infoStale = true;
    else renderInfo(x);
    strip(x); badge(); paintVeil(x);
    $(".vw-top .t b", V.el).textContent = H().titleOf(x);
  }

  GP.viewer = { open, close, isOpen: () => V.open, current: () => (V.open && cur() ? cur().id : null), refresh, toggleInfo };

})(window.GP = window.GP || {});
