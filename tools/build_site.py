#!/usr/bin/env python3
"""Build the public site's data from the gallery's saved library.

Reads a dump of the Workshop's database (folders, enrich, notes, meta, collections), the
public-copy manifest that PublicGallerySync.gs keeps in Nikon/Public Gallery, and the
repository's notes and taxonomy, then writes:

  data/gallery.json   everything the site needs, minus private fields (critiques, GPS,
                      asset ids, hidden photos)
  index.html          from index.template.html, with link-preview tags filled in

  manifest --out FILE                          fetch Nikon/Public Gallery/manifest.json
  merge --db DIR --manifest FILE --out DIR     add Finals the Workshop hasn't indexed yet
  build --db DIR --repo DIR [--manifest FILE] [--report FILE] [--dev]

--manifest reads a local copy instead of fetching it from Drive with $GDRIVE_SA_KEY.
--report writes the species and outings that have no notes yet.
--dev keeps photos that have no public copy yet and serves images from tools/dev_server.py.
"""
import argparse, datetime, glob, html, json, os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

NIKON_ID = "1lEhOfHPIO3-Kf4gl6-rhz9d-IwHL14rY"
PUBLIC_FOLDER = "Public Gallery"
IMAGE_URL = "https://lh3.googleusercontent.com/d/{id}=w{w}"
FULL_URL = "https://lh3.googleusercontent.com/d/{id}=s0"
DOWNLOAD_URL = "https://drive.google.com/uc?export=download&id={id}"
# Other public addresses for a Drive image, tried in order by `probe`.
IMAGE_CANDIDATES = [
    ("https://lh3.googleusercontent.com/d/{id}=w{w}", "https://lh3.googleusercontent.com/d/{id}=s0"),
    ("https://drive.google.com/thumbnail?id={id}&sz=w{w}", "https://drive.google.com/thumbnail?id={id}&sz=w6000"),
]

AI_KEEP = ("group", "common", "scientific", "confidence", "count", "others", "sexAge", "behavior", "setting", "tags", "quality", "caption")
OV_KEEP = ("common", "scientific", "group", "rating", "hero", "cover")
EN_KEEP = ("t", "cam", "lens", "fl", "f", "ss", "iso", "eb", "W", "H", "pal", "lq", "fp", "sh")


def read_docs(path):
    out = {}
    for f in sorted(glob.glob(os.path.join(path, "*.json"))):
        try:
            out[os.path.splitext(os.path.basename(f))[0]] = json.load(open(f))
        except Exception as e:
            print(f"skipping {f}: {e}", file=sys.stderr)
    return out


def read_json(*paths):
    for p in paths:
        if p and os.path.exists(p):
            return json.load(open(p))
    return None


def fetch_manifest():
    import nikon_previews as NP
    drive = NP.Drive(NP.load_key())
    q = f"'{NIKON_ID}' in parents and name = '{PUBLIC_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    r = drive.get(NP.API, params={"q": q, "fields": "files(id)", "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"})
    r.raise_for_status()
    folders = r.json().get("files", [])
    if not folders:
        sys.exit(f"No '{PUBLIC_FOLDER}' folder in the Nikon folder yet. Install PublicGallerySync.gs and run setup() first.")
    pub = folders[0]["id"]
    r = drive.get(NP.API, params={"q": f"'{pub}' in parents and name = 'manifest.json' and trashed = false", "fields": "files(id)", "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"})
    r.raise_for_status()
    files = r.json().get("files", [])
    if not files:
        sys.exit("The Public Gallery has no manifest.json yet; the first sync may still be running.")
    r = drive.get(f"{NP.API}/{files[0]['id']}", params={"alt": "media", "supportsAllDrives": "true"})
    r.raise_for_status()
    return r.json()


def cmd_probe(a):
    """Find which public image address works for the copies, fetching anonymously like a visitor."""
    import requests
    items = (json.load(open(a.manifest)).get("items") or {})
    pubs = [it["pub"] for it in list(items.values())[:3] if it.get("pub")]
    if not pubs:
        sys.exit("No public copies in the manifest yet.")
    for image, full in IMAGE_CANDIDATES:
        ok = 0
        for pid in pubs:
            try:
                r = requests.get(image.format(id=pid, w=400), timeout=30, allow_redirects=True)
                ok += r.status_code == 200 and r.headers.get("content-type", "").startswith("image/")
            except Exception:
                pass
        if ok == len(pubs):
            json.dump({"image": image, "full": full, "download": DOWNLOAD_URL}, open(a.out, "w"))
            print(json.dumps({"works": image}))
            return
    sys.exit("No public image address worked. Check that Nikon › Public Gallery is shared as 'Anyone with the link'.")


def cmd_manifest(a):
    json.dump(fetch_manifest(), open(a.out, "w"))
    print(f"Saved the manifest to {a.out}.")


def parse_date(s):
    m = re.search(r"(19\d{2}|20\d{2})[ ._-]+(\d{1,2})[ ._-]+(\d{1,2})", s or "")
    if not m or not (1 <= int(m.group(2)) <= 12 and 1 <= int(m.group(3)) <= 31):
        return None
    return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"


MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".tif": "image/tiff", ".tiff": "image/tiff", ".heic": "image/heic"}


def cmd_merge(a):
    """Copy the database dump to OUT, adding Finals that are in the public copies but not yet in
    the Workshop's index, so new photos reach the site before anyone opens the Workshop."""
    folders = read_docs(os.path.join(a.db, "folders"))
    items = (json.load(open(a.manifest)).get("items") or {})
    have = {pid for f in folders.values() for pid in (f.get("photos") or {})}
    by_finals = {}
    for src, it in items.items():
        if src not in have and it.get("finals"):
            by_finals.setdefault(it["finals"], []).append((src, it))
    added = 0
    for fid, lst in by_finals.items():
        paths = [[p.strip() for p in (it.get("path") or "").split(" / ") if p.strip()] for _, it in lst]
        chain = min(paths, key=len) if paths else []
        f = folders.get(fid)
        if not f:
            outing = chain[0] if chain else "Outing"
            date = next((d for d in map(parse_date, reversed(chain[1:])) if d), None) or parse_date(outing) or min((it.get("mod") or "")[:10] for _, it in lst) or None
            f = folders[fid] = {"outing": outing, "outingId": "", "chain": chain or [outing], "dateLabel": chain[-1] if len(chain) > 1 else "", "date": date, "photos": {}}
        for (src, it), parts in zip(lst, paths):
            rec = {"n": it.get("name"), "t": it.get("mod"), "s": it.get("size"), "st": "new", "m": MIME.get(os.path.splitext(it.get("name") or "")[1].lower(), "image/jpeg")}
            if it.get("w") and it.get("h"):
                rec["w"], rec["h"] = it["w"], it["h"]
            if len(parts) > len(chain):
                rec["sub"] = " › ".join(parts[len(chain):])
            f.setdefault("photos", {})[src] = rec
            added += 1
    os.makedirs(os.path.join(a.out, "folders"), exist_ok=True)
    for fid, f in folders.items():
        json.dump(f, open(os.path.join(a.out, "folders", fid + ".json"), "w"))
    for sub in ("enrich", "notes", "meta", "collections", "previews"):
        src, dst = os.path.join(os.path.abspath(a.db), sub), os.path.join(a.out, sub)
        if os.path.isdir(src) and not os.path.exists(dst):
            os.symlink(src, dst)
    print(json.dumps({"folders": len(folders), "addedFromManifest": added}))


def prune(d, keep):
    return {k: d[k] for k in keep if k in d and d[k] not in (None, "", [])}


def dup_key(p, e):
    # Same file name, capture second and dimensions is the same frame even when re-exported;
    # without camera data, fall back to the byte size.
    name = re.sub(r"^copy of ", "", (p.get("n") or "").lower())
    return (name, e["t"], e.get("W"), e.get("H")) if e.get("t") else (name, p.get("s"))


def cmd_build(a):
    db, repo = a.db, a.repo
    folders = read_docs(os.path.join(db, "folders"))
    if not folders:
        sys.exit(f"No folders in {db}/folders: dump the gallery database first.")
    enrich = {}
    for doc in sorted(read_docs(os.path.join(db, "enrich")).values(), key=lambda d: d.get("at", "")):
        enrich.update(doc.get("photos") or {})
    site = read_json(os.path.join(db, "meta", "site.json")) or {}
    collections = [c for c in read_docs(os.path.join(db, "collections")).values() if c.get("ids")]
    ns = read_json(os.path.join(db, "notes", "species.json"))
    no = read_json(os.path.join(db, "notes", "outings.json"))
    notes_sp = dict(read_json(os.path.join(repo, "data", "field-notes.json")) or {})
    notes_sp.update((ns or {}).get("notes") or {})
    notes_out = dict(read_json(os.path.join(repo, "data", "outing-notes.json")) or {})
    notes_out.update((no or {}).get("notes") or {})
    taxonomy = read_json(os.path.join(db, "meta", "taxonomy.json"), os.path.join(repo, "data", "taxonomy.json")) or {}
    taxonomy.pop("_notes", None)

    manifest = json.load(open(a.manifest)) if a.manifest else (None if a.dev else fetch_manifest())
    public_ids = {src: it["pub"] for src, it in ((manifest or {}).get("items") or {}).items() if it.get("pub")}
    hidden = set(site.get("hidden") or [])

    out_folders, out_enrich, kept, missing = {}, {}, {}, 0
    for fid, f in folders.items():
        photos = {}
        for pid, p in (f.get("photos") or {}).items():
            ov = p.get("ov") or {}
            if pid in hidden or ov.get("hidden") or p.get("st") == "skip":
                continue
            if not a.dev and pid not in public_ids:
                missing += 1
                continue
            e = enrich.get(pid) or {}
            k = dup_key(p, e)
            prev = kept.get(k)
            if prev and (prev[2].get("t") or "") >= (p.get("t") or ""):
                continue  # the same frame filed twice; keep the newest copy
            if prev:
                (photos if prev[0] == fid else (out_folders.get(prev[0]) or {}).get("photos", {})).pop(prev[1], None)
                out_enrich.pop(prev[1], None)
            kept[k] = (fid, pid, p)
            rec = {"n": p.get("n"), "t": p.get("t"), "w": p.get("w"), "h": p.get("h"), "s": p.get("s")}
            ai = prune(p.get("ai") or {}, AI_KEEP)
            if ai:
                rec["ai"] = ai
            o = prune(ov, OV_KEEP)
            if o:
                rec["ov"] = o
            photos[pid] = {k2: v for k2, v in rec.items() if v not in (None, "")}
            en = prune(e, EN_KEEP)
            if en:
                out_enrich[pid] = en
        out_folders[fid] = {"outing": f.get("outing"), "date": f.get("date"), "dateLabel": f.get("dateLabel"), "photos": photos}
    # drop enrichment for photos removed as duplicates
    live = {pid for f in out_folders.values() for pid in f["photos"]}
    out_enrich = {k: v for k, v in out_enrich.items() if k in live}
    out_folders = {k: v for k, v in out_folders.items() if v["photos"]}

    built = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    site_out = {
        "title": site.get("title") or "Georgiadis Photography",
        "tagline": site.get("tagline") or "Wildlife of Central Florida",
        "intro": site.get("intro") or "",
        "kicker": site.get("kicker") or "",
        "footer": site.get("footer") or "",
        "heroIds": [i for i in (site.get("heroIds") or []) if i in live],
        "downloads": site.get("downloads", True),
        "updated": built[:10],
    }
    data = {
        "version": 1, "built": built,
        "images": "dev" if a.dev else "drive",
        "urls": json.load(open(a.urls)) if a.urls else {"image": IMAGE_URL, "full": FULL_URL, "download": DOWNLOAD_URL},
        "site": site_out, "folders": out_folders, "enrich": out_enrich,
        "notes": {"species": notes_sp, "outings": {k: v for k, v in notes_out.items() if k in out_folders}},
        "taxonomy": taxonomy,
        "publicIds": {k: v for k, v in public_ids.items() if k in live},
        "collections": collections,
    }
    os.makedirs(os.path.join(repo, "data"), exist_ok=True)
    path = os.path.join(repo, "data", "gallery.json")
    body = json.dumps(data, separators=(",", ":"), ensure_ascii=False, sort_keys=True)
    old = open(path).read() if os.path.exists(path) else ""
    # Only the build stamp changing is not a change worth publishing.
    strip = lambda s: re.sub(r'"(built|updated)":"[^"]*"', "", s)
    changed = strip(old) != strip(body)
    if changed:
        open(path, "w").write(body)

    # link previews: the strongest landscape frame with a public copy
    best = None
    for fid, f in out_folders.items():
        for pid, p in f["photos"].items():
            e = out_enrich.get(pid) or {}
            ai, ov = p.get("ai") or {}, p.get("ov") or {}
            w, h = p.get("w") or e.get("W") or 3, p.get("h") or e.get("H") or 2
            if w / h < 1.3 or ai.get("group") in (None, "none"):
                continue
            score = (ov.get("rating") or ai.get("quality") or 0, e.get("sh") or 0)
            if pid in public_ids and (best is None or score > best[0]):
                best = (score, pid)
    if site_out["heroIds"] and site_out["heroIds"][0] in public_ids:
        best = (None, site_out["heroIds"][0])
    tpl = os.path.join(repo, "index.template.html")
    if os.path.exists(tpl):
        page = open(tpl).read()
        n_photos = len(live)
        desc = site_out["intro"] or (f"{n_photos:,} wildlife photographs" if n_photos else "Wildlife photographs") + " from Central Florida's wetlands and woods."
        og = data["urls"]["image"].format(id=public_ids[best[1]], w=1600) if best and best[1] in public_ids else ""
        page = page.replace("{{title}}", html.escape(site_out["title"])).replace("{{description}}", html.escape(desc)).replace("{{og_image}}", html.escape(og))
        open(os.path.join(repo, "index.html"), "w").write(page)
    if a.report:
        syn = taxonomy.get("synonyms") or {}
        names, counts = {}, {}
        for f in out_folders.values():
            for p in f["photos"].values():
                ov, ai = p.get("ov") or {}, p.get("ai") or {}
                if (ov.get("group") if ov.get("common") else ai.get("group")) in (None, "", "none"):
                    continue
                sci = (ov.get("scientific") if ov.get("common") else ai.get("scientific")) or ""
                m = re.match(r"^([A-Z][a-z]+) ([a-z][a-z-]+)", sci.strip())
                if not m or m.group(2) in ("sp", "spp"):
                    continue
                b = syn.get(m.group(0), m.group(0))
                if b in (taxonomy.get("notWildlife") or []):
                    continue
                counts[b] = counts.get(b, 0) + 1
                names.setdefault(b, ov.get("common") or ai.get("common") or "")
        sp = [{"bin": b, "name": names[b], "photos": n} for b, n in sorted(counts.items(), key=lambda kv: -kv[1]) if b not in notes_sp]
        outs = []
        for fid, f in out_folders.items():
            if fid in notes_out:
                continue
            tally = {}
            for p in f["photos"].values():
                ov, ai = p.get("ov") or {}, p.get("ai") or {}
                c = ov.get("common") or ai.get("common")
                if c:
                    tally[c] = tally.get(c, 0) + 1
            outs.append({"fid": fid, "outing": f["outing"], "date": f["date"], "photos": len(f["photos"]), "species": [c for c, _ in sorted(tally.items(), key=lambda kv: -kv[1])][:8]})
        json.dump({"species": sp, "outings": outs}, open(a.report, "w"), indent=1)
    n = len(live)
    print(json.dumps({"photos": n, "outings": len(out_folders), "missingPublicCopy": missing, "bytes": len(body.encode()), "changed": changed, "manifestComplete": (manifest or {}).get("complete"), "manifestError": (manifest or {}).get("error")}))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--db", required=True)
    b.add_argument("--repo", required=True)
    b.add_argument("--manifest")
    b.add_argument("--report")
    b.add_argument("--urls", help="image address templates from `probe`")
    b.add_argument("--dev", action="store_true")
    m = sub.add_parser("manifest")
    m.add_argument("--out", required=True)
    g = sub.add_parser("merge")
    g.add_argument("--db", required=True)
    g.add_argument("--manifest", required=True)
    g.add_argument("--out", required=True)
    pr = sub.add_parser("probe")
    pr.add_argument("--manifest", required=True)
    pr.add_argument("--out", required=True)
    a = ap.parse_args()
    {"build": cmd_build, "manifest": cmd_manifest, "merge": cmd_merge, "probe": cmd_probe}[a.cmd](a)


if __name__ == "__main__":
    main()
