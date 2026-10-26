/* Georgiadis Photography: things the gallery remembers for each visitor, on their own device only.
   Favourites (a heart in the viewer, or L), which photographs are new since their last visit,
   and where they left off. Nothing here leaves the browser. */
(function (GP) {
  "use strict";
  const local = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window or full */ } },
  };
  const session = {
    get(k) { try { const v = sessionStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
  };
  const V = { favs: local.get("gp-favs", []), newIds: new Set(), prev: null, first: false, model: null };
  const app = () => GP.app;

  /* ---------- new since the last visit ---------- */
  // The set of photographs seen at the end of each visit is kept; this visit's "new" list is
  // worked out once per browser session so a reload doesn't wipe it.
  function ensure() {
    const m = app() && app().model;
    if (!m || V.model === m) return m;
    V.model = m;
    const ids = m.photos.map((x) => x.id);
    const sess = session.get("gp-new");
    if (sess) { V.newIds = new Set(sess.ids || []); V.prev = sess.prev || null; V.first = !!sess.first; }
    else {
      const seen = local.get("gp-seen", null);
      if (seen && Array.isArray(seen.ids)) {
        const old = new Set(seen.ids);
        V.newIds = new Set(ids.filter((i) => !old.has(i)));
        V.prev = seen.at || null;
      } else V.first = true;
      session.set("gp-new", { ids: [...V.newIds], prev: V.prev, first: V.first });
    }
    // remember everything shown now, for next time
    local.set("gp-seen", { ids, at: new Date().toISOString() });
    return m;
  }
  function isNew(id) { ensure(); return V.newIds.has(id); }
  function newPhotos() {
    const m = ensure();
    if (!m || !V.newIds.size) return [];
    // one per burst, newest first
    const seen = new Set(), out = [];
    for (const x of m.photos) {
      if (!V.newIds.has(x.id)) continue;
      const k = x.burst ? x.burst.id : x.id;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x.burst ? x.burst.frames.find((f) => f.isHero) || x : x);
    }
    return out.sort((a, b) => b.t.localeCompare(a.t));
  }

  /* ---------- favourites ---------- */
  function isFav(id) { return V.favs.includes(id); }
  function toggleFav(id) {
    const i = V.favs.indexOf(id);
    if (i >= 0) V.favs.splice(i, 1); else V.favs.unshift(id);
    local.set("gp-favs", V.favs);
    const on = i < 0;
    for (const t of document.querySelectorAll(`.tile[data-id="${CSS.escape(id)}"]`)) t.classList.toggle("is-fav", on);
    document.dispatchEvent(new CustomEvent("gp:favs", { detail: { id, on } }));
    return on;
  }
  function favPhotos() {
    const m = ensure();
    return m ? V.favs.map((id) => m.byId.get(id)).filter(Boolean) : [];
  }

  /* ---------- where they left off ---------- */
  document.addEventListener("gp:viewer-show", (e) => {
    const x = e.detail && e.detail.x;
    if (x) local.set("gp-last", { id: x.id, at: Date.now() });
  });
  function lastSeen() {
    const m = ensure(), l = local.get("gp-last", null);
    if (!m || !l) return null;
    const x = m.byId.get(l.id);
    return x ? { x, at: l.at } : null;
  }
  function visits() {
    // count visits (sessions) so the home page can greet a returning visitor
    if (!session.get("gp-counted")) { session.set("gp-counted", true); local.set("gp-visits", local.get("gp-visits", 0) + 1); }
    return local.get("gp-visits", 1);
  }
  function ago(ms) {
    const d = (Date.now() - ms) / 864e5;
    if (d < 1 / 24) return "just now";
    if (d < 1) return `${Math.round(d * 24)} hour${Math.round(d * 24) === 1 ? "" : "s"} ago`;
    if (d < 2) return "yesterday";
    if (d < 30) return `${Math.round(d)} days ago`;
    return `${Math.round(d / 30)} month${Math.round(d / 30) === 1 ? "" : "s"} ago`;
  }

  GP.visitor = {
    isNew, newPhotos, isFav, toggleFav, favPhotos, lastSeen, visits, ago,
    get firstVisit() { ensure(); return V.first; },
    get previousVisit() { ensure(); return V.prev; },
  };
})(window.GP = window.GP || {});
