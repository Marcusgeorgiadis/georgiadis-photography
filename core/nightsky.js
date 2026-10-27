/* Georgiadis Photography: the life list as a night sky. Every species on the list is a star,
   brighter and larger the more it has been photographed and tinted by its own colours; every
   family is a constellation, its stars joined by faint lines and named. The sky shifts a little
   with the pointer, the stars twinkle, and now and then one falls. Hover a star to see its bird;
   click to go to it. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const TAU = Math.PI * 2;

  function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  function starColour(pal) {
    // a star's colour: white, warmed or cooled a little by the bird's most colourful tone
    let best = null, bs = -1;
    for (const c of pal || []) { const [h, s, l] = GP.model.hexHsl(c); const sc = s * (1 - Math.abs(2 * l - 1)); if (sc > bs) { bs = sc; best = [h, s]; } }
    if (!best) return "hsl(220 30% 92%)";
    return `hsl(${Math.round(best[0])} ${Math.round(Math.min(80, best[1] * 100))}% 86%)`;
  }
  // Families as clusters on a golden-angle spiral, their species spread like seeds in a sunflower.
  function chart(m) {
    const fams = GP.plates ? GP.plates.families(m) : [];
    const F = fams.length, stars = [], groups = [];
    const max = Math.max(1, ...fams.flatMap((f) => f.species.map((s) => s.photos.length)));
    fams.forEach((f, i) => {
      const a = i * 2.39996 + 0.6, r = Math.sqrt((i + 0.6) / F) * 0.92;
      const cx = 0.5 + Math.cos(a) * r * 0.48, cy = 0.5 + Math.sin(a) * r * 0.45;
      const R = 0.022 + 0.017 * Math.sqrt(f.species.length);
      const rnd = rng(f.name);
      const members = f.species.map((s, k) => {
        const aa = k * 2.39996 + rnd() * TAU, rr = R * Math.sqrt((k + 0.5) / f.species.length) + (rnd() - 0.5) * 0.008;
        const st = { s, f, x: cx + Math.cos(aa) * rr, y: cy + Math.sin(aa) * rr * 0.9, mag: Math.sqrt(s.photos.length / max), col: starColour(s.best && s.best.pal), ph: rnd() * TAU, sp: 0.6 + rnd() * 1.4 };
        stars.push(st);
        return st;
      });
      // the constellation: the shortest set of lines that joins its stars
      const lines = [];
      if (members.length > 1) {
        const inT = new Set([0]);
        while (inT.size < members.length) {
          let bd = Infinity, bi = -1, bj = -1;
          for (const i2 of inT) for (let j = 0; j < members.length; j++) {
            if (inT.has(j)) continue;
            const d = Math.hypot(members[i2].x - members[j].x, members[i2].y - members[j].y);
            if (d < bd) { bd = d; bi = i2; bj = j; }
          }
          inT.add(bj); lines.push([members[bi], members[bj]]);
        }
      }
      groups.push({ f, members, lines, cx, cy, R });
    });
    return { stars, groups };
  }

  function render({ model: m, h }) {
    const life = m.life.length;
    const html = `<div class="ns" data-hover="">
  <canvas class="ns-c" aria-hidden="true"></canvas>
  <div class="ns-head wrap"><div class="kicker">The life list</div><h1 class="display">The night sky</h1>
    <p>${h.plural(life, "species", "species")}, each a star: the brighter, the more it has been photographed. Each family is a constellation. Rest on a star to see its bird.</p></div>
  <div class="ns-card" hidden></div>
  <div class="ns-foot wrap"><span class="sc">Hover a star · click to visit · <a href="#/journal?tree=1">the same list as a tree</a></span></div>
  <ul class="visually-hidden">${m.life.map((s) => `<li><a href="#/species/${h.esc(s.slug)}">${h.esc(s.name)}</a></li>`).join("")}</ul>
</div>`;
    return { html, title: "The night sky", full: true, after: (main, signal) => mount(main, signal, m, h) };
  }

  function mount(main, signal, m, h) {
    const el = main.querySelector(".ns"), cv = el.querySelector(".ns-c"), card = el.querySelector(".ns-card");
    const ctx = cv.getContext("2d");
    const { stars, groups } = chart(m);
    let W = 0, H = 0, dpr = 1, bg = null, raf = 0, hover = null, px = 0, py = 0, cx = 0, cy = 0, t0 = performance.now(), meteor = null, nextMeteor = 4000 + Math.random() * 6000, visible = true;
    const field = Array.from({ length: 700 }, (_, i) => { const r = rng("f" + i); return { x: r(), y: r(), a: 0.15 + r() * 0.5, s: 0.3 + r() * 0.9, ph: r() * TAU }; });
    function size() {
      const r = el.getBoundingClientRect();
      dpr = Math.min(2, devicePixelRatio || 1);
      W = Math.max(320, r.width); H = Math.max(320, r.height);
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cv.style.width = W + "px"; cv.style.height = H + "px";
      // the backdrop: night gradient and the Milky Way, painted once per size
      bg = document.createElement("canvas"); bg.width = cv.width; bg.height = cv.height;
      const g = bg.getContext("2d");
      const gr = g.createLinearGradient(0, 0, 0, bg.height);
      gr.addColorStop(0, "#03050d"); gr.addColorStop(0.6, "#08102a"); gr.addColorStop(1, "#141d3f");
      g.fillStyle = gr; g.fillRect(0, 0, bg.width, bg.height);
      g.save(); g.translate(bg.width * 0.5, bg.height * 0.5); g.rotate(-0.42);
      const band = g.createLinearGradient(0, -bg.height * 0.22, 0, bg.height * 0.22);
      band.addColorStop(0, "rgba(120,130,200,0)"); band.addColorStop(0.5, "rgba(150,150,210,0.13)"); band.addColorStop(1, "rgba(120,130,200,0)");
      g.fillStyle = band; g.fillRect(-bg.width, -bg.height * 0.22, bg.width * 2, bg.height * 0.44);
      const rr = rng("milky");
      for (let i = 0; i < 2600; i++) { const x = (rr() - 0.5) * bg.width * 2, y = (rr() + rr() + rr() - 1.5) * bg.height * 0.16; g.fillStyle = `rgba(220,225,255,${(rr() * 0.35).toFixed(3)})`; g.fillRect(x, y, dpr * 0.8, dpr * 0.8); }
      for (let i = 0; i < 26; i++) { const x = (rr() - 0.5) * bg.width * 1.6, y = (rr() - 0.5) * bg.height * 0.2, r2 = (40 + rr() * 120) * dpr; const n = g.createRadialGradient(x, y, 0, x, y, r2); n.addColorStop(0, `rgba(${rr() > 0.5 ? "190,170,255" : "150,190,255"},0.06)`); n.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = n; g.fillRect(x - r2, y - r2, r2 * 2, r2 * 2); }
      g.restore();
      place();
    }
    // Constellation names: biggest families first, below their stars or else above, never over
    // another name or the page's heading; a name with no room waits until its stars are hovered.
    function place() {
      const taken = [], hr = el.querySelector(".ns-head").getBoundingClientRect(), er = el.getBoundingClientRect();
      const head = { x0: hr.left - er.left, y0: 0, x1: hr.right - er.left, y1: hr.bottom - er.top - 8 };
      const hit = (a) => a.x0 < 4 || a.x1 > W - 4 || a.y0 < 0 || a.y1 > H - 40 || [head, ...taken].some((b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0);
      ctx.font = `500 ${Math.round(10.5 * dpr)}px "IBM Plex Mono", monospace`;
      for (const g of [...groups].sort((a, b) => b.members.length - a.members.length)) {
        g.lab = null;
        const w = ctx.measureText(g.f.common.toUpperCase()).width / dpr + 8, rad = g.R * Math.min(W, H) * 1.05;
        const x = g.cx * W, under = g.cy * H + rad + 16, over = g.cy * H - rad - 8;
        g.home = under;
        if (g.members.length < 2) continue;
        for (const y of [under, over, under + 12, over - 12]) {
          const box = { x0: x - w / 2, x1: x + w / 2, y0: y - 11, y1: y + 4 };
          if (!hit(box)) { taken.push(box); g.lab = y; break; }
        }
      }
    }
    const X = (s, k = 1) => (s.x * W + cx * 10 * k) * dpr, Y = (s, k = 1) => (s.y * H + cy * 10 * k) * dpr;
    function frame(now) {
      raf = 0;
      if (!visible) return;
      const t = (now - t0) / 1000;
      cx += (px - cx) * 0.05; cy += (py - cy) * 0.05;
      ctx.drawImage(bg, cx * 3 * dpr, cy * 3 * dpr);
      // field stars
      for (const f of field) {
        const a = f.a * (reduced() ? 1 : 0.75 + 0.25 * Math.sin(t * 1.3 + f.ph));
        ctx.fillStyle = `rgba(225,230,255,${a.toFixed(3)})`;
        ctx.fillRect((f.x * W + cx * 4) * dpr, (f.y * H + cy * 4) * dpr, f.s * dpr, f.s * dpr);
      }
      // constellations
      const hf = hover && hover.f;
      ctx.lineWidth = dpr * 0.8;
      for (const g of groups) {
        const on = g.f === hf;
        ctx.strokeStyle = on ? "rgba(255,226,170,0.85)" : "rgba(170,185,255,0.18)";
        ctx.lineWidth = dpr * (on ? 1.3 : 0.8);
        ctx.beginPath();
        for (const [a, b] of g.lines) { ctx.moveTo(X(a), Y(a)); ctx.lineTo(X(b), Y(b)); }
        ctx.stroke();
        if (g.lab != null || on) {
          ctx.font = `${on ? 600 : 500} ${Math.round((on ? 12 : 10.5) * dpr)}px "IBM Plex Mono", monospace`;
          ctx.fillStyle = on ? "rgba(255,230,180,0.95)" : "rgba(190,200,255,0.34)";
          ctx.textAlign = "center";
          ctx.fillText(g.f.common.toUpperCase(), (g.cx * W + cx * 10) * dpr, ((g.lab != null ? g.lab : g.home) + cy * 10) * dpr);
        }
      }
      // the species
      for (const s of stars) {
        const tw = reduced() ? 1 : 0.78 + 0.22 * Math.sin(t * s.sp + s.ph);
        const r = (1.1 + s.mag * 3.4) * dpr * (s === hover ? 1.6 : 1);
        const x = X(s), y = Y(s);
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
        glow.addColorStop(0, s.col.replace("hsl(", "hsla(").replace(")", ` / ${(0.55 * tw).toFixed(2)})`));
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, TAU); ctx.fill();
        ctx.fillStyle = s.col; ctx.globalAlpha = Math.min(1, 0.55 + s.mag * 0.6) * tw;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 1;
        if (s.mag > 0.55) { ctx.strokeStyle = `rgba(255,255,255,${(0.25 * tw).toFixed(2)})`; ctx.lineWidth = dpr * 0.6; ctx.beginPath(); ctx.moveTo(x - r * 4, y); ctx.lineTo(x + r * 4, y); ctx.moveTo(x, y - r * 4); ctx.lineTo(x, y + r * 4); ctx.stroke(); }
      }
      if (hover) { ctx.strokeStyle = "rgba(255,226,170,0.9)"; ctx.lineWidth = dpr * 1.2; ctx.beginPath(); ctx.arc(X(hover), Y(hover), (12 + hover.mag * 6) * dpr, 0, TAU); ctx.stroke(); }
      // a falling star, now and then
      if (!reduced()) {
        if (!meteor && now - t0 > nextMeteor) { const r2 = Math.random; meteor = { x: r2() * W * 0.8 + W * 0.1, y: r2() * H * 0.35, vx: (r2() > 0.5 ? 1 : -1) * (420 + r2() * 300), vy: 160 + r2() * 160, t: now }; nextMeteor = now - t0 + 9000 + Math.random() * 12000; }
        if (meteor) {
          const k = (now - meteor.t) / 1000;
          if (k > 0.9) meteor = null;
          else {
            const x = (meteor.x + meteor.vx * k) * dpr, y = (meteor.y + meteor.vy * k) * dpr;
            const gr = ctx.createLinearGradient(x, y, x - meteor.vx * 0.12 * dpr, y - meteor.vy * 0.12 * dpr);
            gr.addColorStop(0, `rgba(255,255,255,${(1 - k).toFixed(2)})`); gr.addColorStop(1, "rgba(255,255,255,0)");
            ctx.strokeStyle = gr; ctx.lineWidth = 1.6 * dpr; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - meteor.vx * 0.12 * dpr, y - meteor.vy * 0.12 * dpr); ctx.stroke();
          }
        }
      }
      if (!reduced() || Math.abs(px - cx) + Math.abs(py - cy) > 0.001) raf = requestAnimationFrame(frame);
    }
    const kick = () => { if (!raf) raf = requestAnimationFrame(frame); };
    function nearest(ex, ey) {
      let best = null, bd = 22;
      for (const s of stars) { const d = Math.hypot(s.x * W + cx * 10 - ex, s.y * H + cy * 10 - ey); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    function showCard(s, ex, ey) {
      if (!s) { card.hidden = true; el.dataset.hover = ""; return; }
      const sp = s.s;
      card.innerHTML = `<span class="ns-pic">${h.cover(sp.best, 420, "", sp.name)}</span><span class="ns-t"><span class="sc">${h.esc(s.f.common)} · No. ${sp.lifeNo}</span><b>${h.esc(sp.name)}</b>${sp.bin ? `<i>${h.esc(sp.bin)}</i>` : ""}<span class="mono">${h.plural(sp.photos.length, "photograph")} · first seen ${h.esc(h.fmtShort(sp.first))}</span></span>`;
      card.hidden = false;
      const left = ex + 24 + 260 > W ? ex - 24 - 260 : ex + 24;
      card.style.left = left + "px";
      card.style.top = Math.max(70, Math.min(H - 230, ey - 90)) + "px";
      el.dataset.hover = sp.slug;
    }
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect(), ex = e.clientX - r.left, ey = e.clientY - r.top;
      px = (ex / W - 0.5) * -1.2; py = (ey / H - 0.5) * -1.2;
      const s = nearest(ex, ey);
      if (s !== hover) { hover = s; showCard(s, ex, ey); el.style.cursor = s ? "pointer" : ""; }
      kick();
    }, { signal });
    el.addEventListener("pointerleave", () => { hover = null; showCard(null); px = 0; py = 0; kick(); }, { signal });
    el.addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      const r = el.getBoundingClientRect(), s = nearest(e.clientX - r.left, e.clientY - r.top);
      if (s) location.hash = "#/species/" + s.s.slug;
    }, { signal });
    const ro = new ResizeObserver(() => { size(); kick(); });
    ro.observe(el);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) kick(); });
    io.observe(el);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); }, { signal });
    signal.addEventListener("abort", () => { ro.disconnect(); io.disconnect(); cancelAnimationFrame(raf); });
    size(); kick();
    if (document.fonts) document.fonts.ready.then(() => { if (!signal.aborted) place(); });
  }

  GP.nightSky = { chart };
  (GP.views = GP.views || []).push({ id: "sky", label: "The night sky", nav: false, render });
})(window.GP = window.GP || {});
