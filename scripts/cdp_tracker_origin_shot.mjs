import http from 'node:http';
import fs from 'node:fs';

/* Screenshot the event pool with source chips + artist portraits visible.
   Usage: node cdp_tracker_origin_shot.mjs <out.png> [url] */
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

  const state = JSON.stringify({
    version: 1,
    selectedArtists: ['characters/lin-fenfen', 'characters/lu-feng', 'characters/ou-yiqing'],
    lines: {},
    order: [],
    pinned: [],
  });
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
  await send('Page.reload');
  await sleep(3800);

  // Show the first artist line (and one ordinary line) opened, then scroll to
  // where the artist chips sit in the flat list.
  await evaluate(`(() => {
    const root = ${SCOPE};
    const cards = [...root.querySelectorAll('[data-active-pool] [data-line-card]')];
    const idx = cards.findIndex(c => c.querySelector('[data-origin-tone="artist"]'));
    if (idx >= 0) cards[idx].querySelector('button[aria-expanded]').click();
    const m = root.querySelector('main');
    m.scrollTop = Math.max(0, (idx - 1) * 76);
    return idx;
  })()`);
  await sleep(600);

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
