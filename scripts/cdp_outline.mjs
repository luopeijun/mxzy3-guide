import http from 'node:http';
/* CDP: 打开页面，点击「本页小节」展开，导出大纲 HTML */

function jsonPut(url) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const target = await jsonPut('http://127.0.0.1:9339/json/new?about:blank');
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
  await send('Page.navigate', { url: process.argv[2] });
  await new Promise((r) => setTimeout(r, 3500));
  // 点击本页小节的展开按钮
  await send('Runtime.evaluate', {
    expression: `document.querySelector('button[aria-controls]').click()`,
  });
  await new Promise((r) => setTimeout(r, 600));
  const { result } = await send('Runtime.evaluate', {
    expression: `document.querySelector('section[aria-label="本页小节"]').outerHTML`,
    returnByValue: true,
  });
  console.log(result.value);
  process.exit(0);
}
main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
