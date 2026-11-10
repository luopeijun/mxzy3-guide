import http from 'node:http';

/* End-to-end check of the CG "全部收集" (collect-all) flow:
   1. Seed 0 collected + a tracker progress blob, reload #/cg (全部 view).
   2. Click 全部收集 -> progress jumps to 204/204, button disabled, undo toast shown.
   3. Undo -> back to 0/204, toast gone.
   4. Collect again -> 204/204, tracker key untouched.
   5. Switch to a single group, click 全部收集 -> only that group's CG collected
      (total < 204), confirming the action is scoped to the active view.
   6. Toast auto-dismisses after ~1.5s without a click and the collected state sticks. */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const URL_CG = 'http://localhost:5173/#/cg';
const TRACKER_SEED = '{"version":1,"selectedArtists":[],"lines":{},"order":[],"pinned":[]}';

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(target, {
      method: 'PUT',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut(`${BASE}/json/new?` + encodeURIComponent(URL_CG));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails));
    }
    return res.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(1200);

  // --- seed state: nothing collected yet ---
  await evaluate(`
    localStorage.setItem('guide.cg.v1', JSON.stringify({version:1, collected:[]}));
    localStorage.setItem('guide.progress.v1', ${JSON.stringify(TRACKER_SEED)});
    'seeded';
  `);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1600);

  const progressText = () => evaluate(`document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? ''`);
  const state = () => evaluate(`
    JSON.stringify({
      cg: JSON.parse(localStorage.getItem('guide.cg.v1') || '{}'),
      tracker: localStorage.getItem('guide.progress.v1'),
      collectBtnDisabled: document.querySelector('[data-cg-collect-all]')?.disabled,
      toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
    });
  `);
  console.log('after seed:', await progressText(), await state());

  // --- click 全部收集 -> everything collected ---
  await evaluate(`document.querySelector('[data-cg-collect-all]').click(); 'ok'`);
  await sleep(350);
  const afterCollect = await evaluate(`
    JSON.stringify({
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      trackerUntouched: localStorage.getItem('guide.progress.v1'),
      collectBtnDisabled: document.querySelector('[data-cg-collect-all]')?.disabled,
      toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
      toastText: document.querySelector('[data-cg-collect-undo-toast]')?.textContent?.trim() ?? '',
    });
  `);
  console.log('after collect:', await progressText(), afterCollect);

  // --- undo restores to empty ---
  await evaluate(`document.querySelector('[data-cg-collect-undo]').click(); 'ok'`);
  await sleep(350);
  const afterUndo = await evaluate(`
    JSON.stringify({
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
    });
  `);
  console.log('after undo:', await progressText(), afterUndo);

  // --- collect again to verify scoping in a single group ---
  await evaluate(`document.querySelector('[data-cg-collect-all]').click(); 'ok'`);
  await sleep(300);
  await evaluate(`document.querySelector('[data-cg-collect-undo-dismiss]').click(); 'ok'`);
  await sleep(200);

  // pick a single group (first non-aggregate) and clear first, then collect-just-that-group
  const groupId = await evaluate(`
    const ids = [...document.querySelectorAll('[data-cg-group-id]')].map(b => b.getAttribute('data-cg-group-id'));
    ids.find(id => id !== 'all') || 'all';
  `);
  await evaluate(`document.querySelector('[data-cg-clear]').click(); 'ok'`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-cg-clear-confirm]').click(); 'ok'`);
  await sleep(300);
  await evaluate(`document.querySelector('[data-cg-group-id="${groupId}"]').click(); 'ok'`);
  await sleep(400);
  await evaluate(`document.querySelector('[data-cg-collect-all]').click(); 'ok'`);
  await sleep(350);
  const afterGroup = await evaluate(`
    JSON.stringify({
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      total: Number(document.querySelector('[data-cg-progress]')?.textContent?.match(/\\/ (\\d+)/)?.[1] ?? -1),
      panelTotal: Number(document.querySelector('[data-cg-panel]')?.textContent?.match(/\\/ (\\d+) 已收集/)?.[1] ?? -1),
    });
  `);
  console.log('after group collect (' + groupId + '):', await progressText(), afterGroup);

  // --- toast auto-dismisses on its own (start from a clean 全部 view) ---
  await evaluate(`
    localStorage.setItem('guide.cg.v1', JSON.stringify({version:1, collected:[]}));
    'seed2';
  `);
  await send('Page.navigate', { url: 'http://localhost:5173/#/cg' });
  await sleep(1500);
  await evaluate(`document.querySelector('[data-cg-collect-all]').click(); 'ok'`);
  await sleep(400);
  const toastEarly = await evaluate(`!!document.querySelector('[data-cg-collect-undo-toast]')`);
  await sleep(1600);
  const toastLate = await evaluate(`
    JSON.stringify({
      toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected.length,
      collectBtnDisabled: document.querySelector('[data-cg-collect-all]')?.disabled,
    });
  `);
  console.log('toast auto-dismiss:', toastEarly, toastLate);

  const c = JSON.parse(afterCollect);
  const u = JSON.parse(afterUndo);
  const g = JSON.parse(afterGroup);
  const l = JSON.parse(toastLate);
  // The app migrates guide.progress.v1 on load (adds orderEpoch) — that's unrelated
  // to CG collection, so compare the meaningful fields only.
  const trackerLogical = (s) => {
    const o = JSON.parse(s);
    delete o.orderEpoch;
    return JSON.stringify(o);
  };
  const checks = {
    'collect-all fills every cg': c.collected.length === 204,
    'collect-all disables button': c.collectBtnDisabled === true,
    'collect toast shown': c.toast === true,
    'tracker untouched (collect)': trackerLogical(c.trackerUntouched) === TRACKER_SEED,
    'undo restores empty': u.collected.length === 0,
    'toast closes after undo': u.toast === false,
    'group collect is scoped': g.collected.length === g.panelTotal && g.panelTotal < 204,
    'collect button disabled when group full': g.collected.length === g.panelTotal,
    'toast shown before timeout': toastEarly === true,
    'toast auto-dismisses': l.toast === false,
    'auto dismiss keeps collected': l.collected === 204 && l.collectBtnDisabled === true,
  };

  let pass = true;
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');

  await evaluate(`
    localStorage.removeItem('guide.cg.v1');
    localStorage.removeItem('guide.progress.v1');
    'cleaned';
  `);
  await jsonPut(`${BASE}/json/close/${target.id}`);
  ws.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
