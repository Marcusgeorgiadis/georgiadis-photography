/* Georgiadis Photography: natural-history plates, and the paper they're printed on.
   #/plates lists a plate for every family on the life list, numbered in the cabinet's order;
   #/plates/<Family> is one plate: its species as engraved vignettes, numbered, with Latin names,
   on cream paper, ready to print. GP.plates.wash(species) paints the watercolour wash a species
   page sits on, from that bird's own palette. */
(function (GP) {
  "use strict";
  const ROMAN = (n) => { const r = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]]; let s = ""; for (const [v, l] of r) while (n >= v) { s += l; n -= v; } return s; };
  const CASE_ORDER = ["Aves", "Reptilia", "Mammalia", "Amphibia", "Insecta", "Malacostraca", "Diplopoda"];

  // Families with species on the life list, in the cabinet's order (class, order, then size).
  function families(m) {
    const out = [];
    for (const [cls, c] of m.tree) for (const o of c.orders.values()) for (const f of o.families.values()) {
      const sp = f.species.filter((s) => s.lifeNo && s.best).sort((a, b) => a.lifeNo - b.lifeNo);
      if (sp.length) out.push({ name: f.name, common: f.common, order: o.name, cls, clsName: c.common, species: sp });
    }
    out.sort((a, b) => ((CASE_ORDER.indexOf(a.cls) + 1) || 99) - ((CASE_ORDER.indexOf(b.cls) + 1) || 99) || a.order.localeCompare(b.order) || b.species.length - a.species.length || a.common.localeCompare(b.common));
    out.forEach((f, i) => { f.no = i + 1; f.roman = ROMAN(i + 1); });
    return out;
  }
  function plateOf(m, name) { return families(m).find((f) => f.name === name) || null; }

  /* ---------- the watercolour wash ---------- */
  function seed(str) { let h = 2166136261; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }
  // Pigment pools from the palette: each shape wobbles at its edge, gathers darker pigment along
  // it the way watercolour dries, and granulates where the paper's tooth catches it.
  function wash(s) {
    if (!s || !s.best) return "";
    const chroma = (c) => { const [, sa, l] = GP.model.hexHsl(c); return sa * (1 - Math.abs(2 * l - 1)); };
    // the most colourful tones first, so they're the ones repeated
    const pal = (s.best.pal || []).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 5).sort((a, b) => chroma(b) - chroma(a)), r = seed(s.key || s.name), id = "w" + Math.floor(r() * 1e9).toString(36);
    if (!pal.length) return "";
    // a little more colour than the photograph's averages, and lighter, as a wash is
    const tone = (c) => { const [hh, ss, ll] = GP.model.hexHsl(c); const s2 = Math.min(0.75, ss * 1.35 + 0.08), l2 = Math.min(0.72, Math.max(0.38, ll * 0.85 + 0.12)); return `hsl(${Math.round(hh)} ${Math.round(s2 * 100)}% ${Math.round(l2 * 100)}%)`; };
    const blobs = pal.concat(pal.slice(0, 3)).map((c, i) => {
      const cx = 6 + r() * 88, cy = 4 + r() * 62, rx = 10 + r() * 20, ry = 9 + r() * 16;
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${rx.toFixed(1)}" ry="${ry.toFixed(1)}" fill="${tone(c)}" opacity="${(0.42 + r() * 0.32).toFixed(2)}" transform="rotate(${Math.round(r() * 50 - 25)} ${cx.toFixed(0)} ${cy.toFixed(0)})"/>`;
    }).join("");
    return `<svg class="paper-wash" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>
  <filter id="${id}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="4" seed="${Math.floor(r() * 99)}" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="7" xChannelSelector="R" yChannelSelector="G" result="d"/>
    <feGaussianBlur in="d" stdDeviation="1.4" result="b"/>
    <feComposite in="d" in2="b" operator="arithmetic" k2="1.75" k3="-0.85" result="edge"/>
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="${Math.floor(r() * 99)}" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -0.9 1.18" result="ga"/>
    <feComposite in="edge" in2="ga" operator="in"/>
  </filter>
</defs><g filter="url(#${id})">${blobs}</g></svg><i class="paper-grain"></i>`;
  }

  /* ---------- the plates ---------- */
  function layout(n) { return n <= 1 ? 1 : n <= 2 ? 2 : n <= 3 ? 3 : n === 4 ? 2 : n <= 6 ? 3 : n <= 8 ? 4 : n <= 12 ? 4 : 5; }
  function plateHtml(f, h, site, years) {
    const cols = layout(f.species.length);
    return `<article class="plate" style="--cols:${cols}" aria-label="Plate ${f.roman}: ${h.esc(f.common)}">
  <div class="plate-in">
    <header class="plate-head"><span class="plate-cls">${h.esc(f.clsName || f.cls)} · ${h.esc(f.order)}</span><span class="plate-no">Plate ${f.roman}</span></header>
    <h2 class="plate-title"><span class="plate-lat">${h.esc(f.name.toUpperCase())}</span><span class="plate-com">${h.esc(f.common)}</span></h2>
    <div class="plate-figs">${f.species.map((s, i) => `<a class="plate-fig" href="#/species/${h.esc(s.slug)}"><span class="plate-v">${h.cover(s.best, 640, "", s.name)}</span><span class="plate-n">${i + 1}</span><span class="plate-cap"><b>${h.esc(s.name)}</b>${s.bin ? `<i>${h.esc(s.bin)}</i>` : ""}</span></a>`).join("")}</div>
    <footer class="plate-foot"><span>${h.esc(site.title || "Georgiadis Photography")} · ${h.esc((site.tagline || "Wildlife of Central Florida").replace(/^Wildlife of /, ""))} · ${h.esc(years)}</span><span>${f.species.map((s, i) => `${i + 1}. ${h.esc(s.bin || s.name)}`).join("  ·  ")}</span></footer>
  </div>
</article>`;
  }
  function render({ parts, model: m, h }) {
    const site = GP.app.site, fams = families(m);
    const st = m.stats, y0 = (st.first || "").slice(0, 4), y1 = (st.last || "").slice(0, 4), years = y0 === y1 ? y0 : `${y0}–${y1}`;
    if (parts[1]) {
      const f = fams.find((x) => x.name === decodeURIComponent(parts[1]));
      if (!f) return { html: `<div class="wrap page"><div class="empty"><h2>No such plate</h2><p><a href="#/plates">All the plates</a></p></div></div>`, title: "Plates" };
      const i = fams.indexOf(f), prev = fams[i - 1], next = fams[i + 1];
      const html = `<div class="wrap page plates-page">
  <div class="plate-bar"><a class="btn ghost" href="#/plates">${h.ICON.left} All plates</a><span class="sc">Plate ${f.roman} of ${ROMAN(fams.length)}</span><button class="btn" data-plate="print">Print this plate</button></div>
  ${plateHtml(f, h, site, years)}
  <nav class="plate-nav">${prev ? `<a class="btn" href="#/plates/${encodeURIComponent(prev.name)}">${h.ICON.left} Plate ${prev.roman} · ${h.esc(prev.common)}</a>` : "<span></span>"}${next ? `<a class="btn" href="#/plates/${encodeURIComponent(next.name)}">Plate ${next.roman} · ${h.esc(next.common)} ${h.ICON.right}</a>` : ""}</nav>
</div>`;
      const after = (main, signal) => {
        main.addEventListener("click", (e) => { if (e.target.closest('[data-plate="print"]')) window.print(); }, { signal });
        document.documentElement.classList.add("printing-plate");
        signal.addEventListener("abort", () => document.documentElement.classList.remove("printing-plate"));
        // the vignettes are engraved in, one after another
        main.querySelectorAll(".plate-fig").forEach((el, k) => el.style.setProperty("--k", k));
        requestAnimationFrame(() => main.querySelector(".plate").classList.add("on"));
      };
      return { html, after, title: `Plate ${f.roman} · ${f.common}` };
    }
    const html = `<div class="wrap page plates-page">${h.pageHead("Natural-history plates", "The plates", `${h.plural(fams.length, "plate")}, one for every family on the life list, in the style of an old field guide: each species numbered and named. Open one to print it.`)}
<div class="plates-grid">${fams.map((f) => `<a class="plate-card" href="#/plates/${encodeURIComponent(f.name)}"><span class="plate-mini"><span class="plate-mini-no">${f.roman}</span>${f.species.slice(0, 4).map((s) => `<span class="pm-v">${h.cover(s.best, 240, "", "")}</span>`).join("")}</span><span class="plate-card-t"><span class="sc">Plate ${f.roman}</span><b>${h.esc(f.common)}</b><i>${h.esc(f.name)} · ${h.plural(f.species.length, "species", "species")}</i></span></a>`).join("")}</div></div>`;
    return { html, title: "Plates" };
  }

  GP.plates = { families, plateOf, wash, roman: ROMAN };
  (GP.views = GP.views || []).push({ id: "plates", label: "Plates", nav: false, render });
})(window.GP = window.GP || {});
