#!/usr/bin/env python3
"""Depth maps for the photographs, so the site can float each subject in front of its background.

For every public photograph in data/gallery.json this estimates relative depth with Depth Anything
V2 Small (Apache-2.0, run on the CPU with onnxruntime) and writes a small greyscale map, nearer is
lighter, to depth/<photo id>.webp, plus depth/index.json listing the photographs that have one.
Maps of photographs that are no longer public are removed.

  depth_maps.py --repo DIR [--limit N] [--budget SECONDS] [--all] [--model FILE]

Only photographs without a map are processed unless --all is given. The model (about 100 MB) is
downloaded once into $GP_MODEL_CACHE (default ~/.cache/georgiadis). Images come from the public
copies on Google Drive.
"""
import argparse, concurrent.futures, io, json, os, sys, time, urllib.request

MODEL_URL = "https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx"
IMAGE_URL = "https://lh3.googleusercontent.com/d/{id}=w{w}"
SIDE = 518          # the model's working size
OUT = 192           # long side of the stored map
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
UA = "GeorgiadisPhotographyBuild/1.0"


def model_path(given):
    if given:
        return given
    cache = os.environ.get("GP_MODEL_CACHE") or os.path.join(os.path.expanduser("~"), ".cache", "georgiadis")
    os.makedirs(cache, exist_ok=True)
    path = os.path.join(cache, "depth-anything-v2-small.onnx")
    if not os.path.exists(path) or os.path.getsize(path) < 50e6:
        tmp = path + ".part"
        req = urllib.request.Request(MODEL_URL, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=600) as r, open(tmp, "wb") as f:
            while True:
                b = r.read(1 << 20)
                if not b:
                    break
                f.write(b)
        os.replace(tmp, path)
    return path


def fetch(pub):
    from PIL import Image
    req = urllib.request.Request(IMAGE_URL.format(id=pub, w=640), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGB")
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None


def prepare(img):
    """Resize as the model's preprocessor does: keep the aspect ratio, the scale nearest 1 wins,
    both sides a multiple of 14; then normalise."""
    import numpy as np
    from PIL import Image
    w, h = img.size
    sw, sh = SIDE / w, SIDE / h
    s = sw if abs(1 - sw) < abs(1 - sh) else sh
    nw, nh = max(14, round(w * s / 14) * 14), max(14, round(h * s / 14) * 14)
    a = np.asarray(img.resize((nw, nh), Image.BICUBIC), dtype=np.float32) / 255.0
    a = (a - np.array(MEAN, dtype=np.float32)) / np.array(STD, dtype=np.float32)
    return a.transpose(2, 0, 1)[None]


def to_map(depth, size):
    """Relative depth to an 8-bit map, nearer lighter, stretched between the 2nd and 98th percentiles."""
    import numpy as np
    from PIL import Image, ImageFilter
    d = depth.astype(np.float32)
    lo, hi = np.percentile(d, 2), np.percentile(d, 98)
    d = np.clip((d - lo) / max(1e-6, hi - lo), 0, 1)
    im = Image.fromarray((d * 255).astype(np.uint8), "L")
    w, h = size
    k = OUT / max(w, h)
    im = im.resize((max(8, round(w * k)), max(8, round(h * k))), Image.LANCZOS)
    # a touch of smoothing: the map moves pixels, and hard edges tear
    return im.filter(ImageFilter.GaussianBlur(0.8))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--limit", type=int, default=0, help="at most this many new maps (0: no limit)")
    ap.add_argument("--budget", type=float, default=0, help="stop starting new maps after this many seconds (0: no limit); the rest wait for the next run")
    ap.add_argument("--all", action="store_true", help="redo every map")
    ap.add_argument("--model")
    a = ap.parse_args()
    try:
        import numpy  # noqa: F401
        import onnxruntime as ort
        from PIL import Image  # noqa: F401
    except ImportError as e:
        print(json.dumps({"skipped": f"missing {e.name}"}))
        return
    repo = a.repo
    data = json.load(open(os.path.join(repo, "data", "gallery.json")))
    pub = data.get("publicIds") or {}
    hidden = set((data.get("site") or {}).get("hidden") or [])
    ids = [pid for f in (data.get("folders") or {}).values() for pid in (f.get("photos") or {}) if pid in pub and pid not in hidden]
    out_dir = os.path.join(repo, "depth")
    os.makedirs(out_dir, exist_ok=True)
    have = {n[:-5] for n in os.listdir(out_dir) if n.endswith(".webp")}
    keep = set(ids)
    removed = 0
    for pid in have - keep:
        os.remove(os.path.join(out_dir, pid + ".webp"))
        removed += 1
    todo = ids if a.all else [pid for pid in ids if pid not in have]
    if a.limit:
        todo = todo[: a.limit]
    written, failed = 0, []
    if todo:
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = max(1, (os.cpu_count() or 2))
        sess = ort.InferenceSession(model_path(a.model), opts, providers=["CPUExecutionProvider"])
        name = sess.get_inputs()[0].name
        t0 = time.time()
        with concurrent.futures.ThreadPoolExecutor(6) as pool:
            for i in range(0, len(todo), 12):
                if a.budget and time.time() - t0 > a.budget:
                    break
                batch = todo[i:i + 12]
                for pid, img in zip(batch, pool.map(lambda p: fetch(pub[p]), batch)):
                    if img is None:
                        failed.append(pid)
                        continue
                    depth = sess.run(None, {name: prepare(img)})[0][0]
                    to_map(depth, img.size).save(os.path.join(out_dir, pid + ".webp"), "WEBP", quality=82, method=6)
                    written += 1
                    if written % 50 == 0:
                        print(f"{written}/{len(todo)} in {time.time() - t0:.0f} s", file=sys.stderr)
    done = sorted(n[:-5] for n in os.listdir(out_dir) if n.endswith(".webp"))
    index = {"v": 1, "model": "Depth Anything V2 Small", "ids": done}
    path = os.path.join(out_dir, "index.json")
    old = None
    if os.path.exists(path):
        try:
            old = json.load(open(path))
        except Exception:
            old = None
    if old != index:
        json.dump(index, open(path, "w"), separators=(",", ":"))
    print(json.dumps({"written": written, "removed": removed, "failed": len(failed), "waiting": len(todo) - written - len(failed), "total": len(done)}))


if __name__ == "__main__":
    main()
