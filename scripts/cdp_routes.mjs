import http from 'node:http';

/* Verify the layered routing:
   1. new prefix   #/guide/<node>  -> guide shows the node
   2. legacy       #/<node>        -> still shows the node (backward compat)
   3. #/tracker                    -> tracker view
   4. round trip: guide node -> 事件追踪 -> 攻略 -> hash + node restored
   Usage: node cdp_routes.mjs <baseUrl> */

const [, , base] = process.argv;

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(d ? JSON.parse(d) : {});
        } catch {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const target = await jsonPut('http://127.0.0.1:9339/json/new?' + encodeURIComponent(base));
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

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const evalJs = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };
  const navigate = async (hash) => {
    await send('Page.navigate', { url: base + hash });
    await wait(4000);
  };
  const snap = () =>
    evalJs(
      `JSON.stringify({hash: location.hash, h1: (document.querySelector('h1')||{}).textContent || '', trackerTab: [...document.querySelectorAll('button')].some(b => b.textContent.trim()==='事件追踪')})`,
    );

  await navigate('#/guide/characters/lu-feng');
  console.log('guide-prefix:', await snap());

  await navigate('#/characters/ou-yiqing');
  console.log('legacy      :', await snap());

  await navigate('#/tracker');
  console.log('tracker     :', await snap());

  // round trip from a guide node
  await navigate('#/guide/characters/lu-feng');
  for (let i = 0; i < 20; i += 1) {
    const ready = await evalJs(
      `[...document.querySelectorAll('button')].some(b => b.textContent.trim()==='事件追踪')`,
    );
    if (ready) break;
    await wait(500);
  }
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim()==='事件追踪').click()`);
  await wait(600);
  console.log('to-tracker  :', await snap());
  await evalJs(`[...document.querySelectorAll('button')].find(b => b.textContent.trim()==='攻略').click()`);
  await wait(600);
  console.log('back-guide  :', await snap());

  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
