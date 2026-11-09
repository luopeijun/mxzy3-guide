import http from 'node:http';
import fs from 'node:fs';

/* Screenshot the 进度存档 panel with an import preview open.
   Usage: node cdp_tracker_transfer_shot.mjs <out.png> */
const [, , out = 'tmp-transfer.png'] = process.argv;
const url = 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;

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
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result.value;
  };

  // Seed a save with a couple of ticked steps, so the archive has substance.
  const seeded = {
    version: 1,
    selectedArtists: ['characters/lin-fenfen', 'characters/xiao-yun'],
    lines: {
      'game-guide/initial-events::0::初始剧情': { status: 'active', done: [0, 1, 2], skipped: [3] },
    },
    order: [],
    pinned: [],
  };
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify(seeded))}); 1`);
  await send('Page.reload');
  await sleep(3800);

  const archive = {
    format: 'stardom3-tracker-save',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: { artists: 2, lines: 1, steps: 4 },
    data: seeded,
  };
  await evaluate(`(() => {
    const t = ${ROOT}.querySelector('[data-transfer-paste]');
    t.click();
    return 1;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const area = ${ROOT}.querySelector('[data-transfer-paste-input]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, ${JSON.stringify(JSON.stringify(archive, null, 2))});
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await sleep(200);
  await evaluate(`(() => { ${ROOT}.querySelector('[data-transfer-read]').click(); return 1; })()`);
  await sleep(500);

  await evaluate(`(() => {
    const panel = ${ROOT}.querySelector('[data-transfer-panel]');
    panel.scrollIntoView({ block: 'center' });
    return 1;
  })()`);
  await sleep(400);

  const rect = await evaluate(`(() => {
    const r = ${ROOT}.querySelector('[data-transfer-panel]').getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left) - 12, y: Math.round(r.top) - 12, width: Math.round(r.width) + 24, height: Math.round(r.height) + 24 });
  })()`);
  const clip = { ...JSON.parse(rect), scale: 1 };
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out, JSON.stringify(clip));
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
