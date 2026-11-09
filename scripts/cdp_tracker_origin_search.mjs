import http from 'node:http';

/* Verify that source chips participate in the event-pool search:
   searching an artist name surfaces all of that artist's lines (whole line,
   not just matching steps), the chip is highlighted, and clearing the query
   restores the full pool.
   Usage: node cdp_tracker_origin_search.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const SCOPE = `document.querySelector('[data-tracker-app]') || document`;

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

const SNAPSHOT = `(() => {
  const root = ${SCOPE};
  const cards = [...root.querySelectorAll('[data-active-pool] [data-line-card]')];
  const chip = c => c.querySelector('[data-origin-tag]');
  const of = tone => cards.filter(c => chip(c)?.getAttribute('data-origin-tone') === tone);
  const summary = tone => {
    const group = of(tone);
    return {
      count: group.length,
      hit: group.filter(c => chip(c)?.getAttribute('data-origin-hit') === 'yes').length,
      wholeLine: group.filter(c => !c.textContent.includes('命中 ')).length,
    };
  };
  return JSON.stringify({
    cards: cards.length,
    artist: summary('artist'),
    notice: summary('notice'),
    status: root.querySelector('main p.text-ui-2xs')?.textContent?.trim() ?? null,
    hits: root.querySelectorAll('[data-origin-hit="yes"]').length,
  });
})()`;

const SEARCH = (value) => `(() => {
  const i = document.querySelector('input[aria-label="搜索事件池"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
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
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };

  const state = JSON.stringify({
    version: 1,
    selectedArtists: ['characters/lin-fenfen'],
    lines: {},
    order: [],
    pinned: [],
  });
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
  await send('Page.reload');
  await sleep(3500);

  const baseline = JSON.parse(await evaluate(SNAPSHOT));
  console.log('BASELINE', JSON.stringify(baseline));
  if (baseline.cards !== 40 || baseline.artist.count !== 7 || baseline.notice.count !== 7) {
    throw new Error('unexpected baseline pool');
  }

  await evaluate(SEARCH('林芬芬'));
  await sleep(500);
  const byArtist = JSON.parse(await evaluate(SNAPSHOT));
  console.log('SEARCH_ARTIST', JSON.stringify(byArtist));
  if (
    byArtist.artist.count !== 7 ||
    byArtist.artist.hit !== 7 ||
    byArtist.artist.wholeLine !== 7 ||
    byArtist.cards < 7
  ) {
    throw new Error('artist name search did not surface all artist lines');
  }

  await evaluate(SEARCH('通告'));
  await sleep(500);
  const byCategory = JSON.parse(await evaluate(SNAPSHOT));
  console.log('SEARCH_CATEGORY', JSON.stringify(byCategory));
  if (
    byCategory.notice.count !== 7 ||
    byCategory.notice.hit !== 7 ||
    byCategory.notice.wholeLine !== 7
  ) {
    throw new Error('category name search did not surface all notice lines');
  }

  await evaluate(SEARCH(''));
  await sleep(450);
  const cleared = JSON.parse(await evaluate(SNAPSHOT));
  console.log('AFTER_CLEAR', JSON.stringify(cleared));
  if (cleared.cards !== baseline.cards || cleared.hits !== 0) {
    throw new Error('clearing search did not restore the pool / chip styling');
  }

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
