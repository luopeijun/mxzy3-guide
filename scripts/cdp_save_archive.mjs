import http from 'node:http';

/* 六大通告多平台存档回归：通过事件追踪器「全部存档」面板导入一个仅含 specials 段
   的存档，验证 saveArchive 解析、applySpecialsToLocal、mergeSpecialsState：
   1) 导入 angel + done → localStorage 含之
   2) 合并 galaxy → enabled/done 取并集
   3) 覆盖 doomsday → 只剩 doomsday（replace 不保留旧的）
   Usage: node cdp_save_archive.mjs */

const url = 'http://localhost:5173/#/tracker';

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
let checksTotal = 0;
const check = (ok, label, extra = '') => {
  checksTotal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

// 仅含 specials 段的统一存档（tracker/cg 为空，验证 specials 独立导入）
const specialsArchive = (state) =>
  JSON.stringify({
    format: 'mxzy3-save',
    version: 1,
    exportedAt: '',
    summary: {
      trackerLines: 0,
      cgCollected: 0,
      hasCg: false,
      specialsEnabled: state.enabled?.length ?? 0,
      hasSpecials: true,
    },
    specials: {
      version: 1,
      state: {
        version: 1,
        enabled: [],
        assignments: {},
        done: [],
        stats: {},
        courses: {},
        values: {},
        groupLocked: {},
        ...state,
      },
    },
  });

async function main() {
  const target = await jsonPut(`http://127.0.0.1:9339/json/new?${encodeURIComponent(url)}`);
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
  await send('Page.bringToFront');
  await send('Page.navigate', { url });
  await sleep(3500);

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  // 干净 slate
  await evaluate(`localStorage.clear(); 1`);
  await send('Page.reload');
  await sleep(3000);

  const readSpecials = () =>
    evaluate(`(() => {
      const raw = localStorage.getItem('guide.specials.v1');
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return 'parse-error'; }
    })()`);

  const ensurePasteOpen = async () => {
    const open = await evaluate(`!!document.querySelector('[data-transfer-paste-input]')`);
    if (!open) {
      await evaluate(`document.querySelector('[data-transfer-paste]').click()`);
      await sleep(200);
    }
  };
  const fillAndRead = async (json) => {
    await ensurePasteOpen();
    await evaluate(`(() => {
      const ta = document.querySelector('[data-transfer-paste-input]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${JSON.stringify(json)});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(150);
    await evaluate(`document.querySelector('[data-transfer-read]').click()`);
    await sleep(300);
  };
  const merge = async () => {
    await evaluate(`document.querySelector('[data-transfer-merge]').click()`);
    await sleep(300);
  };
  const replace = async () => {
    await evaluate(`document.querySelector('[data-transfer-replace]').click()`);
    await sleep(200);
    await evaluate(`document.querySelector('[data-transfer-replace]').click()`);
    await sleep(300);
  };

  // 1) 导入 angel + 一条 done
  await fillAndRead(specialsArchive({ enabled: ['angel'], done: ['angel-demo-row'] }));
  await merge();
  let s = await readSpecials();
  check(s && s.enabled.includes('angel'), '导入后 enabled 含 angel', JSON.stringify(s?.enabled));
  check(s && s.done.includes('angel-demo-row'), '导入后 done 含 angel-demo-row', JSON.stringify(s?.done));

  // 2) 再合并 galaxy：并集
  await fillAndRead(specialsArchive({ enabled: ['galaxy'], done: ['galaxy-demo-row'] }));
  await merge();
  s = await readSpecials();
  check(
    s && s.enabled.includes('angel') && s.enabled.includes('galaxy'),
    '合并后 enabled 取并集',
    JSON.stringify(s?.enabled),
  );
  check(
    s && s.done.includes('angel-demo-row') && s.done.includes('galaxy-demo-row'),
    '合并后 done 取并集',
    JSON.stringify(s?.done),
  );

  // 3) 覆盖 doomsday：replace 模式只留新值
  await fillAndRead(specialsArchive({ enabled: ['doomsday-warrior'], done: ['doom-demo-row'] }));
  await replace();
  s = await readSpecials();
  check(
    s && s.enabled.length === 1 && s.enabled.includes('doomsday-warrior'),
    '覆盖后 enabled 仅 doomsday-warrior',
    JSON.stringify(s?.enabled),
  );
  check(
    s && !s.enabled.includes('angel') && !s.enabled.includes('galaxy'),
    '覆盖后不含旧 enabled',
    JSON.stringify(s?.enabled),
  );
  check(
    s && s.done.includes('doom-demo-row') && !s.done.includes('angel-demo-row'),
    '覆盖后 done 被替换',
    JSON.stringify(s?.done),
  );

  // 4) 六大通告页「全部存档」按钮 + 弹窗（与 CG / 追踪器同一面板）
  await evaluate(`(() => { localStorage.clear(); location.hash = '#/specials'; return true; })()`);
  await sleep(2500);
  const hasBtn = await evaluate(`!!document.querySelector('[data-specials-archive]')`);
  check(hasBtn, '六大通告页存在「全部存档」按钮', '');
  if (hasBtn) {
    await evaluate(`document.querySelector('[data-specials-archive]').click()`);
    await sleep(400);
    const modalShown = await evaluate(`!!document.querySelector('[data-specials-archive-modal]')`);
    check(modalShown, '点击后弹出存档面板弹窗', '');
    const panelInModal = await evaluate(
      `!!document.querySelector('[data-specials-archive-modal] [data-transfer-paste]')`,
    );
    check(panelInModal, '弹窗内是同一个全部存档面板（含导入控件）', '');
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
    await sleep(300);
    const modalClosed = await evaluate(`!document.querySelector('[data-specials-archive-modal]')`);
    check(modalClosed, 'Esc 可关闭弹窗', '');
  }

  console.log(`\n${checksTotal - failures.length}/${checksTotal} passed`);
  if (failures.length) {
    console.log('FAILURES:', failures.join(' | '));
    process.exit(1);
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
