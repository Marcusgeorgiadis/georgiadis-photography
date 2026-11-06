/* Georgiadis Photography: one search for everything. The header's search (or /, or Ctrl/Cmd+K)
   opens a panel that answers as you type: species, outings, exhibitions, photographs (with the
   words it understood, as on the Gallery) and the pages of the site, best matches first. Arrow
   keys move through the answers, Enter opens one, Esc (or Back on a phone) closes the panel. */
(function (GP) {
  "use strict";
  const S = { el: null, input: null, list: null, open: false, pushed: false, idx: null, t: 0, act: -1, opener: null };
  const app = () => GP.app;
  const H = () => GP.app.helpers;
  const $ = (s, r = document) => r.querySelector(s);
  const RECENT = "gp-recent-search";
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(RECENT) || "[]"); } catch (e) { return []; } },
    add(q) { try { const l = [q, ...store.get().filter((x) => x !== q)].slice(0, 5); localStorage.setItem(RECENT, JSON.stringify(l)); } catch (e) { /* private window */ } },
  };
  // lower case, no accents or punctuation: "Blue-gray Gnatcatcher" and "blue gray gnatcatcher" meet
  const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9★+ ]+/g, " ").replace(/\s+/g, " ").trim();

  /* ---------- what can be found ---------- */
  function pages() {
    const has = (id) => app().views && app().views.some((v) => v.id === id);
    const m = app().model, w = !!app().workshop;
    const calls = GP.calls && m.species.some((s) => s.call);
    return [
      ["Gallery", "#/gallery", "Every photograph, by month", "photographs photos all grid"],
      has("universe") && ["The Universe", "#/universe", "Every photograph on one canvas", "colour wheel canvas"],
      has("rooms") && ["Exhibitions", "#/rooms", "Rooms of the archive", "rooms walls"],
      ["Species", "#/species", "The field guide, by family", "guide birds animals families"],
      GP.cabinet && ["The cabinet", "#/species?view=cabinet", "A drawer for every family", "specimens drawers"],
      ["The life list", "#/species?view=life", "Every species in the order first photographed", "tree of life lifers"],
      ["The tree of life", "#/species?view=tree", "The life list as a tree", "taxonomy classes orders"],
      ["Species A–Z", "#/species?view=az", "Every species by name", "alphabetical"],
      calls && ["Bird calls", "#/species?view=calls", "Every species with a recorded call", "sounds songs audio"],
      calls && has("day") && ["A day in the marsh", "#/day", "Twenty-four hours of calls in a minute", "dawn chorus sounds"],
      has("sky") && ["The night sky", "#/sky", "The life list as constellations", "stars"],
      has("plates") && ["Natural-history plates", "#/plates", "A printable plate for every family", "print prints"],
      ["Outings", "#/outings", "Every outing, newest first", "trips days diary chapters"],
      ["The field notebook", "#/outings?view=notebook", "A page for every month", "journal diary months"],
      ["Outings in numbers", "#/outings?view=numbers", "Charts and records", "statistics stats charts records"],
      !w && ["Your favourites", "#/rooms/favourites", "Photographs you have saved", "hearts saved liked"],
      has("newsletter") && ["Dispatches by email", "#/newsletter", "A note whenever a new outing goes up", "newsletter subscribe email"],
      has("workshop") && ["Workshop", "#/workshop", "Sort, fix and choose", "darkroom sort"],
      has("publish") && ["Publish", "#/publish", "The public site", "settings site"],
    ].filter(Boolean);
  }
  function index() {
    const m = app().model;
    if (S.idx && S.idx.m === m) return S.idx;
    const h = H();
    const spName = (k) => (m.speciesByKey.get(k) || {}).name || "";
    S.idx = {
      m,
      species: m.species.map((s) => ({ s, name: norm(s.name), alt: norm([s.bin, s.sci, s.famName, s.family, s.order].join(" ")), pop: s.photos.length })),
      outings: m.outings.filter((o) => o.photos.length).map((o) => ({ o, name: norm([o.title, h.fmtDate(o.date), h.fmtShort(o.date)].join(" ")), alt: norm([o.type, o.note, o.species.map((e) => spName(e.key)).join(" ")].join(" ")), pop: o.photos.length })),
      rooms: (m.rooms || []).filter((r) => r.photos && r.photos.length).map((r) => ({ r, name: norm(r.title), alt: norm(r.sub), pop: r.photos.length })),
      pages: pages().map((p) => ({ p, name: norm(p[0]), alt: norm(p[2] + " " + p[3]), pop: 0 })),
    };
    return S.idx;
  }
  // Every word has to begin a word of the entry (its name counts most); a whole name, or a name
  // that starts with what was typed, counts more still.
  function score(words, q, e) {
    const nw = e.name.split(" "), aw = e.alt.split(" ");
    let sc = 0;
    for (const w of words) {
      if (nw.includes(w)) sc += 3;
      else if (nw.some((n) => n.startsWith(w))) sc += 2;
      else if (aw.some((n) => n.startsWith(w))) sc += 1;
      else return 0;
    }
    const bare = e.name.replace(/^the /, "");
    if (e.name === q || bare === q) sc += 8;
    else if (e.name.startsWith(q) || bare.startsWith(q)) sc += 2;
    return sc;
  }
  function find(list, words, q, n) {
    return list.map((e) => ({ e, sc: score(words, q, e), exact: e.name === q || e.name.replace(/^the /, "") === q })).filter((r) => r.sc > 0)
      .sort((a, b) => b.sc - a.sc || b.e.pop - a.e.pop).slice(0, n);
  }
  // Which kind of answer leads: one named exactly; then photographs when the words asked for
  // qualities of a photograph (a light, what a bird is doing, a colour, a month...); then species,
  // photographs, outings, exhibitions and pages, in that order.
  const BASE = { species: 5, photos: 4, outings: 3, rooms: 3.2, pages: 2 };
  const QUALITIES = new Set(["light", "behaviour", "colour", "rating", "month", "season", "year", "group"]);
  const rankOf = (kind, found) => BASE[kind] + (found && found[0] && found[0].exact ? 10 : 0);

  /* ---------- the panel ---------- */
  function build() {
    if (S.el) return;
    const el = document.createElement("div");
    el.className = "gs";
    el.hidden = true;
    el.innerHTML = `<div class="gs-box" role="dialog" aria-modal="true" aria-label="Search the archive">
  <div class="gs-in">${H().ICON.search}<input type="search" autocomplete="off" spellcheck="false" enterkeyhint="go" role="combobox" aria-expanded="true" aria-controls="gs-list" aria-autocomplete="list" placeholder="Search species, outings, exhibitions, photographs"><button type="button" class="gs-x" data-gs="close">Cancel</button></div>
  <div class="gs-list" id="gs-list" role="listbox" aria-label="Results"></div>
  <div class="gs-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
</div>`;
    document.body.appendChild(el);
    S.el = el;
    S.input = $("input", el);
    S.list = $(".gs-list", el);
    S.input.addEventListener("input", () => { clearTimeout(S.t); S.t = setTimeout(render, 70); });
    S.input.addEventListener("keydown", onKey);
    el.addEventListener("click", (e) => {
      if (e.target === el || e.target.closest('[data-gs="close"]')) { close(); return; }
      const fill = e.target.closest("[data-fill]");
      if (fill) { S.input.value = fill.dataset.fill; render(); S.input.focus(); return; }
      const a = e.target.closest("a[href]");
      if (a && el.contains(a)) { e.preventDefault(); go(a); }
    });
    addEventListener("popstate", () => { if (S.open) close({ fromPop: true }); });
  }
  function open(q) {
    if (GP.viewer && GP.viewer.isOpen()) return;
    build();
    if (S.open) { S.input.focus(); return; }
    S.open = true;
    S.opener = document.activeElement;
    S.el.hidden = false;
    document.documentElement.classList.add("gp-searching");
    // Back (a phone's above all) closes the panel rather than leaving the page
    try { history.pushState({ gpSearch: 1 }, "", location.href); S.pushed = true; } catch (e) { S.pushed = false; }
    S.input.value = q || "";
    S.input.placeholder = innerWidth <= 640 ? "Search the archive" : "Search species, outings, exhibitions, photographs";
    render();
    requestAnimationFrame(() => { S.input.focus(); if (q) S.input.select(); });
  }
  function close(o = {}) {
    if (!S.open) return;
    S.open = false;
    S.el.hidden = true;
    document.documentElement.classList.remove("gp-searching");
    if (S.pushed && !o.fromPop && !o.nav) history.back();
    S.pushed = false;
    if (!o.nav && S.opener && S.opener.focus) S.opener.focus({ preventScroll: true });
  }
  // Opening an answer takes the panel's own place in the history, so Back returns to the page
  // the search was made from.
  function go(a) {
    const href = a.getAttribute("href"), q = S.input.value.trim();
    if (q) store.add(q);
    const pushed = S.pushed;
    close({ nav: true });
    if (pushed) location.replace(href); else location.hash = href;
  }
  function opts() { return [...S.list.querySelectorAll("[role=option]")]; }
  function paint() {
    opts().forEach((b, i) => b.setAttribute("aria-selected", String(i === S.act)));
    const on = opts()[S.act];
    S.input.setAttribute("aria-activedescendant", on ? on.id : "");
    if (on) on.scrollIntoView({ block: "nearest" });
  }
  function onKey(e) {
    const n = opts().length;
    if (e.key === "ArrowDown") { e.preventDefault(); S.act = Math.min(n - 1, S.act + 1); paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); S.act = Math.max(-1, S.act - 1); paint(); }
    else if (e.key === "Enter") { const t = opts()[Math.max(0, S.act)]; if (t) { e.preventDefault(); go(t); } }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  }

  /* ---------- answers ---------- */
  function render() {
    const h = H(), m = app().model, raw = S.input.value, q = norm(raw), words = q ? q.split(" ") : [];
    S.act = -1;
    if (!words.length) { S.list.innerHTML = idle(); return; }
    const ix = index();
    const groups = [];
    let k = 0;
    const id = () => "gs-o" + k++;
    const row = (href, img, title, sub, n, cls = "") => `<a class="gs-row${cls}" role="option" id="${id()}" aria-selected="false" href="${h.esc(href)}">${img}<span class="gs-t"><b>${title}</b>${sub ? `<i>${sub}</i>` : ""}</span>${n ? `<span class="gs-n">${n}</span>` : ""}</a>`;
    const sp = find(ix.species, words, q, 5);
    if (sp.length) groups.push({ rank: rankOf("species", sp), title: "Species", html: sp.map(({ e: { s } }) => row(`#/species/${s.slug}`, h.cover(s.best, 120), h.esc(s.name), s.bin ? `<span class="bin">${h.esc(s.bin)}</span>` : h.esc(s.famName || ""), h.plural(s.photos.length, "photo"))).join("") });
    const out = find(ix.outings, words, q, 4);
    if (out.length) groups.push({ rank: rankOf("outings", out), title: "Outings", html: out.map(({ e: { o } }) => row(`#/outings/${o.id}`, h.cover(o.cover, 120), h.esc(h.fmtDate(o.date)), h.esc([o.title, o.type].filter(Boolean).join(" · ")), h.plural(o.species.length, "species", "species"))).join("") });
    const rm = find(ix.rooms, words, q, 3);
    if (rm.length) groups.push({ rank: rankOf("rooms", rm), title: "Exhibitions", html: rm.map(({ e: { r } }) => row(`#/rooms/${r.id}`, h.cover(r.cover || r.photos[0], 120), h.esc(r.title), h.esc(r.sub || ""), h.plural(r.photos.length, "photo"))).join("") });
    // photographs: the Gallery's own reading of the words ("herons in flight" is a family and a behaviour)
    const pq = GP.model.parseQuery(raw, m);
    if (!pq.empty) {
      const list = (m.heroes || m.photos).filter(pq.test);
      if (list.length) {
        const understood = pq.terms.some((t) => t.kind !== "text");
        const best = list.slice().sort((a, b) => b.score - a.score).slice(0, 6);
        const href = app().hashFor(["gallery"], new URLSearchParams({ q: raw.trim() }));
        groups.push({ rank: BASE.photos + (pq.terms.some((t) => QUALITIES.has(t.kind)) ? 3 : 0), title: "Photographs", html: `<a class="gs-photos" role="option" id="${id()}" aria-selected="false" href="${h.esc(href)}"><span class="gs-p-h"><b>${h.plural(list.length, "photograph")}</b>${understood ? `<span class="gs-chips">${pq.terms.map((t) => `<span class="chip" aria-pressed="true">${h.esc(t.label)}</span>`).join("")}</span>` : ""}<span class="gs-go">In the Gallery ${h.ICON.arrow}</span></span><span class="gs-strip">${best.map((x) => `<span>${h.cover(x, 240, "", "")}</span>`).join("")}</span></a>` });
      }
    }
    const pg = find(ix.pages, words, q, 4);
    if (pg.length) groups.push({ rank: rankOf("pages", pg), title: "Go to", html: pg.map(({ e: { p } }) => row(p[1], `<span class="gs-ic">${h.ICON.arrow}</span>`, h.esc(p[0]), h.esc(p[2]), "", " gs-page")).join("") });
    if (!groups.length) {
      S.list.innerHTML = `<div class="gs-none"><p>Nothing in the archive answers to “${h.esc(raw.trim())}”.</p>${tryChips()}</div>`;
      return;
    }
    // re-number the options in the order they now appear
    groups.sort((a, b) => b.rank - a.rank);
    S.list.innerHTML = groups.map((g, i) => `<section class="gs-g" role="group" aria-labelledby="gs-g${i}"><h3 id="gs-g${i}">${g.title}</h3>${g.html}</section>`).join("");
    opts().forEach((o, i) => { o.id = "gs-o" + i; });
  }
  function tryChips() {
    const m = app().model, h = H();
    const top = m.species.filter((s) => s.lifeNo).sort((a, b) => b.photos.length - a.photos.length)[0];
    const last = m.outings[m.outings.length - 1];
    const tries = [top && top.name, "in flight", "golden hour", last && GP.model.MONTHS[+last.date.slice(5, 7) - 1] + " " + last.date.slice(0, 4), "night sky"].filter(Boolean);
    return `<div class="gs-try"><span class="sc">Try</span>${tries.map((t) => `<button type="button" class="chip" data-fill="${h.esc(t)}">${h.esc(t)}</button>`).join("")}</div>`;
  }
  function idle() {
    const h = H(), rec = store.get();
    return `<div class="gs-idle">${rec.length ? `<div class="gs-try"><span class="sc">Recent</span>${rec.map((t) => `<button type="button" class="chip" data-fill="${h.esc(t)}">${h.esc(t)}</button>`).join("")}</div>` : ""}${tryChips()}<p class="gs-hint">A species, a family, a place in the day (“golden hour”), what a bird is doing (“in flight”), a month, an outing, an exhibition, or a page of the site.</p></div>`;
  }

  GP.search = { open, close, isOpen: () => S.open };
})(window.GP = window.GP || {});
