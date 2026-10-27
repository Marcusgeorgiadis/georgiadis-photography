/* Georgiadis Photography: what happens to a photograph on screen.
   - arrive: a photograph comes into focus from its subject outward, over its blurred preview.
   - develop: a print develops in the tray (the Journal, a slideshow's first frame).
   - leak: backlit and silhouetted frames get light drifting across their edges.
   - live: a burst plays as the moment it was, frame by frame at the real interval.
   - surface: a WebGL copy of a photograph that floats the subject in front of its background
     (from a depth map made at build time) as the pointer moves or the phone tilts, and lets
     water ripple where the pointer touches it.
   Everything waits for reduced motion to be off and falls back to the plain photograph. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const saveData = () => !!(navigator.connection && navigator.connection.saveData);
  const app = () => GP.app;
  const H = () => GP.app.helpers;

  /* ---------- what a photograph is ---------- */
  const has = (x, re) => !!x && (re.test((x.tags || []).join(" | ")) || re.test(x.setting || ""));
  const isBacklit = (x) => has(x, /\bbacklit\b|silhouett|rim[- ]?lit|against the (sun|light)|sunburst|lens flare/i);
  const isWater = (x) => has(x, /reflect|calm water|rippled water|water ripples|shallow water|\bpond\b|\blake\b|still water|open water/i);
  function habitat(x) {
    if (!x) return "field";
    const s = [(x.tags || []).join(" "), x.setting || "", x.caption || ""].join(" ").toLowerCase();
    if (/\b(surf|beach|sand|shoreline|ocean|gulf|dune|waves?)\b/.test(s)) return "surf";
    if (/\b(water|pond|marsh|swamp|wetland|reeds?|lake|river|creek|canal|shallows|lily|lilies)\b/.test(s)) return "water";
    if (/\b(pine|forest|woodland|canopy|tree ?trunk|treetop|woods|oak|palm|branch|branches|bark|cypress)\b/.test(s)) return "pines";
    return "field";
  }

  /* ---------- arriving in focus ---------- */
  // Called when an image finishes loading. The sharp photograph opens from the subject outward
  // over the soft preview behind it.
  // Thumbnails, photographs off screen and a crowd arriving at once just fade in as before: the
  // focus pull is for photographs big enough to see it, a few at a time.
  let arriving = 0;
  function arrive(img) {
    if (reduced() || img.dataset.arrived) return;
    img.dataset.arrived = "1";
    const r = img.getBoundingClientRect();
    if (r.width < 140 || r.height < 90 || r.bottom < 0 || r.top > innerHeight || arriving >= 8) return;
    arriving++;
    const lq = img.dataset.lq;
    const host = img.closest(".tile") ? null : img.parentElement;
    if (host && lq) { host.style.backgroundImage = `url("${lq}")`; host.classList.add("fx-host"); }
    img.classList.add("fx-focus");
    let over = false;
    const done = () => { if (over) return; over = true; arriving--; img.classList.remove("fx-focus"); if (host && lq) { host.style.backgroundImage = ""; host.classList.remove("fx-host"); } };
    img.addEventListener("animationend", done, { once: true });
    setTimeout(done, 1800);
  }

  /* ---------- the darkroom ---------- */
  function develop(img, o = {}) {
    if (reduced()) return;
    const host = o.host || img.parentElement;
    img.classList.remove("fx-develop"); void img.offsetWidth;
    img.classList.add("fx-develop");
    if (host && !host.querySelector(":scope > .fx-tray")) {
      const tray = document.createElement("i");
      tray.className = "fx-tray";
      tray.setAttribute("aria-hidden", "true");
      host.appendChild(tray);
      setTimeout(() => tray.remove(), 3600);
    }
    img.addEventListener("animationend", () => img.classList.remove("fx-develop"), { once: true });
  }
  // Develop images as they scroll into view (the Journal).
  function developIn(root, signal) {
    if (reduced() || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const img = e.target;
        const go = () => develop(img);
        if (img.complete && img.naturalWidth) go(); else img.addEventListener("load", go, { once: true });
      }
    }, { rootMargin: "0px 0px -15% 0px" });
    root.querySelectorAll("img").forEach((i) => { i.dataset.arrived = "1"; io.observe(i); });
    signal.addEventListener("abort", () => io.disconnect());
  }

  /* ---------- light leaks ---------- */
  function warmest(pal) {
    let best = "#ffcf8a", bs = -1;
    for (const c of pal || []) {
      const [h, s, l] = GP.model.hexHsl(c);
      const warm = (h < 60 || h > 330) ? 1 : 0.3;
      const sc = warm * (0.4 + s) * (0.3 + l);
      if (sc > bs) { bs = sc; best = c; }
    }
    return best;
  }
  // A slow drift of warm light over the edges of a backlit frame. host must be positioned.
  function leak(host, x) {
    if (!host || !x || !isBacklit(x)) return null;
    let el = host.querySelector(":scope > .fx-leak");
    if (!el) { el = document.createElement("i"); el.className = "fx-leak"; el.setAttribute("aria-hidden", "true"); host.appendChild(el); }
    el.style.setProperty("--leak", warmest(x.pal));
    el.style.setProperty("--leak-x", ((x.fp || [0.5])[0] < 0.5 ? 82 : 18) + "%");
    return el;
  }
  function unleak(host) { const el = host && host.querySelector(":scope > .fx-leak"); if (el) el.remove(); }

  /* ---------- living photographs ---------- */
  function cadence(fr) {
    // the real gaps between frames, kept between a quick flicker and a deliberate beat
    return fr.map((f, i) => {
      const n = fr[i + 1];
      const d = n && f.secs != null && n.secs != null ? (n.secs - f.secs) * 1000 : 260;
      return Math.max(110, Math.min(620, d || 260));
    });
  }
  function preload(urls) {
    return Promise.all(urls.map((u) => new Promise((res) => { const im = new Image(); im.decoding = "async"; im.onload = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => res(true)); im.onerror = () => res(false); im.src = u; })));
  }
  // Plays a burst's frames through an <img>. Returns a stop function.
  function play(img, x, o = {}) {
    const b = x && x.burst;
    if (!b || b.size < 2 || reduced()) return () => {};
    const fr = b.frames, gaps = cadence(fr), w = o.width || 720;
    const urls = fr.map((f) => H().src(f, w));
    let stopped = false, t = 0, i = 0;
    const ghost = o.crossfade !== false ? document.createElement("img") : null;
    if (ghost) { ghost.className = "fx-live-ghost"; ghost.alt = ""; ghost.setAttribute("aria-hidden", "true"); img.after(ghost); }
    const restore = img.getAttribute("src");
    const step = () => {
      if (stopped) return;
      const f = fr[i];
      if (ghost) { ghost.src = img.currentSrc || img.src; ghost.classList.remove("off"); void ghost.offsetWidth; ghost.classList.add("off"); }
      img.src = urls[i];
      if (o.onFrame) o.onFrame(i, f);
      const last = i === fr.length - 1;
      i = (i + 1) % fr.length;
      if (last && o.once) { t = setTimeout(() => finish(), 900); return; }
      t = setTimeout(step, last ? 1100 : gaps[i - 1 < 0 ? fr.length - 1 : i - 1]);
    };
    const finish = () => {
      if (stopped) return;
      stopped = true; clearTimeout(t);
      if (ghost) ghost.remove();
      if (o.restore !== false && restore) img.src = restore;
      if (o.onEnd) o.onEnd();
    };
    preload(urls).then(() => { if (!stopped) { i = 0; step(); } });
    return finish;
  }
  // Galleries: rest the pointer on a burst and it plays; moving across it still scrubs.
  const LIVE = { tile: null, stop: null, t: 0 };
  function liveStop() {
    clearTimeout(LIVE.t);
    if (LIVE.tile) LIVE.tile._mv = 0;
    if (LIVE.stop) LIVE.stop();
    if (LIVE.tile) { LIVE.tile.classList.remove("living"); const x = app().model.byId.get(LIVE.tile.dataset.id); LIVE.tile.querySelectorAll(".scrub i").forEach((el, k) => el.classList.toggle("on", x && x.burst && x.burst.frames[k] === x)); }
    LIVE.tile = null; LIVE.stop = null;
  }
  function liveStart(t) {
    if (LIVE.tile !== t || LIVE.stop) return;
    const x = app().model.byId.get(t.dataset.id), img = t.querySelector("img");
    if (!x || !img) return;
    t._i = null; t._frame = null;
    t.classList.add("living");
    const w = t.getBoundingClientRect().width * Math.min(2, devicePixelRatio || 1);
    // play from the first frame, and leave the tile on the frame the gallery shows
    img.src = H().src(x, w);
    LIVE.stop = play(img, x, { width: w, onFrame: (k) => t.querySelectorAll(".scrub i").forEach((el, n) => el.classList.toggle("on", n === k)) });
  }
  // Rest the pointer on a burst and it plays; it re-arms while the pointer is still moving.
  function liveArm(t) {
    if (!fine() || reduced() || saveData()) return;
    if (LIVE.tile !== t) { liveStop(); LIVE.tile = t; }
    if (LIVE.stop) return;
    clearTimeout(LIVE.t);
    LIVE.t = setTimeout(() => liveStart(t), 380);
  }
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse") return;
    const t = e.target.closest && e.target.closest(".tile.burst");
    if (t) liveArm(t);
    else if (LIVE.tile && !LIVE.tile.contains(e.target)) liveStop();
  }, { passive: true });
  // while playing, a deliberate sweep across the tile is a scrub: stop and let the pointer choose
  document.addEventListener("pointermove", (e) => {
    const t = LIVE.tile;
    if (!t || e.pointerType !== "mouse" || !t.contains(e.target)) return;
    if (!LIVE.stop) { liveArm(t); return; }
    t._mv = (t._mv || 0) + Math.abs(e.movementX || 0);
    if (t._mv > 40) { t._mv = 0; const keep = t; liveStop(); LIVE.tile = keep; }
  }, { passive: true });
  addEventListener("scroll", () => { if (LIVE.tile) liveStop(); }, { passive: true });

  /* ---------- depth maps ---------- */
  let depthIndex = null;
  function depthUrl(x) {
    const a = app() && app().adapter;
    if (!x || !a || !a.depth) return Promise.resolve(null);
    if (!depthIndex) {
      depthIndex = fetch(a.depthIndex || "depth/index.json", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : { ids: [] })).then((j) => new Set(j.ids || [])).catch(() => new Set());
    }
    return depthIndex.then((s) => (s.has(x.id) ? a.depth(x) : null));
  }

  /* ---------- the surface: depth and water in WebGL ---------- */
  const VERT = `attribute vec2 p; varying vec2 v; void main(){ v = p * 0.5 + 0.5; v.y = 1.0 - v.y; gl_Position = vec4(p, 0.0, 1.0); }`;
  const FRAG = `precision mediump float;
varying vec2 v;
uniform sampler2D img, dep;
uniform vec4 crop;       // the part of the photograph the box shows: offset, size
uniform vec2 off;        // parallax offset (in texture units, at full depth)
uniform float focus, zoom, hasDepth, aspect, now;
uniform vec4 rip[8];     // x, y, start time, strength
void main(){
  vec2 t = crop.xy + v * crop.zw;
  vec2 c = crop.xy + crop.zw * 0.5;
  t = c + (t - c) / zoom;
  float d = hasDepth > 0.5 ? texture2D(dep, t).r : 0.5;
  vec2 q = t + off * (d - focus) * crop.zw;
  // water: rings spreading from where the pointer touched, quieter on the subject
  vec2 w = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 r = rip[i];
    if (r.w <= 0.0) continue;
    float age = now - r.z;
    if (age < 0.0 || age > 2.4) continue;
    vec2 dv = (v - r.xy) * vec2(aspect, 1.0);
    float dist = length(dv);
    float front = age * 0.34;
    float band = exp(-pow((dist - front) * 26.0, 2.0));
    float wave = sin((dist - front) * 120.0) * band * exp(-age * 1.6) * r.w;
    w += (dist > 0.0001 ? dv / dist : vec2(0.0)) * wave * 0.0065;
  }
  float calm = hasDepth > 0.5 ? smoothstep(0.85, 0.45, d) : 1.0;
  q += w * calm * crop.zw;
  vec4 col = texture2D(img, q);
  float shine = (w.x + w.y) * 26.0 * calm;
  gl_FragColor = vec4(col.rgb * (1.0 + shine), 1.0);
}`;
  let liveSurfaces = 0;
  function surface(img, x, o = {}) {
    const wantDepth = o.depth !== false, wantRipple = o.ripple && isWater(x);
    const ctl = { destroy() {}, setPointer() {}, el: null };
    if (reduced() || (!wantDepth && !wantRipple) || liveSurfaces > 3) return ctl;
    const canvas = document.createElement("canvas");
    let gl = null;
    try { gl = canvas.getContext("webgl", { premultipliedAlpha: false, antialias: false, alpha: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) return ctl;
    liveSurfaces++;
    canvas.className = "fx-surface" + (o.cls ? " " + o.cls : "");
    canvas.setAttribute("aria-hidden", "true");
    const S = { img, x, gl, canvas, raf: 0, alive: true, tex: null, dtex: null, hasDepth: 0, ready: false, ptr: { x: 0, y: 0 }, cur: { x: 0, y: 0 }, rip: [], ripN: 0, t0: performance.now(), auto: !!o.auto, idle: 0, visible: true, tilt: null };
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { liveSurfaces--; return ctl; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    for (const n of ["img", "dep", "crop", "off", "focus", "zoom", "hasDepth", "aspect", "now"]) U[n] = gl.getUniformLocation(prog, n);
    U.rip = gl.getUniformLocation(prog, "rip");
    gl.uniform1i(U.img, 0); gl.uniform1i(U.dep, 1);
    const texOf = (image, unit) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      return t;
    };
    const load = (u) => new Promise((res, rej) => { const im = new Image(); im.crossOrigin = "anonymous"; im.decoding = "async"; im.onload = () => res(im); im.onerror = rej; im.src = u; });

    // the box the canvas covers, and which part of the photograph shows there (object-fit: cover)
    function place() {
      if (!S.alive) return;
      const host = img.offsetParent || img.parentElement;
      if (!host) return;
      if (canvas.parentElement !== img.parentElement) img.after(canvas);
      const w = img.offsetWidth, h = img.offsetHeight;
      if (!w || !h) return;
      Object.assign(canvas.style, { left: img.offsetLeft + "px", top: img.offsetTop + "px", width: w + "px", height: h + "px" });
      const k = Math.min(2, devicePixelRatio || 1) * (o.scale || 1);
      const cw = Math.round(Math.min(2048, w * k)), ch = Math.round(Math.min(2048, h * k));
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; gl.viewport(0, 0, cw, ch); }
      const ia = x.ar || (img.naturalWidth / img.naturalHeight) || 1.5, ba = w / h;
      const fit = getComputedStyle(img).objectFit;
      const op = (getComputedStyle(img).objectPosition || "50% 50%").split(/\s+/).map((s) => (/%$/.test(s) ? parseFloat(s) / 100 : 0.5));
      let crop = [0, 0, 1, 1];
      if (fit === "cover") {
        if (ia > ba) { const f = ba / ia; crop = [(op[0] ?? 0.5) * (1 - f), 0, f, 1]; }
        else { const f = ia / ba; crop = [0, (op[1] ?? 0.5) * (1 - f), 1, f]; }
      }
      gl.uniform4f(U.crop, crop[0], crop[1], crop[2], crop[3]);
      gl.uniform1f(U.aspect, ba);
      kick();
    }
    function draw(now) {
      S.raf = 0;
      if (!S.alive || !S.ready) return;
      const t = (now - S.t0) / 1000;
      // ease toward where the pointer (or the phone, or the slow orbit) says
      let tx = S.ptr.x, ty = S.ptr.y;
      if (S.tilt) { tx = S.tilt.x; ty = S.tilt.y; }
      else if (S.auto && !S.pointerAt) { tx = Math.sin(t * 0.21) * 0.7; ty = Math.cos(t * 0.16) * 0.45; }
      S.cur.x += (tx - S.cur.x) * 0.06; S.cur.y += (ty - S.cur.y) * 0.06;
      const amt = (o.amount || 0.022) * S.hasDepth;
      gl.uniform2f(U.off, -S.cur.x * amt, -S.cur.y * amt);
      gl.uniform1f(U.focus, o.focus != null ? o.focus : 0.62);
      gl.uniform1f(U.zoom, S.hasDepth ? 1 + (o.amount || 0.022) * 0.9 : 1);
      gl.uniform1f(U.hasDepth, S.hasDepth);
      gl.uniform1f(U.now, t);
      const arr = new Float32Array(32);
      let live = 0;
      S.rip.forEach((r, i) => { if (t - r[2] < 2.4) { arr.set(r, i * 4); live++; } });
      gl.uniform4fv(U.rip, arr);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      if (!S.drawn) { S.drawn = true; canvas.classList.add("on"); if (o.onReady) o.onReady(); }
      const moving = Math.abs(tx - S.cur.x) + Math.abs(ty - S.cur.y) > 0.002;
      if (S.visible && !document.hidden && (moving || live || S.auto || S.tilt)) kick();
    }
    function kick() { if (!S.raf && S.alive && S.visible) S.raf = requestAnimationFrame(draw); }
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const nx = (e.clientX - r.left) / r.width, ny = (e.clientY - r.top) / r.height;
      if (nx < -0.1 || nx > 1.1 || ny < -0.1 || ny > 1.1) { S.pointerAt = 0; S.ptr.x = 0; S.ptr.y = 0; kick(); return; }
      S.pointerAt = performance.now();
      S.ptr.x = nx * 2 - 1; S.ptr.y = ny * 2 - 1;
      if (wantRipple && e.pointerType === "mouse") {
        const now = (performance.now() - S.t0) / 1000, lr = S.lastRip;
        const far = !lr || Math.hypot(nx - lr[0], (ny - lr[1]) / (r.width / r.height)) > 0.035;
        if (far && (!lr || now - lr[2] > 0.09)) {
          const strength = Math.min(1, Math.hypot(e.movementX || 0, e.movementY || 0) / 18 + 0.35);
          S.rip[S.ripN % 8] = [nx, ny, now, strength];
          S.ripN++;
          S.lastRip = [nx, ny, now];
        }
      }
      kick();
    };
    const onLeave = () => { S.pointerAt = 0; S.ptr.x = 0; S.ptr.y = 0; kick(); };
    const target = o.listen || img.parentElement;
    target.addEventListener("pointermove", onMove, { passive: true });
    target.addEventListener("pointerleave", onLeave, { passive: true });
    // phones: tilt instead of a pointer
    const onTilt = (e) => {
      if (e.gamma == null) return;
      S.tilt = { x: Math.max(-1, Math.min(1, e.gamma / 22)), y: Math.max(-1, Math.min(1, (e.beta - 45) / 26)) };
      kick();
    };
    if (o.tilt && !fine()) addEventListener("deviceorientation", onTilt, { passive: true });
    const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => { S.visible = es[es.length - 1].isIntersecting; if (S.visible) kick(); }) : null;
    if (io) io.observe(img);
    const ro = "ResizeObserver" in window ? new ResizeObserver(() => place()) : null;
    if (ro) ro.observe(img);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ctl.destroy(); });

    const srcUrl = o.src || img.currentSrc || img.src;
    Promise.all([load(srcUrl), wantDepth ? depthUrl(x).then((u) => (u ? load(u).catch(() => null) : null)) : Promise.resolve(null)])
      .then(([im, dm]) => {
        if (!S.alive) return;
        if (!dm && !wantRipple) { ctl.destroy(); return; }
        S.tex = texOf(im, 0);
        if (dm) { S.dtex = texOf(dm, 1); S.hasDepth = 1; } else { S.dtex = texOf(im, 1); }
        S.ready = true;
        img.after(canvas);
        place();
      }).catch(() => ctl.destroy());

    ctl.el = canvas;
    ctl.setPointer = (nx, ny) => { S.ptr.x = nx; S.ptr.y = ny; S.pointerAt = performance.now(); kick(); };
    ctl.setAuto = (on) => { S.auto = !!on; kick(); };
    ctl.ripple = (nx, ny, s = 1) => { if (!S.ready) return; S.rip[S.ripN % 8] = [nx, ny, (performance.now() - S.t0) / 1000, s]; S.ripN++; kick(); };
    ctl.place = place;
    ctl.hide = (on) => canvas.classList.toggle("hide", !!on);
    Object.defineProperty(ctl, "depth", { get: () => !!S.hasDepth });
    ctl.destroy = () => {
      if (!S.alive) return;
      S.alive = false;
      liveSurfaces = Math.max(0, liveSurfaces - 1);
      cancelAnimationFrame(S.raf);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerleave", onLeave);
      removeEventListener("deviceorientation", onTilt);
      if (io) io.disconnect();
      if (ro) ro.disconnect();
      const lose = gl.getExtension("WEBGL_lose_context");
      canvas.remove();
      if (lose) try { lose.loseContext(); } catch (e) { /* gone already */ }
    };
    return ctl;
  }
  // iPhones ask before sharing the tilt of the phone; ask on the first touch of a surface.
  function askTilt() {
    const D = window.DeviceOrientationEvent;
    if (D && typeof D.requestPermission === "function" && !askTilt.done) {
      askTilt.done = true;
      D.requestPermission().catch(() => {});
    }
  }

  GP.fx = { arrive, develop, developIn, leak, unleak, play, surface, depthUrl, askTilt, isBacklit, isWater, habitat, liveStop };
})(window.GP = window.GP || {});
