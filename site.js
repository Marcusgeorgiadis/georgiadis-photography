/* Georgiadis Photography: public site loader. Images come from the public copies in
   Nikon/Public Gallery on Google Drive; data/gallery.json is rebuilt by the cloud job. */
(function () {
  "use strict";
  const fill = (tpl, id, w) => tpl.replace("{id}", encodeURIComponent(id)).replace("{w}", String(w));
  function adapterFor(raw) {
    if (raw.images === "dev") {
      return {
        src: (x, w) => `/img/${x.id}?w=${w}`,
        full: (x) => `/img/${x.id}?w=0`,
        download: (x) => (raw.site.downloads === false ? null : `/img/${x.id}?w=0`),
      };
    }
    const u = raw.urls || {};
    return {
      src: (x, w) => (x.pub ? fill(u.image, x.pub, w) : ""),
      full: (x) => (x.pub ? fill(u.full, x.pub, 0) : null),
      download: (x) => (x.pub && raw.site.downloads !== false ? fill(u.download, x.pub, 0) : null),
    };
  }
  function fail(msg) {
    document.getElementById("app").innerHTML = `<div class="wrap"><div class="empty"><h2>The gallery didn't load</h2><p>${msg}</p><button class="btn" onclick="location.reload()">Try again</button></div></div>`;
  }
  fetch("data/gallery.json", { cache: "no-cache" })
    .then((r) => { if (!r.ok) throw new Error(`The photo index returned ${r.status}.`); return r.json(); })
    .then((raw) => {
      const n = Object.values(raw.folders || {}).reduce((k, f) => k + Object.keys(f.photos || {}).length, 0);
      if (!n) {
        document.getElementById("app").innerHTML = `<div class="wrap page"><div class="empty"><div class="kicker">${(raw.site && raw.site.tagline) || "Wildlife of Central Florida"}</div><h2>${(raw.site && raw.site.title) || "Georgiadis Photography"}</h2><p>The gallery is being prepared. Photographs appear here as soon as the first public copies are ready.</p></div></div>`;
        return;
      }
      GP.app.start({ root: document.getElementById("app"), raw, adapter: adapterFor(raw), model: { publicOnly: true } });
    })
    .catch((e) => { console.error(e); fail(e.message || "Check your connection and reload."); });
})();
