import http from 'node:http';

/* Verify the collapsible artist picker: compact closed row, portrait chips,
   expand-to-grid, portrait click removes an artist, and the batch panel below
   becomes fully visible without scrolling the left rail. */
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
      expression: `localStorage.setItem('guide.progress.v1', ${JSON.stringify(lsJson)}); 1`,
    });
    await send('Page.reload');
    await sleep(3800);
  }

  // Open the (now collapsible) batch panel so batchFullyVisible still measures
  // the full editor rather than its 50px summary row.
  await send('Runtime.evaluate', {
    expression: `(() => {
      const t = document.querySelector('[data-batch-toggle]');
      if (t && t.getAttribute('aria-expanded') === 'false') t.click();
      return 1;
    })()`,
  });
  await sleep(250);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };

  const snapshot = () => evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const aside = o.querySelector('aside');
    const setup = [...aside.querySelectorAll('section')].find(s => s.textContent.includes('追踪艺人'));
    const batch = [...aside.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent.includes('分类批量操作'));
    const toggle = setup.querySelector('button[aria-expanded]');
    const portraits = [...setup.querySelectorAll('button[aria-label^="取消追踪"]')];
    const br = batch.getBoundingClientRect(), ar = aside.getBoundingClientRect();
    return JSON.stringify({
      setupHeight: Math.round(setup.getBoundingClientRect().height),
      expanded: toggle.getAttribute('aria-expanded'),
      gridButtons: setup.querySelectorAll('.grid button').length,
      portraits: portraits.length,
      hint: setup.textContent.match(/点击选择|\\d+\\/\\d+ 位/)?.[0] ?? null,
      asideScrollTop: aside.scrollTop,
      batchFullyVisible: br.bottom <= ar.bottom + 1,
      selected: JSON.parse(localStorage.getItem('guide.progress.v1') || '{}').selectedArtists,
      poolLines: o.querySelectorAll('main [data-line-card]').length,
    });
  })()`);

  console.log('CLOSED', await snapshot());

  await evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    [...o.querySelectorAll('aside button')].find(b => b.getAttribute('aria-expanded') === 'false').click();
    return 1;
  })()`);
  await sleep(350);
  console.log('EXPANDED', await snapshot());

  // Select a third artist from the grid.
  const added = await evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const grid = o.querySelector('aside .grid');
    const b = [...grid.querySelectorAll('button')].find(x => !x.disabled && !x.className.includes('bg-brand-soft'));
    if (!b) return 'none';
    const name = b.textContent.trim(); b.click(); return name;
  })()`);
  await sleep(400);
  console.log('ADDED_ARTIST:', added);
  console.log('AFTER_ADD', await snapshot());

  // Collapse again, then remove one artist via its portrait.
  await evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    [...o.querySelectorAll('aside button')].find(b => b.getAttribute('aria-expanded') === 'true').click();
    return 1;
  })()`);
  await sleep(300);
  const removed = await evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const p = o.querySelector('aside button[aria-label^="取消追踪"]');
    if (!p) return 'none';
    const name = p.getAttribute('aria-label'); p.click(); return name;
  })()`);
  await sleep(400);
  console.log('REMOVED_PORTRAIT:', removed);
  console.log('AFTER_PORTRAIT_REMOVE', await snapshot());

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
