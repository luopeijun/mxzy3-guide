import http from 'node:http';

/* 六大通告条件看板回归：
   1) 第 5 个 tab / 六张三列两行卡 / 默认全灰 / 旗下名单读事件追踪器
   2) 卡级指派 + 属性数字 → 差额自动算
   3) 共享条目一处改动多卡同步（证书 / 4000 万）
   4) 按需课程（只列挂了通告的证书）/ 等级循环 / 证书缺口 / 面板与卡同步
   5) 昆仑三个角色位分别判定
   6) 银河团体锁定与解散重组
   7) 时间线备注零状态、只跳事件追踪器
   8) 存档持久化、刷新不丢、清空需二次确认
   Usage: node cdp_specials_board.mjs */

const url = 'http://localhost:5173/#/specials';

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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LIN = 'characters/lin-fenfen';
const XIAO = 'characters/xiao-yili';
const SU = 'characters/su-manjun';
const TIAN = 'characters/tian-qing';
const YAO = 'characters/yao-ziqi';
const ANGEL = 'angel';
const ETERNAL = 'eternal-love';
const GALAXY = 'galaxy';
const KUNLUN = 'kunlun-adventure';
const DOOM = 'doomsday-warrior';
const MUSIC_KEY = `cert:${LIN}:音乐证书`;
const FUND_KEY = 'resource:大型演唱会需 4000 万';

const failures = [];
let checksTotal = 0;
const check = (ok, label, extra = '') => {
  checksTotal += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

const seedTracker = (artists = [LIN, XIAO, SU, TIAN]) =>
  `localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify({
    version: 1, selectedArtists: artists, releasedArtists: [], lines: {}, order: [], pinned: [], orderEpoch: 2,
  }))}); 1`;
const seedSpecials = (state) =>
  `localStorage.setItem('guide.specials.v1', ${JSON.stringify(JSON.stringify({
    version: 1, enabled: [], assignments: {}, stats: {}, courses: {}, values: {}, groupLocked: {}, ...state,
  }))}); 1`;
const clearSaves = `localStorage.removeItem('guide.specials.v1'); localStorage.removeItem('guide.progress.v1'); 1`;

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
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const reload = async () => { await send('Page.reload'); await sleep(3000); };
  const setup = async (state = {}, artists) => {
    await evaluate(clearSaves);
    await evaluate(seedTracker(artists));
    await evaluate(seedSpecials(state));
    await reload();
  };

  const cards = () => evaluate(`JSON.stringify([...document.querySelectorAll('[data-notice-card]')].map(c => ({
    id: c.getAttribute('data-notice-id'),
    enabled: c.getAttribute('data-notice-enabled'),
    progress: c.querySelector('[data-notice-progress]')?.textContent.trim() ?? '',
    rows: c.querySelectorAll('[data-condition-row]').length,
  })))`);
  const rowInfo = (rowId) => evaluate(`(() => {
    const el = document.querySelector('[data-condition-row][data-row-id="${rowId}"]');
    if (!el) return '{"missing":true}';
    return JSON.stringify({
      met: el.getAttribute('data-row-met'),
      shared: el.getAttribute('data-row-shared'),
      owner: el.querySelector('[data-owner-label]')?.textContent ?? '',
      text: el.textContent.replace(/\\s+/g, ' ').trim(),
      keys: [...new Set([...el.querySelectorAll('[data-part-key]')].map(x => x.getAttribute('data-part-key')))],
    });
  })()`);
  const click = (selector) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return 'missing'; el.click(); return 'ok'; })()`);
  const assign = (noticeId, slot, artistId) => evaluate(`(() => {
    const sel = document.querySelector('[data-notice-card][data-notice-id="${noticeId}"] [data-assign-select][data-slot="${slot}"]');
    if (!sel) return 'missing';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, ${JSON.stringify(artistId)});
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  const setNumber = (selector, value) => evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return 'missing';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(${Number(value)}));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
  const stored = () => evaluate(`localStorage.getItem('guide.specials.v1')`);

  // ---------- 1. Route, six cards, default state, roster ----------
  await setup();
  check(await evaluate(`!!document.querySelector('[data-tab="specials"]')`), '顶栏出现第 5 个「六大通告」页签');
  check(await evaluate(`!!document.querySelector('[data-specials-app]')`), '#/specials 直接落地到看板');
  const first = JSON.parse(await cards());
  check(first.length === 6, '六张通告卡（全局前提不占卡）', `${first.length} 张`);
  check(first.every((c) => c.enabled === 'no'), '六张卡默认全是「本次不做」');
  check(first.every((c) => c.rows === 0), '未启用的卡不渲染条件行');
  check(await evaluate(`getComputedStyle(document.querySelector('[data-notice-grid]')).gridTemplateColumns.split(' ').length`) === 3,
    '桌面下三列排布（3×2）');
  const rosterCount = await evaluate(`document.querySelectorAll('[data-roster-artist]').length`);
  check(rosterCount === 4, '旗下 4 人直接读事件追踪器存档', `${rosterCount} 人`);
  check(await evaluate(`!!document.querySelector('[data-global-note]')`), '周目前提作为只读索引放在顶部');
  check(await evaluate(`document.querySelector('[data-board-progress]').getAttribute('data-total')`) === '0',
    '未启用时不进统计');

  // ---------- 2. Enable, assign, attribute deltas ----------
  check(await click(`[data-notice-enable][data-notice-id="${ANGEL}"]`) === 'ok', '勾「本次做」可启用通告');
  await sleep(400);
  let list = JSON.parse(await cards());
  const angel = list.find((c) => c.id === ANGEL);
  check(angel.enabled === 'yes' && angel.rows === 21, '天使卡展开 21 条条件行', `${angel.rows} 条`);
  check(angel.progress.startsWith('0 / 21'), '达标数分母＝条件行数', angel.progress);
  check(await assign(ANGEL, 'main', LIN) === 'ok', '卡头可指派艺人');
  await sleep(400);
  let info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(!info.missing && (info.owner ?? '').includes('林芬芬'), '属性行的归属跟着卡级指派变', info.owner);
  check(await setNumber(`[data-stat-input][data-stat-key="歌艺"]`, 620) === 'ok', '属性面板可填数字');
  await sleep(400);
  info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(info.met === 'no' && info.text.includes('差 10'), '填 620 时显示「歌艺 差 10」', info.text);
  await setNumber(`[data-stat-input][data-stat-key="歌艺"]`, 630);
  await sleep(400);
  info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(info.met === 'yes', '填到区间下限 630 即达标');
  await setNumber(`[data-stat-input][data-stat-key="人气"]`, 3);
  await sleep(300);
  const charity = JSON.parse(await rowInfo('angel.charityStats'));
  check(charity.keys.length === 3, '多属性条件拆成三项分别判定', charity.keys.join(','));
  check(charity.met === 'no', '三项属性只满足两项时不算达标（不是任一项即可）');
  await setNumber(`[data-stat-input][data-stat-key="仪态"]`, 300);
  await sleep(350);
  check((JSON.parse(await rowInfo('angel.charityStats'))).met === 'yes',
    '歌艺/仪态/人气三项齐了才达标');
  check(await click('[data-hide-done]') === 'ok', '「收起已完成」开关可点');
  await sleep(400);
  check(await evaluate(`!document.querySelector('[data-condition-row][data-row-id="angel.stat.singing"]')`),
    '收起后已达标行隐藏');
  await click('[data-hide-done]');
  await sleep(300);

  // ---------- 3. Shared state across cards ----------
  await setup({
    enabled: [ANGEL, ETERNAL, GALAXY],
    assignments: {
      [ANGEL]: { main: [LIN] },
      [ETERNAL]: { main: [LIN] },
      [GALAXY]: { group: [LIN, XIAO] },
    },
  });
  const sharedBefore = JSON.parse(await rowInfo('eternal.cert.music'));
  check(sharedBefore.shared === 'yes', '同一艺人挂两张卡时证书行标「共享」');
  check(await click(`[data-notice-card][data-notice-id="${ANGEL}"] [data-part-check][data-part-key="${MUSIC_KEY}"]`) === 'ok',
    '在天使卡勾「已取得」');
  await sleep(400);
  const sharedAfter = JSON.parse(await rowInfo('eternal.cert.music'));
  check(sharedAfter.met === 'yes', '万年之恋的音乐证书同步亮（底层一份状态）');
  const fundRows = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-condition-row]')]
    .filter(r => [...r.querySelectorAll('[data-part-key]')].some(p => p.getAttribute('data-part-key') === ${JSON.stringify(FUND_KEY)}))
    .map(r => r.closest('[data-notice-card]').getAttribute('data-notice-id')))`);
  const fundIds = JSON.parse(fundRows);
  check(fundIds.length === 3, '4000 万被三张通告引用且共用同一个键', fundIds.join(','));
  check(await setNumber(`[data-notice-card][data-notice-id="${ANGEL}"] [data-part-number][data-part-key="${FUND_KEY}"]`, 4000) === 'ok',
    '在天使卡填公司资金');
  await sleep(400);
  const fundMet = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-condition-row]')]
    .filter(r => [...r.querySelectorAll('[data-part-key]')].some(p => p.getAttribute('data-part-key') === ${JSON.stringify(FUND_KEY)}))
    .map(r => r.getAttribute('data-row-met')))`);
  check(JSON.parse(fundMet).every((x) => x === 'yes'), '输入一次 4000，三张卡同时达标', JSON.parse(fundMet).join(','));
  check(await evaluate(`document.querySelectorAll('[data-shared-badge]').length > 0`), '共享小徽标出现在条件行');

  // ---------- 4. On-demand courses ----------
  await setup({
    enabled: [ANGEL, ETERNAL, DOOM],
    assignments: {
      [ANGEL]: { main: [LIN] }, [ETERNAL]: { main: [LIN] }, [DOOM]: { main: [YAO] },
    },
  }, [LIN, XIAO, SU, YAO]);
  const courseCount = () => evaluate(`(() => ({
    visible: document.querySelectorAll('[data-course-button]').length,
    needed: document.querySelectorAll('[data-course-button][data-course-needed="yes"]').length,
    names: [...document.querySelectorAll('[data-course-button]')].map(b => b.getAttribute('data-course')),
  }))()`);
  let courses = await courseCount();
  check(courses.visible === 4 && courses.needed === 4,
    '林芬芬挂天使+万年 → 只列音乐证书 4 门课', courses.names.join(','));
  check(await click(`[data-artist-tab][data-artist-id="${YAO}"]`) === 'ok', '面板可切到另一位旗下艺人');
  await sleep(400);
  courses = await courseCount();
  check(courses.visible === 3 && courses.names.includes('声音表情'),
    '姚子奇挂末日战士 → 只列戏剧证书 3 门课', courses.names.join(','));
  await click(`[data-artist-tab][data-artist-id="${SU}"]`);
  await sleep(400);
  courses = await courseCount();
  check(courses.visible === 0, '没挂启用通告的艺人不出现任何课程');
  check(await click('[data-show-all-courses]') === 'ok', '「显示全部 10 门」可展开');
  await sleep(400);
  courses = await courseCount();
  check(courses.visible === 10 && courses.needed === 0,
    '展开后 10 门全在、本轮用不到的标灰', `${courses.visible}/${courses.needed}`);
  await click('[data-show-all-courses]');
  await click(`[data-artist-tab][data-artist-id="${LIN}"]`);
  await sleep(400);
  const gapBefore = await evaluate(`document.querySelector('[data-cert-block][data-cert="音乐证书"] [data-cert-gaps]')?.textContent ?? ''`);
  for (let i = 0; i < 4; i += 1) {
    await click(`[data-course-button][data-course="音感发声"]`);
    await sleep(120);
  }
  const gapAfter = await evaluate(`document.querySelector('[data-cert-block][data-cert="音乐证书"] [data-cert-gaps]')?.textContent ?? ''`);
  const level = await evaluate(`document.querySelector('[data-course-button][data-course="音感发声"]').getAttribute('data-course-level')`);
  check(level === '专业', '点课程名 4 次循环到「专业」', level);
  check(!gapAfter.includes('音感发声') && gapBefore.includes('音感发声'),
    '课程到专业后证书缺口里该门消失', `${gapBefore} -> ${gapAfter}`);
  check(await click(`[data-cert-check][data-cert="音乐证书"]`) === 'ok', '面板可勾「已取得」');
  await sleep(400);
  check((JSON.parse(await rowInfo('angel.cert.music'))).met === 'yes',
    '面板勾证书后通告卡同一行同步亮');

  // ---------- 5. 昆仑 three role slots ----------
  await setup({
    enabled: [KUNLUN],
    assignments: {
      [KUNLUN]: { 'role:男主': [YAO], 'role:女主一': [LIN], 'role:女主二': [XIAO] },
    },
  }, [LIN, XIAO, SU, YAO]);
  const roleSlots = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-notice-card][data-notice-id="${KUNLUN}"] [data-slot]')]
    .filter(x => x.hasAttribute('data-slot') && x.querySelector('[data-assigned-artist]'))
    .map(x => ({ slot: x.getAttribute('data-slot'), n: x.querySelectorAll('[data-assigned-artist]').length })))`);
  const roles = JSON.parse(roleSlots);
  check(roles.length === 3 && roles.every((r) => r.n === 1),
    '昆仑三个角色位各指派 1 人', JSON.stringify(roles));
  const kunlunStat = JSON.parse(await rowInfo('kunlun.stat.acting'));
  check(kunlunStat.keys.length === 3, '昆仑属性行按三位分别判定（不是单一主艺人）', kunlunStat.keys.length + ' 项');
  const certKeys = await evaluate(`JSON.stringify(['kunlun.cert.male','kunlun.cert.f1','kunlun.cert.f2'].map(id => {
    const el = document.querySelector('[data-condition-row][data-row-id="' + id + '"]');
    return el ? [...new Set([...el.querySelectorAll('[data-part-key]')].map(x => x.getAttribute('data-part-key')))] : [];
  }))`);
  const [male, f1, f2] = JSON.parse(certKeys);
  check(male.length === 2 && f1.length === 2 && f2.length === 2,
    '三位各自要两张证书', `${male.length}/${f1.length}/${f2.length}`);
  check(male.some((k) => k.includes('戏剧证书')) && f2.some((k) => k.includes('音乐证书')),
    '男主＝戏剧+音乐，女主二＝舞蹈+音乐（按位不摊派）');

  // ---------- 6. 银河 group lock ----------
  await setup({ enabled: [GALAXY], assignments: { [GALAXY]: { group: [LIN, XIAO] } } });
  check(await click(`[data-notice-card][data-notice-id="${GALAXY}"] [data-group-lock]`) === 'ok', '团体满 2 人可锁定');
  await sleep(400);
  check(await evaluate(`!document.querySelector('[data-notice-card][data-notice-id="${GALAXY}"] [data-assign-select]')`),
    '锁定后不再显示加人下拉');
  check(await evaluate(`document.querySelectorAll('[data-notice-card][data-notice-id="${GALAXY}"] [data-assigned-artist]').length`) === 2,
    '锁定后成员仍在');
  check(await click(`[data-notice-card][data-notice-id="${GALAXY}"] [data-group-lock]`) === 'ok', '可显式「解散重组」');
  await sleep(400);
  check(await evaluate(`!!document.querySelector('[data-notice-card][data-notice-id="${GALAXY}"] [data-assign-select]')`),
    '解散后恢复可编辑');

  // ---------- 7. Timeline notes are a pure index ----------
  await setup({ enabled: [ANGEL] });
  check(await evaluate(`!document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-notes-list]')`),
    '时间线备注默认收起');
  check(await click(`[data-notice-card][data-notice-id="${ANGEL}"] [data-notes-toggle]`) === 'ok', '可展开时间线');
  await sleep(350);
  const notes = await evaluate(`(() => {
    const box = document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-notes-list]');
    if (!box) return JSON.stringify({ rows: 0 });
    return JSON.stringify({
      rows: box.querySelectorAll('[data-note-row]').length,
      controls: box.querySelectorAll('[data-part-check],[data-part-plus],[data-part-number]').length,
      hrefs: [...box.querySelectorAll('[data-note-link]')].map(a => a.getAttribute('href')),
    });
  })()`);
  const noteInfo = JSON.parse(notes);
  check(noteInfo.rows === 5, '天使时间线 5 条只读备注', `${noteInfo.rows} 条`);
  check(noteInfo.controls === 0, '备注区零状态（没有勾/计数/输入）');
  check(noteInfo.hrefs.every((h) => h === '#/tracker') && noteInfo.hrefs.length === 5,
    '每条备注都跳事件追踪器', noteInfo.hrefs.join(','));

  // ---------- 8. Candidate pool: one qualifying artist is enough ----------
  await setup({
    enabled: [DOOM],
    assignments: { [DOOM]: { main: [YAO, SU] } },
  }, [LIN, XIAO, SU, YAO]);
  const doomCert = JSON.parse(await rowInfo('doom.cert.drama'));
  check(doomCert.keys.length === 2 && doomCert.met === 'no',
    '候选池两人各自判定证书', doomCert.keys.join(','));
  check(await click(`[data-notice-card][data-notice-id="${DOOM}"] [data-part-check][data-part-key="cert:${YAO}:戏剧证书"]`) === 'ok',
    '只给其中一位勾证书');
  await sleep(400);
  check((JSON.parse(await rowInfo('doom.cert.drama'))).met === 'yes',
    '任一位候选人齐证即可（不要求全员都拿证）');

  // ---------- 9. Persistence + reset guard ----------
  await setup({
    enabled: [ANGEL],
    assignments: { [ANGEL]: { main: [LIN] } },
    stats: { [LIN]: { 歌艺: 700 } },
    values: { [MUSIC_KEY]: 1 },
  });
  check((JSON.parse(await rowInfo('angel.stat.singing'))).met === 'yes', 'seed 的属性数字让条件行达标');
  check((JSON.parse(await rowInfo('angel.cert.music'))).met === 'yes', 'seed 的证书勾选让条件行达标');
  await reload();
  check((JSON.parse(await rowInfo('angel.stat.singing'))).met === 'yes', '刷新后属性数字保留');
  check(await evaluate(`document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-assigned-artist]')?.getAttribute('data-artist-id')`) === LIN,
    '刷新后指派保留');
  const beforeReset = JSON.parse(await stored());
  check(beforeReset.enabled.includes(ANGEL), '存档落在 guide.specials.v1');
  check(await click('[data-reset]') === 'ok', '点一次清空进入二次确认');
  await sleep(300);
  check((JSON.parse(await stored())).enabled.includes(ANGEL), '第一次点击不清空存档');
  check(await click('[data-reset]') === 'ok', '再点一次执行清空');
  await sleep(400);
  const afterReset = JSON.parse(await stored());
  check(afterReset.enabled.length === 0 && Object.keys(afterReset.stats).length === 0,
    '二次确认后看板清空');
  const finalCards = JSON.parse(await cards());
  check(finalCards.every((c) => c.enabled === 'no'), '清空后六张卡回到灰态');

  ws.close();
  if (failures.length) throw new Error(`${failures.length} checks failed: ${failures.join(' | ')}`);
  console.log(`\nAll ${checksTotal} checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
