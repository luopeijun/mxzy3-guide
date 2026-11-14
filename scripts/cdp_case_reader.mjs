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
    // 预约只来自存档；读不到就不编，所以这里断言页面不出现凭印象写死的名字。
    check(!p.reservedText.includes('黎华'),
      'no hard-coded reservation names on the page', p.reservedText || '(none)');
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

    // Same tab, same CDP session: no extra targets are created.
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
