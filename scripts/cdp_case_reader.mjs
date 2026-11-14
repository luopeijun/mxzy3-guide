import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Browser regression for the 存档解析 tab:
 *   1) the main site has six tabs, #/case renders the reader and the bundled
 *      static table loads;
 *   2) injecting a real .sa2 through the hidden file input renders the notice
 *      table with rolled values, the game clock, artist cards, the booking
 *      window, shooting period, reservations and the company refresh timeline;
 *   3) the search box filters the notices;
 *   4) 甜蜜乐章 keeps its own three tabs (the reader is main-site only).
 *
 * Needs the dev server on localhost:5173 and CDP on 127.0.0.1:9339.
 * IMPORTANT: one debug tab is reused for the whole run. Repeatedly calling
 * /json/new piles up hundreds of idle tabs until Chrome stops responding.
 * Usage: node scripts/cdp_case_reader.mjs [path/to/save.sa2]
 */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ?? 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Auto.sa2';
// Work on a snapshot: Waltz.exe rewrites Auto.sa2 while the game is running.
const SAVE = path.join(root, '.tmp', 'case-e2e.sa2');
fs.mkdirSync(path.dirname(SAVE), { recursive: true });
fs.copyFileSync(SOURCE, SAVE);

function request(target, method = 'PUT') {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}
const jsonPut = (target) => request(target, 'PUT');
const jsonGet = (target) => request(target, 'GET');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
let checks = 0;
const check = (ok, label, extra = '') => {
  checks += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

/** Reuse the first existing page tab (or open exactly one if Chrome is empty),
 *  then return a CDP session that can be navigated as many times as needed. */
async function connect() {
  const list = await jsonGet(`${BASE}/json/list`);
  const pages = Array.isArray(list) ? list.filter((t) => t.type === 'page') : [];
  const target = pages[0] ?? await jsonPut(`${BASE}/json/new?about:blank`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  };
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };
  const navigate = async (url) => {
    // about:blank -> target guarantees a fresh React mount even when the tab
    // already sat on the same hash.
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(250);
    await send('Page.navigate', { url });
    await sleep(3000);
  };
  return { send, evaluate, navigate, close: () => ws.close() };
}

async function main() {
  const { send, evaluate, navigate, close } = await connect();
  try {
    await navigate('http://localhost:5173/#/case');

    const shell = await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[role="tab"]').length,
      caseTab: !!document.querySelector('[data-tab="case"]'),
      caseActive: document.querySelector('[data-tab="case"]')?.getAttribute('aria-selected'),
      reader: !!document.querySelector('[data-case-reader]'),
      input: !!document.querySelector('[data-case-upload]'),
      uploadReady: !document.querySelector('[data-case-reader] button')?.disabled,
      hash: location.hash,
      tableSource: [...document.querySelectorAll('details')].some(d => d.textContent.includes('繁中三合一')),
    })`);
    const s = JSON.parse(shell);
    console.log('shell:', shell);
    check(s.tabs === 6, 'main site has six tabs', String(s.tabs));
    check(s.caseTab && s.caseActive === 'true', '存档解析 tab is active');
    check(s.reader && s.input, 'reader and upload input mounted');
    check(s.hash === '#/case', 'route is #/case', s.hash);
    check(s.tableSource && s.uploadReady, 'bundled static tables loaded and upload enabled');

    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-case-upload]' });
    if (!q.nodeId) throw new Error('file input not found in DOM');
    await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [SAVE] });
    await sleep(1600);

    const parsed = await evaluate(`JSON.stringify({
      error: document.querySelector('[data-case-error]')?.innerText || '',
      notices: document.querySelectorAll('[data-case-notice]').length,
      roles: document.querySelectorAll('[data-case-role]').length,
      values: document.querySelectorAll('[data-case-value]').length,
      count: document.querySelector('[data-case-count]')?.innerText || '',
      clock: document.querySelector('[data-case-clock]')?.innerText || '',
      now: document.querySelector('[data-case-now]')?.innerText || '',
      closing: document.querySelector('[data-case-closing]')?.innerText || '',
      nextUpdate: document.querySelector('[data-case-next-update]')?.innerText || '',
      artists: document.querySelectorAll('[data-case-artist]').length,
      artistAttrs: document.querySelectorAll('[data-case-artist-attrs]').length,
      artistAttrsCount: document.querySelectorAll('[data-case-artist-attrs] span').length,
      artistCounts: document.querySelectorAll('[data-case-artist-counts]').length,
      updates: (function(){ var d = document.querySelector('[data-case-updates]'); if (!d) return ''; d.open = true; return d.textContent || ''; })(),
      closingRows: document.querySelectorAll('[data-case-status="closing"]').length,
      reservedRows: document.querySelectorAll('[data-case-reserved="yes"]').length,
      reservedText: [...document.querySelectorAll('[data-case-reserved="yes"] [data-case-reservation]')].map(x => x.innerText).join('|'),
      matches: document.querySelectorAll('[data-case-match]').length,
      firstNotice: document.querySelector('[data-case-notice]')?.innerText.slice(0, 260) || '',
      head: document.querySelector('table thead')?.innerText || '',
      hasFirmSlot: document.body.innerText.includes('公司槽'),
      csv: [...document.querySelectorAll('button')].some(b => b.innerText.includes('导出 CSV'))
    })`);
    const p = JSON.parse(parsed);
    console.log('parsed:', parsed);
    check(!p.error, 'no parse error', p.error);
    check(p.notices > 0, 'notice rows rendered', String(p.notices));
    check(p.roles > 0 && p.values > 0, 'role rows and value chips rendered', `${p.roles} / ${p.values}`);
    check(/\d+ 条/.test(p.count), 'summary line shown', p.count);
    check(p.csv, 'CSV export button shown');
    check(/★|☆/.test(p.firstNotice), 'difficulty stars rendered');

    // Clock, booking window and shooting period.
    check(p.now.includes('2006/1/29') && p.now.includes('周日'), 'game clock shows the in-game date', p.now);
    check(p.closing.includes('2 条'), '7-day deadline warning counted', p.closing);
    check(p.nextUpdate.includes('2006/1/30') && p.nextUpdate.includes('周一'),
      'next company refresh shown', p.nextUpdate.slice(0, 120));
    check(p.closingRows === 2, 'closing notices highlighted', String(p.closingRows));
    check(p.head.includes('接取时间') && p.head.includes('执行期间'),
      'booking window and shooting period columns present', p.head.replace(/\s+/g, ' '));
    check(p.firstNotice.includes('开放') && p.firstNotice.includes('停止'),
      'open and deadline dates sit together', p.firstNotice.replace(/\s+/g, ' ').slice(0, 140));
    check(/共 \d+ 天/.test(p.firstNotice), 'shooting length rendered');
    check(!p.hasFirmSlot, '公司槽 field is hidden');

    // Artist panel and reservations.
    check(p.artists === 3, 'three signed-artist cards', String(p.artists));
    check(p.artistAttrs === 3 && p.artistAttrsCount >= 27, 'nine abilities on every artist card',
      `${p.artistAttrs} / ${p.artistAttrsCount}`);
    check(p.artistCounts === 3, 'notice counts on every artist card', String(p.artistCounts));
    check(p.reservedRows === 2 && p.reservedText.includes('黎华（已预约）'),
      'the two 黎华 reservations render with the label', p.reservedText);
    check(p.matches > 0, 'artist-to-requirement comparison rendered', String(p.matches));
    check(p.updates.includes('已排定') && p.updates.includes('推测'),
      'company refresh timeline separates scheduled and guessed batches');

    // React listens to the native input event; setting .value alone is ignored.
    await evaluate(`(function(){
      var i = document.querySelector('input[type="search"]');
      if (!i) return false;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, '__no_such_notice__');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const filtered = await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      empty: document.body.innerText.includes('没有匹配的通告')
    })`);
    const f = JSON.parse(filtered);
    check(f.notices === 0 && f.empty, 'search filters notices', filtered);

    // Same tab, same CDP session: no extra targets are created.
    await navigate('http://localhost:5173/sweet.html');
    const sweetState = JSON.parse(await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[role="tab"]').length,
      caseTab: !!document.querySelector('[data-tab="case"]')
    })`));
    console.log('sweet:', JSON.stringify(sweetState));
    check(sweetState.tabs === 3 && !sweetState.caseTab, '甜蜜乐章 keeps its own three tabs');
  } finally {
    close();
  }

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
