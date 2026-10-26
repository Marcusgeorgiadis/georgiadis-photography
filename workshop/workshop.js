/* Georgiadis Photography: the Workshop. The private side of the gallery, run as a claude.ai
   artifact on the shared core: scan Drive for Finals, sort them with Claude, fix IDs, cull,
   and decide what the public site shows. Everything is saved in the artifact's database;
   the scheduled cloud job builds the public site from it. */
(function (GP) {
  "use strict";
  const NIKON_ID = "1lEhOfHPIO3-Kf4gl6-rhz9d-IwHL14rY";
  const DRIVE = "Google Drive";
  const CCR = "Claude Code Remote";
  const TRIGGER_ID = "trig_01LJPueQUNJgbuv4DXhzvYsb";
  const FOLDER = "application/vnd.google-apps.folder";
  // The Drive connector hands this page files up to about 6 MB; larger Finals get cloud previews.
  const CONNECTOR_SAFE = 6 * 1000 * 1000;
  const CONNECTOR_LIMIT_RE = /16 MB limit|over limit of 10 MB|too large/i;
  const FINALS_RE = /^finals?\b/i;
  const RAW_RE = /\braws?\b/i;
  const PUBLIC_RE = /^public gallery$/i;
  const RAW_EXT = /\.(nef|nrw|dng|cr2|cr3|crw|arw|srf|sr2|raf|orf|rw2|pef|srw|x3f|3fr|iiq|erf|mef|mos|kdc|dcr|xmp)$/i;
  const DECODABLE = /^image\/(jpeg|jpg|png|webp|gif)$/i;
  const GROUPS = { bird: "Birds", mammal: "Mammals", reptile: "Reptiles", amphibian: "Amphibians", fish: "Fish", insect: "Insects", spider: "Spiders", other: "Other wildlife", none: "No wildlife" };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const H = () => GP.app.helpers;
  const esc = (s) => H().esc(s);
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  const sameTime = (a, b) => !!a && !!b && Date.parse(a) === Date.parse(b);
  const nameKey = (v) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
  const plural = (n, one, many) => `${Number(n || 0).toLocaleString("en-GB")} ${n === 1 ? one : many || one + "s"}`;
  function ago(iso) {
    const s = (Date.now() - Date.parse(iso)) / 1000;
    if (!isFinite(s)) return "";
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + " h ago";
    return Math.round(s / 86400) + " days ago";
  }
  function parseDate(s) {
    const m = /(19\d{2}|20\d{2})[ ._-]+(\d{1,2})[ ._-]+(\d{1,2})/.exec(s || "");
    if (!m) return null;
    const mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${m[1]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const toast = (m, a) => GP.app.toast(m, a);

  const W = {
    cap: { db: null, mcp: null, assets: null, sample: null, perms: null, images: false, maxImages: 1, ready: false },
    folders: new Map(), previews: new Map(), enrichDocs: new Map(), notesSp: {}, notesOut: {}, taxonomy: null, site: {},
    collections: new Map(), job: null, cloud: null, library: null, publish: null,
    loaded: { folders: false, library: false }, started: false, run: null, lastNote: "", scanError: "", cloudErr: "",
    fullUrls: new Map(), opinions: new Map(), eye: "rare", confirm: null,
  };

  /* ---------- assembling the library for the shared model ---------- */
  function rawNow() {
    const previews = {};
    for (const [pid, pv] of W.previews) previews[pid] = pv;
    const enrich = {};
    for (const d of [...W.enrichDocs.values()].sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")))) Object.assign(enrich, d.photos || {});
    return {
      folders: Object.fromEntries(W.folders), previews, enrich,
      notes: { species: W.notesSp, outings: W.notesOut }, taxonomy: W.taxonomy || {}, site: W.site || {},
      collections: [...W.collections.entries()].map(([id, c]) => ({ id: "c-" + id, docId: id, title: c.title, sub: c.sub || "", ids: c.ids || [], cover: c.cover, min: 1 })),
    };
  }
  let refreshT = 0, deferred = false;
  function refresh(now) {
    clearTimeout(refreshT);
    refreshT = setTimeout(doRefresh, now ? 0 : W.run ? 2500 : 450);
  }
  function doRefresh() {
    if (!W.loaded.folders) return;
    const ae = document.activeElement;
    if (W.started && ae && ae.closest && ae.closest("#gp-main") && ae.matches("input, textarea, select")) { deferred = true; return; }
    deferred = false;
    if (!W.started) {
      W.started = true;
      if (!location.hash || location.hash === "#") history.replaceState(null, "", "#/workshop");
      GP.app.start({ root: $("#app"), raw: rawNow(), adapter, workshop: hooks, views: VIEWS, site: { tagline: "Workshop · private" } });
      addTools();
    } else GP.app.update(rawNow());
    speciesList();
    paintRun();
  }
  document.addEventListener("focusout", () => { if (deferred) setTimeout(() => { if (deferred) doRefresh(); }, 50); });
  const model = () => GP.app.model;
  const allPhotos = () => [...model().byId.values()];

  /* ---------- images ---------- */
  const adapter = {
    src: (x) => (x.a ? "/_blob/" + x.a : ""),
    full: (x) => fullRes(x),
    download: (x) => `https://drive.google.com/file/d/${encodeURIComponent(x.id)}/view`,
    shareUrl: (x) => (W.site.url ? W.site.url.replace(/[#?].*$/, "").replace(/\/?$/, "/") + "#/gallery?p=" + encodeURIComponent(x.id) : null),
  };
  // Originals the connector can return replace the preview while the viewer zooms in,
  // held only as temporary object URLs.
  async function fullRes(x) {
    if (W.fullUrls.has(x.id)) return W.fullUrls.get(x.id);
    if (!W.cap.mcp || x.size > CONNECTOR_SAFE || !DECODABLE.test(x.mime || "")) return null;
    const blob = await driveBlob(x);
    const url = URL.createObjectURL(blob);
    W.fullUrls.set(x.id, url);
    if (W.fullUrls.size > 6) { const [k, u] = W.fullUrls.entries().next().value; URL.revokeObjectURL(u); W.fullUrls.delete(k); }
    return url;
  }

  /* ---------- database writes ---------- */
  const chains = new Map();
  // One write at a time per folder document.
  function writeFolder(fid, photos) {
    const run = () => W.cap.db.doc("folders/" + fid).update({ photos });
    const p = (chains.get(fid) || Promise.resolve()).then(run, run);
    chains.set(fid, p.catch(() => {}));
    return p;
  }
  const savePhoto = (x, patch) => writeFolder(x.fid, { [x.id]: patch });
  async function saveMany(xs, patchFor) {
    const by = new Map();
    for (const x of xs) { if (!by.has(x.fid)) by.set(x.fid, {}); by.get(x.fid)[x.id] = patchFor(x); }
    await Promise.all([...by].map(([fid, photos]) => writeFolder(fid, photos)));
  }
  function dbErrText(e) {
    if (e && e.code === "invalid_argument") return "You don't have permission to change this gallery.";
    if (e && e.code === "quota_exceeded") return "The gallery's database is full.";
    return "Couldn't save that change. Try again in a moment.";
  }
  const DB_CODES = ["invalid_argument", "resource_exhausted", "quota_exceeded", "unavailable", "revoked"];
  async function saveSite(patch) {
    W.site = Object.assign({}, W.site, patch);
    await W.cap.db.doc("meta/site").set(W.site);
  }
  async function saveTaxonomy(fn) {
    const t = JSON.parse(JSON.stringify(W.taxonomy || {}));
    fn(t);
    W.taxonomy = t;
    await W.cap.db.doc("meta/taxonomy").set(t);
    refresh(true);
  }

  /* ---------- workshop hooks used by the shared viewer and grids ---------- */
  const hooks = {
    rate(x, n) {
      savePhoto(x, { ov: { rating: n || null } }).then(() => toast(n ? `Rated ${"★".repeat(n)}` : "Rating cleared"), (e) => toast(dbErrText(e)));
    },
    key(k, x) {
      if (k === "h" || k === "H") { toggleHidden([x]); return true; }
      return false;
    },
    badge(x) { return x.hidden ? "Hidden" : !x.sorted ? (x.st === "err" ? "Failed" : "Not sorted") : x.review ? "Check ID" : ""; },
    onSelect() { paintSel(); },
    infoExtra(x) { return editPanel(x); },
  };
  function editPanel(x) {
    const m = model(), op = (x.raw && x.raw.op) || null, b = x.burst;
    const opening = (W.site.heroIds || []).includes(x.id);
    const groupOpts = Object.entries(GROUPS).map(([k, v]) => `<option value="${k}"${(x.raw.ov && x.raw.ov.group || x.raw.ai && x.raw.ai.group) === k ? " selected" : ""}>${v}</option>`).join("");
    void m;
    return `<section class="ws-edit" aria-label="Workshop">
  <div class="kicker">Workshop</div>
  <form class="ws-id" data-ws-form="id">
    <label>Species<input id="ws-common" name="common" list="ws-species" autocomplete="off" value="${esc(x.common || (x.raw.ov && x.raw.ov.common) || "")}" placeholder="Common name"></label>
    <label>Scientific name<input id="ws-sci" name="scientific" autocomplete="off" value="${esc(x.sci || "")}" placeholder="Genus species, if known" data-auto="1"></label>
    <label>Group<select id="ws-group" name="group">${groupOpts}</select></label>
    <div class="acts"><button class="btn primary" type="submit">Save ID</button>${x.mine ? `<button class="btn ghost" type="button" data-ws="revert">Back to Claude's ID</button>` : ""}</div>
  </form>
  <div class="ws-acts">
    <button class="btn" data-ws="hide">${x.hidden ? "Show on public site" : "Hide from public site"} <kbd>H</kbd></button>
    ${b && b.size > 1 && !x.isHero ? `<button class="btn" data-ws="hero">Lead this burst</button>` : ""}
    <button class="btn" data-ws="cover">${x.cover ? "Cover ✓" : "Use as cover"}</button>
    <button class="btn" data-ws="opening">${opening ? "Remove from opening" : "Add to opening"}</button>
    <button class="btn" data-ws="reid"${canSort() && !W.run ? "" : " disabled"}>Identify again</button>
    <button class="btn" data-ws="opinion"${canSort() && x.a && !W.opinions.has(x.id) ? "" : " disabled"}>${W.opinions.has(x.id) ? "Asking Claude…" : "Second opinion"}</button>
  </div>
  ${x.qualityNote ? `<p class="q"><b>Claude on this frame:</b> ${esc(x.qualityNote)}</p>` : ""}
  ${op ? opinionBlock(op, x) : ""}
  <p class="q mono">${esc(x.name)} · ${(x.size / 1e6).toFixed(1)} MB · ${esc(x.raw.sub ? "Finals › " + x.raw.sub : "Finals")}${x.confidence ? " · confidence " + esc(x.confidence) : ""}${x.mine ? " · your ID" : ""}</p>
</section>`;
  }
  function opinionBlock(op, x) {
    const sug = op.suggested && op.suggested.common;
    const differs = sug && nameKey(sug) !== nameKey(x.common);
    return `<div class="ws-op"><div class="sc">Second opinion · ${esc(ago(op.at))}</div>
  <p><b>${esc(op.verdict === "agree" ? "Agrees with the ID." : op.verdict === "disagree" ? `Suggests ${sug || "a different ID"}.` : "Not certain.")}</b> ${esc(op.reason || "")}</p>
  ${(op.lookalikes || []).length ? `<ul>${op.lookalikes.map((l) => `<li><b>${esc(l.name)}</b>: ${esc(l.tell)}</li>`).join("")}</ul>` : ""}
  ${op.critique ? `<p>${esc(op.critique)}</p>` : ""}
  ${differs ? `<button class="btn" data-ws="useop">Use ${esc(sug)}</button>` : ""}</div>`;
  }
  function currentPhoto() { const id = GP.viewer && GP.viewer.current(); return id ? model().byId.get(id) : null; }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ws]");
    if (!b || b.disabled) return;
    const a = b.dataset.ws;
    const x = b.closest(".vw") ? currentPhoto() : null;
    if (x) {
      if (a === "hide") toggleHidden([x]);
      else if (a === "revert") saveMany([x], () => ({ ov: { common: null, scientific: null, group: null } })).then(() => toast("Back to Claude's ID"), (er) => toast(dbErrText(er)));
      else if (a === "hero") setHero(x);
      else if (a === "cover") setCover(x);
      else if (a === "opening") toggleOpening(x);
      else if (a === "reid") reidentify(x);
      else if (a === "opinion") secondOpinion(x);
      else if (a === "useop") { const s = x.raw.op.suggested; saveId([x], s.common, s.scientific || "", s.group || x.group); }
      return;
    }
    onWorkshopAction(a, b, e);
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("[data-ws-form]");
    if (!f) return;
    e.preventDefault();
    const kind = f.dataset.wsForm;
    if (kind === "id") {
      const x = currentPhoto();
      if (!x) return;
      const common = $("#ws-common", f).value.trim().slice(0, 80);
      if (!common) { toast("Type a species name first."); return; }
      const sciEl = $("#ws-sci", f);
      let sci = sciEl.value.trim().slice(0, 80);
      // A scientific name left over from the photo's old ID would file the new name under the
      // old species, so it only counts when it was typed or chosen for this name.
      if (sciEl.dataset.auto === "1" && !known(common) && nameKey(common) !== nameKey(x.common)) sci = "";
      saveId([x], common, sci, $("#ws-group", f).value);
    } else if (kind === "site") saveSiteForm(f);
    else if (kind === "sel") applySelection(f);
  });
  function known(common) {
    const k = nameKey(common);
    return model().species.find((s) => nameKey(s.name) === k) || null;
  }
  function saveId(xs, common, scientific, group) {
    const k = known(common);
    const ov = { common: k ? k.name : common, scientific: scientific || (k ? k.sci : ""), group: group || (k ? k.group : "other") };
    return saveMany(xs, () => ({ ov })).then(() => toast(`${plural(xs.length, "photo")} set to ${ov.common}`), (e) => toast(dbErrText(e)));
  }
  function toggleHidden(xs) {
    const hide = !xs.every((x) => x.hidden);
    saveMany(xs, () => ({ ov: { hidden: hide || null } })).then(() => toast(hide ? `${plural(xs.length, "photo")} hidden from the public site` : `${plural(xs.length, "photo")} back on the public site`), (e) => toast(dbErrText(e)));
  }
  function setHero(x) {
    const fr = x.burst.frames;
    saveMany(fr, (f) => ({ ov: { hero: f === x ? true : null } })).then(() => toast("This frame now leads the burst"), (e) => toast(dbErrText(e)));
  }
  function setCover(x) {
    const others = allPhotos().filter((y) => y.cover && y !== x && (y.fid === x.fid || (x.spKey && y.spKey === x.spKey)));
    saveMany([x, ...others], (y) => ({ ov: { cover: y === x ? !x.cover || null : null } })).then(() => toast(x.cover ? "Cover cleared" : "Cover set for this outing and species"), (e) => toast(dbErrText(e)));
  }
  function toggleOpening(x) {
    const ids = (W.site.heroIds || []).slice();
    const i = ids.indexOf(x.id);
    if (i >= 0) ids.splice(i, 1); else ids.push(x.id);
    saveSite({ heroIds: ids }).then(() => { toast(i >= 0 ? "Removed from the opening sequence" : `Added to the opening sequence (${ids.length})`); refresh(true); }, (e) => toast(dbErrText(e)));
  }

  /* ---------- the species list used by every ID field ---------- */
  function speciesList() {
    let dl = $("#ws-species");
    if (!dl) { dl = document.createElement("datalist"); dl.id = "ws-species"; document.body.appendChild(dl); }
    const opts = model().species.filter((s) => !s.sp).slice().sort((a, b) => natural(a.name, b.name));
    const sig = opts.map((s) => s.name + "|" + s.sci).join(";");
    if (dl.dataset.sig === sig) return;
    dl.dataset.sig = sig;
    dl.innerHTML = opts.map((s) => `<option value="${esc(s.name)}" label="${esc([s.bin, plural(s.photos.length, "photo")].filter(Boolean).join(" · "))}"></option>`).join("");
  }
  document.addEventListener("input", (e) => {
    if (e.target.id === "ws-common" || e.target.id === "ws-sel-sp") {
      const k = known(e.target.value);
      const f = e.target.form;
      if (!f) return;
      // The scientific name follows the species typed, until it's edited by hand.
      const sci = f.querySelector("#ws-sci");
      if (sci && sci.dataset.auto === "1") sci.value = k ? k.sci || "" : "";
      const g = f.querySelector("select[name=group]");
      if (k && g && GROUPS[k.group]) g.value = k.group;
    } else if (e.target.id === "ws-sci") e.target.dataset.auto = "0";
  });

  /* ---------- selection ---------- */
  function addTools() {
    const tools = $(".gp-tools");
    if (!tools || $("#ws-select")) return;
    const b = document.createElement("button");
    b.id = "ws-select"; b.className = "btn ghost"; b.type = "button"; b.textContent = "Select";
    b.addEventListener("click", () => { GP.app.setSelecting(!document.documentElement.classList.contains("gp-selecting")); paintSel(); });
    tools.prepend(b);
    const bar = document.createElement("form");
    bar.id = "ws-sel"; bar.className = "ws-sel"; bar.hidden = true; bar.dataset.wsForm = "sel";
    bar.setAttribute("aria-label", "Selected photos");
    bar.innerHTML = `<span class="n mono" id="ws-sel-n">0 selected</span>
<input id="ws-sel-sp" name="common" list="ws-species" placeholder="Set species…" autocomplete="off">
<select id="ws-sel-group" name="group">${Object.entries(GROUPS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
<button class="btn primary" type="submit" data-act2="species">Apply</button>
<span class="stars" aria-label="Rate selected">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-ws="sel-rate" data-n="${n}" aria-label="${n} stars">★</button>`).join("")}</span>
<button class="btn" type="button" data-ws="sel-hide">Hide / show</button>
<button class="btn" type="button" data-ws="sel-collect">Add to collection</button>
<button class="btn" type="button" data-ws="sel-revert">Claude's ID</button>
<button class="btn ghost" type="button" data-ws="sel-all">Select all here</button>
<button class="btn ghost" type="button" data-ws="sel-clear">Clear</button>
<button class="btn ghost" type="button" data-ws="sel-done">Done</button>`;
    document.body.appendChild(bar);
  }
  function paintSel() {
    const bar = $("#ws-sel"), on = document.documentElement.classList.contains("gp-selecting");
    if (!bar) return;
    bar.hidden = !on;
    const n = GP.app.selection.length;
    $("#ws-sel-n").textContent = `${n} selected`;
    const sb = $("#ws-select");
    if (sb) { sb.textContent = on ? "Done selecting" : "Select"; sb.classList.toggle("primary", on); sb.classList.toggle("ghost", !on); }
  }
  function selected() { return GP.app.selection.map((id) => model().byId.get(id)).filter(Boolean); }
  function applySelection(f) {
    const xs = selected(), common = $("#ws-sel-sp", f).value.trim().slice(0, 80);
    if (!xs.length) { toast("Select some photos first."); return; }
    if (!common) { toast("Type a species to apply."); return; }
    saveId(xs, common, "", $("#ws-sel-group", f).value).then(() => { GP.app.clearSelection(); paintSel(); });
  }

  /* ---------- workshop page actions ---------- */
  function onWorkshopAction(a, b) {
    const xs = selected();
    switch (a) {
      case "sel-rate": if (xs.length) saveMany(xs, () => ({ ov: { rating: +b.dataset.n } })).then(() => toast(`${plural(xs.length, "photo")} rated ${"★".repeat(+b.dataset.n)}`), (e) => toast(dbErrText(e))); break;
      case "sel-hide": if (xs.length) toggleHidden(xs); break;
      case "sel-revert": if (xs.length) saveMany(xs, () => ({ ov: { common: null, scientific: null, group: null } })).then(() => toast(`${plural(xs.length, "photo")} back to Claude's ID`)); break;
      case "sel-collect": collect(xs); break;
      case "sel-all": $$("#gp-main .tile[data-id]").forEach((t) => { if (!t.classList.contains("sel")) t.click(); }); break;
      case "sel-clear": GP.app.clearSelection(); paintSel(); break;
      case "sel-done": GP.app.setSelecting(false); paintSel(); break;
      case "scan": scan(); break;
      case "sort": sortWaiting(); break;
      case "retry": sortFailed(); break;
      case "check": runChecks(burstRuns()); break;
      case "cloud": requestCloud(false); break;
      case "publish": publishNow(); break;
      case "stop": if (W.run) { W.run.stop = true; paintRun(); } break;
      case "eye": W.eye = b.dataset.k; paintWorkshop(); break;
      case "tax": taxonomyAction(b.dataset.op, b.dataset.bin); break;
      case "uncollect": dropCollection(b.dataset.id, b); break;
      case "unopen": toggleOpening(model().byId.get(b.dataset.pid)); break;
      case "ask": W.cap.perms && W.cap.perms.manage().catch(() => toast("Open the artifact's Permissions menu to allow Google Drive and Claude.")); break;
      default: break;
    }
  }
  function collect(xs) {
    if (!xs.length) { toast("Select some photos first."); return; }
    const cols = [...W.collections.entries()];
    let box = $("#ws-collect");
    if (box) box.remove();
    box = document.createElement("form");
    box.id = "ws-collect"; box.className = "ws-pop";
    box.innerHTML = `<label>Collection<select id="ws-col-pick"><option value="">New collection…</option>${cols.map(([id, c]) => `<option value="${esc(id)}">${esc(c.title)} (${(c.ids || []).length})</option>`).join("")}</select></label>
<label>Name<input id="ws-col-name" placeholder="e.g. Best of 2026" autocomplete="off"></label>
<div class="acts"><button class="btn primary" type="submit">Add ${plural(xs.length, "photo")}</button><button class="btn ghost" type="button" id="ws-col-x">Cancel</button></div>`;
    document.body.appendChild(box);
    $("#ws-col-x", box).onclick = () => box.remove();
    $("#ws-col-pick", box).onchange = (e) => { $("#ws-col-name", box).closest("label").hidden = !!e.target.value; };
    box.onsubmit = async (e) => {
      e.preventDefault();
      const pick = $("#ws-col-pick", box).value, name = $("#ws-col-name", box).value.trim().slice(0, 60);
      try {
        if (pick) {
          const c = W.collections.get(pick);
          const ids = [...new Set([...(c.ids || []), ...xs.map((x) => x.id)])];
          await W.cap.db.doc("collections/" + pick).update({ ids });
          toast(`Added to ${c.title}`);
        } else {
          if (!name) { toast("Name the new collection."); return; }
          const id = GP.model.slug(name).slice(0, 40) + "-" + Math.random().toString(36).slice(2, 6);
          await W.cap.db.doc("collections/" + id).set({ title: name, sub: "", ids: xs.map((x) => x.id), at: new Date().toISOString() });
          toast(`Collection “${name}” created. It appears as a room on the site.`);
        }
        box.remove(); GP.app.clearSelection(); paintSel();
      } catch (er) { toast(dbErrText(er)); }
    };
  }
  async function dropCollection(id, btn) {
    if (W.confirm !== "col:" + id) { W.confirm = "col:" + id; btn.textContent = "Click again to delete"; setTimeout(() => { if (W.confirm === "col:" + id) { W.confirm = null; paintWorkshop(); } }, 4000); return; }
    W.confirm = null;
    try { await W.cap.db.doc("collections/" + id).delete(); toast("Collection deleted"); } catch (e) { toast(dbErrText(e)); }
  }
  function taxonomyAction(op, bin) {
    const lc = (a) => (a || []).filter((v) => v.toLowerCase() !== bin.toLowerCase());
    saveTaxonomy((t) => {
      if (op === "captive") { t.captive = lc(t.captive).concat(bin); t.review = lc(t.review); }
      else if (op === "domestic") { t.domestic = lc(t.domestic).concat(bin); t.review = lc(t.review); }
      else if (op === "wild") { t.captive = lc(t.captive); t.domestic = lc(t.domestic); t.review = lc(t.review); }
    }).then(() => toast(op === "wild" ? `${bin} counts as wild` : `${bin} marked ${op}`), (e) => toast(dbErrText(e)));
  }

  /* ---------- views ---------- */
  const VIEWS = [
    { id: "workshop", label: "Workshop", render: () => ({ html: `<div class="wrap page" id="ws-root"></div>`, after: () => paintWorkshop() }) },
    { id: "publish", label: "Publish", render: () => ({ html: `<div class="wrap page" id="ws-pub"></div>`, after: () => paintPublish() }) },
  ];
  function counts() {
    const c = { total: 0, done: 0, waiting: 0, cloud: 0, err: 0, skip: 0 };
    for (const x of allPhotos()) {
      c.total++;
      const st = stOf(x);
      if (st === "done") c.done++; else if (st === "big") c.cloud++; else if (st === "err") c.err++; else if (st === "skip") c.skip++; else c.waiting++;
    }
    return c;
  }
  function stOf(x) {
    const p = x.raw;
    if (p.ov && p.ov.common && p.st !== "done") return "done";
    let st = p.st || "new";
    if (st === "err" && CONNECTOR_LIMIT_RE.test(p.err || "")) st = "big";
    if (st === "new" && !x.a && (p.s || 0) > CONNECTOR_SAFE) st = "big";
    if (x.a && (st === "big" || st === "new")) st = "thumb";
    return st;
  }
  function paintWorkshop() {
    const root = $("#ws-root");
    if (!root) return;
    const m = model(), c = counts(), lib = W.library, h = H();
    const runs = burstRuns();
    const pending = allPhotos().filter((x) => !x.sorted && !x.dupOf).sort((a, b) => b.t.localeCompare(a.t));
    const week = Date.now() - 7 * 864e5;
    const fresh = m.heroes.filter((x) => x.raw.ai && Date.parse(x.raw.ai.at) > week).sort((a, b) => String(b.raw.ai.at).localeCompare(String(a.raw.ai.at))).slice(0, 60);
    const eye = eyeLists();
    const tabs = [["rare", "Rare for Florida", eye.rare.length], ["unsure", "Uncertain IDs", eye.unsure.length], ["captive", "Captive & domestic", eye.captive.length], ["bursts", "Bursts that disagree", runs.length], ["dups", "Duplicates", m.stats.duplicates], ["failed", "Couldn't sort", eye.failed.length], ["hidden", "Hidden", eye.hidden.length]];
    const sortBlock = sortBlocker();
    root.innerHTML = `${h.pageHead("Workshop", "The darkroom", "Sort new Finals with Claude, fix what needs fixing, and decide what the public site shows.")}
<div class="ws-cards">
  <section class="ws-card"><h2>Library</h2>
    <p class="big mono">${plural(c.total, "Final")}</p>
    <p>${lib ? `Last scanned ${esc(ago(lib.scannedAt))}: ${plural(lib.outings, "outing type")}, ${plural(lib.finals, "Finals folder")}.` : "Not scanned yet."}${lib && lib.skipped && lib.skipped.length ? ` No Finals in: ${esc(lib.skipped.join(", "))}.` : ""}</p>
    ${W.scanError ? `<p class="err">${esc(W.scanError)}</p>` : ""}
    <div class="acts"><button class="btn" data-ws="scan"${W.cap.mcp && W.cap.db && !W.run ? "" : " disabled"}>Scan Drive now</button></div></section>
  <section class="ws-card"><h2>Sorting</h2>
    <dl class="ws-stats"><dt>Sorted</dt><dd>${c.done}</dd><dt>Waiting</dt><dd>${c.waiting}</dd><dt>Waiting for a cloud preview</dt><dd>${c.cloud}</dd><dt>Couldn't sort</dt><dd>${c.err}</dd></dl>
    ${sortBlock ? `<p class="err">${esc(sortBlock)}</p>` : ""}
    ${W.lastNote ? `<p>${esc(W.lastNote)}</p>` : ""}
    <div class="acts"><button class="btn primary" data-ws="sort"${canSort() && !W.run && c.waiting ? "" : " disabled"}>Sort ${plural(c.waiting, "photo")}</button>${c.err ? `<button class="btn" data-ws="retry"${canSort() && !W.run ? "" : " disabled"}>Retry ${c.err}</button>` : ""}<button class="btn" data-ws="check"${canSort() && !W.run && runs.length ? "" : " disabled"}>Check ${plural(runs.length, "burst")}</button></div>
    ${!canSort() && W.cap.ready ? `<div class="acts"><button class="btn ghost" data-ws="ask">Permissions</button></div>` : ""}</section>
  ${cloudCard(c.cloud)}
  <section class="ws-card"><h2>Public site</h2>
    <p>${W.publish && W.publish.at ? `Last published ${esc(ago(W.publish.at))}${W.publish.photos ? ` with ${plural(W.publish.photos, "photograph")}` : ""}.` : "Not published yet."}${W.publish && W.publish.error ? ` <span class="err">${esc(W.publish.error)}</span>` : ""}</p>
    ${W.publish && W.publish.manifest ? `<p>Drive copies: ${plural(W.publish.manifest.total || 0, "photo")} in Nikon › Public Gallery${W.publish.manifest.complete ? "" : " (still copying)"}${W.publish.manifest.error ? `. ${esc(W.publish.manifest.error)}` : ""}.</p>` : ""}
    ${W.site.url ? `<p><a href="${esc(W.site.url)}" target="_blank" rel="noopener">${esc(W.site.url.replace(/^https?:\/\//, ""))}</a></p>` : ""}
    <div class="acts"><a class="btn" href="#/publish">Settings</a><button class="btn primary" data-ws="publish"${W.cap.mcp && W.cap.db ? "" : " disabled"}>Publish now</button></div></section>
</div>
${pending.length ? `<section class="sec"><div class="sec-h"><h2>Inbox</h2><span class="meta">${plural(pending.length, "new Final")} not sorted yet</span></div>${h.flow(pending.slice(0, 120), { stacks: false })}</section>` : ""}
${fresh.length ? `<section class="sec"><div class="sec-h"><h2>Sorted this week</h2><span class="meta">${plural(fresh.length, "photograph")}</span></div>${h.flow(fresh)}</section>` : ""}
<section class="sec"><div class="sec-h"><h2>Needs your eye</h2></div>
  <div class="chips" role="tablist">${tabs.map(([k, l, n]) => `<button class="chip" role="tab" data-ws="eye" data-k="${k}" aria-pressed="${W.eye === k}">${l} <span class="n">${n}</span></button>`).join("")}</div>
  <div class="ws-eye">${eyePanel(eye, runs)}</div></section>`;
  }
  function eyeLists() {
    const m = model();
    const rare = m.species.filter((s) => s.review);
    const captive = m.species.filter((s) => s.captive || s.domestic);
    const unsure = m.heroes.filter((x) => x.unsure || (x.spKey && m.speciesByKey.get(x.spKey) && m.speciesByKey.get(x.spKey).sp)).sort((a, b) => a.t.localeCompare(b.t));
    const failed = allPhotos().filter((x) => stOf(x) === "err");
    const hidden = m.photos.filter((x) => x.hidden);
    return { rare, captive, unsure, failed, hidden };
  }
  function spRow(s, ops) {
    const h = H();
    return `<div class="ws-sp"><div class="ws-sp-h"><div><h3>${esc(s.name)}</h3><div class="binomial">${esc(s.bin || s.sci)}</div><div class="sc">${plural(s.photos.length, "photo")} · ${esc(s.famName || "")}</div></div><div class="acts">${ops.map(([op, l]) => `<button class="btn" data-ws="tax" data-op="${op}" data-bin="${esc(s.bin)}">${l}</button>`).join("")}</div></div>${h.flow(s.heroes.slice(0, 12))}</div>`;
  }
  function eyePanel(eye, runs) {
    const h = H(), m = model();
    switch (W.eye) {
      case "rare": return eye.rare.length ? `<p class="q">Species that are rare or out of range in Florida, so the ID may be a lookalike. Open a photo to correct it, ask for a second opinion, or confirm it here.</p>${eye.rare.map((s) => spRow(s, [["wild", "The ID is right"], ["captive", "Captive"]])).join("")}` : `<p class="q">Nothing flagged.</p>`;
      case "captive": return eye.captive.length ? `<p class="q">Kept out of the life list and species counts. They still appear in the gallery unless hidden.</p>${eye.captive.map((s) => spRow(s, [["wild", "Actually wild"]])).join("")}` : `<p class="q">Nothing marked captive or domestic.</p>`;
      case "unsure": return eye.unsure.length ? `<p class="q">Probable IDs and “sp.” answers. Select several and set the species in one go, or open one to fix it.</p>${h.flow(eye.unsure)}` : `<p class="q">No uncertain IDs.</p>`;
      case "bursts": return runs.length ? `<p class="q">Neighbouring frames whose IDs disagree. “Check bursts” shows each run to Claude together and makes the same animal carry the same name.</p>${runs.slice(0, 40).map((r) => `<div class="ws-run-row"><div class="sc">${esc(r[0].outing)} · ${esc(h.fmtShort(r[0].outingDate))} · ${esc(r.map((x) => x.common || "none").filter((v, i, a) => a.indexOf(v) === i).join(" / "))}</div>${h.flow(r, { stacks: false })}</div>`).join("")}` : `<p class="q">Every burst agrees with itself.</p>`;
      case "dups": {
        const pairs = new Map();
        for (const list of m.duplicates) for (const d of list.slice(1)) {
          const k = d.fid + ">" + list[0].fid; const e = pairs.get(k) || { from: d, to: list[0], n: 0 }; e.n++; pairs.set(k, e);
        }
        return pairs.size ? `<p class="q">The same frames filed twice. The site shows each frame once; to tidy Drive, delete the copies there.</p><table class="ws-tbl"><thead><tr><th>Copies in</th><th>Same frames as</th><th>Frames</th></tr></thead><tbody>${[...pairs.values()].sort((a, b) => b.n - a.n).map((e) => `<tr><td><a href="https://drive.google.com/drive/folders/${esc(e.from.fid)}" target="_blank" rel="noopener">${esc(e.from.outing)} · ${esc(h.fmtShort(e.from.outingDate))}</a></td><td>${esc(e.to.outing)} · ${esc(h.fmtShort(e.to.outingDate))}</td><td class="mono">${e.n}</td></tr>`).join("")}</tbody></table>` : `<p class="q">No duplicates.</p>`;
      }
      case "failed": return eye.failed.length ? `<table class="ws-tbl"><thead><tr><th>File</th><th>Outing</th><th>Why</th></tr></thead><tbody>${eye.failed.map((x) => `<tr><td><a href="https://drive.google.com/file/d/${esc(x.id)}/view" target="_blank" rel="noopener">${esc(x.name)}</a></td><td>${esc(x.outing)} · ${esc(h.fmtShort(x.outingDate))}</td><td>${esc(x.raw.err || "")}</td></tr>`).join("")}</tbody></table>` : `<p class="q">Nothing failed.</p>`;
      case "hidden": return eye.hidden.length ? `<p class="q">Hidden from the public site. Open one and press H, or select several and use Hide / show.</p>${h.flow(eye.hidden, { stacks: false })}` : `<p class="q">Nothing hidden.</p>`;
      default: return "";
    }
  }
  function cloudCard(waiting) {
    const job = W.job, req = W.cloud && W.cloud.requestedAt;
    const pendingReq = req && (!job || Date.parse(job.at) < Date.parse(req));
    return `<section class="ws-card"><h2>Cloud previews</h2>
    <p>Finals over about 6 MB are too large for the Drive connector. A scheduled cloud job reads them with a read-only account and makes a 1600 px preview of each.</p>
    <p>${job ? `Last run ${esc(ago(job.at))}: ${job.made} made${job.failed ? `, ${job.failed} failed` : ""}.` : "No run yet."}${pendingReq ? ` Run requested ${esc(ago(req))}.` : ""}</p>
    <p>${waiting ? `${plural(waiting, "Final")} waiting.` : "Every Final has a preview."}</p>
    ${W.cloudErr ? `<p class="err">${esc(W.cloudErr)}</p>` : ""}
    <div class="acts"><button class="btn" data-ws="cloud"${W.cap.mcp && W.cap.db && waiting && !recentReq(10) ? "" : " disabled"}>${recentReq(10) ? "Run requested" : "Make previews now"}</button></div></section>`;
  }
  const recentReq = (min) => !!(W.cloud && W.cloud.requestedAt) && Date.now() - Date.parse(W.cloud.requestedAt) < min * 60000;

  function paintPublish() {
    const root = $("#ws-pub");
    if (!root) return;
    const s = W.site, m = model(), h = H();
    const cols = [...W.collections.entries()];
    const open = (s.heroIds || []).map((id) => m.byId.get(id)).filter(Boolean);
    const k = h.regCtx(open);
    root.innerHTML = `${h.pageHead("Publish", "The public site", "What visitors see, and when it updates. The cloud job rebuilds the site from these settings and your IDs, ratings and hidden photos.")}
<div class="ws-cards">
<form class="ws-card ws-form" data-ws-form="site"><h2>Front page</h2>
  <label>Site title<input id="ws-s-title" name="title" value="${esc(s.title || "Georgiadis Photography")}" maxlength="60"></label>
  <label>Tagline<input id="ws-s-tag" name="tagline" value="${esc(s.tagline || "Wildlife of Central Florida")}" maxlength="80"></label>
  <label>Small heading above the title<input id="ws-s-kicker" name="kicker" value="${esc(s.kicker || "")}" placeholder="Wildlife of Central Florida · 2025–2026" maxlength="80"></label>
  <label>Introduction<textarea id="ws-s-intro" name="intro" rows="4" maxlength="400" placeholder="Leave empty for an introduction written from the archive's numbers.">${esc(s.intro || "")}</textarea></label>
  <label>Footer line<input id="ws-s-foot" name="footer" value="${esc(s.footer || "")}" placeholder="Every photograph here is a Final from the Nikon archive." maxlength="120"></label>
  <label>Public site address<input id="ws-s-url" name="url" type="url" value="${esc(s.url || "")}" placeholder="https://marcusgeorgiadis.github.io/georgiadis-photography/"></label>
  <label class="ck"><input id="ws-s-dl" name="downloads" type="checkbox"${s.downloads === false ? "" : " checked"}> Let visitors download originals</label>
  <div class="acts"><button class="btn primary" type="submit">Save settings</button><button class="btn" type="button" data-ws="publish">Publish now</button></div>
</form>
<section class="ws-card"><h2>Status</h2>
  <p>${W.publish && W.publish.at ? `Last published ${esc(ago(W.publish.at))}${W.publish.photos ? ` with ${plural(W.publish.photos, "photograph")}` : ""}.` : "Not published yet."}</p>
  ${W.publish && W.publish.requestedAt && (!W.publish.at || Date.parse(W.publish.at) < Date.parse(W.publish.requestedAt)) ? `<p>Publish requested ${esc(ago(W.publish.requestedAt))}.</p>` : ""}
  ${W.publish && W.publish.error ? `<p class="err">${esc(W.publish.error)}</p>` : ""}
  <p>${plural(m.stats.photos, "photograph")} would be published (${plural(m.photos.filter((x) => x.hidden).length, "hidden photo")} left out, duplicates shown once).</p>
  <p class="q">The site also rebuilds by itself on the cloud job's schedule, so new Finals copied into Nikon › Public Gallery appear without pressing anything.</p>
</section>
</div>
<section class="sec"><div class="sec-h"><h2>Opening sequence</h2><span class="meta">${open.length ? plural(open.length, "photo") + " you picked" : "Chosen automatically: the best landscape frame of each top species. Add your own from the viewer."}</span></div>
  ${open.length ? `<div class="mini-flow" data-ctx="${k}">${open.map((x) => `<div class="ws-pick"><button data-id="${esc(x.id)}" aria-label="${esc(h.titleOf(x))}">${h.cover(x, 300)}</button><button class="btn ghost" data-ws="unopen" data-pid="${esc(x.id)}">Remove</button></div>`).join("")}</div>` : h.flow(m.opening.slice(0, 7), { stacks: false })}</section>
<section class="sec"><div class="sec-h"><h2>Collections</h2><span class="meta">Your own rooms. Select photos anywhere and choose “Add to collection”.</span></div>
  ${cols.length ? `<table class="ws-tbl"><thead><tr><th>Collection</th><th>Photos</th><th></th></tr></thead><tbody>${cols.map(([id, c]) => `<tr><td><a href="#/rooms/c-${esc(id)}">${esc(c.title)}</a></td><td class="mono">${(c.ids || []).length}</td><td><button class="btn ghost" data-ws="uncollect" data-id="${esc(id)}">Delete</button></td></tr>`).join("")}</tbody></table>` : `<p class="q">No collections yet.</p>`}</section>`;
  }
  async function saveSiteForm(f) {
    const v = (n) => f.querySelector(`[name=${n}]`);
    const url = v("url").value.trim();
    if (url && !/^https:\/\//.test(url)) { toast("The site address starts with https://"); return; }
    try {
      await saveSite({ title: v("title").value.trim() || "Georgiadis Photography", tagline: v("tagline").value.trim(), kicker: v("kicker").value.trim(), intro: v("intro").value.trim(), footer: v("footer").value.trim(), url, downloads: v("downloads").checked });
      toast("Settings saved. Publish to update the public site.");
      refresh(true);
    } catch (e) { toast(dbErrText(e)); }
  }
  async function publishNow() {
    if (!W.cap.mcp || !W.cap.db) return;
    try {
      await W.cap.mcp.callTool(CCR, "fire_trigger", { trigger_id: TRIGGER_ID, text: "Publish the public site now (requested from the Workshop)." }, { cache: false });
      await W.cap.db.doc("meta/publish").set(Object.assign({}, W.publish || {}, { requestedAt: new Date().toISOString() }));
      toast("Publishing. The cloud job rebuilds the site in a few minutes.");
    } catch (e) {
      toast(e && e.code === "tool_error" ? "The cloud job couldn't be started" + (e.message ? `: ${String(e.message).slice(0, 160)}` : ".") : driveErrText(e, CCR));
    }
  }

  /* ---------- run indicator ---------- */
  function paintRun() {
    let el = $("#ws-runbar");
    if (!el) { el = document.createElement("div"); el.id = "ws-runbar"; el.className = "ws-runbar"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    const r = W.run;
    el.hidden = !r;
    if (!r) return;
    const what = r.kind === "scan" ? "Scanning Drive" : r.kind === "check" ? "Checking bursts" : "Sorting with Claude";
    el.innerHTML = `<div><b>${what}</b> <span class="mono">${r.done} / ${r.total || "…"}</span><div class="sc">${esc(r.label || "")}</div></div><i style="--p:${r.total ? (100 * r.done / r.total).toFixed(1) : 4}%"></i><button class="btn ghost" data-ws="stop"${r.stop ? " disabled" : ""}>${r.stop ? "Stopping…" : "Stop"}</button>`;
  }
  function afterRun() { paintRun(); paintWorkshop(); refresh(true); }

  /* ---------- Google Drive ---------- */
  async function drive(tool, input) {
    try { return await W.cap.mcp.callTool(DRIVE, tool, input, { cache: false }); }
    catch (e) {
      if (e && e.retryable && tool === "search_files") {
        await new Promise((r) => setTimeout(r, Math.min(e.retryAfterMs || 0, 15000) + 800 + Math.random() * 1200));
        return W.cap.mcp.callTool(DRIVE, tool, input, { cache: false });
      }
      throw e;
    }
  }
  async function listAll(query) {
    const out = new Map();
    let token = null, guard = 0;
    do {
      const res = await drive("search_files", Object.assign({ query, pageSize: 100, excludeContentSnippets: true }, token ? { pageToken: token } : {}));
      const p = res && res.payload && typeof res.payload === "object" ? res.payload : {};
      const files = Array.isArray(p.files) ? p.files : [];
      if (!files.length) break;
      for (const f of files) if (f && f.id) out.set(f.id, f);
      const next = p.nextPageToken || null;
      if (!next || next === token) break;
      token = next;
    } while (++guard < 400);
    return [...out.values()];
  }
  async function pool(items, n, fn) {
    let i = 0;
    const work = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, work));
  }
  function driveErrText(e, name = DRIVE) {
    switch (e && e.code) {
      case "needs_reauth": return `${name} needs reconnecting. Reconnect it in claude.ai Settings › Connectors, then try again.`;
      case "server_not_connected": case "server_not_found": return `${name} isn't connected. Add it in claude.ai Settings › Connectors, then try again.`;
      case "selection_required": return `You have more than one ${name} connection. Choose one when claude.ai asks, then try again.`;
      case "not_in_manifest": case "approval_required": case "consent_required": return `This page isn't allowed to use ${name} yet. Allow it when claude.ai asks, or from the page's Permissions menu.`;
      case "blocked_by_policy": return `Your organization's policy blocks ${name} for this page.`;
      case "server_unavailable": return `${name} didn't answer. Try again in a minute.`;
      case "not_granted": case "capability_disabled": case "capability_removed": return `This view can't reach ${name}. Open the Workshop on claude.ai.`;
      default: return `${name} returned an error` + (e && e.message ? `: ${String(e.message).slice(0, 160)}` : ".");
    }
  }
  async function walk(folder, chain, found, depth) {
    if (depth > 5) return;
    const kids = await listAll(`parentId = '${folder.id}' and mimeType = '${FOLDER}'`);
    await pool(kids, 3, async (k) => {
      const t = (k.title || "").trim();
      if (FINALS_RE.test(t)) found.push({ id: k.id, chain: chain.slice() });
      else if (RAW_RE.test(t)) return;
      else await walk(k, chain.concat(t), found, depth + 1);
    });
  }
  async function listFinals(folderId, sub, depth, out) {
    const kids = await listAll(`parentId = '${folderId}'`);
    for (const k of kids) {
      const t = (k.title || "").trim();
      if (k.mimeType === FOLDER) {
        if (depth < 2 && !RAW_RE.test(t)) await listFinals(k.id, sub ? sub + " › " + t : t, depth + 1, out);
      } else if (String(k.mimeType || "").startsWith("image/") && !RAW_EXT.test(t)) {
        out.push({ id: k.id, n: t, s: Number(k.fileSize) || 0, m: k.mimeType, t: k.modifiedTime || "", sub });
      }
    }
    return out;
  }
  let autoScanned = false;
  async function maybeAutoScan() {
    if (autoScanned || !W.loaded.folders || !W.loaded.library || !W.library || W.run || !W.cap.mcp) return;
    autoScanned = true;
    if (Date.now() - Date.parse(W.library.scannedAt) < 6 * 3600 * 1000) return;
    const st = W.cap.perms ? await W.cap.perms.state("mcp:" + DRIVE).catch(() => "unavailable") : "unavailable";
    if (st === "granted") scan({ quiet: true });
  }
  async function scan(opts = {}) {
    if (W.run || !W.cap.mcp || !W.cap.db) return;
    W.run = { kind: "scan", done: 0, total: 0, label: "Nikon", stop: false };
    W.scanError = "";
    paintRun();
    try {
      // The public copies live inside the Nikon folder too; they are never Finals of their own.
      const outings = (await listAll(`parentId = '${NIKON_ID}' and mimeType = '${FOLDER}'`)).filter((o) => !RAW_RE.test(o.title || "") && !PUBLIC_RE.test((o.title || "").trim()));
      const finals = [], skipped = [];
      W.run.total = outings.length;
      await pool(outings, 3, async (o) => {
        const t = (o.title || "").trim();
        W.run.label = t; paintRun();
        const found = [];
        if (FINALS_RE.test(t)) found.push({ id: o.id, chain: [] });
        else await walk(o, [t], found, 1);
        if (!found.length) skipped.push(t);
        for (const f of found) finals.push(Object.assign(f, { outing: t, outingId: o.id }));
        W.run.done++; paintRun();
      });
      W.run.done = 0; W.run.total = finals.length;
      await pool(finals, 3, async (f) => {
        W.run.label = f.chain.concat("Finals").join(" › "); paintRun();
        f.files = await listFinals(f.id, "", 0, []);
        W.run.done++; paintRun();
      });
      if (!finals.length && W.folders.size) throw { message: "Google Drive returned no Finals folders this time, so the saved library was left as it was. Try the scan again in a minute." };
      const changed = await writeIndex(finals);
      const total = finals.reduce((n, f) => n + f.files.length, 0);
      await W.cap.db.doc("meta/library").set({ scannedAt: new Date().toISOString(), outings: outings.length, finals: finals.length, photos: total, skipped: skipped.sort(natural) });
      if (!opts.quiet || changed.added) toast(changed.added ? `Found ${changed.added} new Finals. ${total} indexed in all.` : `Scan complete. ${total} Finals indexed, nothing new.`);
      if (changed.bigAdded) requestCloud(true);
    } catch (e) {
      W.scanError = DB_CODES.includes(e && e.code) ? "The scan couldn't save the index. " + dbErrText(e) : e && e.code ? driveErrText(e) : (e && e.message) || "The scan stopped unexpectedly. Try again.";
      if (!opts.quiet) toast(W.scanError);
    } finally {
      W.run = null;
      afterRun();
    }
  }
  const stable = (v) => JSON.stringify(v, (k, val) => (val && typeof val === "object" && !Array.isArray(val) ? Object.keys(val).sort().reduce((o, key) => ((o[key] = val[key]), o), {}) : val));
  async function writeIndex(finals) {
    const db = W.cap.db;
    let added = 0, bigAdded = 0;
    const seen = new Set();
    for (const f of finals) {
      seen.add(f.id);
      const prev = W.folders.get(f.id);
      const prevPhotos = (prev && prev.photos) || {};
      // An empty listing for a folder that had photos is more likely a Drive hiccup than a deleted folder.
      if (!f.files.length && Object.keys(prevPhotos).length) continue;
      const photos = {};
      for (const file of f.files) {
        const old = prevPhotos[file.id];
        const base = { n: file.n, s: file.s, m: file.m, t: file.t };
        if (file.sub) base.sub = file.sub;
        if (old && sameTime(old.t, base.t) && old.s === base.s) {
          const keep = Object.assign({}, old, base);
          if (keep.st === "big" && base.s <= CONNECTOR_SAFE) keep.st = "new";
          photos[file.id] = keep;
        } else {
          added++;
          base.st = !DECODABLE.test(base.m) ? "skip" : base.s > CONNECTOR_SAFE ? "big" : "new";
          if (base.st === "big") bigAdded++;
          if (old && old.ov) base.ov = old.ov; // a re-exported Final keeps your ID, rating and visibility
          photos[file.id] = base;
        }
      }
      // Outings without a date in their folder names fall back to the earliest file date.
      const dateSrc = f.chain.slice(1).reverse().map(parseDate).find(Boolean) || parseDate(f.outing)
        || (f.files.length ? (f.files.map((x) => x.t).filter(Boolean).sort()[0] || "").slice(0, 10) || null : null);
      const doc = JSON.parse(JSON.stringify({ outing: f.outing, outingId: f.outingId, chain: f.chain.length ? f.chain : [f.outing], dateLabel: f.chain.length > 1 ? f.chain[f.chain.length - 1] : "", date: dateSrc, photos }));
      if (!prev || stable(prev) !== stable(doc)) await db.doc("folders/" + f.id).set(doc);
    }
    for (const fid of W.folders.keys()) if (!seen.has(fid)) await db.doc("folders/" + fid).delete();
    return { added, bigAdded };
  }

  /* ---------- sorting with Claude ---------- */
  function canSort() { return !!(W.cap.mcp && W.cap.db && W.cap.assets && W.cap.sample && W.cap.images); }
  function sortBlocker() {
    if (!W.cap.ready || canSort()) return null;
    if (!W.cap.db) return "Open the Workshop on claude.ai, signed in, to sort photos.";
    if (!W.cap.assets) return "Only the gallery's owner and editors can sort photos.";
    if (!W.cap.sample || !W.cap.images) return "Claude isn't available to this page in this view, so photos can't be sorted here.";
    if (!W.cap.mcp) return "This view can't reach Google Drive.";
    return null;
  }
  const order = (list) => list.sort((a, b) => (b.outingDate || "").localeCompare(a.outingDate || "") || natural(a.name, b.name));
  function sortWaiting() { return runQueue(order(allPhotos().filter((x) => ["new", "thumb"].includes(stOf(x))))); }
  function sortFailed() { return runQueue(order(allPhotos().filter((x) => stOf(x) === "err"))); }
  async function reidentify(x) {
    if (W.run) return;
    try { await savePhoto(x, { st: x.a ? "thumb" : "new", ai: null, err: null, cc: null }); } catch (e) { toast(dbErrText(e)); return; }
    runQueue([x]);
  }
  const fresh = (x) => model().byId.get(x.id) || x;
  async function runQueue(items) {
    if (W.run) return;
    if (!items.length) { toast("Nothing waiting to be sorted."); return; }
    if (!canSort()) { toast(sortBlocker() || "Sorting isn't available here."); return; }
    W.run = { kind: "sort", done: 0, total: items.length, label: "", stop: false };
    W.lastNote = "";
    paintRun();
    let i = 0, ok = 0, fails = 0, big = 0, halt = null;
    const worker = async () => {
      while (!W.run.stop && i < items.length) {
        const x = fresh(items[i++]);
        W.run.label = `${x.name} · ${x.outing}`; paintRun();
        try { await processPhoto(x); ok++; }
        catch (e) {
          if (e && e.code === "cancelled_local") break;
          const r = explain(e);
          if (r.halt) { halt = r.msg; W.run.stop = true; }
          else {
            if (r.big) big++; else fails++;
            const patch = r.big ? { st: "big", err: null } : { st: "err", err: r.msg };
            if (r.pvBad) patch.pvBad = r.pvBad;
            try { await savePhoto(x, patch); } catch (er) { /* the next run retries */ }
          }
        }
        W.run.done++; paintRun();
      }
    };
    await Promise.all([worker(), worker()]);
    const stopped = W.run.stop && !halt;
    W.run = null;
    const parts = [`${ok} sorted`];
    if (big) parts.push(`${big} waiting for a cloud preview`);
    if (fails) parts.push(`${fails} couldn't be sorted`);
    W.lastNote = (halt ? halt + " " : stopped ? "Stopped. " : "") + parts.join(", ") + ".";
    toast(W.lastNote);
    afterRun();
    if (!halt && !stopped && ok) setTimeout(() => { const b = burstRuns(); if (b.length) runChecks(b); }, 2500);
  }
  async function processPhoto(x) {
    let blob = null;
    const p = x.raw, pv = W.previews.get(x.id);
    const cloud = !p.a && pv && sameTime(pv.t, p.t) && p.pvBad !== pv.a ? pv : null;
    const a = p.a || (cloud && cloud.a);
    if (a) {
      try { const r = await fetch("/_blob/" + a); if (r.ok) blob = await r.blob(); } catch (e) { /* falls back below */ }
      if (!blob && cloud) throw { code: "pv_missing", pv: cloud.a };
    }
    if (!blob) {
      if ((p.s || 0) > CONNECTOR_SAFE) throw { code: "too_big" };
      const src = await driveBlob(x);
      const made = await makePreview(src);
      if (W.run && W.run.stop) throw { code: "cancelled_local" };
      const up = await W.cap.assets.upload(made.blob, { type: "image/jpeg" }).catch((e) => { throw Object.assign({ from: "assets" }, e); });
      await savePhoto(x, { a: up.id, w: made.w, h: made.h, st: "thumb", err: null });
      blob = made.blob;
    }
    if (W.run && W.run.stop) throw { code: "cancelled_local" };
    const ai = await identify(blob, x);
    const patch = { st: "done", ai, err: null };
    if (cloud) Object.assign(patch, { a: cloud.a, w: cloud.w, h: cloud.h });
    await savePhoto(x, patch);
  }
  async function driveBlob(x) {
    if ((x.size || 0) > CONNECTOR_SAFE) throw { code: "too_big" };
    let res;
    try { res = await W.cap.mcp.callTool(DRIVE, "download_file_content", { fileId: x.id }, { cache: false }); }
    catch (e) {
      if (CONNECTOR_LIMIT_RE.test(String((e && e.message) || "")) || (e && e.code === "tool_error" && (x.size || 0) > 5.5e6)) throw { code: "too_big" };
      throw Object.assign({ from: "drive" }, e);
    }
    let b64 = extractB64(res);
    if (!b64) throw { code: "no_content" };
    b64 = b64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
    const bin = atob(b64);
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: x.mime || "image/jpeg" });
  }
  function extractB64(res) {
    const p = res && res.payload;
    if (p && typeof p === "object" && typeof p.content === "string") return p.content;
    if (typeof p === "string" && p.length > 64 && /^[A-Za-z0-9+/=\s]+$/.test(p.slice(0, 256))) return p;
    for (const b of (res && res.content) || []) {
      if (b && b.type === "image" && typeof b.data === "string") return b.data;
      if (b && b.type === "text" && typeof b.text === "string") { try { const j = JSON.parse(b.text); if (j && typeof j.content === "string") return j.content; } catch (e) { /* not JSON */ } }
    }
    const sc = res && res.structuredContent;
    if (sc && typeof sc.content === "string") return sc.content;
    return null;
  }
  async function makePreview(src) {
    let bmp;
    try { bmp = await createImageBitmap(src, { imageOrientation: "from-image" }); }
    catch (e) { try { bmp = await createImageBitmap(src); } catch (e2) { throw { code: "decode" }; } }
    const ow = bmp.width, oh = bmp.height;
    const scale = Math.min(1, 1600 / Math.max(ow, oh));
    const w = Math.max(1, Math.round(ow * scale)), hgt = Math.max(1, Math.round(oh * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = hgt;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, hgt);
    if (bmp.close) bmp.close();
    const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.84));
    c.width = c.height = 0;
    if (!blob) throw { code: "decode" };
    return { blob, w, h: hgt };
  }
  function galleryList() {
    return model().species.filter((s) => !s.sp).sort((a, b) => b.photos.length - a.photos.length).slice(0, 250).map((s) => `${s.name}${s.sci ? " — " + s.sci : ""}`).join("\n");
  }
  function outingContext(x) {
    const mine = x.frame, near = [], tally = new Map();
    for (const y of allPhotos()) {
      if (y.fid !== x.fid || y.id === x.id || !y.common) continue;
      const t = tally.get(y.spKey) || { name: y.common, n: 0 }; t.n++; tally.set(y.spKey, t);
      if (mine != null && y.frame != null && Math.abs(y.frame - mine) <= 3) near.push(y);
    }
    near.sort((a, b) => a.frame - b.frame);
    return {
      near: near.slice(0, 8).map((y) => `- ${y.name}: ${y.common}${y.sci ? ` (${y.sci})` : ""}${y.mine ? " [confirmed by the photographer]" : ""}`).join("\n"),
      outing: [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 15).map((t) => `${t.name} ×${t.n}`).join(", "),
    };
  }
  async function identify(blob, x) {
    const ctx = outingContext(x), knownList = galleryList();
    const where = [`outing folder "${x.outing}"`, x.dateLabel ? `date folder "${x.dateLabel}"` : x.outingDate ? `dated ${x.outingDate}` : "", `file ${x.name}`].filter(Boolean).join(", ");
    const prompt = `You are cataloguing a wildlife photographer's edited photos (their "Finals"), taken in Central Florida. This image is from ${where}. Folder names are the photographer's own labels; letters in them are usually people's initials, not places.

Identify the main wildlife subject as precisely as the image allows, and assess the photograph.

Reply with only one JSON object in exactly this shape, no other text:
{"group": string, "common": string, "scientific": string, "confidence": string, "count": number, "others": string[], "sex_age": string, "behavior": string, "setting": string, "tags": string[], "quality": number, "quality_note": string, "caption": string}

Rules:
- group: one of bird, mammal, reptile, amphibian, fish, insect, spider, other, none (none = no animal in the frame).
- common: the species' standard English common name and nothing else. Never put parentheses, notes, age, sex, morph, breed or certainty words in it (those belong in sex_age, caption and confidence). If the species can't be told apart from similar ones, give the most specific group you are sure of in the form "Egret sp." and set confidence to "low". If there is no animal, use group "none" and common "".
- Prefer species that occur in Florida; a species rare or absent there needs clear evidence in the image.
- If the subject is a species already in this gallery (listed below), use exactly that common name and scientific name.
- scientific: the binomial for a species; the genus for an "sp." answer; "" when there is no animal.
- confidence: "high", "medium" or "low".
- count: how many individuals of the main species are visible.
- others: common names of other species visible, at most 3, else [].
- sex_age: for example "adult male", "juvenile", or "" when unclear.
- behavior and setting: a short phrase each, for example "perched, preening" and "bare branch against sky".
- tags: 3 to 6 short lowercase tags about behaviour, habitat, light and composition.
- quality: 1 to 5 as a wildlife photograph. 5 = portfolio or competition ready; 4 = strong keeper; 3 = good record shot; 2 = weak (soft focus, missed exposure, cluttered); 1 = unusable.
- quality_note: one sentence on sharpness, exposure, light and composition.
- caption: one plain, factual sentence.`
      + (ctx.near ? `\n\nNeighbouring frames from this same outing are already identified. They are usually the same individual, so keep this frame's ID consistent with them unless the image clearly shows a different animal:\n${ctx.near}` : "")
      + (ctx.outing ? `\n\nSpecies identified elsewhere on this outing: ${ctx.outing}.` : "")
      + (knownList ? `\n\nSpecies already in this gallery (common name — scientific name):\n${knownList}` : "");
    let r;
    try { r = await W.cap.sample.json(prompt, { images: [blob], modelTier: "default" }); }
    catch (e) { throw Object.assign({ from: "sample" }, e); }
    if (!r || typeof r !== "object" || Array.isArray(r)) throw { from: "sample", code: "invalid_json" };
    const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
    const arr = (v) => (Array.isArray(v) ? v : []);
    const g = s(r.group, 20).toLowerCase();
    const q = Math.round(Number(r.quality));
    const nm = cleanName(s(r.common, 80));
    return {
      group: !nm.common ? "none" : GROUPS[g] ? g : "other",
      common: nm.common, scientific: nm.common ? s(r.scientific, 80) : "", note: s(nm.note, 80),
      confidence: ["high", "medium", "low"].includes(r.confidence) ? r.confidence : "low",
      count: Math.max(0, Math.min(99, Math.round(Number(r.count)) || 0)),
      others: arr(r.others).map((v) => s(v, 60)).filter(Boolean).slice(0, 3),
      sexAge: s(r.sex_age, 40), behavior: s(r.behavior, 80), setting: s(r.setting, 80),
      tags: arr(r.tags).map((t) => s(t, 28).toLowerCase()).filter(Boolean).slice(0, 6),
      quality: q >= 1 && q <= 5 ? q : 0,
      qualityNote: s(r.quality_note, 180), caption: s(r.caption, 180),
      at: new Date().toISOString(),
    };
  }
  function cleanName(raw) {
    const { base, qual, sp } = GP.model.splitName(raw);
    if (!base || GP.model.NONE_RE.test(base)) return { common: "", note: qual };
    return { common: sp || (GP.model.UNSURE_RE.test(qual) && !/\s/.test(base)) ? `${base} sp.` : base, note: qual };
  }

  /* ---------- second opinion ---------- */
  async function secondOpinion(x) {
    if (!canSort() || !x.a || W.opinions.has(x.id)) return;
    W.opinions.set(x.id, true);
    if (GP.viewer.isOpen()) GP.viewer.refresh(model());
    try {
      const r0 = await fetch("/_blob/" + x.a);
      if (!r0.ok) throw { code: "decode" };
      const blob = await r0.blob();
      const sp = x.spKey && model().speciesByKey.get(x.spKey);
      const kin = sp ? model().species.filter((s) => s.family === sp.family && s !== sp && !s.sp).map((s) => s.name).slice(0, 12) : [];
      const prompt = `A wildlife photographer in Central Florida labelled this photo "${x.common || "no wildlife"}"${x.sci ? ` (${x.sci})` : ""}${x.mine ? ", their own ID" : ", an earlier automatic ID"}. Taken ${x.outingDate || ""} on an outing called "${x.outing}".

Give a careful second opinion. Look for the field marks that separate this species from its lookalikes${kin.length ? ` (relatives already in this archive: ${kin.join(", ")})` : ""}, and say whether the photo supports the ID. Then give one short, specific critique of the photograph as a photograph.

Reply with only JSON: {"verdict": "agree" | "disagree" | "unsure", "reason": string, "suggested": {"common": string, "scientific": string, "group": string}, "lookalikes": [{"name": string, "tell": string}], "critique": string}
- reason: one or two sentences naming the field marks you used.
- suggested: your best ID (the same as the label when you agree). group is bird, mammal, reptile, amphibian, fish, insect, spider, other or none.
- lookalikes: up to 3 species it could be confused with, each with how to tell them apart in a photo like this.
- critique: one or two sentences on sharpness, light, timing and composition, with one concrete suggestion.`;
      let r;
      try { r = await W.cap.sample.json(prompt, { images: [blob], modelTier: "complex" }); }
      catch (e) { throw Object.assign({ from: "sample" }, e); }
      const s = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
      const sug = r && r.suggested && typeof r.suggested === "object" ? r.suggested : {};
      const op = {
        at: new Date().toISOString(),
        verdict: ["agree", "disagree", "unsure"].includes(r && r.verdict) ? r.verdict : "unsure",
        reason: s(r && r.reason, 400),
        suggested: { common: cleanName(s(sug.common, 80)).common, scientific: s(sug.scientific, 80), group: GROUPS[s(sug.group, 20).toLowerCase()] ? s(sug.group, 20).toLowerCase() : "" },
        lookalikes: (Array.isArray(r && r.lookalikes) ? r.lookalikes : []).slice(0, 3).map((l) => ({ name: s(l && l.name, 60), tell: s(l && l.tell, 240) })).filter((l) => l.name),
        critique: s(r && r.critique, 400),
      };
      await savePhoto(x, { op });
      toast(op.verdict === "agree" ? "Claude agrees with the ID" : op.verdict === "disagree" ? `Claude suggests ${op.suggested.common || "a different ID"}` : "Claude isn't certain");
    } catch (e) {
      toast(explain(e).msg || "Claude didn't answer. Try again later.");
    } finally {
      W.opinions.delete(x.id);
      if (GP.viewer.isOpen()) GP.viewer.refresh(model());
    }
  }

  /* ---------- burst consistency ---------- */
  // Runs of neighbouring frames (numbers within 2) from one outing whose IDs disagree.
  function burstRuns() {
    if (!W.started) return [];
    const by = new Map(), out = [];
    for (const x of allPhotos()) {
      if (!x.a || !x.sorted || x.frame == null) continue;
      if (!by.has(x.fid)) by.set(x.fid, []);
      by.get(x.fid).push(x);
    }
    for (const list of by.values()) {
      list.sort((a, b) => a.frame - b.frame || natural(a.name, b.name));
      let run = [];
      for (let i = 0; i <= list.length; i++) {
        const c = list[i];
        if (c && run.length && c.frame - run[run.length - 1].frame <= 2) { run.push(c); continue; }
        if (run.length > 1 && new Set(run.map((r) => r.spKey || "none")).size > 1 && run.some((r) => !r.mine && !r.raw.cc)) out.push(run);
        run = c ? [c] : [];
      }
    }
    return out;
  }
  async function checkBurst(run) {
    const max = Math.max(2, Math.min(W.cap.maxImages || 2, 6)), knownList = galleryList(), h = H();
    for (let i = 0; i < run.length; i += max) {
      const part = run.slice(i, i + max);
      const blobs = await Promise.all(part.map(async (x) => {
        const r = await fetch("/_blob/" + x.a).catch(() => null);
        if (!r || !r.ok) throw { code: "decode" };
        return r.blob();
      }));
      const lines = part.map((x, k) => `${k + 1}. ${x.name}: currently ${x.common || "no wildlife"}${x.sci ? ` (${x.sci})` : ""}${x.mine ? " [confirmed by the photographer, keep]" : ""}`).join("\n");
      const prompt = `These ${part.length} images are neighbouring frames, in shooting order, from one outing of a wildlife photographer in Central Florida ("${part[0].outing}", ${h.fmtDate(part[0].outingDate)}). They were identified one at a time and the IDs disagree:
${lines}

Look at all the frames together and decide the main subject of each. Frames that show the same individual animal must get exactly the same name. Frames marked "confirmed by the photographer" are correct; use them as the reference for the others. Only give a frame a different species when it clearly shows a different animal.

Reply with only JSON: {"frames": [{"n": 1, "group": string, "common": string, "scientific": string, "confidence": string, "caption": string}]}, one entry per frame, where n is the frame's number above.
- group: bird, mammal, reptile, amphibian, fish, insect, spider, other, or none (no animal).
- common: the standard English common name only, no parentheses or notes; "Egret sp." style when unsure; "" for none.
- scientific: binomial, or genus for an "sp." answer.
- confidence: high, medium or low.
- caption: one plain, factual sentence about that frame.`
        + (knownList ? `\n\nSpecies already in this gallery (use these exact names when one fits):\n${knownList}` : "");
      let r;
      try { r = await W.cap.sample.json(prompt, { images: blobs, modelTier: "default" }); }
      catch (e) { throw Object.assign({ from: "sample" }, e); }
      const frames = Array.isArray(r && r.frames) ? r.frames : [];
      const by = new Map();
      part.forEach((x, k) => {
        if (x.mine) return;
        const f = frames.find((q) => Number(q && q.n) === k + 1);
        const patch = { cc: 1 };
        if (f && typeof f === "object") {
          const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : "");
          const nm = cleanName(str(f.common, 80)), g = str(f.group, 20).toLowerCase();
          const ai = { common: nm.common, scientific: nm.common ? str(f.scientific, 80) : "", group: !nm.common ? "none" : GROUPS[g] ? g : "other", confidence: ["high", "medium", "low"].includes(f.confidence) ? f.confidence : "low" };
          const was = x.raw.ai || {};
          if (nameKey(ai.common) !== nameKey(was.common) || GP.model.binomial(ai.scientific) !== GP.model.binomial(was.scientific)) {
            patch.ai = Object.assign(ai, str(f.caption, 180) ? { caption: str(f.caption, 180) } : {}, { checkedAt: new Date().toISOString() });
          }
        }
        if (!by.has(x.fid)) by.set(x.fid, {});
        by.get(x.fid)[x.id] = patch;
      });
      await Promise.all([...by].map(([fid, photos]) => writeFolder(fid, photos)));
    }
  }
  async function runChecks(runs) {
    if (W.run || !runs.length) return;
    if (!canSort()) { toast(sortBlocker() || "Checking isn't available here."); return; }
    W.run = { kind: "check", done: 0, total: runs.length, label: "", stop: false };
    paintRun();
    let halt = null, fails = 0;
    for (const run of runs) {
      if (W.run.stop) break;
      W.run.label = `${run[0].outing} · ${run[0].name}–${run[run.length - 1].name}`; paintRun();
      try { await checkBurst(run.map(fresh)); }
      catch (e) { const r = explain(e); if (r.halt) { halt = r.msg; break; } fails++; }
      W.run.done++; paintRun();
    }
    const done = W.run.done;
    W.run = null;
    W.lastNote = (halt ? halt + " " : "") + `Checked ${plural(done, "burst")} for consistent IDs` + (fails ? `; ${fails} couldn't be checked.` : ".");
    toast(W.lastNote);
    afterRun();
  }
  function explain(e) {
    const c = e && e.code;
    if (c === "too_big") return { big: true };
    if (c === "pv_missing") return { msg: "The cloud preview is missing. The next cloud run remakes it.", pvBad: e.pv };
    if (c === "decode") return { msg: "This file couldn't be decoded as an image." };
    if (c === "no_content") return { msg: "Google Drive returned no image data for this file." };
    if (e && e.from === "sample") {
      switch (c) {
        case "rate_limited": return { halt: true, msg: "Claude's usage limit was reached, so sorting paused. Sort again later to pick up where it stopped." };
        case "not_granted": case "sampling_disabled": case "not_declared": case "images_unavailable": case "capability_disabled": case "capability_removed":
          return { halt: true, msg: "This page isn't allowed to ask Claude, so sorting stopped. Allow Claude from the page's Permissions menu." };
        case "session_expired": return { halt: true, msg: "Your claude.ai session expired. Sign in again, then sort." };
        case "refused": return { msg: "Claude declined to describe this image." };
        case "image_rejected": return { msg: "Claude couldn't read this image." };
        case "invalid_json": case "empty_completion": return { msg: "Claude's answer couldn't be read. Retry later." };
        default: return { msg: "Claude didn't answer for this photo. Retry later." };
      }
    }
    if (e && e.from === "assets") {
      switch (c) {
        case "quota_or_state": return { halt: true, msg: "The gallery's image storage is full, so sorting stopped." };
        case "rate_limited": return { halt: true, msg: "Saving previews too quickly, so sorting paused. Try again in a few minutes." };
        case "not_granted": case "capability_disabled": case "capability_removed": case "upstream_auth": return { halt: true, msg: "This view can't save previews. Reload the page on claude.ai." };
        default: return { msg: "The preview couldn't be saved." };
      }
    }
    if (e && e.from === "drive") {
      if (["needs_reauth", "server_not_connected", "server_not_found", "selection_required", "not_in_manifest", "approval_required", "consent_required", "blocked_by_policy", "not_granted", "capability_disabled", "capability_removed"].includes(c)) return { halt: true, msg: driveErrText(e) };
      if (c === "tool_error") return { msg: "Google Drive couldn't download this file." + (e.message ? " " + String(e.message).slice(0, 140) : "") };
      return { msg: driveErrText(e) };
    }
    if (c === "invalid_argument" || c === "quota_exceeded") return { halt: true, msg: dbErrText(e) };
    return { msg: "Something went wrong with this photo. Retry later." };
  }

  /* ---------- cloud previews ---------- */
  async function requestCloud(auto) {
    if (!W.cap.mcp || !W.cap.db) return;
    if (auto) {
      if (recentReq(60)) return;
      const st = W.cap.perms ? await W.cap.perms.state("mcp:" + CCR).catch(() => "unavailable") : "unavailable";
      if (st !== "granted") return;
    }
    W.cloudErr = "";
    try {
      await W.cap.mcp.callTool(CCR, "fire_trigger", { trigger_id: TRIGGER_ID, text: "Started from the Workshop: make cloud previews." }, { cache: false });
      await W.cap.db.doc("meta/cloud").set({ requestedAt: new Date().toISOString() });
      if (!auto) toast("Cloud job started. Previews appear here as soon as it finishes.");
    } catch (e) {
      W.cloudErr = e && e.code === "tool_error" ? "The cloud job couldn't be started" + (e.message ? `: ${String(e.message).slice(0, 160)}` : ".") : driveErrText(e, CCR);
      if (!auto) toast(W.cloudErr);
    }
    paintWorkshop();
  }

  /* ---------- boot ---------- */
  const use = (n) => { try { const p = window.claude && window.claude.use && window.claude.use(n); return p ? p.catch(() => null) : Promise.resolve(null); } catch (e) { return Promise.resolve(null); } };
  function noDb() {
    $("#app").innerHTML = `<div class="wrap page"><div class="empty"><div class="kicker">Workshop</div><h2>Open the Workshop on claude.ai</h2><p>The library, Claude and Google Drive are only available when you open this page signed in to claude.ai.</p></div></div>`;
  }
  async function boot() {
    const [db, mcp, assets, sample, perms] = await Promise.all(["db", "mcp", "assets", "sample", "permissions"].map(use));
    Object.assign(W.cap, { db, mcp, assets, sample, perms, ready: true });
    if (sample) { const lim = await sample.limits().catch(() => null); W.cap.images = !!(lim && lim.images); W.cap.maxImages = (lim && lim.images && lim.images.maxCount) || 1; }
    if (!db) { noDb(); return; }
    const err = () => {};
    db.collection("folders").limit(1000).onSnapshot((snap) => {
      W.folders = new Map(snap.docs.map((d) => [d.id, d.data()]));
      W.loaded.folders = true; refresh(); maybeAutoScan();
    }, () => { W.loaded.folders = true; W.scanError = "The saved index couldn't be loaded. Reload the page."; refresh(true); });
    db.collection("previews").limit(1000).onSnapshot((snap) => {
      const m = new Map();
      const docs = snap.docs.slice().sort((a, b) => String(a.data().at || "").localeCompare(String(b.data().at || "")));
      for (const d of docs) for (const [pid, pv] of Object.entries(d.data().photos || {})) m.set(pid, pv);
      W.previews = m; refresh();
    }, err);
    db.collection("enrich").limit(1000).onSnapshot((snap) => { W.enrichDocs = new Map(snap.docs.map((d) => [d.id, d.data()])); refresh(); }, err);
    db.collection("collections").limit(200).onSnapshot((snap) => { W.collections = new Map(snap.docs.map((d) => [d.id, d.data()])); refresh(); }, err);
    db.collection("jobs").orderBy("at", "desc").limit(1).onSnapshot((snap) => { W.job = snap.docs[0] ? snap.docs[0].data() : null; paintWorkshop(); }, err);
    db.doc("notes/species").onSnapshot((s) => { W.notesSp = (s.exists && s.data().notes) || {}; refresh(); }, err);
    db.doc("notes/outings").onSnapshot((s) => { W.notesOut = (s.exists && s.data().notes) || {}; refresh(); }, err);
    db.doc("meta/taxonomy").onSnapshot((s) => { W.taxonomy = s.exists ? s.data() : {}; refresh(); }, err);
    db.doc("meta/site").onSnapshot((s) => { W.site = s.exists ? s.data() : {}; refresh(); }, err);
    db.doc("meta/cloud").onSnapshot((s) => { W.cloud = s.exists ? s.data() : null; paintWorkshop(); }, err);
    db.doc("meta/publish").onSnapshot((s) => { W.publish = s.exists ? s.data() : null; paintWorkshop(); paintPublish(); }, err);
    db.doc("meta/library").onSnapshot((s) => { W.library = s.exists ? s.data() : null; W.loaded.library = true; paintWorkshop(); maybeAutoScan(); }, () => { W.loaded.library = true; });
  }
  boot();
})(window.GP = window.GP || {});
