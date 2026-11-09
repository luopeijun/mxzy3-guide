import http from 'node:http';
import fs from 'node:fs';

/* The middle column must never show a horizontal scrollbar: `overflow-y-auto`
   makes the computed overflow-x `auto`, so even a 3px indent spill becomes a
   scrollbar. Content has to fit or wrap inside the column instead.
   Usage: node cdp_tracker_overflow.mjs [url] [out.png] */
const [, , argUrl, argOut] = process.argv;
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

const PROBE = `(() => {
  const root = ${ROOT};
  const main = root.querySelector('main');
  const r = main.getBoundingClientRect();
  const cs = getComputedStyle(main);
  const contentRight = r.left + main.clientWidth;
  const spill = [];
  main.querySelectorAll('*').forEach(el => {
    const b = el.getBoundingClientRect();
    if (b.width < 1) return;
    const over = Math.round(b.right - contentRight);
    if (over > 1) spill.push({ tag: el.tagName, cls: String(el.className).slice(0, 50), over });
  });
  const cols = [main, ...root.querySelectorAll('aside')].map(el => ({
    tag: el.tagName, sw: el.scrollWidth, cw: el.clientWidth,
    ox: getComputedStyle(el).overflowX, bad: el.scrollWidth > el.clientWidth + 1,
  }));
  const chips = [...main.querySelectorAll('[data-filter-key]')].map(c => {
    const b = c.getBoundingClientRect();
    return { top: Math.round(b.top), right: Math.round(b.right) };
  });
  const rowSizes = {};
  chips.forEach(c => { rowSizes[c.top] = (rowSizes[c.top] || 0) + 1; });
  const indented = [...main.querySelectorAll('button[aria-pressed]')]
    .filter(b => parseFloat(getComputedStyle(b).marginLeft) > 0).length;
  return JSON.stringify({
    w: innerWidth,
    mainSW: main.scrollWidth, mainCW: main.clientWidth, ox: cs.overflowX,
    hOverflow: main.scrollWidth > main.clientWidth + 1,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    cols,
    spill: spill.slice(0, 5),
    chipCount: chips.length,
    chipRows: new Set(chips.map(c => c.top)).size,
    chipRowSizes: Object.values(rowSizes),
    chipRight: Math.max(...chips.map(c => c.right), 0),
    contentRight: Math.round(contentRight),
    indented,
    clip: { x: Math.round(r.left), y: 64, width: Math.round(r.width), height: 420 },
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
    send('Runtime.evaluate', { expression, returnByValue: true }).then((r) => {
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
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

  // Open cards with nested (indented) sub-events — those were the original
  // source of the 3px spill that produced the horizontal scrollbar.
  await evaluate(`(() => {
    [...${ROOT}.querySelectorAll('[data-active-pool] button[aria-expanded="false"]')].slice(0, 3).forEach(b => b.click());
    return 1;
  })()`);
  await sleep(500);

  for (const width of [1574, 1200, 1100, 1000, 980, 900, 700, 600, 520, 400]) {
    await send('Emulation.setDeviceMetricsOverride', {
      width, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(480);
    const info = JSON.parse(await evaluate(PROBE));
    console.log('WIDTH_' + width, JSON.stringify({
      main: info.mainSW + '/' + info.mainCW, ox: info.ox,
      bad: info.cols.filter(c => c.bad).map(c => c.tag), spill: info.spill.length,
      chipRows: info.chipRows, sizes: info.chipRowSizes,
      chipRight: info.chipRight + '/' + info.contentRight,
      indented: info.indented,
    }));

    if (info.pageOverflow) throw new Error(`${width}px: page has a horizontal overflow`);
    if (info.hOverflow || info.cols.some(c => c.bad)) {
      throw new Error(`${width}px: a column still overflows horizontally`);
    }
    if (info.spill.length > 0) {
      throw new Error(`${width}px: ${JSON.stringify(info.spill)} spill past the middle column`);
    }
    if (info.chipCount !== 6 || info.chipRight > info.contentRight + 1) {
      throw new Error(`${width}px: filter chips are not fully visible inside the column`);
    }
    // Desktop (>980px) keeps three independent columns; there the middle one
    // must be explicitly overflow-x-hidden, otherwise overflow-y-auto computes
    // overflow-x to auto and a scrollbar appears.
    if (width > 980 && info.ox === 'auto') {
      throw new Error(`${width}px: middle column can still show a horizontal scrollbar`);
    }
    if (info.indented === 0) throw new Error(`${width}px: no indented sub-event was rendered`);
    const cramped = width > 980 && width <= 1270;
    const threeByTwo = cramped || width <= 520;
    if (threeByTwo) {
      // Neat 3×2 rows, never a ragged 5+1 / 4+2 wrap.
      if (info.chipRowSizes.length !== 2 || info.chipRowSizes.some(n => n !== 3)) {
        throw new Error(`${width}px: chips wrapped into ragged rows ${JSON.stringify(info.chipRowSizes)}`);
      }
    } else if (info.chipRows !== 1) {
      throw new Error(`${width}px: chips should fit in one row of six`);
    }

    if (width === 1000 && argOut) {
      const shot = await send('Page.captureScreenshot', {
        format: 'png', captureBeyondViewport: false,
        clip: { ...info.clip, scale: 1 },
      });
      fs.writeFileSync(argOut, Buffer.from(shot.data, 'base64'));
      console.log('SHOT', argOut);
    }
  }

  await send('Emulation.clearDeviceMetricsOverride');
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}
main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
