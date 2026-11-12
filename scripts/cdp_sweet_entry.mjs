import http from 'node:http';
import fs from 'node:fs';

/* 双站点入口回归：确认 sweet.html 能独立跑起来、用的是粉色主题令牌、
   目录结构与原攻略一致（3 类 10/8/6 条，第一类叫「经纪人事件簿」）、
   主线攻略正文能渲染（23 张事件卡 + 5 条本页小节）、公司改建攻略能渲染
   （单章 + 9 张事件卡）、国外通告接拍条件渲染成 5 行表格、点角色页能进、
   跨站入口能来回跳；同时确认明星志愿3 那边只是多了一枚跨站胶囊，五个页签不变。

   Usage: node scripts/cdp_sweet_entry.mjs [shot.png]
   前置：dev server 5173 + Chrome 调试端口 9339。 */

const [, , shot = ''] = process.argv;
const BASE = 'http://localhost:5173';
const SWEET = `${BASE}/sweet.html`;
const MAIN = `${BASE}/index.html`;

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
  await new Promise((r) => setTimeout(r, 2500));

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result.value;
  };

  // 1. 站点基本身份
  const head = await evaluate(`(() => ({
    title: document.title,
    game: document.documentElement.dataset.game,
    brand: document.querySelector('header span')?.textContent ?? '',
    brandColor: getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
    canvas: getComputedStyle(document.body).backgroundColor,
  }))()`);
  check('sweet.html 标题是甜蜜乐章', head.title.includes('甜蜜乐章'), head.title);
  check('html 带 data-game="sweet"', head.game === 'sweet', String(head.game));
  check('品牌色令牌是粉色 c0306f', head.brandColor.toLowerCase() === '#c0306f', head.brandColor);

  // 2. 目录结构（按原攻略清单；第一类按用户裁决改叫「经纪人事件簿」，不再列角色介绍）
  const tree = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-node-id]')];
    const ids = rows.map((n) => n.dataset.nodeId);
    const count = (prefix) => ids.filter((id) => id.startsWith(prefix)).length;
    return {
      cats: ['sweet-guide', 'sweet-characters', 'sweet-side'].filter((id) => ids.includes(id)),
      total: ids.length,
      guide: count('sweet-guide/'),
      chars: count('sweet-characters/'),
      side: count('sweet-side/'),
      guideTitle: rows.find((n) => n.dataset.nodeId === 'sweet-guide')?.textContent ?? '',
      hasIntro: ids.includes('sweet-guide/intro'),
    };
  })()`);
  check('目录有 3 个类目', tree.cats.length === 3, JSON.stringify(tree.cats));
  check('角色攻略 8 位', tree.chars === 8, `chars=${tree.chars}`);
  check('经纪人事件簿 10 条', tree.guide === 10, `guide=${tree.guide}`);
  check('支线攻略 6 条', tree.side === 6, `side=${tree.side}`);
  check('第一类叫「经纪人事件簿」', tree.guideTitle.includes('经纪人事件簿'), tree.guideTitle.trim().slice(0, 20));
  check('已删掉「角色介绍」', tree.hasIntro === false, `hasIntro=${tree.hasIntro}`);

  // 3. 主线攻略正文：4 章 23 个事件，右侧小节同步 5 条
  if (shot) {
    const home = await send('Page.captureScreenshot', { format: 'png' });
    const homePath = shot.replace(/\.png$/, '-home.png');
    fs.writeFileSync(homePath, Buffer.from(home.data, 'base64'));
    console.log('wrote', homePath);
  }
  await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="sweet-guide/main-story"]');
    const pick = [...row.querySelectorAll('button')].find((b) => b.className.includes('flex-1'));
    pick.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 700));
  const story = await evaluate(`(() => ({
    hash: location.hash,
    title: document.querySelector('main h1')?.textContent?.trim() ?? '',
    subtitle: [...document.querySelectorAll('main p')].map((p) => p.textContent.trim())
      .find((t) => t.startsWith('主线任务')) ?? '',
    cards: document.querySelectorAll('[data-event-label]').length,
    labels: [...document.querySelectorAll('[data-event-label]')].map((el) => el.dataset.eventLabel).slice(0, 3),
    chapters: [...document.querySelectorAll('nav[aria-label="本页小节"] li button')]
      .map((b) => (b.querySelectorAll('span')[1]?.textContent ?? b.textContent).trim()),
    firstCard: document.querySelector('[data-event-label]')?.innerText ?? '',
  }))()`);
  check('点主线攻略写入深链', story.hash === '#/guide/sweet-guide/main-story', story.hash);
  check('正文标题是「主线攻略」', story.title === '主线攻略', story.title);
  check('副标题是「主线任务（落日相关）」', story.subtitle === '主线任务（落日相关）', story.subtitle);
  check('渲染 23 张事件卡', story.cards === 23, `cards=${story.cards}`);
  check('事件编号从 1-1 起', story.labels[0] === '1-1', JSON.stringify(story.labels));
  check(
    '本页小节列出 4 章 + 结局分歧',
    story.chapters.join('/') === '投资/骗局/摩登时代/落日/结局分歧',
    JSON.stringify(story.chapters),
  );
  check(
    '事件卡含时间与概要',
    story.firstCard.includes('时间：第一年五月') && story.firstCard.includes('概要：杜司臣前来拜访'),
    story.firstCard.replace(/\\n+/g, ' ').slice(0, 40),
  );

  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(data, 'base64'));
    console.log('wrote', shot);
  }

  // 4. 公司改建攻略：单章「改建」+ 9 个事件；源文本的细节行是顶格写的
  await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="sweet-guide/company"]');
    const pick = [...row.querySelectorAll('button')].find((b) => b.className.includes('flex-1'));
    pick.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const company = await evaluate(`(() => ({
    hash: location.hash,
    cards: document.querySelectorAll('[data-event-label]').length,
    labels: [...document.querySelectorAll('[data-event-label]')].map((el) => el.dataset.eventLabel),
    chapters: [...document.querySelectorAll('nav[aria-label="本页小节"] li button')]
      .map((b) => (b.querySelectorAll('span')[1]?.textContent ?? b.textContent).trim()),
    firstCard: document.querySelector('[data-event-label]')?.innerText ?? '',
    hasHint: document.body.innerText.includes('公司金钱1500以上才会触发'),
  }))()`);
  check('点公司改建写入深链', company.hash === '#/guide/sweet-guide/company', company.hash);
  check('公司改建渲染 9 张事件卡', company.cards === 9, `cards=${company.cards}`);
  check(
    '事件编号是 4-1 ~ 4-9',
    company.labels.join(',') === '4-1,4-2,4-3,4-4,4-5,4-6,4-7,4-8,4-9',
    JSON.stringify(company.labels),
  );
  check('本页小节只有「改建」一章', company.chapters.join('/') === '改建', JSON.stringify(company.chapters));
  check(
    '顶格写的细节行也进卡片',
    company.firstCard.includes('时间：第2年1月') && company.firstCard.includes('概要：在酒吧遇到林芬芬'),
    company.firstCard.replace(/\n+/g, ' ').slice(0, 40),
  );
  check('「提示：」渲染成备注', company.hasHint === true, String(company.hasHint));
  if (shot) {
    const view = await send('Page.captureScreenshot', { format: 'png' });
    const companyPath = shot.replace(/\.png$/, '-company.png');
    fs.writeFileSync(companyPath, Buffer.from(view.data, 'base64'));
    console.log('wrote', companyPath);
  }

  // 5. 国外通告接拍条件：5 行 3 列的表格
  await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="sweet-guide/abroad-notices"]');
    const pick = [...row.querySelectorAll('button')].find((b) => b.className.includes('flex-1'));
    pick.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const abroad = await evaluate(`(() => {
    const table = document.querySelector('main table');
    if (!table) return { hash: location.hash, found: false, headers: [], rows: [] };
    return {
      hash: location.hash,
      found: true,
      headers: [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())),
    };
  })()`);
  check('点国外通告写入深链', abroad.hash === '#/guide/sweet-guide/abroad-notices', abroad.hash);
  check('国外通告渲染成表格', abroad.found === true, String(abroad.found));
  check(
    '表头是 城市 / 公司 / 接拍条件',
    abroad.headers.join('/') === '城市/公司（通告类型）/接拍条件',
    JSON.stringify(abroad.headers),
  );
  check('表格 5 个城市 3 列', abroad.rows.length === 5 && abroad.rows[0].length === 3, `rows=${abroad.rows.length}`);
  check(
    '行内容与源文本一致',
    abroad.rows[0]?.join('/') === '东京/京风唱片（唱片）/推出3张唱片以上（个人、团体分开计算）'
      && abroad.rows[4]?.join('/') === '纽约/巴洛克之诗（舞台剧）/拍过电影，拍过电视剧，做过主持',
    JSON.stringify(abroad.rows[0]),
  );
  if (shot) {
    const table = await send('Page.captureScreenshot', { format: 'png' });
    const tablePath = shot.replace(/\.png$/, '-abroad.png');
    fs.writeFileSync(tablePath, Buffer.from(table.data, 'base64'));
    console.log('wrote', tablePath);
  }

  // 5b. 自制通告一览 / 服装获得方法和剧情 / 三大节日相关
  const openNode = async (id) => {
    await evaluate(`(() => {
      const row = document.querySelector('[data-node-id="${id}"]');
      const pick = [...row.querySelectorAll('button')].find((b) => b.className.includes('flex-1'));
      pick.click();
      return 1;
    })()`);
    await new Promise((r) => setTimeout(r, 600));
  };
  const readPage = () => evaluate(`(() => ({
    hash: location.hash,
    heads: [...document.querySelectorAll('main h3')].map((h) => h.textContent.trim()),
    cards: document.querySelectorAll('[data-event-label]').length,
    // 没有编号的事件卡不会有 data-event-label（属性为空就不渲染），按 id 数总数。
    cardTotal: document.querySelectorAll('main [id^="ev"]').length,
    // 圆点条目（名单行）与白底卡片组（甜蜜乐章里一位艺人的条件清单）。
    bullets: [...document.querySelectorAll('main p[data-bullet]')].map((p) => p.innerText.trim()),
    boxes: document.querySelectorAll('main [data-card]').length,
    // 段落前面那个「4-1」式的编号标签。
    nums: [...document.querySelectorAll('main [data-num]')].map((s) => s.textContent.trim()),
    firstCard: document.querySelector('[data-event-label]')?.innerText ?? '',
    notes: [...document.querySelectorAll('main p')]
      .filter((p) => p.className.includes('bg-note-soft'))
      .map((p) => p.innerText.trim()),
    text: document.querySelector('main')?.innerText ?? '',
  }))()`);

  await openNode('sweet-guide/self-notices');
  const notice = await readPage();
  check('点自制通告写入深链', notice.hash === '#/guide/sweet-guide/self-notices', notice.hash);
  check(
    '自制通告按唱片/电视剧/电影分章，艺人小标题 24 条',
    notice.heads.slice(0, 2).join('/') === '唱片/杜云芊' && notice.heads.length === 27,
    JSON.stringify(notice.heads.slice(0, 3)),
  );
  check('一首歌一张卡（69 张带编号）', notice.cards === 69, `cards=${notice.cards}`);
  check(
    '第一首歌带说明与属性行',
    notice.firstCard.includes('《晴天娃娃》') && notice.firstCard.includes('（民歌个人、两星）'),
    notice.firstCard.replace(/\n+/g, ' ').slice(0, 40),
  );
  check('页首的获得方式说明保留', notice.text.includes('1、触发剧情后直接获得；'), 'ok');
  check(
    'PS 说明渲染成便签（黄底）且不带 *',
    notice.notes.length === 1
      && notice.notes[0].startsWith('（PS：')
      && !notice.notes[0].startsWith('*'),
    `${notice.notes.length} / ${notice.notes[0]?.slice(0, 10) ?? '无'}`,
  );

  await openNode('sweet-guide/outfits');
  const outfits = await readPage();
  check('点服装写入深链', outfits.hash === '#/guide/sweet-guide/outfits', outfits.hash);
  check(
    '服装名渲染成小标题',
    outfits.heads.slice(0, 2).join('/') === '春夏洋装/古典晚礼服' && outfits.heads.length === 11,
    JSON.stringify(outfits.heads.slice(0, 3)),
  );
  check('服装事件 42 张卡', outfits.cards === 42, `cards=${outfits.cards}`);
  check(
    '省略号后的时间进卡片',
    outfits.firstCard.includes('时间：2008/3'),
    outfits.firstCard.replace(/\n+/g, ' ').slice(0, 40),
  );
  check('※ 行渲染成提示', outfits.text.includes('杜云芊仪态350↑演技400↑会触发'), 'ok');

  await openNode('sweet-guide/festivals');
  const festivals = await readPage();
  check('点三大节日写入深链', festivals.hash === '#/guide/sweet-guide/festivals', festivals.hash);
  check(
    '主角生日 / 情人节 / 圣诞节各一章',
    festivals.heads[0] === '主角生日' && festivals.text.includes('圣诞节邀约触发条件'),
    JSON.stringify(festivals.heads.slice(0, 2)),
  );
  check(
    '生日礼物与情人节流程都在',
    festivals.text.includes('沈惟真的蓝色缎带') && festivals.text.includes('情人节邀约沟通话题->敲定约会地点'),
    'ok',
  );
  check(
    '名单行用圆点、带序号的行不用',
    festivals.bullets.length === 22 && !festivals.bullets.some((t) => /^\d/.test(t)),
    `${festivals.bullets.length} 个圆点`,
  );
  check(
    '年份门槛缩进成子条目',
    festivals.text.includes('第2年-近4个月内约会4次以上'),
    'ok',
  );
  check(
    '原文错字已补正（春夏洋装 / 约会）',
    festivals.text.includes('城仲瑄：杜云芊穿着春夏洋装')
      && festivals.text.includes('没有特殊行程和约会'),
    'ok',
  );

  // 5c. 女主事业结局 / 结局条件一览 / 甜蜜模式 / 喜爱物品一览
  await openNode('sweet-guide/career-endings');
  const career = await readPage();
  check('点女主事业结局写入深链', career.hash === '#/guide/sweet-guide/career-endings', career.hash);
  check(
    '11 个事业结局各是一个大标题',
    career.heads.slice(0, 3).join('/') === '天王巨星/演员/模特儿'
      && career.heads[10] === '公司倒闭'
      && career.heads.length === 16,
    `${career.heads.length} 个标题`,
  );
  check(
    '巨星条件四项都在',
    career.heads.slice(-5).join('/') === '巨星条件/数值条件/通告条件（1或2）/其他条件（1和2）/奖项条件',
    JSON.stringify(career.heads.slice(-5)),
  );
  check('全角数字已归一（歌唱：600↑）', career.text.includes('歌唱：600↑'), 'ok');

  await openNode('sweet-guide/endings');
  const endings = await evaluate(`(() => {
    const table = document.querySelector('main table');
    if (!table) return { hash: location.hash, found: false, headers: [], rows: [] };
    return {
      hash: location.hash,
      found: true,
      headers: [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim()),
      rows: [...table.querySelectorAll('tbody tr')].map((tr) =>
        [...tr.querySelectorAll('td')].map((td) => td.textContent.trim())),
    };
  })()`);
  check('点结局条件写入深链', endings.hash === '#/guide/sweet-guide/endings', endings.hash);
  check('结局条件渲染成表格', endings.found === true, String(endings.found));
  check(
    '表头是 序号 / 名称 / 知名度 / 公关 / 达成条件',
    endings.headers.join('/') === '序号/公司显示名称/知名度/公关/达成条件',
    JSON.stringify(endings.headers),
  );
  check('16 个结局 5 列', endings.rows.length === 16 && endings.rows[0].length === 5, `rows=${endings.rows.length}`);
  check(
    '第一行与第 16 行内容正确',
    endings.rows[0]?.[1] === '傲视全球的演艺帝国'
      && endings.rows[0]?.[4].includes('完成夏以军相关剧情')
      && endings.rows[15]?.[1] === '白忙一场',
    JSON.stringify(endings.rows[0]),
  );

  await openNode('sweet-guide/sweet-mode');
  const mode = await readPage();
  check('点甜蜜模式写入深链', mode.hash === '#/guide/sweet-guide/sweet-mode', mode.hash);
  check(
    '启动方法 / 使用时机 / 影响 三章',
    mode.heads.slice(0, 3).join('/') === '启动方法/使用时机/影响',
    JSON.stringify(mode.heads.slice(0, 3)),
  );
  check('结婚 8 张卡 + 告白 8 张卡（白底盒子）', mode.boxes === 16, `boxes=${mode.boxes}`);
  check('告白条件编号渲染成 tag', mode.nums.length === 22 && mode.nums[0] === '4-1', JSON.stringify(mode.nums.slice(0, 3)));
  check(
    'a.~f. 是一级条目（比艺人卡更显眼）',
    mode.heads.indexOf('a.哥哥送钱剧情、父母送钱剧情，金额加倍。') > 0
      && mode.heads.includes('f.圣诞节邀约友好度门槛降低。'),
    JSON.stringify(mode.heads.filter((h) => /^[a-f][.]/.test(h)).length),
  );
  check('两段作者注释渲染成便签', mode.notes.length === 2, `notes=${mode.notes.length}`);

  await openNode('sweet-guide/favorite-gifts');
  const gifts = await readPage();
  check('点喜爱物品写入深链', gifts.hash === '#/guide/sweet-guide/favorite-gifts', gifts.hash);
  check(
    '8 位角色各一个大标题',
    gifts.heads.join('/') === '沈惟真/城仲瑄/卫亚/慕容和希/姚子奇/纪翔/史蒂芬/丹尼斯',
    JSON.stringify(gifts.heads),
  );
  check(
    '原文错字「蓝色咖啡额」已补正',
    !gifts.text.includes('蓝色咖啡额') && gifts.text.includes('蓝色咖啡'),
    'ok',
  );

  // 5d. 角色页：城仲瑄 / 丹尼斯（8 位角色共用一套排法）
  const readCharacter = () => evaluate(`(() => {
    const bg = (label) => {
      const el = document.querySelector('[data-event-label="' + label + '"]');
      return el ? getComputedStyle(el).backgroundColor : '';
    };
    const chips = (text) => [...document.querySelectorAll('main span')]
      .filter((s) => s.textContent.trim() === text).length;
    return {
      hash: location.hash,
      heads: [...document.querySelectorAll('main h3')].map((h) => h.textContent.trim()),
      cards: document.querySelectorAll('[data-event-label]').length,
      bullets: [...document.querySelectorAll('main p[data-bullet]')].map((p) => p.innerText.trim()),
      diamonds: [...document.querySelectorAll('main p[data-bullet] span')]
        .filter((s) => s.className.includes('rotate-45')).length,
      friendChips: chips('友好度上升'),
      cgChips: chips('CG'),
      cgCardBg: bg('1-2'),
      plainCardBg: bg('1-1'),
      text: document.querySelector('main')?.innerText ?? '',
    };
  })()`);

  await openNode('sweet-characters/cheng-zhongxuan');
  const cheng = await readCharacter();
  check(
    '点城仲瑄写入深链',
    cheng.hash === '#/guide/sweet-characters/cheng-zhongxuan',
    cheng.hash,
  );
  check(
    '可创作作品 / 事件 + 三个条件小节，共 13 个小标题',
    cheng.heads.slice(0, 2).join('/') === '可创作作品/事件'
      && cheng.heads[12] === '甜蜜模式下告白相关事件触发条件'
      && cheng.heads.length === 13,
    JSON.stringify(cheng.heads.slice(0, 3)),
  );
  check(
    '8 个章节：加入 … 距离',
    cheng.heads.slice(2, 10).join('/') === '加入/拘谨/得奖/犹豫/家境/资格/贤惠/距离',
    JSON.stringify(cheng.heads.slice(2, 10)),
  );
  check('37 张事件卡（1-1 ~ 8-7）', cheng.cards === 37, `cards=${cheng.cards}`);
  check(
    '开头基础信息是圆点列表',
    cheng.bullets.slice(0, 3).join('/') === '签约金：0万/分红：80%/限制：严禁裸露',
    JSON.stringify(cheng.bullets.slice(0, 3)),
  );
  check(
    '友好度与 CG 拆成两个标记（18 + 3）',
    cheng.friendChips === 18 && cheng.cgChips === 3,
    `${cheng.friendChips} / ${cheng.cgChips}`,
  );
  check(
    'CG 事件按原站方式高亮（卡片换玫红底）',
    cheng.cgCardBg !== cheng.plainCardBg && cheng.cgCardBg.includes('rgba(0, 0, 0, 0)') === false,
    `${cheng.cgCardBg} vs ${cheng.plainCardBg}`,
  );
  check(
    '事件名不带括号、编号进 pill',
    !cheng.text.includes('（友好度上升') && cheng.text.includes('樱花绽放的季节'),
    'ok',
  );

  await openNode('sweet-characters/danisi');
  const danisi = await readCharacter();
  check('点丹尼斯写入深链', danisi.hash === '#/guide/sweet-characters/danisi', danisi.hash);
  check('51 张事件卡（1-1 ~ 8-9）', danisi.cards === 51, `cards=${danisi.cards}`);
  check(
    '可创作作品里带 * 的那条用金色菱形标出',
    danisi.diamonds === 1 && danisi.text.includes('从接吻开始'),
    `diamonds=${danisi.diamonds}`,
  );
  check(
    '原文错字「称讃」已补正为「称赞」',
    !danisi.text.includes('称讃') && danisi.text.includes('称赞'),
    'ok',
  );

  // 6. 点角色页（每行第一个按钮是展开/折叠，第二个才是选中）
  await evaluate(`(() => {
    const row = document.querySelector('[data-node-id="sweet-characters/yao-ziqi"]');
    const pick = [...row.querySelectorAll('button')].find((b) => b.className.includes('flex-1'));
    pick.click();
    return 1;
  })()`);
  await new Promise((r) => setTimeout(r, 600));
  const page = await evaluate(`(() => ({
    hash: location.hash,
    heading: document.querySelector('main h1')?.textContent?.trim()
      ?? document.querySelector('main')?.textContent?.slice(0, 40) ?? '',
    emptyHint: document.body.innerText.includes('这一页还没整理'),
    brandOfTitle: (() => {
      const el = document.querySelector('main h1');
      return el ? getComputedStyle(el).color : '';
    })(),
  }))()`);
  check('点姚子奇写入 #/guide/ 深链', page.hash === '#/guide/sweet-characters/yao-ziqi', page.hash);
  check('正文标题是姚子奇', page.heading.includes('姚子奇'), page.heading);
  check('空页给出甜蜜乐章自己的提示', page.emptyHint === true, String(page.emptyHint));

  // 7. 跨站入口
  const cross = await evaluate(`(() => {
    const a = document.querySelector('[data-game-switch]');
    return a ? { href: a.getAttribute('href'), label: a.textContent.trim() } : null;
  })()`);
  check('甜蜜乐章顶栏有回原站入口', cross?.label?.includes('明星志愿3') === true, JSON.stringify(cross));

  // 8. 回原站：五个页签 + 一枚去甜蜜乐章的胶囊，主题仍是玫瑰色
  await send('Page.navigate', { url: MAIN });
  await new Promise((r) => setTimeout(r, 2600));
  const main = await evaluate(`(() => ({
    tabs: [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim()),
    cross: document.querySelector('[data-game-switch]')?.textContent?.trim() ?? '',
    brand: getComputedStyle(document.documentElement).getPropertyValue('--color-brand').trim(),
    canvas: getComputedStyle(document.body).backgroundColor,
  }))()`);
  check('原站仍是 5 个页签', main.tabs.length === 5, JSON.stringify(main.tabs));
  check('原站有去甜蜜乐章的胶囊', main.cross.includes('甜蜜乐章'), main.cross);
  check('原站品牌色没被覆盖', main.brand.toLowerCase() === '#a8506e', main.brand);

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
