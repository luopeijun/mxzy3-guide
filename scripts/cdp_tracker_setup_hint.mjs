import http from 'node:http';
import fs from 'node:fs';

/* Verify the collapsed artist picker's hint is never ellipsised, at 0 / 1 / 4
   selected artists (4 portraits take the most horizontal space).
   Usage: node cdp_tracker_setup_hint.mjs [url] [out.png] */
const [, , argUrl, out] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;
const ARTISTS = [
  'characters/lin-fenfen',
  'characters/xiao-yili',
  'characters/sang-hebei',
  'characters/su-manjun',
];

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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  const snapshot = () => evaluate(`(() => {
    const o = ${ROOT};
    const setup = [...o.querySelectorAll('aside section')].find(s => s.textContent.includes('追踪艺人'));
    const hint = setup.querySelector('[data-setup-hint]') || setup.querySelector('button[aria-expanded] span:last-of-type');
    const portraits = [...setup.querySelectorAll('button[aria-label^="取消追踪"]')];
    const cs = getComputedStyle(hint);
    const hr = hint.getBoundingClientRect();
    const pr = portraits.length ? portraits[0].getBoundingClientRect() : null;
    return JSON.stringify({
      text: hint.textContent.trim(),
      scrollWidth: hint.scrollWidth,
      clientWidth: hint.clientWidth,
      textOverflow: cs.textOverflow,
      whiteSpace: cs.whiteSpace,
      hintRight: Math.round(hr.right),
      portraitsLeft: pr ? Math.round(pr.left) : null,
      portraits: portraits.length,
      setupHeight: Math.round(setup.getBoundingClientRect().height),
    });
  })()`);

  const expect = (count) => count === 0 ? '点击选择 · 最多 4 位' : `${count}/4 位`;
  const failures = [];

  for (const count of [0, 1, 4]) {
    const state = JSON.stringify({
      version: 1,
      selectedArtists: ARTISTS.slice(0, count),
      lines: {}, order: [], pinned: [],
    });
    await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
    await send('Page.reload');
    await sleep(3300);
    const s = JSON.parse(await snapshot());
    console.log(`COUNT_${count}`, JSON.stringify(s));
    if (s.text !== expect(count)) {
      failures.push(`hint text truncated/unexpected at ${count}/4: "${s.text}" (expected "${expect(count)}")`);
    }
    if (s.scrollWidth > s.clientWidth + 1) {
      failures.push(`hint overflows at ${count}/4: scrollWidth=${s.scrollWidth} clientWidth=${s.clientWidth}`);
    }
    if (s.portraitsLeft !== null && s.hintRight > s.portraitsLeft + 1) {
      failures.push(`hint overlaps portraits at ${count}/4`);
    }
    if (s.portraits !== count) {
      failures.push(`expected ${count} portraits, got ${s.portraits}`);
    }
  }

  // Also check the narrow stacked layout, where the left rail is full width.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 820, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  const narrow = JSON.parse(await snapshot());
  console.log('NARROW', JSON.stringify(narrow));
  if (narrow.scrollWidth > narrow.clientWidth + 1 || narrow.text !== expect(4)) {
    failures.push('hint is clipped at 900px');
  }
  await send('Emulation.clearDeviceMetricsOverride');
  await sleep(400);
  if (failures.length) throw new Error(failures.join(' | '));

  if (out) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const s = [...${ROOT}.querySelectorAll('aside section')].find(x => x.textContent.includes('追踪艺人'));
        const c = s.getBoundingClientRect();
        return JSON.stringify({ x: Math.max(0, Math.round(c.left) - 12), y: Math.max(0, Math.round(c.top) - 12), width: Math.round(c.width) + 24, height: Math.round(c.height) + 24 });
      })()`,
      returnByValue: true,
    });
    const clip = { ...JSON.parse(r.result.value), scale: 1 };
    const { data } = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, clip,
    });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('SHOT', out);
  }

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
