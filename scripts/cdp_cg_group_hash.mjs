import http from 'node:http';

/* 图鉴分组进 URL（`#/cg/group/<groupId>`）的守卫：
   1. 直接开 `#/cg/group/lin` → 左栏高亮林芬芬，右栏就是林芬芬那 13 张；
   2. 刷新后仍然是林芬芬，而不是掉回「全部」；
   3. 点另一个人物 → hash 跟着变成 `#/cg/group/<id>`，刷新还是这一个人；
   4. 点「全部」→ hash 回到干净的 `#/cg`；
   5. 认不出的分组 id（手改坏 / 旧链接）→ 退回「全部」，URL 一并清理；
   6. 深链某张 CG（`#/cg/lin-4`）保持原样：分组自动切过去但**不改写** hash，
      这样「攻略 → 图鉴定位到某张图」的地址还能复制；
   7. 从攻略页点「CG 图鉴」页签 → 回到上次看的分组。
   Usage: node cdp_cg_group_hash.mjs */
const HOST = 'http://localhost:5173';

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try {
          resolve(d ? JSON.parse(d) : {});
        } catch {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATE = `JSON.stringify({
  hash: location.hash,
  group: document.querySelector('[data-cg-group][aria-pressed="true"]')?.getAttribute('data-cg-group-id') ?? '',
  title: document.querySelector('[data-cg-panel] h2')?.textContent?.trim() ?? '',
  cards: Number(document.querySelector('[data-cg-count]')?.getAttribute('data-cg-count') ?? 0),
  focused: document.getElementById('cg-card-lin-4') ? 'lin-4' : '',
})`;

async function main() {
  const target = await jsonPut(`http://127.0.0.1:9339/json/new?${encodeURIComponent(`${HOST}/#/cg`)}`);
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
  await send('Runtime.enable');
  // 后台标签页会把 rAF 节流掉，切前台的样式 / 滚动断言会偶发失败。
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expression) => {    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'evaluate failed');
    return result.value;
  };
  const state = async () => JSON.parse(await evaluate(STATE));
  const go = async (hash, wait = 2200) => {
    await send('Page.navigate', { url: `${HOST}/#${hash}` });
    await sleep(wait);
    return state();
  };

  const fail = (msg) => {
    throw new Error(msg);
  };
  const expect = (cond, msg, data) => {
    if (!cond) fail(`${msg} — ${JSON.stringify(data)}`);
  };

  // 新开的标签页还在首次加载，这时导航会被正在进行的 load 顶掉（实测 hash 停在 #/cg）。
  await sleep(2400);

  // 1. 带分组的地址直接打开。
  const deep = await go('/cg/group/lin');
  console.log('deep group:', JSON.stringify(deep));
  expect(deep.group === 'lin', '带分组的链接没高亮林芬芬', deep);
  expect(deep.title === '林芬芬', '右栏标题不是林芬芬', deep);
  expect(deep.cards === 13, '林芬芬应有 13 张', deep);

  // 2. 刷新后还是林芬芬。
  await send('Page.reload');
  await sleep(2400);
  const kept = await state();
  console.log('after reload:', JSON.stringify(kept));
  expect(kept.group === 'lin' && kept.title === '林芬芬', '刷新后分组丢了', kept);

  // 3. 点另一个人物 —— 地址栏跟着走。
  await evaluate(`document.querySelector('[data-cg-group-id="xiao"]').click(); 'ok'`);
  await sleep(500);
  const clicked = await state();
  console.log('after click:', JSON.stringify(clicked));
  expect(clicked.hash === '#/cg/group/xiao', '切分组没写进 URL', clicked);
  expect(clicked.group === 'xiao' && clicked.title === '萧依莉', '切分组后右栏不对', clicked);

  await send('Page.reload');
  await sleep(2400);
  const kept2 = await state();
  expect(kept2.group === 'xiao', '刷新后没停在萧依莉', kept2);

  // 4. 「全部」回到干净的 #/cg。
  await evaluate(`document.querySelector('[data-cg-group-id="all"]').click(); 'ok'`);
  await sleep(400);
  const all = await state();
  console.log('all:', JSON.stringify(all));
  expect(all.hash === '#/cg' && all.group === 'all', '「全部」的地址不是 #/cg', all);

  // 5. 认不出的分组 → 退回全部并清理地址。
  const bogus = await go('/cg/group/nope');
  console.log('bogus:', JSON.stringify(bogus));
  expect(bogus.group === 'all', '坏分组没退回全部', bogus);
  expect(bogus.hash === '#/cg', '坏分组没从 URL 里清掉', bogus);

  // 6. 深链单张 CG：分组跟着切，但 hash 不被改写。
  const single = await go('/cg/lin-4', 2600);
  console.log('single cg:', JSON.stringify(single));
  expect(single.hash === '#/cg/lin-4', '深链地址被改写了', single);
  expect(single.group === 'lin', '深链没切到对应分组', single);
  expect(single.focused === 'lin-4', '深链那张卡没渲染出来', single);

  // 7. 在深链上再点分组 → 换成 group 形式。
  await evaluate(`document.querySelector('[data-cg-group-id="ou"]').click(); 'ok'`);
  await sleep(500);
  const afterDeep = await state();
  expect(afterDeep.hash === '#/cg/group/ou', '深链上点分组没换形式', afterDeep);

  // 8. 回攻略再点「CG 图鉴」页签 → 回到上次的欧怡青。
  await evaluate(`location.hash = '#/guide/characters/lin-fenfen'; 'ok'`);
  await sleep(1600);
  await evaluate(`document.querySelector('[data-tab="cg"]').click(); 'ok'`);
  await sleep(1800);
  const tabBack = await state();
  console.log('tab back:', JSON.stringify(tabBack));
  expect(tabBack.hash === '#/cg/group/ou', '页签没回到上次看的分组', tabBack);
  expect(tabBack.group === 'ou', '页签回来后高亮不对', tabBack);

  console.log('ALL_CHECKS_PASSED');
  await jsonPut(`http://127.0.0.1:9339/json/close/${target.id}`);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
