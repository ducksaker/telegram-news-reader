// Test lớp dịch phía client: ưu tiên Google public (CORS *), chỉ fallback
// proxy local khi Google bị chặn/lỗi. Đọc CHÍNH khối TRANSLATE_CORE trong
// index.html nên không chép lại logic.
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

const GOOGLE = 'https://translate.googleapis.com/translate_a/single';
const PROXY = 'http://127.0.0.1:8787/api/translate';

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

const googleOk = (text = 'Xin chào', lang = 'en') => jsonResponse([
  [[text, 'hello', null, null, 10]],
  null,
  lang,
  null,
]);

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
    block + '\n;globalThis.__t = { requestTranslate, translateText, splitChunks };',
    ctx
  );
  return ctx.__t;
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('requestTranslate gọi Google trực tiếp trước, không đụng proxy', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    if (String(url).startsWith(GOOGLE)) return Promise.resolve(googleOk());
    return Promise.reject(new Error('không được gọi proxy khi Google còn sống'));
  });
  const r = await T.requestTranslate('Hello');
  assert.equal(r.t, 'Xin chào');
  assert.equal(r.lang, 'en');
  assert.equal(r.provider, 'google');
  assert.equal(calls.length, 1);
  assert.match(calls[0], /^https:\/\/translate\.googleapis\.com\/translate_a\/single\?/);
  assert.match(calls[0], /client=gtx/);
});

test('requestTranslate fallback proxy khi Google bị chặn', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    if (String(url).startsWith(GOOGLE)) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(jsonResponse({ ok: true, t: 'Xin chào', lang: 'en', provider: 'mymemory' }));
  });
  const r = await T.requestTranslate('Hello');
  assert.equal(r.t, 'Xin chào');
  assert.equal(r.provider, 'mymemory');
  assert.equal(calls.length, 2);
  assert.match(calls[1], /^http:\/\/127\.0\.0\.1:8787\/api\/translate\?q=Hello$/);
});

test('requestTranslate báo translate_public_blocked khi Google lẫn proxy đều hỏng', async () => {
  const T = load(() => Promise.reject(new TypeError('Failed to fetch')));
  await assert.rejects(() => T.requestTranslate('Hello'), /translate_public_blocked/);
});

test('sau khi Google lỗi, request kế tiếp bỏ qua Google trong cooldown', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    if (String(url).startsWith(GOOGLE)) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(jsonResponse({ ok: true, t: 'Xin chào', lang: 'en', provider: 'google' }));
  });
  await T.requestTranslate('a');
  await T.requestTranslate('b');
  assert.equal(calls.filter((u) => u.startsWith(GOOGLE)).length, 1);
  assert.equal(calls.filter((u) => u.startsWith(PROXY)).length, 2);
});

test('requestTranslate trả tiếng Việt khi Google báo nguồn là vi', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    return Promise.resolve(jsonResponse([[], null, 'vi']));
  });
  const r = await T.requestTranslate('Xin chào');
  assert.equal(r.t, '');
  assert.equal(r.lang, 'vi');
  assert.equal(calls.length, 1);
});

test('requestTranslate fallback proxy khi Google trả 429', async () => {
  const calls = [];
  const T = load((url) => {
    calls.push(String(url));
    if (String(url).startsWith(GOOGLE)) return Promise.resolve(jsonResponse('<html>429</html>', 429));
    return Promise.resolve(jsonResponse({ ok: true, t: 'Xin chào', lang: 'en', provider: 'google' }));
  });
  const r = await T.requestTranslate('Hello');
  assert.equal(r.provider, 'google');
  assert.equal(calls.length, 2);
});

test('translateText chia văn bản dài thành nhiều request Google và ghép bằng xuống dòng', async () => {
  let n = 0;
  const T = load(() => {
    n++;
    return Promise.resolve(googleOk('X'));
  });
  const r = await T.translateText('a'.repeat(4000));
  assert.equal(n, 2);
  assert.equal(r.t, 'X\nX');
});

test('translateText cache theo nội dung: gọi lại không phát request mới', async () => {
  let n = 0;
  const T = load(() => {
    n++;
    return Promise.resolve(googleOk());
  });
  const a = await T.translateText('Hello');
  const b = await T.translateText('Hello');
  assert.equal(n, 1);
  assert.equal(a.t, 'Xin chào');
  assert.equal(b.t, 'Xin chào');
  assert.equal(a.provider, 'google');
});

test('translateText trả bản rỗng khi nguồn đã là tiếng Việt', async () => {
  const T = load(() => Promise.resolve(jsonResponse([[], null, 'vi'])));
  const r = await T.translateText('Xin chào');
  assert.equal(r.t, '');
  assert.equal(r.lang, 'vi');
});

test('translateText giữ mã quota từ proxy khi Google bị chặn', async () => {
  const T = load((url) => {
    if (String(url).startsWith(GOOGLE)) return Promise.reject(new TypeError('Failed to fetch'));
    return Promise.resolve(jsonResponse({ ok: false, error: 'mymemory_quota' }, 429));
  });
  await assert.rejects(() => T.translateText('Hello'), /mymemory_quota/);
});

test('translateText phân biệt https bị chặn proxy khi Google cũng hỏng', async () => {
  const T = load(() => Promise.reject(new TypeError('Failed to fetch')), 'https:');
  await assert.rejects(() => T.translateText('Hello'), /translate_proxy_blocked/);
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
