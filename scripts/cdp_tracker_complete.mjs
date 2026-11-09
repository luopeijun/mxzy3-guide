import http from 'node:http';

/* Verify the master checkbox + 已完成 archive:
   1. every working card has an unchecked master box
   2. ticking it marks every step done and moves the line into the bottom archive
   3. the archive is collapsed by default, expandable, shows 已完成 + disabled drag
   4. unticking one step brings the line back to the working pool (mixed state)
   5. completing every step manually also archives the line
   6. reload persistence, search auto-expands the archive, clearing search
      restores the collapsed default
   Usage: node cdp_tracker_complete.mjs [url] */
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
  const archive = root.querySelector('[data-completed-pool]');
  const activeCards = [...(active?.querySelectorAll('[data-line-card]') ?? [])];
  const doneCards = [...(archive?.querySelectorAll('[data-line-card]') ?? [])];
  const name = c => c.querySelector('[data-line-name]')?.textContent?.trim() ?? '?';
  const box = c => c.querySelector('[data-master-checkbox]');
  const steps = c => [...c.querySelectorAll('button[aria-pressed]')];
  const overview = [...root.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.includes('进度概览'));
  const categories = [...root.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.includes('分类进度'));
  return JSON.stringify({
    overview: overview?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    categories: categories?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    activeCount: activeCards.length,
    archiveCount: doneCards.length,
    archiveHeader: archive?.querySelector('[data-completed-toggle]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    archiveExpanded: archive?.querySelector('[data-completed-toggle]')?.getAttribute('aria-expanded') ?? null,
    activeChecks: activeCards.slice(0, 4).map(c => box(c)?.getAttribute('aria-checked')),
    activeMixed: activeCards.filter(c => box(c)?.getAttribute('aria-checked') === 'mixed').length,
    archiveChecks: doneCards.map(c => box(c)?.getAttribute('aria-checked')),
    archiveName: doneCards.length ? name(doneCards[0]) : null,
    archiveSteps: doneCards.length ? steps(doneCards[0]).length : 0,
    archiveStepsDone: doneCards.length ? steps(doneCards[0]).filter(b => b.getAttribute('aria-pressed') === 'true').length : 0,
    archiveBadges: doneCards.filter(c => c.textContent.includes('已完成')).length,
    archiveDragDisabled: doneCards.length ? [...doneCards[0].querySelectorAll('[aria-label="拖拽排序"]')].every(h => !h.draggable) : null,
    masterCount: root.querySelectorAll('[data-master-checkbox]').length,
    poolHeader: root.querySelector('main h2')?.parentElement?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    storedLines: Object.keys(JSON.parse(localStorage.getItem('guide.progress.v1') || '{}').lines || {}).length,
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

  const waitFor = async (expression, label, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const value = await evaluate(expression);
      if (value) return value;
      await sleep(350);
    }
    throw new Error('timeout waiting for ' + label);
  };

  // Start from a clean slate (the shared Chrome profile may hold older runs).
  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3500);
  await waitFor(
    `(${SCOPE}).querySelectorAll('[data-active-pool] [data-line-card]').length > 0 ? 'ok' : ''`,
    'initial event pool',
  );

  const initial = JSON.parse(await evaluate(SNAPSHOT));
  console.log('INITIAL', JSON.stringify(initial));
  if (initial.masterCount !== initial.activeCount || initial.activeChecks.some((v) => v !== 'false')) {
    throw new Error('master checkbox missing or not initially unchecked');
  }

  // 1) master checkbox ticks every step and archives the line.
  const firstName = await evaluate(`(() => {
    const card = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    const name = card.querySelector('[data-line-name]').textContent.trim();
    card.querySelector('[data-master-checkbox]').click();
    return name;
  })()`);
  await sleep(450);
  const afterTick = JSON.parse(await evaluate(SNAPSHOT));
  console.log('TICKED_LINE:', firstName);
  console.log('AFTER_MASTER_TICK', JSON.stringify(afterTick));
  if (
    afterTick.activeCount !== initial.activeCount - 1 ||
    afterTick.archiveCount !== 0 ||
    !afterTick.archiveHeader?.includes('1 条')
  ) {
    throw new Error('line did not leave the working pool for a collapsed archive');
  }
  const rail = afterTick.overview?.match(/已完成 (\d+) \/ (\d+) 个步骤/);
  if (!rail || Number(rail[1]) < 5) {
    throw new Error('progress rail under-counts done steps: ' + afterTick.overview);
  }
  console.log('PROGRESS_RAIL:', afterTick.overview, '|', afterTick.categories);

  // 2) open the archive + expand its card, then inspect the archived line.
  await evaluate(`(${SCOPE}).querySelector('[data-completed-toggle]').click(); 1`);
  await sleep(350);
  await evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-completed-pool] [data-line-card]');
    const b = c.querySelector('button[aria-expanded]');
    if (b.getAttribute('aria-expanded') === 'false') b.click();
    return 1;
  })()`);
  await sleep(350);
  const archiveOpen = JSON.parse(await evaluate(SNAPSHOT));
  console.log('ARCHIVE_OPEN', JSON.stringify(archiveOpen));
  if (
    archiveOpen.archiveChecks[0] !== 'true' ||
    archiveOpen.archiveSteps === 0 ||
    archiveOpen.archiveSteps !== archiveOpen.archiveStepsDone ||
    archiveOpen.archiveDragDisabled !== true ||
    archiveOpen.archiveBadges !== 1
  ) {
    throw new Error('archived card does not show all steps done');
  }

  // 3) untick one step -> the line returns to the working pool, half-ticked.
  await evaluate(`(() => {
    const c = (${SCOPE}).querySelector('[data-completed-pool] [data-line-card]');
    c.querySelector('button[aria-pressed="true"]').click();
    return 1;
  })()`);
  await sleep(450);
  const afterUntick = JSON.parse(await evaluate(SNAPSHOT));
  console.log('AFTER_UNTICK_ONE', JSON.stringify(afterUntick));
  if (afterUntick.archiveCount !== 0 || afterUntick.activeMixed !== 1) {
    throw new Error('unticking a step did not restore the line as half-done');
  }

  // 4) re-archive via master checkbox, then reload to check persistence.
  await evaluate(`(() => {
    const cards = [...(${SCOPE}).querySelectorAll('[data-active-pool] [data-line-card]')];
    const c = cards.find(x => x.querySelector('[data-master-checkbox]')?.getAttribute('aria-checked') === 'mixed');
    c.querySelector('[data-master-checkbox]').click();
    return 1;
  })()`);
  await sleep(350);
  await send('Page.reload');
  await sleep(3500);
  await waitFor(
    `(${SCOPE}).querySelector('[data-completed-pool]') ? 'ok' : ''`,
    'archive after reload',
  );
  const afterReload = JSON.parse(await evaluate(SNAPSHOT));
  console.log('AFTER_RELOAD', JSON.stringify(afterReload));
  if (
    !afterReload.archiveHeader?.includes('1 条') ||
    afterReload.archiveCount !== 0 ||
    afterReload.archiveExpanded !== 'false'
  ) {
    throw new Error('archive did not persist / is not collapsed by default');
  }

  // 5) completing a *different* line step-by-step also archives it.
  await evaluate(`(${SCOPE}).querySelector('[data-completed-toggle]').click(); 1`);
  await sleep(250);
  const manualName = await evaluate(`(() => {
    const card = (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    const name = card.querySelector('[data-line-name]').textContent.trim();
    const expand = card.querySelector('button[aria-expanded]');
    if (expand.getAttribute('aria-expanded') === 'false') expand.click();
    return name;
  })()`);
  await sleep(300);
  const manualResult = await evaluate(`(async () => {
    const get = () => (${SCOPE}).querySelector('[data-active-pool] [data-line-card]');
    const total = get().querySelectorAll('button[aria-pressed]').length;
    for (let k = 0; k < total; k++) {
      const rows = [...get().querySelectorAll('button[aria-pressed]')];
      if (!rows[k] || rows[k].getAttribute('aria-pressed') === 'true') continue;
      rows[k].click();
      await new Promise(r => setTimeout(r, 70));
    }
    return JSON.stringify({ rows: total });
  })()`);
  await sleep(500);
  const afterManual = JSON.parse(await evaluate(SNAPSHOT));
  console.log('MANUAL_LINE:', manualName, manualResult);
  console.log('AFTER_MANUAL_ALL_STEPS', JSON.stringify(afterManual));
  if (afterManual.archiveCount < 2) {
    throw new Error('completing every step manually did not archive the line');
  }

  // 6) collapse the archive, then search the archived line's name: the archive
  //    must auto-expand so hits are never hidden.
  await evaluate(`(() => {
    const t = (${SCOPE}).querySelector('[data-completed-toggle]');
    if (t.getAttribute('aria-expanded') === 'true') t.click();
    return 1;
  })()`);
  await sleep(250);
  await evaluate(SEARCH(firstName));
  await sleep(500);
  const duringSearch = JSON.parse(await evaluate(SNAPSHOT));
  console.log('DURING_SEARCH', JSON.stringify(duringSearch));
  if (duringSearch.archiveExpanded !== 'true' || duringSearch.archiveCount === 0) {
    throw new Error('search did not surface archived lines');
  }

  await evaluate(SEARCH(''));
  await sleep(450);
  const afterClear = JSON.parse(await evaluate(SNAPSHOT));
  console.log('AFTER_CLEAR_SEARCH', JSON.stringify(afterClear));
  if (afterClear.archiveExpanded !== 'false') {
    throw new Error('clearing search did not restore the collapsed archive');
  }

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
