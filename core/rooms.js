/* Georgiadis Photography: exhibitions. An index of the archive's rooms, each room hung like a
   gallery wall (prints sized to fit the screen, each with its label), a room of the visitor's own
   favourites, and the exhibition player: a full-screen slideshow with captions, field notes,
   controls, a progress line and, when sound is on, each species' call. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };
  const HANG = 20; // prints on the wall; the rest of the room follows as a grid

  function favRoom(h) {
    const list = GP.visitor ? GP.visitor.favPhotos() : [];
    return { id: "favourites", title: "Your favourites", sub: "Photographs you've saved, kept on this device.", photos: list, cover: list[0], own: true };
  }
  function roomById(m, id, h) { return id === "favourites" ? favRoom(h) : m.rooms.find((r) => r.id === id); }
  function speciesIn(list, m) {
    const c = new Map();
    for (const x of list) if (x.spKey) c.set(x.spKey, (c.get(x.spKey) || 0) + 1);
    return [...c].map(([k, n]) => ({ s: m.speciesByKey.get(k), n })).filter((e) => e.s).sort((a, b) => b.n - a.n);
  }
  const pos = (x) => `object-position:${(x.fp[0] * 100).toFixed(1)}% ${(x.fp[1] * 100).toFixed(1)}%`;

  /* ---------- the index ---------- */
  function viewIndex(m, h) {
    const rooms = m.rooms.filter((r) => r.photos.length);
    const fav = favRoom(h);
    const [lead, ...rest] = rooms;
    // four more from the room: different species first, then different days, then anything
    const strip = (r) => {
      const pick = [], keys = [(x) => x.spKey || x.id, (x) => (x.spKey || "") + (x.t || "").slice(0, 10), (x) => x.id];
      for (const key of keys) {
        const seen = new Set([r.cover, ...pick].filter(Boolean).map(key));
        for (const x of r.photos) { if (pick.length >= 4) break; if (x === r.cover || pick.includes(x) || seen.has(key(x))) continue; seen.add(key(x)); pick.push(x); }
      }
      return `<span class="ri-strip">${pick.map((x) => `<span>${h.cover(x, 240)}</span>`).join("")}</span>`;
    };
    const card = (r) => `<article class="ri-card"><a class="ri-cv" href="#/rooms/${h.esc(r.id)}">${h.cover(r.cover, 1000, "", r.title)}</a>
  <div class="ri-t"><div class="sc">${h.plural(r.photos.length, "photograph")}${r.curated ? " · curated" : ""}</div><h2><a href="#/rooms/${h.esc(r.id)}">${h.esc(r.title)}</a></h2><p>${h.esc(r.sub || "")}</p>${strip(r)}
  <div class="ri-a"><a class="btn" href="#/rooms/${h.esc(r.id)}">Walk through ${h.ICON.arrow}</a><button class="btn ghost" data-rm-play="${h.esc(r.id)}">${h.ICON.play} Play</button></div></div></article>`;
    const html = `<div class="wrap page">${h.pageHead("Exhibitions", "Rooms of the archive", `${h.plural(rooms.length, "room")} drawn from ${h.fmtN(m.stats.photos)} photographs. Walk through one, or let it play full screen with its labels and, if you like, the birds' calls.`)}
${lead ? `<article class="ri-lead"><a class="ri-cv" href="#/rooms/${h.esc(lead.id)}">${h.cover(lead.cover, 1800, "", lead.title)}</a><div class="ri-t"><div class="kicker">Start here</div><h2 class="display"><a href="#/rooms/${h.esc(lead.id)}">${h.esc(lead.title)}</a></h2><p class="lede">${h.esc(lead.sub || "")}</p>${strip(lead)}<div class="ri-a"><a class="btn primary" href="#/rooms/${h.esc(lead.id)}">Walk through ${h.ICON.arrow}</a><button class="btn" data-rm-play="${h.esc(lead.id)}">${h.ICON.play} Play full screen</button></div></div></article>` : ""}
<div class="ri-grid">${rest.map(card).join("")}
${GP.visitor && !GP.app.workshop ? (fav.photos.length ? card(fav) : `<article class="ri-card ri-empty"><div class="ri-cv ri-cv-empty">${h.ICON.heart}</div><div class="ri-t"><div class="sc">Your own room</div><h2>Your favourites</h2><p>Press the heart on any photograph (or L) and it's hung here, on this device.</p></div></article>`) : ""}</div></div>`;
    const after = (main, signal) => main.addEventListener("click", (e) => {
      const b = e.target.closest("[data-rm-play]");
      if (!b) return;
      const r = roomById(m, b.dataset.rmPlay, h);
      if (r && r.photos.length) GP.exhibit(r.photos, { title: r.title });
    }, { signal });
    return { html, after, title: "Exhibitions" };
  }

  /* ---------- a room ---------- */
  // A rhythm for the wall: a landscape print on its own with its label beside it, a group hung at
  // one height (three portraits, or two prints), a wide print across the wall, and so on. Groups are
  // sized by their aspect ratios so the prints share a height; a lone portrait is never left to
  // float in an empty wall unless it is the last print.
  const BEATS = ["solo", "group", "wide", "group", "solo", "trio", "wide", "group"];
  function hangRows(list) {
    const rows = [], rest = list.slice();
    const land = (x) => x.ar >= 1.2, tall = (x) => x.ar < 1.2;
    const near = (test) => { const j = rest.findIndex((y, k) => k < 5 && test(y)); return j < 0 ? null : rest.splice(j, 1)[0]; };
    let side = 0, beat = 0;
    while (rest.length) {
      const want = BEATS[beat++ % BEATS.length];
      if (want === "wide") { const x = near((y) => y.ar >= 1.35); if (x) { rows.push({ type: "wide", items: [x] }); continue; } }
      if (want === "solo") { const x = near(land); if (x) { rows.push({ type: "solo", side: (side ^= 1), items: [x] }); continue; } }
      if (rest.length === 1) { const x = rest.shift(); rows.push(land(x) ? { type: "wide", items: [x] } : { type: "solo", side: (side ^= 1), items: [x] }); continue; }
      const a = rest.shift();
      const other = (...xs) => (y) => !y.spKey || xs.every((x) => x.spKey !== y.spKey);
      const b = (tall(a) && near((y) => tall(y) && other(a)(y))) || near(other(a)) || rest.shift();
      const items = [a, b];
      if (rest.length && (want === "trio" || (tall(a) && tall(b)))) {
        const c = rest.find((y, k) => k < 5 && tall(y) && other(a, b)(y)) || (want === "trio" && other(a, b)(rest[0]) ? rest[0] : null);
        if (c && a.ar + b.ar + c.ar <= 3.05) { rest.splice(rest.indexOf(c), 1); items.push(c); }
      }
      rows.push({ type: items.length === 3 ? "trio" : "pair", items });
    }
    return rows;
  }
  // The prints for the wall. First up to two of each species, from different days; then other days
  // of a species; then frames at least twenty minutes from any like them on the wall. A room short of
  // variety hangs fewer prints (never fewer than eight) and leaves the rest to the grid below. The
  // cover isn't hung first, since the hero above already shows it.
  function wallOf(order, cover) {
    const wall = [], left = order.slice();
    const day = (x) => (x.t || "").slice(0, 10), sp = (x) => x.spKey || x.id, at = (x) => Date.parse(x.t) || 0;
    const tiers = [
      (x) => { const same = wall.filter((y) => sp(y) === sp(x)); return same.length < 2 && same.every((y) => day(y) !== day(x)); },
      (x) => wall.every((y) => sp(y) !== sp(x) || day(y) !== day(x)),
      (x) => wall.every((y) => sp(y) !== sp(x) || Math.abs(at(y) - at(x)) >= 20 * 6e4),
    ];
    for (const ok of tiers) {
      for (let i = 0; i < left.length && wall.length < HANG; i++) if (ok(left[i])) { wall.push(left[i]); left.splice(i--, 1); }
    }
    while (wall.length < Math.min(8, order.length) && left.length) wall.push(left.shift());
    const hung = diversify(wall);
    const likeCover = (x) => cover && (x === cover || (x.burst && x.burst === cover.burst) || (x.spKey && x.spKey === cover.spKey && Math.abs(at(x) - at(cover)) < 10 * 6e4));
    // (the first row looks a few prints ahead for a landscape, so move look-alikes well clear)
    if (hung.length > 3) { const early = hung.slice(0, 7).filter(likeCover); if (early.length) { const kept = hung.filter((x) => !early.includes(x)); kept.splice(Math.min(7, kept.length), 0, ...early); hung.splice(0, hung.length, ...kept); } }
    return { wall: hung, rest: order.filter((x) => !wall.includes(x)) };
  }
  // Keep the same species from hanging side by side where the room allows it.
  function diversify(list) {
    const out = [], pool = list.slice();
    while (pool.length) {
      const last = out[out.length - 1], prev = out[out.length - 2];
      let k = pool.findIndex((y, i) => i < 8 && (!last || y.spKey !== last.spKey || !y.spKey) && (!prev || y.spKey !== prev.spKey || !y.spKey));
      if (k < 0) k = 0;
      out.push(pool.splice(k, 1)[0]);
    }
    return out;
  }
  function label(x, h, m, n) {
    const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
    const note = x.caption || (sp && sp.note) || "";
    return `<div class="hang-label"><div class="hang-no mono">${String(n).padStart(2, "0")}</div><h3>${h.esc(h.titleOf(x))}</h3>${x.sci && x.common ? `<div class="binomial">${h.esc(x.sci)}</div>` : ""}
  ${note ? `<p>${h.esc(note)}</p>` : ""}
  <div class="hang-meta mono">${h.esc([h.fmtDate(x.t), h.fmtTime(x), x.light].filter(Boolean).join(" · "))}<br>${h.esc([h.exposure(x), x.exif.fl ? Math.round(x.exif.fl) + " mm" : ""].filter(Boolean).join(" · "))}</div>
  ${sp ? `<a class="hang-link" href="#/species/${h.esc(sp.slug)}">The ${h.esc(sp.name)} ${h.ICON.arrow}</a>` : ""}</div>`;
  }
  function print(x, h, w) {
    return `<figure class="print" style="--ar:${x.ar.toFixed(4)}"><button class="print-b" data-id="${h.esc(x.id)}" aria-label="Open ${h.esc(h.titleOf(x))}">${h.cover(x, w, "", h.titleOf(x))}</button></figure>`;
  }
  function viewRoom(m, h, id) {
    const r = roomById(m, id, h);
    if (!r) return null;
    const rooms = m.rooms.filter((x) => x.photos.length);
    const idx = rooms.indexOf(r);
    const prev = idx > 0 ? rooms[idx - 1] : r.own ? rooms[rooms.length - 1] : null;
    const next = idx >= 0 && idx < rooms.length - 1 ? rooms[idx + 1] : r.own ? rooms[0] : null;
    if (!r.photos.length) {
      return { html: `<div class="wrap page">${h.pageHead("Exhibition", h.esc(r.title), "Nothing here yet.")}<div class="empty"><h2>Your room is waiting</h2><p>Open any photograph and press the heart (or L) to hang it here. Favourites are kept on this device.</p><a class="btn primary" href="#/gallery">Browse the gallery ${h.ICON.arrow}</a></div></div>`, title: r.title };
    }
    const { wall, rest } = wallOf(diversify(r.photos), r.cover);
    const order = wall.concat(rest);
    const k = h.regCtx(order);
    const sps = speciesIn(r.photos, m);
    const dates = r.photos.map((x) => x.t).filter(Boolean).sort();
    let n = 0;
    const rows = hangRows(wall).map((row) => {
      if (row.type === "pair" || row.type === "trio") return `<div class="hang-row ${row.type}" style="grid-template-columns:${row.items.map((x) => `minmax(0, ${x.ar.toFixed(3)}fr)`).join(" ")}">${row.items.map((x) => `<div class="hang-cell">${print(x, h, 1300)}${label(x, h, m, ++n)}</div>`).join("")}</div>`;
      if (row.type === "wide") return `<div class="hang-row wide">${print(row.items[0], h, 2400)}${label(row.items[0], h, m, ++n)}</div>`;
      return `<div class="hang-row solo ${row.side ? "r" : "l"}">${print(row.items[0], h, 2000)}${label(row.items[0], h, m, ++n)}</div>`;
    }).join("");
    const cover = r.cover || r.photos[0];
    const roomNav = (x, dir) => x ? `<a class="rm-nav ${dir}" href="#/rooms/${h.esc(x.id)}"><span class="rm-nav-cv">${h.cover(x.cover, 700, "", x.title)}</span><span class="rm-nav-t"><span class="sc">${dir === "prev" ? "Previous room" : "Next room"}</span><b>${h.esc(x.title)}</b><span>${h.plural(x.photos.length, "photograph")}</span></span></a>` : "<span></span>";
    const html = `<section class="rm-hero">${h.cover(cover, Math.max(1600, innerWidth) * Math.min(2, devicePixelRatio || 1), "", "")}<div class="wrap">
  <div class="kicker">${r.own ? "Your room" : "Exhibition"} · ${h.plural(r.photos.length, "photograph")}${sps.length ? " · " + h.plural(sps.length, "species", "species") : ""}${dates.length ? " · " + h.esc(h.fmtShort(dates[0])) + " – " + h.esc(h.fmtShort(dates[dates.length - 1])) : ""}</div>
  <h1 class="display">${h.esc(r.title)}</h1>${r.sub ? `<p>${h.esc(r.sub)}</p>` : ""}
  <div class="cta"><button class="btn primary" data-rm="play">${h.ICON.play} Play this exhibition</button><a class="btn" href="#rm-wall" data-rm="walk">Walk through</a><button class="btn rm-lights" data-rm="lights" aria-pressed="false" title="Lights down (B)"><i class="rm-lamp" aria-hidden="true"></i><span>Lights down</span></button>${r.own ? "" : h.shareBtn(h.pageUrl("room", r.id) || "", `${r.title} · ${GP.app.site.title || "Georgiadis Photography"}`)}</div>
</div></section>
<div class="wrap page rm-page">
  ${sps.length > 1 ? `<div class="rm-sp"><span class="sc">In this room</span><div class="chips">${sps.slice(0, 12).map(({ s, n: c }) => `<a class="chip" href="#/species/${h.esc(s.slug)}">${h.esc(s.name)} <span class="n">${c}</span></a>`).join("")}${sps.length > 12 ? `<span class="chip ghost">+${sps.length - 12} more</span>` : ""}</div></div>` : ""}
  <div class="hang" id="rm-wall" data-ctx="${k}">${rows}</div>
  ${rest.length ? `<section class="sec rm-rest"><div class="sec-h"><h2>The rest of the room</h2><span class="meta">${h.plural(rest.length, "photograph")}</span></div><div class="flow" data-ctx="${k}">${rest.map((x) => h.tile(x)).join("")}</div></section>` : ""}
  <nav class="rm-navs" aria-label="Other rooms">${roomNav(prev, "prev")}${roomNav(next, "next")}</nav>
  <div class="rm-all"><a class="btn ghost" href="#/rooms">All exhibitions ${h.ICON.arrow}</a></div>
</div>`;
    const after = (main, signal) => {
      if (GP.tint) GP.tint.page(cover);
      main.addEventListener("click", (e) => {
        if (e.target.closest('[data-rm="play"]')) { GP.exhibit(order, { title: r.title }); return; }
        const walk = e.target.closest('[data-rm="walk"]');
        if (walk) { e.preventDefault(); const t = main.querySelector("#rm-wall"); const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64; window.scrollTo({ top: t.getBoundingClientRect().top + scrollY - head - 16, behavior: reduced() ? "auto" : "smooth" }); return; }
        const b = e.target.closest(".print-b");
        if (b) { const x = m.byId.get(b.dataset.id); GP.app.openList(order, Math.max(0, order.indexOf(x)), b.querySelector("img")); }
      }, { signal });
      const img = main.querySelector(".rm-hero img");
      if (img && !reduced()) window.addEventListener("scroll", () => { img.style.transform = `translateY(${Math.min(140, window.scrollY * 0.3)}px) scale(1.06)`; }, { passive: true, signal });
      if ("IntersectionObserver" in window && !reduced()) {
        const io = new IntersectionObserver((es) => { for (const en of es) if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }, { rootMargin: "0px 0px -12% 0px" });
        main.querySelectorAll(".hang-row").forEach((row) => { row.classList.add("rise"); io.observe(row); });
        signal.addEventListener("abort", () => io.disconnect());
      }
      if (r.own) document.addEventListener("gp:favs", () => GP.app.route(), { signal });
      lights(main, signal);
    };
    return { html, after, title: r.title };
  }

  /* ---------- lights down ---------- */
  // The wall goes dark and each print is lit by its own spotlight, brightening and warming as it
  // nears the middle of the screen; the shadows lean away from the pointer (or the phone's tilt).
  function lights(main, signal) {
    const hang = main.querySelector(".hang"), btn = main.querySelector('[data-rm="lights"]');
    if (!hang || !btn) return;
    const root = document.documentElement;
    let on = store.get("gp-lights") === "1", raf = 0, lx = 0, ly = 0;
    const paint = () => {
      raf = 0;
      if (!on) return;
      const mid = innerHeight / 2;
      for (const pr of hang.querySelectorAll(".print")) {
        const r = pr.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) continue;
        const d = Math.min(1, Math.abs(r.top + r.height / 2 - mid) / (innerHeight * 0.75));
        pr.style.setProperty("--lit", (1 - d * d).toFixed(3));
      }
      hang.style.setProperty("--lx", lx.toFixed(3));
      hang.style.setProperty("--ly", ly.toFixed(3));
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    const set = (v, quiet) => {
      on = v;
      store.set("gp-lights", on ? "1" : "0");
      btn.setAttribute("aria-pressed", String(on));
      btn.querySelector("span").textContent = on ? "Lights up" : "Lights down";
      if (on) root.setAttribute("data-lights", "down"); else root.removeAttribute("data-lights");
      hang.classList.toggle("lights", on);
      if (on) kick();
      if (!quiet && GP.app) GP.app.toast(on ? "Lights down: walk the wall" : "Lights up");
    };
    btn.addEventListener("click", () => set(!on), { signal });
    document.addEventListener("keydown", (e) => {
      if ((e.key === "b" || e.key === "B") && !e.metaKey && !e.ctrlKey && !e.altKey && !/input|textarea|select/i.test(e.target.tagName) && !(GP.viewer && GP.viewer.isOpen()) && !document.querySelector(".ex2")) { set(!on); e.preventDefault(); }
    }, { signal });
    addEventListener("scroll", kick, { passive: true, signal });
    addEventListener("resize", kick, { passive: true, signal });
    addEventListener("pointermove", (e) => { if (!on || e.pointerType !== "mouse") return; lx = (e.clientX / innerWidth) * 2 - 1; ly = (e.clientY / innerHeight) * 2 - 1; kick(); }, { passive: true, signal });
    addEventListener("deviceorientation", (e) => { if (!on || e.gamma == null) return; lx = Math.max(-1, Math.min(1, e.gamma / 25)); ly = Math.max(-1, Math.min(1, (e.beta - 45) / 30)); kick(); }, { passive: true, signal });
    signal.addEventListener("abort", () => { root.removeAttribute("data-lights"); cancelAnimationFrame(raf); });
    if (on) set(true, true);
  }

  function render({ parts, model: m, h }) {
    if (parts[1]) {
      const v = viewRoom(m, h, parts[1]);
      if (v) return v;
      return { html: `<div class="wrap page"><div class="empty"><h2>That room has closed</h2><p>It may have been renamed. Here are the others.</p><a class="btn" href="#/rooms">All exhibitions</a></div></div>`, title: "Not found" };
    }
    return viewIndex(m, h);
  }

  /* ---------- the exhibition player ---------- */
  let current = null;
  GP.exhibit = function (list, o = {}) {
    list = (list || []).filter(Boolean);
    if (!list.length) return;
    if (current) current.end();
    const h = GP.app.helpers, I = h.ICON;
    const calls = GP.calls && GP.calls.available();
    const el = document.createElement("div");
    el.className = "ex2 idle-soon";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", `Exhibition: ${o.title || "the archive"}`);
    el.tabIndex = -1;
    el.innerHTML = `<div class="ex2-bg" aria-hidden="true"><i></i><i></i></div>
<div class="ex2-stage"><figure class="ex2-s"><div class="ex2-cam"><div class="ex2-pic"><img alt=""></div></div></figure><figure class="ex2-s"><div class="ex2-cam"><div class="ex2-pic"><img alt=""></div></div></figure><div class="ex2-bokeh" aria-hidden="true"></div></div>
<div class="ex2-progress" aria-hidden="true"><i></i></div>
<header class="ex2-top"><div class="ex2-title"><span class="sc">Exhibition</span><b>${h.esc(o.title || "The archive")}</b></div><span class="ex2-count mono" aria-live="polite"></span>
  <div class="ex2-btns">${calls ? `<button class="ex2-b" data-x="sound" aria-pressed="false" title="Bird calls (S)"></button>` : ""}<button class="ex2-b" data-x="notes" aria-pressed="true" title="Field notes (N)">${I.info}</button><button class="ex2-b" data-x="fs" title="Full screen (F)">${I.expand}</button><button class="ex2-b" data-x="close" title="Leave (Esc)" aria-label="Leave the exhibition">${I.close}</button></div></header>
<div class="ex2-cap"><div class="kicker"></div><h2 class="display"></h2><div class="binomial"></div><p class="ex2-note"></p><div class="ex2-meta mono"></div></div>
<div class="ex2-ctrls"><button class="ex2-b" data-x="prev" aria-label="Previous (←)">${I.left}</button><button class="ex2-b ex2-play" data-x="toggle" aria-label="Pause (space)">${I.pause}</button><button class="ex2-b" data-x="next" aria-label="Next (→)">${I.right}</button>
  <span class="ex2-speed" role="group" aria-label="Seconds per photograph">${[5, 8, 12].map((s) => `<button data-speed="${s}">${s}s</button>`).join("")}</span>
  <button class="ex2-b ex2-open" data-x="open" title="Open in the viewer (I)">${I.zoom}<span>Look closer</span></button></div>
<div class="ex2-hint sc">← → move · space pauses · N notes${calls ? " · S calls" : ""} · F full screen · Esc leaves</div>`;
    document.body.appendChild(el);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const opener = document.activeElement;
    const $ = (s) => el.querySelector(s);
    const figs = [...el.querySelectorAll(".ex2-s")], bgs = [...el.querySelectorAll(".ex2-bg i")];
    const W = Math.min(2560, Math.max(innerWidth, innerHeight) * Math.min(2, devicePixelRatio || 1));
    let i = -1, slot = 0, timer = 0, idleT = 0, paused = false, ended = false, userFs = false;
    let speed = +(store.get("gp-ex-speed") || 8);
    let notes = store.get("gp-ex-notes") !== "0";
    const m = GP.app.model;

    const paintSpeed = () => el.querySelectorAll("[data-speed]").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.speed === speed)));
    const paintNotes = () => { el.classList.toggle("no-notes", !notes); $('[data-x="notes"]').setAttribute("aria-pressed", String(notes)); };
    const paintSound = () => { const b = $('[data-x="sound"]'); if (!b) return; const on = GP.calls.on; b.setAttribute("aria-pressed", String(on)); b.innerHTML = on ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/></svg>'; b.setAttribute("aria-label", on ? "Bird calls on" : "Bird calls off"); };
    const paintPlay = () => { const b = $(".ex2-play"); b.innerHTML = paused ? I.play : I.pause; b.setAttribute("aria-label", paused ? "Play (space)" : "Pause (space)"); el.classList.toggle("paused", paused); };
    paintSpeed(); paintNotes(); paintSound(); paintPlay();

    function caption(x) {
      const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
      $(".ex2-cap .kicker").textContent = [x.famName, x.light].filter(Boolean).join(" · ");
      $(".ex2-cap h2").textContent = h.titleOf(x);
      if (sp && sp.call) $(".ex2-cap h2").setAttribute("data-sing", sp.slug); else $(".ex2-cap h2").removeAttribute("data-sing");
      $(".ex2-cap .binomial").textContent = x.sci && x.common ? x.sci : "";
      const note = x.caption || (sp && sp.note) || "";
      $(".ex2-note").textContent = note;
      $(".ex2-meta").textContent = [h.fmtDate(x.t), x.outing, h.exposure(x)].filter(Boolean).join(" · ");
      $(".ex2-count").textContent = `${i + 1} / ${list.length}`;
      const cap = $(".ex2-cap");
      cap.classList.remove("in"); void cap.offsetWidth; cap.classList.add("in");
    }
    function progress() {
      const bar = $(".ex2-progress i");
      bar.style.animation = "none"; void bar.offsetWidth;
      bar.style.animation = `ex2-progress ${speed}s linear forwards`;
      bar.style.animationPlayState = paused ? "paused" : "running";
    }
    function schedule() { clearTimeout(timer); if (!paused) timer = setTimeout(() => show(i + 1), speed * 1000); }
    function sing(x) {
      if (!calls || !GP.calls.on) return;
      const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
      if (sp && sp.call) { if (GP.calls.state.key !== sp.slug || !GP.calls.state.playing) GP.calls.play(sp.slug, { auto: true, restart: GP.calls.state.key !== sp.slug }); }
      else GP.calls.pause(true);
    }
    // The photograph's box in the stage: as large as the space allows at its own proportions.
    function fitPic(f, x) {
      const pic = f.querySelector(".ex2-pic"), cs = getComputedStyle(f);
      const aw = f.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const ah = f.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      if (!aw || !ah) return;
      const w = Math.min(aw, ah * x.ar);
      pic.style.width = Math.round(w) + "px"; pic.style.height = Math.round(w / x.ar) + "px";
      if (f._surf) f._surf.place();
    }
    // Where the camera goes: with a bird in flight, along its direction of travel; otherwise a slow
    // push towards the subject (closer on portrait frames).
    function heading(x, flying) {
      const t = [x.caption, x.behavior].join(" ").toLowerCase();
      if (/left to right/.test(t)) return 1;
      if (/right to left/.test(t)) return -1;
      const m2 = /(fly|flying|flies|soar|soaring|glid|bank|heading|moving|swimming|walking|wading|running|crossing|lands?|landing|taking off|takes off)[^.;]{0,40}?\b(to the |toward the |towards the |toward |towards )?(left|right)\b/.exec(t)
        || /\b(left|right)(ward)?[^.;]{0,12}\b(in flight|flying|across)/.exec(t);
      if (m2) return /left/.test(m2[0]) ? -1 : 1;
      // no word for it: photographers leave room ahead of a flying bird, so it flies towards the open side
      const fx = (x.fp || [0.5])[0];
      return flying && Math.abs(fx - 0.5) > 0.06 ? (fx < 0.5 ? 1 : -1) : 0;
    }
    function camera(f, x) {
      const cam = f.querySelector(".ex2-cam");
      if (f._cam) f._cam.cancel();
      if (reduced()) return;
      const dur = (speed + 3) * 1000, fp = x.fp || [0.5, 0.5];
      const flying = (x.behaviours || []).includes("In flight");
      const dir = flying || /\b(swimming|walking|wading)\b/i.test(x.behavior || "") ? heading(x, flying) : 0;
      cam.style.transformOrigin = `${(fp[0] * 100).toFixed(1)}% ${(fp[1] * 100).toFixed(1)}%`;
      let kf;
      if (dir) {
        // follow the bird: the frame drifts the way it flies, with a little room ahead of it
        kf = [{ transform: `translate3d(${(-dir * 2.6).toFixed(2)}%, 0, 0) scale(1.07)` }, { transform: `translate3d(${(dir * 2.6).toFixed(2)}%, 0, 0) scale(1.09)` }];
      } else if (x.ar < 1) kf = [{ transform: "scale(1.0)" }, { transform: "scale(1.11)" }];
      else kf = [{ transform: "scale(1.015)" }, { transform: "scale(1.085)" }];
      f._cam = cam.animate(kf, { duration: dur, easing: "linear", fill: "forwards" });
      f.dataset.heading = dir ? (dir < 0 ? "left" : "right") : "";
    }
    // Between photographs the focus pulls: the old one softens into bokeh and the new one sharpens.
    function bokeh(x) {
      const box = $(".ex2-bokeh");
      if (reduced() || !box) return;
      const pal = (x.pal || []).filter(Boolean);
      box.innerHTML = Array.from({ length: 11 }, (_, k) => {
        const c = pal[k % Math.max(1, pal.length)] || "#fff", sz = 40 + ((k * 37) % 90);
        return `<i style="left:${(8 + (k * 53) % 84)}%;top:${(10 + (k * 29) % 76)}%;width:${sz}px;height:${sz}px;background:${h.esc(c)};--d:${(k % 5) * 60}ms"></i>`;
      }).join("");
      box.classList.remove("on"); void box.offsetWidth; box.classList.add("on");
    }
    let first = true;
    function show(n) {
      if (ended) return;
      i = (n + list.length) % list.length;
      const x = list[i], f = figs[slot], other = figs[1 - slot];
      const img = f.querySelector("img"), pic = f.querySelector(".ex2-pic");
      if (f._surf) { f._surf.destroy(); f._surf = null; }
      if (GP.fx) GP.fx.unleak(pic);
      img.src = h.src(x, W);
      img.alt = h.titleOf(x);
      f.style.setProperty("--ar", x.ar.toFixed(4));
      const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
      if (sp && sp.call) pic.setAttribute("data-ripple", sp.slug); else pic.removeAttribute("data-ripple");
      pic.style.setProperty("--fx", (x.fp[0] * 100).toFixed(1) + "%");
      pic.style.setProperty("--fy", (x.fp[1] * 100).toFixed(1) + "%");
      fitPic(f, x);
      const reveal = () => {
        if (ended || list[i] !== x) return;
        camera(f, x);
        const pull = !first && !reduced();
        f.classList.add("on"); other.classList.remove("on");
        if (pull) {
          f.animate([{ filter: "blur(16px) saturate(1.15)", opacity: 0.4 }, { filter: "blur(0px) saturate(1)", opacity: 1 }], { duration: 1250, easing: "cubic-bezier(.25,.6,.2,1)" });
          other.animate([{ filter: "blur(0px)" }, { filter: "blur(18px)" }], { duration: 900, easing: "ease-in", fill: "forwards" }).onfinish = (a) => setTimeout(() => a.target.cancel && a.target.cancel(), 900);
          bokeh(x);
        } else if (first && GP.fx) GP.fx.develop(img, { host: pic });
        first = false;
        if (GP.tint) GP.tint.set(x);
        if (GP.fx) {
          GP.fx.leak(pic, x);
          // the subject floats in front of its background, drifting slowly (or with the pointer)
          setTimeout(() => { if (!ended && list[i] === x && !f._surf) f._surf = GP.fx.surface(img, x, { auto: true, listen: el, amount: 0.02, ripple: true, tilt: true }); }, pull ? 1300 : 2700);
        }
        const bg = bgs[slot], ob = bgs[1 - slot];
        bg.style.backgroundImage = `url("${h.src(x, 480)}")`;
        bg.classList.add("on"); ob.classList.remove("on");
        caption(x); progress(); schedule(); sing(x);
        // the old photograph's depth goes once it has faded
        setTimeout(() => { if (other._surf && !other.classList.contains("on")) { other._surf.destroy(); other._surf = null; } }, 1700);
      };
      if (img.complete && img.naturalWidth) reveal(); else { img.onload = reveal; img.onerror = reveal; }
      slot = 1 - slot;
      const pre = new Image(); pre.src = h.src(list[(i + 1) % list.length], W);
    }
    const onResize = () => figs.forEach((f) => { const k = f.classList.contains("on") ? i : -1; if (k >= 0) fitPic(f, list[k]); });
    addEventListener("resize", onResize);
    function wake() {
      el.classList.remove("idle", "idle-soon");
      clearTimeout(idleT);
      idleT = setTimeout(() => el.classList.add("idle"), 2600);
    }
    function togglePause() { paused = !paused; paintPlay(); const bar = $(".ex2-progress i"); bar.style.animationPlayState = paused ? "paused" : "running"; if (paused) clearTimeout(timer); else show(i + 1); }
    function setSpeed(s) { speed = s; store.set("gp-ex-speed", String(s)); paintSpeed(); progress(); schedule(); }
    function fs() {
      if (document.fullscreenElement) { userFs = true; document.exitFullscreen().catch(() => {}); }
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }
    function openViewer() {
      const x = list[i];
      end();
      GP.app.openList(list, i, null);
      void x;
    }
    function end() {
      if (ended) return;
      ended = true;
      clearTimeout(timer); clearTimeout(idleT);
      removeEventListener("resize", onResize);
      figs.forEach((f) => { if (f._surf) { f._surf.destroy(); f._surf = null; } if (f._cam) f._cam.cancel(); });
      if (GP.tint) GP.tint.restore();
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("fullscreenchange", fsc);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      if (calls && GP.calls.state.playing) GP.calls.pause(true);
      el.classList.add("out");
      setTimeout(() => el.remove(), reduced() ? 0 : 320);
      document.documentElement.style.overflow = prevOverflow;
      if (opener && opener.focus && document.contains(opener)) opener.focus({ preventScroll: true });
      current = null;
    }
    const key = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === "Escape") end();
      else if (k === "ArrowRight") show(i + 1);
      else if (k === "ArrowLeft") show(i - 1);
      else if (k === " " || k === "k") togglePause();
      else if (k === "f" || k === "F") fs();
      else if (k === "n" || k === "N") { notes = !notes; store.set("gp-ex-notes", notes ? "1" : "0"); paintNotes(); onResize(); }
      else if ((k === "s" || k === "S") && calls) { GP.calls.toggle(); paintSound(); sing(list[i]); }
      else if (k === "i" || k === "I" || k === "Enter") openViewer();
      else return;
      e.preventDefault(); e.stopPropagation(); wake();
    };
    const fsc = () => { if (!document.fullscreenElement && el.dataset.fs && !userFs) end(); userFs = false; if (document.fullscreenElement) el.dataset.fs = "1"; };
    el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-x], [data-speed]");
      wake();
      if (!b) { if (e.target.closest(".ex2-stage") && matchMedia("(pointer: fine)").matches) show(i + 1); return; }
      if (b.dataset.speed) { setSpeed(+b.dataset.speed); return; }
      const x = b.dataset.x;
      if (x === "close") end();
      else if (x === "prev") show(i - 1);
      else if (x === "next") show(i + 1);
      else if (x === "toggle") togglePause();
      else if (x === "fs") fs();
      else if (x === "open") openViewer();
      else if (x === "notes") { notes = !notes; store.set("gp-ex-notes", notes ? "1" : "0"); paintNotes(); onResize(); }
      else if (x === "sound") { GP.calls.toggle(); paintSound(); sing(list[i]); }
    });
    el.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") wake(); }, { passive: true });
    // touch: swipe to move, tap to show or hide the controls
    let sx = null, sy = null;
    el.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    el.addEventListener("touchend", (e) => {
      if (sx == null) return;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(i + (dx < 0 ? 1 : -1));
      else if (Math.abs(dy) > 90 && dy > 0) end();
      else if (!e.target.closest("button")) { if (el.classList.contains("idle")) wake(); else el.classList.add("idle"); }
    }, { passive: true });
    document.addEventListener("keydown", key, true);
    document.addEventListener("fullscreenchange", fsc);
    if (o.fullscreen !== false && el.requestFullscreen && matchMedia("(pointer: fine)").matches) el.requestFullscreen().then(() => { el.dataset.fs = "1"; }).catch(() => {});
    el.focus({ preventScroll: true });
    requestAnimationFrame(() => el.classList.add("open"));
    wake();
    show(o.start || 0);
    current = { end, get index() { return i; } };
  };
  GP.exhibitState = () => current;

  (GP.views = GP.views || []).push({ id: "rooms", label: "Exhibitions", navAfter: "gallery", render });
})(window.GP = window.GP || {});
