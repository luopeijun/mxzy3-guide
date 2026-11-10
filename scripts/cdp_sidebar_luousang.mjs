import http from 'node:http';

/* 侧栏类目顺序的守卫：「路欧桑剧情整理」从「其他事件」的最后一条提升成独立类目，
   位置在「艺人事件簿」下面、「六大特殊通告」上面。
   1. 默认顺序（清掉本地自定义顺序后）就是这五类，且路欧桑与「艺人事件簿」同级；
   2. 点它能进 `#/guide/other-events/luousang`，五条分支都在；
   3. 老的自定义顺序（root 里没有这个新 id）读出来时补在「艺人事件簿」后面，
      不会因为它是个「新节点」被排到最末；
   4. 侧栏右上角的「N 大类」跟着变成 5。
   Usage: node cdp_sidebar_luousang.mjs */
const HOST = 'http://localhost:5173';
const PAGE = `${HOST}/#/guide/characters/lin-fenfen`;
const CATEGORIES = [
  '经纪人事件簿',
  '艺人事件簿',
  '路欧桑剧情整理',
  '六大特殊通告',
  '其他事件',
];

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

/** 侧栏里五类标题的 DOM 顺序。 */
const ORDER = `JSON.stringify([...document.querySelectorAll('nav [data-node-id]')]
  .map((row) => row.querySelector('button[title]')?.textContent?.trim() ?? '')
  .filter((text) => ${JSON.stringify(CATEGORIES)}.includes(text)))`;

const SAME_LEVEL = `(() => {
  const item = (id) => document.querySelector('[data-node-id="' + id + '"]')?.closest('[role="treeitem"]');
  const a = item('characters');
  const b = item('other-events/luousang');
  return JSON.stringify({ bothPresent: !!a && !!b, sameParent: !!a && !!b && a.parentElement === b.parentElement });
})()`;

async function main() {
  const target = await jsonPut(`http://127.0.0.1:9339/json/new?${encodeURIComponent(PAGE)}`);
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
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text ?? 'evaluate failed');
    return result.value;
  };

  // 新开的标签页还在首次加载，直接导航会被这次 load 顶掉。
  await sleep(2400);

  const fail = (msg) => {
    throw new Error(msg);
  };

  // 1. 清掉可能存在的自定义顺序，看默认顺序。
  await evaluate(`localStorage.removeItem('guide.tree-order.v1'); 'ok'`);
  await send('Page.reload');
  await sleep(2600);
  const order = JSON.parse(await evaluate(ORDER));
  console.log('default order:', JSON.stringify(order));
  if (order.join('|') !== CATEGORIES.join('|')) {
    fail(`默认类目顺序不对：${JSON.stringify(order)}`);
  }
  const level = JSON.parse(await evaluate(SAME_LEVEL));
  if (!level.bothPresent || !level.sameParent) {
    fail(`路欧桑剧情整理没和「艺人事件簿」同级：${JSON.stringify(level)}`);
  }
  const headText = await evaluate(`document.querySelector('aside [title*="恢复默认"]') ? 'customized' : document.querySelector('aside')?.innerText.split('\\n').find((l) => l.includes('大类')) ?? ''`);
  console.log('category count label:', JSON.stringify(headText));
  if (!String(headText).includes('5 大类')) fail(`类目数量标签没跟着变：${headText}`);

  // 2. 点它能进页面，五条分支在。
  await evaluate(`document.querySelector('nav [data-node-id="other-events/luousang"] button[title]').click(); 'ok'`);
  await sleep(1600);
  const page = JSON.parse(await evaluate(`JSON.stringify({
    hash: location.hash,
    title: document.querySelector('main h1')?.textContent?.trim() ?? '',
    text: document.querySelector('main')?.innerText ?? '',
  })`));
  console.log('page:', JSON.stringify({ hash: page.hash, title: page.title }));
  if (page.hash !== '#/guide/other-events/luousang') fail(`点类目没进对应页面：${page.hash}`);
  if (page.title !== '路欧桑剧情整理') fail(`页面标题不对：${page.title}`);
  for (const branch of ['只有桑禾蓓在旗下', '只有欧怡青在旗下', '只有路风在旗下',
    '路风和桑禾蓓都在旗下', '路风和欧怡青都在旗下']) {
    if (!page.text.includes(branch)) fail(`页面里看不到分支「${branch}」`);
  }

  // 3. 老的自定义顺序：root 里没有新 id，要补在「艺人事件簿」后面。
  await evaluate(`localStorage.setItem('guide.tree-order.v1', JSON.stringify({
    root: ['characters', 'game-guide', 'other-events', 'notices'],
  })); 'ok'`);
  await send('Page.reload');
  await sleep(2600);
  const migrated = JSON.parse(await evaluate(ORDER));
  console.log('migrated order:', JSON.stringify(migrated));
  const want = ['艺人事件簿', '路欧桑剧情整理', '经纪人事件簿', '其他事件', '六大特殊通告'];
  if (migrated.join('|') !== want.join('|')) {
    fail(`老顺序没插到「艺人事件簿」后面：${JSON.stringify(migrated)}`);
  }

  await evaluate(`localStorage.removeItem('guide.tree-order.v1'); 'ok'`);
  console.log('ALL_CHECKS_PASSED');
  await jsonPut(`http://127.0.0.1:9339/json/close/${target.id}`);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
