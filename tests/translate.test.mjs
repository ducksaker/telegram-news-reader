// Test lớp dịch phía client: gọi proxy local, xử lý lỗi, cache, chunk, tiếng Việt.
// Đọc CHÍNH khối TRANSLATE_CORE trong index.html nên không chép lại logic.
// Chạy: node tests/translate.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const BEGIN = '/* TRANSLATE_CORE_BEGIN */';
const END = '/* TRANSLATE_CORE_END */';
const i = html.indexOf(BEGIN);
const j = html.indexOf(END);
assert.ok(i > 0 && j > i, 'index.html thiếu marker TRANSLATE_CORE_BEGIN / TRANSLATE_CORE_END');
const block = html.slice(i + BEGIN.length, j);

const hashText = (s) => {
  let h = 5381;
  for (let k = 0; k < s.length; k++) h = ((h << 5) + h + s.charCodeAt(k)) | 0;
  return (h >>> 0).toString(36) + '-' + s.length.toString(36);
};

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'application/json' : null) },
  json: async () => body,
});

function load(fetchImpl, protocol = 'file:') {
  const ctx = {
    console,
    fetch: fetchImpl,
    AbortController,
    setTimeout,
    clearTimeout,
    location: { protocol },
    trMemo: {},
    trSeq: 0,
    MAX_TRANSLATIONS_MEMORY: 10,
    hashText,
    sleep: async () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(
    block + '\n;globalThis.__t = { requestTranslate, translateText, splitChunks, TRANSLATE_PROXY_URL };',
    ctx
  );
  return ctx.__t;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('requestTranslate gọi proxy local và đọc JSON thành công', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    return Promise.resolve(jsonResponse({ ok: true, t: 'Xin chào', lang: 'en', provider: 'mymemory' }));
  });
  const r = await T.requestTranslate('hello');
  assert.equal(r.t, 'Xin chào');
  assert.equal(r.lang, 'en');
  assert.equal(r.provider, 'mymemory');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^http:\/\/127\.0\.0\.1:8787\/api\/translate\?q=hello$/);
});

test('requestTranslate giữ nguyên mã lỗi JSON từ proxy', async () => {
  const T = load(() => Promise.resolve(jsonResponse({ ok: false, error: 'mymemory_quota' }, 429)));
  await assert.rejects(() => T.requestTranslate('hello'), /mymemory_quota/);
});

test('requestTranslate đổi lỗi mạng thành translate_proxy_down', async () => {
  const T = load(() => Promise.reject(new TypeError('Failed to fetch')));
  await assert.rejects(() => T.requestTranslate('hello'), /translate_proxy_down/);
});

test('requestTranslate phân biệt https bị trình duyệt chặn proxy', async () => {
  const T = load(() => Promise.reject(new TypeError('Failed to fetch')), 'https:');
  await assert.rejects(() => T.requestTranslate('hello'), /translate_proxy_blocked/);
});

test('translateText cache theo nội dung: gọi lại không phát request mới', async () => {
  let n = 0;
  const T = load(() => {
    n++;
    return Promise.resolve(jsonResponse({ ok: true, t: 'Xin chào', lang: 'en', provider: 'google' }));
  });
  const a = await T.translateText('hello');
  const b = await T.translateText('hello');
  assert.equal(n, 1);
  assert.equal(a.t, 'Xin chào');
  assert.equal(b.t, 'Xin chào');
  assert.equal(a.provider, 'google');
});

test('translateText chia văn bản dài thành nhiều request và ghép bằng xuống dòng', async () => {
  let n = 0;
  const T = load(() => {
    n++;
    return Promise.resolve(jsonResponse({ ok: true, t: 'X', lang: 'en', provider: 'mymemory' }));
  });
  const r = await T.translateText('a'.repeat(4000));
  assert.equal(n, 2);
  assert.equal(r.t, 'X\nX');
});

test('translateText trả bản rỗng khi nguồn đã là tiếng Việt', async () => {
  const T = load(() => Promise.resolve(jsonResponse({ ok: true, t: '', lang: 'vi', provider: 'google' })));
  const r = await T.translateText('Xin chào');
  assert.equal(r.t, '');
  assert.equal(r.lang, 'vi');
});

test('translateText ném lỗi proxy để tầng trên báo đúng mã', async () => {
  const T = load(() => Promise.resolve(jsonResponse({ ok: false, error: 'google_429' }, 502)));
  await assert.rejects(() => T.translateText('hello'), /google_429/);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log('  ok   ' + name);
  } catch (err) {
    failed++;
    console.log('  FAIL ' + name + '  → ' + (err && err.message ? err.message : err));
  }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' test pass' + (failed ? ' — CÓ LỖI' : ''));
process.exit(failed ? 1 : 0);
