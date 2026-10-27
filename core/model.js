/* Georgiadis Photography: data model shared by the public site and the Workshop.
   GP.model.build(raw, opts) turns the saved library (folders, enrichment, notes,
   taxonomy) into photographs, bursts, outings, species, rooms and a search. */
(function (GP) {
  "use strict";

  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MON = MONTHS.map((m) => m.slice(0, 3));
  const SEASONS = { 12: "Winter", 1: "Winter", 2: "Winter", 3: "Spring", 4: "Spring", 5: "Spring", 6: "Summer", 7: "Summer", 8: "Summer", 9: "Autumn", 10: "Autumn", 11: "Autumn" };

  /* ---------- names ---------- */
  // Claude's raw names vary ("Green Heron (probable)", "American White Ibis" vs "White Ibis"), so a
  // species is keyed by its binomial where there is one and shown under the most used bare name for it.
  const QUAL_RE = /\s*\(([^()]*)\)\s*$/;
  const UNSURE_RE = /uncertain|probable|possibl|unidentified|unknown|\?/i;
  const NONE_RE = /^(no\b|none\b|not an? (animal|wildlife))/i;
  function splitName(raw) {
    let s = String(raw || "").replace(/\s+/g, " ").trim();
    const q = [];
    const open = /\s*\(([^()]*)$/.exec(s); // a qualifier cut off by the length limit
    if (open) { q.push(open[1]); s = s.slice(0, open.index).trim(); }
    for (let m; (m = QUAL_RE.exec(s)); ) { q.unshift(m[1]); s = s.slice(0, m.index).trim(); }
    const sp = /\s+spp?\.?$/i.test(s);
    return { base: s.replace(/\s+spp?\.?$/i, ""), qual: q.join("; "), sp };
  }
  function binomial(sci) {
    const m = /^([A-Z][a-z]+)\s+([a-z][a-z-]+)\b/.exec(String(sci || "").trim());
    return m && !/^spp?$/.test(m[2]) ? `${m[1]} ${m[2]}` : "";
  }
  const nameKey = (v) => String(v || "").toLowerCase().replace(/[^a-z]/g, "");
  const slug = (v) => String(v || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  function frameNo(name) {
    const m = /(\d{3,6})(?!.*\d{3,6})/.exec(String(name || "").replace(/\.[a-z0-9]+$/i, ""));
    return m ? +m[1] : null;
  }
  function rawId(p) {
    const ov = p.ov || {}, ai = p.ai || {};
    return ov.common ? { c: ov.common, s: ov.scientific || "", g: ov.group || ai.group || "", mine: true }
      : { c: ai.common || "", s: ai.scientific || "", g: ai.group || "", conf: ai.confidence };
  }

  /* ---------- light ---------- */
  // Sunrise and sunset (NOAA approximation) in local minutes, Florida by default.
  // Camera clocks record local time without a zone; Eastern time with US daylight saving is assumed.
  function nthSunday(y, m, n) { const d = new Date(Date.UTC(y, m, 1)); return 1 + ((7 - d.getUTCDay()) % 7) + (n - 1) * 7; }
  function easternOffset(y, mo, d) {
    const start = Date.UTC(y, 2, nthSunday(y, 2, 2)), end = Date.UTC(y, 10, nthSunday(y, 10, 1)), t = Date.UTC(y, mo - 1, d);
    return t >= start && t < end ? -4 : -5;
  }
  function sunTimes(y, mo, d, lat = 28.54, lon = -81.38) {
    const N = Math.round((Date.UTC(y, mo - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const g = (2 * Math.PI / 365) * (N - 0.5);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const dec = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const r = Math.PI / 180, la = lat * r;
    const cosH = Math.cos(90.833 * r) / (Math.cos(la) * Math.cos(dec)) - Math.tan(la) * Math.tan(dec);
    const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / r;
    const off = easternOffset(y, mo, d) * 60;
    return { rise: 720 - 4 * (lon + H) - eqt + off, set: 720 - 4 * (lon - H) - eqt + off };
  }
  function lightOf(mins, sun) {
    if (mins == null) return null;
    if (mins < sun.rise - 40 || mins > sun.set + 40) return "Night";
    if (mins < sun.rise) return "Blue hour";
    if (mins < sun.rise + 60) return "Golden hour";
    if (mins > sun.set) return "Blue hour";
    if (mins > sun.set - 60) return "Golden hour";
    if (mins < 11 * 60) return "Morning";
    if (mins < 14 * 60) return "Midday";
    return "Afternoon";
  }

  /* ---------- behaviour vocabulary ---------- */
  const BEHAVIOURS = [
    ["In flight", /\b(fly|flying|flight|soar|soaring|takeoff|take-off|taking off|landing|wings? (spread|outstretched|raised))/i],
    ["Fishing", /\b(fish|fishing|catch|caught|prey|hunting|stalking|strik)/i],
    ["Feeding", /\b(feed|feeding|forag|eating|probing|grazing|pecking|nectar|drinking)/i],
    ["Preening", /\b(preen|grooming|scratching|bathing|drying)/i],
    ["Calling", /\b(call|calling|sing|singing|vocali)/i],
    ["Perched", /\b(perch|perched|sitting on|on a branch|on a post)/i],
    ["Wading", /\b(wad|standing in (shallow )?water)/i],
    ["Swimming", /\b(swim|swimming|floating|paddling)/i],
    ["Basking", /\b(bask|sunning|sunbath)/i],
    ["Resting", /\b(rest|resting|roost|sleep|loafing|perched quietly)/i],
    ["Courtship & young", /\b(court|display|mating|nest|chick|juvenile|young|baby|duckling|fledgl|parent|feeding (a |its )?(chick|young))/i],
    ["Together", /\b(pair|flock|group|together|interact|several|family)/i],
  ];
  const YOUNG_RE = /\b(chick|juvenile|immature|young|baby|babies|duckling|fledgl|hatchling|joey|kit|pup)/i;

  /* ---------- colour ---------- */
  function hexHsl(hex) {
    const n = parseInt(String(hex).slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [h, s, l];
  }
  const COLOURS = {
    red: ([h, s, l]) => s > 0.3 && l > 0.15 && l < 0.8 && (h >= 345 || h < 14),
    orange: ([h, s, l]) => s > 0.3 && l > 0.2 && l < 0.82 && h >= 14 && h < 40,
    yellow: ([h, s, l]) => s > 0.3 && l > 0.25 && h >= 40 && h < 66,
    green: ([h, s, l]) => s > 0.18 && l > 0.1 && l < 0.85 && h >= 66 && h < 165,
    teal: ([h, s, l]) => s > 0.18 && l > 0.1 && h >= 165 && h < 195,
    blue: ([h, s, l]) => s > 0.18 && l > 0.12 && h >= 195 && h < 255,
    purple: ([h, s, l]) => s > 0.18 && l > 0.12 && h >= 255 && h < 300,
    pink: ([h, s, l]) => s > 0.25 && l > 0.45 && h >= 300 && h < 345,
    white: ([, s, l]) => l > 0.84 && s < 0.35,
    black: ([, , l]) => l < 0.11,
    grey: ([, s, l]) => s < 0.1 && l > 0.2 && l < 0.8,
    brown: ([h, s, l]) => h >= 10 && h < 45 && s > 0.15 && l > 0.12 && l < 0.45,
  };
  const COLOUR_ALIAS = { gray: "grey", dark: "black", golden: "yellow", gold: "yellow", violet: "purple", scarlet: "red", crimson: "red", turquoise: "teal", aqua: "teal" };

  /* ---------- small helpers ---------- */
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  const parseLocal = (t) => {
    const m = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d))?)?/.exec(String(t || ""));
    return m ? { y: +m[1], mo: +m[2], d: +m[3], hh: m[4] == null ? null : +m[4], mi: m[5] == null ? null : +m[5], ss: +(m[6] || 0) } : null;
  };
  const secs = (c) => c && c.hh != null ? Date.UTC(c.y, c.mo - 1, c.d, c.hh, c.mi, c.ss) / 1000 : null;
  function cleanLens(l) {
    const m = /(\d+)(?:\.0)?\s*-\s*(\d+)(?:\.0)?\s*mm\s*f\/?([\d.]+)\s*-\s*([\d.]+)/i.exec(String(l || ""));
    return m ? `${m[1]}–${m[2]} mm f/${m[3]}–${m[4]}` : l || "";
  }
  function shutter(ss) {
    if (!ss) return "";
    return ss >= 0.5 ? `${+ss.toFixed(1)} s` : `1/${Math.round(1 / ss)} s`;
  }

  /* ---------- build ---------- */
  function build(raw, opts = {}) {
    const tax = raw.taxonomy || {};
    const syn = tax.synonyms || {};
    const genera = tax.genera || {};
    const families = tax.families || {};
    const setOf = (a) => new Set((a || []).map((x) => x.toLowerCase()));
    const captive = setOf(tax.captive), domestic = setOf(tax.domestic), review = setOf(tax.review), notWild = setOf(tax.notWildlife);
    const enrich = raw.enrich || {};
    const previews = raw.previews || {};
    const notesSp = (raw.notes && raw.notes.species) || {};
    const notesOut = (raw.notes && raw.notes.outings) || {};
    const pub = raw.publicIds || {};
    const site = raw.site || {};
    const calls = raw.calls || {};
    const hidden = new Set(site.hidden || []);
    const synSci = (s) => {
      s = String(s || "").trim();
      const b = binomial(s);
      if (b && syn[b]) return syn[b] + s.slice(b.length);
      return syn[s] || s;
    };

    // 1. canonical names, tallied over every photo
    const tally = new Map();
    for (const f of Object.values(raw.folders || {})) for (const p of Object.values(f.photos || {})) {
      const r = rawId(p), b = binomial(synSci(r.s));
      if (!b || !r.c || r.g === "none" || NONE_RE.test(r.c)) continue;
      const { base } = splitName(r.c);
      if (!base) continue;
      const t = tally.get(b) || new Map(), k = nameKey(base), e = t.get(k) || { name: base, n: 0, mine: 0 };
      e.n++; if (r.mine) e.mine++;
      t.set(k, e); tally.set(b, t);
    }
    // The photographer's own naming wins, then the most used name.
    const binName = new Map([...tally].map(([b, t]) => [b, [...t.values()].sort((x, y) => y.mine - x.mine || y.n - x.n || x.name.length - y.name.length)[0].name]));
    // A name used under several binomials (a wrong genus here and there) belongs to the binomial that uses it most.
    const best = new Map();
    for (const [b, t] of tally) for (const [k, e] of t) {
      const score = e.mine * 1e6 + e.n;
      if (!best.has(k) || best.get(k).score < score) best.set(k, { b, score });
    }
    const nameBin = new Map([...best].map(([k, v]) => [k, v.b]));
    function canonOf(r) {
      if (!r.c || r.g === "none" || NONE_RE.test(r.c)) return null;
      const sci = synSci(r.s);
      const { base, qual, sp } = splitName(r.c);
      const b = nameBin.get(nameKey(base)) || binomial(sci);
      const unsure = UNSURE_RE.test(qual) || (!r.mine && r.conf === "low");
      if (b) return { key: "b:" + b.toLowerCase(), name: binName.get(b) || base, sci: b, unsure };
      const name = sp || (UNSURE_RE.test(qual) && !/\s/.test(base)) ? `${base} sp.` : base;
      return { key: "n:" + nameKey(name), name, sci, unsure };
    }
    function familyOf(sci) {
      const s = String(sci || "").trim();
      const head = s.split(/\s+/)[0] || "";
      let fam = "";
      if (/idae$/.test(head)) fam = head;
      else if (genera[head]) fam = genera[head];
      else if (families[head]) fam = head;
      const info = families[fam];
      return info ? { family: fam, cls: info[0], order: info[1], famName: info[2] } : { family: fam, cls: "", order: "", famName: fam };
    }

    // 2. photographs
    let photos = [];
    for (const [fid, f] of Object.entries(raw.folders || {})) {
      for (const [id, p] of Object.entries(f.photos || {})) {
        if (opts.publicOnly && (hidden.has(id) || (p.ov && p.ov.hidden) || p.st === "skip")) continue;
        const ai = p.ai || {}, ov = p.ov || {}, e = enrich[id] || {}, pv = previews[id];
        const r = rawId(p);
        const cn = canonOf(r);
        const bin = cn && cn.sci ? binomial(cn.sci) : "";
        const lc = bin.toLowerCase();
        const isNone = !cn || notWild.has(lc) || r.g === "none";
        const cap = parseLocal(e.t) || parseLocal(f.date);
        const hasTime = !!(cap && cap.hh != null);
        const mins = hasTime ? cap.hh * 60 + cap.mi : null;
        const sun = cap ? sunTimes(cap.y, cap.mo, cap.d, e.gps && e.gps[0], e.gps && e.gps[1]) : null;
        const w = p.w || (pv && pv.w) || e.W || 3, h = p.h || (pv && pv.h) || e.H || 2;
        const fam = isNone ? { family: "", cls: "", order: "", famName: "" } : familyOf(cn.sci);
        const text = [ai.behavior, ai.caption, (ai.tags || []).join(" "), ai.sexAge].join(" ");
        const behaviours = BEHAVIOURS.filter(([, re]) => re.test(text)).map(([b]) => b);
        photos.push({
          id, fid, name: p.n || id, size: p.s || 0, modified: p.t || "", mime: p.m || "",
          outing: f.outing || "", outingDate: f.date || "", dateLabel: f.dateLabel || "",
          t: e.t || (f.date ? f.date + "T12:00:00" : ""), cap, hasTime, secs: secs(cap), mins,
          year: cap ? cap.y : null, month: cap ? cap.mo : null, day: cap ? cap.d : null,
          season: cap ? SEASONS[cap.mo] : "", light: hasTime ? lightOf(mins, sun) : null, sun,
          w, h, ar: Math.min(3.2, Math.max(0.45, w / h)), W: e.W || w, H: e.H || h,
          spKey: isNone ? "" : cn.key, common: isNone ? "" : cn.name, sci: isNone ? "" : cn.sci, bin,
          unsure: !isNone && !!cn.unsure, mine: !!ov.common,
          group: isNone ? (p.ai || ov.common ? "scene" : "pending") : (r.g || "other"),
          hidden: hidden.has(id) || !!ov.hidden, sorted: !!(p.ai || ov.common),
          family: fam.family, famName: fam.famName, order: fam.order, cls: fam.cls,
          captive: captive.has(lc), domestic: domestic.has(lc), review: review.has(lc),
          rating: ov.rating || ai.quality || 0, aiRating: ai.quality || 0, confidence: ai.confidence || "",
          caption: ai.caption || "", behavior: ai.behavior || "", setting: ai.setting || "", sexAge: ai.sexAge || "",
          tags: ai.tags || [], count: ai.count || 0, others: ai.others || [], qualityNote: ai.qualityNote || "",
          behaviours, young: YOUNG_RE.test(text),
          pal: e.pal || [], hsl: (e.pal || []).slice(0, 4).map(hexHsl), lq: e.lq || "", fp: e.fp || [0.5, 0.5], sh: e.sh || 0,
          exif: { cam: e.cam || "", lens: cleanLens(e.lens), fl: e.fl || 0, f: e.f || 0, ss: e.ss || 0, iso: e.iso || 0, eb: e.eb || 0, gps: e.gps || null },
          frame: frameNo(p.n), heroMark: !!ov.hero, cover: !!ov.cover, st: p.st || "", err: p.err || "",
          a: p.a || (pv && pv.a) || "", pub: pub[id] || "", raw: p,
        });
      }
    }
    for (const x of photos) x.score = x.rating * 10 + Math.min(5, x.sh / 46) + (x.unsure ? -2 : 0) + (x.group === "scene" || x.group === "pending" ? -3 : 0);

    // 3. duplicates: the same frame filed twice (often "Copy of …" in a second outing folder)
    // Same file name, capture second and dimensions is the same frame even when re-exported;
    // without camera data, fall back to the byte size.
    const dupKey = (x) => [x.name.replace(/^copy of /i, "").toLowerCase()].concat(x.hasTime ? [x.t, x.W, x.H] : [x.size]).join("|");
    const byKey = new Map();
    for (const x of photos) { const k = dupKey(x); (byKey.get(k) || byKey.set(k, []).get(k)).push(x); }
    const duplicates = [];
    for (const list of byKey.values()) {
      if (list.length < 2) continue;
      list.sort((a, b) => String(b.modified).localeCompare(String(a.modified)));
      for (const d of list.slice(1)) { d.dupOf = list[0].id; }
      list[0].dups = list.slice(1).map((d) => d.id);
      duplicates.push(list);
    }
    const allIncludingDups = photos;
    if (opts.dedupe !== false) photos = photos.filter((x) => !x.dupOf);
    const byId = new Map(allIncludingDups.map((x) => [x.id, x]));

    // 4. bursts: consecutive frames of one subject within a couple of seconds
    const byFolder = new Map();
    for (const x of photos) (byFolder.get(x.fid) || byFolder.set(x.fid, []).get(x.fid)).push(x);
    const bursts = [];
    for (const list of byFolder.values()) {
      list.sort((a, b) => (a.secs ?? 0) - (b.secs ?? 0) || (a.frame ?? 0) - (b.frame ?? 0) || natural(a.name, b.name));
      let cur = null;
      for (const x of list) {
        const prev = cur && cur[cur.length - 1];
        const near = prev && prev.spKey === x.spKey && (
          prev.secs != null && x.secs != null ? Math.abs(x.secs - prev.secs) <= 2 && (prev.frame == null || x.frame == null || Math.abs(x.frame - prev.frame) <= 8)
            : prev.frame != null && x.frame != null && Math.abs(x.frame - prev.frame) <= 2);
        if (near) cur.push(x); else { cur = [x]; bursts.push(cur); }
      }
    }
    bursts.forEach((frames, k) => {
      const hero = frames.find((x) => x.heroMark) || frames.slice().sort((a, b) => b.score - a.score)[0];
      const b = { id: hero.id, frames, hero, size: frames.length };
      frames.forEach((x, i) => { x.burst = b; x.burstIndex = i; x.isHero = x === hero; });
      bursts[k] = b;
    });
    const heroes = photos.filter((x) => x.isHero);

    // 5. outings: each dated folder is one outing
    const outings = [];
    for (const [fid, f] of Object.entries(raw.folders || {})) {
      const list = (byFolder.get(fid) || []).slice();
      if (!list.length) continue;
      const sp = new Map();
      for (const x of list) if (x.spKey) { const e = sp.get(x.spKey) || { key: x.spKey, name: x.common, n: 0 }; e.n++; sp.set(x.spKey, e); }
      const top = [...sp.values()].sort((a, b) => b.n - a.n);
      const hs = list.filter((x) => x.isHero);
      const cover = list.find((x) => x.cover) || hs.filter((x) => x.ar >= 1.2 && x.group !== "scene").sort((a, b) => b.score - a.score)[0] || hs.slice().sort((a, b) => b.score - a.score)[0];
      const companions = String(f.outing || "").replace(/^birding\s*/i, "").split(/\s+/).filter((w) => /^[A-Z]{2}$/.test(w));
      outings.push({
        id: fid, type: f.outing || "", date: f.date || "", label: f.dateLabel || "", photos: list, heroes: hs,
        species: top, cover, note: notesOut[fid] || "",
        title: top.length ? top.slice(0, 2).map((s) => s.name).join(" & ") : (f.outing || "Outing"),
        companions, slug: fid,
      });
    }
    outings.sort((a, b) => a.date.localeCompare(b.date) || natural(a.type, b.type));
    outings.forEach((o, i) => { o.no = i + 1; });
    const outingById = new Map(outings.map((o) => [o.id, o]));

    // 6. species
    const spMap = new Map();
    for (const x of photos) {
      if (!x.spKey) continue;
      let s = spMap.get(x.spKey);
      if (!s) {
        s = { key: x.spKey, name: x.common, sci: x.sci, bin: x.bin, family: x.family, famName: x.famName, order: x.order, cls: x.cls,
          group: x.group, captive: x.captive, domestic: x.domestic, review: x.review, photos: [], outings: new Set(), months: Array(12).fill(0),
          behaviours: new Map(), first: null, last: null, unsureN: 0 };
        spMap.set(x.spKey, s);
      }
      s.photos.push(x);
      s.outings.add(x.fid);
      if (x.month) s.months[x.month - 1]++;
      if (x.unsure) s.unsureN++;
      for (const b of x.behaviours) s.behaviours.set(b, (s.behaviours.get(b) || 0) + 1);
      const d = x.t.slice(0, 10);
      if (d && (!s.first || d < s.first)) s.first = d;
      if (d && (!s.last || d > s.last)) s.last = d;
    }
    const usedSlugs = new Set();
    const species = [...spMap.values()];
    for (const s of species) {
      s.photos.sort((a, b) => b.score - a.score);
      s.heroes = s.photos.filter((x) => x.isHero);
      s.best = s.photos.find((x) => x.cover) || s.heroes.find((x) => x.ar >= 1.15) || s.photos[0];
      s.note = notesSp[s.bin] || notesSp[s.sci] || "";
      const call = calls[s.bin] || calls[s.sci];
      s.call = call && call.file ? call : null;
      s.wild = !s.captive && !s.domestic;
      // Species-level when it has a binomial, or when it's a name the photographer gave it themselves.
      s.own = s.photos.every((x) => x.mine);
      s.sp = /\bsp\.$/.test(s.name) || (!s.bin && !s.own);
      s.uncertain = s.unsureN === s.photos.length;
      let sl = slug(s.name) || slug(s.sci) || "species";
      while (usedSlugs.has(sl)) sl += "-2";
      usedSlugs.add(sl);
      s.slug = sl;
      s.outingN = s.outings.size;
      s.behaviourList = [...s.behaviours].sort((a, b) => b[1] - a[1]);
    }
    species.sort((a, b) => natural(a.name, b.name));
    const speciesByKey = new Map(species.map((s) => [s.key, s]));
    const speciesBySlug = new Map(species.map((s) => [s.slug, s]));
    // Life list: confident, wild, species-level identifications, in the order first seen.
    const life = species.filter((s) => s.wild && !s.sp && !s.uncertain && (s.bin || s.own)).sort((a, b) => a.first.localeCompare(b.first) || natural(a.name, b.name));
    life.forEach((s, i) => { s.lifeNo = i + 1; });

    // 7. tree of life: class > order > family > species
    const CLASS_NAMES = { Aves: "Birds", Mammalia: "Mammals", Reptilia: "Reptiles", Insecta: "Insects", Malacostraca: "Crustaceans", Diplopoda: "Millipedes", Amphibia: "Amphibians" };
    const tree = new Map();
    for (const s of species) {
      const c = s.cls || "Unplaced", o = s.order || "Unplaced", fm = s.family || "Unplaced";
      const cn = tree.get(c) || tree.set(c, { name: c, common: CLASS_NAMES[c] || c, orders: new Map(), n: 0 }).get(c);
      const on = cn.orders.get(o) || cn.orders.set(o, { name: o, families: new Map(), n: 0 }).get(o);
      const fn = on.families.get(fm) || on.families.set(fm, { name: fm, common: s.famName || fm, species: [], n: 0 }).get(fm);
      fn.species.push(s); fn.n++; on.n++; cn.n++;
    }

    // 8. rooms: themed walls drawn from the archive
    const famIn = (...f) => (x) => f.includes(x.family);
    const ROOMS = [
      { id: "collection", title: "The Collection", sub: "The strongest frames in the archive.", test: (x) => x.rating >= 4 && x.group !== "scene" && !x.unsure, limit: 36 },
      { id: "herons", title: "Herons & Egrets", sub: "Patience on long legs.", test: famIn("Ardeidae") },
      { id: "flight", title: "In Flight", sub: "Wings open.", test: (x) => x.behaviours.includes("In flight") },
      { id: "golden", title: "Golden Hour", sub: "The first and last light of the day.", test: (x) => x.light === "Golden hour" && x.group !== "scene" },
      { id: "raptors", title: "Raptors", sub: "Hawks, kites, owls and Ospreys.", test: famIn("Accipitridae", "Pandionidae", "Falconidae", "Strigidae", "Cathartidae") },
      { id: "young", title: "The Next Generation", sub: "Chicks, ducklings and juveniles.", test: (x) => x.young && x.group !== "scene" },
      { id: "ibises", title: "Ibises & Spoonbills", sub: "Curved bills and pink feathers.", test: famIn("Threskiornithidae") },
      { id: "woodpeckers", title: "Woodpeckers", sub: "Drummers of the pine woods.", test: famIn("Picidae") },
      { id: "songbirds", title: "Songbirds", sub: "Warblers, wrens, grackles and gnatcatchers.", test: (x) => x.order === "Passeriformes" },
      { id: "waterfowl", title: "On the Water", sub: "Ducks, grebes, gallinules and coots.", test: famIn("Anatidae", "Rallidae", "Podicipedidae") },
      { id: "scales", title: "Scales & Shells", sub: "Alligators, iguanas, turtles and snakes.", test: (x) => x.cls === "Reptilia" && !x.captive },
      { id: "fur", title: "Fur", sub: "Otters, raccoons, rabbits and squirrels.", test: (x) => x.cls === "Mammalia" && !x.domestic && !x.captive },
      { id: "small", title: "Small Wonders", sub: "Dragonflies, bees, crabs and other small lives.", test: (x) => ["Insecta", "Malacostraca", "Diplopoda"].includes(x.cls) },
      { id: "scenes", title: "Between Sightings", sub: "Landscapes, flowers and quiet moments.", test: (x) => x.group === "scene" },
    ];
    const curated = (raw.collections || []).map((c) => ({ ...c, curated: true }));
    const rooms = [], usedCovers = new Set();
    for (const r of [...curated, ...ROOMS]) {
      let list = r.ids ? r.ids.map((id) => byId.get(id)).filter((x) => x && !x.dupOf) : heroes.filter(r.test);
      if (!r.ids) list.sort((a, b) => b.score - a.score);
      if (r.limit) list = list.slice(0, r.limit);
      if (list.length < (r.min || 5)) continue;
      const cover = (r.cover && byId.get(r.cover)) || list.find((x) => x.ar >= 1.2 && !usedCovers.has(x.id)) || list.find((x) => !usedCovers.has(x.id)) || list[0];
      usedCovers.add(cover.id);
      rooms.push({ id: r.id, title: r.title, sub: r.sub || "", photos: list, cover, curated: !!r.curated });
    }

    // 9. exhibition opening: distinct species, landscape frames, best first
    let opening = (site.heroIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!opening.length) {
      const seen = new Set();
      for (const x of heroes.filter((x) => x.ar >= 1.3 && x.group !== "scene" && !x.unsure && !x.domestic).sort((a, b) => b.score - a.score)) {
        if (seen.has(x.spKey)) continue;
        seen.add(x.spKey); opening.push(x);
        if (opening.length === 7) break;
      }
    }

    // 10. stats
    const dates = photos.map((x) => x.t.slice(0, 10)).filter(Boolean).sort();
    const stats = {
      photos: photos.length, frames: allIncludingDups.length, heroes: heroes.length,
      species: life.length, allSpecies: species.length, outings: outings.length,
      families: new Set(life.map((s) => s.family).filter(Boolean)).size,
      first: dates[0] || "", last: dates[dates.length - 1] || "", duplicates: duplicates.reduce((n, l) => n + l.length - 1, 0),
    };

    // capture order numbering, used on the specimen tag
    photos.slice().sort((a, b) => a.t.localeCompare(b.t) || natural(a.name, b.name)).forEach((x, i) => { x.no = i + 1; });

    const model = {
      photos, heroes, byId, bursts, outings, outingById, species, speciesByKey, speciesBySlug, life, tree, rooms, opening, stats, duplicates,
      site, raw, opts,
      search: (q) => parseQuery(q, model),
    };
    return model;
  }

  /* ---------- search ---------- */
  // Natural-language search, parsed locally: "herons in flight golden hour", "5 star october 2025",
  // "red birds", "otters", "morning winter". Anything not understood is matched as text.
  const GROUP_WORDS = { bird: "bird", birds: "bird", mammal: "mammal", mammals: "mammal", reptile: "reptile", reptiles: "reptile", insect: "insect", insects: "insect", bug: "insect", bugs: "insect", scene: "scene", scenes: "scene", landscape: "scene", landscapes: "scene" };
  const LIGHT_WORDS = { "golden hour": "Golden hour", golden: "Golden hour", sunrise: "Golden hour", sunset: "Golden hour", "blue hour": "Blue hour", dawn: "Blue hour", dusk: "Blue hour", twilight: "Blue hour", morning: "Morning", midday: "Midday", noon: "Midday", afternoon: "Afternoon", evening: "Golden hour", night: "Night" };
  const BEHAV_WORDS = { "in flight": "In flight", flight: "In flight", flying: "In flight", fly: "In flight", soaring: "In flight", fishing: "Fishing", hunting: "Fishing", catch: "Fishing", feeding: "Feeding", eating: "Feeding", foraging: "Feeding", preening: "Preening", bathing: "Preening", calling: "Calling", singing: "Calling", perched: "Perched", perching: "Perched", wading: "Wading", swimming: "Swimming", basking: "Basking", resting: "Resting", sleeping: "Resting", nesting: "Courtship & young", chicks: "Courtship & young", chick: "Courtship & young", babies: "Courtship & young", young: "Courtship & young", juvenile: "Courtship & young", juveniles: "Courtship & young", courtship: "Courtship & young", together: "Together", flock: "Together", pair: "Together" };
  const STOP = new Set(["a", "an", "the", "in", "of", "on", "at", "with", "and", "photos", "photo", "pictures", "shots", "show", "me", "from", "during", "taken", "my", "best", "all", "tones", "tone", "colours", "colors", "coloured", "colored", "light", "shots"]);

  function parseQuery(q, model) {
    const terms = [], tests = [];
    let s = " " + String(q || "").toLowerCase().replace(/[^\p{L}\p{N}★+\s.-]/gu, " ").replace(/\s+/g, " ") + " ";
    // Each understood term remembers the words it came from, so its chip can remove them again.
    const take = (re, fn) => { s = s.replace(re, (...m) => { const n0 = terms.length; fn(...m); for (let i = n0; i < terms.length; i++) terms[i].src = terms[i].src || m[0].trim(); return " "; }); };
    take(/\b([1-5])\s*(?:\+|stars?|★)\s*(?:\+|and up|or more|plus)?/g, (m, n) => { n = +n; terms.push({ kind: "rating", label: `★ ${n}${n < 5 ? "+" : ""}` }); tests.push((x) => x.rating >= n); });
    take(/(★{1,5})/g, (m, st) => { const n = st.length; terms.push({ kind: "rating", label: `★ ${n}+` }); tests.push((x) => x.rating >= n); });
    if (/\bbest\b|\bfinest\b|\btop\b/.test(s) && !terms.some((t) => t.kind === "rating")) { terms.push({ kind: "rating", label: "★ 4+", src: (/\b(best|finest|top)\b/.exec(s) || [""])[0] }); tests.push((x) => x.rating >= 4); s = s.replace(/\b(best|finest|top)\b/g, " "); }
    for (const [w, v] of Object.entries(LIGHT_WORDS).sort((a, b) => b[0].length - a[0].length)) {
      take(new RegExp(`\\s${w}\\s`, "g"), () => { if (!terms.some((t) => t.label === v)) { terms.push({ kind: "light", label: v }); tests.push((x) => x.light === v); } });
    }
    for (const [w, v] of Object.entries(BEHAV_WORDS).sort((a, b) => b[0].length - a[0].length)) {
      take(new RegExp(`\\s${w}\\s`, "g"), () => { if (!terms.some((t) => t.label === v)) { terms.push({ kind: "behaviour", label: v }); tests.push((x) => x.behaviours.includes(v)); } });
    }
    MONTHS.forEach((m, i) => {
      take(new RegExp(`\\s(${m.toLowerCase()}|${MON[i].toLowerCase()})\\s`, "g"), () => { terms.push({ kind: "month", label: m }); tests.push((x) => x.month === i + 1); });
    });
    take(/\s(spring|summer|autumn|fall|winter)\s/g, (m, w) => { const v = w === "fall" ? "Autumn" : w[0].toUpperCase() + w.slice(1); terms.push({ kind: "season", label: v }); tests.push((x) => x.season === v); });
    take(/\s(20\d\d)\s/g, (m, y) => { terms.push({ kind: "year", label: y }); tests.push((x) => x.year === +y); });
    const aliasFrom = {};
    for (const [w, v] of Object.entries(COLOUR_ALIAS)) s = s.replace(new RegExp(`\\s${w}\\s`, "g"), () => { aliasFrom[v] = w; return ` ${v} `; });
    // Colour words only count as colours when they are not part of a species name ("Great Blue Heron").
    const spNames = model.species.map((sp) => sp.name.toLowerCase());
    for (const c of Object.keys(COLOURS)) {
      const re = new RegExp(`\\s${c}\\s`);
      if (!re.test(s)) continue;
      const rest = s.trim();
      if (spNames.some((n) => n.includes(rest) && rest.includes(c))) continue;
      s = s.replace(re, " ");
      terms.push({ kind: "colour", label: `${c[0].toUpperCase() + c.slice(1)} tones`, src: aliasFrom[c] || c });
      const fn = COLOURS[c];
      tests.push((x) => x.hsl.slice(0, 3).some(fn) || new RegExp(`\\b${c}`).test(x.caption.toLowerCase()));
    }
    take(/\s(birds?|mammals?|reptiles?|insects?|bugs?|scenes?|landscapes?)\s/g, (m, w) => { const g = GROUP_WORDS[w]; terms.push({ kind: "group", label: w[0].toUpperCase() + w.slice(1).replace(/s?$/, "s") }); tests.push((x) => x.group === g); });
    // family names: "herons", "woodpeckers", "ducks", "owls"
    const fams = new Map();
    for (const sp of model.species) if (sp.famName) fams.set(sp.family, sp.famName);
    const famHits = [];
    for (const [fam, fn] of fams) {
      const words = fn.toLowerCase().replace(/&/g, " ").split(/[\s,]+/).filter((w) => w.length > 3);
      for (const w of words) {
        const sing = w.replace(/(es|s)$/, "");
        const re = new RegExp(`\\s(${w}|${sing}|${sing}s|${sing}es)\\s`);
        if (re.test(s) && !spNames.some((n) => n === s.trim())) { famHits.push([fam, fn, re]); break; }
      }
    }
    for (const [fam, fn, re] of famHits) {
      // only when it is not part of a species name typed in full
      if (model.species.some((sp) => s.includes(" " + sp.name.toLowerCase() + " "))) continue;
      const hit = re.exec(s);
      s = s.replace(re, " ");
      terms.push({ kind: "family", label: fn, src: hit ? hit[1] : "" });
      tests.push((x) => x.family === fam);
    }
    const words = s.trim().split(/\s+/).filter((w) => w && !STOP.has(w));
    if (words.length) {
      const phrase = words.join(" ");
      const sp = model.species.find((x) => x.name.toLowerCase() === phrase || x.sci.toLowerCase() === phrase);
      if (sp) { terms.push({ kind: "species", label: sp.name, src: phrase }); tests.push((x) => x.spKey === sp.key); }
      else {
        terms.push({ kind: "text", label: `“${phrase}”`, src: phrase });
        tests.push((x) => {
          const hay = (x._hay || (x._hay = [x.common, x.sci, x.famName, x.outing, x.caption, x.behavior, x.setting, x.tags.join(" "), x.sexAge, x.name, x.season, x.light, MONTHS[(x.month || 1) - 1]].join(" ").toLowerCase()));
          return words.every((w) => hay.includes(w) || (w.length > 3 && hay.includes(w.replace(/(es|s)$/, ""))));
        });
      }
    }
    return { terms, test: (x) => tests.every((t) => t(x)), empty: !tests.length };
  }

  GP.model = { build, parseQuery, splitName, binomial, nameKey, slug, frameNo, rawId, sunTimes, lightOf, easternOffset, hexHsl, cleanLens, shutter, MONTHS, MON, SEASONS, BEHAVIOURS, NONE_RE, UNSURE_RE };
})(window.GP = window.GP || {});
