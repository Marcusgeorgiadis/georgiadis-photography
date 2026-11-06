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
    burstsGrouped: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="7.5" y="3.5" width="12" height="12" rx="1.5" opacity=".45"/><rect x="5.5" y="5.5" width="12" height="12" rx="1.5" opacity=".7"/><rect x="3.5" y="7.5" width="12" height="12" rx="1.5" fill="var(--bg, #fff)"/></svg>',
    burstsOpen: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="8" height="7" rx="1.3"/><rect x="13" y="4" width="8" height="7" rx="1.3"/><rect x="3" y="13" width="8" height="7" rx="1.3"/><rect x="13" y="13" width="8" height="7" rx="1.3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.6 7.9 3.1 9.9 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.7-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
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
    menu: I('<path d="M4 7h16M4 12h16M4 17h10"/>'),
    orbit: I('<circle cx="12" cy="12" r="2.2"/><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(-25 12 12)"/><circle cx="19.2" cy="8.2" r="1.1" fill="currentColor"/><circle cx="5.6" cy="16.4" r="0.8" fill="currentColor"/>'),
    sliders: I('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>'),
    home: I('<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/>'),
    frame: I('<rect x="4" y="4" width="16" height="16" rx="1.5"/><rect x="7.5" y="7.5" width="9" height="9" rx=".5"/><path d="m7.5 14.5 2.6-2.8 2.4 2.3 1.6-1.6 2.4 2.6"/>'),
    feather: I('<path d="M19.5 4.5c-6 0-11 4.6-11 11v4"/><path d="M19.5 4.5c.4 6.8-3.7 11-9.6 11H8.5"/><path d="M12.6 11.4H17M10.3 13.8h4.6"/>'),
    compass: I('<circle cx="12" cy="12" r="8.5"/><path d="m15.3 8.7-1.9 4.7-4.7 1.9 1.9-4.7z"/>'),
    mail: I('<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 7 8 6 8-6"/>'),
  };

  /* ---------- state ---------- */
  const A = { expand: (() => { try { return sessionStorage.getItem("gp-bursts") === "open"; } catch (e) { return false; } })(), revealed: new Set(), model: null, adapter: null, site: {}, workshop: null, ctx: new Map(), ctxN: 0, sel: new Set(), selecting: false, lastKey: "", timers: [], views: [], scrollMem: new Map(), traverse: false, rendered: false };
  const BUCKETS = [360, 540, 720, 960, 1280, 1600, 2048, 2560];
  const bucket = (px) => BUCKETS.find((b) => b >= px) || BUCKETS[BUCKETS.length - 1];
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function src(x, w) {
    if (!x) return "";
    try { return A.adapter.src(x, bucket(w)) || ""; } catch (e) { return ""; }
  }
  let rowMemo = 0;
  function rowH() { return rowMemo || (rowMemo = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--rowh")) || 240); }
  function regCtx(list) { const k = "c" + ++A.ctxN; A.ctx.set(k, list); return k; }
  const ctxBase = new Map(); // grid context -> the list (and its parts) it was drawn from, before opening bursts

  /* ---------- components ---------- */
  // a tile flicks through at most this many frames of a burst; the viewer shows them all
  const SCRUB_MAX = 10;
  function tile(x, o = {}) {
    const b = x.burst, fr = b ? GP.model.framesOf(b, A.ff) : [], loose = A.expand && o.stacks !== false && fr.length > 1;
    const stack = !loose && o.stacks !== false && fr.length > 1;
    const hov = fr.slice(0, SCRUB_MAX);
    // sensitive (marked in the Workshop): blurred until clicked once; any frame marked veils the tile
    const veiled = (x.explicit || hov.some((f) => f.explicit)) && !(stack ? hov : [x]).every((f) => !f.explicit || A.revealed.has(f.id));
    const w = rowH() * x.ar * dpr() * 1.1;
    // the soft preview is the tile's own background (none for a veiled one: even soft, it shows too much)
    const bg = x.lq && !veiled ? `;background-image:url(${x.lq})` : x.pal[0] ? `;background-color:${esc(x.pal[0])}` : "";
    const lq = "";
    const sel = A.selecting ? `<span class="tick" aria-hidden="true">✓</span>` : "";
    const bt = o.badge ? o.badge(x) : A.workshop && A.workshop.badge ? A.workshop.badge(x) : "";
    const badge = bt ? `<span class="badge">${esc(bt)}</span>` : "";
    const scrub = stack ? `<span class="stack">${fr.length}</span><span class="scrub">${hov.map((f) => `<i${f === x ? ' class="on"' : ""}></i>`).join("")}</span>` : "";
    const sub = [fmtShort(x.t), x.light].filter(Boolean).join(" · ");
    const V = GP.visitor && !A.workshop ? GP.visitor : null;
    const fav = V && V.isFav(x.id), fresh = V && !o.noNew && V.isNew(x.id);
    const marks = V ? `<span class="fav" aria-hidden="true">${ICON.heartOn}</span>${fresh ? `<span class="new-pill">New</span>` : ""}` : "";
    const veil = veiled ? `<span class="veil" aria-hidden="true">${ICON.eyeOff}<b>Sensitive</b><span>May be upsetting · click to show</span></span>` : "";
    return `<button class="tile${stack ? " burst" : ""}${loose ? " loose" : ""}${veiled ? " veiled" : ""}${A.sel.has(x.id) ? " sel" : ""}${fav ? " is-fav" : ""}" data-id="${esc(x.id)}"${stack ? ` data-frames="${esc(hov.map((f) => f.id).join(","))}"` : ""}${loose ? ` data-burst="${esc(fr[0].id)}" data-k="${fr.indexOf(x) + 1}"` : ""} style="--ar:${x.ar.toFixed(3)}${bg}" aria-label="${esc((veiled ? "Sensitive photograph, may be upsetting; activate to show. " : "") + titleOf(x) + ", " + fmtDate(x.t) + (fav ? ", in your favourites" : ""))}">${lq}<img src="${esc(src(x, w))}" alt="" loading="lazy" decoding="async" draggable="false" style="--fx:${(x.fp[0] * 100).toFixed(1)}%;--fy:${(x.fp[1] * 100).toFixed(1)}%">${veil}${loose ? `<span class="bk" aria-hidden="true">${fr.indexOf(x) + 1}<i>/</i>${fr.length}</span>` : ""}<span class="cap"><b>${esc(titleOf(x))}</b><span>${esc(sub)}</span></span>${badge}${scrub}${sel}${marks}</button>`;
  }
  // With bursts opened (the header's bursts button, or X), a list's burst tiles give way to every
  // frame of the burst, each a tile of its own, in the burst's order; the viewer steps them as
  // single photographs.
  function expand(list, o = {}) {
    if (!A.expand || o.stacks === false) return list;
    const out = [];
    for (const x of list) {
      const fr = x.burst ? GP.model.framesOf(x.burst, A.ff) : [];
      if (fr.length > 1) out.push(...fr); else out.push(x);
    }
    return out;
  }
  function flow(list, o = {}) {
    const all = expand(list, o), k = regCtx(all);
    ctxBase.set(k, { list, o });
    return `<div class="flow" data-ctx="${k}">${all.map((x) => tile(x, o)).join("")}</div>`;
  }
  function cover(x, w, cls = "", alt = "") {
    if (!x) return `<span class="ph"></span>`;
    if (x.explicit && !A.revealed.has(x.id)) cls = (cls + " veiled-img").trim();
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
      add("Outing", `<a href="#/outings/${esc(x.oid || x.fid)}">${esc(x.outing)}</a>`);
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
    return `<a class="sp-card" href="#/species/${esc(s.slug)}"><div class="cv">${cover(s.best, 520, "", s.name)}${flag ? `<span class="badge flag">${flag}</span>` : ""}</div><h3>${esc(s.name)}</h3>${s.bin ? `<div class="binomial">${esc(s.bin)}</div>` : ""}<div class="meta">${plural(s.photos.length, "photograph")}<span class="m-x"> · ${plural(s.outingN, "outing")} · since ${esc(fmtShort(s.first))}</span></div></a>`;
  }
  // An outing's slideshow: its cover, then its strongest frames, a different species each first.
  function showPicks(o, n = 6) {
    const calm = (x) => x && !x.explicit && !(x.burst && x.burst.frames.some((f) => f.explicit));
    const pool = o.heroes.filter((x) => calm(x) && x !== o.cover).sort((a, b) => b.score - a.score);
    const out = o.cover ? [o.cover] : [], seen = new Set(out.map((x) => x.spKey || x.id));
    for (const x of pool) if (out.length < n && !seen.has(x.spKey || x.id)) { out.push(x); seen.add(x.spKey || x.id); }
    for (const x of pool) if (out.length < n && !out.includes(x)) out.push(x);
    return out;
  }
  function chapterRow(o) {
    const d = ymd(o.date) || [0, 1, 1], href = `#/outings/${esc(o.id)}`;
    const picks = showPicks(o), k = regCtx(picks), multi = picks.length > 1;
    const slides = picks.map((x, i) => `<button class="ch-s" data-open="${esc(x.id)}" aria-label="${esc(`${titleOf(x)}: photograph ${i + 1} of ${picks.length}, open it`)}"${i ? ' tabindex="-1"' : ""}>${cover(x, 900, "", i ? "" : o.title)}</button>`).join("");
    // the last slide is the way into the whole day, over a few of the frames the slideshow left out
    const left = o.heroes.filter((x) => !picks.includes(x) && !x.explicit).slice(0, 4);
    const end = multi ? `<a class="ch-s ch-end" href="${href}" tabindex="-1" style="background:${esc((o.cover && o.cover.pal[0]) || "#222")}">${left.length === 4 ? `<span class="ch-mos" aria-hidden="true">${left.map((x) => cover(x, 300)).join("")}</span>` : ""}<span class="ch-end-t"><b>${plural(o.photos.length, "frame")}</b><span>The whole day ${ICON.arrow}</span></span></a>` : "";
    const ctl = multi ? `<span class="ch-dots" aria-hidden="true">${picks.map((_, i) => `<i${i ? "" : ' class="on"'}></i>`).join("")}</span><button class="ch-arr prev" data-step="-1" aria-label="Previous photograph" hidden>${ICON.left}</button><button class="ch-arr next" data-step="1" aria-label="Next photograph">${ICON.right}</button>` : "";
    return `<article class="chapter-row reveal"><a class="ch-link" href="${href}"><div class="when"><b>${d[2]}</b><span><em>${MON[d[1] - 1]} ${d[0]}</em><i> · </i><em>${esc(weekday(o.date).slice(0, 3))}</em></span></div><div class="txt"><div class="kicker">Chapter ${o.no} · ${esc(o.type)}</div><h3>${esc(o.title)}</h3>${o.note ? `<p>${esc(o.note)}</p>` : ""}<div class="sc">${plural(o.photos.length, "frame")} · ${plural(o.species.length, "species", "species")}</div></div></a><div class="cv ch-show${multi ? " multi" : ""}"><div class="ch-strip" data-ctx="${k}">${slides}${end}</div>${ctl}</div></article>`;
  }
  // The slideshows: a swipe (or an arrow, with a mouse) moves one photograph; the dots follow,
  // the next two photographs load as the current one comes into view, and a tap opens it large.
  function mountShows(root, signal) {
    const sync = (strip) => {
      const kids = strip.children, n = kids.length, i = Math.max(0, Math.min(n - 1, Math.round(strip.scrollLeft / (strip.clientWidth || 1))));
      const show = strip.parentNode;
      show.querySelectorAll(".ch-dots i").forEach((dot, j) => dot.classList.toggle("on", j === i));
      show.classList.toggle("at-end", kids[i].classList.contains("ch-end"));
      const prev = show.querySelector(".ch-arr.prev"), next = show.querySelector(".ch-arr.next");
      if (prev) prev.hidden = i === 0;
      if (next) next.hidden = i >= n - 1;
      for (let j = 0; j < n; j++) {
        kids[j].tabIndex = j === i ? 0 : -1;
        if (j >= i && j <= i + 2) for (const im of kids[j].querySelectorAll('img[loading="lazy"]')) im.loading = "eager";
      }
    };
    const dirty = new Set();
    let raf = 0;
    root.addEventListener("scroll", (e) => {
      const s = e.target;
      if (!s.classList || !s.classList.contains("ch-strip")) return;
      dirty.add(s);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; for (const x of dirty) sync(x); dirty.clear(); });
    }, { capture: true, passive: true, signal });
    root.addEventListener("click", (e) => {
      const b = e.target.closest(".ch-arr");
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      const s = b.parentNode.querySelector(".ch-strip");
      sync(s);
      s.scrollBy({ left: s.clientWidth * Number(b.dataset.step), behavior: reduced() ? "auto" : "smooth" });
    }, { signal });
    // the first touch (or the pointer arriving) warms the next photograph
    const warm = (e) => { const s = e.target.closest && e.target.closest(".ch-show"); if (s && !s._warm) { s._warm = 1; sync(s.querySelector(".ch-strip")); } };
    root.addEventListener("pointerover", warm, { passive: true, signal });
    root.addEventListener("touchstart", warm, { passive: true, signal });
  }
  /* ---------- one template for every page ---------- */
  // Every page opens the same way: a kicker (on a page inside a section, the way back up to it),
  // the title, one line of intro and, on the right, the page's tabs. A tab changes only the intro.
  function pageHeader(o) {
    const k = o.crumbs ? crumbs(o.crumbs, o.rest) : o.kicker ? `<div class="kicker">${o.kicker}</div>` : "";
    return `<header class="page-head${o.cls ? " " + o.cls : ""}${o.reveal === false ? "" : " reveal"}"><div class="pg-t">${k}<h1${o.h1 || ""}>${o.title}</h1>${o.intro ? `<p class="pg-p${o.introCls ? " " + o.introCls : ""}">${o.intro}</p>` : ""}${o.actions ? `<div class="pg-acts">${o.actions}</div>` : ""}</div>${o.tabs ? `<div class="pg-tabs">${o.tabs}</div>` : ""}</header>`;
  }
  function pageHead(kicker, h1, p, tabs = "") { return pageHeader({ kicker, title: h1, intro: p, tabs }); }
  // The way back up, set as the kicker: "Species › Herons, Egrets & Bitterns · Life list No. 14".
  function crumbs(items, rest) {
    const parts = items.filter(Boolean).map(([l, href]) => href ? `<a href="${esc(href)}">${esc(l)}</a>` : `<span>${esc(l)}</span>`);
    return `<nav class="kicker crumbs" aria-label="Where this page sits">${parts.join(`<span class="sep" aria-hidden="true">›</span>`)}${rest ? `<span class="rest">${esc(rest)}</span>` : ""}</nav>`;
  }
  // Tabs are the same control everywhere: links, the current one filled in. (Filters stay chips.)
  function tabs(label, items, active, cls = "") {
    return `<nav class="ptabs${cls ? " " + cls : ""}" aria-label="${esc(label)}">${items.map(([id, l, href, icon, tip]) => `<a href="${esc(href)}"${id === active ? ' aria-current="page"' : ""}${tip ? ` title="${esc(tip)}"` : ""}>${icon || ""}<span>${l}</span></a>`).join("")}</nav>`;
  }
  // Every page inside a section ends the same way: its neighbours, then the way back up.
  function pageFoot({ prev, next, up, label }) {
    const card = (x, dir) => x ? `<a class="pf-a ${dir}" href="${esc(x.href)}">${x.cover ? `<span class="pf-cv">${x.cover}</span>` : ""}<span class="pf-t"><span class="sc">${esc(x.kicker || (dir === "prev" ? "Previous" : "Next"))}</span><b>${esc(x.title)}</b>${x.sub ? `<span class="pf-s${x.italic ? " i" : ""}">${esc(x.sub)}</span>` : ""}</span></a>` : "<span></span>";
    return `<nav class="pfoot" aria-label="${esc(label || "More")}">${prev || next ? `<div class="pf-pn">${card(prev, "prev")}${card(next, "next")}</div>` : ""}${up ? `<a class="btn ghost pf-up" href="${esc(up[1])}">${esc(up[0])} ${ICON.arrow}</a>` : ""}</nav>`;
  }
  // Outings: the diary as a list, the field notebook, the archive in numbers.
  function outingsTabs(active) {
    return tabs("Outings", [["", "List", "#/outings"], ["notebook", "Field notebook", "#/outings?view=notebook"], ["numbers", "In numbers", "#/outings?view=numbers"]], active);
  }
  // Species: four tabs, each with its own ways to look (a small switch under the intro): the guide
  // by family or A–Z; the life list as a list, a tree or a night sky; the calls, or a day in the
  // marsh; the cabinet and the plates.
  function speciesGroups() {
    const m = A.model, has = (id) => A.views.some((v) => v.id === id);
    const calls = GP.calls && m.species.some((x) => x.call);
    return [
      ["guide", "Guide", [["family", "By family", "#/species"], ["az", "A–Z", "#/species?view=az"]]],
      ["life", "Life list", [["life", "List", "#/species?view=life"], GP.treeOfLife && ["tree", "Tree", "#/species?view=tree"], has("sky") && ["sky", "Night sky", "#/sky"]].filter(Boolean)],
      calls && ["calls", "Calls", [["calls", "Every call", "#/species?view=calls"], has("day") && ["day", "A day in the marsh", "#/day"]].filter(Boolean)],
      (GP.cabinet || has("plates")) && ["shelves", GP.cabinet && has("plates") ? 'Cabinet<span class="t-long"> &amp; plates</span>' : GP.cabinet ? "Cabinet" : "Plates", [GP.cabinet && ["cabinet", "Cabinet", "#/species?view=cabinet"], has("plates") && ["plates", "Plates", "#/plates"]].filter(Boolean)],
    ].filter(Boolean);
  }
  const groupOf = (view) => speciesGroups().find((g) => g[2].some((v) => v[0] === view)) || speciesGroups()[0];
  function speciesTabs(view) {
    const g = groupOf(view);
    return tabs("Species", speciesGroups().map(([id, l, views]) => [id, l, views[0][2]]), g[0]);
  }
  // the switch between one tab's views (none when it has only one)
  function speciesViews(view) {
    const g = groupOf(view);
    return g[2].length > 1 ? tabs(`${g[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&")}: how to look`, g[2], view, "sub") : "";
  }
  // The Gallery: the grid, or every photograph on one canvas.
  function viewSwitch(active) {
    if (!A.views.some((v) => v.id === "universe")) return "";
    return tabs("Gallery", [["grid", "Grid", "#/gallery", ICON.grid, "The grid"], ["universe", "Universe", "#/universe", ICON.orbit, "Every photograph on one canvas"]], active, "with-icons");
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
  // The logo is the way home; registered views (Exhibitions, Universe) slot in beside these.
  const NAV = [["gallery", "Gallery"], ["species", "Species"], ["outings", "Outings"]];
  // A phone keeps these in a tab bar at the foot of the screen, in reach of a thumb; a page that
  // belongs to one of them lights its tab. Sections without a tab are in the menu.
  const TABS = [["", "Home", "home"], ["gallery", "Gallery", "grid"], ["rooms", "Exhibitions", "frame"], ["species", "Species", "feather"], ["outings", "Outings", "compass"]];
  const TAB_OF = { universe: "gallery", photo: "gallery", journal: "outings", story: "outings", sky: "species", plates: "species", day: "species" };
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
    A.nav = nav;
    const has = (id) => !id || nav.some((n) => n[0] === id);
    const tabs = TABS.filter(([id]) => has(id));
    A.root.innerHTML = `<a class="visually-hidden" href="#gp-main">Skip to content</a>
<header class="gp-head"><div class="wrap">
  <a class="gp-mark" href="#/"><b>${esc(s.title || "Georgiadis Photography")}</b><span>${esc(s.tagline || "Wildlife of Central Florida")}</span></a>
  <nav class="gp-nav" aria-label="Sections">${nav.map(([id, l]) => `<a href="#/${id}" data-nav="${id}">${esc(l)}</a>`).join("")}</nav>
  <div class="gp-tools">
    ${GP.sky ? GP.sky.button() : ""}
    <button class="gp-find" data-act="search" title="Search (/)" aria-label="Search the archive">${ICON.search}<span>Search</span><kbd>/</kbd></button>
    <button class="icon-btn gp-play" data-act="exhibit" title="Play an exhibition (E)" aria-label="Play an exhibition">${ICON.play}</button>
    <button class="icon-btn gp-menu-btn" data-act="menu" aria-haspopup="dialog" aria-expanded="false" title="Settings and more" aria-label="Settings and more">${ICON.menu}</button>
  </div>
</div></header>
<main id="gp-main" tabindex="-1"></main>
${footer(nav)}
<nav class="gp-tabs" aria-label="Sections" style="--n:${tabs.length}">${tabs.map(([id, l, ic]) => `<a href="#/${id}" data-tab="${id}">${ICON[ic]}<span>${esc(l)}</span></a>`).join("")}</nav>
<button class="to-top icon-btn" data-act="top" aria-label="Back to top" title="Back to top">${ICON.up}</button>
<div class="scroll-shield" aria-hidden="true"></div>`;
    paintTheme();
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
  <div class="foot-col"><h3 class="sc">Look &amp; listen</h3>
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
  function themeChoice() { const t = store.get("gp-theme"); return t === "light" || t === "dark" ? t : "auto"; }
  function paintTheme() {
    const v = themeChoice();
    for (const b of $$('[data-act="theme-set"]')) b.setAttribute("aria-pressed", String(b.dataset.v === v));
  }
  function setTheme(v) {
    const apply = () => {
      if (v === "light" || v === "dark") document.documentElement.setAttribute("data-theme", v);
      else document.documentElement.removeAttribute("data-theme");
      store.set("gp-theme", v === "light" || v === "dark" ? v : "auto");
      paintTheme();
    };
    if (document.startViewTransition && !reduced()) quiet(document.startViewTransition(apply)); else apply();
  }
  function currentTheme() {
    const t = document.documentElement.getAttribute("data-theme");
    return t || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    const apply = () => { document.documentElement.setAttribute("data-theme", next); store.set("gp-theme", next); paintTheme(); };
    if (document.startViewTransition && !reduced()) quiet(document.startViewTransition(apply)); else apply();
  }
  /* ---------- the menu: settings, the other pages, a few actions ---------- */
  // Settings are switches beside the same buttons the header used to carry, so each feature's
  // own code still paints and toggles them; a click anywhere on a row presses its button.
  function menuHtml() {
    const has = (id) => A.views.some((v) => v.id === id);
    const tabbed = new Set(TABS.map((t) => t[0]));
    const pages = (A.nav || []).filter(([id]) => !tabbed.has(id)); // a phone's tab bar has no room for these
    const calls = GP.calls && GP.calls.available();
    // Every page is in a section's tabs (and found by the search), so the menu keeps only what is
    // yours, how the site looks and sounds, and a few things to do. A phone's tab bar has no room
    // for the Workshop's own pages, so they stay listed here.
    const sw = (btn, t, sub) => (btn ? `<div class="mn-row" data-mn-row>${btn}<span class="mn-l"><b>${t}</b><small>${sub}</small></span><span class="mn-sw" aria-hidden="true"></span></div>` : "");
    const act = (a, ic, t, tip) => `<button class="mn-act" data-act="${a}" data-mn-close title="${tip}">${ic}<span>${t}</span></button>`;
    const v = themeChoice();
    return `<div class="gp-menu" id="gp-menu" role="dialog" aria-label="Settings and more" tabindex="-1">
  ${pages.length ? `<section class="mn-sec"><h3 class="sc">Pages</h3><div class="mn-links">${pages.map(([id, l]) => `<a class="mn-page" href="#/${id}">${esc(l)}</a>`).join("")}</div></section>` : ""}
  <section class="mn-sec"><h3 class="sc">Display</h3>
    <div class="mn-row mn-theme"><span class="mn-ic" aria-hidden="true">${ICON.moon}</span><span class="mn-l"><b>Light or dark</b></span><span class="mn-seg" role="group" aria-label="Light or dark">${[["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]].map(([k, l]) => `<button type="button" data-act="theme-set" data-v="${k}" aria-pressed="${v === k}">${l}</button>`).join("")}</span></div>
    ${sw(burstButton(), "Open bursts", "A tile for every frame of every burst")}
    ${GP.fx ? sw(GP.fx.depthButton(), "Depth", "Subjects stand out a little as you move") : ""}
  </section>
  ${calls || GP.scape ? `<section class="mn-sec"><h3 class="sc">Sound</h3>
    ${calls ? sw(GP.calls.button(), "Bird calls", "Each species' call, beside its photographs") : ""}
    ${GP.scape ? sw(GP.scape.button(), "Soundscape", "The place each photograph was made") : ""}
  </section>` : ""}
  <section class="mn-sec mn-acts">
    ${GP.visitor && !A.workshop ? `<a class="mn-act" href="#/rooms/favourites" data-mn-close title="Photographs you have saved (L in the viewer)">${ICON.heart}<span>Your favourites</span></a>` : ""}
    ${act("exhibit", ICON.play, "Play an exhibition", "Play an exhibition (E)")}
    ${act("surprise", ICON.shuffle, "Surprise me", "A random photograph (R)")}
    ${GP.newsletter && GP.newsletter.button() ? act("newsletter", ICON.mail, "Email dispatches", "A short email when a new outing goes up") : ""}
    ${act("keys", ICON.keys, "Keyboard shortcuts", "Keyboard shortcuts (?)")}
  </section>
</div>`;
  }
  function openMenu() {
    const btn = $(".gp-menu-btn", A.root), head = $(".gp-head", A.root);
    if (!btn || !head || $("#gp-menu")) return;
    head.classList.remove("tucked");
    const box = document.createElement("div");
    box.innerHTML = menuHtml();
    const p = box.firstElementChild;
    head.after(p);
    btn.setAttribute("aria-expanded", "true");
    p.addEventListener("focusout", (e) => { if (e.relatedTarget && !p.contains(e.relatedTarget) && e.relatedTarget !== btn) closeMenu(false); });
    requestAnimationFrame(() => p.classList.add("on"));
    p.focus({ preventScroll: true });
  }
  function closeMenu(restore = true) {
    const p = $("#gp-menu");
    if (!p) return;
    const btn = $(".gp-menu-btn", A.root);
    const had = p.contains(document.activeElement);
    p.removeAttribute("id");
    p.classList.remove("on");
    setTimeout(() => p.remove(), reduced() ? 0 : 200);
    if (btn) { btn.setAttribute("aria-expanded", "false"); if (restore && had) btn.focus({ preventScroll: true }); }
  }
  function toggleMenu() { if ($("#gp-menu")) closeMenu(); else openMenu(); }
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
    qReset();
    if (A.resAC) { A.resAC.abort(); A.resAC = null; }
    A.ff = null; // a filtered gallery sets its frame filter as it builds its list
    tipFor(null);
    if (GP.tint) GP.tint.page(null);
    // Listeners a view adds to the page live only until the next view replaces it.
    if (A.viewAC) A.viewAC.abort();
    A.viewAC = new AbortController();
    const signal = A.viewAC.signal;
    A.ctx.clear();
    ctxBase.clear();
    const main = $("#gp-main");
    const [v, a, b] = r.parts;
    $$(".gp-nav a").forEach((n) => n.toggleAttribute("aria-current", false));
    const navKey = v ? TAB_OF[v] || v : "";
    const navEl = $(`.gp-nav a[data-nav="${navKey}"]`);
    if (navEl) navEl.setAttribute("aria-current", navKey === (v || "") ? "page" : "true");
    const tabKey = v ? TAB_OF[v] || v : "";
    $$(".gp-tabs a").forEach((n) => n.toggleAttribute("aria-current", false));
    const tabEl = $(`.gp-tabs a[data-tab="${tabKey}"]`);
    if (tabEl) tabEl.setAttribute("aria-current", tabKey === (v || "") ? "page" : "true");
    closeMenu(false);
    document.documentElement.dataset.view = v || "home";
    let html = "", after = null, title = "", full = false;
    const ext = A.views.find((x) => x.id === (v || ""));
    try {
      if (ext) { const res = ext.render({ parts: r.parts, q: r.q, model: A.model, h: helpers, signal }); html = typeof res === "string" ? res : res.html; after = res.after; title = res.title != null ? res.title : ext.label; full = !!res.full; }
      else if (v === "gallery") ({ html, after, title } = viewGallery(r.q));
      else if (v === "outings" && a) ({ html, after, title } = viewOuting(a));
      else if (v === "outings" && (r.q.get("view") === "notebook" || r.q.get("view") === "numbers")) ({ html, after, title } = viewJournal(r.q, r.q.get("view")));
      else if (v === "outings") ({ html, after, title } = viewOutings());
      else if (v === "species" && a) ({ html, after, title } = viewSpecies(a));
      else if (v === "species") ({ html, after, title } = viewSpeciesIndex(r.q));
      else if (v === "journal") { location.replace(r.q.get("tree") ? hashFor(["species"], new URLSearchParams({ view: "tree" })) : hashFor(["outings"], new URLSearchParams({ view: r.q.get("view") === "numbers" ? "numbers" : "notebook" }))); return; }
      else if (v === "photo" && a) { location.replace(hashFor(["gallery"], new URLSearchParams({ p: a }))); return; }
      else ({ html, after, title } = viewMissing());
    } catch (e) {
      console.error(e);
      html = `<div class="wrap"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p></div></div>`;
    }
    void b;
    main.innerHTML = html;
    if (innerWidth <= 760) { const cur = main.querySelector(".pg-tabs [aria-current]"), box = cur && cur.closest(".pg-tabs"); if (box && box.scrollWidth > box.clientWidth + 1) box.scrollLeft = Math.max(0, cur.offsetLeft - 28); }
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
  const LIGHTS = ["Golden hour", "Blue hour", "Morning", "Midday", "Afternoon", "Night"];
  const SWATCH = { red: "#c4402f", orange: "#e07b25", yellow: "#e6c23a", green: "#4f8a3a", teal: "#2c8c8c", blue: "#2f6db3", purple: "#7a4fa3", pink: "#e58fb5", brown: "#7a5232", white: "#f4f2ec", black: "#151515", grey: "#8c8c88" };
  // The panel's filters besides type and rating: one value each, each with its own key in the
  // address, so a filtered gallery can be shared or bookmarked.
  const FACETS = [
    { k: "l", label: "Light", opts: () => LIGHTS.map((v) => [v, v]), test: (v) => (x) => x.light === v },
    { k: "b", label: "Doing", opts: () => M.BEHAVIOURS.map(([v]) => [v, v]), test: (v) => (x) => (x.behaviours || []).includes(v) },
    { k: "c", label: "Colour", opts: () => Object.keys(SWATCH).map((v) => [v, v[0].toUpperCase() + v.slice(1)]), test: (v) => { const f = M.COLOURS && M.COLOURS[v]; return f ? (x) => (x.hsl || []).slice(0, 3).some(f) : () => true; }, chip: (v, l) => `<i class="sw" style="background:${SWATCH[v]}"></i>${l}`, name: (v, l) => l + " tones" },
    { k: "mo", label: "Month", opts: () => { const have = new Set(A.model.photos.map((x) => x.month)); return MONTHS.map((m, i) => [String(i + 1), MON[i]]).filter(([v]) => have.has(+v)); }, test: (v) => (x) => x.month === +v, name: (v) => MONTHS[+v - 1] || v },
    { k: "y", label: "Year", opts: () => [...new Set(A.model.photos.map((x) => x.year).filter(Boolean))].sort().map((y) => [String(y), String(y)]), test: (v) => (x) => x.year === +v },
  ];
  const FILTER_KEYS = ["g", "r", "sort", "all"].concat(FACETS.map((f) => f.k));
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
    const fv = FACETS.map((f) => (q.get(f.k) ? f.test(q.get(f.k)) : null)).filter(Boolean);
    const pass = (x) => {
      if (fresh && !GP.visitor.isNew(x.id)) return false;
      if (g === "small" ? !["insect", "other"].includes(x.group) : g && x.group !== g) return false;
      if (rmin && x.rating < rmin) return false;
      for (const t of fv) if (!t(x)) return false;
      return sq.test(x);
    };
    const filtering = !!(fresh || g || rmin || fv.length || !sq.empty);
    let list;
    if (all) list = m.photos.filter(pass);
    else if (!filtering) list = m.heroes.slice();
    else {
      // Filtered: a burst is in when any of its frames passes, and shows only the frames that
      // do; its tile shows the first of them (GP.model.framesOf).
      const done = new Set();
      list = [];
      for (const x of m.photos) {
        const k = x.burst ? x.burst.id : x.id;
        if (done.has(k) || !pass(x)) continue;
        done.add(k);
        list.push(x.burst ? GP.model.framesOf(x.burst, pass)[0] : x);
      }
    }
    // tiles, hovering and the viewer show the same frames of each burst
    A.ff = filtering && !all ? pass : null;
    const byT = (a, b) => a.t.localeCompare(b.t) || (a.frame || 0) - (b.frame || 0);
    if (sort === "old") list.sort(byT);
    else if (sort === "best") list.sort((a, b) => b.score - a.score);
    else if (sort === "colour") list.sort((a, b) => hueKey(a) - hueKey(b));
    else list.sort((a, b) => -byT(a, b));
    return { list, sq, sort, all, g, rmin, query, fresh: !!fresh, q };
  }
  // The filters in force, as [address key, label] pairs, for the chips above the results.
  function activeFilters(q) {
    const out = [], query = q.get("q") || "";
    const g = q.get("g"); if (g) out.push(["g", (GROUPS.find((x) => x[0] === g) || [g, g])[1]]);
    const r = +(q.get("r") || 0); if (r) out.push(["r", `★ ${r}${r < 5 ? "+" : ""}`]);
    for (const f of FACETS) {
      const v = q.get(f.k);
      if (!v) continue;
      const opt = f.opts().find((o) => o[0] === v), l = opt ? opt[1] : v;
      out.push([f.k, f.name ? f.name(v, l) : l]);
    }
    const so = q.get("sort");
    if (so && so !== (query ? "best" : "new")) out.push(["sort", (SORTS.find((x) => x[0] === so) || [so, so])[1]]);
    if (q.get("all") === "1") out.push(["all", "Every frame"]);
    return out;
  }
  function densButtons() {
    return `<span class="dens" role="group" aria-label="Photograph size">${[["s", "Small"], ["m", "Medium"], ["l", "Large"]].map(([d, l]) => `<button class="dens-b" data-dens="${d}" aria-pressed="${density() === d}" title="${l} photographs" aria-label="${l} photographs"><i></i></button>`).join("")}</span>`;
  }
  // Everything that narrows or orders the gallery, in one panel: a popover under the Filters
  // button, or a sheet from the foot of the screen on a phone. Changes apply as they're made.
  function filterPanel(q) {
    const g = q.get("g") || "", r = +(q.get("r") || 0), query = q.get("q") || "", sort = q.get("sort") || (query ? "best" : "new"), all = q.get("all") === "1";
    const sec = (label, body, cls = "") => `<section class="${cls}"><h3 class="sc">${label}</h3><div class="chips">${body}</div></section>`;
    return `<div class="gfp-scrim" data-gf="close" aria-hidden="true"></div>
<div class="gfp" id="gp-filters" role="dialog" aria-label="Filters" tabindex="-1" hidden>
  <div class="gfp-h"><b>Filters</b><span class="gfp-n"></span><button class="link gfp-clear" type="button" data-gf="clear">Clear all</button><button class="icon-btn" type="button" data-gf="close" aria-label="Close filters">${ICON.close}</button></div>
  <div class="gfp-b">
    ${sec("Type", GROUPS.map(([v, l]) => chip(esc(l), `data-g="${v}"`, g === v)).join(""))}
    ${sec("Rating", [0, 3, 4, 5].map((n) => chip(n ? `★ ${n}${n < 5 ? "+" : ""}` : "Any", `data-r="${n}"`, r === n)).join(""))}
    ${FACETS.map((f) => { const v = q.get(f.k) || ""; return sec(f.label, chip("Any", `data-f="${f.k}" data-v=""`, !v) + f.opts().map(([o, l]) => chip(f.chip ? f.chip(o, esc(l)) : esc(l), `data-f="${f.k}" data-v="${esc(o)}"`, v === o)).join("")); }).join("")}
    ${sec("Order", SORTS.map(([v, l]) => chip(esc(l), `data-sort="${v}"`, sort === v)).join(""))}
    ${sec("Show", chip("Photographs", 'data-all="0"', !all) + chip("Every frame", 'data-all="1"', all))}
    <section class="gfp-phone"><h3 class="sc">Photograph size</h3>${densButtons()}</section>
  </div>
  <div class="gfp-f"><button class="chip gfp-phone" type="button" data-gal="surprise">${ICON.shuffle} Surprise me</button><button class="chip gfp-phone" type="button" data-gal="play">${ICON.play} Play these</button><button class="btn primary gfp-done" type="button" data-gf="close">Show <span class="gfp-n2"></span></button></div>
</div>`;
  }
  // The panel's buttons, the Filters count and the totals follow the address after each change.
  function paintFilters(q, n, all) {
    const g = q.get("g") || "", r = +(q.get("r") || 0), query = q.get("q") || "", sort = q.get("sort") || (query ? "best" : "new");
    $$(".gfp [data-g]").forEach((c) => c.setAttribute("aria-pressed", String(g === c.dataset.g)));
    $$(".gfp [data-r]").forEach((c) => c.setAttribute("aria-pressed", String(r === +c.dataset.r)));
    $$(".gfp [data-f]").forEach((c) => c.setAttribute("aria-pressed", String((q.get(c.dataset.f) || "") === c.dataset.v)));
    $$(".gfp [data-sort]").forEach((c) => c.setAttribute("aria-pressed", String(sort === c.dataset.sort)));
    $$(".gfp [data-all]").forEach((c) => c.setAttribute("aria-pressed", String((c.dataset.all === "1") === all)));
    const k = activeFilters(q).length, b = $(".tb-n");
    if (b) { b.textContent = k; b.hidden = !k; }
    const txt = plural(n, all ? "frame" : "photograph");
    $$(".gfp-n").forEach((e) => (e.textContent = txt));
    $$(".gfp-n2").forEach((e) => (e.textContent = txt));
  }
  function viewGallery(q) {
    const { list, sq, sort, all, query, fresh } = galleryList(q);
    const nf = activeFilters(q).length, st = A.model.stats;
    const html = `<div class="wrap">${pageHeader({ kicker: "The archive", title: "Gallery", intro: `Every photograph in the archive: ${fmtN(st.photos)} from ${plural(st.outings, "outing")}.`, tabs: viewSwitch("grid"), cls: "compact" })}</div>
<div class="toolbar"><div class="wrap tb-row">
  <label class="search">${ICON.search}<span class="visually-hidden">Search</span><input id="gp-q" type="search" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="gp-sugg" placeholder="Try “herons in flight”, “golden hour”, “otters”" value="${esc(query)}"><div class="sugg" id="gp-sugg" role="listbox" hidden></div></label>
  <button class="btn tb-filters" type="button" data-gal="filters" aria-haspopup="dialog" aria-expanded="false" aria-controls="gp-filters">${ICON.sliders}<span>Filters</span><b class="tb-n"${nf ? "" : " hidden"}>${nf}</b></button>
  <span class="tb-tools">${densButtons()}<button class="chip" type="button" data-gal="surprise" title="A random photograph (R)">${ICON.shuffle} Surprise me</button><button class="chip" type="button" data-gal="play" title="Play these as an exhibition">${ICON.play} Play these</button></span>
</div></div>
${filterPanel(q)}
<div class="wrap page" style="padding-top:0">${fresh ? `<div class="gal-new"><span><b>New since your last visit.</b> ${plural(list.length, "photograph")} arrived since ${GP.visitor.previousVisit ? esc(fmtDate(GP.visitor.previousVisit)) : "you were last here"}.</span><a class="btn ghost" href="#/gallery">Show everything</a></div>` : ""}<div id="gp-results">${galleryResults(list, sq, sort, all, query, q)}</div></div>`;
    const after = (main, signal) => {
      const input = $("#gp-q", main), panel = $("#gp-filters", main), fbtn = $(".tb-filters", main), tb = $(".toolbar", main);
      paintFilters(q, list.length, all);
      if (innerWidth <= 640) input.placeholder = innerWidth <= 480 ? "Search" : "Try “herons in flight”";
      const tbh = () => document.documentElement.style.setProperty("--tb-h", tb.offsetHeight + "px");
      tbh();
      if ("ResizeObserver" in window) { const ro = new ResizeObserver(tbh); ro.observe(tb); signal.addEventListener("abort", () => ro.disconnect()); }
      let t;
      input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => updateGallery((qq) => { if (input.value.trim()) qq.set("q", input.value.trim()); else qq.delete("q"); }), 160); });
      input.addEventListener("keydown", (e) => { if (e.key === "Escape" && input.value) { input.value = ""; updateGallery((qq) => qq.delete("q")); e.stopPropagation(); } });
      suggestions(input, signal, () => updateGallery((qq) => { if (input.value.trim()) qq.set("q", input.value.trim()); else qq.delete("q"); }));
      // the panel
      const phone = () => innerWidth <= 860;
      const place = () => {
        if (phone()) { panel.style.top = panel.style.right = panel.style.maxHeight = ""; return; }
        const r = fbtn.getBoundingClientRect();
        panel.style.top = Math.round(r.bottom + 8) + "px";
        // the toolbar sits under the page's header until it sticks, so the panel fits what is left
        panel.style.maxHeight = Math.max(260, Math.round(innerHeight - r.bottom - 24)) + "px";
        panel.style.right = Math.max(12, Math.round(innerWidth - r.right)) + "px";
      };
      const isOpen = () => !panel.hidden && panel.classList.contains("on");
      const openP = () => {
        clearTimeout(panel._t);
        panel.hidden = false; place();
        fbtn.setAttribute("aria-expanded", "true");
        document.documentElement.classList.add("gp-sheet");
        requestAnimationFrame(() => panel.classList.add("on"));
        panel.focus({ preventScroll: true });
      };
      const closeP = (restore = true) => {
        if (panel.hidden) return;
        panel.classList.remove("on");
        fbtn.setAttribute("aria-expanded", "false");
        document.documentElement.classList.remove("gp-sheet");
        panel._t = setTimeout(() => { if (!panel.classList.contains("on")) panel.hidden = true; }, reduced() ? 0 : 260);
        if (restore && panel.contains(document.activeElement)) fbtn.focus({ preventScroll: true });
      };
      addEventListener("resize", () => { if (isOpen()) place(); }, { passive: true, signal });
      panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeP(); } });
      document.addEventListener("pointerdown", (e) => {
        if (!isOpen() || phone() || !e.target.closest) return;
        if (e.target.closest("#gp-filters, .tb-filters")) return;
        closeP(false); A.eatClick = performance.now() + 500;
      }, { capture: true, signal });
      signal.addEventListener("abort", () => document.documentElement.classList.remove("gp-sheet"));
      main.addEventListener("click", (e) => {
        const d = e.target.closest("[data-dens]");
        if (d) { setDensity(d.dataset.dens); $$("[data-dens]", main).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dens === d.dataset.dens))); return; }
        const gf = e.target.closest("[data-gf]");
        if (gf) {
          if (gf.dataset.gf === "close") closeP();
          else if (gf.dataset.gf === "clear") updateGallery((qq) => FILTER_KEYS.forEach((k) => qq.delete(k)));
          return;
        }
        const ga = e.target.closest("[data-gal]");
        if (ga) {
          if (ga.dataset.gal === "filters") { if (isOpen()) closeP(); else openP(); }
          else if (ga.dataset.gal === "surprise") { closeP(false); surprise(); }
          else { closeP(false); const l = galleryList(parseHash().q).list; if (l.length) GP.exhibit(l, { title: (parseHash().q.get("q") ? `“${parseHash().q.get("q")}”` : "The gallery") }); }
          return;
        }
        const c = e.target.closest(".gfp .chip, .result-chips .chip");
        if (!c) return;
        if (c.dataset.g != null) updateGallery((qq) => (c.dataset.g ? qq.set("g", c.dataset.g) : qq.delete("g")));
        else if (c.dataset.r != null) updateGallery((qq) => (+c.dataset.r ? qq.set("r", c.dataset.r) : qq.delete("r")));
        else if (c.dataset.f != null) updateGallery((qq) => (c.dataset.v ? qq.set(c.dataset.f, c.dataset.v) : qq.delete(c.dataset.f)));
        else if (c.dataset.sort != null) updateGallery((qq) => (c.dataset.sort === (qq.get("q") ? "best" : "new") ? qq.delete("sort") : qq.set("sort", c.dataset.sort)));
        else if (c.dataset.all != null) updateGallery((qq) => (c.dataset.all === "1" ? qq.set("all", "1") : qq.delete("all")));
        else if (c.dataset.unset != null) updateGallery((qq) => qq.delete(c.dataset.unset));
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
      armResults($("#gp-results", main));
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
    rowMemo = 0;
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
  // An outing's day, as a small card in the run of photographs where that outing begins.
  function dayMark(oid, n, x) {
    const o = A.model.outingById.get(oid), iso = o ? o.date : x.t;
    const d = ymd(iso) || [0, 1, 1];
    return `<a class="day-mark" href="#/outings/${esc(oid)}" style="--ar:0.62" aria-label="${esc(`${fmtDate(iso)}${o && o.type ? ", " + o.type : ""}: ${plural(n, "photograph")}`)}"><b>${d[2]}</b><span class="dm-m">${esc(MON[d[1] - 1])} · ${esc(weekday(iso).slice(0, 3))}</span>${o && o.type ? `<span class="dm-t">${esc(o.type)}</span>` : ""}<span class="dm-n">${plural(n, "photo")}</span></a>`;
  }
  // Long grids are drawn a screenful at a time: the first part at once, the rest in small batches
  // while the page is idle, and straight away wherever the visitor scrolls or jumps to. Each batch
  // is appended to its grid in order, so a grid only ever grows at its end.
  const Q = { jobs: [], t: 0, idle: false, staged: [] };
  const CHUNK = 36;
  function qReset() {
    Q.jobs = [];
    if (Q.t) { if (Q.idle && window.cancelIdleCallback) cancelIdleCallback(Q.t); else clearTimeout(Q.t); Q.t = 0; }
  }
  function qStep() {
    const j = Q.jobs.shift();
    if (!j || !j.el.isConnected) return;
    j.el.insertAdjacentHTML("beforeend", j.html);
    if (j.last) { j.el.style.minHeight = ""; delete j.el.dataset.pending; }
  }
  function qPump() {
    Q.t = 0;
    const t0 = performance.now();
    do qStep(); while (Q.jobs.length && performance.now() - t0 < 10);
    if (Q.jobs.length) qLater();
  }
  function qLater() {
    if (Q.t) return;
    Q.idle = !!window.requestIdleCallback;
    Q.t = Q.idle ? requestIdleCallback(qPump, { timeout: 250 }) : setTimeout(qPump, 40);
  }
  // draw every batch still waiting (before the grids are redrawn, or the page held in place)
  function fillAll() { while (Q.jobs.length) qStep(); }
  function fillTo(el) { const p = +el.dataset.part; while (Q.jobs.length && Q.jobs[0].part <= p) qStep(); }
  function fillNear() {
    while (Q.jobs.length) {
      const j = Q.jobs[0], lc = j.el.lastElementChild;
      const y = lc ? lc.getBoundingClientRect().bottom : j.el.getBoundingClientRect().top;
      if (y > innerHeight * 2.5) break;
      qStep();
    }
  }
  // roughly how tall a grid of these photographs will be at this width, to hold its place
  function estHeight(items, width) {
    const rh = rowH(), gap = innerWidth <= 640 ? 4 : 8;
    let w = 0, rows = 1;
    for (const x of items) { const tw = rh * (x.ar || 1.5) + gap; if (w && w + tw > width) { rows++; w = tw; } else w += tw; }
    return Math.round(rows * (rh * 1.1 + gap));
  }
  // After the results are in the page: queue what was held back and give the scrubber its legs.
  function armResults(root) {
    if (!root) return;
    qReset();
    if (A.resAC) A.resAC.abort();
    A.resAC = new AbortController();
    const signal = A.resAC.signal, staged = Q.staged;
    Q.staged = [];
    for (const st of staged) {
      const el = root.querySelector(`.flow[data-ctx="${st.k}"][data-part="${st.part}"]`);
      if (!el) continue;
      if (st.chunks.length) { el.dataset.pending = "1"; el.style.minHeight = Math.max(0, estHeight(st.items, el.clientWidth || root.clientWidth) ) + "px"; }
      st.chunks.forEach((html, i) => Q.jobs.push({ el, html, part: st.part, last: i === st.chunks.length - 1 }));
    }
    if (Q.jobs.length) {
      qLater();
      let fr = 0;
      addEventListener("scroll", () => { if (Q.jobs.length && !fr) fr = requestAnimationFrame(() => { fr = 0; fillNear(); }); }, { passive: true, signal });
    }
    mountScrubber(root, signal);
  }
  // A grid's pieces (tiles, and in date order a day card where each outing begins), split into
  // what is drawn now and the batches that follow.
  function pieces(items, o, marks, counts) {
    const out = [];
    let last = null;
    for (const x of expand(items, o)) {
      if (marks && x.oid !== last) { out.push(dayMark(x.oid, counts.get(x.oid) || 0, x)); last = x.oid; }
      out.push(tile(x, o));
    }
    return out;
  }
  function galleryResults(list, sq, sort, all, query, q) {
    q = q || parseHash().q;
    const chips = activeFilters(q).map(([k, l]) => `<button class="chip" data-unset="${k}" title="Remove" aria-label="Remove ${esc(l)}" aria-pressed="true">${esc(l)} ×</button>`).join("")
      + sq.terms.map((t, i) => `<button class="chip" data-drop="${i}" title="Remove" aria-pressed="true">${esc(t.label)} ×</button>`).join("");
    const head = `<div class="result-line"><span class="count" aria-live="polite">${plural(list.length, all ? "frame" : "photograph")}${query ? "" : all ? "" : A.expand ? " · bursts opened" : " · bursts stacked"}</span>${chips ? `<div class="result-chips understood chips" aria-label="Filters in force">${chips}</div>` : ""}</div>`;
    Q.staged = [];
    if (!list.length) return head + `<div class="empty"><h2>Nothing matches yet</h2><p>Try fewer words or filters, or a species, month, behaviour or colour: “egrets”, “March”, “fishing”, “golden hour”, “red”.</p></div>`;
    const o = { stacks: !all };
    // drawing everything at once (holding the page in place after a rebuild) or a screenful
    let budget = A.keepScroll ? Infinity : innerWidth <= 640 ? 40 : 110;
    const split = (k, part, items, ps) => {
      const now = Math.max(0, Math.min(ps.length, budget));
      budget -= now;
      const rest = ps.slice(now), chunks = [];
      for (let i = 0; i < rest.length; i += CHUNK) chunks.push(rest.slice(i, i + CHUNK).join(""));
      if (chunks.length) Q.staged.push({ k, part, items, chunks });
      return ps.slice(0, now).join("");
    };
    if ((sort === "new" || sort === "old") && !query) {
      // by month, each outing's photographs following a card with its day
      const months = [];
      for (const x of list) {
        const key = `${x.year}-${String(x.month).padStart(2, "0")}`;
        let mo = months[months.length - 1];
        if (!mo || mo.key !== key) months.push((mo = { key, y: x.year, m: x.month, items: [] }));
        mo.items.push(x);
      }
      const counts = new Map();
      for (const x of list) counts.set(x.oid, (counts.get(x.oid) || 0) + 1);
      const k = regCtx(expand(list, o));
      ctxBase.set(k, { list, o, parts: months.map((mo) => mo.items), paint: (items) => pieces(items, o, true, counts).join("") });
      const secs = months.map((mo, i) => {
        const outs = new Set(mo.items.map((x) => x.oid)).size, label = `${MONTHS[mo.m - 1] || ""} ${mo.y}`;
        const inner = split(k, i, mo.items, pieces(mo.items, o, true, counts));
        return `<section class="sec mon" data-month="${mo.key}" data-label="${esc(label)}"><div class="sec-h"><h2>${esc(label)}</h2><span class="meta">${plural(outs, "outing")} · ${plural(mo.items.length, all ? "frame" : "photograph")}</span></div><div class="flow" data-ctx="${k}" data-part="${i}">${inner}</div></section>`;
      }).join("");
      const yearAt = new Map();
      months.forEach((mo, i) => { if (!yearAt.has(mo.y)) yearAt.set(mo.y, i); });
      const n = months.length;
      const scrub = n >= 3 ? `<div class="dscrub" aria-hidden="false"><div class="ds-track" aria-hidden="true">${months.map((mo, i) => `<i class="ds-tick${yearAt.get(mo.y) === i ? " y" : ""}" style="--k:${(i / n).toFixed(4)}"></i>`).join("")}${[...yearAt].map(([y, i]) => `<span class="ds-year" style="--k:${(i / n).toFixed(4)}">${y}</span>`).join("")}</div><div class="ds-thumb" role="slider" tabindex="0" aria-label="Jump to a month" aria-valuemin="0" aria-valuemax="${n - 1}" aria-valuenow="0"><span class="ds-tip"></span></div></div>` : "";
      return head + secs + scrub;
    }
    const k = regCtx(expand(list, o));
    ctxBase.set(k, { list, o, parts: [list] });
    return head + `<div style="margin-top:14px"><div class="flow" data-ctx="${k}" data-part="0">${split(k, 0, list, pieces(list, o, false))}</div></div>`;
  }
  // The date scrubber: a rail down the right edge with a mark for each month, shown while the
  // page moves (or the pointer nears the edge). Drag it, or use the arrow keys on it, to go
  // straight to any month; its label names the month at the top of the screen.
  function mountScrubber(root, signal) {
    const el = root.querySelector(".dscrub");
    if (!el) return;
    const secs = [...root.querySelectorAll(".sec.mon")], n = secs.length;
    const thumb = el.querySelector(".ds-thumb"), tip = el.querySelector(".ds-tip");
    const tb = $(".toolbar"), head = $(".gp-head");
    let drag = false, over = false, hideT = 0, cur = -1, raf = 0;
    // Where each month starts and how tall it is, in page coordinates, read once and again only
    // when something changes size: reading them on every frame would make the browser lay the
    // page out in the middle of a scroll whenever new photographs had just been drawn in.
    let tops = [], hs = [], tbH = 0, headH = 0, th = 0, H = 0, dirty = true;
    const measure = () => {
      const sy = window.scrollY;
      tops = secs.map((s) => s.getBoundingClientRect().top + sy);
      hs = secs.map((s) => s.offsetHeight);
      tbH = tb ? tb.offsetHeight : 64; headH = head ? head.offsetHeight : 64;
      th = thumb.offsetHeight; H = el.clientHeight;
      dirty = false;
    };
    const line = () => (head && head.classList.contains("tucked") ? 0 : headH) + tbH + 6;
    const pos = () => {
      if (dirty) measure();
      const y = window.scrollY + line();
      for (let i = n - 1; i >= 0; i--) if (tops[i] <= y) return i + Math.min(0.999, (y - tops[i]) / Math.max(1, hs[i]));
      return 0;
    };
    if ("ResizeObserver" in window) {
      const ro = new ResizeObserver(() => { dirty = true; if (!raf) raf = requestAnimationFrame(paint); });
      secs.forEach((s) => ro.observe(s)); ro.observe(el); if (tb) ro.observe(tb);
      signal.addEventListener("abort", () => ro.disconnect());
    }
    const paint = () => {
      raf = 0;
      if (!("ResizeObserver" in window)) dirty = true;
      const p = pos(), i = Math.min(n - 1, Math.floor(p));
      thumb.style.transform = `translateY(${Math.round((p / n) * Math.max(0, H - th))}px)`;
      if (i !== cur) { cur = i; tip.textContent = secs[i].dataset.label; thumb.setAttribute("aria-valuenow", i); thumb.setAttribute("aria-valuetext", secs[i].dataset.label); }
    };
    const show = () => { clearTimeout(hideT); el.classList.add("on"); };
    const later = () => { clearTimeout(hideT); hideT = setTimeout(() => { if (!drag && !over && document.activeElement !== thumb) el.classList.remove("on"); }, 1500); };
    const jump = (p) => {
      p = Math.max(0, Math.min(n - 0.001, p));
      const i = Math.floor(p), s = secs[i];
      fillTo(s.querySelector(".flow"));
      if (p < 0.02) { window.scrollTo(0, 0); return; }
      const r = s.getBoundingClientRect(), y = window.scrollY + r.top + (p - i) * r.height;
      const down = y > window.scrollY;
      const off = (down ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64) + (tb ? tb.offsetHeight : 70) + 6;
      window.scrollTo(0, Math.max(0, y - off));
    };
    const fromY = (cy) => {
      const r = el.getBoundingClientRect(), th = thumb.offsetHeight;
      jump(((cy - r.top - th / 2) / Math.max(1, r.height - th)) * n);
    };
    addEventListener("scroll", () => {
      if (!raf) raf = requestAnimationFrame(paint);
      if (window.scrollY > 360) { show(); later(); } else if (!drag) el.classList.remove("on");
    }, { passive: true, signal });
    addEventListener("resize", () => { dirty = true; if (!raf) raf = requestAnimationFrame(paint); }, { passive: true, signal });
    document.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse" && e.clientX > innerWidth - 64 && window.scrollY > 360) { show(); later(); } }, { passive: true, signal });
    el.addEventListener("pointerenter", () => { over = true; show(); });
    el.addEventListener("pointerleave", () => { over = false; later(); });
    el.addEventListener("pointerdown", (e) => {
      if (!el.classList.contains("on")) return;
      e.preventDefault();
      drag = true; el.classList.add("drag");
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* already released */ }
      if (!thumb.contains(e.target) || e.pointerType !== "mouse") fromY(e.clientY);
      thumb._dy = thumb.contains(e.target) ? e.clientY - thumb.getBoundingClientRect().top - thumb.offsetHeight / 2 : 0;
    });
    el.addEventListener("pointermove", (e) => { if (drag) fromY(e.clientY - (thumb._dy || 0)); });
    const end = () => { if (!drag) return; drag = false; el.classList.remove("drag"); later(); };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
    thumb.addEventListener("keydown", (e) => {
      const p = pos(), i = Math.floor(p);
      let to = null;
      if (e.key === "ArrowDown" || e.key === "PageDown") to = i + 1;
      else if (e.key === "ArrowUp" || e.key === "PageUp") to = p - i > 0.04 ? i : i - 1;
      else if (e.key === "Home") to = 0;
      else if (e.key === "End") to = n - 1;
      if (to == null) return;
      e.preventDefault(); show();
      jump(Math.max(0, Math.min(n - 1, to)));
    });
    thumb.addEventListener("focus", show);
    thumb.addEventListener("blur", later);
    signal.addEventListener("abort", () => { clearTimeout(hideT); if (raf) cancelAnimationFrame(raf); });
    paint();
  }
  function updateGallery(fn) {
    setQuery(fn);
    const res = $("#gp-results");
    if (!res) return;
    const q = parseHash().q;
    const { list, sq, sort, all, query } = galleryList(q);
    paintFilters(q, list.length, all);
    // a new set of results starts at its top
    const tb = $(".toolbar"), top = res.getBoundingClientRect().top - (tb ? tb.getBoundingClientRect().bottom : 0) - 8;
    if (top < 0) window.scrollBy(0, top);
    flip(res, () => { qReset(); A.ctx.clear(); ctxBase.clear(); res.innerHTML = galleryResults(list, sq, sort, all, query, q); markLoaded(res); });
    armResults(res);
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
    return { html: `<div class="wrap page">${pageHead("The field diary", "Outings", `${plural(st.outings, "outing")} between ${esc(fmtDate(st.first))} and ${esc(fmtDate(st.last))}. Each date is a chapter.`, outingsTabs(""))}<div class="chapter-list">${body}</div></div>`, title: "Outings", after: mountShows };
  }
  const outCard = (x, k) => x && { href: `#/outings/${x.id}`, cover: x.cover ? cover(x.cover, 320) : "", kicker: `${k} · No. ${x.no}`, title: fmtDate(x.date), sub: x.title };
  function viewOuting(id) {
    const m = A.model, o = m.outingById.get(id);
    if (!o) return viewMissing();
    const i = m.outings.indexOf(o), prev = m.outings[i - 1], next = m.outings[i + 1];
    const list = o.photos.filter((x) => x.isHero).sort((a, b) => a.t.localeCompare(b.t));
    const who = o.companions.length > 1 ? ` · with ${o.companions.slice(1).join(", ")}` : "";
    const chorus = o.species.map((e) => m.speciesByKey.get(e.key)).filter((sp) => sp && sp.call).map((sp) => sp.slug);
    const timed = list.filter((x) => x.hasTime), span = timed.length > 1 ? [fmtTime(timed[0]), fmtTime(timed[timed.length - 1])] : null;
    const html = `<section class="chapter-hero">${o.cover ? `<img src="${esc(src(o.cover, Math.max(1400, window.innerWidth) * dpr()))}" alt="" style="object-position:${(o.cover.fp[0] * 100).toFixed(1)}% ${(o.cover.fp[1] * 100).toFixed(1)}%" data-open="${esc(o.cover.id)}">` : ""}<div class="wrap">${crumbs([["Outings", "#/outings"]], `Chapter ${o.no} of ${m.outings.length} · ${o.type}${who}`)}<h1>${esc(fmtDate(o.date))}</h1><div class="sc">${esc(weekday(o.date))} · ${plural(o.photos.length, "frame")} · ${plural(o.species.length, "species", "species")}</div></div></section>
<div class="wrap page">
  <div class="out-intro">${o.note ? `<p class="lede">${esc(o.note)}</p>` : `<p class="lede">${esc(o.title)}</p>`}
    <div class="sp-acts">${A.views.some((v) => v.id === "story") && list.some((x) => x.hasTime) ? `<a class="btn primary" href="#/story/${esc(o.id)}">Read it as a story ${ICON.arrow}</a>` : ""}<button class="btn" data-out="play">${ICON.play} Play this outing</button>${chorus.length ? `<button class="btn" data-out="chorus" aria-pressed="false">${ICON.play} Hear the day <span class="sc">${plural(chorus.length, "call")}</span></button>` : ""}${shareBtn(pageUrl("outing", o.id), `${fmtDate(o.date)} · ${A.site.title || "Georgiadis Photography"}`)}</div></div>
  <div class="sp-body${list.length <= 4 ? " few" : ""}">
    <section class="sp-photos" aria-label="Photographs">
      <div class="sec-h"><h2>Photographs</h2><span class="meta">${plural(list.length, "photograph")} · in the order they were made</span></div>
      ${flow(list)}
    </section>
    <aside class="sp-notes" aria-label="Field notes"><h2 class="sp-notes-h">Field notes</h2><div class="sp-notes-row">
      <div class="j-card sp-facts"><h2>The outing</h2><dl>
        <div><dt>Frames</dt><dd>${fmtN(o.photos.length)}</dd></div><div><dt>Species</dt><dd>${fmtN(o.species.length)}</dd></div>
        ${span ? `<div><dt>From</dt><dd class="d">${esc(span[0])}</dd></div><div><dt>To</dt><dd class="d">${esc(span[1])}</dd></div>` : ""}</dl>${o.companions.length > 1 ? `<p>With ${esc(o.companions.slice(1).join(", "))}</p>` : ""}</div>
      ${o.species.length ? `<div class="j-card"><h2>Species seen</h2><div class="chips">${o.species.map((s) => { const sp = m.speciesByKey.get(s.key); return sp ? `<a class="chip" href="#/species/${esc(sp.slug)}">${esc(sp.name)} <span class="n">${s.n}</span></a>` : ""; }).join("")}</div></div>` : ""}
    ${GP.notebook && list.length >= 8 ? `<div class="j-card ob"><h2>The day in colour</h2><p>Every frame's colours, in the order they were made</p>${GP.notebook.barcode(o.photos.filter((x) => x.pal && x.pal.length).slice().sort((a, b) => a.t.localeCompare(b.t)), { small: true, byHour: true, label: "The colours of this outing's frames in order" })}</div>` : ""}
    </div></aside>
  </div>
  ${dayLine(list)}
  ${pageFoot({ label: "Other chapters", prev: outCard(prev, "Previous chapter"), next: outCard(next, "Next chapter"), up: ["All outings", "#/outings"] })}
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
  // Every species by class, order and family, as nested lists.
  function taxonomy(m) {
    return [...m.tree.values()].sort((a, b) => b.n - a.n).map((c) => `<details${c.n > 20 ? " open" : ""}><summary><span class="lvl">Class</span><span class="nm">${esc(c.common)}</span><span class="binomial">${esc(c.name)}</span><span class="cnt">${plural(c.n, "species", "species")}</span></summary>${[...c.orders.values()].sort((a, b) => b.n - a.n).map((o) => `<details><summary><span class="lvl">Order</span><span class="nm">${esc(o.name)}</span><span class="cnt">${o.n}</span></summary>${[...o.families.values()].sort((a, b) => b.n - a.n).map((f) => `<details><summary><span class="lvl">Family</span><span class="nm">${esc(f.common)}</span><span class="binomial">${esc(f.name)}</span><span class="cnt">${f.n}</span></summary><div class="leaves">${f.species.map((s) => `<a class="leaf" href="#/species/${esc(s.slug)}">${cover(s.best, 160)}<span><b>${esc(s.name)}</b><i>${esc(s.bin || "")}</i></span></a>`).join("")}</div></details>`).join("")}</details>`).join("")}</details>`).join("");
  }
  const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500];
  function viewSpeciesIndex(q) {
    const m = A.model, cab = !!GP.cabinet, mode = q.get("view") || "family";
    const callN = GP.calls ? m.species.filter((x) => x.call).length : 0;
    const callList = callN ? m.species.filter((x) => x.call && x.best).sort((a, b) => (a.lifeNo || 999) - (b.lifeNo || 999) || a.name.localeCompare(b.name)) : [];
    const intros = {
      family: `${plural(m.life.length, "species", "species")} on the life list across ${plural(m.stats.families, "family", "families")}, plus ${fmtN(m.species.length - m.life.length)} more photographed as captive animals or not identified to species.`,
      cabinet: "The collection as a cabinet of drawers: one for every family, the captive, domestic and unidentified kept apart. Open a drawer to see its specimens.",
      life: `${plural(m.life.length, "species", "species")}, numbered in the order they were first photographed, with the milestones along the way.`,
      tree: `The life list as a tree of life: ${plural(m.life.length, "species", "species")} on their branches of class, order and family, growing in the order they were first photographed. Rest on a leaf to trace it to the root.`,
      az: `Every species from A to Z: the ${fmtN(m.life.length)} on the life list, then those photographed as captive animals or not identified to species.`,
      calls: `${plural(callList.length, "species", "species")} with a recorded call. Each is a short, cleaned-up clip from a recording shared on iNaturalist, credited beside it.`,
    };
    const view = intros[mode] && !(mode === "calls" && !callN) && !(mode === "tree" && !GP.treeOfLife) && !(mode === "cabinet" && !cab) ? mode : "family";
    const head = pageHeader({ kicker: "Field guide", title: "Species", intro: intros[view], tabs: speciesTabs(view), actions: speciesViews(view) });
    let body = "", after = null;
    const wild = m.species.filter((s) => s.lifeNo);
    const rest = m.species.filter((s) => !s.lifeNo);
    if (mode === "calls" && callN) {
      const list = callList;
      body = `<div class="board-head"><span class="board-acts"><button class="btn primary" data-board="all" aria-pressed="false">${ICON.play} Play them all</button></span></div>
<div class="board">${list.map((x) => `<article class="board-card"><a class="board-pic" href="#/species/${esc(x.slug)}">${cover(x.best, 420, "", x.name)}</a><div class="board-t"><h3><a href="#/species/${esc(x.slug)}">${esc(x.name)}</a></h3><i class="binomial">${esc(x.bin || "")}</i>${GP.calls.player(x, true)}</div></article>`).join("")}</div>`;
      after = (main, signal) => {
        main.addEventListener("click", (e) => { const b = e.target.closest('[data-board="all"]'); if (b) GP.calls.chorus(list.map((x) => x.slug), b); }, { signal });
        signal.addEventListener("abort", () => GP.calls.stopChorus && GP.calls.stopChorus());
      };
    } else if (mode === "cabinet" && cab) {
      body = GP.cabinet.html(m, helpers);
      after = (main, signal) => GP.cabinet.mount(main, signal, m, helpers);
    } else if (mode === "tree" && GP.treeOfLife) {
      body = `<section class="sp-tree tl-card">${GP.treeOfLife.html(m, helpers)}</section>`;
      after = (main, signal) => GP.treeOfLife.mount(main, signal, m, helpers);
    } else if (mode === "life") {
      const n = m.life.length;
      const ms = MILESTONES.filter((v, i) => v <= n || MILESTONES[i - 1] < n || i === 0).slice(0, 8);
      body = `<div class="family-h" style="margin-top:8px"><h2>In order</h2><span class="n">${plural(n, "species", "species")}, numbered as they were first photographed</span></div><div class="milestones" style="margin-bottom:30px">${ms.map((v) => { const s = m.life[v - 1]; return `<div class="milestone${s ? " got" : ""}"><b>${v}</b>${s ? `${esc(s.name)} · ${esc(fmtShort(s.first))}` : `${v - n} to go`}</div>`; }).join("")}</div>
<ol class="life">${m.life.map((s) => `<li><a href="#/species/${esc(s.slug)}"><span class="no mono">${String(s.lifeNo).padStart(3, "0")}</span>${cover(s.best, 160)}<span class="nm"><b>${esc(s.name)}</b><i>${esc(s.bin)}</i></span><span class="fam">${esc(s.famName)}</span><span class="when mono">${esc(fmtShort(s.first))}</span></a></li>`).join("")}</ol><details class="tl-list" style="margin-top:40px"><summary class="chip">Every species by class, order and family, including captive and unidentified</summary><div class="tree">${taxonomy(m)}</div></details>`;
    } else if (mode === "az") {
      body = `<section class="sp-fam" data-fam=""><div class="sp-grid">${wild.slice().sort((a, b) => a.name.localeCompare(b.name)).map(spCard).join("")}</div></section>`;
    } else {
      for (const [, c] of [...m.tree].sort((a, b) => b[1].n - a[1].n)) {
        const fams = [];
        for (const o of c.orders.values()) for (const f of o.families.values()) fams.push(f);
        const shown = fams.map((f) => ({ f, sp: f.species.filter((s) => s.lifeNo) })).filter((x) => x.sp.length).sort((a, b) => b.sp.length - a.sp.length || a.f.common.localeCompare(b.f.common));
        if (!shown.length) continue;
        body += `<section class="sp-cls"><h2 class="display sp-cls-h">${esc(c.common)}</h2>`;
        const bySize = (sp) => sp.sort((a, b) => b.photos.length - a.photos.length).map(spCard).join("");
        for (const { f, sp } of shown.filter((x) => x.sp.length > 2)) body += `<section class="sp-fam" data-fam="${esc(f.common + " " + f.name)}"><div class="family-h"><h2>${esc(f.common)}</h2><span class="binomial">${esc(f.name)}</span><span class="n">${plural(sp.length, "species", "species")}</span></div><div class="sp-grid">${bySize(sp)}</div></section>`;
        const small = shown.filter((x) => x.sp.length <= 2);
        if (small.length) body += `<div class="sp-runs">${small.map(({ f, sp }) => `<section class="sp-fam sp-small" data-fam="${esc(f.common + " " + f.name)}" style="--n:${sp.length}"><h2 class="sp-sh" title="${esc(f.common)}"><span>${esc(f.common)}</span><i class="binomial">${esc(f.name)}</i></h2><div class="sp-grid">${bySize(sp)}</div></section>`).join("")}</div>`;
        body += `</section>`;
      }
    }
    if ((view === "family" || view === "az") && rest.length) body += `<section class="sp-fam sp-also${rest.length <= 6 ? " open" : ""}" data-fam=""><div class="family-h" style="margin-top:72px"><h2>Also photographed</h2><span class="n">Captive, domestic, or not identified to species</span></div><div class="sp-grid">${rest.sort((a, b) => b.photos.length - a.photos.length).map(spCard).join("")}</div>${rest.length > 6 ? `<button class="btn sp-more" data-sp-more aria-expanded="false">Show the other ${fmtN(rest.length - 6)}</button>` : ""}</section>`;
    if (view === "family" || view === "az") {
      const prev = after;
      after = (main, signal) => {
        main.addEventListener("click", (e) => { const b = e.target.closest("[data-sp-more]"); if (!b) return; b.closest(".sp-also").classList.add("open"); b.setAttribute("aria-expanded", "true"); b.hidden = true; }, { signal });
        if (prev) prev(main, signal);
      };
    }
    // The grids can be narrowed to a species by its name, its scientific name or its family.
    // A family (from a species page's breadcrumb) narrows the guide to it; finding a species by
    // name is the one search's job (the header's, or /).
    const find = q.get("find");
    if ((view === "family" || view === "az") && find) {
      const fam = m.species.find((x) => x.family === find);
      const label = fam ? fam.famName || find : find;
      body = `<div class="toolbar sp-bar"><div class="tb-row"><span class="sc">Showing</span><a class="chip sp-clear" href="#/species${view === "az" ? "?view=az" : ""}" aria-pressed="true" title="Show every species">${esc(label)} <span aria-hidden="true">×</span></a><span class="sp-n sc" aria-live="polite"></span></div></div><p class="sp-none" hidden></p>` + body;
      const more = after;
      after = (main, signal) => {
        if (more) more(main, signal);
        for (const s of main.querySelectorAll(".sp-also")) s.classList.add("open");
        const none = main.querySelector(".sp-none"), count = main.querySelector(".sp-n");
        const norm = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const words = norm(find.trim()).split(/\s+/).filter(Boolean);
        const cards = [...main.querySelectorAll(".sp-fam .sp-card")].map((el) => ({ el, t: norm(`${el.querySelector("h3").textContent} ${(el.querySelector(".binomial") || {}).textContent || ""} ${el.closest(".sp-fam").dataset.fam}`) }));
        let n = 0;
        for (const c of cards) { const hit = words.every((w) => c.t.includes(w)); c.el.hidden = !hit; if (hit) n++; }
        for (const f of main.querySelectorAll(".sp-fam")) f.hidden = !f.querySelector(".sp-card:not([hidden])");
        for (const c of main.querySelectorAll(".sp-cls")) c.hidden = !c.querySelector(".sp-fam:not([hidden])");
        none.hidden = n > 0;
        none.textContent = n ? "" : `No species here match “${find}”.`;
        count.textContent = `${fmtN(n)} of ${plural(cards.length, "species", "species")}`;
      };
    }
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
    const spCardFoot = (x, k) => x && { href: `#/species/${x.slug}`, cover: cover(x.best, 320), kicker: `${k}${x.lifeNo ? ` · No. ${x.lifeNo}` : ""}`, title: x.name, sub: x.bin, italic: true };
    const lightRows = ["Blue hour", "Golden hour", "Morning", "Midday", "Afternoon", "Night"].map((l) => [l, s.photos.filter((x) => x.light === l).length, hashFor(["gallery"], new URLSearchParams({ q: s.name.toLowerCase() + " " + l.toLowerCase() }))]).filter((r) => r[1]);
    const together = new Map();
    for (const id of s.outings) { const o = m.outingById.get(id); if (o) for (const e of o.species) if (e.key !== s.key) together.set(e.key, (together.get(e.key) || 0) + 1); }
    const withRows = [...together].map(([k, n]) => ({ sp: m.speciesByKey.get(k), n })).filter((e) => e.sp && e.sp.best && e.sp.lifeNo).sort((a, b) => b.n - a.n || b.sp.photos.length - a.sp.photos.length).slice(0, 8);
    const flag = s.captive ? "Photographed in captivity." : s.domestic ? "A domestic animal." : s.review ? "Rare or out of range in Florida: this identification deserves a second look." : s.uncertain ? "Identification uncertain." : "";
    const plate = GP.plates && s.lifeNo && s.family ? GP.plates.plateOf(m, s.family) : null;
    const html = `<div class="wrap page sp-page">
  ${GP.plates ? `<div class="sp-paper">${GP.plates.paintWash ? `<canvas class="paper-wash" width="640" height="448" data-wash aria-hidden="true"></canvas><i class="paper-grain"></i>` : GP.plates.wash(s)}</div>` : ""}
  <div class="sp-head reveal"><div>
    ${crumbs([["Species", "#/species"], s.famName ? [s.famName, s.family ? hashFor(["species"], new URLSearchParams({ find: s.family })) : "#/species"] : null], [s.order, s.lifeNo ? `Life list No. ${s.lifeNo}` : ""].filter(Boolean).join(" · "))}
    <h1${s.call ? ` data-sing="${esc(s.slug)}"` : ""}>${esc(s.name)}</h1>${s.bin ? `<div class="binomial">${esc(s.bin)}</div>` : ""}
    ${s.note ? `<p class="lede" style="margin-top:20px">${esc(s.note)}</p>` : ""}
    ${flag ? `<p class="sc" style="margin-top:12px;color:var(--warn)">${esc(flag)}</p>` : ""}
    ${GP.calls ? GP.calls.player(s) : ""}
    <div class="sp-acts"><button class="btn" data-sp="play">${ICON.play} Play as an exhibition</button>${plate ? `<a class="btn ghost" href="#/plates/${encodeURIComponent(plate.name)}">Plate ${plate.roman}</a>` : ""}${shareBtn(pageUrl("species", s.slug), `${s.name} · ${A.site.title || "Georgiadis Photography"}`)}</div>
  </div><button class="sp-hero" data-open="${esc(s.best.id)}"${s.call ? ` data-ripple="${esc(s.slug)}"` : ""} style="--fx:${(s.best.fp[0] * 100).toFixed(1)}%;--fy:${(s.best.fp[1] * 100).toFixed(1)}%" aria-label="Open the best photograph">${cover(s.best, 1400, "", s.name)}</button></div>
  <div class="sp-body${s.heroes.length <= 4 ? " few" : ""}">
    <section class="sp-photos" aria-label="Photographs">
      <div class="sec-h"><h2>Photographs</h2><span class="meta">${plural(s.heroes.length, "photograph")} · best first · bursts stacked</span></div>
      ${flow(s.heroes)}
    </section>
    <aside class="sp-notes" aria-label="Field notes"><h2 class="sp-notes-h">Field notes</h2><div class="sp-notes-row">
      <div class="j-card sp-facts"><h2>In the archive</h2><dl>
        <div><dt>Photographs</dt><dd>${fmtN(s.photos.length)}</dd></div><div><dt>Outings</dt><dd>${fmtN(s.outingN)}</dd></div>
        <div><dt>First seen</dt><dd class="d">${esc(fmtShort(s.first))}</dd></div><div><dt>Last seen</dt><dd class="d">${esc(fmtShort(s.last))}</dd></div></dl></div>
      <div class="j-card"><h2>When</h2><div class="calendar" role="img" aria-label="Photographs by month">${MON.map((mm) => `<span class="m">${mm[0]}</span>`).join("").replace(/^/, "<span></span>")}<span>Photos</span>${months.map((v, i) => `<span class="c${v ? " on" : ""}" data-tip="${MONTHS[i]}" data-tip-v="${plural(v, "photograph")}" tabindex="0" style="${v ? `opacity:${(0.45 + 0.55 * v / mx).toFixed(2)}` : ""}">${v || ""}</span>`).join("")}</div></div>
      <div class="j-card"><h2>Doing</h2>${s.behaviourList.length ? `<div class="chips">${s.behaviourList.slice(0, 8).map(([b, n]) => `<a class="chip" href="${hashFor(["gallery"], new URLSearchParams({ q: s.name + " " + b.toLowerCase() }))}">${esc(b)} <span class="n">${n}</span></a>`).join("")}</div>` : `<p>No behaviour noted yet.</p>`}
      <div class="sc" style="margin-top:8px">Seen on</div><div class="chips">${outs.slice(-8).reverse().map((o) => `<a class="chip" href="#/outings/${esc(o.id)}">${esc(fmtShort(o.date))}</a>`).join("")}${outs.length > 8 ? `<span class="chip ghost">+${outs.length - 8} more</span>` : ""}</div></div>
      ${lightRows.length > 1 ? `<div class="j-card"><h2>Light</h2><p>When in the day it was photographed.</p>${hbars(lightRows, "Photographs by light")}</div>${withRows.length ? `<div class="j-card"><h2>Seen with</h2><p>Species photographed on the same outings.</p><div class="sp-with">${withRows.map(({ sp, n }) => `<a href="#/species/${esc(sp.slug)}">${cover(sp.best, 160)}<span><b>${esc(sp.name)}</b><i>${plural(n, "outing")} together</i></span></a>`).join("")}</div></div>` : ""}` : withRows.length ? `<div class="j-card"><h2>Seen with</h2><p>Species photographed on the same outings.</p><div class="sp-with">${withRows.map(({ sp, n }) => `<a href="#/species/${esc(sp.slug)}">${cover(sp.best, 160)}<span><b>${esc(sp.name)}</b><i>${plural(n, "outing")} together</i></span></a>`).join("")}</div></div>` : ""}
    </div></aside>
  </div>
  ${everyLight(s)}
  ${related.length ? `<div class="family-h" style="margin-top:64px"><h2>More ${esc(s.famName || "relatives")}</h2></div><div class="sp-grid">${related.map(spCard).join("")}</div>` : ""}
  ${pageFoot({ label: "Neighbouring species", prev: spCardFoot(prevS, "Previous"), next: spCardFoot(nextS, "Next"), up: ["All species", "#/species"] })}
</div>`;
    const after = (main, signal) => {
      if (GP.calls) GP.calls.onSpeciesPage(s);
      if (GP.plates && GP.plates.paintWash) GP.plates.paintWash(main.querySelector("canvas[data-wash]"), s);
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
  function viewJournal(q, part = "notebook") {
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
    const st = m.stats;
    const head = pageHead("The field diary", "Outings", part === "numbers" ? "When the photographs were made, in what light, of whom and with what: the archive in numbers." : "A page for every month: where we went, what we saw, the prints taped in, new species ticked off.", outingsTabs(part));
    const notebookHtml = `${NB && timeline.length > 20 ? `<section class="j-card wide reveal"><h2>The archive in colour</h2><p>Every photograph's colours, one sliver each, in the order they were made. Hover to see one; click to open it.</p>${NB.barcode(timeline, { label: "The colours of every photograph in time order" })}${seasonNote ? ink(seasonNote) : ""}</section>` : ""}
  ${NB ? NB.notebook(m, helpers) : ""}`;
    const numbersHtml = `  <section class="j-card wide reveal"><h2>The year in the field</h2><p>Photographs per month. Hover a month for outings and new species.</p>${busiest && busiest.v ? ink(`busiest: ${MONTHS[busiest.mo - 1]} ${busiest.y}, ${fmtN(busiest.v)} frames`) : ""}<div class="scroll-x">${svgBars(monthRows, { w: Math.max(560, Math.min(1680, (A.root.clientWidth || innerWidth) - 48)), h: 240, aria: "Photographs per month" })}</div>${table(["Month", "Photographs", "Outings", "New species"], monthRows.map((r) => [`${MONTHS[r.mo - 1]} ${r.y}`, r.v, r.o, r.l]))}</section>
  <section class="j-card reveal"><h2>Hours of light</h2><p>Photographs by hour on the camera clock; the inner arc marks typical daylight.</p>${hours[peakH] ? ink(`most frames between ${peakH}:00 and ${peakH + 1}:00`) : ""}${dial(hours, avgSun)}${table(["Hour", "Photographs"], hours.map((v, i) => [`${String(i).padStart(2, "0")}:00`, v]))}</section>
  <section class="j-card reveal"><h2>Light</h2><p>Each frame placed against that day's sunrise and sunset.</p>${ph.length ? ink(`golden hour: ${Math.round((gold / ph.length) * 100)}% of every frame`) : ""}${hbars(lights, "Photographs by light")}<h2 style="margin-top:18px">Behaviour</h2>${hbars(beh, "Photographs by behaviour")}</section>
  ${otd ? `<section class="j-card wide reveal"><h2>${esc(otd.title)}</h2><p>${esc(otd.sub)}</p>${flow(otd.photos.slice(0, 10))}</section>` : ""}
  <section class="j-card wide reveal"><h2>Records</h2><p>The archive's superlatives, and the photographs that hold them.</p>${m.species.length ? ink(`the ${m.species.slice().sort((a, b) => b.photos.length - a.photos.length)[0].name}, again!`) : ""}<div class="recs" data-ctx="${regCtx(recs.filter((r) => r.open).map((r) => r.x))}">${recs.map((r) => `<${r.href ? `a href="${esc(r.href)}"` : `button data-open="${esc(r.open)}"`} class="rec">${cover(r.x, 480)}<span class="rec-t"><b>${esc(String(r.n))}</b><span>${esc(r.l)}</span><span class="sc">${esc(r.d)}</span></span></${r.href ? "a" : "button"}>`).join("")}</div></section>
  <section class="j-card wide reveal"><h2>Years</h2>${years.length ? ink(`${m.life.filter((s) => s.first.startsWith(String(years[0]))).length} new species in ${years[0]} so far`) : ""}${yearCards}</section>
  <section class="j-card reveal"><h2>Field kit</h2><p>Lenses used, by photograph.</p>${topLens && topLens[1] / ph.length > 0.6 ? ink(`the ${topLens[0].replace(/ f\/.*$/, "")} does nearly everything`) : ""}${hbars([...lens].sort((a, b) => b[1] - a[1]), "Photographs by lens")}</section>
  <section class="j-card reveal"><h2>Reach</h2><p>Focal length in millimetres. Most of the archive lives at the long end.</p>${topFl && topFl.v ? ink(`most at ${topFl.tip}`) : ""}${svgBars(flRows, { w: Math.max(320, Math.min(820, innerWidth > 900 ? (A.root.clientWidth - 76) / 2 : innerWidth - 48)), h: 200, aria: "Photographs by focal length" })}${table(["Focal length", "Photographs"], flRows.map((r) => [r.tip, r.v]))}</section>`;
    const html = `<div class="wrap page notebook">${head}
<div class="j-grid">
  ${part === "numbers" ? numbersHtml : notebookHtml}
</div></div>`;
    const after = (main, signal) => {
      if (GP.notebook) GP.notebook.mount(main, signal);
      // the years' prints develop as they arrive
      if (GP.fx) main.querySelectorAll(".year-card .mini-flow").forEach((mf) => GP.fx.developIn(mf, signal));
    };
    return { html, after, title: part === "numbers" ? "Outings in numbers" : "Field notebook" };
  }

  function viewMissing() {
    return { html: `<div class="wrap page">${pageHeader({ kicker: "Not found", title: "Not in the archive", intro: "That page doesn't exist, or the photograph has been moved.", actions: `<a class="btn primary" href="#/">Home ${ICON.arrow}</a><a class="btn" href="#/gallery">The gallery</a>` })}</div>`, title: "Not found" };
  }

  /* ---------- opening photos ---------- */
  function openList(list, i, fromEl, frame) { if (GP.viewer) GP.viewer.open(list, i, fromEl, frame); }
  function openById(id) {
    const x = A.model.byId.get(id);
    if (!x) return;
    const ctx = [...A.ctx.values()].find((l) => l.includes(x));
    const list = ctx || [x];
    const el = $(`.tile[data-id="${CSS.escape(id)}"] img`);
    openList(list, Math.max(0, list.indexOf(x)), el);
  }
  /* ---------- bursts, grouped or opened ---------- */
  function regrid() {
    qReset();
    const done = new Set();
    // photographs already on screen stay sharp in their new tiles (no fade-in again); only frames
    // appearing for the first time develop in
    const ready = new Set($$("#gp-main .tile img").filter((i) => i.complete && i.naturalWidth).map((i) => i.getAttribute("src")));
    for (const el of $$("#gp-main .flow[data-ctx]")) {
      const k = el.dataset.ctx, base = ctxBase.get(k);
      if (!base) continue;
      if (!done.has(k)) { A.ctx.set(k, expand(base.list, base.o)); done.add(k); }
      const items = base.parts ? base.parts[+el.dataset.part] || [] : base.list;
      el.innerHTML = base.paint ? base.paint(items) : expand(items, base.o).map((x) => tile(x, base.o)).join("");
      el.style.minHeight = ""; delete el.dataset.pending;
      for (const img of el.querySelectorAll(".tile img")) if (ready.has(img.getAttribute("src"))) { img.classList.add("in", "now"); img.dataset.arrived = "1"; }
      markLoaded(el);
    }
    for (const c of $$("#gp-main .result-line .count")) c.textContent = c.textContent.replace(/bursts (stacked|opened)/, A.expand ? "bursts opened" : "bursts stacked");
  }
  function burstButton() {
    const on = A.expand;
    return `<button class="icon-btn gp-bursts" data-act="bursts" aria-pressed="${on}" title="${on ? "Group bursts" : "Show every frame of every burst"} (X)" aria-label="${on ? "Group bursts again" : "Show every frame of every burst on its own"}">${on ? ICON.burstsOpen : ICON.burstsGrouped}</button>`;
  }
  function paintBurstButton() {
    for (const b of $$('[data-act="bursts"]')) b.outerHTML = burstButton();
  }
  // Opening: each burst's frames deal out from where its tile was, one after another, each
  // settling into place with a little turn; the tiles around them glide to make room.
  // Grouping: the frames gather back into the first, which takes them with a small catch.
  function toggleBursts(on = !A.expand) {
    if (on === A.expand) return;
    const main = $("#gp-main"), vh = innerHeight, still = reduced();
    const near = (r) => r.bottom > -120 && r.top < vh + 120 && r.width > 0;
    const before = new Map(), ghosts = [];
    for (const t of $$("#gp-main .tile[data-id]")) {
      const r = t.getBoundingClientRect();
      if (near(r)) before.set(t.dataset.id, r);
    }
    // grouping: copies of the frames about to go, to fly home once the page is rebuilt
    if (!on && !still) {
      for (const t of $$("#gp-main .tile.loose[data-burst]")) {
        if (t.dataset.burst === t.dataset.id) continue;
        const r = before.get(t.dataset.id);
        if (!r) continue;
        const g = t.cloneNode(true);
        g.classList.add("tile-ghost");
        g.removeAttribute("data-id");
        Object.assign(g.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
        ghosts.push({ g, home: t.dataset.burst, k: +t.dataset.k || 1 });
      }
    }
    const an = viewAnchor();
    A.expand = on;
    try { sessionStorage.setItem("gp-bursts", on ? "open" : "grouped"); } catch (e) { /* private window */ }
    paintBurstButton();
    if (main) {
      regrid();
      holdAnchor(an);
    }
    toast(on ? "Bursts opened: every frame on its own" : "Bursts grouped");
    if (still || !main) return;
    const EASE = "cubic-bezier(.16, 1, .3, 1)";
    const seed = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
    let i = 0;
    for (const t of $$("#gp-main .tile[data-id]")) {
      const r = t.getBoundingClientRect();
      if (!near(r)) continue;
      const id = t.dataset.id, was = before.get(id);
      i++;
      if (was) {
        // a tile that was there already glides to its new place
        const dx = was.left - r.left, dy = was.top - r.top, sx = was.width / r.width, sy = was.height / r.height;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) continue;
        t.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transformOrigin: "0 0", transform: "none" }], { duration: 640, easing: EASE });
        if (on && t.classList.contains("loose") && t.dataset.burst === id) {
          // the first frame lets the others go: a soft lift
          t.animate([{ boxShadow: "0 0 0 0 rgba(0,0,0,0)" }, { boxShadow: "0 18px 40px -18px rgba(0,0,0,.45)", offset: 0.35 }, { boxShadow: "0 0 0 0 rgba(0,0,0,0)" }], { duration: 900, easing: "ease-out" });
        }
        continue;
      }
      // a frame dealt out of its burst: it starts on top of where the burst's tile was
      const from = on && t.dataset.burst ? before.get(t.dataset.burst) : null;
      const k = +t.dataset.k || 1;
      if (from) {
        const dx = from.left - r.left, dy = from.top - r.top, sx = from.width / r.width, sy = from.height / r.height;
        const turn = (seed(k + i) - 0.5) * 14;
        t.style.zIndex = String(40 - Math.min(30, k));
        const a = t.animate([
          { transformOrigin: "50% 50%", transform: `translate(${dx}px, ${dy}px) scale(${sx * 0.96}, ${sy * 0.96}) rotate(${turn * 0.4}deg)`, opacity: 0, boxShadow: "0 30px 60px -20px rgba(0,0,0,.55)" },
          { opacity: 1, offset: 0.18 },
          { transformOrigin: "50% 50%", transform: `translate(${dx * 0.12}px, ${dy * 0.12 - 10}px) scale(1.02) rotate(${turn}deg)`, boxShadow: "0 26px 50px -22px rgba(0,0,0,.5)", offset: 0.72 },
          { transformOrigin: "50% 50%", transform: "none", opacity: 1, boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
        ], { duration: 760, delay: Math.min(9, k - 1) * 55, easing: EASE, fill: "backwards" });
        a.onfinish = () => { t.style.zIndex = ""; };
      } else {
        // anything else new to the screen fades up into place
        t.animate([{ opacity: 0, transform: "translateY(14px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 520, delay: Math.min(240, i * 12), easing: EASE, fill: "backwards" });
      }
    }
    // grouping: the frames fly home and tuck in behind the tile that keeps them
    if (ghosts.length) {
      const caught = new Set();
      for (const { g, home, k } of ghosts) {
        const h = $(`#gp-main .tile[data-id="${CSS.escape(home)}"]`);
        const hr = h && h.getBoundingClientRect();
        document.body.appendChild(g);
        if (!hr || !near(hr)) {
          g.animate([{ opacity: 1 }, { opacity: 0, transform: "scale(.94)" }], { duration: 320, easing: "ease-in" }).onfinish = () => g.remove();
          continue;
        }
        const gr = g.getBoundingClientRect();
        const dx = hr.left - gr.left, dy = hr.top - gr.top, sx = hr.width / gr.width, sy = hr.height / gr.height;
        const turn = (seed(k * 3.1) - 0.5) * 12, delay = Math.min(9, Math.max(0, k - 2)) * 40;
        const a = g.animate([
          { transformOrigin: "0 0", transform: "none", opacity: 1, boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
          { transformOrigin: "0 0", transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 14}px) scale(${1 + (sx - 1) * 0.55}, ${1 + (sy - 1) * 0.55}) rotate(${turn}deg)`, opacity: 1, boxShadow: "0 26px 50px -22px rgba(0,0,0,.5)", offset: 0.5 },
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy}) rotate(${turn * 0.2}deg)`, opacity: 0, boxShadow: "0 0 0 0 rgba(0,0,0,0)" },
        ], { duration: 620, delay, easing: "cubic-bezier(.5, 0, .2, 1)", fill: "both" });
        a.onfinish = () => {
          g.remove();
          if (caught.has(home)) return;
          caught.add(home);
          h.animate([{ transform: "scale(1)" }, { transform: "scale(1.035)", offset: 0.35 }, { transform: "scale(1)" }], { duration: 420, easing: "cubic-bezier(.3, 1.6, .5, 1)" });
        };
      }
    }
  }
  function onClick(e) {
    const row = e.target.closest("[data-mn-row]");
    if (row && !e.target.closest("button")) { const b = row.querySelector("button"); if (b) b.click(); return; }
    const act = e.target.closest("[data-act]");
    if (act && A.root.contains(act)) {
      const a = act.dataset.act;
      if (act.hasAttribute("data-mn-close")) closeMenu(false);
      if (a === "menu") toggleMenu();
      else if (a === "theme-set") setTheme(act.dataset.v);
      else if (a === "theme") toggleTheme();
      else if (a === "bursts") toggleBursts();
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
    // a photograph opens among its own section's photographs (the nearest list holding it), not the
    // first list on the page that happens to include it
    if (opener) { const x = A.model.byId.get(opener.dataset.open); if (x) { const box = opener.closest("[data-ctx]"), own = box && A.ctx.get(box.dataset.ctx); const ctx = own && own.includes(x) ? own : [...A.ctx.values()].find((l) => l.includes(x)); openList(ctx || [x], ctx ? ctx.indexOf(x) : 0, opener.querySelector("img") || opener); } return; }
    const t = e.target.closest(".tile[data-id], .mini-flow [data-id], .wall-item figure[data-id]");
    if (!t || !A.root.contains(t)) return;
    const id = t.dataset.id;
    if (!A.selecting && t.classList.contains("veiled")) { reveal([id, ...(t.dataset.frames || "").split(",").filter(Boolean)]); t.classList.remove("veiled"); const v = t.querySelector(".veil"); if (v) v.remove(); return; }
    if (A.selecting && t.classList.contains("tile")) {
      if (A.sel.has(id)) A.sel.delete(id); else A.sel.add(id);
      t.classList.toggle("sel", A.sel.has(id));
      if (A.workshop && A.workshop.onSelect) A.workshop.onSelect([...A.sel]);
      return;
    }
    const box = t.closest("[data-ctx]");
    const list = (box && A.ctx.get(box.dataset.ctx)) || [A.model.byId.get(id)];
    const x = A.model.byId.get(id), f = t._frame && A.model.byId.get(t._frame);
    openList(list, Math.max(0, list.indexOf(x)), t.querySelector("img"), f && f !== x ? f : null);
  }
  // Burst scrubbing: drag the pointer across a stacked tile to flick through its frames.
  function onScrub(e) {
    const t = e.target.closest && e.target.closest(".tile.burst");
    if (!t || e.pointerType === "touch" || t.classList.contains("living") || t.classList.contains("veiled")) return;
    const x = A.model.byId.get(t.dataset.id);
    const fr = (t.dataset.frames || "").split(",").map((id) => A.model.byId.get(id)).filter(Boolean);
    if (!x || fr.length < 2) return;
    // The frame under the pointer is the one whose bar it is above: the bars along the foot of
    // the tile split its width between the frames (the first is the one the tile shows).
    const bars = t.querySelector(".scrub"), r = (bars || t).getBoundingClientRect();
    showFrame(t, x, fr, Math.floor(((e.clientX - r.left) / r.width) * fr.length));
  }
  // Show frame i of a burst in its tile; the tile then opens on that frame.
  function showFrame(t, x, fr, i) {
    i = Math.max(0, Math.min(fr.length - 1, i));
    if (t._i === i) return;
    t._i = i;
    const img = t.querySelector("img"), f = fr[i];
    const url = src(f, rowH() * x.ar * dpr() * 1.1);
    img.src = url;
    fitFrame(t, img, f, x, url);
    t.querySelectorAll(".scrub i").forEach((el, k) => el.classList.toggle("on", k === i));
    t._frame = f.id;
  }
  // Touch screens: a swipe across a burst's tile moves it on one frame, left for the next and right
  // for the one before (round and round), as a phone's photo stack does. The frame follows the
  // finger a little while it moves; a drag too short to be a swipe springs back. Up and down still
  // scrolls the page, and a tap afterwards opens the frame the tile is showing.
  function onBurstDown(e) {
    if (e.pointerType === "mouse" || A.selecting || !e.isPrimary) return;
    const t = e.target.closest && e.target.closest(".flow .tile.burst");
    if (!t || t.classList.contains("living") || t.classList.contains("veiled")) return;
    const x = A.model.byId.get(t.dataset.id);
    const fr = (t.dataset.frames || "").split(",").map((id) => A.model.byId.get(id)).filter(Boolean);
    if (!x || fr.length < 2) return;
    const n = fr.length, i0 = t._i != null ? t._i : Math.max(0, fr.indexOf(x));
    const W = t.getBoundingClientRect().width, tw = rowH() * x.ar * dpr() * 1.1;
    const pullOf = (dx) => Math.max(-W * 0.3, Math.min(W * 0.3, dx * 0.45));
    const g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, lx: e.clientX, lt: performance.now(), vx: 0 };
    const move = (ev) => {
      if (ev.pointerId !== g.id) return;
      const dx = ev.clientX - g.x0, dy = ev.clientY - g.y0;
      if (!g.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { end(ev); return; } // a scroll
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
        g.on = true;
        t.classList.add("scrubbing");
        clearTimeout(t._sT);
        // the frames either side, fetched as the swipe begins, so the next is there when it lands
        for (const k of [1, -1]) { const im = new Image(); im.decoding = "async"; im.src = src(fr[(i0 + k + n) % n], tw); }
      }
      const now = performance.now();
      g.vx = (ev.clientX - g.lx) / Math.max(1, now - g.lt); g.lx = ev.clientX; g.lt = now;
      if (!reduced()) t.querySelector("img").style.transform = `translateX(${pullOf(dx)}px)`;
    };
    const end = (ev) => {
      if (ev && ev.pointerId !== g.id) return;
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
      if (!g.on) return;
      A.eatClick = performance.now() + 450; // the lifted finger isn't a tap
      t._sT = setTimeout(() => t.classList.remove("scrubbing"), 1400);
      const img = t.querySelector("img"), dx = (ev && ev.type !== "pointercancel" ? ev.clientX : g.lx) - g.x0, from = pullOf(dx);
      // a swipe: far enough, or quick enough; anything less springs back
      const d = Math.abs(dx) > Math.min(44, W * 0.16) || (Math.abs(dx) > 14 && Math.abs(g.vx) > 0.3) ? (dx < 0 ? 1 : -1) : 0;
      img.style.transform = "";
      if (reduced()) { if (d) showFrame(t, x, fr, (i0 + d + n) % n); return; }
      if (!d) { img.animate([{ transform: `translateX(${from}px)` }, { transform: "none" }], { duration: 220, easing: "cubic-bezier(.22,.72,.2,1)" }); return; }
      const i = (i0 + d + n) % n;
      // this frame carries on out the way it was going while the next is made ready, then the next
      // comes in from the other side
      const out = img.animate([{ transform: `translateX(${from}px)`, opacity: 1 }, { transform: `translateX(${-d * W * 0.32}px)`, opacity: 0.25 }], { duration: 130, easing: "ease-in", fill: "forwards" });
      const next = new Image(); next.decoding = "async"; next.src = src(fr[i], tw);
      const ready = next.decode ? Promise.race([next.decode().catch(() => {}), new Promise((r) => setTimeout(r, 400))]) : Promise.resolve();
      Promise.all([out.finished.catch(() => {}), ready]).then(() => {
        showFrame(t, x, fr, i);
        out.cancel();
        img.animate([{ transform: `translateX(${d * W * 0.32}px)`, opacity: 0.25 }, { transform: "none", opacity: 1 }], { duration: 240, easing: "cubic-bezier(.22,.72,.2,1)" });
      });
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerup", end, { passive: true });
    document.addEventListener("pointercancel", end, { passive: true });
  }
  // The tile keeps the shape of the photograph it shows. A frame of another shape (cropped
  // differently) sits whole inside it over a soft copy of itself, instead of being cropped and
  // blown up to fill it; frames of nearly the same shape still fill it.
  function fitFrame(t, img, f, x, url) {
    const fit = !!f && f !== x && Math.abs(Math.log(f.ar / x.ar)) > 0.06;
    img.classList.toggle("fit", fit);
    let bg = t.querySelector(":scope > .scrub-bg");
    if (fit) {
      if (!bg) { bg = document.createElement("i"); bg.className = "scrub-bg"; bg.setAttribute("aria-hidden", "true"); img.before(bg); }
      bg.style.backgroundImage = `url("${url.replace(/"/g, "%22")}")`;
    } else if (bg) bg.remove();
  }
  function onScrubEnd(e) {
    // a lifted finger leaves the tile on the frame it was swiped to (only a mouse moving off resets it)
    if (e.pointerType && e.pointerType !== "mouse") return;
    const t = e.target.closest && e.target.closest(".tile.burst");
    if (!t || t._i == null) return;
    const x = A.model.byId.get(t.dataset.id);
    const hi = (t.dataset.frames || "").split(",").indexOf(x.id);
    t._i = null; t._frame = null;
    const img = t.querySelector("img");
    img.src = src(x, rowH() * x.ar * dpr() * 1.1);
    fitFrame(t, img, null, x, "");
    t.querySelectorAll(".scrub i").forEach((el, k) => el.classList.toggle("on", k === hi));
  }
  function goSearch() {
    if (GP.search) { closeMenu(false); GP.search.open(); return; }
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
    const pool = (m.calmHeroes || m.heroes).filter((x) => x.rating >= 3 && !x.unsure);
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
      const rows = [["/", "Search"], ["← →", "Previous or next photograph"], ["↑ ↓", "Frames within a burst"], ["X", "Open every burst, or group them again"], ["I", "Specimen label"], ["Z", "Zoom to full resolution"], ["0", "Fit to screen"], ["F", "Full screen"], ["D", "Download the original"], ["Shift", "Hold over a photograph for a loupe; scroll to change its power"], ["C", "Play the bird's call (in the viewer)"], ["L", "Add to or remove from your favourites (in the viewer)"], ["P", "Play the photographs from here as an exhibition (in the viewer)"], ["V", "Play a burst as it was shot (in the viewer)"], A.workshop ? ["H", "Hide from or show on the public site (in the viewer)"] : ["H", "How it was shot, and the sky that moment (in the viewer)"], ["B", "Lights down (in an exhibition room)"], ["Space", "Play or pause the day (in A day in the marsh)"], ["R", "Surprise me: a random photograph"], ["E", "Play an exhibition"], ["S", "Sound on or off: the marsh, the pines, the surf"], ["M", "Depth on or off: each subject stands a little in front of its background"], ["T", "Light or dark"], ["Esc", "Close"]];
      d.innerHTML = `<form method="dialog"><h2 class="display">Keyboard</h2><dl>${rows.map(([k, v]) => `<dt><kbd>${k}</kbd></dt><dd>${v}</dd>`).join("")}</dl><button class="btn">Close</button></form>`;
      document.body.appendChild(d);
    }
    d.showModal();
  }
  function onKey(e) {
    if (e.key === "Escape" && $("#gp-menu")) { e.preventDefault(); closeMenu(); return; }
    if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey && GP.search && !(GP.viewer && GP.viewer.isOpen())) { e.preventDefault(); goSearch(); return; }
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
    else if (e.key === "x" || e.key === "X") toggleBursts();
    else if ((e.key === "s" || e.key === "S") && GP.scape) GP.scape.toggle();
  }
  let lastY = 0;
  // While the page is moving, what slides under a still pointer isn't hovered: a clear layer over
  // the content takes the pointer, so no lift, shadow or caption animation starts and stops on
  // every frame and the browser doesn't hit-test the grid underneath. (One element changes, not
  // the whole page.) The header, toolbar, scrubber and menus sit above it.
  function scrollingNow() {
    const sh = A.shield && A.shield.isConnected ? A.shield : (A.shield = $(".scroll-shield"));
    if (!sh) return;
    if (!A.scrolling) { A.scrolling = true; sh.classList.add("on"); }
    clearTimeout(A.scrollT);
    A.scrollT = setTimeout(() => { A.scrolling = false; sh.classList.remove("on"); }, 180);
  }
  function onScroll() {
    scrollingNow();
    const y = window.scrollY, head = $(".gp-head");
    if (!head) return;
    if (A.tipOn) { tipFor(null); A.tipOn = false; }
    const tt = $(".to-top");
    if (tt) tt.classList.toggle("on", y > innerHeight * 1.6);
    if (y > 160 && y > lastY + 6 && !$("#gp-menu")) head.classList.add("tucked");
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
      // A click outside the open menu closes it and does nothing else (it would otherwise open
      // the photograph underneath, say).
      document.addEventListener("pointerdown", (e) => { if ($("#gp-menu") && !(e.target.closest && e.target.closest("#gp-menu, .gp-menu-btn"))) { closeMenu(false); A.eatClick = performance.now() + 500; } }, true);
      document.addEventListener("click", (e) => { if (A.eatClick && performance.now() < A.eatClick) { e.preventDefault(); e.stopPropagation(); } A.eatClick = 0; }, true);
      document.addEventListener("pointermove", onScrub, { passive: true });
      document.addEventListener("pointerdown", onBurstDown, { passive: true });
      document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest(".tile.burst") && !e.target.closest(".tile.burst").contains(e.relatedTarget)) onScrubEnd(e); }, { passive: true });
      document.addEventListener("load", (e) => {
        const img = e.target;
        if (img.tagName !== "IMG") return;
        // While the page is moving a fade-in can't be seen (most arrive off screen, ahead of you),
        // and each one would briefly make its photograph a layer of its own: they just appear.
        if (A.scrolling) img.classList.add("now");
        img.classList.add("in");
        // photographs come into focus from their subject outward
        if (GP.fx && img.dataset.lq && !img.closest(".no-arrive")) GP.fx.arrive(img);
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
      window.addEventListener("resize", () => { rowMemo = 0; }, { passive: true });
      matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paintTheme);
    }
    A.lastKey = "";
    route();
  }
  // Rebuild after the library changes (Workshop edits, a fresh scan); keeps the page and scroll.
  // When the page is rebuilt in place (a save in the Workshop, the selection changing), tiles can
  // merge, split or move between rows, so the same scroll position can land somewhere else. The
  // page is held on a tile instead: the one an action asked for (holdView), or else the one in
  // the middle of the screen, back at the same height on screen.
  // Every tile on screen, nearest the middle first (the one an action asked for ahead of them
  // all): after the rebuild the page is held on the first of them that is still there, so a
  // change that takes tiles away (a rating under a rating filter, a species under a search, a
  // fix in one of the Workshop's lists) still leaves the page where it was.
  function viewAnchor() {
    const vh = innerHeight, tiles = $$("#gp-main [data-id]"), out = [];
    const live = A.hold && Date.now() - A.hold.at < 10000 ? A.hold : null;
    const want = live && live.id, avoid = (live && live.avoid) || new Set();
    if (want) {
      const el = tiles.find((t) => t.dataset.id === want || (t.dataset.frames || "").split(",").includes(want));
      const r = el && el.getBoundingClientRect();
      if (r && r.bottom > 0 && r.top < vh) out.push({ id: want, top: r.top, d: -1 });
    }
    for (const t of tiles) {
      const r = t.getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > vh) continue;
      // the photos just changed may move or go (a re-sort, a filter): never hold on them
      if (avoid.has(t.dataset.id) || (t.dataset.frames || "").split(",").some((i) => avoid.has(i))) continue;
      out.push({ id: t.dataset.id, top: r.top, d: Math.abs(r.top + r.height / 2 - vh / 2) });
    }
    return out.length ? out.sort((a, b) => a.d - b.d) : null;
  }
  function findTile(id) {
    const tiles = $$("#gp-main [data-id]");
    const el = tiles.find((t) => t.dataset.id === id);
    if (el) return el;
    // gone: it joined a burst (or a burst was split): hold on whichever tile now shows its burst
    const x = A.model.byId.get(id), fr = x && x.burst ? x.burst.frames.map((f) => f.id) : [];
    return tiles.find((t) => fr.includes(t.dataset.id) || (t.dataset.frames || "").split(",").some((i) => fr.includes(i))) || null;
  }
  function holdAnchor(an) {
    if (!an) return;
    // the action's own tile may now show elsewhere (a burst it joined): only that one is followed
    // to where its burst shows; the others count only where they still are
    for (const c of an) {
      const el = c.d < 0 ? findTile(c.id) : $$("#gp-main [data-id]").find((t) => t.dataset.id === c.id);
      if (el) { window.scrollBy(0, el.getBoundingClientRect().top - c.top); return; }
    }
  }
  function update(raw) {
    A.raw = raw || A.raw;
    A.model = M.build(A.raw, A.modelOpts);
    A.site = Object.assign({}, A.model.site, A.siteOverride || {});
    const y = window.scrollY, an = viewAnchor();
    A.keepScroll = true;
    const cur = GP.viewer && GP.viewer.isOpen() ? GP.viewer.current() : null;
    A.lastKey = "";
    const r = parseHash();
    A.lastKey = keyOf(r);
    render(r);
    window.scrollTo(0, y);
    holdAnchor(an);
    requestAnimationFrame(() => holdAnchor(an));
    if (cur && GP.viewer.refresh) GP.viewer.refresh(A.model);
  }
  // Sensitive photographs a visitor has chosen to see, for this visit.
  function reveal(ids) { for (const id of [].concat(ids)) if (id) A.revealed.add(id); }
  // An action about to change photos says which tile to keep in place (id: a burst it joined),
  // and which photos it changes (avoid: never hold the page on them, they may move or go).
  function holdView(id, avoid) { A.hold = id || avoid ? { id: id || null, avoid: new Set(avoid || []), at: Date.now() } : null; }
  function setSelecting(on) {
    A.selecting = !!on;
    if (!on) A.sel.clear();
    document.documentElement.classList.toggle("gp-selecting", A.selecting);
    update();
  }

  const helpers = { esc, tile, flow, cover, chip, spCard, chapterRow, pageHead, pageHeader, crumbs, tabs, pageFoot, speciesTabs, speciesViews, outingsTabs, viewSwitch, specimenTag, fmtDate, fmtShort, fmtTime, fmtN, plural, titleOf, exposure, src, ICON, regCtx, toast, hbars, table, svgBars, pageUrl, shareBtn, sharePage };
  GP.app = {
    start, update, setSelecting, toast, helpers, holdView, toggleBursts, fillAll, get burstsExpanded() { return A.expand; }, reveal, isRevealed: (x) => !x || !x.explicit || A.revealed.has(x.id),
    get model() { return A.model; }, get views() { return A.views; }, get site() { return A.site; }, get adapter() { return A.adapter; }, get workshop() { return A.workshop; },
    get selection() { return [...A.sel]; }, get frameFilter() { return A.ff || null; }, clearSelection() { A.sel.clear(); $$(".tile.sel").forEach((t) => t.classList.remove("sel")); },
    setQuery, parseHash, hashFor, exhibit, toggleTheme, openById, openList, surprise, route: () => { A.lastKey = ""; route(); },
  };
})(window.GP = window.GP || {});
