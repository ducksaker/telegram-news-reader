// Smoke test bằng Chrome/Edge headless qua CDP: mở index.html qua file://, bấm nút ▾,
// đọc DOM + localStorage, chụp screenshot.
// LƯU Ý: cần môi trường cho phép chạy trình duyệt. Trong sandbox DSH, Chrome/Edge bị
// chặn IPC pipe (mojo: Access denied) nên script này không chạy được ở đó — dùng
// tests/shot-menu.dom.smoke.mjs (DOM giả, không cần trình duyệt) thay thế.
// Chạy: node tests/shot-menu.smoke.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pageUrl = pathToFileURL(resolve(here, '..', 'index.html')).href;
const outDir = process.env.SMOKE_OUT || mkdtempSync(join(tmpdir(), 'tgnr-smoke-'));

const CHROMES = [
  process.env.CHROME,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) throw new Error('không tìm thấy Chrome/Edge; đặt biến CHROME=<đường dẫn exe>');

const PORT = 9333;
const profile = mkdtempSync(join(tmpdir(), 'tgnr-profile-'));
const child = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', '--allow-file-access-from-files',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + profile,
  '--window-size=1280,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let k = 0; k < 60; k++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const page = list.find((t) => t.type === 'page');
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* browser chưa lên */ }
    await sleep(250);
  }
  throw new Error('Chrome không mở cổng ' + PORT);
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.seq = 0;
    this.pending = new Map();
    this.events = [];
    this.ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
        return;
      }
      this.events.push(msg);
    });
  }
  ready() {
    return new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', () => rej(new Error('ws error')), { once: true });
    });
  }
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, awaitPromise: true, returnByValue: true, userGesture: true,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error('page eval lỗi: ' + (d.exception && d.exception.description || d.text));
    }
    return r.result.value;
  }
}

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log((ok ? '  ok  ' : '  FAIL ') + name + (detail ? '  → ' + detail : ''));
}

const cdp = new CDP((await findTarget()).webSocketDebuggerUrl);
await cdp.ready();
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');

const consoleErrors = [];
const origPush = cdp.events.push.bind(cdp.events);
cdp.events.push = (msg) => {
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    consoleErrors.push('exception: ' + (d.exception && d.exception.description || d.text));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push('log: ' + msg.params.entry.text);
  }
  return origPush(msg);
};

await cdp.send('Page.navigate', { url: pageUrl });
await sleep(1500);

// 1. App khởi động thật (option list do JS dựng) + có #shotMenu.
const boot = await cdp.evaluate(`(() => ({
  fonts: document.querySelectorAll('#optFont option').length,
  menu: !!document.querySelector('#shotMenu'),
  errorText: (document.querySelector('#feed') || {}).textContent || ''
}))()`);
check('JS khởi động (danh sách cỡ chữ được dựng)', boot.fonts >= 6, 'options=' + boot.fonts);
check('có popup #shotMenu trong DOM', boot.menu === true);

// 2. Dựng một bài giả + bấm nút ▾ đúng như người dùng.
const opened = await cdp.evaluate(`(() => {
  const art = document.createElement('article');
  art.className = 'post';
  art.style.setProperty('--c', '#39ff88');
  art.dataset.key = 'smoke-1';
  art.innerHTML =
    '<div class="post-meta"><time datetime="2026-11-08T21:40:00">21:40</time><span class="badge-new">MỚI</span></div>' +
    '<div class="post-text" dir="auto"><p>Đọc tin Telegram và X trong một file HTML duy nhất — không cần cài đặt, không API key.</p></div>' +
    '<div class="post-foot">' +
      '<span class="shot-group">' +
        '<button class="linkbtn shotbtn" type="button" data-act="shot" data-key="smoke-1"><span class="btn-label">Chụp hình</span></button>' +
        '<button class="linkbtn shot-more" type="button" data-act="shot-size" data-key="smoke-1" aria-haspopup="menu" aria-expanded="false">▾</button>' +
      '</span>' +
      '<a class="lnk" href="https://t.me/telegram/1" target="_blank" rel="noopener noreferrer">Mở bài ↗</a>' +
    '</div>';
  document.querySelector('#feed').appendChild(art);
  art.querySelector('[data-act="shot-size"]').click();
  const menu = document.querySelector('#shotMenu');
  const items = [...menu.querySelectorAll('.shot-menu-item')];
  const r = menu.getBoundingClientRect();
  return {
    hidden: menu.hidden,
    count: items.length,
    labels: items.map((b) => b.querySelector('.sn').textContent + ' / ' + b.querySelector('.px').textContent),
    checked: items.filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.size),
    expanded: art.querySelector('[data-act="shot-size"]').getAttribute('aria-expanded'),
    role: items[0] && items[0].getAttribute('role'),
    focus: document.activeElement && document.activeElement.dataset.size,
    insideViewport: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
  };
})()`);
check('bấm ▾ thì menu mở', opened.hidden === false);
check('menu có 8 preset', opened.count === 8, opened.labels.join(' | '));
check('preset mặc định "Chuẩn" được đánh dấu ✓', opened.checked.join() === 'm', 'checked=' + opened.checked);
check('aria-expanded=true trên nút ▾', opened.expanded === 'true');
check('item dùng role=menuitemradio', opened.role === 'menuitemradio');
check('focus vào preset đang dùng', opened.focus === 'm', 'focus=' + opened.focus);
check('menu nằm trong viewport', opened.insideViewport, 'rect=' + opened.rect);

// 3. Ảnh chụp màn hình: bằng chứng thị giác cho menu.
const png = await cdp.send('Page.captureScreenshot', { format: 'png' });
const shotPath = join(outDir, 'shot-menu-open.png');
writeFileSync(shotPath, Buffer.from(png.data, 'base64'));
console.log('  → screenshot: ' + shotPath);

// 4. Phím mũi tên di chuyển focus.
await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
const afterArrow = await cdp.evaluate(`document.activeElement && document.activeElement.dataset.size`);
check('ArrowDown chuyển sang preset kế tiếp', afterArrow === 'wide', 'focus=' + afterArrow);

// 5. Chọn "Desktop" → lưu localStorage, đóng menu, đổi title nút chính.
await cdp.evaluate(`document.querySelector('.shot-menu-item[data-size="desktop"]').click()`);
await sleep(400);
const chosen = await cdp.evaluate(`(() => {
  const s = JSON.parse(localStorage.getItem('tgnews.settings.v1') || '{}');
  return {
    saved: s.shotSize,
    hidden: document.querySelector('#shotMenu').hidden,
    expanded: document.querySelector('[data-act="shot-size"]').getAttribute('aria-expanded'),
    title: document.querySelector('[data-act="shot"]').title,
  };
})()`);
check('chọn Desktop → lưu settings.shotSize=desktop', chosen.saved === 'desktop', 'saved=' + chosen.saved);
check('menu đóng sau khi chọn', chosen.hidden === true);
check('title nút chính cập nhật cỡ mới', /Desktop/.test(chosen.title) && /3568 px/.test(chosen.title), chosen.title);

// 6. Đổi ngôn ngữ EN → nhãn menu dịch theo.
await cdp.evaluate(`document.querySelector('#btnLang').click()`);
await sleep(300);
const english = await cdp.evaluate(`(() => {
  const art = document.querySelector('article.post[data-key="smoke-1"]');
  art.querySelector('[data-act="shot-size"]').click();
  const items = [...document.querySelectorAll('.shot-menu-item')];
  return { labels: items.map((b) => b.querySelector('.sn').textContent), menuLabel: document.querySelector('#shotMenu').getAttribute('aria-label'), title: document.querySelector('[data-act="shot"]').title };
})()`);
check('menu dịch sang EN', english.labels[0] === 'Small' && english.labels[7] === 'Extra large', english.labels.join(', '));
check('aria-label menu dịch', english.menuLabel === 'Choose screenshot size', english.menuLabel);
check('title nút chính dịch', /^Screenshot \(Desktop/.test(english.title), english.title);

// 7. Escape đóng menu và trả focus về nút ▾.
await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
const afterEsc = await cdp.evaluate(`(() => ({
  hidden: document.querySelector('#shotMenu').hidden,
  focusAct: document.activeElement && document.activeElement.getAttribute('data-act'),
}))()`);
check('Escape đóng menu', afterEsc.hidden === true);
check('Escape trả focus về nút ▾', afterEsc.focusAct === 'shot-size', 'focus=' + afterEsc.focusAct);

check('không có lỗi console/exception', consoleErrors.length === 0, consoleErrors.join(' || '));

child.kill();
const failed = checks.filter((c) => !c.ok).length;
console.log('\n' + (checks.length - failed) + '/' + checks.length + ' check pass' + (failed ? ' — CÓ LỖI' : ''));
process.exit(failed ? 1 : 0);
