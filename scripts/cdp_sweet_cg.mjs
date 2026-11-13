import http from 'node:http';
import fs from 'node:fs';

/* 甜蜜乐章 CG 图鉴回归：三个页签与 #/cg 路由、按人物分组的侧栏（主角杜云芊
   头像不与卫亚撞图）、真实已导入数据下的顶栏计数（83 张唯一收集 / 9 个分组）、
   共用 CG 在 DOM 与收集态上「只此一张」（丹尼斯 / 史蒂芬 的 561-1）、收集进度
   写 sweet.cg.v1 且不动 guide.cg.v1。

   第一段用仓库真实 cg.json（已导入 83 张唯一、9 组、1 张共用）验证框架与共用
   去重；第二段用「假数据 + 覆盖 fetch」验证卡片、勾选、共用 CG 只收集一次、
   灯箱、撤销等真实交互。假数据不入库、不改页面代码。

   Usage: node scripts/cdp_sweet_cg.mjs [shot-prefix.png]
   前置：dev server 5173 + Chrome 调试端口 9339。 */

const [, , shot = ''] = process.argv;
const BASE = 'http://localhost:5173';
const SWEET = `${BASE}/sweet.html`;
const CG_JSON = new URL('../public/data/sweet/cg.json', import.meta.url);
const real = JSON.parse(fs.readFileSync(CG_JSON, 'utf8'));

// 真实数据里的共用 CG：两条条目共享同一个 collectionId（落在 _shared/）。
const realShared = real.items.filter((it) => it.collectionId?.startsWith('shared-'));
const SHARED_COLL = realShared.length ? realShared[0].collectionId : null;

// 第二段用的假数据：两张丹尼斯 / 史蒂芬 共用一张（collectionId 相同），验证
// 「只收集一次、两边一起亮」。meta.itemCount 是「唯一可收集张数」，共享只算一次。
const FIXTURE = {
  ...real,
  meta: { itemCount: 3, groupCount: real.groups.length, missingImageCount: 0 },
  items: [
    {
      id: 'protagonist-1', groupId: 'protagonist', order: 1, code: 'CG 01',
      name: '', condition: '', image: 'images/sweet/protagonist-logo.png',
      width: 0, height: 0,
    },
    {
      id: 'protagonist-2', groupId: 'protagonist', order: 2, code: 'CG 02',
      name: '', condition: '', image: 'images/sweet/protagonist-logo.png',
      width: 0, height: 0,
    },
    {
      id: 'danisi-2', groupId: 'danisi', order: 2, code: 'CG 02',
      name: '', condition: '', image: 'images/sweet/danisi-logo.png',
      width: 0, height: 0, collectionId: 'shared-test',
    },
    {
      id: 'shi-difen-2', groupId: 'shi-difen', order: 2, code: 'CG 02',
      name: '', condition: '', image: 'images/sweet/shi-difen-logo.png',
      width: 0, height: 0, collectionId: 'shared-test',
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
  // ---------- 第一段：仓库真实数据（已导入 83 张唯一 / 9 组 / 1 张共用）----------
  const shell = await connect(SWEET);
  const { evaluate, screenshot } = shell;
  await evaluate(`(() => { localStorage.removeItem('sweet.cg.v1'); return 1; })()`);
  // 第一段不写主站键，仅读取；用基线比对保证隔离断言成立。
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
  check('顶栏写明真实张数（共 83 张 · 9 个分组），不再提示「陆续导入」',
    opened.meta.includes(`共 ${real.meta.itemCount} 张`) &&
    opened.meta.includes(`${real.meta.groupCount} 个分组`) &&
    !opened.meta.includes('图片陆续导入中') && !opened.meta.includes('站点未提供图片'),
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
      allTotal: app.querySelector('[data-cg-group-id="all"]')?.textContent?.trim() ?? '',
      sharedImgs: app.querySelectorAll('[data-cg-card] img[src*="_shared/"]').length,
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
  const allTotalMatch = groups.allTotal.replace(/\s/g, '').match(/(\d+)\/(\d+)/);
  check('「全部」计数分母 = 唯一可收集张数（共享只算一次）',
    !!allTotalMatch && Number(allTotalMatch[2]) === real.meta.itemCount,
    groups.allTotal);
  // 默认「全部」只渲染前 60 张，共用 CG 的史蒂芬那条在后面几页；先「加载更多」
  // 把 84 张全铺开，两条共用条目才都在 DOM 里，便于验证去重与跨卡点亮。
  await evaluate(`(() => { const b = document.querySelector('[data-cg-load-more]'); if (b) b.click(); return 1; })()`);
  await sleep(700);
  const sharedDom = await evaluate(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      sharedImgs: app.querySelectorAll('[data-cg-card] img[src*="_shared/"]').length,
      hasDanisi: !!app.querySelector('[data-cg-card][data-cg-id="danisi-2"]'),
      hasShi: !!app.querySelector('[data-cg-card][data-cg-id="shi-difen-2"]'),
    };
  })()`);
  check('共用 CG 在画廊里只占一张图（两条条目指向同一张 _shared webp）',
    !!SHARED_COLL && sharedDom.sharedImgs === 2 && sharedDom.hasDanisi && sharedDom.hasShi,
    JSON.stringify({ shared: SHARED_COLL, ...sharedDom }));

  // 「全部」视图下两条共用条目都可见：点丹尼斯那张，史蒂芬那张也应一起点亮，
  // 且只落一条收集记录（共享 collectionId）。随后清掉，避免污染后面的断言。
  if (SHARED_COLL) {
    const sharedToggle = await evaluate(`(() => {
      const card = document.querySelector('[data-cg-card][data-cg-id="danisi-2"]');
      if (!card) return { found: false };
      card.querySelector('[data-cg-toggle]').click();
      return { found: true };
    })()`);
    await sleep(350);
    const sharedState = await evaluate(`(() => {
      const app = document.querySelector('[data-cg-app]');
      const danisi = app.querySelector('[data-cg-card][data-cg-id="danisi-2"]');
      const shi = app.querySelector('[data-cg-card][data-cg-id="shi-difen-2"]');
      const raw = JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null');
      return {
        danisi: danisi?.getAttribute('data-cg-collected'),
        shi: shi?.getAttribute('data-cg-collected'),
        raw: raw ? raw.collected : null,
      };
    })()`);
    check('共用 CG 点丹尼斯那张，史蒂芬那张也点亮（收集只一次）',
      sharedToggle.found && sharedState.danisi === 'true' && sharedState.shi === 'true' &&
      sharedState.raw.length === 1 && sharedState.raw[0] === SHARED_COLL,
      JSON.stringify(sharedState));
    await evaluate(`(() => { localStorage.removeItem('sweet.cg.v1'); return 1; })()`);
  }

  if (shot) await screenshot(shot.replace(/\.png$/, '') + '-shell.png');

  await evaluate(`document.querySelector('[data-cg-group-id="protagonist"]').click(); 1`);
  await sleep(500);
  const protagonist = await evaluate(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      hash: location.hash,
      cards: app.querySelectorAll('[data-cg-card]').length,
      firstCode: app.querySelector('[data-cg-code]')?.textContent?.trim() ?? '',
      title: app.querySelector('[data-cg-panel] h2')?.textContent?.trim() ?? '',
    };
  })()`);
  check('点人物分组写进 #/cg/group/<id> 并展示该人物全部 CG',
    protagonist.hash === '#/cg/group/protagonist' && protagonist.cards === 31 &&
    protagonist.firstCode === 'CG 01' && protagonist.title === '杜云芊',
    JSON.stringify(protagonist));

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
  })`);
  check('「只看未收集」切换成「显示全部」',
    filtered.label === '显示全部', JSON.stringify(filtered));

  await evaluate(`(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find(x => x.textContent.trim() === '攻略');
    if (t) t.click();
    return 1;
  })()`);
  await sleep(700);
  const closed = await evaluate(`({ hash: location.hash, app: !!document.querySelector('[data-cg-app]') })`);
  check('点攻略页签退出图鉴', closed.app === false && closed.hash !== '#/cg',
    JSON.stringify(closed));
  check('第一段没动原站的 CG 收集键',
    (await evaluate(`localStorage.getItem('guide.cg.v1')`)) === mainKeyBefore,
    String(mainKeyBefore));
  shell.ws.close();

  // ---------- 第二段：注入 4 张假 CG（含 1 对共用），验证真实交互 ----------
  const tab = await connect(`${SWEET}#/cg`, { onNewDocument: FETCH_HOOK });
  const { evaluate: ev, screenshot: shotFixture } = tab;
  await ev(`(() => { localStorage.removeItem('sweet.cg.v1'); return 1; })()`);
  const probe = await ev(
    `fetch('/data/sweet/cg.json').then(r => r.json()).then(d => d.items.length)`,
  );
  check('假数据注入生效（4 张样例 CG，含一对共用）', probe === 4, String(probe));

  const cards = await ev(`(() => {
    const app = document.querySelector('[data-cg-app]');
    return {
      count: app.querySelectorAll('[data-cg-card]').length,
      ids: [...app.querySelectorAll('[data-cg-card]')].map(c => c.dataset.cgId),
      codes: [...app.querySelectorAll('[data-cg-code]')].map(c => c.textContent.trim()),
      names: app.querySelectorAll('[data-cg-name]').length,
      guideLinks: app.querySelectorAll('[data-cg-guide-link]').length,
      progress: app.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    };
  })()`);
  check('假数据渲染 4 张卡片，编号按 CG 01 / CG 02 / CG 02 / CG 02 排列',
    cards.count === 4 && cards.ids.join(',') === 'protagonist-1,protagonist-2,danisi-2,shi-difen-2' &&
    cards.codes.join(',') === 'CG 01,CG 02,CG 02,CG 02', JSON.stringify(cards));
  check('只有编号：卡片不显示名称、不显示攻略入口',
    cards.names === 0 && cards.guideLinks === 0, JSON.stringify(cards));
  check('顶栏进度从 0 / 3 起算（唯一可收集 3 张）', cards.progress.includes('0 / 3'), cards.progress);

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
  check('「只看未收集」只留 3 张（已收 1 张）', missingOnly === 3, String(missingOnly));
  await ev(`document.querySelector('[data-cg-filter]').click(); 1`);
  await sleep(300);

  // 共用 CG：点丹尼斯那张，史蒂芬那张也点亮，且只落一条收集记录。
  await ev(`document.querySelector('[data-cg-card][data-cg-id="danisi-2"] [data-cg-toggle]').click(); 1`);
  await sleep(350);
  const shared = await ev(`(() => {
    const app = document.querySelector('[data-cg-app]');
    const danisi = app.querySelector('[data-cg-card][data-cg-id="danisi-2"]');
    const shi = app.querySelector('[data-cg-card][data-cg-id="shi-difen-2"]');
    return {
      danisi: danisi?.getAttribute('data-cg-collected'),
      shi: shi?.getAttribute('data-cg-collected'),
      raw: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null').collected,
      progress: app.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    };
  })()`);
  check('共用 CG 只收集一次：点丹尼斯那张，史蒂芬那张也点亮',
    shared.danisi === 'true' && shared.shi === 'true' &&
    shared.raw.length === 2 && shared.raw.includes('shared-test') &&
    shared.progress.includes('2 / 3'), JSON.stringify(shared));

  await ev(`document.querySelector('[data-cg-collect-all]').click(); 1`);
  await sleep(350);
  const collectAll = await ev(`(() => ({
    progress: document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? '',
    toast: !!document.querySelector('[data-cg-collect-undo-toast]'),
    raw: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null').collected,
  }))()`);
  check('「全部收集」补齐剩余 1 张并弹出撤销条',
    collectAll.progress.includes('3 / 3') && collectAll.toast && collectAll.raw.length === 3,
    JSON.stringify(collectAll));
  await ev(`document.querySelector('[data-cg-collect-undo]').click(); 1`);
  await sleep(300);
  const undo = await ev(`document.querySelector('[data-cg-progress]')?.textContent?.trim() ?? ''`);
  check('撤销「全部收集」回到 2 / 3', undo.includes('2 / 3'), undo);

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
    lightbox.open && lightbox.title === 'CG 01' && lightbox.image, JSON.stringify(lightbox));
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
  check('撤销清除回到 2 / 3', undone.includes('2 / 3'), undone);

  await ev(`document.querySelector('[data-cg-group-id="danisi"]').click(); 1`);
  await sleep(350);
  const danisi = await ev(`(() => ({
    hash: location.hash,
    cards: document.querySelectorAll('[data-cg-card]').length,
    codes: [...document.querySelectorAll('[data-cg-code]')].map(c => c.textContent.trim()),
  }))()`);
  check('切到丹尼斯分组只剩编号 2 那张',
    danisi.hash === '#/cg/group/danisi' && danisi.cards === 1 && danisi.codes[0] === 'CG 02',
    JSON.stringify(danisi));

  const finalKeys = await ev(`({
    sweet: JSON.parse(localStorage.getItem('sweet.cg.v1') || 'null'),
    main: localStorage.getItem('guide.cg.v1'),
  })`);
  check('全程只写甜站键，原站 CG 进度一字未动',
    finalKeys.main === mainKeyBefore &&
    (finalKeys.sweet?.collected ?? []).every((id) =>
      id === 'shared-test' || id.startsWith('protagonist-') || id.startsWith('danisi-') ||
      id.startsWith('shi-difen-')),
    JSON.stringify(finalKeys));
  tab.ws.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) console.log('failed:', failed.map((r) => r.name).join(' | '));
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
