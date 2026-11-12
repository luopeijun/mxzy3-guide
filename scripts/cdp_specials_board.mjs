import http from 'node:http';

/* 六大通告规划与追踪看板回归（瘦身版：纯清单 + 可选差额）：
   1) 第 5 个 tab / 六张三列两行卡 / 全新存档默认全部启用 / 旗下名单读事件追踪器
   2) 卡级指派 → 勾选即达标（属性/资源是清单勾选，数字只是可选 peek）
   3) 通告要求默认折叠，展开才看到属性/证书门槛
   4) 共享条目一处改动多卡同步（证书），且只标在真正共用的状态上
   5) 昆仑三个角色位分别判定
   6) 银河团体锁定与解散重组
   7) 时间线备注零状态、只跳事件追踪器
   8) 候选池：任一位候选人齐证即可
   9) 存档持久化、刷新不丢、清空需二次确认
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
    version: 1, enabled: [], assignments: {}, done: [], stats: {}, courses: {}, values: {}, groupLocked: {}, ...state,
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
  // A truly fresh browser (no guide.specials.v1 save at all) — this is where
  // the default-enabled list comes from, not from a seeded state.
  const setupFresh = async (artists) => {
    await evaluate(clearSaves);
    await evaluate(seedTracker(artists));
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
      doneEligible: !!el.querySelector('[data-done-toggle]'),
      shared: el.getAttribute('data-row-shared'),
      owner: el.querySelector('[data-owner-label]')?.textContent ?? '',
      text: el.textContent.replace(/\\s+/g, ' ').trim(),
      keys: [...new Set([...el.querySelectorAll('[data-part-key]')].map(x => x.getAttribute('data-part-key')))],
    });
  })()`);
  const expandNotice = async (noticeId) => {
    const collapsed = await evaluate(`(() => {
      const t = document.querySelector('[data-notice-card][data-notice-id="${noticeId}"] [data-notice-phase-toggle]');
      if (!t || t.getAttribute('aria-expanded') === 'true') return false;
      t.click(); return true;
    })()`);
    if (collapsed) await sleep(400);
  };
  // A doneEligible (stat / resource) row keeps its number behind a per-row
  // "▸ 数值" peek. Open it so the optional number input / part keys are in DOM.
  const expandRowPeek = async (rowId) => {
    const opened = await evaluate(`(() => {
      const t = document.querySelector('[data-condition-row][data-row-id="${rowId}"] [data-peek-toggle]');
      if (!t || t.getAttribute('aria-expanded') === 'true') return false;
      t.click(); return true;
    })()`);
    if (opened) await sleep(300);
  };
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
    // React 19 maps onBlur to the bubbling focusout event, so a native blur()
    // would NOT trigger the handler — dispatch focusout so the value persists.
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    return 'ok';
  })()`);
  const stored = () => evaluate(`localStorage.getItem('guide.specials.v1')`);

  // ---------- 0. Fresh save: all six notices start enabled ----------
  await setupFresh();
  const fresh = JSON.parse(await cards());
  check(fresh.length === 6 && fresh.every((c) => c.enabled === 'yes'),
    '全新存档：六张通告卡默认全部勾选', fresh.map((c) => c.enabled).join(','));
  check(await evaluate(`document.querySelector('[data-board-progress]').getAttribute('data-total')`) === '73',
    '默认全启用时总进度包含全部 73 条条件');
  check(await click(`[data-notice-enable][data-notice-id="${ANGEL}"]`) === 'ok', '不想做可以取消勾选');
  await sleep(400);
  check((JSON.parse(await cards())).find((c) => c.id === ANGEL).enabled === 'no', '取消后该卡回到未启用');
  check(await evaluate(`document.querySelector('[data-board-progress]').getAttribute('data-total')`) === '53',
    '取消一张卡后它不进统计（73 → 53）');

  // ---------- 1. Route, six cards, explicit "none selected" state, roster ----------
  await setup();
  check(await evaluate(`!!document.querySelector('[data-tab="specials"]')`), '顶栏出现第 5 个「六大通告」页签');
  check(await evaluate(`!!document.querySelector('[data-specials-app]')`), '#/specials 直接落地到看板');
  const first = JSON.parse(await cards());
  check(first.length === 6, '六张通告卡（全局前提不占卡）', `${first.length} 张`);
  check(first.every((c) => c.enabled === 'no'), '存档明确全不选时六张卡都是灰态');
  check(first.every((c) => c.rows === 0), '未启用的卡不渲染条件行');
  check(await evaluate(`getComputedStyle(document.querySelector('[data-notice-grid]')).gridTemplateColumns.split(' ').length`) === 3,
    '桌面下三列排布（3×2）');
  const rosterCount = await evaluate(`document.querySelectorAll('[data-roster-artist]').length`);
  check(rosterCount === 4, '旗下 4 人直接读事件追踪器存档', `${rosterCount} 人`);
  check(await evaluate(`!!document.querySelector('[data-global-note]')`), '周目前提作为只读索引放在顶部');
  check(await evaluate(`document.querySelector('[data-board-progress]').getAttribute('data-total')`) === '0',
    '全部取消勾选时总进度为 0');
  check(await evaluate(`!!document.querySelector('[data-stats-panel]')`), '顶部有集中「数值录入」面板（全站一份，不再每行重复录入）');

  // ---------- 2. Enable, assign, checklist ticking; numbers are optional ----------
  check(await click(`[data-notice-enable][data-notice-id="${ANGEL}"]`) === 'ok', '勾「本次做」可启用通告');
  await sleep(400);
  let list = JSON.parse(await cards());
  const angel = list.find((c) => c.id === ANGEL);
  check(angel.enabled === 'yes' && angel.rows > 0, '天使卡展开可见条件行', `${angel.rows} 条（通告要求默认折叠）`);
  check(angel.progress.startsWith('0 / 20'), '达标数分母＝全部条件行数（含折叠的）', angel.progress);
  check(await evaluate(`!document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-notice-phase-toggle][aria-expanded="true"]')`),
    '通告要求阶段默认折叠');
  check(await evaluate(`!document.querySelector('[data-condition-row][data-row-id="angel.stat.singing"]')`),
    '折叠时属性行不在 DOM 里');
  check(await assign(ANGEL, 'main', LIN) === 'ok', '卡头可指派艺人');
  await sleep(400);
  await expandNotice(ANGEL);
  let info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(!info.missing && (info.owner ?? '').includes('林芬芬'), '属性行的归属跟着卡级指派变', info.owner);
  check(info.doneEligible === true, '属性行可作为清单勾选（doneEligible）');
  // Numbers do NOT gate the checklist: open the row's optional peek, fill 630
  // but leave it unticked.
  await expandRowPeek('angel.stat.singing');
  check(await setNumber(`[data-stat-input][data-part-key="stat:${LIN}:歌艺"]`, 630) === 'ok', '可填属性数字（可选 peek）');
  await sleep(400);
  info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(info.met === 'no', '只填数字、不勾选 → 仍「未达标」（数字不自动gate）');
  // Tick the checklist → met.
  check(await click(`[data-done-toggle][data-row-id="angel.stat.singing"]`) === 'ok', '点勾选使该行达标');
  await sleep(400);
  info = JSON.parse(await rowInfo('angel.stat.singing'));
  check(info.met === 'yes', '勾选后该行达标');
  list = JSON.parse(await cards());
  check(list.find((c) => c.id === ANGEL).progress.startsWith('1 / 20'), '勾选 1 条后进度推进', list.find((c) => c.id === ANGEL).progress);
  check(await click('[data-hide-done]') === 'ok', '「收起已完成」开关可点');
  await sleep(400);
  check(await evaluate(`!document.querySelector('[data-condition-row][data-row-id="angel.stat.singing"]')`),
    '收起后已勾选行隐藏');
  await click('[data-hide-done]');
  await sleep(300);

  // ---------- 2b. Central numeric-entry panel ----------
  const cellSel = (artist, attr) => `[data-stat-cell][data-artist="${artist}"][data-attr="${attr}"]`;
  check(await evaluate(`!!document.querySelector('${cellSel(LIN, '口才')}')`), '面板列出全部 10 个属性（含口才）');
  check(await setNumber(cellSel(LIN, '口才'), 600) === 'ok', '面板可直接填「口才」数值');
  await sleep(300);
  const caiPersist = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('guide.specials.v1')); return s.stats['${LIN}']?.口才 ?? null; })()`);
  check(caiPersist === 600, '口才数值写进 state.stats', String(caiPersist));
  // Fill 歌艺 700 → the music certificate gap stops listing 歌艺.
  check(await setNumber(cellSel(LIN, '歌艺'), 700) === 'ok', '面板可直接填「歌艺」数值');
  await sleep(300);
  await expandNotice(ANGEL);
  await expandRowPeek('angel.cert.music');
  const musicGap = await evaluate(`(() => { const el = document.querySelector('[data-condition-row][data-row-id="angel.cert.music"] [data-cert-gaps]'); return el ? el.textContent : ''; })()`);
  check(!musicGap.includes('歌艺 未录入'), '填了歌艺后证书缺口不再提示「歌艺 未录入」', musicGap);
  // Group 人气 (银河) writes to state.values under its gval: key.
  const popKey = 'gval:galaxy:galaxy.groupPop';
  await setup({ enabled: [GALAXY], assignments: { [GALAXY]: { group: [LIN, XIAO] } } });
  check(await evaluate(`!!document.querySelector('[data-group-input][data-key="${popKey}"]')`), '团体人气有独立输入框');
  check(await setNumber(`[data-group-input][data-key="${popKey}"]`, 5) === 'ok', '可填团体人气');
  await sleep(300);
  const popPersist = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('guide.specials.v1')); return s.values['${popKey}'] ?? null; })()`);
  check(popPersist === 5, '团体人气写进 state.values', String(popPersist));

  // ---------- 3. Shared certificate across cards (one cert, many cards) ----------
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
  check(await evaluate(`document.querySelectorAll('[data-shared-badge]').length > 0`), '共享小徽标出现在条件行');

  // ---------- 4. Cert gaps are read-only, no course-edit controls ----------
  await setup({
    enabled: [ANGEL],
    assignments: { [ANGEL]: { main: [LIN] } },
    done: ['angel.stat.singing'],
  });
  await expandNotice(ANGEL);
  check(await evaluate(`!!document.querySelector('[data-condition-row][data-row-id="angel.cert.music"] [data-part-check]')`),
    '证书行有「已取得」勾选控件');
  check(await evaluate(`!document.querySelector('[data-course-button]')`), '证书缺口不再带可编辑课程控件（按需课程改为只读提示）');
  await expandRowPeek('angel.cert.music');
  check(await evaluate(`!!document.querySelector('[data-condition-row][data-row-id="angel.cert.music"] [data-cert-gaps]')`),
    '证书行显示缺口文字（读属性/课程，展开 ▸ 后）');

  // ---------- 4b. Course grades: click a chip to advance the level ----------
  const courseChip = await evaluate(`(() => {
    const row = document.querySelector('[data-condition-row][data-row-id="angel.cert.music"]');
    const c = row && row.querySelector('[data-course-chip]');
    return c ? JSON.stringify({ course: c.getAttribute('data-course'), artist: c.getAttribute('data-artist') }) : null;
  })()`);
  check(!!courseChip, '证书行展开后显示课程等级 chip');
  if (courseChip) {
    await click(`[data-condition-row][data-row-id="angel.cert.music"] [data-course-chip]`);
    await sleep(300);
    const courseState = await evaluate(`(() => {
      const c = JSON.parse(${JSON.stringify(courseChip)});
      const s = JSON.parse(localStorage.getItem('guide.specials.v1'));
      return s.courses[c.artist]?.[c.course] ?? '未上';
    })()`);
    check(courseState === '初级', '点一下课程 chip 升到 初级', courseState);
  }

  // ---------- 5. 昆仑 three role slots ----------
  await setup({
    enabled: [KUNLUN],
    assignments: {
      [KUNLUN]: { 'role:男主': [YAO], 'role:女主一': [LIN], 'role:女主二': [XIAO] },
    },
  }, [LIN, XIAO, SU, YAO]);
  const roleSlots = await evaluate(`JSON.stringify([...document.querySelectorAll('[data-notice-card][data-notice-id="${KUNLUN}"] [data-slot]')]
    .filter(x => x.querySelector('[data-assigned-artist]') || x.querySelector('[data-assign-select]'))
    .map(x => ({ slot: x.getAttribute('data-slot'), n: x.querySelectorAll('[data-assigned-artist]').length })))`);
  const roles = JSON.parse(roleSlots);
  check(roles.length === 3 && roles.every((r) => r.n === 1),
    '昆仑三个角色位各指派 1 人', JSON.stringify(roles));
  await expandNotice(KUNLUN);
  await expandRowPeek('kunlun.stat.acting');
  const kunlunStat = JSON.parse(await rowInfo('kunlun.stat.acting'));
  check(kunlunStat.keys.length === 3, '昆仑属性行按三位分别判定（不是单一主艺人）', `${kunlunStat.keys.length} 项`);
  const certKeys = await evaluate(`JSON.stringify(['kunlun.cert.male','kunlun.cert.f1','kunlun.cert.f2'].map(id => {
    const el = document.querySelector('[data-condition-row][data-row-id="' + id + '"]');
    return el ? [...new Set([...el.querySelectorAll('[data-part-key]')].map(x => x.getAttribute('data-part-key')))] : [];
  }))`);
  const [male, f1, f2] = JSON.parse(certKeys);
  check(male.length === 2 && f1.length === 2 && f2.length === 2,
    '三位各自要两张证书', `${male.length}/${f1.length}/${f2.length}`);
  check(male.some((k) => k.includes('戏剧证书')) && f2.some((k) => k.includes('音乐证书')),
    '男主＝戏剧+音乐，女主二＝舞蹈+音乐（按位不摊派）');
  const certLines = await evaluate(`JSON.stringify(['kunlun.cert.male','kunlun.cert.f1','kunlun.cert.f2']
    .map(id => document.querySelectorAll('[data-condition-row][data-row-id="' + id + '"] [data-owner-part]').length))`);
  check(JSON.parse(certLines).every((n) => n === 2), '一个角色位两张证书各占一行', certLines);

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
      controls: box.querySelectorAll('[data-part-check],[data-part-plus],[data-part-number],[data-done-toggle]').length,
      hrefs: [...box.querySelectorAll('[data-note-link]')].map(a => a.getAttribute('href')),
    });
  })()`);
  const noteInfo = JSON.parse(notes);
  check(noteInfo.rows === 5, '天使时间线 5 条只读备注', `${noteInfo.rows} 条`);
  check(noteInfo.controls === 0, '备注区零状态（没有勾/计数/输入）');
  check(noteInfo.hrefs.every((h) => h === '#/tracker') && noteInfo.hrefs.length === 5,
    '每条备注都跳事件追踪器', noteInfo.hrefs.join(','));

  // ---------- 7b. 提前准备：道具行常驻一行获取来源 ----------
  const tearNote = await evaluate(`document.querySelector('[data-condition-row][data-row-id="angel.item.tear"] [data-item-source]')?.textContent.trim() ?? ''`);
  check(tearNote.includes('综艺节目大富翁'), '人鱼的眼泪下方常驻获取来源', tearNote);
  check(!tearNote.includes('↳'), '来源备注是纯文字、不带装饰箭头', tearNote);
  const rowBorder = await evaluate(`(() => {
    const el = document.querySelector('[data-condition-row][data-row-id="angel.item.tear"]');
    if (!el) return '';
    const s = getComputedStyle(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth].join('/');
  })()`);
  check(rowBorder === '1px/1px/1px/1px', '条件行四边细边框一致（没有左侧粗状态条）', rowBorder);
  const sourceCount = await evaluate(`document.querySelectorAll('[data-notice-card][data-notice-id="${ANGEL}"] [data-item-source]').length`);
  check(sourceCount === 9, '天使卡 9 条道具 / 前置行各带一条备注', `${sourceCount} 条`);
  check(await evaluate(`!document.querySelector('[data-condition-row][data-row-id="angel.cert.music"] [data-item-source]')`),
    '证书行不铺备注（缺口在 ▸ 展开里）');
  check(await evaluate(`document.querySelectorAll('[data-item-source] button,[data-item-source] input').length === 0`),
    '来源备注零状态、不带可点控件');

  // ---------- 8. Candidate pool: one qualifying artist is enough ----------
  await setup({
    enabled: [DOOM],
    assignments: { [DOOM]: { main: [YAO, SU] } },
  }, [LIN, XIAO, SU, YAO]);
  await expandNotice(DOOM);
  const doomCert = JSON.parse(await rowInfo('doom.cert.drama'));
  check(doomCert.keys.length === 2 && doomCert.met === 'no',
    '候选池两人各自判定证书', doomCert.keys.join(','));
  const doomParts = await evaluate(`document.querySelectorAll('[data-condition-row][data-row-id="doom.cert.drama"] [data-owner-part]').length`);
  check(doomParts === 2, '多人证书行拆成每人一行（不挤在同一行）', `${doomParts} 行`);
  check(await click(`[data-notice-card][data-notice-id="${DOOM}"] [data-part-check][data-part-key="cert:${YAO}:戏剧证书"]`) === 'ok',
    '只给其中一位勾证书');
  await sleep(400);
  check((JSON.parse(await rowInfo('doom.cert.drama'))).met === 'yes',
    '任一位候选人齐证即可（不要求全员都拿证）');

  // ---------- 8b. Solo notice keeps one artist; a full pool hides its select ----------
  await setup({ enabled: [ANGEL], assignments: { [ANGEL]: { main: [LIN] } } });
  const soloSelect = await evaluate(`(() => {
    const sel = document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-assign-select][data-slot="main"]');
    return JSON.stringify({ exists: !!sel, placeholder: sel ? sel.options[0].textContent : '', badge: !!document.querySelector('[data-notice-card][data-notice-id="${ANGEL}"] [data-solo-badge]') });
  })()`);
  const solo = JSON.parse(soloSelect);
  check(solo.exists && solo.placeholder === '换人', '单人通告选满后下拉变成「换人」', solo.placeholder);
  check(solo.badge, '单人通告带「单人」标记');
  check(await assign(ANGEL, 'main', SU) === 'ok', '单人通告可以直接换人');
  await sleep(400);
  const soloAfter = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('[data-notice-card][data-notice-id="${ANGEL}"] [data-assigned-artist]')].map(x => x.getAttribute('data-artist-id')))`));
  check(soloAfter.length === 1 && soloAfter[0] === SU, '换人后仍只有 1 位艺人', soloAfter.join(','));

  await setup({
    enabled: [DOOM],
    assignments: { [DOOM]: { main: [LIN, XIAO, SU, YAO] } },
  }, [LIN, XIAO, SU, YAO]);
  check(await evaluate(`!document.querySelector('[data-notice-card][data-notice-id="${DOOM}"] [data-assign-select]')`),
    '候选池选满 4 人后不再显示加人下拉');
  const fullHint = await evaluate(`document.querySelector('[data-notice-card][data-notice-id="${DOOM}"] [data-slot-full]')?.textContent.trim() ?? ''`);
  check(fullHint.includes('已满'), '选满后显示「已满 4 人」提示', fullHint);

  // ---------- 9. Persistence + reset guard ----------
  await setup({
    enabled: [ANGEL],
    assignments: { [ANGEL]: { main: [LIN] } },
    done: ['angel.stat.singing'],
    values: { [MUSIC_KEY]: 1 },
  });
  await expandNotice(ANGEL);
  check((JSON.parse(await rowInfo('angel.stat.singing'))).met === 'yes', 'seed 的清单勾选让条件行达标');
  check((JSON.parse(await rowInfo('angel.cert.music'))).met === 'yes', 'seed 的证书勾选让条件行达标');
  await reload();
  await expandNotice(ANGEL);
  check((JSON.parse(await rowInfo('angel.stat.singing'))).met === 'yes', '刷新后清单勾选保留');
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
  check(afterReset.enabled.length === 6 && afterReset.done.length === 0,
    '二次确认后进度清空、通告恢复默认全启用');
  const finalCards = JSON.parse(await cards());
  check(finalCards.every((c) => c.enabled === 'yes'), '清空后六张卡回到默认全部勾选');

  ws.close();
  if (failures.length) throw new Error(`${failures.length} checks failed: ${failures.join(' | ')}`);
  console.log(`\nAll ${checksTotal} checks passed.`);
}

main().catch((error) => { console.error(error); process.exit(1); });
