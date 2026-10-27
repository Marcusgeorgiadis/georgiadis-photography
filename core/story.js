/* Georgiadis Photography: an outing, told as a story. #/story/<outing> scrolls through the day:
   the sky behind turns with the real light of that morning or afternoon, each photograph arrives
   at the minute it was made, every species calls the first time it appears (with sound on), and
   the outing's own notes are told between the frames. A line down the side keeps the time. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const MAX = 28;

  // The beats: every photograph in time order, or, for a long day, the first sighting of each
  // species plus the strongest frames spread across the hours.
  function beats(o) {
    const timed = o.heroes.filter((x) => x.hasTime).slice().sort((a, b) => a.t.localeCompare(b.t));
    if (timed.length <= MAX) return timed;
    const firsts = new Set(), keep = new Set();
    for (const x of timed) if (x.spKey && !firsts.has(x.spKey)) { firsts.add(x.spKey); keep.add(x); }
    const rest = timed.filter((x) => !keep.has(x)).sort((a, b) => b.score - a.score);
    for (const x of rest) { if (keep.size >= MAX) break; if ([...keep].every((k) => Math.abs(k.mins - x.mins) >= 6 || k.spKey !== x.spKey)) keep.add(x); }
    return timed.filter((x) => keep.has(x));
  }
  const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);

  function render({ parts, model: m, h }) {
    const o = m.outingById.get(decodeURIComponent(parts[1] || ""));
    if (!o) return { html: `<div class="wrap page"><div class="empty"><h2>No such outing</h2><p><a href="#/outings">All outings</a></p></div></div>`, title: "Story" };
    const list = beats(o);
    if (!list.length) return { html: `<div class="wrap page"><div class="empty"><h2>This outing has no times to tell it by</h2><p><a href="#/outings/${h.esc(o.id)}">See the outing</a></p></div></div>`, title: "Story" };
    const i = m.outings.indexOf(o), next = m.outings.slice(i + 1).find((x) => x.heroes.some((y) => y.hasTime)), prev = m.outings.slice(0, i).reverse().find((x) => x.heroes.some((y) => y.hasTime));
    const sun = list[0].sun || GP.model.sunTimes(+o.date.slice(0, 4), +o.date.slice(5, 7), +o.date.slice(8, 10));
    const clock = (mm) => (GP.sky ? GP.sky.clock(mm) : `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`);
    const t0 = list[0].mins, t1 = list[list.length - 1].mins, span = Math.max(30, t1 - t0);
    const lines = sentences(o.note);
    const seen = new Set();
    const k = h.regCtx(list);
    const who = o.companions.length > 1 ? ` with ${o.companions.slice(1).join(", ")}` : "";
    const beatHtml = list.map((x, n) => {
      const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
      const first = sp && !seen.has(sp.key);
      if (sp) seen.add(sp.key);
      // the notes, told between the frames
      const say = lines.filter((_, j) => Math.floor((j * list.length) / Math.max(1, lines.length)) === n).map((s) => `<p class="st-say display">${h.esc(s)}</p>`).join("");
      const side = n % 2 ? "r" : "l";
      return `${say ? `<div class="st-interlude">${say}</div>` : ""}<section class="st-beat ${side}" data-i="${n}" data-min="${x.mins}">
  <figure class="st-pic"${sp && sp.call ? ` data-ripple="${h.esc(sp.slug)}"` : ""} style="--ar:${x.ar.toFixed(3)};--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%"><button data-open="${h.esc(x.id)}" aria-label="Open ${h.esc(h.titleOf(x))}"><img src="${h.esc(h.src(x, Math.min(2048, innerWidth * 0.62 * Math.min(2, devicePixelRatio || 1))))}" alt="${h.esc(h.titleOf(x))}" loading="${n < 2 ? "eager" : "lazy"}" decoding="async" data-lq="${h.esc(x.lq || "")}" style="--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%"></button></figure>
  <div class="st-t"><b class="st-time display">${h.esc(clock(x.mins))}</b><span class="sc">${h.esc(x.light || "")}${first ? " · first of the day" : ""}</span>
    <h2 class="display"${sp && sp.call ? ` data-sing="${h.esc(sp.slug)}"` : ""}>${h.esc(h.titleOf(x))}</h2>${x.sci && x.common ? `<i class="binomial">${h.esc(x.sci)}</i>` : ""}
    ${x.caption ? `<p>${h.esc(x.caption)}</p>` : ""}
    ${sp ? `<a class="st-sp" href="#/species/${h.esc(sp.slug)}">The ${h.esc(sp.name)} ${h.ICON.arrow}</a>` : ""}</div>
</section>`;
    }).join("");
    const ticks = list.map((x, n) => `<i style="top:${(((x.mins - t0) / span) * 100).toFixed(2)}%" data-i="${n}"></i>`).join("");
    const mark = (mm, l) => (mm > t0 - 20 && mm < t1 + 20 ? `<span class="st-mark" style="top:${(Math.max(0, Math.min(1, (mm - t0) / span)) * 100).toFixed(2)}%">${l} ${h.esc(clock(mm))}</span>` : "");
    const spCount = new Set(o.photos.map((x) => x.spKey).filter(Boolean)).size;
    const html = `<div class="story" data-ctx="${k}">
  <div class="st-sky" aria-hidden="true"><i class="st-sky-a"></i><i class="st-stars"></i><i class="st-sun"></i></div>
  <header class="st-open wrap"><div class="kicker">The field diary · chapter ${o.no}</div>
    <h1 class="display">${h.esc(GP.app.helpers.fmtDate(o.date))}</h1>
    <p class="st-sub">${h.esc(o.type || "An outing")}${h.esc(who)}. ${h.plural(o.photos.length, "frame")}, ${h.plural(spCount, "species", "species")}, from ${h.esc(clock(t0))} to ${h.esc(clock(t1))}.</p>
    <p class="st-sun-l mono">Sunrise ${h.esc(clock(sun.rise))} · sunset ${h.esc(clock(sun.set))}</p>
    <div class="cta"><button class="btn primary" data-st="sound" aria-pressed="false">${h.ICON.play} Read it with sound</button><a class="btn" href="#/outings/${h.esc(o.id)}">The outing</a></div>
    <span class="st-down sc">Scroll</span></header>
  <aside class="st-line" aria-hidden="true"><span class="st-rail">${ticks}${mark(sun.rise, "Sunrise")}${mark(sun.set, "Sunset")}<b class="st-now"></b></span></aside>
  <div class="st-beats">${beatHtml}</div>
  <footer class="st-end wrap"><div class="kicker">By ${h.esc(clock(t1))}</div><h2 class="display">${h.plural(o.photos.length, "frame")}, ${h.plural(spCount, "species", "species")}</h2>
    <div class="chips">${o.species.map((e) => { const s = m.speciesByKey.get(e.key); return s ? `<a class="chip" href="#/species/${h.esc(s.slug)}">${h.esc(s.name)} <span class="n">${e.n}</span></a>` : ""; }).join("")}</div>
    <nav class="st-nav">${prev ? `<a class="btn" href="#/story/${h.esc(prev.id)}">${h.ICON.left} ${h.esc(h.fmtShort(prev.date))}</a>` : "<span></span>"}<a class="btn ghost" href="#/outings/${h.esc(o.id)}">Every frame of the day</a>${next ? `<a class="btn" href="#/story/${h.esc(next.id)}">${h.esc(h.fmtShort(next.date))} ${h.ICON.right}</a>` : "<span></span>"}</nav></footer>
</div>`;
    return { html, title: `${h.fmtDate(o.date)}: the story`, after: (main, signal) => mount(main, signal, m, h, o, list) };
  }

  function mount(main, signal, m, h, o, list) {
    const el = main.querySelector(".story"), sky = el.querySelector(".st-sky-a"), stars = el.querySelector(".st-stars"), sunEl = el.querySelector(".st-sun");
    const now = el.querySelector(".st-now"), rail = el.querySelectorAll(".st-rail i"), btn = el.querySelector('[data-st="sound"]');
    const y = +o.date.slice(0, 4), mo = +o.date.slice(5, 7), d = +o.date.slice(8, 10);
    const t0 = list[0].mins, span = Math.max(30, list[list.length - 1].mins - t0);
    let cur = -1, sound = false, surf = null, voices = [];
    const heard = new Set();
    const skyAt = (mins) => { const ms = GP.sky.utcOfLocal(y, mo, d, Math.floor(mins / 60), Math.round(mins % 60)); const sun = GP.sky.sunAt(ms); return { sun, sky: GP.sky.skyAt(sun.alt, sun.az) }; };
    function paint(mins) {
      if (!GP.sky) return;
      const { sun, sky: s } = skyAt(mins);
      sky.style.background = `linear-gradient(180deg, ${s.top}, ${s.mid} 58%, ${s.hz})`;
      stars.style.opacity = String(Math.max(0, Math.min(1, (-sun.alt - 4) / 10)));
      sunEl.style.left = (8 + Math.max(0, Math.min(1, (sun.az - 70) / 220)) * 84).toFixed(1) + "%";
      sunEl.style.bottom = (6 + Math.max(-12, sun.alt) / 90 * 80).toFixed(1) + "%";
      sunEl.style.opacity = String(Math.max(0, Math.min(1, (sun.alt + 3) / 5)));
      el.classList.toggle("st-dark", s.dark);
      now.style.top = (Math.max(0, Math.min(1, (mins - t0) / span)) * 100).toFixed(2) + "%";
      now.textContent = GP.sky.clock(mins);
    }
    function enter(n) {
      if (n === cur) return;
      cur = n;
      const x = list[n], beat = el.querySelector(`.st-beat[data-i="${n}"]`);
      el.querySelectorAll(".st-beat.on").forEach((b) => b.classList.remove("on"));
      if (beat) beat.classList.add("on");
      rail.forEach((t) => t.classList.toggle("on", +t.dataset.i <= n));
      paint(x.mins);
      if (GP.tint) GP.tint.set(x);
      if (GP.scape && sound) GP.scape.place(GP.fx ? GP.fx.habitat(x) : "water", x.light === "Night" || x.light === "Blue hour");
      // its subject floats in front of its background while it's the one being told
      if (surf) { const s2 = surf; setTimeout(() => s2.destroy(), 600); surf = null; }
      const img = beat && beat.querySelector("img");
      if (img && GP.fx) {
        GP.fx.leak(beat.querySelector(".st-pic"), x);
        const go = () => { if (cur === n) surf = GP.fx.surface(img, x, { auto: true, amount: 0.018, listen: beat, ripple: true }); };
        if (img.complete && img.naturalWidth) setTimeout(go, 300); else img.addEventListener("load", go, { once: true });
      }
      // a species calls the first time it appears
      const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
      if (sound && sp && sp.call && !heard.has(sp.key) && GP.scape) {
        heard.add(sp.key);
        voices.forEach((v) => v.stop && v.stop(0.8));
        const v = GP.scape.voice(sp, { pan: beat && beat.classList.contains("r") ? 0.35 : -0.35, gain: 0.6, max: 7, fade: 0.8 });
        if (v) voices = [v];
        // its name sings along through the call player's loudness (the voice has its own); ring once
        const pic = beat.querySelector(".st-pic");
        if (pic && !reduced()) [0, 650, 1300].forEach((t) => setTimeout(() => { const r = document.createElement("i"); r.className = "song-ring"; pic.appendChild(r); setTimeout(() => r.remove(), 2000); }, t));
      }
    }
    const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) enter(+e.target.dataset.i); }, { rootMargin: "-46% 0px -46% 0px" });
    el.querySelectorAll(".st-beat").forEach((b) => io.observe(b));
    // reveal each beat as it comes up
    const rv = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add("in"); rv.unobserve(e.target); } }, { rootMargin: "0px 0px -12% 0px" });
    el.querySelectorAll(".st-beat, .st-interlude, .st-end").forEach((b) => rv.observe(b));
    btn.addEventListener("click", () => {
      sound = !sound;
      btn.setAttribute("aria-pressed", String(sound));
      btn.innerHTML = sound ? `${h.ICON.pause} Sound on` : `${h.ICON.play} Read it with sound`;
      if (GP.scape) {
        GP.scape.borrow(sound, 0.13);
        if (sound) { const x = list[Math.max(0, cur)]; GP.scape.place(GP.fx ? GP.fx.habitat(x) : "water", x.light === "Night" || x.light === "Blue hour"); heard.clear(); if (cur >= 0) { const n = cur; cur = -1; enter(n); } }
        else voices.forEach((v) => v.stop && v.stop(0.6));
      }
    }, { signal });
    signal.addEventListener("abort", () => { io.disconnect(); rv.disconnect(); if (surf) surf.destroy(); voices.forEach((v) => v.stop && v.stop(0.4)); if (GP.scape) GP.scape.borrow(false); });
    paint(Math.max(0, t0 - 20));
    if (GP.tint) GP.tint.page(o.cover);
  }

  GP.story = { beats };
  (GP.views = GP.views || []).push({ id: "story", label: "Story", nav: false, render });
})(window.GP = window.GP || {});
