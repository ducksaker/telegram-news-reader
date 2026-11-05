#!/usr/bin/env python3
"""Local fallback proxy for Telegram public previews.

Chạy file này khi r.jina.ai trả 403/429. App (index.html) sẽ tự thử
http://127.0.0.1:8787/api/tg sau khi Jina lỗi, trước khi dùng RSS.

- Chỉ bind 127.0.0.1 (không lộ ra LAN).
- Không nhận URL tùy ý: chỉ nhận username hợp lệ + before dạng số.
- Không dependency ngoài (Python 3.10+ standard library).

Dùng: python serve.py   (hoặc double-click start-python.cmd)
"""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8787
CACHE_MS = 60_000
TIMEOUT_S = 20
MAX_HTML = 5 * 1024 * 1024
USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,64}$")
BEFORE_RE = re.compile(r"^\d{1,15}$")
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
INDEX_FILE = Path(__file__).with_name("index.html")
CSP = (
    "default-src 'self'; "
    "img-src 'self' https: data:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self' https://r.jina.ai https://api.fxtwitter.com "
    "https://api.rss2json.com https://proxy.corsfix.com "
    "https://translate.googleapis.com http://127.0.0.1:8787; "
    "base-uri 'none'; form-action 'none'"
)

_cache: dict[str, tuple[float, dict]] = {}


def cors_headers(handler: BaseHTTPRequestHandler) -> None:
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "*")
    handler.send_header("Access-Control-Max-Age", "600")


def send_json(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    cors_headers(handler)
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def fetch_channel(username: str, before: str) -> dict:
    if not USERNAME_RE.match(username):
        raise ValueError("invalid_channel")
    if before and not BEFORE_RE.match(before):
        raise ValueError("invalid_before")

    key = f"{username.lower()}:{before or '0'}"
    now = time.time() * 1000
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_MS:
        return {**hit[1], "cached": True}

    target = "https://t.me/s/" + urllib.parse.quote(username)
    if before:
        target += "?before=" + before
    req = urllib.request.Request(
        target,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
            raw = resp.read(MAX_HTML + 1)
            final_url = resp.geturl()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"upstream_http_{exc.code}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", "")
        if isinstance(reason, TimeoutError):
            raise ValueError("upstream_timeout") from exc
        raise ValueError("upstream_unreachable") from exc
    except TimeoutError as exc:
        raise ValueError("upstream_timeout") from exc

    if len(raw) > MAX_HTML:
        raise ValueError("upstream_too_large")
    html = raw.decode("utf-8", errors="replace")

    path = urllib.parse.urlparse(final_url).path
    if "/s/" not in path:
        raise ValueError("not_public")
    if "tgme_widget_message" not in html and "tgme_channel_info" not in html:
        if "tgme_page_wrap" in html or "Contact @" in html:
            raise ValueError("not_public")
        raise ValueError("unexpected_response")

    payload = {
        "ok": True,
        "channel": username,
        "before": before or "",
        "html": html,
        "finalUrl": final_url,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bytes": len(raw),
    }
    _cache[key] = (now, payload)
    if len(_cache) > 120:
        _cache.pop(next(iter(_cache)))
    return {**payload, "cached": False}


class Handler(BaseHTTPRequestHandler):
    server_version = "TelegramReaderLocal/1.0"

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        cors_headers(self)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path in ("/", "/index.html"):
            try:
                body = INDEX_FILE.read_bytes()
            except OSError:
                send_json(self, 500, {"ok": False, "error": "index_missing"})
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/health":
            send_json(self, 200, {"ok": True, "app": "telegram-news-reader", "proxy": "local"})
            return

        if parsed.path == "/api/tg":
            qs = urllib.parse.parse_qs(parsed.query)
            channel = (qs.get("ch", [""])[0] or "").strip().lstrip("@")
            before = (qs.get("before", [""])[0] or "").strip()
            try:
                send_json(self, 200, fetch_channel(channel, before))
            except ValueError as exc:
                code = str(exc)
                if code == "not_public":
                    status = 404
                elif code.startswith("invalid"):
                    status = 400
                else:
                    status = 502
                send_json(self, status, {"ok": False, "error": code, "channel": channel})
            return

        send_json(self, 404, {"ok": False, "error": "not_found"})

    def log_message(self, fmt: str, *args) -> None:
        pass


def main() -> None:
    try:
        httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    except OSError as exc:
        print(f"[!] Khong mo duoc {HOST}:{PORT}: {exc}")
        print("    Dong ung dung dang dung cong 8787 roi chay lai.")
        sys.exit(1)

    print("")
    print("  Telegram Reader - local fallback proxy")
    print(f"  Proxy: http://{HOST}:{PORT}/api/tg?ch=<kenh>")
    print("  Mo index.html nhu binh thuong (double-click).")
    print("  Dung: Ctrl+C")
    print("")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
