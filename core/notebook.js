/* Georgiadis Photography: the field notebook. The Journal as a naturalist's notebook: a page for
   each month with the outings written up by hand and its best frames taped in, turning as you
   scroll; notes in the margins that ink themselves in; photographs that develop like prints.
   And the archive's colours as a barcode: every photograph in time order, one sliver each, so the
   seasons show (also under each outing, for its day). */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const H = () => GP.app.helpers;
  const MONTHS = () => GP.model.MONTHS;

  /* ---------- the colour barcode ---------- */
  // A placeholder the mount fills in; list is in time order.
  let barN = 0;
  const bars = new Map();
  function barcode(list, o = {}) {
    const id = "bc" + ++barN;
    bars.set(id, { list, o });
    return `<figure class="barcode${o.small ? " small" : ""}" data-bar="${id}"><div class="bc-box"><canvas class="bc-c" role="img" aria-label="${H().esc(o.label || "Every photograph's colours in time order")}"></canvas><span class="bc-cursor" hidden></span><span class="bc-peek" hidden></span></div><figcaption class="bc-ticks"></figcaption></figure>`;
  }
  function mountBar(fig, signal) {
    const d = bars.get(fig.dataset.bar);
    if (!d) return;
    bars.delete(fig.dataset.bar);
    const { list, o } = d, h = H();
    const cv = fig.querySelector(".bc-c"), box = fig.querySelector(".bc-box"), cur = fig.querySelector(".bc-cursor"), peek = fig.querySelector(".bc-peek"), ticks = fig.querySelector(".bc-ticks");
    const ctx = cv.getContext("2d");
    let W = 0, Hh = 0, shown = reduced() ? 1 : 0;
    const draw = (upto) => {
      const dpr = Math.min(2, devicePixelRatio || 1);
      W = box.clientWidth; Hh = box.clientHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = list.length, sw = W / n, end = Math.floor(n * upto);
      for (let i = 0; i < end; i++) {
        const p = list[i].pal || [];
        const x = Math.floor(i * sw), w = Math.max(1, Math.ceil((i + 1) * sw) - x);
        ctx.fillStyle = p[1] || p[0] || "#888"; ctx.fillRect(x, 0, w, Hh * 0.28);
        ctx.fillStyle = p[0] || "#888"; ctx.fillRect(x, Hh * 0.28, w, Hh * 0.47);
        ctx.fillStyle = p[2] || p[0] || "#888"; ctx.fillRect(x, Hh * 0.75, w, Hh * 0.25 + 1);
      }
    };
    // months (or hours, for a single day) along the bottom
    const marks = [];
    if (o.byHour) {
      let last = -1;
      list.forEach((x, i) => { if (x.hasTime && x.cap.hh !== last) { last = x.cap.hh; marks.push([i, `${String(last).padStart(2, "0")}:00`]); } });
    } else {
      let last = "";
      list.forEach((x, i) => { const k = (x.t || "").slice(0, 7); if (k && k !== last) { last = k; marks.push([i, GP.model.MON[+k.slice(5, 7) - 1] + (k.slice(5, 7) === "01" || !marks.length ? " ’" + k.slice(2, 4) : "")]); } });
    }
    // labels at least a label's width apart on screen
    const bw = box.clientWidth || 800, keep = [];
    let lastX = -1e9;
    for (const [i, l] of marks) { const x = (i / list.length) * bw; if (x - lastX >= Math.max(46, l.length * 7.5)) { keep.push([i, l]); lastX = x; } }
    ticks.innerHTML = keep.map(([i, l]) => `<span style="left:${((i / list.length) * 100).toFixed(2)}%">${h.esc(l)}</span>`).join("");
    const reveal = () => {
      if (reduced()) { draw(1); return; }
      const t0 = performance.now(), dur = Math.min(2200, 600 + list.length * 1.4);
      const step = (t) => { shown = Math.min(1, (t - t0) / dur); draw(1 - Math.pow(1 - shown, 2)); if (shown < 1 && fig.isConnected) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); reveal(); } }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(fig);
    const ro = new ResizeObserver(() => { if (shown >= 1 || reduced()) draw(1); });
    ro.observe(box);
    signal.addEventListener("abort", () => { io.disconnect(); ro.disconnect(); });
    const at = (e) => { const r = box.getBoundingClientRect(); return Math.max(0, Math.min(list.length - 1, Math.floor(((e.clientX - r.left) / r.width) * list.length))); };
    box.addEventListener("pointermove", (e) => {
      const i = at(e), x = list[i], r = box.getBoundingClientRect();
      const px = ((i + 0.5) / list.length) * r.width;
      cur.hidden = false; cur.style.left = px + "px";
      peek.hidden = false;
      peek.style.left = Math.max(70, Math.min(r.width - 70, px)) + "px";
      if (peek.dataset.id !== x.id) { peek.dataset.id = x.id; peek.innerHTML = `${h.cover(x, 240, "", "")}<span><b>${h.esc(h.titleOf(x))}</b>${h.esc(h.fmtShort(x.t))}${x.hasTime ? " · " + h.esc(h.fmtTime(x)) : ""}</span>`; }
    }, { signal });
    box.addEventListener("pointerleave", () => { cur.hidden = true; peek.hidden = true; }, { signal });
    box.addEventListener("click", (e) => { const i = at(e); GP.app.openList(list, i, null); }, { signal });
  }

  /* ---------- the notebook's pages ---------- */
  function monthPages(m) {
    const months = new Map();
    for (const o of m.outings) {
      const k = (o.date || "").slice(0, 7);
      if (!k) continue;
      (months.get(k) || months.set(k, []).get(k)).push(o);
    }
    const firstOf = new Map();
    for (const s of m.life) firstOf.set(s, (s.first || "").slice(0, 7));
    return [...months].sort((a, b) => b[0].localeCompare(a[0])).map(([k, outs]) => {
      const photos = outs.flatMap((o) => o.heroes);
      const lifers = m.life.filter((s) => firstOf.get(s) === k);
      const seen = new Set(), taped = [];
      // wild subjects first; a month with nothing else can show what it has
      const wild = (x) => !x.captive && !x.domestic;
      for (const x of photos.slice().sort((a, b) => wild(b) - wild(a) || b.score - a.score)) {
        if (!x.spKey || x.unsure || seen.has(x.spKey)) continue;
        seen.add(x.spKey); taped.push(x);
        if (taped.length >= 3) break;
      }
      return { k, outs, photos, lifers, taped };
    });
  }
  function short(n) { return n.length > 26 ? n.slice(0, 24) + "…" : n; }
  function page(p, i, h) {
    const [y, mo] = p.k.split("-").map(Number);
    const lines = p.outs.map((o) => {
      const sp = o.species.map((e) => GP.app.model.speciesByKey.get(e.key)).filter(Boolean);
      const names = sp.slice(0, 3).map((s) => `<a href="#/species/${h.esc(s.slug)}">${h.esc(s.name)}</a>`).join(", ") + (sp.length > 3 ? ` &amp; ${sp.length - 3} more` : "");
      const d = +o.date.slice(8, 10);
      return `<li class="nb-line"><b>${d} ${GP.model.MON[mo - 1]}</b> <a href="#/outings/${h.esc(o.id)}">${h.esc(o.type || "Outing")}</a>${names ? ` — ${names}` : ""}. <span class="nb-n">${h.plural(o.photos.length, "frame")}</span></li>`;
    }).join("");
    const lif = p.lifers.length ? `<li class="nb-line nb-new">New for the list: ${p.lifers.slice(0, 6).map((s) => `<a href="#/species/${h.esc(s.slug)}">${h.esc(s.name)}</a>`).join(", ")}${p.lifers.length > 6 ? ` &amp; ${p.lifers.length - 6} more` : ""} <span class="nb-tick">✓</span></li>` : "";
    const k = h.regCtx(p.taped);
    const tape = p.taped.map((x, j) => `<figure class="nb-photo" style="--r:${[-2.4, 1.8, -0.8][j]}deg"><button data-open="${h.esc(x.id)}" aria-label="${h.esc(h.titleOf(x))}">${h.cover(x, 520, "", h.titleOf(x))}</button><i class="nb-tape"></i><figcaption>${h.esc(short(h.titleOf(x)))}${x.hasTime ? `, ${h.esc(GP.sky ? GP.sky.clock(x.mins) : h.fmtTime(x))}` : ""}</figcaption></figure>`).join("");
    return `<article class="nb-spread" style="--i:${i}">
  <div class="nb-page nb-left"><header class="nb-date"><span>${MONTHS()[mo - 1]}</span> <span class="nb-year">${y}</span></header>
    <ul class="nb-lines">${lines}${lif}</ul>
    <p class="nb-tally">${h.plural(p.outs.length, "outing")} · ${h.plural(p.photos.length, "photograph")} kept · ${h.plural(new Set(p.photos.map((x) => x.spKey).filter(Boolean)).size, "species", "species")}</p>
    <span class="nb-pno">${2 * i + 1}</span></div>
  <div class="nb-page nb-right" data-ctx="${k}">${tape}<span class="nb-pno">${2 * i + 2}</span></div>
</article>`;
  }
  function notebook(m, h) {
    const pages = monthPages(m);
    if (!pages.length) return "";
    const first = 4;
    return `<section class="j-card wide nb" aria-label="The field notebook"><h2 class="nb-h">The field notebook</h2><p class="ink">a page a month, newest first</p>
  <div class="nb-book">${pages.slice(0, first).map((p, i) => page(p, i, h)).join("")}</div>
  ${pages.length > first ? `<div class="nb-more-wrap"><button class="btn nb-more" data-nb="more">Turn back further: ${h.plural(pages.length - first, "more month")}</button></div><template class="nb-rest">${pages.slice(first).map((p, i) => page(p, i + first, h)).join("")}</template>` : ""}
</section>`;
  }
  // A short line in the margin, written in as it scrolls into view.
  function ink(text) { return `<p class="ink">${H().esc(text)}</p>`; }

  function mount(main, signal) {
    main.querySelectorAll("[data-bar]").forEach((f) => mountBar(f, signal));
    if (!("IntersectionObserver" in window) || reduced()) {
      main.querySelectorAll(".ink, .nb-spread").forEach((el) => el.classList.add("inked", "turned"));
      return;
    }
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        e.target.classList.add("inked", "turned");
        // the lines on a page are written one after another
        e.target.querySelectorAll(".nb-line, .nb-tally, figcaption").forEach((l, k) => { l.style.setProperty("--d", (0.5 + k * 0.28).toFixed(2) + "s"); });
      }
    }, { rootMargin: "0px 0px -18% 0px" });
    const watch = (root) => root.querySelectorAll(".ink, .nb-spread").forEach((el) => io.observe(el));
    watch(main);
    if (GP.fx) GP.fx.developIn(main.querySelector(".nb-book") || main, signal);
    main.addEventListener("click", (e) => {
      const more = e.target.closest('[data-nb="more"]');
      if (!more) return;
      const tpl = main.querySelector("template.nb-rest"), book = main.querySelector(".nb-book");
      if (!tpl || !book) return;
      const frag = tpl.content.cloneNode(true);
      const added = [...frag.querySelectorAll(".nb-spread")];
      book.appendChild(frag);
      tpl.remove(); more.parentElement.remove();
      added.forEach((el) => io.observe(el));
      if (GP.fx) { const ac = new AbortController(); signal.addEventListener("abort", () => ac.abort()); added.forEach((el) => GP.fx.developIn(el, ac.signal)); }
    }, { signal });
    signal.addEventListener("abort", () => io.disconnect());
  }

  GP.notebook = { barcode, notebook, ink, mount, monthPages };
})(window.GP = window.GP || {});
