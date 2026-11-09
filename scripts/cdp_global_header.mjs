import http from 'node:http';

/* Verify one shared global header: it must stay the SAME DOM node across view
   switches, the category nav only shows on the guide, the view tabs track the
   active mode, and the tracker overlay starts exactly below the 64px header. */
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
  await sleep(4000);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };

  // Tag the header element so we can prove React kept the very same node.
  await evaluate(`(() => { document.querySelector('header').dataset.sharedHeader = 'yes'; return 1; })()`);

  const snapshot = () => evaluate(`(() => {
    const header = document.querySelector('header');
    const tabs = header ? [...header.querySelectorAll('[role="tab"]')] : [];
    const overlay = document.querySelector('[data-tracker-app]');
    return JSON.stringify({
      hash: location.hash,
      sameHeader: header?.dataset.sharedHeader === 'yes',
      headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
      viewTabs: tabs.map(t => t.textContent.trim() + ':' + t.getAttribute('aria-selected')),
      categoryNav: !!header?.querySelector('nav[aria-label="攻略分类"]'),
      standaloneTrackerButton: [...(header?.querySelectorAll('button') || [])].some(b => b.textContent.trim() === '事件追踪' && b.getAttribute('role') !== 'tab'),
      overlayTop: overlay ? Math.round(overlay.getBoundingClientRect().top) : null,
      h1: [...document.querySelectorAll('h1')].map(h => h.textContent.trim()).slice(0, 1),
      trackerVisible: !!document.querySelector('[data-tracker-app] main'),
      resetInContent: !!document.querySelector('[data-tracker-app] button') &&
        [...document.querySelectorAll('div.fixed.inset-x-0.bottom-0.top-16 button')].some(b => b.textContent.trim() === '重置进度'),
    });
  })()`);

  console.log('GUIDE', await snapshot());

  await evaluate(`(() => { [...document.querySelectorAll('header [role="tab"]')].find(b => b.textContent.trim() === '事件追踪').click(); return 1; })()`);
  await sleep(700);
  console.log('TRACKER', await snapshot());

  await evaluate(`(() => { [...document.querySelectorAll('header [role="tab"]')].find(b => b.textContent.trim() === '攻略').click(); return 1; })()`);
  await sleep(700);
  console.log('BACK_TO_GUIDE', await snapshot());

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
