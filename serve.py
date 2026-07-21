#!/usr/bin/env python3
"""Local preview server.

Same as `python -m http.server`, but tells the browser never to cache. Without this,
edits to assets/*.js and data.json appear not to take effect until a hard refresh.
GitHub Pages sets its own sensible caching, so this only affects local previewing.

    python serve.py [port]     # default 8080
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter output
        if not str(args[0]).startswith(("GET /assets", "GET /favicon")):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"Serving http://localhost:{port}  (Ctrl+C to stop)")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
