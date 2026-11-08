// Kiểm tra bảng preset ảnh chụp: 12 tỷ lệ × 3 cỡ, khung W×H cố định.
// Test đọc CHÍNH khối SHOT_PRESETS trong index.html (giữa 2 marker).
// Chạy: node tests/shot-presets.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');

const BEGIN = '/* SHOT_PRESETS_BEGIN */';
const END = '/* SHOT_PRESETS_END */';
const i = html.indexOf(BEGIN);
const j = html.indexOf(END);
assert.ok(i > 0 && j > i, 'index.html thiếu marker SHOT_PRESETS_BEGIN / SHOT_PRESETS_END');

const ctx = {};
vm.runInNewContext(
  html.slice(i + BEGIN.length, j) +
  '\n;globalThis.__x = { SHOT_PRESETS, SHOT_PRESET_DEFAULT, shotPreset, shotPresetPx, shotFitScale, shotLayoutWidth };',
  ctx
);
const { SHOT_PRESETS, SHOT_PRESET_DEFAULT, shotPreset, shotPresetPx, shotFitScale, shotLayoutWidth } = ctx.__x;

// Bảng đã chốt: [tỷ lệ, slug, Trung bình, Nhỏ] — Lớn = 1,5 × Trung bình.
const RATIOS = [
  ['16:9', '16x9', [1280, 720], [640, 360]],
  ['3:2', '3x2', [1200, 800], [600, 400]],
  ['4:3', '4x3', [1024, 768], [640, 480]],
  ['1:1', '1x1', [1080, 1080], [540, 540]],
  ['4:5', '4x5', [864, 1080], [432, 540]],
  ['5:8', '5x8', [750, 1200], [375, 600]],
  ['9:16', '9x16', [720, 1280], [360, 640]],
  ['2:1', '2x1', [1200, 600], [600, 300]],
  ['1.91:1', '1.91x1', [1200, 630], [600, 315]],
  ['21:9', '21x9', [1260, 540], [630, 270]],
  ['3:1', '3x1', [1200, 400], [600, 200]],
  ['2:3', '2x3', [800, 1200], [400, 600]],
];

const EXPECTED = [];
for (const [ratio, slug, mid, small] of RATIOS) {
  EXPECTED.push({ id: slug + '-l', ratio, name: 'Lớn', w: Math.round(mid[0] * 1.5), h: Math.round(mid[1] * 1.5) });
  EXPECTED.push({ id: slug + '-m', ratio, name: 'Trung bình', w: mid[0], h: mid[1] });
  EXPECTED.push({ id: slug + '-s', ratio, name: 'Nhỏ', w: small[0], h: small[1] });
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('đủ 36 preset (12 tỷ lệ × 3 cỡ), đúng thứ tự nhóm theo tỷ lệ', () => {
  assert.equal(SHOT_PRESETS.length, 36);
  assert.deepEqual([...SHOT_PRESETS].map((p) => p.id), EXPECTED.map((p) => p.id));
  assert.deepEqual([...SHOT_PRESETS].map((p) => p.ratio),
    EXPECTED.map((p) => p.ratio));
});

test('mỗi preset đúng W×H và đúng nhãn cỡ trong bảng', () => {
  EXPECTED.forEach((want, k) => {
    const got = SHOT_PRESETS[k];
    assert.equal(got.w, want.w, 'w của ' + want.id);
    assert.equal(got.h, want.h, 'h của ' + want.id);
    assert.equal(got.name, want.name, 'name của ' + want.id);
    assert.equal(got.ratio, want.ratio, 'ratio của ' + want.id);
  });
});

test('Lớn = 1,5 × Trung bình và giữ đúng tỷ lệ', () => {
  RATIOS.forEach(([ratio, slug, mid]) => {
    const l = SHOT_PRESETS.find((p) => p.id === slug + '-l');
    const m = SHOT_PRESETS.find((p) => p.id === slug + '-m');
    assert.equal(l.w, Math.round(mid[0] * 1.5), 'Lớn.w ' + ratio);
    assert.equal(l.h, Math.round(mid[1] * 1.5), 'Lớn.h ' + ratio);
    // Tỷ lệ thực của cả 3 cỡ phải khớp nhau (sai số làm tròn ≤ 1%).
    const ratioOf = (p) => p.w / p.h;
    const target = m.w / m.h;
    assert.ok(Math.abs(ratioOf(l) - target) / target < 0.01, 'tỷ lệ Lớn lệch: ' + ratio);
    const s = SHOT_PRESETS.find((p) => p.id === slug + '-s');
    assert.ok(Math.abs(ratioOf(s) - target) / target < 0.01, 'tỷ lệ Nhỏ lệch: ' + ratio);
  });
});

test('nhãn pixel dạng "1280×720", đúng cho mọi preset', () => {
  EXPECTED.forEach((want, k) => {
    assert.equal(shotPresetPx(SHOT_PRESETS[k]), want.w + '×' + want.h);
  });
  assert.equal(shotPresetPx(shotPreset('4x3-s')), '640×480');
});

test('preset mặc định 16:9 – Trung bình 1280×720', () => {
  assert.equal(SHOT_PRESET_DEFAULT, '16x9-m');
  const def = shotPreset(SHOT_PRESET_DEFAULT);
  assert.equal(def.ratio, '16:9');
  assert.equal(def.name, 'Trung bình');
  assert.equal(def.w, 1280);
  assert.equal(def.h, 720);
});

test('id lạ / rỗng rơi về preset mặc định', () => {
  for (const bad of [undefined, null, '', 'm', 'xs', 'desktop', 42, '16X9-M']) {
    assert.equal(shotPreset(bad).id, '16x9-m', 'id lạ: ' + String(bad));
  }
});

test('id không trùng, không còn preset cũ', () => {
  const ids = new Set();
  for (const p of SHOT_PRESETS) {
    assert.ok(!ids.has(p.id), 'id trùng: ' + p.id);
    ids.add(p.id);
    assert.ok(/^[0-9.]{1,5}x[0-9]{1,2}-[lms]$/.test(p.id), 'id sai dạng: ' + p.id);
  }
  for (const old of ['xs', 's', 'm', 'wide', 'l', 'sharp', 'desktop', 'xl']) {
    assert.ok(!ids.has(old), 'còn preset cũ: ' + old);
  }
});

test('shotFitScale: phóng vừa khung, không méo, không vượt khung', () => {
  assert.equal(shotFitScale(400, 200, 1280, 720), 3.2);      // giới hạn bề ngang
  assert.equal(shotFitScale(400, 2000, 1280, 720), 0.36);    // giới hạn chiều cao
  assert.equal(shotFitScale(0, 0, 1280, 720), 1);
  const k = shotFitScale(500, 300, 640, 360);
  assert.ok(500 * k <= 640 + 1e-9 && 300 * k <= 360 + 1e-9);
});

test('shotLayoutWidth: tìm đúng chiều rộng cho khớp tỷ lệ khung', () => {
  // Card giả: cao = 40000 / w  → tỷ lệ (w+32)/h tăng dần theo w.
  const measure = (w) => 40000 / w;
  const w = shotLayoutWidth(measure, 16 / 9, 220, 1280, 16);
  const ratio = (w + 32) / measure(w);
  assert.ok(Math.abs(ratio - 16 / 9) < 0.08, 'tỷ lệ tìm được: ' + ratio.toFixed(3));
  assert.ok(w >= 220 && w <= 1280);
});

test('shotLayoutWidth: bài quá dài lấy wMax, bài quá ngắn lấy wMin', () => {
  assert.equal(shotLayoutWidth(() => 5000, 16 / 9, 220, 1280, 16), 1280);
  assert.equal(shotLayoutWidth(() => 10, 16 / 9, 220, 1280, 16), 220);
});

/* ---- Hợp đồng nối dây: preset phải thật sự chạy trong luồng chụp ---- */

test('buildPostImage xuất đúng khung W×H của preset', () => {
  assert.match(html, /async function buildPostImage\(p, preset\)/);
  assert.match(html, /const targetW = shot\.w;/);
  assert.match(html, /const targetH = shot\.h;/);
  assert.match(html, /canvas\.width = targetW;/);
  assert.match(html, /canvas\.height = targetH;/);
  assert.match(html, /shotFitScale\(cardW, cardH, targetW, targetH\)/);
  assert.ok(!/SHOT_WIDTH|SHOT_SCALE|SHOT_MIN_FONT/.test(html), 'vẫn còn hằng số cứng cũ');
});

test('menu nhóm theo tỷ lệ và ghi rõ tên kèm tỷ lệ', () => {
  assert.match(html, /className = 'shot-menu-group'/);
  assert.match(html, /preset\.ratio \+ ' – ' \+ T\(preset\.name\)/);
  assert.match(html, /px\.textContent = shotPresetPx\(preset\)/);
});

test('hộp chọn là dialog cố định, có nút ×, không tự đóng khi cuộn/chọn', () => {
  assert.match(html, /id="shotMenu"[^>]*role="dialog"/);
  assert.match(html, /id="shotMenuClose"/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.ok(!/addEventListener\('scroll'[^\n]*closeShotMenu/.test(html), 'vẫn còn đóng hộp khi cuộn');
  assert.ok(!/function chooseShotSize[\s\S]{0,900}?closeShotMenu\(/.test(html), 'chọn cỡ vẫn tự đóng hộp');
  assert.match(html, /function chooseShotSize[\s\S]{0,900}?buildShotMenu\(\);/);
});

test('capturePost dùng preset từ settings và giữ cỡ khi mở preview', () => {
  assert.match(html, /const preset = shotPreset\(state\.settings\.shotSize\);/);
  assert.match(html, /buildPostImage\(p, preset\)/);
  assert.match(html, /openShotPreview\(p, canvas\.toDataURL\('image\/png'\), blob, preset\)/);
});

test('settings.shotSize được lưu và chuẩn hoá khi đọc lại', () => {
  assert.match(html, /shotSize: '16x9-m',/);
  assert.match(html, /if \(!SHOT_PRESETS\.some\(\(p\) => p\.id === settings\.shotSize\)\) settings\.shotSize = SHOT_PRESET_DEFAULT;/);
});

test('đủ bản dịch EN cho 3 nhãn cỡ', () => {
  assert.ok(html.includes("'Nhỏ': 'Small'"));
  assert.ok(html.includes("'Trung bình': 'Medium'"));
  assert.ok(html.includes("'Lớn': 'Large'"));
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
