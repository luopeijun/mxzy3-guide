import { useEffect, useMemo, useRef, useState } from 'react';
import type { GuideData } from '../../types/guide';
import type { SpecialsData } from '../../types/specials';
import { listArtists } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';
import { useSpecials } from '../../hooks/useSpecials';
import { evaluateBoard, noticeProgress } from '../../lib/specialsState';
import { parseTarget } from '../../lib/specials';
import { cn } from '../../lib/cn';
import NoticeCard from './NoticeCard';
import StatsPanel, { type GroupStatRow } from './StatsPanel';
import SaveArchivePanel from '../tracker/SaveArchivePanel';

interface Props {
  data: SpecialsData;
  guide: GuideData;
}

/** 六大通告条件看板。定位是「状态面板」，不是流程管理器：
 *  - 卡级指派决定每一条条件读谁的数值；
 *  - 属性 / 课程 / 计数 / 道具 / 证书只存一份，多张卡引用同一份状态；
 *  - 时间线备注零状态、零计数，只作为跳回事件追踪器的索引。 */
export default function SpecialsApp({ data, guide }: Props) {
  const { selectedArtists } = useTracker();
  const board = useSpecials(data.notices);
  const { state } = board;
  const [hideDone, setHideDone] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const allArtists = useMemo(() => listArtists(guide), [guide]);
  const titles = useMemo(() => new Map(allArtists.map((artist) => [artist.id, artist.title])), [allArtists]);
  const rosterArtists = useMemo(
    () => allArtists.filter((artist) => selectedArtists.includes(artist.id)),
    [allArtists, selectedArtists],
  );
  const evaluation = useMemo(() => evaluateBoard(data, state, titles), [data, state, titles]);

  const notices = useMemo(() => data.notices.filter((notice) => notice.id !== '_global'), [data.notices]);
  const globalNotes = data.rows.filter((row) => row.notice === '_global');
  const enabledNotices = notices.filter((notice) => state.enabled.includes(notice.id));
  const totals = enabledNotices.reduce(
    (sum, notice) => {
      const progress = noticeProgress(evaluation.byNotice[notice.id]);
      return { met: sum.met + progress.met, total: sum.total + progress.total };
    },
    { met: 0, total: 0 },
  );
  const notesByNotice = useMemo(() => {
    const map: Record<string, typeof data.rows> = {};
    for (const notice of notices) {
      map[notice.id] = data.rows.filter((row) => row.notice === notice.id && row.kind === 'note');
    }
    return map;
  }, [data.rows, notices]);

  // Group-level stat rows (团体名气 / 团体人气) store their value under a
  // gval: key in state.values; surface them here so the panel can edit them.
  const groupRows = useMemo<GroupStatRow[]>(
    () =>
      data.rows
        .filter((row) => row.kind === 'condition' && row.type === 'stat' && row.scope === 'group')
        .map((row) => {
          const parsed = parseTarget(row.target);
          return {
            key: `gval:${row.notice}:${row.id}`,
            label: row.name
              .replace(/[（(].*?[）)]/g, '')
              .replace('团体', '')
              .replace(/\s*>\s*\d+.*$/, '')
              .trim() || '名气',
            target: parsed && parsed.kind !== 'multi' ? parsed.min : 0,
          };
        }),
    [data.rows],
  );

  useEffect(() => {
    if (!archiveOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArchiveOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [archiveOpen]);

  // 右侧「六大通告」跳转导航：滚动时高亮当前卡片（取越过容器上沿的最后一张），
  // 点击平滑滚到对应卡片——和攻略页「本页小结」同一套路，只是锚点是 data-notice-id。
  const scrollRef = useRef<HTMLDivElement>(null);
  const jumpingRef = useRef(false);
  const [activeNotice, setActiveNotice] = useState<string>(notices[0]?.id ?? '');

  // 取当前应高亮的卡片：越过容器上沿的最后一张；滚到底时直接点亮最后一张。
  const computeActive = (): string => {
    const box = scrollRef.current;
    if (!box) return notices[0]?.id ?? '';
    const base = box.getBoundingClientRect().top;
    let current: string = notices[0]?.id ?? '';
    let best = -Infinity;
    for (const notice of notices) {
      const card = box.querySelector<HTMLElement>(`[data-notice-id="${notice.id}"]`);
      if (!card) continue;
      const top = card.getBoundingClientRect().top - base;
      if (top <= 40 && top > best) {
        best = top;
        current = notice.id;
      }
    }
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
      current = notices[notices.length - 1]?.id ?? current;
    }
    return current;
  };

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // 跳转动画进行中：屏蔽滚动监听抢高亮，保持 jumpToNotice 立即点亮的卡片，
      // 直到滚动停稳后由 jumpToNotice 的轮询解除锁并做最终同步。
      if (jumpingRef.current) return;
      setActiveNotice(computeActive());
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    // 用户手动滚动停下后同步一次（程序化滚动到底不一定派发此事件，
    // 那种情况由 jumpToNotice 的停稳轮询兜底）。
    box.addEventListener('scrollend', update);
    update();
    return () => {
      box.removeEventListener('scroll', onScroll);
      box.removeEventListener('scrollend', update);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [notices]);

  const jumpToNotice = (id: string) => {
    const box = scrollRef.current;
    const card = box?.querySelector<HTMLElement>(`[data-notice-id="${id}"]`);
    if (!box || !card) return;
    // 上锁：跳转动画期间禁止滚动监听改写高亮，保证立即点亮的卡片不被中途卡覆盖。
    jumpingRef.current = true;
    const top =
      card.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setActiveNotice(id);
    // 平滑滚动到容器底部不一定派发终止事件，轮询 scrollTop 停稳后解除锁并做最终同步。
    // 用「连续 3 次读数变化 < 2px」判定停稳：平滑滚动会在相邻整数像素间轻轻抖动，
    // 精确相等会永远不满足；减速中的瞬时停顿也被「变化 < 2px」容忍，不会提前误判。
    let last = -1;
    let consecutive = 0;
    let tries = 0;
    const poll = () => {
      tries += 1;
      const cur = box.scrollTop;
      if (Math.abs(cur - last) < 2) consecutive += 1;
      else {
        consecutive = 0;
        last = cur;
      }
      if (consecutive >= 3 || tries > 60) {
        jumpingRef.current = false; // 解锁：恢复滚动监听正常高亮
        setActiveNotice(computeActive()); // 最终同步（覆盖到底抖动造成的偏差）
        return;
      }
      window.setTimeout(poll, 100);
    };
    window.setTimeout(poll, 200);
  };

  return (
    <div data-specials-app className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col bg-canvas">
      <div className="flex min-h-0 flex-1">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[1560px] px-6 py-6 nav:px-4">
            {/* Heading */}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <h1 className="text-ui-xl font-bold text-brand-strong">六大通告 · 规划与追踪</h1>
                <p className="mt-1 text-ui-xs text-ink-muted">
                  先在上方「数值录入」填好旗下艺人的当前属性（演技 / 歌艺 / 口才 / 仪态 / 动感 / 体能 / 才智 / 自信 / 名气 / 人气，人气是 0–5 等级），证书行的「还差多少」会自动跟着算。
                  证书这一行点开就能勾「已取得」，并逐门点出课程等级（未上 → 初级 → … → 专业）。
                  数值只是参考、不强制填，填不填都不影响勾选进度；事件的时间与步骤在<a href="#/tracker" className="text-brand hover:underline">事件追踪器</a>里跟，这里不重复打勾。
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span data-board-progress data-met={totals.met} data-total={totals.total} className="rounded-full bg-surface px-3 py-1.5 text-ui-xs text-ink-muted shadow-soft">
                  已启用 <b className="text-brand-strong">{enabledNotices.length}</b> / 6 · 凑齐{' '}
                  <b className="text-growth-strong">{totals.met}</b> / {totals.total} 条
                </span>
                <label className="flex cursor-pointer items-center gap-1.5 text-ui-xs text-ink-faint">
                  <input
                    type="checkbox"
                    data-hide-done
                    checked={hideDone}
                    onChange={(event) => setHideDone(event.target.checked)}
                    style={{ accentColor: 'var(--color-brand)' }}
                    className="h-3.5 w-3.5"
                  />
                  收起已完成
                </label>
                <button
                  type="button"
                  data-specials-archive
                  onClick={() => setArchiveOpen(true)}
                  className="shrink-0 whitespace-nowrap rounded-full border border-line px-3 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                >
                  全部存档
                </button>
                <button
                  type="button"
                  data-reset
                  onClick={() => {
                    if (confirmReset) {
                      board.reset();
                      setConfirmReset(false);
                    } else {
                      setConfirmReset(true);
                    }
                  }}
                  className={cn(
                    'rounded-ui-xs px-2 py-1 text-ui-2xs',
                    confirmReset ? 'bg-alert-soft text-alert' : 'bg-surface text-ink-faint ring-1 ring-line hover:text-brand-strong',
                  )}
                >
                  {confirmReset ? '再点一次确认清空' : '清空本看板'}
                </button>
              </div>
            </div>
  
            {/* Global prerequisite — a read-only index row, not a condition. */}
            {globalNotes.length > 0 && (
              <div data-global-note className="mt-4 rounded-ui-md border border-gold-line bg-gold-soft px-4 py-2.5">
                {globalNotes.map((note) => (
                  <div key={note.id} className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-surface px-2 py-0.5 text-ui-2xs font-semibold text-gold">周目前提</span>
                    <span className="min-w-0 flex-1 text-ui-xs text-ink">{note.name}</span>
                    <span className="text-ui-2xs text-ink-faint">{note.hint}</span>
                    {note.link && <a href={note.link.href} className="text-ui-2xs text-brand hover:underline">攻略 ›</a>}
                  </div>
                ))}
              </div>
            )}
  
            {/* Roster: read from the tracker, never duplicated here. */}
            <div data-roster-bar className="mt-4 flex flex-wrap items-center gap-2 rounded-ui-md border border-line bg-surface px-4 py-2.5 shadow-soft">
              <span className="text-ui-xs font-semibold text-ink-muted">旗下阵容</span>
              <span className="text-ui-2xs text-ink-faint">读事件追踪器的名单，不在这里另选</span>
              <div className="flex flex-wrap gap-1.5">
                {rosterArtists.map((artist) => (
                  <span key={artist.id} data-roster-artist data-artist-id={artist.id} className="inline-flex items-center gap-1 rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-muted">
                    {artist.avatar && (
                      <img src={`${import.meta.env.BASE_URL}${artist.avatar}`} alt="" className="h-4 w-4 rounded-full object-cover" />
                    )}
                    {artist.title}
                  </span>
                ))}
                {!rosterArtists.length && (
                  <a href="#/tracker" data-roster-empty className="text-ui-2xs text-brand hover:underline">
                    还没选艺人 · 去事件追踪器选好 4 人 ›
                  </a>
                )}
              </div>
            </div>
  
            {/* Centralised numeric entry — the one place to record current
             *  attribute values; condition rows read from here and show gaps. */}
            <StatsPanel
              artists={rosterArtists}
              state={state}
              groupRows={groupRows}
              onStat={board.setStat}
              onValue={board.setValue}
            />
  
            {/* Six vertical cards, 3 × 2. */}
            <div className="mt-5 mb-1 flex items-center gap-2">
              <h2 className="text-ui-sm font-bold text-brand-strong">通告卡片</h2>
              <span className="text-ui-2xs text-ink-faint">
                六张卡默认全部启用，不想做的取消卡头勾选 → 指派艺人 → 逐条确认；标「共享」的条目改一处，多张卡同步
              </span>
            </div>
            <div data-notice-grid className="grid grid-cols-3 items-start gap-4 tab:grid-cols-2 phone:grid-cols-1">
              {notices.map((notice) => (
                <NoticeCard
                  key={notice.id}
                  notice={notice}
                  rows={evaluation.byNotice[notice.id] ?? []}
                  notes={notesByNotice[notice.id] ?? []}
                  artists={allArtists}
                  roster={selectedArtists}
                  state={state}
                  hideDone={hideDone}
                  onToggleEnabled={board.toggleEnabled}
                  onAssign={board.assign}
                  onUnassign={board.unassign}
                  onSetGroupLocked={board.setGroupLocked}
                  onCheck={board.toggleCheck}
                  onBump={board.bump}
                  onValue={board.setValue}
                  onDone={board.toggleDone}
                  onStat={board.setStat}
                  onCourse={board.cycleCourse}
                />
              ))}
            </div>
  
            <p className="mt-5 text-ui-2xs text-ink-faint">
              条件来源：人工维护的六大通告条件表（{data.stats.rows} 行 = {data.stats.conditions} 条条件 + {data.stats.notes} 条只读备注），
              深链已逐条对过攻略事件号。属性 / 证书的「还差多少」是可选填写，不填也不影响勾选进度。
            </p>
        </div>
      </div>

        <aside className="hidden w-[204px] shrink-0 py-5 pr-4 min-[1120px]:block">
          <nav
            data-specials-rail
            aria-label="六大通告跳转"
            className="sticky top-0 rounded-ui-md border border-line bg-surface p-3 shadow-soft"
          >
            <p className="px-1 text-ui-2xs font-semibold text-ink-faint">六大通告</p>
            <ul className="mt-2 flex flex-col gap-0.5">
              {notices.map((notice) => {
                const isActive = activeNotice === notice.id;
                const isEnabled = state.enabled.includes(notice.id);
                const prog = noticeProgress(evaluation.byNotice[notice.id] ?? []);
                return (
                  <li key={notice.id}>
                    <button
                      type="button"
                      data-specials-rail-item={notice.id}
                      aria-current={isActive ? 'true' : undefined}
                      onClick={() => jumpToNotice(notice.id)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-ui-xs px-2 py-1.5 text-left text-ui-2xs transition-colors',
                        isActive
                          ? 'bg-brand-soft font-semibold text-brand-strong'
                          : 'text-ink-muted hover:bg-surface-soft hover:text-brand-strong',
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          isActive ? 'bg-brand' : isEnabled ? 'bg-line-strong' : 'bg-line',
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{notice.title}</span>
                      {isEnabled && (
                        <span className={cn('shrink-0 tabular-nums', isActive ? 'text-brand-strong' : 'text-ink-faint')}>
                          {prog.met} / {prog.total}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>
      </div>

      {archiveOpen && (
        <div
          data-specials-archive-modal
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setArchiveOpen(false)}
        >
          <div
            className="max-h-full w-full max-w-[440px] overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <SaveArchivePanel />
          </div>
        </div>
      )}
    </div>
  );
}
