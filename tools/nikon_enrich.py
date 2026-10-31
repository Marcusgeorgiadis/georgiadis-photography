#!/usr/bin/env python3
"""Enrich the gallery's Finals with camera data and image analysis.

For every photo in the gallery index this reads, through the read-only service
account ($GDRIVE_SA_KEY):
  - camera data Drive keeps for the original (capture time, body, lens,
    focal length, aperture, shutter, ISO, size, GPS when present)
  - a 640 px rendition, from which it computes a five-colour palette, a tiny
    blurred placeholder, the in-focus subject's position and a sharpness score

  enrich --db DIR --out DIR [--only-missing DIR]   write enrich/<folder>-<n>.json docs
"""
import argparse, base64, concurrent.futures as cf, datetime, glob, io, json, os, re, sys, threading

import numpy as np
from PIL import Image, ImageFilter, ImageOps

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nikon_previews as NP  # noqa: E402

CHUNK = 30  # photos per enrich document: small enough to send to the Workshop's database in one write


def exif_of(m):
    im = m.get("imageMediaMetadata") or {}
    out = {}
    t = im.get("time")
    if t and re.match(r"\d{4}:\d\d:\d\d \d\d:\d\d:\d\d", t):
        out["t"] = t[:10].replace(":", "-") + "T" + t[11:19]
    cam = " ".join(x for x in [im.get("cameraMake", ""), im.get("cameraModel", "")] if x).strip()
    if cam:
        # "NIKON CORPORATION NIKON D3300" -> "Nikon D3300"
        cam = re.sub(r"^(\w+)( CORPORATION| CORP\.?| Corporation)?\s+\1\s+", r"\1 ", cam, flags=re.I)
        out["cam"] = cam.title()
    for k, src in (("lens", "lens"), ("fl", "focalLength"), ("f", "aperture"), ("ss", "exposureTime"), ("iso", "isoSpeed"), ("eb", "exposureBias")):
        v = im.get(src)
        if v not in (None, "", 0):
            out[k] = v
    if im.get("width"):
        out["W"], out["H"] = im.get("width"), im.get("height")
    loc = im.get("location") or {}
    if loc.get("latitude") is not None and loc.get("longitude") is not None:
        out["gps"] = [round(loc["latitude"], 5), round(loc["longitude"], 5)]
    return out


def analyse(img):
    """palette, placeholder, focal point and sharpness from an RGB image."""
    img = ImageOps.exif_transpose(img).convert("RGB")
    img.thumbnail((640, 640))
    w, h = img.size
    # Palette: median-cut on a small copy, most common first, near-duplicates dropped.
    small = img.resize((96, max(1, round(96 * h / w))))
    q = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: 8 * 3]
    counts = sorted(q.getcolors(), reverse=True)
    colours = []
    for n, idx in counts:
        rgb = tuple(pal[idx * 3: idx * 3 + 3])
        if all(sum((a - b) ** 2 for a, b in zip(rgb, c)) > 900 for c in colours):
            colours.append(rgb)
        if len(colours) == 5:
            break
    hexes = ["#%02x%02x%02x" % c for c in colours]
    # Placeholder: 20 px wide, blurred by the browser when shown.
    lq = img.resize((20, max(1, round(20 * h / w))), Image.LANCZOS)
    buf = io.BytesIO()
    lq.save(buf, "JPEG", quality=50, optimize=True)
    lqip = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
    # Subject: wildlife Finals are usually a sharp animal on a soft background, so
    # local detail (Laplacian energy) finds the subject without any model.
    g = np.asarray(img.convert("L").resize((320, max(1, round(320 * h / w)))), dtype=np.float32)
    lap = np.abs(4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:])
    gh, gw = lap.shape
    bs = 16
    by, bx = max(1, gh // bs), max(1, gw // bs)
    blocks = lap[: by * bs, : bx * bs].reshape(by, bs, bx, bs).mean(axis=(1, 3))
    sharp = float(np.percentile(lap, 99))
    fp = None
    if blocks.max() > 0:
        # Focal point: centroid of squared detail energy, weighted toward the frame's centre,
        # so a sharp animal wins over sharp grass at the edges.
        e = (blocks / blocks.max()) ** 2
        yy, xx = np.mgrid[0:by, 0:bx]
        cy, cx = (yy + 0.5) / by, (xx + 0.5) / bx
        prior = np.exp(-(((cx - 0.5) ** 2) + ((cy - 0.5) ** 2)) / (2 * 0.28 ** 2))
        wgt = e * prior
        if wgt.sum() > 0:
            fp = [round(float((wgt * cx).sum() / wgt.sum()), 3), round(float((wgt * cy).sum() / wgt.sum()), 3)]
    return {"pal": hexes, "lq": lqip, "fp": fp, "sh": round(sharp, 1)}


def fetch_image(drive, m):
    link = m.get("thumbnailLink")
    if link:
        url = re.sub(r"=s\d+(-[\w-]+)?$", "=s640", link)
        for auth in (True, False):
            r = drive.get(url, auth=auth)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                return Image.open(io.BytesIO(r.content))
    r = drive.get(f"{NP.API}/{m['id']}", params={"alt": "media", "supportsAllDrives": "true"})
    if r.status_code == 200:
        img = Image.open(io.BytesIO(r.content))
        img.draft("RGB", (1280, 1280))
        return img
    return None


def cmd_enrich(a):
    drive = NP.Drive(NP.load_key())
    folders = NP.read_docs(os.path.join(a.db, "folders"))
    have = {}
    if a.only_missing:
        for doc in NP.read_docs(os.path.join(a.only_missing, "enrich")).values():
            for pid in (doc.get("photos") or {}):
                have[pid] = True
    jobs = []
    for fid, f in folders.items():
        # hidden photos never reach the public site, so they need no camera data
        ids = [pid for pid, p in (f.get("photos") or {}).items() if pid not in have and not ((p.get("ov") or {}).get("hidden"))]
        if not ids:
            continue
        # One listing call per Finals folder brings camera data and thumbnail links.
        meta, tok = {}, None
        while True:
            p = {"q": f"'{fid}' in parents and trashed = false", "fields": "nextPageToken,files(id,thumbnailLink,imageMediaMetadata)", "pageSize": 1000, "supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
            if tok:
                p["pageToken"] = tok
            r = drive.get(NP.API, params=p)
            r.raise_for_status()
            j = r.json()
            for x in j.get("files", []):
                meta[x["id"]] = x
            tok = j.get("nextPageToken")
            if not tok:
                break
        for pid in ids:
            jobs.append((fid, pid, meta.get(pid)))
    print(f"{len(jobs)} photos to enrich.", flush=True)
    results, failures, lock, done = {}, [], threading.Lock(), [0]

    def work(job):
        fid, pid, m = job
        try:
            if m is None:  # photo sits in a subfolder of Finals
                r = drive.get(f"{NP.API}/{pid}", params={"fields": "id,thumbnailLink,imageMediaMetadata", "supportsAllDrives": "true"})
                m = r.json() if r.status_code == 200 else {"id": pid}
            rec = exif_of(m)
            img = fetch_image(drive, m)
            if img is not None:
                rec.update(analyse(img))
            with lock:
                results.setdefault(fid, {})[pid] = rec
        except Exception as e:  # keep going; the next run retries
            with lock:
                failures.append((pid, f"{type(e).__name__}: {e}"))
        with lock:
            done[0] += 1
            if done[0] % 200 == 0:
                print(f"  {done[0]}/{len(jobs)}", flush=True)

    with cf.ThreadPoolExecutor(8) as ex:
        list(ex.map(work, jobs))
    os.makedirs(os.path.join(a.out, "enrich"), exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    written = []
    for fid, recs in results.items():
        keys = sorted(recs)
        for k, i in enumerate(range(0, len(keys), CHUNK)):
            doc_id = f"{fid}-{stamp}-{k}"
            path = os.path.join(a.out, "enrich", doc_id + ".json")
            json.dump({"fid": fid, "at": stamp, "photos": {pid: recs[pid] for pid in keys[i:i + CHUNK]}}, open(path, "w"), separators=(",", ":"))
            written.append({"op": "set", "collection": "enrich", "doc_id": doc_id, "file_path": path})
    json.dump(written, open(os.path.join(a.out, "enrich_writes.json"), "w"))
    json.dump(failures, open(os.path.join(a.out, "enrich_failures.json"), "w"))
    print(f"Enriched {sum(len(v) for v in results.values())} photos into {len(written)} documents; {len(failures)} failed.")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("enrich")
    e.add_argument("--db", required=True)
    e.add_argument("--out", required=True)
    e.add_argument("--only-missing", help="db dir holding existing enrich docs; skip photos already enriched")
    a = ap.parse_args()
    {"enrich": cmd_enrich}[a.cmd](a)


if __name__ == "__main__":
    main()
