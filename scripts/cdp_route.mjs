import http from 'node:http';

/* Verify the browse <-> tracker round trip: open a node, click 事件追踪,
   confirm the overlay + hash, then click 浏览 and confirm the hash restores.
   Usage: node cdp_route.mjs <url> */

const [, , url] = process.argv;

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

  const evalJs = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const before = await evalJs(`JSON.stringify({hash: location.hash, h1: document.querySelector('h1')?.textContent ?? ''})`);
  // Cold vite compile can be slow; poll until the header button exists.
  for (let i = 0; i < 20; i += 1) {
    const ready = await evalJs(`!![...document.querySelectorAll('button')].find(b => b.textContent.trim() === '事件追踪')`);
    if (ready) break;
    await wait(500);
  }
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '事件追踪').click()`);
  await wait(600);
  const inTracker = await evalJs(`JSON.stringify({hash: location.hash, hasSetup: !!document.querySelector('h2') && document.body.innerText.includes('选择追踪的艺人')})`);
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === '浏览').click()`);
  await wait(600);
  const back = await evalJs(`JSON.stringify({hash: location.hash, h1: document.querySelector('h1')?.textContent ?? ''})`);
  console.log('before :', before);
  console.log('tracker:', inTracker);
  console.log('back   :', back);
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
