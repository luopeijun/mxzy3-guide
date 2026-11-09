import http from 'node:http';

/* Verify the narrow-viewport reorder buttons (iOS Safari has no HTML5 drag):
   1. desktop keeps the ⠿ handle and hides the ↑↓ group
   2. phone shows ↑↓ instead of the handle
   3. the first line cannot move up, the last cannot move down
   4. ↑ on the second line swaps it with the first
   5. the new order is persisted (localStorage + survives a reload)
   6. a search disables the buttons (partial list cannot define an order)
   Usage: node cdp_tracker_move.mjs [url] */
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

const IDS = `(() => {
  const pool = ${SCOPE}.querySelector('[data-active-pool]');
  return JSON.stringify(pool ? [...pool.querySelectorAll('[data-line-card][data-line-id]')].map(c => c.getAttribute('data-line-id')) : []);
})()`;

const GEOMETRY = `(() => {
  const root = ${SCOPE};
  const group = root.querySelector('[data-move-group]');
  const handle = root.querySelector('[data-line-card] span[draggable]');
  return JSON.stringify({
    groupDisplay: group ? getComputedStyle(group).display : null,
    handleDisplay: handle ? getComputedStyle(handle).display : null,
  });
})()`;

async function main() {
  const version = await jsonGet('http://127.0.0.1:9339/json/version');
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
  const ids = () => evaluate(IDS).then(JSON.parse);
  const geometry = () => evaluate(GEOMETRY).then(JSON.parse);
  const fail = (message) => { throw new Error(message); };

  const load = async (width, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: mobile ? 844 : 900,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    await send('Page.navigate', { url });
    await sleep(3200);
    await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
    await send('Page.reload');
    await sleep(3500);
  };

  const openAt = async (width, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: mobile ? 844 : 900,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    await sleep(600);
  };

  // 1. Desktop layout: handle visible, buttons gone.
  await load(1440, false);
  const desktop = await geometry();
  console.log('DESKTOP', JSON.stringify(desktop));
  if (desktop.groupDisplay !== null && desktop.groupDisplay !== 'none') {
    fail('desktop should hide the ↑↓ group, got ' + desktop.groupDisplay);
  }
  if (desktop.handleDisplay === 'none') fail('desktop lost the drag handle');

  // 2. Phone layout: the opposite.
  await openAt(390, true);
  const phone = await geometry();
  console.log('PHONE', JSON.stringify(phone));
  if (phone.groupDisplay !== 'flex') fail('phone should show the ↑↓ group, got ' + phone.groupDisplay);
  if (phone.handleDisplay !== 'none') fail('phone should hide the drag handle, got ' + phone.handleDisplay);

  const before = await ids();
  if (before.length < 3) fail('needs at least three visible lines');

  // 3. Boundaries.
  const bounds = JSON.parse(await evaluate(`(() => {
    const cards = [...(${SCOPE}).querySelectorAll('[data-active-pool] [data-line-card]')];
    const read = (card) => [...card.querySelectorAll('[data-move]')].map(b => ({ dir: b.getAttribute('data-move'), disabled: b.disabled }));
    return JSON.stringify({ first: read(cards[0]), last: read(cards[cards.length - 1]) });
  })()`));
  console.log('BOUNDS', JSON.stringify(bounds));
  if (!bounds.first.find((b) => b.dir === 'up')?.disabled) fail('the first line must not move up');
  if (!bounds.last.find((b) => b.dir === 'down')?.disabled) fail('the last line must not move down');

  // 4. Move the second line up.
  const clicked = await evaluate(`(() => {
    const cards = [...(${SCOPE}).querySelectorAll('[data-active-pool] [data-line-card]')];
    const button = cards[1].querySelector('[data-move="up"]');
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) fail('second line cannot move up');
  await sleep(600);
  const after = await ids();
  console.log('MOVED', JSON.stringify({ before: before.slice(0, 3), after: after.slice(0, 3) }));
  if (after[0] !== before[1] || after[1] !== before[0]) {
    fail('move up did not swap the first two lines');
  }

  // 5. Persisted.
  const stored = JSON.parse(
    await evaluate(`localStorage.getItem('guide.progress.v1') || 'null'`),
  );
  console.log('STORED_ORDER', JSON.stringify(stored?.order?.slice(0, 3) ?? null));
  if (!stored?.order?.length) fail('order was not persisted');
  if (stored.order[0] !== before[1]) fail('persisted order does not start with the moved line');

  await send('Page.reload');
  await sleep(3500);
  const reloaded = await ids();
  console.log('AFTER_RELOAD', JSON.stringify({ first: reloaded[0], second: reloaded[1] }));
  if (reloaded[0] !== before[1]) fail('order did not survive a reload');

  // 6. Searching disables the buttons.
  await evaluate(`(() => {
    const input = (${SCOPE}).querySelector('input[aria-label="搜索事件池"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '事件');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await sleep(700);
  const searching = JSON.parse(await evaluate(`(() => {
    const buttons = [...(${SCOPE}).querySelectorAll('[data-active-pool] [data-move]')];
    return JSON.stringify({ total: buttons.length, disabled: buttons.filter(b => b.disabled).length });
  })()`));
  console.log('SEARCHING', JSON.stringify(searching));
  if (searching.total === 0) fail('search left no cards to inspect');
  if (searching.disabled !== searching.total) fail('search should disable every reorder button');

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
