import http from 'node:http';
import fs from 'node:fs';

/* Verify the standalone memo panel at the bottom of the left rail:
   1. it is the last card in the rail, and empty at first
   2. Enter in the box adds a memo (and the ＋ button does too)
   3. ticking one moves it into 已完成 with a strikethrough
   4. ✎ edits, Enter saves, Escape cancels without saving
   5. × deletes a single memo
   6. everything survives a reload
   7. 重置进度 must NOT clear memos (the whole point of independence)
   8. 清除已完成 needs a second click, then keeps the unfinished ones
   9. no horizontal overflow at 1440 or 390
   Usage: node cdp_tracker_memo.mjs [url] [out.png] */
const [, , argUrl, out] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const SCOPE = `(document.querySelector('[data-tracker-app]') || document)`;

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

const STATE = `(() => {
  const root = ${SCOPE};
  const panel = root.querySelector('[data-memo]');
  if (!panel) return JSON.stringify({ found: false });
  const rail = panel.parentElement;
  const items = [...panel.querySelectorAll('[data-memo-item]')].map((row) => ({
    text: row.querySelector('[data-memo-text]')?.textContent ?? '',
    done: row.getAttribute('data-memo-done'),
    inDoneGroup: !!row.closest('[data-memo-done-group]'),
    strike: (getComputedStyle(row.querySelector('[data-memo-text]') || row).textDecorationLine || '').includes('line-through'),
  }));
  const box = panel.querySelector('[data-memo-input]');
  // The memo belongs directly under the 分类批量操作 panel, in normal flow —
  // not pushed to the bottom of the rail when that panel collapses.
  const batch = root.querySelector('[data-batch-panel]');
  const afterBatch = !!batch && panel.previousElementSibling === batch;
  const gapFromBatch = batch
    ? Math.round(panel.getBoundingClientRect().top - batch.getBoundingClientRect().bottom)
    : null;
  return JSON.stringify({
    found: true,
    lastInRail: rail.lastElementChild === panel,
    afterBatch,
    gapFromBatch,
    top: Math.round(panel.getBoundingClientRect().top),
    hint: panel.querySelector('[data-memo-hint]')?.textContent?.trim() ?? '',
    empty: !!panel.querySelector('[data-memo-empty]'),
    addDisabled: panel.querySelector('[data-memo-add]')?.disabled ?? null,
    draft: box ? box.value : null,
    doneGroup: !!panel.querySelector('[data-memo-done-group]'),
    clearLabel: panel.querySelector('[data-memo-clear]')?.textContent?.trim() ?? null,
    items,
    overflow: panel.scrollWidth - panel.clientWidth,
  });
})()`;

async function main() {
  await jsonGet('http://127.0.0.1:9339/json/version');
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

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return result?.value;
  };
  const state = async () => JSON.parse(await evaluate(STATE));
  const fail = (message) => { throw new Error(message); };
  const visible = async () => {
    for (let i = 0; i < 40; i += 1) {
      const current = await state();
      if (current.found) return current;
      await sleep(250);
    }
    return state();
  };

  const typeInto = async (selector, text) => {
    await evaluate(`(() => {
      const el = (${SCOPE}).querySelector('${selector}');
      if (!el) return 0;
      el.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(el, ${JSON.stringify(text)});
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 1;
    })()`);
    await sleep(120);
  };

  const pressEnter = async () => {
    // Enter only triggers the form's default action when the event carries
    // text; a bare keyDown is swallowed by the input.
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Enter',
      code: 'Enter',
      text: '\r',
      unmodifiedText: '\r',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13,
    });
    await sleep(260);
  };

  const pressEscape = async () => {
    for (const type of ['keyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
        nativeVirtualKeyCode: 27,
      });
    }
    await sleep(260);
  };

  const click = async (selector, index = 0) => {
    const ok = await evaluate(`(() => {
      const nodes = [...(${SCOPE}).querySelectorAll('${selector}')];
      const el = nodes[${index}];
      if (!el || el.disabled) return false;
      el.click();
      return true;
    })()`);
    await sleep(300);
    return ok;
  };

  const load = async () => {
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url });
    await sleep(3200);
    await evaluate(`localStorage.removeItem('guide.memo.v1'); localStorage.removeItem('guide.progress.v1'); 1`);
    await send('Page.reload');
    await sleep(3400);
  };

  await load();

  // 1. Placement + empty state.
  const start = await visible();
  console.log(
    'START',
    JSON.stringify({
      afterBatch: start.afterBatch,
      gapFromBatch: start.gapFromBatch,
      empty: start.empty,
      hint: start.hint,
      addDisabled: start.addDisabled,
    }),
  );
  if (!start.found) fail('memo panel is missing');
  if (!start.afterBatch) fail('memo panel should sit directly under the 分类批量操作 panel');
  if (start.gapFromBatch === null || Math.abs(start.gapFromBatch - 16) > 2) {
    fail('memo should keep the normal 16px gap under the batch panel, got ' + start.gapFromBatch);
  }
  if (!start.empty) fail('a fresh panel should show the empty hint');
  if (start.addDisabled !== true) fail('the ＋ button should be disabled while the box is empty');

  // 1b. The panel starts collapsed; opening it must push the memo down and
  // closing it must pull it back — it is part of the column flow, not pinned
  // to the bottom of the rail.
  await click('[data-batch-toggle]');
  const expanded = await visible();
  console.log('AFTER_BATCH_EXPAND', JSON.stringify({ gapFromBatch: expanded.gapFromBatch, top: expanded.top }));
  if (Math.abs(expanded.gapFromBatch - 16) > 2) {
    fail('memo drifted away from the batch panel when it expanded, gap = ' + expanded.gapFromBatch);
  }
  if (!(expanded.top > start.top)) fail('memo did not move down with the expanded batch panel');
  await click('[data-batch-toggle]');
  const collapsed = await visible();
  console.log('AFTER_BATCH_COLLAPSE', JSON.stringify({ gapFromBatch: collapsed.gapFromBatch, top: collapsed.top }));
  if (Math.abs(collapsed.top - start.top) > 2) {
    fail('memo did not follow the batch panel back up, top = ' + collapsed.top + ' vs ' + start.top);
  }

  // 2. Enter adds; the ＋ button adds too.
  await typeInto('[data-memo-input]', '偶遇 SD 目前 3 次');
  await pressEnter();
  let now = await visible();
  if (now.items.length !== 1) fail('Enter did not add a memo');
  if (now.draft !== '') fail('the input was not cleared after adding');
  if (now.hint !== '未完成 1/1') fail('hint should read 未完成 1/1, got ' + now.hint);
  console.log('AFTER_ENTER', JSON.stringify(now.items));

  await typeInto('[data-memo-input]', '第二年金曲奖报名');
  await click('[data-memo-add]');
  await typeInto('[data-memo-input]', '记得存档再打结局');
  await click('[data-memo-add]');
  now = await visible();
  console.log('AFTER_THREE', JSON.stringify({ count: now.items.length, hint: now.hint, texts: now.items.map((i) => i.text) }));
  if (now.items.length !== 3) fail('expected three memos, got ' + now.items.length);
  if (now.hint !== '未完成 3/3') fail('hint should read 未完成 3/3, got ' + now.hint);

  const stored = JSON.parse(await evaluate(`localStorage.getItem('guide.memo.v1') || 'null'`));
  if (!Array.isArray(stored) || stored.length !== 3) fail('memos were not written to localStorage');
  if (stored.some((item) => item.done !== false)) fail('new memos should start unfinished');

  // 3. Ticking moves it into 已完成 with a strikethrough.
  await click('[data-memo-check]', 0);
  now = await visible();
  console.log('AFTER_TICK', JSON.stringify({ items: now.items, hint: now.hint, doneGroup: now.doneGroup, clearLabel: now.clearLabel }));
  if (!now.doneGroup) fail('the 已完成 block did not appear');
  const ticked = now.items.find((item) => item.done === 'yes');
  if (!ticked) fail('the memo was not marked done');
  if (!ticked.inDoneGroup) fail('a finished memo should sit inside the 已完成 block');
  if (!ticked.strike) fail('a finished memo should be struck through');
  if (now.hint !== '未完成 2/3') fail('hint should read 未完成 2/3, got ' + now.hint);

  // 4. Edit with ✎ → Enter saves.
  await click('[data-memo-edit]', 0);
  const editing = await evaluate(`(() => {
    const input = (${SCOPE}).querySelector('[data-memo-edit-input]');
    return input ? input.value : null;
  })()`);
  console.log('EDIT_INPUT', JSON.stringify(editing));
  if (!editing) fail('the ✎ button did not open an editor');
  await typeInto('[data-memo-edit-input]', '第二年金曲奖报名（3 月前）');
  await pressEnter();
  now = await visible();
  if (!now.items.some((item) => item.text === '第二年金曲奖报名（3 月前）')) {
    fail('Enter did not save the edit');
  }

  // Escape cancels.
  await click('[data-memo-edit]', 1);
  await typeInto('[data-memo-edit-input]', '这段文字不该被保存');
  await pressEscape();
  now = await visible();
  console.log('AFTER_ESC', JSON.stringify(now.items.map((i) => i.text)));
  if (now.items.some((item) => item.text === '这段文字不该被保存')) fail('Escape did not cancel the edit');
  if (!now.items.some((item) => item.text === '记得存档再打结局')) fail('Escape lost the original text');

  // 5. Delete one.
  await click('[data-memo-remove]', 1);
  now = await visible();
  console.log('AFTER_DELETE', JSON.stringify({ count: now.items.length, texts: now.items.map((i) => i.text) }));
  if (now.items.length !== 2) fail('delete did not remove exactly one memo');
  if (now.items.some((item) => item.text === '记得存档再打结局')) fail('the wrong memo was deleted');

  // 6. Reload keeps everything.
  await send('Page.reload');
  await sleep(3400);
  now = await visible();
  console.log('AFTER_RELOAD', JSON.stringify({ count: now.items.length, hint: now.hint }));
  if (now.items.length !== 2) fail('memos did not survive a reload');
  if (now.hint !== '未完成 1/2') fail('done state did not survive a reload, hint=' + now.hint);

  // 7. Resetting progress must leave the memos alone.
  await evaluate(`localStorage.setItem('guide.progress.v1', JSON.stringify({
    version: 1,
    selectedArtists: ['characters/lin-fenfen'],
    lines: { 'characters/lin-fenfen::0::签约方法': { status: 'active', done: [0], skipped: [] } },
    order: [],
    pinned: [],
  })); 1`);
  await send('Page.reload');
  await sleep(3400);
  const beforeReset = await visible();
  const requested = await click('[data-reset-request]');
  if (!requested) fail('the reset entry moved, cannot verify independence');
  await click('[data-reset-confirm]');
  await click('[data-reset-confirm-button]');
  await sleep(400);
  const afterReset = await visible();
  console.log('AFTER_RESET', JSON.stringify({ before: beforeReset.items.length, after: afterReset.items.length, hint: afterReset.hint }));
  if (afterReset.items.length !== beforeReset.items.length) fail('重置进度 wiped the memos');
  const progress = await evaluate(`localStorage.getItem('guide.progress.v1')`);
  const parsed = progress ? JSON.parse(progress) : null;
  if (parsed && Object.keys(parsed.lines ?? {}).length > 0) fail('reset did not actually clear progress');

  // 8. 清除已完成 needs a second click.
  const firstClick = await click('[data-memo-clear]');
  if (!firstClick) fail('the 清除已完成 button is missing');
  now = await visible();
  console.log('CLEAR_ARMED', JSON.stringify({ label: now.clearLabel, count: now.items.length }));
  if (now.clearLabel !== '确认清除？') fail('the first click should arm the clear button, got ' + now.clearLabel);
  if (now.items.length !== 2) fail('arming the clear button must not delete anything');
  await click('[data-memo-clear]');
  now = await visible();
  console.log('CLEARED', JSON.stringify({ count: now.items.length, doneGroup: now.doneGroup, hint: now.hint }));
  if (now.items.length !== 1) fail('clearing should remove only the finished memos');
  if (now.doneGroup) fail('the 已完成 block should disappear once it is empty');
  if (now.hint !== '未完成 1/1') fail('hint after clearing should read 未完成 1/1, got ' + now.hint);

  if (out) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', out);
  }

  // 9. Narrow viewport: no horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(900);
  const phone = await visible();
  console.log('PHONE', JSON.stringify({ overflow: phone.overflow, count: phone.items.length }));
  if (phone.overflow > 0) fail('memo panel overflows horizontally at 390px by ' + phone.overflow);

  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(600);
  const desktop = await visible();
  if (desktop.overflow > 0) fail('memo panel overflows horizontally at 1440px by ' + desktop.overflow);

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
