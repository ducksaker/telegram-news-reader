// Smoke test không cần trình duyệt cho tính năng tag: nạp CHÍNH JS của index.html
// vào Node với DOM/localStorage giả, bấm đúng listener mà app đăng ký.
// Kèm kiểm tra "tải lại app" bằng cách boot lần hai trên cùng kho localStorage.
// Chạy: node tests/tags.dom.smoke.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const appSrc = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).find((s) => s.includes('TAGS_END'));
if (!appSrc) throw new Error('không tìm thấy script chính trong index.html');

const checks = [];
function check(name, ok, detail) {
  checks.push(!!ok);
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  → ' + detail : ''));
}

/* ---------------- Một môi trường app = DOM giả + localStorage giả ---------------- */
function createEnv(seed, opts) {
  const options = opts || {};
  const created = new Set();
  const byId = new Map();
  let activeElement = null;
  const store = new Map(Object.entries(seed || {}));
  const confirmMsgs = [];

  class El {
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
      this.offsetWidth = 252;
      this.offsetHeight = 240;
      this.tabIndex = 0;
      const attrs = this.attrs;
      this.dataset = new Proxy({}, {
        get: (_t, k) => attrs.get('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())),
        set: (_t, k, v) => {
          attrs.set('data-' + String(k).replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), String(v));
          return true;
        },
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
    appendChild(node) {
      node.parentNode = this;
      this.children.push(node);
      if (node.tagName === 'OPTION') this.options.push(node);
      return node;
    }
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
      const s = String(sel || '').trim();
      if (!s) return false;
      const parts = s.split(/\s+/);
      if (parts.length > 1) {
        if (!this.matches(parts[parts.length - 1])) return false;
        let n = this.parentNode;
        for (let k = parts.length - 2; k >= 0; k--) {
          while (n && !n.matches(parts[k])) n = n.parentNode;
          if (!n) return false;
          n = n.parentNode;
        }
        return true;
      }
      if (s[0] === '#') return this.attrs.get('id') === s.slice(1);
      if (s[0] === '.') return this._classes.has(s.slice(1));
      const m = s.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (m) {
        const v = this.getAttribute(m[1]);
        return m[2] === undefined ? v !== null : v === m[2];
      }
      const t = s.match(/^([a-zA-Z][\w-]*)/);
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

  const el = (id, tag) => {
    if (!byId.has(id)) {
      const e = new El(tag || 'div');
      e.setAttribute('id', id);
      byId.set(id, e);
    }
    return byId.get(id);
  };

  const document = {
    documentElement: new El('html'),
    body: new El('body'),
    hidden: false,
    querySelector(sel) {
      if (sel && sel[0] === '#' && sel.indexOf(' ') < 0) return byId.get(sel.slice(1)) || el(sel.slice(1));
      return [...created].find((e) => e.isConnected && e.matches(sel)) || null;
    },
    querySelectorAll(sel) { return [...created].filter((e) => e.isConnected && e.matches(sel)); },
    getElementById(id) { return this.querySelector('#' + id); },
    createElement(tag) { return new El(tag); },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(document, 'activeElement', {
    get: () => activeElement,
    set: (v) => { activeElement = v; },
  });

  ['feed', 'shotMenu', 'tagBar', 'tagChips', 'tagMenu', 'tagMenuTitle', 'tagMenuInput', 'tagMenuList',
    'tagMenuHint', 'tagMenuClose', 'tagSuggest', 'tagPanel', 'tagBackdrop', 'tagPanelClose', 'tagRows',
    'tagNewInput', 'tagNewBtn', 'tagPanelMsg', 'btnTags', 'chList', 'optFont', 'optWidth', 'optView',
    'optInterval', 'optCount', 'optSource', 'btnLang', 'btnTheme', 'themePanel', 'themeGrid',
    'themeBackdrop', 'themeClose', 'optCrt', 'btnTransfer', 'chTransferPanel', 'chTransferBackdrop',
    'chTransferClose', 'chExport', 'chImport', 'chTransferText', 'chTransferMsg', 'lightbox', 'lbClose',
    'lbPrev', 'lbNext', 'lbCopy', 'lbImg', 'lbStage', 'lbCount', 'lbCaption', 'lbLink', 'lbNote',
    'lbNoteLink', 'lbMsg', 'banner', 'countdown', 'chSource', 'compose', 'search', 'btnRefresh', 'btnAdd',
    'statusLine', 'trLine', 'errLine', 'formMsg', 'fixPanel', 'chInput', 'chForm', 'proxyPill'].forEach((id) => el(id));
  el('tagBar').hidden = true;
  el('tagMenu').hidden = true;
  el('tagPanel').hidden = true;
  el('tagBackdrop').hidden = true;
  el('lightbox').hidden = true;

  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };

  const window = {
    innerWidth: 1280,
    innerHeight: 900,
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    confirm: (msg) => { confirmMsgs.push(msg); return true; },
  };

  const ctx = {
    console,
    document,
    window,
    localStorage,
    navigator: { clipboard: undefined, userAgent: 'node-stub' },
    getComputedStyle: () => ({ getPropertyValue: () => '', fontFamily: 'monospace' }),
    Image: class { decode() { return Promise.resolve(); } },
    Blob: class {},
    URL: { createObjectURL: () => '', revokeObjectURL() {} },
    setTimeout: (fn) => { if (typeof fn === 'function') fn(); return 1; },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    // Mặc định giữ refresh ở trạng thái chờ để test không phụ thuộc mạng.
    fetch: options.fetch || (() => new Promise(() => {})),
    AbortController: AbortController,
    XMLSerializer: class { serializeToString() { return ''; } },
    ClipboardItem: undefined,
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;

  vm.createContext(ctx);
  vm.runInContext(appSrc, ctx, { filename: 'index.html:inline.js' });

  const fire = (node, type, extra) => {
    const fn = (node._ev || {})[type];
    if (!fn) throw new Error('không có listener ' + type + ' trên ' + (node.getAttribute('id') || node.tagName));
    fn(Object.assign({ target: node, preventDefault() {}, key: '', metaKey: false, ctrlKey: false, shiftKey: false }, extra || {}));
  };
  const clickVia = (container, target) => fire(el(container), 'click', { target });

  return { el, fire, clickVia, store, confirmMsgs, document };
}

const fakeChip = (env, username) => {
  const chip = env.el('div');
  chip.className = 'chip';
  chip.setAttribute('data-user', username);
  return chip;
};
const storedChannels = (env) => JSON.parse(env.store.get('tgnews.channels.v3') || '{}');
const storedSettings = (env) => JSON.parse(env.store.get('tgnews.settings.v1') || '{}');

/* ---------------- Chuẩn bị dữ liệu ---------------- */
const SEED = {
  'tgnews.channels.v3': JSON.stringify({
    v: 3,
    channels: [
      { type: 'telegram', username: 'alpha', title: 'Alpha', color: '#4ea1ff', enabled: true, addedAt: 1, tags: ['t1'] },
      { type: 'telegram', username: 'beta', title: 'Beta', color: '#f472b6', enabled: true, addedAt: 2, tags: ['t1', 't2'] },
      { type: 'telegram', username: 'gamma', title: 'Gamma', color: '#34d399', enabled: true, addedAt: 3, tags: [] },
    ],
    tags: [
      { id: 't1', name: 'Political', createdAt: 1 },
      { id: 't2', name: 'Tech', createdAt: 2 },
      { id: 't3', name: 'Kinh tế', createdAt: 3 },
    ],
  }),
  'tgnews.settings.v1': JSON.stringify({ v: 1, tagFilter: [], count: 20 }),
};

const env = createEnv(SEED);

/* 1. Dải chip đọc đúng tag + số kênh. */
const bar = env.el('tagBar');
const chipsHtml = env.el('tagChips').innerHTML;
check('dải tag hiện khi có tag', bar.hidden === false);
check('có chip "Tất cả"', /Tất cả/.test(chipsHtml));
check('3 chip tag kèm số kênh', /#Political/.test(chipsHtml) && /#Tech/.test(chipsHtml) &&
  /#Kinh tế/.test(chipsHtml) && /tag-n">2</.test(chipsHtml) && /tag-n">0</.test(chipsHtml), chipsHtml.slice(0, 120));
check('mỗi chip tag có màu riêng (--t)', (chipsHtml.match(/style="--t:#[0-9a-f]{6}"/gi) || []).length === 3,
  (chipsHtml.match(/--t:#[0-9a-f]{6}/gi) || []).join(' '));

/* 2. Bấm chip để lọc / bỏ lọc. */
const chipPolitical = env.el('button');
chipPolitical.className = 'tag-chip';
chipPolitical.setAttribute('data-tag', 't1');
env.clickVia('tagChips', chipPolitical);
check('bấm chip Political → lưu bộ lọc', JSON.stringify(storedSettings(env).tagFilter) === '["t1"]',
  JSON.stringify(storedSettings(env).tagFilter));
check('chip đang lọc có aria-pressed=true', /data-tag="t1"[^>]*aria-pressed="true"/.test(env.el('tagChips').innerHTML));
// Kênh ngoài tag phải đổi trạng thái ngay trên danh sách kênh (không chỉ feed).
check('chọn tag → kênh ngoài phạm vi bị mờ (scope-out)',
  /data-user="gamma"|scope-out/.test(env.el('chList').innerHTML) &&
  /class="chip on scope-out"[^>]*data-user="gamma"/.test(env.el('chList').innerHTML),
  (env.el('chList').innerHTML.match(/class="chip[^"]*"[^>]*data-user="[^"]+"/g) || []).join(' | '));
check('chọn tag → hiện badge đếm phạm vi',
  /Lọc tag: 2\/3 kênh/.test(env.el('chScope').textContent), env.el('chScope').textContent);

const chipAll = env.el('button');
chipAll.className = 'tag-chip all';
chipAll.setAttribute('data-tag', '*');
env.clickVia('tagChips', chipAll);
check('bấm "Tất cả" → bỏ lọc', JSON.stringify(storedSettings(env).tagFilter) === '[]');
check('bỏ lọc → không còn kênh nào bị mờ', !/scope-out/.test(env.el('chList').innerHTML));
check('bỏ lọc → ẩn badge phạm vi', env.el('chScope').hidden === true);

/* 3. Chip kênh có nút # và bấm mở popover. */
const chHtml = env.el('chList').innerHTML;
check('chip kênh có nút # kèm số tag', /data-user="alpha"/.test(chHtml) && /chip-tag on/.test(chHtml),
  (chHtml.match(/chip-tag[^>]*>[^<]*</) || [''])[0]);

const alphaChip = fakeChip(env, 'alpha');
const alphaTagBtn = env.el('button');
alphaTagBtn.className = 'chip-tag';
alphaChip.appendChild(alphaTagBtn);
env.clickVia('chList', alphaTagBtn);
const menu = env.el('tagMenu');
check('bấm # mở popover gắn tag', menu.hidden === false);
check('tiêu đề popover đúng kênh', /@alpha/.test(env.el('tagMenuTitle').textContent), env.el('tagMenuTitle').textContent);
check('liệt kê đủ tag để chọn', /Political/.test(env.el('tagMenuList').innerHTML) &&
  /Tech/.test(env.el('tagMenuList').innerHTML) && /Kinh tế/.test(env.el('tagMenuList').innerHTML));
check('đếm 1/10 tag', /1\/10 tag/.test(env.el('tagMenuHint').textContent), env.el('tagMenuHint').textContent);

/* 4. Gắn tag bằng cách bấm trong danh sách. */
const pickTech = env.el('button');
pickTech.className = 'tag-pick';
pickTech.setAttribute('data-id', 't2');
env.clickVia('tagMenu', pickTech);
const alphaTags = () => storedChannels(env).channels.find((c) => c.username === 'alpha').tags;
check('bấm Tech → gắn vào alpha', alphaTags().includes('t2'), JSON.stringify(alphaTags()));
check('hint cập nhật 2/10', /2\/10 tag/.test(env.el('tagMenuHint').textContent));

/* 5. Gõ tên mới (có # và khoảng trắng thừa) rồi Enter. */
const input = env.el('tagMenuInput');
input.value = '  #Crypto  ';
env.fire(input, 'keydown', { key: 'Enter' });
let tags = storedChannels(env).tags;
check('tạo tag mới "Crypto" (bỏ # và khoảng trắng)', tags.some((t) => t.name === 'Crypto'), JSON.stringify(tags.map((t) => t.name)));
check('gắn luôn tag vừa tạo cho alpha', alphaTags().length === 3, JSON.stringify(alphaTags()));

/* 6. Nhập lại khác hoa thường → dùng lại tag cũ, không tạo trùng. */
input.value = ' #CRYPTO ';
env.fire(input, 'keydown', { key: 'Enter' });
tags = storedChannels(env).tags;
check('không tạo tag trùng khi chỉ khác hoa thường/#', tags.length === 4, 'tags=' + tags.length);

/* 7. Panel quản lý: mở, thấy đủ tag + số kênh. */
env.fire(env.el('btnTags'), 'click');
check('mở panel quản lý tag', env.el('tagPanel').hidden === false);
const rowsHtml = env.el('tagRows').innerHTML;
check('panel liệt kê 4 tag', (rowsHtml.match(/class="tag-row"/g) || []).length === 4);
check('có dòng "Kinh tế" 0 kênh', /Kinh tế/.test(rowsHtml) && /0 kênh/.test(rowsHtml));
check('panel có chấm màu cho từng tag', (rowsHtml.match(/class="tag-dot"/g) || []).length === 4);

/* 7b. Đổi màu tag: xoay vòng palette, lưu lại, không trùng màu tag khác. */
const colorRow = env.el('div');
colorRow.className = 'tag-row';
colorRow.setAttribute('data-id', 't1');
const colorBtn = env.el('button');
colorBtn.setAttribute('data-act', 'tag-color');
colorRow.appendChild(colorBtn);
const colorBefore = storedChannels(env).tags.find((t) => t.id === 't1').color;
env.clickVia('tagRows', colorBtn);
const colorAfter = storedChannels(env).tags.find((t) => t.id === 't1').color;
check('bấm chấm màu → đổi màu tag', colorAfter && colorAfter !== colorBefore,
  colorBefore + ' → ' + colorAfter);
check('màu mới hợp lệ và không trùng tag khác',
  /^#[0-9a-f]{6}$/i.test(colorAfter) &&
  storedChannels(env).tags.filter((t) => t.id !== 't1').every((t) => t.color !== colorAfter),
  JSON.stringify(storedChannels(env).tags.map((t) => t.color)));

/* 8. Đổi tên tag → liên kết kênh giữ nguyên id. */
const crypto = () => storedChannels(env).tags.find((t) => t.name === 'Crypto' || t.name === 'Tiền số');
const cryptoId = crypto().id;
const renameRow = env.el('div');
renameRow.className = 'tag-row';
renameRow.setAttribute('data-id', cryptoId);
const renameInput = env.el('input');
renameInput.setAttribute('data-act', 'tag-name');
renameInput.value = 'Tiền số';
renameRow.appendChild(renameInput);
const saveBtn = env.el('button');
saveBtn.setAttribute('data-act', 'tag-save');
renameRow.appendChild(saveBtn);
env.clickVia('tagRows', saveBtn);
check('đổi tên tag lưu đúng', storedChannels(env).tags.some((t) => t.name === 'Tiền số'),
  JSON.stringify(storedChannels(env).tags.map((t) => t.name)));
check('đổi tên không làm mất liên kết kênh', alphaTags().includes(cryptoId), JSON.stringify(alphaTags()));
check('báo đã lưu tên', /Đã lưu tên tag/.test(env.el('tagPanelMsg').textContent));

/* 9. Đổi tên trùng tag khác → báo lỗi, không đổi. */
renameInput.value = 'Tech';
env.clickVia('tagRows', saveBtn);
check('đổi tên trùng bị từ chối', /Đã có tag cùng tên/.test(env.el('tagPanelMsg').textContent),
  env.el('tagPanelMsg').textContent);
check('tên tag không đổi khi trùng', storedChannels(env).tags.some((t) => t.name === 'Tiền số'));

/* 10. Xoá tag: xác nhận có số kênh, gỡ khỏi mọi kênh. */
const delRow = env.el('div');
delRow.className = 'tag-row';
delRow.setAttribute('data-id', cryptoId);
const delBtn = env.el('button');
delBtn.setAttribute('data-act', 'tag-del');
delRow.appendChild(delBtn);
env.clickVia('tagRows', delBtn);
check('hỏi xác nhận trước khi xoá', env.confirmMsgs.length === 1 && /1 kênh/.test(env.confirmMsgs[0]),
  env.confirmMsgs[0]);
check('tag bị xoá khỏi danh sách', !storedChannels(env).tags.some((t) => t.id === cryptoId));
check('tag bị gỡ khỏi kênh', !alphaTags().includes(cryptoId), JSON.stringify(alphaTags()));

/* 11. Xoá kênh → liên kết tag của kênh đó biến mất, tag vẫn còn. */
const betaChip = fakeChip(env, 'beta');
const betaX = env.el('button');
betaX.className = 'chip-x';
betaChip.appendChild(betaX);
env.clickVia('chList', betaX);
check('xoá kênh beta', !storedChannels(env).channels.some((c) => c.username === 'beta'));
check('tag không bị xoá theo kênh', storedChannels(env).tags.length === 3);
check('không còn dữ liệu mồ côi: mọi tag id trong kênh đều tồn tại',
  storedChannels(env).channels.every((c) => c.tags.every((id) => storedChannels(env).tags.some((t) => t.id === id))));

/* 12. Lọc theo tag không còn kênh nào (Kinh tế) → trạng thái rỗng + nút bỏ lọc. */
const chipEmptyTag = env.el('button');
chipEmptyTag.className = 'tag-chip';
chipEmptyTag.setAttribute('data-tag', 't3');
env.clickVia('tagChips', chipEmptyTag);
check('lọc "Kinh tế" (0 kênh) → trạng thái rỗng', /Không kênh nào có tag đang chọn/.test(env.el('feed').innerHTML),
  env.el('feed').innerHTML.slice(0, 120));
const clearBtn = env.el('button');
clearBtn.setAttribute('data-act', 'clear-tags');
env.clickVia('feed', clearBtn);
check('bấm "Bỏ lọc tag" → xoá bộ lọc', JSON.stringify(storedSettings(env).tagFilter) === '[]');

/* 13. "Tải lại app": boot lại trên cùng kho dữ liệu. */
const savedSettings = JSON.stringify(Object.assign(storedSettings(env), { tagFilter: ['t1'] }));
const seed2 = {
  'tgnews.channels.v3': env.store.get('tgnews.channels.v3'),
  'tgnews.settings.v1': savedSettings,
};
const env2 = createEnv(seed2);
const chips2 = env2.el('tagChips').innerHTML;
check('reload: tag còn nguyên', /#Political/.test(chips2) && /#Kinh tế/.test(chips2), chips2.slice(0, 100));
check('reload: bộ lọc đang chọn được giữ', /data-tag="t1"[^>]*aria-pressed="true"/.test(chips2));
check('reload: liên kết tag–kênh còn nguyên',
  /data-user="alpha"/.test(env2.el('chList').innerHTML) && /chip-tag on/.test(env2.el('chList').innerHTML));

/* 14. Không có tag + không lọc → ẩn dải chip. */
const env3 = createEnv({
  'tgnews.channels.v3': JSON.stringify({
    v: 3,
    channels: [{ type: 'telegram', username: 'solo', title: 'Solo', color: '#4ea1ff', enabled: true, addedAt: 1, tags: [] }],
    tags: [],
  }),
});
check('chưa có tag → ẩn dải chip', env3.el('tagBar').hidden === true);

/* 15. Migrate dữ liệu cũ v2 → v3 (kênh cũ nhận tags rỗng, key cũ bị xoá). */
const env4 = createEnv({
  'tgnews.channels.v2': JSON.stringify({
    v: 2,
    channels: [{ type: 'telegram', username: 'legacy', title: 'Legacy', color: '#4ea1ff', enabled: true, addedAt: 5 }],
  }),
});
const migrated = JSON.parse(env4.store.get('tgnews.channels.v3') || 'null');
check('v2 → v3: ghi key mới', !!migrated && migrated.v === 3 && migrated.channels.length === 1);
check('v2 → v3: kênh cũ nhận tags rỗng', migrated && Array.isArray(migrated.channels[0].tags) && migrated.channels[0].tags.length === 0);
check('v2 → v3: xoá key cũ', !env4.store.has('tgnews.channels.v2'));

/* 16. Tag id mồ côi trong dữ liệu lưu không hiện ra UI. */
const env5 = createEnv({
  'tgnews.channels.v3': JSON.stringify({
    v: 3,
    channels: [{ type: 'telegram', username: 'alpha', title: 'Alpha', color: '#4ea1ff', enabled: true, addedAt: 1, tags: ['t1', 'ghost'] }],
    tags: [{ id: 't1', name: 'Political', createdAt: 1 }],
  }),
});
check('id tag không tồn tại bị bỏ khi đọc', /chip-tag on[^>]*>#1</.test(env5.el('chList').innerHTML),
  (env5.el('chList').innerHTML.match(/chip-tag[^>]*>[^<]*</) || [''])[0]);

/* 17. End-to-end: cào thật (fetch giả) → bài hiện ra → chọn tag → feed chỉ còn kênh khớp. */
const tweetFixture = (user, texts) => texts.map((text, k) => ({
  id: user + '-' + k,
  created_timestamp: String(1700000000 + k),
  created_at: '2026-11-08T10:00:00Z',
  text: text,
  url: 'https://x.com/' + user + '/status/' + user + '-' + k,
  author: { screen_name: user, name: user.toUpperCase() },
}));
const fakeFetch = (url) => {
  const m = String(url).match(/\/2\/profile\/([^/]+)\/statuses/);
  const user = m ? m[1] : 'unknown';
  const texts = user === 'beta' ? ['TIN CUA BETA'] : ['TIN CUA ALPHA'];
  return Promise.resolve({
    ok: true, status: 200,
    json: async () => ({ code: 200, results: tweetFixture(user, texts), cursor: {} }),
  });
};
const env6 = createEnv({
  'tgnews.channels.v3': JSON.stringify({
    v: 3,
    channels: [
      { type: 'twitter', username: 'alpha', title: 'Alpha', color: '#4ea1ff', enabled: true, addedAt: 1, tags: ['t-tech'] },
      { type: 'twitter', username: 'beta', title: 'Beta', color: '#f472b6', enabled: true, addedAt: 2, tags: ['t-news'] },
    ],
    tags: [
      { id: 't-tech', name: 'Tech', color: '#34d399', createdAt: 1 },
      { id: 't-news', name: 'News', color: '#fb7185', createdAt: 2 },
    ],
  }),
  'tgnews.settings.v1': JSON.stringify({ v: 1, translate: false, view: 'channels', tagFilter: [] }),
}, { fetch: fakeFetch });
env6.fire(env6.el('btnRefresh'), 'click');
await new Promise((r) => setImmediate(r));
await new Promise((r) => setImmediate(r));
const feedAll = env6.el('feed').innerHTML;
check('cào xong: feed có bài của cả 2 kênh', /TIN CUA ALPHA/.test(feedAll) && /TIN CUA BETA/.test(feedAll),
  feedAll.replace(/<[^>]+>/g, ' ').slice(0, 120));

const techChip = env6.el('button');
techChip.className = 'tag-chip';
techChip.setAttribute('data-tag', 't-tech');
env6.clickVia('tagChips', techChip);
const feedTagged = env6.el('feed').innerHTML;
check('chọn tag Tech → feed chỉ còn bài kênh alpha', /TIN CUA ALPHA/.test(feedTagged) && !/TIN CUA BETA/.test(feedTagged),
  feedTagged.replace(/<[^>]+>/g, ' ').slice(0, 120));
check('chọn tag Tech → status chỉ đếm 1 kênh', /1 kênh/.test(env6.el('statusLine').textContent),
  env6.el('statusLine').textContent);

const allChip = env6.el('button');
allChip.className = 'tag-chip all';
allChip.setAttribute('data-tag', '*');
env6.clickVia('tagChips', allChip);
check('bấm Tất cả → bài của cả 2 kênh quay lại',
  /TIN CUA BETA/.test(env6.el('feed').innerHTML), env6.el('feed').innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 80));

const failed = checks.filter((c) => !c).length;
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' check pass' + (failed ? ' — CÓ LỖI' : ''));
process.exit(failed ? 1 : 0);
