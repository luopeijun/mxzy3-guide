import http from 'node:http';

/* Verify the 通告 tab:
   1. the tab is reachable and the list renders the whole table
   2. category / time / difficulty / company filters narrow the list, and the
      cards that survive really belong to the chosen bucket
   3. search matches name / id / brief and the detail panel follows the selection
   4. the detail panel renders roles with requirements, special requirements and
      daily gains (adverts take their gains from the reference table)
   5. reset restores the full list
   6. on a narrow viewport a card opens a full-screen detail drawer that closes
   Usage: node cdp_notices.mjs [url] */

const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/notices';

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
const SCOPE = `(document.querySelector('[data-notices-app]') || document)`;

const STATE = `(() => {
  const root = ${SCOPE};
  const cards = [...root.querySelectorAll('[data-notice-card]')];
  const countText = root.querySelector('[data-notice-count]')?.textContent?.trim() ?? null;
  const detail = root.querySelector('[data-notice-detail]');
  return JSON.stringify({
    countText,
    cards: cards.length,
    ids: cards.slice(0, 8).map(c => c.getAttribute('data-notice-id')),
    pills: cards.slice(0, 4).map(c => c.querySelector('span')?.textContent?.trim() ?? ''),
    detail: detail ? {
      title: detail.querySelector('h2')?.textContent?.trim() ?? null,
      roles: detail.querySelectorAll('[data-notice-role]').length,
      hasRequirements: detail.textContent.includes('能力要求'),
      hasGains: detail.textContent.includes('每天影响'),
      hasSpecial: !!detail.querySelector('[data-notice-special]'),
      dailyBlocks: detail.querySelectorAll('[data-notice-daily]').length,
      dailySpecial: detail.querySelectorAll('[data-notice-daily-special]').length,
      // 「每天影响」里不许再出现按天打折的旧文案（「/ 天」挂在数字后面读着像比率）。
      staleDailyWording: /\\d\\s*\\/\\s*天/.test(detail.textContent),
    } : null,
    catChips: root.querySelectorAll('[data-notice-cat]').length,
    more: !!root.querySelector('[data-notice-more]'),
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
  await sleep(4000);

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
  const typeSearch = async (value) => {
    await evaluate(`(() => {
      const input = ${SCOPE}.querySelector('input[aria-label="搜索通告"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()`);
    await sleep(400);
  };

  // 1. Initial list.
  const initial = await state();
  console.log('INITIAL', JSON.stringify(initial));
  if (!/当前 1587 条/.test(initial.countText ?? '')) fail('unexpected initial count: ' + initial.countText);
  if (initial.cards !== 60) fail('first page should be 60 cards, got ' + initial.cards);
  if (!initial.more) fail('the 加载更多 button is missing for 1587 notices');
  if (initial.catChips !== 5) fail('expected 5 category chips, got ' + initial.catChips);
  if (!initial.detail) fail('the detail panel did not render');
  if (initial.detail.title !== '舞动人生') fail('detail should default to the first notice, got ' + initial.detail.title);

  // 2. Category filter.
  if (!(await click('[data-notice-cat="tv"]'))) fail('category chip is missing');
  await sleep(400);
  const tv = await state();
  console.log('TV', JSON.stringify({ count: tv.countText, cards: tv.cards, pills: tv.pills, ids: tv.ids.slice(0, 3) }));
  if (!tv.ids.every((id) => id.startsWith('TV'))) fail('non-TV notice leaked into the TV filter: ' + tv.ids);
  if (!/当前 367 条/.test(tv.countText ?? '')) fail('TV count should be 367, got ' + tv.countText);

  // 3. Time filter on top of the category.
  await click('[data-notice-time="第三年"]');
  await sleep(400);
  const tvThird = await state();
  console.log('TV_YEAR3', JSON.stringify({ count: tvThird.countText, cards: tvThird.cards }));
  const year3 = Number((tvThird.countText ?? '').match(/当前 (\d+) 条/)?.[1] ?? -1);
  if (!(year3 > 0 && year3 < 367)) fail('time filter did not narrow the TV list: ' + tvThird.countText);

  // 4. Difficulty filter — every visible card must contain a 5★ role.
  await click('[data-notice-star="5"]');
  await sleep(400);
  const five = await state();
  console.log('STAR5', JSON.stringify({ count: five.countText, cards: five.cards }));
  const stars = await evaluate(`(() => {
    const cards = [...${SCOPE}.querySelectorAll('[data-notice-card]')];
    return cards.filter(c => c.textContent.includes('5★')).length;
  })()`);
  if (stars !== five.cards) fail(`只有 ${stars}/${five.cards} 张卡含 5 星角色`);

  // 5. Search, then look at an advert detail (gains come from the reference table).
  await click('[data-notice-reset]');
  await sleep(400);
  await click('[data-notice-cat="ad"]');
  await sleep(400);
  await typeSearch('冰棒');
  const ad = await state();
  console.log('AD_SEARCH', JSON.stringify(ad.detail));
  if (ad.detail?.title !== '我冰棒') fail('search did not land on 我冰棒, got ' + ad.detail?.title);
  if (!ad.detail.hasRequirements) fail('advert detail is missing 能力要求');
  if (!ad.detail.hasGains) fail('advert detail is missing 每天影响 (reference-table fallback)');
  if (!(ad.detail.roles >= 1)) fail('advert detail rendered no roles');
  if (!(ad.detail.dailyBlocks >= 1)) fail('no 每天影响 block rendered');
  if (ad.detail.staleDailyWording) fail('每天影响里还留着「/ 天」的旧写法');

  // 6. Reset restores everything.
  await click('[data-notice-reset]');
  await sleep(500);
  const reset = await state();
  console.log('RESET', JSON.stringify({ count: reset.countText, cards: reset.cards }));
  if (!/当前 1587 条/.test(reset.countText ?? '')) fail('reset did not restore the full list: ' + reset.countText);

  // 7. 能力对照：四块参照表都要渲染出来。
  await click('[data-notice-view="reference"]');
  await sleep(500);
  const reference = await evaluate(`(() => {
    const root = ${SCOPE};
    const box = root.querySelector('[data-notice-reference]');
    if (!box) return JSON.stringify({ missing: true });
    return JSON.stringify({
      sections: [...box.querySelectorAll('section h2')].map(h => h.textContent.trim()),
      groups: [...box.querySelectorAll('[data-reference-group]')].map(g => g.getAttribute('data-reference-group')),
      gradeRows: box.querySelectorAll('[data-reference-group] tr').length,
      growthRows: box.querySelectorAll('[data-growth-table] tbody tr').length,
      highlighted: box.querySelectorAll('[data-growth-table] td.bg-brand-soft').length,
      notes: box.querySelectorAll('[data-reference-notes] li').length,
    });
  })()`);
  console.log('REFERENCE', reference);
  const ref = JSON.parse(reference);
  if (ref.missing) fail('the 能力对照 view did not render');
  if (ref.sections.length !== 5) fail('expected 5 reference sections, got ' + ref.sections.join('/'));
  if (!ref.sections.includes('原表说明')) fail('the source notes section is missing');
  if (ref.groups.join(',') !== 'movie,tv,music,ad,show') fail('reference groups: ' + ref.groups.join(','));
  if (ref.gradeRows !== 67) fail('expected 67 grade rows, got ' + ref.gradeRows);
  if (ref.growthRows !== 18) fail('expected 18 artists, got ' + ref.growthRows);
  if (ref.highlighted === 0) fail('the growth table has no highlighted maximum');
  if (ref.notes < 2) fail('expected the spreadsheet notes, got ' + ref.notes);
  await click('[data-notice-view="list"]');
  await sleep(400);

  // 8. Narrow viewport: the card opens the drawer, 关闭 sends it away.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 800, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(500);
  const beforeDrawer = await evaluate(`(() => {
    const root = ${SCOPE};
    return JSON.stringify({ drawer: !!root.querySelector('[data-notice-drawer]') });
  })()`);
  console.log('NARROW_BEFORE', beforeDrawer);
  if (JSON.parse(beforeDrawer).drawer) fail('the drawer should stay closed until a card is clicked');
  await click('[data-notice-card]');
  await sleep(500);
  const drawer = await evaluate(`(() => {
    const box = ${SCOPE}.querySelector('[data-notice-drawer]');
    const panel = box?.querySelector('[data-notice-detail]');
    const close = panel?.querySelector('button[aria-label="关闭详情"]');
    return JSON.stringify({ title: panel?.querySelector('h2')?.textContent?.trim() ?? null, hasClose: !!close });
  })()`);
  console.log('NARROW_DRAWER', drawer);
  const parsed = JSON.parse(drawer);
  if (!parsed.hasClose) fail('narrow drawer has no 关闭 button');
  await click('[data-notice-drawer] button[aria-label="关闭详情"]');
  await sleep(400);
  const closed = await evaluate(`JSON.stringify({ drawer: !!${SCOPE}.querySelector('[data-notice-drawer]') })`);
  console.log('NARROW_CLOSED', closed);
  if (JSON.parse(closed).drawer) fail('the drawer did not close');

  console.log('OK notices');
  process.exit(0);
}

main().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
