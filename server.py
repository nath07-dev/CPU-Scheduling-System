"""
server.py
---------
Serves index.html, style.css, script.js and exposes POST /api/simulate.
Run with:  python3 server.py
Then open: http://localhost:8000/
"""

import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from scheduler import ALGORITHMS

ROOT = Path(__file__).resolve().parent
PORT = 8000

# Static files the front end is allowed to fetch directly.
STATIC_FILES = {
    "/": "index.html",
    "/index.html": "index.html",
    "/style.css": "style.css",
    "/script.js": "script.js",
}


def normalize_processes(raw):
    processes = []
    for row in raw or []:
        pid = str(row.get("pid", "")).strip()
        if not pid:
            continue
        arrival = int(row.get("arrival", 0) or 0)
        burst = int(row.get("burst", 0) or 0)
        priority = int(row.get("priority", 1) or 1)
        if arrival < 0:
            raise ValueError("Arrival time must be 0 or greater.")
        if burst <= 0:
            raise ValueError("Burst time must be greater than zero.")
        processes.append({"pid": pid, "arrival": arrival, "burst": burst, "priority": priority})
    if not processes:
        raise ValueError("Add at least one process first.")
    return processes


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        if urlparse(self.path).path == "/api/simulate":
            self._set_cors_headers()
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path in STATIC_FILES:
            self._serve_static(STATIC_FILES[path])
            return

        rel_path = path.lstrip("/") or "index.html"
        try:
            candidate = (ROOT / rel_path).resolve()
            candidate.relative_to(ROOT.resolve())
        except ValueError:
            self._json({"error": "Not found"}, 404)
            return

        if candidate.is_file():
            self._serve_static(rel_path)
        else:
            self._json({"error": "Not found"}, 404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/simulate":
            self._json({"error": "Not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")

            processes = normalize_processes(data.get("processes"))
            algo_key = data.get("algorithm")
            meta = ALGORITHMS.get(algo_key)
            if not meta:
                raise ValueError("Unknown algorithm selected.")

            kwargs = {}
            if meta.get("uses_quantum"):
                quantum = int(data.get("quantum") or 2)
                if quantum <= 0:
                    raise ValueError("Time quantum must be greater than zero.")
                kwargs["quantum"] = quantum

            result = meta["fn"](processes, **kwargs)
            self._json(result)
        except Exception as exc:
            self._json({"error": str(exc)}, 400)

    def _serve_static(self, filename):
        file_path = ROOT / filename
        if not file_path.is_file():
            self._json({"error": "Not found"}, 404)
            return
        content = file_path.read_bytes()
        content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def _json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._set_cors_headers()
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        return


if __name__ == "__main__":
    print(f"CPU Scheduler running at http://localhost:{PORT}/")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
