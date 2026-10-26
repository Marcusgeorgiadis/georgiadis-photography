/* Georgiadis Photography: the growing tree of life. A radial family tree of the life list
   (class, order, family, species) that grows branch by branch as the reader scrolls through
   the order the species were first photographed. Leaves are round photographs. */
(function (GP) {
  "use strict";
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const CLASS_ORDER = ["Aves", "Reptilia", "Mammalia", "Amphibia", "Insecta", "Malacostraca", "Diplopoda"];
  const RAD = { root: 0, cls: 0.29, order: 0.47, fam: 0.65, leaf: 0.84, leaf2: 0.96 };
  const R = 440; // tree radius in viewBox units (the box runs -500..500)

  function build(model) {
    const life = model.life;
    const N = life.length;
    // nested tree in display order
    const classes = [];
    for (const [cls, c] of model.tree) {
      const orders = [];
      for (const o of c.orders.values()) {
        const fams = [];
        for (const f of o.families.values()) {
          const sp = f.species.filter((s) => s.lifeNo).sort((a, b) => a.lifeNo - b.lifeNo);
          if (sp.length) fams.push({ name: f.name, common: f.common, sp });
        }
        if (fams.length) orders.push({ name: o.name, fams: fams.sort((a, b) => a.sp[0].lifeNo - b.sp[0].lifeNo) });
      }
      if (orders.length) classes.push({ name: cls, common: c.common, orders: orders.sort((a, b) => a.fams[0].sp[0].lifeNo - b.fams[0].sp[0].lifeNo) });
    }
    classes.sort((a, b) => ((CLASS_ORDER.indexOf(a.name) + 1) || 99) - ((CLASS_ORDER.indexOf(b.name) + 1) || 99));
    // angular units: one per leaf, with breathing room between families, orders and classes
    let u = 0;
    const leaves = [], nodes = [], links = [];
    const node = (id, kind, label, parent) => { const n = { id, kind, label, parent, kids: [], a: 0, r: RAD[kind] * R, t: Infinity }; nodes.push(n); if (parent) parent.kids.push(n); return n; };
    const root = node("root", "root", "Life", null);
    classes.forEach((c, ci) => {
      if (ci) u += 2.2;
      const cn = node("c:" + c.name, "cls", c.common, root);
      c.orders.forEach((o, oi) => {
        if (oi) u += 0.7;
        const on = node("o:" + o.name, "order", o.name, cn);
        o.fams.forEach((f, fi) => {
          if (fi) u += 0.35;
          const fn = node("f:" + f.name, "fam", f.common, on);
          f.sp.forEach((s, si) => {
            const ln = node("s:" + s.key, "leaf", s.name, fn);
            ln.s = s; ln.u = u; ln.t = s.lifeNo;
            // crowded families alternate between two rings so the photographs can be larger
            if (f.sp.length > 1 && si % 2) ln.r = RAD.leaf2 * R;
            leaves.push(ln);
            u += 1;
          });
        });
      });
    });
    const U = Math.max(1, u - 1);
    const ang = (uu) => (uu / (U + 2.2)) * Math.PI * 2 - Math.PI / 2;
    for (const l of leaves) l.a = ang(l.u);
    // inner nodes: centred over their leaves, appearing with their first species
    const settle = (n) => {
      if (n.kind === "leaf") return [n.a, n.a, n.t];
      let lo = Infinity, hi = -Infinity, t = Infinity;
      for (const k of n.kids) { const [a0, a1, tt] = settle(k); lo = Math.min(lo, a0); hi = Math.max(hi, a1); t = Math.min(t, tt); }
      n.a = (lo + hi) / 2; n.t = t; n.lo = lo; n.hi = hi;
      return [lo, hi, t];
    };
    settle(root);
    for (const n of nodes) if (n.parent) links.push({ from: n.parent, to: n, t: n.t });
    const step = (2 * Math.PI) / (U + 2.2);
    const leafD = Math.max(16, Math.min(70, step * RAD.leaf * R * 1.75));
    return { N, nodes, leaves, links, root, classes, leafD };
  }

  const xy = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
  function linkPath(l) {
    const p = l.from, c = l.to;
    if (p.kind === "root") { const [x, y] = xy(c.a, c.r); return `M0,0 L${x.toFixed(1)},${y.toFixed(1)}`; }
    const m = (p.r + c.r) / 2;
    const [x0, y0] = xy(p.a, p.r), [x1, y1] = xy(p.a, m), [x2, y2] = xy(c.a, m), [x3, y3] = xy(c.a, c.r);
    return `M${x0.toFixed(1)},${y0.toFixed(1)} C${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${x3.toFixed(1)},${y3.toFixed(1)}`;
  }

  function html(model, h) {
    const T = build(model);
    if (!T.N) return "";
    const first = model.life[0], last = model.life[T.N - 1];
    const rings = [RAD.cls, RAD.order, RAD.fam].map((k) => `<circle r="${(k * R).toFixed(0)}" class="tl-ring"/>`).join("");
    const paths = T.links.map((l) => `<path d="${linkPath(l)}" pathLength="1" class="tl-l k-${l.to.kind}" data-t="${l.t}" data-to="${h.esc(l.to.id)}"/>`).join("");
    const clsLabels = T.nodes.filter((n) => n.kind === "cls").map((n) => {
      const [x, y] = xy(n.a, RAD.cls * R);
      return `<text x="${x.toFixed(0)}" y="${(y + 4).toFixed(0)}" class="tl-cl" data-t="${n.t}" text-anchor="middle">${h.esc(n.label.toUpperCase())}</text>`;
    }).join("");
    const pct = (v) => ((v + 500) / 10).toFixed(2) + "%";
    const leaves = T.leaves.map((l) => {
      const [x, y] = xy(l.a, l.r), s = l.s;
      return `<a class="tl-leaf" href="#/species/${h.esc(s.slug)}" data-t="${l.t}" data-path="${h.esc([l.id, l.parent.id, l.parent.parent.id, l.parent.parent.parent.id].join("|"))}" style="left:${pct(x)};top:${pct(y)}" data-tip="${h.esc(s.name)}" data-tip-v="No. ${String(s.lifeNo).padStart(3, "0")} · ${h.esc(h.fmtShort(s.first))}" aria-label="${h.esc(`${s.name}, number ${s.lifeNo} on the life list, first photographed ${h.fmtDate(s.first)}`)}">${h.cover(s.best, 160)}</a>`;
    }).join("");
    return `<div class="tl" style="--n:${T.N};--leaf:${(T.leafD / 10).toFixed(2)}%">
  <div class="tl-stage">
    <div class="tl-read" aria-live="polite">
      <div class="kicker">The life list, grown in order</div>
      <div class="tl-date display">${h.esc(h.fmtDate(first.first))}</div>
      <div class="tl-bar" aria-hidden="true"><i></i><span class="sc">${h.esc(h.fmtShort(first.first))}</span><span class="sc">${h.esc(h.fmtShort(last.first))}</span></div>
      <a class="tl-now" href="#/species/${h.esc(first.slug)}"><span class="tl-now-img">${h.cover(first.best, 240)}</span><span class="tl-now-t"><span class="sc">New · No. <b>001</b></span><b class="nm">${h.esc(first.name)}</b><i class="binomial">${h.esc(first.bin || "")}</i><span class="tl-lin sc"></span></span></a>
      <p class="tl-hint sc">Scroll to grow the tree</p>
      <button class="btn tl-play" data-tl="play" aria-pressed="false">▶ Grow it for me</button>
    </div>
    <div class="tl-box">
      <svg class="tl-svg" viewBox="-500 -500 1000 1000" role="img" aria-label="Radial tree of ${h.plural(T.N, "species", "species")} by class, order and family">${rings}<g class="tl-links">${paths}</g>${clsLabels}</svg>
      <div class="tl-leaves">${leaves}</div>
      <div class="tl-core" aria-hidden="true"><b class="display">0</b><span class="sc">species</span></div>
    </div>
  </div>
</div>`;
  }

  function mount(main, signal, model, h) {
    const el = main.querySelector(".tl");
    if (!el) return;
    const T = build(model), N = T.N, life = model.life;
    const links = [...el.querySelectorAll(".tl-l")], leaves = [...el.querySelectorAll(".tl-leaf")], labels = [...el.querySelectorAll(".tl-cl")];
    const core = el.querySelector(".tl-core b"), date = el.querySelector(".tl-date"), now = el.querySelector(".tl-now"), bar = el.querySelector(".tl-bar i"), hint = el.querySelector(".tl-hint");
    const lineage = (s) => [s.cls ? (model.tree.get(s.cls) || {}).common || s.cls : "", s.order, s.famName].filter(Boolean).join(" › ");
    const t0 = Date.parse(life[0].first), t1 = Date.parse(life[N - 1].first);
    let shown = -1;

    function setK(k) {
      if (k === shown) return;
      shown = k;
      for (const l of links) l.classList.toggle("on", +l.dataset.t <= k);
      for (const l of labels) l.classList.toggle("on", +l.dataset.t <= k);
      for (const l of leaves) { const t = +l.dataset.t; l.classList.toggle("on", t <= k); l.classList.toggle("new", t === k); }
      core.textContent = h.fmtN(k);
      const s = life[Math.max(0, k - 1)];
      date.textContent = h.fmtDate(s.first);
      bar.style.width = (t1 > t0 ? ((Date.parse(s.first) - t0) / (t1 - t0)) * 100 : 100).toFixed(1) + "%";
      now.href = "#/species/" + s.slug;
      now.querySelector(".tl-now-img").innerHTML = h.cover(s.best, 240);
      now.querySelector(".nm").textContent = s.name;
      now.querySelector(".binomial").textContent = s.bin || "";
      now.querySelector(".tl-now-t .sc b").textContent = String(s.lifeNo).padStart(3, "0");
      now.querySelector(".tl-lin").textContent = lineage(s);
      now.classList.toggle("empty", k === 0);
      hint.textContent = k >= N ? `${h.plural(N, "species", "species")} in ${h.plural(T.nodes.filter((n) => n.kind === "fam").length, "family", "families")}, and counting` : "Scroll to grow the tree";
      now.classList.remove("pop"); void now.offsetWidth; now.classList.add("pop");
    }

    if (reduced()) { el.classList.add("still"); setK(N); }
    else {
      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = el.getBoundingClientRect(), stage = el.querySelector(".tl-stage").offsetHeight;
          const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64;
          const run = Math.max(1, r.height - stage);
          const p = Math.max(0, Math.min(1, (head - r.top) / run));
          // the first species is already there when the tree comes into view
          setK(Math.max(1, Math.min(N, Math.round(p * (N - 1)) + 1)));
        });
      };
      addEventListener("scroll", onScroll, { passive: true, signal });
      addEventListener("resize", onScroll, { passive: true, signal });
      onScroll();
      // "Grow it for me": scroll through the section on its own, about eight species a second
      const btn = el.querySelector('[data-tl="play"]');
      let auto = 0;
      const stop = () => { if (!auto) return; cancelAnimationFrame(auto); auto = 0; btn.setAttribute("aria-pressed", "false"); btn.textContent = "▶ Grow it for me"; };
      btn.addEventListener("click", () => {
        if (auto) { stop(); return; }
        const head = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--head-h")) || 64;
        const top = el.getBoundingClientRect().top + scrollY - head, end = top + el.offsetHeight - el.querySelector(".tl-stage").offsetHeight;
        const from = shown >= N ? top : Math.max(top, scrollY), dur = Math.max(2500, ((end - from) / Math.max(1, end - top)) * N * 130);
        const t0 = performance.now();
        btn.setAttribute("aria-pressed", "true"); btn.textContent = "❚❚ Stop";
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          window.scrollTo(0, from + (end - from) * k);
          auto = k < 1 ? requestAnimationFrame(step) : 0;
          if (!auto) stop();
        };
        auto = requestAnimationFrame(step);
      }, { signal });
      for (const ev of ["wheel", "touchstart", "keydown"]) addEventListener(ev, (e) => { if (auto && !(ev === "keydown" && e.target === btn)) stop(); }, { passive: true, signal });
      signal.addEventListener("abort", stop);
    }
    // hovering a leaf lights its lineage back to the root
    const hl = (leaf, on) => {
      const ids = new Set((leaf.dataset.path || "").split("|"));
      for (const l of links) if (ids.has(l.dataset.to)) l.classList.toggle("hl", on);
      el.classList.toggle("hovering", on);
    };
    el.addEventListener("pointerover", (e) => { const l = e.target.closest(".tl-leaf"); if (l) hl(l, true); }, { signal });
    el.addEventListener("pointerout", (e) => { const l = e.target.closest(".tl-leaf"); if (l && !l.contains(e.relatedTarget)) hl(l, false); }, { signal });
    el.addEventListener("focusin", (e) => { const l = e.target.closest(".tl-leaf"); if (l) hl(l, true); }, { signal });
    el.addEventListener("focusout", (e) => { const l = e.target.closest(".tl-leaf"); if (l) hl(l, false); }, { signal });
  }

  // A small still of the whole tree, for the home page.
  function mini(model) {
    const T = build(model);
    if (!T.N) return "";
    const paths = T.links.map((l) => `<path d="${linkPath(l)}" class="k-${l.to.kind}"/>`).join("");
    const dots = T.leaves.map((l, i) => { const [x, y] = xy(l.a, l.r); return `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${Math.max(8, T.leafD * 0.3).toFixed(1)}" style="--i:${i};fill:${(l.s.best && l.s.best.pal[0]) || "#888"}"/>`; }).join("");
    return `<svg class="tree-mini" viewBox="-520 -520 1040 1040"><g class="tm-l">${paths}</g><g class="tm-d">${dots}</g><circle r="74" class="tm-core"/><text y="12" text-anchor="middle" class="tm-n">${T.N}</text></svg>`;
  }

  GP.treeOfLife = { html, mount, mini };
})(window.GP = window.GP || {});
