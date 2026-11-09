import http from 'node:http';
import fs from 'node:fs';

/* Screenshot the 已完成 archive at the bottom of the event pool.
   Usage: node cdp_tracker_complete_shot.mjs <out.png> [url] */
const [, , out, argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const SCOPE = `document.querySelector('[data-tracker-app]') || document`;

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut('http://127.0.0.1:9339/json/new?' + encodeURIComponent(url));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
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
  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(3500);
  const evaluate = (expression) =>
    send('Runtime.evaluate', { expression, returnByValue: true });

  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3500);

  // Archive two lines with their master checkboxes, then open the fold.
  await evaluate(`(() => {
    const root = ${SCOPE};
    [...root.querySelectorAll('[data-active-pool] [data-line-card] [data-master-checkbox]')]
      .slice(0, 2).forEach(b => b.click());
    return 1;
  })()`);
  await sleep(500);
  await evaluate(`(${SCOPE}).querySelector('[data-completed-toggle]').click(); 1`);
  await sleep(400);
  await evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-completed-pool] [data-line-card] button[aria-expanded]');
    if (c?.getAttribute('aria-expanded') === 'false') c.click();
    return 1;
  })()`);
  await sleep(400);
  await evaluate(`(() => {
    const m = (${SCOPE}).querySelector('main');
    m.scrollTop = m.scrollHeight;
    return m.scrollTop;
  })()`);
  await sleep(500);

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
