#!/usr/bin/env python3
"""Make Nikon Wildlife Gallery previews straight from the Google Drive API.

The claude.ai Drive connector can't return files over ~6 MB, so this job reads
Finals with a read-only service account (key in $GDRIVE_SA_KEY) and writes
1600 px JPEG previews for the gallery to upload as assets.

  check                         verify the key and that the Nikon folder is shared
  plan  --db DIR --out DIR      find photos without previews and render them
  docs  --out DIR               turn uploads (assets.tsv) into db documents
"""
import argparse, base64, concurrent.futures as cf, datetime, glob, io, json, os, re, sys, threading, time

import requests
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding
from PIL import Image, ImageOps

NIKON_ID = "1lEhOfHPIO3-Kf4gl6-rhz9d-IwHL14rY"
SCOPE = "https://www.googleapis.com/auth/drive.readonly"
API = "https://www.googleapis.com/drive/v3/files"
LONG_EDGE = 1600
DECODABLE = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
Image.MAX_IMAGE_PIXELS = 400_000_000


def load_key():
    raw = os.environ.get("GDRIVE_SA_KEY", "").strip()
    if not raw:
        sys.exit("GDRIVE_SA_KEY is not set in this environment.")
    if os.path.isfile(raw):
        raw = open(raw).read()
    if not raw.lstrip().startswith("{"):
        raw = base64.b64decode(raw + "=" * (-len(raw) % 4)).decode()
    key = json.loads(raw, strict=False)
    if key.get("type") != "service_account" or "private_key" not in key:
        sys.exit("GDRIVE_SA_KEY is not a service account JSON key.")
    key["private_key"] = key["private_key"].replace("\\n", "\n")
    return key


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


class Drive:
    def __init__(self, key):
        self.key, self.tok, self.exp = key, None, 0
        self.lock = threading.Lock()
        self.http = requests.Session()

    def token(self):
        with self.lock:
            if self.tok and time.time() < self.exp - 120:
                return self.tok
            now = int(time.time())
            aud = self.key.get("token_uri") or "https://oauth2.googleapis.com/token"
            head = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
            body = b64u(json.dumps({"iss": self.key["client_email"], "scope": SCOPE, "aud": aud, "iat": now, "exp": now + 3600}).encode())
            pk = serialization.load_pem_private_key(self.key["private_key"].encode(), password=None)
            sig = pk.sign(f"{head}.{body}".encode(), padding.PKCS1v15(), hashes.SHA256())
            r = requests.post(aud, data={"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": f"{head}.{body}.{b64u(sig)}"}, timeout=30)
            if r.status_code != 200:
                sys.exit(f"Google refused the service account key ({r.status_code}): {r.text[:300]}")
            self.tok, self.exp = r.json()["access_token"], now + int(r.json().get("expires_in", 3600))
            return self.tok

    def get(self, url, auth=True, **kw):
        for attempt in range(4):
            headers = {"Authorization": "Bearer " + self.token()} if auth else {}
            r = self.http.get(url, headers=headers, timeout=120, **kw)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** attempt + 1)
                continue
            return r
        return r

    def meta(self, fid):
        r = self.get(f"{API}/{fid}", params={"fields": "id,name,mimeType,size,modifiedTime,thumbnailLink,trashed,imageMediaMetadata(width,height)", "supportsAllDrives": "true"})
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()


def same_time(a, b):
    def p(s):
        try:
            return datetime.datetime.fromisoformat((s or "").replace("Z", "+00:00")).timestamp()
        except ValueError:
            return None
    return p(a) is not None and p(a) == p(b)


def encode(img):
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=84, optimize=True, progressive=True)
    return buf.getvalue(), img.width, img.height


def render(drive, fid):
    m = drive.meta(fid)
    if not m or m.get("trashed"):
        return None, "File no longer in Drive"
    if m.get("mimeType") not in DECODABLE:
        return None, f"Unsupported type {m.get('mimeType')}"
    link = m.get("thumbnailLink")
    if link:
        url = re.sub(r"=s\d+(-[\w-]+)?$", f"=s{LONG_EDGE}", link)
        if url == link:
            url = link + f"=s{LONG_EDGE}"
        for auth in (True, False):
            r = drive.get(url, auth=auth)
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                try:
                    img = Image.open(io.BytesIO(r.content))
                    img.load()
                    if max(img.size) >= 1200:
                        return encode(img), m
                except Exception:
                    pass
                break
    r = drive.get(f"{API}/{fid}", params={"alt": "media", "supportsAllDrives": "true"})
    if r.status_code != 200:
        return None, f"Download failed ({r.status_code})"
    try:
        img = Image.open(io.BytesIO(r.content))
        img.draft("RGB", (LONG_EDGE * 2, LONG_EDGE * 2))
        img.load()
    except Exception as e:
        return None, f"Couldn't decode image: {e}"
    return encode(img), m


def read_docs(path):
    out = {}
    for f in glob.glob(os.path.join(path, "*.json")):
        try:
            out[os.path.splitext(os.path.basename(f))[0]] = json.load(open(f))
        except Exception:
            pass
    return out


def cmd_check(_):
    key = load_key()
    d = Drive(key)
    d.token()
    m = d.meta(NIKON_ID)
    if not m:
        sys.exit(f"Signed in as {key['client_email']}, but the Nikon folder isn't shared with it yet.")
    print(f"OK: {key['client_email']} can read '{m['name']}'.")


def cmd_plan(a):
    folders = read_docs(os.path.join(a.db, "folders"))
    previews = {}
    for doc in read_docs(os.path.join(a.db, "previews")).values():
        for pid, pv in (doc.get("photos") or {}).items():
            previews[pid] = pv
    need = []
    for fid, f in folders.items():
        for pid, p in (f.get("photos") or {}).items():
            if p.get("a") or p.get("st") in ("done", "skip"):
                continue
            pv = previews.get(pid)
            if pv and same_time(pv.get("t"), p.get("t")) and p.get("pvBad") != pv.get("a"):
                continue
            need.append((f.get("date") or "", p.get("n") or "", pid, fid, p.get("t") or ""))
    need.sort(key=lambda x: (x[0], x[1]), reverse=True)
    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    print(f"{len(need)} photos need previews; rendering up to {a.max}.")
    need = need[: a.max]
    drive = Drive(load_key())
    manifest, failures, done = [], [], 0
    lock = threading.Lock()

    def work(item):
        nonlocal done
        _, name, pid, fid, t = item
        path = os.path.join(a.out, "img", pid + ".jpg")
        try:
            res, m = render(drive, pid)
        except Exception as e:
            res, m = None, f"{type(e).__name__}: {e}"
        with lock:
            done += 1
            if res:
                data, w, h = res
                open(path, "wb").write(data)
                manifest.append({"id": pid, "fid": fid, "t": t, "w": w, "h": h, "file": path, "bytes": len(data), "name": name})
            else:
                failures.append({"id": pid, "fid": fid, "name": name, "why": m})
            if done % 50 == 0:
                print(f"  {done}/{len(need)}", flush=True)

    with cf.ThreadPoolExecutor(6) as ex:
        list(ex.map(work, need))
    manifest.sort(key=lambda x: x["file"])
    json.dump(manifest, open(os.path.join(a.out, "manifest.json"), "w"), indent=1)
    json.dump(failures, open(os.path.join(a.out, "failures.json"), "w"), indent=1)
    groups = [manifest[i:i + 25] for i in range(0, len(manifest), 25)]
    json.dump([[m["file"] for m in g] for g in groups], open(os.path.join(a.out, "upload_groups.json"), "w"), indent=1)
    mb = sum(m["bytes"] for m in manifest) / 1e6
    print(f"Rendered {len(manifest)} previews ({mb:.0f} MB) in {len(groups)} upload groups; {len(failures)} failed.")


def cmd_docs(a):
    manifest = {m["id"]: m for m in json.load(open(os.path.join(a.out, "manifest.json")))}
    failures = json.load(open(os.path.join(a.out, "failures.json")))
    assets = {}
    tsv = os.path.join(a.out, "assets.tsv")
    for line in (open(tsv).read().splitlines() if os.path.exists(tsv) else []):
        parts = line.strip().split()
        if len(parts) >= 2:
            pid = os.path.splitext(os.path.basename(parts[0]))[0]
            aid = parts[1].rsplit("/", 1)[-1]
            if pid in manifest and re.fullmatch(r"[0-9a-f]{32}", aid):
                assets[pid] = aid
    run = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    entries = {pid: {"a": aid, "w": manifest[pid]["w"], "h": manifest[pid]["h"], "t": manifest[pid]["t"], "fid": manifest[pid]["fid"]} for pid, aid in assets.items()}
    keys = sorted(entries)
    writes = []
    os.makedirs(os.path.join(a.out, "docs"), exist_ok=True)
    for k, i in enumerate(range(0, len(keys), 1200)):
        doc_id = f"run-{run}-{k}"
        path = os.path.join(a.out, "docs", doc_id + ".json")
        json.dump({"at": at, "photos": {pid: entries[pid] for pid in keys[i:i + 1200]}}, open(path, "w"))
        writes.append({"op": "set", "collection": "previews", "doc_id": doc_id, "file_path": path})
    missing = [m for pid, m in manifest.items() if pid not in assets]
    job = {"at": at, "made": len(entries), "failed": len(failures) + len(missing),
           "failures": [{"name": f["name"], "why": f["why"]} for f in failures[:20]] + [{"name": m["name"], "why": "Upload not recorded"} for m in missing[:5]]}
    jpath = os.path.join(a.out, "docs", f"job-{run}.json")
    json.dump(job, open(jpath, "w"))
    writes.append({"op": "set", "collection": "jobs", "doc_id": f"run-{run}", "file_path": jpath})
    json.dump(writes, open(os.path.join(a.out, "batch.json"), "w"), indent=1)
    print(f"{len(entries)} previews recorded, {len(missing)} uploads missing, {len(failures)} render failures.")
    print("ArtifactData batch writes:", json.dumps(writes))


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check")
    p = sub.add_parser("plan"); p.add_argument("--db", required=True); p.add_argument("--out", required=True); p.add_argument("--max", type=int, default=2500)
    d = sub.add_parser("docs"); d.add_argument("--out", required=True)
    a = ap.parse_args()
    {"check": cmd_check, "plan": cmd_plan, "docs": cmd_docs}[a.cmd](a)


if __name__ == "__main__":
    main()
