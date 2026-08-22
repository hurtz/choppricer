#!/usr/bin/env python3
"""Static server for CHOP PRICER + POST /shot sink so agents can save canvas PNGs.

  POST /shot?name=store_r1   body = data:image/png;base64,....
  -> writes shots/store_r1.png, returns the path.
"""
import base64, os, re, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "shots")
os.makedirs(SHOTS, exist_ok=True)

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        super().end_headers()

    def do_POST(self):
        if self.path.startswith("/audio"):
            return self.do_audio()
        if not self.path.startswith("/shot"):
            self.send_error(404); return

    def do_audio(self):
        """Binary audio sink. POST /audio?name=x with a raw wav/webm body."""
        m = re.search(r"name=([A-Za-z0-9_.-]+)", self.path)
        name = (m.group(1) if m else "clip")[:60]
        ext = "wav" if "fmt=wav" in self.path else "webm"
        n = int(self.headers.get("Content-Length", 0))
        if n <= 0 or n > 200_000_000:
            self.send_error(400, "bad length"); return
        raw = self.rfile.read(n)
        d = os.path.join(ROOT, "audio")
        os.makedirs(d, exist_ok=True)
        dest = os.path.join(d, f"{name}.{ext}")
        with open(dest, "wb") as f:
            f.write(raw)
        msg = f"audio/{name}.{ext} {len(raw)//1024}KB".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)
        m = re.search(r"name=([A-Za-z0-9_.-]+)", self.path)
        name = (m.group(1) if m else "shot")[:60]
        n = int(self.headers.get("Content-Length", 0))
        if n <= 0 or n > 200_000_000:
            self.send_error(400, "bad length"); return
        body = self.rfile.read(n).decode("utf-8", "replace")
        b64 = body.split(",", 1)[1] if body.startswith("data:") else body
        try:
            raw = base64.b64decode(b64)
        except Exception:
            self.send_error(400, "bad b64"); return
        if not raw.startswith(b"\x89PNG"):
            self.send_error(400, "not png"); return
        dest = os.path.join(SHOTS, name + ".png")
        with open(dest, "wb") as f:
            f.write(raw)
        msg = f"shots/{name}.png {len(raw)//1024}KB".encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.send_header("Content-Length", str(len(msg)))
        self.end_headers()
        self.wfile.write(msg)

    def log_message(self, fmt, *a):
        try:
            line = fmt % a
        except Exception:
            line = str(fmt)
        if "POST" in line or "code 4" in line or "code 5" in line:
            sys.stderr.write(line + "\n")

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8171
ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
