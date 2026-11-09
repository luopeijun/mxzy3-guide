import http from 'node:http';
import fs from 'node:fs';

/* Screenshot the tracker with the first N task lines expanded, or with a
   search query applied (which auto-expands every matching line).
   Usage: node cdp_tracker_shot.mjs <url> <out.png> [localStorageJson] [expandCount] [query] */

const [, , url, out, lsJson, expandRaw, searchQuery] = process.argv;
const expandCount = Number(expandRaw ?? '1');

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(
      target,
      { method: 'PUT', headers: body ? { 'Content-Type': 'application/json' } : undefined },
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
  await new Promise((r) => setTimeout(r, 3500));

  if (lsJson) {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('guide.progress.v1', ${JSON.stringify(lsJson)}); location.reload();`,
    });
    await new Promise((r) => setTimeout(r, 3500));
  }

  if (searchQuery) {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('input[aria-label="搜索事件池"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(searchQuery)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value;
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 700));
    console.log('query:', searchQuery);
  } else {
    const click = await send('Runtime.evaluate', {
      expression: `(() => {
        const btns = [...document.querySelectorAll('button[aria-expanded="false"]')];
        if (!btns.length) return 'no-buttons';
        btns.slice(0, ${expandCount}).forEach((b) => b.click());
        return String(btns.length);
      })()`,
      returnByValue: true,
    });
    console.log('expand buttons:', click.result?.value);
    await new Promise((r) => setTimeout(r, 600));
  }

  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
  });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
