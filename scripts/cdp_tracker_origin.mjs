import http from 'node:http';

/* Verify the source chip in front of every task-line name:
   - non-artist lines carry a category chip (经纪人 / 其他 / 通告)
   - artist lines carry the artist portrait + name
   - 路欧桑 branches carry their own 路欧桑 chip
   - chip sits before the line name, tooltip holds the full provenance
   Usage: node cdp_tracker_origin.mjs [url] */
const [, , argUrl] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const SCOPE = `document.querySelector('[data-tracker-app]') || document`;

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
  const root = ${SCOPE};
  const cards = [...root.querySelectorAll('[data-active-pool] [data-line-card]')];
  const rows = cards.map(c => {
    const t = c.querySelector('[data-origin-tag]');
    const n = c.querySelector('[data-line-name]');
    const img = t?.querySelector('img');
    return {
      tone: t?.getAttribute('data-origin-tone') ?? null,
      label: t?.textContent?.trim() ?? null,
      title: t?.getAttribute('title') ?? null,
      name: n?.textContent?.trim() ?? null,
      avatar: img ? img.getAttribute('src') : null,
      avatarOk: img ? img.complete && img.naturalWidth > 0 : null,
      beforeName: !!(t && n && (t.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING)),
    };
  });
  const byTone = {};
  for (const r of rows) {
    byTone[r.tone] = byTone[r.tone] || { count: 0, labels: [...new Set()], avatars: 0, broken: 0, beforeName: 0 };
    const g = byTone[r.tone];
    g.count += 1;
    if (!g.labels.includes(r.label)) g.labels.push(r.label);
    if (r.avatar) g.avatars += 1;
    if (r.avatarOk === false) g.broken += 1;
    if (r.beforeName) g.beforeName += 1;
  }
  return JSON.stringify({
    cards: cards.length,
    tagged: rows.filter(r => r.tone !== null).length,
    byTone,
    sample: rows.slice(0, 3),
  });
})()`;

const progress = (artists) =>
  `localStorage.setItem('guide.progress.v1', ${JSON.stringify(
    JSON.stringify({ version: 1, selectedArtists: artists, lines: {}, order: [], pinned: [] }),
  )}); 1`;

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
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };
  const loadArtists = async (artists) => {
    await evaluate(progress(artists));
    await send('Page.reload');
    await sleep(3500);
  };

  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3500);
  const plain = JSON.parse(await evaluate(SNAPSHOT));
  console.log('NO_ARTIST', JSON.stringify(plain));
  if (plain.cards === 0 || plain.tagged !== plain.cards) {
    throw new Error('not every line has a source chip');
  }
  for (const tone of ['broker', 'other', 'notice']) {
    const group = plain.byTone[tone];
    if (!group || group.count === 0 || group.beforeName !== group.count) {
      throw new Error('missing / misplaced chip for ' + tone);
    }
  }

  await loadArtists(['characters/lin-fenfen']);
  const artist = JSON.parse(await evaluate(SNAPSHOT));
  console.log('WITH_ARTIST', JSON.stringify(artist));
  const a = artist.byTone.artist;
  if (
    !a ||
    a.count === 0 ||
    a.labels.length !== 1 ||
    a.labels[0] !== '林芬芬' ||
    a.avatars !== a.count ||
    a.broken !== 0 ||
    a.beforeName !== a.count
  ) {
    throw new Error('artist chip / portrait is wrong');
  }
  if (artist.tagged !== artist.cards) throw new Error('some lines lost their chip');

  await loadArtists(['characters/lu-feng', 'characters/ou-yiqing']);
  const luo = JSON.parse(await evaluate(SNAPSHOT));
  console.log('WITH_LUOSANG', JSON.stringify(luo));
  const l = luo.byTone.luousang;
  if (!l || l.count === 0 || !l.labels.includes('路欧桑') || l.beforeName !== l.count) {
    throw new Error('路欧桑 chip missing');
  }
  if (luo.tagged !== luo.cards) throw new Error('some lines lost their chip');

  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
