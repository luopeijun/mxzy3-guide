import http from 'node:http';

/* Verify the tracker's three-column full-bleed layout and the right-rail
   archive: 放弃 / 移出 a line, then restore it from 已放弃／已移出. */
const [, , url, lsJson] = process.argv;

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
  if (lsJson) {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('guide.progress.v1', ${JSON.stringify(lsJson)}); location.reload();`,
    });
    await sleep(3800);
  }

  const dump = async (label) => {
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.querySelector('[data-tracker-app]');
        const row = overlay.querySelector('main').parentElement;
        const cols = [...row.children].map(c => {
          const r = c.getBoundingClientRect();
          return c.tagName + ':' + Math.round(r.width);
        });
        const panels = [...overlay.querySelectorAll('aside h2')].map(h => h.textContent.trim());
        const recycle = [...overlay.querySelectorAll('aside section')]
          .find(s => s.querySelector('h2')?.textContent.includes('已放弃'));
        return JSON.stringify({
          vw: innerWidth,
          cols,
          rightEdge: Math.round(row.getBoundingClientRect().right),
          panels,
          recycleItems: recycle ? [...recycle.querySelectorAll('li')].map(li => li.textContent.trim()) : null,
          poolLines: overlay.querySelectorAll('main [aria-expanded]').length,
        });
      })()`,
      returnByValue: true,
    });
    console.log(label, result.value);
  };

  await dump('INITIAL');

  // Abandon the first line, exclude the second.
  const acted = await send('Runtime.evaluate', {
    expression: `(() => {
      const overlay = document.querySelector('[data-tracker-app]');
      const cards = [...overlay.querySelectorAll('main [aria-expanded]')].map(b => b.parentElement.parentElement);
      const clickByText = (card, text) => [...card.querySelectorAll('button')].find(b => b.textContent.trim() === text)?.click();
      clickByText(cards[0], '放弃');
      clickByText(cards[1], '移出池子');
      return cards.length;
    })()`,
    returnByValue: true,
  });
  await sleep(700);
  console.log('CARDS:', acted.result.value);
  await dump('AFTER_ABANDON_AND_EXCLUDE');

  // Restore the abandoned line from the right rail.
  const restored = await send('Runtime.evaluate', {
    expression: `(() => {
      const overlay = document.querySelector('[data-tracker-app]');
      const sec = [...overlay.querySelectorAll('aside section')]
        .find(s => s.querySelector('h2')?.textContent.includes('已放弃'));
      const li = [...sec.querySelectorAll('li')].find(l => l.textContent.includes('放弃'));
      const btn = [...li.querySelectorAll('button')].find(b => b.textContent.trim() === '恢复');
      btn.click();
      return li.textContent.trim();
    })()`,
    returnByValue: true,
  });
  await sleep(700);
  console.log('RESTORED_ROW:', restored.result.value);
  await dump('AFTER_RESTORE');

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
