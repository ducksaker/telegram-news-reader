// Kiểm tra lõi tag: chuẩn hoá tên, gắn/gỡ, phạm vi lọc, dọn dữ liệu.
// Test đọc CHÍNH khối TAGS trong index.html (giữa 2 marker) nên không chép lại logic.
// Chạy: node tests/tags.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const BEGIN = '/* TAGS_BEGIN */';
const END = '/* TAGS_END */';
const i = html.indexOf(BEGIN);
const j = html.indexOf(END);
assert.ok(i > 0 && j > i, 'index.html thiếu marker TAGS_BEGIN / TAGS_END');

// `norm` nằm ngoài khối tag nhưng khối tag dùng nó → lấy nguyên biểu thức từ app.
const normStart = html.indexOf('const norm = (s) =>');
assert.ok(normStart > 0, 'không tìm thấy định nghĩa norm');
const normSrc = html.slice(normStart, html.indexOf(';', normStart) + 1);

// Palette màu dùng chung với kênh (khối tag tham chiếu COLORS).
const colorsStart = html.indexOf('const COLORS = [');
assert.ok(colorsStart > 0, 'không tìm thấy COLORS');
const colorsSrc = html.slice(colorsStart, html.indexOf('];', colorsStart) + 2);

const block = normSrc + '\n' + colorsSrc + '\n' + html.slice(i + BEGIN.length, j);
const ctx = {};
vm.runInNewContext(
  block + '\n;globalThis.__x = { TAG_MAX_NAME, TAG_MAX_PER_CHANNEL, TAG_COLORS, nextTagColor,' +
  ' tagDisplay, tagKey, tagById, tagByKey,' +
  ' channelTagIds, channelHasTag, tagUsageCount, channelInScope, scopeChannelsOf, postsInScope,' +
  ' addTagRef, removeTagRef, removeTagEverywhere, sanitizeTagFilter, ensureTag };',
  ctx
);
const X = ctx.__x;

const tag = (id, name) => ({ id, name, createdAt: 0 });
const ch = (username, ids, enabled = true) => ({ username, tags: ids, enabled });

let seq = 0;
const idFactory = () => 't' + (++seq);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('giới hạn: tên 30 ký tự, 10 tag mỗi kênh', () => {
  assert.equal(X.TAG_MAX_NAME, 30);
  assert.equal(X.TAG_MAX_PER_CHANNEL, 10);
});

test('tagDisplay: bỏ #, gộp khoảng trắng, cắt 30 ký tự', () => {
  assert.equal(X.tagDisplay('  #Political  '), 'Political');
  assert.equal(X.tagDisplay('###  Chính   trị '), 'Chính trị');
  assert.equal(X.tagDisplay('   '), '');
  assert.equal(X.tagDisplay('#'), '');
  assert.equal(X.tagDisplay('a'.repeat(40)).length, 30);
});

test('tagKey: không phân biệt hoa thường, bỏ dấu, bỏ # → cùng một khoá', () => {
  const keys = ['#Political', ' political ', 'Political', '#POLITICAL'].map((s) => X.tagKey(s));
  assert.deepEqual([...keys], ['political', 'political', 'political', 'political']);
  assert.equal(X.tagKey('Chính trị'), 'chinh tri');
  assert.equal(X.tagKey('Kinh tế'), 'kinh te');
  assert.equal(X.tagKey('   ###  '), '');
});

test('ensureTag: nhập trùng (khác hoa thường/khoảng trắng/#) dùng lại tag cũ', () => {
  const tags = [];
  const a = X.ensureTag(tags, '#Political', idFactory);
  assert.equal(a.created, true);
  assert.equal(a.tag.name, 'Political');
  const b = X.ensureTag(tags, ' political ', idFactory);
  assert.equal(b.created, false);
  assert.equal(b.tag.id, a.tag.id);
  assert.equal(tags.length, 1);
  const c = X.ensureTag(tags, 'Chính trị', idFactory);
  assert.equal(c.created, true);
  assert.equal(tags.length, 2);
  assert.equal(X.ensureTag(tags, '   ', idFactory), null);
});

test('ensureTag: tên quá dài bị cắt còn 30 ký tự', () => {
  const tags = [];
  const r = X.ensureTag(tags, 'x'.repeat(45), idFactory);
  assert.equal(r.tag.name.length, 30);
  assert.equal(X.tagKey(r.tag.name), 'x'.repeat(30));
});

test('gắn/gỡ tag: chặn trùng và chặn tag thứ 11', () => {
  const c = ch('abc', []);
  const tags = [];
  for (let k = 0; k < 10; k++) {
    const t = X.ensureTag(tags, 't' + k, idFactory).tag;
    assert.equal(X.addTagRef(c, t.id), true, 'gắn tag ' + k);
  }
  assert.equal(X.channelTagIds(c).length, 10);
  const extra = X.ensureTag(tags, 'thu 11', idFactory).tag;
  assert.equal(X.addTagRef(c, extra.id), false, 'phải chặn tag thứ 11');
  assert.equal(X.addTagRef(c, c.tags[0]), false, 'gắn trùng phải trả false');
  assert.equal(X.removeTagRef(c, c.tags[0]), true);
  assert.equal(X.channelTagIds(c).length, 9);
  assert.equal(X.removeTagRef(c, 'khong-co'), false);
});

test('quan hệ nhiều-nhiều: đếm số kênh dùng tag', () => {
  const tags = [tag('a', 'Political'), tag('b', 'Tech')];
  const channels = [ch('c1', ['a']), ch('c2', ['a', 'b']), ch('c3', [])];
  assert.equal(X.tagUsageCount(channels, 'a'), 2);
  assert.equal(X.tagUsageCount(channels, 'b'), 1);
  assert.equal(X.tagUsageCount(channels, 'zz'), 0);
  assert.equal(X.channelHasTag(channels[1], 'b'), true);
  assert.equal(X.channelHasTag(channels[1], 'a'), true);
  assert.equal(X.channelHasTag(channels[2], 'a'), false);
});

test('phạm vi lọc: rỗng = mọi kênh đang bật; có tag = kênh có ≥1 tag đó', () => {
  const channels = [ch('a', ['x']), ch('b', ['y']), ch('c', []), ch('d', ['x', 'y'], false)];
  assert.deepEqual([...X.scopeChannelsOf(channels, []).map((c) => c.username)], ['a', 'b', 'c']);
  assert.deepEqual([...X.scopeChannelsOf(channels, ['x']).map((c) => c.username)], ['a']);
  assert.deepEqual([...X.scopeChannelsOf(channels, ['x', 'y']).map((c) => c.username)], ['a', 'b']);
  assert.deepEqual([...X.scopeChannelsOf(channels, ['zz']).map((c) => c.username)], []);
  assert.equal(X.channelInScope(channels[3], []), false, 'kênh tắt không bao giờ trong phạm vi');
});

test('postsInScope: chọn A+B chỉ ra bài của kênh có A hoặc B, không trùng', () => {
  const channels = [ch('a', ['A']), ch('b', ['B']), ch('c', ['C']), ch('d', ['A'], false)];
  const posts = [
    { key: 'a1', channel: 'a', ts: 5 },
    { key: 'b1', channel: 'b', ts: 4 },
    { key: 'c1', channel: 'c', ts: 3 },
    { key: 'd1', channel: 'd', ts: 6 },
    { key: 'b2', channel: 'b', ts: 2 },
  ];
  const got = X.postsInScope(posts, channels, ['A', 'B']).map((p) => p.key);
  assert.deepEqual([...got], ['a1', 'b1', 'b2']);
  assert.equal(new Set(got).size, got.length, 'không được trùng bài');
  assert.deepEqual([...X.postsInScope(posts, channels, []).map((p) => p.key)], ['a1', 'b1', 'c1', 'b2']);
  assert.deepEqual([...X.postsInScope(posts, channels, ['C']).map((p) => p.key)], ['c1']);
});

test('xoá tag khỏi mọi kênh, không đụng kênh khác', () => {
  const channels = [ch('c1', ['a', 'b']), ch('c2', ['a']), ch('c3', ['b'])];
  assert.equal(X.removeTagEverywhere(channels, 'a'), 2);
  assert.deepEqual([...X.channelTagIds(channels[0])], ['b']);
  assert.deepEqual([...X.channelTagIds(channels[1])], []);
  assert.deepEqual([...X.channelTagIds(channels[2])], ['b']);
});

test('sanitizeTagFilter: bỏ id lạ, bỏ trùng, giữ thứ tự', () => {
  const tags = [tag('a', 'A'), tag('b', 'B')];
  assert.deepEqual([...X.sanitizeTagFilter(['b', 'zz', 'a', 'b', null, 7], tags)], ['b', 'a']);
  assert.deepEqual([...X.sanitizeTagFilter(undefined, tags)], []);
  assert.deepEqual([...X.sanitizeTagFilter(['a'], [])], []);
});

test('dữ liệu bẩn không làm hỏng: ch.tags không phải mảng, id trùng', () => {
  assert.deepEqual([...X.channelTagIds({ tags: 'abc' })], []);
  assert.deepEqual([...X.channelTagIds(null)], []);
  assert.deepEqual([...X.channelTagIds({ tags: ['a', 'a', 5, '', 'b'] })], ['a', 'b']);
});

test('màu tag: tự gán màu khác nhau, tái dùng palette khi quá 10 tag', () => {
  const tags = [];
  const seen = new Set();
  for (let k = 0; k < 10; k++) {
    const t = X.ensureTag(tags, 'tag ' + k, idFactory).tag;
    assert.ok(X.TAG_COLORS.indexOf(t.color) >= 0, 'màu ngoài palette: ' + t.color);
    assert.ok(!seen.has(t.color), 'màu bị trùng ở tag ' + k);
    seen.add(t.color);
  }
  const extra = X.ensureTag(tags, 'tag 10', idFactory).tag;
  assert.ok(X.TAG_COLORS.indexOf(extra.color) >= 0);
  assert.equal(X.nextTagColor(tags.slice(0, 3)), X.TAG_COLORS[3]);
  assert.equal(X.nextTagColor([]), X.TAG_COLORS[0]);
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log('  ok  ' + t.name);
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + t.name + '\n        ' + String(e.message).split('\n').join('\n        '));
  }
}
console.log('\n' + (tests.length - failed) + '/' + tests.length + ' test pass');
process.exit(failed ? 1 : 0);
