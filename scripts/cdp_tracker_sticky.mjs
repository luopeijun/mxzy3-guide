import http from 'node:http';

/* Regression for the sticky search bar: it must stay opaque from the very top
   of the scrollport, so no scrolled card can peek out above it.
   Verifies the default state, the taller searching state, and the narrow (<=980px)
   layout where a different ancestor is the scroll container.
   Usage: node cdp_tracker_sticky.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
// Parenthesised: the inline form is interpolated before `.querySelector…`,
// and without brackets the `||` would swallow the member access.
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

/* The first ancestor that can actually scroll (main on desktop, the stacked
   flex row on narrow screens). */
const SCROLLER = `(() => {
  let el = ${ROOT}.querySelector('input[aria-label="搜索事件池"]');
  while (el) {
    const cs = getComputedStyle(el);
    if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(cs.overflowY)) return el;
    el = el.parentElement;
  }
  return null;
})()`;

const SNAPSHOT = `(() => {
  const root = ${ROOT};
  const input = root.querySelector('input[aria-label="搜索事件池"]');
  const sticky = input.closest('.sticky');
  const scroller = ${SCROLLER};
  const sbox = sticky.getBoundingClientRect();
  const bbox = scroller.getBoundingClientRect();
  const cs = getComputedStyle(sticky);
  const samples = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => {
    const el = document.elementFromPoint(sbox.left + sbox.width * f, sbox.top + 4);
    return el === sticky || sticky.contains(el);
  });
  const bg = cs.backgroundColor;
  const opaque = /^rgb\\(/.test(bg) || (/^rgba\\(/.test(bg) && !/,\\s*0?\\.\\d+\\)$/.test(bg));
  return JSON.stringify({
    scroller: scroller.tagName + '.' + String(scroller.className).slice(0, 55),
    scrollTop: Math.round(scroller.scrollTop),
    scrollerTop: Math.round(bbox.top),
    stickyTop: Math.round(sbox.top),
    stickyHeight: Math.round(sbox.height),
    zIndex: Number(cs.zIndex),
    background: bg,
    opaque,
    uncovered: samples.filter((ok) => !ok).length,
    samples: samples.length,
  });
})()`;

const SEARCH = (value) => `(() => {
  const i = document.querySelector('input[aria-label="搜索事件池"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
})()`;

function assertStuck(label, snap) {
  console.log(label, JSON.stringify(snap));
  if (snap.stickyTop !== snap.scrollerTop) {
    throw new Error(`${label}: sticky top ${snap.stickyTop} != scroller top ${snap.scrollerTop} (transparent strip above search bar)`);
  }
  if (snap.uncovered > 0) {
    throw new Error(`${label}: ${snap.uncovered}/${snap.samples} sample points show content over the bar`);
  }
  if (!snap.opaque || snap.zIndex < 20) {
    throw new Error(`${label}: bar is not opaque / z-index too low`);
  }
}

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

  // Enough content to scroll past.
  await evaluate(`(() => {
    [...${ROOT}.querySelectorAll('[data-active-pool] button[aria-expanded="false"]')]
      .slice(0, 4).forEach(b => b.click());
    return 1;
  })()`);
  await sleep(500);

  const scroll = (value) => evaluate(`(() => { const s = ${SCROLLER}; s.scrollTop = ${value}; return s.scrollTop; })()`);
  const snap = () => evaluate(SNAPSHOT).then(JSON.parse);

  const initial = await snap();
  console.log('INITIAL', JSON.stringify(initial));
  if (initial.stickyTop <= initial.scrollerTop) {
    throw new Error('bar should start below the scrollport top before scrolling');
  }

  await scroll(600);
  await sleep(500);
  assertStuck('SCROLLED', await snap());

  // Searching adds a result line; the taller bar must still cover the top.
  await evaluate(SEARCH('跟随'));
  await sleep(500);
  const searching = await snap();
  assertStuck('SEARCHING', searching);
  if (searching.stickyHeight <= initial.stickyHeight) {
    throw new Error('search result line did not grow the sticky bar');
  }

  await evaluate(SEARCH(''));
  await sleep(450);
  await scroll(0);
  await sleep(450);
  const restored = await snap();
  console.log('RESTORED', JSON.stringify(restored));
  if (restored.stickyTop <= restored.scrollerTop || restored.scrollTop !== 0) {
    throw new Error('bar did not return to its normal position');
  }

  // Narrow layout: the stacked flex row becomes the scroll container.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 820, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  // The stacked left rail scrolls by first; only once the middle column has
  // reached the top can its sticky bar pin to the scrollport (64px).
  await scroll(1600);
  await sleep(500);
  assertStuck('NARROW', await snap());
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
