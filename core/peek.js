/* Georgiadis Photography: hover previews. Rest the pointer on a link to a species, an outing, a
   room or a plate anywhere on the site and a small card floats up with its photograph and a line
   about it. Links that already show their photograph don't need one. Mouse and trackpad only. */
(function (GP) {
  "use strict";
  const SEL = 'a[href^="#/species/"], a[href^="#/outings/"], a[href^="#/rooms/"], a[href^="#/plates/"], a[href^="#/story/"]';
  const fine = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
  const P = { el: null, t: 0, link: null };

  function info(href) {
    const app = GP.app, m = app && app.model, h = app && app.helpers;
    if (!m) return null;
    const [, kind, raw] = href.split("?")[0].split("/");
    const key = decodeURIComponent(raw || "");
    if (kind === "species") {
      const s = m.speciesBySlug.get(key);
      if (!s || !s.best) return null;
      return { x: s.best, kicker: [s.famName, s.lifeNo ? `No. ${s.lifeNo}` : ""].filter(Boolean).join(" · "), title: s.name, sub: s.bin, line: `${h.plural(s.photos.length, "photograph")} · ${h.plural(s.outingN, "outing")} · first seen ${h.fmtShort(s.first)}` };
    }
    if (kind === "outings" || kind === "story") {
      const o = m.outingById.get(key);
      if (!o || !o.cover) return null;
      return { x: o.cover, kicker: `${kind === "story" ? "The story of " : ""}Chapter ${o.no} · ${o.type}`, title: h.fmtDate(o.date), sub: o.title, line: `${h.plural(o.photos.length, "frame")} · ${h.plural(o.species.length, "species", "species")}` };
    }
    if (kind === "rooms") {
      const r = key === "favourites" ? null : m.rooms.find((x) => x.id === key);
      if (!r || !r.cover) return null;
      return { x: r.cover, kicker: "Exhibition", title: r.title, sub: r.sub, line: h.plural(r.photos.length, "photograph") };
    }
    if (kind === "plates" && GP.plates) {
      const f = GP.plates.plateOf(m, key);
      if (!f) return null;
      return { x: f.species[0].best, kicker: `Plate ${f.roman}`, title: f.common, sub: f.name, line: h.plural(f.species.length, "species", "species") };
    }
    return null;
  }
  function ensure() {
    if (P.el) return;
    P.el = document.createElement("div");
    P.el.className = "peek";
    P.el.setAttribute("aria-hidden", "true");
    document.body.appendChild(P.el);
  }
  function show(a) {
    const d = info(a.getAttribute("href"));
    if (!d) return;
    ensure();
    const h = GP.app.helpers;
    P.el.innerHTML = `<span class="peek-pic">${h.cover(d.x, 520, "", "")}</span><span class="peek-t"><span class="sc">${h.esc(d.kicker || "")}</span><b>${h.esc(d.title)}</b>${d.sub ? `<i>${h.esc(d.sub)}</i>` : ""}<span class="peek-line">${h.esc(d.line || "")}</span></span>`;
    const r = a.getBoundingClientRect(), W = 300, Hh = 250;
    const below = r.top < Hh + 30;
    const left = Math.max(12, Math.min(innerWidth - W - 12, r.left + r.width / 2 - W / 2));
    P.el.style.left = left + "px";
    P.el.style.top = (below ? r.bottom + 12 : r.top - 12) + "px";
    P.el.classList.toggle("below", below);
    P.el.classList.remove("on"); void P.el.offsetWidth;
    P.el.classList.add("on");
  }
  function hide() { clearTimeout(P.t); P.link = null; if (P.el) P.el.classList.remove("on"); }

  document.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "mouse" || !fine()) return;
    const a = e.target.closest && e.target.closest(SEL);
    if (a === P.link) return;
    hide();
    if (!a || a.querySelector("img") || a.closest(".gp-nav, .peek, .vw, .ex2, .foot-col") || a.matches(".chip-noprev")) return;
    P.link = a;
    P.t = setTimeout(() => { if (P.link === a && a.isConnected) show(a); }, 420);
  }, { passive: true });
  document.addEventListener("pointerout", (e) => { if (P.link && !(e.relatedTarget && P.link.contains(e.relatedTarget)) && e.target.closest && e.target.closest(SEL) === P.link) hide(); }, { passive: true });
  addEventListener("scroll", hide, { passive: true });
  document.addEventListener("pointerdown", hide, true);
  addEventListener("hashchange", hide);

  GP.peek = { hide, info };
})(window.GP = window.GP || {});
