import http from 'node:http';

/* Verify the content filter (CG / trigger type) on the event pool:
   1. the row is collapsed by default and shows 「不限」
   2. opening it reveals CG + every trigger type the data uses
   3. 「含 CG」 keeps only lines with a CG event, and cards render only those
   4. CG + 自动 is an AND, and every visible step satisfies both
   5. 清除 restores the full pool
   6. a composite tag (跟随或沟通) is found from either side
   7. the progress totals never change while filtering
   Usage: node cdp_tracker_content.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';

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

function jsonGet(target) {
  return new Promise((resolve, reject) => {
    http.get(target, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    }).on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCOPE = `(document.querySelector('[data-tracker-app]') || document)`;

const STATE = `(() => {
  const root = ${SCOPE};
  const pool = root.querySelector('[data-active-pool]');
  const cards = pool ? [...pool.querySelectorAll('[data-line-card]')] : [];
  const rows = cards.flatMap(c => [...c.querySelectorAll('[data-step-row]')]);
  const bar = root.querySelector('[data-narrow-progress]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null;
  return JSON.stringify({
    label: root.querySelector('[data-content-label]')?.textContent?.trim() ?? null,
    open: !!root.querySelector('[data-content-panel]'),
    keys: [...(root.querySelector('[data-content-panel]')?.querySelectorAll('[data-content-key]') ?? [])].map(b => b.getAttribute('data-content-key')),
    pressed: [...(root.querySelector('[data-content-panel]')?.querySelectorAll('[data-content-key][aria-pressed="true"]') ?? [])].map(b => b.getAttribute('data-content-key')),
    cards: cards.length,
    rows: rows.length,
    cgRows: rows.filter(r => r.getAttribute('data-step-cg') === 'yes').length,
    tags: [...new Set(rows.map(r => r.getAttribute('data-step-tag')).filter(Boolean))],
    hint: root.querySelector('[data-filter-hint]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    progress: bar,
    emptyText: pool ? null : (root.querySelector('section')?.textContent?.match(/没有内容为[^，]*/)?.[0] ?? null),
  });
})()`;

async function main() {
  const version = await jsonGet('http://127.0.0.1:9339/json/version');
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
  await sleep(3500);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result?.value;
  };
  const state = () => evaluate(STATE).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };
  const click = (selector) => evaluate(`(() => {
    const el = ${SCOPE}.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);

  // Two artists, so the pool also contains the 艺人事件簿 lines where the
  // composite tags (跟随或沟通 / 场景或自动) live.
  const save = {
    version: 1,
    selectedArtists: ['characters/sang-hebei', 'characters/lin-fenfen'],
    lines: {},
    order: [],
    pinned: [],
  };
  const reset = async () => {
    await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify(save))}); 1`);
    await send('Page.reload');
    await sleep(3500);
  };

  await reset();

  // 1. Collapsed by default.
  const initial = await state();
  console.log('INITIAL', JSON.stringify(initial));
  if (initial.label !== '不限') fail('content row should start as 不限, got ' + initial.label);
  if (initial.open) fail('content panel should start collapsed');
  if (initial.cards === 0) fail('pool is empty — cannot test filtering');
  const allCards = initial.cards;
  const allProgress = initial.progress;
  if (!allProgress) fail('narrow progress bar is missing, cannot check total stability');

  // 2. Open the panel.
  if (!(await click('[data-content-toggle]'))) fail('content toggle is missing');
  await sleep(300);
  const opened = await state();
  console.log('OPENED', JSON.stringify({ keys: opened.keys }));
  const expectedKeys = ['cg', '自动', '场景', '新闻', '跟随', '手动', '沟通', '探班'];
  if (opened.keys.join('|') !== expectedKeys.join('|')) {
    fail('unexpected content chips: ' + opened.keys.join('|'));
  }

  // 3. 含 CG.
  await click('[data-content-key="cg"]');
  await sleep(500);
  const cg = await state();
  console.log('CG', JSON.stringify({ label: cg.label, cards: cg.cards, rows: cg.rows, cgRows: cg.cgRows, hint: cg.hint }));
  if (cg.label !== '含 CG') fail('label should read 含 CG, got ' + cg.label);
  if (cg.cards === 0) fail('含 CG filtered everything out');
  if (cg.cards >= allCards) fail('含 CG did not narrow the pool');
  if (cg.rows === 0) fail('含 CG left no visible steps');
  if (cg.cgRows !== cg.rows) fail('non-CG steps leaked into the CG view: ' + cg.cgRows + '/' + cg.rows);
  if (!/含 CG/.test(cg.hint ?? '')) fail('hint does not mention the content filter: ' + cg.hint);
  if (cg.progress !== allProgress) fail('content filter changed the progress totals: ' + cg.progress + ' vs ' + allProgress);

  // 4. CG + 自动 → AND.
  await click('[data-content-key="自动"]');
  await sleep(500);
  const both = await state();
  console.log('CG_AUTO', JSON.stringify({ label: both.label, cards: both.cards, rows: both.rows, cgRows: both.cgRows, tags: both.tags }));
  if (both.label !== '含 CG · 自动') fail('label should join both sides, got ' + both.label);
  if (both.cards > cg.cards) fail('adding a type filter widened the pool');
  if (both.cgRows !== both.rows) fail('CG view leaked non-CG steps');
  if (both.tags.some((tag) => !tag.includes('自动'))) fail('type filter leaked other tags: ' + both.tags.join('|'));
  if (both.progress !== allProgress) fail('progress totals drifted with two filters');

  // 5. Clear.
  await click('[data-content-clear]');
  await sleep(500);
  const cleared = await state();
  console.log('CLEARED', JSON.stringify({ label: cleared.label, cards: cleared.cards, hint: cleared.hint }));
  if (cleared.label !== '不限') fail('clear did not reset the label');
  if (cleared.cards !== allCards) fail('clear did not restore the pool: ' + cleared.cards + '/' + allCards);
  if (cleared.pressed.length > 0) fail('chips stayed pressed after clearing: ' + cleared.pressed.join('|'));

  // 6. Composite tags match either side.
  await click('[data-content-key="沟通"]');
  await sleep(500);
  const comm = await state();
  const composite = comm.tags.filter((tag) => tag.includes('或'));
  console.log('COMMS', JSON.stringify({ cards: comm.cards, tags: comm.tags.slice(0, 6), composite }));
  if (comm.cards === 0) fail('沟通 filter matched nothing');
  if (!comm.tags.every((tag) => tag.includes('沟通'))) fail('沟通 filter leaked other tags');
  if (composite.length === 0) fail('no composite tag matched 沟通 — expected 跟随或沟通 events');

  // 7. Back to everything, panel still open, all steps visible again.
  await click('[data-content-clear]');
  await sleep(500);
  const restored = await state();
  console.log('RESTORED', JSON.stringify({ cards: restored.cards, progress: restored.progress }));
  if (restored.cards !== allCards) fail('pool was not fully restored');
  if (restored.progress !== allProgress) fail('progress totals did not return');

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
