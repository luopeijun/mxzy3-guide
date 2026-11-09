import http from 'node:http';
import fs from 'node:fs';

/* Verify the artist portrait in the batch-selection list:
   1. every artist line row carries a portrait; non-artist rows never do
   2. the portraits actually load (naturalWidth > 0) and are labelled with the
      artist name, so two artists' chapter lists are distinguishable
   3. filtering the chips to 艺人 keeps only rows that have a portrait
   Usage: node cdp_tracker_batch_avatar.mjs [url] [out.png] */
const [, , argUrl, argShot] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;
const PANEL = `${ROOT}.querySelector('[data-batch-panel]')`;

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
  const panel = ${PANEL};
  const list = panel.querySelector('[data-batch-list]');
  if (!list) return JSON.stringify({ ready: false, expanded: panel.querySelector('[data-batch-toggle]')?.getAttribute('aria-expanded') });
  const rows = [...list.querySelectorAll('li')];
  const info = rows.map(row => {
    const avatar = row.querySelector('[data-artist-avatar]');
    const img = avatar?.tagName === 'IMG' ? avatar : null;
    return {
      name: row.querySelector('[title]')?.getAttribute('title') ?? row.textContent.trim(),
      hasAvatar: !!avatar,
      isImage: !!img,
      loaded: img ? img.naturalWidth > 0 : null,
      label: avatar?.getAttribute('title') ?? null,
      src: img ? img.getAttribute('src') : null,
      fallback: avatar?.hasAttribute('data-avatar-fallback') ?? false,
    };
  });
  const withAvatar = info.filter(i => i.hasAvatar);
  return JSON.stringify({
    ready: true,
    expanded: panel.querySelector('[data-batch-toggle]').getAttribute('aria-expanded'),
    rows: info.length,
    withAvatar: withAvatar.length,
    withoutAvatar: info.length - withAvatar.length,
    images: withAvatar.filter(i => i.isImage).length,
    imagesLoaded: withAvatar.filter(i => i.isImage && i.loaded).length,
    fallbacks: withAvatar.filter(i => i.fallback).length,
    unloaded: withAvatar.filter(i => i.isImage && !i.loaded).map(i => i.src),
    labels: [...new Set(withAvatar.map(i => i.label))],
    sampleNoAvatar: info.filter(i => !i.hasAvatar).slice(0, 3).map(i => i.name),
    sampleWithAvatar: withAvatar.slice(0, 4).map(i => ({ label: i.label, name: i.name })),
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

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };

  // Two artists so the list contains lines from both (and the avatars must
  // distinguish them). 林芬芬 + 路风 keeps 路欧桑 out of the picture.
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(
    JSON.stringify({
      version: 1,
      selectedArtists: ['characters/lin-fenfen', 'characters/lu-feng'],
      lines: {},
      order: [],
      pinned: [],
    }),
  )}); 1`);
  await send('Page.reload');
  await sleep(3600);

  // The panel is collapsed by default; open it and wait for the list.
  await evaluate(`(() => { ${PANEL}.querySelector('[data-batch-toggle]').click(); return 1; })()`);
  await sleep(500);

  const snap = async () => JSON.parse(await evaluate(SNAPSHOT));
  let s = await snap();
  if (!s.ready) {
    // A click that lands before hydration is a no-op; retry once.
    await evaluate(`(() => { ${PANEL}.querySelector('[data-batch-toggle]').click(); return 1; })()`);
    await sleep(600);
    s = await snap();
  }
  if (!s.ready) throw new Error('batch list did not render');
  if (s.expanded !== 'true') throw new Error('batch panel did not expand');

  console.log('BASELINE', JSON.stringify({
    rows: s.rows, withAvatar: s.withAvatar, withoutAvatar: s.withoutAvatar,
    images: s.images, imagesLoaded: s.imagesLoaded, fallbacks: s.fallbacks, labels: s.labels,
  }));
  console.log('SAMPLES', JSON.stringify({ withAvatar: s.sampleWithAvatar, without: s.sampleNoAvatar }));

  if (s.withAvatar < 8) throw new Error(`expected artist rows with a portrait, got ${s.withAvatar}/${s.rows}`);
  if (s.withoutAvatar < 5) throw new Error('non-artist rows should not carry a portrait');
  if (s.imagesLoaded !== s.images) throw new Error('some artist portraits failed to load: ' + s.unloaded.join(', '));
  if (s.fallbacks > 0) throw new Error('artist portraits fell back to initials: ' + s.labels.join(', '));
  if (s.labels.length !== 2) throw new Error('portraits should name the two selected artists, got ' + s.labels.join(', '));

  // Filtering to the 艺人 group must leave exactly the portrait rows.
  await evaluate(`(() => { ${PANEL}.querySelector('[data-chip-key="artist"]').click(); return 1; })()`);
  await sleep(400);
  const artistOnly = await snap();
  console.log('FILTER_ARTIST', JSON.stringify({
    rows: artistOnly.rows, withAvatar: artistOnly.withAvatar, withoutAvatar: artistOnly.withoutAvatar,
    labels: artistOnly.labels,
  }));
  if (artistOnly.withoutAvatar !== 0) throw new Error('artist filter shows rows without a portrait');
  if (artistOnly.withAvatar !== s.withAvatar) throw new Error('artist filter dropped some portraits');

  // Back to 全部 and screenshot the panel.
  await evaluate(`(() => { ${PANEL}.querySelector('[data-chip-key="all"]').click(); return 1; })()`);
  await sleep(400);

  if (argShot) {
    const clip = JSON.parse(await evaluate(`(() => {
      const panel = ${PANEL};
      panel.scrollIntoView({ block: 'start' });
      const r = panel.getBoundingClientRect();
      return JSON.stringify({
        x: Math.max(0, Math.round(r.left) - 16),
        y: Math.max(0, Math.round(r.top) - 12),
        width: Math.round(r.width) + 32,
        height: Math.min(Math.round(r.height) + 24, 760),
      });
    })()`));
    const shot = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { ...clip, scale: 1 },
    });
    fs.writeFileSync(argShot, Buffer.from(shot.data, 'base64'));
    console.log('SHOT', argShot);
  }

  console.log('ALL_CHECKS_PASSED');
  ws.close();
}

main().catch((error) => {
  console.error('CDP error:', error.message);
  process.exit(1);
});
