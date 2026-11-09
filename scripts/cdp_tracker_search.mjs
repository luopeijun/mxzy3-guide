import http from 'node:http';

/* Verify the event pool search box: body / line-name / tag matches, empty
   results, auto-expansion, keyword highlighting, Esc clearing and restore. */
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

  const setQuery = async (value) => {
    await send('Runtime.evaluate', {
      expression: `(() => {
        const input = document.querySelector('input[aria-label="搜索事件池"]');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, ${JSON.stringify(value)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return input.value;
      })()`,
      returnByValue: true,
    });
    await sleep(450);
  };

  const dump = async (label) => {
    const { result } = await send('Runtime.evaluate', {
      expression: `(() => {
        const overlay = document.querySelector('[data-tracker-app]');
        const input = overlay.querySelector('input[aria-label="搜索事件池"]');
        const status = [...overlay.querySelectorAll('main p')].find(p => p.textContent.includes('找到') || p.textContent.includes('没有匹配'));
        const cards = [...overlay.querySelectorAll('main [aria-expanded]')];
        return JSON.stringify({
          input: input ? input.value : null,
          status: status ? status.textContent.trim() : null,
          lines: cards.length,
          expanded: cards.filter(c => c.getAttribute('aria-expanded') === 'true').length,
          steps: overlay.querySelectorAll('main button[aria-pressed]').length,
          marks: overlay.querySelectorAll('main mark').length,
          hitBadges: [...overlay.querySelectorAll('main span')].filter(s => /^命中 \\d+ 个事件$/.test(s.textContent.trim())).length,
          emptyState: [...overlay.querySelectorAll('main p')].find(p => p.textContent.includes('没有匹配'))?.textContent.trim() ?? null,
        });
      })()`,
      returnByValue: true,
    });
    console.log(label, result.value);
  };

  await dump('INITIAL');

  for (const [label, value] of [
    ['BODY_MATCH', '门铃'],
    ['NAME_MATCH', '初始剧情'],
    ['TAG_MATCH', '跟随'],
    ['NO_RESULT', 'zzzz不存在'],
  ]) {
    await setQuery(value);
    await dump(label);
  }

  // Esc clears an active query.
  await setQuery('门铃');
  await send('Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[aria-label="搜索事件池"]');
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return 'esc';
    })()`,
    returnByValue: true,
  });
  await sleep(450);
  await dump('AFTER_ESC');

  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
