import http from 'node:http';
import fs from 'node:fs';

/* Regression for the status filter chips. Builds one line in each of the five
   phases through the real UI, then verifies counts, per-filter contents, chip
   geometry stability, search × filter, drag lock, in-place restore of 已移出,
   reset-to-全部 on reload, and the still-sticky header.
   Usage: node cdp_tracker_filter.mjs [url] [out.png] */
const [, , argUrl, out] = process.argv;
const url = argUrl || 'http://localhost:5173/#/tracker';
const ROOT = `(document.querySelector('[data-tracker-app]') || document)`;

function jsonPut(target) {
  return new Promise((resolve, reject) => {
    const req = http.request(target, { method: 'PUT' }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SNAPSHOT = `(() => {
  const root = ${ROOT};
  const chips = [...root.querySelectorAll('[data-filter-key]')];
  const artistChips = [...root.querySelectorAll('[data-artist-filter] [data-artist-key]')];
  const groupChips = [...root.querySelectorAll('[data-group-filter] [data-group-key]')];
  const artistRow = root.querySelector('[data-artist-filter]');
  const statusRow = root.querySelector('[data-filter-chips]');
  const cards = [...root.querySelectorAll('[data-active-pool] [data-line-card]')];
  const archive = root.querySelector('[data-completed-pool]');
  const jump = root.querySelector('[data-jump-completed]');
  const sticky = jump?.closest('.sticky');
  const scroller = (() => {
    let el = root.querySelector('input[aria-label="搜索事件池"]');
    while (el) {
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(cs.overflowY)) return el;
      el = el.parentElement;
    }
    return null;
  })();
  const master = (c) => c.querySelector('[data-master-checkbox]')?.getAttribute('aria-checked');
  const hasText = (c, t) => [...c.querySelectorAll('span')].some(s => s.textContent.trim() === t);
  const rects = chips.map(c => {
    const r = c.getBoundingClientRect();
    return [r.left, r.top, r.width, r.height].map(Math.round).join(',');
  });
  return JSON.stringify({
    filter: chips.find(c => c.getAttribute('aria-pressed') === 'true')?.getAttribute('data-filter-key') ?? null,
    counts: Object.fromEntries(chips.map(c => [c.getAttribute('data-filter-key'), Number(c.textContent.replace(/[^0-9]/g, ''))])),
    chipCount: chips.length,
    chipGeometry: rects,
    artistKeys: artistChips.map(c => c.getAttribute('data-artist-key')),
    artistPressed: artistChips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.getAttribute('data-artist-key')),
    groupKeys: groupChips.map(c => c.getAttribute('data-group-key')),
    groupPressed: groupChips.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.getAttribute('data-group-key')),
    artistRowBelowStatus: !!(statusRow && artistRow && statusRow.getBoundingClientRect().bottom <= artistRow.getBoundingClientRect().top),
    activeCards: cards.length,
    activeIds: cards.map(c => c.getAttribute('data-line-id')),
    allDone: cards.filter(c => master(c) === 'true').length,
    mixed: cards.filter(c => master(c) === 'mixed').length,
    abandonedBadges: cards.filter(c => hasText(c, '已放弃')).length,
    excludedBadges: cards.filter(c => c.querySelector('[data-excluded-badge]')).length,
    restoreButtons: cards.filter(c => c.querySelector('[data-restore-line]')).length,
    draggable: cards[0]?.querySelector('[aria-label="拖拽排序"]')?.getAttribute('draggable') ?? null,
    archive: !!archive,
    archiveExpanded: archive?.querySelector('[data-completed-toggle]')?.getAttribute('aria-expanded') ?? null,
    jumpDisabled: jump?.disabled ?? null,
    hint: root.querySelector('[data-filter-hint]')?.textContent.replace(/[ ]+/g, ' ').trim() ?? null,
    noMatch: [...root.querySelectorAll('p')].some(p => p.textContent.includes('没有匹配')),
    emptyFilter: [...root.querySelectorAll('p')].some(p => p.textContent.includes('点上方「全部」返回')),
    stickyTop: sticky ? Math.round(sticky.getBoundingClientRect().top) : null,
    scrollerTop: scroller ? Math.round(scroller.getBoundingClientRect().top) : null,
    scrollTop: scroller ? Math.round(scroller.scrollTop) : null,
  });
})()`;

const SEARCH = (value) => `(() => {
  const i = ${ROOT}.querySelector('input[aria-label="搜索事件池"]');
  const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  s.call(i, ${JSON.stringify(value)});
  i.dispatchEvent(new Event('input', { bubbles: true }));
  return 1;
})()`;

const CLICK_CHIP = (key) => `(() => { ${ROOT}.querySelector('[data-filter-key="${key}"]').click(); return 1; })()`;
const CLICK_ARTIST = (key) => `(() => { ${ROOT}.querySelector('[data-artist-key="${key}"]').click(); return 1; })()`;
const CLICK_GROUP = (key) => `(() => { ${ROOT}.querySelector('[data-group-key="${key}"]').click(); return 1; })()`;

async function main() {
  const target = await jsonPut('http://127.0.0.1:9339/json/new?' + encodeURIComponent(url));
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
  await send('Page.navigate', { url });
  await sleep(3500);

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const ex = r.exceptionDetails || r.result?.exceptionDetails;
    if (ex) throw new Error('CDP exception: ' + (ex.exception?.description || ex.text));
    return r.result?.value;
  };
  const snap = async () => JSON.parse(await evaluate(SNAPSHOT));
  const failures = [];
  const check = (label, s, fn) => {
    console.log(label, JSON.stringify(s));
    const problem = fn(s);
    if (problem) failures.push(`${label}: ${problem}`);
  };

  const state = JSON.stringify({
    version: 1,
    selectedArtists: ['characters/lin-fenfen', 'characters/lu-feng', 'characters/ou-yiqing'],
    lines: {}, order: [], pinned: [],
  });
  await evaluate(`localStorage.setItem('guide.progress.v1', ${JSON.stringify(state)}); 1`);
  await send('Page.reload');
  await sleep(3500);

  const baseline = await snap();
  const N = baseline.counts.notStarted;
  check('BASELINE', baseline, (s) => {
    if (s.chipCount !== 6) return `expected 6 chips, got ${s.chipCount}`;
    if (s.filter !== 'all' || s.counts.all !== N || s.counts.notStarted !== N) return 'baseline counts wrong';
    if (s.counts.inProgress || s.counts.completed || s.counts.abandoned || s.counts.excluded) return 'baseline should be all 未开始';
    if (s.draggable !== 'true') return 'drag should be enabled in 全部';
    if (s.chipGeometry.some((r) => r.split(',').length !== 4)) return 'chip geometry malformed';
    return null;
  });

  // Build one line in each phase through the actual UI, in a fixed order.
  // c0 → 已完成 (leaves the working list), c1 → 进行中, c2 → 已放弃,
  // c3 → 已移出 (leaves the pool entirely).
  await evaluate(`(() => { ${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')[0].querySelector('[data-master-checkbox]').click(); return 1; })()`);
  await sleep(350);
  await evaluate(`(() => { ${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')[0].querySelector('button[aria-expanded]').click(); return 1; })()`);
  await sleep(250);
  await evaluate(`(() => { ${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')[0].querySelector('button[aria-pressed]').click(); return 1; })()`);
  await sleep(350);
  await evaluate(`(() => {
    const c = ${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')[1];
    [...c.querySelectorAll('button')].find(b => b.textContent.trim() === '放弃').click();
    return 1;
  })()`);
  await sleep(350);
  await evaluate(`(() => {
    const c = ${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')[2];
    [...c.querySelectorAll('button')].find(b => b.textContent.trim() === '移出池子').click();
    return 1;
  })()`);
  await sleep(350);

  const setup = await snap();
  check('PHASES_BUILT', setup, (s) => {
    const want = { all: N - 1, inProgress: 1, notStarted: N - 4, completed: 1, abandoned: 1, excluded: 1 };
    for (const [k, v] of Object.entries(want)) {
      if (s.counts[k] !== v) return `${k} count ${s.counts[k]} != ${v}`;
    }
    if (s.archive !== true || s.archiveExpanded !== 'false') return 'archive missing or expanded';
    return null;
  });

  // Switch every chip and verify the filtered content. Also collect chip
  // geometry on every step: no chip may move or resize as counts change.
  const geometries = [];
  const views = {};
  for (const key of ['all', 'inProgress', 'notStarted', 'completed', 'abandoned', 'excluded']) {
    await evaluate(CLICK_CHIP(key));
    await sleep(260);
    const s = await snap();
    views[key] = s;
    geometries.push(JSON.stringify(s.chipGeometry));
    check(`VIEW_${key}`, s, (v) => {
      if (v.filter !== key) return `chip ${key} not selected`;
      if (v.chipCount !== 6) return 'chip disappeared';
      return null;
    });
  }
  if (new Set(geometries).size !== 1) failures.push('chip geometry changed while switching filters');

  check('FILTER_IN_PROGRESS', views.inProgress, (s) => {
    if (s.activeCards !== 1 || s.mixed !== 1 || s.allDone !== 0) return '进行中 should hold exactly the half-ticked line';
    if (s.draggable !== 'false') return 'drag must be locked in a filtered view';
    if (s.archive) return 'archive should not render in a filtered view';
    if (s.jumpDisabled !== true) return 'jump button should be disabled in a filtered view';
    return null;
  });
  check('FILTER_NOT_STARTED', views.notStarted, (s) => {
    if (s.activeCards !== N - 4 || s.mixed || s.allDone) return '未开始 should hold only untouched lines';
    return null;
  });
  check('FILTER_COMPLETED', views.completed, (s) => {
    if (s.activeCards !== 1 || s.allDone !== 1) return '已完成 should be flattened into the main list';
    if (s.archive) return '已完成 filter must not require the bottom archive';
    return null;
  });
  check('FILTER_ABANDONED', views.abandoned, (s) => {
    if (s.activeCards !== 1 || s.abandonedBadges !== 1) return '已放弃 line missing';
    return null;
  });
  check('FILTER_EXCLUDED', views.excluded, (s) => {
    if (s.activeCards !== 1 || s.excludedBadges !== 1 || s.restoreButtons !== 1) return '已移出 line must be restorable in place';
    return null;
  });
  check('VIEW_ALL', views.all, (s) => {
    if (s.activeCards !== N - 2) return `全部 working list should hold ${N - 2} lines, got ${s.activeCards}`;
    if (!s.archive || s.archiveExpanded !== 'false') return 'archive should be back and collapsed';
    if (s.jumpDisabled !== false || s.draggable !== 'true') return 'all-view interactions not restored';
    return null;
  });

  if (out) {
    await evaluate(CLICK_CHIP('inProgress'));
    await sleep(300);
    const r = await evaluate(`(() => {
      const m = ${ROOT}.querySelector('main').getBoundingClientRect();
      return JSON.stringify({ x: Math.max(0, Math.round(m.left) - 8), y: 56, width: Math.round(m.width) + 16, height: 420 });
    })()`);
    const clip = { ...JSON.parse(r), scale: 1 };
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip });
    fs.writeFileSync(out, Buffer.from(data, 'base64'));
    console.log('SHOT', out);
  }

  // Search combines with the filter (AND), and clearing restores the filter.
  await evaluate(CLICK_CHIP('notStarted'));
  await sleep(250);
  await evaluate(SEARCH('绝不可能命中的关键词zzz'));
  await sleep(350);
  check('FILTER_PLUS_SEARCH_EMPTY', await snap(), (s) => {
    if (s.activeCards !== 0 || !s.noMatch) return 'no-match state not shown inside a filter';
    return null;
  });
  await evaluate(SEARCH(''));
  await sleep(350);
  check('FILTER_PLUS_SEARCH_CLEARED', await snap(), (s) => {
    if (s.activeCards !== N - 4 || s.noMatch) return 'clearing search did not restore the filter';
    return null;
  });

  // Restore the excluded line right from its filtered card.
  await evaluate(CLICK_CHIP('excluded'));
  await sleep(250);
  const beforeRestore = await snap();
  await evaluate(`${ROOT}.querySelector('[data-restore-line]').click(); 1`);
  await sleep(400);
  const afterRestore = await snap();
  check('AFTER_RESTORE', afterRestore, (s) => {
    if (s.counts.excluded !== 0 || s.counts.all !== N) return 'restore did not update counts';
    if (s.activeCards !== 0 || !s.emptyFilter) return 'restored line should leave the 已移出 filter';
    if (JSON.stringify(s.chipGeometry) !== JSON.stringify(beforeRestore.chipGeometry)) return 'chips jumped after a count change';
    return null;
  });

  // Sticky header still pins to the scrollport top with the taller chip row.
  await evaluate(CLICK_CHIP('all'));
  await sleep(250);
  await evaluate(`(() => {
    let el = ${ROOT}.querySelector('input[aria-label="搜索事件池"]');
    while (el) {
      const cs = getComputedStyle(el);
      if (el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(cs.overflowY)) { el.scrollTop = 600; break; }
      el = el.parentElement;
    }
    return 1;
  })()`);
  await sleep(450);
  check('STICKY_WITH_CHIPS', await snap(), (s) => {
    if (s.stickyTop !== s.scrollerTop) return `sticky top ${s.stickyTop} != scroller top ${s.scrollerTop}`;
    return null;
  });

  // Filter selection is a view preference, not persisted progress.
  await evaluate(CLICK_CHIP('abandoned'));
  await sleep(250);
  await send('Page.reload');
  await sleep(3500);
  check('AFTER_RELOAD', await snap(), (s) => {
    if (s.filter !== 'all') return 'filter should reset to 全部 on reload';
    if (s.counts.excluded !== 0 || s.counts.completed !== 1 || s.counts.inProgress !== 1) return 'progress did not persist';
    return null;
  });

  // 艺人筛选：状态 chips 下面单独一行；多选艺人彼此并集，再与状态取交集。
  const artistBase = await snap();
  check('ARTIST_ROW', artistBase, (s) => {
    if (!s.artistRowBelowStatus) return '艺人筛选行必须排在状态筛选行下面';
    const want = ['all', 'characters/lin-fenfen', 'characters/lu-feng', 'characters/ou-yiqing'];
    if (JSON.stringify(s.artistKeys) !== JSON.stringify(want)) return `艺人 chips 应来自左侧追踪名单，实际 ${s.artistKeys.join(',')}`;
    if (JSON.stringify(s.artistPressed) !== JSON.stringify(['all'])) return '默认应选中「不限」';
    return null;
  });
  const artistId = artistBase.activeIds.find((id) => id.startsWith('characters/'));
  const secondKey = artistBase.artistKeys.find((k) => k !== 'all' && k !== artistId?.split('::')[0]);
  if (!artistId || !secondKey) {
    failures.push('need at least two artist lines for the artist-filter checks');
  } else {
    const artistKey = artistId.split('::')[0];
    const card = (id) => `[...${ROOT}.querySelectorAll('[data-active-pool] [data-line-card]')].find(c => c.getAttribute('data-line-id') === ${JSON.stringify(id)})`;
    // 让这条艺人线处于进行中（勾一步即可，不要点总勾选，否则它会进已完成区）。
    await evaluate(`(() => { ${card(artistId)}.querySelector('button[aria-expanded]').click(); return 1; })()`);
    await sleep(220);
    await evaluate(`(() => { ${card(artistId)}.querySelector('button[aria-pressed]').click(); return 1; })()`);
    await sleep(320);

    await evaluate(CLICK_ARTIST(artistKey));
    await sleep(300);
    const oneArtist = await snap();
    check('ARTIST_ONLY', oneArtist, (s) => {
      if (!s.activeIds.length || s.activeIds.some((id) => !id.startsWith(artistKey + '::'))) return '单艺人筛选混入了其他任务线';
      if (JSON.stringify(s.artistPressed) !== JSON.stringify([artistKey])) return '艺人选中状态不对';
      if (s.draggable !== 'false') return '艺人筛选时应禁用拖拽';
      return null;
    });

    await evaluate(CLICK_ARTIST(secondKey));
    await sleep(300);
    const twoArtists = await snap();
    check('ARTIST_UNION', twoArtists, (s) => {
      if (s.activeIds.length <= oneArtist.activeIds.length) return '选第二位艺人后结果没有变多';
      const allowed = (id) => id.startsWith(artistKey + '::') || id.startsWith(secondKey + '::') || id.startsWith('other-events/luousang/');
      if (s.activeIds.some((id) => !allowed(id))) return '多选艺人不是并集或混入了无关任务线';
      return null;
    });

    await evaluate(CLICK_CHIP('inProgress'));
    await sleep(300);
    check('ARTIST_PLUS_STATUS', await snap(), (s) => {
      if (!s.activeIds.length) return '艺人 + 进行中筛出了空列表';
      if (s.activeIds.some((id) => !id.startsWith(artistKey + '::') && !id.startsWith(secondKey + '::') && !id.startsWith('other-events/luousang/'))) return '艺人×状态混入了别的艺人';
      if (s.mixed !== s.activeIds.length || s.allDone) return '艺人×状态结果不全是进行中线';
      if (!s.hint?.includes('状态「进行中」') || !s.hint.includes('艺人「')) return '提示行没有同时写出状态与艺人';
      return null;
    });

    await evaluate(CLICK_ARTIST('all'));
    await sleep(300);
    check('ARTIST_CLEARED', await snap(), (s) => {
      if (s.artistPressed.length !== 1 || s.artistPressed[0] !== 'all') return '「不限」没有清除艺人选择';
      if (s.filter !== 'inProgress') return '清除艺人不应重置状态筛选';
      return null;
    });
  }

  // 分类筛选：和艺人同一行，经纪人事件簿 / 其他事件按站点配置给出。
  await evaluate(CLICK_CHIP('all'));
  await sleep(260);
  check('GROUP_ROW', await snap(), (s) => {
    if (!s.groupKeys.includes('all') || !s.groupKeys.includes('broker') || !s.groupKeys.includes('other')) return '分类 chips 缺少经纪人事件簿 / 其他事件';
    if (JSON.stringify(s.groupPressed) !== JSON.stringify(['all'])) return '分类默认应选中「不限」';
    return null;
  });
  await evaluate(CLICK_GROUP('broker'));
  await sleep(300);
  const brokerOnly = await snap();
  check('GROUP_BROKER', brokerOnly, (s) => {
    if (!s.activeIds.length || s.activeIds.some((id) => !id.startsWith('game-guide/'))) return '经纪人事件簿筛选混入了别的分类';
    if (s.draggable !== 'false') return '分类筛选时应禁用拖拽';
    return null;
  });
  await evaluate(CLICK_GROUP('other'));
  await sleep(300);
  const twoGroups = await snap();
  check('GROUP_UNION', twoGroups, (s) => {
    if (s.activeIds.length <= brokerOnly.activeIds.length) return '选「其他事件」后结果没有变多';
    if (s.activeIds.some((id) => !id.startsWith('game-guide/') && !id.startsWith('notices/') && !id.startsWith('other-events/'))) return '分类多选不是并集';
    return null;
  });
  await evaluate(CLICK_CHIP('inProgress'));
  await sleep(300);
  check('GROUP_PLUS_STATUS', await snap(), (s) => {
    if (!s.hint?.includes('状态「进行中」') || !s.hint.includes('分类「')) return '提示行没有同时写出状态与分类';
    if (s.activeIds.some((id) => !id.startsWith('game-guide/') && !id.startsWith('notices/') && !id.startsWith('other-events/'))) return '分类×状态混入了别的分类';
    return null;
  });
  await evaluate(CLICK_GROUP('all'));
  await sleep(300);
  check('GROUP_CLEARED', await snap(), (s) => {
    if (s.groupPressed.length !== 1 || s.groupPressed[0] !== 'all') return '「不限」没有清除分类选择';
    if (s.filter !== 'inProgress') return '清除分类不应重置状态筛选';
    return null;
  });

  if (failures.length) {
    console.error('FAILURES', JSON.stringify(failures, null, 2));
    process.exit(1);
  }
  console.log('ALL_CHECKS_PASSED');
  process.exit(0);
}

main().catch((e) => { console.error('CDP error:', e.message); process.exit(1); });
