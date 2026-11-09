import http from 'node:http';
import fs from 'node:fs';

/* Verify the one-click jump to the completed archive: expand + smooth scroll,
   no overlap with the sticky search bar, repeatable, works while searching and
   at a narrow stacked layout.
   Usage: node cdp_tracker_jump_completed.mjs [url] [out.png] */
const [, , argUrl, out] = process.argv;
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
    const main = o.querySelector('main');
    const outer = o.firstElementChild;
    const btn = o.querySelector('[data-jump-completed]');
    const pool = o.querySelector('[data-completed-pool]');
    const toggle = o.querySelector('[data-completed-toggle]');
    const sticky = btn?.closest('.sticky');
    const pr = pool?.getBoundingClientRect();
    const sr = sticky?.getBoundingClientRect();
    return JSON.stringify({
      btnText: btn?.textContent.replace(/\\s+/g, ' ').trim() ?? null,
      btnDisabled: btn?.disabled ?? null,
      expanded: toggle?.getAttribute('aria-expanded') ?? null,
      mainScrollTop: main ? Math.round(main.scrollTop) : null,
      outerScrollTop: outer ? Math.round(outer.scrollTop) : null,
      poolTop: pr ? Math.round(pr.top) : null,
      stickyBottom: sr ? Math.round(sr.bottom) : null,
      viewportH: innerHeight,
      archiveCards: o.querySelectorAll('[data-completed-pool] [data-line-card]').length,
      activeCards: o.querySelectorAll('[data-active-pool] [data-line-card]').length,
    });
  })()`);

  const failures = [];
  const check = (label, s, fn) => {
    console.log(label, JSON.stringify(s));
    const problem = fn(s);
    if (problem) failures.push(`${label}: ${problem}`);
  };
  const landed = (s) => {
    if (s.expanded !== 'true') return 'archive did not expand';
    if (s.poolTop === null) return 'archive not rendered';
    if (s.poolTop < s.stickyBottom - 2) return `archive hidden behind sticky bar (top=${s.poolTop}, stickyBottom=${s.stickyBottom})`;
    if (s.poolTop > s.viewportH * 0.75) return `archive not in view (top=${s.poolTop})`;
    if (s.mainScrollTop + s.outerScrollTop <= 0) return 'no scrolling happened';
    if (s.archiveCards === 0) return 'expanded archive has no cards';
    return null;
  };
  const toTop = () => evaluate(`(() => {
    const o = ${ROOT};
    o.querySelector('main').scrollTop = 0;
    o.firstElementChild.scrollTop = 0;
    return 1;
  })()`);
  const jump = () => evaluate(`${ROOT}.querySelector('[data-jump-completed]').click(); 1`);

  // Clean state: nothing completed yet.
  await evaluate(`localStorage.removeItem('guide.progress.v1'); 1`);
  await send('Page.reload');
  await sleep(3400);
  const baseline = JSON.parse(await snapshot());
  check('NO_COMPLETED_LINES', baseline, (s) => {
    if (s.btnText !== '已完成 0 ↓') return `unexpected button text: ${s.btnText}`;
    if (s.btnDisabled !== true) return 'button should be disabled with no completed lines';
    if (s.poolTop !== null) return 'archive shown while empty';
    return null;
  });

  // Archive the first line with its master checkbox.
  await evaluate(`(() => {
    const c = ${ROOT}.querySelector('[data-active-pool] [data-line-card]');
    c.querySelector('[data-master-checkbox]').click();
    return 1;
  })()`);
  await sleep(500);
  const afterComplete = JSON.parse(await snapshot());
  check('ONE_LINE_COMPLETED', afterComplete, (s) => {
    if (s.btnText !== '已完成 1 ↓' || s.btnDisabled !== false) return `button not updated: ${s.btnText}`;
    if (s.expanded !== 'false') return 'archive should still be collapsed';
    return null;
  });

  // Jump from the top of the list, with the archive collapsed.
  await toTop();
  await jump();
  await sleep(1400);
  const firstJump = JSON.parse(await snapshot());
  check('JUMP_FROM_COLLAPSED', firstJump, landed);

  if (out) {
    const r = await send('Runtime.evaluate', {
      expression: `(() => {
        const o = ${ROOT};
        const p = o.querySelector('[data-completed-pool]').getBoundingClientRect();
        const m = o.querySelector('main').getBoundingClientRect();
        return JSON.stringify({ x: Math.max(0, Math.round(m.left) - 8), y: Math.max(0, Math.round(p.top) - 70), width: Math.round(m.width) + 16, height: 320 });
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

  // Collapse manually, go back to the top, and jump again.
  await evaluate(`${ROOT}.querySelector('[data-completed-toggle]').click(); 1`);
  await sleep(250);
  await toTop();
  await sleep(200);
  await jump();
  await sleep(1400);
  check('REPEAT_JUMP', JSON.parse(await snapshot()), landed);

  // The sticky bar grows while searching; the jump must still clear it.
  await evaluate(`(() => {
    const input = ${ROOT}.querySelector('input[aria-label="搜索事件池"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    const card = ${ROOT}.querySelector('[data-completed-pool] [data-line-name]');
    const text = (card?.textContent || '初始').trim().slice(0, 2);
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return text;
  })()`);
  await sleep(500);
  await toTop();
  await jump();
  await sleep(1400);
  check('JUMP_WHILE_SEARCHING', JSON.parse(await snapshot()), landed);
  await evaluate(`${ROOT}.querySelector('input[aria-label="搜索事件池"]').focus(); 1`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);

  await send('Page.reload');
  await sleep(3400);
  check('AFTER_RELOAD', JSON.parse(await snapshot()), (s) => {
    if (s.btnText !== '已完成 1 ↓' || s.btnDisabled) return 'jump button lost completed count after reload';
    if (s.expanded !== 'false') return 'archive should be collapsed again';
    return null;
  });

  // Narrow stacked layout uses the outer wrapper as the scroll container.
  await send('Emulation.setDeviceMetricsOverride', {
    width: 900, height: 820, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(700);
  await toTop();
  await jump();
  await sleep(1600);
  check('NARROW_JUMP', JSON.parse(await snapshot()), landed);
  await send('Emulation.clearDeviceMetricsOverride');

  if (failures.length) throw new Error(failures.join(' | '));
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
