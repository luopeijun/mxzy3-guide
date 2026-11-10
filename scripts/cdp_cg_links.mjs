import http from 'node:http';

/* End-to-end check of the two-way 攻略 ⇄ CG links:

   1. 林芬芬页：事件 21（SD 演唱会嘉宾）的 CG 徽标是指向 #/cg/lin-4 的链接。
   2. 点它 -> 进 CG 图鉴、分组自动切到林芬芬、那张卡滚到视野并闪一下。
   3. 卡片上的「攻略」入口指回 #/guide/characters/lin-fenfen~ev<n>，点回去后
      目标事件卡闪一下并落在视口里。
   4. 没有映射的 CG（lin-2 芬芬演唱会）不渲染入口，避免死链。
   5. 萧依莉页：泪洒片场 #35 / #39 经核对无 CG，正文不再有「CG」字样、
      也不再是可点徽标；出国开刀 #45 仍指向 #/cg/xiao-3。
   6. 大图里也有「看攻略」入口。
   7. 多对一：美丽之星写真集 18 张锚到同一个事件（#14）；秘书莉铃的 CG 在「主线」组
      但落点是「其他事件 · 秘书莉铃事件 #3」；原少纬事件 54 的两张图都回到同一个事件。 */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const HOST = 'http://localhost:5173';
const URL_LIN = `${HOST}/#/guide/characters/lin-fenfen`;
const URL_XIAO = `${HOST}/#/guide/characters/xiao-yili`;

function jsonPut(target, payload) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : undefined;
    const req = http.request(target, {
      method: 'PUT',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const target = await jsonPut(`${BASE}/json/new?` + encodeURIComponent(URL_LIN));
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    const entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error.message));
    else entry.resolve(msg.result);
  });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails.exception?.description ?? res.exceptionDetails));
    }
    return res.result.value;
  };

  const hash = () => evaluate('location.hash');
  // 图鉴页切分组、滚到目标卡都是异步的，固定 sleep 在机器忙的时候会抢跑。
  const waitFor = async (expression, timeout = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await evaluate(expression)) return true;
      await sleep(80);
    }
    return false;
  };
  const goto = async (url) => {
    await send('Page.navigate', { url });
    await sleep(1100);
  };

  await send('Page.enable');
  await send('Runtime.enable');
  // 后台标签页里 requestAnimationFrame 会被节流，锚点闪动（rAF 里加类名）就抓不到。
  await send('Page.bringToFront');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  await sleep(1400);

  // --- 1. 攻略页的 CG 徽标是可点的 ---
  const badge = await evaluate(`
    (() => {
      const a = document.querySelector('a[data-cg-link][href="#/cg/lin-4"]');
      return a ? { text: a.textContent.trim(), href: a.getAttribute('href') } : null;
    })()
  `);
  console.log('lin-fenfen badge:', badge);

  // --- 2. 点徽标 -> CG 图鉴定位 ---
  await evaluate(`document.querySelector('a[data-cg-link][href="#/cg/lin-4"]').click(); 'ok'`);
  await sleep(900);
  const afterBadgeClick = await evaluate(`
    (() => {
      const card = document.getElementById('cg-card-lin-4');
      const active = document.querySelector('[data-cg-group][aria-pressed="true"]');
      const hit = document.querySelector('[data-cg-card][data-cg-id="lin-4"]');
      const guideLink = hit?.querySelector('[data-cg-guide-link]');
      const rect = card?.getBoundingClientRect();
      return JSON.stringify({
        hash: location.hash,
        cgApp: !!document.querySelector('[data-cg-app]'),
        group: active?.textContent?.trim() ?? '',
        cardPresent: !!card,
        cardFlash: !!card && card.classList.contains('anchor-flash'),
        cardInView: !!rect && rect.top < innerHeight && rect.bottom > 64,
        guideHref: guideLink?.getAttribute('href') ?? '',
        unmappedHasLink: !!document.querySelector('#cg-card-lin-2 [data-cg-guide-link]'),
        heights: [...document.querySelectorAll('[data-cg-card]')]
          .map((el) => Math.round(el.getBoundingClientRect().height)),
        withLink: document.querySelectorAll('[data-cg-card] [data-cg-guide-link]').length,
        withoutLink: document.querySelectorAll('[data-cg-card]:not(:has([data-cg-guide-link]))').length,
      });
    })()
  `);
  console.log('after badge click:', afterBadgeClick);
  const badgeState = JSON.parse(afterBadgeClick);

  // --- 3. 卡片上的「攻略」入口回到原事件 ---
  const backHref = badgeState.guideHref;
  const anchor = backHref.includes('~') ? backHref.split('~')[1] : '';
  await evaluate(`document.querySelector('#cg-card-lin-4 [data-cg-guide-link]').click(); 'ok'`);
  await sleep(1000);
  const afterBack = await evaluate(`
    (() => {
      const el = document.getElementById(${JSON.stringify(anchor)});
      const rect = el?.getBoundingClientRect();
      const main = document.querySelector('main');
      return JSON.stringify({
        hash: location.hash,
        cgApp: !!document.querySelector('[data-cg-app]'),
        targetPresent: !!el,
        targetFlash: !!el && el.classList.contains('anchor-flash'),
        targetTop: rect ? Math.round(rect.top) : -1,
        scrollTop: main ? Math.round(main.scrollTop) : -1,
        targetText: el?.textContent?.replace(/\\s+/g, ' ').slice(0, 40) ?? '',
      });
    })()
  `);
  console.log('after guide link click:', afterBack);

  // --- 4. 泪洒片场两处已无 CG，出国开刀仍有 ---
  await goto(URL_XIAO);
  const xiaoState = await evaluate(`
    (() => {
      const find = (label) => document.querySelector('[data-event-label="' + label + '"]');
      const e35 = find('35');
      const e39 = find('39');
      const e45 = document.querySelector('a[data-cg-link][href="#/cg/xiao-3"]');
      return JSON.stringify({
        e35: e35 ? { cgText: /CG/.test(e35.textContent), link: !!e35.querySelector('[data-cg-link]') } : null,
        e39: e39 ? { cgText: /CG/.test(e39.textContent), link: !!e39.querySelector('[data-cg-link]') } : null,
        e45Link: !!e45,
        e45Text: e45 ? e45.parentElement.textContent.replace(/\\s+/g, ' ').slice(0, 30) : '',
      });
    })()
  `);
  console.log('xiao-yili state:', xiaoState);
  const xiao = JSON.parse(xiaoState);

  // --- 5. 深链进 CG 页 + 大图里的「看攻略」 ---
  // 闪动类名只挂 1.8s，所以导航后立刻在页面里轮询着抓；标签页已 bringToFront，
  // rAF 不会被节流。
  await send('Page.navigate', { url: `${HOST}/#/cg/xiao-3` });
  await sleep(120);
  const deep = await evaluate(`
    (async () => {
      const t0 = Date.now();
      let flash = false;
      while (Date.now() - t0 < 4000) {
        const el = document.getElementById('cg-card-xiao-3');
        if (el && el.classList.contains('anchor-flash')) { flash = true; break; }
        await new Promise((r) => setTimeout(r, 50));
      }
      const active = document.querySelector('[data-cg-group][aria-pressed="true"]');
      return JSON.stringify({
        group: active?.textContent?.trim() ?? '',
        cardFlash: flash,
        cardPresent: !!document.getElementById('cg-card-xiao-3'),
        hash: location.hash,
      });
    })()
  `);
  console.log('cg deep link:', deep);
  await evaluate(`document.querySelector('#cg-card-xiao-3 [data-cg-open]').click(); 'ok'`);
  await sleep(500);
  const lightbox = await evaluate(`
    JSON.stringify({
      open: !!document.querySelector('[data-cg-lightbox]'),
      guide: document.querySelector('[data-cg-lightbox-guide]')?.getAttribute('href') ?? '',
    })
  `);
  console.log('lightbox:', lightbox);

  // 路欧桑那批感情 CG 走「页面级」落点：不锚事件，整组跳剧情整理页。
  await evaluate(`location.hash = '#/cg/sang-5'; 'ok'`);
  await sleep(1400);
  const pageLevel = await evaluate(`
    (() => {
      const link = document.querySelector('#cg-card-sang-5 [data-cg-guide-link]');
      const card = document.querySelector('#cg-card-sang-5');
      const rect = card?.getBoundingClientRect();
      return JSON.stringify({
        href: link?.getAttribute('href') ?? '',
        title: link?.getAttribute('title') ?? '',
        hasLink: !!link,
        personalHasLink: !!document.querySelector('#cg-card-sang-9 [data-cg-guide-link]'),
        cardAtEvent: (document.querySelector('#cg-card-sang-8 [data-cg-guide-link]')?.getAttribute('href') ?? '')
          .startsWith('#/guide/characters/sang-hebei~ev'),
        cardInView: !!rect && rect.top < innerHeight && rect.bottom > 64,
      });
    })()
  `);
  console.log('page-level link:', pageLevel);

  // 同一张图在两个人名下各列一次：两侧都得整页跳，不然总有一边点不进攻略。
  const bothSides = {};
  for (const cg of ['sang-4', 'ou-5']) {
    await evaluate(`location.hash = '#/cg/${cg}'; 'ok'`);
    await sleep(1300);
    bothSides[cg] = await evaluate(`
      document.querySelector('#cg-card-${cg} [data-cg-guide-link]')?.getAttribute('href') ?? ''
    `);
  }
  console.log('both sides:', JSON.stringify(bothSides));

  // 下面要点 sang-5 的「攻略›」，先切回去。
  await evaluate(`location.hash = '#/cg/sang-5'; 'ok'`);
  await sleep(1300);

  await evaluate(`document.querySelector('#cg-card-sang-5 [data-cg-guide-link]').click(); 'ok'`);
  await sleep(1600);
  const landed = await evaluate(`
    (() => {
      const main = document.querySelector('main');
      const text = main ? main.innerText.replace(/\\s+/g, ' ') : '';
      return JSON.stringify({
        hash: location.hash,
        cgApp: !!document.querySelector('[data-cg-app]'),
        title: text.slice(0, 90),
        branches: ['只有桑禾蓓在旗下', '只有路风在旗下', '路风和桑禾蓓都在旗下', '路风和欧怡青都在旗下']
          .filter((name) => text.includes(name)).length,
      });
    })()
  `);
  console.log('page-level landed:', landed);

  // 攻略侧的指引也要能跳回来（路风 1 处、欧怡青 2 处）。
  const tipLinks = {};
  for (const [node, key] of [['characters/lu-feng', 'lufeng'], ['characters/ou-yiqing', 'ou']]) {
    await evaluate(`location.hash = '#/guide/${node}'; 'ok'`);
    await sleep(1500);
    tipLinks[key] = await evaluate(`
      [...document.querySelectorAll('main a')]
        .filter((a) => a.getAttribute('href') === '#/other-events/luousang').length
    `);
  }
  console.log('tip links:', JSON.stringify(tipLinks));

  // 已核对过的五个人：每页可点的 CG 徽标数量与指向都要对得上。
  const pageBadges = {};
  for (const [node, key] of [
    ['characters/sang-hebei', 'sang'],
    ['characters/su-manjun', 'su'],
    ['characters/ou-yiqing', 'ou'],
    ['characters/lu-min', 'lum'],
    ['characters/lu-feng', 'lu'],
    ['characters/yao-ziqi', 'yao'],
    ['characters/tian-qing', 'tian'],
    ['characters/guan-guwei', 'guan'],
    ['characters/chen-yifu', 'chen'],
    ['characters/ji-xiang', 'ji'],
    ['characters/xinming-shaxue', 'xin'],
    ['characters/yao-ziying', 'yaom'],
    ['characters/ling-xiang', 'ling'],
    ['characters/ke-liesi', 'ke'],
    ['characters/wei-ya', 'wei'],
    ['characters/yuan-shaowei', 'yuan'],
    ['other-events/secretary', 'sec'],
  ]) {
    await evaluate(`location.hash = '#/guide/${node}'; 'ok'`);
    await sleep(1500);
    pageBadges[key] = await evaluate(`
      [...document.querySelectorAll('main a[data-cg-link]')].map((a) => a.getAttribute('href'))
    `);
  }
  console.log('page badges:', JSON.stringify(pageBadges));

  // 这几位里「原文不该有 CG」的事件：正文不再出现 CG 字样，也没有可点徽标。
  const noCgEvents = {};
  for (const [node, key, labels] of [
    ['characters/yao-ziqi', 'yao', ['79', '80']],
    ['characters/tian-qing', 'tian', ['14', '36']],
    ['characters/chen-yifu', 'chen', ['14']],
    ['characters/ji-xiang', 'ji', ['50']],
  ]) {
    await evaluate(`location.hash = '#/guide/${node}'; 'ok'`);
    await sleep(1500);
    noCgEvents[key] = await evaluate(`
      ${JSON.stringify(labels)}.map((label) => {
        const el = document.querySelector('[data-event-label="' + label + '"]');
        return el ? { label, cgText: /CG/.test(el.textContent), link: !!el.querySelector('[data-cg-link]') } : { label, missing: true };
      })
    `);
  }
  console.log('no-cg events:', JSON.stringify(noCgEvents));

  // 新名纱雪「与律师的事件 #5」与聆香「温泉事件 #22」也是「原文不该有 CG」：
  // 纱雪的 #5 在「签约方法」里还有一个（那个真有 CG），所以取同 label 的第二个；
  // 其余 6 个删标记的事件 label 在各自页面里唯一，已在上面的 noCgEvents 里断言。
  await evaluate(`location.hash = '#/guide/characters/xinming-shaxue'; 'ok'`);
  await sleep(1500);
  const xinNoCg = await evaluate(`
    (() => {
      const all = [...document.querySelectorAll('[data-event-label="5"]')];
      const el = all[1];
      return JSON.stringify({
        count: all.length,
        cgText: el ? /CG/.test(el.textContent) : null,
        link: el ? !!el.querySelector('[data-cg-link]') : null,
      });
    })()
  `);
  console.log('xin 5 (与律师的事件):', xinNoCg);

  await evaluate(`location.hash = '#/guide/characters/ling-xiang'; 'ok'`);
  await sleep(1500);
  const lingNoCg = await evaluate(`
    (() => {
      // 22－1 是 22 的子事件，会嵌在这张卡里；只看卡首行，别把子事件的 CG 算进来。
      const el = document.querySelector('[data-event-label="22"]');
      const head = el?.firstElementChild;
      return JSON.stringify({
        cgText: head ? /CG/.test(head.textContent) : null,
        link: head ? !!head.querySelector('[data-cg-link]') : null,
      });
    })()
  `);
  console.log('ling 22 (温泉事件):', lingNoCg);

  // 秘书莉铃：CG 在「主线」组，但落点是「其他事件 · 秘书莉铃事件 #3」。
  await evaluate(`location.hash = '#/cg/main-4'; 'ok'`);
  await sleep(1500);
  await waitFor("!!document.querySelector('#cg-card-main-4 [data-cg-guide-link]')");
  const secHref = await evaluate(`
    document.querySelector('#cg-card-main-4 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  await evaluate(`document.querySelector('#cg-card-main-4 [data-cg-guide-link]')?.click(); 'ok'`);
  await sleep(1600);
  const secLanding = await evaluate(`
    (() => {
      const m = location.hash.match(/~(.+)$/);
      const target = m ? document.getElementById(m[1]) : null;
      return JSON.stringify({
        hash: location.hash,
        label: target?.getAttribute('data-event-label') ?? '',
        text: target?.textContent?.replace(/\\s+/g, ' ').slice(0, 24) ?? '',
      });
    })()
  `);
  console.log('main-4 reverse:', secHref, secLanding);

  // 美丽之星写真集：18 张都锚到同一个事件（#14），不做整页落点。
  await evaluate(`location.hash = '#/cg/lin-13'; 'ok'`);
  await sleep(1500);
  await waitFor("!!document.querySelector('#cg-card-lin-13 [data-cg-guide-link]')");
  const beautyHref = await evaluate(`
    document.querySelector('#cg-card-lin-13 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  await evaluate(`document.querySelector('#cg-card-lin-13 [data-cg-guide-link]')?.click(); 'ok'`);
  await sleep(1600);
  const beautyLanding = await evaluate(`
    (() => {
      const m = location.hash.match(/~(.+)$/);
      const target = m ? document.getElementById(m[1]) : null;
      const rect = target?.getBoundingClientRect();
      return JSON.stringify({
        hash: location.hash,
        label: target?.getAttribute('data-event-label') ?? '',
        text: target?.textContent?.replace(/\\s+/g, ' ').slice(0, 26) ?? '',
        inView: !!rect && rect.top >= 0 && rect.top < innerHeight,
      });
    })()
  `);
  console.log('lin-13 reverse:', beautyHref, beautyLanding);

  // 原少纬事件 54 出两张图：徽标只给第一张（yuan-7），但两张都要能反跳回同一个事件。
  const yuanHrefs = {};
  for (const cg of ['yuan-7', 'yuan-8']) {
    await evaluate(`location.hash = '#/cg/${cg}'; 'ok'`);
    await sleep(1300);
    await waitFor(`!!document.querySelector('#cg-card-${cg} [data-cg-guide-link]')`);
    yuanHrefs[cg] = await evaluate(`
      document.querySelector('#cg-card-${cg} [data-cg-guide-link]')?.getAttribute('href') ?? ''
    `);
  }
  console.log('yuan 7/8 hrefs:', JSON.stringify(yuanHrefs));

  // 共用一张图的两个事件：反跳取最先出现的那个（纱雪念书 → 事件 33 那一处）。
  await evaluate(`location.hash = '#/cg/xin-10'; 'ok'`);
  await sleep(1500);
  await waitFor("!!document.querySelector('#cg-card-xin-10 [data-cg-guide-link]')");
  const xin10Href = await evaluate(`
    document.querySelector('#cg-card-xin-10 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  await evaluate(`document.querySelector('#cg-card-xin-10 [data-cg-guide-link]')?.click(); 'ok'`);
  await sleep(1600);
  const xin10Landing = await evaluate(`
    (() => {
      const m = location.hash.match(/~(.+)$/);
      const target = m ? document.getElementById(m[1]) : null;
      return JSON.stringify({
        hash: location.hash,
        label: target?.getAttribute('data-event-label') ?? '',
        text: target?.textContent?.replace(/\\s+/g, ' ').slice(0, 22) ?? '',
      });
    })()
  `);
  console.log('xin-10 reverse:', xin10Href, xin10Landing);

  // 反向：天晴 CG04（被路敏告白）应跳回「与路敏的感情」事件 38。
  await evaluate(`location.hash = '#/cg/tian-4'; 'ok'`);
  await sleep(1500);
  const tianHref = await evaluate(`
    document.querySelector('#cg-card-tian-4 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  await evaluate(`document.querySelector('#cg-card-tian-4 [data-cg-guide-link]')?.click(); 'ok'`);
  await sleep(1500);
  const tianLanding = await evaluate(`
    (() => {
      const m = location.hash.match(/~(.+)$/);
      const target = m ? document.getElementById(m[1]) : null;
      // 卡片根节点自己带 data-event-label；子事件（38－1…）嵌在里面，不能 querySelector。
      const lab = target?.getAttribute('data-event-label') ?? '';
      return JSON.stringify({ hash: location.hash, label: lab });
    })()
  `);
  console.log('tian-4 reverse:', tianHref, tianLanding);

  // 苏嫚君 CG05 圣诞布置第二年、第三年各出一次：反跳取第一次（事件 40）。
  await evaluate(`location.hash = '#/cg/su-5'; 'ok'`);
  await sleep(1500);
  const suHref = await evaluate(`
    document.querySelector('#cg-card-su-5 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  await evaluate(`document.querySelector('#cg-card-su-5 [data-cg-guide-link]').click(); 'ok'`);
  await sleep(1500);
  const suLanding = await evaluate(`
    (() => {
      const m = location.hash.match(/~(.+)$/);
      const target = m ? document.getElementById(m[1]) : null;
      return JSON.stringify({
        hash: location.hash,
        label: (target?.textContent ?? '').replace(/\\s+/g, ' ').slice(0, 2),
        text: target?.textContent?.replace(/\\s+/g, ' ').slice(0, 24) ?? '',
      });
    })()
  `);
  console.log('su-5 reverse:', suHref, suLanding);

  // 欧怡青告别演唱会核对后从「页面级」改成了事件级。
  await evaluate(`location.hash = '#/cg/ou-8'; 'ok'`);
  await sleep(1500);
  const ou8Href = await evaluate(`
    document.querySelector('#cg-card-ou-8 [data-cg-guide-link]')?.getAttribute('href') ?? ''
  `);
  console.log('ou-8 href:', ou8Href);

  const b = badgeState;
  const back = JSON.parse(afterBack);
  const d = JSON.parse(deep);
  const lb = JSON.parse(lightbox);
  const pl = JSON.parse(pageLevel);
  const landedView = JSON.parse(landed);
  const tips = tipLinks;
  const su = JSON.parse(suLanding);
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const checks = {
    'badge links to cg': b !== null && badge.href === '#/cg/lin-4',
    'badge click goes to cg': b.hash === '#/cg/lin-4',
    'cg view rendered': b.cgApp === true,
    'group switched to 林芬芬': b.group.startsWith('林芬芬'),
    'target card exists': b.cardPresent === true,
    'target card flashes': b.cardFlash === true,
    'target card in view': b.cardInView === true,
    'card links back to guide': b.guideHref.startsWith('#/guide/characters/lin-fenfen~ev'),
    'unmapped cg has no link': b.unmappedHasLink === false,
    'cards are equal height': new Set(b.heights).size === 1 && b.heights.length >= 10,
    'both kinds of card rendered': b.withLink > 0 && b.withoutLink > 0,
    'back lands on guide': back.hash.startsWith('#/guide/characters/lin-fenfen~ev') && back.cgApp === false,
    'back target exists': back.targetPresent === true,
    'back target flashes': back.targetFlash === true,
    'back target sits near top': back.targetTop >= 60 && back.targetTop < 220,
    'back did not land on page top': back.scrollTop > 100,
    'back target text is the event': back.targetText.startsWith('21'),
    'xiao 35 has no cg marker': xiao.e35 !== null && xiao.e35.cgText === false && xiao.e35.link === false,
    'xiao 39 has no cg marker': xiao.e39 !== null && xiao.e39.cgText === false && xiao.e39.link === false,
    'xiao 45 still links': xiao.e45Link === true,
    'deep link switches group': d.group.startsWith('萧依莉'),
    'deep link flashes card': d.cardFlash === true,
    'lightbox opens': lb.open === true,
    'lightbox has guide link': lb.guide.startsWith('#/guide/characters/xiao-yili~ev'),
    // 路欧桑：感情 CG 整页跳，不带事件锚点；个人剧情 CG 不挂入口。
    'page-level link is the node page': pl.href === '#/guide/other-events/luousang',
    'page-level title says 完整剧情': pl.title.includes('完整剧情整理'),
    'personal cg stays unlinked': pl.personalHasLink === false,
    'sang-8 now links to its event': pl.cardAtEvent === true,
    'page-level click lands on luousang': landedView.hash === '#/guide/other-events/luousang' && landedView.cgApp === false,
    'sang-4 also links to luousang': bothSides['sang-4'] === '#/guide/other-events/luousang',
    'ou-5 also links to luousang': bothSides['ou-5'] === '#/guide/other-events/luousang',
    'luousang page shows the four branches': landedView.branches === 4,
    'lu-feng tip links to luousang': tips.lufeng === 1,
    'ou-yiqing tips link to luousang': tips.ou === 2,
    // 已核对的五人：徽标数量与指向逐页对得上。
    'sang-hebei badges': sameSet(pageBadges.sang, ['#/cg/sang-1', '#/cg/sang-8', '#/cg/sang-11']),
    'su-manjun badges': sameSet(pageBadges.su, [
      '#/cg/su-1', '#/cg/su-4', '#/cg/su-5', '#/cg/su-3', '#/cg/su-6', '#/cg/su-5', '#/cg/su-12',
    ]),
    'ou-yiqing badges': sameSet(pageBadges.ou, ['#/cg/ou-1', '#/cg/ou-8', '#/cg/ou-9']),
    'lu-min badges': sameSet(pageBadges.lum, [
      '#/cg/lum-1', '#/cg/lum-3', '#/cg/lum-4', '#/cg/lum-5',
      '#/cg/lum-8', '#/cg/lum-9', '#/cg/lum-10', '#/cg/lum-6',
    ]),
    'lu-feng badges': sameSet(pageBadges.lu, ['#/cg/lu-1']),
    'yao-ziqi badges': sameSet(pageBadges.yao, [
      '#/cg/yao-1', '#/cg/yao-3', '#/cg/yao-4', '#/cg/yao-5', '#/cg/yao-6', '#/cg/yao-7',
    ]),
    'tian-qing badges': sameSet(pageBadges.tian, [
      '#/cg/tian-1', '#/cg/tian-3', '#/cg/tian-4', '#/cg/tian-5', '#/cg/tian-6', '#/cg/tian-7',
    ]),
    'guan-guwei badges': sameSet(pageBadges.guan, [
      '#/cg/guan-1', '#/cg/guan-4', '#/cg/guan-3', '#/cg/guan-5', '#/cg/guan-6', '#/cg/guan-7',
    ]),
    'chen-yifu badges': sameSet(pageBadges.chen, ['#/cg/chen-1', '#/cg/chen-4', '#/cg/chen-3']),
    'ji-xiang badges': sameSet(pageBadges.ji, [
      '#/cg/ji-1', '#/cg/ji-7', '#/cg/ji-8', '#/cg/ji-9', '#/cg/ji-3', '#/cg/ji-4',
    ]),
    'xinming-shaxue badges': sameSet(pageBadges.xin, [
      '#/cg/xin-1', '#/cg/xin-6', '#/cg/xin-4', '#/cg/xin-9', '#/cg/xin-10',
      '#/cg/xin-13', '#/cg/xin-3', '#/cg/xin-10', '#/cg/xin-10',
    ]),
    'yao-ziying badges': sameSet(pageBadges.yaom, [
      '#/cg/yaom-1', '#/cg/yaom-6', '#/cg/yaom-3', '#/cg/yaom-4', '#/cg/yaom-5',
    ]),
    'ling-xiang badges': sameSet(pageBadges.ling, [
      '#/cg/ling-1', '#/cg/ling-4', '#/cg/ling-3', '#/cg/ling-5', '#/cg/ling-6',
    ]),
    'ke-liesi badges': sameSet(pageBadges.ke, [
      '#/cg/ke-1', '#/cg/ke-3', '#/cg/ke-5', '#/cg/ke-7', '#/cg/ke-4', '#/cg/ke-8', '#/cg/ke-6',
    ]),
    'wei-ya badges': sameSet(pageBadges.wei, [
      '#/cg/wei-1', '#/cg/wei-4', '#/cg/wei-7', '#/cg/wei-3', '#/cg/wei-5',
    ]),
    'yuan-shaowei badges': sameSet(pageBadges.yuan, [
      '#/cg/yuan-1', '#/cg/yuan-4', '#/cg/yuan-5', '#/cg/yuan-7', '#/cg/yuan-9',
    ]),
    'secretary badges': sameSet(pageBadges.sec, ['#/cg/main-4']),
    'dropped cg marks have no badge': Object.values(noCgEvents)
      .flat()
      .every((e) => !e.missing && e.cgText === false && e.link === false),
    'tian-4 reverse goes to event 38': tianHref.startsWith('#/guide/characters/tian-qing~ev')
      && JSON.parse(tianLanding).label === '38',
    'su-5 reverse goes to first event': suHref.startsWith('#/guide/characters/su-manjun~ev') && su.label === '40',
    'ou-8 is event-level now': ou8Href.startsWith('#/guide/characters/ou-yiqing~ev'),
    // 这两个事件只删了 CG 标记，不像别的角色那样有个可点的徽标。
    'xin 5 (与律师) has no cg marker': JSON.parse(xinNoCg).count === 2
      && JSON.parse(xinNoCg).cgText === false && JSON.parse(xinNoCg).link === false,
    'ling 22 has no cg marker': JSON.parse(lingNoCg).cgText === false && JSON.parse(lingNoCg).link === false,
    'main-4 lands on secretary event 3': secHref === '#/guide/other-events/secretary~ev2'
      && JSON.parse(secLanding).label === '3',
    // 18 张写真集共用一个事件：必须锚到 #14，而不是退回美丽之星页顶部。
    'beauty star cg anchors the shared event': beautyHref === '#/guide/other-events/beauty-star~ev18',
    'beauty star lands on event 14': JSON.parse(beautyLanding).label === '14'
      && JSON.parse(beautyLanding).text.includes('写真集')
      && JSON.parse(beautyLanding).inView === true,
    'yuan 7 and 8 both land on event 54': yuanHrefs['yuan-7'] === '#/guide/characters/yuan-shaowei~ev96'
      && yuanHrefs['yuan-8'] === '#/guide/characters/yuan-shaowei~ev96',
    'xin-10 reverse takes the first event': xin10Href === '#/guide/characters/xinming-shaxue~ev77'
      && JSON.parse(xin10Landing).label === '33',
  };

  let pass = true;
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) pass = false;
  }
  console.log(pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED');

  await jsonPut(`${BASE}/json/close/${target.id}`);
  ws.close();
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
