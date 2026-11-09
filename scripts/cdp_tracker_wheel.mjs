import http from 'node:http';
import fs from 'node:fs';

/* The three columns are independent scrollports on desktop. A wheel over a
   SHORT side rail (or the shared header) is forwarded to the event pool, but a
   rail with its own scrollbar owns the wheel exclusively — two columns must
   never move together. Verifies pointer position, nested scrollers, rail
   boundaries, the sticky bar and the narrow stacked layout.
   Usage: node cdp_tracker_wheel.mjs [url] [out.png] [rail-shot-prefix] */
const [, , argUrl, argOut, argRailOut] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;

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

const POINTS = `(() => {
  const root = ${ROOT};
  const asides = [...root.querySelectorAll('aside')];
  const main = root.querySelector('main');
  const at = (el, dy) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + dy) };
  };
  return JSON.stringify({
    left: at(asides[0], 60),
    main: at(main, 60),
    right: at(asides[1], 60),
    viewport: { w: innerWidth, h: innerHeight },
  });
})()`;

const SCROLL = `(() => {
  const root = ${ROOT};
  const main = root.querySelector('main');
  const asides = [...root.querySelectorAll('aside')];
  const outer = root.firstElementChild;
  const batch = root.querySelector('[data-batch-list]');
  return JSON.stringify({
    main: Math.round(main.scrollTop),
    left: Math.round(asides[0].scrollTop),
    right: Math.round(asides[1].scrollTop),
    outer: Math.round(outer.scrollTop),
    batch: batch ? Math.round(batch.scrollTop) : null,
    mainMax: Math.round(main.scrollHeight - main.clientHeight),
  });
})()`;

const STICKY = `(() => {
  const root = ${ROOT};
  const input = root.querySelector('input[aria-label="搜索事件池"]');
  const bar = input.closest('.sticky');
  let scroller = bar;
  while (scroller) {
    const cs = getComputedStyle(scroller);
    if (scroller.scrollHeight > scroller.clientHeight + 2 && /auto|scroll/.test(cs.overflowY)) break;
    scroller = scroller.parentElement;
  }
  return JSON.stringify({
    barTop: Math.round(bar.getBoundingClientRect().top),
    scrollerTop: Math.round(scroller.getBoundingClientRect().top),
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

  const evaluate = (expression) =>
    send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then((r) => {
      const ex = r.exceptionDetails || r.result?.exceptionDetails;
      if (ex) throw new Error('CDP exception: ' + (ex.exception?.description || ex.text));
      return r.result?.value;
    });

  const state = JSON.stringify({
    version: 1,
    selectedArtists: ['characters/lin-fenfen', 'characters/lu-feng', 'characters/ou-yiqing'],
    lines: {}, order: [], pinned: [],
  });
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
  await send('Page.reload');
  await sleep(3500);

  const points = JSON.parse(await evaluate(POINTS));
  console.log('POINTS', JSON.stringify(points));
  const base = JSON.parse(await evaluate(SCROLL));
  console.log('BASELINE', JSON.stringify(base));
  if (base.mainMax < 500) throw new Error('event pool is not tall enough to test scrolling');

  const wheelAt = async (point, deltaY = 300) => {
    await send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: point.x, y: point.y,
      deltaX: 0, deltaY, button: 'none', pointerType: 'mouse',
    });
    await sleep(450);
    return JSON.parse(await evaluate(SCROLL));
  };
  const reset = () => evaluate(`(() => { ${ROOT}.querySelector('main').scrollTop = 0; return 1; })()`);

  // A wheel over a short column must move the event pool. The right rail is no
  // longer short — it holds the 进度存档 panel and now scrolls itself — so it is
  // checked separately below.
  for (const key of ['main', 'left']) {
    await reset();
    const after = await wheelAt(points[key]);
    console.log(`WHEEL_${key.toUpperCase()}`, JSON.stringify(after));
    if (after.main <= 20) {
      throw new Error(`wheel over the ${key} column did not scroll the event pool`);
    }
    // Snapshot right after the left-rail wheel: the pool has scrolled while
    // both side rails stayed put, with the sticky bar still pinned on top.
    if (key === 'left' && argOut) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(argOut, Buffer.from(shot.data, 'base64'));
      console.log('SHOT', argOut);
    }
  }

  // The right rail has its own scrollbar now: it must own the wheel, and the
  // pool must stay exactly where it was.
  await evaluate(`(() => { ${ROOT}.querySelectorAll('aside')[1].scrollTop = 0; return 1; })()`);
  await sleep(250);
  const beforeRight = JSON.parse(await evaluate(SCROLL));
  const afterRight = await wheelAt(points.right);
  console.log('WHEEL_RIGHT_OWN', JSON.stringify({ before: beforeRight.right, after: afterRight.right, main: afterRight.main }));
  if (afterRight.right <= 20) throw new Error('scrollable right rail did not scroll itself');
  if (afterRight.main !== beforeRight.main) {
    throw new Error('wheel over the scrollable right rail also moved the event pool');
  }

  // Scrolling by wheel must keep the sticky search bar pinned to the
  // scrollport top (same guarantee as programmatic scrolling).
  const sticky = JSON.parse(await evaluate(STICKY));
  console.log('STICKY_AFTER_WHEEL', JSON.stringify(sticky));
  if (sticky.barTop !== sticky.scrollerTop) {
    throw new Error('sticky search bar detached after wheel-forwarded scrolling');
  }

  // The shared global header sits outside the overlay but is covered too.
  await reset();
  const afterHeader = await wheelAt({ x: points.main.x, y: 30 });
  console.log('WHEEL_HEADER', JSON.stringify(afterHeader));
  if (afterHeader.main <= 20) throw new Error('wheel over the global header did not scroll the pool');

  // Upward wheels must scroll the pool back, not just downward ones. Probe the
  // short left rail, since the right one now scrolls itself.
  const up = await wheelAt(points.left, -150);
  console.log('WHEEL_UP', JSON.stringify(up));
  if (up.main >= afterHeader.main - 20) throw new Error('upward wheel did not scroll the pool back');

  // A nested scroller (batch multi-select) keeps its native wheel behaviour.
  await reset();
  await evaluate(`(() => { const b = ${ROOT}.querySelector('[data-batch-toggle]'); if (b && b.getAttribute('aria-expanded') === 'false') b.click(); return 1; })()`);
  await sleep(450);
  const listPoint = JSON.parse(await evaluate(`(() => {
    const b = ${ROOT}.querySelector('[data-batch-list]');
    if (!b) return JSON.stringify(null);
    const r = b.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), h: Math.round(b.scrollHeight - b.clientHeight) });
  })()`));
  console.log('BATCH_LIST', JSON.stringify(listPoint));
  if (!listPoint || listPoint.h < 40) throw new Error('batch list is not scrollable');
  const afterList = await wheelAt(listPoint);
  console.log('WHEEL_BATCH_LIST', JSON.stringify(afterList));
  if (afterList.batch <= 10 || afterList.main > 5) {
    throw new Error('nested batch list lost its native wheel scrolling');
  }

  // Once the left rail has its own scrollbar, the wheel belongs to it ALONE:
  // the event pool must not move, not even when the rail hits its boundary.
  await send('Emulation.setDeviceMetricsOverride', {
    width: points.viewport.w, height: 560, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(650);
  await evaluate(`(() => { const b = ${ROOT}.querySelector('aside button[aria-expanded="false"]'); if (b) b.click(); return 1; })()`);
  await sleep(400);
  const rail = JSON.parse(await evaluate(`(() => {
    const a = ${ROOT}.querySelector('aside');
    return JSON.stringify({ leftMax: Math.round(a.scrollHeight - a.clientHeight) });
  })()`));
  console.log('RAIL_GEOMETRY', JSON.stringify(rail));
  if (rail.leftMax < 20) throw new Error('left rail is not long enough to own the wheel');
  await evaluate(`(() => { const r = ${ROOT}; r.querySelector('main').scrollTop = 0; r.querySelector('aside').scrollTop = 0; return 1; })()`);
  await sleep(300);
  const beforeRail = JSON.parse(await evaluate(SCROLL));
  // Same crop before/after so the left rail visibly moves while the cards in
  // the middle column stay at exactly the same y positions.
  const railShot = async (path) => {
    const shot = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false,
      clip: { x: 0, y: 64, width: 900, height: 480, scale: 1 },
    });
    fs.writeFileSync(path, Buffer.from(shot.data, 'base64'));
  };
  if (argRailOut) await railShot(`${argRailOut}-before.png`);
  const afterRail = await wheelAt(points.left, 300);
  if (argRailOut) await railShot(`${argRailOut}-after.png`);
  console.log('WHEEL_LONG_LEFT', JSON.stringify(afterRail));
  if (afterRail.left <= 20) throw new Error('scrollable left rail did not scroll itself');
  if (afterRail.main !== beforeRail.main) {
    throw new Error('wheel over a scrollable left rail also moved the event pool');
  }

  await evaluate(`(() => { const a = ${ROOT}.querySelector('aside'); a.scrollTop = a.scrollHeight; return 1; })()`);
  await sleep(300);
  const afterRailEnd = await wheelAt(points.left, 300);
  console.log('WHEEL_LONG_LEFT_END', JSON.stringify(afterRailEnd));
  if (afterRailEnd.main !== beforeRail.main) {
    throw new Error('wheel chained from the left rail boundary into the event pool');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(450);

  // On narrow screens the whole stacked row is one scroller; wheel must not be
  // forwarded into the (non-scrolling) middle column.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 820, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  // Collapse the side panels so no nested scroller sits under the probe point.
  await evaluate(`(() => {
    const r = ${ROOT};
    r.querySelectorAll('aside button[aria-expanded="true"]').forEach(b => b.click());
    r.firstElementChild.scrollTop = 0;
    return 1;
  })()`);
  await sleep(450);
  // In the stacked layout the middle column starts far below the fold, so use
  // a viewport-relative point instead of the column's own centre.
  const narrowPoint = { x: 450, y: 300 };
  console.log('NARROW_CHAIN', await evaluate(`(() => {
    const out = [];
    let el = document.elementFromPoint(${narrowPoint.x}, ${narrowPoint.y});
    while (el && out.length < 8) {
      const cs = getComputedStyle(el);
      out.push(el.tagName + ':' + cs.overflowY + ':' + el.clientHeight + '/' + el.scrollHeight);
      el = el.parentElement;
    }
    return JSON.stringify(out);
  })()`));
  const narrowAfter = await wheelAt(narrowPoint, 400);
  console.log('NARROW_WHEEL', JSON.stringify(narrowAfter));
  if (narrowAfter.outer <= 20 || narrowAfter.main > 5) {
    throw new Error('narrow layout wheel was forwarded away from the page scroller');
  }
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
