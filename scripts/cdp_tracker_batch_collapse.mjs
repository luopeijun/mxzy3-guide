import http from 'node:http';
import fs from 'node:fs';

/* Verify the batch panel collapses like the artist picker: one 50px row by
   default, a complete unclipped summary, expand/collapse round-trips, checked
   rows surviving a collapse, and the collapsed default after a reload.
   Usage: node cdp_tracker_batch_collapse.mjs [url] [collapsed.png] [expanded.png] */
const [, , argUrl, shotCollapsed, shotExpanded] = process.argv;
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
    const panel = ${PANEL};
    const toggle = panel.querySelector('[data-batch-toggle]');
    const header = toggle.parentElement;
    const hint = panel.querySelector('[data-batch-hint]');
    const badge = [...header.children].find(el => el.tagName === 'SPAN')?.textContent.trim() ?? null;
    const body = panel.querySelector('[data-batch-body]');
    const list = panel.querySelector('[data-batch-list]');
    const rows = list ? [...list.querySelectorAll('li button[aria-pressed]')] : [];
    const setup = [...${ROOT}.querySelectorAll('aside section')].find(s => s.textContent.includes('追踪艺人'));
    const aside = panel.closest('aside');
    return JSON.stringify({
      expanded: toggle.getAttribute('aria-expanded'),
      panelHeight: Math.round(panel.getBoundingClientRect().height),
      hintText: hint.textContent.trim(),
      hintClipped: hint.scrollWidth > hint.clientWidth + 1,
      badge,
      body: !!body,
      chips: body ? body.querySelectorAll('[data-chip-key]').length : 0,
      listOverflow: list ? getComputedStyle(list).overflowY : null,
      rows: rows.length,
      checkedRows: rows.filter(b => b.getAttribute('aria-pressed') === 'true').length,
      setupHeight: Math.round(setup.getBoundingClientRect().height),
      asideScrollHeight: aside.scrollHeight,
      asideClientHeight: aside.clientHeight,
    });
  })()`);

  const toggle = () => evaluate(`${PANEL}.querySelector('[data-batch-toggle]').click(); 1`);
  const shot = async (out) => {
    if (!out) return;
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const c = ${PANEL}.getBoundingClientRect();
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
  };

  // Start from a clean progress state so counts are predictable.
  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3400);

  const failures = [];
  const check = (label, s, fn) => {
    console.log(label, JSON.stringify(s));
    const problem = fn(s);
    if (problem) failures.push(`${label}: ${problem}`);
  };

  const initial = JSON.parse(await snapshot());
  check('COLLAPSED_DEFAULT', initial, (s) => {
    if (s.expanded !== 'false' || s.body) return 'panel is not collapsed by default';
    if (s.panelHeight > 56 || s.setupHeight > 56) return `collapsed rows too tall (${s.panelHeight}/${s.setupHeight})`;
    if (!/^在池 \d+\/\d+$/.test(s.hintText) || s.hintClipped) return `summary clipped: "${s.hintText}"`;
    if (s.badge) return 'unexpected badge with no selection';
    return null;
  });
  await shot(shotCollapsed);

  await toggle();
  await sleep(350);
  const expanded = JSON.parse(await snapshot());
  check('EXPANDED', expanded, (s) => {
    if (s.expanded !== 'true' || !s.body) return 'panel did not expand';
    if (s.chips !== 5) return `expected 5 chips, got ${s.chips}`;
    if (s.listOverflow !== 'auto' || s.rows === 0) return 'scrollable line list is missing';
    if (s.panelHeight <= 56) return 'expanded panel has no body height';
    return null;
  });
  await shot(shotExpanded);

  // Check two rows, then collapse: the badge must stay and the selection must
  // survive the round trip (state lives in the component, not in the DOM).
  await evaluate(`(() => {
    const rows = [...${PANEL}.querySelectorAll('[data-batch-list] li button[aria-pressed]')];
    rows[0].click(); rows[1].click(); return 1;
  })()`);
  await sleep(300);
  const picked = JSON.parse(await snapshot());
  check('TWO_CHECKED', picked, (s) => s.checkedRows !== 2 ? `expected 2 checked rows, got ${s.checkedRows}` : null);

  await toggle();
  await sleep(300);
  const collapsedAgain = JSON.parse(await snapshot());
  check('COLLAPSED_WITH_SELECTION', collapsedAgain, (s) => {
    if (s.body || s.expanded !== 'false') return 'panel did not collapse';
    if (s.badge !== '已选 2 条') return `badge lost on collapse: ${s.badge}`;
    if (s.panelHeight > 56) return 'collapsed row grew';
    return null;
  });

  await toggle();
  await sleep(300);
  const reopened = JSON.parse(await snapshot());
  check('REOPENED', reopened, (s) => s.checkedRows !== 2 ? `selection lost: ${s.checkedRows}` : null);

  await send('Page.reload');
  await sleep(3400);
  const reloaded = JSON.parse(await snapshot());
  check('AFTER_RELOAD', reloaded, (s) => {
    if (s.expanded !== 'false' || s.body) return 'collapsed state is not the default after reload';
    if (s.badge) return 'stale selection badge after reload';
    return null;
  });

  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 820, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  const narrow = JSON.parse(await snapshot());
  check('NARROW_COLLAPSED', narrow, (s) => {
    if (s.expanded !== 'false' || s.body) return 'not collapsed at 900px';
    if (s.hintClipped) return 'summary clipped at 900px';
    return null;
  });
  await toggle();
  await sleep(350);
  const narrowExpanded = JSON.parse(await snapshot());
  check('NARROW_EXPANDED', narrowExpanded, (s) => s.expanded !== 'true' || !s.body ? 'cannot expand at 900px' : null);
  await send('Emulation.clearDeviceMetricsOverride');

  if (failures.length) throw new Error(failures.join(' | '));
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
