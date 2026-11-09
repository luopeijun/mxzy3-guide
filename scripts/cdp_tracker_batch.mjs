import http from 'node:http';

/* Verify the batch selector panel: scrollable multi-select list, select all,
   batch exclude / add (restore), per-category filter, "only out" filter,
   cross-category selections and persistence. */
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

  // The batch panel is collapsed by default; open it before exercising the
  // multi-select list. Re-run after every reload.
  const expandBatch = () => send('Runtime.evaluate', {
    expression: `(() => {
      const t = document.querySelector('[data-batch-toggle]');
      if (t && t.getAttribute('aria-expanded') === 'false') t.click();
      return 1;
    })()`,
  });
  await expandBatch();
  await sleep(250);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true });
    return result.value;
  };

  const snapshot = () => evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const sec = [...o.querySelectorAll('aside section')].find(s => s.querySelector('h2')?.textContent.includes('分类批量操作'));
    const list = sec.querySelector('[data-batch-list]');
    const rows = [...list.querySelectorAll('li button[aria-pressed]')];
    const chip = text => [...sec.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(text));
    return JSON.stringify({
      scrollBox: !!list && getComputedStyle(list).overflowY === 'auto',
      scrollHeight: list.clientHeight,
      rows: rows.length,
      checkedRows: rows.filter(r => r.getAttribute('aria-pressed') === 'true').length,
      chips: [...sec.querySelectorAll('[data-chip-key]')].map(b => b.textContent.trim()),
      selectedLabel: sec.textContent.match(/已选 \\d+ 条/)?.[0] ?? null,
      outDisabled: chip('批量移出')?.disabled,
      addDisabled: chip('批量添加')?.disabled,
      poolLines: o.querySelectorAll('main [data-line-card]').length,
      excludedStored: Object.values(JSON.parse(localStorage.getItem('guide.progress.v1') || '{}').lines || {}).filter(s => s.status === 'excluded').length,
    });
  })()`);

  const click = (text) => evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const sec = [...o.querySelectorAll('aside section')].find(s => s.querySelector('h2')?.textContent.includes('分类批量操作'));
    const b = [...sec.querySelectorAll('button')].find(x => x.textContent.trim().startsWith(${JSON.stringify(text)}));
    if (!b) return 'not-found';
    b.click(); return b.textContent.trim();
  })()`);

  const clickRow = (index) => evaluate(`(() => {
    const o = document.querySelector('[data-tracker-app]');
    const sec = [...o.querySelectorAll('aside section')].find(s => s.querySelector('h2')?.textContent.includes('分类批量操作'));
    const rows = [...sec.querySelectorAll('[data-batch-list] li button[aria-pressed]')];
    if (!rows[${index}]) return 'no-row';
    rows[${index}].click(); return rows[${index}].textContent.trim();
  })()`);

  console.log('INITIAL', await snapshot());

  await click('全选当前');
  await sleep(300);
  console.log('AFTER_SELECT_ALL', await snapshot());

  await click('批量移出');
  await sleep(400);
  console.log('AFTER_BATCH_EXCLUDE', await snapshot());

  await click('只看未进池');
  await sleep(300);
  console.log('ONLY_OUT_ON', await snapshot());
  await click('只看未进池');
  await sleep(300);

  await click('全选当前');
  await sleep(300);
  await click('批量添加');
  await sleep(400);
  console.log('AFTER_BATCH_ADD', await snapshot());

  // Partial selection inside the 经纪人 filter.
  await click('经纪人');
  await sleep(300);
  console.log('BROKER_FILTER', await snapshot());
  await clickRow(0);
  await clickRow(1);
  await sleep(300);
  console.log('PARTIAL_CHECKED', await snapshot());
  await click('批量移出');
  await sleep(400);
  console.log('AFTER_PARTIAL_EXCLUDE', await snapshot());

  // With only 2 lines out, the "only out" filter must show exactly those 2.
  await click('只看未进池');
  await sleep(300);
  console.log('ONLY_OUT_PARTIAL', await snapshot());
  await click('只看未进池');
  await sleep(300);

  // Cross-category selection: 1 broker + 1 other, then one batch exclude.
  await clickRow(0);
  await click('其他');
  await sleep(250);
  await clickRow(0);
  await sleep(250);
  console.log('CROSS_FILTER_CHECKED', await snapshot());
  await click('批量移出');
  await sleep(400);
  console.log('AFTER_CROSS_EXCLUDE', await snapshot());

  await send('Page.reload');
  await sleep(3600);
  await expandBatch();
  await sleep(250);
  console.log('AFTER_RELOAD', await snapshot());

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
