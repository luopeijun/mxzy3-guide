import http from 'node:http';
import fs from 'node:fs';

/* 甜蜜乐章事件追踪器回归：两个页签与 #/tracker 路由、主角恒占一个签约位
   （最多 4 人＝主角 + 3 位艺人、不可解约、头像在人名左边）、事件步骤详情
   打开事件即全部展开、线头部「展开全部 / 收起全部」与置顶同一排、事件池
   按甜站类目分组、进度与存档键和明星志愿3 完全隔离、存档面板不带 CG / 六大通告。

   Usage: node scripts/cdp_sweet_tracker.mjs [shot.png]
   前置：dev server 5173 + Chrome 调试端口 9339。 */

const [, , shot = ''] = process.argv;
const BASE = 'http://localhost:5173';
const SWEET = `${BASE}/sweet.html`;

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
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` :: ${detail}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut(`http://127.0.0.1:9339/json/new?${encodeURIComponent(SWEET)}`);
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
  await send('Page.navigate', { url: SWEET });
  await sleep(2500);

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  // 每次从干净存档开始；只清甜站的键，原站进度要留着做隔离对照。
  await evaluate(`(() => {
    localStorage.removeItem('sweet.progress.v1');
    localStorage.removeItem('sweet.progress.backup.v1');
    localStorage.removeItem('sweet.memo.v1');
    return 1;
  })()`);
  await send('Page.reload');
  await sleep(2500);

  // 1. 顶栏页签
  const tabs = await evaluate(
    `[...document.querySelectorAll('[role="tab"]')].map(t => ({ label: t.textContent.trim(), key: t.dataset.tab || '' }))`,
  );
  check('甜站有两个页签：攻略 / 事件追踪',
    tabs.length === 2 && tabs[0].label === '攻略' && tabs[1].label === '事件追踪' && tabs[1].key === 'tracker',
    JSON.stringify(tabs));

  // 2. 进入追踪器（顶栏保持挂载）
  await evaluate(`document.querySelector('[data-tab="tracker"]').click(); 1`);
  await sleep(900);
  const opened = await evaluate(`(() => {
    const app = document.querySelector('[data-tracker-app]');
    return {
      hash: location.hash,
      app: !!app,
      crossLink: !!document.querySelector('[data-game-switch]'),
      brand: getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
      setup: !!document.querySelector('[data-setup-hint]'),
      batch: !!document.querySelector('[data-batch-panel]'),
      memo: !!document.querySelector('[data-memo]'),
      overview: app?.textContent?.includes('进度概览') ?? false,
      archive: !!document.querySelector('[data-transfer-panel]'),
      pool: !!document.querySelector('[data-tracker-app] main'),
    };
  })()`);
  check('点页签写入 #/tracker', opened.hash === '#/tracker', opened.hash);
  check('追踪器 overlay 挂在同一顶栏下', opened.app && opened.crossLink && opened.brand.toLowerCase() === '#c0306f',
    JSON.stringify(opened));
  check('三栏骨架齐全（艺人 / 批量 / 备忘 / 概览 / 存档 / 池）',
    opened.setup && opened.batch && opened.memo && opened.overview && opened.archive && opened.pool,
    JSON.stringify(opened));

  // 3. 主角初始状态
  const initial = await evaluate(`(() => {
    const app = document.querySelector('[data-tracker-app]');
    const save = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    return {
      hint: app.querySelector('[data-setup-hint]')?.textContent?.trim() ?? '',
      portraits: [...app.querySelectorAll('aside img')].map(i => i.getAttribute('src')),
      selected: save.selectedArtists || [],
      released: save.releasedArtists || [],
      lines: app.querySelectorAll('main [data-line-card]').length,
    };
  })()`);
  check('主角默认占一个签约位', initial.selected.length === 1 && initial.selected[0] === 'protagonist',
    JSON.stringify(initial.selected));
  check('折叠行显示主角圆圈头像', initial.portraits.some((src) => src?.includes('protagonist-logo')),
    JSON.stringify(initial.portraits));
  check('折叠行计数是 1/4 位', initial.hint === '1/4 位', initial.hint);
  check('默认池里有非艺人任务线', initial.lines > 0, `lines=${initial.lines}`);

  // 4. 展开艺人选择
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('[data-tracker-app] aside button')]
      .find(x => x.getAttribute('aria-expanded') === 'false');
    if (b) b.click();
    return 1;
  })()`);
  await sleep(400);
  const picker = await evaluate(`(() => {
    const app = document.querySelector('[data-tracker-app]');
    const btns = [...app.querySelectorAll('[data-artist-button]')];
    const p = btns.find(b => b.dataset.protagonist === 'yes');
    return {
      total: btns.length,
      exists: !!p,
      id: p?.dataset.artistId ?? '',
      disabled: p?.disabled ?? false,
      text: p?.textContent?.trim() ?? '',
      badge: !!p?.parentElement?.querySelector('[data-artist-status-toggle]'),
      hintNode: !!app.querySelector('[data-protagonist-hint]'),
      hint: app.querySelector('[data-protagonist-hint]')?.textContent?.trim() ?? '',
      intro: app.querySelector('[data-setup-intro]')?.textContent?.trim() ?? '',
      avatar: p?.querySelector('img')?.getAttribute('src') ?? '',
    };
  })()`);
  check('展开区共 9 项（主角 + 8 位角色）', picker.total === 9, `total=${picker.total}`);
  check('主角按钮锁定、不可解约、显示「固定」',
    picker.exists && picker.id === 'protagonist' && picker.disabled && picker.text.includes('固定') && !picker.badge,
    JSON.stringify(picker));
  check('主角头像在人名左边', picker.avatar.includes('protagonist-logo'), picker.avatar);
  check('主角按钮显示姓名「杜云芊」', picker.text.includes('杜云芊'), picker.text);
  // 主角是杜云芊（甜蜜乐章/2/620-1.bmp），曾误用卫亚的头像：锁死不能与
  // 任何角色头像重复。直接从仓库里比字节，不依赖外部素材目录。
  const imgDir = new URL('../public/images/sweet/', import.meta.url);
  const protagonistPng = fs.readFileSync(new URL('protagonist-logo.png', imgDir));
  const duplicated = fs.readdirSync(imgDir)
    .filter((f) => f.endsWith('-logo.png') && f !== 'protagonist-logo.png')
    .filter((f) => fs.readFileSync(new URL(f, imgDir)).equals(protagonistPng));
  check('主角头像不与任何角色头像重复（杜云芊 ≠ 卫亚）', duplicated.length === 0, duplicated.join(','));
  check('展开区不再显示主角身份说明，选择器说明也不带括号注释',
    !picker.hintNode && picker.hint === '' &&
      !picker.intro.includes('既当经纪人也是艺人') && !picker.intro.includes('既扮演经纪人也是旗下艺人'),
    JSON.stringify({ hintNode: picker.hintNode, hint: picker.hint, intro: picker.intro }));
  check('选择器说明写的是最多 4 位', picker.intro.includes('最多 4 位'), picker.intro);

  // 5. 点主角无效
  await evaluate(`(() => {
    const p = [...document.querySelectorAll('[data-artist-button]')].find(b => b.dataset.protagonist === 'yes');
    if (p) p.click();
    return 1;
  })()`);
  await sleep(300);
  const afterClick = await evaluate(`JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}').selectedArtists || []`);
  check('点主角不会把她移出追踪', afterClick.length === 1 && afterClick[0] === 'protagonist',
    JSON.stringify(afterClick));

  // 6. 选三位 → 满 4；选第四位 → 记为已解约
  const picked = await evaluate(`(() => {
    const btns = [...document.querySelectorAll('[data-artist-button]')]
      .filter(b => !b.disabled && b.dataset.artistState === 'none');
    const ids = btns.slice(0, 4).map(b => b.dataset.artistId);
    for (const aid of ids.slice(0, 3)) {
      const b = document.querySelector('[data-artist-button][data-artist-id="' + aid + '"]');
      if (b) b.click();
    }
    return ids;
  })()`);
  await sleep(500);
  const full = await evaluate(`(() => {
    const app = document.querySelector('[data-tracker-app]');
    const save = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    return {
      hint: app.querySelector('[data-setup-hint]')?.textContent?.trim() ?? '',
      selected: save.selectedArtists || [],
      released: save.releasedArtists || [],
    };
  })()`);
  check('选三位艺人后旗下正好 4 位', full.selected.length === 4 && full.selected[0] === 'protagonist',
    JSON.stringify(full.selected));
  check('满员计数 4/4 位', full.hint === '4/4 位', full.hint);

  await evaluate(`(() => {
    const b = document.querySelector('[data-artist-button][data-artist-id="' + ${JSON.stringify(picked[3])} + '"]');
    if (b) b.click();
    return 1;
  })()`);
  await sleep(450);
  const overflow = await evaluate(`(() => {
    const app = document.querySelector('[data-tracker-app]');
    const save = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    return {
      hint: app.querySelector('[data-setup-hint]')?.textContent?.trim() ?? '',
      notice: app.querySelector('[data-setup-notice]')?.textContent?.trim() ?? '',
      selected: save.selectedArtists || [],
      released: save.releasedArtists || [],
    };
  })()`);
  check('第 5 位自动记为已解约且不挤掉主角',
    overflow.selected.length === 4 && overflow.selected[0] === 'protagonist' && overflow.released.includes(picked[3]),
    JSON.stringify(overflow));
  check('满员提示 +M 且不弹窗', overflow.hint === '4/4 位 +1' && overflow.notice.includes('已加入追踪') && overflow.notice.includes('旗下已满 4 人'),
    `${overflow.hint} / ${overflow.notice}`);

  // 7. 分组 chips：甜站 3 组，没有路欧桑
  await evaluate(`(() => { const b = document.querySelector('[data-batch-toggle]'); if (b) b.click(); return 1; })()`);
  await sleep(350);
  const chips = await evaluate(`(() => {
    const el = document.querySelector('[data-batch-chips]');
    return el ? [...el.querySelectorAll('[data-chip-key]')].map(b => ({ key: b.dataset.chipKey, text: b.textContent.trim() })) : [];
  })()`);
  check('分组 chips 是 全部 / 经纪人 / 艺人 / 支线',
    chips.length === 4 && chips.map((c) => c.key).join(',') === 'all,broker,artist,other',
    JSON.stringify(chips));
  check('甜站没有「路欧桑」分组', !chips.some((c) => c.key === 'luousang' || c.text.includes('路欧桑')),
    JSON.stringify(chips));

  // 8. 事件池按甜站类目出线
  const pool = await evaluate(`(() => {
    const cards = [...document.querySelectorAll('main [data-line-card]')];
    const ids = cards.map(c => c.dataset.lineId || '');
    return {
      count: cards.length,
      artist: ids.filter(x => x.startsWith('sweet-characters/')).length,
      broker: ids.filter(x => x.startsWith('sweet-guide/')).length,
      side: ids.filter(x => x.startsWith('sweet-side/')).length,
      mainPrefix: ids.filter(x => x.startsWith('characters/') || x.startsWith('game-guide/')).length,
    };
  })()`);
  check('池里有已签约角色的任务线', pool.artist > 0, JSON.stringify(pool));
  check('经纪人事件簿 / 支线攻略的线默认进池', pool.broker > 0 && pool.side > 0, JSON.stringify(pool));
  check('池里没有原站节点前缀', pool.mainPrefix === 0, JSON.stringify(pool));

  // 9. 勾选一步 → 只写甜站进度键
  const beforeStep = await evaluate(`(() => ({
    sweet: localStorage.getItem('sweet.progress.v1'),
    main: localStorage.getItem('guide.progress.v1'),
  }))()`);
  // 任务线卡片默认折叠，先展开才渲染步骤行。
  await evaluate(`(() => {
    const card = document.querySelector('main [data-line-card]');
    const expand = card?.querySelector('button[aria-expanded]');
    if (expand && expand.getAttribute('aria-expanded') === 'false') expand.click();
    return !!expand;
  })()`);
  await sleep(300);
  await evaluate(`(() => {
    const b = document.querySelector('main [data-line-card] [data-step-row] button[aria-pressed]');
    if (b) b.click();
    return !!b;
  })()`);
  await sleep(400);
  const afterStep = await evaluate(`(() => {
    const save = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    return {
      lines: Object.keys(save.lines || {}).length,
      done: Object.values(save.lines || {}).reduce((n, s) => n + (s.done?.length || 0), 0),
      main: localStorage.getItem('guide.progress.v1'),
    };
  })()`);
  check('勾选写进 sweet.progress.v1', afterStep.lines > 0 && afterStep.done > 0, JSON.stringify(afterStep));
  check('原站 guide.progress.v1 完全没被碰', afterStep.main === beforeStep.main,
    `before=${String(beforeStep.main)?.length} after=${String(afterStep.main)?.length}`);

  // 9b. 事件线级的「展开全部 / 收起全部」：打开事件后所有步骤详情默认展开，
  // 两个按钮与置顶 / 放弃 / 移出池子同一排；单步箭头仍可单独切。
  await evaluate(`(() => {
    for (const card of [...document.querySelectorAll('main [data-line-card]')].slice(0, 8)) {
      const toggle = card.firstElementChild?.querySelector('button[aria-expanded]');
      if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click();
    }
    return 1;
  })()`);
  await sleep(600);
  const detailSnapshot = () => evaluate(`(() => {
    const card = [...document.querySelectorAll('main [data-line-card]')]
      .find(c => c.querySelector('[data-line-detail-actions]'));
    const arrows = [...(card?.querySelectorAll('[data-step-expand]') ?? [])];
    const boxes = [...(card?.querySelectorAll('[data-step-details]') ?? [])];
    const actions = card?.querySelector('[data-line-detail-actions]');
    const pin = [...(card?.querySelectorAll('button') ?? [])]
      .find(b => /置顶/.test(b.textContent.trim()));
    return {
      hasCard: !!card,
      arrows: arrows.length,
      open: arrows.filter(a => a.getAttribute('aria-expanded') === 'true').length,
      boxes: boxes.length,
      kinds: [...(card?.querySelectorAll('[data-step-detail]') ?? [])].map(d => d.dataset.stepDetailKind),
      text: boxes.map(b => b.textContent.trim()).join(' '),
      expandDisabled: card?.querySelector('[data-line-expand-all]')?.disabled ?? null,
      collapseDisabled: card?.querySelector('[data-line-collapse-all]')?.disabled ?? null,
      sameToolbar: !!actions && !!pin && actions.parentElement === pin.parentElement,
    };
  })()`);
  const initialDetail = await detailSnapshot();
  check('打开事件后所有步骤的详情默认展开',
    initialDetail.hasCard && initialDetail.arrows > 0 &&
    initialDetail.open === initialDetail.arrows && initialDetail.boxes === initialDetail.arrows &&
    initialDetail.expandDisabled === true && initialDetail.collapseDisabled === false,
    JSON.stringify(initialDetail));
  check('展开全部 / 收起全部与置顶、放弃、移出池子同一排',
    initialDetail.sameToolbar, JSON.stringify(initialDetail));
  check('详情含时间 / 概要 / 提示',
    initialDetail.text.includes('时间：') || initialDetail.text.includes('概要：') ||
      initialDetail.text.includes('提示：'),
    initialDetail.text.slice(0, 90));
  check('详情只收 paragraph / note 两种块',
    initialDetail.kinds.length > 0 && initialDetail.kinds.every((k) => k === 'paragraph' || k === 'note'),
    JSON.stringify(initialDetail.kinds));

  await evaluate(`(() => {
    const b = document.querySelector('main [data-line-collapse-all]');
    if (b && !b.disabled) b.click();
    return 1;
  })()`);
  await sleep(350);
  const collapsedAll = await detailSnapshot();
  check('一键收起：这条事件下所有详情都收起',
    collapsedAll.arrows > 0 && collapsedAll.open === 0 && collapsedAll.boxes === 0 &&
    collapsedAll.expandDisabled === false && collapsedAll.collapseDisabled === true,
    JSON.stringify(collapsedAll));

  await evaluate(`(() => {
    const b = document.querySelector('main [data-line-expand-all]');
    if (b && !b.disabled) b.click();
    return 1;
  })()`);
  await sleep(350);
  const expandedAll = await detailSnapshot();
  check('一键展开：所有步骤详情重新展开',
    expandedAll.open === expandedAll.arrows && expandedAll.boxes === expandedAll.arrows &&
    expandedAll.expandDisabled === true && expandedAll.collapseDisabled === false,
    JSON.stringify(expandedAll));

  await evaluate(`(() => {
    const a = document.querySelector('main [data-line-card] [data-step-expand]');
    if (a) a.click();
    return 1;
  })()`);
  await sleep(300);
  const singleClosed = await detailSnapshot();
  check('单步箭头仍可单独收起，其它步骤不受影响',
    singleClosed.open === expandedAll.arrows - 1 && singleClosed.boxes === expandedAll.arrows - 1,
    JSON.stringify(singleClosed));
  await evaluate(`(() => {
    const a = document.querySelector('main [data-line-card] [data-step-expand]');
    if (a) a.click();
    return 1;
  })()`);
  await sleep(300);
  const singleRestored = await detailSnapshot();
  check('再点单步箭头恢复这一步',
    singleRestored.open === expandedAll.arrows && singleRestored.boxes === expandedAll.arrows,
    JSON.stringify(singleRestored));

  // 10. 存档面板只讲进度
  const archiveText = await evaluate(`document.querySelector('[data-transfer-panel]')?.textContent ?? ''`);
  check('存档面板说明只讲事件追踪进度', archiveText.includes('事件追踪进度只保存在本机浏览器'), archiveText.slice(0, 90));
  check('存档面板不提 CG 收藏 / 六大通告', !archiveText.includes('CG 收藏') && !archiveText.includes('六大通告'),
    archiveText.slice(0, 90));

  if (shot) {
    const png = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(png.data, 'base64'));
    console.log('wrote', shot);
  }

  // 11. 手动清空签约名单后刷新，主角仍自动归位
  await evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    s.selectedArtists = [];
    localStorage.setItem('sweet.progress.v1', JSON.stringify(s));
    return 1;
  })()`);
  await send('Page.reload');
  await sleep(2600);
  const relocked = await evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('sweet.progress.v1') || '{}');
    return { selected: s.selectedArtists || [], app: !!document.querySelector('[data-tracker-app]') };
  })()`);
  check('刷新后主角自动回到签约名单', relocked.selected[0] === 'protagonist' && relocked.app,
    JSON.stringify(relocked));

  // 12. 点「攻略」页签关掉追踪器
  await evaluate(`(() => {
    const t = [...document.querySelectorAll('[role="tab"]')].find(x => x.textContent.trim() === '攻略');
    if (t) t.click();
    return 1;
  })()`);
  await sleep(700);
  const closed = await evaluate(`({ hash: location.hash, app: !!document.querySelector('[data-tracker-app]') })`);
  check('点攻略页签关掉追踪器并改写 hash', closed.app === false && closed.hash !== '#/tracker',
    JSON.stringify(closed));

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
