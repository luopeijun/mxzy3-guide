import http from 'node:http';

/* 事件池里「路欧桑剧情」的位置：
   1. 默认（没有拖拽顺序）就在最后一条「艺人事件」后面，排在通告 / 其他事件之前；
   2. 老存档把路欧桑线拖在了最末（`orderEpoch` 不存在）→ 读进来迁到艺人后面，
      其他线的相对顺序不变，迁完把 `orderEpoch` 写回存档；
   3. 左栏分类 chips 的次序跟着变成 经纪人 / 艺人 / 路欧桑 / 其他。
   Usage: node cdp_tracker_luousang_order.mjs */
const HOST = 'http://localhost:5173';
const PAGE = `${HOST}/#/tracker`;
const TRIO = ['characters/lu-feng', 'characters/ou-yiqing', 'characters/sang-hebei'];
const LUO = 'other-events/luousang/';
const ARTIST = 'characters/';
const CHIPS = ['经纪人', '艺人', '路欧桑', '其他'];

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

const POOL = `JSON.stringify([...document.querySelectorAll('[data-line-card]')]
  .map((card) => card.getAttribute('data-line-id')))`;

/** 存一份进度（order 可省略，模拟老存档里没有 orderEpoch 的样子）。 */
function seedProgress(order) {
  const data = { version: 1, selectedArtists: TRIO, lines: {}, order, pinned: [] };
  return `localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify(data))}); 'ok'`;
}

/** 第一条路欧桑线是否紧跟在最后一条艺人线后面，且三条路欧桑线连在一起。 */
function checkHoisted(ids, label) {
  const firstLuo = ids.findIndex((id) => id.startsWith(LUO));
  const luoCount = ids.filter((id) => id.startsWith(LUO)).length;
  const lastArtist = ids.reduce((at, id, i) => (id.startsWith(ARTIST) ? i : at), -1);
  console.log(`${label}: firstLuo=${firstLuo} lastArtist=${lastArtist} luo=${luoCount}`);
  if (luoCount === 0) throw new Error(`${label}：池子里一条路欧桑线都没有`);
  if (firstLuo !== lastArtist + 1) {
    throw new Error(`${label}：路欧桑不在艺人事件下面（firstLuo=${firstLuo}, lastArtist=${lastArtist}）`);
  }
  for (let i = 0; i < luoCount; i += 1) {
    if (!ids[firstLuo + i].startsWith(LUO)) throw new Error(`${label}：路欧桑线没连在一起`);
  }
  return { firstLuo, luoCount };
}

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
  const reload = async (wait = 2800) => {
    await send('Page.reload');
    await sleep(wait);
  };

  // 新开的标签页还在首次加载，先等它落地。
  await sleep(2400);

  // --- 1. 默认顺序（没有拖拽记录） ---
  await evaluate(seedProgress([]));
  await reload();
  const defaultIds = JSON.parse(await evaluate(POOL));
  checkHoisted(defaultIds, 'default');

  // --- 2. 老存档：路欧桑线被拖到了最末，还没有 orderEpoch ---
  const luoIds = defaultIds.filter((lineId) => lineId.startsWith(LUO));
  const others = defaultIds.filter((lineId) => !lineId.startsWith(LUO));
  await evaluate(seedProgress([...others, ...luoIds]));
  await reload();
  const migrated = JSON.parse(await evaluate(POOL));
  const { firstLuo, luoCount } = checkHoisted(migrated, 'migrated');
  if (migrated[migrated.length - 1].startsWith(LUO)) {
    throw new Error('迁移后路欧桑线还压在池子最末');
  }
  // 其他线之间的相对顺序不能被动过。
  const strip = (ids) => ids.filter((lineId) => !lineId.startsWith(LUO));
  if (strip(migrated).join('|') !== strip(defaultIds).join('|')) {
    throw new Error('迁移把其他任务线的顺序也改了');
  }
  if (migrated.length !== defaultIds.length) throw new Error('迁移后线数变了');
  console.log(`migrated block: ${firstLuo}..${firstLuo + luoCount - 1} of ${migrated.length}`);

  // 迁移结果要写回存档，不然每次打开都再算一遍。
  const epoch = await evaluate(`JSON.parse(localStorage.getItem('guide.progress.v1')).orderEpoch ?? null`);
  if (epoch !== 2) throw new Error(`存档没写入新的 orderEpoch：${epoch}`);
  const storedOrder = await evaluate(`JSON.parse(localStorage.getItem('guide.progress.v1')).order`);
  const storedFirstLuo = storedOrder.findIndex((lineId) => lineId.startsWith(LUO));
  if (storedFirstLuo !== storedOrder.reduce((at, lineId, i) => (lineId.startsWith(ARTIST) ? i : at), -1) + 1) {
    throw new Error('存档里的顺序没跟着迁移');
  }
  console.log('saved order migrated, epoch:', epoch);

  // --- 3. 左栏分类 chips 的次序 ---
  const toggle = await evaluate(`document.querySelector('[data-batch-toggle]') ? 'ok' : ''`);
  if (!toggle) throw new Error('找不到分类批量操作的开关');
  await evaluate(`document.querySelector('[data-batch-toggle]').click(); 'ok'`);
  await sleep(500);
  const chips = JSON.parse(await evaluate(`JSON.stringify(
    [...document.querySelectorAll('[data-chip-key]')].map((chip) => chip.querySelector('span')?.textContent?.trim() ?? '')
  )`));
  console.log('chips:', JSON.stringify(chips));
  const got = chips.filter((label) => CHIPS.includes(label));
  if (got.join('|') !== CHIPS.join('|')) throw new Error(`chips 顺序不对：${JSON.stringify(got)}`);

  console.log('ALL_CHECKS_PASSED');
  await jsonPut(`http://127.0.0.1:9339/json/close/${target.id}`);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
