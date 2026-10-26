#!/usr/bin/env node
/* Link-preview pages for the public site. Messaging apps and social sites read the page a link
   points to without running its scripts, so a link to one photograph needs a real page that
   names that photograph. This writes one small page per photograph (p/<id>.html), species
   (s/<slug>.html) and outing (o/<id>.html), each with Open Graph and Twitter tags, that sends
   people on to the photograph inside the gallery. Pages for things no longer in the gallery
   are removed.

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
const report = { p: writeAll("p", photoPages), s: writeAll("s", speciesPages), o: writeAll("o", outingPages), base: base || null };
console.log(JSON.stringify(report));
