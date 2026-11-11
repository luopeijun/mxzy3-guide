import http from 'node:http';
import fs from 'node:fs';

/* 六大通告看板截图。滚动容器是看板内层 div（不是 window），所以 scrollY
   要写到那个元素上。
   Usage: node cdp_specials_shot.mjs <out.png> [specialsJson] [trackerJson] [scrollY] [width] [height] */

const [, , out, specialsJson, trackerJson, scrollY = '0', width = '1440', height = '900'] = process.argv;

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const url = 'http://localhost:5173/#/specials';

async function main() {
  const target = await jsonPut(`http://127.0.0.1:9339/json/new?${encodeURIComponent(url)}`);
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
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 3200));

  if (trackerJson || specialsJson) {
    const expression = [
      trackerJson ? `localStorage.setItem('guide.progress.v1', ${JSON.stringify(trackerJson)});` : '',
      specialsJson ? `localStorage.setItem('guide.specials.v1', ${JSON.stringify(specialsJson)});` : '',
      'location.reload(); 1',
    ].join('');
    await send('Runtime.evaluate', { expression });
    await new Promise((r) => setTimeout(r, 3200));
  }

  // Expand every notice's collapsed 「通告要求」 phase, then every row's
  // ▸ peek so the course-grade chips (and optional numbers) are visible.
  await send('Runtime.evaluate', {
    expression: `(() => {
      document.querySelectorAll('[data-notice-phase-toggle][aria-expanded="false"]').forEach((t) => t.click());
      document.querySelectorAll('[data-peek-toggle][aria-expanded="false"]').forEach((t) => t.click());
      return document.querySelectorAll('[data-notice-phase-toggle][aria-expanded="true"]').length;
    })()`,
  });
  await new Promise((r) => setTimeout(r, 600));

  if (Number(scrollY) > 0) {
    await send('Runtime.evaluate', {
      expression: `(() => { const box = document.querySelector('[data-specials-app] > div'); if (box) box.scrollTop = ${Number(scrollY)}; return box ? box.scrollTop : -1; })()`,
    });
    await new Promise((r) => setTimeout(r, 500));
  }

  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out, `${width}x${height} @ scrollY=${scrollY}`);
  ws.close();
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
