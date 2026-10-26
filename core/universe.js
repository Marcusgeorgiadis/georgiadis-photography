/* Georgiadis Photography: the Universe. Every photograph as a small tile on one canvas,
   rearranged on request into a colour wheel, a skyline of outings, a 24-hour clock or
   clusters by family. Tiles start as the stored 20 px placeholders and swap to real
   thumbnails once they're drawn large enough to tell the difference. */
(function (GP) {
  "use strict";
  const MODES = [
    ["colour", "Colour", "Arranged by each photograph's strongest colour: vivid at the rim, muted toward the centre."],
    ["year", "Outings", "One column per outing, oldest on the left, each frame stacked in the order it was taken."],
    ["clock", "Hours", "Around a 24-hour dial by the minute each frame was taken. The gold arc is daylight."],
    ["family", "Families", "Clustered by family, each cluster a spiral of its species."],
  ];
  const GAP = 0.08; // fraction of a tile left empty between neighbours
  const TAU = Math.PI * 2;
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /* ---------- colour of a photograph ---------- */
  function vivid(x) {
    let best = null;
    (x.hsl || []).slice(0, 4).forEach((c, i) => {
      const chroma = c[1] * (1 - Math.abs(2 * c[2] - 1));
      if (!best || chroma > best.chroma) best = { h: c[0], s: c[1], l: c[2], chroma, hex: x.pal[i] };
    });
    return best || { h: 0, s: 0, l: 0.5, chroma: 0, hex: "#777" };
  }

  /* ---------- lattice assignment: each photo to the nearest free cell ---------- */
  function snap(targets, order) {
    const free = new Map(), out = new Array(targets.length);
    const key = (i, j) => i + "," + j;
    for (const k of order) {
      const t = targets[k], ci = Math.round(t[0]), cj = Math.round(t[1]);
      let done = false;
      for (let r = 0; !done && r < 200; r++) {
        let best = null, bd = Infinity;
        for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const i = ci + di, j = cj + dj;
          if (free.has(key(i, j))) continue;
          const d = (i - t[0]) ** 2 + (j - t[1]) ** 2;
          if (d < bd) { bd = d; best = [i, j]; }
        }
        if (best) { free.set(key(best[0], best[1]), true); out[k] = best; done = true; }
      }
    }
    return out;
  }

  /* ---------- layouts: positions in tile units, plus guides drawn beneath ---------- */
  function layoutColour(items) {
    // A packed disc: greys fill the core (light to dark around it), colours fill the ring by
    // hue rank, so the wheel stays round however lopsided the archive's palette is.
    const n = items.length;
    let R = Math.sqrt(n / Math.PI), cells = [];
    for (;;) {
      cells = [];
      const r = Math.ceil(R);
      for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (i * i + j * j <= R * R) cells.push([i, j]);
      if (cells.length >= n) break;
      R += 0.25;
    }
    const dist = (c) => Math.hypot(c[0], c[1]);
    const ang = (c) => (Math.atan2(c[1], c[0]) + Math.PI / 2 + TAU) % TAU; // clockwise from the top
    cells.sort((a, b) => dist(a) - dist(b));
    cells = cells.slice(0, n);
    const grey = [], vivid = [];
    items.forEach((it, k) => (it.v.chroma < 0.07 ? grey : vivid).push(k));
    const pos = new Array(n);
    const core = cells.slice(0, grey.length).sort((a, b) => ang(a) - ang(b));
    grey.sort((a, b) => items[b].v.l - items[a].v.l).forEach((k, j) => { pos[k] = core[j]; });
    const ring = cells.slice(grey.length).sort((a, b) => ang(a) - ang(b));
    // start the wheel at red, a little before 0° so the reds aren't split across the top
    vivid.sort((a, b) => ((items[a].v.h + 20) % 360) - ((items[b].v.h + 20) % 360));
    const G = Math.max(8, Math.round(ring.length / 48)); // angular slices: muted inside, vivid at the rim
    for (let s0 = 0; s0 < ring.length; s0 += G) {
      const cs = ring.slice(s0, s0 + G).sort((a, b) => dist(a) - dist(b));
      const ks = vivid.slice(s0, s0 + G).sort((a, b) => items[a].v.chroma - items[b].v.chroma);
      ks.forEach((k, j) => { pos[k] = cs[j]; });
    }
    const coreR = grey.length ? dist(cells[grey.length - 1]) + 0.5 : 0;
    return { pos, guides: [{ type: "ring", r: R + 1.4 }].concat(coreR > 2 ? [{ type: "ring", r: coreR, faint: true }] : []) };
  }
  function layoutYear(items, model) {
    const outings = model.outings.filter((o) => o.photos.length);
    const byFid = new Map();
    items.forEach((it, k) => { (byFid.get(it.x.fid) || byFid.set(it.x.fid, []).get(it.x.fid)).push(k); });
    const W = 4, pos = new Array(items.length), labels = [];
    let x = 0, lastMonth = "";
    const marks = [];
    for (const o of outings) {
      const ks = (byFid.get(o.id) || []).sort((a, b) => items[a].x.t.localeCompare(items[b].x.t));
      if (!ks.length) continue;
      const mk = o.date.slice(0, 7);
      if (mk !== lastMonth) { if (lastMonth) x += 2; marks.push({ x: x - 1, label: GP.model.MON[+mk.slice(5) - 1] + (mk.endsWith("-01") || !lastMonth ? " " + mk.slice(0, 4) : "") }); lastMonth = mk; }
      ks.forEach((k, j) => { pos[k] = [x + (j % W), -Math.floor(j / W)]; });
      labels.push({ x: x + W / 2 - 0.5, y: 1.4, text: String(+o.date.slice(8)), small: true, id: o.id });
      x += W + 1;
    }
    const cx = x / 2;
    pos.forEach((p) => { if (p) p[0] -= cx; });
    return { pos, guides: [{ type: "baseline", x0: -cx - 1, x1: x - cx, y: 0.75 }].concat(marks.map((m) => ({ type: "mark", x: m.x - cx, label: m.label }))), labels: labels.map((l) => ({ ...l, x: l.x - cx })) };
  }
  function layoutClock(items, model) {
    const BINS = 72, r0 = 14; // 20-minute bins around the dial
    const bins = Array.from({ length: BINS }, () => []);
    items.forEach((it, k) => { const m = it.x.mins; if (m != null) bins[Math.min(BINS - 1, Math.floor((m / 1440) * BINS))].push(k); });
    const pos = new Array(items.length);
    bins.forEach((ks, b) => {
      ks.sort((a, c) => items[a].x.mins - items[c].x.mins);
      const a0 = (b / BINS) * TAU, a1 = ((b + 1) / BINS) * TAU;
      let r = r0, j = 0;
      while (j < ks.length) {
        const across = Math.max(1, Math.floor(((a1 - a0) * r) / 1.02));
        for (let q = 0; q < across && j < ks.length; q++, j++) {
          const a = a0 + ((q + 0.5) / across) * (a1 - a0) - Math.PI / 2;
          pos[ks[j]] = [Math.cos(a) * r, Math.sin(a) * r];
        }
        r += 1.02;
      }
    });
    // anything without a time sits quietly in the middle
    let c = 0;
    items.forEach((it, k) => { if (!pos[k]) { const a = c * 2.399963, rr = Math.sqrt(c++) * 0.9; pos[k] = [Math.cos(a) * rr, Math.sin(a) * rr]; } });
    const s1 = GP.model.sunTimes(2026, 3, 20), s2 = GP.model.sunTimes(2026, 9, 22);
    const sun = { rise: (s1.rise + s2.rise) / 2, set: (s1.set + s2.set) / 2 };
    return { pos, guides: [{ type: "dial", r0: r0 - 1.6, rise: sun.rise, set: sun.set }] };
  }
  function layoutFamily(items, model) {
    const groups = new Map();
    items.forEach((it, k) => {
      const f = it.x.family && it.x.famName ? it.x.famName : it.x.group === "scene" ? "Scenes" : "Unidentified";
      (groups.get(f) || groups.set(f, []).get(f)).push(k);
    });
    const clusters = [...groups].map(([name, ks]) => {
      ks.sort((a, b) => (items[a].x.common || "").localeCompare(items[b].x.common || "") || items[a].x.t.localeCompare(items[b].x.t));
      return { name, ks, r: Math.sqrt(ks.length) * 0.62 + 1.2 };
    }).sort((a, b) => b.ks.length - a.ks.length);
    const placed = [];
    for (const c of clusters) {
      let t = 0, x = 0, y = 0;
      for (;;) {
        x = Math.cos(t) * t * 0.9; y = Math.sin(t) * t * 0.62;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) > p.r + c.r + 1.2)) break;
        t += 0.04;
      }
      c.x = x; c.y = y; placed.push(c);
    }
    const pos = new Array(items.length), labels = [];
    for (const c of clusters) {
      // sunflower spiral inside the cluster, then snapped so nothing overlaps
      const targets = c.ks.map((_, j) => { const a = j * 2.399963, rr = Math.sqrt(j + 0.5) * 0.56; return [c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr]; });
      const order = targets.map((_, j) => j);
      const snapped = snap(targets, order);
      c.ks.forEach((k, j) => { pos[k] = snapped[j]; });
      labels.push({ x: c.x, y: c.y - c.r - 0.9, text: c.name, n: c.ks.length, r: c.r });
    }
    return { pos, guides: [], labels };
  }
  const LAYOUTS = { colour: layoutColour, year: layoutYear, clock: layoutClock, family: layoutFamily };

  /* ---------- the view ---------- */
  function render({ q, model, h }) {
    const mode = MODES.some((m) => m[0] === q.get("mode")) ? q.get("mode") : "colour";
    const n = model.photos.length;
    const html = `<section class="uv" aria-label="The archive as a universe">
  <canvas class="uv-c" tabindex="0" role="img" aria-label="${h.fmtN(n)} photographs arranged as a picture. Use the arrangement buttons to change it, scroll or pinch to zoom, and select a photograph to open it."></canvas>
  <div class="uv-ui">
    <header class="uv-head"><div class="kicker">The archive as a universe</div><h1 class="display">${h.fmtN(n)} photographs</h1><p class="uv-sub">${MODES.find((m) => m[0] === mode)[2]}</p></header>
    <div class="uv-modes" role="group" aria-label="Arrangement">${MODES.map(([id, label], i) => `<button class="chip" data-mode="${id}" aria-pressed="${id === mode}" title="${label} (${i + 1})">${label}</button>`).join("")}</div>
    <div class="uv-zoom" role="group" aria-label="Zoom"><button class="icon-btn" data-z="in" aria-label="Zoom in">+</button><button class="icon-btn" data-z="out" aria-label="Zoom out">−</button><button class="icon-btn" data-z="fit" aria-label="Fit everything">${h.ICON.expand}</button></div>
    <div class="uv-hint sc">Scroll or pinch to zoom · drag to move · select a photograph to open it</div>
    <div class="uv-find"><label class="uv-search">${h.ICON.search}<span class="visually-hidden">Find in the universe</span><input type="search" autocomplete="off" spellcheck="false" placeholder="Find: herons, golden hour, red…" value="${h.esc(q.get("find") || "")}"></label>
      <div class="uv-groups" role="group" aria-label="Show only">${[["", "All"], ["bird", "Birds"], ["mammal", "Mammals"], ["reptile", "Reptiles"], ["small", "Small lives"], ["scene", "Scenes"]].map(([g, l]) => `<button class="chip" data-g="${g}" aria-pressed="${(q.get("g") || "") === g}">${l}</button>`).join("")}</div>
      <span class="uv-found sc" aria-live="polite"></span></div>
    <div class="uv-tip" hidden></div>
  </div>
</section>`;
    return { html, title: "Universe", full: true, after: (main, signal) => mount(main, model, h, mode, signal, q) };
  }

  function mount(main, model, h, mode, signal, q0) {
    const sec = main.querySelector(".uv"), cv = sec.querySelector(".uv-c"), ctx = cv.getContext("2d");
    const tip = sec.querySelector(".uv-tip"), sub = sec.querySelector(".uv-sub");
    const items = model.photos.map((x, i) => ({ x, i, v: vivid(x), lq: null, th: null, thW: 0, req: false, px: 0, py: 0, fx: 0, fy: 0, tx: 0, ty: 0, delay: 0 }));
    const S = { mode, scale: 10, cx: 0, cy: 0, W: 0, H: 0, dpr: 1, anim: null, cam: null, hover: -1, layout: null, dirty: true, raf: 0, colors: {}, alive: true, queue: [], loading: 0, ptrs: new Map(), drag: null, vx: 0, vy: 0, dived: 0, match: null };
    cv.__uv = S; // for tests
    const order = () => items.map((_, k) => k).sort((a, b) => (items[a].ty - items[b].ty) || (items[a].tx - items[b].tx));

    // placeholders: the 20 px images already in the data, decoded a few at a time
    let li = 0;
    const loadLq = () => {
      if (!S.alive) return;
      const until = performance.now() + 8;
      while (li < items.length && performance.now() < until) {
        const it = items[li++];
        if (it.x.lq) { const im = new Image(); im.onload = () => { it.lq = im; S.dirty = true; }; im.src = it.x.lq; }
      }
      if (li < items.length) { if (window.requestIdleCallback) requestIdleCallback(loadLq, { timeout: 120 }); else setTimeout(loadLq, 16); }
    };
    loadLq();

    function themeColors() {
      const cs = getComputedStyle(document.documentElement);
      S.colors = { ink: cs.getPropertyValue("--ink").trim(), ink2: cs.getPropertyValue("--ink-2").trim(), muted: cs.getPropertyValue("--muted").trim(), hair: cs.getPropertyValue("--hair").trim(), accent: cs.getPropertyValue("--accent").trim(), bg: cs.getPropertyValue("--bg").trim(), mono: cs.getPropertyValue("--f-data").trim(), display: cs.getPropertyValue("--f-display").trim() };
      S.dirty = true;
    }
    themeColors();
    const mo = new MutationObserver(themeColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", themeColors, { signal });

    function resize() {
      const r = cv.getBoundingClientRect();
      S.dpr = Math.min(2, devicePixelRatio || 1);
      S.W = r.width; S.H = r.height;
      cv.width = Math.round(r.width * S.dpr); cv.height = Math.round(r.height * S.dpr);
      S.dirty = true;
    }
    function bounds() {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const it of items) { x0 = Math.min(x0, it.tx); x1 = Math.max(x1, it.tx); y0 = Math.min(y0, it.ty); y1 = Math.max(y1, it.ty); }
      for (const l of (S.layout && S.layout.labels) || []) { y0 = Math.min(y0, l.y - 1); y1 = Math.max(y1, l.y + 1); }
      return { x0: x0 - 1, y0: y0 - 1, x1: x1 + 1, y1: y1 + 1 };
    }
    function fitCam() {
      const b = bounds(), head = Math.min(200, S.H * 0.24), padX = S.W < 700 ? 14 : 60;
      const foot = 92, scale = Math.min((S.W - padX * 2) / (b.x1 - b.x0), (S.H - head - foot) / (b.y1 - b.y0));
      S.fit = scale;
      return { scale, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 - (head - foot) / 2 / scale };
    }
    function setLayout(m, first) {
      S.mode = m;
      S.layout = LAYOUTS[m](items, model);
      const R = Math.sqrt(items.length) * 2.2;
      items.forEach((it, k) => {
        const p = S.layout.pos[k] || [0, 0];
        if (first) { // a loose galaxy that settles into place
          const a = Math.random() * TAU, rr = R * (0.6 + Math.random() * 0.8);
          it.px = Math.cos(a) * rr; it.py = Math.sin(a) * rr * 0.55;
        }
        it.fx = it.px; it.fy = it.py; it.tx = p[0]; it.ty = p[1];
      });
      const ord = order(), n = ord.length;
      ord.forEach((k, j) => { items[k].delay = (j / n) * 0.45 + Math.random() * 0.08; });
      const target = fitCam();
      if (reduced()) { items.forEach((it) => { it.px = it.tx; it.py = it.ty; }); Object.assign(S, target); S.anim = null; S.dirty = true; return; }
      S.anim = { t0: performance.now(), dur: first ? 2200 : 1500 };
      S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: target, t0: performance.now(), dur: first ? 2200 : 1300 };
      if (first) { S.cam.from = { scale: target.scale * 0.55, cx: target.cx, cy: target.cy }; }
      S.dirty = true;
    }
    function toScreen(x, y) { return [(x - S.cx) * S.scale + S.W / 2, (y - S.cy) * S.scale + S.H / 2]; }
    function toWorld(sx, sy) { return [(sx - S.W / 2) / S.scale + S.cx, (sy - S.H / 2) / S.scale + S.cy]; }

    function step(now) {
      S.raf = 0;
      if (!S.alive) return;
      let moving = false;
      if (S.anim) {
        const T = (now - S.anim.t0) / S.anim.dur;
        for (const it of items) {
          const t = Math.max(0, Math.min(1, (T - it.delay) / (1 - 0.53)));
          const e = easeInOut(t);
          // a gentle arc rather than a straight line between arrangements
          const dx = it.tx - it.fx, dy = it.ty - it.fy, bend = Math.sin(Math.PI * e) * 0.12;
          it.px = it.fx + dx * e - dy * bend; it.py = it.fy + dy * e + dx * bend;
        }
        if (T >= 1) { items.forEach((it) => { it.px = it.tx; it.py = it.ty; }); S.anim = null; S.dirty = true; } else moving = true;
      }
      if (S.cam) {
        const t = Math.max(0, Math.min(1, (now - S.cam.t0) / S.cam.dur)), e = easeOut(t), f = S.cam.from, to = S.cam.to;
        S.scale = Math.exp(Math.log(f.scale) + (Math.log(to.scale) - Math.log(f.scale)) * e);
        S.cx = f.cx + (to.cx - f.cx) * e; S.cy = f.cy + (to.cy - f.cy) * e;
        if (t >= 1) { S.cam = null; S.dirty = true; } else moving = true;
      }
      if (!S.drag && (Math.abs(S.vx) + Math.abs(S.vy) > 0.02)) {
        S.cx -= S.vx / S.scale; S.cy -= S.vy / S.scale; S.vx *= 0.9; S.vy *= 0.9; moving = true;
      }
      if (moving || S.dirty) {
        draw();
        const z = S.scale > S.fit * 1.6;
        if (z !== S.zoomed) { S.zoomed = z; sec.classList.toggle("zoomed", z); }
      }
      S.dirty = false;
      if (moving) kick();
    }
    const kick = () => { if (!S.raf && S.alive) S.raf = requestAnimationFrame(step); };

    function draw() {
      const c = ctx, dpr = S.dpr, sz = S.scale * (1 - GAP);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, S.W, S.H);
      drawGuides(c);
      const need = [];
      const big = sz >= 44, hov = S.hover;
      const want = thumbW(sz);
      c.imageSmoothingQuality = "medium";
      for (let k = 0; k < items.length; k++) {
        if (k === hov) continue;
        const it = items[k];
        const [sx, sy] = toScreen(it.px, it.py);
        if (sx < -sz || sy < -sz || sx > S.W + sz || sy > S.H + sz) continue;
        const img = it.th || it.lq;
        const dim = S.match && !S.match.has(k);
        if (dim) c.globalAlpha = 0.09;
        if (sz < 2.2 || !img) { c.fillStyle = it.v.hex; c.fillRect(sx - sz / 2, sy - sz / 2, Math.max(1, sz), Math.max(1, sz)); }
        else drawCover(c, img, it, sx - sz / 2, sy - sz / 2, sz);
        if (dim) { c.globalAlpha = 1; continue; }
        if (big && !it.req && it.thW < want) need.push(it);
      }
      if (hov >= 0) {
        const it = items[hov], [sx, sy] = toScreen(it.px, it.py), z = Math.max(sz * 1.9, 56);
        c.save();
        c.shadowColor = "rgba(0,0,0,0.45)"; c.shadowBlur = 18; c.shadowOffsetY = 6;
        c.fillStyle = it.v.hex; c.fillRect(sx - z / 2, sy - z / 2, z, z);
        c.restore();
        const img = it.th || it.lq;
        if (img) drawCover(c, img, it, sx - z / 2, sy - z / 2, z);
        c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 1.5; c.strokeRect(sx - z / 2 + 0.75, sy - z / 2 + 0.75, z - 1.5, z - 1.5);
        if (!it.req && it.thW < thumbW(z)) need.push(it);
      }
      drawLabels(c);
      if (need.length) {
        // nearest the middle of the screen first
        const mx = S.W / 2, my = S.H / 2;
        need.sort((a, b) => { const [ax, ay] = toScreen(a.px, a.py), [bx, by] = toScreen(b.px, b.py); return Math.hypot(ax - mx, ay - my) - Math.hypot(bx - mx, by - my); });
        requestThumbs(need);
      }
    }
    function drawCover(c, img, it, x, y, s) {
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      if (!iw || !ih) return;
      // crop to a square around the subject
      const fx = (it.x.fp && it.x.fp[0]) || 0.5, fy = (it.x.fp && it.x.fp[1]) || 0.5;
      const side = Math.min(iw, ih), sx = Math.max(0, Math.min(iw - side, fx * iw - side / 2)), sy = Math.max(0, Math.min(ih - side, fy * ih - side / 2));
      c.drawImage(img, sx, sy, side, side, x, y, s, s);
    }
    function drawGuides(c) {
      const L = S.layout;
      if (!L) return;
      c.save();
      c.strokeStyle = S.colors.hair; c.lineWidth = 1;
      c.fillStyle = S.colors.muted;
      c.font = `500 11px ${S.colors.mono}`;
      for (const g of L.guides || []) {
        if (g.type === "ring") {
          const [x, y] = toScreen(0, 0);
          c.save(); if (g.faint) { c.setLineDash([2, 4]); c.globalAlpha = 0.7; }
          c.beginPath(); c.arc(x, y, g.r * S.scale, 0, TAU); c.stroke(); c.restore();
        } else if (g.type === "baseline") {
          const [a, y] = toScreen(g.x0, g.y), [b] = toScreen(g.x1, g.y);
          c.beginPath(); c.moveTo(a, y); c.lineTo(b, y); c.stroke();
        } else if (g.type === "mark") {
          const [x, y] = toScreen(g.x, 0.75);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 26); c.stroke();
          c.textAlign = "left"; c.fillText(g.label.toUpperCase(), x + 5, y + 24);
        } else if (g.type === "dial") {
          const [x, y] = toScreen(0, 0), r = g.r0 * S.scale;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
          const ang = (m) => (m / 1440) * TAU - Math.PI / 2;
          c.save(); c.strokeStyle = S.colors.accent; c.globalAlpha = 0.8; c.lineWidth = Math.max(2, S.scale * 0.35); c.lineCap = "round";
          c.beginPath(); c.arc(x, y, r - Math.max(4, S.scale * 0.7), ang(g.rise), ang(g.set)); c.stroke(); c.restore();
          c.textAlign = "center"; c.textBaseline = "middle";
          for (let hh = 0; hh < 24; hh += 3) {
            const a = ang(hh * 60), rr = r - Math.max(16, S.scale * 2.2);
            if (rr < 20) break;
            c.fillText(String(hh).padStart(2, "0"), x + Math.cos(a) * rr, y + Math.sin(a) * rr);
          }
          const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
          if (r > 90) {
            c.fillStyle = S.colors.ink2; c.font = `500 12px ${S.colors.mono}`;
            c.fillText("DAYLIGHT", x, y - 9);
            c.fillStyle = S.colors.muted; c.fillText(`${hm(g.rise)} – ${hm(g.set)}`, x, y + 9);
          }
        }
      }
      c.restore();
    }
    function drawLabels(c) {
      const L = S.layout;
      if (!L || !L.labels || S.anim) return;
      c.save();
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      const taken = []; // boxes of labels already drawn: larger clusters claim their space first
      const free = (x0, y0, x1, y1) => taken.every((b) => x1 < b[0] || x0 > b[2] || y1 < b[1] || y0 > b[3]);
      const ordered = L.labels.slice().sort((a, b) => (b.n || 0) - (a.n || 0));
      for (const l of ordered) {
        const [x, y] = toScreen(l.x, l.y);
        if (x < -100 || x > S.W + 100 || y < -20 || y > S.H + 40) continue;
        if (l.small) {
          if (S.scale < 7) continue;
          c.fillStyle = S.colors.muted; c.font = `500 ${Math.min(12, S.scale * 0.9)}px ${S.colors.mono}`;
          c.fillText(l.text, x, y + 4);
        } else {
          if (l.r * S.scale < 26) continue;
          const fs = Math.max(12, Math.min(20, S.scale * 1.3));
          c.font = `500 ${fs}px ${S.colors.display}`;
          const w = c.measureText(l.text).width / 2 + 4;
          if (!free(x - w, y - fs, x + w, y + 4)) continue;
          taken.push([x - w, y - fs, x + w, y + 4]);
          c.lineWidth = 4; c.strokeStyle = S.colors.bg; c.strokeText(l.text, x, y);
          c.fillStyle = S.colors.ink; c.fillText(l.text, x, y);
        }
      }
      c.restore();
    }
    function thumbW(sz) { const px = sz * S.dpr; return px <= 300 ? 360 : px <= 640 ? 720 : 1280; }
    function onScreen(it, pad) {
      const [sx, sy] = toScreen(it.px, it.py);
      return sx > -pad && sy > -pad && sx < S.W + pad && sy < S.H + pad;
    }
    function requestThumbs(list) {
      S.queue = list.concat(S.queue.filter((it) => !list.includes(it)));
      for (const it of list) it.req = true;
      pump();
    }
    function pump() {
      while (S.loading < 8 && S.queue.length) {
        const it = S.queue.shift();
        const sz = S.scale * (1 - GAP);
        if (!onScreen(it, sz * 2)) { it.req = false; continue; } // panned away: ask again when it's back
        const w = thumbW(sz), url = h.src(it.x, w);
        if (!url) continue;
        S.loading++;
        const im = new Image();
        im.decoding = "async";
        im.onload = () => { S.loading--; it.req = false; if (w > it.thW) { it.th = im; it.thW = w; } S.dirty = true; kick(); pump(); };
        im.onerror = () => { S.loading--; pump(); };
        im.src = url;
      }
    }

    /* ---------- interaction ---------- */
    function hit(sx, sy) {
      const [wx, wy] = toWorld(sx, sy), half = 0.5;
      let best = -1, bd = Infinity;
      for (let k = 0; k < items.length; k++) {
        if (S.match && !S.match.has(k)) continue;
        const it = items[k], dx = Math.abs(it.px - wx), dy = Math.abs(it.py - wy);
        if (dx <= half && dy <= half) { const d = dx + dy; if (d < bd) { bd = d; best = k; } }
      }
      return best;
    }
    function showTip(k, sx, sy) {
      if (k < 0) { tip.hidden = true; return; }
      const x = items[k].x;
      tip.innerHTML = `<b>${h.esc(h.titleOf(x))}</b><span>${h.esc([h.fmtShort(x.t), h.fmtTime(x)].filter(Boolean).join(" · "))}</span>`;
      tip.hidden = false;
      const r = sec.getBoundingClientRect();
      tip.style.left = Math.min(r.width - 12, Math.max(12, sx)) + "px";
      tip.style.top = sy - Math.max(34, S.scale * 1.05) + "px";
    }
    function zoomAt(f, sx, sy, animate) {
      const fit = fitCam(), deep = Math.min(S.W, S.H);
      const ns = Math.max(fit.scale * 0.6, Math.min(deep * 0.62, S.scale * f));
      // Zooming far into one photograph opens it.
      if (f > 1 && !animate && ns * (1 - GAP) >= deep * 0.5 && performance.now() - S.dived > 1600 && !(GP.viewer && GP.viewer.isOpen())) {
        const k = hit(sx, sy);
        if (k >= 0) {
          S.dived = performance.now();
          openTile(k);
          const it = items[k], back = ns * 0.5;
          S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: { scale: back, cx: it.px, cy: it.py }, t0: performance.now() + 500, dur: 600 };
          kick();
          return;
        }
      }
      const [wx, wy] = toWorld(sx, sy);
      const cx = wx - (sx - S.W / 2) / ns, cy = wy - (sy - S.H / 2) / ns;
      if (animate && !reduced()) S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: { scale: ns, cx, cy }, t0: performance.now(), dur: 450 };
      else { S.scale = ns; S.cx = cx; S.cy = cy; S.cam = null; }
      S.dirty = true; kick();
    }
    function openTile(k) {
      const it = items[k], [sx, sy] = toScreen(it.px, it.py), sz = Math.max(S.scale * (1 - GAP), 24);
      const r = cv.getBoundingClientRect();
      const fly = document.createElement("img");
      fly.src = (it.th && it.th.src) || it.x.lq || "";
      Object.assign(fly.style, { position: "fixed", left: r.left + sx - sz / 2 + "px", top: r.top + sy - sz / 2 + "px", width: sz + "px", height: sz + "px", objectFit: "cover", opacity: "0", pointerEvents: "none" });
      document.body.appendChild(fly);
      const list = order().filter((j) => !S.match || S.match.has(j)).map((j) => items[j].x);
      GP.viewer.open(list, list.indexOf(it.x), fly);
      setTimeout(() => fly.remove(), 800);
    }
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      S.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      S.vx = S.vy = 0; S.cam = null;
      if (S.ptrs.size === 1) S.drag = { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY, moved: false, t: performance.now() };
      else if (S.ptrs.size === 2) { const [a, b] = [...S.ptrs.values()]; S.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) }; }
    }, { signal });
    cv.addEventListener("pointermove", (e) => {
      if (S.ptrs.has(e.pointerId)) {
        S.ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (S.ptrs.size >= 2 && S.pinch) {
          const [a, b] = [...S.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
          zoomAt(d / S.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2, false); S.pinch.d = d; if (S.drag) S.drag.moved = true;
          return;
        }
        if (S.drag) {
          const dx = e.offsetX - S.drag.x, dy = e.offsetY - S.drag.y;
          if (Math.hypot(e.offsetX - S.drag.x0, e.offsetY - S.drag.y0) > 5) S.drag.moved = true;
          if (S.drag.moved) { S.cx -= dx / S.scale; S.cy -= dy / S.scale; S.vx = dx; S.vy = dy; S.hover = -1; tip.hidden = true; S.dirty = true; kick(); cv.classList.add("grabbing"); }
          S.drag.x = e.offsetX; S.drag.y = e.offsetY;
          return;
        }
      }
      if (e.pointerType === "mouse" && !S.anim) {
        const k = hit(e.offsetX, e.offsetY);
        if (k !== S.hover) { S.hover = k; S.dirty = true; kick(); }
        cv.style.cursor = k >= 0 ? "zoom-in" : "grab";
        showTip(k, e.offsetX, e.offsetY);
      }
    }, { signal });
    const up = (e) => {
      if (!S.ptrs.has(e.pointerId)) return;
      S.ptrs.delete(e.pointerId);
      cv.classList.remove("grabbing");
      if (S.ptrs.size < 2) S.pinch = null;
      if (S.ptrs.size) return;
      const d = S.drag; S.drag = null;
      if (d && !d.moved && !S.anim) {
        const k = hit(e.offsetX, e.offsetY);
        if (k >= 0) {
          if (S.scale * (1 - GAP) < 26) { // too small to see: fly in first
            const it = items[k], ns = Math.max(S.scale * 3, 70);
            if (reduced()) { S.scale = ns; S.cx = it.px; S.cy = it.py; S.dirty = true; kick(); }
            else { S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: { scale: ns, cx: it.px, cy: it.py }, t0: performance.now(), dur: 700 }; kick(); }
          } else openTile(k);
        }
      } else kick();
    };
    cv.addEventListener("pointerup", up, { signal });
    cv.addEventListener("pointercancel", up, { signal });
    cv.addEventListener("pointerleave", () => { if (S.hover >= 0) { S.hover = -1; S.dirty = true; kick(); } tip.hidden = true; }, { signal });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016));
      zoomAt(f, e.offsetX, e.offsetY, false);
    }, { passive: false, signal });
    cv.addEventListener("dblclick", (e) => zoomAt(2.4, e.offsetX, e.offsetY, true), { signal });
    sec.addEventListener("click", (e) => {
      const m = e.target.closest("[data-mode]");
      if (m) { switchMode(m.dataset.mode); return; }
      const z = e.target.closest("[data-z]");
      if (z) {
        if (z.dataset.z === "fit") { const t = fitCam(); S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: t, t0: performance.now(), dur: reduced() ? 1 : 600 }; kick(); }
        else zoomAt(z.dataset.z === "in" ? 1.8 : 1 / 1.8, S.W / 2, S.H / 2, true);
      }
    }, { signal });
    cv.addEventListener("keydown", (e) => {
      const k = e.key, p = 60;
      if (k === "+" || k === "=") zoomAt(1.5, S.W / 2, S.H / 2, true);
      else if (k === "-") zoomAt(1 / 1.5, S.W / 2, S.H / 2, true);
      else if (k === "0") { const t = fitCam(); Object.assign(S, t); S.dirty = true; kick(); }
      else if (k === "ArrowLeft") { S.cx -= p / S.scale; S.dirty = true; kick(); }
      else if (k === "ArrowRight") { S.cx += p / S.scale; S.dirty = true; kick(); }
      else if (k === "ArrowUp") { S.cy -= p / S.scale; S.dirty = true; kick(); }
      else if (k === "ArrowDown") { S.cy += p / S.scale; S.dirty = true; kick(); }
      else if (/^[1-4]$/.test(k)) switchMode(MODES[+k - 1][0]);
      else return;
      e.preventDefault(); e.stopPropagation();
    }, { signal });
    /* ---------- finding: dim everything but the matches, then fly to them ---------- */
    const findIn = sec.querySelector(".uv-find input"), found = sec.querySelector(".uv-found");
    let group = q0.get("g") || "", ft = 0;
    function applyFind(fly) {
      const text = findIn.value.trim(), sq = text ? model.search(text) : null;
      const okG = (x) => !group || (group === "small" ? ["insect", "other"].includes(x.group) : x.group === group);
      if (!text && !group) { S.match = null; found.textContent = ""; }
      else {
        S.match = new Set();
        items.forEach((it, k) => { if (okG(it.x) && (!sq || sq.empty || sq.test(it.x))) S.match.add(k); });
        found.textContent = S.match.size ? `${h.fmtN(S.match.size)} lit` : "Nothing matches";
      }
      GP.app.setQuery((qq) => { if (text) qq.set("find", text); else qq.delete("find"); if (group) qq.set("g", group); else qq.delete("g"); });
      S.hover = -1; S.dirty = true; kick();
      if (fly && S.match && S.match.size && S.match.size < items.length * 0.6) flyTo([...S.match]);
      else if (fly && !S.match) { const t = fitCam(); S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to: t, t0: performance.now(), dur: reduced() ? 1 : 700 }; kick(); }
    }
    function flyTo(ks) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const k of ks) { const it = items[k]; x0 = Math.min(x0, it.tx); x1 = Math.max(x1, it.tx); y0 = Math.min(y0, it.ty); y1 = Math.max(y1, it.ty); }
      const pad = 3, head = Math.min(200, S.H * 0.24);
      const scale = Math.min(Math.min(S.W, S.H) * 0.45, Math.min((S.W - 120) / (x1 - x0 + pad * 2), (S.H - head - 110) / (y1 - y0 + pad * 2)));
      const to = { scale, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (head - 92) / 2 / scale };
      S.cam = { from: { scale: S.scale, cx: S.cx, cy: S.cy }, to, t0: performance.now(), dur: reduced() ? 1 : 900 };
      kick();
    }
    findIn.addEventListener("input", () => { clearTimeout(ft); ft = setTimeout(() => applyFind(true), 260); }, { signal });
    findIn.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") { findIn.value = ""; applyFind(true); } }, { signal });
    sec.querySelector(".uv-groups").addEventListener("click", (e) => {
      const b = e.target.closest("[data-g]");
      if (!b) return;
      group = b.dataset.g;
      sec.querySelectorAll(".uv-groups [data-g]").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
      applyFind(true);
    }, { signal });
    function switchMode(m) {
      if (m === S.mode && !S.anim) return;
      sec.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
      sub.textContent = MODES.find((x) => x[0] === m)[2];
      sub.classList.remove("swap"); void sub.offsetWidth; sub.classList.add("swap");
      GP.app.setQuery((qq) => (m === "colour" ? qq.delete("mode") : qq.set("mode", m)));
      S.hover = -1; tip.hidden = true;
      setLayout(m, false);
      if (S.match && S.match.size && S.match.size < items.length * 0.6) setTimeout(() => { if (S.alive) flyTo([...S.match]); }, reduced() ? 0 : 1500);
      kick();
    }

    const ro = new ResizeObserver(() => { const had = S.W; resize(); if (had && !S.anim) Object.assign(S, fitCam()); kick(); });
    ro.observe(cv);
    resize();
    setLayout(mode, true);
    if (findIn.value.trim() || group) setTimeout(() => { if (S.alive) applyFind(true); }, reduced() ? 0 : 2300);
    kick();
    signal.addEventListener("abort", () => { S.alive = false; ro.disconnect(); mo.disconnect(); cancelAnimationFrame(S.raf); });
  }

  (GP.views = GP.views || []).push({ id: "universe", label: "Universe", navAfter: "species", render });
})(window.GP = window.GP || {});
