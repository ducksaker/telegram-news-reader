#!/usr/bin/env node
/**
 * Telegram News Reader — local server + proxy.
 *
 * Vì sao cần file này: t.me/s/<channel> trả HTML nhưng KHÔNG có header CORS
 * (đã đo: HTTP 200, 127 KB, không Access-Control-Allow-Origin), nên trình duyệt
 * không thể fetch trực tiếp từ file://. Server này chỉ chạy trên 127.0.0.1,
 * phục vụ index.html và proxy đúng một loại URL: https://t.me/s/<username>.
 *
 * Bảo mật:
 *  - Chỉ bind 127.0.0.1 (không lộ ra LAN).
 *  - Không nhận URL tuỳ ý từ client: chỉ nhận username đã validate bằng regex,
 *    URL upstream được tự dựng => không có SSRF.
 *  - Không có dependency ngoài (chỉ module built-in của Node >= 18).
 *
 * Dùng: node serve.js   (đổi cổng: PORT=9000 node serve.js)
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.PORT) || 8787;
const INDEX_FILE = path.join(__dirname, 'index.html');
const CACHE_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 20 * 1000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const USERNAME_RE = /^[A-Za-z0-9_]{3,64}$/;
const BEFORE_RE = /^\d{1,15}$/;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** key -> { at, payload } */
const cache = new Map();

class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
    'access-control-max-age': '600',
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': '*',
  });
  res.end(text);
}

/**
 * Gọi trang preview công khai của Telegram. Không có tham số URL nào khác
 * ngoài username đã validate + before dạng số.
 */
async function fetchChannel(username, before) {
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'invalid_channel');
  if (before && !BEFORE_RE.test(before)) throw new HttpError(400, 'invalid_before');

  const cacheKey = username.toLowerCase() + ':' + (before || '0');
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_MS) {
    return { ...hit.payload, cached: true };
  }

  const target = 'https://t.me/s/' + encodeURIComponent(username) + (before ? '?before=' + before : '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream;
  try {
    upstream = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    if (err && err.name === 'AbortError') throw new HttpError(504, 'upstream_timeout');
    throw new HttpError(502, 'upstream_unreachable');
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) throw new HttpError(502, 'upstream_http_' + upstream.status);

  const html = await upstream.text();
  if (Buffer.byteLength(html, 'utf8') > MAX_HTML_BYTES) {
    throw new HttpError(502, 'upstream_too_large');
  }

  // Kênh không tồn tại / không public: t.me/s/... redirect sang trang contact
  // (không có /s/ trong URL cuối và không có widget message nào).
  const finalUrl = upstream.url || target;
  if (!/\/s\//.test(new URL(finalUrl).pathname)) {
    throw new HttpError(404, 'not_public');
  }

  const payload = {
    ok: true,
    channel: username,
    before: before || '',
    html,
    finalUrl,
    fetchedAt: new Date().toISOString(),
    bytes: Buffer.byteLength(html, 'utf8'),
  };
  cache.set(cacheKey, { at: now, payload });
  if (cache.size > 120) {
    // Xoá entry cũ nhất (Map giữ thứ tự chèn).
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return { ...payload, cached: false };
}

function serveIndex(res) {
  fs.readFile(INDEX_FILE, (err, buf) => {
    if (err) {
      sendText(res, 500, 'Không đọc được index.html. Hãy chạy: node serve.js trong thư mục này.');
      return;
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // CSP: chỉ cho phép tài nguyên của chính app + ảnh https + endpoint dịch.
      'content-security-policy': [
        "default-src 'self'",
        "img-src 'self' https: data:",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self' 'unsafe-inline'",
        "connect-src 'self' https://r.jina.ai https://api.fxtwitter.com https://api.rss2json.com https://proxy.corsfix.com https://translate.googleapis.com http://127.0.0.1:8787",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; '),
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://' + HOST);
  } catch {
    sendText(res, 400, 'Bad request');
    return;
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': '*',
      'access-control-max-age': '600',
    });
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
    return;
  }

  try {
    if (url.pathname === '/' || url.pathname === '/index.html') {
      serveIndex(res);
      return;
    }

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, app: 'telegram-news-reader', version: 1 });
      return;
    }

    if (url.pathname === '/api/tg') {
      const rawUser = (url.searchParams.get('ch') || '').trim().replace(/^@/, '');
      const before = (url.searchParams.get('before') || '').trim();
      try {
        const payload = await fetchChannel(rawUser, before);
        sendJson(res, 200, payload);
      } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        const code = err instanceof HttpError ? err.code : 'internal_error';
        sendJson(res, status, { ok: false, error: code, channel: rawUser });
      }
      return;
    }

    sendText(res, 404, 'Not found');
  } catch (err) {
    sendJson(res, 500, { ok: false, error: 'internal_error' });
  }
});

function listen(port, attemptsLeft) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error('[!] Không khởi động được server:', err.message);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const actual = server.address().port;
    console.log('');
    console.log('  Telegram News Reader');
    console.log('  Mở:   http://' + HOST + ':' + actual);
    console.log('  Dừng: Ctrl+C');
    console.log('');
  });
}

server.on('clientError', (err, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

listen(BASE_PORT, 9);
