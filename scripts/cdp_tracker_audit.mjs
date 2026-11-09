import http from 'node:http';
import fs from 'node:fs';

/* Layout audit for the tracker: reports the stacked order on a phone-width
   viewport and how far the progress summary sits from the event pool.
   Usage: node cdp_tracker_audit.mjs [width] [outPng] */
const [, , argWidth, out = 'tmp-audit-phone.png'] = process.argv;
const width = Number(argWidth || 390);
const url = 'http://localhost:5173/#/tracker';

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
  await send('Emulation.setDeviceMetricsOverride', {
    width, height: 844, deviceScaleFactor: 2, mobile: true,
  });
  await send('Page.navigate', { url });
  await sleep(4000);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result.value;
  };

  const report = await evaluate(`(() => {
    const root = document.querySelector('[data-tracker-app]');
    if (!root) return JSON.stringify({ ready: false });
    const scroller = root.querySelector('div');
    const cols = [...root.querySelectorAll(':scope > div > div > *')];
    const sections = [...root.querySelectorAll('section')].map(s => ({
      title: s.querySelector('h2')?.textContent?.trim() ?? s.textContent.trim().slice(0, 12),
      top: Math.round(s.getBoundingClientRect().top + (scroller?.scrollTop ?? 0)),
      height: Math.round(s.getBoundingClientRect().height),
    }));
    const pool = root.querySelector('[data-active-pool]');
    const poolTop = pool ? Math.round(pool.getBoundingClientRect().top + (scroller?.scrollTop ?? 0)) : null;
    const overview = sections.find(s => s.title === '进度概览');
    return JSON.stringify({
      ready: true,
      viewport: { w: innerWidth, h: innerHeight },
      scrollHeight: scroller?.scrollHeight ?? null,
      clientHeight: scroller?.clientHeight ?? null,
      columns: cols.map(c => ({ tag: c.tagName, width: Math.round(c.getBoundingClientRect().width), top: Math.round(c.getBoundingClientRect().top + (scroller?.scrollTop ?? 0)) })),
      sections,
      poolTop,
      poolToOverview: poolTop !== null && overview ? overview.top - poolTop : null,
      horizontalOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : null,
    });
  })()`);

  console.log('AUDIT', report);

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
