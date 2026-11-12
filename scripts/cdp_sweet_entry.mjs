import http from 'node:http';
import fs from 'node:fs';

/* 双站点入口回归：确认 sweet.html 能独立跑起来、用的是粉色主题令牌、
   目录结构与原攻略一致（3 类 10/8/6 条，第一类叫「经纪人事件簿」）、
   主线攻略正文能渲染（23 张事件卡 + 5 条本页小节）、点角色页能进、
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

  // 4. 点角色页（每行第一个按钮是展开/折叠，第二个才是选中）
  if (shot) {
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(shot, Buffer.from(data, 'base64'));
    console.log('wrote', shot);
  }
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

  // 5. 跨站入口
  const cross = await evaluate(`(() => {
    const a = document.querySelector('[data-game-switch]');
    return a ? { href: a.getAttribute('href'), label: a.textContent.trim() } : null;
  })()`);
  check('甜蜜乐章顶栏有回原站入口', cross?.label?.includes('明星志愿3') === true, JSON.stringify(cross));

  // 6. 回原站：五个页签 + 一枚去甜蜜乐章的胶囊，主题仍是玫瑰色
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
