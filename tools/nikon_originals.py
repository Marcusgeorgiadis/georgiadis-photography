"""Nikon Originals: a tiny MCP connector that streams full-resolution Finals
from Google Drive to the Nikon Wildlife Gallery, a few MB per call.

claude.ai's own Drive connector stops at ~6 MB per file. This server reads
originals with a read-only service account (it only sees folders shared with
it) and returns byte ranges, which the gallery stitches back together.

Standard library only. Env: GDRIVE_SA_KEY (service account JSON or base64),
MCP_SECRET (the URL path segment that admits callers), PORT.
"""
import base64, json, os, re, threading, time, urllib.error, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SCOPE = "https://www.googleapis.com/auth/drive.readonly"
API = "https://www.googleapis.com/drive/v3/files/"
CHUNK = 4 * 1024 * 1024
SECRET = os.environ.get("MCP_SECRET", "")
ID_RE = re.compile(r"^[A-Za-z0-9_-]{10,200}$")

TOOLS = [{
    "name": "get_photo_chunk",
    "title": "Get part of an original photo",
    "description": "Returns up to 4 MB of a Nikon Final's original file from Google Drive, base64-encoded, starting at `offset`. Call again with the next offset until offset + length reaches size.",
    "inputSchema": {"type": "object", "properties": {
        "file_id": {"type": "string", "description": "Google Drive file id"},
        "offset": {"type": "integer", "minimum": 0, "description": "First byte to return (default 0)"},
        "length": {"type": "integer", "minimum": 1, "maximum": CHUNK, "description": "Bytes to return (default and maximum 4 MB)"}},
        "required": ["file_id"]},
    "outputSchema": {"type": "object", "properties": {
        "file_id": {"type": "string"}, "name": {"type": "string"}, "mime_type": {"type": "string"},
        "size": {"type": "integer"}, "offset": {"type": "integer"}, "length": {"type": "integer"},
        "data": {"type": "string", "description": "base64 bytes"}},
        "required": ["file_id", "size", "offset", "length", "data"]},
    "annotations": {"readOnlyHint": True, "openWorldHint": False},
}]


def load_key():
    raw = os.environ.get("GDRIVE_SA_KEY", "").strip()
    if os.path.isfile(raw):
        raw = open(raw).read()
    if not raw.lstrip().startswith("{"):
        raw = base64.b64decode(raw + "=" * (-len(raw) % 4)).decode()
    key = json.loads(raw, strict=False)
    key["private_key"] = key["private_key"].replace("\\n", "\n")
    return key


class Token:
    def __init__(self):
        self.key, self.tok, self.exp, self.lock = load_key(), None, 0, threading.Lock()

    def get(self):
        with self.lock:
            if self.tok and time.time() < self.exp - 120:
                return self.tok
            from cryptography.hazmat.primitives import hashes, serialization
            from cryptography.hazmat.primitives.asymmetric import padding
            b64u = lambda b: base64.urlsafe_b64encode(b).rstrip(b"=").decode()
            now, aud = int(time.time()), self.key.get("token_uri") or "https://oauth2.googleapis.com/token"
            unsigned = b64u(json.dumps({"alg": "RS256", "typ": "JWT"}).encode()) + "." + b64u(json.dumps(
                {"iss": self.key["client_email"], "scope": SCOPE, "aud": aud, "iat": now, "exp": now + 3600}).encode())
            pk = serialization.load_pem_private_key(self.key["private_key"].encode(), password=None)
            jwt = unsigned + "." + b64u(pk.sign(unsigned.encode(), padding.PKCS1v15(), hashes.SHA256()))
            body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": jwt}).encode()
            with urllib.request.urlopen(urllib.request.Request(aud, data=body), timeout=30) as r:
                j = json.load(r)
            self.tok, self.exp = j["access_token"], now + int(j.get("expires_in", 3600))
            return self.tok


TOKEN = None
META = {}


def drive(url, headers=None):
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + TOKEN.get(), **(headers or {})})
    return urllib.request.urlopen(req, timeout=90)


def meta(fid):
    m = META.get(fid)
    if not m or time.time() - m["_at"] > 600:
        with drive(API + fid + "?fields=id,name,mimeType,size,trashed&supportsAllDrives=true") as r:
            m = json.load(r)
        m["_at"] = time.time()
        META[fid] = m
    return m


def get_photo_chunk(args):
    fid = str(args.get("file_id", ""))
    if not ID_RE.match(fid):
        raise ValueError("file_id is not a Google Drive file id")
    offset = max(0, int(args.get("offset") or 0))
    length = min(CHUNK, max(1, int(args.get("length") or CHUNK)))
    m = meta(fid)
    if m.get("trashed") or not str(m.get("mimeType", "")).startswith("image/"):
        raise ValueError("Not an image file the gallery can show")
    size = int(m.get("size") or 0)
    if offset >= size:
        data = b""
    else:
        end = min(size, offset + length) - 1
        with drive(API + fid + "?alt=media&supportsAllDrives=true", {"Range": f"bytes={offset}-{end}"}) as r:
            data = r.read()
    return {"file_id": fid, "name": m.get("name", ""), "mime_type": m.get("mimeType", ""), "size": size,
            "offset": offset, "length": len(data), "data": base64.b64encode(data).decode()}


def handle(msg):
    method, mid = msg.get("method"), msg.get("id")
    if mid is None:
        return None
    if method == "initialize":
        pv = (msg.get("params") or {}).get("protocolVersion") or "2025-06-18"
        return {"protocolVersion": pv, "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "nikon-originals", "title": "Nikon Originals", "version": "1.0.0"},
                "instructions": "Streams full-resolution Nikon Finals from Google Drive in byte ranges for the Nikon Wildlife Gallery."}
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        p = msg.get("params") or {}
        if p.get("name") != "get_photo_chunk":
            raise LookupError("Unknown tool")
        try:
            out = get_photo_chunk(p.get("arguments") or {})
        except urllib.error.HTTPError as e:
            why = "File not found or not shared with the gallery's reader account" if e.code in (403, 404) else f"Google Drive error {e.code}"
            return {"content": [{"type": "text", "text": why}], "isError": True}
        except (ValueError, KeyError) as e:
            return {"content": [{"type": "text", "text": str(e)}], "isError": True}
        note = f"Bytes {out['offset']}-{out['offset'] + out['length']} of {out['size']} ({out['name']})"
        return {"content": [{"type": "text", "text": note}], "structuredContent": out}
    raise LookupError(f"Method not found: {method}")


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code, body=b"", ctype="application/json"):
        self.send_response(code)
        if body:
            self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _authorized(self):
        return SECRET and self.path.split("?")[0].rstrip("/") == "/mcp/" + SECRET

    def do_GET(self):
        if self.path == "/healthz":
            return self._send(200, b"ok", "text/plain")
        self._send(405 if self._authorized() else 404)

    def do_DELETE(self):
        self._send(405 if self._authorized() else 404)

    def do_POST(self):
        if not self._authorized():
            return self._send(404)
        try:
            msg = json.loads(self.rfile.read(int(self.headers.get("Content-Length") or 0)) or b"null")
        except ValueError:
            return self._send(400, json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}}).encode())
        batch = msg if isinstance(msg, list) else [msg]
        out = []
        for m in batch:
            if not isinstance(m, dict):
                continue
            try:
                res = handle(m)
                if res is not None:
                    out.append({"jsonrpc": "2.0", "id": m["id"], "result": res})
            except LookupError as e:
                out.append({"jsonrpc": "2.0", "id": m.get("id"), "error": {"code": -32601, "message": str(e)}})
            except Exception as e:
                out.append({"jsonrpc": "2.0", "id": m.get("id"), "error": {"code": -32603, "message": type(e).__name__}})
        if not out:
            return self._send(202)
        self._send(200, json.dumps(out if isinstance(msg, list) else out[0]).encode())

    def log_message(self, fmt, *a):
        if os.environ.get("LOG_REQUESTS"):
            super().log_message(fmt, *a)


if __name__ == "__main__":
    TOKEN = Token()
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), H).serve_forever()
