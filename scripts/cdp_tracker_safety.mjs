import http from 'node:http';

/* Verify the data-safety additions:
   1. 重置进度 asks first (request → confirm), 取消 does nothing
   2. confirming a reset keeps a snapshot, and 撤销 restores it
   3. a 覆盖 import also snapshots the previous save and can be undone
   4. a line whose only record is a skipped step counts as 进行中, not 未开始
   5. the total-progress bar only shows on narrow viewports
   Usage: node cdp_tracker_safety.mjs [url] */
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

const STATE = `(() => {
  const root = ${SCOPE};
  const panel = root.querySelector('[data-transfer-panel]');
  const backup = panel?.querySelector('[data-transfer-backup]');
  const stored = JSON.parse(localStorage.getItem('guide.progress.v1') || '{}');
  const backupStored = localStorage.getItem('guide.progress.backup.v1');
  return JSON.stringify({
    confirmOpen: !!root.querySelector('[data-reset-confirm]'),
    backupText: backup ? backup.textContent.replace(/\\s+/g, ' ').trim() : null,
    hasUndo: !!panel?.querySelector('[data-transfer-undo]'),
    lineCount: Object.keys(stored.lines || {}).length,
    artists: (stored.selectedArtists || []).length,
    firstLine: JSON.stringify((stored.lines || {})[Object.keys(stored.lines || {})[0]] || null),
    backupInStorage: !!backupStored,
    narrowBar: (() => {
      const bar = root.querySelector('[data-narrow-progress]');
      if (!bar) return null;
      return { display: getComputedStyle(bar).display, text: bar.textContent.replace(/\\s+/g, ' ').trim() };
    })(),
    chips: [...root.querySelectorAll('[data-filter-key]')].map(c => c.textContent.replace(/\\s+/g, ' ').trim()),
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
  const state = () => evaluate(STATE).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };
  const click = (selector) => evaluate(`(() => {
    const el = (${SCOPE}).querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);

  // Seed a save: two artists, one line with progress.
  const seeded = {
    version: 1,
    selectedArtists: ['characters/lin-fenfen', 'characters/ou-yiqing'],
    lines: {
      'game-guide/initial-events::0::初始剧情': { status: 'active', done: [1, 2], skipped: [] },
    },
    order: [],
    pinned: [],
  };
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify(seeded))}); localStorage.removeItem('guide.progress.backup.v1'); 1`);
  await send('Page.reload');
  await sleep(3600);
  await waitFor(`(${SCOPE}).querySelector('[data-active-pool] [data-line-card]') ? 'ok' : ''`, 'pool');

  const base = await state();
  console.log('BASE', JSON.stringify({ lineCount: base.lineCount, artists: base.artists, firstLine: base.firstLine, narrowBar: base.narrowBar }));
  if (base.lineCount !== 1) fail('seed did not load');

  // 5. Desktop: the narrow progress bar must be hidden.
  if (base.narrowBar && base.narrowBar.display !== 'none') {
    fail('narrow progress bar leaks onto desktop: ' + base.narrowBar.display);
  }

  // 1. Reset must ask first; 取消 must be a no-op.
  if (!(await click('[data-reset-request]'))) fail('reset entry is missing');
  await sleep(300);
  let current = await state();
  if (!current.confirmOpen) fail('reset did not ask for confirmation');
  if (current.lineCount !== 1) fail('reset applied before confirming');

  await click('[data-reset-confirm] button:not([data-reset-confirm-button])');
  await sleep(300);
  current = await state();
  if (current.confirmOpen) fail('取消 did not close the confirm row');
  if (current.lineCount !== 1) fail('取消 cleared progress anyway');
  console.log('RESET_CANCELLED', JSON.stringify({ lineCount: current.lineCount }));

  // 2. Confirm → wiped, snapshot kept, undo restores.
  await click('[data-reset-request]');
  await sleep(250);
  await click('[data-reset-confirm-button]');
  await sleep(500);
  current = await state();
  console.log('AFTER_CONFIRMED_RESET', JSON.stringify({
    lineCount: current.lineCount, artists: current.artists,
    backup: current.backupText, hasUndo: current.hasUndo, backupInStorage: current.backupInStorage,
  }));
  if (current.lineCount !== 0) fail('confirmed reset did not clear progress');
  if (!current.hasUndo) fail('no undo entry after reset');
  if (!/重置前的进度/.test(current.backupText ?? '')) fail('backup label does not say 重置: ' + current.backupText);
  if (!current.backupInStorage) fail('backup was not persisted');

  await click('[data-transfer-undo]');
  await sleep(500);
  current = await state();
  console.log('AFTER_UNDO_RESET', JSON.stringify({ lineCount: current.lineCount, artists: current.artists, backup: current.backupText }));
  if (current.lineCount !== 1) fail('undo did not restore the reset progress');
  if (current.artists !== 2) fail('undo lost the artist selection');
  if (current.backupText) fail('backup should be consumed by undo');

  // A reload in between must not lose the snapshot either.
  await click('[data-reset-request]');
  await sleep(200);
  await click('[data-reset-confirm-button]');
  await sleep(400);
  await send('Page.reload');
  await sleep(3600);
  await waitFor(`(${SCOPE}).querySelector('[data-transfer-panel]') ? 'ok' : ''`, 'panel after reload');
  current = await state();
  if (!current.hasUndo) fail('backup did not survive a reload');
  await click('[data-transfer-undo]');
  await sleep(500);
  current = await state();
  if (current.lineCount !== 1) fail('undo after reload did not restore progress');
  console.log('UNDO_AFTER_RELOAD', JSON.stringify({ lineCount: current.lineCount }));

  // 3. Overwrite import snapshots the previous save too.
  const incoming = {
    format: 'stardom3-tracker-save',
    version: 1,
    exportedAt: new Date().toISOString(),
    summary: { artists: 1, lines: 1, steps: 1 },
    data: {
      version: 1,
      selectedArtists: ['characters/lu-feng'],
      lines: { 'characters/lu-feng::0::签约方法': { status: 'active', done: [1], skipped: [] } },
      order: [],
      pinned: [],
    },
  };
  await click('[data-transfer-paste]');
  await sleep(250);
  await evaluate(`(() => {
    const area = (${SCOPE}).querySelector('[data-transfer-paste-input]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, ${JSON.stringify(JSON.stringify(incoming))});
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await sleep(200);
  await click('[data-transfer-read]');
  await sleep(350);
  await click('[data-transfer-replace]');
  await sleep(300);
  await click('[data-transfer-replace]');
  await sleep(500);
  current = await state();
  console.log('AFTER_OVERWRITE', JSON.stringify({ lineCount: current.lineCount, artists: current.artists, backup: current.backupText }));
  if (current.artists !== 1) fail('overwrite did not apply the incoming save');
  if (!/覆盖前的进度/.test(current.backupText ?? '')) fail('overwrite did not snapshot the previous save');

  await click('[data-transfer-undo]');
  await sleep(500);
  current = await state();
  console.log('AFTER_UNDO_OVERWRITE', JSON.stringify({ lineCount: current.lineCount, artists: current.artists }));
  if (current.lineCount !== 1 || current.artists !== 2) fail('undo did not restore the pre-overwrite save');

  // 4. A line whose only record is a skipped step must be 进行中.
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify({
    version: 1,
    selectedArtists: [],
    lines: { 'game-guide/initial-events::0::初始剧情': { status: 'active', done: [], skipped: [1] } },
    order: [],
    pinned: [],
  }))}); localStorage.removeItem('guide.progress.backup.v1'); 1`);
  await send('Page.reload');
  await sleep(3600);
  await waitFor(`(${SCOPE}).querySelector('[data-filter-key="notStarted"]') ? 'ok' : ''`, 'chips');
  const chips = (await state()).chips;
  console.log('CHIPS_WITH_SKIPPED_ONLY', JSON.stringify(chips));
  const inProgress = chips.find((c) => c.startsWith('进行中'));
  const notStarted = chips.find((c) => c.startsWith('未开始'));
  if (!inProgress?.endsWith('1')) fail('skipped-only line is not counted as 进行中: ' + chips.join(' | '));
  if (notStarted?.endsWith('1')) fail('skipped-only line still counted as 未开始: ' + chips.join(' | '));

  // 5. Narrow viewport: the bar appears with real numbers.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(700);
  current = await state();
  console.log('NARROW_BAR', JSON.stringify(current.narrowBar));
  if (!current.narrowBar) fail('narrow progress bar is missing on a phone viewport');
  if (current.narrowBar.display === 'none') fail('narrow progress bar is hidden on a phone viewport');
  if (!/总进度 (?:<\d+|\d+)% · \d+\/\d+ 步/.test(current.narrowBar.text)) {
    fail('unexpected narrow progress text: ' + current.narrowBar.text);
  }

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
