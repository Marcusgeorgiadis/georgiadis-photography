/* Georgiadis Photography: shell, router and views shared by the public site and the Workshop.
   GP.app.start({ root, raw, adapter, site, workshop }) renders the whole gallery into root.
   adapter.src(photo, width) gives an image URL; adapter.full(photo) and adapter.download(photo)
   give the original (either may return a Promise or null). */
(function (GP) {
  "use strict";
  const M = GP.model;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
  };

  /* ---------- formatting ---------- */
  const MONTHS = M.MONTHS, MON = M.MON;
  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function ymd(iso) { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(iso || "")); return m ? [+m[1], +m[2], +m[3]] : null; }
  function fmtDate(iso) { const d = ymd(iso); return d ? `${d[2]} ${MONTHS[d[1] - 1]} ${d[0]}` : ""; }
  function fmtShort(iso) { const d = ymd(iso); return d ? `${d[2]} ${MON[d[1] - 1]} ${d[0]}` : ""; }
  function weekday(iso) { const d = ymd(iso); return d ? WEEKDAYS[new Date(Date.UTC(d[0], d[1] - 1, d[2])).getUTCDay()] : ""; }
  function fmtTime(x) { return x.hasTime ? `${String(x.cap.hh).padStart(2, "0")}:${String(x.cap.mi).padStart(2, "0")}` : ""; }
  const fmtN = (n) => Number(n || 0).toLocaleString("en-GB");
  const plural = (n, one, many) => `${fmtN(n)} ${n === 1 ? one : many || one + "s"}`;
  function titleOf(x) {
    if (x.common) return x.common;
    if (x.group === "pending") return "Recently added";
    const s = String(x.setting || x.caption || "").replace(/\.$/, "");
    if (!s) return "Between sightings";
    const t = s.length > 44 ? s.slice(0, 44).replace(/\s+\S*$/, "") + "…" : s;
    return t[0].toUpperCase() + t.slice(1);
  }
  function exposure(x) {
    const e = x.exif, a = [];
    if (e.f) a.push(`f/${+(+e.f).toFixed(1)}`);
    if (e.ss) a.push(M.shutter(e.ss));
    if (e.iso) a.push(`ISO ${e.iso}`);
    return a.join(" · ");
  }

  /* ---------- icons ---------- */
  const I = (d, extra = "") => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const ICON = {
    search: I('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
    play: I('<path d="M7 5.5v13l11-6.5z"/>'),
    sun: I('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>'),
    moon: I('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/>'),
    download: I('<path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14"/>'),
    share: I('<path d="M12 15V4m0 0L8 8m4-4 4 4M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/>'),
    zoom: I('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5M11 8.5v5"/>'),
    expand: I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
    left: I('<path d="m15 5-7 7 7 7"/>'),
    right: I('<path d="m9 5 7 7-7 7"/>'),
    arrow: I('<path d="M5 12h14m-5-5 5 5-5 5"/>'),
    keys: I('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/>'),
  };

  /* ---------- state ---------- */
  const A = { model: null, adapter: null, site: {}, workshop: null, ctx: new Map(), ctxN: 0, sel: new Set(), selecting: false, lastKey: "", timers: [], views: [] };
  const BUCKETS = [360, 540, 720, 960, 1280, 1600, 2048, 2560];
  const bucket = (px) => BUCKETS.find((b) => b >= px) || BUCKETS[BUCKETS.length - 1];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function src(x, w) {
    if (!x) return "";
    try { return A.adapter.src(x, bucket(w)) || ""; } catch (e) { return ""; }
  }
  function rowH() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rowh")) || 240; }
  function regCtx(list) { const k = "c" + ++A.ctxN; A.ctx.set(k, list); return k; }

  /* ---------- components ---------- */
  function tile(x, o = {}) {
    const b = x.burst, stack = o.stacks !== false && b && b.size > 1;
    const w = rowH() * x.ar * dpr() * 1.1;
    const lq = x.lq ? `<span class="lq" style="background-image:url(${x.lq})"></span>` : `<span class="lq" style="background:${esc(x.pal[0] || "")}"></span>`;
    const sel = A.selecting ? `<span class="tick" aria-hidden="true">✓</span>` : "";
    const bt = o.badge ? o.badge(x) : A.workshop && A.workshop.badge ? A.workshop.badge(x) : "";
    const badge = bt ? `<span class="badge">${esc(bt)}</span>` : "";
    const scrub = stack ? `<span class="stack">${b.size}</span><span class="scrub">${b.frames.map((f) => `<i${f === x ? ' class="on"' : ""}></i>`).join("")}</span>` : "";
    const sub = [fmtShort(x.t), x.light].filter(Boolean).join(" · ");
    return `<button class="tile${stack ? " burst" : ""}${A.sel.has(x.id) ? " sel" : ""}" data-id="${esc(x.id)}" style="--ar:${x.ar.toFixed(3)}" aria-label="${esc(titleOf(x) + ", " + fmtDate(x.t))}">${lq}<img src="${esc(src(x, w))}" alt="" loading="lazy" decoding="async" draggable="false"><span class="cap"><b>${esc(titleOf(x))}</b><span>${esc(sub)}</span></span>${badge}${scrub}${sel}</button>`;
  }
  function flow(list, o = {}) {
    const k = regCtx(list);
    return `<div class="flow" data-ctx="${k}">${list.map((x) => tile(x, o)).join("")}</div>`;
  }
  function cover(x, w, cls = "", alt = "") {
    if (!x) return `<span class="ph"></span>`;
    const pos = `object-position:${(x.fp[0] * 100).toFixed(1)}% ${(x.fp[1] * 100).toFixed(1)}%`;
    return `<img class="${cls}" src="${esc(src(x, w))}" alt="${esc(alt)}" loading="lazy" decoding="async" style="${pos};background:${esc(x.pal[0] || "transparent")}">`;
  }
  function specimenTag(x, opts = {}) {
    const rows = [];
    const add = (k, v, cls = "") => { if (v) rows.push(`<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ""}>${v}</dd>`); };
    if (x.common) add("Species", esc(x.common) + (x.unsure ? ` <span class="sc">probable</span>` : ""), "serif");
    if (x.sci) add("Binomial", esc(x.sci), "it");
    if (x.famName) add("Family", esc(x.famName));
    add("Date", esc(fmtDate(x.t)));
    if (x.hasTime) add("Time", esc(fmtTime(x) + (x.light ? " · " + x.light : "")));
    if (!opts.short) {
      add("Outing", `<a href="#/outings/${esc(x.fid)}">${esc(x.outing)}</a>`);
      if (x.sexAge) add("Sex · age", esc(x.sexAge));
      if (x.behavior) add("Behaviour", esc(x.behavior));
      if (x.exif.cam) add("Camera", esc(x.exif.cam));
      if (x.exif.lens) add("Lens", esc(x.exif.lens + (x.exif.fl ? ` @ ${Math.round(x.exif.fl)} mm` : "")));
      add("Exposure", esc(exposure(x)));
      add("Frame", esc(`${x.name.replace(/\.[a-z0-9]+$/i, "")} · ${x.W} × ${x.H}`));
    }
    return `<div class="tag"><div class="tag-head"><span>${esc(opts.short ? "Collection" : A.site.title || "Georgiadis Photography")}</span><span>No. ${String(x.no || 0).padStart(4, "0")}</span></div><dl class="tag-body">${rows.join("")}</dl></div>`;
  }
  function chip(label, attrs = "", pressed = null, n = null) {
    return `<button class="chip" ${attrs}${pressed == null ? "" : ` aria-pressed="${pressed}"`}>${label}${n == null ? "" : ` <span class="n">${fmtN(n)}</span>`}</button>`;
  }
  function spCard(s) {
    const flag = s.captive ? "Captive" : s.domestic ? "Domestic" : s.review ? "Rare here" : s.uncertain ? "Uncertain" : "";
    return `<a class="sp-card" href="#/species/${esc(s.slug)}"><div class="cv">${cover(s.best, 520, "", s.name)}${flag ? `<span class="badge flag">${flag}</span>` : ""}</div><h3>${esc(s.name)}</h3>${s.bin ? `<div class="binomial">${esc(s.bin)}</div>` : ""}<div class="meta">${plural(s.photos.length, "photograph")} · ${plural(s.outingN, "outing")} · since ${esc(fmtShort(s.first))}</div></a>`;
  }
  function chapterRow(o) {
    const d = ymd(o.date) || [0, 1, 1];
    return `<a class="chapter-row reveal" href="#/outings/${esc(o.id)}"><div class="when"><b>${d[2]}</b><span>${MON[d[1] - 1]} ${d[0]} · ${esc(weekday(o.date).slice(0, 3))}</span></div><div class="txt"><div class="kicker">Chapter ${o.no} · ${esc(o.type)}</div><h3>${esc(o.title)}</h3>${o.note ? `<p>${esc(o.note)}</p>` : ""}<div class="sc">${plural(o.photos.length, "frame")} · ${plural(o.species.length, "species", "species")}</div></div><div class="cv">${cover(o.cover, 900, "", o.title)}</div></a>`;
  }
  function pageHead(kicker, h1, p, extra = "") {
    return `<header class="page-head reveal">${kicker ? `<div class="kicker">${kicker}</div>` : ""}<h1>${h1}</h1>${p ? `<p>${p}</p>` : ""}${extra}</header>`;
  }

  /* ---------- sharing pages ---------- */
  // Links to a species or an outing; on the public site these are pages with their own link preview.
  function pageUrl(kind, key) {
    const a = A.adapter;
    if (a && a.pageUrl) { const u = a.pageUrl(kind, key); if (u !== undefined) return u; }
    return location.origin + location.pathname + hashFor([kind === "outing" ? "outings" : "species", key]);
  }
  function shareBtn(url, title) {
    return url ? `<button class="btn ghost share-page" data-act="share-page" data-url="${esc(url)}" data-title="${esc(title)}">${ICON.share} Share</button>` : "";
  }
  function sharePage(url, title) {
    if (!url) return;
    const copy = () => {
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Link copied"), () => toast(url));
      else toast(url);
    };
    if (navigator.share && matchMedia("(pointer: coarse)").matches) navigator.share({ title, url }).catch((e) => { if (!e || e.name !== "AbortError") copy(); });
    else copy();
  }

  /* ---------- toast + tooltip ---------- */
  let toastT;
  function toast(msg, action) {
    let t = $("#gp-toast");
    if (!t) { t = document.createElement("div"); t.id = "gp-toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    if (action) { const b = document.createElement("button"); b.textContent = action.label; b.onclick = () => { action.run(); t.classList.remove("on"); }; t.appendChild(b); }
    requestAnimationFrame(() => t.classList.add("on"));
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), action ? 7000 : 3600);
  }
  function tipFor(el, ev) {
    let tip = $("#gp-tip");
    if (!tip) { tip = document.createElement("div"); tip.id = "gp-tip"; tip.className = "gp-tip"; tip.setAttribute("role", "tooltip"); document.body.appendChild(tip); }
    if (!el) { tip.classList.remove("on"); return; }
    tip.replaceChildren();
    const v = document.createElement("b"); v.textContent = el.getAttribute("data-tip-v") || "";
    const l = document.createElement("span"); l.textContent = el.getAttribute("data-tip") || "";
    tip.append(v, l);
    const r = el.getBoundingClientRect();
    const x = ev && ev.clientX != null ? ev.clientX : r.left + r.width / 2, y = ev && ev.clientY != null ? ev.clientY : r.top;
    tip.style.left = Math.min(window.innerWidth - 12, Math.max(12, x)) + "px";
    tip.style.top = y - 12 + "px";
    tip.classList.add("on");
  }

  /* ---------- shell ---------- */
  const NAV = [["", "Exhibition"], ["gallery", "Gallery"], ["outings", "Outings"], ["species", "Species"], ["journal", "Journal"]];
  function shell() {
    const s = A.site;
    // Views that name a neighbour (navAfter) sit beside it, in the order they registered.
    const nav = NAV.slice(), after = new Map();
    for (const v of A.views) {
      if (v.nav === false) continue;
      const at = v.navAfter == null ? -1 : nav.findIndex((n) => n[0] === v.navAfter);
      if (at < 0) { nav.push([v.id, v.label]); continue; }
      const k = (after.get(v.navAfter) || 0) + 1;
      after.set(v.navAfter, k);
      nav.splice(at + k, 0, [v.id, v.label]);
    }
    A.root.innerHTML = `<a class="visually-hidden" href="#gp-main">Skip to content</a>
<header class="gp-head"><div class="wrap">
  <a class="gp-mark" href="#/"><b>${esc(s.title || "Georgiadis Photography")}</b><span>${esc(s.tagline || "Wildlife of Central Florida")}</span></a>
  <nav class="gp-nav" aria-label="Sections">${nav.map(([id, l]) => `<a href="#/${id}" data-nav="${id}">${esc(l)}</a>`).join("")}</nav>
  <div class="gp-tools">
    <button class="icon-btn" data-act="search" title="Search (/)" aria-label="Search">${ICON.search}</button>
    <button class="icon-btn" data-act="exhibit" title="Exhibition mode" aria-label="Start exhibition mode">${ICON.play}</button>
    ${GP.calls && GP.calls.available() ? GP.calls.button() : ""}
    <button class="icon-btn" data-act="theme" title="Light or dark" aria-label="Switch light or dark">${ICON.moon}</button>
    <button class="icon-btn" data-act="keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${ICON.keys}</button>
  </div>
</div></header>
<main id="gp-main" tabindex="-1"></main>
<footer class="foot"><div class="wrap"><span>© ${new Date().getFullYear()} ${esc(s.title || "Georgiadis Photography")}. ${esc(s.footer || "Every photograph here is a Final from the Nikon archive.")}</span><span class="mono">${A.model.stats.photos ? `${fmtN(A.model.stats.photos)} photographs · updated ${esc(fmtShort(s.updated || A.model.stats.last))}` : ""}</span></div></footer>`;
    themeIcon();
    const head = $(".gp-head", A.root);
    if (head && "ResizeObserver" in window) {
      if (A.headRO) A.headRO.disconnect();
      A.headRO = new ResizeObserver(() => document.documentElement.style.setProperty("--head-h", head.offsetHeight + "px"));
      A.headRO.observe(head);
    }
  }
  function themeIcon() {
    const b = $('[data-act="theme"]', A.root);
    if (!b) return;
    const dark = currentTheme() === "dark";
    b.innerHTML = dark ? ICON.sun : ICON.moon;
    b.setAttribute("aria-label", dark ? "Switch to light" : "Switch to dark");
  }
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.setAttribute("data-theme", next); store.set("gp-theme", next); themeIcon(); };
    if (document.startViewTransition && !reduced()) document.startViewTransition(apply); else apply();
  }

  /* ---------- router ---------- */
  function parseHash() {
    const h = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    const [path, qs] = h.split("?");
    const q = new URLSearchParams(qs || "");
    return { parts: path.split("/").filter(Boolean), q, path };
  }
  function hashFor(parts, q) {
    const qs = q && [...q].length ? "?" + q.toString() : "";
    return "#/" + parts.map(encodeURIComponent).join("/") + qs;
  }
  function keyOf(r) { const q = new URLSearchParams(r.q); q.delete("p"); return r.path + "?" + q.toString(); }
  function route() {
    const r = parseHash();
    A.r = r;
    const key = keyOf(r);
    const p = r.q.get("p");
    if (key === A.lastKey) { // only the open photo changed (back/forward through the viewer)
      if (p && GP.viewer) { if (!GP.viewer.isOpen() || GP.viewer.current() !== p) openById(p); }
      else if (GP.viewer && GP.viewer.isOpen()) GP.viewer.close({ fromRoute: true });
      return;
    }
    A.lastKey = key;
    if (GP.viewer && GP.viewer.isOpen()) GP.viewer.close({ fromRoute: true, instant: true });
    render(r);
    if (p) openById(p);
  }
  function setQuery(fn, push = false) {
    const r = parseHash();
    fn(r.q);
    const h = hashFor(r.parts, r.q);
    A.lastKey = keyOf({ path: r.parts.join("/"), q: r.q });
    history[push ? "pushState" : "replaceState"](null, "", h);
    A.r = parseHash();
  }
  function clearTimers() { A.timers.forEach((t) => clearInterval(t)); A.timers = []; if (A.io) A.io.disconnect(); }

  function render(r) {
    clearTimers();
    // Listeners a view adds to the page live only until the next view replaces it.
    if (A.viewAC) A.viewAC.abort();
    A.viewAC = new AbortController();
    const signal = A.viewAC.signal;
    A.ctx.clear();
    const main = $("#gp-main");
    const [v, a, b] = r.parts;
    $$(".gp-nav a").forEach((n) => n.toggleAttribute("aria-current", false));
    const navEl = $(`.gp-nav a[data-nav="${v || ""}"]`) || (v === "rooms" ? $('.gp-nav a[data-nav=""]') : null);
    if (navEl) navEl.setAttribute("aria-current", "page");
    let html = "", after = null, title = "", full = false;
    const ext = A.views.find((x) => x.id === v);
    try {
      if (ext) { const res = ext.render({ parts: r.parts, q: r.q, model: A.model, h: helpers, signal }); html = typeof res === "string" ? res : res.html; after = res.after; title = res.title || ext.label; full = !!res.full; }
      else if (!v) ({ html, after, title } = viewHome());
      else if (v === "gallery") ({ html, after, title } = viewGallery(r.q));
      else if (v === "rooms" && a) ({ html, after, title } = viewRoom(a));
      else if (v === "outings" && a) ({ html, after, title } = viewOuting(a));
      else if (v === "outings") ({ html, after, title } = viewOutings());
      else if (v === "species" && a) ({ html, after, title } = viewSpecies(a));
      else if (v === "species") ({ html, after, title } = viewSpeciesIndex(r.q));
      else if (v === "journal") ({ html, after, title } = viewJournal());
      else if (v === "photo" && a) { location.replace(hashFor(["gallery"], new URLSearchParams({ p: a }))); return; }
      else ({ html, after, title } = viewMissing());
    } catch (e) {
      console.error(e);
      html = `<div class="wrap"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p></div></div>`;
    }
    void b;
    main.innerHTML = html;
    document.documentElement.classList.toggle("gp-full", full);
    document.title = (title ? title + " · " : "") + (A.site.title || "Georgiadis Photography");
    if (!A.keepScroll) window.scrollTo(0, 0);
    A.keepScroll = false;
    markLoaded(main);
    if (after) try { after(main, signal); } catch (e) { console.error(e); }
    observeReveal(main);
  }
  function markLoaded(root) {
    for (const img of root.querySelectorAll("img")) if (img.complete && img.naturalWidth) img.classList.add("in");
  }
  function observeReveal(root) {
    if (!("IntersectionObserver" in window)) return;
    A.io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) {
        A.io.unobserve(e.target);
        if (e.target.matches("[data-count]")) countUp(e.target);
      }
    }, { rootMargin: "0px 0px -10% 0px" });
    $$("[data-count]", root).forEach((el) => A.io.observe(el));
  }
  function countUp(el) {
    const to = +el.getAttribute("data-count");
    if (reduced() || !to) { el.textContent = fmtN(to); return; }
    const t0 = performance.now(), d = 1300;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 4);
      el.textContent = fmtN(Math.round(to * e));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- home: the exhibition ---------- */
  function viewHome() {
    const m = A.model, s = A.site, st = m.stats;
    const open = m.opening.length ? m.opening : m.heroes.slice(0, 5);
    const y0 = (st.first || "").slice(0, 4), y1 = (st.last || "").slice(0, 4);
    const slides = open.map((x, i) => `<div class="slide${i ? "" : " on"}" data-i="${i}"><img src="${esc(src(x, Math.max(window.innerWidth, 1200) * dpr()))}" alt="${esc(titleOf(x))}" style="object-position:${(x.fp[0] * 100).toFixed(1)}% ${(x.fp[1] * 100).toFixed(1)}%;--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%"${i ? ' loading="lazy"' : ' fetchpriority="high"'} data-id="${esc(x.id)}"></div>`).join("");
    const now = (x) => `<em>${esc(titleOf(x))}</em><span>${esc(fmtShort(x.t))}${x.light ? " · " + esc(x.light) : ""}</span>`;
    const rooms = m.rooms.slice(0, 7).map((r) => `<a class="room-card reveal" href="#/rooms/${esc(r.id)}"><div class="cv">${cover(r.cover, 1200, "", r.title)}</div><div><h3>${esc(r.title)}</h3><p>${esc(r.sub)}</p></div><div class="meta">${plural(r.photos.length, "photograph")}</div></a>`).join("");
    const latest = m.outings.slice(-3).reverse();
    const otd = onThisDay();
    const spot = spotlight();
    const html = `
<section class="hero" aria-label="Opening sequence">${slides}
  <div class="hero-copy"><div class="wrap">
    <div class="kicker">${esc(s.kicker || `Wildlife of Central Florida · ${y0 === y1 ? y0 : y0 + "–" + y1}`)}</div>
    <h1>${esc(s.title || "Georgiadis Photography")}</h1>
    <p>${esc(s.intro || `Herons, hawks, otters and alligators, photographed on ${fmtN(st.outings)} outings into Florida's wetlands and woods. ${fmtN(st.photos)} finished photographs of ${fmtN(st.species)} species.`)}</p>
    <div class="now" aria-live="polite"><span class="dots">${open.map((x, i) => `<button aria-label="Show ${esc(titleOf(x))}" data-slide="${i}"${i ? "" : ' class="on"'}></button>`).join("")}</span><span class="now-t">${open[0] ? now(open[0]) : ""}</span></div>
    <div class="cta"><a class="btn primary" href="#/gallery">Enter the gallery ${ICON.arrow}</a><button class="btn" data-act="exhibit">${ICON.play} Exhibition mode</button></div>
  </div></div>
</section>
<div class="wrap page">
  <div class="stats-band reveal">
    <div><b data-count="${st.photos}">${fmtN(st.photos)}</b><span>Photographs</span></div>
    <div><b data-count="${st.species}">${fmtN(st.species)}</b><span>Species</span></div>
    <div><b data-count="${st.outings}">${fmtN(st.outings)}</b><span>Outings</span></div>
    <div><b data-count="${st.families}">${fmtN(st.families)}</b><span>Families</span></div>
  </div>
  <section><div class="sec-h"><h2>Rooms</h2><span class="meta">Themed walls drawn from the archive</span></div><div class="rooms">${rooms}</div>
    ${m.rooms.length > 7 ? `<div class="chips" style="margin-top:22px">${m.rooms.slice(7).map((r) => `<a class="chip" href="#/rooms/${esc(r.id)}">${esc(r.title)} <span class="n">${r.photos.length}</span></a>`).join("")}</div>` : ""}</section>
  ${spot}
  <section class="sec"><div class="sec-h"><h2>Latest outings</h2><a class="meta" href="#/outings">All ${fmtN(st.outings)} outings →</a></div><div class="chapter-list">${latest.map(chapterRow).join("")}</div></section>
  ${otd ? `<section class="sec"><div class="sec-h"><h2>${esc(otd.title)}</h2><span class="meta">${esc(otd.sub)}</span></div>${flow(otd.photos.slice(0, 12))}</section>` : ""}
</div>`;
    const after = (main) => {
      const hero = $(".hero", main);
      if (!hero || open.length < 2) return;
      let i = 0;
      const go = (n) => {
        i = (n + open.length) % open.length;
        $$(".slide", hero).forEach((s, k) => s.classList.toggle("on", k === i));
        $$(".dots button", hero).forEach((b, k) => b.classList.toggle("on", k === i));
        $(".now-t", hero).innerHTML = now(open[i]);
        const nx = $$(".slide img", hero)[(i + 1) % open.length];
        if (nx) nx.loading = "eager";
      };
      hero.addEventListener("click", (e) => {
        const d = e.target.closest("[data-slide]");
        if (d) { go(+d.dataset.slide); restart(); return; }
        const img = e.target.closest(".slide img");
        if (img && !e.target.closest(".hero-copy")) openList(open, i, img);
      });
      let t;
      const restart = () => { clearInterval(t); A.timers = A.timers.filter((x) => x !== t); t = setInterval(() => { if (!document.hidden && !(GP.viewer && GP.viewer.isOpen())) go(i + 1); }, 7000); A.timers.push(t); };
      restart();
    };
    return { html, after, title: "" };
  }
  function onThisDay() {
    const m = A.model, today = new Date();
    const y = today.getFullYear(), mo = today.getMonth() + 1, d = today.getDate();
    const doy = (yy, mm, dd) => Math.round((Date.UTC(2001, mm - 1, dd) - Date.UTC(2001, 0, 1)) / 864e5);
    const t = doy(y, mo, d);
    const near = m.heroes.filter((x) => x.year && x.year < y && Math.abs(doy(x.year, x.month, x.day) - t) <= 3 && x.group !== "scene");
    if (!near.length) return null;
    near.sort((a, b) => b.score - a.score);
    const ys = [...new Set(near.map((x) => x.year))].sort();
    const ago = y - ys[ys.length - 1];
    return { title: "On this day", sub: `This week ${ago === 1 ? "last year" : ago + " years ago"} · ${fmtShort(near[0].t)}`, photos: near };
  }
  function spotlight() {
    const m = A.model;
    const pool = m.life.filter((s) => s.note && s.best && s.photos.length >= 3);
    if (!pool.length) return "";
    const day = Math.floor(Date.now() / 864e5);
    const s = pool[day % pool.length];
    return `<section class="sec spot reveal"><div class="sp-head"><div><div class="kicker">Species of the day · ${esc(s.famName || "")}</div><h2 class="display" style="font-size:clamp(36px,4.5vw,64px);margin:6px 0 4px;line-height:1">${esc(s.name)}</h2><div class="binomial" style="font-size:20px">${esc(s.bin)}</div><p class="lede" style="margin-top:16px">${esc(s.note)}</p><a class="btn" href="#/species/${esc(s.slug)}" style="margin-top:8px">${plural(s.photos.length, "photograph")} ${ICON.arrow}</a></div><button class="sp-hero" data-open="${esc(s.best.id)}" aria-label="Open ${esc(s.name)}">${cover(s.best, 1100, "", s.name)}</button></div></section>`;
  }

  /* ---------- gallery ---------- */
  const GROUPS = [["", "Everything"], ["bird", "Birds"], ["mammal", "Mammals"], ["reptile", "Reptiles"], ["small", "Small lives"], ["scene", "Scenes"]];
  const SORTS = [["new", "Newest first"], ["old", "Oldest first"], ["best", "Highest rated"], ["colour", "By colour"]];
  function hueKey(x) {
    const c = x.hsl.slice(0, 4).sort((a, b) => b[1] * (1 - Math.abs(2 * b[2] - 1)) - a[1] * (1 - Math.abs(2 * a[2] - 1)))[0];
    if (!c) return 999;
    const chroma = c[1] * (1 - Math.abs(2 * c[2] - 1));
    return chroma < 0.08 ? 400 + (1 - c[2]) * 100 : (c[0] + 330) % 360;
  }
  function galleryList(q) {
    const m = A.model, all = q.get("all") === "1";
    const query = q.get("q") || "", g = q.get("g") || "", rmin = +(q.get("r") || 0), sort = q.get("sort") || (query ? "best" : "new");
    const sq = m.search(query);
    let list = (all || !sq.empty ? m.photos : m.heroes).filter((x) => {
      if (g === "small" ? !["insect", "other"].includes(x.group) : g && x.group !== g) return false;
      if (rmin && x.rating < rmin) return false;
      return sq.test(x);
    });
    if (!all && !sq.empty) { // searching: one tile per burst, the best matching frame
      const seen = new Map();
      for (const x of list) { const k = x.burst ? x.burst.id : x.id; const c = seen.get(k); if (!c || x.score > c.score) seen.set(k, x); }
      list = [...seen.values()];
    }
    const byT = (a, b) => a.t.localeCompare(b.t) || (a.frame || 0) - (b.frame || 0);
    if (sort === "old") list.sort(byT);
    else if (sort === "best") list.sort((a, b) => b.score - a.score);
    else if (sort === "colour") list.sort((a, b) => hueKey(a) - hueKey(b));
    else list.sort((a, b) => -byT(a, b));
    return { list, sq, sort, all, g, rmin, query };
  }
  function viewGallery(q) {
    const { list, sq, sort, all, g, rmin, query } = galleryList(q);
    const html = `
<div class="toolbar"><div class="wrap">
  <label class="search">${ICON.search}<span class="visually-hidden">Search</span><input id="gp-q" type="search" autocomplete="off" spellcheck="false" placeholder="Try “herons in flight”, “golden hour”, “otters”, “5 stars October”" value="${esc(query)}"></label>
  <div class="facet-row" role="group" aria-label="Filters">
    ${GROUPS.map(([v, l]) => chip(esc(l), `data-g="${v}"`, g === v)).join("")}
    <span class="lbl">Rating</span>${[0, 3, 4, 5].map((n) => chip(n ? `★ ${n}${n < 5 ? "+" : ""}` : "Any", `data-r="${n}"`, rmin === n)).join("")}
    <span class="lbl">Order</span><select id="gp-sort" aria-label="Order">${SORTS.map(([v, l]) => `<option value="${v}"${sort === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    ${chip("Every frame", 'data-all="1"', all)}
  </div>
</div></div>
<div class="wrap page" style="padding-top:0"><div id="gp-results">${galleryResults(list, sq, sort, all, query)}</div></div>`;
    const after = (main, signal) => {
      const input = $("#gp-q", main);
      let t;
      input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updateGallery((qq) => { if (input.value.trim()) qq.set("q", input.value.trim()); else qq.delete("q"); }), 160); });
      input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { input.value = ""; updateGallery((qq) => qq.delete("q")); e.stopPropagation(); } });
      $("#gp-sort", main).addEventListener("change", (e) => updateGallery((qq) => qq.set("sort", e.target.value)));
      main.addEventListener("click", (e) => {
        const c = e.target.closest(".facet-row .chip, .understood .chip");
        if (!c) return;
        if (c.dataset.g != null) updateGallery((qq) => (c.dataset.g ? qq.set("g", c.dataset.g) : qq.delete("g")));
        else if (c.dataset.r != null) updateGallery((qq) => (+c.dataset.r ? qq.set("r", c.dataset.r) : qq.delete("r")));
        else if (c.dataset.all) updateGallery((qq) => (qq.get("all") === "1" ? qq.delete("all") : qq.set("all", "1")));
        else if (c.dataset.drop != null) {
          const cur = parseHash().q.get("q") || "";
          const now = GP.model.parseQuery(cur, A.model);
          const term = now.terms[+c.dataset.drop];
          if (!term) return;
          const words = String(term.src || "").toLowerCase().split(/\s+/).filter(Boolean);
          // Drop the words this chip was understood from, wherever they sit in the query.
          let rest = " " + cur.toLowerCase().replace(/[^\p{L}\p{N}★+\s.-]/gu, " ").replace(/\s+/g, " ") + " ";
          const at = rest.indexOf(" " + words.join(" ") + " ");
          if (at >= 0) rest = rest.slice(0, at) + " " + rest.slice(at + words.join(" ").length + 2);
          else for (const w of words) rest = rest.replace(" " + w + " ", " ");
          rest = rest.replace(/\s+/g, " ").trim();
          input.value = rest; updateGallery((qq) => (rest ? qq.set("q", rest) : qq.delete("q")));
        }
      }, { signal });
    };
    return { html, after, title: "Gallery" };
  }
  function galleryResults(list, sq, sort, all, query) {
    const understood = sq.terms.length ? `<div class="understood chips" aria-label="Understood as">${sq.terms.map((t, i) => `<button class="chip" data-drop="${i}" title="Remove" aria-pressed="true">${esc(t.label)} ×</button>`).join("")}</div>` : "";
    const head = `<div class="result-line"><span class="count" aria-live="polite">${plural(list.length, all ? "frame" : "photograph")}${query ? "" : all ? "" : " · bursts stacked"}</span>${understood}</div>`;
    if (!list.length) return head + `<div class="empty"><h2>Nothing matches yet</h2><p>Try fewer words, or a species, month, behaviour or colour: “egrets”, “March”, “fishing”, “golden hour”, “red”.</p></div>`;
    if ((sort === "new" || sort === "old") && !query) {
      const groups = [];
      for (const x of list) { const g = groups[groups.length - 1]; if (g && g.fid === x.fid) g.items.push(x); else groups.push({ fid: x.fid, items: [x] }); }
      const k = regCtx(list);
      return head + groups.map((g) => {
        const o = A.model.outingById.get(g.fid);
        return `<section class="sec"><div class="sec-h"><h2><a href="#/outings/${esc(g.fid)}" style="text-decoration:none">${esc(fmtDate(o ? o.date : g.items[0].t))}</a></h2><span class="meta">${esc(o ? o.type : "")} · ${plural(g.items.length, all ? "frame" : "photograph")}${o ? " · " + plural(o.species.length, "species", "species") : ""}</span></div><div class="flow" data-ctx="${k}">${g.items.map((x) => tile(x, { stacks: !all })).join("")}</div></section>`;
      }).join("");
    }
    return head + `<div style="margin-top:14px">${flow(list, { stacks: !all })}</div>`;
  }
  function updateGallery(fn) {
    setQuery(fn);
    const res = $("#gp-results");
    if (!res) return;
    const q = parseHash().q;
    const { list, sq, sort, all, query } = galleryList(q);
    $$(".facet-row [data-g]").forEach((c) => c.setAttribute("aria-pressed", String((q.get("g") || "") === c.dataset.g)));
    $$(".facet-row [data-r]").forEach((c) => c.setAttribute("aria-pressed", String(+(q.get("r") || 0) === +c.dataset.r)));
    $$(".facet-row [data-all]").forEach((c) => c.setAttribute("aria-pressed", String(all)));
    const so = $("#gp-sort"); if (so) so.value = sort;
    flip(res, () => { A.ctx.clear(); res.innerHTML = galleryResults(list, sq, sort, all, query); markLoaded(res); });
  }
  // FLIP: tiles that stay glide to their new places; new ones rise in.
  function flip(container, mutate) {
    if (reduced()) { mutate(); return; }
    const vh = window.innerHeight, before = new Map();
    for (const t of container.querySelectorAll(".tile")) {
      const r = t.getBoundingClientRect();
      if (r.bottom > -200 && r.top < vh + 200) before.set(t.dataset.id, r);
    }
    mutate();
    let n = 0;
    for (const t of container.querySelectorAll(".tile")) {
      const r = t.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const b = before.get(t.dataset.id);
      if (b) {
        const dx = b.left - r.left, dy = b.top - r.top, sx = b.width / r.width, sy = b.height / r.height;
        if (Math.abs(dx) + Math.abs(dy) > 1 || Math.abs(sx - 1) > 0.01) t.animate([{ transform: `translate(${dx}px,${dy}px) scale(${sx},${sy})`, transformOrigin: "0 0" }, { transform: "none", transformOrigin: "0 0" }], { duration: 520, easing: "cubic-bezier(.16,1,.3,1)" });
      } else if (n < 40) {
        t.animate([{ opacity: 0, transform: "translateY(14px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 480, delay: Math.min(n++ * 18, 360), easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      }
    }
  }

  /* ---------- rooms ---------- */
  function viewRoom(id) {
    const r = A.model.rooms.find((x) => x.id === id);
    if (!r) return viewMissing();
    const wall = r.photos.slice(0, 24), rest = r.photos.slice(24);
    const k = regCtx(r.photos);
    const others = A.model.rooms.filter((x) => x !== r);
    const html = `<div class="wrap page" style="padding-bottom:20px">${pageHead(`Room · ${plural(r.photos.length, "photograph")}`, esc(r.title), esc(r.sub))}</div>
<section class="wall" aria-label="${esc(r.title)}"><div class="wall-track" data-ctx="${k}" tabindex="0">${wall.map((x) => `<div class="wall-item"><figure class="tile-like" data-id="${esc(x.id)}" style="--ar:${x.ar.toFixed(3)}">${cover(x, 1600, "", titleOf(x))}</figure>${specimenTag(x, { short: true })}</div>`).join("")}</div>
<div class="wall-nav"><button class="icon-btn" data-wall="-1" aria-label="Previous">${ICON.left}</button><span class="sc wall-pos">1 / ${wall.length}</span><button class="icon-btn" data-wall="1" aria-label="Next">${ICON.right}</button></div></section>
<div class="wrap page">${rest.length ? `<div class="sec-h"><h2>More in this room</h2><span class="meta">${plural(rest.length, "photograph")}</span></div>${flow(rest)}` : ""}
<hr class="rule"><div class="sec-h"><h2>Other rooms</h2></div><div class="chips">${others.map((o) => `<a class="chip" href="#/rooms/${esc(o.id)}">${esc(o.title)} <span class="n">${o.photos.length}</span></a>`).join("")}</div></div>`;
    const after = (main, signal) => {
      const track = $(".wall-track", main), pos = $(".wall-pos", main);
      const items = $$(".wall-item", track);
      const at = () => { const c = track.scrollLeft + track.clientWidth / 2; let best = 0, bd = 1e9; items.forEach((it, i) => { const d = Math.abs(it.offsetLeft + it.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } }); return best; };
      const go = (d) => { const i = Math.max(0, Math.min(items.length - 1, at() + d)); const it = items[i]; track.scrollTo({ left: it.offsetLeft - (track.clientWidth - it.offsetWidth) / 2, behavior: reduced() ? "auto" : "smooth" }); };
      main.addEventListener("click", (e) => { const b = e.target.closest("[data-wall]"); if (b) go(+b.dataset.wall); }, { signal });
      track.addEventListener("scroll", () => { pos.textContent = `${at() + 1} / ${items.length}`; }, { passive: true });
      track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { go(1); e.preventDefault(); } if (e.key === "ArrowLeft") { go(-1); e.preventDefault(); } });
      track.addEventListener("wheel", (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && !e.shiftKey) { track.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    };
    return { html, after, title: r.title };
  }

  /* ---------- outings ---------- */
  function viewOutings() {
    const m = A.model, list = m.outings.slice().reverse();
    let cur = "", body = "";
    for (const o of list) {
      const mk = o.date.slice(0, 7);
      if (mk !== cur) { cur = mk; const d = ymd(o.date); const n = list.filter((x) => x.date.startsWith(mk)).length; body += `<div class="family-h"><h2>${MONTHS[d[1] - 1]} ${d[0]}</h2><span class="n">${plural(n, "outing")}</span></div>`; }
      body += chapterRow(o);
    }
    const st = m.stats;
    return { html: `<div class="wrap page">${pageHead("The field diary", "Outings", `${plural(st.outings, "outing")} between ${esc(fmtDate(st.first))} and ${esc(fmtDate(st.last))}. Each date is a chapter.`)}<div class="chapter-list">${body}</div></div>`, title: "Outings" };
  }
  function viewOuting(id) {
    const m = A.model, o = m.outingById.get(id);
    if (!o) return viewMissing();
    const i = m.outings.indexOf(o), prev = m.outings[i - 1], next = m.outings[i + 1];
    const list = o.photos.filter((x) => x.isHero).sort((a, b) => a.t.localeCompare(b.t));
    const who = o.companions.length > 1 ? ` · with ${o.companions.slice(1).join(", ")}` : "";
    const html = `<section class="chapter-hero">${o.cover ? `<img src="${esc(src(o.cover, Math.max(1400, window.innerWidth) * dpr()))}" alt="" style="object-position:${(o.cover.fp[0] * 100).toFixed(1)}% ${(o.cover.fp[1] * 100).toFixed(1)}%" data-open="${esc(o.cover.id)}">` : ""}<div class="wrap"><div class="sc">Chapter ${o.no} of ${m.outings.length} · ${esc(o.type)}${esc(who)}</div><h1>${esc(fmtDate(o.date))}</h1><div class="sc">${esc(weekday(o.date))} · ${plural(o.photos.length, "frame")} · ${plural(o.species.length, "species", "species")}</div></div></section>
<div class="wrap page">
  <div class="sp-head" style="align-items:start;margin-top:8px"><div>${o.note ? `<p class="lede">${esc(o.note)}</p>` : `<p class="lede">${esc(o.title)}</p>`}${shareBtn(pageUrl("outing", o.id), `${fmtDate(o.date)} · ${A.site.title || "Georgiadis Photography"}`)}</div>
  <div><div class="sc" style="margin-bottom:10px">Species seen</div><div class="chips">${o.species.map((s) => { const sp = m.speciesByKey.get(s.key); return sp ? `<a class="chip" href="#/species/${esc(sp.slug)}">${esc(sp.name)} <span class="n">${s.n}</span></a>` : ""; }).join("")}</div></div></div>
  ${flow(list)}
  <nav class="result-line" style="margin-top:48px" aria-label="Other chapters">${prev ? `<a class="btn" href="#/outings/${esc(prev.id)}">${ICON.left} ${esc(fmtShort(prev.date))}</a>` : "<span></span>"}${next ? `<a class="btn" href="#/outings/${esc(next.id)}">${esc(fmtShort(next.date))} ${ICON.right}</a>` : ""}</nav>
</div>`;
    const after = (main, signal) => {
      const img = $(".chapter-hero img", main);
      if (!img || reduced()) return;
      const onScroll = () => { if (!img.isConnected) { window.removeEventListener("scroll", onScroll); return; } img.style.transform = `translateY(${Math.min(120, window.scrollY * 0.25)}px)`; };
      window.addEventListener("scroll", onScroll, { passive: true, signal });
    };
    return { html, after, title: fmtDate(o.date) };
  }

  /* ---------- species ---------- */
  const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  function viewSpeciesIndex(q) {
    const m = A.model, cab = !!GP.cabinet, mode = q.get("view") || (cab ? "cabinet" : "family");
    const tabs = (cab ? [["cabinet", "Cabinet"]] : []).concat([["family", "By family"], ["life", "Life list"], ["az", "A–Z"]]);
    const head = pageHead("Field guide", "Species", `${plural(m.life.length, "species", "species")} on the life list across ${plural(m.stats.families, "family", "families")}, plus ${fmtN(m.species.length - m.life.length)} more photographed as captive animals or not identified to species.`,
      `<div class="chips" role="tablist">${tabs.map(([v, l], i) => `<a class="chip" role="tab" href="#/species${i ? `?view=${v}` : ""}" aria-pressed="${mode === v}">${l}</a>`).join("")}</div>`);
    let body = "", after = null;
    const wild = m.species.filter((s) => s.lifeNo);
    const rest = m.species.filter((s) => !s.lifeNo);
    if (mode === "cabinet" && cab) {
      body = GP.cabinet.html(m, helpers);
      after = (main, signal) => GP.cabinet.mount(main, signal, m, helpers);
    } else if (mode === "life") {
      const n = m.life.length;
      const ms = MILESTONES.filter((v, i) => v <= n || MILESTONES[i - 1] < n || i === 0).slice(0, 8);
      body = `<div class="milestones" style="margin-bottom:30px">${ms.map((v) => { const s = m.life[v - 1]; return `<div class="milestone${s ? " got" : ""}"><b>${v}</b>${s ? `${esc(s.name)} · ${esc(fmtShort(s.first))}` : `${v - n} to go`}</div>`; }).join("")}</div>
<ol class="life">${m.life.map((s) => `<li><a href="#/species/${esc(s.slug)}"><span class="no mono">${String(s.lifeNo).padStart(3, "0")}</span>${cover(s.best, 160)}<span class="nm"><b>${esc(s.name)}</b><i>${esc(s.bin)}</i></span><span class="fam">${esc(s.famName)}</span><span class="when mono">${esc(fmtShort(s.first))}</span></a></li>`).join("")}</ol>`;
    } else if (mode === "az") {
      body = `<div class="sp-grid">${wild.slice().sort((a, b) => a.name.localeCompare(b.name)).map(spCard).join("")}</div>`;
    } else {
      for (const [, c] of [...m.tree].sort((a, b) => b[1].n - a[1].n)) {
        const fams = [];
        for (const o of c.orders.values()) for (const f of o.families.values()) fams.push(f);
        const shown = fams.map((f) => ({ f, sp: f.species.filter((s) => s.lifeNo) })).filter((x) => x.sp.length).sort((a, b) => b.sp.length - a.sp.length || a.f.common.localeCompare(b.f.common));
        if (!shown.length) continue;
        body += `<h2 class="display" style="font-size:40px;margin:56px 0 0">${esc(c.common)}</h2>`;
        for (const { f, sp } of shown) body += `<div class="family-h"><h2>${esc(f.common)}</h2><span class="binomial">${esc(f.name)}</span><span class="n">${plural(sp.length, "species", "species")}</span></div><div class="sp-grid">${sp.sort((a, b) => b.photos.length - a.photos.length).map(spCard).join("")}</div>`;
      }
    }
    if (mode !== "life" && mode !== "cabinet" && rest.length) body += `<div class="family-h" style="margin-top:72px"><h2>Also photographed</h2><span class="n">Captive, domestic, or not identified to species</span></div><div class="sp-grid">${rest.sort((a, b) => b.photos.length - a.photos.length).map(spCard).join("")}</div>`;
    return { html: `<div class="wrap page">${head}${body}</div>`, after, title: "Species" };
  }
  function viewSpecies(slug) {
    const m = A.model, s = m.speciesBySlug.get(slug);
    if (!s) return viewMissing();
    const months = s.months, mx = Math.max(...months);
    const related = m.species.filter((x) => x !== s && x.family && x.family === s.family && x.lifeNo).slice(0, 8);
    const outs = [...s.outings].map((id) => m.outingById.get(id)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    const flag = s.captive ? "Photographed in captivity." : s.domestic ? "A domestic animal." : s.review ? "Rare or out of range in Florida: this identification deserves a second look." : s.uncertain ? "Identification uncertain." : "";
    const html = `<div class="wrap page">
  <div class="sp-head reveal"><div>
    <div class="kicker">${esc([s.famName, s.order].filter(Boolean).join(" · ") || "Species")}${s.lifeNo ? ` · Life list No. ${s.lifeNo}` : ""}</div>
    <h1>${esc(s.name)}</h1>${s.bin ? `<div class="binomial">${esc(s.bin)}</div>` : ""}
    ${s.note ? `<p class="lede" style="margin-top:20px">${esc(s.note)}</p>` : ""}
    ${flag ? `<p class="sc" style="margin-top:12px;color:var(--warn)">${esc(flag)}</p>` : ""}
    ${GP.calls ? GP.calls.player(s) : ""}
    ${shareBtn(pageUrl("species", s.slug), `${s.name} · ${A.site.title || "Georgiadis Photography"}`)}
  </div><button class="sp-hero" data-open="${esc(s.best.id)}" aria-label="Open the best photograph">${cover(s.best, 1400, "", s.name)}</button></div>
  <div class="stats-band" style="margin-bottom:36px">
    <div><b>${fmtN(s.photos.length)}</b><span>Photographs</span></div>
    <div><b>${fmtN(s.outingN)}</b><span>Outings</span></div>
    <div><b style="font-size:clamp(22px,2.4vw,32px)">${esc(fmtShort(s.first))}</b><span>First seen</span></div>
    <div><b style="font-size:clamp(22px,2.4vw,32px)">${esc(fmtShort(s.last))}</b><span>Last seen</span></div>
  </div>
  <div class="j-grid">
    <div class="j-card"><h2>When</h2><div class="calendar" role="img" aria-label="Photographs by month">${MON.map((mm) => `<span class="m">${mm[0]}</span>`).join("").replace(/^/, "<span></span>")}<span>Photos</span>${months.map((v, i) => `<span class="c${v ? " on" : ""}" data-tip="${MONTHS[i]}" data-tip-v="${plural(v, "photograph")}" tabindex="0" style="${v ? `opacity:${(0.45 + 0.55 * v / mx).toFixed(2)}` : ""}">${v || ""}</span>`).join("")}</div></div>
    <div class="j-card"><h2>Doing</h2>${s.behaviourList.length ? `<div class="chips">${s.behaviourList.slice(0, 8).map(([b, n]) => `<a class="chip" href="${hashFor(["gallery"], new URLSearchParams({ q: s.name + " " + b.toLowerCase() }))}">${esc(b)} <span class="n">${n}</span></a>`).join("")}</div>` : `<p>No behaviour noted yet.</p>`}
      <div class="sc" style="margin-top:8px">Seen on</div><div class="chips">${outs.map((o) => `<a class="chip" href="#/outings/${esc(o.id)}">${esc(fmtShort(o.date))}</a>`).join("")}</div></div>
  </div>
  <div class="sec-h" style="margin-top:48px"><h2>Photographs</h2><span class="meta">Best first · bursts stacked</span></div>
  ${flow(s.heroes)}
  ${related.length ? `<div class="family-h" style="margin-top:64px"><h2>More ${esc(s.famName || "relatives")}</h2></div><div class="sp-grid">${related.map(spCard).join("")}</div>` : ""}
</div>`;
    const after = () => { if (GP.calls) GP.calls.onSpeciesPage(s); };
    return { html, after, title: s.name };
  }

  /* ---------- journal ---------- */
  function svgBars(data, o) {
    // single-series columns: 4px rounded data-ends, square at the baseline, value labels on the extremes only
    const W = o.w || 720, H = o.h || 220, padL = 34, padB = 26, padT = 18;
    const n = data.length, band = (W - padL) / n, bw = Math.min(24, band * 0.62);
    const max = Math.max(1, ...data.map((d) => d.v));
    const step = niceStep(max), top = Math.ceil(max / step) * step;
    const y = (v) => H - padB - (v / top) * (H - padB - padT);
    let g = "";
    for (let t = 0; t <= top; t += step) g += `<line class="axis" x1="${padL}" x2="${W}" y1="${y(t)}" y2="${y(t)}"/><text x="${padL - 6}" y="${y(t) + 3}" text-anchor="end">${t >= 1000 ? t / 1000 + "K" : t}</text>`;
    const iMax = data.findIndex((d) => d.v === max);
    const bars = data.map((d, i) => {
      const x = padL + band * i + (band - bw) / 2, h = Math.max(0, H - padB - y(d.v)), r = Math.min(4, h, bw / 2);
      const path = h ? `M${x},${H - padB} v${-(h - r)} q0,${-r} ${r},${-r} h${bw - 2 * r} q${r},0 ${r},${r} v${h - r} z` : "";
      return `<g class="bar" tabindex="0" data-tip="${esc(d.tip || d.label)}" data-tip-v="${esc(d.tipV || String(d.v))}"><rect x="${padL + band * i}" y="${padT}" width="${band}" height="${H - padT}" fill="transparent"/>${path ? `<path d="${path}" fill="var(--accent)"/>` : ""}${i === iMax ? `<text x="${x + bw / 2}" y="${y(d.v) - 6}" text-anchor="middle" class="val">${fmtN(d.v)}</text>` : ""}<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(d.label)}</text></g>`;
    }).join("");
    return `<svg class="viz" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">${g}${bars}</svg>`;
  }
  function niceStep(max) { const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
  function hbars(rows, aria) {
    const max = Math.max(1, ...rows.map((r) => r[1]));
    return `<div class="hbars" role="img" aria-label="${esc(aria)}">${rows.map(([l, v, href]) => `<${href ? `a href="${esc(href)}"` : "div"} class="hb" tabindex="0" data-tip="${esc(l)}" data-tip-v="${fmtN(v)}"><span class="l">${esc(l)}</span><span class="t"><i style="width:${(100 * v / max).toFixed(1)}%"></i></span><span class="v mono">${fmtN(v)}</span></${href ? "a" : "div"}>`).join("")}</div>`;
  }
  function table(head, rows) {
    return `<details class="gp-table"><summary class="sc">Table</summary><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></details>`;
  }
  function dial(hours, sun) {
    const cx = 160, cy = 160, r0 = 58, r1 = 140, max = Math.max(1, ...hours);
    const pt = (a, r) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const wedge = (i, len) => {
      const gap = 0.012, a0 = (i / 24) * 2 * Math.PI + gap, a1 = ((i + 1) / 24) * 2 * Math.PI - gap, r = r0 + len;
      const [x0, y0] = pt(a0, r0), [x1, y1] = pt(a0, r), [x2, y2] = pt(a1, r), [x3, y3] = pt(a1, r0);
      return `M${x0},${y0} L${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0} z`;
    };
    const arc = (m0, m1, r) => { const a0 = (m0 / 1440) * 2 * Math.PI, a1 = (m1 / 1440) * 2 * Math.PI, [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0},${y0} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1},${y1}`; };
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(Math.round(m % 60)).padStart(2, "0")}`;
    let s = `<circle cx="${cx}" cy="${cy}" r="${r0 - 6}" fill="none" class="axis"/>`;
    s += `<path d="${arc(sun.rise, sun.set, r0 - 14)}" fill="none" stroke="var(--accent)" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`;
    hours.forEach((v, i) => { s += `<path class="bar" tabindex="0" d="${wedge(i, Math.max(1.5, (v / max) * (r1 - r0)))}" fill="var(--accent)" fill-opacity="${v ? 1 : 0.15}" data-tip="${hh(i * 60)}–${hh((i + 1) * 60)}" data-tip-v="${plural(v, "photograph")}"/>`; });
    for (const [h, l] of [[0, "00"], [6, "06"], [12, "12"], [18, "18"]]) { const [x, y] = pt((h / 24) * 2 * Math.PI, r1 + 12); s += `<text x="${x}" y="${y + 3}" text-anchor="middle">${l}</text>`; }
    s += `<text x="${cx}" y="${cy - 4}" text-anchor="middle" class="lbl-sp">daylight</text><text x="${cx}" y="${cy + 12}" text-anchor="middle">${hh(sun.rise)}–${hh(sun.set)}</text>`;
    return `<svg class="viz" viewBox="0 0 320 320" style="max-width:360px;margin:auto" role="img" aria-label="Photographs by hour of the day">${s}</svg>`;
  }
  function viewJournal() {
    const m = A.model, ph = m.photos;
    // months across the archive
    const keys = [];
    if (m.stats.first) {
      let [y, mo] = ymd(m.stats.first); const [y1, mo1] = ymd(m.stats.last);
      while (y < y1 || (y === y1 && mo <= mo1)) { keys.push(`${y}-${String(mo).padStart(2, "0")}`); mo++; if (mo > 12) { mo = 1; y++; } }
    }
    const lifersBy = new Map(); for (const s of m.life) { const k = s.first.slice(0, 7); lifersBy.set(k, (lifersBy.get(k) || 0) + 1); }
    const monthRows = keys.map((k) => {
      const [y, mo] = k.split("-").map(Number);
      const n = ph.filter((x) => x.t.startsWith(k)).length, o = m.outings.filter((x) => x.date.startsWith(k)).length, l = lifersBy.get(k) || 0;
      return { k, label: MON[mo - 1][0] + (mo === 1 || k === keys[0] ? "’" + String(y).slice(2) : ""), v: n, tip: `${MONTHS[mo - 1]} ${y} · ${plural(o, "outing")} · ${plural(l, "new species", "new species")}`, tipV: plural(n, "photograph"), o, l, y, mo };
    });
    const hours = Array(24).fill(0); for (const x of ph) if (x.hasTime) hours[x.cap.hh]++;
    const now = new Date(), sun = M.sunTimes(now.getFullYear(), 6, 21);
    const sunW = M.sunTimes(now.getFullYear(), 12, 21);
    const avgSun = { rise: (sun.rise + sunW.rise) / 2, set: (sun.set + sunW.set) / 2 };
    const lights = ["Blue hour", "Golden hour", "Morning", "Midday", "Afternoon", "Night"].map((l) => [l, ph.filter((x) => x.light === l).length, hashFor(["gallery"], new URLSearchParams({ q: l.toLowerCase() }))]);
    const beh = M.BEHAVIOURS.map(([b]) => [b, ph.filter((x) => x.behaviours.includes(b)).length, hashFor(["gallery"], new URLSearchParams({ q: b.toLowerCase().replace(" & young", "") }))]).filter((r) => r[1]).sort((a, b) => b[1] - a[1]);
    const lens = new Map(); for (const x of ph) if (x.exif.lens) lens.set(x.exif.lens, (lens.get(x.exif.lens) || 0) + 1);
    const fl = []; for (let b = 0; b < 12; b++) fl.push({ v: 0, lo: b * 25 });
    for (const x of ph) if (x.exif.fl) fl[Math.min(11, Math.floor(x.exif.fl / 25))].v++;
    const flRows = fl.map((b) => ({ v: b.v, label: String(b.lo), tip: `${b.lo}–${b.lo + 24} mm`, tipV: plural(b.v, "photograph") }));
    const otd = onThisDay();
    // years
    const years = [...new Set(ph.map((x) => x.year).filter(Boolean))].sort((a, b) => b - a);
    const yearCards = years.map((y) => {
      const yp = m.heroes.filter((x) => x.year === y);
      const lif = m.life.filter((s) => s.first.startsWith(String(y)));
      const sp = new Set(ph.filter((x) => x.year === y && x.spKey).map((x) => x.spKey));
      const best = yp.filter((x) => x.group !== "scene").sort((a, b) => b.score - a.score).slice(0, 8);
      const k = regCtx(best);
      return `<div class="year-card"><div><b class="y">${y}</b><div class="sc" style="margin-top:10px">${plural(ph.filter((x) => x.year === y).length, "photograph")}<br>${plural(m.outings.filter((o) => o.date.startsWith(String(y))).length, "outing")}<br>${plural(sp.size, "species", "species")}</div></div><div style="display:grid;gap:14px"><p class="lede" style="font-size:16px">${lif.length ? `${plural(lif.length, "new species", "new species")} for the life list: ${lif.slice(0, 14).map((s) => `<a href="#/species/${esc(s.slug)}">${esc(s.name)}</a>`).join(", ")}${lif.length > 14 ? ` and ${lif.length - 14} more` : ""}.` : "No new species this year."}</p><div class="mini-flow" data-ctx="${k}">${best.map((x) => `<button data-id="${esc(x.id)}" aria-label="${esc(titleOf(x))}">${cover(x, 300)}</button>`).join("")}</div></div></div>`;
    }).join("");
    const tree = [...m.tree.values()].sort((a, b) => b.n - a.n).map((c) => `<details${c.n > 20 ? " open" : ""}><summary><span class="lvl">Class</span><span class="nm">${esc(c.common)}</span><span class="binomial">${esc(c.name)}</span><span class="cnt">${plural(c.n, "species", "species")}</span></summary>${[...c.orders.values()].sort((a, b) => b.n - a.n).map((o) => `<details><summary><span class="lvl">Order</span><span class="nm">${esc(o.name)}</span><span class="cnt">${o.n}</span></summary>${[...o.families.values()].sort((a, b) => b.n - a.n).map((f) => `<details><summary><span class="lvl">Family</span><span class="nm">${esc(f.common)}</span><span class="binomial">${esc(f.name)}</span><span class="cnt">${f.n}</span></summary><div class="leaves">${f.species.map((s) => `<a class="leaf" href="#/species/${esc(s.slug)}">${cover(s.best, 160)}<span><b>${esc(s.name)}</b><i>${esc(s.bin || "")}</i></span></a>`).join("")}</div></details>`).join("")}</details>`).join("")}</details>`).join("");
    const html = `<div class="wrap page">${pageHead("Journal", "The archive, read closely", "When the photographs were made, in what light, of whom, and with what.")}
<div class="j-grid">
  <section class="j-card wide reveal"><h2>The year in the field</h2><p>Photographs per month. Hover a month for outings and new species.</p><div class="scroll-x">${svgBars(monthRows, { w: Math.max(560, Math.min(1680, (A.root.clientWidth || innerWidth) - 48)), h: 240, aria: "Photographs per month" })}</div>${table(["Month", "Photographs", "Outings", "New species"], monthRows.map((r) => [`${MONTHS[r.mo - 1]} ${r.y}`, r.v, r.o, r.l]))}</section>
  <section class="j-card reveal"><h2>Hours of light</h2><p>Photographs by hour on the camera clock; the inner arc marks typical daylight.</p>${dial(hours, avgSun)}${table(["Hour", "Photographs"], hours.map((v, i) => [`${String(i).padStart(2, "0")}:00`, v]))}</section>
  <section class="j-card reveal"><h2>Light</h2><p>Each frame placed against that day's sunrise and sunset.</p>${hbars(lights, "Photographs by light")}<h2 style="margin-top:18px">Behaviour</h2>${hbars(beh, "Photographs by behaviour")}</section>
  ${otd ? `<section class="j-card wide reveal"><h2>${esc(otd.title)}</h2><p>${esc(otd.sub)}</p>${flow(otd.photos.slice(0, 10))}</section>` : ""}
  <section class="j-card wide reveal"><h2>Years</h2>${yearCards}</section>
  <section class="j-card wide reveal tl-card"><h2>Tree of life</h2><p>${GP.treeOfLife ? "Every species on the life list, by class, order and family. The tree grows in the order they were first photographed; hover a leaf to trace it back to the root." : "Every species in the archive, by class, order and family."}</p>${GP.treeOfLife ? GP.treeOfLife.html(m, helpers) + `<details class="tl-list"><summary class="chip">Every species as a list, including captive and unidentified</summary><div class="tree">${tree}</div></details>` : `<div class="tree">${tree}</div>`}</section>
  <section class="j-card reveal"><h2>Field kit</h2><p>Lenses used, by photograph.</p>${hbars([...lens].sort((a, b) => b[1] - a[1]), "Photographs by lens")}</section>
  <section class="j-card reveal"><h2>Reach</h2><p>Focal length in millimetres. Most of the archive lives at the long end.</p>${svgBars(flRows, { w: Math.max(320, Math.min(820, innerWidth > 900 ? (A.root.clientWidth - 76) / 2 : innerWidth - 48)), h: 200, aria: "Photographs by focal length" })}${table(["Focal length", "Photographs"], flRows.map((r) => [r.tip, r.v]))}</section>
</div></div>`;
    const after = GP.treeOfLife ? (main, signal) => GP.treeOfLife.mount(main, signal, m, helpers) : null;
    return { html, after, title: "Journal" };
  }

  function viewMissing() {
    return { html: `<div class="wrap page"><div class="empty"><h2>Not in the archive</h2><p>That page doesn't exist, or the photograph has been moved.</p><a class="btn" href="#/">Back to the exhibition</a></div></div>`, title: "Not found" };
  }

  /* ---------- opening photos ---------- */
  function openList(list, i, fromEl) { if (GP.viewer) GP.viewer.open(list, i, fromEl); }
  function openById(id) {
    const x = A.model.byId.get(id);
    if (!x) return;
    const ctx = [...A.ctx.values()].find((l) => l.includes(x));
    const list = ctx || [x];
    const el = $(`.tile[data-id="${CSS.escape(id)}"] img`);
    openList(list, Math.max(0, list.indexOf(x)), el);
  }
  function onClick(e) {
    const act = e.target.closest("[data-act]");
    if (act && A.root.contains(act)) {
      const a = act.dataset.act;
      if (a === "theme") toggleTheme();
      else if (a === "exhibit") exhibit();
      else if (a === "search") goSearch();
      else if (a === "keys") showKeys();
      else if (a === "sound" && GP.calls) GP.calls.toggle();
      else if (a === "share-page") sharePage(act.dataset.url, act.dataset.title);
      return;
    }
    const opener = e.target.closest("[data-open]");
    if (opener) { const x = A.model.byId.get(opener.dataset.open); if (x) { const ctx = [...A.ctx.values()].find((l) => l.includes(x)); openList(ctx || [x], ctx ? ctx.indexOf(x) : 0, opener.querySelector("img") || opener); } return; }
    const t = e.target.closest(".tile[data-id], .mini-flow [data-id], .wall-item figure[data-id]");
    if (!t || !A.root.contains(t)) return;
    const id = t.dataset.id;
    if (A.selecting && t.classList.contains("tile")) {
      if (A.sel.has(id)) A.sel.delete(id); else A.sel.add(id);
      t.classList.toggle("sel", A.sel.has(id));
      if (A.workshop && A.workshop.onSelect) A.workshop.onSelect([...A.sel]);
      return;
    }
    const box = t.closest("[data-ctx]");
    const list = (box && A.ctx.get(box.dataset.ctx)) || [A.model.byId.get(id)];
    const x = A.model.byId.get(id);
    openList(list, Math.max(0, list.indexOf(x)), t.querySelector("img"));
  }
  // Burst scrubbing: drag the pointer across a stacked tile to flick through its frames.
  function onScrub(e) {
    const t = e.target.closest && e.target.closest(".tile.burst");
    if (!t || e.pointerType === "touch") return;
    const x = A.model.byId.get(t.dataset.id);
    if (!x || !x.burst) return;
    const r = t.getBoundingClientRect(), fr = x.burst.frames;
    const i = Math.max(0, Math.min(fr.length - 1, Math.floor(((e.clientX - r.left) / r.width) * fr.length)));
    if (t._i === i) return;
    t._i = i;
    const img = t.querySelector("img"), f = fr[i];
    img.src = src(f, rowH() * x.ar * dpr() * 1.1);
    t.querySelectorAll(".scrub i").forEach((el, k) => el.classList.toggle("on", k === i));
    t._frame = f.id;
  }
  function onScrubEnd(e) {
    const t = e.target.closest && e.target.closest(".tile.burst");
    if (!t || t._i == null) return;
    const x = A.model.byId.get(t.dataset.id);
    const hi = x.burst.frames.indexOf(x);
    t._i = null; t._frame = null;
    t.querySelector("img").src = src(x, rowH() * x.ar * dpr() * 1.1);
    t.querySelectorAll(".scrub i").forEach((el, k) => el.classList.toggle("on", k === hi));
  }
  function goSearch() {
    if (!A.r || A.r.parts[0] !== "gallery") location.hash = "#/gallery";
    setTimeout(() => { const q = $("#gp-q"); if (q) { q.focus(); q.select(); } }, 30);
  }
  function exhibit(list) {
    if (!GP.exhibit) return;
    const m = A.model;
    const pick = list || (() => {
      const r = A.r && A.r.parts[0] === "rooms" ? m.rooms.find((x) => x.id === A.r.parts[1]) : null;
      if (r) return r.photos;
      const sp = A.r && A.r.parts[0] === "species" && A.r.parts[1] ? m.speciesBySlug.get(A.r.parts[1]) : null;
      if (sp) return sp.heroes;
      const pool = m.heroes.filter((x) => x.rating >= 4 && x.group !== "scene" && !x.unsure);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      return pool.slice(0, 60);
    })();
    GP.exhibit(pick);
  }
  function showKeys() {
    let d = $("#gp-keys");
    if (!d) {
      d = document.createElement("dialog"); d.id = "gp-keys"; d.className = "gp-keys";
      const rows = [["/", "Search"], ["← →", "Previous or next photograph"], ["↑ ↓", "Frames within a burst"], ["I", "Specimen label"], ["Z", "Zoom to full resolution"], ["0", "Fit to screen"], ["F", "Full screen"], ["D", "Download the original"], ["Shift", "Hold over a photograph for a loupe; scroll to change its power"], ["C", "Play the bird's call (in the viewer)"], ["E", "Exhibition mode"], ["T", "Light or dark"], ["Esc", "Close"]];
      d.innerHTML = `<form method="dialog"><h2 class="display">Keyboard</h2><dl>${rows.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join("")}</dl><button class="btn">Close</button></form>`;
      document.body.appendChild(d);
    }
    d.showModal();
  }
  function onKey(e) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (GP.viewer && GP.viewer.isOpen()) return;
    if ($(".ex")) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
    if (e.key === "/") { e.preventDefault(); goSearch(); }
    else if (e.key === "?") showKeys();
    else if (e.key === "e" || e.key === "E") exhibit();
    else if (e.key === "t" || e.key === "T") toggleTheme();
  }
  let lastY = 0;
  function onScroll() {
    const y = window.scrollY, head = $(".gp-head");
    if (!head) return;
    if (y > 160 && y > lastY + 6) head.classList.add("tucked");
    else if (y < lastY - 6 || y < 80) head.classList.remove("tucked");
    lastY = y;
  }

  /* ---------- start ---------- */
  function start(o) {
    A.root = o.root || document.body;
    A.adapter = o.adapter;
    A.workshop = o.workshop || null;
    A.views = (o.views || []).concat(GP.views || []);
    A.modelOpts = o.model || {};
    A.raw = o.raw;
    A.model = M.build(o.raw, A.modelOpts);
    A.siteOverride = o.site || {};
    A.site = Object.assign({}, A.model.site, A.siteOverride);
    const t = store.get("gp-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    shell();
    if (!A.bound) {
      A.bound = true;
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      document.addEventListener("pointermove", onScrub, { passive: true });
      document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest(".tile.burst") && !e.target.closest(".tile.burst").contains(e.relatedTarget)) onScrubEnd(e); }, { passive: true });
      document.addEventListener("load", (e) => { if (e.target.tagName === "IMG") e.target.classList.add("in"); }, true);
      document.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.classList.add("bad"); }, true);
      document.addEventListener("pointerover", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipFor(el, e); }, { passive: true });
      document.addEventListener("pointermove", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); tipFor(el, e); }, { passive: true });
      document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); tipFor(el, null); });
      document.addEventListener("focusout", () => tipFor(null));
      window.addEventListener("hashchange", route);
      window.addEventListener("scroll", onScroll, { passive: true });
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", themeIcon);
    }
    A.lastKey = "";
    route();
  }
  // Rebuild after the library changes (Workshop edits, a fresh scan); keeps the page and scroll.
  function update(raw) {
    A.raw = raw || A.raw;
    A.model = M.build(A.raw, A.modelOpts);
    A.site = Object.assign({}, A.model.site, A.siteOverride || {});
    const y = window.scrollY;
    A.keepScroll = true;
    const cur = GP.viewer && GP.viewer.isOpen() ? GP.viewer.current() : null;
    A.lastKey = "";
    const r = parseHash();
    A.lastKey = keyOf(r);
    render(r);
    window.scrollTo(0, y);
    if (cur && GP.viewer.refresh) GP.viewer.refresh(A.model);
  }
  function setSelecting(on) {
    A.selecting = !!on;
    if (!on) A.sel.clear();
    document.documentElement.classList.toggle("gp-selecting", A.selecting);
    update();
  }

  const helpers = { esc, tile, flow, cover, chip, spCard, chapterRow, pageHead, specimenTag, fmtDate, fmtShort, fmtTime, fmtN, plural, titleOf, exposure, src, ICON, regCtx, toast, hbars, table, svgBars, pageUrl, shareBtn, sharePage };
  GP.app = {
    start, update, setSelecting, toast, helpers,
    get model() { return A.model; }, get site() { return A.site; }, get adapter() { return A.adapter; }, get workshop() { return A.workshop; },
    get selection() { return [...A.sel]; }, clearSelection() { A.sel.clear(); $$(".tile.sel").forEach((t) => t.classList.remove("sel")); },
    setQuery, parseHash, hashFor, exhibit, toggleTheme, openById, route: () => { A.lastKey = ""; route(); },
  };
})(window.GP = window.GP || {});
