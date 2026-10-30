#!/usr/bin/env node
/* Link-preview pages for the public site. Messaging apps and social sites read the page a link
   points to without running its scripts, so a link to one photograph needs a real page that
   names that photograph. This writes one small page per photograph (p/<id>.html), species
   (s/<slug>.html) and outing (o/<id>.html), each with Open Graph and Twitter tags, that sends
   people on to the photograph inside the gallery. Pages for things no longer in the gallery
   are removed. It also writes data/dispatches.json, the outings feed the newsletter reads
   (newsletter/Newsletter.gs): each wildlife outing with its cover, colour and link.

     node tools/og_pages.js --repo DIR [--base https://example.github.io/site/]

   The gallery model is the same code the site runs (core/model.js), so slugs always match. */
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const repo = path.resolve(arg("--repo", "."));
global.window = global;
global.matchMedia = () => ({ matches: false, addEventListener() {} });
eval(fs.readFileSync(path.join(repo, "core", "model.js"), "utf8")); // defines window.GP.model

const raw = JSON.parse(fs.readFileSync(path.join(repo, "data", "gallery.json"), "utf8"));
const M = global.GP.model;
const m = M.build(raw, { publicOnly: true });
const site = Object.assign({ title: "Georgiadis Photography" }, m.site, raw.site || {});
let base = arg("--base", site.url || "");
if (base && !base.endsWith("/")) base += "/";
const urls = raw.urls || {};

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ESC[c]);
const fmtDate = (iso) => { const d = /^(\d{4})-(\d\d)-(\d\d)/.exec(iso || ""); return d ? `${+d[3]} ${M.MONTHS[+d[2] - 1]} ${d[1]}` : ""; };
const firstSentence = (t) => { const s = String(t || "").trim(); const m1 = /^(.{40,220}?[.!?])\s/.exec(s + " "); return m1 ? m1[1] : s.slice(0, 220); };
function titleOf(x) {
  if (x.common) return x.common;
  const s = String(x.setting || x.caption || "").replace(/\.$/, "");
  if (!s) return "Between sightings";
  const t = s.length > 60 ? s.slice(0, 60).replace(/\s+\S*$/, "") + "…" : s;
  return t[0].toUpperCase() + t.slice(1);
}
function image(x, w) {
  if (!x || !x.pub || !urls.image) return null;
  const width = Math.min(w, x.W || w), height = Math.round(width / (x.ar || 1.5));
  return { url: urls.image.replace("{id}", encodeURIComponent(x.pub)).replace("{w}", String(width)), width, height };
}

function page({ title, description, img, alt, to, self, type }) {
  const full = `${title} · ${site.title}`;
  const target = "../" + to;
  const meta = [
    `<meta property="og:type" content="${type || "article"}">`,
    `<meta property="og:site_name" content="${esc(site.title)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    base ? `<meta property="og:url" content="${esc(base + self)}">` : "",
    img ? `<meta property="og:image" content="${esc(img.url)}">\n<meta property="og:image:width" content="${img.width}">\n<meta property="og:image:height" content="${img.height}">\n<meta property="og:image:alt" content="${esc(alt || title)}">` : "",
    `<meta name="twitter:card" content="${img ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    img ? `<meta name="twitter:image" content="${esc(img.url)}">` : "",
    base ? `<link rel="canonical" href="${esc(base + self)}">` : "",
  ].filter(Boolean).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(full)}</title>
<meta name="description" content="${esc(description)}">
${meta}
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<script>location.replace(${JSON.stringify(target)});</script>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0e100f;color:#ecebe3;font:16px/1.5 Georgia,serif}a{color:#cfae6b}</style>
</head>
<body><p><a href="${esc(target)}">${esc(title)}</a> · ${esc(site.title)}</p></body>
</html>
`;
}

function writeAll(dir, pages) {
  const out = path.join(repo, dir);
  fs.mkdirSync(out, { recursive: true });
  let written = 0, removed = 0;
  const keep = new Set();
  for (const [name, html] of pages) {
    const f = path.join(out, name + ".html");
    keep.add(name + ".html");
    let old = null;
    try { old = fs.readFileSync(f, "utf8"); } catch (e) { /* new */ }
    if (old !== html) { fs.writeFileSync(f, html); written++; }
  }
  for (const f of fs.readdirSync(out)) if (f.endsWith(".html") && !keep.has(f)) { fs.unlinkSync(path.join(out, f)); removed++; }
  return { pages: keep.size, written, removed };
}

const photoPages = m.photos.map((x) => {
  const sp = x.spKey ? m.speciesByKey.get(x.spKey) : null;
  const bits = [fmtDate(x.t), x.light, x.outing].filter(Boolean).join(" · ");
  const words = x.caption || (sp && sp.note ? firstSentence(sp.note) : "");
  const title = titleOf(x) + (x.sci && x.common ? ` (${x.sci})` : "");
  return [x.id, page({ title, description: [bits, words].filter(Boolean).join(". "), img: image(x, 1200), alt: x.caption || titleOf(x), to: `#/gallery?p=${encodeURIComponent(x.id)}`, self: `p/${x.id}` })];
});
const speciesPages = m.species.filter((s) => s.best).map((s) => {
  const facts = `${s.photos.length} photograph${s.photos.length === 1 ? "" : "s"} on ${s.outingN} outing${s.outingN === 1 ? "" : "s"}, first seen ${fmtDate(s.first)}`;
  return [s.slug, page({ title: s.name + (s.bin ? ` (${s.bin})` : ""), description: s.note ? `${firstSentence(s.note)} ${facts}.` : facts + ".", img: image(s.best, 1200), alt: s.name, to: `#/species/${encodeURIComponent(s.slug)}`, self: `s/${s.slug}` })];
});
const outingPages = m.outings.filter((o) => o.cover).map((o) => {
  const facts = `${o.photos.length} frames, ${o.species.length} species`;
  return [o.id, page({ title: `${fmtDate(o.date)}: ${o.title}`, description: o.note ? `${firstSentence(o.note)} ${facts}.` : `${o.type}. ${facts}.`, img: image(o.cover, 1200), alt: o.title, to: `#/outings/${encodeURIComponent(o.id)}`, self: `o/${o.id}` })];
});
const roomPages = (m.rooms || []).filter((r) => r.photos && r.photos.length && r.cover).map((r) => {
  const facts = `${r.photos.length} photographs`;
  return [r.id, page({ title: `${r.title}: an exhibition`, description: r.sub ? `${r.sub} ${facts}.` : facts + ".", img: image(r.cover, 1200), alt: r.title, to: `#/rooms/${encodeURIComponent(r.id)}`, self: `r/${r.id}` })];
});
/* ---------- the newsletter's feed ---------- */
// The photograph's most colourful tone, dark enough to read on the email's paper (as the site's
// own tint does on its page).
const hexRgb = (h) => { const m1 = /^#?([0-9a-f]{6})$/i.exec(h || ""); return m1 ? [0, 2, 4].map((i) => parseInt(m1[1].slice(i, i + 2), 16)) : null; };
const rgbHsl = ([r, g, b]) => { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l]; const s1 = d / (1 - Math.abs(2 * l - 1)); const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [(h * 60 + 360) % 360, s1, l]; };
const hslHex = (h, s1, l) => { const c = (1 - Math.abs(2 * l - 1)) * s1, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m1 = l - c / 2; const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; return "#" + [r, g, b].map((v) => Math.round((v + m1) * 255).toString(16).padStart(2, "0")).join(""); };
const lum = (h) => { const v = hexRgb(h).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function accentOf(pal, paper) {
  const cands = (pal || []).map(hexRgb).filter(Boolean).map(rgbHsl);
  const pick = cands.sort((a, b) => b[1] * (1 - Math.abs(2 * b[2] - 1)) - a[1] * (1 - Math.abs(2 * a[2] - 1)))[0];
  if (!pick || pick[1] * (1 - Math.abs(2 * pick[2] - 1)) < 0.06) return "#8a6a2a"; // a grey photograph keeps the house brass
  const s1 = Math.min(0.62, Math.max(0.32, pick[1]));
  let l = 0.36, c = hslHex(pick[0], s1, l);
  for (let i = 0; i < 12 && contrast(c, paper) < 4.6; i++) { l -= 0.03; c = hslHex(pick[0], s1, l); }
  return c;
}
function feed() {
  // the outings the home page sends out as dispatches (at least three frames), with wild animals
  // in them: a portrait session with the family dog stays on the site but isn't news from the field
  const named = (o) => o.species.filter((s1) => !/\bsp\.?$/i.test(s1.name || "")).slice().sort((a, b) => b.n - a.n);
  const isWild = (s1) => { const sp = m.speciesByKey.get(s1.key); return !sp || sp.wild !== false; };
  const wild = m.outings.filter((o) => o.species.some(isWild) && o.photos.length >= 3 && o.cover);
  const outings = wild.slice(-40).reverse().map((o) => {
    const cover = o.heroes.filter((x) => x.spKey && !x.unsure).sort((a, b) => (b.ar >= 1.3) - (a.ar >= 1.3) || b.score - a.score)[0] || o.cover;
    const img = image(cover, 1200);
    const names = named(o).map((s1) => s1.name);
    // a summary still waiting to be written says only how many frames there were: name the animals instead
    let hook = (o.note || "").split(/(?<=[.!?])\s+/)[0] || "";
    if (!hook || /a short outing of \d+ frames|^\S.*, \d{1,2} \w+ \d{4}:/i.test(hook)) {
      const list = names.slice(0, 3), more = names.length > 3 ? " and more" : "";
      hook = list.length ? `${list.length > 1 ? list.slice(0, -1).join(", ") + (more ? ", " : " and ") + list[list.length - 1] : list[0]}${more}, in ${o.photos.length} frames.` : o.title;
    }
    return {
      id: o.id, no: o.no, date: o.date, when: fmtDate(o.date), title: o.title, type: o.type, hook,
      frames: o.photos.length, speciesN: o.species.length,
      species: names.slice(0, 6),
      companions: o.companions || [],
      url: base + "#/outings/" + encodeURIComponent(o.id),
      cover: img ? { url: img.url, width: img.width, height: img.height, alt: titleOf(cover) } : null,
      accent: accentOf(cover.pal, "#f6f7f3"),
    };
  });
  const out = { v: 1, site: { title: site.title, tagline: site.tagline || "", url: base }, outings };
  const f = path.join(repo, "data", "dispatches.json"), text = JSON.stringify(out, null, 1) + "\n";
  let old = null;
  try { old = fs.readFileSync(f, "utf8"); } catch (e) { /* new */ }
  if (old !== text) fs.writeFileSync(f, text);
  return { outings: outings.length, written: old !== text ? 1 : 0 };
}

const report = { p: writeAll("p", photoPages), s: writeAll("s", speciesPages), o: writeAll("o", outingPages), r: writeAll("r", roomPages), feed: feed(), base: base || null };
console.log(JSON.stringify(report));
