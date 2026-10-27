/* Georgiadis Photography: the soundscape. With it on (the waves button in the header), a quiet
   bed of the place the photograph on screen was made plays underneath everything: water lapping
   in the marsh, wind in the pines, surf on the beach, a breeze over open ground, and crickets
   after dark. All of it is synthesised here, nothing is downloaded. As the pointer passes
   photographs, their birds call softly from that side of the screen.
   GP.scape.voice() plays a species' call once, panned and faded; "A day in the marsh" uses it too. */
(function (GP) {
  "use strict";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const S = { ctx: null, on: store.get("gp-scape") === "1", master: null, bedBus: null, beds: {}, cur: "", night: false, buffers: new Map(), voices: 0, recent: new Map(), noise: null };
  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 3.3-1.8 4.8-.6"/><path d="M3 14c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 3.3-1.8 4.8-.6" opacity=".65"/><path d="M3 19c2.2-2.4 4.4-2.4 6.6 0s4.4 2.4 6.6 0 3.3-1.8 4.8-.6" opacity=".35"/></svg>';

  /* ---------- the audio graph ---------- */
  function ctx() {
    if (S.ctx) return S.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    S.ctx = new AC();
    S.master = S.ctx.createGain(); S.master.gain.value = 0.9;
    const comp = S.ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3;
    S.master.connect(comp).connect(S.ctx.destination);
    S.bedBus = S.ctx.createGain(); S.bedBus.gain.value = 0;
    S.bedBus.connect(S.master);
    return S.ctx;
  }
  // Two noises to sculpt from: pink (wind, rustle) and brown (water, surf).
  function noise() {
    if (S.noise) return S.noise;
    const c = S.ctx, n = c.sampleRate * 6;
    const pink = c.createBuffer(2, n, c.sampleRate), brown = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const p = pink.getChannelData(ch), b = brown.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
        last = (last + 0.02 * w) / 1.02; b[i] = last * 3.5;
      }
      // fade the loop's seam
      for (let i = 0; i < 2048; i++) { const k = i / 2048; p[i] *= k; b[i] *= k; p[n - 1 - i] *= k; b[n - 1 - i] *= k; }
    }
    S.noise = { pink, brown };
    return S.noise;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  function src(buf, rate = 1) { const s = S.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.loopStart = 0.05; s.start(0, rnd(0, buf.duration - 0.1)); return s; }
  function filt(type, f, q = 0.7) { const n = S.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }
  function gain(v) { const g = S.ctx.createGain(); g.gain.value = v; return g; }
  // Wander a parameter between values, a new target every few seconds.
  function wander(param, lo, hi, every, glide) {
    const tick = () => {
      if (!S.ctx) return;
      param.setTargetAtTime(rnd(lo, hi), S.ctx.currentTime, glide);
      const t = setTimeout(tick, rnd(every[0], every[1]) * 1000);
    };
    tick();
  }

  /* ---------- the beds ---------- */
  // Each bed is a gain node fed by its own layers; switching places cross-fades their gains.
  const BUILD = {
    water(out) {
      const nz = noise();
      // lapping: low brown noise, the filter and level breathing like small waves at the edge
      const lap = src(nz.brown, 0.9), lp = filt("lowpass", 420, 0.9), g = gain(0.5);
      lap.connect(lp).connect(g).connect(out);
      wander(lp.frequency, 260, 760, [1.2, 2.6], 0.5);
      wander(g.gain, 0.22, 0.75, [0.9, 2.2], 0.35);
      // a faint shimmer over the surface
      const sh = src(nz.pink, 1.1), bp = filt("bandpass", 2600, 1.4), sg = gain(0.035);
      sh.connect(bp).connect(sg).connect(out);
      wander(sg.gain, 0.01, 0.05, [2, 5], 1.2);
      // and now and then a drip, a fish, a frog's plop
      const plip = () => {
        if (!S.ctx || S.cur !== "water" || !(S.on || S.borrowed)) return schedule();
        const t = S.ctx.currentTime, o = S.ctx.createOscillator(), e = gain(0), pan = S.ctx.createStereoPanner();
        o.type = "sine"; o.frequency.setValueAtTime(rnd(700, 1200), t); o.frequency.exponentialRampToValueAtTime(rnd(220, 380), t + 0.09);
        e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(rnd(0.025, 0.06), t + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        pan.pan.value = rnd(-0.8, 0.8);
        o.connect(e).connect(pan).connect(out); o.start(t); o.stop(t + 0.2);
        schedule();
      };
      const schedule = () => { const t = setTimeout(plip, rnd(1.8, 6.5) * 1000); };
      schedule();
    },
    pines(out) {
      const nz = noise();
      // wind through needles: a broad band of pink noise, gusting
      const w = src(nz.pink, 0.8), bp = filt("bandpass", 900, 0.55), g = gain(0.3);
      w.connect(bp).connect(g).connect(out);
      wander(bp.frequency, 550, 1500, [2, 4.5], 1.4);
      wander(g.gain, 0.08, 0.55, [2.5, 6], 1.6);
      // the higher hiss of the needles, quicker
      const h = src(nz.pink, 1.3), hp = filt("highpass", 3200, 0.7), hg = gain(0.06);
      h.connect(hp).connect(hg).connect(out);
      wander(hg.gain, 0.015, 0.1, [1.2, 3], 0.8);
      // the low body of the wind
      const b = src(nz.brown, 0.7), lp = filt("lowpass", 180, 0.7), bg = gain(0.18);
      b.connect(lp).connect(bg).connect(out);
      wander(bg.gain, 0.06, 0.26, [3, 7], 2);
    },
    surf(out) {
      const nz = noise();
      const body = src(nz.brown, 1), lp = filt("lowpass", 400, 0.6), g = gain(0.1);
      const wash = src(nz.pink, 1.05), hp = filt("highpass", 1800, 0.6), wg = gain(0.0);
      body.connect(lp).connect(g).connect(out);
      wash.connect(hp).connect(wg).connect(out);
      // one wave: it builds, breaks into hiss, and runs back down the sand
      const wave = () => {
        if (!S.ctx) return;
        const t = S.ctx.currentTime, per = rnd(7, 11.5), peak = rnd(0.55, 0.95);
        lp.frequency.cancelScheduledValues(t); g.gain.cancelScheduledValues(t); wg.gain.cancelScheduledValues(t);
        lp.frequency.setValueAtTime(lp.frequency.value, t); lp.frequency.linearRampToValueAtTime(1700, t + per * 0.32); lp.frequency.exponentialRampToValueAtTime(260, t + per * 0.95);
        g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(peak, t + per * 0.3); g.gain.setTargetAtTime(0.12, t + per * 0.36, per * 0.2);
        wg.gain.setValueAtTime(wg.gain.value, t); wg.gain.linearRampToValueAtTime(peak * 0.16, t + per * 0.34); wg.gain.setTargetAtTime(0.004, t + per * 0.42, per * 0.18);
        const tt = setTimeout(wave, per * 1000);
      };
      wave();
    },
    field(out) {
      const nz = noise();
      const w = src(nz.pink, 0.75), bp = filt("bandpass", 420, 0.5), g = gain(0.16);
      w.connect(bp).connect(g).connect(out);
      wander(g.gain, 0.05, 0.28, [2.5, 6], 1.6);
      wander(bp.frequency, 300, 700, [3, 6], 2);
      // a distant cicada, rising and falling
      const c = src(nz.pink, 1.4), cb = filt("bandpass", 4600, 9), am = gain(0), cg = gain(0);
      const lfo = S.ctx.createOscillator(); lfo.frequency.value = 38; const lfoG = gain(0.5);
      lfo.connect(lfoG).connect(am.gain); lfo.start();
      c.connect(cb).connect(am).connect(cg).connect(out);
      const swell = () => {
        if (!S.ctx) return;
        const t = S.ctx.currentTime;
        cg.gain.cancelScheduledValues(t); cg.gain.setValueAtTime(cg.gain.value, t);
        cg.gain.linearRampToValueAtTime(rnd(0.04, 0.09), t + rnd(2, 4)); cg.gain.linearRampToValueAtTime(0, t + rnd(7, 10));
        const tt = setTimeout(swell, rnd(12, 24) * 1000);
      };
      const t0 = setTimeout(swell, rnd(2, 6) * 1000);
    },
    night(out) {
      // crickets: short trains of pulses, each a little different, scattered left and right
      const crickets = [0, 1, 2].map(() => ({ f: rnd(4100, 5200), rate: rnd(0.75, 1.4), pan: rnd(-0.9, 0.9), lvl: rnd(0.012, 0.03) }));
      const chirp = (k) => {
        if (!S.ctx || !S.night || !(S.on || S.borrowed)) { setTimeout(() => chirp(k), 2000); return; }
        const cr = crickets[k], t = S.ctx.currentTime, o = S.ctx.createOscillator(), e = gain(0), p = S.ctx.createStereoPanner();
        o.type = "sine"; o.frequency.value = cr.f; p.pan.value = cr.pan;
        for (let i = 0; i < 3; i++) { const s = t + i * 0.034; e.gain.setValueAtTime(0, s); e.gain.linearRampToValueAtTime(cr.lvl, s + 0.004); e.gain.linearRampToValueAtTime(0, s + 0.02); }
        o.connect(e).connect(p).connect(out); o.start(t); o.stop(t + 0.14);
        const tt = setTimeout(() => chirp(k), (cr.rate + rnd(-0.08, 0.08)) * 1000);
      };
      crickets.forEach((_, k) => { const t = setTimeout(() => chirp(k), rnd(0, 1200)); });
    },
  };
  function bed(name) {
    if (S.beds[name]) return S.beds[name];
    const g = gain(0);
    g.connect(S.bedBus);
    BUILD[name](g);
    S.beds[name] = g;
    return g;
  }
  const LEVEL = { water: 0.9, pines: 0.75, surf: 0.85, field: 0.7, night: 1 };
  function place(name, night) {
    if (!S.ctx || !(S.on || S.borrowed)) { S.cur = name; S.night = night; return; }
    S.cur = name; S.night = !!night;
    const t = S.ctx.currentTime;
    for (const k of ["water", "pines", "surf", "field"]) {
      const want = k === name ? LEVEL[k] * (night ? 0.7 : 1) : 0;
      if (want || S.beds[k]) { const g = bed(k); g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(want, t, 1.2); }
    }
    const n = bed("night");
    n.gain.cancelScheduledValues(t); n.gain.setTargetAtTime(night ? LEVEL.night : 0, t, 1.4);
    paint();
  }
  // What's on screen sets the place: the photograph the page is coloured by.
  function context(x) {
    if (!x) { place("field", isNightNow()); return; }
    const night = x.light === "Night" || x.light === "Blue hour";
    place(GP.fx ? GP.fx.habitat(x) : "field", night);
  }
  function isNightNow() { return !!(GP.sky && GP.sky.now().sky.dark); }
  document.addEventListener("gp:photo-context", (e) => context(e.detail && e.detail.x));

  /* ---------- switching it on ---------- */
  function setOn(on) {
    S.on = on;
    store.set("gp-scape", on ? "1" : "0");
    if (on) {
      if (!ctx()) return;
      if (S.ctx.state === "suspended") S.ctx.resume().catch(() => {});
      const t = S.ctx.currentTime;
      S.bedBus.gain.cancelScheduledValues(t); S.bedBus.gain.setTargetAtTime(0.16, t, 1.2);
      context(GP.tint && GP.tint.current ? GP.tint.current : null);
    } else if (S.ctx) {
      const t = S.ctx.currentTime;
      S.bedBus.gain.cancelScheduledValues(t); S.bedBus.gain.setTargetAtTime(0, t, 0.5);
      rest();
    }
    paint();
  }
  // Rest the audio entirely once it has faded, unless something is still using it: a silent
  // graph left running costs the processor (and a phone's battery) for nothing.
  function rest() {
    clearTimeout(S.restT);
    S.restT = setTimeout(() => { if (S.ctx && !S.on && !S.borrowed && !S.voices && S.ctx.state === "running") S.ctx.suspend().catch(() => {}); }, 2500);
  }
  // A page (A day in the marsh, an outing story) can sound the beds for a while without
  // switching the visitor's soundscape on.
  function borrow(v, level = 0.14) {
    if (v) {
      if (!ctx()) return false;
      S.borrowed = true;
      if (S.ctx.state === "suspended") S.ctx.resume().catch(() => {});
      const t = S.ctx.currentTime;
      S.bedBus.gain.cancelScheduledValues(t); S.bedBus.gain.setTargetAtTime(Math.max(level, S.on ? 0.16 : 0), t, 1);
      return true;
    }
    if (!S.borrowed) return false;
    S.borrowed = false;
    if (S.ctx && !S.on) { const t = S.ctx.currentTime; S.bedBus.gain.cancelScheduledValues(t); S.bedBus.gain.setTargetAtTime(0, t, 0.6); rest(); }
    return true;
  }
  function toggle() {
    setOn(!S.on);
    GP.app.toast(S.on ? "Soundscape on: the place each photograph was made, and its birds as you pass them" : "Soundscape off");
  }
  function button() {
    return `<button class="icon-btn scape-btn" data-act="scape" aria-pressed="${S.on}" title="Soundscape (S)" aria-label="Soundscape ${S.on ? "on" : "off"}">${ICON}</button>`;
  }
  const NAMES = { water: "water at the edge", pines: "wind in the pines", surf: "surf on the beach", field: "a breeze over open ground" };
  function paint() {
    for (const b of document.querySelectorAll('[data-act="scape"]')) {
      b.setAttribute("aria-pressed", String(S.on));
      b.setAttribute("aria-label", `Soundscape ${S.on ? "on" : "off"}`);
      b.title = S.on ? `Soundscape: ${NAMES[S.cur] || "the marsh"}${S.night ? ", crickets" : ""} (S)` : "Soundscape (S)";
      b.classList.toggle("on", S.on);
    }
  }
  // Browsers start sound only after a click: a soundscape left on resumes with the first one.
  const resume = () => { if (S.on) setOn(true); document.removeEventListener("pointerdown", resume, true); document.removeEventListener("keydown", resume, true); };
  if (S.on) { document.addEventListener("pointerdown", resume, true); document.addEventListener("keydown", resume, true); }

  /* ---------- voices: a species' call, once, from one side ---------- */
  function buffer(url) {
    if (S.buffers.has(url)) return S.buffers.get(url);
    const p = fetch(url).then((r) => r.arrayBuffer()).then((a) => new Promise((res, rej) => S.ctx.decodeAudioData(a, res, rej))).catch(() => null);
    S.buffers.set(url, p);
    return p;
  }
  // o: pan (-1..1), gain, max seconds, fade seconds, onEnd
  function voice(s, o = {}) {
    if (!s || !s.call || !ctx()) return null;
    if (S.ctx.state === "suspended") S.ctx.resume().catch(() => {});
    const url = new URL(s.call.file, document.baseURI).href;
    const v = { stop() { v.stopped = true; }, stopped: false };
    S.voices++;
    buffer(url).then((buf) => {
      if (!buf || v.stopped) { S.voices--; if (!S.voices) rest(); return; }
      const t = S.ctx.currentTime, g = gain(0), p = S.ctx.createStereoPanner(), sn = S.ctx.createBufferSource();
      sn.buffer = buf;
      p.pan.value = Math.max(-1, Math.min(1, o.pan || 0));
      const dur = Math.min(buf.duration, o.max || buf.duration), fade = o.fade || 0.6, lvl = o.gain == null ? 0.5 : o.gain;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lvl, t + Math.min(0.5, fade));
      g.gain.setValueAtTime(lvl, t + Math.max(0.5, dur - fade)); g.gain.linearRampToValueAtTime(0, t + dur);
      sn.connect(g).connect(p).connect(S.master);
      sn.start(t, 0, dur + 0.05);
      v.node = sn; v.gain = g; v.started = performance.now(); v.dur = dur;
      v.stop = (q = 0.4) => { if (v.stopped) return; v.stopped = true; const n = S.ctx.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + q); try { sn.stop(n + q + 0.05); } catch (e) { /* stopped */ } };
      sn.onended = () => { S.voices--; v.stopped = true; if (o.onEnd) o.onEnd(); if (!S.voices) rest(); };
      if (o.onStart) o.onStart(v);
    });
    return v;
  }

  /* ---------- birds as the pointer passes ---------- */
  const PHOTO_SEL = ".tile[data-id], [data-open], .print-b[data-id], .cab-spec[data-id], .sp-card, .board-card";
  let lastCheck = 0;
  document.addEventListener("pointermove", (e) => {
    if (!S.on || !S.ctx || e.pointerType !== "mouse" || !fine()) return;
    const now = performance.now();
    if (now - lastCheck < 180) return;
    lastCheck = now;
    if (GP.calls && GP.calls.state.playing) return; // a call already playing has the floor
    const el = e.target.closest && e.target.closest(PHOTO_SEL);
    if (!el || S.voices >= 2) return;
    const m = GP.app.model;
    let s = null;
    const id = el.dataset.id || el.dataset.open;
    if (id) { const x = m.byId.get(id); s = x && x.spKey ? m.speciesByKey.get(x.spKey) : null; }
    else { const a = el.matches("a") ? el : el.querySelector("a[href^='#/species/']"); const slug = a && (a.getAttribute("href") || "").split("/")[2]; s = slug ? m.speciesBySlug.get(decodeURIComponent(slug)) : null; }
    if (!s || !s.call) return;
    const was = S.recent.get(s.slug) || 0;
    if (now - was < 30000) return;
    S.recent.set(s.slug, now);
    const r = el.getBoundingClientRect();
    voice(s, { pan: ((r.left + r.width / 2) / innerWidth) * 2 - 1, gain: 0.32, max: 6, fade: 1.2 });
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!S.ctx) return;
    if (document.hidden) S.ctx.suspend().catch(() => {}); else if (S.on) S.ctx.resume().catch(() => {});
  });
  document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest('[data-act="scape"]'); if (b) toggle(); });

  GP.scape = { button, toggle, setOn, voice, context, place, ctx, paint, borrow, get on() { return S.on; }, get place_() { return S.cur; }, get state() { return { on: S.on, place: S.cur, night: S.night, running: !!(S.ctx && S.ctx.state === "running"), voices: S.voices }; } };
})(window.GP = window.GP || {});
