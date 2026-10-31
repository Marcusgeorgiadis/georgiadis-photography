#!/usr/bin/env python3
"""Database writes for the Workshop, ready to send.

nikon_previews.py (docs) and nikon_enrich.py write their new documents to files and list them as
{"op", "collection", "doc_id", "file_path"}. The database tool takes each document inline, at
most 50 writes a call, so this prints the writes grouped for it: one line per call, a JSON list
of {"op", "path", "data"} with at most 50 writes and about --max-bytes of data.

  db_ops.py BATCH.json [--max-bytes 60000]
"""
import argparse, json, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("batch")
    ap.add_argument("--max-bytes", type=int, default=60000)
    a = ap.parse_args()
    if not os.path.exists(a.batch):
        return
    calls, cur, size = [], [], 0
    for w in json.load(open(a.batch)):
        data = json.load(open(w["file_path"])) if w.get("file_path") else w.get("data") or {}
        op = {"op": w.get("op", "set"), "path": f"{w['collection']}/{w['doc_id']}", "data": data}
        n = len(json.dumps(data, separators=(",", ":")))
        if cur and (len(cur) >= 50 or size + n > a.max_bytes):
            calls.append(cur)
            cur, size = [], 0
        cur.append(op)
        size += n
    if cur:
        calls.append(cur)
    for c in calls:
        print(json.dumps(c, separators=(",", ":")))
    print(f"{sum(len(c) for c in calls)} writes in {len(calls)} calls", file=sys.stderr)


if __name__ == "__main__":
    main()
