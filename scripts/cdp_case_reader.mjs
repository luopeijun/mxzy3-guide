import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* Browser regression for the 存档解析 tab:
 *   1) the main site has six tabs, #/case renders the reader and the bundled
 *      static table loads;
 *   2) injecting a real .sa2 through the hidden file input renders the notice
 *      table with rolled values, the game clock, artist cards, the booking
 *      window, shooting period, reservations and the company refresh timeline;
 *   3) the search box filters the notices;
 *   4) 甜蜜乐章 keeps its own three tabs (the reader is main-site only).
 *
 * Needs the dev server on localhost:5173 and CDP on 127.0.0.1:9339.
 * IMPORTANT: one debug tab is reused for the whole run. Repeatedly calling
 * /json/new piles up hundreds of idle tabs until Chrome stops responding.
 * Usage: node scripts/cdp_case_reader.mjs [path/to/save.sa2]
 */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = process.argv[2] ?? 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Auto.sa2';
// Work on a snapshot: Waltz.exe rewrites Auto.sa2 while the game is running.
const SAVE = path.join(root, '.tmp', 'case-e2e.sa2');
fs.mkdirSync(path.dirname(SAVE), { recursive: true });
fs.copyFileSync(SOURCE, SAVE);

function request(target, method = 'PUT') {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}
const jsonPut = (target) => request(target, 'PUT');
const jsonGet = (target) => request(target, 'GET');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const failures = [];
let checks = 0;
const check = (ok, label, extra = '') => {
  checks += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

/** Reuse the first existing page tab (or open exactly one if Chrome is empty),
 *  then return a CDP session that can be navigated as many times as needed. */
async function connect() {
  const list = await jsonGet(`${BASE}/json/list`);
  const pages = Array.isArray(list) ? list.filter((t) => t.type === 'page') : [];
  const target = pages[0] ?? await jsonPut(`${BASE}/json/new?about:blank`);
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
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  await send('Page.enable');
  await send('DOM.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
  });
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };
  const navigate = async (url) => {
    // about:blank -> target guarantees a fresh React mount even when the tab
    // already sat on the same hash.
    await send('Page.navigate', { url: 'about:blank' });
    await sleep(250);
    await send('Page.navigate', { url });
    await sleep(3000);
  };
  return { send, evaluate, navigate, close: () => ws.close() };
}

async function main() {
  const { send, evaluate, navigate, close } = await connect();
  try {
    await navigate('http://localhost:5173/#/case');

    const shell = await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[role="tab"]').length,
      caseTab: !!document.querySelector('[data-tab="case"]'),
      caseActive: document.querySelector('[data-tab="case"]')?.getAttribute('aria-selected'),
      reader: !!document.querySelector('[data-case-reader]'),
      input: !!document.querySelector('[data-case-upload]'),
      uploadReady: !document.querySelector('[data-case-reader] button')?.disabled,
      hash: location.hash,
      tableSource: document.querySelector('[data-case-toolbar]')?.getAttribute('data-tables-source') || '',
    })`);
    const s = JSON.parse(shell);
    console.log('shell:', shell);
    check(s.tabs === 6, 'main site has six tabs', String(s.tabs));
    check(s.caseTab && s.caseActive === 'true', '存档解析 tab is active');
    check(s.reader && s.input, 'reader and upload input mounted');
    check(s.hash === '#/case', 'route is #/case', s.hash);
    check(s.tableSource.includes('繁中三合一') && s.uploadReady,
      'bundled static tables loaded and upload enabled', s.tableSource);

    const doc = await send('DOM.getDocument', { depth: -1 });
    const q = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '[data-case-upload]' });
    if (!q.nodeId) throw new Error('file input not found in DOM');
    await send('DOM.setFileInputFiles', { nodeId: q.nodeId, files: [SAVE] });
    await sleep(1600);

    /** 再传一份存档：每次都重新查一次输入框，React 换存档时可能换掉节点。 */
    const uploadSave = async (file) => {
      const fresh = await send('DOM.getDocument', { depth: -1 });
      const input = await send('DOM.querySelector', { nodeId: fresh.root.nodeId, selector: '[data-case-upload]' });
      if (!input.nodeId) throw new Error('file input not found in DOM');
      await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
      await sleep(1600);
    };

    const parsed = await evaluate(`JSON.stringify({
      error: document.querySelector('[data-case-error]')?.innerText || '',
      notices: document.querySelectorAll('[data-case-notice]').length,
      roles: document.querySelectorAll('[data-case-role]').length,
      values: document.querySelectorAll('[data-case-value]').length,
      count: document.querySelector('[data-case-count]')?.innerText || '',
      clock: document.querySelector('[data-case-clock]')?.innerText || '',
      now: document.querySelector('[data-case-now]')?.innerText || '',
      closing: document.querySelector('[data-case-closing]')?.innerText || '',
      nextUpdate: document.querySelector('[data-case-next-update]')?.innerText || '',
      company: (function(){
        var box = document.querySelector('[data-case-company]');
        if (!box) return null;
        var pick = function(k){
          var el = box.querySelector('[data-case-company-stat="' + k + '"]');
          return el ? el.innerText.replace(/\\s+/g, ' ').trim() : '';
        };
        return JSON.stringify({
          summary: (box.querySelector('[data-case-company-summary]')?.innerText || '').replace(/\\s+/g, ' ').trim(),
          image: pick('image'), fame: pick('fame'), pr: pick('pr'),
          money: pick('money'),
          aboveArtists: (function(){
            var a = document.querySelector('[data-case-artists]');
            return !!a && !!(box.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING);
          })()
        });
      })(),
      artists: document.querySelectorAll('[data-case-artist]').length,
      artistAttrs: document.querySelectorAll('[data-case-artist-attrs]').length,
      artistAttrsCount: document.querySelectorAll('[data-case-artist-attrs] span').length,
      artistCounts: document.querySelectorAll('[data-case-artist-counts]').length,
      artistCollapsible: (function(){
        var d = document.querySelector('[data-case-artists]');
        return !!d && d.tagName === 'DETAILS' && !!d.querySelector('summary');
      })(),
      artistSummary: document.querySelector('[data-case-artists-summary]')?.innerText || '',
      picker: !!document.querySelector('[data-case-artist-picker]'),
      updates: (function(){ var d = document.querySelector('[data-case-updates]'); if (!d) return ''; d.open = true; return d.textContent || ''; })(),
      closingRows: document.querySelectorAll('[data-case-status="closing"]').length,
      reservedRows: document.querySelectorAll('[data-case-reserved="yes"]').length,
      reservedText: [...document.querySelectorAll('[data-case-reserved="yes"] [data-case-reservation]')].map(x => x.innerText).join('|'),
      workDays: document.querySelectorAll('[data-case-workdays]').length,
      workDaysFirst: document.querySelector('[data-case-workdays]')?.innerText || '',
      upcoming: document.querySelectorAll('[data-case-upcoming]').length,
      upcomingText: document.querySelector('[data-case-upcoming]')?.innerText || '',
      reservePanel: !!document.querySelector('[data-case-reserve-panel]'),
      tableSelects: document.querySelectorAll('[data-case-table] select').length,
      reserveChips: document.querySelectorAll('[data-case-reserve-chip]').length,
      matches: document.querySelectorAll('[data-case-match]').length,
      matchCols: document.querySelectorAll('[data-case-match-col]').length,
      matchColHead: document.querySelector('[data-case-match-col]')?.innerText || '',
      matchLists: document.querySelectorAll('[data-case-match-list]').length,
      femaleLead: (function(){
        var tbody = [...document.querySelectorAll('[data-case-notice]')].find(x => x.innerText.includes('守候'));
        var r = tbody ? tbody.querySelector('[data-case-role][data-case-role-name="女主角"]') : null;
        var list = r ? r.querySelector('[data-case-match-group]') : null;
        return list ? [...list.querySelectorAll('[data-case-match]')]
          .map(x => x.getAttribute('data-match-artist')).join('|') : '';
      })(),
      femaleLeadFirst: (function(){
        var tbody = [...document.querySelectorAll('[data-case-notice]')].find(x => x.innerText.includes('守候'));
        var r = tbody ? tbody.querySelector('[data-case-role][data-case-role-name="女主角"]') : null;
        var first = r ? r.querySelector('[data-case-match]') : null;
        if (!first) return '';
        return JSON.stringify({
          artist: first.getAttribute('data-match-artist'),
          result: first.getAttribute('data-match-result'),
          greenBadge: !!first.querySelector('svg') && first.innerHTML.includes('bg-growth'),
        });
      })(),
      neutralRole: (function(){
        var r = document.querySelector('[data-case-role][data-case-role-name="外景主持"]');
        var list = r ? r.querySelector('[data-case-match-group]') : null;
        return list ? [...list.querySelectorAll('[data-case-match]')]
          .map(x => x.getAttribute('data-match-artist')).join('|') : '';
      })(),
      noHorizontalScroll: (function(){
        var wrap = document.querySelector('[data-case-table]');
        var doc = document.documentElement;
        return !!wrap && wrap.scrollWidth <= wrap.clientWidth + 1
          && doc.scrollWidth <= window.innerWidth + 1;
      })(),
      contentWidth: Math.round(document.querySelector('[data-case-content]')?.getBoundingClientRect().width || 0),
      sidePadding: (function(){
        var d = document.querySelector('[data-case-content]');
        return d ? Math.round(parseFloat(getComputedStyle(d).paddingLeft)) : 0;
      })(),
      rowspans: document.querySelectorAll('[data-case-notice] td[rowspan]').length,
      reservedDimCells: [...document.querySelectorAll('[data-case-reserved="yes"] td')]
        .filter(td => td.className.includes('opacity-60') || td.className.includes('bg-surface-soft')).length,
      reservedNoticeCellDim: (function(){
        var r = document.querySelector('[data-case-reserved="yes"]');
        return r ? r.querySelector('td').className.includes('opacity-60') : null;
      })(),
      hasStateBlockPicker: document.body.innerText.includes('状态块 #'),
      hasPageTitle: document.body.innerText.includes('当期通告 · 所需数值'),
      arrow: document.body.innerText.includes('↳'),
      descriptions: ['数值直接按编号','只列存档里已经排定的批次','字段说明与数值来源','选择会记在本机']
        .filter(x => document.body.innerText.includes(x)).join(','),
      filterBar: !!document.querySelector('[data-case-filters]'),
      searchAboveTable: (function(){
        var s = document.querySelector('[data-case-search]');
        var t = document.querySelector('table');
        var bar = document.querySelector('[data-case-toolbar]');
        return !!s && !!t && !!bar && !bar.contains(s)
          && !!(s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
      })(),
      catChips: document.querySelectorAll('[data-case-cat]').length,
      companyOptions: document.querySelectorAll('[data-case-filter-company] option').length,
      filterCount: document.querySelector('[data-case-filter-count]')?.innerText || '',
      firstNotice: document.querySelector('[data-case-notice]')?.innerText.slice(0, 260) || '',
      head: document.querySelector('table thead')?.innerText || '',
      hasFirmSlot: document.body.innerText.includes('公司槽'),
      csv: [...document.querySelectorAll('button')].some(b => b.innerText.includes('导出 CSV')),
      groups: document.querySelectorAll('[data-case-group]').length,
      groupCode: document.querySelector('[data-case-group-code]')?.getAttribute('data-case-group-code') || '',
      groupRenqi: document.querySelector('[data-case-group-renqi]')?.innerText || '',
      groupMingqi: document.querySelector('[data-case-group-mingqi]')?.innerText || '',
      groupCount: document.querySelector('[data-case-group-count]')?.innerText || '',
      groupLeader: document.querySelector('[data-case-group-leader]')?.innerText || '',
      groupMembers: [...document.querySelectorAll('[data-case-group-member]')].map(x => x.innerText.replace(/\s+/g,'')).join('|'),
      groupMatch: (function(){
        var r = document.querySelector('[data-case-role][data-case-role-name="團體"]');
        var list = r ? r.querySelector('[data-case-match-group]') : null;
        var first = list ? list.querySelector('[data-case-match]') : null;
        if (!first) return '';
        return JSON.stringify({
          artist: first.getAttribute('data-match-artist'),
          result: first.getAttribute('data-match-result'),
          group: first.getAttribute('data-case-match-group'),
          greenBadge: !!first.querySelector('svg') && first.innerHTML.includes('bg-growth'),
        });
      })()
    })`);
    const p = JSON.parse(parsed);
    console.log('parsed:', parsed);
    check(!p.error, 'no parse error', p.error);
    check(p.notices > 0, 'notice rows rendered', String(p.notices));
    check(p.roles > 0 && p.values > 0, 'role rows and value chips rendered', `${p.roles} / ${p.values}`);
    check(/\d+ 条/.test(p.count), 'summary line shown', p.count);
    check(p.csv, 'CSV export button shown');
    check(/★|☆/.test(p.firstNotice), 'difficulty stars rendered');

    // Clock, booking window and shooting period.
    check(p.now.includes('2006/1/29') && p.now.includes('周日'), 'game clock shows the in-game date', p.now);
    check(p.closing.includes('2 条'), '7-day deadline warning counted', p.closing);
    check(p.nextUpdate.includes('2006/1/30') && p.nextUpdate.includes('周一'),
      'next company refresh shown', p.nextUpdate.slice(0, 120));
    // 公司卡片：名字 / 主角在头部，形象 / 知名度 / 公关在 Firm 段，且排在「我方艺人」前面。
    const comp = p.company ? JSON.parse(p.company) : null;
    check(comp?.summary.includes('靠譜傳媒') && comp?.summary.includes('駱佩君'),
      '公司卡片读出头部的公司名与主角姓名', comp?.summary ?? 'none');
    check(comp?.image.includes('注入新血的') && comp?.fame.includes('670')
      && comp?.pr.includes('539'),
      '公司形象 / 知名度 / 公关 从 Firm 段读出来',
      `${comp?.image ?? '-'} ${comp?.fame ?? '-'} ${comp?.pr ?? '-'}`);
    check(comp?.money.includes('115万1527'),
      '资金按亿 / 万拆开显示（1,151,527 → 115万1527）', comp?.money ?? 'none');
    check(comp?.aboveArtists === true,
      '公司卡片排在旗下艺人前面', String(comp?.aboveArtists));
    check(p.closingRows === 2, 'closing notices highlighted', String(p.closingRows));
    check(p.head.includes('接取时间') && p.head.includes('执行期间'),
      'booking window and shooting period columns present', p.head.replace(/\s+/g, ' '));
    check(p.firstNotice.includes('开放') && p.firstNotice.includes('停止'),
      'open and deadline dates sit together', p.firstNotice.replace(/\s+/g, ' ').slice(0, 140));
    check(/共 \d+ 天/.test(p.firstNotice), 'shooting length rendered');
    check(!p.hasFirmSlot, '公司槽 field is hidden');

    // Artist panel: fixed signed roster, collapsible, no picker at all.
    check(!p.hasPageTitle, 'the page-level title is gone');
    check(!p.picker && p.artistCollapsible && p.artistSummary.includes('3 位')
      && p.artistSummary.includes('路敏') && p.artistSummary.includes('萧依莉')
      && p.artistSummary.includes('路风'),
      'signed artists show automatically in a collapsible panel, no picker',
      p.artistSummary);
    check(!p.hasStateBlockPicker, 'no anonymous state-block selector remains');
    check(p.artists === 3, 'three signed-artist cards', String(p.artists));
    check(p.artistAttrs === 3 && p.artistAttrsCount >= 27, 'nine abilities on every artist card',
      `${p.artistAttrs} / ${p.artistAttrsCount}`);
    check(p.artistCounts === 3, 'notice counts on every artist card', String(p.artistCounts));
    check(p.matchCols === 1 && p.matchColHead.includes('数值对比')
      && p.matchLists === p.roles,
      'all artists share one comparison column',
      `${p.matchCols} column / ${p.matchLists} cells / ${p.roles} roles`);
    check(p.head.includes('所需数值') && p.head.indexOf('数值对比') < p.head.indexOf('预约'),
      'the comparison column sits just before the reservation column',
      p.head.replace(/\s+/g, ' '));
    check(p.matches > 0 && p.femaleLead === '路敏|萧依莉'
      && p.neutralRole === '路敏|萧依莉|路风',
      'gender-mismatched artists are dropped, can-accept artists sort first',
      `${p.matches} lines; female=${p.femaleLead}; neutral=${p.neutralRole}`);
    check(p.femaleLeadFirst === JSON.stringify({
      artist: '路敏', result: 'no', greenBadge: false,
    }), 'the first verdict is the sorted top artist (÷10 fix: 萧依莉 no longer auto-accepts)',
      p.femaleLeadFirst);

    // No merged cells: a reserved role dims only its own cells.
    check(p.rowspans === 0, 'the notice table has no merged rows', String(p.rowspans));
    // 预约只来自存档：Auto 存档里守候 / 背叛的男主角都写着黎華（存档里的繁体名）。
    check(p.reservedText === '黎華|黎華' && !p.reservedText.includes('黎华'),
      'the two booked roles show 黎華, read from the save (not hard-coded)',
      p.reservedText || '(none)');
    check(p.tableSelects === 0 && !p.reservePanel,
      'the reservation column is read-only: no dropdown, no settings panel',
      `selects=${p.tableSelects} panel=${p.reservePanel}`);
    check(p.upcoming >= 1 && p.upcomingText.includes('下周更新'),
      'not-yet-open notices are labelled 下周更新', `${p.upcoming} badges / ${p.upcomingText}`);
    check(p.workDays === p.notices && p.workDaysFirst.includes('工作')
      && p.workDaysFirst.includes('每周'),
      'every notice shows its 工作天数 / 每周上限 from the Length table',
      `${p.workDays} badges / ${p.workDaysFirst.replace(/\s+/g, ' ')}`);
    check(p.reservedRows === 0 || (p.reservedNoticeCellDim === false
      && p.reservedDimCells <= 5 * p.reservedRows),
      'only the reserved role cells dim, not the whole notice',
      `firstCell=${p.reservedNoticeCellDim} dimmed=${p.reservedDimCells}`);
    check(!p.arrow, 'the continuation-row arrow is gone');
    check(p.descriptions === '', 'implementation descriptions are not shown on the page',
      p.descriptions);

    // Search and the type/company filters sit directly above the table.
    check(p.filterBar && p.searchAboveTable && p.catChips >= 5 && p.companyOptions >= 9,
      'search plus type/company filters sit above the notice table',
      `${p.catChips} chips / ${p.companyOptions} companies`);
    check(p.noHorizontalScroll && p.contentWidth > 1300
      && p.sidePadding >= 32 && p.sidePadding <= 64,
      'the wider content area keeps a modest side margin and no horizontal scrollbar',
      `width=${p.contentWidth} padding=${p.sidePadding} noScroll=${p.noHorizontalScroll}`);

    // 批次只按表里通告的接取日归并：这三批正好是 1/16、1/23、1/30，
    // 更早的历史批次（1/9）不再进面板，也不做任何推测。
    check(p.updates.includes('归并 3 批') && !p.updates.includes('推测')
      && p.updates.includes('2006/1/16') && p.updates.includes('2006/1/23')
      && p.updates.includes('2006/1/30') && !p.updates.includes('2006/1/9'),
      'batches come from the listed notices only (1/16 · 1/23 · 1/30)');

    // 我方团体：名称与成员都来自存档的 Team 段，没有手动选择入口。
    const grp = JSON.parse(await evaluate(`JSON.stringify({
      groups: document.querySelectorAll('[data-case-group]').length,
      hasPicker: !!document.querySelector('[data-case-group-option]'),
      groupCode: document.querySelector('[data-case-group-code]')?.getAttribute('data-case-group-code') || '',
      groupName: document.querySelector('[data-case-group] .font-semibold')?.innerText || '',
      groupSize: document.querySelectorAll('[data-case-group] [data-case-group-member]').length,
      groupLeader: document.querySelector('[data-case-group-leader]')?.innerText.replace(/\s+/g,'') || '',
      groupMembers: [...document.querySelectorAll('[data-case-group] [data-case-group-member]')]
        .map(x => x.innerText.replace(/\s+/g,'')).join('|'),
      empty: !!document.querySelector('[data-case-groups-empty]'),
    })`));
    check(!grp.empty && grp.groupCode === '101' && grp.groupName === '風敏樂團' && !grp.hasPicker,
      '我方团队从存档读：101 風敏樂團，且没有手动选择入口',
      `${grp.groups} groups / code ${grp.groupCode} / name ${grp.groupName} / picker ${grp.hasPicker}`);
    check(grp.groupSize === 2 && grp.groupLeader.includes('路风')
      && grp.groupMembers.includes('路敏'),
      '团体成员从存档读，第一个是队长',
      `${grp.groupSize} members: ${grp.groupMembers}`);

    // Type and company filters intersect, and reset restores the full list.
    await evaluate(`document.querySelector('[data-case-cat="电视剧"]').click()`);
    await sleep(300);
    const byCat = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      active: document.querySelector('[data-case-cat="电视剧"]')?.getAttribute('aria-pressed'),
      count: document.querySelector('[data-case-filter-count]')?.innerText || ''
    })`));
    check(byCat.notices === 2 && byCat.active === 'true',
      'type chip filters to the two TV dramas', JSON.stringify(byCat));

    await evaluate(`(function(){
      var s = document.querySelector('[data-case-filter-company]');
      var setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(s, 'SoSa電視');
      s.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    const byCompany = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length
    })`));
    check(byCompany.notices === 1, 'type and company filters intersect', JSON.stringify(byCompany));

    await evaluate(`document.querySelector('[data-case-filter-reset]').click()`);
    await sleep(300);
    const afterReset = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      resetGone: !document.querySelector('[data-case-filter-reset]')
    })`));
    check(afterReset.notices === 11 && afterReset.resetGone,
      'reset restores all eleven notices', JSON.stringify(afterReset));

    // 「可接」分两档。Auto 里 11 条中有 8 条还有空角色（3 条下周更新还没开放，
    // 不算），而这 8 条一条都接不上 —— 开局艺人九项数值差 2~4 项。
    const takeChips = JSON.parse(await evaluate(`JSON.stringify({
      slots: document.querySelector('[data-case-filter-slots]')?.innerText.replace(/\\s+/g, ' ') || '',
      qualified: document.querySelector('[data-case-filter-qualified]')?.innerText.replace(/\\s+/g, ' ') || '',
      pressed: [...document.querySelectorAll('[data-case-take-filter] [aria-pressed]')]
        .map(b => b.getAttribute('aria-pressed')).join(',')
    })`));
    check(takeChips.slots.includes('有空位') && takeChips.slots.includes('8')
      && takeChips.qualified.includes('够格能接') && takeChips.qualified.includes('0')
      && takeChips.pressed === 'false,false',
      '「可接」两个标签分开计数：Auto 有空位 8 条、够格能接 0 条，默认都不选中',
      JSON.stringify(takeChips));

    await evaluate(`document.querySelector('[data-case-filter-slots]').click()`);
    await sleep(300);
    const bySlots = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      count: document.querySelector('[data-case-filter-count]')?.innerText.replace(/\\s+/g, ' ') || '',
      pressed: document.querySelector('[data-case-filter-slots]')?.getAttribute('aria-pressed') || '',
      // 每张还在表里的通告都必须至少有一个没被预约的角色格。
      freeCells: [...document.querySelectorAll('[data-case-notice]')].map(tb => tb.querySelectorAll('[data-case-reserved="no"]').length),
      upcoming: document.querySelectorAll('[data-case-upcoming]').length
    })`));
    check(bySlots.notices === 8 && bySlots.pressed === 'true'
      && bySlots.freeCells.every((n) => n > 0),
      '点「有空位」只剩有空角色的 8 条，且每条都真有空位',
      `${bySlots.notices} 条 / ${bySlots.count} / 空位 ${bySlots.freeCells.join(',')}`);
    check(bySlots.count.includes('8 / 11'),
      '筛「有空位」时计数写成 当前 8 / 11 条', bySlots.count);
    check(bySlots.upcoming === 0,
      '「有空位」把下周更新（还没开放）的通告排掉', `${bySlots.upcoming} 条下周更新`);

    // 同 8 条换成「够格能接」应该一条都不剩：空位不等于接得上。
    await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
    await sleep(300);
    const byQualified = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      empty: document.body.innerText.includes('没有符合条件的通告'),
      slotsPressed: document.querySelector('[data-case-filter-slots]')?.getAttribute('aria-pressed') || '',
      qualifiedPressed: document.querySelector('[data-case-filter-qualified]')?.getAttribute('aria-pressed') || '',
      hint: document.querySelector('[data-case-take-hint]')?.innerText || ''
    })`));
    check(byQualified.notices === 0 && byQualified.empty
      && byQualified.slotsPressed === 'false' && byQualified.qualifiedPressed === 'true',
      'Auto 的 8 条空位一条都接不上（数值不够）→ 筛「够格能接」为空',
      `${byQualified.notices} 条 / ${byQualified.empty} / ${byQualified.slotsPressed},${byQualified.qualifiedPressed}`);
    check(byQualified.hint.includes('九项数值'),
      '「够格能接」旁边有一行说明判定口径', byQualified.hint || 'none');

    await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
    await sleep(300);
    const afterTakeOff = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      resetGone: !document.querySelector('[data-case-filter-reset]')
    })`));
    check(afterTakeOff.notices === 11 && afterTakeOff.resetGone,
      '再点一次同一个标签还原，且不再显示重置按钮', JSON.stringify(afterTakeOff));

    // React listens to the native input event; setting .value alone is ignored.
    await evaluate(`(function(){
      var i = document.querySelector('[data-case-search]');
      if (!i) return false;
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, '__no_such_notice__');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(400);
    const filtered = await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      empty: document.body.innerText.includes('没有符合条件的通告')
    })`);
    const f = JSON.parse(filtered);
    check(f.notices === 0 && f.empty, 'search filters notices', filtered);

    // 清空搜索，再切到「拍摄中」：Auto 存档里只有萧依莉那条广告，完成 4 天。
    await evaluate(`(function(){
      var i = document.querySelector('[data-case-search]');
      var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(i, '');
      i.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`);
    await sleep(300);
    await evaluate(`document.querySelector('[data-case-tab="shooting"]').click()`);
    await sleep(400);
    const shot = JSON.parse(await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[data-case-tabs] [role="tab"]').length,
      hasFinishedTab: Boolean(document.querySelector('[data-case-tab="finished"]')),
      openSelected: document.querySelector('[data-case-tab="open"]')?.getAttribute('aria-selected'),
      shootingSelected: document.querySelector('[data-case-tab="shooting"]')?.getAttribute('aria-selected'),
      rows: document.querySelectorAll('[data-case-shooting-row]').length,
      codes: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.getAttribute('data-case-shooting-row')),
      artists: [...document.querySelectorAll('[data-case-shooting-artist]')].map(x => x.innerText),
      roles: [...document.querySelectorAll('[data-case-shooting-role]')].map(x => x.innerText),
      statuses: [...document.querySelectorAll('[data-case-shooting-status]')].map(x => x.getAttribute('data-case-shooting-status')),
      risk: document.querySelector('[data-case-shooting-risk-label]')?.getAttribute('data-case-shooting-risk-label') ?? null,
      progresses: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => {
        var cells = [...r.querySelectorAll('td')].map(td => td.innerText.replace(/\s+/g, ' ').trim());
        return cells.join(' | ');
      }),
      text: document.querySelector('[data-case-shooting]')?.innerText || '',
      noticesHidden: document.querySelectorAll('[data-case-notice]').length,
      noHorizontalScroll: (function(){
        var wrap = document.querySelector('[data-case-shooting]');
        return !!wrap && wrap.scrollWidth <= wrap.clientWidth + 1;
      })()
    })`));
    console.log('shooting:', JSON.stringify(shot));
    check(shot.tabs === 3 && shot.shootingSelected === 'true' && shot.openSelected === 'false',
      '筹备中 / 拍摄中 / 自制通告及其他 三个页签可以切换', `${shot.tabs} tabs`);
    check(!shot.hasFinishedTab,
      '已完成的页签已经去掉，拍完的通告不再单独一档', String(shot.hasFinishedTab));
    check(shot.rows === 1 && shot.codes[0] === 'CF014',
      '拍摄中只列 CF014 愛信電訊（萧依莉那条广告）', shot.codes.join(',') || 'none');
    check(shot.artists.join(',') === '蕭依莉',
      '拍摄中列出接演的艺人', shot.artists.join(',') || 'none');
    check(shot.roles.length === 1 && shot.roles[0].includes('女性') && shot.roles[0].includes('1★'),
      '角色类型和难度都显示在行里', shot.roles.join('|') || 'none');
    check(shot.text.includes('2006/1/23') && shot.text.includes('2006/2/19'),
      '开拍 / 杀青时间带年份显示（游戏跨三年，只写月日看不出来）',
      shot.text.replace(/\s+/g, ' ').slice(0, 120));
    check(shot.text.includes('4') && shot.text.includes('/ 6 天') && shot.text.includes('5,000'),
      '完成天数、需拍天数和酬劳都显示', shot.text.replace(/\s+/g, ' ').slice(0, 90));
    check(shot.risk === null || shot.risk === undefined,
      '余量充足时不出提醒，风险列只留横杠', String(shot.risk));
    check(!shot.text.includes('排得下') && !shot.text.includes('刚好够')
      && !shot.text.includes('赶不上'),
      '不再出现「排得下 / 刚好够 / 赶不上」这类结论文案',
      shot.text.replace(/\s+/g, ' ').slice(0, 120));
    // 一位艺人一行：CF014 只有萧依莉，所以正好一行，且这一行要自己带完成 / 需拍与剩余。
    check(shot.progresses.length === 1
      && shot.progresses[0].includes('4 / 6 天')
      && shot.progresses[0].includes('2 天')
      && shot.progresses[0].includes('5,000'),
      '每位艺人一行，完成 / 需拍 / 剩余 / 酬劳都在这位艺人自己那行',
      shot.progresses[0] ?? 'none');
    check(shot.noticesHidden === 0 && shot.noHorizontalScroll,
      '切到拍摄中后筹备中的表格收起，切换页签不出现横向滚动');
    await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
    await sleep(300);
    const backOpen = JSON.parse(await evaluate(
      `JSON.stringify({ notices: document.querySelectorAll('[data-case-notice]').length })`,
    ));
    check(backOpen.notices === 11, '切回筹备中，表格恢复', JSON.stringify(backOpen));

    // 「自制通告及其他」页签：Auto 还没做过自制通告，应该是空态。
    await evaluate(`document.querySelector('[data-case-tab="self-made"]').click()`);
    await sleep(350);
    const diyEmpty = JSON.parse(await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[data-case-tabs] [role="tab"]').length,
      selected: document.querySelector('[data-case-tab="self-made"]')?.getAttribute('aria-selected'),
      rows: document.querySelectorAll('[data-case-selfmade-row]').length,
      text: document.body.innerText,
      noticesHidden: document.querySelectorAll('[data-case-notice]').length
    })`));
    check(diyEmpty.tabs === 3 && diyEmpty.selected === 'true' && diyEmpty.noticesHidden === 0,
      '自制通告及其他 是第三个页签，切过去会收起筹备中的表格', `${diyEmpty.tabs} tabs`);
    check(diyEmpty.rows === 0 && diyEmpty.text.includes('还没有自制通告'),
      'Auto 存档没有自制通告，页签显示空态', String(diyEmpty.rows));

    // Ending0004：20 条自制通告，顺序 / 名字 / 天数 / 接演都要与游戏列表一致。
    const diyPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Ending0004.sa2';
    if (fs.existsSync(diyPath)) {
      const diyCopy = path.join(root, '.tmp', 'case-e2e-diy.sa2');
      fs.copyFileSync(diyPath, diyCopy);
      await uploadSave(diyCopy);
      await evaluate(`document.querySelector('[data-case-tab="self-made"]').click()`);
      await sleep(400);
      const diy = JSON.parse(await evaluate(`JSON.stringify({
        rows: [...document.querySelectorAll('[data-case-selfmade-row]')].map(r => r.getAttribute('data-case-selfmade-row')),
        text: document.querySelector('[data-case-selfmade]')?.innerText || '',
        summary: document.querySelector('[data-case-selfmade-summary]')?.innerText || '',
        casts: [...document.querySelectorAll('[data-case-selfmade-cast]')].map(x => Number(x.getAttribute('data-case-selfmade-cast'))),
        statuses: [...document.querySelectorAll('[data-case-selfmade-row]')].map(r => r.getAttribute('data-case-selfmade-status')),
        artists: [...document.querySelectorAll('[data-case-selfmade-artist]')].map(x => x.innerText),
        roles: [...document.querySelectorAll('[data-case-selfmade-role]')].map(x => x.innerText),
        tv601: [...document.querySelectorAll('[data-case-selfmade-row="TV601"]')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()),
        days: [...document.querySelectorAll('[data-case-selfmade-row]')].map(r => ({
          code: r.getAttribute('data-case-selfmade-row'),
          days: r.querySelector('[data-case-selfmade-days]')?.getAttribute('data-case-selfmade-days') || ''
        })),
        filters: [...document.querySelectorAll('[data-case-selfmade-filter]')].map(b => b.getAttribute('data-case-selfmade-filter')),
        first: document.querySelector('[data-case-selfmade-row]')?.innerText.replace(/\\s+/g, ' ').trim() || '',
        noHorizontalScroll: (function(){
          var w = document.querySelector('[data-case-selfmade]');
          return !!w && w.scrollWidth <= w.clientWidth + 1;
        })()
      })`));
      const diyCodes = [...new Set(diy.rows)];
      console.log('self-made:', diy.rows.length, 'rows /', diyCodes.length, 'notices');
      check(diyCodes.length === 20 && diyCodes[0] === 'CD701' && diyCodes[19] === 'CD723',
        'Ending0004: 自制通告 20 条，顺序与游戏列表一致',
        `${diyCodes.length} 条 / ${diyCodes[0]} … ${diyCodes.at(-1)}`);
      check(diy.rows.length > diyCodes.length,
        '一条通告有几位自家艺人就占几行，不再挤成一条',
        `${diy.rows.length} 行 / ${diyCodes.length} 条`);
      check(diy.tv601.length === 4
        && diy.tv601.map((row) => row.includes('男主角') || row.includes('女主角')
          || row.includes('男配角') || row.includes('女配角')).every(Boolean),
        'Ending0004: 握斧長龍 四位艺人各占一行，角色分别是男女主角 / 男女配角',
        diy.tv601.map((row) => row.slice(0, 60)).join(' || ') || 'none');
      check(diy.statuses.includes('done') && diy.statuses.includes('pending')
        && diy.text.includes('已完成') && diy.text.includes('未开拍'),
        'Ending0004: 状态由档期推出来（已完成 / 没人接的就是未开拍）',
        [...new Set(diy.statuses)].join(','));
      // 拍摄天数必须一人一份：握斧長龍 四位自家艺人是 21/21/14/14，不是
      // 拿通告级的天数糊一行给四个人。
      const tv601Days = diy.days.filter((row) => row.code === 'TV601').map((row) => row.days);
      // 需拍天数按角色查长度表（连续剧男/女主角 45、配角 20），结局存档把
      // 「已完成」清零了，页面上按拍满补回，所以是 45/45 与 20/20。
      check(tv601Days.join(',') === '45/45,45/45,20/20,20/20',
        'Ending0004: 握斧長龍 一人一行，各带自己的完成 / 需拍天数',
        tv601Days.join(' ') || 'none');
      check(diy.text.includes('2008/6/30') && diy.text.includes('2008/9/1')
        && diy.text.includes('2008/12/1') && diy.text.includes('2009/2/7'),
        'Ending0004: 自制通告的开拍 / 杀青也带年份，跨年档期能看出来');
      check(diy.text.includes('有朋自遠方來') && diy.text.includes('握斧長龍')
        && diy.text.includes('唐朝栗子') && diy.text.includes('新涼時節'),
        '自制通告的名字都显示出来（含只有 data1 静态表才有的那批）');
      check(diy.first.includes('CD701') && diy.first.includes('唱片')
        && diy.first.includes('25 天') && diy.first.includes('姚子奇'),
        '每行给名称 / 编码 / 类别 / 天数 / 接演艺人', diy.first.slice(0, 90));
      check(diy.text.includes('握斧長龍') && diy.text.includes('共 64 天')
        && diy.text.includes('还没有艺人接'),
        '档期天数与「还没人接」的提示都在表里');
      const emptyRows = diy.rows.filter((code, i) => diy.casts[i] === 0);
      check(new Set(emptyRows).size === 8,
        '12 条已接 / 8 条没人接，与存档一致',
        `empty=${new Set(emptyRows).size}`);
      check(diy.summary.includes('共 20 条') && diy.summary.includes('唱片 15')
        && diy.summary.includes('电视剧 5') && diy.summary.includes('还没人接 8 条'),
        '汇总条给出条数、类别分布与接演情况',
        diy.summary.replace(/\s+/g, ' ').slice(0, 90));
      // 汇总条上的每个数字都是筛选标签：点一下只看这一类，再点一下还原。
      check(['all', 'cat:唱片', 'cat:电视剧', 'status:done', 'status:pending']
        .every((key) => diy.filters.includes(key)),
        '汇总条上的每个数字都是可点的筛选标签', diy.filters.join(' '));
      await evaluate(`document.querySelector('[data-case-selfmade-filter="cat:电视剧"]').click()`);
      await sleep(300);
      const filtered = JSON.parse(await evaluate(`JSON.stringify({
        codes: [...new Set([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.getAttribute('data-case-selfmade-row')))],
        summary: document.querySelector('[data-case-selfmade-summary]')?.innerText.replace(/\\s+/g, ' ') || '',
        pressed: document.querySelector('[data-case-selfmade-filter="cat:电视剧"]')?.getAttribute('aria-pressed')
      })`));
      check(filtered.codes.length === 5 && filtered.pressed === 'true'
        && filtered.summary.includes('当前 5 / 20 条'),
        '点「电视剧」只看电视剧，汇总条改成 当前 5 / 20 条',
        `${filtered.codes.join(',')} | ${filtered.summary.slice(0, 50)}`);
      await evaluate(`document.querySelector('[data-case-selfmade-filter="cat:电视剧"]').click()`);
      await sleep(300);
      const restored = JSON.parse(await evaluate(`JSON.stringify({
        codes: [...new Set([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.getAttribute('data-case-selfmade-row')))].length,
        summary: document.querySelector('[data-case-selfmade-summary]')?.innerText.replace(/\\s+/g, ' ') || ''
      })`));
      check(restored.codes === 20 && restored.summary.includes('还没人接 8 条'),
        '再点一次同一个标签就还原成全部 20 条', `${restored.codes} 条`);
      await evaluate(`document.querySelector('[data-case-selfmade-filter="status:pending"]').click()`);
      await sleep(300);
      const pendingOnly = JSON.parse(await evaluate(`JSON.stringify({
        statuses: [...new Set([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.getAttribute('data-case-selfmade-status')))],
        rows: document.querySelectorAll('[data-case-selfmade-row]').length
      })`));
      check(pendingOnly.statuses.length === 1 && pendingOnly.statuses[0] === 'pending'
        && pendingOnly.rows > 0,
        '按状态筛选只留「未开拍」的行',
        `${pendingOnly.statuses.join(',')} / ${pendingOnly.rows} 行`);
      await evaluate(`document.querySelector('[data-case-selfmade-filter="all"]').click()`);
      await sleep(250);
      check(diy.noHorizontalScroll, '自制通告表不出现横向滚动');
    } else {
      console.log('SKIP Ending0004.sa2 not present, self-made table not checked');
    }

    // Story0055：天数真值按游戏界面核过 —— 卫亚 22/25 还差 3、聆香 10/25 还差 15。
    const s55Path = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0055.sa2';
    if (fs.existsSync(s55Path)) {
      const copy = path.join(root, '.tmp', 'case-e2e-55.sa2');
      fs.copyFileSync(s55Path, copy);
      await evaluate(`document.querySelector('[data-case-tab="self-made"]').click()`);
      await sleep(200);
      await uploadSave(copy);
      const diy55 = JSON.parse(await evaluate(`JSON.stringify({
        days: [...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.querySelector('[data-case-selfmade-days]')?.getAttribute('data-case-selfmade-days') || ''),
        statuses: [...new Set([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.getAttribute('data-case-selfmade-status')))],
        groups: [...document.querySelectorAll('[data-case-selfmade-group]')]
          .map(x => x.getAttribute('data-case-selfmade-group') + '|' + x.innerText.replace(/\\s+/g, ' ')),
        text: document.querySelector('[data-case-selfmade]')?.innerText.replace(/\\s+/g, ' ') || ''
      })`));
      check(diy55.days.includes('22/25') && diy55.days.includes('10/25'),
        'Story0055: 需拍天数取长度表（有朋自遠方來 22/25、傾城之戀 10/25），不是自己相加',
        diy55.days.join(' '));
      check(diy55.text.includes('还差 3 天') && diy55.text.includes('还差 15 天'),
        'Story0055: 还差天数由 总天数 - 已完成 算出（3 天 / 15 天）');
      check(diy55.statuses.includes('overdue') && diy55.text.includes('已逾期'),
        'Story0055: 档期已过还差 3 天的那条标成已逾期', diy55.statuses.join(','));
      // 夢的十四行詩 是团体专辑：艺人列写团名 + 队长 / 团员，不写「新名纱雪」一个人。
      check(diy55.groups.some((g) => g.startsWith('沙啞之歌|') && g.includes('队长 新名纱雪')
        && g.includes('团员 卫亚')),
        'Story0055: 团体通告显示签约团体 沙啞之歌（队长 / 团员都在）',
        diy55.groups.join(' || ') || 'none');

      // 同一个存档切回「筹备中」：后期艺人数值够了，9 条有空位就都够格能接，
      // 与 Auto 那份「有空位 8 / 够格 0」正好是两个极端。
      await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
      await sleep(300);
      const take55 = JSON.parse(await evaluate(`JSON.stringify({
        slots: document.querySelector('[data-case-filter-slots]')?.innerText.replace(/\\s+/g, ' ') || '',
        qualified: document.querySelector('[data-case-filter-qualified]')?.innerText.replace(/\\s+/g, ' ') || ''
      })`));
      check(take55.slots.includes('9') && take55.qualified.includes('9'),
        'Story0055: 有空位 9 条、够格能接 9 条（后期数值够）', JSON.stringify(take55));

      await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
      await sleep(300);
      const qual55 = JSON.parse(await evaluate(`JSON.stringify({
        notices: document.querySelectorAll('[data-case-notice]').length,
        count: document.querySelector('[data-case-filter-count]')?.innerText.replace(/\\s+/g, ' ') || '',
        okRows: [...document.querySelectorAll('[data-case-notice]')]
          .every(tb => tb.querySelector('[data-match-result="yes"]'))
      })`));
      check(qual55.notices === 9 && qual55.okRows && qual55.count.includes('9 / 11'),
        'Story0055: 筛「够格能接」只剩 9 条，且每条都有「数值够」的艺人',
        `${qual55.notices} 条 / ${qual55.count} / ok=${qual55.okRows}`);
      await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
      await sleep(300);
    } else {
      console.log('SKIP Story0055.sa2 not present, day counts not checked');
    }

    // 换成 Story0027：「守候」里史蒂芬 / 方若綺不是旗下艺人，只该留克烈斯一行。
    const ownPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0027.sa2';
    if (fs.existsSync(ownPath)) {
      const copy = path.join(root, '.tmp', 'case-e2e-own.sa2');
      fs.copyFileSync(ownPath, copy);
      await evaluate(`document.querySelector('[data-case-tab="shooting"]').click()`);
      await sleep(200);
      await uploadSave(copy);
      const own = JSON.parse(await evaluate(`JSON.stringify({
        artists: [...document.querySelectorAll('[data-case-shooting-artist]')].map(x => x.innerText),
        codes: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.getAttribute('data-case-shooting-row')),
        rows: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()),
        text: document.querySelector('[data-case-shooting]')?.innerText || ''
      })`));
      console.log('own:', JSON.stringify(own.artists), own.codes.join(','));
      check(!own.artists.includes('史蒂芬') && !own.artists.includes('方若綺'),
        '对手公司的演员不进拍摄中', own.artists.join(',') || 'none');
      check(own.artists.includes('克烈斯') && own.codes.includes('TV021'),
        '自家艺人克烈斯仍在守候这一行', own.artists.join(','));
      check(!own.text.includes('史蒂芬') && !own.text.includes('方若綺'),
        '史蒂芬 / 方若綺 连名字都不出现在表里',
        own.text.replace(/\s+/g, ' ').slice(0, 80));

      // Story0024：CF728 今天刚拍满 6 天（杀青日就是今天），整条都不再列进拍摄中。
      const donePath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0024.sa2';
      if (fs.existsSync(donePath)) {
        const doneCopy = path.join(root, '.tmp', 'case-e2e-done.sa2');
        fs.copyFileSync(donePath, doneCopy);
        await uploadSave(doneCopy);
        await evaluate(`document.querySelector('[data-case-tab="shooting"]').click()`);
        await sleep(350);
        const done = JSON.parse(await evaluate(`JSON.stringify({
          codes: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.getAttribute('data-case-shooting-row')),
          text: document.querySelector('[data-case-shooting]')?.innerText || ''
        })`));
        console.log('story0024:', done.codes.join(','));
        check(!done.codes.includes('CF728'),
          '拍满天数的 CF728 不再占拍摄中的行', done.codes.join(',') || 'none');
      } else {
        console.log('OK   Story0024.sa2 not present, skipped the wrapped-cast check');
      }
    } else {
      console.log('OK   Story0027.sa2 not present, skipped the own-artist checks');
    }
    await navigate('http://localhost:5173/sweet.html');
    const sweetState = JSON.parse(await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[role="tab"]').length,
      caseTab: !!document.querySelector('[data-tab="case"]')
    })`));
    console.log('sweet:', JSON.stringify(sweetState));
    check(sweetState.tabs === 3 && !sweetState.caseTab, '甜蜜乐章 keeps its own three tabs');
  } finally {
    close();
  }

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
