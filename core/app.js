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
    heart: I('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/>'),
    heartOn: I('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z" fill="currentColor"/>'),
    shuffle: I('<path d="M4 7h3.5c4.5 0 4.5 10 9 10H20m0 0-2.5-2.5M20 17l-2.5 2.5M4 17h3.5c1.6 0 2.6-1.2 3.4-2.8M20 7h-3.5c-1.6 0-2.6 1.2-3.4 2.8M20 7l-2.5-2.5M20 7l-2.5 2.5"/>'),
    up: I('<path d="M12 19V5m0 0-6 6m6-6 6 6"/>'),
    pause: I('<path d="M8 5.5v13M16 5.5v13"/>'),
    grid: I('<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>'),
    rows: I('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  };

  /* ---------- state ---------- */
  const A = { model: null, adapter: null, site: {}, workshop: null, ctx: new Map(), ctxN: 0, sel: new Set(), selecting: false, lastKey: "", timers: [], views: [], scrollMem: new Map(), traverse: false, rendered: false };
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
    const V = GP.visitor && !A.workshop ? GP.visitor : null;
    const fav = V && V.isFav(x.id), fresh = V && !o.noNew && V.isNew(x.id);
    const marks = V ? `<span class="fav" aria-hidden="true">${ICON.heartOn}</span>${fresh ? `<span class="new-pill">New</span>` : ""}` : "";
    return `<button class="tile${stack ? " burst" : ""}${A.sel.has(x.id) ? " sel" : ""}${fav ? " is-fav" : ""}" data-id="${esc(x.id)}" style="--ar:${x.ar.toFixed(3)}" aria-label="${esc(titleOf(x) + ", " + fmtDate(x.t) + (fav ? ", in your favourites" : ""))}">${lq}<img src="${esc(src(x, w))}" alt="" loading="lazy" decoding="async" draggable="false" style="--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%"><span class="cap"><b>${esc(titleOf(x))}</b><span>${esc(sub)}</span></span>${badge}${scrub}${sel}${marks}</button>`;
  }
  function flow(list, o = {}) {
    const k = regCtx(list);
    return `<div class="flow" data-ctx="${k}">${list.map((x) => tile(x, o)).join("")}</div>`;
  }
  function cover(x, w, cls = "", alt = "") {
    if (!x) return `<span class="ph"></span>`;
    const fx = (x.fp[0] * 100).toFixed(1), fy = (x.fp[1] * 100).toFixed(1);
    const pos = `object-position:${fx}% ${fy}%;--fx:${fx}%;--fy:${fy}%`;
    return `<img class="${cls}" src="${esc(src(x, w))}" alt="${esc(alt)}" loading="lazy" decoding="async" style="${pos};background:${esc(x.pal[0] || "transparent")}"${x.lq ? ` data-lq="${esc(x.lq)}"` : ""}>`;
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
    return location.origin + location.pathname + hashFor([kind === "outing" ? "outings" : kind === "room" ? "rooms" : "species", key]);
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
    A.tipOn = true;
  }

  /* ---------- shell ---------- */
  // The logo is the way home; registered views (Exhibitions, Universe, Quiz) slot in beside these.
  const NAV = [["gallery", "Gallery"], ["species", "Species"], ["outings", "Outings"], ["journal", "Journal"]];
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
    ${GP.sky ? GP.sky.button() : ""}
    <button class="icon-btn" data-act="search" title="Search (/)" aria-label="Search">${ICON.search}</button>
    <button class="icon-btn" data-act="surprise" title="Surprise me (R)" aria-label="Show a random photograph">${ICON.shuffle}</button>
    <button class="icon-btn" data-act="exhibit" title="Play an exhibition (E)" aria-label="Play an exhibition">${ICON.play}</button>
    ${GP.calls && GP.calls.available() ? GP.calls.button() : ""}
    ${GP.scape ? GP.scape.button() : ""}
    ${GP.fx ? GP.fx.depthButton() : ""}
    ${GP.newsletter ? GP.newsletter.button() : ""}
    <button class="icon-btn" data-act="theme" title="Light or dark" aria-label="Switch light or dark">${ICON.moon}</button>
    <button class="icon-btn" data-act="keys" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">${ICON.keys}</button>
  </div>
</div></header>
<main id="gp-main" tabindex="-1"></main>
${footer(nav)}
<button class="to-top icon-btn" data-act="top" aria-label="Back to top" title="Back to top">${ICON.up}</button>`;
    themeIcon();
    if (GP.sky) GP.sky.start();
    if (GP.newsletter) { GP.newsletter.paint(); GP.newsletter.watch(); }
    const head = $(".gp-head", A.root);
    if (head && "ResizeObserver" in window) {
      if (A.headRO) A.headRO.disconnect();
      A.headRO = new ResizeObserver(() => document.documentElement.style.setProperty("--head-h", head.offsetHeight + "px"));
      A.headRO.observe(head);
    }
  }
  function footer(nav) {
    const s = A.site, st = A.model.stats;
    const hasCalls = GP.calls && GP.calls.available();
    return `<footer class="foot"><div class="wrap foot-grid">
  <div class="foot-about"><a class="gp-mark" href="#/"><b>${esc(s.title || "Georgiadis Photography")}</b><span>${esc(s.tagline || "Wildlife of Central Florida")}</span></a>
    <p>${esc(s.footer || `A field archive of ${plural(st.species, "species", "species")} from ${plural(st.outings, "outing")}. Every photograph here is a Final from the Nikon archive.`)}</p></div>
  <nav class="foot-col" aria-label="Explore"><h3 class="sc">Explore</h3>${[["", "Home"]].concat(nav).map(([id, l]) => `<a href="#/${id}">${esc(l)}</a>`).join("")}</nav>
  <div class="foot-col"><h3 class="sc">Play &amp; listen</h3>
    ${A.views.some((v) => v.id === "quiz") ? `<a href="#/quiz?daily=1">Today’s challenge</a>` : ""}
    <button class="link" data-act="surprise">Surprise me</button>
    ${GP.visitor ? `<a href="#/rooms/favourites">Your favourites</a>` : ""}
    ${hasCalls ? `<a href="#/species?view=calls">Bird calls</a>` : ""}
    ${hasCalls && A.views.some((v) => v.id === "day") ? `<a href="#/day">A day in the marsh</a>` : ""}
    ${A.views.some((v) => v.id === "sky") ? `<a href="#/sky">The night sky</a>` : ""}
    ${A.views.some((v) => v.id === "plates") ? `<a href="#/plates">Natural-history plates</a>` : ""}
    <button class="link" data-act="exhibit">Play an exhibition</button></div>
  <div class="foot-col"><h3 class="sc">The archive</h3>
    <p class="mono">${st.photos ? `${fmtN(st.photos)} photographs<br>${fmtN(st.species)} species · ${fmtN(st.outings)} outings<br>Updated ${esc(fmtDate(s.updated || st.last))}` : ""}</p>
    ${GP.newsletter ? GP.newsletter.footLink() : ""}
    ${hasCalls ? `<p class="foot-small">Bird calls are recordings by iNaturalist contributors, shared under Creative Commons licences and credited beside each one.</p>` : ""}</div>
</div><div class="wrap foot-base"><span>© ${new Date().getFullYear()} ${esc(s.title || "Georgiadis Photography")}</span><span>Press <kbd>?</kbd> for keyboard shortcuts</span></div></footer>`;
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
    if (document.startViewTransition && !reduced()) quiet(document.startViewTransition(apply)); else apply();
  }
  // A transition the browser abandons (the window resized, say) still applies its change; nothing to report.
  function quiet(vt) { for (const k of ["ready", "finished", "updateCallbackDone"]) if (vt && vt[k]) vt[k].catch(() => {}); }

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
      A.traverse = false;
      if (p && GP.viewer) { if (!GP.viewer.isOpen() || GP.viewer.current() !== p) openById(p); }
      else if (GP.viewer && GP.viewer.isOpen()) GP.viewer.close({ fromRoute: true });
      return;
    }
    if (A.lastKey) A.scrollMem.set(A.lastKey, window.scrollY);
    const back = A.traverse;
    A.traverse = false;
    A.lastKey = key;
    if (GP.viewer && GP.viewer.isOpen()) GP.viewer.close({ fromRoute: true, instant: true });
    const go = () => {
      // Back and Forward return to where you were on the page; new pages start at the top.
      const y = back ? A.scrollMem.get(key) : null;
      if (y != null) A.keepScroll = true;
      render(r);
      if (y != null) { window.scrollTo(0, y); requestAnimationFrame(() => window.scrollTo(0, y)); }
      if (p) openById(p);
    };
    // A soft cross-fade between pages, where the browser supports it.
    if (A.rendered && !p && document.startViewTransition && !reduced() && !document.hidden) quiet(document.startViewTransition(go));
    else go();
    A.rendered = true;
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
    tipFor(null);
    if (GP.tint) GP.tint.page(null);
    // Listeners a view adds to the page live only until the next view replaces it.
    if (A.viewAC) A.viewAC.abort();
    A.viewAC = new AbortController();
    const signal = A.viewAC.signal;
    A.ctx.clear();
    const main = $("#gp-main");
    const [v, a, b] = r.parts;
    $$(".gp-nav a").forEach((n) => n.toggleAttribute("aria-current", false));
    const navEl = $(`.gp-nav a[data-nav="${v || ""}"]`);
    if (navEl) navEl.setAttribute("aria-current", "page");
    document.documentElement.dataset.view = v || "home";
    let html = "", after = null, title = "", full = false;
    const ext = A.views.find((x) => x.id === (v || ""));
    try {
      if (ext) { const res = ext.render({ parts: r.parts, q: r.q, model: A.model, h: helpers, signal }); html = typeof res === "string" ? res : res.html; after = res.after; title = res.title != null ? res.title : ext.label; full = !!res.full; }
      else if (v === "gallery") ({ html, after, title } = viewGallery(r.q));
      else if (v === "outings" && a) ({ html, after, title } = viewOuting(a));
      else if (v === "outings") ({ html, after, title } = viewOutings());
      else if (v === "species" && a) ({ html, after, title } = viewSpecies(a));
      else if (v === "species") ({ html, after, title } = viewSpeciesIndex(r.q));
      else if (v === "journal") ({ html, after, title } = viewJournal(r.q));
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
    const sq = m.search(query), fresh = q.get("new") === "1" && GP.visitor;
    let list = (all || !sq.empty ? m.photos : m.heroes).filter((x) => {
      if (fresh && !GP.visitor.isNew(x.id) && !(x.burst && x.burst.frames.some((f) => GP.visitor.isNew(f.id)))) return false;
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
    return { list, sq, sort, all, g, rmin, query, fresh: !!fresh };
  }
  function viewGallery(q) {
    const { list, sq, sort, all, g, rmin, query, fresh } = galleryList(q);
    const html = `
<div class="toolbar"><div class="wrap">
  <label class="search">${ICON.search}<span class="visually-hidden">Search</span><input id="gp-q" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gp-sugg" placeholder="Try “herons in flight”, “golden hour”, “otters”, “5 stars October”" value="${esc(query)}"><div class="sugg" id="gp-sugg" role="listbox" hidden></div></label>
  <div class="facet-row" role="group" aria-label="Filters">
    ${GROUPS.map(([v, l]) => chip(esc(l), `data-g="${v}"`, g === v)).join("")}
    <span class="lbl">Rating</span>${[0, 3, 4, 5].map((n) => chip(n ? `★ ${n}${n < 5 ? "+" : ""}` : "Any", `data-r="${n}"`, rmin === n)).join("")}
    <span class="lbl">Order</span><select id="gp-sort" aria-label="Order">${SORTS.map(([v, l]) => `<option value="${v}"${sort === v ? " selected" : ""}>${l}</option>`).join("")}</select>
    ${chip("Every frame", 'data-all="1"', all)}
    <span class="facet-tools"><span class="dens" role="group" aria-label="Photograph size">${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([d, l]) => `<button class="dens-b" data-dens="${d}" aria-pressed="${density() === d}" title="${l} photographs"><i></i></button>`).join("")}</span>
      <button class="chip" data-gal="surprise" title="A random photograph (R)">${ICON.shuffle} Surprise me</button>
      <button class="chip" data-gal="play" title="Play these as an exhibition">${ICON.play} Play these</button></span>
  </div>
</div></div>
<div class="wrap page" style="padding-top:0">${fresh ? `<div class="gal-new"><span><b>New since your last visit.</b> ${plural(list.length, "photograph")} arrived since ${GP.visitor.previousVisit ? esc(fmtDate(GP.visitor.previousVisit)) : "you were last here"}.</span><a class="btn ghost" href="#/gallery">Show everything</a></div>` : ""}<div id="gp-results">${galleryResults(list, sq, sort, all, query)}</div></div>`;
    const after = (main, signal) => {
      const input = $("#gp-q", main);
      let t;
      input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updateGallery((qq) => { if (input.value.trim()) qq.set("q", input.value.trim()); else qq.delete("q"); }), 160); });
      input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { input.value = ""; updateGallery((qq) => qq.delete("q")); e.stopPropagation(); } });
      $("#gp-sort", main).addEventListener("change", (e) => updateGallery((qq) => qq.set("sort", e.target.value)));
      suggestions(input, signal, () => updateGallery((qq) => { if (input.value.trim()) qq.set("q", input.value.trim()); else qq.delete("q"); }));
      main.addEventListener("click", (e) => {
        const d = e.target.closest("[data-dens]");
        if (d) { setDensity(d.dataset.dens); $$("[data-dens]", main).forEach((b) => b.setAttribute("aria-pressed", String(b === d))); return; }
        const ga = e.target.closest("[data-gal]");
        if (ga) { if (ga.dataset.gal === "surprise") surprise(); else { const l = galleryList(parseHash().q).list; if (l.length) GP.exhibit(l, { title: (parseHash().q.get("q") ? `“${parseHash().q.get("q")}”` : "The gallery") }); } return; }
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
    const after2 = (main, signal) => { after(main, signal); if (GP.tint) GP.tint.follow(main, signal); };
    return { html, after: after2, title: "Gallery" };
  }
  /* ---------- density and search suggestions ---------- */
  function density() { const d = store.get("gp-density"); return d === "s" || d === "l" ? d : "m"; }
  function setDensity(d) {
    store.set("gp-density", d);
    document.documentElement.classList.remove("dens-s", "dens-m", "dens-l");
    document.documentElement.classList.add("dens-" + d);
    // tiles are already laid out by flex; new sources at the new size come with the next render
  }
  let vocab = null;
  function vocabulary() {
    if (vocab && vocab.m === A.model) return vocab.list;
    const m = A.model, out = [];
    for (const sp of m.species) out.push({ label: sp.name, kind: sp.bin || "Species", n: sp.photos.length });
    for (const c of m.tree.values()) for (const o of c.orders.values()) for (const f of o.families.values()) if (f.common && f.common !== f.name) out.push({ label: f.common, kind: "Family", n: f.species.reduce((k, x) => k + x.photos.length, 0) });
    for (const [b] of M.BEHAVIOURS) out.push({ label: b === "Courtship & young" ? "young" : b.toLowerCase(), kind: "Behaviour" });
    for (const l of ["golden hour", "blue hour", "morning", "midday", "afternoon", "night"]) out.push({ label: l, kind: "Light" });
    for (const c of ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink", "brown", "white", "black", "grey"]) out.push({ label: c, kind: "Colour" });
    for (const mo of MONTHS) out.push({ label: mo, kind: "Month" });
    for (const [g, l] of [["bird", "birds"], ["mammal", "mammals"], ["reptile", "reptiles"], ["insect", "insects"]]) out.push({ label: l, kind: "Group", g });
    for (const n of [5, 4]) out.push({ label: `${n} stars`, kind: "Rating" });
    vocab = { m, list: out };
    return out;
  }
  function suggestions(input, signal, apply) {
    const box = $("#gp-sugg");
    if (!box) return;
    let items = [], act = -1;
    const close = () => { box.hidden = true; input.setAttribute("aria-expanded", "false"); act = -1; };
    const paint = () => box.querySelectorAll("[role=option]").forEach((b, i) => { b.classList.toggle("on", i === act); b.setAttribute("aria-selected", String(i === act)); });
    const pick = (i) => {
      const it = items[i];
      if (!it) return;
      const words = input.value.replace(/\s+$/, "").split(/\s+/);
      // replace the words the suggestion was matched from
      words.splice(words.length - it.take, it.take, it.label.toLowerCase());
      input.value = words.join(" ").replace(/^\s+/, "") + " ";
      close(); input.focus(); apply();
    };
    const update = () => {
      const v = input.value;
      if (!v.trim() || /\s$/.test(v)) { close(); return; }
      const words = v.trim().toLowerCase().split(/\s+/);
      const found = new Map();
      // a term already typed in full ("golden hour") needs no suggestions; a single word that is
      // a term on its own ("red") still offers the longer ones it starts ("red-winged blackbird")
      const labels = new Set(vocabulary().map((e) => e.label.toLowerCase()));
      let whole = 0;
      for (let take = Math.min(3, words.length); take >= 1 && !whole; take--) if (labels.has(words.slice(-take).join(" "))) whole = take;
      if (whole > 1) { close(); return; }
      for (let take = Math.min(3, words.length); take >= 1; take--) {
        const frag = words.slice(-take).join(" ");
        if (frag.length < 2) continue;
        for (const e of vocabulary()) {
          const l = e.label.toLowerCase();
          if (found.has(l) || l === frag) continue;
          const at = l.indexOf(frag);
          if (whole && (take > 1 || at !== 0)) continue;
          if (at === 0 || (at > 0 && l[at - 1] === " ")) found.set(l, { ...e, take, rank: (at === 0 ? 0 : 1) + (take > 1 ? -0.5 : 0) - Math.min(1, (e.n || 0) / 200) });
        }
      }
      items = [...found.values()].sort((a, b) => a.rank - b.rank).slice(0, 8);
      if (!items.length) { close(); return; }
      box.innerHTML = items.map((e, i) => `<button type="button" role="option" id="gp-sugg-${i}" data-i="${i}" aria-selected="false"><b>${esc(e.label)}</b><span>${esc(e.kind)}${e.n ? " · " + fmtN(e.n) : ""}</span></button>`).join("");
      box.hidden = false; input.setAttribute("aria-expanded", "true"); act = -1;
    };
    input.addEventListener("input", update, { signal });
    input.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { act = Math.min(items.length - 1, act + 1); paint(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { act = Math.max(-1, act - 1); paint(); e.preventDefault(); }
      else if ((e.key === "Enter" || e.key === "Tab") && act >= 0) { pick(act); e.preventDefault(); }
      else if (e.key === "Escape") { close(); e.stopPropagation(); }
      input.setAttribute("aria-activedescendant", act >= 0 ? "gp-sugg-" + act : "");
    }, { signal });
    box.addEventListener("pointerdown", (e) => { const b = e.target.closest("[data-i]"); if (b) { e.preventDefault(); pick(+b.dataset.i); } }, { signal });
    input.addEventListener("blur", () => setTimeout(close, 120), { signal });
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
  // A murmuration: when the gallery re-sorts, the tiles that stay fly to their new places along
  // curving paths that all bank the same way, in a wave across the screen, dipping as they go;
  // tiles that join sweep in from the side the flock is turning towards.
  function flip(container, mutate) {
    if (reduced()) { mutate(); return; }
    const vh = window.innerHeight, before = new Map();
    for (const t of container.querySelectorAll(".tile")) {
      const r = t.getBoundingClientRect();
      if (r.bottom > -200 && r.top < vh + 200) before.set(t.dataset.id, r);
    }
    mutate();
    const turn = Math.random() < 0.5 ? 1 : -1;
    const wobble = (i) => { const x = Math.sin(i * 91.7 + 13.1) * 43758.5; return x - Math.floor(x); };
    let n = 0, i = 0;
    for (const t of container.querySelectorAll(".tile")) {
      const r = t.getBoundingClientRect();
      if (r.bottom < -200 || r.top > vh + 200) continue;
      const b = before.get(t.dataset.id);
      i++;
      // a wave from the top left: each bird leaves a beat after its neighbour
      const delay = Math.min(320, Math.max(0, (r.top / vh) * 160 + (r.left / innerWidth) * 110));
      if (b) {
        const dx = b.left - r.left, dy = b.top - r.top, sx = b.width / r.width, sy = b.height / r.height;
        const dist = Math.hypot(dx, dy);
        if (dist < 1 && Math.abs(sx - 1) < 0.01) continue;
        const bend = turn * Math.min(180, dist * 0.38) * (0.75 + 0.5 * wobble(i));
        const px = dist ? -dy / dist : 0, py = dist ? dx / dist : 0;
        const cx = dx / 2 + px * bend, cy = dy / 2 + py * bend;
        const frames = [];
        for (let k = 0; k <= 8; k++) {
          const u = k / 8, a = (1 - u) * (1 - u), c = 2 * (1 - u) * u;
          const x = a * dx + c * cx, y = a * dy + c * cy;
          const dip = 1 - Math.sin(u * Math.PI) * Math.min(0.16, dist / 2400);
          const ssx = (sx + (1 - sx) * u) * dip, ssy = (sy + (1 - sy) * u) * dip;
          const rot = Math.sin(u * Math.PI) * turn * Math.min(5, dist / 120);
          frames.push({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${ssx.toFixed(3)},${ssy.toFixed(3)})`, transformOrigin: "0 0", offset: u });
        }
        t.animate(frames, { duration: 650 + Math.min(520, dist * 0.45), delay, easing: "cubic-bezier(.45,.05,.25,1)", fill: "backwards" });
      } else if (n < 60) {
        n++;
        t.animate([{ opacity: 0, transform: `translate(${turn * 70}px, -36px) rotate(${turn * 6}deg) scale(.7)` }, { opacity: 1, transform: "none" }], { duration: 700, delay: delay + 120, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
      }
    }
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
    const chorus = o.species.map((e) => m.speciesByKey.get(e.key)).filter((sp) => sp && sp.call).map((sp) => sp.slug);
    const html = `<section class="chapter-hero">${o.cover ? `<img src="${esc(src(o.cover, Math.max(1400, window.innerWidth) * dpr()))}" alt="" style="object-position:${(o.cover.fp[0] * 100).toFixed(1)}% ${(o.cover.fp[1] * 100).toFixed(1)}%" data-open="${esc(o.cover.id)}">` : ""}<div class="wrap"><div class="sc">Chapter ${o.no} of ${m.outings.length} · ${esc(o.type)}${esc(who)}</div><h1>${esc(fmtDate(o.date))}</h1><div class="sc">${esc(weekday(o.date))} · ${plural(o.photos.length, "frame")} · ${plural(o.species.length, "species", "species")}</div></div></section>
<div class="wrap page">
  <div class="sp-head" style="align-items:start;margin-top:8px"><div>${o.note ? `<p class="lede">${esc(o.note)}</p>` : `<p class="lede">${esc(o.title)}</p>`}
    <div class="sp-acts">${A.views.some((v) => v.id === "story") && list.some((x) => x.hasTime) ? `<a class="btn primary" href="#/story/${esc(o.id)}">Read it as a story ${ICON.arrow}</a>` : ""}<button class="btn" data-out="play">${ICON.play} Play this outing</button>${chorus.length ? `<button class="btn" data-out="chorus" aria-pressed="false">${ICON.play} Hear the day <span class="sc">${plural(chorus.length, "call")}</span></button>` : ""}${shareBtn(pageUrl("outing", o.id), `${fmtDate(o.date)} · ${A.site.title || "Georgiadis Photography"}`)}</div></div>
  <div><div class="sc" style="margin-bottom:10px">Species seen</div><div class="chips">${o.species.map((s) => { const sp = m.speciesByKey.get(s.key); return sp ? `<a class="chip" href="#/species/${esc(sp.slug)}">${esc(sp.name)} <span class="n">${s.n}</span></a>` : ""; }).join("")}</div></div></div>
  ${dayLine(list)}
  ${GP.notebook && list.length >= 8 ? `<section class="sec ob"><div class="sec-h"><h2>The day in colour</h2><span class="meta">Every frame's colours, in the order they were made</span></div>${GP.notebook.barcode(o.photos.filter((x) => x.pal && x.pal.length).slice().sort((a, b) => a.t.localeCompare(b.t)), { small: true, byHour: true, label: "The colours of this outing's frames in order" })}</section>` : ""}
  ${flow(list)}
  <nav class="result-line" style="margin-top:48px" aria-label="Other chapters">${prev ? `<a class="btn" href="#/outings/${esc(prev.id)}">${ICON.left} ${esc(fmtShort(prev.date))}</a>` : "<span></span>"}${next ? `<a class="btn" href="#/outings/${esc(next.id)}">${esc(fmtShort(next.date))} ${ICON.right}</a>` : ""}</nav>
</div>`;
    const after = (main, signal) => {
      if (GP.tint) GP.tint.page(o.cover);
      if (GP.notebook) GP.notebook.mount(main, signal);
      main.addEventListener("click", (e) => {
        if (e.target.closest('[data-out="play"]')) { GP.exhibit(list, { title: fmtDate(o.date) }); return; }
        const ch = e.target.closest('[data-out="chorus"]');
        if (ch && GP.calls) GP.calls.chorus(chorus, ch);
      }, { signal });
      signal.addEventListener("abort", () => { if (GP.calls && GP.calls.stopChorus) GP.calls.stopChorus(); });
      const day = $(".dl-pics", main);
      if (day) {
        packDay(day);
        const ro = new ResizeObserver(() => packDay(day));
        ro.observe(day);
        signal.addEventListener("abort", () => ro.disconnect());
      }
      const img = $(".chapter-hero img", main);
      if (!img || reduced()) return;
      const onScroll = () => { if (!img.isConnected) { window.removeEventListener("scroll", onScroll); return; } img.style.transform = `translateY(${Math.min(120, window.scrollY * 0.25)}px)`; };
      window.addEventListener("scroll", onScroll, { passive: true, signal });
    };
    return { html, after, title: fmtDate(o.date) };
  }

  // Lays the day line's thumbnails into three rows without overlaps, for the width it has. A frame
  // with no room left hides, and the thumbnail before it says how many it stands for; they all
  // stay in the viewer's sequence.
  function packDay(box) {
    const W = box.clientWidth, gap = 40, last = [-1e9, -1e9, -1e9];
    if (!W) return;
    let shown = null;
    for (const b of box.children) {
      const x = (parseFloat(b.style.left) / 100) * W;
      const r = last.findIndex((l) => x - l >= gap);
      b.hidden = r < 0;
      if (r < 0) { if (shown) shown.dataset.more = +(shown.dataset.more || 0) + 1; continue; }
      last[r] = x;
      b.style.setProperty("--row", r);
      delete b.dataset.more;
      shown = b;
    }
  }

  // The outing as a day: each frame placed at the minute it was taken, against that day's light.
  function dayLine(list) {
    const timed = list.filter((x) => x.hasTime && x.mins != null).sort((a, b) => a.mins - b.mins);
    if (timed.length < 3) return "";
    const sun = timed[0].sun || { rise: 420, set: 1170 };
    let t0 = Math.max(0, timed[0].mins - 25), t1 = Math.min(1440, timed[timed.length - 1].mins + 25);
    if (t1 - t0 < 120) { const c = (t0 + t1) / 2; t0 = Math.max(0, c - 60); t1 = Math.min(1440, c + 60); }
    const pct = (mn) => (((mn - t0) / (t1 - t0)) * 100).toFixed(2);
    const stops = [[sun.rise - 40, "var(--dl-night)"], [sun.rise, "var(--dl-blue)"], [sun.rise + 60, "var(--dl-gold)"], [sun.rise + 150, "var(--dl-day)"], [sun.set - 150, "var(--dl-day)"], [sun.set - 60, "var(--dl-gold)"], [sun.set, "var(--dl-blue)"], [sun.set + 40, "var(--dl-night)"]];
    const grad = `linear-gradient(90deg, ${stops.map(([mn, c]) => `${c} ${pct(mn)}%`).join(", ")})`;
    const hh = (mn) => `${String(Math.floor(mn / 60)).padStart(2, "0")}:${String(Math.round(mn % 60)).padStart(2, "0")}`;
    const hours = [];
    for (let h = Math.ceil(t0 / 60); h * 60 <= t1; h += (t1 - t0) > 480 ? 2 : 1) hours.push(h * 60);
    const k = regCtx(timed);
    // rows are packed to the real width once the line is on the page (packDay)
    const thumbs = timed.map((x) => {
      const p = +pct(x.mins);
      return `<button class="dl-pic" data-open="${esc(x.id)}" style="left:${p}%;--row:0" data-tip="${esc(titleOf(x))}" data-tip-v="${hh(x.mins)}${x.light ? " · " + esc(x.light) : ""}" aria-label="${esc(titleOf(x) + " at " + hh(x.mins))}">${cover(x, 120)}</button>`;
    }).join("");
    const mark = (mn, l) => (mn > t0 && mn < t1 ? `<span class="dl-sun" style="left:${pct(mn)}%">${l} ${hh(mn)}</span>` : "");
    return `<section class="dl" aria-label="The day, frame by frame" data-ctx="${k}"><div class="sec-h"><h2>The day</h2><span class="meta">${hh(timed[0].mins)} – ${hh(timed[timed.length - 1].mins)} · ${plural(timed.length, "frame")} placed by the minute</span></div>
  <div class="dl-track"><div class="dl-pics">${thumbs}</div><div class="dl-sky" style="background:${grad}">${timed.map((x) => `<i style="left:${pct(x.mins)}%"></i>`).join("")}</div>
  <div class="dl-axis">${hours.map((mn) => `<span style="left:${pct(mn)}%">${hh(mn)}</span>`).join("")}${mark(sun.rise, "Sunrise")}${mark(sun.set, "Sunset")}</div></div></section>`;
  }

  /* ---------- species ---------- */
  const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  function viewSpeciesIndex(q) {
    const m = A.model, cab = !!GP.cabinet, mode = q.get("view") || (cab ? "cabinet" : "family");
    const callN = GP.calls ? m.species.filter((x) => x.call).length : 0;
    const tabs = (cab ? [["cabinet", "Cabinet"]] : []).concat([["family", "By family"], ["life", "Life list"], ["az", "A–Z"]], callN ? [["calls", "Calls"]] : []);
    const head = pageHead("Field guide", "Species", `${plural(m.life.length, "species", "species")} on the life list across ${plural(m.stats.families, "family", "families")}, plus ${fmtN(m.species.length - m.life.length)} more photographed as captive animals or not identified to species.`,
      `<div class="chips" role="tablist">${tabs.map(([v, l], i) => `<a class="chip" role="tab" href="#/species${i ? `?view=${v}` : ""}" aria-pressed="${mode === v}">${l}</a>`).join("")}${A.views.some((v) => v.id === "sky") ? `<a class="chip" href="#/sky">Night sky</a>` : ""}${A.views.some((v) => v.id === "plates") ? `<a class="chip" href="#/plates">Plates</a>` : ""}</div>`);
    let body = "", after = null;
    const wild = m.species.filter((s) => s.lifeNo);
    const rest = m.species.filter((s) => !s.lifeNo);
    if (mode === "calls" && callN) {
      const list = m.species.filter((x) => x.call && x.best).sort((a, b) => (a.lifeNo || 999) - (b.lifeNo || 999) || a.name.localeCompare(b.name));
      body = `<div class="board-head"><p class="lede">${plural(list.length, "species", "species")} with a recorded call. Each is a short, cleaned-up clip from a recording shared on iNaturalist, credited beside it.</p><span class="board-acts"><button class="btn primary" data-board="all" aria-pressed="false">${ICON.play} Play them all</button>${A.views.some((v) => v.id === "day") ? `<a class="btn" href="#/day">A day in the marsh ${ICON.arrow}</a>` : ""}</span></div>
<div class="board">${list.map((x) => `<article class="board-card"><a class="board-pic" href="#/species/${esc(x.slug)}">${cover(x.best, 420, "", x.name)}</a><div class="board-t"><h3><a href="#/species/${esc(x.slug)}">${esc(x.name)}</a></h3><i class="binomial">${esc(x.bin || "")}</i>${GP.calls.player(x, true)}</div></article>`).join("")}</div>`;
      after = (main, signal) => {
        main.addEventListener("click", (e) => { const b = e.target.closest('[data-board="all"]'); if (b) GP.calls.chorus(list.map((x) => x.slug), b); }, { signal });
        signal.addEventListener("abort", () => GP.calls.stopChorus && GP.calls.stopChorus());
      };
    } else if (mode === "cabinet" && cab) {
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
    if (mode !== "life" && mode !== "cabinet" && mode !== "calls" && rest.length) body += `<div class="family-h" style="margin-top:72px"><h2>Also photographed</h2><span class="n">Captive, domestic, or not identified to species</span></div><div class="sp-grid">${rest.sort((a, b) => b.photos.length - a.photos.length).map(spCard).join("")}</div>`;
    return { html: `<div class="wrap page">${head}${body}</div>`, after, title: "Species" };
  }
  // The same bird from first light to last: the best frame in each light of the day, in order.
  const DAY = [["Blue hour", "am", -4, "Blue hour"], ["Golden hour", "am", 3, "Golden hour"], ["Morning", "", 28, "Morning"], ["Midday", "", 62, "Midday"], ["Afternoon", "", 34, "Afternoon"], ["Golden hour", "pm", 3, "Golden hour"], ["Blue hour", "pm", -4, "Dusk"], ["Night", "", -22, "Night"]];
  function everyLight(s) {
    const picks = [];
    for (const [light, half, alt, label] of DAY) {
      const pool = s.heroes.filter((x) => x.light === light && x.hasTime && (!half || (half === "am" ? x.mins < 720 : x.mins >= 720)));
      if (!pool.length) continue;
      const x = pool.slice().sort((a, b) => b.score - a.score)[0];
      const sky = GP.sky ? GP.sky.skyAt(alt, half === "pm" ? 250 : 110) : null;
      picks.push({ x, label, sky });
    }
    if (picks.length < 3) return "";
    const k = regCtx(picks.map((p) => p.x));
    const grad = picks.map((p, i) => p.sky ? `${p.sky.hz} ${((i + 0.5) / picks.length * 100).toFixed(1)}%` : "").filter(Boolean).join(", ");
    return `<section class="every"><div class="sec-h"><h2>Every light</h2><span class="meta">The ${esc(s.name)} from first light to last</span></div>
  <div class="every-sky" style="background:linear-gradient(90deg, ${grad})"></div>
  <div class="every-row" data-ctx="${k}" style="--n:${picks.length}">${picks.map((p) => `<button class="every-pic" data-open="${esc(p.x.id)}" aria-label="${esc(p.label + " · " + fmtTime(p.x) + " · " + fmtDate(p.x.t))}">${cover(p.x, 520, "", s.name)}<span class="every-t"><b>${esc(p.label)}</b><span class="mono">${esc(fmtTime(p.x))}</span></span></button>`).join("")}</div>
</section>`;
  }
  function viewSpecies(slug) {
    const m = A.model, s = m.speciesBySlug.get(slug);
    if (!s) return viewMissing();
    const months = s.months, mx = Math.max(...months);
    const related = m.species.filter((x) => x !== s && x.family && x.family === s.family && x.lifeNo).slice(0, 8);
    const outs = [...s.outings].map((id) => m.outingById.get(id)).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date));
    // neighbours on the life list (or alphabetically for species not on it), so the guide reads on
    const seq = s.lifeNo ? m.life : m.species.filter((x) => !x.lifeNo);
    const si = seq.indexOf(s), prevS = seq[si - 1], nextS = seq[si + 1];
    const pn = (x, dir) => x ? `<a class="sp-pn-a ${dir}" href="#/species/${esc(x.slug)}">${cover(x.best, 320)}<span><span class="sc">${dir === "prev" ? "Previous" : "Next"}${x.lifeNo ? ` · No. ${x.lifeNo}` : ""}</span><b>${esc(x.name)}</b>${x.bin ? `<i>${esc(x.bin)}</i>` : ""}</span></a>` : "<span></span>";
    const lightRows = ["Blue hour", "Golden hour", "Morning", "Midday", "Afternoon", "Night"].map((l) => [l, s.photos.filter((x) => x.light === l).length, hashFor(["gallery"], new URLSearchParams({ q: s.name.toLowerCase() + " " + l.toLowerCase() }))]).filter((r) => r[1]);
    const together = new Map();
    for (const id of s.outings) { const o = m.outingById.get(id); if (o) for (const e of o.species) if (e.key !== s.key) together.set(e.key, (together.get(e.key) || 0) + 1); }
    const withRows = [...together].map(([k, n]) => ({ sp: m.speciesByKey.get(k), n })).filter((e) => e.sp && e.sp.best && e.sp.lifeNo).sort((a, b) => b.n - a.n || b.sp.photos.length - a.sp.photos.length).slice(0, 8);
    const flag = s.captive ? "Photographed in captivity." : s.domestic ? "A domestic animal." : s.review ? "Rare or out of range in Florida: this identification deserves a second look." : s.uncertain ? "Identification uncertain." : "";
    const plate = GP.plates && s.lifeNo && s.family ? GP.plates.plateOf(m, s.family) : null;
    const html = `<div class="wrap page sp-page">
  ${GP.plates ? `<div class="sp-paper">${GP.plates.wash(s)}</div>` : ""}
  <div class="sp-head reveal"><div>
    <div class="kicker">${esc([s.famName, s.order].filter(Boolean).join(" · ") || "Species")}${s.lifeNo ? ` · Life list No. ${s.lifeNo}` : ""}</div>
    <h1${s.call ? ` data-sing="${esc(s.slug)}"` : ""}>${esc(s.name)}</h1>${s.bin ? `<div class="binomial">${esc(s.bin)}</div>` : ""}
    ${s.note ? `<p class="lede" style="margin-top:20px">${esc(s.note)}</p>` : ""}
    ${flag ? `<p class="sc" style="margin-top:12px;color:var(--warn)">${esc(flag)}</p>` : ""}
    ${GP.calls ? GP.calls.player(s) : ""}
    <div class="sp-acts"><button class="btn" data-sp="play">${ICON.play} Play as an exhibition</button>${plate ? `<a class="btn ghost" href="#/plates/${encodeURIComponent(plate.name)}">Plate ${plate.roman}</a>` : ""}${shareBtn(pageUrl("species", s.slug), `${s.name} · ${A.site.title || "Georgiadis Photography"}`)}</div>
  </div><button class="sp-hero" data-open="${esc(s.best.id)}"${s.call ? ` data-ripple="${esc(s.slug)}"` : ""} style="--fx:${(s.best.fp[0] * 100).toFixed(1)}%;--fy:${(s.best.fp[1] * 100).toFixed(1)}%" aria-label="Open the best photograph">${cover(s.best, 1400, "", s.name)}</button></div>
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
  ${lightRows.length > 1 ? `<div class="j-grid" style="margin-top:28px"><div class="j-card"><h2>Light</h2><p>When in the day it was photographed.</p>${hbars(lightRows, "Photographs by light")}</div>${withRows.length ? `<div class="j-card"><h2>Seen with</h2><p>Species photographed on the same outings.</p><div class="sp-with">${withRows.map(({ sp, n }) => `<a href="#/species/${esc(sp.slug)}">${cover(sp.best, 160)}<span><b>${esc(sp.name)}</b><i>${plural(n, "outing")} together</i></span></a>`).join("")}</div></div>` : ""}</div>` : ""}
  ${everyLight(s)}
  <div class="sec-h" style="margin-top:48px"><h2>Photographs</h2><span class="meta">Best first · bursts stacked</span></div>
  ${flow(s.heroes)}
  ${related.length ? `<div class="family-h" style="margin-top:64px"><h2>More ${esc(s.famName || "relatives")}</h2></div><div class="sp-grid">${related.map(spCard).join("")}</div>` : ""}
  <nav class="sp-pn" aria-label="Neighbouring species">${pn(prevS, "prev")}${pn(nextS, "next")}</nav>
</div>`;
    const after = (main, signal) => {
      if (GP.calls) GP.calls.onSpeciesPage(s);
      main.addEventListener("click", (e) => { if (e.target.closest('[data-sp="play"]')) GP.exhibit(s.heroes, { title: s.name }); }, { signal });
      if (GP.tint) GP.tint.page(s.best);
    };
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
  // Superlatives from the archive, each with the photograph that holds the record.
  function records(m) {
    const ph = m.photos.filter((x) => x.isHero || x.burst);
    const out = [];
    const rich = m.outings.slice().sort((a, b) => b.species.length - a.species.length)[0];
    if (rich) out.push({ n: rich.species.length, l: "species on one outing", d: fmtDate(rich.date), x: rich.cover, href: `#/outings/${rich.id}` });
    const busy = m.outings.slice().sort((a, b) => b.photos.length - a.photos.length)[0];
    if (busy && busy !== rich) out.push({ n: busy.photos.length, l: "frames in a single outing", d: fmtDate(busy.date), x: busy.cover, href: `#/outings/${busy.id}` });
    // daylight frames only: a camera clock left on the wrong time zone shouldn't set a record
    const timed = ph.filter((x) => x.hasTime && x.mins != null && x.group !== "scene" && x.light && x.light !== "Night");
    if (timed.length) {
      const early = timed.reduce((a, b) => (b.mins < a.mins ? b : a)), late = timed.reduce((a, b) => (b.mins > a.mins ? b : a));
      out.push({ n: fmtTime(early), l: "earliest frame of the day", d: `${titleOf(early)} · ${fmtShort(early.t)}`, x: early, open: early.id });
      out.push({ n: fmtTime(late), l: "latest frame of the day", d: `${titleOf(late)} · ${fmtShort(late.t)}`, x: late, open: late.id });
    }
    const burst = m.photos.filter((x) => x.burst).sort((a, b) => b.burst.size - a.burst.size)[0];
    if (burst && burst.burst.size > 3) { const hx = burst.burst.frames.find((f) => f.isHero) || burst; out.push({ n: burst.burst.size, l: "frames in one burst", d: `${titleOf(hx)} · ${fmtShort(hx.t)}`, x: hx, open: hx.id }); }
    const top = m.life.slice().sort((a, b) => b.photos.length - a.photos.length)[0];
    if (top) out.push({ n: top.photos.length, l: `photographs of the ${top.name}`, d: "the most photographed species", x: top.best, href: `#/species/${top.slug}` });
    const newest = m.life[m.life.length - 1];
    if (newest) out.push({ n: `No. ${newest.lifeNo}`, l: "newest on the life list", d: `${newest.name} · ${fmtShort(newest.first)}`, x: newest.best, href: `#/species/${newest.slug}` });
    const reach = ph.filter((x) => x.exif.fl).sort((a, b) => b.exif.fl - a.exif.fl)[0];
    if (reach) out.push({ n: `${Math.round(reach.exif.fl)} mm`, l: "the longest reach", d: `${titleOf(reach)} · ${fmtShort(reach.t)}`, x: reach, open: reach.id });
    return out.filter((r) => r.x);
  }
  function viewJournal(q) {
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
    const recs = records(m);
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
    // notes for the margins, from the numbers
    const NB = GP.notebook, ink = (t) => (NB ? NB.ink(t) : "");
    const busiest = monthRows.slice().sort((a, b) => b.v - a.v)[0];
    const peakH = hours.indexOf(Math.max(...hours));
    const gold = ph.filter((x) => x.light === "Golden hour").length;
    const topLens = [...lens].sort((a, b) => b[1] - a[1])[0];
    const topFl = flRows.slice().sort((a, b) => b.v - a.v)[0];
    const timeline = ph.filter((x) => x.t && x.pal && x.pal.length).slice().sort((a, b) => a.t.localeCompare(b.t));
    const seasonNote = (() => {
      const by = new Map();
      for (const x of timeline) { const k = x.t.slice(5, 7); const [hh, sa, l] = M.hexHsl(x.pal[0]); const e = by.get(k) || { g: 0, w: 0, n: 0 }; if (sa > 0.15 && l > 0.15 && l < 0.85) { if (hh > 70 && hh < 165) e.g++; if (hh < 55 || hh > 330) e.w++; } e.n++; by.set(k, e); }
      const arr = [...by].filter(([, e]) => e.n >= 20);
      if (arr.length < 3) return "";
      const green = arr.sort((a, b) => b[1].g / b[1].n - a[1].g / a[1].n)[0][0], warm = arr.sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n)[0][0];
      return green === warm ? "" : `green in ${MONTHS[+green - 1]}, gold in ${MONTHS[+warm - 1]}`;
    })();
    const html = `<div class="wrap page notebook">${pageHead("Journal", "The archive, read closely", "When the photographs were made, in what light, of whom, and with what: a field notebook kept by the archive itself.")}
<div class="j-grid">
  ${NB && timeline.length > 20 ? `<section class="j-card wide reveal"><h2>The archive in colour</h2><p>Every photograph's colours, one sliver each, in the order they were made. Hover to see one; click to open it.</p>${NB.barcode(timeline, { label: "The colours of every photograph in time order" })}${seasonNote ? ink(seasonNote) : ""}</section>` : ""}
  ${NB ? NB.notebook(m, helpers) : ""}
  <section class="j-card wide reveal"><h2>The year in the field</h2><p>Photographs per month. Hover a month for outings and new species.</p>${busiest && busiest.v ? ink(`busiest: ${MONTHS[busiest.mo - 1]} ${busiest.y}, ${fmtN(busiest.v)} frames`) : ""}<div class="scroll-x">${svgBars(monthRows, { w: Math.max(560, Math.min(1680, (A.root.clientWidth || innerWidth) - 48)), h: 240, aria: "Photographs per month" })}</div>${table(["Month", "Photographs", "Outings", "New species"], monthRows.map((r) => [`${MONTHS[r.mo - 1]} ${r.y}`, r.v, r.o, r.l]))}</section>
  <section class="j-card reveal"><h2>Hours of light</h2><p>Photographs by hour on the camera clock; the inner arc marks typical daylight.</p>${hours[peakH] ? ink(`most frames between ${peakH}:00 and ${peakH + 1}:00`) : ""}${dial(hours, avgSun)}${table(["Hour", "Photographs"], hours.map((v, i) => [`${String(i).padStart(2, "0")}:00`, v]))}</section>
  <section class="j-card reveal"><h2>Light</h2><p>Each frame placed against that day's sunrise and sunset.</p>${ph.length ? ink(`golden hour: ${Math.round((gold / ph.length) * 100)}% of every frame`) : ""}${hbars(lights, "Photographs by light")}<h2 style="margin-top:18px">Behaviour</h2>${hbars(beh, "Photographs by behaviour")}</section>
  ${otd ? `<section class="j-card wide reveal"><h2>${esc(otd.title)}</h2><p>${esc(otd.sub)}</p>${flow(otd.photos.slice(0, 10))}</section>` : ""}
  <section class="j-card wide reveal"><h2>Records</h2><p>The archive's superlatives, and the photographs that hold them.</p>${m.species.length ? ink(`the ${m.species.slice().sort((a, b) => b.photos.length - a.photos.length)[0].name}, again!`) : ""}<div class="recs" data-ctx="${regCtx(recs.filter((r) => r.open).map((r) => r.x))}">${recs.map((r) => `<${r.href ? `a href="${esc(r.href)}"` : `button data-open="${esc(r.open)}"`} class="rec">${cover(r.x, 480)}<span class="rec-t"><b>${esc(String(r.n))}</b><span>${esc(r.l)}</span><span class="sc">${esc(r.d)}</span></span></${r.href ? "a" : "button"}>`).join("")}</div></section>
  <section class="j-card wide reveal"><h2>Years</h2>${years.length ? ink(`${m.life.filter((s) => s.first.startsWith(String(years[0]))).length} new species in ${years[0]} so far`) : ""}${yearCards}</section>
  <section class="j-card wide reveal tl-card"><h2>Tree of life</h2><p>${GP.treeOfLife ? "Every species on the life list, by class, order and family. The tree grows in the order they were first photographed; hover a leaf to trace it back to the root." : "Every species in the archive, by class, order and family."}</p>${GP.treeOfLife ? GP.treeOfLife.html(m, helpers) + `<details class="tl-list"><summary class="chip">Every species as a list, including captive and unidentified</summary><div class="tree">${tree}</div></details>` : `<div class="tree">${tree}</div>`}</section>
  <section class="j-card reveal"><h2>Field kit</h2><p>Lenses used, by photograph.</p>${topLens && topLens[1] / ph.length > 0.6 ? ink(`the ${topLens[0].replace(/ f\/.*$/, "")} does nearly everything`) : ""}${hbars([...lens].sort((a, b) => b[1] - a[1]), "Photographs by lens")}</section>
  <section class="j-card reveal"><h2>Reach</h2><p>Focal length in millimetres. Most of the archive lives at the long end.</p>${topFl && topFl.v ? ink(`most at ${topFl.tip}`) : ""}${svgBars(flRows, { w: Math.max(320, Math.min(820, innerWidth > 900 ? (A.root.clientWidth - 76) / 2 : innerWidth - 48)), h: 200, aria: "Photographs by focal length" })}${table(["Focal length", "Photographs"], flRows.map((r) => [r.tip, r.v]))}</section>
</div></div>`;
    const after = (main, signal) => {
      if (GP.notebook) GP.notebook.mount(main, signal);
      // the years' prints develop as they arrive
      if (GP.fx) main.querySelectorAll(".year-card .mini-flow").forEach((mf) => GP.fx.developIn(mf, signal));
      if (GP.treeOfLife) GP.treeOfLife.mount(main, signal, m, helpers);
      // arriving from "Watch the life list grow": go straight to the tree
      if (q && q.get("tree")) requestAnimationFrame(() => { const t = $(".tl-card", main); if (t) window.scrollTo(0, t.getBoundingClientRect().top + scrollY - (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64) - 8); });
    };
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
      else if (a === "surprise") surprise();
      else if (a === "top") window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
      else if (a === "share-page") sharePage(act.dataset.url, act.dataset.title);
      return;
    }
    // a link to the page already showing starts it afresh (the browser would do nothing)
    const same = e.target.closest('a[href^="#/"]');
    if (same && !e.metaKey && !e.ctrlKey && !e.shiftKey && same.getAttribute("href") === location.hash && A.root.contains(same)) {
      e.preventDefault();
      A.lastKey = "";
      route();
      window.scrollTo(0, 0);
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
    if (!t || e.pointerType === "touch" || t.classList.contains("living")) return;
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
    const away = !A.r || A.r.parts[0] !== "gallery";
    if (away) location.hash = "#/gallery";
    // the gallery may arrive a moment later (behind a view transition): wait for its search box
    let n = 0;
    const focus = () => { const q = $("#gp-q"); if (q) { q.focus(); q.select(); } else if (++n < 40) setTimeout(focus, 40); };
    setTimeout(focus, 30);
  }
  // A random strong photograph, with more of the same waiting behind it.
  function surprise() {
    const m = A.model;
    const pool = m.heroes.filter((x) => x.rating >= 3 && !x.unsure);
    const src = pool.length > 10 ? pool : m.heroes.slice();
    for (let i = src.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [src[i], src[j]] = [src[j], src[i]]; }
    const list = src.slice(0, 40);
    if (list.length) openList(list, 0, null);
  }
  // The exhibition that fits the page you're on: its room, species, outing or search; otherwise the best of the archive.
  function exhibit(list, title) {
    if (!GP.exhibit) return;
    const m = A.model, r = A.r || { parts: [], q: new URLSearchParams() };
    if (list) { GP.exhibit(list, { title: title || "The archive" }); return; }
    const [v, a] = r.parts;
    if (v === "rooms" && a) {
      const room = a === "favourites" && GP.visitor ? { title: "Your favourites", photos: GP.visitor.favPhotos() } : m.rooms.find((x) => x.id === a);
      if (room && room.photos.length) { GP.exhibit(room.photos, { title: room.title }); return; }
    }
    if (v === "species" && a) { const sp = m.speciesBySlug.get(a); if (sp) { GP.exhibit(sp.heroes, { title: sp.name }); return; } }
    if (v === "outings" && a) { const o = m.outingById.get(a); if (o) { GP.exhibit(o.photos.filter((x) => x.isHero).sort((p, q) => p.t.localeCompare(q.t)), { title: fmtDate(o.date) }); return; } }
    if (v === "gallery" && (r.q.get("q") || r.q.get("g") || r.q.get("new"))) { const g = galleryList(r.q).list; if (g.length) { GP.exhibit(g, { title: r.q.get("q") ? `“${r.q.get("q")}”` : "The gallery" }); return; } }
    const room = m.rooms.find((x) => x.id === "collection");
    if (room && room.photos.length) { GP.exhibit(room.photos, { title: room.title }); return; }
    const pool = m.heroes.filter((x) => x.rating >= 4 && x.group !== "scene" && !x.unsure);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    GP.exhibit(pool.slice(0, 60), { title: "The archive" });
  }
  function showKeys() {
    let d = $("#gp-keys");
    if (!d) {
      d = document.createElement("dialog"); d.id = "gp-keys"; d.className = "gp-keys";
      const rows = [["/", "Search"], ["← →", "Previous or next photograph"], ["↑ ↓", "Frames within a burst"], ["I", "Specimen label"], ["Z", "Zoom to full resolution"], ["0", "Fit to screen"], ["F", "Full screen"], ["D", "Download the original"], ["Shift", "Hold over a photograph for a loupe; scroll to change its power"], ["C", "Play the bird's call (in the viewer)"], ["L", "Add to or remove from your favourites (in the viewer)"], ["P", "Play the photographs from here as an exhibition (in the viewer)"], ["V", "Play a burst as it was shot (in the viewer)"], A.workshop ? ["H", "Hide from or show on the public site (in the viewer)"] : ["H", "How it was shot, and the sky that moment (in the viewer)"], ["B", "Lights down (in an exhibition room)"], ["Space", "Play or pause the day (in A day in the marsh)"], ["R", "Surprise me: a random photograph"], ["E", "Play an exhibition"], ["S", "Sound on or off: the marsh, the pines, the surf"], ["M", "Depth on or off: each subject stands a little in front of its background"], ["T", "Light or dark"], ["Esc", "Close"]];
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
    else if (e.key === "r" || e.key === "R") surprise();
    else if ((e.key === "s" || e.key === "S") && GP.scape) GP.scape.toggle();
  }
  let lastY = 0;
  function onScroll() {
    const y = window.scrollY, head = $(".gp-head");
    if (!head) return;
    if (A.tipOn) { tipFor(null); A.tipOn = false; }
    const tt = $(".to-top");
    if (tt) tt.classList.toggle("on", y > innerHeight * 1.6);
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
    document.documentElement.classList.add("dens-" + density());
    const t = store.get("gp-theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
    shell();
    if (!A.bound) {
      A.bound = true;
      document.addEventListener("click", onClick);
      document.addEventListener("keydown", onKey);
      document.addEventListener("pointermove", onScrub, { passive: true });
      document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest(".tile.burst") && !e.target.closest(".tile.burst").contains(e.relatedTarget)) onScrubEnd(e); }, { passive: true });
      document.addEventListener("load", (e) => {
        const img = e.target;
        if (img.tagName !== "IMG") return;
        img.classList.add("in");
        // photographs come into focus from their subject outward
        if (GP.fx && (img.dataset.lq || img.parentElement && img.parentElement.classList.contains("tile")) && !img.closest(".no-arrive")) GP.fx.arrive(img);
      }, true);
      document.addEventListener("error", (e) => { if (e.target.tagName === "IMG") e.target.classList.add("bad"); }, true);
      document.addEventListener("pointerover", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); if (el) tipFor(el, e); }, { passive: true });
      document.addEventListener("pointermove", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); tipFor(el, e); }, { passive: true });
      document.addEventListener("focusin", (e) => { const el = e.target.closest && e.target.closest("[data-tip]"); tipFor(el, null); });
      document.addEventListener("focusout", () => tipFor(null));
      window.addEventListener("hashchange", route);
      window.addEventListener("popstate", () => { A.traverse = true; });
      if ("scrollRestoration" in history) history.scrollRestoration = "manual";
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
    setQuery, parseHash, hashFor, exhibit, toggleTheme, openById, openList, surprise, route: () => { A.lastKey = ""; route(); },
  };
})(window.GP = window.GP || {});
