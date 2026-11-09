import http from 'node:http';

/* The category chips must never reflow: clicking a filter, or changing the
   selected artists (which changes counts / group availability), must leave
   every chip in exactly the same place.
   Usage: node cdp_tracker_batch_chips.mjs [url] */
const [, , argUrl] = process.argv;
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

const SNAPSHOT = `(() => {
  const root = ${ROOT};
  const chips = root.querySelector('[data-batch-chips]');
  const box = chips.getBoundingClientRect();
  const items = [...chips.querySelectorAll('[data-chip-key]')].map((b) => {
    const r = b.getBoundingClientRect();
    return {
      key: b.dataset.chipKey,
      x: Math.round(r.left), y: Math.round(r.top),
      w: Math.round(r.width), h: Math.round(r.height),
      text: b.textContent.trim(),
    };
  });
  return JSON.stringify({
    height: Math.round(box.height),
    rows: new Set(items.map((i) => i.y)).size,
    items,
  });
})()`;

const geometry = (snap) => JSON.stringify({
  height: snap.height,
  rows: snap.rows,
  items: snap.items.map(({ key, x, y, w, h }) => ({ key, x, y, w, h })),
});

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
  const snap = () => evaluate(SNAPSHOT).then(JSON.parse);
  // Chips only exist while the batch panel is expanded (it is collapsed by
  // default). Re-open after every reload so chip geometry stays comparable.
  const expand = () => evaluate(`(() => {
    const t = document.querySelector('[data-batch-toggle]');
    if (t && t.getAttribute('aria-expanded') === 'false') t.click();
    return 1;
  })()`);
  const setState = (artists) => evaluate(
    `localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify({
      version: 1, selectedArtists: artists, lines: {}, order: [], pinned: [],
    }))}); 1`,
  );

  const rounds = [
    { name: 'ONE_ARTIST', artists: ['characters/lin-fenfen'] },
    { name: 'THREE_ARTISTS', artists: ['characters/lin-fenfen', 'characters/lu-feng', 'characters/ou-yiqing'] },
  ];
  const baselines = [];

  for (const round of rounds) {
    await setState(round.artists);
    await send('Page.reload');
    await sleep(3500);
    await expand();
    await sleep(250);

    const first = await snap();
    console.log(round.name + '_INITIAL', JSON.stringify(first));
    if (first.items.length !== 5) {
      throw new Error(`${round.name}: expected 5 fixed chips, got ${first.items.length}`);
    }
    const baseline = geometry(first);

    for (const key of ['broker', 'other', 'artist', 'luousang', 'all']) {
      await evaluate(`(() => { ${ROOT}.querySelector('[data-chip-key="${key}"]').click(); return 1; })()`);
      await sleep(180);
      const current = await snap();
      console.log(round.name + '_' + key.toUpperCase(), JSON.stringify(current));
      if (geometry(current) !== baseline) {
        throw new Error(`${round.name}: chips reflowed after clicking ${key}`);
      }
    }
    baselines.push(baseline);
  }

  if (baselines[0] !== baselines[1]) {
    throw new Error('chip geometry changed when the selected artists changed');
  }
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
