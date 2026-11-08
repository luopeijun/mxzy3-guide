import http from 'node:http';
import fs from 'node:fs';

/* Drive the tracker UI: expand a line, toggle a step, abandon + exclude a line,
   then print the persisted localStorage so persistence can be verified.
   Usage: node cdp_interact.mjs <url> [localStorageJson] [screenshotOut] */

const [, , url, lsJson, shot] = process.argv;

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
  await new Promise((r) => setTimeout(r, 4000));
  if (lsJson) {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('guide.progress.v1', ${JSON.stringify(lsJson)}); location.reload();`,
    });
    await new Promise((r) => setTimeout(r, 3500));
  }

  const evalJs = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 1. expand the first task line
  await evalJs(`document.querySelector('button[aria-label="展开步骤"]').click()`);
  await wait(300);
  // 2. toggle the first two steps of that line
  await evalJs(`document.querySelector('li button').click()`);
  await wait(150);
  await evalJs(`document.querySelector('li:nth-child(2) button').click()`);
  await wait(150);
  // 3. abandon the first line, exclude the second
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '放弃').click()`);
  await wait(150);
  await evalJs(`[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '移出池子')[1].click()`);
  await wait(300);

  const stored = await evalJs(`localStorage.getItem('guide.progress.v1')`);
  const summary = await evalJs(`JSON.stringify({
    abandonedBadge: !!document.querySelector('span'),
    groupHeads: [...document.querySelectorAll('h3')].map((h) => h.textContent.trim()),
    progressTexts: [...document.querySelectorAll('span')].filter((s) => /^\\d+\\/\\d+$/.test(s.textContent.trim())).map((s) => s.textContent.trim()).slice(0, 8),
    checkedSteps: document.querySelectorAll('li button span.bg-brand').length,
  })`);
  console.log('STORED:', stored);
  console.log('DOM:', summary);

  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(shot, Buffer.from(data, 'base64'));
    console.log('wrote', shot);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
