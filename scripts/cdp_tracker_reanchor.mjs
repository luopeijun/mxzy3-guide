import http from 'node:http';

/* Verify that saved progress is re-anchored by event name, not by raw index.
   A rebuilt guide.json shifts block-array indices, which used to hand ticks to
   the wrong events silently. Cases:
     1. exported archive carries a per-line step snapshot (version 2)
     2. every saved index shifted by +100 → import still lands on the right steps
     3. one snapshot label no longer exists → that tick is dropped and reported
     4. a saved line with no current page → reported, other lines still applied
     5. a v1 archive (no snapshot) → accepted with an explicit warning
     6. an unchanged archive → no warning at all
   Usage: node cdp_tracker_reanchor.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const origin = new URL(url).origin;

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

const PANEL = `(() => {
  const panel = ${SCOPE}.querySelector('[data-transfer-panel]');
  const notice = panel?.querySelector('[data-transfer-notice]');
  return JSON.stringify({
    preview: panel?.querySelector('[data-transfer-preview]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    report: panel?.querySelector('[data-transfer-report]')?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    legacy: !!panel?.querySelector('[data-transfer-legacy]'),
    notice: notice?.textContent?.replace(/\\s+/g, ' ').trim() ?? null,
    tone: notice?.getAttribute('data-tone') ?? null,
  });
})()`;

const LINE = (id) => `(() => {
  const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${id}"]');
  if (!card) return JSON.stringify({ found: false });
  const rows = [...card.querySelectorAll('[data-step-row]')];
  return JSON.stringify({
    found: true,
    rows: rows.length,
    done: rows.filter(r => r.querySelector('button[aria-pressed]')?.getAttribute('aria-pressed') === 'true').length,
  });
})()`;

async function main() {
  const version = await jsonGet('http://127.0.0.1:9339/json/version');
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  let browserId = 0;
  const browserPending = new Map();
  browserWs.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && browserPending.has(msg.id)) {
      const resolve = browserPending.get(msg.id);
      browserPending.delete(msg.id);
      resolve(msg.result ?? msg.error);
    }
  };
  await new Promise((r) => (browserWs.onopen = r));
  const browserSend = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++browserId;
      browserPending.set(id, resolve);
      browserWs.send(JSON.stringify({ id, method, params }));
    });
  await browserSend('Browser.grantPermissions', {
    origin,
    permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
  });

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
  const waitFor = async (expression, label, timeout = 20000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(300);
    }
    throw new Error('timeout waiting for ' + label);
  };
  const panel = () => evaluate(PANEL).then(JSON.parse);
  const line = (lineId) => evaluate(LINE(lineId)).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };

  /** Applying a save re-renders the card a tick later; polling beats sleeping. */
  const waitDone = async (lineId, expected, timeout = 6000) => {
    const start = Date.now();
    let state = await line(lineId);
    while (Date.now() - start < timeout && state.done !== expected) {
      await sleep(200);
      state = await line(lineId);
    }
    return state;
  };
  const click = (selector) => evaluate(`(() => {
    const el = ${SCOPE}.querySelector(${JSON.stringify(selector)});
    if (!el) return false;
    el.click();
    return true;
  })()`);

  const reload = async () => {
    await send('Page.reload');
    await sleep(3500);
    await waitFor(`(${SCOPE}).querySelector('[data-active-pool] [data-line-card]') ? 1 : 0`, 'pool');
  };

  const ensureExpanded = async (lineId) => {
    for (let i = 0; i < 20; i += 1) {
      const rows = await evaluate(`(() => {
        const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
        return card ? card.querySelectorAll('[data-step-row]').length : 0;
      })()`);
      if (rows > 0) return rows;
      await evaluate(`(() => {
        const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
        card?.querySelector('button[aria-expanded="false"]')?.click();
        return 1;
      })()`);
      await sleep(400);
    }
    throw new Error('could not expand ' + lineId);
  };

  const reset = async () => {
    await evaluate(`localStorage.removeItem('guide.progress.v1'); localStorage.removeItem('guide.progress.backup.v1'); 1`);
    await reload();
  };

  const copyArchive = async () => {
    await click('[data-transfer-copy]');
    await sleep(400);
    return JSON.parse(await evaluate('navigator.clipboard.readText()'));
  };

  const pasteArchive = async (archive) => {
    const open = await evaluate(`!!(${SCOPE}).querySelector('[data-transfer-paste-input]')`);
    if (!open) {
      await click('[data-transfer-paste]');
      await sleep(300);
    }
    await evaluate(`(() => {
      const area = (${SCOPE}).querySelector('[data-transfer-paste-input]');
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(area, ${JSON.stringify(JSON.stringify(archive))});
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    await sleep(200);
    await click('[data-transfer-read]');
    await sleep(500);
  };

  await reset();
  const lineId = await evaluate(`(${SCOPE}).querySelector('[data-active-pool] [data-line-card]').getAttribute('data-line-id')`);
  const rowCount = await ensureExpanded(lineId);
  if (rowCount < 3) fail('first card needs at least 3 steps');

  const tick = async (row) => {
    await evaluate(`(() => {
      const card = (${SCOPE}).querySelector('[data-line-card][data-line-id="${lineId}"]');
      card.querySelectorAll('[data-step-row]')[${row}].querySelector('button[aria-pressed]').click();
      return 1;
    })()`);
    await sleep(250);
  };
  await tick(0);
  await tick(1);

  // 1. Snapshot lands in the archive.
  const base = await copyArchive();
  console.log('ARCHIVE', JSON.stringify({
    version: base.version,
    done: base.data.lines[lineId].done,
    refs: base.steps?.[lineId],
  }));
  if (base.version !== 2) fail('archive version should be 2, got ' + base.version);
  if (!base.steps?.[lineId]?.length) fail('archive has no step snapshot');
  // Only processed steps are snapshotted — that keeps archives small.
  if (base.steps[lineId].length !== base.data.lines[lineId].done.length) {
    fail('snapshot should cover exactly the ticked steps, got ' + base.steps[lineId].length);
  }
  if (!base.steps[lineId].every((ref) => typeof ref.hint === 'string' && ref.hint.length > 0)) {
    fail('snapshot is missing event-body hints');
  }
  const expected = [...base.data.lines[lineId].done].sort((a, b) => a - b);

  // 2. Every index shifted by +100 — as if blocks had been inserted above.
  const shifted = structuredClone(base);
  shifted.data.lines[lineId].done = shifted.data.lines[lineId].done.map((i) => i + 100);
  shifted.steps[lineId] = shifted.steps[lineId].map((ref) => ({ ...ref, index: ref.index + 100 }));
  await reset();
  await pasteArchive(shifted);
  const shiftedPreview = await panel();
  console.log('SHIFTED_PREVIEW', JSON.stringify(shiftedPreview));
  if (!shiftedPreview.preview) fail('shifted archive produced no preview');
  if (!/重新对齐/.test(shiftedPreview.report ?? '')) fail('shifted archive was not re-anchored');
  await click('[data-transfer-merge]');
  await sleep(500);
  await ensureExpanded(lineId);
  const shiftedResult = await waitDone(lineId, 2);
  console.log('SHIFTED_RESULT', JSON.stringify(shiftedResult));
  if (shiftedResult.done !== 2) fail('re-anchored merge lost ticks, got ' + shiftedResult.done);
  const afterShift = await copyArchive();
  if (JSON.stringify([...afterShift.data.lines[lineId].done].sort((a, b) => a - b)) !== JSON.stringify(expected)) {
    fail('re-anchored indices do not match the originals: ' + JSON.stringify(afterShift.data.lines[lineId].done));
  }

  // 3. One snapshot no longer matches anything → that tick is dropped.
  const broken = structuredClone(base);
  broken.steps[lineId][0].label = '999';
  broken.steps[lineId][0].hint = '这段正文在当前攻略里不存在';
  await reset();
  await pasteArchive(broken);
  const brokenPreview = await panel();
  console.log('BROKEN_PREVIEW', JSON.stringify(brokenPreview));
  if (!/1 个步骤/.test(brokenPreview.report ?? '')) fail('dropped step was not reported: ' + brokenPreview.report);
  await click('[data-transfer-merge]');
  await sleep(500);
  await ensureExpanded(lineId);
  const brokenResult = await waitDone(lineId, 1);
  console.log('BROKEN_RESULT', JSON.stringify(brokenResult));
  if (brokenResult.done !== 1) fail('dropped step should leave 1 tick, got ' + brokenResult.done);

  // 4. A saved line with no current page is reported, the rest still applies.
  const ghost = structuredClone(base);
  ghost.data.lines['game-guide/ghost::0::幽灵线'] = { status: 'active', done: [1], skipped: [] };
  ghost.steps['game-guide/ghost::0::幽灵线'] = [{ index: 1, label: '幽灵事件' }];
  await reset();
  await pasteArchive(ghost);
  const ghostPreview = await panel();
  console.log('GHOST_PREVIEW', JSON.stringify(ghostPreview));
  if (!/没有对应页面/.test(ghostPreview.report ?? '')) fail('missing line was not reported: ' + ghostPreview.report);
  await click('[data-transfer-merge]');
  await sleep(500);
  await ensureExpanded(lineId);
  if ((await waitDone(lineId, 2)).done !== 2) fail('missing line blocked the rest of the import');

  // 5. v1 archive: accepted, but flagged as unverifiable.
  const legacy = structuredClone(base);
  delete legacy.steps;
  legacy.version = 1;
  await reset();
  await pasteArchive(legacy);
  const legacyPreview = await panel();
  console.log('LEGACY_PREVIEW', JSON.stringify(legacyPreview));
  if (!legacyPreview.legacy) fail('v1 archive did not show the legacy warning');
  if (!/旧版本/.test(legacyPreview.preview ?? '')) fail('legacy warning text is missing');
  await click('[data-transfer-merge]');
  await sleep(500);
  await ensureExpanded(lineId);
  if ((await waitDone(lineId, 2)).done !== 2) fail('v1 archive was not applied at face value');

  // 6. An unchanged archive is applied without any warning.
  await reset();
  await pasteArchive(base);
  const clean = await panel();
  console.log('CLEAN_PREVIEW', JSON.stringify(clean));
  if (clean.report || clean.legacy) fail('unchanged archive should not warn');
  await click('[data-transfer-merge]');
  await sleep(500);
  await ensureExpanded(lineId);
  if ((await waitDone(lineId, 2)).done !== 2) fail('unchanged archive did not apply');

  console.log('ALL_CHECKS_PASSED');
  ws.close();
  browserWs.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
