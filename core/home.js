/* Georgiadis Photography: the home page. A cinematic opening, then the archive's best work, the
   ways into it (Universe, cabinet, tree of life, the daily challenge, the calls), its exhibitions
   and latest outings. Returning visitors also see what's new since they last came, their
   favourites and where they left off. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SLIDE_MS = 7000;

  // Strong, varied photographs: one per species, the best frame of each.
  function bestOf(m, n, test) {
    const seen = new Set(), out = [];
    const pool = m.heroes.filter((x) => !x.unsure && x.group !== "scene" && x.rating >= 3 && (!test || test(x))).sort((a, b) => b.score - a.score);
    for (const x of pool) {
      const k = x.spKey || x.id;
      if (seen.has(k)) continue;
      seen.add(k); out.push(x);
      if (out.length >= n) break;
    }
    return out;
  }
  function heroSlides(m) {
    if (m.opening && m.opening.length) return m.opening.slice(0, 8);
    const wide = bestOf(m, 7, (x) => x.ar >= 1.3);
    return wide.length >= 3 ? wide : m.heroes.slice(0, 5);
  }
  // Seven for the highlights grid: wide frames where the grid is wide.
  function highlights(m, exclude) {
    const skip = new Set(exclude.map((x) => x.spKey || x.id));
    const pool = bestOf(m, 40).filter((x) => !skip.has(x.spKey || x.id));
    const wide = pool.filter((x) => x.ar >= 1.3), tall = pool.filter((x) => x.ar < 1.3);
    const take = (arr) => arr.shift() || pool.find((x) => !used.has(x));
    const used = new Set(), out = [];
    for (const want of ["w", "w", "w", "a", "a", "a", "w", "w"]) {
      let x = want === "w" ? take(wide) : take(tall.length ? tall : wide);
      while (x && used.has(x)) x = want === "w" ? take(wide) : take(tall.length ? tall : wide);
      if (!x) break;
      used.add(x); out.push(x);
    }
    return out;
  }
  function spotlight(m) {
    const pool = m.life.filter((s) => s.note && s.best && s.photos.length >= 3);
    if (!pool.length) return null;
    return pool[Math.floor(Date.now() / 864e5) % pool.length];
  }
  function onThisDay(m) {
    const now = new Date(), y = now.getFullYear();
    const doy = (mm, dd) => Math.round((Date.UTC(2001, mm - 1, dd) - Date.UTC(2001, 0, 1)) / 864e5);
    const t = doy(now.getMonth() + 1, now.getDate());
    const near = m.heroes.filter((x) => x.year && x.year < y && Math.abs(doy(x.month, x.day) - t) <= 3 && x.group !== "scene").sort((a, b) => b.score - a.score);
    return near;
  }
  // The page shows each photograph once: a room or an outing whose usual cover (or a frame of
  // the same burst, or the same species) is already on the page above gets its next-best frame.
  const burstKey = (x) => (x.burst ? x.burst.id : x.id);
  function fresh(cover, list, shown) {
    const unseen = (x) => !shown.has(burstKey(x));
    const novel = (x) => unseen(x) && !(x.spKey && shown.has("sp:" + x.spKey));
    const good = (x) => !x.unsure && x.group !== "scene";
    const x = (cover && novel(cover) ? cover : list.find((y) => good(y) && novel(y)))
      || (cover && unseen(cover) ? cover : list.find((y) => good(y) && unseen(y))) || cover;
    if (x) { shown.add(burstKey(x)); if (x.spKey) shown.add("sp:" + x.spKey); }
    return x;
  }
  /* ---------- at this hour ---------- */
  // What was photographed around this time of day in Central Florida, on any day.
  function atThisHour(m) {
    const now = GP.sky ? GP.sky.now() : null;
    const mins = now ? now.mins : new Date().getHours() * 60 + new Date().getMinutes();
    const dist = (a) => { const d = Math.abs(a - mins); return Math.min(d, 1440 - d); };
    const timed = m.heroes.filter((x) => x.hasTime && x.mins != null && x.group !== "scene" && !x.unsure && x.spKey);
    let pool = [], win = 0;
    for (win of [30, 60, 120, 240]) { pool = timed.filter((x) => dist(x.mins) <= win); if (new Set(pool.map((x) => x.spKey)).size >= 4) break; }
    pool.sort((a, b) => (dist(a.mins) / 45 - a.score * 0.06) - (dist(b.mins) / 45 - b.score * 0.06));
    const seen = new Set(), pick = [];
    for (const x of pool) { if (seen.has(x.spKey)) continue; seen.add(x.spKey); pick.push(x); if (pick.length >= 5) break; }
    return { mins, now, pick, win };
  }
  function partOfDay(mins) { return mins < 300 ? "night" : mins < 720 ? "morning" : mins < 1020 ? "afternoon" : mins < 1230 ? "evening" : "night"; }
  function doing(x) {
    let b = String(x.behavior || "").trim().replace(/\.$/, "");
    if (!b) return "";
    b = b.charAt(0).toLowerCase() + b.slice(1);
    if (/^(in|on|at|among|beside|under|near|with)\b/.test(b)) return "was " + b;
    if (/^\w+ing\b/.test(b)) return "was " + b;
    return "was " + b;
  }
  function hourHtml(m, h) {
    const a = atThisHour(m);
    if (!a.pick.length) return "";
    const lead = a.pick[0], sp = m.speciesByKey.get(lead.spKey);
    const q = Math.round(a.mins / 15) * 15, part = partOfDay(a.mins);
    const article = (n) => (/^[aeiou]/i.test(n) ? "an " : "a ") + n;
    const verb = doing(lead);
    const when = part === "night" ? "a night" : (/^[aeiou]/.test(part) ? "an " : "a ") + part;
    const line = `Around ${GP.sky ? GP.sky.clock(q) : ""} on ${when} like this, ${article(sp ? sp.name : h.titleOf(lead))} ${verb || "was in front of the lens"}.`;
    return `<section class="hm-sec wrap hm-hour" data-hour="${q}">
  <div class="hm-sec-h"><div><div class="kicker">${a.now ? `It's ${h.esc(a.now.time)} in Central Florida` : "At this hour"}</div><h2>At this hour</h2></div><span class="sc">${a.win > 60 ? `Frames from within ${Math.round(a.win / 60)} hours of now` : `Frames from within ${a.win} minutes of now`}, on any day</span></div>
  <div class="hh-grid" data-ctx="${h.regCtx(a.pick)}">
    <button class="hh-lead" data-open="${h.esc(lead.id)}" aria-label="${h.esc(h.titleOf(lead))}">${h.cover(lead, 1400, "", h.titleOf(lead))}<span class="hh-time mono">${h.esc(h.fmtTime(lead))}</span></button>
    <div class="hh-t"><p class="hh-line display">${h.esc(line)}</p><p class="hh-sub sc">${h.esc(h.fmtDate(lead.t))} · ${h.esc(lead.outing)}${lead.light ? " · " + h.esc(lead.light) : ""}</p>
      <div class="hh-more">${a.pick.slice(1).map((x) => `<button class="hh-pic" data-open="${h.esc(x.id)}" aria-label="${h.esc(h.titleOf(x) + " at " + h.fmtTime(x))}">${h.cover(x, 420, "", h.titleOf(x))}<span><b>${h.esc(h.fmtTime(x))}</b> ${h.esc(h.titleOf(x))}</span></button>`).join("")}</div></div>
  </div>
</section>`;
  }

  /* ---------- who's around now ---------- */
  const doy = (mo, d) => Math.round((Date.UTC(2001, mo - 1, d) - Date.UTC(2001, 0, 1)) / 864e5);
  function around(m) {
    const L = GP.sky ? GP.sky.local() : { mo: new Date().getMonth() + 1, d: new Date().getDate() };
    const t = doy(L.mo, L.d);
    const near = (x) => { const d = Math.abs(doy(x.month, x.day) - t); return Math.min(d, 365 - d); };
    const list = m.life.map((s) => {
      const hits = s.photos.filter((x) => x.month && near(x) <= 21);
      return { s, n: new Set(hits.map((x) => x.fid)).size, hits: hits.length };
    }).filter((e) => e.n).sort((a, b) => b.n - a.n || b.hits - a.hits);
    return { L, t, list };
  }
  function vivid(pal) {
    let best = "#8a6a2a", bs = -1;
    for (const c of pal || []) { const [, sa, l] = GP.model.hexHsl(c); const sc = sa * (1 - Math.abs(2 * l - 1)); if (sc > bs) { bs = sc; best = c; } }
    return best;
  }
  function aroundHtml(m, h) {
    const a = around(m);
    if (!a.list.length) return "";
    const ringSp = a.list.slice(0, 7).map((e) => e.s);
    for (const s of m.life.slice().sort((p, q) => q.photos.length - p.photos.length)) { if (ringSp.length >= 14) break; if (!ringSp.includes(s)) ringSp.push(s); }
    const R0 = 64, R1 = 176, step = (R1 - R0) / ringSp.length;
    const arc = (r, a0, a1) => { const p = (a) => [Math.cos(a) * r, Math.sin(a) * r]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
    const mAng = (mo) => (mo / 12) * Math.PI * 2 - Math.PI / 2;
    const rings = ringSp.map((s, k) => {
      const r = R0 + step * (k + 0.5), max = Math.max(...s.months);
      const col = vivid(s.best && s.best.pal);
      const segs = s.months.map((n, mo) => (n ? `<path d="${arc(r, mAng(mo) + 0.03, mAng(mo + 1) - 0.03)}" style="stroke:${col};opacity:${(0.35 + 0.65 * (n / max)).toFixed(2)}"/>` : "")).join("");
      return `<g class="ya-ring${a.list.slice(0, 7).some((e) => e.s === s) ? " now" : ""}" data-tip="${h.esc(s.name)}" data-tip-v="${h.esc(s.months.map((n, i) => (n ? GP.model.MON[i] : "")).filter(Boolean).join(" "))}" style="--w:${Math.max(3, step - 2.4).toFixed(1)}px"><circle r="${r.toFixed(1)}" class="ya-track"/>${segs}</g>`;
    }).join("");
    const ta = (a.t / 365) * Math.PI * 2 - Math.PI / 2;
    const months = GP.model.MON.map((mo, i) => { const an = mAng(i + 0.5), r = R1 + 16; return `<text x="${(Math.cos(an) * r).toFixed(1)}" y="${(Math.sin(an) * r + 3.5).toFixed(1)}" text-anchor="middle">${mo}</text>`; }).join("");
    const ticks = Array.from({ length: 12 }, (_, i) => { const an = mAng(i); return `<line x1="${(Math.cos(an) * (R0 - 6)).toFixed(1)}" y1="${(Math.sin(an) * (R0 - 6)).toFixed(1)}" x2="${(Math.cos(an) * (R1 + 4)).toFixed(1)}" y2="${(Math.sin(an) * (R1 + 4)).toFixed(1)}"/>`; }).join("");
    const top = a.list.slice(0, 6);
    return `<section class="hm-sec wrap hm-around">
  <div class="hm-sec-h"><div><div class="kicker">The year, and where we are in it</div><h2>Who's around now</h2></div></div>
  <div class="ya">
    <figure class="ya-wheel"><svg viewBox="-215 -215 430 430" role="img" aria-label="The months each species has been photographed, with today marked">
      <g class="ya-ticks">${ticks}</g>${rings}<g class="ya-months">${months}</g>
      <g class="ya-hand" style="--a:${((a.t / 365) * 360).toFixed(1)}deg"><line x1="0" y1="0" x2="${(Math.cos(ta) * (R1 + 8)).toFixed(1)}" y2="${(Math.sin(ta) * (R1 + 8)).toFixed(1)}"/><circle cx="${(Math.cos(ta) * (R1 + 8)).toFixed(1)}" cy="${(Math.sin(ta) * (R1 + 8)).toFixed(1)}" r="4"/></g>
      <circle r="${R0 - 12}" class="ya-core"/><text class="ya-today" y="-4" text-anchor="middle">${a.L.d} ${GP.model.MON[a.L.mo - 1]}</text><text class="ya-today-s" y="12" text-anchor="middle">TODAY</text>
    </svg><figcaption class="sc">Each ring is a species; its arcs are the months it has been photographed.</figcaption></figure>
    <div class="ya-t"><p class="lede">In past years around this week, ${h.plural(a.list.length, "species was", "species were")} photographed. Likely at the water now:</p>
      <div class="ya-list">${top.map((e) => `<a class="ya-sp" href="#/species/${h.esc(e.s.slug)}" data-sp="${h.esc(e.s.slug)}"><span class="ya-pic">${h.cover(e.s.best, 240, "", e.s.name)}</span><span><b>${h.esc(e.s.name)}</b><span class="sc">${h.plural(e.n, "outing")} this time of year</span></span></a>`).join("")}</div></div>
  </div>
</section>`;
  }

  /* ---------- from the field ---------- */
  // A new outing gets a magazine cover on the home page for a week.
  function dispatch(m) {
    const L = GP.sky ? GP.sky.local() : null;
    const wild = m.outings.filter((o) => o.species.length && o.photos.length >= 3);
    const o = wild[wild.length - 1];
    if (!o || !L) return null;
    const d = /^(\d{4})-(\d\d)-(\d\d)/.exec(o.date);
    if (!d) return null;
    const age = (Date.UTC(L.y, L.mo - 1, L.d) - Date.UTC(+d[1], +d[2] - 1, +d[3])) / 864e5;
    if (age < 0 || age > 7) return null;
    const cover = o.heroes.filter((x) => x.spKey && !x.unsure).sort((a, b) => (b.ar >= 1.3) - (a.ar >= 1.3) || b.score - a.score)[0] || o.cover;
    return { o, cover, age };
  }
  function dispatchHtml(m, h) {
    const dp = dispatch(m);
    if (!dp || !dp.cover) return "";
    const { o, cover, age } = dp;
    const hook = (o.note || "").split(/(?<=[.!?])\s+/)[0] || o.title;
    return `<section class="hm-dispatch" data-copy="${(cover.fp[0] > 0.5) ? "l" : "r"}">
  <a class="hd-cv" href="#/story/${h.esc(o.id)}" aria-label="Read the story of ${h.esc(h.fmtDate(o.date))}">${h.cover(cover, 2000, "", h.titleOf(cover))}</a>
  <div class="hd-t">
    <div class="hd-mast"><span class="hd-from display">From the field</span><span class="sc">Dispatch No. ${o.no} · ${h.esc(h.fmtDate(o.date))}${age <= 1 ? " · new" : ""}</span></div>
    <h2 class="display">${h.esc(o.title)}</h2>
    <p>${h.esc(hook)}</p>
    <div class="hd-stats mono">${h.plural(o.photos.length, "frame")} · ${h.plural(o.species.length, "species", "species")}${o.companions.length > 1 ? " · with " + h.esc(o.companions.slice(1).join(", ")) : ""}</div>
    <div class="cta"><a class="btn primary" href="#/story/${h.esc(o.id)}">Read the story ${h.ICON.arrow}</a><a class="btn" href="#/outings/${h.esc(o.id)}">The outing</a></div>
  </div>
</section>`;
  }

  /* ---------- the headline goes where the bird isn't ---------- */
  // Sample the photograph as the hero shows it and choose the emptiest corner away from the subject.
  const sampled = new Map();
  function sample(x, url) {
    if (sampled.has(x.id)) return sampled.get(x.id);
    const p = new Promise((res) => {
      const im = new Image();
      im.crossOrigin = "anonymous";
      im.onload = () => {
        try {
          const c = document.createElement("canvas"); c.width = 48; c.height = Math.max(8, Math.round(48 / x.ar));
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(im, 0, 0, c.width, c.height);
          res({ w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data });
        } catch (e) { res(null); }
      };
      im.onerror = () => res(null);
      im.src = url;
    });
    sampled.set(x.id, p);
    return p;
  }
  function chooseCorner(x, box, smp) {
    const ba = box.width / box.height, ia = x.ar, fp = x.fp || [0.5, 0.5];
    // the photograph's visible window (object-fit: cover, positioned at the subject)
    let cx0 = 0, cy0 = 0, cw = 1, ch = 1;
    if (ia > ba) { cw = ba / ia; cx0 = fp[0] * (1 - cw); } else { ch = ia / ba; cy0 = fp[1] * (1 - ch); }
    const REG = { bl: [0, 0.48, 0.52, 0.94], br: [0.48, 0.48, 1, 0.94], tl: [0, 0.1, 0.52, 0.52], tr: [0.48, 0.1, 1, 0.52] };
    const out = {};
    for (const [k, [x0, y0, x1, y1]] of Object.entries(REG)) {
      let n = 0, sum = 0, busy = 0;
      if (smp) {
        const { w, h, d } = smp;
        const lumAt = (u, v) => { const i = (Math.min(h - 1, Math.max(0, Math.floor(v * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(u * w)))) * 4; return (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; };
        for (let by = y0; by < y1; by += 0.05) for (let bx = x0; bx < x1; bx += 0.04) {
          const u = cx0 + bx * cw, v = cy0 + by * ch, l = lumAt(u, v);
          sum += l; n++;
          busy += Math.abs(l - lumAt(u + 0.03 * cw, v)) + Math.abs(l - lumAt(u, v + 0.04 * ch));
        }
      }
      const mean = n ? sum / n : 0.3;
      // the subject's distance from the region (in box terms)
      const dx = Math.max(x0 - fp[0], 0, fp[0] - x1), dy = Math.max(y0 - fp[1], 0, fp[1] - y1);
      const near = Math.hypot(dx, dy);
      const subj = near < 0.04 ? 3 : 0.18 / (near + 0.06);
      out[k] = { score: (n ? busy / n : 0.2) * 4 + subj + (k[0] === "t" ? 0.35 : 0), mean };
    }
    const best = Object.entries(out).sort((a, b) => a[1].score - b[1].score)[0];
    return { corner: best[0], tone: best[1].mean > 0.62 ? "dark" : "light" };
  }

  const pos = (x) => `object-position:${((x.fp || [0.5])[0] * 100).toFixed(1)}% ${((x.fp || [0, 0.5])[1] * 100).toFixed(1)}%`;

  function render({ model: m, h }) {
    const site = GP.app.site, st = m.stats, V = GP.app.workshop ? null : GP.visitor;
    const slides = heroSlides(m);
    const y0 = (st.first || "").slice(0, 4), y1 = (st.last || "").slice(0, 4);
    const hk = h.regCtx(slides);
    const w = Math.min(2560, Math.max(innerWidth, 1280) * Math.min(2, devicePixelRatio || 1));
    const cap = (x) => `<em>${h.esc(h.titleOf(x))}</em><span>${h.esc([h.fmtShort(x.t), x.light].filter(Boolean).join(" · "))}</span>`;
    const newList = V ? V.newPhotos() : [];
    const returning = V && !V.firstVisit;

    /* hero */
    const hero = `<section class="hm-hero" aria-label="Opening sequence" data-ctx="${hk}">
  ${slides.map((x, i) => `<div class="hm-slide${i ? "" : " on"}"><div class="hm-par"><div class="hm-cam" style="--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%"><img src="${h.esc(h.src(x, w))}" alt="${h.esc(h.titleOf(x))}" style="${pos(x)}" data-open="${h.esc(x.id)}"${i ? ' loading="lazy"' : ' fetchpriority="high"'}></div></div></div>`).join("")}
  <div class="hm-shade" aria-hidden="true"></div>
  <div class="hm-copy wrap">
    <div class="kicker">${h.esc(site.kicker || `${site.tagline || "Wildlife of Central Florida"} · ${y0 === y1 ? y0 : y0 + "–" + y1}`)}</div>
    <h1 class="display">${h.esc(site.title || "Georgiadis Photography")}</h1>
    <p>${h.esc(site.intro || `Herons at dawn, otters in the shallows, alligators in the heat of the day: ${h.fmtN(st.photos)} photographs of ${h.fmtN(st.species)} species from ${h.fmtN(st.outings)} outings into Florida's wetlands and woods.`)}</p>
    <div class="cta">
      <a class="btn primary" href="#/gallery">Explore the gallery ${h.ICON.arrow}</a>
      <button class="btn" data-hm="play">${h.ICON.play} Play the exhibition</button>
      ${returning && newList.length ? `<a class="btn hm-new" href="#/gallery?new=1"><i></i>${h.plural(newList.length, "new photograph")} since your last visit</a>` : ""}
    </div>
  </div>
  <div class="hm-now wrap" aria-live="polite">
    <div class="hm-now-t">${slides[0] ? cap(slides[0]) : ""}</div>
    <div class="hm-bars">${slides.map((x, i) => `<button data-slide="${i}" aria-label="Show ${h.esc(h.titleOf(x))}"${i ? "" : ' class="on"'}><i></i></button>`).join("")}</div>
  </div>
  <button class="hm-arrow prev" data-step="-1" aria-label="Previous photograph">${h.ICON.left}</button>
  <button class="hm-arrow next" data-step="1" aria-label="Next photograph">${h.ICON.right}</button>
  <a class="hm-down" href="#hm-start" aria-label="Into the archive"><span></span></a>
</section>`;

    /* introduction */
    const intro = `<section class="hm-intro wrap" id="hm-start">
  <p class="hm-lede">A field archive of <b>${h.plural(st.species, "species", "species")}</b> from <b>${h.plural(st.outings, "outing")}</b> into Central Florida's marshes, woods and shorelines, ${y0 === y1 ? "made in " + y0 : "made between " + y0 + " and " + y1}. Start with the highlights, wander every frame in the Universe, or open the cabinet of specimens.</p>
  <dl class="hm-stats">
    <div><dt>Photographs</dt><dd data-count="${st.photos}">${h.fmtN(st.photos)}</dd></div>
    <div><dt>Species</dt><dd data-count="${st.species}">${h.fmtN(st.species)}</dd></div>
    <div><dt>Outings</dt><dd data-count="${st.outings}">${h.fmtN(st.outings)}</dd></div>
    <div><dt>Families</dt><dd data-count="${st.families}">${h.fmtN(st.families)}</dd></div>
  </dl>
</section>`;

    /* for you: only once there's something personal to show */
    const favs = V ? V.favPhotos() : [], last = V ? V.lastSeen() : null, daily = GP.quizDaily ? GP.quizDaily.status() : null;
    const mosaic = (list) => `<span class="fy-mosaic">${list.slice(0, 4).map((x) => `<span>${h.cover(x, 240)}</span>`).join("")}</span>`;
    const forYou = [];
    if (returning && newList.length) forYou.push(`<a class="fy" href="#/gallery?new=1">${mosaic(newList)}<span class="fy-t"><span class="sc">Since ${V.previousVisit ? h.esc(h.fmtShort(V.previousVisit)) : "your last visit"}</span><b>${h.plural(newList.length, "new photograph")}</b><span>See what's arrived ${h.ICON.arrow}</span></span></a>`);
    if (favs.length) forYou.push(`<a class="fy" href="#/rooms/favourites">${mosaic(favs)}<span class="fy-t"><span class="sc">Your favourites</span><b>${h.plural(favs.length, "photograph")}</b><span>Your own room ${h.ICON.arrow}</span></span></a>`);
    if (last && returning) forYou.push(`<a class="fy" href="${h.esc(GP.app.hashFor(["gallery"], new URLSearchParams({ p: last.x.id })))}"><span class="fy-one">${h.cover(last.x, 360)}</span><span class="fy-t"><span class="sc">Pick up where you left off · ${h.esc(V.ago(last.at))}</span><b>${h.esc(h.titleOf(last.x))}</b><span>${h.esc(h.fmtDate(last.x.t))} ${h.ICON.arrow}</span></span></a>`);
    if (daily && (returning || daily.played)) forYou.push(`<a class="fy fy-quiz" href="#/quiz?daily=1"><span class="fy-q" aria-hidden="true">?</span><span class="fy-t"><span class="sc">Today's challenge${daily.streak > 1 ? ` · ${daily.streak}-day streak` : ""}</span><b>${daily.played ? `You scored ${daily.score} of 10` : "Ten birds, the same for everyone"}</b><span>${daily.played ? "Come back tomorrow for a new one" : "Play today's ten"} ${h.ICON.arrow}</span></span></a>`);
    const forYouHtml = forYou.length ? `<section class="hm-sec wrap"><div class="hm-sec-h"><div><div class="kicker">${returning ? "Welcome back" : "For you"}</div><h2>Your archive</h2></div></div><div class="fy-row">${forYou.join("")}</div></section>` : "";

    /* highlights */
    const high = highlights(m, slides.slice(0, 1));
    const hk2 = h.regCtx(high);
    const highHtml = high.length >= 5 ? `<section class="hm-sec wrap">
  <div class="hm-sec-h"><div><div class="kicker">From the Collection</div><h2>Highlights</h2></div><a class="btn ghost" href="#/rooms/collection">Walk through the Collection ${h.ICON.arrow}</a></div>
  <div class="hm-high" data-ctx="${hk2}">${high.map((x, i) => `<button class="hm-pic p${i}" data-open="${h.esc(x.id)}" aria-label="${h.esc(h.titleOf(x) + ", " + h.fmtDate(x.t))}">${h.cover(x, i === 0 ? 1600 : 900, "", h.titleOf(x))}<span class="hm-pic-cap"><b>${h.esc(h.titleOf(x))}</b><span>${h.esc([h.fmtShort(x.t), x.light].filter(Boolean).join(" · "))}</span></span></button>`).join("")}</div>
</section>` : "";

    /* ways in */
    const uvTiles = m.heroes.filter((x) => x.hsl && x.hsl[0]).slice().sort((a, b) => hueKey(a) - hueKey(b));
    const step = Math.max(1, Math.floor(uvTiles.length / 72));
    const uvArt = uvTiles.filter((_, i) => i % step === 0).slice(0, 72).map((x, i) => `<i style="--i:${i};background-image:url(${x.lq || ""});background-color:${h.esc(x.pal[0] || "#777")}"></i>`).join("");
    const famBig = [];
    for (const c of m.tree.values()) for (const o of c.orders.values()) for (const f of o.families.values()) { const sp = f.species.filter((s) => s.lifeNo); if (sp.length) famBig.push({ f, sp }); }
    famBig.sort((a, b) => b.sp.length - a.sp.length);
    const drawers = famBig.slice(0, 3).map(({ f, sp }) => `<span class="cab-drawer"><span class="cab-window">${h.cover(sp[0].best, 160)}</span><span class="cab-holder"><span class="cab-card"><b>${h.esc(f.name)}</b><i>${h.esc(f.common)}</i></span></span><span class="cab-pull"></span></span>`).join("");
    const quizBird = bestOf(m, 30, (x) => x.group === "bird")[Math.floor(Date.now() / 864e5) % Math.max(1, Math.min(30, bestOf(m, 30, (x) => x.group === "bird").length))];
    const listenSp = (() => {
      const withCall = m.life.filter((s) => s.call && s.best);
      if (!withCall.length || !GP.calls) return null;
      return withCall[(Math.floor(Date.now() / 864e5) + 7) % withCall.length];
    })();
    const lastOuting = m.outings[m.outings.length - 1];
    const ways = `<section class="hm-sec wrap">
  <div class="hm-sec-h"><div><div class="kicker">Ways in</div><h2>Explore the archive</h2></div></div>
  <div class="hm-ways">
    <a class="way way-uv" href="#/universe"><span class="way-art uv-art" aria-hidden="true">${uvArt}</span><span class="way-t"><span class="sc">The Universe</span><b>Every photograph on one canvas</b><span>All ${h.fmtN(st.photos)}, arranged by colour, by the hour they were taken, by outing or by family. Zoom into any one to open it.</span></span></a>
    <a class="way way-cab" href="#/species"><span class="way-art cab cab-mini" aria-hidden="true">${drawers}</span><span class="way-t"><span class="sc">The cabinet</span><b>${h.plural(m.life.length, "species", "species")} in ${h.plural(famBig.length, "drawer")}</b><span>The field guide as a natural-history cabinet: open a family's drawer to see its specimens.</span></span></a>
    <a class="way way-day" href="#/day"><span class="way-art day-art" aria-hidden="true"><span class="day-ring"><i class="day-hand"></i>${m.life.filter((sp2) => sp2.call && sp2.best).slice(0, 12).map((sp2, k) => `<span class="day-dot" style="--k:${k}">${h.cover(sp2.best, 120)}</span>`).join("")}</span></span><span class="way-t"><span class="sc">Listen</span><b>A day in the marsh, in 60 seconds</b><span>Dawn chorus, quiet noon, evening herons: every call placed at the hour its bird is photographed.</span></span></a>
    <a class="way way-sky" href="#/sky"><span class="way-art sky-art" aria-hidden="true">${Array.from({ length: 46 }, (_, k) => `<i style="--x:${((k * 37) % 97) + 1.5}%;--y:${((k * 53) % 89) + 4}%;--s:${(1 + (k % 5) * 0.7).toFixed(1)}px;--d:${(k % 7) * 0.4}s"></i>`).join("")}</span><span class="way-t"><span class="sc">The life list</span><b>The night sky</b><span>Every species a star, brighter the more it has been photographed; every family a constellation.</span></span></a>
    <a class="way way-plates" href="#/plates"><span class="way-art plates-art" aria-hidden="true">${famBig.slice(0, 1).map(({ sp: fs }) => fs.slice(0, 4).map((sp2) => `<span>${h.cover(sp2.best, 200)}</span>`).join("")).join("")}</span><span class="way-t"><span class="sc">For the wall</span><b>Natural-history plates</b><span>Each family as a plate from an old field guide, numbered and named, ready to print.</span></span></a>
    <a class="way way-tree" href="#/journal?tree=1"><span class="way-art tree-art" aria-hidden="true">${GP.treeOfLife && GP.treeOfLife.mini ? GP.treeOfLife.mini(m) : ""}</span><span class="way-t"><span class="sc">The tree of life</span><b>Watch the life list grow</b><span>Every species in the order it was first photographed, branch by branch.</span></span></a>
    ${quizBird ? `<a class="way way-quiz" href="#/quiz?daily=1"><span class="way-art quiz-art" aria-hidden="true"><span class="quiz-crop"><img src="${h.esc(h.src(quizBird, 720))}" alt="" style="transform-origin:0 0;transform:${cropT(quizBird, 2.4)}"></span><span class="quiz-q">?</span></span><span class="way-t"><span class="sc">Name that bird</span><b>Today's challenge</b><span>Ten close crops, four names each, the same ten for everyone today. ${daily && daily.played ? `You scored ${daily.score}.` : ""}</span></span></a>` : ""}
    ${listenSp ? `<div class="way way-listen"><span class="way-art listen-art"><a class="listen-pic" href="#/species/${h.esc(listenSp.slug)}" aria-label="${h.esc(listenSp.name)}">${h.cover(listenSp.best, 360)}</a>${GP.calls.player(listenSp, true)}</span><span class="way-t"><span class="sc">Listen</span><b>Hear the ${h.esc(listenSp.name)}</b><span>${h.plural(m.species.filter((s) => s.call).length, "species", "species")} have their calls beside the photographs. <a href="#/species?view=calls">All the calls ${h.ICON.arrow}</a></span></span></div>` : ""}
  </div>
</section>`;

    /* species of the day */
    const sp = spotlight(m);
    const spot = sp ? `<section class="hm-sec wrap hm-spot">
  <div class="hm-spot-t"><div class="kicker">Species of the day · ${h.esc(sp.famName || "")}</div><h2 class="display" data-sing="${h.esc(sp.slug)}">${h.esc(sp.name)}</h2><div class="binomial">${h.esc(sp.bin || "")}</div><p class="lede">${h.esc(sp.note)}</p>
    ${GP.calls && sp.call ? GP.calls.player(sp) : ""}
    <div class="hm-spot-a"><a class="btn" href="#/species/${h.esc(sp.slug)}">${h.plural(sp.photos.length, "photograph")} ${h.ICON.arrow}</a><span class="sc">First seen ${h.esc(h.fmtDate(sp.first))} · ${h.plural(sp.outingN, "outing")}</span></div></div>
  <button class="hm-spot-pic" data-open="${h.esc(sp.best.id)}" data-ripple="${h.esc(sp.slug)}" style="--fx:${(sp.best.fp[0] * 100).toFixed(1)}%;--fy:${(sp.best.fp[1] * 100).toFixed(1)}%" aria-label="Open ${h.esc(sp.name)}">${h.cover(sp.best, 1400, "", sp.name)}</button>
</section>` : "";
    if (sp) h.regCtx(sp.heroes);

    /* exhibitions */
    const shown = new Set();
    for (const x of [...slides, ...high, ...(sp ? [sp.best] : [])]) { shown.add(burstKey(x)); if (x.spKey) shown.add("sp:" + x.spKey); }
    const rooms = m.rooms.filter((r) => r.photos.length);
    const roomsHtml = rooms.length ? `<section class="hm-sec hm-rooms">
  <div class="wrap hm-sec-h"><div><div class="kicker">Exhibitions</div><h2>Rooms to walk through</h2></div><div class="hm-rail-btns"><button class="icon-btn" data-rail="-1" aria-label="Scroll back">${h.ICON.left}</button><button class="icon-btn" data-rail="1" aria-label="Scroll on">${h.ICON.right}</button><a class="btn ghost" href="#/rooms">All exhibitions ${h.ICON.arrow}</a></div></div>
  <div class="hm-rail" tabindex="0" aria-label="Exhibitions">${rooms.map((r) => `<a class="rm-card" href="#/rooms/${h.esc(r.id)}">${h.cover(fresh(r.cover, r.photos, shown), 700, "", r.title)}<span class="rm-t"><span class="sc">${h.plural(r.photos.length, "photograph")}</span><b>${h.esc(r.title)}</b><span>${h.esc(r.sub)}</span></span></a>`).join("")}</div>
</section>` : "";

    /* latest outings */
    // the latest outings that found wildlife (a day of only people or scenery isn't a first impression)
    const wildOuts = m.outings.filter((o) => o.species.length && o.photos.length >= 3);
    const outs = (wildOuts.length >= 3 ? wildOuts : m.outings).slice(-3).reverse();
    const outsHtml = outs.length ? `<section class="hm-sec wrap">
  <div class="hm-sec-h"><div><div class="kicker">The field diary</div><h2>Latest outings</h2></div><a class="btn ghost" href="#/outings">All ${h.plural(st.outings, "outing")} ${h.ICON.arrow}</a></div>
  <div class="hm-outs">${outs.map((o) => `<a class="hm-out" href="#/outings/${h.esc(o.id)}"><span class="hm-out-cv">${h.cover(fresh(o.cover, o.photos.filter((x) => x.isHero && x.spKey).sort((a, b) => b.score - a.score), shown), 900, "", o.title)}</span><span class="hm-out-d"><b>${h.esc(h.fmtDate(o.date).split(" ")[0])}</b><span class="sc">${h.esc(h.fmtDate(o.date).split(" ").slice(1).join(" "))}</span></span><span class="hm-out-t"><b>${h.esc(o.title)}</b><span class="sc">${h.plural(o.photos.length, "frame")} · ${h.plural(o.species.length, "species", "species")}</span></span></a>`).join("")}</div>
  <p class="hm-outs-story">Each outing can be read as a story: the day's light from first frame to last, with its birds calling as they appear. <a href="#/story/${h.esc(outs[0].id)}">Start with ${h.esc(h.fmtDate(outs[0].date))} ${h.ICON.arrow}</a></p>
</section>` : "";

    /* on this day */
    const otd = onThisDay(m);
    const otdHtml = otd.length ? `<section class="hm-sec wrap"><div class="hm-sec-h"><div><div class="kicker">${h.esc(h.fmtShort(otd[0].t))}</div><h2>On this day</h2></div></div>${h.flow(otd.slice(0, 10))}</section>` : "";

    const html = hero + dispatchHtml(m, h) + intro + forYouHtml + hourHtml(m, h) + highHtml + ways + aroundHtml(m, h) + spot + roomsHtml + outsHtml + otdHtml;
    return { html, title: "", after: (main, signal) => mount(main, signal, m, h, slides) };
  }

  function hueKey(x) {
    const c = (x.hsl || []).slice(0, 3).sort((a, b) => b[1] * (1 - Math.abs(2 * b[2] - 1)) - a[1] * (1 - Math.abs(2 * a[2] - 1)))[0];
    if (!c) return 999;
    const chroma = c[1] * (1 - Math.abs(2 * c[2] - 1));
    return chroma < 0.08 ? 400 + (1 - c[2]) * 100 : (c[0] + 330) % 360;
  }
  function cropT(x, k) {
    const fp = x.fp || [0.5, 0.5], lim = 1 / (2 * k);
    const cx = Math.max(lim, Math.min(1 - lim, fp[0])), cy = Math.max(lim, Math.min(1 - lim, fp[1] - 0.03));
    return `translate(${((0.5 - k * cx) * 100).toFixed(2)}%, ${((0.5 - k * cy) * 100).toFixed(2)}%) scale(${k})`;
  }

  function mount(main, signal, m, h, slides) {
    const hero = main.querySelector(".hm-hero");
    let i = 0, t = 0, paused = false;
    const cap = (x) => `<em>${h.esc(h.titleOf(x))}</em><span>${h.esc([h.fmtShort(x.t), x.light].filter(Boolean).join(" · "))}</span>`;
    // each slide: its colours on the page, the headline in its emptiest corner, and either its
    // burst playing as the moment it was or its subject floating in front of its background
    let surf = null, stopLive = null, liveT = 0, placeTok = 0;
    const W = Math.min(2560, Math.max(innerWidth, 1280) * Math.min(2, devicePixelRatio || 1));
    const copy = hero && hero.querySelector(".hm-copy");
    const placeCopy = (x, img) => {
      const tok = ++placeTok;
      const apply = (r) => {
        if (tok !== placeTok || !hero) return;
        const corner = innerWidth < 900 ? (r.corner[0] === "t" ? "bl" : "b" + r.corner[1]) : r.corner;
        const narrow = innerWidth < 900;
        const next = narrow ? "bl" : corner;
        if (hero.dataset.copy === next && hero.dataset.tone === r.tone) return;
        const swap = () => { hero.dataset.copy = next; hero.dataset.tone = r.tone; copy && copy.classList.remove("moving"); };
        if (!hero.dataset.copy || reduced()) swap();
        else { copy && copy.classList.add("moving"); setTimeout(swap, 380); }
      };
      sample(x, img.currentSrc || img.src).then((smp) => apply(chooseCorner(x, hero.getBoundingClientRect(), smp)));
    };
    const activate = (k) => {
      if (!hero) return;
      const x = slides[k], slide = hero.querySelectorAll(".hm-slide")[k];
      if (!x || !slide) return;
      const img = slide.querySelector("img"), cam = slide.querySelector(".hm-cam");
      if (surf) { const old = surf; setTimeout(() => old.destroy(), 1700); surf = null; }
      clearTimeout(liveT);
      if (stopLive) { stopLive(); stopLive = null; }
      if (GP.tint) GP.tint.page(x);
      placeCopy(x, img);
      if (!GP.fx) return;
      hero.querySelectorAll(".hm-cam > .fx-leak").forEach((el) => { if (el.parentElement !== cam) el.remove(); });
      GP.fx.leak(cam, x);
      const start = () => {
        if (x.burst && x.burst.size >= 3 && x.burst.size <= 9 && !(navigator.connection && navigator.connection.saveData)) {
          liveT = setTimeout(() => { stopLive = GP.fx.play(img, x, { width: W, once: true }); }, 1600);
        } else surf = GP.fx.surface(img, x, { tilt: true, listen: hero, ripple: true, amount: 0.024 });
      };
      if (img.complete && img.naturalWidth) start(); else img.addEventListener("load", start, { once: true });
    };
    if (hero) {
      activate(0);
      signal.addEventListener("abort", () => { clearTimeout(liveT); if (stopLive) stopLive(); if (surf) surf.destroy(); });
      hero.addEventListener("touchstart", () => GP.fx && GP.fx.askTilt(), { passive: true, once: true, signal });
      // the first visit opens through the viewfinder
      if (GP.intro && !GP.app.workshop) GP.intro.run(slides[0], m.stats.photos, hero.querySelector(".hm-slide.on img"));
    }
    const go = (n) => {
      if (!hero || slides.length < 2) return;
      i = (n + slides.length) % slides.length;
      hero.querySelectorAll(".hm-slide").forEach((s, k) => s.classList.toggle("on", k === i));
      hero.querySelectorAll(".hm-bars button").forEach((b, k) => { b.classList.toggle("on", k === i); b.classList.toggle("done", k < i); });
      hero.querySelector(".hm-now-t").innerHTML = cap(slides[i]);
      const nx = hero.querySelectorAll(".hm-slide img")[(i + 1) % slides.length];
      if (nx) nx.loading = "eager";
      activate(i);
      restart();
    };
    const restart = () => {
      clearTimeout(t);
      if (paused || reduced()) return;
      t = setTimeout(() => { if (!document.hidden && !(GP.viewer && GP.viewer.isOpen()) && !document.querySelector(".ex2")) go(i + 1); else restart(); }, SLIDE_MS);
    };
    if (hero && slides.length > 1) {
      hero.style.setProperty("--slide-ms", SLIDE_MS + "ms");
      hero.addEventListener("click", (e) => {
        const d = e.target.closest("[data-slide]");
        if (d) { go(+d.dataset.slide); return; }
        const st = e.target.closest("[data-step]");
        if (st) go(i + +st.dataset.step);
      }, { signal });
      // pause while the pointer rests on the photograph's caption or arrows
      hero.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { paused = true; hero.classList.add("paused"); clearTimeout(t); } }, { signal });
      hero.addEventListener("pointerleave", () => { paused = false; hero.classList.remove("paused"); restart(); }, { signal });
      let sx = null;
      hero.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true, signal });
      hero.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1)); }, { passive: true, signal });
      restart();
      signal.addEventListener("abort", () => clearTimeout(t));
    }
    // a gentle parallax on the opening photograph
    if (hero && !reduced()) {
      const onScroll = () => { const y = window.scrollY; if (y < innerHeight) hero.style.setProperty("--py", (y * 0.18).toFixed(1) + "px"); };
      window.addEventListener("scroll", onScroll, { passive: true, signal });
    }
    main.addEventListener("click", (e) => {
      if (e.target.closest('[data-hm="play"]')) {
        const r = m.rooms.find((x) => x.id === "collection") || m.rooms[0];
        GP.exhibit(r ? r.photos : slides, { title: r ? r.title : "The exhibition" });
        return;
      }
      const down = e.target.closest(".hm-down");
      if (down) { e.preventDefault(); const tgt = main.querySelector("#hm-start"); if (tgt) window.scrollTo({ top: tgt.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64), behavior: reduced() ? "auto" : "smooth" }); return; }
      const rb = e.target.closest("[data-rail]");
      if (rb) { const rail = main.querySelector(".hm-rail"); rail.scrollBy({ left: +rb.dataset.rail * rail.clientWidth * 0.8, behavior: reduced() ? "auto" : "smooth" }); }
    }, { signal });
    // "At this hour" keeps up with the clock while the page is open
    const hourBox = main.querySelector(".hm-hour");
    if (hourBox) {
      const it = setInterval(() => {
        const a = atThisHour(m), q = Math.round(a.mins / 15) * 15;
        if (String(q) === hourBox.dataset.hour) return;
        const tmp = document.createElement("div");
        tmp.innerHTML = hourHtml(m, h);
        const fresh2 = tmp.firstElementChild;
        if (fresh2) { fresh2.classList.add("hm-rise", "in"); hourBox.replaceWith(fresh2); }
      }, 60e3);
      signal.addEventListener("abort", () => clearInterval(it));
    }
    // the year wheel: hovering a species in the list lights its ring
    const ya = main.querySelector(".ya");
    if (ya) {
      ya.addEventListener("pointerover", (e) => {
        const a = e.target.closest(".ya-sp");
        ya.querySelectorAll(".ya-ring").forEach((g) => g.classList.remove("hl"));
        ya.classList.toggle("hovering", !!a);
        if (!a) return;
        const name = a.querySelector("b").textContent;
        ya.querySelectorAll(".ya-ring").forEach((g) => { if (g.getAttribute("data-tip") === name) g.classList.add("hl"); });
      }, { signal });
    }
    // reveal sections as they arrive
    if ("IntersectionObserver" in window && !reduced()) {
      const io = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }, { rootMargin: "0px 0px -8% 0px" });
      main.querySelectorAll(".hm-sec, .hm-intro").forEach((s) => { s.classList.add("hm-rise"); io.observe(s); });
      signal.addEventListener("abort", () => io.disconnect());
    }
  }

  GP.home = { chooseCorner, sample, atThisHour, around, dispatch };
  (GP.views = GP.views || []).push({ id: "", label: "Home", nav: false, render });
})(window.GP = window.GP || {});
