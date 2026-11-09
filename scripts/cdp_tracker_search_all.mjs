import http from 'node:http';

/* Verify 「看整条线」 inside a search result card:
   1. a body hit renders only the matched steps and shows a summary row
   2. the toggle expands the card to the whole task line, search stays active
   3. matches are still highlighted after expanding, other cards untouched
   4. toggling back restores 「只看命中」
   5. changing the keyword resets the toggle, so results never start expanded
   6. leaving the search removes the summary row
   Usage: node cdp_tracker_search_all.mjs [url] */
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SCOPE = `(document.querySelector('[data-tracker-app]') || document)`;

/** Everything the assertions need, read from the first card that has a summary
 *  row (i.e. a card whose line only partially matched the query). */
const STATE = `(() => {
  const root = ${SCOPE};
  const input = root.querySelector('input[aria-label="搜索事件池"]');
  const hint = root.querySelector('[data-filter-hint]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null;
  const pool = root.querySelector('[data-active-pool]');
  const cards = pool ? [...pool.querySelectorAll('[data-line-card]')] : [];
  const summaries = cards.filter(c => c.querySelector('[data-steps-summary]'));
  const card = summaries[0] ?? null;
  const text = card?.querySelector('[data-steps-summary] span')?.textContent?.trim() ?? null;
  const hitCount = text
    ? (text.match(/命中 (\\d+) 个事件/) || text.match(/命中 (\\d+) 个$/))
    : null;
  return JSON.stringify({
    query: input ? input.value : null,
    hint,
    cards: cards.length,
    cardsWithToggle: summaries.length,
    cardRows: card ? card.querySelectorAll('[data-step-row]').length : 0,
    cardMarks: card ? card.querySelectorAll('mark').length : 0,
    summary: text,
    hit: hitCount ? Number(hitCount[1]) : null,
    pressed: card ? card.querySelector('[data-show-all-toggle]')?.getAttribute('aria-pressed') ?? null : null,
    toggleLabel: card ? card.querySelector('[data-show-all-toggle]')?.textContent?.trim() ?? null : null,
    toggles: root.querySelectorAll('[data-show-all-toggle]').length,
    otherRows: summaries[1] ? summaries[1].querySelectorAll('[data-step-row]').length : null,
  });
})()`;

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
  await sleep(3500);

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result?.value;
  };
  const state = () => evaluate(STATE).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };
  const click = (selector, index = 0) => evaluate(`(() => {
    const els = [...${SCOPE}.querySelectorAll(${JSON.stringify(selector)})];
    const el = els[${index}];
    if (!el) return false;
    el.click();
    return true;
  })()`);
  const setQuery = async (value) => {
    await evaluate(`(() => {
      const input = ${SCOPE}.querySelector('input[aria-label="搜索事件池"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    await sleep(450);
  };

  // Two artists make the pool big enough that a body keyword only touches part
  // of a line, which is exactly the case the toggle exists for.
  const save = {
    version: 1,
    selectedArtists: ['characters/sang-hebei', 'characters/lin-fenfen'],
    lines: {},
    order: [],
    pinned: [],
  };
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify(save))}); 1`);
  await send('Page.reload');
  await sleep(3500);

  // 1. A body hit renders a partial list plus the summary row.
  await setQuery('好感');
  const hit = await state();
  console.log('HIT', JSON.stringify(hit));
  if (!hit.cardsWithToggle) fail('no card offered 「看整条线」 for a body hit');
  if (hit.hit === null) fail('could not read the hit count from ' + JSON.stringify(hit.summary));
  if (hit.cardRows !== hit.hit) fail(`card shows ${hit.cardRows} steps for ${hit.hit} hits`);
  if (!/^命中 \d+ 个事件 · 共 \d+ 步$/.test(hit.summary ?? '')) {
    fail('unexpected summary text: ' + hit.summary);
  }
  if (hit.pressed !== 'false') fail('toggle should start off, got ' + hit.pressed);
  if (hit.toggleLabel !== '看整条线') fail('toggle label should read 看整条线, got ' + hit.toggleLabel);
  const total = Number((hit.summary ?? '').match(/共 (\d+) 步/)?.[1] ?? 0);
  if (!(total > hit.hit)) fail('this line has no hidden steps — the fixture no longer fits the test');
  const otherRows = hit.otherRows;

  // 2. Expand to the whole line; the search itself must not change.
  if (!(await click('[data-show-all-toggle]'))) fail('the toggle is missing');
  await sleep(400);
  const all = await state();
  console.log('SHOW_ALL', JSON.stringify(all));
  if (all.pressed !== 'true') fail('toggle did not report aria-pressed=true');
  if (all.cardRows !== total) fail(`expected ${total} steps after expanding, got ${all.cardRows}`);
  if (all.query !== '好感') fail('expanding cleared the search box: ' + all.query);
  if (all.hint !== hit.hint) fail('expanding changed the search summary: ' + all.hint + ' vs ' + hit.hint);
  if (all.cardMarks === 0) fail('matches are no longer highlighted after expanding');
  if (otherRows !== null && all.otherRows !== otherRows) {
    fail('expanding one card changed another card: ' + all.otherRows + ' vs ' + otherRows);
  }
  if (all.toggleLabel !== '只看命中') fail('toggle label should read 只看命中, got ' + all.toggleLabel);

  // 3. Back to the hit-only view.
  await click('[data-show-all-toggle]');
  await sleep(400);
  const back = await state();
  console.log('COLLAPSED', JSON.stringify({ rows: back.cardRows, hit: back.hit, pressed: back.pressed }));
  if (back.cardRows !== hit.cardRows) fail('collapsing did not restore the hit-only list');
  if (back.pressed !== 'false') fail('toggle stayed pressed after collapsing');

  // 4. A new keyword starts from 「只看命中」 again.
  await click('[data-show-all-toggle]');
  await sleep(300);
  await setQuery('记者');
  const next = await state();
  console.log('NEW_QUERY', JSON.stringify({ rows: next.cardRows, hit: next.hit, pressed: next.pressed, summary: next.summary }));
  if (next.pressed !== null && next.pressed !== 'false') fail('a new query kept the previous expansion');
  if (next.cardsWithToggle && next.hit !== null && next.cardRows !== next.hit) {
    fail('a new query did not reset to hit-only: ' + next.cardRows + ' rows / ' + next.hit + ' hits');
  }

  // 5. Leaving the search removes the summary row entirely.
  await evaluate(`(() => {
    const input = ${SCOPE}.querySelector('input[aria-label="搜索事件池"]');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return input.value;
  })()`);
  await sleep(500);
  const cleared = await state();
  console.log('CLEARED', JSON.stringify({ query: cleared.query, toggles: cleared.toggles, cards: cleared.cards }));
  if (cleared.query !== '') fail('Esc did not clear the search box');
  if (cleared.toggles !== 0) fail('「看整条线」 survived leaving the search');

  console.log('OK search show-all');
  process.exit(0);
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
