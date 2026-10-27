/* Georgiadis Photography: a day in the marsh, in sixty seconds. Every species with a call sits on a
   24-hour ring at the hour it is most often photographed. Press play and a hand sweeps the day,
   the sky behind it turning from night to dawn to noon to dusk as it goes, and each bird calls
   (from its side of the ring) as the hand reaches it, over the marsh's own sound. */
(function (GP) {
  "use strict";
  const DUR = 60000, START = 4 * 60; // a day takes a minute; it starts at 4 am, before the dawn chorus
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function birds(m) {
    const list = [];
    for (const s of m.species) {
      if (!s.call || !s.best) continue;
      const hours = Array(24).fill(0);
      for (const x of s.photos) if (x.hasTime && x.mins != null) hours[Math.floor(x.mins / 60) % 24]++;
      const n = hours.reduce((a, b) => a + b, 0);
      if (!n) continue;
      // the busiest hour, nudged to the middle of where its photographs fall within it
      const peak = hours.indexOf(Math.max(...hours));
      const inPeak = s.photos.filter((x) => x.hasTime && Math.floor(x.mins / 60) === peak).map((x) => x.mins);
      const at = inPeak.length ? inPeak.reduce((a, b) => a + b, 0) / inPeak.length : peak * 60 + 30;
      list.push({ s, at, hours, n });
    }
    list.sort((a, b) => a.at - b.at);
    // Pack the birds like a flock around the ring: each stays within half an hour of its time and
    // between the inner and outer tracks, and they push apart until none overlap. Busy hours
    // (the morning) become a crowd, as they are.
    const rnd = (k) => { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const P = list.map((b, i) => ({ b, a: b.at, r: RMIN + rnd(i) * (RMAX - RMIN) }));
    const xy = (p) => { const t = ang(p.a); return [Math.cos(t) * p.r, Math.sin(t) * p.r]; };
    for (let it = 0; it < 260; it++) {
      let moved = 0;
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
        const [x1, y1] = xy(P[i]), [x2, y2] = xy(P[j]);
        const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 0.01;
        if (d >= BUB) continue;
        const push = (BUB - d) / 2, ux = dx / d, uy = dy / d;
        for (const [p, sg] of [[P[i], -1], [P[j], 1]]) {
          const [px, py] = xy(p);
          const nx = px + ux * push * sg, ny = py + uy * push * sg;
          const r = Math.max(RMIN, Math.min(RMAX, Math.hypot(nx, ny)));
          let a = ((Math.atan2(ny, nx) * 180 / Math.PI + 90 + 360) % 360) / 360 * 1440;
          const dev = ((a - p.b.at + 2160) % 1440) - 720;
          a = p.b.at + Math.max(-30, Math.min(30, dev));
          p.r = r; p.a = a;
        }
        moved++;
      }
      if (!moved) break;
    }
    P.forEach((p) => { p.b.pos = { a: p.a, r: p.r }; });
    return list;
  }
  const RMIN = 168, RMAX = 330, BUB = 34;
  const ang = (mins) => ((mins / 1440) * 360 - 90) * Math.PI / 180;

  function render({ model: m, h }) {
    const list = birds(m);
    const R = [RMAX, RMIN];
    const L = GP.sky ? GP.sky.local() : { y: 2026, mo: 6, d: 21 };
    const hourTicks = Array.from({ length: 24 }, (_, hr) => {
      const a = ang(hr * 60), r0 = 336, r1 = hr % 6 === 0 ? 352 : 344;
      return `<line x1="${(Math.cos(a) * r0).toFixed(1)}" y1="${(Math.sin(a) * r0).toFixed(1)}" x2="${(Math.cos(a) * r1).toFixed(1)}" y2="${(Math.sin(a) * r1).toFixed(1)}"/>${hr % 3 === 0 ? `<text x="${(Math.cos(a) * 372).toFixed(1)}" y="${(Math.sin(a) * 372 + 4).toFixed(1)}" text-anchor="middle">${GP.sky ? GP.sky.clock(hr * 60).replace(":00", "") : hr}</text>` : ""}`;
    }).join("");
    // the sun's path: bright for the day, dim for the night, from the real sunrise and sunset today
    const st = GP.model.sunTimes(L.y, L.mo, L.d);
    const arc = (m0, m1, r) => { const a0 = ang(m0), a1 = ang(m1); return `M${(Math.cos(a0) * r).toFixed(1)},${(Math.sin(a0) * r).toFixed(1)} A${r},${r} 0 ${m1 - m0 > 720 ? 1 : 0} 1 ${(Math.cos(a1) * r).toFixed(1)},${(Math.sin(a1) * r).toFixed(1)}`; };
    const bubbles = list.map((b, i) => {
      const a = ang(b.pos.a), r = b.pos.r, x = Math.cos(a) * r, y = Math.sin(a) * r;
      return `<button class="dm-b" data-i="${i}" style="left:calc(50% + ${(x / 8).toFixed(2)}%);top:calc(50% + ${(y / 8).toFixed(2)}%);--fx:${(b.s.best.fp[0] * 100).toFixed(0)}%;--fy:${(b.s.best.fp[1] * 100).toFixed(0)}%" aria-label="${h.esc(b.s.name)}, most often photographed around ${h.esc(GP.sky ? GP.sky.clock(b.at) : "")}" data-tip="${h.esc(b.s.name)}" data-tip-v="${h.esc(GP.sky ? GP.sky.clock(b.at) : "")}">${h.cover(b.s.best, 160, "", "")}</button>`;
    }).join("");
    const html = `<div class="dm" data-state="ready">
  <div class="dm-sky" aria-hidden="true"><i></i><i class="dm-stars"></i><i class="dm-sun"></i></div>
  <div class="wrap dm-wrap">
    <header class="dm-head"><div class="kicker">Listen</div><h1 class="display">A day in the marsh</h1><p class="lede">${h.plural(list.length, "species", "species")} with a recorded call, each placed at the hour it is most often photographed. A whole day takes a minute: press play, turn your sound up, and listen to the marsh wake, rest and settle.</p></header>
    <div class="dm-stage">
      <div class="dm-ring">
        <svg class="dm-svg" viewBox="-400 -400 800 800" aria-hidden="true">
          <circle r="336" class="dm-rim"/>
          <path d="${arc(st.rise, st.set, 320)}" class="dm-day"/><path d="${arc(st.set, st.rise + 1440, 320)}" class="dm-night"/>
          ${R.map((r) => `<circle r="${r}" class="dm-track"/>`).join("")}
          <g class="dm-ticks">${hourTicks}</g>
        </svg>
        <svg class="dm-svg dm-handsvg" viewBox="-400 -400 800 800" aria-hidden="true"><g class="dm-hand"><line x1="0" y1="-190" x2="0" y2="-344"/><circle cy="-344" r="16" class="dm-glow"/><circle cy="-344" r="6"/></g></svg>
        ${bubbles}
        <div class="dm-core"><b class="dm-time display">4:00 am</b><span class="dm-light sc">Night</span><span class="dm-now"></span>
          <button class="btn primary dm-play" data-dm="play">${h.ICON.play} Play the day</button></div>
      </div>
    </div>
    <ol class="dm-list">${list.map((b, i) => `<li><button data-i="${i}" class="dm-li">${h.cover(b.s.best, 120, "", "")}<span><b>${h.esc(b.s.name)}</b><span class="mono">${h.esc(GP.sky ? GP.sky.clock(b.at) : "")}</span></span></button></li>`).join("")}</ol>
  </div>
</div>`;
    const after = (main, signal) => mount(main, signal, list, h, L);
    return { html, after, title: "A day in the marsh", full: false };
  }

  function mount(main, signal, list, h, L) {
    const el = main.querySelector(".dm"), hand = el.querySelector(".dm-handsvg"), timeEl = el.querySelector(".dm-time"), lightEl = el.querySelector(".dm-light"), nowEl = el.querySelector(".dm-now");
    const sky = el.querySelector(".dm-sky i"), stars = el.querySelector(".dm-stars"), sunEl = el.querySelector(".dm-sun"), btn = el.querySelector('[data-dm="play"]');
    const bubbles = [...el.querySelectorAll(".dm-b")];
    // the sky at each minute of today, sampled every quarter hour
    const samples = Array.from({ length: 97 }, (_, k) => {
      const mins = k * 15, hh = Math.floor(mins / 60) % 24, mi = mins % 60;
      const ms = GP.sky.utcOfLocal(L.y, L.mo, L.d, hh, mi);
      const sun = GP.sky.sunAt(ms);
      return { sun, sky: GP.sky.skyAt(sun.alt, sun.az) };
    });
    const st = GP.model.sunTimes(L.y, L.mo, L.d);
    let t0 = 0, playing = false, raf = 0, at = START, played = new Set(), voices = [], lastNight = null, lastK = -1, lastClock = "";
    const paint = (mins) => {
      // the hand turns every frame, on its own layer; the sky and the words change only when they change
      hand.style.transform = `rotate(${((mins % 1440) / 1440) * 360}deg)`;
      const clock = GP.sky.clock(mins);
      if (clock !== lastClock) { lastClock = clock; timeEl.textContent = clock; lightEl.textContent = GP.model.lightOf(((mins % 1440) + 1440) % 1440, st) || ""; }
      const k = Math.max(0, Math.min(96, Math.round(((mins % 1440) + 1440) % 1440 / 15)));
      if (k === lastK) return;
      lastK = k;
      const smp = samples[k];
      sky.style.background = `linear-gradient(180deg, ${smp.sky.top}, ${smp.sky.mid} 55%, ${smp.sky.hz})`;
      stars.style.opacity = String(Math.max(0, Math.min(1, (-smp.sun.alt - 4) / 10)));
      // facing south over the marsh: the sun rises on the left and sets on the right
      sunEl.style.left = (8 + Math.max(0, Math.min(1, (smp.sun.az - 70) / 220)) * 84).toFixed(1) + "%";
      sunEl.style.bottom = (8 + Math.max(-12, smp.sun.alt) / 90 * 80).toFixed(1) + "%";
      sunEl.style.opacity = String(Math.max(0, Math.min(1, (smp.sun.alt + 3) / 5)));
      el.classList.toggle("dm-dark", smp.sun.alt < -1);
      const night = smp.sun.alt < -4;
      if (GP.scape && night !== lastNight) { lastNight = night; GP.scape.place("water", night); }
    };
    const sing = (i) => {
      const b = list[i], bub = bubbles[i];
      if (!b) return;
      bubbles.forEach((x) => x.classList.toggle("on", x === bub));
      el.querySelectorAll(".dm-li").forEach((x) => x.classList.toggle("on", +x.dataset.i === i));
      nowEl.innerHTML = `<b>${h.esc(b.s.name)}</b>`;
      const r = bub.getBoundingClientRect(), box = el.querySelector(".dm-ring").getBoundingClientRect();
      const pan = ((r.left + r.width / 2 - box.left) / box.width) * 2 - 1;
      if (GP.scape) {
        const v = GP.scape.voice(b.s, { pan: pan * 0.9, gain: 0.6, max: 6.5, fade: 0.8 });
        if (v) voices.push(v);
      }
      if (!reduced()) { const ring = document.createElement("i"); ring.className = "song-ring"; ring.style.setProperty("--k", "1.2"); bub.appendChild(ring); setTimeout(() => ring.remove(), 2000); }
    };
    const frame = (now) => {
      raf = 0;
      if (!playing) return;
      const k = (now - t0) / DUR;
      at = START + k * 1440;
      paint(at);
      list.forEach((b, i) => {
        // has the hand reached this bird since the day began?
        const rel = ((b.at - START) % 1440 + 1440) % 1440;
        if (!played.has(i) && k * 1440 >= rel) { played.add(i); sing(i); }
      });
      if (k >= 1) { stop(true); return; }
      raf = requestAnimationFrame(frame);
    };
    const start = () => {
      if (GP.calls && GP.calls.state.playing) GP.calls.pause(true);
      if (GP.scape) { GP.scape.borrow(true, 0.12); lastNight = null; }
      if (at >= START + 1440 - 1) { at = START; played = new Set(); }
      t0 = performance.now() - ((at - START) / 1440) * DUR;
      playing = true;
      el.dataset.state = "playing";
      btn.innerHTML = `${h.ICON.pause} Pause`;
      raf = requestAnimationFrame(frame);
    };
    const stop = (ended) => {
      playing = false;
      cancelAnimationFrame(raf); raf = 0;
      el.dataset.state = ended ? "ended" : "paused";
      btn.innerHTML = ended ? `${h.ICON.play} Play it again` : `${h.ICON.play} Carry on`;
      if (ended) { at = START + 1440; played = new Set(); nowEl.textContent = "and the marsh settles for the night"; }
      voices.forEach((v) => v.stop && v.stop(1.2)); voices = [];
      if (GP.scape) GP.scape.borrow(false);
    };
    btn.addEventListener("click", () => (playing ? stop(false) : start()), { signal });
    // a bird, or a row of the list: hear it, and move the day there
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-i]");
      if (!b || b === btn) return;
      const i = +b.dataset.i;
      if (!playing) { at = list[i].at < START ? list[i].at + 1440 : list[i].at; paint(at); if (GP.scape) GP.scape.borrow(true, 0.12); }
      played.add(i);
      sing(i);
    }, { signal });
    // drag the hand to any hour
    const ring = el.querySelector(".dm-ring");
    let dragging = false;
    const toMins = (e) => { const r = ring.getBoundingClientRect(); const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI + 90; return (((a + 360) % 360) / 360) * 1440; };
    ring.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; dragging = true; ring.setPointerCapture(e.pointerId); const mm = toMins(e); at = mm < START ? mm + 1440 : mm; played = new Set(list.map((b, i) => (((b.at - START) % 1440 + 1440) % 1440 <= at - START ? i : -1)).filter((i) => i >= 0)); if (playing) t0 = performance.now() - ((at - START) / 1440) * DUR; paint(at); }, { signal });
    ring.addEventListener("pointermove", (e) => { if (!dragging) return; const mm = toMins(e); at = mm < START ? mm + 1440 : mm; if (playing) t0 = performance.now() - ((at - START) / 1440) * DUR; paint(at); }, { signal });
    ring.addEventListener("pointerup", () => { dragging = false; }, { signal });
    document.addEventListener("keydown", (e) => { if (e.key === " " && !/input|textarea|button/i.test(e.target.tagName) && !(GP.viewer && GP.viewer.isOpen())) { e.preventDefault(); playing ? stop(false) : start(); } }, { signal });
    signal.addEventListener("abort", () => { if (playing) stop(false); else if (GP.scape) GP.scape.borrow(false); });
    paint(at);
  }

  GP.marsh = { birds };
  (GP.views = GP.views || []).push({ id: "day", label: "A day in the marsh", nav: false, render });
})(window.GP = window.GP || {});
