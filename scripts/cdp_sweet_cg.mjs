import http from 'node:http';
import fs from 'node:fs';

/* 甜蜜乐章 CG 图鉴回归：三个页签与 #/cg 路由、按人物分组的侧栏（主角杜云芊
   头像不与卫亚撞图）、空清单时的骨架与提示、只有编号（无名称 / 获得条件 /
   攻略跳转 / 存档面板）、收集进度写 sweet.cg.v1 且不动 guide.cg.v1。

   仓库里的 cg.json 目前是空清单，所以脚本用第二段「假数据 + 覆盖 fetch」的
   tab 验证卡片、勾选、灯箱、撤销等真实交互；假数据不入库、不改页面代码。

   Usage: node scripts/cdp_sweet_cg.mjs [shot-prefix.png]
   前置：dev server 5173 + Chrome 调试端口 9339。 */

const [, , shot = ''] = process.argv;
const BASE = 'http://localhost:5173';
const SWEET = `${BASE}/sweet.html`;
const CG_JSON = new URL('../public/data/sweet/cg.json', import.meta.url);
const real = JSON.parse(fs.readFileSync(CG_JSON, 'utf8'));

const FIXTURE = {
  ...real,
  meta: { itemCount: 3, groupCount: real.groups.length, missingImageCount: 0 },
  items: [
    {
      id: 'protagonist-1', groupId: 'protagonist', order: 1, code: '1',
      name: '', condition: '', image: 'images/sweet/protagonist-logo.png',
      width: 0, height: 0,
    },
    {
      id: 'protagonist-2', groupId: 'protagonist', order: 2, code: '2',
      name: '', condition: '', image: 'images/sweet/wei-ya-logo.png',
      width: 0, height: 0,
    },
    {
      id: 'danisi-10', groupId: 'danisi', order: 3, code: '10',
      name: '', condition: '', image: 'images/sweet/danisi-logo.png',
      width: 0, height: 0,
    },
  ],
};

const FETCH_HOOK = `(() => {
  const fixture = ${JSON.stringify(FIXTURE)};
  const original = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('data/sweet/cg.json') !== -1) {
      return Promise.resolve(new Response(JSON.stringify(fixture), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return original.apply(this, arguments);
  };
})()`;

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

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(url, { onNewDocument } = {}) {
  // 先开 about:blank 再导航：如果创建 tab 时直接带上目标地址，后面那次
  // Page.navigate 只是同 URL 的 fragment 跳转，addScriptToEvaluateOnNewDocument
  // 不会重新执行，假数据就注不进去。
  const target = await jsonPut(
    `http://127.0.0.1:9339/json/new?${encodeURIComponent('about:blank')}`,
  );
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  if (onNewDocument) {
    await send('Page.addScriptToEvaluateOnNewDocument', { source: onNewDocument });
  }
  await send('Page.navigate', { url });
  await sleep(2300);
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
    });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };
  const screenshot = async (path) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path, Buffer.from(res.data, 'base64'));
    console.log('wrote', path);
  };
  return { send, evaluate, screenshot, ws };
}

async function main() {
  // ---------- 第一段：仓库真实数据（空清单）下的框架 ----------
  const shell = await connect(SWEET);
  const { evaluate, screenshot } = shell;
  await evaluate(`(() => {
    localStorage.removeItem('sweet.cg.v1');
    // 早期版本曾把甜站样例 id 误写进主站键；只剔除这几个样例，
    // 玩家真实的主站收集状态一条都不动，保证下面的隔离断言有干净基线。
    const raw = localStorage.getItem('guide.cg.v1');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const before = parsed.collected || [];
        const kept = before.filter(
          (id) => !['protagonist-1', 'protagonist-2', 'danisi-10'].includes(id),
        );
        if (kept.length !== before.length) {
          localStorage.setItem('guide.cg.v1', JSON.stringify({ ...parsed, collected: kept }));
        }
      } catch { /* 手改坏的主站存档交给页面自己 sanitise */ }
    }
    return 1;
  })()`);
  const mainKeyBefore = await evaluate(`localStorage.getItem('guide.cg.v1')`);

  const tabs = await evaluate(
    `[...document.querySelectorAll('[role="tab"]')].map(t => ({ label: t.textContent.trim(), key: t.dataset.tab || '' }))`,
  );
  check('甜站有三个页签：攻略 / 事件追踪 / CG 图鉴',
    tabs.length === 3 && tabs[0].label === '攻略' && tabs[1].label === '事件追踪' &&
    tabs[2].label === 'CG 图鉴' && tabs[1].key === 'tracker' && tabs[2].key === 'cg',
    JSON.stringify(tabs));

  await evaluate(`document.querySelector('[data-tab="cg"]').click(); 1`);
  await sleep(900);
  const opened = await evaluate(`({
    hash: location.hash,
    app: !!document.querySelector('[data-cg-app]'),
    title: document.querySelector('[data-cg-app] h1')?.textContent?.trim() ?? '',
    meta: document.querySelector('[data-cg-app] h1')?.nextElementSibling?.textContent?.trim() ?? '',
  })`);
  check('点 CG 图鉴页签写入 #/cg 并打开整页图鉴',
    opened.hash === '#/cg' && opened.app && opened.title === 'CG 图鉴', JSON.stringify(opened));
  check('空清单顶栏写明 9 个分组且提示图片陆续导入',
    opened.meta.includes('共 0 张') && opened.meta.includes('9 个分组') &&
    opened.meta.includes('图片陆续导入中') && !opened.meta.includes('站点未提供图片'),
    opened.meta);

  const groups = await evaluate(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      all: [...app.querySelectorAll('[data-cg-group]')].map(b => ({
        id: b.dataset.cgGroupId || 'all',
        label: b.textContent.trim(),
      })),
      protagonistAvatar: app.querySelector('[data-cg-group-id="protagonist"] img')?.getAttribute('src') ?? '',
      aggregateIcon: !!app.querySelector('[data-avatar-aggregate]'),
    };
  })()`);
  const expectedNames = ['全部', ...real.groups.map((g) => g.name)];
  check('侧栏＝「全部」+ 9 个人物分组，顺序与 cg.json 一致',
    groups.all.length === 10 && groups.all[1].id === 'protagonist' &&
    groups.all.map((g) => g.id).slice(1).join(',') === real.groups.map((g) => g.id).join(',') &&
    expectedNames.every((name) => groups.all.some((g) => g.label.includes(name))),
    JSON.stringify(groups.all.map((g) => g.id)));
  check('主角分组用杜云芊头像，不是卫亚那张',
    groups.protagonistAvatar.includes('images/sweet/protagonist-logo.png') &&
    !groups.protagonistAvatar.includes('wei-ya'), groups.protagonistAvatar);
  check('「全部」用汇总图标而不是硬取一个头像', groups.aggregateIcon, String(groups.aggregateIcon));

  const emptyState = await evaluate(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      text: app.querySelector('[data-cg-panel] p')?.textContent?.trim() ?? '',
      cards: app.querySelectorAll('[data-cg-card]').length,
      guideLinks: app.querySelectorAll('[data-cg-guide-link]').length,
      archive: app.querySelectorAll('[data-cg-archive]').length,
      archiveModal: app.querySelectorAll('[data-cg-archive-modal]').length,
      collectDisabled: app.querySelector('[data-cg-collect-all]')?.disabled ?? null,
      clearDisabled: app.querySelector('[data-cg-clear]')?.disabled ?? null,
      sizeButtons: app.querySelectorAll('[data-cg-size-btn]').length,
    };
  })()`);
  check('空分组给出「图片导入后自动出现」的提示',
    emptyState.text.includes('还没有 CG') && emptyState.text.includes('重新生成'), emptyState.text);
  check('空清单不渲染卡片 / 攻略跳转 / 存档面板',
    emptyState.cards === 0 && emptyState.guideLinks === 0 &&
    emptyState.archive === 0 && emptyState.archiveModal === 0, JSON.stringify(emptyState));
  check('没内容时「全部收集」「清除已收集」都禁用',
    emptyState.collectDisabled === true && emptyState.clearDisabled === true,
    JSON.stringify(emptyState));
  check('大 / 中 / 小三档卡片尺寸按钮齐全', emptyState.sizeButtons === 3,
    String(emptyState.sizeButtons));

  if (shot) await screenshot(shot.replace(/\.png$/, '') + '-shell.png');

  await evaluate(`document.querySelector('[data-cg-group-id="protagonist"]').click(); 1`);
  await sleep(400);
  const groupHash = await evaluate(`location.hash`);
  check('点人物分组写进 #/cg/group/<id>',
    groupHash === '#/cg/group/protagonist', groupHash);

  await shell.send('Page.navigate', { url: `${SWEET}#/cg/group/protagonist` });
  await sleep(1400);
  const restored = await evaluate(`(() => {
    const b = document.querySelector('[data-cg-group-id="protagonist"]');
    return { active: b?.getAttribute('aria-pressed'), title: document.querySelector('[data-cg-panel] h2')?.textContent?.trim() };
  })()`);
  check('刷新后仍停在同一个人物分组',
    restored.active === 'true' && restored.title === '杜云芊', JSON.stringify(restored));

  await evaluate(`document.querySelector('[data-cg-filter]').click(); 1`);
  await sleep(300);
  const filtered = await evaluate(`({
    label: document.querySelector('[data-cg-filter]')?.textContent?.trim(),
    text: document.querySelector('[data-cg-panel] p')?.textContent?.trim() ?? '',
  })`);
  check('「只看未收集」切换成「显示全部」并给出收集完的提示',
    filtered.label === '显示全部' && filtered.text.includes('全部收集完'), JSON.stringify(filtered));

  await evaluate(`(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find(x => x.textContent.trim() === '攻略');
    if (t) t.click();
    return 1;
  })()`);
  await sleep(700);
  const closed = await evaluate(`({ hash: location.hash, app: !!document.querySelector('[data-cg-app]') })`);
  check('点攻略页签退出图鉴', closed.app === false && closed.hash !== '#/cg',
    JSON.stringify(closed));
  check('空清单页没有动原站的 CG 收集键',
    (await evaluate(`localStorage.getItem('guide.cg.v1')`)) === mainKeyBefore,
    String(mainKeyBefore));
  shell.ws.close();

  // ---------- 第二段：注入 3 张假 CG，验证真实交互 ----------
  const tab = await connect(`${SWEET}#/cg`, { onNewDocument: FETCH_HOOK });
  const { evaluate: ev, screenshot: shotFixture } = tab;
  await ev(`(() => { localStorage.removeItem('sweet.cg.v1'); return 1; })()`);
  const probe = await ev(
    `fetch('/data/sweet/cg.json').then(r => r.json()).then(d => d.items.length)`,
  );
  check('假数据注入生效（3 张样例 CG）', probe === 3, String(probe));

  const cards = await ev(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      count: app.querySelectorAll('[data-cg-card]').length,
      ids: [...app.querySelectorAll('[data-cg-card]')].map(c => c.dataset.cgId),
      codes: [...app.querySelectorAll('[data-cg-card]')].map(c => c.querySelector('[data-cg-code]')?.textContent?.trim()),
      names: app.querySelectorAll('[data-cg-name]').length,
      guideLinks: app.querySelectorAll('[data-cg-guide-link]').length,
      progress: app.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    };
  })()`);
  check('假数据渲染 3 张卡片，编号按 1 / 2 / 10 排列',
    cards.count === 3 && cards.ids.join(',') === 'protagonist-1,protagonist-2,danisi-10' &&
    cards.codes.join(',') === '1,2,10', JSON.stringify(cards));
  check('只有编号：卡片不显示名称、不显示攻略入口',
    cards.names === 0 && cards.guideLinks === 0, JSON.stringify(cards));
  check('顶栏进度从 0 / 3 起算', cards.progress.includes('0 / 3'), cards.progress);

  await ev(`document.querySelector('[data-cg-card] [data-cg-toggle]').click(); 1`);
  await sleep(350);
  const collected = await ev(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      sweet: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null'),
      main: localStorage.getItem('guide.cg.v1'),
      progress: app.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
      protagonist: app.querySelector('[data-cg-group-id="protagonist"]')?.textContent?.trim(),
      danisi: app.querySelector('[data-cg-group-id="danisi"]')?.textContent?.trim(),
      collected: app.querySelectorAll('[data-cg-card][data-cg-collected="true"]').length,
    };
  })()`);
  check('勾选只写 sweet.cg.v1',
    collected.sweet?.version === 1 && collected.sweet.collected.length === 1 &&
    collected.sweet.collected[0] === 'protagonist-1', JSON.stringify(collected.sweet));
  check('原站 guide.cg.v1 完全没被碰', collected.main === mainKeyBefore,
    String(collected.main));
  check('进度与分组计数同步（主角 1/2、丹尼斯 0/1）',
    collected.progress.includes('1 / 3') && collected.collected === 1 &&
    collected.protagonist.includes('1/2') && collected.danisi.includes('0/1'),
    JSON.stringify(collected));

  await ev(`document.querySelector('[data-cg-filter]').click(); 1`);
  await sleep(300);
  const missingOnly = await ev(`document.querySelectorAll('[data-cg-card]').length`);
  check('「只看未收集」只留 2 张', missingOnly === 2, String(missingOnly));
  await ev(`document.querySelector('[data-cg-filter]').click(); 1`);
  await sleep(300);

  await ev(`document.querySelector('[data-cg-collect-all]').click(); 1`);
  await sleep(350);
  const collectAll = await ev(`(() => ({
    progress: document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
    raw: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null').collected,
  }))()`);
  check('「全部收集」补齐剩余 2 张并弹出撤销条',
    collectAll.progress.includes('3 / 3') && collectAll.toast && collectAll.raw.length === 3,
    JSON.stringify(collectAll));
  await ev(`document.querySelector('[data-cg-collect-undo]').click(); 1`);
  await sleep(300);
  const undo = await ev(`document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? ''`);
  check('撤销「全部收集」回到 1 / 3', undo.includes('1 / 3'), undo);

  if (shot) await shotFixture(shot.replace(/\.png$/, '') + '-fixture.png');

  await ev(`document.querySelector('[data-cg-card] [data-cg-open]').click(); 1`);
  await sleep(400);
  const lightbox = await ev(`(() => {
    const box = document.querySelector('[data-cg-lightbox]');
    return {
      open: !!box,
      title: box?.querySelector('[data-cg-lightbox-title]')?.textContent?.trim() ?? '',
      condition: box?.querySelectorAll('[data-cg-lightbox-condition]').length ?? -1,
      guide: box?.querySelectorAll('[data-cg-lightbox-guide]').length ?? -1,
      image: !!box?.querySelector('[data-cg-lightbox-image]'),
      position: box?.querySelector('[data-cg-lightbox-position]')?.textContent?.trim() ?? '',
    };
  })()`);
  check('点图片开灯箱，标题就是编号',
    lightbox.open && lightbox.title === '1' && lightbox.image, JSON.stringify(lightbox));
  check('灯箱没有「获得条件」与「看攻略」',
    lightbox.condition === 0 && lightbox.guide === 0, JSON.stringify(lightbox));

  await ev(`document.querySelector('[data-cg-lightbox-close]').click(); 1`);
  await sleep(300);
  const boxClosed = await ev(`!!document.querySelector('[data-cg-lightbox]')`);
  check('灯箱可关闭', boxClosed === false, String(boxClosed));

  await ev(`document.querySelector('[data-cg-clear]').click(); 1`);
  await sleep(250);
  const clearModal = await ev(`!!document.querySelector('[data-cg-clear-modal]')`);
  check('「清除已收集」先弹确认框', clearModal === true, String(clearModal));
  await ev(`document.querySelector('[data-cg-clear-confirm]').click(); 1`);
  await sleep(300);
  const cleared = await ev(`(() => ({
    progress: document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    raw: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null').collected,
    toast: !!document.querySelector('[data-cg-clear-undo-toast]'),
  }))()`);
  check('确认清除后归零且能撤销',
    cleared.progress.includes('0 / 3') && cleared.raw.length === 0 && cleared.toast,
    JSON.stringify(cleared));
  await ev(`document.querySelector('[data-cg-clear-undo]').click(); 1`);
  await sleep(300);
  const undone = await ev(`document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? ''`);
  check('撤销清除回到 1 / 3', undone.includes('1 / 3'), undone);

  await ev(`document.querySelector('[data-cg-group-id="danisi"]').click(); 1`);
  await sleep(350);
  const danisi = await ev(`(() => ({
    hash: location.hash,
    cards: document.querySelectorAll('[data-cg-card]').length,
    codes: [...document.querySelectorAll('[data-cg-code]')].map(c => c.textContent.trim()),
  }))()`);
  check('切到丹尼斯分组只剩编号 10 那张',
    danisi.hash === '#/cg/group/danisi' && danisi.cards === 1 && danisi.codes[0] === '10',
    JSON.stringify(danisi));

  const finalKeys = await ev(`({
    sweet: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null'),
    main: localStorage.getItem('guide.cg.v1'),
  })`);
  check('全程只写甜站键，原站 CG 进度一字未动',
    finalKeys.main === mainKeyBefore &&
    finalKeys.sweet.collected.every((id) => id.startsWith('protagonist-') || id.startsWith('danisi-')),
    JSON.stringify(finalKeys));
  tab.ws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) console.log('failed:', failed.map((r) => r.name).join(' | '));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
