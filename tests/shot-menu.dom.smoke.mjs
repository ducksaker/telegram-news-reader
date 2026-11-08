// Smoke test không cần trình duyệt: nạp CHÍNH đoạn JS nhúng của index.html vào
// Node với DOM/localStorage giả, rồi bấm đúng listener mà app đã đăng ký.
// Mục tiêu: kiểm chứng đường đi của menu chọn cỡ ảnh (mở, chọn, lưu, phím, i18n).
// Chạy: node tests/shot-menu.dom.smoke.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const app = scripts.find((s) => s.includes('SHOT_PRESETS_END'));
if (!app) throw new Error('không tìm thấy script chính trong index.html');

/* ---------------- DOM giả tối thiểu ---------------- */
const created = new Set();
let activeElement = null;

function addTo(parent, node) {
  node.parentNode = parent;
  parent.children.push(node);
  if (node.tagName === 'OPTION') parent.options.push(node);
  return node;
}

class StubEl {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.nodeType = 1;
    this.children = [];
    this.parentNode = null;
    this.attrs = new Map();
    this._html = '';
    this._text = '';
    this.value = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.options = [];
    this.isConnected = true;
    this.offsetWidth = 220;
    this.offsetHeight = 240;
    const attrs = this.attrs;
    this.dataset = new Proxy({}, {
      get: (_t, k) => attrs.get('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())),
      set: (_t, k, v) => {
        attrs.set('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), String(v));
        return true;
      },
      has: (_t, k) => attrs.has('data-' + String(k)),
    });
    const classes = new Set();
    this._classes = classes;
    this.classList = {
      add: (...c) => { c.forEach((x) => x && classes.add(x)); },
      remove: (...c) => { c.forEach((x) => classes.delete(x)); },
      toggle: (c, force) => {
        const on = force === undefined ? !classes.has(c) : !!force;
        if (on) classes.add(c); else classes.delete(c);
        return on;
      },
      contains: (c) => classes.has(c),
    };
    this.style = {
      setProperty(k, v) { this[k] = v; },
      removeProperty(k) { delete this[k]; },
      getPropertyValue(k) { return this[k] == null ? '' : this[k]; },
      cssText: '',
    };
    created.add(this);
  }
  get className() { return [...this._classes].join(' '); }
  set className(v) {
    this._classes.clear();
    String(v).split(/\s+/).forEach((c) => c && this._classes.add(c));
  }
  // Gán textContent trong DOM thật sẽ xoá con — app dựa vào điều này khi dựng lại menu.
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(v) {
    this._text = String(v);
    this.children.forEach((c) => { c.parentNode = null; c.isConnected = false; });
    this.children.length = 0;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    this.children.forEach((c) => { c.parentNode = null; c.isConnected = false; });
    this.children.length = 0;
  }
  appendChild(node) { return addTo(this, node); }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    return node;
  }
  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
    this.isConnected = false;
  }
  setAttribute(k, v) { this.attrs.set(String(k), String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { (this._ev = this._ev || {})[type] = fn; }
  removeEventListener() {}
  focus() { activeElement = this; }
  blur() { if (activeElement === this) activeElement = null; }
  click() {
    const fn = this._ev && this._ev.click;
    if (fn) fn({ target: this, preventDefault() {} });
  }
  getBoundingClientRect() {
    return { left: 600, top: 500, right: 680, bottom: 520, width: 80, height: 20 };
  }
  matches(sel) {
    if (!sel) return false;
    if (sel[0] === '#') return this.attrs.get('id') === sel.slice(1);
    if (sel[0] === '.') return this._classes.has(sel.slice(1));
    const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (m) {
      const v = this.getAttribute(m[1]);
      return m[2] === undefined ? v !== null : v === m[2];
    }
    const t = sel.match(/^([a-zA-Z][\w-]*)/);
    return t ? this.tagName === t[1].toUpperCase() : false;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      node.children.forEach((c) => {
        if (c.matches && c.matches(sel)) out.push(c);
        walk(c);
      });
    };
    walk(this);
    return out;
  }
  closest(sel) {
    let n = this;
    while (n) {
      if (n.matches && n.matches(sel)) return n;
      n = n.parentNode;
    }
    return null;
  }
}

const byId = new Map();
function el(id, tag = 'div') {
  if (!byId.has(id)) {
    const e = new StubEl(tag);
    e.setAttribute('id', id);
    byId.set(id, e);
  }
  return byId.get(id);
}

const body = new StubEl('body');
const documentElement = new StubEl('html');
const documentHandlers = {};

const document = {
  documentElement,
  body,
  hidden: false,
  querySelector(sel) {
    if (sel && sel[0] === '#') return byId.get(sel.slice(1)) || el(sel.slice(1));
    return [...created].find((e) => e.isConnected && e.matches(sel)) || null;
  },
  querySelectorAll(sel) { return [...created].filter((e) => e.isConnected && e.matches(sel)); },
  getElementById(id) { return this.querySelector('#' + id); },
  createElement(tag) { return new StubEl(tag); },
  createTextNode(text) { const t = new StubEl('#text'); t.textContent = String(text); return t; },
  addEventListener(type, fn) { (documentHandlers[type] = documentHandlers[type] || []).push(fn); },
  removeEventListener() {},
};
Object.defineProperty(document, 'activeElement', {
  get: () => activeElement,
  set: (v) => { activeElement = v; },
});

// Các phần tử app luôn có trong HTML thật.
['feed', 'shotMenu', 'optFont', 'optWidth', 'optView', 'optInterval', 'optCount', 'optSource',
  'btnLang', 'btnTheme', 'themePanel', 'themeGrid', 'themeBackdrop', 'themeClose', 'optCrt',
  'btnTransfer', 'chTransferPanel', 'chTransferBackdrop', 'chTransferClose', 'chExport', 'chImport',
  'lightbox', 'lbClose', 'lbPrev', 'lbNext', 'lbCopy', 'lbImg', 'lbStage', 'lbCount', 'lbCaption',
  'lbLink', 'lbNote', 'lbNoteLink', 'lbMsg', 'banner', 'countdown', 'chSource', 'compose', 'search',
  'btnRefresh', 'btnAdd', 'status', 'toast', 'fixPanel'].forEach((id) => el(id));
el('shotMenu')._classes.add('shot-menu');
el('shotMenu').hidden = true;
// Cấu trúc dialog thật: header + nút đóng + danh sách bên trong #shotMenu.
el('shotMenu').appendChild(el('shotMenuTitle'));
el('shotMenu').appendChild(el('shotMenuClose'));
el('shotMenu').appendChild(el('shotMenuList'));

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};

const windowHandlers = {};
const window = {
  innerWidth: 1280,
  innerHeight: 900,
  addEventListener: (type, fn) => { (windowHandlers[type] = windowHandlers[type] || []).push(fn); },
  removeEventListener() {},
  scrollTo() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
};

class ImageStub {
  constructor() { this.naturalWidth = 1; this.naturalHeight = 1; }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  decode() { return Promise.resolve(); }
}

const ctx = {
  console,
  document,
  window,
  localStorage,
  navigator: { clipboard: undefined, userAgent: 'node-stub' },
  getComputedStyle: () => ({ getPropertyValue: () => '', fontFamily: 'monospace' }),
  Image: ImageStub,
  Blob: class {},
  URL: { createObjectURL: () => '', revokeObjectURL() {} },
  setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  fetch: () => new Promise(() => {}),
  XMLSerializer: class { serializeToString() { return ''; } },
  ClipboardItem: undefined,
  addEventListener() {},
};
ctx.globalThis = ctx;
ctx.self = ctx;

/* ---------------- Chạy app thật ---------------- */
vm.createContext(ctx);
try {
  vm.runInContext(app, ctx, { filename: 'index.html:inline.js' });
} catch (e) {
  console.error('App boot lỗi:', e && e.stack || e);
  process.exit(1);
}

const checks = [];
function check(name, ok, detail) {
  checks.push(!!ok);
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  → ' + detail : ''));
}

const feed = byId.get('feed');
const menu = byId.get('shotMenu');
const feedClick = (feed._ev || {}).click;
check('app boot xong và có listener click trên #feed', typeof feedClick === 'function');

/* Bài giả + nhóm nút chụp, giống markup app sinh ra. */
function makeGroup(key) {
  const group = new StubEl('span');
  group.classList.add('shot-group');
  const main = new StubEl('button');
  main.setAttribute('data-act', 'shot');
  main.setAttribute('data-key', key);
  const label = new StubEl('span');
  label.classList.add('btn-label');
  label.textContent = 'Chụp hình';
  main.appendChild(label);
  const caret = new StubEl('button');
  caret.classList.add('linkbtn', 'shot-more');
  caret.setAttribute('data-act', 'shot-size');
  caret.setAttribute('data-key', key);
  caret.setAttribute('aria-expanded', 'false');
  group.appendChild(main);
  group.appendChild(caret);
  const article = new StubEl('article');
  article.classList.add('post');
  article.setAttribute('data-key', key);
  article.appendChild(group);
  feed.appendChild(article);
  return { group, main, caret };
}

const fire = (node, type = 'click', extra = {}) => {
  const handler = (node._ev || {})[type];
  if (!handler) throw new Error('không có listener ' + type + ' trên ' + node.tagName);
  handler(Object.assign({ target: node, preventDefault() {}, metaKey: false, ctrlKey: false, shiftKey: false }, extra));
};

// Click bên trong #feed do listener uỷ quyền (delegation) xử lý, không phải
// listener trên từng nút — mô phỏng đúng đường sự kiện thật.
const clickInFeed = (node) => {
  if (typeof feedClick !== 'function') throw new Error('không có listener #feed');
  feedClick({ target: node, preventDefault() {}, metaKey: false, ctrlKey: false, shiftKey: false });
};
const clickMenu = (node) => fire(menu, 'click', { target: node });

const { main, caret } = makeGroup('k1');

/* 1. Mở menu. */
clickInFeed(caret);
const items = menu.querySelectorAll('.shot-menu-item');
const groups = menu.querySelectorAll('.shot-menu-group');
check('bấm ▾ mở menu (hidden=false)', menu.hidden === false);
check('menu có 36 preset (12 tỷ lệ × 3)', items.length === 36, items.length + ' item');
check('có 12 nhóm tỷ lệ', groups.length === 12 && groups[0].textContent === '16:9',
  groups.map((g) => g.textContent).join(', '));
check('preset mặc định "16:9 – Trung bình" được đánh dấu ✓',
  items.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('data-size')).join() === '16x9-m');
check('nút ▾ có aria-expanded=true', caret.getAttribute('aria-expanded') === 'true');
check('item dùng role=menuitemradio', items[0].getAttribute('role') === 'menuitemradio');
check('focus vào preset đang dùng', activeElement && activeElement.getAttribute('data-size') === '16x9-m');
check('menu được đặt trong viewport',
  parseFloat(menu.style.left) >= 0 && parseFloat(menu.style.left) + 220 <= 1280 &&
  parseFloat(menu.style.top) >= 0 && parseFloat(menu.style.top) + 240 <= 900,
  'left=' + menu.style.left + ' top=' + menu.style.top);
check('mỗi item ghi rõ tỷ lệ + tên + số pixel',
  items[2].children[1].textContent === '16:9 – Nhỏ' && items[2].children[2].textContent === '640×360',
  items[2].children[1].textContent + ' / ' + items[2].children[2].textContent);
check('thứ tự trong nhóm là Lớn → Trung bình → Nhỏ',
  items[0].children[1].textContent === '16:9 – Lớn' &&
  items[1].children[1].textContent === '16:9 – Trung bình' &&
  items[2].children[1].textContent === '16:9 – Nhỏ',
  [0, 1, 2].map((k) => items[k].children[1].textContent).join(' | '));

/* 2. Phím mũi tên + Escape. */
const menuKey = (menu._ev || {}).keydown;
check('menu có listener bàn phím', typeof menuKey === 'function');
menuKey({ key: 'ArrowDown', preventDefault() {} });
check('ArrowDown → preset kế tiếp (16:9 – Nhỏ)', activeElement.getAttribute('data-size') === '16x9-s',
  activeElement.getAttribute('data-size'));
menuKey({ key: 'Escape', preventDefault() {} });
check('Escape đóng menu', menu.hidden === true);
check('Escape trả focus về nút ▾', activeElement === caret);

/* 3. Hộp có nút đóng riêng; chọn cỡ thì GIỮ MỞ (chỉ đóng bằng ×/Esc/bấm ra ngoài). */
check('hộp có nút đóng riêng', !!byId.get('shotMenuClose'));
clickInFeed(caret);
const pickItem = menu.querySelectorAll('.shot-menu-item').find((b) => b.getAttribute('data-size') === '4x3-s');
clickMenu(pickItem);
const saved = JSON.parse(localStorage.getItem('tgnews.settings.v1') || '{}');
check('chọn "4:3 – Nhỏ" lưu settings.shotSize=4x3-s', saved.shotSize === '4x3-s', 'saved=' + saved.shotSize);
check('chọn xong hộp vẫn mở (không tự đóng)', menu.hidden === false);
check('dấu ✓ chuyển sang "4:3 – Nhỏ"',
  menu.querySelectorAll('.shot-menu-item')
    .filter((b) => b.getAttribute('aria-checked') === 'true')
    .map((b) => b.getAttribute('data-size')).join() === '4x3-s');
check('title nút chính cập nhật tỷ lệ + pixel mới',
  /4:3 – Nhỏ/.test(main.title) && /640×480/.test(main.title), main.title);
check('nút ▾ vẫn aria-expanded=true khi hộp mở', caret.getAttribute('aria-expanded') === 'true');

/* 4. Nút × đóng hộp và trả focus về nút ▾. */
fire(byId.get('shotMenuClose'));
check('bấm × đóng hộp', menu.hidden === true);
check('bấm × trả focus về nút ▾', activeElement === caret);
check('đóng xong aria-expanded=false', caret.getAttribute('aria-expanded') === 'false');

/* 5. Mở lại: dấu ✓ đi theo lựa chọn mới (nội dung cũ phải được dọn sạch). */
clickInFeed(caret);
const reopened = menu.querySelectorAll('.shot-menu-item');
check('mở lại hộp vẫn đúng 36 item (không cộng dồn)', reopened.length === 36, 'items=' + reopened.length);
check('mở lại thì ✓ ở "4:3 – Nhỏ"',
  reopened.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('data-size')).join() === '4x3-s');

/* 6. Đổi ngôn ngữ EN → nhãn menu + title dịch theo. */
const langBtn = byId.get('btnLang');
fire(langBtn);
clickInFeed(caret);
const enLabels = menu.querySelectorAll('.shot-menu-item').map((b) => b.children[1].textContent);
check('menu dịch sang EN', enLabels[0] === '16:9 – Large' && enLabels[35] === '2:3 – Small', enLabels.slice(0, 3).join(', '));
check('aria-label danh sách dịch', byId.get('shotMenuList').getAttribute('aria-label') === 'Choose screenshot size',
  byId.get('shotMenuList').getAttribute('aria-label'));
check('title nút chính dịch', /^Screenshot \(4:3 – Small/.test(main.title), main.title);

/* 6. Mở menu ở bài thứ hai vẫn dùng đúng cỡ đã lưu. */
const second = makeGroup('k2');
clickInFeed(second.caret);
check('bài khác cũng mở được menu', menu.hidden === false);
check('bài khác dùng cỡ đã lưu', menu.querySelectorAll('.shot-menu-item')
  .filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.getAttribute('data-size')).join() === '4x3-s');

const failed = checks.filter((c) => !c).length;
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' check pass' + (failed ? ' — CÓ LỖI' : ''));
process.exit(failed ? 1 : 0);
