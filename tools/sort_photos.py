#!/usr/bin/env python3
"""Sort new photographs in the publish job, as the Workshop's Sort button does.

The publish job (a Claude session) identifies new Finals itself, so they reach the public site
with their species names without anyone opening the Workshop. This tool does everything but the
looking:

  plan  --db MERGED --library DB --published GALLERY --out DIR [--max N]
        First carries identifications already on the public site into the merged dump (so a
        Workshop copy saved before the job's last run doesn't lose them). Then, for photos still
        waiting, renders a preview (DIR/img/<id>.jpg, 1600 px, for the Workshop) and a smaller
        view (DIR/view/<id>.jpg, for the job to look at), and writes DIR/brief.md: the
        Workshop's own instructions and, for each photo, where it was taken and what's already
        identified around it. The job reads brief.md, looks at each view and appends one JSON
        line per photo to DIR/answers.jsonl.

  apply --db MERGED --library DB --out DIR
        Tidies the answers exactly as the Workshop does, puts them in the merged dump (so this
        run's build has them), and writes the Workshop's updates: DIR/writes/<folder>.json and
        DIR/batch.json, one {"op": "update", "collection": "folders", "doc_id", "file_path"}
        per folder, adding to each photo its identification and its preview (assets.tsv lists
        "<preview path><TAB><asset id>" for the previews the job uploaded). A photo without a
        preview goes to the site only, since the Workshop shows photos by their preview. A
        folder the Workshop has never seen is written whole, so its file also works as a "set".
"""
import argparse, datetime, io, json, os, re, sys
import concurrent.futures as cf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

DECODABLE = re.compile(r"^image/(jpeg|jpg|png|webp|gif)$", re.I)
WAITING = {"new", "thumb", "big", "err"}
GROUPS = {"bird", "mammal", "reptile", "amphibian", "fish", "insect", "spider", "other", "none"}
QUAL_RE = re.compile(r"\s*\(([^()]*)\)\s*$")
UNSURE_RE = re.compile(r"uncertain|probable|possibl|unidentified|unknown|\?", re.I)
NONE_RE = re.compile(r"^(no\b|none\b|not an? (animal|wildlife))", re.I)
VIEW_EDGE = 1000


def read_docs(path):
    out = {}
    if os.path.isdir(path):
        for f in sorted(os.listdir(path)):
            if f.endswith(".json"):
                try:
                    out[f[:-5]] = json.load(open(os.path.join(path, f)))
                except Exception:
                    pass
    return out


def write_doc(path, doc):
    if os.path.islink(path):
        os.unlink(path)
    json.dump(doc, open(path, "w"))


def frame_no(name):
    m = re.search(r"(\d{3,6})(?!.*\d{3,6})", re.sub(r"\.[a-z0-9]+$", "", str(name or ""), flags=re.I))
    return int(m.group(1)) if m else None


def effective(p):
    """The photo's ID as the gallery shows it: the photographer's own, else Claude's."""
    ov, ai = p.get("ov") or {}, p.get("ai") or {}
    if ov.get("common"):
        return ov.get("common", ""), ov.get("scientific", ""), True
    return ai.get("common", ""), ai.get("scientific", ""), False


def waiting(p):
    return (p.get("st") or "new") in WAITING and not p.get("ai") and not (p.get("ov") or {}).get("hidden") \
        and DECODABLE.match(p.get("m") or "image/jpeg")


# ---------- names, exactly as the Workshop tidies them ----------
def split_name(raw):
    s = re.sub(r"\s+", " ", str(raw or "")).strip()
    q = []
    m = re.search(r"\s*\(([^()]*)$", s)  # a qualifier cut off by the length limit
    if m:
        q.append(m.group(1))
        s = s[:m.start()].strip()
    while True:
        m = QUAL_RE.search(s)
        if not m:
            break
        q.insert(0, m.group(1))
        s = s[:m.start()].strip()
    sp = bool(re.search(r"\s+spp?\.?$", s, re.I))
    return re.sub(r"\s+spp?\.?$", "", s, flags=re.I), "; ".join(q), sp


def clean_name(raw):
    base, qual, sp = split_name(raw)
    if not base or NONE_RE.search(base):
        return "", qual
    unsure_one_word = UNSURE_RE.search(qual) and not re.search(r"\s", base)
    return (f"{base} sp." if sp or unsure_one_word else base), qual


def normalise(r, at):
    s = lambda v, n: v.strip()[:n] if isinstance(v, str) else ""
    arr = lambda v: v if isinstance(v, list) else []
    g = s(r.get("group"), 20).lower()
    common, note = clean_name(s(r.get("common"), 80))
    try:
        q = round(float(r.get("quality")))
    except Exception:
        q = 0
    try:
        count = max(0, min(99, round(float(r.get("count")))))
    except Exception:
        count = 0
    return {
        "group": "none" if not common else g if g in GROUPS else "other",
        "common": common, "scientific": s(r.get("scientific"), 80) if common else "", "note": s(note, 80),
        "confidence": r.get("confidence") if r.get("confidence") in ("high", "medium", "low") else "low",
        "count": count,
        "others": [x for x in (s(v, 60) for v in arr(r.get("others"))) if x][:3],
        "sexAge": s(r.get("sex_age"), 40), "behavior": s(r.get("behavior"), 80), "setting": s(r.get("setting"), 80),
        "tags": [x for x in (s(t, 28).lower() for t in arr(r.get("tags"))) if x][:6],
        "quality": q if 1 <= q <= 5 else 0,
        "qualityNote": s(r.get("quality_note"), 180), "caption": s(r.get("caption"), 180),
        "at": at, "by": "publish job",
    }


# ---------- plan ----------
BRIEF = """You are cataloguing a wildlife photographer's edited photos (their "Finals"), taken in Central Florida. Folder names are the photographer's own labels; letters in them are usually people's initials, not places.

For each photo below, look at its image (open the view file) and identify the main wildlife subject as precisely as the image allows, and assess the photograph. Then append one line to {answers}, a JSON object in exactly this shape (with the photo's id first), no other text:
{{"id": string, "group": string, "common": string, "scientific": string, "confidence": string, "count": number, "others": string[], "sex_age": string, "behavior": string, "setting": string, "tags": string[], "quality": number, "quality_note": string, "caption": string}}

Rules:
- group: one of bird, mammal, reptile, amphibian, fish, insect, spider, other, none (none = no animal in the frame).
- common: the species' standard English common name and nothing else. Never put parentheses, notes, age, sex, morph, breed or certainty words in it (those belong in sex_age, caption and confidence). If the species can't be told apart from similar ones, give the most specific group you are sure of in the form "Egret sp." and set confidence to "low". If there is no animal, use group "none" and common "".
- Prefer species that occur in Florida; a species rare or absent there needs clear evidence in the image.
- If the subject is a species already in this gallery (listed at the end), use exactly that common name and scientific name.
- scientific: the binomial for a species; the genus for an "sp." answer; "" when there is no animal.
- confidence: "high", "medium" or "low".
- count: how many individuals of the main species are visible.
- others: common names of other species visible, at most 3, else [].
- sex_age: for example "adult male", "juvenile", or "" when unclear.
- behavior and setting: a short phrase each, for example "perched, preening" and "bare branch against sky".
- tags: 3 to 6 short lowercase tags about behaviour, habitat, light and composition.
- quality: 1 to 5 as a wildlife photograph. 5 = portfolio or competition ready; 4 = strong keeper; 3 = good record shot; 2 = weak (soft focus, missed exposure, cluttered); 1 = unusable.
- quality_note: one sentence on sharpness, exposure, light and composition.
- caption: one plain, factual sentence.
- Neighbouring frames are usually the same individual: keep a frame's ID consistent with its identified neighbours, and with the photos just before it in this list from the same outing, unless the image clearly shows a different animal.

"""


def known_list(folders):
    tally = {}
    for f in folders.values():
        for p in (f.get("photos") or {}).values():
            c, sci, _ = effective(p)
            if not c or c.endswith(" sp.") or (p.get("ov") or {}).get("hidden"):
                continue
            key = sci.lower() or c.lower()
            t = tally.setdefault(key, {"names": {}, "sci": sci, "n": 0})
            t["names"][c] = t["names"].get(c, 0) + 1
            t["n"] += 1
    rows = sorted(tally.values(), key=lambda t: -t["n"])[:250]
    return "\n".join(f"{max(t['names'], key=t['names'].get)}{' — ' + t['sci'] if t['sci'] else ''}" for t in rows)


def cmd_plan(a):
    folders = read_docs(os.path.join(a.db, "folders"))
    gallery = json.load(open(a.published)) if a.published and os.path.exists(a.published) else {}
    pub_photos = {pid: p for f in (gallery.get("folders") or {}).values() for pid, p in (f.get("photos") or {}).items()}
    # 1. identifications already on the public site, for photos the Workshop copy has as waiting
    carried = 0
    for fid, f in folders.items():
        changed = False
        for pid, p in (f.get("photos") or {}).items():
            pp = pub_photos.get(pid)
            if pp and pp.get("ai") and waiting(p):
                p["ai"] = pp["ai"]
                if pp.get("ov") and not p.get("ov"):
                    p["ov"] = pp["ov"]
                p["st"] = "done"
                changed = True
                carried += 1
        if changed:
            write_doc(os.path.join(a.db, "folders", fid + ".json"), f)
    # 2. what's still waiting, newest outings first, in frame order
    pv = {}
    for doc in sorted(read_docs(os.path.join(a.library, "previews")).values(), key=lambda d: str(d.get("at", ""))):
        pv.update(doc.get("photos") or {})
    todo = []
    for fid, f in folders.items():
        for pid, p in (f.get("photos") or {}).items():
            if waiting(p):
                todo.append((f.get("date") or "", fid, frame_no(p.get("n")) or 0, p.get("n") or "", pid))
    todo.sort(key=lambda t: (t[1], t[2], t[3]))  # each folder together, in frame order
    todo.sort(key=lambda t: t[0], reverse=True)  # newest outings first (the sort is stable)
    todo = todo[: a.max]
    os.makedirs(os.path.join(a.out, "img"), exist_ok=True)
    os.makedirs(os.path.join(a.out, "view"), exist_ok=True)
    rendered, failed = [], []
    if todo:
        import nikon_previews as NP
        from PIL import Image
        drive = NP.Drive(NP.load_key())

        def work(t):
            pid = t[4]
            out, info = NP.render(drive, pid)
            if not out:
                return pid, None, info
            data, w, h = out
            open(os.path.join(a.out, "img", pid + ".jpg"), "wb").write(data)
            img = Image.open(io.BytesIO(data))
            img.thumbnail((VIEW_EDGE, VIEW_EDGE))
            img.save(os.path.join(a.out, "view", pid + ".jpg"), "JPEG", quality=85)
            return pid, (w, h), None

        with cf.ThreadPoolExecutor(6) as ex:
            for pid, size, err in ex.map(work, todo):
                if size:
                    rendered.append((pid, size))
                else:
                    failed.append((pid, err))
    ok = {pid for pid, _ in rendered}
    sizes = dict(rendered)
    # 3. the brief
    answers = os.path.join(a.out, "answers.jsonl")
    lines = [BRIEF.format(answers=answers)]
    plan = []
    n = 0
    for date, fid, fr, name, pid in todo:
        if pid not in ok:
            continue
        f = folders[fid]
        photos = f.get("photos") or {}
        where = ", ".join(x for x in [f'outing folder "{f.get("outing", "")}"',
                                      f'date folder "{f["dateLabel"]}"' if f.get("dateLabel") else (f"dated {date}" if date else ""),
                                      f"file {name}"] if x)
        near, tally = [], {}
        for qid, q in photos.items():
            c, sci, mine = effective(q)
            if qid == pid or not c:
                continue
            tally[c] = tally.get(c, 0) + 1
            qf = frame_no(q.get("n"))
            if fr and qf is not None and abs(qf - fr) <= 3:
                near.append((qf, f"- {q.get('n')}: {c}{f' ({sci})' if sci else ''}{' [confirmed by the photographer]' if mine else ''}"))
        near.sort()
        n += 1
        lines.append(f"## {n}. {pid}\nView: {os.path.join(os.path.abspath(a.out), 'view', pid + '.jpg')}\nFrom: {where}")
        if near:
            lines.append("Neighbouring frames already identified:\n" + "\n".join(x for _, x in near[:8]))
        if tally:
            lines.append("Species identified elsewhere on this outing: " + ", ".join(f"{k} ×{v}" for k, v in sorted(tally.items(), key=lambda kv: -kv[1])[:15]) + ".")
        lines.append("")
        cloud = pv.get(pid) if (photos[pid].get("st") == "big" and pv.get(pid, {}).get("a")) else None
        plan.append({"id": pid, "fid": fid, "img": os.path.join(os.path.abspath(a.out), "img", pid + ".jpg"),
                     "w": sizes[pid][0], "h": sizes[pid][1], "cloud": cloud})
    kl = known_list(folders)
    if kl:
        lines.append("Species already in this gallery (common name — scientific name):\n" + kl)
    open(os.path.join(a.out, "brief.md"), "w").write("\n".join(lines) + "\n")
    json.dump(plan, open(os.path.join(a.out, "plan.json"), "w"), indent=1)
    uploads = [p["img"] for p in plan if not p["cloud"]]
    json.dump(uploads, open(os.path.join(a.out, "uploads.json"), "w"), indent=1)
    waiting_left = sum(1 for f in folders.values() for p in (f.get("photos") or {}).values() if waiting(p)) - len(plan)
    print(json.dumps({"carried": carried, "toSort": len(plan), "toUpload": len(uploads), "renderFailed": len(failed), "stillWaiting": max(0, waiting_left)}))


# ---------- apply ----------
def cmd_apply(a):
    plan = {p["id"]: p for p in json.load(open(os.path.join(a.out, "plan.json")))}
    assets = {}
    tsv = os.path.join(a.out, "assets.tsv")
    for line in (open(tsv).read().splitlines() if os.path.exists(tsv) else []):
        parts = line.strip().split()
        if len(parts) >= 2:
            pid = os.path.splitext(os.path.basename(parts[0]))[0]
            aid = parts[1].rsplit("/", 1)[-1]
            if re.fullmatch(r"[0-9a-f]{32}", aid):
                assets[pid] = aid
    answers, bad = {}, 0
    path = os.path.join(a.out, "answers.jsonl")
    for line in (open(path).read().splitlines() if os.path.exists(path) else []):
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except Exception:
            bad += 1
            continue
        if isinstance(r, dict) and r.get("id") in plan:
            answers[r["id"]] = r
        else:
            bad += 1
    at = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    merged = read_docs(os.path.join(a.db, "folders"))
    library = read_docs(os.path.join(a.library, "folders"))
    patches = {}
    for pid, r in answers.items():
        p = plan[pid]
        patch = {"st": "done", "ai": normalise(r, at), "err": None}
        if p.get("cloud"):
            c = p["cloud"]
            patch.update({"a": c["a"], "w": c.get("w") or p["w"], "h": c.get("h") or p["h"]})
        elif pid in assets:
            patch.update({"a": assets[pid], "w": p["w"], "h": p["h"]})
        patches.setdefault(p["fid"], {})[pid] = patch
    os.makedirs(os.path.join(a.out, "writes"), exist_ok=True)
    batch, ids, site_only = [], 0, 0
    for fid, ps in patches.items():
        f = merged.get(fid)
        if not f:
            continue
        for pid, patch in ps.items():
            f["photos"][pid].update(patch)
        write_doc(os.path.join(a.db, "folders", fid + ".json"), f)
        site_only += sum(1 for patch in ps.values() if not patch.get("a"))
        ps = {pid: patch for pid, patch in ps.items() if patch.get("a")}
        if not ps:
            continue
        lib = library.get(fid)
        if lib is None:
            # a folder the Workshop hasn't indexed yet: send it whole, so it can be created
            doc = {k: f[k] for k in ("outing", "outingId", "chain", "dateLabel", "date") if k in f}
            doc["photos"] = {pid: dict(f["photos"][pid]) for pid in ps}
        else:
            doc = {"photos": {}}
            for pid, patch in ps.items():
                # a photo the Workshop hasn't indexed yet goes with its file details, as its own scan would
                base = {} if pid in (lib.get("photos") or {}) else {k: v for k, v in f["photos"][pid].items() if k in ("n", "t", "s", "m", "sub")}
                doc["photos"][pid] = dict(base, **patch)
        wp = os.path.join(os.path.abspath(a.out), "writes", fid + ".json")
        json.dump(doc, open(wp, "w"))
        batch.append({"op": "update", "collection": "folders", "doc_id": fid, "file_path": wp, "new": lib is None})
        ids += len(ps)
    json.dump(batch, open(os.path.join(a.out, "batch.json"), "w"), indent=1)
    missing = [pid for pid in plan if pid not in answers]
    print(json.dumps({"sorted": len(answers), "forWorkshop": ids, "siteOnly": site_only, "folders": len(batch),
                      "newFolders": sum(1 for b in batch if b["new"]), "noAnswer": len(missing), "unreadable": bad}))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--db", required=True)
    p.add_argument("--library", required=True)
    p.add_argument("--published")
    p.add_argument("--out", required=True)
    p.add_argument("--max", type=int, default=80)
    q = sub.add_parser("apply")
    q.add_argument("--db", required=True)
    q.add_argument("--library", required=True)
    q.add_argument("--out", required=True)
    a = ap.parse_args()
    {"plan": cmd_plan, "apply": cmd_apply}[a.cmd](a)


if __name__ == "__main__":
    main()
