/* Georgiadis Photography: the cabinet of specimens. The species guide as a natural-history
   cabinet: one case per class, one drawer per family with a brass label holder. A drawer slides
   open into a tray of mounted photographs, each with a museum label. The open drawer is kept
   in the address (?open=Family) so it can be linked to. */
(function (GP) {
  "use strict";
  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
  const CASE_ORDER = ["Aves", "Reptilia", "Mammalia", "Amphibia", "Insecta", "Malacostraca", "Diplopoda"];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function museumDate(iso) {
    const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || "");
    return m ? `${+m[3]}.${ROMAN[+m[2] - 1]}.${m[1]}` : "";
  }
  function region(site) {
    const m = /\bof (.+)$/i.exec((site && site.tagline) || "");
    return m ? m[1] : "Central Florida";
  }
  // a steady, gentle tilt per specimen so the tray looks hand-mounted
  function tilt(key) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0; return ((Math.abs(h) % 17) - 8) / 10; }

  function drawers(model) {
    const cases = [];
    for (const [cls, c] of model.tree) {
      const fams = [];
      for (const o of c.orders.values()) for (const f of o.families.values()) {
        const sp = f.species.filter((s) => s.lifeNo);
        if (sp.length) fams.push({ id: f.name, name: f.name, common: f.common, order: o.name, species: sp.sort((a, b) => a.lifeNo - b.lifeNo) });
      }
      if (!fams.length) continue;
      fams.sort((a, b) => a.order.localeCompare(b.order) || b.species.length - a.species.length || a.common.localeCompare(b.common));
      cases.push({ cls, common: c.common, fams, n: fams.reduce((k, f) => k + f.species.length, 0) });
    }
    cases.sort((a, b) => ((CASE_ORDER.indexOf(a.cls) + 1) || 99) - ((CASE_ORDER.indexOf(b.cls) + 1) || 99) || b.n - a.n);
    // everything that isn't on the life list gets its own case at the end
    const rest = model.species.filter((s) => !s.lifeNo);
    const extra = [
      { id: "captive", name: "Captiva", common: "Captive animals", species: rest.filter((s) => s.captive) },
      { id: "domestic", name: "Domestica", common: "Domestic animals", species: rest.filter((s) => s.domestic && !s.captive) },
      { id: "unresolved", name: "Incertae sedis", common: "Not yet identified to species", species: rest.filter((s) => !s.captive && !s.domestic) },
    ].filter((d) => d.species.length);
    if (extra.length) cases.push({ cls: "Varia", common: "Also in the collection", fams: extra, n: extra.reduce((k, f) => k + f.species.length, 0), extra: true });
    return cases;
  }

  function html(model, h) {
    const cases = drawers(model);
    const front = (f) => {
      const best = f.species.slice().sort((a, b) => b.photos.length - a.photos.length)[0];
      const pic = best && best.best ? `<span class="cab-window">${h.cover(best.best, 220)}</span>` : "";
      return `<button class="cab-drawer" data-fam="${h.esc(f.id)}" aria-expanded="false" aria-label="${h.esc(`${f.common}, ${f.name}: ${h.plural(f.species.length, "species", "species")}`)}">
  ${pic}<span class="cab-holder"><span class="cab-card"><b>${h.esc(f.name)}</b><i>${h.esc(f.common)}</i><span>${h.plural(f.species.length, "specimen")}</span></span></span>
  <span class="cab-pull" aria-hidden="true"></span></button>`;
    };
    return `<div class="cab" data-cab>
${cases.map((c) => `<section class="cab-case${c.extra ? " varia" : ""}" aria-label="${h.esc(c.common)}">
  <header class="cab-crest"><span class="cab-plaque"><b>${h.esc(c.cls)}</b><i>${h.esc(c.common)}</i></span><span class="sc">${h.plural(c.n, "species", "species")} · ${h.plural(c.fams.length, "drawer")}</span></header>
  <div class="cab-drawers">${c.fams.map(front).join("")}</div>
</section>`).join("")}
</div>`;
  }

  function tray(f, model, h) {
    const where = region(GP.app.site);
    const specs = f.species.map((s, i) => {
      const x = s.best;
      const flag = s.captive ? "captive" : s.domestic ? "domestic" : s.uncertain ? "det. uncertain" : s.sp ? "det. to genus" : where;
      return `<a class="cab-spec" href="#/species/${h.esc(s.slug)}" ${x ? `data-id="${h.esc(x.id)}"` : ""} style="--tilt:${tilt(s.key)}deg;--i:${i}">
  <span class="cab-photo">${h.cover(x, 520, "", s.name)}<span class="cab-pin" aria-hidden="true"></span></span>
  <span class="cab-label">
    ${s.bin ? `<i class="bin">${h.esc(s.bin)}</i>` : ""}<b>${h.esc(s.name)}</b>
    <span class="row"><span>${h.esc(flag)}</span><span>${h.esc(museumDate(s.first))}</span></span>
    <span class="row"><span>coll. Georgiadis</span><span>${s.lifeNo ? "No. " + String(s.lifeNo).padStart(3, "0") : h.plural(s.photos.length, "ph.", "ph.")}</span></span>
  </span>
</a>`;
    }).join("");
    return `<div class="cab-tray" id="cab-tray-${h.esc(f.id)}" role="region" aria-label="${h.esc(f.common)}"><div class="cab-tray-in"><div class="cab-tray-wood">
  <div class="cab-tray-head"><span><b>${h.esc(f.common)}</b> <i>${h.esc(f.name)}</i></span><span class="sc">${h.plural(f.species.length, "specimen")} · ${h.plural(f.species.reduce((k, s) => k + s.photos.length, 0), "photograph")}</span><button class="icon-btn cab-close" aria-label="Close the drawer">${h.ICON.close}</button></div>
  <div class="cab-board">${specs}</div>
</div></div></div>`;
  }

  function mount(main, signal, model, h) {
    const root = main.querySelector("[data-cab]");
    if (!root) return;
    const byId = new Map();
    for (const c of drawers(model)) for (const f of c.fams) byId.set(f.id, f);
    let open = null; // { id, btn, tray }

    function rowEnd(btn) {
      // the last drawer on the same visual row, so the tray opens beneath the whole row
      const list = [...btn.parentElement.querySelectorAll(".cab-drawer")];
      const top = btn.offsetTop;
      let end = btn;
      for (const d of list) if (Math.abs(d.offsetTop - top) < 4) end = d;
      return end;
    }
    function collapse(o, instant) {
      if (!o) return;
      o.btn.classList.remove("open");
      o.btn.setAttribute("aria-expanded", "false");
      if (instant || reduced()) { o.tray.remove(); return; }
      o.tray.classList.remove("on");
      setTimeout(() => o.tray.remove(), 620);
    }
    function openDrawer(id, o = {}) {
      const f = byId.get(id);
      const btn = root.querySelector(`.cab-drawer[data-fam="${CSS.escape(id)}"]`);
      if (!f || !btn) return;
      if (open && open.id === id) { closeDrawer(); return; }
      const prev = open;
      const sameRow = prev && prev.btn.parentElement === btn.parentElement && Math.abs(prev.btn.offsetTop - btn.offsetTop) < 4;
      // a tray above this drawer goes at once, with the page held still, so the drawer doesn't jump
      const above = prev && !sameRow && (prev.tray.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
      const y0 = btn.getBoundingClientRect().top;
      collapse(prev, sameRow || above || o.instant);
      if (above) window.scrollBy(0, btn.getBoundingClientRect().top - y0);
      const wrap = document.createElement("div");
      wrap.innerHTML = tray(f, model, h);
      const t = wrap.firstElementChild;
      rowEnd(btn).after(t);
      btn.classList.add("open");
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("aria-controls", t.id);
      open = { id, btn, tray: t };
      if (o.instant || reduced() || sameRow) t.classList.add("on", "instant");
      else requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("on")));
      if (!o.fromUrl) GP.app.setQuery((q) => q.set("open", id));
      // bring the drawer and the top of its tray into view
      const r = btn.getBoundingClientRect(), head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64;
      if (r.top < head + 10 || r.bottom > innerHeight * 0.55) window.scrollTo({ top: scrollY + r.top - head - 24, behavior: o.instant || reduced() ? "auto" : "smooth" });
    }
    function closeDrawer() {
      const o = open;
      open = null;
      collapse(o);
      GP.app.setQuery((q) => q.delete("open"));
      if (o) o.btn.focus({ preventScroll: true });
    }
    root.addEventListener("click", (e) => {
      if (e.target.closest(".cab-close")) { closeDrawer(); return; }
      const d = e.target.closest(".cab-drawer");
      if (d) openDrawer(d.dataset.fam);
    }, { signal });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) { e.stopPropagation(); closeDrawer(); } }, { signal });
    // keep the tray under its row when the window changes width
    let rt;
    addEventListener("resize", () => {
      clearTimeout(rt);
      rt = setTimeout(() => { if (open && open.tray.isConnected) { const end = rowEnd(open.btn); if (end.nextElementSibling !== open.tray) end.after(open.tray); } }, 120);
    }, { signal });
    const q = GP.app.parseHash().q.get("open");
    if (q && byId.has(q)) requestAnimationFrame(() => openDrawer(q, { instant: true, fromUrl: true }));
  }

  GP.cabinet = { html, mount, museumDate };
})(window.GP = window.GP || {});
