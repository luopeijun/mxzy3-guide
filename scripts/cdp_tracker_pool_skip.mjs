import http from 'node:http';

/* 路欧桑三人页面的「只读章节」守卫：
   - 路风 / 桑禾蓓的「事件」整节、欧怡青的「路欧恋」不进事件池；
   - 桑禾蓓「与主角的感情」照常进池（她的池子还剩 3 条线，id 序号不因删线前移）；
   - 路欧桑分支节点照旧进池 —— 这三条感情线的追踪入口在那里，一处都不少；
   - 攻略页照常能读到被挡掉的章节（只是不进池，不是删内容）。
   Usage: node cdp_tracker_pool_skip.mjs */
const url = 'http://localhost:5173/#/tracker';
const HOST = 'http://localhost:5173';
const TRIO = ['characters/lu-feng', 'characters/sang-hebei', 'characters/ou-yiqing'];

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

const progress = (artists) =>
  `localStorage.setItem('guide.progress.v1', ${JSON.stringify(
    JSON.stringify({ version: 1, selectedArtists: artists, lines: {}, order: [], pinned: [] }),
  )}); 1`;

const SNAPSHOT = `(() => {
  const cards = [...document.querySelectorAll('[data-active-pool] [data-line-card]')];
  return JSON.stringify(cards.map((c) => ({
    id: c.getAttribute('data-line-id'),
    name: c.querySelector('[data-line-name]')?.textContent?.trim() ?? '',
  })));
})()`;

const names = (rows, nodeId) =>
  rows.filter((r) => r.id.startsWith(`${nodeId}::`)).map((r) => r.name);

const ids = (rows, nodeId) => rows.filter((r) => r.id.startsWith(`${nodeId}::`)).map((r) => r.id);

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
  await sleep(3200);
  const evaluate = async (expression) => {
    const { result } = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.value;
  };

  await evaluate(progress(TRIO));
  await send('Page.reload');
  await sleep(3200);

  const rows = JSON.parse(await evaluate(SNAPSHOT));
  const sang = names(rows, 'characters/sang-hebei');
  const lu = names(rows, 'characters/lu-feng');
  const ou = names(rows, 'characters/ou-yiqing');
  console.log('SANG', JSON.stringify(sang));
  console.log('LU', JSON.stringify(lu));
  console.log('OU', JSON.stringify(ou));

  const fail = (msg) => {
    throw new Error(msg);
  };

  // 1. 桑禾蓓：情况1~5 不进池，「与主角的感情」留着。
  if (sang.some((n) => n.startsWith('情况'))) fail('桑禾蓓的情况分支还在池子里');
  if (!sang.some((n) => n === '达成结局条件')) fail('桑禾蓓「与主角的感情」被误删');
  if (!['签约方法', '加入后续'].every((n) => sang.includes(n))) fail('桑禾蓓的个人剧情线丢了');

  // 2. 路风：整个「事件」节都不进池，只留基础信息里的两条。
  if (lu.some((n) => n.startsWith('与桑禾蓓的感情') || n.startsWith('与欧怡青的感情'))) {
    fail('路风的感情分支还在池子里');
  }
  if (lu.length !== 2) fail(`路风池子里应是 2 条线，实际 ${lu.length}`);

  // 3. 欧怡青：只去掉「路欧恋」，其余照常。
  if (ou.includes('路欧恋')) fail('欧怡青的路欧恋还在池子里');
  for (const keep of ['与纪翔的友谊', '告别', '与黎华的事件']) {
    if (!ou.includes(keep)) fail(`欧怡青的「${keep}」被误删`);
  }
  if (!ou.some((n) => n.startsWith('与主角的感情'))) fail('欧怡青「与主角的感情」被误删');

  // 4. 删线不能让后面的线 id 序号前移（老存档按 id 找线）。
  const sangIds = ids(rows, 'characters/sang-hebei');
  if (!sangIds.includes('characters/sang-hebei::7::达成结局条件')) {
    fail(`桑禾蓓「达成结局条件」的序号变了：${JSON.stringify(sangIds)}`);
  }

  // 5. 追踪入口在路欧桑分支，一个都不能少。
  const branches = rows.filter((r) => r.id.startsWith('other-events/luousang/')).map((r) => r.id);
  console.log('BRANCHES', JSON.stringify(branches));
  for (const want of [
    'other-events/luousang/lufeng-sanghebei',
    'other-events/luousang/lufeng-ouyiqing',
  ]) {
    if (!branches.some((b) => b.startsWith(`${want}::`))) fail(`路欧桑分支 ${want} 没进池`);
  }

  // 6. 攻略页仍然能读到被挡掉的章节。
  const pages = [
    ['characters/sang-hebei', ['情况1：', '情况5：', '达成结局条件']],
    ['characters/lu-feng', ['与桑禾蓓的感情', '与欧怡青的感情']],
    ['characters/ou-yiqing', ['路欧恋', '与黎华的事件']],
  ];
  for (const [node, wants] of pages) {
    await evaluate(`location.hash = '#/guide/${node}'; 'ok'`);
    await sleep(1500);
    const text = await evaluate(`document.querySelector('main')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
    for (const want of wants) {
      if (!text.includes(want)) fail(`攻略页 ${node} 读不到「${want}」`);
    }
    console.log(`PAGE ${node} OK`);
  }

  console.log('ALL_CHECKS_PASSED');
  await jsonPut(`http://127.0.0.1:9339/json/close/${target.id}`);
  ws.close();
  process.exit(0);
}

main().catch((e) => {
  console.error('CDP error:', e.message);
  process.exit(1);
});
