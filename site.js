/* Georgiadis Photography: public site loader. Images come from the public copies in
   Nikon/Public Gallery on Google Drive; data/gallery.json is rebuilt by the cloud job. */
(function () {
  "use strict";
  // The newsletter's web app (newsletter/Newsletter.gs, deployed by the site's owner). While
  // this is empty the sign-up card, the envelope in the header and the newsletter page stay hidden.
  const NEWSLETTER = "https://script.google.com/macros/s/AKfycbw_QMentu71iI-TCa3Vak9uTnjNF9lahuNUAqIsnMn-gRwhQ8B9RZ8X0tFt9v2xZMY3/exec";
  const fill = (tpl, id, w) => tpl.replace("{id}", encodeURIComponent(id)).replace("{w}", String(w));
  function adapterFor(raw) {
    if (raw.images === "dev") {
      return {
        src: (x, w) => `/img/${x.id}?w=${w}`,
        full: (x) => `/img/${x.id}?w=0`,
        download: (x) => (raw.site.downloads === false ? null : `/img/${x.id}?w=0`),
        depth: (x) => "depth/" + encodeURIComponent(x.id) + ".webp",
      };
    }
    const u = raw.urls || {};
    // Shared links point at small pages (p/, s/, o/) whose previews show that exact photograph.
    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    return {
      src: (x, w) => (x.pub ? fill(u.image, x.pub, w) : ""),
      full: (x) => (x.pub ? fill(u.full, x.pub, 0) : null),
      download: (x) => (x.pub && raw.site.downloads !== false ? fill(u.download, x.pub, 0) : null),
      shareUrl: (x) => base + "p/" + encodeURIComponent(x.id),
      // a map of how near each part of the photograph is (tools/depth_maps.py)
      depth: (x) => "depth/" + encodeURIComponent(x.id) + ".webp",
      pageUrl: (kind, key) => base + (kind === "outing" ? "o/" : kind === "room" ? "r/" : "s/") + encodeURIComponent(key),
      newsletter: NEWSLETTER,
    };
  }
  // a first visit opens through the viewfinder, which hunts for focus while the archive loads
  if (GP.intro) GP.intro.early();
  function fail(msg) {
    if (GP.intro) GP.intro.cancel();
    document.getElementById("app").innerHTML = `<div class="wrap"><div class="empty"><h2>The gallery didn't load</h2><p>${msg}</p><button class="btn" onclick="location.reload()">Try again</button></div></div>`;
  }
  fetch("data/gallery.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`The photo index returned ${r.status}.`); return r.json(); })
    .then((raw) => {
      const n = Object.values(raw.folders || {}).reduce((k, f) => k + Object.keys(f.photos || {}).length, 0);
      if (!n) {
        if (GP.intro) GP.intro.cancel();
        document.getElementById("app").innerHTML = `<div class="wrap page"><div class="empty"><div class="kicker">${(raw.site && raw.site.tagline) || "Wildlife of Central Florida"}</div><h2>${(raw.site && raw.site.title) || "Georgiadis Photography"}</h2><p>The gallery is being prepared. Photographs appear here as soon as the first public copies are ready.</p></div></div>`;
        return;
      }
      GP.app.start({ root: document.getElementById("app"), raw, adapter: adapterFor(raw), model: { publicOnly: true } });
    })
    .catch((e) => { console.error(e); fail(e.message || "Check your connection and reload."); });
})();
