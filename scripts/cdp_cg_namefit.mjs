import http from 'node:http';

/* Measure whether any CG card name is truncated in the current layout.
   Loads the "全部" view (every character's cards, hence the longest names),
   clicks "加载更多" until all are rendered, then checks each
   [data-cg-name] span for scrollWidth > clientWidth (CSS overflow ellipsis). */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const HOST = 'http://localhost:5173';

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(target, {
      method: 'PUT',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut(`${BASE}/json/new?` + encodeURIComponent(`${HOST}/#/cg`));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });

  const evaluate = (fn) => send('Runtime.evaluate', {
    expression: `(${fn.toString()})()`,
    returnByValue: true,
    awaitPromise: true,
  }).then((r) => r.result.value);

  // Wait for the grid to mount.
  for (let i = 0; i < 40; i++) {
    const ok = await evaluate(() => !!document.querySelector('[data-cg-grid]'));
    if (ok) break;
    await sleep(200);
  }

  // Click "加载更多" until everything is rendered.
  for (let i = 0; i < 60; i++) {
    const more = await evaluate(() => {
      const btn = document.querySelector('[data-cg-load-more]');
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    });
    if (!more) break;
    await sleep(120);
  }
  await sleep(300);

  const report = await evaluate(() => {
    const cards = [...document.querySelectorAll('[data-cg-card]')];
    const truncated = [];
    let maxRatio = 0;
    for (const card of cards) {
      const name = card.querySelector('[data-cg-name]');
      if (!name) continue;
      const ratio = name.scrollWidth / name.clientWidth;
      maxRatio = Math.max(maxRatio, ratio);
      if (name.scrollWidth > name.clientWidth + 1) {
        truncated.push({
          id: card.getAttribute('data-cg-id'),
          text: name.textContent,
          scroll: name.scrollWidth,
          client: name.clientWidth,
        });
      }
    }
    return {
      cardCount: cards.length,
      truncatedCount: truncated.length,
      truncated,
      maxRatio: Math.round(maxRatio * 100) / 100,
      cardWidth: cards[0] ? Math.round(cards[0].getBoundingClientRect().width) : 0,
    };
  });

  console.log(JSON.stringify(report, null, 2));
  if (report.truncatedCount > 0) {
    console.log('RESULT: FAIL — some names are truncated');
  } else {
    console.log(`RESULT: PASS — 0/${report.cardCount} names truncated (max scroll/client ratio ${report.maxRatio}, card width ${report.cardWidth}px)`);
  }
  ws.close();
  process.exit(report.truncatedCount > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
