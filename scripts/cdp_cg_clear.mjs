import http from 'node:http';

/* End-to-end check of the CG "清除已收集" flow:
   1. Seed 3 collected CG ids + a tracker progress blob, reload #/cg.
   2. Click 清除已收集 -> confirm dialog appears; cancel keeps everything.
   3. Confirm -> collected emptied, progress reads 0 / 204, tracker key untouched.
   4. Undo from the toast -> collection restored.
   5. Clear again, dismiss the toast -> button becomes disabled.
   6. Clear once more without touching anything -> toast auto-dismisses after ~1.5s
      and the cleared state sticks (auto-dismiss must never restore the data). */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const URL_CG = 'http://localhost:5173/#/cg';
// TrackerProvider 启动时会自动补 releasedArtists / orderEpoch；seed 要写成
// 迁移后的形态，否则「tracker untouched」会被这个与应用无关的字段误判。
// 脚本里的 trackerOk() 仍会剔除每次加载都会变的 orderEpoch。
const TRACKER_SEED = '{"version":1,"selectedArtists":[],"releasedArtists":[],"lines":{},"order":[],"pinned":[]}';

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

  // --- seed state ---
  await evaluate(`
    localStorage.setItem('guide.cg.v1', JSON.stringify({version:1, collected:['ji-5','ou-9','lin-1']}));
    localStorage.setItem('guide.progress.v1', ${JSON.stringify(TRACKER_SEED)});
    'seeded';
  `);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1600);

  const progressText = () => evaluate(`document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? ''`);
  const trailer = await evaluate(`
    JSON.stringify({
      cg: JSON.parse(localStorage.getItem('guide.cg.v1') || '{}'),
      tracker: localStorage.getItem('guide.progress.v1'),
      clearBtnDisabled: document.querySelector('[data-cg-clear]')?.disabled,
    });
  `);
  console.log('after seed:', await progressText(), trailer);

  // --- click 清除 -> dialog appears ---
  await evaluate(`document.querySelector('[data-cg-clear]').click(); 'ok'`);
  await sleep(250);
  const dialogOpen = await evaluate(`!!document.querySelector('[data-cg-clear-modal]')`);
  console.log('confirm dialog opened:', dialogOpen);

  // --- cancel keeps everything ---
  await evaluate(`document.querySelector('[data-cg-clear-cancel]').click(); 'ok'`);
  await sleep(250);
  const afterCancel = await evaluate(`
    JSON.stringify({
      modal: !!document.querySelector('[data-cg-clear-modal]'),
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
    });
  `);
  console.log('after cancel:', await progressText(), afterCancel);

  // --- confirm empties the collection ---
  await evaluate(`document.querySelector('[data-cg-clear]').click(); 'ok'`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-cg-clear-confirm]').click(); 'ok'`);
  await sleep(350);
  const afterClear = await evaluate(`
    JSON.stringify({
      modal: !!document.querySelector('[data-cg-clear-modal]'),
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      trackerUntouched: localStorage.getItem('guide.progress.v1'),
      toast: !!document.querySelector('[data-cg-clear-undo-toast]'),
      toastText: document.querySelector('[data-cg-clear-undo-toast]')?.textContent?.trim() ?? '',
    });
  `);
  console.log('after clear:', await progressText(), afterClear);

  // --- undo restores ---
  await evaluate(`document.querySelector('[data-cg-clear-undo]').click(); 'ok'`);
  await sleep(350);
  const afterUndo = await evaluate(`
    JSON.stringify({
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected.slice().sort(),
      toast: !!document.querySelector('[data-cg-clear-undo-toast]'),
    });
  `);
  console.log('after undo:', await progressText(), afterUndo);

  // --- clear again and dismiss the toast -> button disabled ---
  await evaluate(`document.querySelector('[data-cg-clear]').click(); 'ok'`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-cg-clear-confirm]').click(); 'ok'`);
  await sleep(300);
  await evaluate(`document.querySelector('[data-cg-clear-undo-dismiss]').click(); 'ok'`);
  await sleep(250);
  const finalState = await evaluate(`
    JSON.stringify({
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      toast: !!document.querySelector('[data-cg-clear-undo-toast]'),
      clearBtnDisabled: document.querySelector('[data-cg-clear]')?.disabled,
      trackerUntouched: localStorage.getItem('guide.progress.v1'),
      gridCount: Number(document.querySelector('[data-cg-grid]')?.getAttribute('data-cg-count') ?? -1),
    });
  `);
  console.log('final:', await progressText(), finalState);

  // --- toast auto-dismisses on its own (no click) ---
  await evaluate(`
    localStorage.setItem('guide.cg.v1', JSON.stringify({version:1, collected:['ji-5','ou-9']}));
    'seed2';
  `);
  await send('Page.reload', { ignoreCache: true });
  await sleep(1400);
  await evaluate(`document.querySelector('[data-cg-clear]').click(); 'ok'`);
  await sleep(200);
  await evaluate(`document.querySelector('[data-cg-clear-confirm]').click(); 'ok'`);
  await sleep(400);
  const toastEarly = await evaluate(`!!document.querySelector('[data-cg-clear-undo-toast]')`);
  await sleep(1600);
  const toastLate = await evaluate(`
    JSON.stringify({
      toast: !!document.querySelector('[data-cg-clear-undo-toast]'),
      collected: JSON.parse(localStorage.getItem('guide.cg.v1')).collected,
      clearBtnDisabled: document.querySelector('[data-cg-clear]')?.disabled,
    });
  `);
  console.log('toast auto-dismiss:', toastEarly, toastLate);

  // The app migrates guide.progress.v1 on load (adds orderEpoch); compare the
  // meaningful fields only, not the exact serialized blob.
  const trackerOk = (s) => {
    const obj = JSON.parse(s).trackerUntouched;
    const parsed = JSON.parse(obj);
    delete parsed.orderEpoch;
    return JSON.stringify(parsed) === TRACKER_SEED;
  };
  const checks = {
    'dialog opens': dialogOpen === true,
    'cancel is inert': JSON.parse(afterCancel).modal === false
      && JSON.parse(afterCancel).collected.length === 3,
    'confirm empties cg': JSON.parse(afterClear).collected.length === 0,
    'tracker untouched (clear)': trackerOk(afterClear),
    'undo toast shown': JSON.parse(afterClear).toast === true,
    'undo restores 3': JSON.parse(afterUndo).collected.length === 3
      && JSON.parse(afterUndo).collected.join(',') === 'ji-5,lin-1,ou-9',
    'toast closes after undo': JSON.parse(afterUndo).toast === false,
    'button disabled when empty': JSON.parse(finalState).clearBtnDisabled === true,
    'toast dismissible': JSON.parse(finalState).toast === false,
    'tracker untouched (final)': trackerOk(finalState),
    'cards still render': JSON.parse(finalState).gridCount > 0,
    'progress reads 0': (await progressText()).includes('已收集 0'),
    'toast shown before timeout': toastEarly === true,
    'toast auto-dismisses': JSON.parse(toastLate).toast === false,
    'auto dismiss keeps clear': JSON.parse(toastLate).collected.length === 0
      && JSON.parse(toastLate).clearBtnDisabled === true,
  };

  let pass = true;
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');

  // reset the seeded keys so the next script starts clean
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
