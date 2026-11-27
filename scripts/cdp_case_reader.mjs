import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSX from 'xlsx';

/* Browser regression for the 存档解析 tab:
 *   1) the main site has five tabs, #/case renders the reader and the bundled
 *      static table loads;
 *   2) injecting a real .sa2 through the hidden file input renders the notice
 *      table with rolled values, the game clock, artist cards, the booking
 *      window, shooting period, reservations and the company refresh timeline;
 *   3) the search box filters the notices;
 *   4) 甜蜜乐章 keeps its own four tabs (its reader is an entry placeholder).
 *
 * Needs the dev server on localhost:5173 and CDP on 127.0.0.1:9339.
 * IMPORTANT: one debug tab is reused for the whole run. Repeatedly calling
 * /json/new piles up hundreds of idle tabs until Chrome stops responding.
 * Usage: node scripts/cdp_case_reader.mjs [path/to/save.sa2]
 */

const PORT = '9339';
const BASE = `http://127.0.0.1:${PORT}`;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Default to the frozen probe.sa2 snapshot: the game rewrites Save2/Auto.sa2
// while running (date / money / items drift), which broke exact-value assertions.
const SNAP = path.join(root, 'tests', 'fixtures', 'saves');
const SOURCE = process.argv[2] ?? path.join(SNAP, 'probe.sa2');
const SAVE = path.join(root, '.tmp', 'case-e2e.sa2');
const MEMO = path.join(root, '.tmp', 'case-memo-e2e.xlsx');
fs.mkdirSync(path.dirname(SAVE), { recursive: true });

/** Small in-memory Excel fixture for the 本周便签 tests. Kept in .tmp so the
 *  regression never depends on the user's own (gitignored) memo workbook. */
function writeMemoFixture() {
  const rows = [
    ['年', '月', '周次', '日期区间', '当周排班', '心得备注'],
    [1, 1, 5, '2006.1.29-2006.2.4', '去开罗给初始女艺人买礼物；去公园找古芊青；', '找古芊青要第二次再去（知名度 > 100），事件中选择「自告奋勇」'],
    [1, 2, 1, '2006.2.5-2006.2.11', '第二周排班', '第二周备注'],
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '备忘录');
  XLSX.writeFile(book, MEMO);
}
writeMemoFixture();
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
    check(s.tabs === 5, 'main site has five tabs', String(s.tabs));
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

    /** 备忘录独立于存档，隐藏输入框只在结果渲染后挂载。 */
    const uploadMemo = async (file) => {
      const fresh = await send('DOM.getDocument', { depth: -1 });
      const input = await send('DOM.querySelector', { nodeId: fresh.root.nodeId, selector: '[data-case-memo-upload]' });
      if (!input.nodeId) throw new Error('memo file input not found in DOM');
      await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [file] });
      await sleep(1200);
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
      artistTitles: [...document.querySelectorAll('[data-case-artist-title]')]
        .map(x => (x.innerText || '').replace(/\\s+/g, ' ').trim()),
      artistLines: [...document.querySelectorAll('[data-case-artist-title]')]
        .map(x => x.dataset.titleLine || ''),
      artistTitleInk: [...document.querySelectorAll('[data-case-artist-title]')]
        .map(x => { const s = getComputedStyle(x); return s.color + '/' + s.backgroundColor; }),
      artistCollapsible: (function(){
        var d = document.querySelector('[data-case-artists]');
        return !!d && d.tagName === 'DETAILS' && !!d.querySelector('summary');
      })(),
      artistSummary: document.querySelector('[data-case-artists-summary]')?.innerText || '',
      picker: !!document.querySelector('[data-case-artist-picker]'),
      companyAwards: (document.querySelector('[data-case-company-awards]')?.innerText || '')
        .replace(/\\s+/g, ' ').trim() || null,
      companyAwardChips: document.querySelectorAll('[data-case-company-award]').length,
      artistAwards: [...document.querySelectorAll('[data-case-artist-award]')]
        .map(x => (x.innerText || '').replace(/\\s+/g, ' ').trim()),
      artistCompanyAwards: [...document.querySelectorAll('[data-case-artist-company-awards]')]
        .map(x => (x.innerText || '').replace(/\\s+/g, ' ').trim()),
      updates: (function(){ var d = document.querySelector('[data-case-updates]'); if (!d) return ''; d.open = true; return d.textContent || ''; })(),
      closingRows: document.querySelectorAll('[data-case-status="closing"]').length,
      reservedRows: document.querySelectorAll('[data-case-reserved="yes"]').length,
      reservedText: [...document.querySelectorAll('[data-case-reserved="yes"] [data-case-reservation]')].map(x => x.innerText).join('|'),
      workDays: document.querySelectorAll('[data-case-workdays]').length,
      workDaysFirst: document.querySelector('[data-case-workdays]')?.innerText || '',
      workDayBadges: (function(){
        var box = document.querySelector('[data-case-workdays]');
        if (!box) return JSON.stringify({ blocks:0 });
        var spans = [...box.querySelectorAll(':scope > span')];
        var styles = spans.map(function(x){ var s = getComputedStyle(x); return { bg:s.backgroundColor, display:s.display }; });
        var outer = getComputedStyle(box);
        return JSON.stringify({
          blocks: spans.length,
          backgrounds: styles.map(function(x){ return x.bg; }),
          displays: styles.map(function(x){ return x.display; }),
          outerBg: outer.backgroundColor,
          texts: spans.map(function(x){ return x.innerText.replace(/\\s+/g, ' ').trim(); }),
        });
      })(),
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
          greenBadge: !!first.querySelector('svg') && first.innerHTML.includes('bg-title-model-soft'),
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
      tocLinks: document.querySelectorAll('[data-case-toc-link]').length,
      tocHasNotices: !!document.querySelector('[data-case-toc-link="notices"]'),
      tocToggle: !!document.querySelector('[data-case-toc-toggle]'),
      tocCollapsed: (function(){
        var b = document.querySelector('[data-case-toc-toggle]');
        return b ? b.getAttribute('aria-expanded') === 'false' : null;
      })(),
      tocPad: (function(){
        var n = document.querySelector('[data-case-toc]');
        return n ? getComputedStyle(n).paddingLeft : '';
      })(),
      quickPad: (function(){
        var n = document.querySelector('[data-case-quickref]');
        return n ? getComputedStyle(n).paddingLeft : '';
      })(),
      tocTop: (function(){
        var n = document.querySelector('[data-case-toc]');
        return n ? Math.round(n.getBoundingClientRect().top) : -1;
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
        var t = document.querySelector('[data-case-table] table');
        var bar = document.querySelector('[data-case-toolbar]');
        return !!s && !!t && !!bar && !bar.contains(s)
          && !!(s.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING);
      })(),
      catChips: document.querySelectorAll('[data-case-cat]').length,
      companyOptions: document.querySelectorAll('[data-case-filter-company] option').length,
      filterCount: document.querySelector('[data-case-filter-count]')?.innerText || '',
      firstNotice: document.querySelector('[data-case-notice]')?.innerText.slice(0, 260) || '',
      head: document.querySelector('[data-case-table] table thead')?.innerText || '',
      hasFirmSlot: document.body.innerText.includes('公司槽'),
      csv: [...document.querySelectorAll('button')].some(b => b.innerText.includes('导出 CSV')),
      groups: document.querySelectorAll('[data-case-group]').length,
      groupCode: document.querySelector('[data-case-group-code]')?.getAttribute('data-case-group-code') || '',
      groupRenqi: document.querySelector('[data-case-group-popularity]')?.innerText || '',
      groupMingqi: document.querySelector('[data-case-group-fame]')?.innerText || '',
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
          greenBadge: !!first.querySelector('svg') && first.innerHTML.includes('bg-title-model-soft'),
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

    // NP鸡头像必须用 Vite base 相对路径；线上 GitHub Pages 有子路径，写死 /xxx 会 404。
    // 开发服务器会把 BASE_URL 归一化成 '/'，所以源码层检查 + 浏览器层加载分开断言。
    // 浮窗外壳已抽到 src/ui/AssistantDock.tsx，鸡仔头像在那里渲染。
    const assistantSource = fs.readFileSync(
      path.join(root, 'src', 'ui', 'AssistantDock.tsx'), 'utf8');
    check(assistantSource.includes('${import.meta.env.BASE_URL}six-notice-mascot.png')
      && !assistantSource.includes('src="/six-notice-mascot.png"'),
    'NP鸡头像源码使用 base 相对路径');
    const mascot = JSON.parse(await evaluate(`JSON.stringify((() => {
      const img = document.querySelector('[data-case-mascot]');
      return {
        src: img?.getAttribute('src') || '',
        loaded: !!img && img.complete && img.naturalWidth > 0,
      };
    })())`));
    check(mascot.src.endsWith('six-notice-mascot.png') && mascot.loaded,
      'NP鸡头像在页面中加载成功', JSON.stringify(mascot));

    // Clock, booking window and shooting period.
    check(p.now.includes('2006/1/29') && p.now.includes('周日'), 'game clock shows the in-game date', p.now);
    check(p.closing.includes('2 条'), '7-day deadline warning counted', p.closing);
    check(p.nextUpdate.includes('2006/1/30') && p.nextUpdate.includes('周一'),
      'next company refresh shown', p.nextUpdate.slice(0, 120));
    // 公司卡片：名字 / 主角在头部，形象 / 知名度 / 公关在 Firm 段，且排在「我方艺人」前面。
    const comp = p.company ? JSON.parse(p.company) : null;
    check(comp?.summary.includes('靠譜傳媒') && comp?.summary.includes('駱佩君'),
      '公司卡片读出头部的公司名与主角姓名', comp?.summary ?? 'none');
    check(comp?.image.includes('注入新血的') && comp?.fame.includes('67')
      && comp?.pr.includes('53.9'),
      '公司形象 / 知名度 / 公关 从 Firm 段读出来（×10 的已除回）',
      `${comp?.image ?? '-'} ${comp?.fame ?? '-'} ${comp?.pr ?? '-'}`);
    check(comp?.money.includes('115万1527'),
      '资金按亿 / 万拆开显示（1,151,527 → 115万1527）', comp?.money ?? 'none');
    check(comp?.aboveArtists === true,
      '公司卡片排在旗下艺人前面', String(comp?.aboveArtists));
    // 奖项：个人奖在艺人卡里，公司奖（年度专辑等）在公司卡另起一行、
    // 艺人卡里只留一行灰字，两边都不混。
    check(p.companyAwards !== null, '公司卡里有「奖项」一行', p.companyAwards ?? 'none');
    if (p.artistAwards.length > 0) {
      check(p.artistAwards.every((t) => /^(金曲奖|金像奖|金钟奖|金星奖)·/.test(t)),
        '个人奖项一律带颁奖礼前缀', p.artistAwards.join(' | '));
      check(p.artistAwards.every((t) => !/年度专辑|年度戏剧|最佳团体/.test(t)),
        '公司奖没有混进个人奖项', p.artistAwards.join(' | '));
      console.log('    个人奖项:', p.artistAwards.join(' | '));
      console.log('    公司奖项:', p.artistCompanyAwards.join(' | ') || '无');
    } else {
      console.log('OK   这份存档还没有奖项，跳过奖项文案检查');
    }
    // 道具：默认收起，标题改为「道具」；按类型分三个页签，每页 10 件内部分页。
    const items = JSON.parse(await evaluate(`(function(){
      var d = document.querySelector('[data-case-items]');
      if (!d) return JSON.stringify({ exists:false });
      var summary = d.querySelector('[data-case-items-summary]')?.innerText.replace(/\\s+/g,' ') || '';
      return JSON.stringify({ exists:true, open: d.hasAttribute('open'), summary: summary });
    })()`));
    check(items.exists && !items.open,
      '道具默认收起（在我方团体下方）', JSON.stringify(items));
    check(items.summary.includes('道具') && items.summary.includes('21 件'),
      '收起态概要写出「道具 21 件」', items.summary ?? 'none');
    // 展开后再读页签与默认页内容（收起时元素 display:none，innerText 为空）。
    await evaluate(`document.querySelector('[data-case-items-summary]').click()`);
    await sleep(250);
    const tabInfo = JSON.parse(await evaluate(`(function(){
      var tabs = [...document.querySelectorAll('[data-case-item-tab]')].map(function(t){
        return {
          cat: t.getAttribute('data-case-item-tab'),
          count: parseInt(t.getAttribute('data-case-item-count') || '-1', 10),
          active: t.getAttribute('aria-selected') === 'true',
          text: (t.innerText || '').replace(/\\s+/g, ' '),
        };
      });
      var rows = [...document.querySelectorAll('[data-case-item]')];
      var pager = document.querySelector('[data-case-item-pager]');
      return JSON.stringify({ tabs: tabs, count: rows.length, hasPager: !!pager });
    })()`));
    check(tabInfo.tabs.length === 3, '道具分三个分类页签', JSON.stringify(tabInfo.tabs.map(t => t.cat)));
    const tabCounts = {};
    tabInfo.tabs.forEach((t) => { tabCounts[t.cat] = t.count; });
    check(tabCounts['一般物品'] === 4 && tabCounts['特殊物品'] === 15 && tabCounts['公司物品'] === 2,
      '三个页签计数 = 一般4 / 特殊15 / 公司2', JSON.stringify(tabCounts));
    const activeTab = tabInfo.tabs.find((t) => t.active);
    check(activeTab && activeTab.cat === '一般物品' && tabInfo.count === 4 && !tabInfo.hasPager,
      '默认激活「一般物品」，列出 4 件且无需翻页', JSON.stringify({ active: activeTab && activeTab.cat, count: tabInfo.count, pager: tabInfo.hasPager }));

    // 一般物品新增「好感度」列：按当前存档签约艺人反查 Item.dat 送礼向量。
    const giftColumn = JSON.parse(await evaluate(`(function(){
      var table = document.querySelector('[data-case-item-table]');
      var head = table ? [...table.querySelectorAll('thead th')].map(function(th){ return th.innerText.replace(/\\s+/g, ' ').trim(); }) : [];
      var rows = [...document.querySelectorAll('[data-case-item]')].map(function(row){
        return {
          code: row.getAttribute('data-case-item-code'),
          hints: [...row.querySelectorAll('[data-case-item-gift] [data-case-item-gift-name]')].map(function(x){
            return x.getAttribute('data-case-item-gift-name') + '+' + x.getAttribute('data-case-item-gift-value');
          }),
        };
      });
      return JSON.stringify({ head: head, rows: rows });
    })()`));
    check(giftColumn.head.includes('好感度'),
      '一般物品表出现「好感度」列', JSON.stringify(giftColumn.head));
    check(giftColumn.rows.some(r => r.hints.includes('萧依莉+4'))
      && giftColumn.rows.some(r => r.hints.includes('路敏+3')),
      'probe 存档一般物品按签约艺人显示好感加成（萧依莉+4 / 路敏+3）',
      JSON.stringify(giftColumn.rows));

    // 列宽裁决：名称(含属性)/类型/说明必须单行完整，好感度徽标统一品牌色系。
    const itemLayout = JSON.parse(await evaluate(`(function(){
      function lines(cell){
        var r=document.createRange(); r.selectNodeContents(cell);
        var tops=[].slice.call(r.getClientRects()).map(function(x){return x.top}).sort(function(a,b){return a-b});
        if(!tops.length) return 0;
        var n=1; for(var i=1;i<tops.length;i++){ if(tops[i]-tops[i-1]>7) n++; }
        return n;
      }
      var tr=[...document.querySelectorAll('[data-case-item-table] tbody tr')].filter(function(x){return x.hasAttribute('data-case-item-code')});
      var wrapped=tr.filter(function(row){ return lines(row.children[1])>1 || lines(row.children[2])>1 || lines(row.children[5])>1; }).length;
      var badges=[...document.querySelectorAll('[data-case-item-gift-name]')];
      var cls=badges.map(function(b){return b.className});
      // 统一色系：不应再出现 accept / surface-soft 底的老三档
      var offPalette=cls.filter(function(c){return /accept-soft|text-accept|text-ink-muted/.test(c)}).length;
      return JSON.stringify({ wrapped:wrapped, rows:tr.length, badgeCount:badges.length, offPalette:offPalette });
    })()`));
    check(itemLayout.wrapped === 0 && itemLayout.rows > 0,
      '一般物品名称/类型/说明均单行完整展示，不换行', JSON.stringify(itemLayout));
    check(itemLayout.badgeCount > 0 && itemLayout.offPalette === 0,
      '好感度徽标统一品牌色系（无旧 accept/灰 混色）', JSON.stringify(itemLayout));

    // 切到「特殊物品」：15 件 → 第 1 页 10 行 + 翻页。
    await evaluate(`[...document.querySelectorAll('[data-case-item-tab]')].find(t => t.getAttribute('data-case-item-tab') === '特殊物品').click()`);
    await sleep(200);
    const special1 = JSON.parse(await evaluate(`(function(){
      var rows = [...document.querySelectorAll('[data-case-item]')];
      var info = document.querySelector('[data-case-item-pageinfo]')?.innerText.replace(/\\s+/g, ' ') || '';
      var tr = document.querySelectorAll('[data-case-item-table] tbody tr').length;
      return JSON.stringify({ count: rows.length, info: info, tr: tr });
    })()`));
    check(special1.count === 10 && /第 1 \/ 2 页/.test(special1.info) && special1.tr === 10,
      '特殊物品第 1 页 10 件、分页显示「第 1 / 2 页」、表格恒为 10 行不跳动', JSON.stringify(special1));

    // 防跳动回归：第 1 页与第 2 页的表格容器高度必须一致（翻页器才不上下跳）。
    const h1 = await evaluate(`document.querySelector('[data-case-item-table]').getBoundingClientRect().height`);
    await evaluate(`document.querySelector('[data-case-item-next]').click()`);
    await sleep(200);
    const h2 = await evaluate(`document.querySelector('[data-case-item-table]').getBoundingClientRect().height`);
    check(Math.abs(h1 - h2) <= 2, '特殊物品翻页时表格容器高度恒定（翻页器不跳动）', `h1=${Math.round(h1)} h2=${Math.round(h2)}`);
    await evaluate(`document.querySelector('[data-case-item-prev]').click()`);
    await sleep(200);

    // 在特殊物品两个页里找 917；先第 1 页，没有就翻下一页。
    let nine17 = await evaluate(`(function(){
      var r = [...document.querySelectorAll('[data-case-item]')].find(x => x.getAttribute('data-case-item-code') === '917');
      if (r) return JSON.stringify({ found: true, qty: r.getAttribute('data-case-item-qty'), name: r.querySelector('[data-case-item-name]').innerText, cat: r.getAttribute('data-case-item-cat') });
      return JSON.stringify({ found: false });
    })()`);
    nine17 = JSON.parse(nine17);
    if (!nine17.found) {
      await evaluate(`document.querySelector('[data-case-item-next]').click()`);
      await sleep(200);
      nine17 = JSON.parse(await evaluate(`(function(){
        var r = [...document.querySelectorAll('[data-case-item]')].find(x => x.getAttribute('data-case-item-code') === '917');
        return JSON.stringify({ found: true, qty: r.getAttribute('data-case-item-qty'), name: r.querySelector('[data-case-item-name]').innerText, cat: r.getAttribute('data-case-item-cat') });
      })()`));
    }
    check(nine17.found && nine17.qty === '1' && nine17.name.includes('唇印') && nine17.cat === '特殊物品',
      '编号 917 在特殊物品页签内：附着唇印的卡片 / 特殊物品 / 数量 1', JSON.stringify(nine17));

    // 翻到最后一页应是 5 行且下一页禁用。
    const specialLast = JSON.parse(await evaluate(`(function(){
      var btn = document.querySelector('[data-case-item-next]');
      var guard = 0;
      while (btn && !btn.disabled && guard < 10) { btn.click(); guard++; }
      var rows = [...document.querySelectorAll('[data-case-item]')];
      var info = document.querySelector('[data-case-item-pageinfo]')?.innerText.replace(/\\s+/g, ' ') || '';
      var tr = document.querySelectorAll('[data-case-item-table] tbody tr').length;
      return JSON.stringify({ count: rows.length, info: info, nextDisabled: document.querySelector('[data-case-item-next]').disabled, tr: tr });
    })()`));
    check(specialLast.count === 5 && /第 2 \/ 2 页/.test(specialLast.info) && specialLast.nextDisabled && specialLast.tr === 10,
      '特殊物品最后一页 5 件、下一页按钮禁用、表格恒为 10 行不跳动', JSON.stringify(specialLast));

    // 切到「公司物品」：2 件，编号 4 白板与 301 鱼缸均为公司物品。
    await evaluate(`[...document.querySelectorAll('[data-case-item-tab]')].find(t => t.getAttribute('data-case-item-tab') === '公司物品').click()`);
    await sleep(200);
    const company = JSON.parse(await evaluate(`(function(){
      var rows = [...document.querySelectorAll('[data-case-item]')];
      function cat(el) { return el ? el.getAttribute('data-case-item-cat') : 'missing'; }
      var board = rows.find(r => r.getAttribute('data-case-item-code') === '4');
      var tank = rows.find(r => r.getAttribute('data-case-item-code') === '301');
      return JSON.stringify({ count: rows.length, boardCat: cat(board), tankCat: cat(tank) });
    })()`));
    check(company.count === 2 && company.boardCat === '公司物品' && company.tankCat === '公司物品',
      '公司物品列出 2 件：编号 4 白板 / 301 鱼缸 均为公司物品', JSON.stringify(company));
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
    // 称号来自存档块 -12 的编号 + 烘焙的 Nickname 表；probe 里路敏/萧依莉都是未出道新人，
    // 路风那块编号是 0（还没有称号），所以只该出现两个徽标。
    check(p.artistTitles.length === 2 && p.artistTitles.every((text) => text === '未出道新人'),
      'artist cards show the title stored in the save (0 = none, no badge)',
      p.artistTitles.join('|') || '(none)');
    // 称号徽标按职业线上色：未出道归「其他」；六种线各自一个色值，不能糊成一种。
    check(p.artistLines.length === 2 && p.artistLines.every((line) => line === 'other'),
      '未出道新人归到「其他」线', p.artistLines.join('|'));
    const titleTokens = await evaluate(`(() => {
      const s = getComputedStyle(document.documentElement);
      return ['music', 'host', 'model', 'screen', 'star', 'other']
        .map((k) => s.getPropertyValue('--color-title-' + k).trim());
    })()`);
    check(Array.isArray(titleTokens) && new Set(titleTokens).size === 6,
      '唱片 / 主持 / 模特 / 影视 / 总称号 / 其他 各有独立颜色',
      (titleTokens || []).join(','));
    check(p.artistTitleInk.length === 2 && p.artistTitleInk.every(
      (ink) => ink === 'rgb(92, 84, 89)/rgb(236, 231, 234)'),
      '「其他」徽标用的是中性灰', p.artistTitleInk.join('|'));
    // hover 才展开门槛卡；中文标签 + 数值都要在里面。
    const badgeBox = await evaluate(`(() => {
      const b = document.querySelector('[data-case-artist-title]');
      const c = document.querySelector('[data-case-artist-title-card]');
      if (!b || !c) return '';
      const r = b.getBoundingClientRect();
      return JSON.stringify({
        x: r.x + r.width / 2, y: r.y + r.height / 2,
        hidden: getComputedStyle(c).opacity,
      });
    })()`);
    const badge = badgeBox ? JSON.parse(badgeBox) : null;
    check(badge && badge.hidden === '0', '门槛卡默认收起', badgeBox || '(none)');
    if (badge) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: badge.x, y: badge.y });
      await sleep(300);
      const tip = await evaluate(`(() => {
        const c = document.querySelector('[data-case-artist-title-card]');
        if (!c) return '';
        return JSON.stringify({
          opacity: getComputedStyle(c).opacity,
          text: (c.innerText || '').replace(/\\s+/g, ' ').trim(),
        });
      })()`);
      const card = tip ? JSON.parse(tip) : null;
      check(card?.opacity === '1' && card.text.includes('其他')
        && card.text.includes('没有门槛')
        && card.text.includes('第 1 档')
        && card.text.includes('下一档') && card.text.includes('新人'),
        'hover 称号徽标展开本线门槛 + 下一档提示', tip || '(none)');
      // 移开指针，别让展开的卡片影响后面的交互断言。
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await sleep(200);
    }
    // 差值 hover：训练 / 打工按缺口一起给，打工标出新手 / 资深；浮窗可停留可移出关闭。
    const hintBox = await evaluate(`(() => {
      const attrs = ['演技', '歌艺', '口才', '仪态', '动感', '体能', '才智', '自信', '名气'];
      const e = [...document.querySelectorAll('[data-case-course-hint]')]
        .find((el) => attrs.includes(el.getAttribute('data-case-course-hint')));
      if (!e) return '';
      // the comparison table sits far down the scroll container
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ attr: e.getAttribute('data-case-course-hint'), x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`);
    const hint = hintBox ? JSON.parse(hintBox) : null;
    check(!!hint, 'a value gap offers training / work hints', hintBox || '(none)');
    if (hint) {
      await sleep(200);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hint.x, y: hint.y });
      await sleep(250);
      const pop = await evaluate(`(() => {
        const c = document.querySelector('[data-case-course-popover]');
        if (!c) return '';
        const r = c.getBoundingClientRect();
        return JSON.stringify({
          text: (c.innerText || '').replace(/\\s+/g, ' ').trim(),
          x: r.x + r.width / 2, y: r.y + r.height / 2,
        });
      })()`);
      const popover = pop ? JSON.parse(pop) : null;
      check(popover?.text.includes('【训练】') && popover.text.includes('【打工】')
        && /【打工】\s+\S+（[^）]+ · [^）]+）/.test(popover.text)
        && !popover.text.includes('新手') && !popover.text.includes('资深'),
      `hover ${hint.attr} groups training / work hints without level values`, pop || '(none)');
      if (popover && popover.y > 0 && popover.y < 900) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: popover.x, y: popover.y });
        await sleep(250);
        check(await evaluate(`!!document.querySelector('[data-case-course-popover]')`),
          'moving onto the popover keeps it open');
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await sleep(250);
      check(await evaluate(`!document.querySelector('[data-case-course-popover]')`),
        'moving away closes the popover');
    }
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
    check(p.workDays === p.roles && p.workDaysFirst.includes('工作')
      && p.workDaysFirst.includes('每周'),
      '每个角色行都显示自己按 Length 表查到的工作天数 / 每周上限',
      `${p.workDays} badges / ${p.roles} roles / ${p.workDaysFirst.replace(/\s+/g, ' ')}`);
    const wd = JSON.parse(p.workDayBadges);
    check(wd.blocks === 2 && wd.texts.some(t => t.includes('工作'))
      && wd.texts.some(t => t.includes('每周'))
      && wd.backgrounds.every(bg => bg && bg !== 'rgba(0, 0, 0, 0)' && bg === wd.backgrounds[0])
      && wd.outerBg === 'rgba(0, 0, 0, 0)'
      && wd.displays.every(d => d.includes('flex')),
      '工作 / 每周拆成两个独立背景 badge，外层不再是一整块背景',
      p.workDayBadges);
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
    check(p.noHorizontalScroll && p.contentWidth > 1000
      && p.sidePadding >= 32 && p.sidePadding <= 64,
      'wide content area keeps modest side margin and no horizontal scroll (right TOC occupies the gutter)',
      `width=${p.contentWidth} padding=${p.sidePadding} noScroll=${p.noHorizontalScroll}`);
    check(p.tocToggle && p.tocCollapsed === true && p.tocLinks === 0,
      '本页小结默认收成一行，目录链接不占位',
      `toggle=${p.tocToggle} collapsed=${p.tocCollapsed} links=${p.tocLinks}`);
    check(p.tocPad === p.quickPad && p.tocPad !== '',
      '收起的本页小结与艺人速查用同一套左右内边距，标题对齐',
      `toc=${p.tocPad} quick=${p.quickPad}`);
    await evaluate(`document.querySelector('[data-case-toc-toggle]').click()`);
    await sleep(150);
    const tocOpen = JSON.parse(await evaluate(`(function(){
      var b = document.querySelector('[data-case-toc-toggle]');
      return JSON.stringify({
        expanded: b ? b.getAttribute('aria-expanded') : null,
        links: document.querySelectorAll('[data-case-toc-link]').length,
        hasNotices: !!document.querySelector('[data-case-toc-link="notices"]'),
      });
    })()`));
    check(tocOpen.expanded === 'true' && tocOpen.links === 8 && tocOpen.hasNotices,
      '本页小结展开后列出 8 个标题卡片（含场景、制作人好感与通告）', JSON.stringify(tocOpen));

    // 制作人好感：六列分组 + 按角色编号反查当前存档友好度（真值来自冻结 probe.sa2）。
    await evaluate(`document.querySelector('[data-case-producers]').open = true`);
    await sleep(200);
    const producers = JSON.parse(await evaluate(`(function(){
      var groups = [...document.querySelectorAll('[data-case-producer-group]')].map(function(g){
        return { kind: g.getAttribute('data-case-producer-group'),
                 n: g.querySelectorAll('[data-case-producer]').length };
      });
      var friends = {}, names = {}, projects = {};
      document.querySelectorAll('[data-case-producer]').forEach(function(el){
        var key = el.getAttribute('data-case-producer');
        friends[key] = el.getAttribute('data-case-producer-friendship');
        names[key] = el.querySelector('[data-case-producer-name]')?.getAttribute('data-case-producer-name');
        projects[key] = el.getAttribute('data-case-producer-project');
      });
      return JSON.stringify({ groups: groups, friends: friends, names: names, projects: projects });
    })()`));
    check(producers.groups.length === 6 && producers.groups.every((g) => g.n > 0),
      '制作人好感按唱片/电视剧/电影/广告/主持/其他六列分组且每列都有制作人',
      JSON.stringify(producers.groups));
    for (const [key, want] of [
      ['he-zong', '10'], ['zhou-yingtong', '50'], ['chen-chali', '37'],
      ['jia-he-da-ze', '300'], ['shi-mai-ke', '300'], ['wang-rui-en', '50'],
    ]) {
      check(producers.friends[key] === want, `制作人好感 ${key} 显示存档友好度 ${want}`,
        `实际 ${producers.friends[key] ?? '缺失'}`);
    }
    // 名字取存档 +8 Big5，项目身份取 +181 ASCII 代号；NULL 代号留空。
    for (const [key, wantName, wantProject] of [
      ['zhou-yingtong', '周映彤', 'EAMI_CD'],
      ['chen-chali', '陳查理', 'I_AM_I_AD'],
      ['mai-ke', '麥可', 'DreamAD'],
      ['wang-rui-en', '王瑞恩', 'Movie_Wang'],
      ['he-zong', '賀總', ''],
    ]) {
      check(producers.names[key] === wantName, `制作人 ${key} 名字取存档 Big5 真源 ${wantName}`,
        `实际 ${producers.names[key] ?? '缺失'}`);
      check(producers.projects[key] === wantProject, `制作人 ${key} 项目代号取存档 +181 真源 ${wantProject || '（无）'}`,
        `实际 ${producers.projects[key] ?? '缺失'}`);
    }
    const identityText = await evaluate(`document.querySelector('[data-case-producer="zhou-yingtong"]').innerText`);
    check(identityText.includes('EAMI唱片'), '项目代号 EAMI_CD 映射为中文身份 EAMI唱片', identityText);

    // 点目录里的「通告」应平滑滚到通告页签；滚完后该页签贴近视口顶部。
    await evaluate(`document.querySelector('[data-case-toc-link="notices"]').click()`);
    await sleep(600);
    const tocJump = JSON.parse(await evaluate(`(function(){
      var t = document.querySelector('[data-case-tabs]');
      var active = document.querySelector('[data-case-toc-link][aria-current="true"], [data-case-toc-link].bg-brand-soft')
        || [...document.querySelectorAll('[data-case-toc-link]')].find(b => b.className.includes('bg-brand-soft'));
      var nav = document.querySelector('[data-case-toc]');
      var navTop = nav ? Math.round(nav.getBoundingClientRect().top) : -1;
      var scroll = document.querySelector('[data-case-scroll]');
      return JSON.stringify({
        top: t ? Math.round(t.getBoundingClientRect().top) : -1,
        active: active ? active.getAttribute('data-case-toc-link') : null,
        navTop: navTop, navBottom: nav ? Math.round(nav.getBoundingClientRect().bottom) : -1,
        scrollTop: scroll ? Math.round(scroll.scrollTop) : -1,
      });
    })()`));
    check(tocJump.top >= 40 && tocJump.top <= 320 && tocJump.active === 'notices',
      '点目录「通告」平滑跳转到通告页签且高亮当前卡片', JSON.stringify(tocJump));
    // 本页小结是 fixed 钉在视口右侧（不再是滚动容器的兄弟节点）：内容列滚到通告后，
    // navTop 相对视口恒定、面板完整可见 —— 修的是「滚动到通告时目录跟着滚走消失」这个回归。
    // fixed 下 navTop 恒为 76，前后相等即证明不随滚动移动；滚动条落在视口最右。
    check(tocJump.scrollTop > 100 && tocJump.navTop === p.tocTop
      && tocJump.navTop >= 64 && tocJump.navBottom <= 900,
      '内容列滚到通告后「本页小结」仍固定可见、不随滚动消失',
      `nav ${p.tocTop}→${tocJump.navTop}, bottom=${tocJump.navBottom}, scrollTop=${tocJump.scrollTop}`);

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

    // 接取情况分两档。Auto 里 11 条中有 8 条还有未预约角色（3 条下周更新还没开放，
    // 不算），而这 8 条一条都接不上 —— 开局艺人九项数值差 2~4 项。
    const takeChips = JSON.parse(await evaluate(`JSON.stringify({
      slots: document.querySelector('[data-case-filter-slots]')?.innerText.replace(/\\s+/g, ' ') || '',
      qualified: document.querySelector('[data-case-filter-qualified]')?.innerText.replace(/\\s+/g, ' ') || '',
      pressed: [...document.querySelectorAll('[data-case-take-filter] [aria-pressed]')]
        .map(b => b.getAttribute('aria-pressed')).join(',')
    })`));
    check(takeChips.slots.includes('未预约') && takeChips.slots.includes('8')
      && takeChips.qualified.includes('满足条件') && takeChips.qualified.includes('0')
      && takeChips.pressed === 'false,false',
      '接取两档分开计数：Auto 未预约 8 条、满足条件 0 条，默认都不选中',
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
      '点「未预约」只剩还有空角色的 8 条，且每条都真有空角色',
      `${bySlots.notices} 条 / ${bySlots.count} / 空位 ${bySlots.freeCells.join(',')}`);
    check(bySlots.count.includes('8 / 11'),
      '筛「未预约」时计数写成 当前 8 / 11 条', bySlots.count);
    check(bySlots.upcoming === 0,
      '「未预约」把下周更新（还没开放）的通告排掉', `${bySlots.upcoming} 条下周更新`);

    // 同 8 条换成「满足条件」应该一条都不剩：未预约不等于接得上。
    await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
    await sleep(300);
    const byQualified = JSON.parse(await evaluate(`JSON.stringify({
      notices: document.querySelectorAll('[data-case-notice]').length,
      empty: document.body.innerText.includes('没有符合条件的通告'),
      slotsPressed: document.querySelector('[data-case-filter-slots]')?.getAttribute('aria-pressed') || '',
      qualifiedPressed: document.querySelector('[data-case-filter-qualified]')?.getAttribute('aria-pressed') || '',
      hint: !document.querySelector('[data-case-take-hint]')
    })`));
    check(byQualified.notices === 0 && byQualified.empty
      && byQualified.slotsPressed === 'false' && byQualified.qualifiedPressed === 'true',
      'Auto 的 8 条未预约一条都接不上（数值不够）→ 筛「满足条件」为空',
      `${byQualified.notices} 条 / ${byQualified.empty} / ${byQualified.slotsPressed},${byQualified.qualifiedPressed}`);
    check(byQualified.hint,
      '选中「满足条件」不额外挂说明行（口径只写在 title 里）');

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
      hasFinishedTab: Boolean(document.querySelector('[data-case-tab="done"]')),
      openSelected: document.querySelector('[data-case-tab="open"]')?.getAttribute('aria-selected'),
      shootingSelected: document.querySelector('[data-case-tab="shooting"]')?.getAttribute('aria-selected'),
      rows: document.querySelectorAll('[data-case-shooting-row]').length,
      // 我方行＝带 data-case-shooting-artist；对手演员也占行，
      // 所以旧断言里「一行一位艺人」的口径只看带 artist 的行。
      codes: [...new Set([...document.querySelectorAll('[data-case-shooting-row]')]
        .map(r => r.getAttribute('data-case-shooting-row')))],
      artists: [...document.querySelectorAll('[data-case-shooting-artist]')].map(x => x.innerText),
      roles: [...document.querySelectorAll('[data-case-shooting-artist]')]
        .map(x => x.closest('tr')?.querySelector('[data-case-shooting-role]')?.innerText),
      statuses: [...document.querySelectorAll('[data-case-shooting-status]')].map(x => x.getAttribute('data-case-shooting-status')),
      risk: document.querySelector('[data-case-shooting-risk-label]')?.getAttribute('data-case-shooting-risk-label') ?? null,
      progresses: [...document.querySelectorAll('[data-case-shooting-row]')]
        .filter(r => r.querySelector('[data-case-shooting-artist]')).map(r => {
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
    check(shot.tabs === 7 && shot.shootingSelected === 'true' && shot.openSelected === 'false',
      '档案页七个通告页签可以切换', `${shot.tabs} tabs`);
    check(shot.hasFinishedTab,
      '已完成的页签在热卖中后面', String(shot.hasFinishedTab));
    check(shot.codes.length === 1 && shot.codes[0] === 'CF014',
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
    check(diyEmpty.tabs === 7 && diyEmpty.selected === 'true' && diyEmpty.noticesHidden === 0,
      '自制通告及其他 切过去会收起筹备中的表格', `${diyEmpty.tabs} tabs`);
    check(diyEmpty.rows === 0 && diyEmpty.text.includes('还没有自制通告'),
      'Auto 存档没有自制通告，页签显示空态', String(diyEmpty.rows));

    // Auto 存档（冻结快照）：档期过了但进度快照没满的四条自制通告，状态是
    // 「已完成」不是「已逾期」；未开拍的文案也不再写「档期已过」。
    const releasedPath = path.join(SNAP, 'AutoReleased.sa2');
    if (fs.existsSync(releasedPath)) {
      const copy = path.join(root, '.tmp', 'case-e2e-released.sa2');
      fs.copyFileSync(releasedPath, copy);
      await evaluate(`document.querySelector('[data-case-tab="self-made"]').click()`);
      await sleep(200);
      await uploadSave(copy);
      await evaluate(`document.querySelector('[data-case-tab="self-made"]').click()`);
      await sleep(350);
      const rel = JSON.parse(await evaluate(`JSON.stringify({
        byCode: Object.fromEntries([...new Set([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => r.getAttribute('data-case-selfmade-row')))].map(code => {
            const row = document.querySelector('[data-case-selfmade-row="' + code + '"]');
            return [code, row.getAttribute('data-case-selfmade-status')];
          })),
        days: Object.fromEntries([...document.querySelectorAll('[data-case-selfmade-row]')]
          .map(r => [r.getAttribute('data-case-selfmade-row'),
            r.querySelector('[data-case-selfmade-days]')?.getAttribute('data-case-selfmade-days') || ''])),
        text: document.querySelector('[data-case-selfmade]')?.innerText.replace(/\\s+/g, ' ') || '',
        summary: document.querySelector('[data-case-selfmade-summary]')?.innerText.replace(/\\s+/g, ' ') || '',
        groupWork: document.querySelector('[data-case-group-work-count]')?.innerText.replace(/\\s+/g, ' ') || '',
      })`));
      for (const code of ['CD701', 'CD601', 'TV701', 'TV727']) {
        check(rel.byCode[code] === 'done',
          `AutoReleased: ${code} 档期过了、进度快照没满，界面状态是「已完成」`,
          String(rel.byCode[code]));
      }
      check(!Object.values(rel.byCode).includes('overdue') && !rel.text.includes('已逾期'),
        'AutoReleased: 自制通告表里不再出现「已逾期」状态或胶囊',
        Object.values(rel.byCode).join(','));
      check(!rel.text.includes('还差 3 天') && !rel.text.includes('还差 6 天')
        && rel.days.CD701 === '25/25' && rel.days.TV727 === '45/45',
        'AutoReleased: 已发布的通告进度按拍满显示，不再写「还差 N 天」',
        `CD701=${rel.days.CD701} TV727=${rel.days.TV727}`);
      check(!rel.text.includes('档期已过，没人接') && rel.text.includes('还没人接'),
        'AutoReleased: 未开拍的通告小字写「还没人接」，不再写「档期已过，没人接」');
      check(!rel.summary.includes('已逾期'),
        'AutoReleased: 汇总筛选条上不再挂「已逾期」', rel.summary.slice(0, 100));
      check(/唱片\s*6\s*张/.test(rel.groupWork),
        'AutoReleased: 团体卡通告统计显示千金小姐唱片 6 张', rel.groupWork);
      // 团体唱片「銀河」在拍摄中：整团接一份通告，队员共享队长的完成天数。
      // 存档只给队长写接取记录，队员那条 0 天 / 0 酬劳是噪声，不该显示成 0/25。
      await evaluate(`document.querySelector('[data-case-tab="shooting"]').click()`);
      await sleep(350);
      const galaxy = JSON.parse(await evaluate(`JSON.stringify({
        rows: [...document.querySelectorAll('[data-case-shooting-row="CD602"]')]
          .filter(r => r.querySelector('[data-case-shooting-artist]')).map(r => ({
          artist: r.querySelector('[data-case-shooting-artist]')?.innerText || '',
          text: [...r.querySelectorAll('td')].map(td => td.innerText.replace(/\\s+/g, ' ').trim()).join(' | '),
        })),
      })`));
      check(galaxy.rows.length === 2
        && galaxy.rows.every((r) => r.text.includes('10 / 25 天') && r.text.includes('4150 万')),
        'AutoReleased: 团体唱片 銀河 队长与队员都显示 10/25、酬劳 4150 万（队员共享队长进度）',
        JSON.stringify(galaxy.rows));

      // 右栏艺人速查：在拍通告横滑轨道，团体共享、自制通告也挂到人，风险圆点跟表格同口径。
      const quickref = JSON.parse(await evaluate(`JSON.stringify({
        strips: document.querySelectorAll('[data-case-quickref-notice-strip]').length,
        scrolls: document.querySelectorAll('[data-case-quickref-notice-scroll]').length,
        arrows: document.querySelectorAll('[data-case-quickref-scroll-prev],[data-case-quickref-scroll-next]').length,
        artists: [...document.querySelectorAll('[data-case-quickref-artist]')].map(card => ({
          artist: card.getAttribute('data-case-quickref-artist'),
          tiles: [...card.querySelectorAll('[data-case-quickref-notice]')].map(t => {
            var dot = t.querySelector('[aria-hidden]');
            var cls = dot ? dot.className : '';
            return {
              code: t.getAttribute('data-case-quickref-notice'),
              source: t.getAttribute('data-case-quickref-notice-source'),
              risk: t.getAttribute('data-case-quickref-notice-risk'),
              text: t.innerText.replace(/\\s+/g, ' ').trim(),
              title: t.getAttribute('title') || '',
              dot: cls.includes('bg-gold') ? 'gold' : cls.includes('bg-alert') ? 'alert' : '',
              border: getComputedStyle(t).borderLeftColor,
            };
          }),
        })),
      })`));
      console.log('quickref:', JSON.stringify(quickref));
      const qrTiles = quickref.artists.flatMap(a => a.tiles.map(t => ({ ...t, artist: a.artist })));
      check(qrTiles.length > 0 && quickref.strips > 0
        && quickref.scrolls === quickref.strips && quickref.arrows === quickref.strips * 2,
        '艺人速查：在拍通告是横滑轨道，每条轨道都有左右箭头和滚动区',
        `tiles=${qrTiles.length} strips=${quickref.strips} scrolls=${quickref.scrolls} arrows=${quickref.arrows}`);
      const qrGalaxy = qrTiles.filter(t => t.code === 'CD602');
      check(qrGalaxy.length === 2
        && qrGalaxy.every(t => t.text.includes('10 / 25') && t.risk === 'late' && t.dot === 'alert'),
        '艺人速查：团体唱片 銀河 挂到两位成员名下，进度共享 10/25、违约画红点',
        JSON.stringify(qrGalaxy.map(t => `${t.artist}:${t.text}:${t.risk}:${t.dot}`)));
      check(qrTiles.some(t => t.source === 'selfMade'),
        '艺人速查：自制通告里拍摄中的那一条也挂到艺人身上',
        qrTiles.filter(t => t.source === 'selfMade').map(t => `${t.artist}:${t.code}`).join(',') || '(none)');
      check(qrTiles.every(t => t.text.includes('/') && t.text.includes('天'))
        && qrTiles.every(t => t.title.includes('~')),
        '艺人速查：每块显示完成/总天数，档期完整日期保留在悬停提示里',
        JSON.stringify(qrTiles.map(t => `${t.code}:${t.text}:${t.title}`)));
    } else {
      console.log('SKIP AutoReleased.sa2 not present, released-notice UI not checked');
    }

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
      // 活档会随游戏继续改写进度；锚点不在了就跳过整段，别把存档漂移报成回归。
      const anchored55 = diy55.days.includes('22/25') && diy55.days.includes('10/25')
        && diy55.groups.some((g) => g.startsWith('沙啞之歌|'));
      if (!anchored55) {
        console.log('SKIP Story0055.sa2 drifted in-game, day counts and filter checks skipped');
      } else {
        check(diy55.days.includes('22/25') && diy55.days.includes('10/25'),
          'Story0055: 需拍天数取长度表（有朋自遠方來 22/25、傾城之戀 10/25），不是自己相加',
          diy55.days.join(' '));
        check(diy55.text.includes('还差 3 天') && diy55.text.includes('还差 15 天'),
          'Story0055: 还差天数由 总天数 - 已完成 算出（3 天 / 15 天）');
        check(!diy55.statuses.includes('overdue') && !diy55.text.includes('已逾期'),
          'Story0055: 档期过了的作品不再标成「已逾期」（进度快照不能判逾期）', diy55.statuses.join(','));
        // 夢的十四行詩 是团体专辑：艺人列写团名 + 队长 / 团员，不写「新名纱雪」一个人。
        check(diy55.groups.some((g) => g.startsWith('沙啞之歌|') && g.includes('队长 新名纱雪')
          && g.includes('团员 卫亚')),
          'Story0055: 团体通告显示签约团体 沙啞之歌（队长 / 团员都在）',
          diy55.groups.join(' || ') || 'none');

        // 同一个存档切回「筹备中」：后期艺人数值够了，9 条未预约的就都满足条件，
        // 与 Auto 那份「未预约 8 / 满足条件 0」正好是两个极端。
        await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
        await sleep(300);
        const take55 = JSON.parse(await evaluate(`JSON.stringify({
          slots: document.querySelector('[data-case-filter-slots]')?.innerText.replace(/\\s+/g, ' ') || '',
          qualified: document.querySelector('[data-case-filter-qualified]')?.innerText.replace(/\\s+/g, ' ') || ''
        })`));
        check(take55.slots.includes('9') && take55.qualified.includes('9'),
          'Story0055: 未预约 9 条、满足条件 9 条（后期数值够）', JSON.stringify(take55));

        await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
        await sleep(300);
        const qual55 = JSON.parse(await evaluate(`JSON.stringify({
          notices: document.querySelectorAll('[data-case-notice]').length,
          count: document.querySelector('[data-case-filter-count]')?.innerText.replace(/\\s+/g, ' ') || '',
          okRows: [...document.querySelectorAll('[data-case-notice]')]
            .every(tb => tb.querySelector('[data-match-result="yes"]'))
        })`));
        check(qual55.notices === 9 && qual55.okRows && qual55.count.includes('9 / 11'),
          'Story0055: 筛「满足条件」只剩 9 条，且每条都有「数值够」的艺人',
          `${qual55.notices} 条 / ${qual55.count} / ok=${qual55.okRows}`);
        const acceptTone = JSON.parse(await evaluate(`JSON.stringify((() => {
          const badge = document.querySelector('[data-match-result="yes"] svg')?.parentElement;
          if (!badge) return null;
          const cs = getComputedStyle(badge);
          return { color: cs.color, bg: cs.backgroundColor };
        })())`));
        check(acceptTone && acceptTone.color === 'rgb(15, 90, 82)' && acceptTone.bg === 'rgb(213, 236, 229)',
          'Story0055: 「可以接」徽章用称号达标同款 title-model 绿（非 accept 黄绿）',
          JSON.stringify(acceptTone));
        await evaluate(`document.querySelector('[data-case-filter-qualified]').click()`);
        await sleep(300);
      }
    } else {
      console.log('SKIP Story0055.sa2 not present, day counts not checked');
    }

    // Story0014：CF095 意美 好吃篇的萧依莉根本没接取，预约列必须为空。
    // 存档里有一段形状像 52 字节预约表的假记录（尾部带 1），不能误报成已预约。
    const s14Copy = path.join(root, '.tmp', 'case-e2e-story14.sa2');
    fs.copyFileSync(path.join(SNAP, 'Story0014.sa2'), s14Copy);
    await uploadSave(s14Copy);
    await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
    await sleep(350);
    const cf095 = JSON.parse(await evaluate(`(function(){
      var t = [...document.querySelectorAll('[data-case-notice]')].find(function(x){ return x.innerText.includes('CF095'); });
      if (!t) return JSON.stringify({ found:false });
      return JSON.stringify({
        found:true,
        rows: [...t.querySelectorAll('[data-case-role]')].map(function(r){
          return {
            name: r.getAttribute('data-case-role-name'),
            reserved: r.getAttribute('data-case-reserved'),
            by: r.querySelector('[data-case-reservation]')?.innerText || '',
          };
        }),
      });
    })()`));
    check(cf095.found && cf095.rows.length === 1 && cf095.rows[0].reserved === 'no'
      && cf095.rows[0].by === '' && !cf095.rows[0].by.includes('萧依莉'),
      'Story0014 CF095 萧依莉没接取，页面不显示已预约',
      JSON.stringify(cf095));

    // 换成 Story0027：多角色通告里对手演员要出现在 other 行、与我方区分，
    // 我方仍只在 [data-case-shooting-artist] 里、进度列是真值。
    // 对手不显示「他司」文字标签，靠灰底与 data 属性区分。
    const ownPath = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Story0027.sa2';
    if (fs.existsSync(ownPath)) {
      const copy = path.join(root, '.tmp', 'case-e2e-own.sa2');
      fs.copyFileSync(ownPath, copy);
      await evaluate(`document.querySelector('[data-case-tab="shooting"]').click()`);
      await sleep(200);
      await uploadSave(copy);
      const own = JSON.parse(await evaluate(`JSON.stringify({
        artists: [...document.querySelectorAll('[data-case-shooting-artist]')].map(x => x.innerText),
        others: [...document.querySelectorAll('[data-case-shooting-other]')].map(x => x.innerText),
        vacants: [...document.querySelectorAll('[data-case-shooting-vacant]')].map(x => x.innerText),
        codes: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.getAttribute('data-case-shooting-row')),
        rows: [...document.querySelectorAll('[data-case-shooting-row]')].map(r => r.innerText.replace(/\\s+/g, ' ').trim()),
        text: document.querySelector('[data-case-shooting]')?.innerText || ''
      })`));
      console.log('own:', JSON.stringify(own.artists), 'others:', JSON.stringify(own.others), own.codes.join(','));
      // 对手演员与我方三类行互不串位：真进度行只含签约艺人，对手只在 other 属性里。
      check(own.artists.every((n) => !own.others.includes(n)),
        '拍摄中：我方艺人与对手演员不串位', `mine=${own.artists.join(',')} other=${own.others.join(',')}`);
      check(!own.text.includes('他司'),
        '拍摄中：对手演员不显示「他司」文字标签', own.text.replace(/\s+/g, ' ').slice(0, 120));
      // 玩家在玩的历史活档会被游戏改写。守候(TV021) 还在才做具体名单断言。
      if (!own.codes.includes('TV021')) {
        console.log('OK   Story0027.sa2 drifted in-game, skipped the exact-name checks');
      } else {
      check(own.artists.includes('克烈斯') && own.codes.includes('TV021'),
        '自家艺人克烈斯仍在守候这一行', own.artists.join(','));
      // MV607 若仍在档期内，对手演员黎华 / 方若绮要出现在对手行。
      if (own.codes.includes('MV607')) {
        check(own.others.includes('黎華') && own.others.includes('方若綺'),
          'MV607 对手演员黎华 / 方若绮显示在对手行', own.others.join(','));
        check(!own.text.includes('推测'),
          '对手演员角色是精确数据，不再标「推测」', own.text.slice(0, 100));
      }
      }

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
    // 道具联动：Auto 存档里有八卦雜誌（口才+10 儀態+10 才智-20），
    // hover 口才缺口时浮窗的【道具】组应把它整行列出来（含负项原文）。
    const autoCopy = path.join(root, '.tmp', 'case-e2e-auto.sa2');
    fs.copyFileSync(path.join(SNAP, 'Auto.sa2'), autoCopy);
    await uploadSave(autoCopy);
    // Auto 存档的一般物品也应按签约艺人列出好感加成（賀總造型棒棒糖 → 萧依莉+4）。
    const autoGift = JSON.parse(await evaluate(`(function(){
      var box = document.querySelector('[data-case-items]');
      if (box && !box.hasAttribute('open')) box.querySelector('[data-case-items-summary]').click();
      return JSON.stringify({ opened: !!box && box.hasAttribute('open') });
    })()`));
    await sleep(250);
    const autoGiftRows = JSON.parse(await evaluate(`(function(){
      var tab = [...document.querySelectorAll('[data-case-item-tab]')]
        .find(function(t){ return t.getAttribute('data-case-item-tab') === '一般物品'; });
      if (tab) tab.click();
      return JSON.stringify([...document.querySelectorAll('[data-case-item]')].map(function(row){
        return {
          code: row.getAttribute('data-case-item-code'),
          hints: [...row.querySelectorAll('[data-case-item-gift] [data-case-item-gift-name]')].map(function(x){
            return x.getAttribute('data-case-item-gift-name') + '+' + x.getAttribute('data-case-item-gift-value');
          }),
        };
      }));
    })()`));
    check(autoGift.opened && autoGiftRows.some(r => r.hints.includes('萧依莉+4')),
      'Auto 存档一般物品显示「萧依莉+4」（Item.dat 送礼表）',
      JSON.stringify({ opened: autoGift.opened, rows: autoGiftRows }));
    await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
    await sleep(350);
    const itemHint = await evaluate(`(() => {
      const e = [...document.querySelectorAll('[data-case-course-hint="口才"]')][0];
      if (!e) return '';
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    })()`);
    if (itemHint) {
      await sleep(180);
      const b = JSON.parse(itemHint);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y });
      await sleep(250);
      const pop = await evaluate(`(() => {
        const c = document.querySelector('[data-case-course-popover]');
        return c ? (c.innerText || '').replace(/\\s+/g, ' ').trim() : '';
      })()`);
      check(pop.includes('【道具】') && pop.includes('八卦雜誌')
        && pop.includes('口才+10') && pop.includes('才智-20'),
      'Auto 口才缺口浮窗列出【道具】八卦雜誌整行（含负项原文）', pop || '(none)');
    } else {
      check(false, 'Auto 存档应有一个口才缺口供 hover');
    }

    // 团体奖归属：Ending0001 的两条「最佳團體」存档挂在 74 新名纱雪名下，
    // 但她不是个人荣誉 —— 奖应出现在「我方团体」卡，艺人卡与公司卡奖项行都不含它。
    const ending1Path = 'D:/Program Files (x86)/dayuzixun/mxzy3/tw/Save2/Ending0001.sa2';
    if (fs.existsSync(ending1Path)) {
      const ending1Copy = path.join(root, '.tmp', 'case-e2e-ending1.sa2');
      fs.copyFileSync(ending1Path, ending1Copy);
      await uploadSave(ending1Copy);
      const g = JSON.parse(await evaluate(`JSON.stringify({
        groupName: document.querySelector('[data-case-group] .font-semibold')?.innerText || '',
        groupAwardChips: [...document.querySelectorAll('[data-case-group] [data-case-group-award]')]
          .map(function(x){ return (x.innerText || '').replace(/\\s+/g, ' ').trim() + '#' + x.getAttribute('data-case-award-id'); }),
        unmatched: document.querySelectorAll('[data-case-group-awards-unmatched] [data-case-group-award]').length,
        artistAwardIds: [...document.querySelectorAll('[data-case-artist-award], [data-case-artist-company-award]')]
          .map(function(x){ return x.getAttribute('data-case-award-id'); }),
        companyAwardText: document.querySelector('[data-case-company-awards]')?.innerText || '',
      })`));
      check(g.groupName.includes('莎亞') && g.groupAwardChips.length >= 2
        && g.groupAwardChips.every((t) => t.endsWith('#23')),
        'Ending0001「最佳團體」挂在团体卡（莎亞之音，2 条，编号 23）',
        `${g.groupName} :: ${g.groupAwardChips.join(' | ')}`);
      check(g.unmatched === 0, '两条团体奖都归到了团体，没有落到未归属兜底', String(g.unmatched));
      check(!g.artistAwardIds.includes('23'),
        '艺人卡不再显示最佳團體（个人奖与公司奖行都没有 #23）', g.artistAwardIds.join(','));
      check(!g.companyAwardText.includes('最佳團體'),
        '公司卡奖项行也不再混入团体奖', g.companyAwardText.replace(/\s+/g, ' ').trim());

      // 同一通告不同角色类型的工作天数：连续剧 TV090 男主角 45 / 女配角 20，
      // 电影 MV608 女主角 40 / 男配角 25。每行胶囊必须显示该角色自己的天数。
      const dayRows = JSON.parse(await evaluate(`JSON.stringify((function(){
        function read(code){
          var tb = [...document.querySelectorAll('[data-case-notice]')].find(function(t){
            return [...t.querySelectorAll('[data-case-role]')].some(function(r){
              return r.innerText.indexOf(code) >= 0;
            });
          });
          if (!tb) return null;
          return [...tb.querySelectorAll('[data-case-role]')].map(function(r){
            var b = r.querySelector('[data-case-workdays]');
            return { role: r.getAttribute('data-case-role-name'),
                     days: b ? b.getAttribute('data-case-work-days') : '',
                     text: b ? (b.innerText || '').replace(/\\s+/g,' ').trim() : '' };
          });
        }
        return { tv090: read('TV090'), mv608: read('MV608') };
      })())`));
      const tv090 = dayRows.tv090 || [];
      const mv608 = dayRows.mv608 || [];
      check(tv090.some((r) => r.role === '男主角' && r.days === '45' && r.text.includes('工作 45 天'))
        && tv090.some((r) => r.role === '女配角' && r.days === '20' && r.text.includes('工作 20 天')),
      'TV090 连续剧：男主角行 45 天、女配角行 20 天（同一通告不同角色天数）',
        tv090.map((r) => `${r.role}:${r.days}`).join(' ') || 'missing');
      check(mv608.some((r) => r.role === '男配角' && r.days === '25' && r.text.includes('工作 25 天'))
        && mv608.some((r) => r.role === '女主角' && r.days === '40'),
      'MV608 电影：女主角行 40 天、男配角行 25 天（同一通告不同角色天数）',
        mv608.map((r) => `${r.role}:${r.days}`).join(' ') || 'missing');
    } else {
      console.log('OK   Ending0001.sa2 not present, skipped group-award checks');
    }

    // 社交门槛联动：冻结 Story0004 同时有「親和力上升」的賀總造型棒棒糖，
    // 和 CF234 女主角要求的亲和门槛。hover 亲和缺口应出【道具】组，
    // 且粉色小标签（data-case-social-gap）要保留。
    const story4Copy = path.join(root, '.tmp', 'case-e2e-story4.sa2');
    fs.copyFileSync(path.join(SNAP, 'Story0004.sa2'), story4Copy);
    await uploadSave(story4Copy);
    await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
    await sleep(350);
    const socialHint = JSON.parse(await evaluate(`(() => {
      const e = document.querySelector('[data-case-course-hint="亲和"]');
      if (!e) return '';
      e.scrollIntoView({ block: 'center' });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ x: r.x + r.width / 2, y: r.y + r.height / 2, pill: e.hasAttribute('data-case-social-gap') });
    })()`));
    if (socialHint) {
      await sleep(180);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: socialHint.x, y: socialHint.y });
      await sleep(250);
      const socPop = await evaluate(`(() => {
        const c = document.querySelector('[data-case-course-popover]');
        return c ? (c.innerText || '').replace(/\\s+/g, ' ').trim() : '';
      })()`);
      check(socialHint.pill, 'Story0004 亲和缺口保留粉色小标签样式', JSON.stringify(socialHint));
      check(socPop.includes('【道具】') && socPop.includes('賀總造型棒棒糖') && socPop.includes('親和力上升'),
        'Story0004 亲和缺口浮窗列出【道具】賀總造型棒棒糖（親和力上升）', socPop || '(none)');
    } else {
      check(false, 'Story0004 存档应有一个亲和缺口供 hover');
    }

    // 最近补的卡片内容统一用冻结快照回归：场景全部可 hover 且贴块、作品 hover
    // 条数与官方统计一致、团体活动只挂团体卡、社交分层、合约信息都在。
    {
      const detailCopy = path.join(root, '.tmp', 'case-e2e-details.sa2');
      fs.copyFileSync(path.join(SNAP, 'AutoReleased.sa2'), detailCopy);
      await uploadSave(detailCopy);
      await evaluate(`document.querySelector('[data-case-tab="open"]').click()`);
      await sleep(300);

      const scenes = JSON.parse(await evaluate(`JSON.stringify((function(){
        var box = document.querySelector('[data-case-scenes]');
        if (box && !box.open) box.open = true;
        var cards = [...document.querySelectorAll('[data-case-scene]')];
        return {
          count: cards.length,
          unlocked: cards.filter(function(c){ return c.getAttribute('data-case-scene-unlocked') === 'true'; }).length,
          names: cards.map(function(c){ return c.querySelector('b')?.innerText || ''; }),
          hintCards: cards.filter(function(c){ return !!c.querySelector('[data-case-scene-unlock]'); }).length,
          summary: document.querySelector('[data-case-scenes-summary]')?.innerText.replace(/\\s+/g, ' ') || '',
        };
      })())`));
      check(scenes.count === 8 && scenes.unlocked === 8 && scenes.summary.includes('8/8 已解锁'),
        'AutoReleased: 场景卡 8 张全部显示已解锁', JSON.stringify(scenes));
      check(scenes.names.join(',') === '长城,东京,好莱坞,巴黎,维也纳,夏威夷,纽约,开罗',
        '场景顺序与游戏世界脉动一致', scenes.names.join(','));
      check(scenes.hintCards === 8, '8 张场景卡全部带解锁方式（含已解锁的）',
        `${scenes.hintCards} / ${scenes.count}`);

      const hoverScene = async (index) => {
        const ok = await evaluate(`(function(){ var c = document.querySelectorAll('[data-case-scene]')[${index}]; if (!c) return false; c.focus(); return true; })()`);
        if (!ok) return null;
        await sleep(240);
        return JSON.parse(await evaluate(`JSON.stringify((function(){
          var c = document.querySelectorAll('[data-case-scene]')[${index}];
          var t = c.querySelector('[data-case-scene-unlock]');
          if (!t) return null;
          var cr = c.getBoundingClientRect(), tr = t.getBoundingClientRect();
          var scroller = t.querySelector('[data-case-scene-unlock-scroll]');
          return {
            name: c.querySelector('b')?.innerText || '',
            text: (t.innerText || '').replace(/\\s+/g, ' ').trim(),
            opacity: getComputedStyle(t).opacity,
            maxHeight: scroller ? getComputedStyle(scroller).maxHeight : '',
            gap: Math.round(tr.top - cr.bottom),
            left: Math.round(tr.left), right: Math.round(tr.right),
            cardLeft: Math.round(cr.left), cardRight: Math.round(cr.right),
            viewport: window.innerWidth,
          };
        })())`));
      };
      const firstScene = await hoverScene(0);
      const lastScene = await hoverScene(7);
      check(firstScene && firstScene.name === '长城' && firstScene.opacity === '1'
        && firstScene.text.includes('解锁方式 · 长城') && firstScene.text.length > 20,
      '场景 hover 显示攻略页的解锁方式', JSON.stringify(firstScene));
      check(firstScene && firstScene.gap >= -2 && firstScene.gap <= 10
        && Math.abs(firstScene.left - firstScene.cardLeft) <= 4
        && firstScene.right <= firstScene.viewport + 1,
      '首列 tooltip 贴住本卡下沿，左对齐不越界', JSON.stringify(firstScene));
      check(lastScene && lastScene.name === '开罗' && lastScene.opacity === '1'
        && lastScene.gap >= -2 && lastScene.gap <= 10
        && Math.abs(lastScene.right - lastScene.cardRight) <= 4
        && lastScene.left >= -1,
      '末列 tooltip 贴住本卡下沿，右对齐不越界', JSON.stringify(lastScene));
      check(firstScene?.maxHeight === '240px' && lastScene?.maxHeight === '240px',
        '解锁方式内容定高滚动，不让卡片无限撑开',
        `${firstScene?.maxHeight} / ${lastScene?.maxHeight}`);

      const hoverArtistChip = async (id, noticeIndex) => {
        const ok = await evaluate(`(function(){
          var card = [...document.querySelectorAll('[data-case-artist]')].find(function(x){ return x.innerText.indexOf('#${id} ') >= 0; });
          var chip = card?.querySelector('[data-case-artist-work-count][data-notice-index="${noticeIndex}"]');
          if (!chip) return false;
          chip.focus();
          return true;
        })()`);
        if (!ok) return null;
        await sleep(240);
        return JSON.parse(await evaluate(`(function(){
          var card = [...document.querySelectorAll('[data-case-artist]')].find(function(x){ return x.innerText.indexOf('#${id} ') >= 0; });
          var chip = card.querySelector('[data-case-artist-work-count][data-notice-index="${noticeIndex}"]');
          var tip = chip.parentElement.querySelector('[data-case-artist-works-card]');
          if (!tip) return 'null';
          var scroller = tip.querySelector('[data-case-works-scroll]');
          var cs = scroller ? getComputedStyle(scroller) : null;
          return JSON.stringify({
            label: chip.innerText.replace(/\\s+/g, ' ').trim(),
            value: chip.querySelector('b')?.innerText || '',
            chipBg: getComputedStyle(chip).backgroundColor,
            opacity: getComputedStyle(tip).opacity,
            rows: [...tip.querySelectorAll('[data-case-artist-work]')].map(function(r){ return r.innerText.replace(/\\s+/g, ' ').trim(); }),
            maxHeight: cs ? cs.maxHeight : '',
            overflow: cs ? cs.overflowY : '',
          });
        })()`));
      };
      const host = await hoverArtistChip(8, 4);
      check(host && Number(host.value) === 4 && host.rows.length === 4 && host.opacity === '1',
        '陈奕夫主持统计 4 档，hover 正好 4 行', JSON.stringify(host));
      check(host && host.rows[0].includes('未留存明细') && host.rows[1].includes('未留存明细')
        && host.rows[2].includes('電影大觀') && host.rows[2].includes('2006/4/30')
        && host.rows[3].includes('談心談星') && host.rows[3].includes('2006/12/31'),
      '缺失的前两部占位排在 SH067 / SH072 前面，日期也带年份',
      host?.rows.join(' | ') ?? 'none');
      check(host?.rows.every((row, i) => row.startsWith(`${i + 1}.`)),
        '作品明细每行前面带发生顺序编号', host?.rows.join(' | ') ?? 'none');
      // 主持作品角色读静态表 subtype；陈奕夫 SH067 / SH072 都是「助理主持」。
      check(host && host.rows[2].includes('助理主持') && host.rows[3].includes('助理主持'),
        '主持作品 hover 显示角色「助理主持」（读静态表 subtype，非性别推断）',
        `${host?.rows[2]} | ${host?.rows[3]}`);
      check(host && (host.chipBg === 'rgb(250, 239, 243)' || host.chipBg === 'rgb(252, 235, 244)'),
        '通告统计项 hover 时才浮出粉底（平时透明）', host?.chipBg ?? 'none');
      const albums = await hoverArtistChip(74, 2);
      check(albums && Number(albums.value) === 7 && albums.rows.length === 7
        && albums.rows.every((row) => /\d{4}\/\d+\/\d+/.test(row))
        && albums.rows.some((row) => row.includes('來自深海的愛')),
      '新名纱雪 7 张唱片逐条显示日期，含原声带《來自深海的愛》',
      JSON.stringify(albums));
      const albumDays = albums?.rows.map((row) => row.match(/(\d{4})\/(\d+)\/(\d+)/)?.slice(1).map(Number) ?? [0, 0, 0]) ?? [];
      check(albumDays.every((d, i) => i === 0 || albumDays[i - 1][0] * 10000 + albumDays[i - 1][1] * 100 + albumDays[i - 1][2]
        <= d[0] * 10000 + d[1] * 100 + d[2]),
      '作品 hover 按日期正序，不再按「第 N 部」序号跳', albums?.rows.join(' | ') ?? 'none');
      const xinMovies = await hoverArtistChip(74, 1);
      check(xinMovies && xinMovies.rows.some((row) => row.includes('就在鄰近的幸福') && row.includes('女主角'))
        && xinMovies.rows.some((row) => row.includes('一代歌后鍾湘') && row.includes('女主角')),
      '新名纱雪电影 hover 显示实机截图里的「女主角」', JSON.stringify(xinMovies));
      const chenMovies = await hoverArtistChip(8, 1);
      check(chenMovies && chenMovies.rows.some((row) => row.includes('不死靈魂') && row.includes('男配角'))
        && chenMovies.rows.some((row) => row.includes('笑傲天際') && row.includes('男主角')),
      '陈奕夫电影 hover 区分「男配角」与「男主角」', JSON.stringify(chenMovies));
      check(host?.maxHeight === '240px' && host?.overflow === 'auto'
        && albums?.maxHeight === '240px' && albums?.overflow === 'auto',
      '作品 hover 定高滚动，多条也不会撑爆页面',
      `${host?.maxHeight}/${host?.overflow} ${albums?.maxHeight}/${albums?.overflow}`);

      const groupWorkLabel = await evaluate(`document.querySelector('[data-case-group-work-count]')?.innerText.replace(/\\s+/g, ' ').trim() || ''`);
      check(/唱片\s*6\s*张/.test(groupWorkLabel), '团体卡通告统计显示唱片 6 张', groupWorkLabel);
      const groupFocused = await evaluate(`(function(){ var c = document.querySelector('[data-case-group-work-count]'); if (!c) return false; c.focus(); return true; })()`);
      await sleep(240);
      const groupTip = JSON.parse(await evaluate(`(function(){
        var c = document.querySelector('[data-case-group-work-count]');
        var tip = c?.parentElement.querySelector('[data-case-group-works-card]');
        if (!tip) return 'null';
        return JSON.stringify([...tip.querySelectorAll('[data-case-group-work]')].map(function(r){ return r.innerText.replace(/\\s+/g, ' ').trim(); }));
      })()`));
      check(groupFocused && Array.isArray(groupTip) && groupTip.length === 6
        && groupTip.every((row) => /\d{4}\/\d+\/\d+/.test(row)),
      '团体唱片 hover 与统计同为 6 条，每条带发行日期', JSON.stringify(groupTip));

      const groupEventsText = await evaluate(`[...document.querySelectorAll('[data-case-group-events]')]
        .map(function(x){ return x.innerText.replace(/\\s+/g, ' ').trim(); }).join(' || ')`);
      const artistCards = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('[data-case-artist]')].map(function(card){
        var social = card.querySelector('[data-case-artist-social]');
        if (!social) return null;
        var kids = [...social.children];
        var cs = getComputedStyle(social);
        var friend = social.querySelector('[data-case-artist-friendship]');
        var pop = social.querySelector('[data-case-artist-popularity]');
        var certs = [...card.querySelectorAll('[data-case-artist-cert]')]
          .map(function(x){ return x.innerText.replace(/\\s+/g, ' ').trim(); });
        var awards = [...card.querySelectorAll('[data-case-artist-award] [award-item], [data-case-artist-award] .award-item, [data-case-artist-company-award] .award-item')];
        var events = [...card.querySelectorAll('[data-case-artist-event] .event-item')];
        var chips = [...card.querySelectorAll('[data-case-artist-counts] .work-count-chip')];
        return {
          id: (card.innerText.match(/#(\\d+)/) || [])[1] || '',
          borderTop: cs.borderTopWidth, borderBottom: cs.borderBottomWidth,
          friendshipFirst: kids[0]?.hasAttribute('data-case-artist-friendship') === true,
          popularitySecond: kids[1]?.hasAttribute('data-case-artist-popularity') === true,
          firstBg: friend ? getComputedStyle(friend).backgroundColor : '',
          friendColor: friend ? getComputedStyle(friend).color : '',
          friendDot: friend ? getComputedStyle(friend, '::before').content : '',
          popBg: pop ? getComputedStyle(pop).backgroundColor : '',
          socialItemCount: social.querySelectorAll('.social-item').length,
          sep: kids[1] ? getComputedStyle(kids[1], '::before').content : '',
          certs: certs,
          certNone: !!card.querySelector('[data-case-artist-cert-none]'),
          certBg: certs.length ? getComputedStyle(card.querySelector('[data-case-artist-cert]')).backgroundColor : '',
          awardTitles: awards.map(function(x){ return x.innerText.trim(); }),
          awardColor: awards.length ? getComputedStyle(awards[0]).color : '',
          awardBg: awards.length ? getComputedStyle(awards[0]).backgroundColor : '',
          awardDot: awards.length ? getComputedStyle(awards[0], '::before').content : '',
          eventLabels: events.map(function(x){ return x.innerText.trim(); }),
          eventColor: events.length ? getComputedStyle(events[0]).color : '',
          eventBg: events.length ? getComputedStyle(card.querySelector('[data-case-artist-event]')).backgroundColor : '',
          eventDot: events.length ? getComputedStyle(events[0], '::before').content : '',
          chipCount: chips.length,
          chipBg: chips.length ? getComputedStyle(chips[0]).backgroundColor : '',
          chipSep: chips.length > 1 ? getComputedStyle(chips[1], '::before').content : '',
          // 性别徽章是圆角 pill：rounded-full + 文本恰好是「男」或「女」。
          genderBadges: [...card.querySelectorAll('.rounded-full')]
            .filter(function(x){ return /^[男女]$/.test(x.innerText.trim()); }).length,
          socialText: social.innerText.replace(/\\s+/g, ' ').trim(),
          eventText: (card.querySelector('[data-case-artist-events]')?.innerText || '').replace(/\\s+/g, ' ').trim(),
          contract: (function(){
            var d = card.querySelector('[data-case-artist-contract]');
            if (!d) return '';
            if (!d.open) d.open = true;
            return d.innerText.replace(/\\s+/g, ' ').trim();
          })(),
        };
      }).filter(Boolean))`));
      const xiaoCard = artistCards.find((c) => c.id === '6');
      check(Boolean(xiaoCard) && xiaoCard.borderTop === '1px' && xiaoCard.borderBottom === '1px'
        && xiaoCard.friendshipFirst && xiaoCard.popularitySecond,
      '艺人社交行用上下横线分区，友好度 / 人气排在最前', JSON.stringify(xiaoCard));
      const order = xiaoCard ? ['友好度', '人气', '压力', '叛逆'].map((s) => xiaoCard.socialText.indexOf(s)) : [];
      check(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])),
        '社交数值按 友好度 → 人气 → 压力/疲劳 → 次要属性 排列',
        `${order.join('/')} :: ${xiaoCard?.socialText ?? 'none'}`);
      // v1.15.1 视觉降噪：友好度去粉底胶囊、改品牌粉文字 + 圆点；人气去底色；
      // 奖项金色纯文字 + 菱形、活动青绿纯文字 + 菱形、证书 / 通告统计纯文字 + 分隔点。
      check(Boolean(xiaoCard) && (xiaoCard.firstBg === 'rgba(0, 0, 0, 0)' || xiaoCard.firstBg === 'transparent')
        && xiaoCard.friendDot !== 'none' && xiaoCard.friendDot !== 'normal' && xiaoCard.friendColor !== '',
        '友好度去粉底胶囊，改品牌粉文字 + 圆点（::before）',
        `bg=${xiaoCard?.firstBg} dot=${xiaoCard?.friendDot} color=${xiaoCard?.friendColor}`);
      check(Boolean(xiaoCard) && (xiaoCard.popBg === 'rgba(0, 0, 0, 0)' || xiaoCard.popBg === 'transparent'),
        '人气去掉淡粉底胶囊，保留深色加粗文字', xiaoCard?.popBg ?? 'none');
      check(Boolean(xiaoCard) && xiaoCard.socialItemCount >= 2 && xiaoCard.sep !== 'none'
        && xiaoCard.sep !== 'normal',
        '人气 / 压力疲劳项前加淡分隔点（social-item::before），避开友好度圆点',
        `items=${xiaoCard?.socialItemCount} sep=${xiaoCard?.sep}`);
      const certCard = artistCards.find((c) => c.certs.length > 0);
      check(Boolean(certCard) && (certCard.certBg === 'rgba(0, 0, 0, 0)' || certCard.certBg === 'transparent'),
        '证书去粉底胶囊，改纯文字', `${certCard?.id}:${certCard?.certs.join('+')} bg=${certCard?.certBg}`);
      const awardCard = artistCards.find((c) => c.awardTitles.length > 0);
      check(Boolean(awardCard) && (awardCard.awardBg === 'rgba(0, 0, 0, 0)' || awardCard.awardBg === 'transparent')
        && awardCard.awardDot !== 'none' && awardCard.awardDot !== 'normal',
        '奖项去金底胶囊，改金色纯文字 + 菱形（::before）',
        `${awardCard?.id}:${awardCard?.awardTitles[0]} bg=${awardCard?.awardBg} dot=${awardCard?.awardDot}`);
      const eventCard = artistCards.find((c) => c.eventLabels.length > 0);
      check(Boolean(eventCard) && (eventCard.eventBg === 'rgba(0, 0, 0, 0)' || eventCard.eventBg === 'transparent')
        && eventCard.eventDot !== 'none' && eventCard.eventDot !== 'normal',
        '活动去粉底胶囊，改青绿纯文字 + 菱形（::before）',
        `${eventCard?.id}:${eventCard?.eventLabels[0]} color=${eventCard?.eventColor} dot=${eventCard?.eventDot}`);
      check(eventCard?.eventColor === 'rgb(15, 90, 82)',
        '活动名用青绿 #0f5a52，与金色奖项区分', eventCard?.eventColor ?? 'none');
      check(Boolean(xiaoCard) && xiaoCard.chipCount === 6
        && (xiaoCard.chipBg === 'rgba(0, 0, 0, 0)' || xiaoCard.chipBg === 'transparent')
        && xiaoCard.chipSep !== 'none' && xiaoCard.chipSep !== 'normal',
        '通告统计 6 项平时无底色、项间淡分隔点（hover 才浮粉底）',
        `chips=${xiaoCard?.chipCount} bg=${xiaoCard?.chipBg} sep=${xiaoCard?.chipSep}`);
      check(artistCards.every((c) => c.genderBadges === 0),
        '艺人卡标题行不显示男 / 女徽章',
        artistCards.filter((c) => c.genderBadges).map((c) => `${c.id}:${c.genderBadges}`).join(' '));
      check(groupEventsText.includes('大型團體演唱會')
        && artistCards.every((c) => !c.eventText.includes('大型團體演唱會')),
      '大型团体演唱会只在团体卡活动里，不挂个人卡',
      `${groupEventsText.slice(0, 90)} || ${artistCards.filter((c) => c.eventText).map((c) => c.eventText.slice(0, 30)).join(' / ')}`);
      check(Boolean(xiaoCard) && xiaoCard.contract.includes('2006/1/1')
        && xiaoCard.contract.includes('2010/1/24') && xiaoCard.contract.includes('50%'),
      '艺人卡合约信息显示签约时间 / 到期日 / 分红', xiaoCard?.contract ?? 'none');
    }

    // v1.17.0 本周便签：Excel 导入、独立存储、显示白名单、日期不截断、旧缓存兼容。
    await evaluate(`localStorage.removeItem('mxzy3.case.memo.v1'); true`);
    await navigate('http://localhost:5173/#/case');
    await uploadSave(SAVE);
    await uploadMemo(MEMO);

    const memoFormats = JSON.parse(await evaluate(`import('/src/lib/memoNotes.ts').then((m) => JSON.stringify([
      m.formatWeekRange('2006.8.13-2006.8.19'),
      m.formatWeekRange('2006.12.31-2007.1.6'),
      m.formatWeekRange('2006.12.31-1.6'),
    ]))`));
    check(memoFormats[0] === '2006.8.13–8.19' && memoFormats[1] === '2006.12.31–2007.1.6'
      && memoFormats[2] === '2006.12.31–2007.1.6',
    '便签日期同年省年份、跨年保留两年', JSON.stringify(memoFormats));

    const memoState = JSON.parse(await evaluate(`JSON.stringify((() => {
      const aside = document.querySelector('[data-case-memo][data-case-memo-variant="aside"]');
      const inline = document.querySelector('[data-case-memo][data-case-memo-variant="inline"]');
      const body = aside?.querySelector('[data-case-memo-body]');
      const range = aside?.querySelector('[data-case-memo-range]');
      const toolbar = document.querySelector('[data-case-toolbar]');
      const stored = JSON.parse(localStorage.getItem('mxzy3.case.memo.v1') || 'null');
      return {
        asideVisible: aside ? getComputedStyle(aside).display !== 'none' : false,
        expanded: aside?.querySelector('[data-case-memo-toggle]')?.getAttribute('aria-expanded'),
        labels: body ? [...body.children].map((card) => card.children[0]?.textContent.trim()) : [],
        values: body ? [...body.children].map((card) => card.children[1]?.textContent.trim()) : [],
        rangeText: range?.textContent.trim(),
        rangeTitle: range?.getAttribute('title'),
        rangeClipped: range ? range.scrollWidth > range.clientWidth + 1 : null,
        toolbarHasMemoButtons: toolbar ? /导入备忘录|下载模板/.test(toolbar.innerText) : null,
        inlineHidden: inline ? getComputedStyle(inline.parentElement).display === 'none' : null,
        storedLabels: stored?.weeks?.[0]?.cells?.map((cell) => cell.label) ?? [],
        storedFile: stored?.fileName ?? '',
      };
    })())`));
    console.log('memo:', JSON.stringify(memoState));
    check(memoState.asideVisible && memoState.expanded === 'true',
      '本周便签在宽屏右栏常驻且默认展开');
    check(JSON.stringify(memoState.labels) === JSON.stringify(['当周排班', '心得备注']),
      '本周便签只显示当周排班与心得备注', JSON.stringify(memoState.labels));
    check(memoState.values.some((v) => v.includes('去开罗给初始女艺人买礼物'))
      && memoState.values.some((v) => v.includes('自告奋勇')),
    '本周便签内容来自导入的 Excel', JSON.stringify(memoState.values));
    check(memoState.rangeText === '2006.1.29–2.4'
      && memoState.rangeTitle === '2006.1.29-2006.2.4' && memoState.rangeClipped === false,
    '便签日期完整显示且同年不重复年份',
    `${memoState.rangeText} / title=${memoState.rangeTitle} / clipped=${memoState.rangeClipped}`);
    check(memoState.toolbarHasMemoButtons === false,
      '备忘录按钮只在便签里，不重复出现在工具栏');
    check(memoState.inlineHidden === true,
      '宽屏只显示右栏便签，正文简版隐藏');
    check(JSON.stringify(memoState.storedLabels) === JSON.stringify(['当周排班', '心得备注'])
      && memoState.storedFile === 'case-memo-e2e.xlsx',
    '导入结果存进独立 localStorage 且只保留两列',
    `${memoState.storedFile} :: ${JSON.stringify(memoState.storedLabels)}`);

    const memoNav = async () => JSON.parse(await evaluate(`JSON.stringify((() => {
      const aside = document.querySelector('[data-case-memo][data-case-memo-variant="aside"]');
      const prev = aside?.querySelector('[data-case-memo-prev]');
      const next = aside?.querySelector('[data-case-memo-next]');
      const current = aside?.querySelector('[data-case-memo-current]');
      const body = aside?.querySelector('[data-case-memo-body]');
      return {
        label: aside?.querySelector('[data-case-memo-label]')?.textContent.trim(),
        range: aside?.querySelector('[data-case-memo-range]')?.textContent.trim(),
        values: body ? [...body.children].map((card) => card.children[1]?.textContent.trim()) : [],
        prevDisabled: prev?.disabled ?? null,
        nextDisabled: next?.disabled ?? null,
        hasCurrent: !!current,
      };
    })())`));
    const navStart = await memoNav();
    check(navStart.prevDisabled === true && navStart.nextDisabled === false && !navStart.hasCurrent,
      '当前周：上一周禁用、下一周可用、不显示回到当前', JSON.stringify(navStart));

    await evaluate(`document.querySelector('[data-case-memo][data-case-memo-variant="aside"] [data-case-memo-next]').click(); true`);
    await sleep(250);
    const navNext = await memoNav();
    check(navNext.label === '后 1 周' && navNext.range === '2006.2.5–2.11'
      && navNext.values.some((v) => v.includes('第二周排班')),
    '下一周切到后一周并显示那周内容', JSON.stringify(navNext));
    check(navNext.prevDisabled === false && navNext.nextDisabled === true && navNext.hasCurrent,
      '最后一周：下一周禁用、出现回到当前', JSON.stringify(navNext));

    await evaluate(`document.querySelector('[data-case-memo][data-case-memo-variant="aside"] [data-case-memo-current]').click(); true`);
    await sleep(250);
    const navReset = await memoNav();
    check(navReset.label === '本周便签' && navReset.range === '2006.1.29–2.4' && !navReset.hasCurrent,
      '回到当前恢复本周便签', JSON.stringify(navReset));

    const memoBeforeSwitch = await evaluate(`localStorage.getItem('mxzy3.case.memo.v1')`);
    await uploadSave(path.join(SNAP, 'Story0001.sa2'));
    const memoAfterSwitch = await evaluate(`localStorage.getItem('mxzy3.case.memo.v1')`);
    check(memoBeforeSwitch === memoAfterSwitch,
      '切换存档后备忘录保持不变');

    await send('Emulation.setDeviceMetricsOverride', {
      width: 800, height: 900, deviceScaleFactor: 1, mobile: false,
    });
    await sleep(400);
    const narrowMemo = JSON.parse(await evaluate(`JSON.stringify((() => {
      const aside = document.querySelector('[data-case-memo][data-case-memo-variant="aside"]');
      const inline = document.querySelector('[data-case-memo][data-case-memo-variant="inline"]');
      return {
        asideHidden: aside ? getComputedStyle(aside.parentElement).display === 'none' : null,
        inlineVisible: inline ? getComputedStyle(inline.parentElement).display !== 'none' : false,
      };
    })())`));
    check(narrowMemo.asideHidden === true && narrowMemo.inlineVisible === true,
      '窄屏隐藏右栏便签，改在正文顶部显示简版', JSON.stringify(narrowMemo));
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 900, deviceScaleFactor: 1, mobile: false,
    });

    await navigate('http://localhost:5173/#/case');
    await evaluate(`localStorage.setItem('mxzy3.case.memo.v1', JSON.stringify({
      version: 1,
      fileName: '旧格式.xlsx',
      importedAt: Date.now(),
      columns: ['年', '月', '周次', '日期区间', '当周排班', '心得备注'],
      weeks: [{
        rangeText: '2006.1.29-2006.2.4',
        fromDay: Math.floor(Date.UTC(2006, 0, 29) / 86400000),
        toDay: Math.floor(Date.UTC(2006, 1, 4) / 86400000),
        cells: [
          { label: '年', value: '1' },
          { label: '月', value: '1' },
          { label: '周次', value: '5' },
          { label: '当周排班', value: '旧排班' },
          { label: '心得备注', value: '旧备注' },
        ],
      }],
    })); true`);
    await navigate('http://localhost:5173/#/case');
    await uploadSave(SAVE);
    const migratedMemo = JSON.parse(await evaluate(`JSON.stringify((() => {
      const body = document.querySelector('[data-case-memo][data-case-memo-variant="aside"] [data-case-memo-body]');
      return {
        labels: body ? [...body.children].map((card) => card.children[0]?.textContent.trim()) : [],
        values: body ? [...body.children].map((card) => card.children[1]?.textContent.trim()) : [],
      };
    })())`));
    check(JSON.stringify(migratedMemo.labels) === JSON.stringify(['当周排班', '心得备注'])
      && JSON.stringify(migratedMemo.values) === JSON.stringify(['旧排班', '旧备注']),
    '旧格式备忘录自动过滤年/月/周次且保留内容', JSON.stringify(migratedMemo));

    // Story0002：道具段前面有几条错位记录，旧扫描会跳过真正的清单起点，
    // 只留下神秘香精油。这里守住截图里的六件一般物品都能读出来。
    await uploadSave(path.join(SNAP, 'Story0002.sa2'));
    await evaluate(`(() => {
      const box = document.querySelector('[data-case-items]');
      if (box && !box.open) box.querySelector('[data-case-items-summary]')?.click();
      const tab = document.querySelector('[data-case-item-tab="一般物品"]');
      if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
      return true;
    })()`);
    await sleep(350);
    const story2Items = JSON.parse(await evaluate(`JSON.stringify([...document.querySelectorAll('[data-case-item]')]
      .map((row) => row.getAttribute('data-case-item-code')))`));
    check([1, 2, 3, 5, 6, 807].every((code) => story2Items.includes(String(code))),
      'Story0002 六件一般物品都能读出来', JSON.stringify(story2Items));

    await navigate('http://localhost:5173/sweet.html');
    const sweetState = JSON.parse(await evaluate(`JSON.stringify({
      tabs: document.querySelectorAll('[role="tab"]').length,
      caseTab: !!document.querySelector('[data-tab="case"]')
    })`));
    console.log('sweet:', JSON.stringify(sweetState));
    // 甜站现在有五个页签（通告 / 事件追踪 / CG 图鉴 / 存档解析 / 说明），且存档解析是独立页。
    check(sweetState.tabs === 5 && sweetState.caseTab, '甜蜜乐章 keeps its own five tabs');
  } finally {
    close();
  }

  console.log(`\n${checks - failures.length}/${checks} checks passed`);
  if (failures.length) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(1); });
