#!/usr/bin/env python3
"""Local fallback proxy for Telegram public previews + translation.

Chạy file này khi r.jina.ai trả 403/429, hoặc khi muốn dịch bài. App
(index.html) gọi http://127.0.0.1:8787/api/tg cho Telegram và
http://127.0.0.1:8787/api/translate cho dịch.

- Chỉ bind 127.0.0.1 (không lộ ra LAN).
- /api/tg: chỉ nhận username hợp lệ + before dạng số.
- /api/translate: Google trước, MyMemory khi Google 429/CAPTCHA; chỉ nhận
  text tối đa 5.000 ký tự, đích cố định là tiếng Việt.
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
    "http://127.0.0.1:8787; "
    "base-uri 'none'; form-action 'none'"
)

# Dịch: trình duyệt không đọc được translate.googleapis.com (thiếu CORS), nên
# endpoint /api/translate gọi Google phía server. Google hay trả 429/CAPTCHA
# theo IP; khi đó tự fallback MyMemory (có ACAO *, autodetect, 500 byte/request).
GOOGLE_TRANSLATE_URL = "https://translate.googleapis.com/translate_a/single"
MYMEMORY_URL = "https://api.mymemory.translated.net/get"
TRANSLATE_MAX_INPUT = 5000
TRANSLATE_CACHE_MS = 60 * 60 * 1000
MYMEMORY_MAX_BYTES = 450
MYMEMORY_DAILY_CHARS = 5000
TRANSLATE_TIMEOUT_S = 25
MAX_JSON = 2 * 1024 * 1024

_cache: dict[str, tuple[float, dict]] = {}
_translate_cache: dict[str, tuple[float, dict]] = {}
# MyMemory miễn phí 5.000 ký tự/ngày nếu ẩn danh; giữ bộ đếm trong tiến trình
# để không đập vào giới hạn rồi nhận lỗi khó hiểu.
_my_budget = {"day": "", "chars": 0}


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


def _today() -> str:
    return time.strftime("%Y-%m-%d")


def _charge_mymemory(chars: int) -> None:
    day = _today()
    if _my_budget["day"] != day:
        _my_budget["day"] = day
        _my_budget["chars"] = 0
    if _my_budget["chars"] + chars > MYMEMORY_DAILY_CHARS:
        raise ValueError("mymemory_quota")
    _my_budget["chars"] += chars


def split_utf8(text: str, max_bytes: int) -> list[str]:
    """Cắt text thành chunk <= max_bytes, không cắt giữa ký tự UTF-8.

    Ưu tiên cắt sau khoảng trắng/xuống dòng gần nhất để giữ ranh giới từ.
    Mọi ký tự gốc được giữ nguyên: ''.join(kết quả) == text.
    """
    if not text:
        return []
    chunks: list[str] = []
    buf: list[str] = []
    size = 0
    last_break = -1
    for ch in text:
        n = len(ch.encode("utf-8"))
        if buf and size + n > max_bytes:
            cut = last_break if last_break > 0 else len(buf)
            chunks.append("".join(buf[:cut]))
            buf = buf[cut:]
            size = len("".join(buf).encode("utf-8"))
            last_break = -1
        buf.append(ch)
        size += n
        if ch in " \n\t":
            last_break = len(buf)
    if buf:
        chunks.append("".join(buf))
    return [chunk for chunk in chunks if chunk]


def parse_google(data: object) -> dict:
    if not isinstance(data, list) or not data:
        raise ValueError("google_bad_response")
    segments = data[0] if isinstance(data[0], list) else []
    text = "".join(
        seg[0] for seg in segments
        if isinstance(seg, list) and seg and isinstance(seg[0], str)
    )
    lang = data[2] if len(data) > 2 and isinstance(data[2], str) else ""
    if not text and lang != "vi":
        raise ValueError("google_empty")
    return {"t": text, "lang": lang}


def parse_mymemory(payload: object) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("mymemory_bad_response")
    if payload.get("quotaFinished") is True:
        raise ValueError("mymemory_quota")
    data = payload.get("responseData") if isinstance(payload.get("responseData"), dict) else {}
    text = str(data.get("translatedText") or "")
    status = str(payload.get("responseStatus") or "")
    details = str(payload.get("responseDetails") or "")
    upper_details = details.upper()
    # Nguồn đã là tiếng Việt: MyMemory từ chối cặp vi|vi bằng thông báo này.
    if "DISTINCT LANGUAGES" in upper_details:
        return {"t": "", "lang": "vi"}
    if "QUERY LENGTH LIMIT" in upper_details or text.upper().startswith("QUERY LENGTH LIMIT"):
        raise ValueError("mymemory_too_long")
    if status not in ("200", "") or not text:
        if status == "429":
            raise ValueError("mymemory_quota")
        raise ValueError("mymemory_error")
    lang = str(data.get("detectedLanguage") or "")
    return {"t": text, "lang": lang}


def _http_json(url: str, timeout: int) -> object:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/plain,*/*",
            "Accept-Language": "vi,en;q=0.8",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read(MAX_JSON + 1)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"http_{exc.code}") from exc
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", "")
        if isinstance(reason, TimeoutError):
            raise ValueError("timeout") from exc
        raise ValueError("unreachable") from exc
    except TimeoutError as exc:
        raise ValueError("timeout") from exc
    if len(raw) > MAX_JSON:
        raise ValueError("too_large")
    try:
        return json.loads(raw.decode("utf-8", errors="replace"))
    except json.JSONDecodeError as exc:
        raise ValueError("bad_json") from exc


def fetch_google(text: str, timeout: int = TRANSLATE_TIMEOUT_S) -> dict:
    url = (
        GOOGLE_TRANSLATE_URL
        + "?client=gtx&sl=auto&tl=vi&dt=t&q="
        + urllib.parse.quote(text, safe="")
    )
    try:
        data = _http_json(url, timeout)
    except ValueError as exc:
        code = str(exc)
        if code == "http_429":
            raise ValueError("google_429") from exc
        if code == "http_403":
            raise ValueError("google_403") from exc
        if code.startswith("http_"):
            raise ValueError("google_" + code[5:]) from exc
        raise ValueError("google_" + code) from exc
    return parse_google(data)


def fetch_mymemory(text: str, timeout: int = TRANSLATE_TIMEOUT_S) -> dict:
    chunks = split_utf8(text, MYMEMORY_MAX_BYTES)
    parts: list[str] = []
    lang = ""
    saw_vi = False
    for chunk in chunks:
        _charge_mymemory(len(chunk))
        url = (
            MYMEMORY_URL
            + "?q=" + urllib.parse.quote(chunk, safe="")
            + "&langpair=autodetect%7Cvi"
        )
        try:
            payload = _http_json(url, timeout)
        except ValueError as exc:
            code = str(exc)
            if code == "http_429":
                raise ValueError("mymemory_quota") from exc
            if code.startswith("http_"):
                raise ValueError("mymemory_" + code[5:]) from exc
            raise ValueError("mymemory_" + code) from exc
        result = parse_mymemory(payload)
        if result["lang"] == "vi" and not result["t"]:
            saw_vi = True
            continue
        if result["lang"] and result["lang"] != "vi" and not lang:
            lang = result["lang"]
        if result["t"]:
            parts.append(result["t"].strip())
    text_out = " ".join(part for part in parts if part).strip()
    return {"t": text_out, "lang": lang or ("vi" if saw_vi else "")}


def translate_text(text: str) -> dict:
    clean = str(text or "").replace("\r", "").strip()
    if len(clean) < 2:
        return {"ok": True, "t": "", "lang": "", "provider": ""}

    now = time.time() * 1000
    hit = _translate_cache.get(clean)
    if hit and now - hit[0] < TRANSLATE_CACHE_MS:
        return {**hit[1], "cached": True}

    errors: list[str] = []
    try:
        result = {**fetch_google(clean), "provider": "google"}
    except Exception as exc:  # noqa: BLE001 - upstream có nhiều kiểu lỗi
        errors.append(str(exc))
        try:
            result = {**fetch_mymemory(clean), "provider": "mymemory"}
        except Exception as exc2:  # noqa: BLE001
            errors.append(str(exc2))
            return {"ok": False, "error": errors[-1], "errors": errors}

    out = {"ok": True, **result, "errors": errors}
    _translate_cache[clean] = (now, out)
    if len(_translate_cache) > 500:
        _translate_cache.pop(next(iter(_translate_cache)))
    return out


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
            send_json(self, 200, {
                "ok": True,
                "app": "telegram-news-reader",
                "proxy": "local",
                "translate": True,
            })
            return

        if parsed.path == "/api/translate":
            qs = urllib.parse.parse_qs(parsed.query)
            text = (qs.get("q", [""])[0] or "").strip()
            target = (qs.get("tl", ["vi"])[0] or "vi").strip()
            if target != "vi":
                send_json(self, 400, {"ok": False, "error": "invalid_target"})
                return
            if not text:
                send_json(self, 400, {"ok": False, "error": "empty_text"})
                return
            if len(text) > TRANSLATE_MAX_INPUT:
                send_json(self, 400, {"ok": False, "error": "too_long"})
                return
            result = translate_text(text)
            if result.get("ok"):
                send_json(self, 200, result)
            else:
                code = str(result.get("error") or "translate_error")
                status = 429 if "quota" in code else 502
                send_json(self, status, result)
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
    print(f"  Telegram: http://{HOST}:{PORT}/api/tg?ch=<kenh>")
    print(f"  Dich:     http://{HOST}:{PORT}/api/translate?q=<text>")
    print("  Mo index.html nhu binh thuong (double-click).")
    print("  Dung: Ctrl+C")
    print("")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
