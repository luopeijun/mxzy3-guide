import http from 'node:http';
import fs from 'node:fs';

/* 通告页截图：node cdp_notices_shot.mjs <out.png> [query] [width] [height] [view]
   有 query 时先填搜索框，等结果刷新后点第一张卡片，这样能稳定截到
   指定通告的详情栏；view=reference 时切到「能力对照」并滚到底。 */

const [, , out = 'outputs/notices-shot.png', query = '', width = '1440', height = '900', view = 'list'] =
  process.argv;

const URL = 'http://localhost:5173/#/notices';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut('http://127.0.0.1:9339/json/new?' + encodeURIComponent(URL));
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

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: 1,
    mobile: false,
  });
  await send('Page.navigate', { url: URL });
  await sleep(3500);

  if (query) {
    await evaluate(`(() => {
      const input = document.querySelector('input[aria-label="搜索通告"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(query)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(600);
    await evaluate(`(() => {
      const card = document.querySelector('[data-notice-card]');
      if (!card) return null;
      card.click();
      return card.getAttribute('data-notice-id');
    })()`);
    await sleep(400);
  }

  if (view === 'legend') {
    await evaluate(`(() => {
      document.querySelector('[data-notice-legend-toggle]')?.click();
      return true;
    })()`);
    await sleep(400);
  }

  if (view === 'reference' || view === 'reference-tail') {
    await evaluate(`(() => {
      document.querySelector('[data-notice-view="reference"]')?.click();
      return true;
    })()`);
    await sleep(500);
    if (view === 'reference-tail') {
      await evaluate(`(() => {
        const pane = document.querySelector('[data-notice-reference]');
        if (pane) pane.scrollTop = pane.scrollHeight;
        return true;
      })()`);
      await sleep(300);
    }
  }

  const info = await evaluate(`(() => {
    const detail = document.querySelector('[data-notice-detail]');
    const notes = document.querySelector('[data-reference-notes]');
    return {
      title: detail?.querySelector('h2')?.textContent ?? null,
      chips: [...document.querySelectorAll('[data-notice-chip]')].map((s) => s.textContent),
      notes: notes ? [...notes.querySelectorAll('li')].length : 0,
    };
  })()`);
  console.log(JSON.stringify(info, null, 1));

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(out.split('/').slice(0, -1).join('/') || '.', { recursive: true });
  fs.writeFileSync(out, Buffer.from(data, 'base64'));
  console.log('wrote', out);
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
