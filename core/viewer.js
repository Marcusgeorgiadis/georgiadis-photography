/* Georgiadis Photography: the viewer and exhibition mode.
   GP.viewer.open(list, index, fromImg) flies the photo out of its tile; zoom with the wheel,
   a pinch or a double tap; drag to pan with inertia; swipe to move on or down to close. */
(function (GP) {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";
  const H = () => GP.app.helpers;

  const V = { el: null, open: false, list: [], i: 0, x: null, k: 1, tx: 0, ty: 0, bw: 0, bh: 0, sw: 0, sh: 0, kmax: 3, full: null, ptrs: new Map(), g: null, idleT: 0, lastTap: 0, token: 0 };

  function build() {
    if (V.el) return;
    const I = H().ICON;
    const el = document.createElement("div");
    el.className = "vw";
    el.hidden = true;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "Photograph");
    el.innerHTML = `<div class="vw-bg"><div class="amb"></div></div>
<div class="vw-stage"><img class="vw-img" alt="" draggable="false">
  <div class="vw-ui">
    <div class="vw-top"><div class="t"><b></b><span></span></div>
      <button class="icon-btn" data-v="zoom" title="Zoom (Z)" aria-label="Zoom to full resolution" aria-pressed="false">${I.zoom}</button>
      <a class="icon-btn" data-v="download" title="Download the original (D)" aria-label="Download the original" target="_blank" rel="noopener">${I.download}</a>
      <button class="icon-btn" data-v="share" title="Share" aria-label="Share">${I.share}</button>
      <button class="icon-btn" data-v="info" title="Specimen label (I)" aria-label="Show details" aria-pressed="false">${I.info}</button>
      <button class="icon-btn" data-v="fs" title="Full screen (F)" aria-label="Full screen">${I.expand}</button>
      <button class="icon-btn" data-v="close" title="Close (Esc)" aria-label="Close">${I.close}</button>
    </div>
    <button class="vw-nav vw-prev" data-v="prev" aria-label="Previous photograph">${I.left}</button>
    <button class="vw-nav vw-next" data-v="next" aria-label="Next photograph">${I.right}</button>
    <div class="vw-bottom"><span class="vw-badge mono" aria-live="polite"></span><div class="vw-strip" role="listbox" aria-label="Frames in this burst"></div></div>
    <div class="vw-mini" hidden><img alt=""><i></i></div>
  </div>
</div>
<aside class="vw-info" aria-label="Details"><div class="in"></div></aside>`;
    document.body.appendChild(el);
    V.el = el;
    V.stage = $(".vw-stage", el);
    V.img = $(".vw-img", el);
    V.amb = $(".amb", el);
    V.info = $(".vw-info .in", el);
    V.mini = $(".vw-mini", el);
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
  function open(list, i, fromImg) {
    build();
    // A close that is still going back through history would land after this open and undo it.
    if (V.backPending) {
      const go = () => { window.removeEventListener("popstate", go); clearTimeout(t); V.backPending = false; open(list, i, fromImg); };
      const t = setTimeout(go, 350);
      window.addEventListener("popstate", go);
      return;
    }
    // Cancel anything left from a close still animating.
    V.ctok = (V.ctok || 0) + 1;
    document.querySelectorAll(".vw-fly").forEach((f) => f.remove());
    V.img.getAnimations().forEach((a) => a.cancel());
    V.img.style.visibility = "";
    $(".vw-ui", V.el).style.opacity = "";
    const opener = document.activeElement;
    V.opener = opener;
    V.list = list.filter(Boolean);
    V.i = Math.max(0, Math.min(V.list.length - 1, i));
    V.frame = null;
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
    if (!V.open) return;
    V.open = false;
    clearTimeout(V.idleT);
    const x = cur();
    const tok = (V.ctok = (V.ctok || 0) + 1);
    const done = () => {
      if (tok !== V.ctok) return; // reopened meanwhile
      V.el.hidden = true;
      V.el.classList.remove("open", "info", "idle", "dragging");
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
  function show(o = {}) {
    const x = cur();
    if (!x) return;
    const tok = ++V.token;
    V.full = null;
    layout();
    const h = H();
    // Start from whatever is already decoded (the tile), then step up to a large rendition.
    const small = o.fly && o.fly.currentSrc ? o.fly.currentSrc : h.src(x, 720);
    const large = h.src(x, Math.min(2560, Math.max(V.sw, V.sh) * Math.min(2, devicePixelRatio || 1)));
    V.img.src = small;
    V.img.alt = h.titleOf(x);
    V.img.style.width = V.bw + "px";
    V.img.style.height = V.bh + "px";
    fit(false);
    if (large && large !== small) {
      const im = new Image();
      im.decoding = "async";
      im.onload = () => { if (tok === V.token && !V.full) V.img.src = large; };
      im.src = large;
    }
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
    V.amb.style.backgroundImage = `url("${x.lq || small}")`;
    $(".vw-top .t b", V.el).textContent = h.titleOf(x);
    $(".vw-top .t span", V.el).textContent = [h.fmtDate(x.t), h.fmtTime(x), x.outing].filter(Boolean).join(" · ");
    const dl = $('[data-v="download"]', V.el);
    const d = GP.app.adapter.download ? GP.app.adapter.download(x) : null;
    dl.hidden = !d;
    if (d && typeof d === "string") { dl.href = d; dl.setAttribute("download", x.name); } else dl.removeAttribute("href");
    $$('[data-v="share"]', V.el).forEach((b) => { b.hidden = !shareUrl(x); });
    $(".vw-prev", V.el).hidden = V.list.length < 2;
    $(".vw-next", V.el).hidden = V.list.length < 2;
    strip(x);
    badge();
    renderInfo(x);
    preload();
    const hh = GP.app.parseHash();
    if (hh.q.get("p") && hh.q.get("p") !== x.id) { hh.q.set("p", x.id); history.replaceState(history.state, "", GP.app.hashFor(hh.parts, hh.q)); }
  }
  function strip(x) {
    const s = $(".vw-strip", V.el), b = x.burst;
    if (!b || b.size < 2) { s.hidden = true; s.innerHTML = ""; return; }
    s.hidden = false;
    const h = H();
    s.innerHTML = b.frames.map((f, i) => `<button role="option" data-frame="${i}" class="${f === x ? "on" : ""}" aria-selected="${f === x}" aria-label="Frame ${i + 1} of ${b.size}"><img src="${h.esc(h.src(f, 160))}" alt="" loading="lazy"></button>`).join("");
    const on = s.querySelector(".on");
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
  }
  function badge(extra) {
    const x = cur(), b = x.burst;
    const parts = [];
    if (V.list.length > 1) parts.push(`${V.i + 1} / ${V.list.length}`);
    if (b && b.size > 1) parts.push(`frame ${b.frames.indexOf(x) + 1} of ${b.size}`);
    parts.push(extra || (V.full ? `full resolution · ${x.W} × ${x.H}` : V.k > 1.02 ? `${Math.round(V.k * 100)}%` : ""));
    $(".vw-badge", V.el).textContent = parts.filter(Boolean).join(" · ");
  }
  function preload() {
    const h = H(), w = Math.min(2560, Math.max(V.sw, V.sh) * Math.min(2, devicePixelRatio || 1));
    for (const d of [1, -1]) { const n = V.list[V.i + d]; if (n) { const im = new Image(); im.src = h.src(n, w); } }
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
<h2>${h.esc(h.titleOf(x))}</h2>${x.sci && x.common ? `<div class="binomial">${h.esc(x.sci)}${x.unsure ? " · probable" : ""}</div>` : ""}
${stars}
${x.caption ? `<p>${h.esc(x.caption)}</p>` : ""}
${sp && sp.note ? `<p class="note">${h.esc(sp.note)}</p>` : ""}
${h.specimenTag(x)}
${pal}
<div class="acts">${dl ? `<a class="btn primary" data-v="download" ${typeof dl === "string" ? `href="${h.esc(dl)}" download="${h.esc(x.name)}"` : ""} target="_blank" rel="noopener">${h.ICON.download} Download original</a>` : ""}${shareUrl(x) ? `<button class="btn" data-v="share">${h.ICON.share} Share</button>` : ""}</div>
<div class="acts">${sp ? `<a class="btn ghost" href="#/species/${h.esc(sp.slug)}">All ${h.esc(sp.name)} ${h.ICON.arrow}</a>` : ""}<a class="btn ghost" href="#/outings/${h.esc(x.fid)}">This outing ${h.ICON.arrow}</a></div>
${ws && ws.infoExtra ? ws.infoExtra(x) : ""}`;
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
  function frame(d) {
    const x = cur(), b = x.burst;
    if (!b || b.size < 2) return;
    const i = b.frames.indexOf(x) + d;
    if (i < 0 || i >= b.size) return;
    V.frame = b.frames[i];
    show({});
  }
  function nudge(d) {
    if (reduced()) return;
    V.img.animate([{ translate: "0 0" }, { translate: `${-d * 18}px 0` }, { translate: "0 0" }], { duration: 300, easing: EASE });
  }

  /* ---------- gestures ---------- */
  function onDown(e) {
    if (e.target.closest(".vw-ui > *:not(.vw-mini)") && e.target !== V.stage) return;
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
      if (g.axis === "x" && V.list.length > 1) { V.img.style.transition = "none"; V.img.style.transform = `translate3d(${V.tx + dx}px,${V.ty}px,0)`; }
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
    $(".vw-bg", V.el).style.opacity = "";
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    if (!g.moved) { tap(e, g); return; }
    const v = velocity(g.samples);
    if (V.k > 1.01) { inertia(v); return; }
    if (g.axis === "x" && V.list.length > 1 && (Math.abs(dx) > 70 || Math.abs(v.x) > 0.5)) { go(dx < 0 ? 1 : -1); return; }
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
      if (!V.wheelLock) { V.wheelLock = true; go(e.deltaX > 0 ? 1 : -1); setTimeout(() => (V.wheelLock = false), 450); }
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
    if (f) { V.frame = cur().burst.frames[+f.dataset.frame]; show({}); return; }
    const rate = e.target.closest("[data-rate]");
    if (rate && GP.app.workshop && GP.app.workshop.rate) {
      const n = +rate.dataset.rate, x = cur();
      const stars = rate.parentElement;
      stars.querySelectorAll("button").forEach((b, i) => b.classList.toggle("on", i < n));
      stars.classList.remove("glint"); void stars.offsetWidth; stars.classList.add("glint");
      GP.app.workshop.rate(x, n === x.rating ? 0 : n);
      return;
    }
    const col = e.target.closest("[data-colour]");
    if (col) { const name = colourName(col.dataset.colour); if (name) { close({ instant: true, fromRoute: true }); location.hash = GP.app.hashFor(["gallery"], new URLSearchParams({ q: name })); } return; }
    const b = e.target.closest("[data-v]");
    if (!b) {
      if (e.target.closest(".vw-info a[href^='#']")) close({ instant: true, fromRoute: true });
      return;
    }
    const v = b.dataset.v;
    if (v === "close") close();
    else if (v === "prev") go(-1);
    else if (v === "next") go(1);
    else if (v === "info") toggleInfo();
    else if (v === "zoom") toggleZoom();
    else if (v === "fs") fullscreen();
    else if (v === "share") share();
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
  function onKey(e) {
    if (!V.open || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") { if (e.key === "Escape") e.target.blur(); return; }
    const k = e.key;
    if (k === "Escape") { if (V.k > 1.02) fit(true); else close(); }
    else if (k === "ArrowRight") go(1);
    else if (k === "ArrowLeft") go(-1);
    else if (k === "ArrowDown") frame(1);
    else if (k === "ArrowUp") frame(-1);
    else if (k === "i" || k === "I") toggleInfo();
    else if (k === "z" || k === "Z") toggleZoom();
    else if (k === "0") fit(true);
    else if (k === "+" || k === "=") zoomTo(V.k * 1.5, V.sw / 2, V.sh / 2, 260);
    else if (k === "-") { if (V.k / 1.5 <= 1.02) fit(true); else zoomTo(V.k / 1.5, V.sw / 2, V.sh / 2, 260); }
    else if (k === "f" || k === "F") fullscreen();
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
    strip(x); badge();
    $(".vw-top .t b", V.el).textContent = H().titleOf(x);
  }

  GP.viewer = { open, close, isOpen: () => V.open, current: () => (V.open && cur() ? cur().id : null), refresh, toggleInfo };

  /* ---------- exhibition mode ---------- */
  // A slow, quiet slideshow: full-screen, cross-fading, drifting toward each subject.
  GP.exhibit = function (list) {
    list = (list || []).filter(Boolean);
    if (!list.length) return;
    const h = H();
    const ex = document.createElement("div");
    ex.className = "ex";
    ex.setAttribute("role", "dialog");
    ex.setAttribute("aria-label", "Exhibition mode");
    ex.tabIndex = -1;
    ex.innerHTML = `<div class="slide"><img alt=""><div class="cap"><b></b><span></span></div></div><div class="slide"><img alt=""><div class="cap"><b></b><span></span></div></div><button class="icon-btn exit" aria-label="Leave exhibition mode" style="color:#eee">${h.ICON.close}</button><div class="ex-state sc" aria-live="polite"></div>`;
    document.body.appendChild(ex);
    document.documentElement.style.overflow = "hidden";
    const slides = [...ex.querySelectorAll(".slide")];
    const w = Math.min(2560, Math.max(innerWidth, innerHeight) * Math.min(2, devicePixelRatio || 1));
    let i = -1, which = 0, t = 0, paused = false;
    const put = (s, x) => {
      const img = s.querySelector("img");
      img.src = h.src(x, w);
      img.alt = h.titleOf(x);
      img.style.setProperty("--fx", (x.fp[0] * 100).toFixed(1) + "%");
      img.style.setProperty("--fy", (x.fp[1] * 100).toFixed(1) + "%");
      s.querySelector("b").textContent = h.titleOf(x);
      s.querySelector("span").textContent = [h.fmtDate(x.t), x.light, x.sci].filter(Boolean).join(" · ");
    };
    const next = (d = 1) => {
      i = (i + d + list.length) % list.length;
      const s = slides[which], o = slides[1 - which];
      put(s, list[i]);
      const img = s.querySelector("img");
      const reveal = () => { s.classList.remove("on"); void s.offsetWidth; s.classList.add("on"); o.classList.remove("on"); };
      if (img.complete && img.naturalWidth) reveal(); else { img.onload = reveal; img.onerror = reveal; }
      which = 1 - which;
      const pre = new Image(); pre.src = h.src(list[(i + 1) % list.length], w);
      clearTimeout(t);
      if (!paused) t = setTimeout(() => next(1), 8500);
    };
    const end = () => {
      clearTimeout(t);
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("fullscreenchange", fsc);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      ex.remove();
      document.documentElement.style.overflow = "";
    };
    const key = (e) => {
      if (e.key === "Escape") end();
      else if (e.key === "ArrowRight") next(1);
      else if (e.key === "ArrowLeft") next(-1);
      else if (e.key === " ") { paused = !paused; ex.querySelector(".ex-state").textContent = paused ? "Paused" : ""; if (!paused) next(1); else clearTimeout(t); }
      else return;
      e.preventDefault(); e.stopPropagation();
    };
    const fsc = () => { if (!document.fullscreenElement && ex.dataset.fs) end(); };
    ex.querySelector(".exit").onclick = end;
    ex.addEventListener("click", (e) => { if (!e.target.closest(".exit")) next(1); });
    document.addEventListener("keydown", key, true);
    document.addEventListener("fullscreenchange", fsc);
    if (ex.requestFullscreen) ex.requestFullscreen().then(() => { ex.dataset.fs = "1"; }).catch(() => {});
    ex.focus();
    next(1);
  };
})(window.GP = window.GP || {});
