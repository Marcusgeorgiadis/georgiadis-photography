#!/usr/bin/env python3
"""The Workshop's library, as the publish job reads it.

The Workshop (workshop/workshop.js) saves a copy of its whole database to Google Drive whenever
anything in it changes: Nikon/Workshop library/workshop-library.json.gz, gzipped JSON of the form
{"v": 1, "at": ISO time, "collections": {name: {doc id: doc data}}}. This reads the newest copy
with the service-account key (as build_site.py reads the Public Gallery's manifest) and unpacks
it into the dump the other tools read: DIR/<collection>/<doc id>.json, one document's data each.

  fetch --out DIR [--published FILE] [--file COPY]

--published adds the camera data of the photographs already on the public site (from the site's
data/gallery.json) as the oldest enrich document, so photos the job enriched since the Workshop
last saved its copy keep their camera data and aren't enriched again.

--file unpacks a local copy instead of fetching one from Drive.

Prints one line of JSON: when the copy was saved, how old it is and what it holds.
"""
import argparse, datetime, gzip, json, os, re, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

NIKON_ID = "1lEhOfHPIO3-Kf4gl6-rhz9d-IwHL14rY"
FOLDER = "Workshop library"
NAME = "workshop-library.json.gz"
SAFE_ID = re.compile(r"^[A-Za-z0-9_.-]{1,200}$")


def newest_copy(drive, api):
    params = {"supportsAllDrives": "true", "includeItemsFromAllDrives": "true"}
    q = f"'{NIKON_ID}' in parents and name = '{FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
    r = drive.get(api, params=dict(params, q=q, fields="files(id)"))
    r.raise_for_status()
    folders = r.json().get("files", [])
    if not folders:
        sys.exit(f"No '{FOLDER}' folder in the Nikon folder yet: open the Workshop once and it saves its library there.")
    q = f"'{folders[0]['id']}' in parents and name = '{NAME}' and trashed = false"
    r = drive.get(api, params=dict(params, q=q, orderBy="modifiedTime desc", pageSize="1", fields="files(id,modifiedTime,size)"))
    r.raise_for_status()
    files = r.json().get("files", [])
    if not files:
        sys.exit("The Workshop hasn't saved its library to Drive yet: open the Workshop once.")
    f = files[0]
    r = drive.get(f"{api}/{f['id']}", params={"alt": "media", "supportsAllDrives": "true"})
    r.raise_for_status()
    return f, r.content


def cmd_fetch(a):
    if a.file:
        meta, blob = {}, open(a.file, "rb").read()
    else:
        import nikon_previews as NP
        meta, blob = newest_copy(NP.Drive(NP.load_key()), NP.API)
    try:
        lib = json.loads(gzip.decompress(blob))
    except Exception as e:
        sys.exit(f"The saved library couldn't be read ({e}).")
    cols = lib.get("collections") if isinstance(lib, dict) else None
    if lib.get("v") != 1 or not isinstance(cols, dict) or not isinstance(cols.get("folders"), dict) or not cols["folders"]:
        sys.exit("The saved library is incomplete (no folders); not using it.")
    if os.path.isdir(a.out):
        shutil.rmtree(a.out)
    counts = {}
    for name, docs in cols.items():
        if not SAFE_ID.match(name) or not isinstance(docs, dict):
            continue
        d = os.path.join(a.out, name)
        os.makedirs(d, exist_ok=True)
        n = 0
        for doc_id, data in docs.items():
            if SAFE_ID.match(str(doc_id)) and isinstance(data, dict):
                with open(os.path.join(d, f"{doc_id}.json"), "w") as fh:
                    json.dump(data, fh)
                n += 1
        counts[name] = n
    published = 0
    if a.published and os.path.exists(a.published):
        enrich = (json.load(open(a.published)).get("enrich") or {})
        if enrich:
            os.makedirs(os.path.join(a.out, "enrich"), exist_ok=True)
            # "at" sorts first, so every real enrich document overrides it
            with open(os.path.join(a.out, "enrich", "_published.json"), "w") as fh:
                json.dump({"at": "", "photos": enrich}, fh)
            published = len(enrich)
    at = lib.get("at") or meta.get("modifiedTime")
    age = None
    try:
        age = round((datetime.datetime.now(datetime.timezone.utc) - datetime.datetime.fromisoformat(at.replace("Z", "+00:00"))).total_seconds() / 3600, 1)
    except Exception:
        pass
    print(json.dumps({"at": at, "ageHours": age, "bytes": len(blob), "docs": counts, "publishedEnrich": published}))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--out", required=True)
    f.add_argument("--published")
    f.add_argument("--file")
    a = ap.parse_args()
    {"fetch": cmd_fetch}[a.cmd](a)


if __name__ == "__main__":
    main()
