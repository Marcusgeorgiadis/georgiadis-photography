#!/usr/bin/env python3
"""Find, trim and credit a recording of each species' call for the gallery.

For every species in data/gallery.json that has a binomial (and isn't domestic or
not wildlife), this looks up community-verified, openly licensed recordings on
iNaturalist, downloads a few candidates, keeps the one where the calls stand out
most clearly from the background, and writes:

  audio/calls/<slug>.mp3    the strongest ~10 seconds, faded and loudness-matched
  audio/calls/<slug>.webp   a sonogram of that clip (white with alpha, tinted in CSS)
  data/calls.json           file paths, duration and the recording's credit

  fetch_calls.py --repo DIR [--refresh] [--only "Genus species" ...]

Species already in data/calls.json are skipped unless --refresh. Species with no
usable recording are remembered as {"none": true} so they aren't retried every run
(use --refresh to try again). Needs ffmpeg.
"""
import argparse, io, json, os, re, subprocess, sys, tempfile, time

import numpy as np
import requests
from PIL import Image

API = "https://api.inaturalist.org/v1/observations"
TAXA = "https://api.inaturalist.org/v1/taxa"
UA = "GeorgiadisPhotography/1.0 (https://marcusgeorgiadis.github.io/georgiadis-photography/)"
LICENSES = "cc0,cc-by,cc-by-sa,cc-by-nc,cc-by-nc-sa"
LICENSE_NAMES = {
    "cc0": ("CC0", "https://creativecommons.org/publicdomain/zero/1.0/"),
    "cc-by": ("CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/"),
    "cc-by-sa": ("CC BY-SA 4.0", "https://creativecommons.org/licenses/by-sa/4.0/"),
    "cc-by-nc": ("CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/"),
    "cc-by-nc-sa": ("CC BY-NC-SA 4.0", "https://creativecommons.org/licenses/by-nc-sa/4.0/"),
}
AUDIO_TYPES = ("audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/aac", "audio/x-wav", "audio/wav", "audio/wave", "audio/ogg", "audio/flac", "audio/x-flac")
SR = 22050          # Hz; keeps everything up to 11 kHz, where nearly all calls live
CLIP = 10.0         # seconds kept from the best recording
FRAME = 0.05        # seconds per energy frame
LOW_SPECIES_GROUPS = ("reptile", "mammal", "amphibian")  # keep their low rumbles (no high-pass)

S = requests.Session()
S.headers["User-Agent"] = UA


def region(place):
    """State or country only: the credit line never needs the recordist's street."""
    parts = [re.sub(r"\d+", "", p).strip() for p in str(place or "").split(",")]
    return ", ".join([p for p in parts if p][-2:])


def slug(v):
    return re.sub(r"[^a-z0-9]+", "-", v.lower()).strip("-")


def species_from_gallery(repo):
    """Binomials in the published gallery with the name most used for each."""
    g = json.load(open(os.path.join(repo, "data", "gallery.json")))
    tax = g.get("taxonomy") or {}
    syn = tax.get("synonyms") or {}
    skip = set(tax.get("notWildlife") or []) | set(tax.get("domestic") or [])
    names, counts, groups = {}, {}, {}
    for f in (g.get("folders") or {}).values():
        for p in (f.get("photos") or {}).values():
            ov, ai = p.get("ov") or {}, p.get("ai") or {}
            mine = bool(ov.get("common"))
            grp = (ov.get("group") if mine else ai.get("group")) or ""
            sci = ((ov.get("scientific") if mine else ai.get("scientific")) or "").strip()
            m = re.match(r"^([A-Z][a-z]+) ([a-z][a-z-]+)", sci)
            if grp in ("", "none") or not m or m.group(2) in ("sp", "spp"):
                continue
            b = syn.get(m.group(0), m.group(0))
            if b in skip:
                continue
            counts[b] = counts.get(b, 0) + 1
            names.setdefault(b, {})
            nm = (ov.get("common") if mine else ai.get("common")) or ""
            names[b][nm] = names[b].get(nm, 0) + 1
            groups[b] = grp
    return [{"bin": b, "name": max(names[b], key=names[b].get), "group": groups[b], "photos": n} for b, n in sorted(counts.items(), key=lambda kv: -kv[1])]


def api(params, tries=4):
    for k in range(tries):
        r = S.get(API, params=params, timeout=40)
        if r.status_code == 429 or r.status_code >= 500:
            time.sleep(5 * (k + 1))
            continue
        r.raise_for_status()
        time.sleep(1.1)  # iNaturalist asks for about one request a second
        return r.json()
    raise RuntimeError(f"iNaturalist kept refusing ({r.status_code})")


def current_name(binomial):
    """iNaturalist's accepted name for a binomial it files under another (e.g. Bubulcus ibis is Ardea ibis there)."""
    r = S.get(TAXA, params={"q": binomial, "rank": "species", "per_page": 5}, timeout=40)
    time.sleep(1.1)
    if r.status_code != 200:
        return None
    for t in r.json().get("results", []):
        names = [t.get("name", "")] + [n.get("name", "") for n in (t.get("names") or [])]
        if t.get("name") and ((t.get("matched_term") or "").lower().startswith(binomial.lower()) or binomial in names):
            return t["name"]
    return None


def candidates(binomial, _alias=None):
    """Recordings for a species, best-voted first, preferring the United States."""
    out, seen = [], set()
    name = _alias or binomial
    for place in ("1", None):  # 1 = United States
        params = {"taxon_name": name, "sounds": "true", "quality_grade": "research", "sound_license": LICENSES, "order_by": "votes", "per_page": 30}
        if place:
            params["place_id"] = place
        for o in api(params).get("results", []):
            taxon = (o.get("taxon") or {}).get("name", "")
            if taxon.split(" ")[:2] != name.split(" ")[:2]:
                continue  # a subspecies is fine, a different species isn't
            for s in o.get("sounds") or []:
                url, lic = s.get("file_url"), (s.get("license_code") or "").lower()
                if not url or lic not in LICENSE_NAMES or s.get("id") in seen:
                    continue
                if (s.get("file_content_type") or "").split(";")[0] not in AUDIO_TYPES:
                    continue
                seen.add(s.get("id"))
                user = o.get("user") or {}
                out.append({"url": url, "license": lic, "obs": o.get("id"), "by": user.get("name") or user.get("login") or "an iNaturalist observer",
                            "place": o.get("place_guess") or "", "date": o.get("observed_on") or "", "faves": o.get("faves_count") or 0})
        if len(out) >= 8:
            break
    if not out and not _alias:
        alias = current_name(binomial)
        if alias and alias != binomial:
            return candidates(binomial, alias)
    return out


def decode(path, band=None):
    """Mono float samples at SR, optionally band-limited to where the species calls."""
    af = ["-af", f"highpass=f={band[0]},lowpass=f={band[1]}"] if band else []
    p = subprocess.run(["ffmpeg", "-v", "error", "-i", path] + af + ["-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, timeout=120)
    if p.returncode != 0:
        return None
    return np.frombuffer(p.stdout, dtype=np.float32)


def assess(x):
    """How clearly calls stand out: loud frames versus the noise floor, in dB; plus the best window."""
    n = int(FRAME * SR)
    if x is None or len(x) < SR * 1.5:
        return None
    frames = x[: len(x) // n * n].reshape(-1, n)
    e = np.sqrt((frames.astype(np.float64) ** 2).mean(axis=1)) + 1e-9
    db = 20 * np.log10(e)
    floor, peak = np.percentile(db, 20), np.percentile(db, 97)
    if peak < -55:  # near silence
        return None
    w = max(1, min(len(db), int(CLIP / FRAME)))
    act = np.clip(db - floor - 6, 0, None)
    sums = np.convolve(act, np.ones(w), "valid")
    start = int(np.argmax(sums)) * FRAME
    clipped = (np.abs(x) > 0.99).mean()
    return {"score": float(peak - floor) - 40 * float(clipped), "start": start, "dur": min(CLIP, len(x) / SR)}


def render(src, start, dur, low, out_mp3, out_webp):
    hp = "highpass=f=60" if low else "highpass=f=200"
    fade_out = max(0.1, dur - 0.7)
    af = f"{hp},afade=t=in:st=0:d=0.25,afade=t=out:st={fade_out:.2f}:d=0.7,loudnorm=I=-18:TP=-1.5:LRA=11"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", src, "-af", af, "-ac", "1", "-ar", "32000",
                    "-c:a", "libmp3lame", "-b:a", "80k", out_mp3], check=True, timeout=120)
    sonogram(out_mp3, low, out_webp)


def sonogram(mp3, low, out_webp):
    """Log-scaled spectrum of the clip, turned into white-on-transparent so CSS can tint it."""
    top = 3000 if low else 9000  # where the calls are: rumbles low, song up to ~9 kHz
    png = subprocess.run(["ffmpeg", "-v", "error", "-i", mp3, "-ar", str(SR), "-lavfi",
                          f"showspectrumpic=s=900x240:legend=0:color=intensity:scale=log:fscale=lin:gain=1.4:drange=80:start={60 if low else 300}:stop={top}",
                          "-f", "image2pipe", "-vcodec", "png", "-"], capture_output=True, check=True, timeout=120).stdout
    img = Image.open(io.BytesIO(png)).convert("L")
    a = np.asarray(img, dtype=np.float32)[: -4]  # drop the band at the very bottom
    # quiet background to nothing, the calls to near-solid: they have to read at 60 px tall
    floor = np.percentile(a, 72)
    a = np.clip((a - floor) / max(1.0, np.percentile(a, 99.3) - floor), 0, 1) ** 0.62
    rgba = np.zeros(a.shape + (4,), dtype=np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (a * 255).astype(np.uint8)
    Image.fromarray(rgba, "RGBA").save(out_webp, "WEBP", lossless=False, quality=80, method=6)


def peaks(path, n=64):
    x = decode(path)
    if x is None or not len(x):
        return []
    k = max(1, len(x) // n)
    v = np.abs(x[: k * n]).reshape(n, k).max(axis=1)
    v = v / max(1e-6, v.max())
    return [int(round(float(t) * 99)) for t in v]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--refresh", action="store_true")
    ap.add_argument("--retry-none", action="store_true", help="try again for species remembered as having no recording")
    ap.add_argument("--sonograms", action="store_true", help="only redraw the sonograms of the clips already saved")
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--limit", type=int, default=0, help="stop after this many new species (0 = all)")
    a = ap.parse_args()
    path = os.path.join(a.repo, "data", "calls.json")
    calls = json.load(open(path)) if os.path.exists(path) else {}
    outdir = os.path.join(a.repo, "audio", "calls")
    os.makedirs(outdir, exist_ok=True)
    species = species_from_gallery(a.repo)
    if a.sonograms:
        groups = {sp["bin"]: sp["group"] for sp in species}
        for b, c in calls.items():
            if c.get("file") and c.get("sono"):
                sonogram(os.path.join(a.repo, c["file"]), groups.get(b) in LOW_SPECIES_GROUPS, os.path.join(a.repo, c["sono"]))
        print(f"Redrew {sum(1 for c in calls.values() if c.get('sono'))} sonograms.")
        return
    if a.only:
        species = [s for s in species if s["bin"] in a.only]
    done = 0
    for sp in species:
        b = sp["bin"]
        if b in calls and not a.refresh and not (a.retry_none and calls[b].get("none")):
            continue
        if a.limit and done >= a.limit:
            break
        done += 1
        try:
            cands = candidates(b)
        except Exception as e:
            print(f"{b}: lookup failed ({e})", flush=True)
            continue
        best = None
        with tempfile.TemporaryDirectory() as tmp:
            low = sp["group"] in LOW_SPECIES_GROUPS
            for i, c in enumerate(cands[:8]):
                try:
                    r = S.get(c["url"], timeout=90)
                    if r.status_code != 200 or len(r.content) > 40_000_000:
                        continue
                    f = os.path.join(tmp, f"c{i}")
                    open(f, "wb").write(r.content)
                    # judge clarity where the calls are, so wind and traffic rumble don't count against a recording
                    q = assess(decode(f, (60, 3000) if low else (900, 10000)))
                    if q and (best is None or q["score"] + 0.3 * min(c["faves"], 10) > best[1]["score"] + 0.3 * min(best[0]["faves"], 10)):
                        best = (c, q, f)
                except Exception:
                    continue
            if not best or best[1]["score"] < 12:
                calls[b] = {"none": True, "checked": time.strftime("%Y-%m-%d")}
                print(f"{b} ({sp['name']}): no clear recording among {len(cands)}", flush=True)
            else:
                c, q, f = best
                name = slug(sp["name"] or b)
                mp3, webp = os.path.join(outdir, name + ".mp3"), os.path.join(outdir, name + ".webp")
                render(f, q["start"], q["dur"], sp["group"] in LOW_SPECIES_GROUPS, mp3, webp)
                lic, lic_url = LICENSE_NAMES[c["license"]]
                calls[b] = {
                    "name": sp["name"], "file": f"audio/calls/{name}.mp3", "sono": f"audio/calls/{name}.webp",
                    "dur": round(q["dur"], 1), "peaks": peaks(mp3),
                    "by": c["by"], "license": lic, "licenseUrl": lic_url,
                    "source": f"https://www.inaturalist.org/observations/{c['obs']}", "place": region(c["place"]), "date": c["date"],
                    "edited": "Trimmed, filtered and loudness-matched",
                }
                print(f"{b} ({sp['name']}): {c['by']} · {lic} · clarity {q['score']:.0f} dB", flush=True)
        json.dump(calls, open(path, "w"), indent=1, ensure_ascii=False, sort_keys=True)
    have = sum(1 for v in calls.values() if not v.get("none"))
    print(f"Done: {have} species with calls, {sum(1 for v in calls.values() if v.get('none'))} without.")


if __name__ == "__main__":
    main()
