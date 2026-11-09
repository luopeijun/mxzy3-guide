import http from 'node:http';
import fs from 'node:fs';

/* Crop the left batch panel in a given filter state. Two shots with the same
   clip can be compared side by side to prove the chips never reflow.
   Usage: node cdp_tracker_batch_chips_shot.mjs <out.png> <chipKey> [artistsCsv] */
const [, , out, chipKey = 'all', artistsCsv] = process.argv;
const url = 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;
const artists = (artistsCsv || 'characters/lin-fenfen')
  .split(',').filter(Boolean);

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
  const evaluate = (expression) => send('Runtime.evaluate', { expression, returnByValue: true });

  const state = JSON.stringify({ version: 1, selectedArtists: artists, lines: {}, order: [], pinned: [] });
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
  await send('Page.reload');
  await sleep(3500);
  // The chip grid lives inside the collapsible batch panel.
  await evaluate(`(() => {
    const t = document.querySelector('[data-batch-toggle]');
    if (t && t.getAttribute('aria-expanded') === 'false') t.click();
    return 1;
  })()`);
  await sleep(250);

  if (chipKey !== 'all') {
    await evaluate(`${ROOT}.querySelector('[data-chip-key="${chipKey}"]').click(); 1`);
    await sleep(350);
  }

  const rect = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = ${ROOT}.querySelector('[data-batch-chips]').getBoundingClientRect();
      return JSON.stringify({ x: Math.round(c.left) - 20, y: Math.round(c.top) - 95, width: Math.round(c.width) + 40, height: 250 });
    })()`,
    returnByValue: true,
  });
  const clip = { ...JSON.parse(rect.result.value), scale: 1 };
  const { data } = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, clip,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out, JSON.stringify(clip));
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
