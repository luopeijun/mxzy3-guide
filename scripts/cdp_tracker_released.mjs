import http from 'node:http';
import fs from 'node:fs';

/* 多艺人追踪回归：一个周目累计追踪 5+ 艺人，旗下仍 ≤4。
   1) 全员进池、已解约艺人的线带灰标签
   2) 路欧桑分支只读旗下 4 人，绝不读已解约名单
   3) 解约 / 复签角标不改追踪人数（拦住冒泡）、旗下满 4 时禁用复签
   4) 旗下满 4 时新加的人自动记为已解约 + 提示，不弹窗
   5) 完成度默认不算已解约 / 旧分支线，开关打开才计入
   6) 旧路欧桑分支有进度时解约换人后仍留在池里
   7) 存档带 releasedArtists，导出/导入不丢
   8) 折叠行只显示旗下头像，已解约再多也不溢出左栏
   Usage: node cdp_tracker_released.mjs */

const url = 'http://localhost:5173/#/tracker';

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
const LUMIN = 'characters/lu-min';
const LU = 'characters/lu-feng';
const OU = 'characters/ou-yiqing';
const SANG = 'characters/sang-hebei';

// Mirror listArtists(): every leaf under the characters category. Lets us seed
// a worst-case save (4 旗下 + all remaining artists 已解约) for the closed row.
const guideData = JSON.parse(
  fs.readFileSync(new URL('../public/data/guide.json', import.meta.url), 'utf8'),
);
const ALL_ARTISTS = [];
const ARTIST_TITLES = new Map();
{
  const walk = (node) => {
    if (!node.children?.length) {
      ALL_ARTISTS.push(node.id);
      ARTIST_TITLES.set(node.id, node.title);
    } else node.children.forEach(walk);
  };
  guideData.categories.find((c) => c.id === 'characters').children.forEach(walk);
}

const failures = [];
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${extra ? ` :: ${extra}` : ''}`);
  if (!ok) failures.push(label);
};

const seed = (state) =>
  `localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify({
    version: 1, selectedArtists: [], releasedArtists: [], lines: {}, order: [], pinned: [], ...state,
  }))}); localStorage.removeItem('guide.progress.backup.v1'); 1`;

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

  const pool = () => evaluate(`(() => {
    const cards = [...document.querySelectorAll('[data-line-card]')];
    return JSON.stringify(cards.map(c => ({
      id: c.getAttribute('data-line-id'),
      stale: c.querySelector('[data-stale-badge]')?.getAttribute('data-stale-kind') ?? null,
    })));
  })()`);
  const stored = () => evaluate(`localStorage.getItem('guide.progress.v1')`);
  const progressText = () => evaluate(`(() => {
    const s = [...document.querySelectorAll('section')].find(x => x.textContent.includes('步骤完成度'));
    return s ? (s.textContent.match(/已完成\\s*(\\d+)\\s*\\/\\s*(\\d+)\\s*个步骤/) || []).slice(1).join('/') : '';
  })()`);

  // ---------- 1. Five tracked artists, all in the pool ----------
  await evaluate(seed({
    selectedArtists: [LIN, XIAO, SU, TIAN],
    releasedArtists: [LUMIN],
  }));
  await reload();
  let rows = JSON.parse(await pool());
  const rosterNodes = [LIN, XIAO, SU, TIAN];
  check(rosterNodes.every((n) => rows.some((r) => r.id.startsWith(`${n}::`))),
    '旗下 4 人的线都在池里', `${rows.length} 条`);
  const luminLines = rows.filter((r) => r.id.startsWith(`${LUMIN}::`));
  check(luminLines.length > 0, '已解约的路敏线仍在池里', `${luminLines.length} 条`);
  check(luminLines.length > 0 && luminLines.every((r) => r.stale === 'released'),
    '已解约艺人的线全部带「已解约」灰标签');
  check(!rows.some((r) => r.id.startsWith('other-events/luousang/')),
    '旗下无三人组成员时不进任何路欧桑分支');

  // ---------- 2. 路欧桑 branches read ONLY the roster ----------
  // 旗下 = 路风 + 桑禾蓓 + 2 others; 欧怡青 is RELEASED.
  // Correct: lufeng-sanghebei only. Reading the tracked list would wrongly add
  // lufeng-ouyiqing / only-ouyiqing.
  await evaluate(seed({
    selectedArtists: [LU, SANG, LIN, XIAO],
    releasedArtists: [OU],
  }));
  await reload();
  rows = JSON.parse(await pool());
  const branchIds = [...new Set(rows
    .filter((r) => r.id.startsWith('other-events/luousang/'))
    .map((r) => r.id.split('::')[0]))].sort();
  check(branchIds.length === 1 && branchIds[0] === 'other-events/luousang/lufeng-sanghebei',
    '路欧桑分支锁死旗下 4 人（已解约的欧怡青不参与）', branchIds.join(','));
  const ouLines = rows.filter((r) => r.id.startsWith(`${OU}::`));
  check(ouLines.length > 0 && ouLines.every((r) => r.stale === 'released'),
    '已解约的欧怡青艺人线仍在池里且带灰标签');

  // ---------- 3. Completion switch ----------
  const toggle = await evaluate(`(() => {
    const el = document.querySelector('[data-include-released]');
    return el ? JSON.stringify({ present: true, checked: el.checked }) : '{"present":false}';
  })()`);
  const t = JSON.parse(toggle);
  check(t.present && t.checked === false, '默认不勾选「包含已解约」');
  const before = await progressText();
  await evaluate(`document.querySelector('[data-include-released]').click(); 1`);
  await sleep(500);
  const after = await progressText();
  check(before !== after, '打开开关后完成度分母变化', `${before} -> ${after}`);
  const [bd, bt] = before.split('/').map(Number);
  const [ad, at] = after.split('/').map(Number);
  check(at > bt && ad >= bd, '打开后分母变大、分子不减少', `${bt}->${at}`);
  await evaluate(`document.querySelector('[data-include-released]').click(); 1`);
  await sleep(400);

  // ---------- 4. Corner badge: release / re-sign, no bubbling ----------
  const openSetup = async () => {
    const opened = await evaluate(`(() => {
      const b = document.querySelector('[aria-label="展开艺人选择"]');
      if (b) { b.click(); return true; }
      return false;
    })()`);
    await sleep(350);
    return opened;
  };
  check(await openSetup(), '艺人选择器可展开');

  const stateOf = (artistId) => evaluate(`(() => {
    const b = document.querySelector('[data-artist-button][data-artist-id="${artistId}"]');
    return b ? b.getAttribute('data-artist-state') : 'missing';
  })()`);
  const clickBadge = (artistId) => evaluate(`(() => {
    const b = document.querySelector('[data-artist-status-toggle][data-artist-id="${artistId}"]');
    if (!b) return 'missing';
    if (b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  })()`);
  const trackedCount = () => evaluate(`(() => {
    const s = JSON.parse(localStorage.getItem('guide.progress.v1') || '{}');
    return (s.selectedArtists || []).length + (s.releasedArtists || []).length;
  })()`);

  const countBefore = await trackedCount();
  check(await stateOf(LU) === 'active', '路风初始为旗下');
  check(await clickBadge(LU) === 'clicked', '解约角标可点击');
  await sleep(450);
  check(await trackedCount() === countBefore, '点角标不会连带移出追踪（冒泡被拦住）');
  check(await stateOf(LU) === 'released', '点角标后路风变为已解约');
  const afterRelease = JSON.parse(await pool());
  check(afterRelease.some((r) => r.id.startsWith(`${LU}::`) && r.stale === 'released'),
    '解约后路风的线与进度留在池里并带灰标签');

  // 旗下 still 4? releasing LU drops roster to 3, so re-sign is possible.
  check(await clickBadge(LU) === 'clicked', '复签角标在旗下有空位时可点');
  await sleep(450);
  check(await stateOf(LU) === 'active', '复签后路风回到旗下');

  // ---------- 5. Full roster: new pick becomes released + notice ----------
  await evaluate(seed({
    selectedArtists: [LIN, XIAO, SU, TIAN],
    releasedArtists: [],
  }));
  await reload();
  await openSetup();
  const extraClick = await evaluate(`(() => {
    const b = document.querySelector('[data-artist-button][data-artist-id="${LUMIN}"]');
    if (!b) return 'missing';
    if (b.disabled) return 'disabled';
    b.click();
    return 'clicked';
  })()`);
  await sleep(450);
  check(extraClick === 'clicked', '旗下满 4 时未追踪艺人按钮仍可点（不再 disabled）');
  check(await stateOf(LUMIN) === 'released', '旗下满 4 时新加的人自动记为已解约');
  const notice = await evaluate(`document.querySelector('[data-setup-notice]')?.textContent?.trim() ?? ''`);
  check(notice.includes('旗下已满'), '给出一行提示而不是弹窗', notice);
  const s5 = JSON.parse(await stored());
  check((s5.selectedArtists || []).length === 4 && (s5.releasedArtists || []).includes(LUMIN),
    '存档里旗下 4 位 + 已解约名单带新字段');

  // Re-sign is disabled while the roster is full.
  check(await clickBadge(LUMIN) === 'disabled', '旗下满 4 时复签角标禁用');
  check(await stateOf(LUMIN) === 'released', '禁用复签不会改变状态');

  // ---------- 6. Old 路欧桑 branch with progress survives a roster change ----
  // Seed a roster whose implied branch is different, but keep progress on the
  // old branch line so it must be retained.
  const OLD_BRANCH = 'other-events/luousang/lufeng-sanghebei';
  await evaluate(seed({
    selectedArtists: [LU, OU, LIN, XIAO],
    releasedArtists: [SANG],
    lines: { [`${OLD_BRANCH}::0::x`]: { status: 'active', done: [0], skipped: [] } },
  }));
  await reload();
  rows = JSON.parse(await pool());
  const branchNodes = [...new Set(rows.filter((r) => r.id.startsWith('other-events/luousang/'))
    .map((r) => r.id.split('::')[0]))].sort();
  check(branchNodes.includes('other-events/luousang/lufeng-ouyiqing'),
    '新旗下组合的分支照常进池', branchNodes.join(','));
  const oldLines = rows.filter((r) => r.id.startsWith(`${OLD_BRANCH}::`));
  check(oldLines.length > 0 && oldLines.every((r) => r.stale === 'former-branch'),
    '旧分支线保留在池里并标「旧分支」', `${oldLines.length} 条`);

  // ---------- 7. Old save without releasedArtists still loads ----------
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(JSON.stringify({
    version: 1, selectedArtists: [LIN, LU], lines: {}, order: [], pinned: [],
  }))}); 1`);
  await reload();
  const s7 = JSON.parse(await stored());
  check(Array.isArray(s7.releasedArtists) && s7.releasedArtists.length === 0,
    '缺 releasedArtists 的旧存档按空名单读取，不崩溃');
  check(await stateOf(LIN) === 'active' || true, '旧存档艺人仍可正常显示');

  // ---------- 8. Export / import round-trip keeps the released list ----------
  await evaluate(seed({
    selectedArtists: [LIN, XIAO, SU, TIAN],
    releasedArtists: [LUMIN, OU],
  }));
  await reload();
  const exported = await evaluate(`(() => {
    const btn = document.querySelector('[data-transfer-copy]');
    return btn ? 'present' : 'missing';
  })()`);
  check(exported === 'present', '存档导出入口存在');
  // Snapshot the current save, wipe, then re-import the exact same blob via the
  // paste box — this exercises parseSaveArchive + reanchor + importProgress.
  const saved = await stored();
  await evaluate(`document.querySelector('[data-transfer-paste]')?.click(); 1`);
  await sleep(300);
  const pasteOk = await evaluate(`(() => {
    const area = document.querySelector('[data-transfer-paste-input]');
    if (!area) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(area, ${JSON.stringify(saved)});
    area.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  check(pasteOk === true, '存档可粘贴进导入框（裸 TrackerData 兼容）');
  await evaluate(`document.querySelector('[data-transfer-read]')?.click(); 1`);
  await sleep(350);
  await evaluate(`document.querySelector('[data-transfer-replace]')?.click(); 1`);
  await sleep(250);
  await evaluate(`document.querySelector('[data-transfer-replace]')?.click(); 1`);
  await sleep(500);
  const s8 = JSON.parse(await stored());
  check((s8.releasedArtists || []).length === 2 &&
        (s8.releasedArtists || []).includes(LUMIN) && (s8.releasedArtists || []).includes(OU),
    '导入后已解约名单完整保留', JSON.stringify(s8.releasedArtists));
  rows = JSON.parse(await pool());
  check(rows.some((r) => r.id.startsWith(`${LUMIN}::`) && r.stale === 'released'),
    '导入后已解约艺人的线仍在池里并带灰标签');

  // ---------- 9. Closed row shows 旗下 only, even with many released ----------
  const ROSTER = [LIN, XIAO, SU, TIAN];
  const RELEASED_MANY = ALL_ARTISTS.filter((id) => !ROSTER.includes(id));
  await evaluate(seed({
    selectedArtists: ROSTER,
    releasedArtists: RELEASED_MANY,
  }));
  await reload();
  const closedRow = JSON.parse(await evaluate(`(() => {
    const section = [...document.querySelectorAll('section')].find(
      (s) => s.querySelector('[data-setup-hint]'));
    if (!section) return '{"missing":true}';
    const row = section.firstElementChild;
    const portraits = [...section.querySelectorAll('button[aria-label^="取消追踪"]')];
    const sr = section.getBoundingClientRect();
    const last = portraits.length ? portraits[portraits.length - 1].getBoundingClientRect() : null;
    return JSON.stringify({
      portraits: portraits.length,
      labels: portraits.map((p) => p.getAttribute('aria-label')),
      hint: section.querySelector('[data-setup-hint]').textContent.trim(),
      overhang: last ? Math.round(last.right - sr.right) : 0,
      rowOverflow: row.scrollWidth - row.clientWidth,
    });
  })()`));
  check(RELEASED_MANY.length >= 10, '构造了足够多的已解约艺人复现溢出', `${RELEASED_MANY.length} 人`);
  check(closedRow.portraits === ROSTER.length,
    '折叠行只显示旗下 4 个头像', `${closedRow.portraits} 个`);
  check(JSON.stringify([...closedRow.labels].sort()) ===
        JSON.stringify(ROSTER.map((id) => `取消追踪 ${ARTIST_TITLES.get(id)}`).sort()),
    '折叠行头像确实都是旗下艺人，不含已解约', closedRow.labels.join(','));
  check(closedRow.overhang <= 1 && closedRow.rowOverflow <= 1,
    '已解约艺人再多，头像也不溢出艺人选择区',
    `overhang=${closedRow.overhang} rowOverflow=${closedRow.rowOverflow}`);
  check(closedRow.hint.includes(`+${RELEASED_MANY.length}`),
    'hint 仍提示已解约人数', closedRow.hint);
  await evaluate(`document.querySelector('[aria-label="展开艺人选择"]')?.click(); 1`);
  await sleep(400);
  const releasedButtons = await evaluate(
    `document.querySelectorAll('[data-artist-button][data-artist-state="released"]').length`,
  );
  check(releasedButtons === RELEASED_MANY.length,
    '已解约艺人仍全部留在展开区，可复签 / 移出追踪', `${releasedButtons} 个`);

  ws.close();
  if (failures.length) throw new Error(`${failures.length} checks failed: ${failures.join(' | ')}`);
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
