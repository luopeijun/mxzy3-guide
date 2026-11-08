import http from 'node:http';
import fs from 'node:fs';

/* Headless screenshot via Chrome DevTools Protocol.
   Usage: node cdp_shot.mjs <url> <out.png> [localStorageJson]
   If localStorageJson is given, it is applied then the page reloads before
   the shot, so the tracker renders with a preset selection / progress. */

const [, , url, out, lsJson] = process.argv;

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(
      target,
      {
        method: 'PUT',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
        });
      },
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const target = await jsonPut(
    'http://127.0.0.1:9339/json/new?' + encodeURIComponent(url),
  );
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

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
