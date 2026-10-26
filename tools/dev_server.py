#!/usr/bin/env python3
"""Serve the site locally with images straight from Drive, for testing before the public copies exist.

  dev_server.py --site DIR [--port 8080] [--cache DIR]

/img/<file id>?w=<px> returns a rendition of that Drive file at the requested width, fetched
through the read-only service account ($GDRIVE_SA_KEY) and cached on disk; w=0 gives the original.
"""
import argparse, http.server, os, re, sys, threading, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nikon_previews as NP  # noqa: E402

LOCK = threading.Lock()
LINKS = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True)
    ap.add_argument("--port", type=int, default=8080)
    ap.add_argument("--cache", default=os.path.join(os.environ.get("TMPDIR", "/tmp"), "gp-img-cache"))
    a = ap.parse_args()
    os.makedirs(a.cache, exist_ok=True)
    drive = NP.Drive(NP.load_key())

    class H(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kw):
            super().__init__(*args, directory=a.site, **kw)

        def log_message(self, *args):
            pass

        def do_GET(self):
            u = urllib.parse.urlparse(self.path)
            m = re.fullmatch(r"/img/([\w-]{10,})", u.path)
            if not m:
                return super().do_GET()
            fid = m.group(1)
            w = int((urllib.parse.parse_qs(u.query).get("w") or ["800"])[0] or 0)
            path = os.path.join(a.cache, f"{fid}-{w}.jpg")
            if not os.path.exists(path):
                data = self.fetch(fid, w)
                if data is None:
                    self.send_error(404)
                    return
                with open(path, "wb") as f:
                    f.write(data)
            body = open(path, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Cache-Control", "max-age=86400")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def fetch(self, fid, w):
            if w == 0:
                r = drive.get(f"{NP.API}/{fid}", params={"alt": "media", "supportsAllDrives": "true"})
                return r.content if r.status_code == 200 else None
            with LOCK:
                link = LINKS.get(fid)
            if not link:
                m = drive.meta(fid)
                link = (m or {}).get("thumbnailLink")
                if not link:
                    return None
                with LOCK:
                    LINKS[fid] = link
            url = re.sub(r"=s\d+(-[\w-]+)?$", f"=w{w}", link)
            for auth in (True, False):
                r = drive.get(url, auth=auth)
                if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                    return r.content
            return None

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", a.port), H)
    print(f"Serving {a.site} on http://127.0.0.1:{a.port}", flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
