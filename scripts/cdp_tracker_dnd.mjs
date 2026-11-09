import http from 'node:http';

/* Verify the flat event pool: no category headings, pin to top, drag reorder,
   persistence across reload, pin-state sync on drag, and disabled drag during
   search. Usage: node cdp_tracker_dnd.mjs <url> [localStorageJson] */
const [, , url, lsJson] = process.argv;

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
  await sleep(4000);
  if (lsJson) {
    await send('Runtime.evaluate', {
      expression: `localStorage.setItem('guide.progress.v1', ${JSON.stringify(lsJson)}); location.reload();`,
    });
    await sleep(3800);
  }

  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return result.value;
  };

  const snapshot = () => evaluate(`(() => {
    const o = document.querySelector('div.fixed.inset-0.z-50');
    const main = o.querySelector('main');
    const cards = [...main.querySelectorAll('[data-line-card]')];
    const names = cards.map(c => c.querySelector('button[aria-expanded] span:nth-of-type(2)')?.textContent?.trim() ?? '?');
    return JSON.stringify({
      groupHeadings: main.querySelectorAll('h3').length,
      lines: cards.length,
      handles: main.querySelectorAll('[aria-label="拖拽排序"]').length,
      draggableHandles: [...main.querySelectorAll('[aria-label="拖拽排序"]')].filter(h => h.draggable).length,
      first3: names.slice(0, 3),
      pinnedBadges: [...main.querySelectorAll('span')].filter(s => s.textContent.trim() === '置顶').length,
      divider: [...main.querySelectorAll('li')].find(li => li.textContent.includes('其余 '))?.textContent.trim() ?? null,
      stored: JSON.parse(localStorage.getItem('guide.progress.v1') || '{}'),
    });
  })()`);

  console.log('INITIAL', await snapshot());

  // Pin the third line via its 置顶 button.
  const pinnedName = await evaluate(`(() => {
    const o = document.querySelector('div.fixed.inset-0.z-50');
    const cards = [...o.querySelectorAll('main [data-line-card]')];
    const name = cards[2].querySelector('button[aria-expanded] span:nth-of-type(2)').textContent.trim();
    const btn = [...cards[2].querySelectorAll('button')].find(b => b.textContent.trim() === '置顶');
    btn.click();
    return name;
  })()`);
  await sleep(500);
  console.log('PINNED_NAME:', pinnedName);
  console.log('AFTER_PIN', await snapshot());

  // Reload and confirm persistence.
  await evaluate(`location.reload(); 1`);
  await sleep(3600);
  console.log('AFTER_RELOAD', await snapshot());

  // Drag line #4 onto line #1 area (before it) by dispatching real DragEvents.
  const dragInfo = await evaluate(`(async () => {
    const o = document.querySelector('div.fixed.inset-0.z-50');
    const lis = [...o.querySelectorAll('main li')].filter(li => li.querySelector('[data-line-card]'));
    const src = lis[3], dst = lis[0];
    const handle = src.querySelector('[aria-label="拖拽排序"]');
    const dt = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 80));
    const r = dst.getBoundingClientRect();
    const opts = { bubbles: true, dataTransfer: dt, clientY: r.top + 2 };
    dst.dispatchEvent(new DragEvent('dragover', opts));
    await new Promise(r => setTimeout(r, 80));
    dst.dispatchEvent(new DragEvent('drop', opts));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    await new Promise(r => setTimeout(r, 250));
    return 'ok';
  })()`);
  console.log('DRAG_RESULT:', dragInfo);
  console.log('AFTER_DRAG', await snapshot());

  // Search disables drag handles.
  await evaluate(`(() => {
    const i = document.querySelector('input[aria-label="搜索事件池"]');
    const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    s.call(i, '门铃'); i.dispatchEvent(new Event('input', { bubbles: true }));
    return 1;
  })()`);
  await sleep(450);
  console.log('DURING_SEARCH', await snapshot());

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
