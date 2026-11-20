import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Electron 桌面端回归（需先启动桌面版并开调试端口）：
 *   env -u ELECTRON_RUN_AS_NODE MXZY_DESKTOP_DEBUG=9223 electron .
 *   node scripts/cdp_desktop.mjs [save.sa2]
 * 验证：独立入口只挂存档解析（无其它页签）、自定义协议加载内置表、
 * 桌面文件桥存在、真实 IPC 读档后渲染出游戏时间与通告表格。 */

const PORT = process.env.MXZY_DESKTOP_DEBUG || '9223';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAVE = process.argv[2] ?? path.join(root, 'tests', 'fixtures', 'saves', 'probe.sa2');

function jsonGet(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'GET' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
let checks = 0;
const check = (ok, label, extra = '') => {
  checks += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

async function connect() {
  const list = await jsonGet(`${BASE}/json/list`);
  const pages = Array.isArray(list) ? list.filter((t) => t.type === 'page') : [];
  const target = pages.find((t) => t.url.includes('mxzy://')) ?? pages[0];
  if (!target) throw new Error('没有找到 Electron 页面目标');
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
  await send('Runtime.enable');
  await send('Page.enable');
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };
  return { evaluate, send, url: target.url };
}

const c = await connect();
console.log('page url:', c.url);

// 1) 桌面端是独立入口，走自定义协议。
check(c.url.includes('mxzy://') && c.url.includes('desktop.html'),
  '桌面端走 mxzy:// 自定义协议加载 desktop.html', c.url);

await sleep(1500);

// 2) 顶栏与文件桥就绪。
const shell = await c.evaluate(`(() => ({
  bar: !!document.querySelector('[data-desktop-bar]'),
  readBtn: document.querySelector('[data-desktop-read]')?.textContent?.trim() ?? '',
  followBtn: document.querySelector('[data-desktop-follow]')?.textContent?.trim() ?? '',
  slot: !!document.querySelector('[data-desktop-slot]'),
  bridge: typeof window.desktopBridge?.readSave === 'function',
  openSaveBridge: typeof window.desktopBridge?.openSave === 'function'
    && typeof window.desktopBridge?.onOpenSave === 'function'
    && typeof window.desktopBridge?.requestReload === 'function'
    && typeof window.desktopBridge?.onReloadRequest === 'function',
  caseReader: !!document.querySelector('[data-case-reader]'),
  otherTabs: [...document.querySelectorAll('a,button')].map(e => e.textContent?.trim() ?? '')
    .filter(t => /攻略|事件追踪|CG 图鉴|六大通告|甜蜜乐章/.test(t)),
  bodyText: (document.body.textContent ?? '').slice(0, 2000),
}))()`);
check(shell.bar && !shell.bodyText.includes('攻略分级浏览'), '桌面端有独立顶栏', '');
check(shell.otherTabs.length === 0, '桌面端没有其它页签入口', shell.otherTabs.join(','));
check(shell.readBtn.includes('读取当前游戏状态'), '有「读取当前游戏状态」按钮', shell.readBtn);
check(shell.followBtn.includes('自动跟随'), '有自动跟随开关', shell.followBtn);
check(shell.slot, '有存档位下拉');
check(shell.bridge, '桌面文件桥已注入');
check(shell.openSaveBridge, 'File 菜单打开存档桥已注入');
check(shell.caseReader, '存档解析页已挂载');

// 3) 自定义协议加载内置表成功（成功时 data-tables-source 有值、无 tablesError）。
const tables = await c.evaluate(`(() => ({
  source: document.querySelector('[data-tables-source]')?.getAttribute('data-tables-source') ?? '',
  err: [...document.querySelectorAll('p')].some(e => e.textContent?.includes('内置通告表读取失败')),
}))()`);
check(!tables.err && tables.source.length > 0, '内置表经自定义协议加载成功', tables.source);

// 4) 用真实 IPC 读档并喂给页面，验证渲染。
if (!fs.existsSync(SAVE)) {
  check(false, '测试存档存在', SAVE);
} else {
  const result = await c.evaluate(`(async () => {
    const bytes = await window.desktopBridge.readSave(${JSON.stringify(SAVE)});
    const name = ${JSON.stringify(path.basename(SAVE))};
    // 直接触发页面的外部存档入口：构造一个 CustomEvent 走 React 状态。
    // 桌面入口把 externalSave 存在模块内，这里用桥读出的 buffer 经 window 暴露的钩子喂入。
    if (typeof window.__desktopFeedSave !== 'function') return { fed: false, bytes: bytes.byteLength };
    window.__desktopFeedSave(bytes, name);
    return { fed: true, bytes: bytes.byteLength };
  })()`);
  check(result.bytes > 1000, 'IPC 读出真实存档字节', `${result.bytes} B`);
  await sleep(700);
  if (result.fed) {
    const rendered = await c.evaluate(`(() => ({
      now: document.querySelector('[data-case-now]')?.textContent?.trim() ?? '',
      notices: document.querySelectorAll('[data-case-notice]').length,
      error: document.querySelector('[data-case-error]')?.textContent?.trim() ?? '',
    }))()`);
    check(!rendered.error, '真实存档解析无报错', rendered.error);
    check(/\d{4}/.test(rendered.now), '渲染出游戏时间', rendered.now);
    check(rendered.notices > 0, '渲染出通告表格', `${rendered.notices} 条`);
  } else {
    check(false, '页面暴露外部存档喂入钩子（__desktopFeedSave）');
  }
}

// 5) File 菜单链路：openSave 推回来的字节走 feedSave，重新载入认的是这个外部文件。
if (!fs.existsSync(SAVE)) {
  check(false, 'File 菜单打开存档测试存档存在', SAVE);
} else {
  const opened = await c.evaluate(`(async () => {
    if (typeof window.desktopBridge?.openSave !== 'function') return { bridged: false };
    const ok = await window.desktopBridge.openSave(${JSON.stringify(SAVE)});
    return { bridged: true, ok };
  })()`);
  check(opened.bridged && opened.ok === true, 'File → 打开存档经桥读到文件', JSON.stringify(opened));
  await sleep(800);
  const afterOpen = await c.evaluate(`(() => ({
    notice: document.querySelector('[data-desktop-notice]')?.textContent?.trim() ?? '',
    error: document.querySelector('[data-desktop-error]')?.textContent?.trim() ?? '',
    now: document.querySelector('[data-case-now]')?.textContent?.trim() ?? '',
    notices: document.querySelectorAll('[data-case-notice]').length,
  }))()`);
  check(afterOpen.notice.includes('已从文件打开') && afterOpen.notice.includes(path.basename(SAVE)),
    '打开后顶栏显示来源与文件名', afterOpen.notice);
  check(!afterOpen.error && /\d{4}/.test(afterOpen.now) && afterOpen.notices > 0,
    '打开存档走同一解析通道渲染出内容', `${afterOpen.now} / ${afterOpen.notices} 条`);

  const reloadSent = await c.evaluate(`(async () => {
    if (typeof window.desktopBridge?.requestReload !== 'function') return false;
    await window.desktopBridge.requestReload();
    return true;
  })()`);
  await sleep(800);
  const reloadNotice = await c.evaluate(`document.querySelector('[data-desktop-notice]')?.textContent?.trim() ?? ''`);
  check(reloadSent && reloadNotice.includes('已重新载入文件'),
    'File → 重新载入重读菜单打开的文件，而非目录里的存档位', reloadNotice);
}

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length) {
  console.log('FAILURES:', failures.join(' | '));
  process.exit(1);
}
// CDP 的 WebSocket 不会自己关，成功后显式退出，否则脚本一直挂着。
process.exit(0);
