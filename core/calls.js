/* Georgiadis Photography: bird calls. Each species with a recording gets a player: a sonogram
   tinted in the page's accent that fills as it plays (species pages), or a small waveform (the
   photograph viewer). Recordings come from iNaturalist under Creative Commons licences and are
   credited beside every player.
   Sound is off until the visitor turns it on in the header; then a species' call plays by itself
   when its page or one of its photographs opens. The play buttons work either way. */
(function (GP) {
  "use strict";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const C = { audio: null, key: null, call: null, raf: 0, on: store.get("gp-sound") === "1", fadeT: 0 };
  const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = {
    on: I('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/>'),
    off: I('<path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l10-6.2a.8.8 0 0 0 0-1.4l-10-6.2A.8.8 0 0 0 8 5.8z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor"/></svg>',
  };
  const app = () => GP.app;
  const h = () => app().helpers;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // custom properties carry url() unresolved, so give the stylesheet a full address
  const abs = (u) => { try { return new URL(u, document.baseURI).href; } catch (e) { return u; } };
  function speciesOf(key) { const m = app() && app().model; return m ? m.speciesBySlug.get(key) : null; }
  function available() { const m = app() && app().model; return !!(m && m.species.some((s) => s.call)); }
  function region(place) {
    // a coarse place for the credit line: state or country, never a street
    const parts = String(place || "").split(",").map((p) => p.replace(/\d+/g, "").trim()).filter(Boolean);
    return parts.slice(-2).join(", ");
  }

  /* ---------- audio ---------- */
  function audio() {
    if (C.audio) return C.audio;
    const a = (C.audio = new Audio());
    a.preload = "auto";
    a.addEventListener("ended", () => { sync(); stopLoop(); });
    a.addEventListener("pause", () => sync());
    a.addEventListener("play", () => { sync(); loop(); });
    a.addEventListener("error", () => { if (C.key) app().toast("That recording didn't load"); sync(); });
    return a;
  }
  function fadeTo(v, ms, then) {
    const a = audio(), v0 = a.volume, t0 = performance.now();
    cancelAnimationFrame(C.fadeT);
    if (reduced() || ms <= 0) { a.volume = v; if (then) then(); return; }
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      a.volume = Math.max(0, Math.min(1, v0 + (v - v0) * k));
      if (k < 1) C.fadeT = requestAnimationFrame(step); else if (then) then();
    };
    C.fadeT = requestAnimationFrame(step);
  }
  function play(key, o = {}) {
    const s = speciesOf(key);
    if (!s || !s.call) return;
    const a = audio();
    const same = C.key === key;
    C.key = key; C.call = s.call;
    if (!same) { a.src = abs(s.call.file); }
    if (!same || o.restart || a.ended) { try { a.currentTime = o.at || 0; } catch (e) { /* not loaded yet */ } }
    a.volume = o.auto ? 0 : 1;
    const p = a.play();
    if (p && p.catch) p.catch(() => { if (!o.auto) app().toast("The browser blocked the sound. Press play again."); sync(); });
    if (o.auto) fadeTo(1, 500);
    if ("mediaSession" in navigator && window.MediaMetadata) {
      try { navigator.mediaSession.metadata = new MediaMetadata({ title: `${s.name}: call`, artist: `Recording by ${s.call.by}`, album: app().site.title || "Georgiadis Photography" }); } catch (e) { /* unsupported */ }
    }
    sync();
  }
  function pause(fade) {
    const a = C.audio;
    if (!a || a.paused) return;
    if (fade) fadeTo(0, 350, () => { a.pause(); a.volume = 1; });
    else a.pause();
  }
  function toggleKey(key) {
    const a = audio();
    if (C.key === key && !a.paused) pause(false);
    else play(key, { restart: C.key !== key || a.ended });
  }

  /* ---------- players ---------- */
  function player(s, compact) {
    if (!s || !s.call) return "";
    const c = s.call, H = h();
    const lic = c.licenseUrl ? `<a href="${H.esc(c.licenseUrl)}" target="_blank" rel="noopener license">${H.esc(c.license)}</a>` : H.esc(c.license || "");
    const where = region(c.place), yr = (c.date || "").slice(0, 4);
    const credit = `Recording: <a href="${H.esc(c.source)}" target="_blank" rel="noopener">${H.esc(c.by)}</a>${where || yr ? `, ${H.esc([where, yr].filter(Boolean).join(", "))}` : ""} · ${lic} · via iNaturalist. ${H.esc(c.edited || "Trimmed, filtered and loudness-matched")}.`;
    const label = `the call of the ${s.name}`;
    const track = compact
      ? `<div class="call-wave" role="slider" tabindex="0" aria-label="Position in ${H.esc(label)}" aria-valuemin="0" aria-valuemax="${Math.round(c.dur)}" aria-valuenow="0">${(c.peaks || []).map((v) => `<i style="--v:${Math.max(6, v)}%"></i>`).join("")}</div>`
      : `<div class="call-sono" role="slider" tabindex="0" aria-label="Position in ${H.esc(label)}" aria-valuemin="0" aria-valuemax="${Math.round(c.dur)}" aria-valuenow="0" style="--sono:url('${H.esc(abs(c.sono))}')"><span class="call-base"></span><span class="call-done"></span><i class="call-head"></i></div>`;
    return `<div class="call${compact ? " compact" : ""}" data-call="${H.esc(s.slug)}">
  <button class="call-play" aria-label="Play ${H.esc(label)}">${ICON.play}</button>
  <div class="call-body"><div class="call-top"><span class="sc">${compact ? "Call" : "The call"} · ${Math.round(c.dur)} s</span></div>${track}<p class="call-credit">${credit}</p></div>
</div>`;
  }
  function sync() {
    const a = C.audio, playing = !!(a && !a.paused && !a.ended);
    for (const el of document.querySelectorAll(".call[data-call]")) {
      const mine = el.dataset.call === C.key;
      const on = mine && playing;
      el.classList.toggle("playing", on);
      const b = el.querySelector(".call-play");
      if (b && b._on !== on) {
        b._on = on;
        b.innerHTML = on ? ICON.pause : ICON.play;
        const s = speciesOf(el.dataset.call);
        b.setAttribute("aria-label", `${on ? "Pause" : "Play"} the call of the ${s ? s.name : "species"}`);
      }
      if (!mine) { el.style.setProperty("--p", "0%"); }
    }
    progress();
  }
  function progress() {
    const a = C.audio;
    if (!a || !C.key) return;
    const d = a.duration || (C.call && C.call.dur) || 1, p = Math.min(1, (a.currentTime || 0) / d);
    for (const el of document.querySelectorAll(`.call[data-call="${CSS.escape(C.key)}"]`)) {
      el.style.setProperty("--p", (p * 100).toFixed(2) + "%");
      const sl = el.querySelector("[role=slider]");
      if (sl) sl.setAttribute("aria-valuenow", String(Math.round(a.currentTime || 0)));
      const w = el.querySelectorAll(".call-wave i"), n = Math.floor(p * w.length);
      w.forEach((b, i) => b.classList.toggle("on", i < n));
    }
  }
  function loop() {
    cancelAnimationFrame(C.raf);
    const step = () => { progress(); if (C.audio && !C.audio.paused) C.raf = requestAnimationFrame(step); };
    C.raf = requestAnimationFrame(step);
  }
  function stopLoop() { cancelAnimationFrame(C.raf); progress(); }
  function seekFrom(el, clientX) {
    const box = el.closest(".call"), track = box.querySelector("[role=slider]");
    const r = track.getBoundingClientRect(), f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const key = box.dataset.call, s = speciesOf(key);
    if (!s) return;
    if (C.key !== key) play(key, { at: f * s.call.dur });
    else { const a = audio(); try { a.currentTime = f * (a.duration || s.call.dur); } catch (e) { /* ignore */ } if (a.paused) a.play().catch(() => {}); progress(); }
  }

  /* ---------- the header switch ---------- */
  function button() {
    return `<button class="icon-btn snd" data-act="sound" aria-pressed="${C.on}" title="Bird calls: ${C.on ? "on" : "off"}" aria-label="Bird calls ${C.on ? "on" : "off"}">${C.on ? ICON.on : ICON.off}</button>`;
  }
  function paintButton() {
    for (const b of document.querySelectorAll('[data-act="sound"]')) {
      b.setAttribute("aria-pressed", String(C.on));
      b.title = `Bird calls: ${C.on ? "on" : "off"}`;
      b.setAttribute("aria-label", `Bird calls ${C.on ? "on" : "off"}`);
      b.innerHTML = C.on ? ICON.on : ICON.off;
    }
  }
  function contextKey() {
    // what should be singing right now: the open photograph, else the species page
    const m = app().model;
    if (GP.viewer && GP.viewer.isOpen()) {
      const x = m.byId.get(GP.viewer.current()), s = x && x.spKey ? m.speciesByKey.get(x.spKey) : null;
      return s && s.call ? s.slug : null;
    }
    const r = app().parseHash();
    if (r.parts[0] === "species" && r.parts[1]) { const s = m.speciesBySlug.get(r.parts[1]); return s && s.call ? s.slug : null; }
    return null;
  }
  function toggle() {
    C.on = !C.on;
    store.set("gp-sound", C.on ? "1" : "0");
    paintButton();
    if (C.on) {
      const k = contextKey();
      if (k) play(k, { restart: true });
      app().toast(k ? "Bird calls on" : "Bird calls on: each species sings as you open its photographs");
    } else { pause(true); app().toast("Bird calls off"); }
  }

  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest(".call-play");
    if (b) { e.preventDefault(); toggleKey(b.closest(".call").dataset.call); return; }
    const t = e.target.closest(".call [role=slider]");
    if (t) seekFrom(t, e.clientX);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target.closest && e.target.closest(".call [role=slider]");
    if (t) {
      const key = t.closest(".call").dataset.call, a = audio();
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); toggleKey(key); return; }
      if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && C.key === key) {
        e.preventDefault(); e.stopPropagation();
        try { a.currentTime = Math.max(0, Math.min(a.duration || 10, a.currentTime + (e.key === "ArrowRight" ? 1 : -1))); } catch (err) { /* ignore */ }
        progress();
      }
      return;
    }
    // C in the viewer plays or pauses the call of the photograph on screen
    if ((e.key === "c" || e.key === "C") && !e.metaKey && !e.ctrlKey && !e.altKey && GP.viewer && GP.viewer.isOpen()) {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      const k = contextKey();
      if (k) { e.preventDefault(); toggleKey(k); }
    }
  }, true);
  document.addEventListener("gp:viewer-show", (e) => {
    sync();
    if (!C.on) return;
    const x = e.detail && e.detail.x, m = app().model;
    const s = x && x.spKey ? m.speciesByKey.get(x.spKey) : null;
    if (s && s.call) { if (C.key !== s.slug || !C.audio || C.audio.paused) play(s.slug, { auto: true, restart: C.key !== s.slug }); }
    else pause(true);
  });
  document.addEventListener("gp:viewer-close", () => { if (C.on) pause(true); });
  // re-paint players that appear after a page renders (and keep the switch in step)
  new MutationObserver(() => { if (C.key) sync(); }).observe(document.documentElement, { childList: true, subtree: true });

  // species pages: with sound on, the call plays when the page opens
  function onSpeciesPage(s) { if (C.on && s && s.call) play(s.slug, { auto: true, restart: C.key !== s.slug }); }

  GP.calls = { available, player, button, toggle, play, pause, toggleKey, onSpeciesPage, region, get on() { return C.on; }, get state() { const a = C.audio; return { key: C.key, playing: !!(a && !a.paused), t: a ? a.currentTime : 0, on: C.on }; } };
})(window.GP = window.GP || {});
