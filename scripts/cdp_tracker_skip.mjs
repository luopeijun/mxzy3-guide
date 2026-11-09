import http from 'node:http';

/* Verify per-step 放弃 (skip):
   1. every step row has a skip control; right-click does the same
   2. skipping drops the step from `done` and from the progress denominator,
      and shows 已放弃 badges on both the step and the line
   3. undo puts the step back (it does NOT come back as done)
   4. other steps / other lines are untouched
   5. a line whose remaining steps are all ticked still archives (skip is not an
      obstacle), and the skip survives a reload
   6. the right rail counts skipped steps separately
   Usage: node cdp_tracker_skip.mjs [url] */
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
const SCOPE = `document.querySelector('[data-tracker-app]') || document`;

const SNAPSHOT = `(() => {
  const root = ${SCOPE};
  const active = root.querySelector('[data-active-pool]');
  const card = active?.querySelector('[data-line-card]');
  if (!card) return JSON.stringify({ ready: false });
  const rows = [...card.querySelectorAll('[data-step-row]')];
  const progress = card.querySelector('[data-line-progress]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? '';
  const m = progress.match(/(\\d+)\\/(\\d+)/);
  const overview = [...root.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.includes('进度概览'));
  return JSON.stringify({
    ready: true,
    lineId: card.getAttribute('data-line-id'),
    name: card.querySelector('[data-line-name]')?.textContent?.trim() ?? '',
    total: rows.length,
    skipped: rows.filter(r => r.getAttribute('data-step-skipped') === 'yes').length,
    skippedBadge: !!card.querySelector('[data-skipped-badge]'),
    skippedBadgeText: card.querySelector('[data-skipped-badge]')?.textContent?.trim() ?? null,
    progress,
    doneCount: m ? +m[1] : null,
    counted: m ? +m[2] : null,
    skipBtn: rows[0]?.querySelector('[data-step-skip]')?.textContent?.trim() ?? null,
    restoreBtn: rows[0]?.querySelector('[data-step-skip]')?.getAttribute('aria-label') ?? null,
    rowDone: rows.map(r => r.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed')),
    rowSkipped: rows.map(r => r.getAttribute('data-step-skipped') === 'yes'),
    archiveCount: root.querySelectorAll('[data-completed-pool] [data-line-card]').length,
    master: card.querySelector('[data-master-checkbox]')?.getAttribute('aria-checked'),
    overview: overview?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    tail: JSON.stringify(JSON.parse(localStorage.getItem('guide.progress.v1') || '{}').lines || {}),
  });
})()`;

const ARCHIVE = `(() => {
  const root = ${SCOPE};
  const pool = root.querySelector('[data-completed-pool]');
  const card = pool?.querySelector('[data-line-card]');
  return JSON.stringify({
    exists: !!pool,
    expanded: pool?.querySelector('[data-completed-toggle]')?.getAttribute('aria-expanded') ?? null,
    cards: pool ? pool.querySelectorAll('[data-line-card]').length : 0,
    name: card?.querySelector('[data-line-name]')?.textContent?.trim() ?? null,
    progress: card?.querySelector('[data-line-progress]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    skippedBadge: card?.querySelector('[data-skipped-badge]')?.textContent?.trim() ?? null,
    completedBadge: card ? card.textContent.includes('已完成') : false,
    skippedRows: card ? [...card.querySelectorAll('[data-step-row]')].filter(r => r.getAttribute('data-step-skipped') === 'yes').length : 0,
    activeCards: root.querySelectorAll('[data-active-pool] [data-line-card]').length,
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
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };

  const waitFor = async (expression, label, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(350);
    }
    throw new Error('timeout waiting for ' + label);
  };

  const snap = () => evaluate(SNAPSHOT).then(JSON.parse);
  const archive = () => evaluate(ARCHIVE).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };

  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3500);
  await waitFor(
    `(${SCOPE}).querySelector('[data-active-pool] [data-line-card]') ? 'ok' : ''`,
    'first pool card',
  );

  // Open the first card so its step rows are rendered. State is read before
  // every click: React only flips aria-expanded on the next render, so clicking
  // on every poll would toggle the card shut again. A click that lands before
  // hydration is a no-op and is retried.
  const start = Date.now();
  let rows = 0;
  while (Date.now() - start < 15000) {
    const state = JSON.parse(await evaluate(`(() => {
      const c = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
      if (!c) return JSON.stringify({ rows: 0, expanded: null });
      const toggle = c.querySelector('button[aria-expanded]');
      return JSON.stringify({
        rows: c.querySelectorAll('[data-step-row]').length,
        expanded: toggle?.getAttribute('aria-expanded') ?? null,
      });
    })()`));
    rows = state.rows;
    if (rows > 2) break;
    if (state.expanded === 'false') {
      await evaluate(`(() => {
        const c = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
        c?.querySelector('button[aria-expanded]')?.click();
        return 1;
      })()`);
    }
    await sleep(400);
  }
  if (rows <= 2) throw new Error('timeout opening the first pool card');
  await sleep(250);

  const base = await snap();
  if (!base.ready || base.total < 3) fail('baseline card has too few steps');
  console.log('BASELINE', JSON.stringify({ total: base.total, progress: base.progress, skipped: base.skipped }));
  if (base.skipped !== 0 || base.skippedBadge) fail('fresh line should have no skipped steps');
  if (base.counted !== base.total || base.doneCount !== 0) fail('fresh line progress should be 0/total');

  const clickStep = (index) => evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    c.querySelectorAll('[data-step-row]')[${index}].querySelector('button[aria-pressed]').click();
    return 1;
  })()`);

  const rightClickStep = (index) => evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    c.querySelectorAll('[data-step-row]')[${index}]
      .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return 1;
  })()`);

  const skipButton = (index) => evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    c.querySelectorAll('[data-step-row]')[${index}].querySelector('[data-step-skip]').click();
    return 1;
  })()`);

  // The skip control must exist and be discoverable (right-click is the shortcut).
  if (!base.skipBtn) fail('no skip control on the step row');
  if (base.restoreBtn && !/放弃/.test(base.restoreBtn)) fail('skip control is not labelled 放弃');

  // 1. Ticking then skipping the same step: skip wins, done is cleared.
  await clickStep(0);
  await sleep(220);
  const ticked = await snap();
  if (ticked.doneCount !== 1) fail('ticking a step did not increase done');
  console.log('AFTER_TICK', JSON.stringify({ progress: ticked.progress, rowDone: ticked.rowDone.slice(0, 3) }));

  await rightClickStep(0);
  await sleep(260);
  const skippedOne = await snap();
  console.log('AFTER_RIGHT_CLICK_SKIP', JSON.stringify({
    skipped: skippedOne.skipped, progress: skippedOne.progress, badge: skippedOne.skippedBadgeText,
    rowDone: skippedOne.rowDone.slice(0, 3), rowSkipped: skippedOne.rowSkipped.slice(0, 3),
  }));
  if (skippedOne.skipped !== 1) fail('right-click did not skip the step');
  if (!skippedOne.skippedBadge) fail('line lost its 已放弃 badge');
  if (skippedOne.doneCount !== 0) fail('a skipped step must not stay done');
  if (skippedOne.counted !== base.total - 1) fail('skipped step still counted in the denominator');
  if (skippedOne.skipBtn !== '恢复') fail('skipped row should offer 恢复');
  if (skippedOne.rowSkipped[1] || skippedOne.rowSkipped[2]) fail('skip leaked into other steps');
  if (skippedOne.rowDone[1] !== 'false' || skippedOne.rowDone[2] !== 'false') fail('skip changed other steps');

  let stored = JSON.parse(skippedOne.tail);
  const firstState = stored[skippedOne.lineId];
  if (!firstState || firstState.skipped.length !== 1 || firstState.done.length !== 0) {
    fail('skip was not persisted as {skipped:[..], done:[]}');
  }

  // 2. Undo: the step returns to the counted set but stays *not done*.
  await skipButton(0);
  await sleep(240);
  const restored = await snap();
  console.log('AFTER_RESTORE', JSON.stringify({ skipped: restored.skipped, progress: restored.progress, badge: restored.skippedBadge }));
  if (restored.skipped !== 0 || restored.skippedBadge) fail('restore did not clear the skip');
  if (restored.counted !== base.total) fail('restored step did not return to the denominator');
  if (restored.doneCount !== 0) fail('restore should not mark the step done');

  // 3. Skip two steps through the dedicated button, then finish the rest.
  await skipButton(0);
  await sleep(180);
  await skipButton(1);
  await sleep(240);
  const twoSkipped = await snap();
  console.log('TWO_SKIPPED', JSON.stringify({ skipped: twoSkipped.skipped, progress: twoSkipped.progress, badge: twoSkipped.skippedBadgeText }));
  if (twoSkipped.skipped !== 2) fail('second skip did not apply');
  if (twoSkipped.counted !== base.total - 2) fail('two skipped steps must leave total-2 counted');

  // Ticking the master box ticks exactly the remaining steps and archives the line.
  await evaluate(`(() => { (${SCOPE}).querySelector('[data-active-pool] [data-master-checkbox]').click(); return 1; })()`);
  await sleep(500);

  // The archive renders its cards only while expanded, and archived cards start
  // collapsed — open both levels before reading the card itself.
  const openArchive = async () => {
    await evaluate(`(() => {
      const pool = (${SCOPE}).querySelector('[data-completed-pool]');
      const toggle = pool?.querySelector('[data-completed-toggle]');
      if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      return 1;
    })()`);
    await sleep(320);
    await evaluate(`(() => {
      const card = (${SCOPE}).querySelector('[data-completed-pool] [data-line-card]');
      const toggle = card?.querySelector('button[aria-expanded]');
      if (toggle && toggle.getAttribute('aria-expanded') !== 'true') toggle.click();
      return 1;
    })()`);
    await sleep(380);
  };
  await openArchive();

  const archived = await archive();
  console.log('ARCHIVE_AFTER_MASTER', JSON.stringify(archived));
  if (!archived.exists) fail('line with only skipped steps left was not archived');
  if (archived.skippedRows !== 2) fail('archived card lost its skipped rows');
  if (!archived.completedBadge) fail('archived card has no 已完成 badge');
  const ratio = (archived.progress ?? '').match(/(\d+)\/(\d+)/);
  if (!ratio) fail('archived card lost its progress readout');
  const aDone = Number(ratio[1]);
  const aTotal = Number(ratio[2]);
  if (aDone !== aTotal || aTotal !== base.total - 2) {
    fail(`archive progress ${archived.progress} should be ${base.total - 2}/${base.total - 2}`);
  }

  const afterArchive = await snap();
  if (!afterArchive.overview?.includes('已放弃 2 步')) {
    fail('overview does not report the skipped steps: ' + afterArchive.overview);
  }

  // 4. Reload: the skip, the archive and the badge all survive.
  await send('Page.reload');
  await sleep(3600);
  await waitFor(`(${SCOPE}).querySelector('[data-completed-pool]') ? 'ok' : ''`, 'archive after reload');
  const collapsed = await archive();
  if (collapsed.expanded !== 'false') fail('archive should come back collapsed after a reload');
  await openArchive();
  const reload = await archive();
  console.log('AFTER_RELOAD', JSON.stringify(reload));
  if (!reload.exists || reload.skippedRows !== 2) fail('skip did not survive a reload');
  if (reload.activeCards !== archived.activeCards) fail('working pool size changed after reload');

  // 5. Un-skip inside the archive and the line must leave the archive immediately
  //    (it now has unticked steps again).
  await evaluate(`(() => {
    const card = (${SCOPE}).querySelector('[data-completed-pool] [data-line-card]');
    card.querySelector('[data-step-row] [data-step-skip]').click();
    return 1;
  })()`);
  await sleep(500);
  const afterUndoInArchive = await snap();
  console.log('AFTER_UNSKIP_IN_ARCHIVE', JSON.stringify({ archiveCount: afterUndoInArchive.archiveCount, skipped: afterUndoInArchive.skipped }));
  if (afterUndoInArchive.archiveCount !== 0) fail('un-skipping inside the archive did not send the line back to the pool');

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
