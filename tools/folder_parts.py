#!/usr/bin/env python3
"""Outings stored in parts, as the Workshop keeps them.

One document in the Workshop's database holds at most 256 KiB, and Claude's notes on each photo
take about 1 KB, so a big outing doesn't fit in one. The Workshop (workshop/workshop.js) keeps an
outing's photos across several documents in the "folders" collection:

  folders/<fid>        the outing (outing, chain, date, ...) and some of its photos
  folders/<fid>@2, @3  {"partOf": "<fid>", "photos": {...}}: the rest

and keeps every part under PART_BUDGET. The job's tools read an outing whole (merge_dir joins the
parts of a database dump back into folders/<fid>.json and remembers where each photo lives), and
write through plan_writes, which sends each change to the part that holds the photo and starts or
fills parts so none outgrows the budget.
"""
import json, os, re

PART_BUDGET = 180 * 1024
LAYOUT = "folder_parts.json"


def size(v):
    return len(json.dumps(v, separators=(",", ":"), ensure_ascii=False).encode())


def base_of(doc_id):
    return doc_id.split("@", 1)[0]


def part_no(doc_id):
    m = re.search(r"@(\d+)$", doc_id)
    return int(m.group(1)) if m else 1


def merge_dir(db):
    """Join the parts in DB/folders back into one file per outing; write DB/folder_parts.json."""
    d = os.path.join(db, "folders")
    layout = {}
    if not os.path.isdir(d):
        return layout
    docs = {}
    for f in sorted(os.listdir(d)):
        if f.endswith(".json"):
            docs[f[:-5]] = json.load(open(os.path.join(d, f)))
    merged = {}
    for doc_id in sorted(docs, key=lambda i: (base_of(i), part_no(i))):
        data, fid = docs[doc_id], base_of(doc_id)
        layout.setdefault(fid, {})[doc_id] = {"ids": sorted((data.get("photos") or {}).keys()), "bytes": size(data)}
        out = merged.setdefault(fid, {"photos": {}})
        if doc_id == fid:
            photos = out.pop("photos")
            out.update({k: v for k, v in data.items() if k != "photos"})
            out["photos"] = photos
        out["photos"].update(data.get("photos") or {})
    for doc_id in docs:
        if doc_id != base_of(doc_id):
            os.remove(os.path.join(d, doc_id + ".json"))
    for fid, data in merged.items():
        json.dump(data, open(os.path.join(d, fid + ".json"), "w"))
    json.dump(layout, open(os.path.join(db, LAYOUT), "w"))
    return layout


def load_layout(db):
    """Where each outing's photos live. Without a saved layout (an older dump), each outing is
    taken to be one document of the size its file holds."""
    p = os.path.join(db, LAYOUT)
    if os.path.exists(p):
        return json.load(open(p))
    layout, d = {}, os.path.join(db, "folders")
    for f in (os.listdir(d) if os.path.isdir(d) else []):
        if f.endswith(".json"):
            data = json.load(open(os.path.join(d, f)))
            layout[f[:-5]] = {f[:-5]: {"ids": sorted((data.get("photos") or {}).keys()), "bytes": size(data)}}
    return layout


def plan_writes(fid, parts, patch, full, meta=None, out_dir=".", budget=PART_BUDGET):
    """The writes that apply PATCH ({photo id: fields to merge}) to outing FID.

    parts: {doc id: {"ids": [...], "bytes": n}} for the outing as stored, or None for an outing
    the Workshop hasn't indexed. full: {photo id: its whole record after the patch}, for photos
    that start or move to another part. meta: the outing's own fields, for a new outing.
    Returns batch entries {op, collection, doc_id, file_path, new}, parts that must exist first
    listed first.
    """
    entries, first, after = [], [], []

    def emit(doc_id, op, data, new, early):
        path = os.path.join(os.path.abspath(out_dir), "writes", doc_id + ".json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        json.dump(data, open(path, "w"))
        (first if early else after).append({"op": op, "collection": "folders", "doc_id": doc_id, "file_path": path, "new": new})

    if not parts:
        # a new outing: the outing and as many photos as fit, then further parts
        docs, cur = [], {"id": fid, "photos": {}, "bytes": size(meta or {}) + 64}
        for pid in sorted(patch):
            rec = full.get(pid) or patch[pid]
            b = size(rec) + len(pid) + 8
            if cur["bytes"] + b > budget and cur["photos"]:
                docs.append(cur)
                cur = {"id": "%s@%d" % (fid, len(docs) + 1), "photos": {}, "bytes": 64}
            cur["photos"][pid] = rec
            cur["bytes"] += b
        docs.append(cur)
        for i, dd in enumerate(docs):
            body = dict(meta or {}, photos=dd["photos"]) if i == 0 else {"partOf": fid, "photos": dd["photos"]}
            emit(dd["id"], "set", body, True, i > 0)
        return first + after

    where = {pid: doc_id for doc_id, p in parts.items() for pid in p["ids"]}
    room = {doc_id: p["bytes"] for doc_id, p in parts.items()}
    updates = {doc_id: {} for doc_id in parts}
    moves = {}  # new part id -> {pid: record}
    next_no = max(part_no(i) for i in parts) + 1

    def new_part():
        nonlocal next_no
        doc_id = "%s@%d" % (fid, next_no)
        next_no += 1
        moves[doc_id] = {}
        room[doc_id] = 64
        return doc_id

    def fits(doc_id, b):
        return room[doc_id] + b <= budget

    for pid in sorted(patch):
        grow = size(patch[pid]) + len(pid) + 8
        doc_id = where.get(pid)
        if doc_id and fits(doc_id, grow):
            updates[doc_id][pid] = patch[pid]
            room[doc_id] += grow
            continue
        # a new photo goes, whole, into any part with room; one whose part would outgrow the budget
        # moves, whole, into a part started in this run (written before it leaves its old part, so
        # it is never missing from the database in between)
        rec = full.get(pid) or patch[pid]
        b = size(rec) + len(pid) + 8
        pool = list(moves) if doc_id else sorted(room, key=part_no)
        target = next((d for d in pool if fits(d, b)), None)
        if target is None:
            target = new_part()
        if target in moves:
            moves[target][pid] = rec
        else:
            updates[target][pid] = rec
        room[target] += b
        if doc_id:
            # it leaves its old part (written after the new part exists)
            updates[doc_id][pid] = {"__delete__": True}
    for doc_id, photos in moves.items():
        if photos:
            emit(doc_id, "set", {"partOf": fid, "photos": photos}, True, True)
    for doc_id in sorted(updates, key=part_no):
        if updates[doc_id]:
            emit(doc_id, "update", {"photos": updates[doc_id]}, False, False)
    return first + after
