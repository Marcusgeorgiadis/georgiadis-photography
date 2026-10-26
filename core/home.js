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
  ${slides.map((x, i) => `<div class="hm-slide${i ? "" : " on"}"><img src="${h.esc(h.src(x, w))}" alt="${h.esc(h.titleOf(x))}" style="${pos(x)};--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%" data-open="${h.esc(x.id)}"${i ? ' loading="lazy"' : ' fetchpriority="high"'}></div>`).join("")}
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
    <a class="way way-tree" href="#/journal?tree=1"><span class="way-art tree-art" aria-hidden="true">${GP.treeOfLife && GP.treeOfLife.mini ? GP.treeOfLife.mini(m) : ""}</span><span class="way-t"><span class="sc">The tree of life</span><b>Watch the life list grow</b><span>Every species in the order it was first photographed, branch by branch.</span></span></a>
    ${quizBird ? `<a class="way way-quiz" href="#/quiz?daily=1"><span class="way-art quiz-art" aria-hidden="true"><span class="quiz-crop"><img src="${h.esc(h.src(quizBird, 720))}" alt="" style="transform-origin:0 0;transform:${cropT(quizBird, 2.4)}"></span><span class="quiz-q">?</span></span><span class="way-t"><span class="sc">Name that bird</span><b>Today's challenge</b><span>Ten close crops, four names each, the same ten for everyone today. ${daily && daily.played ? `You scored ${daily.score}.` : ""}</span></span></a>` : ""}
    ${listenSp ? `<div class="way way-listen"><span class="way-art listen-art"><a class="listen-pic" href="#/species/${h.esc(listenSp.slug)}" aria-label="${h.esc(listenSp.name)}">${h.cover(listenSp.best, 360)}</a>${GP.calls.player(listenSp, true)}</span><span class="way-t"><span class="sc">Listen</span><b>Hear the ${h.esc(listenSp.name)}</b><span>${h.plural(m.species.filter((s) => s.call).length, "species", "species")} have their calls beside the photographs. <a href="#/species?view=calls">All the calls ${h.ICON.arrow}</a></span></span></div>` : ""}
  </div>
</section>`;

    /* species of the day */
    const sp = spotlight(m);
    const spot = sp ? `<section class="hm-sec wrap hm-spot">
  <div class="hm-spot-t"><div class="kicker">Species of the day · ${h.esc(sp.famName || "")}</div><h2 class="display">${h.esc(sp.name)}</h2><div class="binomial">${h.esc(sp.bin || "")}</div><p class="lede">${h.esc(sp.note)}</p>
    ${GP.calls && sp.call ? GP.calls.player(sp) : ""}
    <div class="hm-spot-a"><a class="btn" href="#/species/${h.esc(sp.slug)}">${h.plural(sp.photos.length, "photograph")} ${h.ICON.arrow}</a><span class="sc">First seen ${h.esc(h.fmtDate(sp.first))} · ${h.plural(sp.outingN, "outing")}</span></div></div>
  <button class="hm-spot-pic" data-open="${h.esc(sp.best.id)}" aria-label="Open ${h.esc(sp.name)}">${h.cover(sp.best, 1400, "", sp.name)}</button>
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
</section>` : "";

    /* on this day */
    const otd = onThisDay(m);
    const otdHtml = otd.length ? `<section class="hm-sec wrap"><div class="hm-sec-h"><div><div class="kicker">${h.esc(h.fmtShort(otd[0].t))}</div><h2>On this day</h2></div></div>${h.flow(otd.slice(0, 10))}</section>` : "";

    const html = hero + intro + forYouHtml + highHtml + ways + spot + roomsHtml + outsHtml + otdHtml;
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
    const go = (n) => {
      if (!hero || slides.length < 2) return;
      i = (n + slides.length) % slides.length;
      hero.querySelectorAll(".hm-slide").forEach((s, k) => s.classList.toggle("on", k === i));
      hero.querySelectorAll(".hm-bars button").forEach((b, k) => { b.classList.toggle("on", k === i); b.classList.toggle("done", k < i); });
      hero.querySelector(".hm-now-t").innerHTML = cap(slides[i]);
      const nx = hero.querySelectorAll(".hm-slide img")[(i + 1) % slides.length];
      if (nx) nx.loading = "eager";
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
    // reveal sections as they arrive
    if ("IntersectionObserver" in window && !reduced()) {
      const io = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }, { rootMargin: "0px 0px -8% 0px" });
      main.querySelectorAll(".hm-sec, .hm-intro").forEach((s) => { s.classList.add("hm-rise"); io.observe(s); });
      signal.addEventListener("abort", () => io.disconnect());
    }
  }

  (GP.views = GP.views || []).push({ id: "", label: "Home", nav: false, render });
})(window.GP = window.GP || {});
