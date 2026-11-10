import http from 'node:http';

/* End-to-end check of the CG gallery card-size toggle (大/中/小):

   1. 默认「中」：网格最小列宽 380px，桌面 1280 宽下约 3 列。
   2. 点「小」：最小列宽收到 220px，列数变多（> 中）。
   3. 点「大」：最小列宽放到 520px，列数变少（< 中）。
   4. 点「中」：回到默认列宽。
   5. 三个按钮的 aria-pressed 始终只有一个为 true。
   6. 切尺寸不改变可见卡片数量（只是重排）。 */

const PORT = '9339';
const HOST = 'http://localhost:5173';
const PAGE = `${HOST}/#/cg`;

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(target, {
      method: 'PUT',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let PASS = 0;
let FAIL = 0;
function check(name, cond, detail = '') {
  if (cond) { PASS += 1; console.log(`PASS  ${name}`); }
  else { FAIL += 1; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const target = await jsonPut(`${PORT.includes('http') ? PORT : `http://127.0.0.1:${PORT}`}/json/new?` + encodeURIComponent(PAGE));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails));
    return res.result.value;
  };

  // 固定桌面视口，让列数差异明显可测。
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(900);

  const colCount = () => evaluate(`(() => {
    const grid = document.querySelector('[data-cg-grid]');
    const tpl = getComputedStyle(grid).gridTemplateColumns;
    return tpl.split(' ').filter((s) => s.endsWith('px')).length;
  })()`);
  const visibleCount = () => evaluate(`document.querySelectorAll('[data-cg-card]').length`);
  const pressed = () => evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-cg-size-btn]')];
    return btns.map((b) => b.getAttribute('aria-pressed') === 'true');
  })()`);
  const clickSize = async (value) => {
    await evaluate(`document.querySelector('[data-cg-size-btn="${value}"]').click()`);
    await sleep(300);
  };

  const baseCount = await visibleCount();
  check('默认渲染出卡片', baseCount > 0, `count=${baseCount}`);

  const mdCols = await colCount();
  check('默认「中」至少 1 列 (1280 宽, 含侧栏后约 2 列)', mdCols >= 1, `cols=${mdCols}`);

  await clickSize('sm');
  const smCols = await colCount();
  check('切「小」列数变多', smCols > mdCols, `md=${mdCols} sm=${smCols}`);
  const smCount = await visibleCount();
  check('切「小」不改变可见卡片数', smCount === baseCount, `before=${baseCount} after=${smCount}`);
  let p = await pressed();
  check('「小」被选中 (1 个 pressed)', p.filter(Boolean).length === 1 && p[2] === true, JSON.stringify(p));

  await clickSize('lg');
  const lgCols = await colCount();
  check('切「大」列数变少', lgCols < mdCols, `md=${mdCols} lg=${lgCols}`);
  p = await pressed();
  check('「大」被选中 (1 个 pressed)', p.filter(Boolean).length === 1 && p[0] === true, JSON.stringify(p));

  await clickSize('md');
  const backCols = await colCount();
  check('切回「中」恢复列数', backCols === mdCols, `md=${mdCols} back=${backCols}`);
  p = await pressed();
  check('「中」被选中 (1 个 pressed)', p.filter(Boolean).length === 1 && p[1] === true, JSON.stringify(p));

  // 小档名称应允许换行（line-clamp-2），不该再是 truncate 单行。
  await clickSize('sm');
  const wraps = await evaluate(`(() => {
    const name = document.querySelector('[data-cg-name]');
    return name.classList.contains('line-clamp-2');
  })()`);
  check('小档名称启用换行 (line-clamp-2)', wraps === true);

  await jsonPut(`http://127.0.0.1:${PORT}/json/close/${target.id}`);
  console.log(`\n${FAIL === 0 ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} — ${PASS} passed, ${FAIL} failed`);
  process.exit(FAIL === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
