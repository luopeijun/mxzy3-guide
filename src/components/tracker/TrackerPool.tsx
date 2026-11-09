import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool, isLineComplete, type TaskLine } from '../../lib/tracker';
import { matchLine, visibleStepCount, type LineMatch } from '../../lib/trackerSearch';
import { applyLineOrder, moveId } from '../../lib/trackerOrder';
import { summarisePool } from '../../lib/trackerStats';
import {
  FILTER_LABEL,
  groupPhases,
  type LineFilter,
} from '../../lib/trackerFilter';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';
import TaskLineCard from './TaskLineCard';
import TrackerFilterChips from './TrackerFilterChips';

interface Props {
  data: GuideData;
}

interface DropHint {
  id: string;
  after: boolean;
}

function matchEntries(lines: TaskLine[], needle: string): LineMatch[] {
  return lines
    .map((line) => matchLine(line, needle))
    .filter((entry): entry is LineMatch => entry !== null);
}

/** One flat, globally ordered pool. Categories stay visible in the left/right
 *  rails as filters and stats, but no longer split the list — otherwise a drag
 *  could never cross a category boundary and 置顶 would only be local.
 *
 *  `全部` keeps the original layout (working list + collapsed 已完成 archive).
 *  Any other status filter flattens just that phase into the main list, so 已完成
 *  and 已放弃 no longer require scrolling to the bottom, and 已移出 can be
 *  restored in place. A filtered list is a partial view, so drag is disabled
 *  there for the same reason it is disabled while searching. */
export default function TrackerPool({ data }: Props) {
  const { selectedArtists, getLine, lineOrder, pinnedIds, togglePin, reorderLines } = useTracker();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LineFilter>('all');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [jumpRequested, setJumpRequested] = useState(false);
  const completedRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const filtering = filter !== 'all';
  const dragDisabled = searching || filtering;
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  // Buckets exist in every view: they drive the chip counts and the filtered
  // list. The 全部 view still uses the original split so its ordering, archive
  // and drag behaviour are byte-for-byte unchanged.
  const phases = useMemo(() => groupPhases(pool, getLine), [pool, getLine]);
  const stats = useMemo(() => summarisePool(pool, getLine), [pool, getLine]);
  const { activeLines, completedLines } = useMemo(() => {
    const activeLines: TaskLine[] = [];
    const completedLines: TaskLine[] = [];
    for (const line of pool) {
      const state = getLine(line.id);
      if ((state?.status ?? 'active') === 'excluded') continue;
      if (isLineComplete(line, state?.done ?? [], state?.skipped ?? [])) completedLines.push(line);
      else activeLines.push(line);
    }
    return { activeLines, completedLines };
  }, [pool, getLine]);

  const counts = useMemo<Record<LineFilter, number>>(
    () => ({
      all: activeLines.length + completedLines.length,
      inProgress: phases.inProgress.length,
      notStarted: phases.notStarted.length,
      completed: phases.completed.length,
      abandoned: phases.abandoned.length,
      excluded: phases.excluded.length,
    }),
    [activeLines, completedLines, phases],
  );

  const mainLines = filter === 'all' ? activeLines : phases[filter];
  const archiveLines = filtering ? [] : completedLines;
  const matchedMain = useMemo(() => matchEntries(mainLines, needle), [mainLines, needle]);
  const matchedArchive = useMemo(
    () => matchEntries(archiveLines, needle),
    [archiveLines, needle],
  );
  const ordered = useMemo(
    () => applyLineOrder(matchedMain, (entry) => entry.line.id, lineOrder, pinnedIds),
    [matchedMain, lineOrder, pinnedIds],
  );
  const orderedCompleted = useMemo(
    () => applyLineOrder(matchedArchive, (entry) => entry.line.id, lineOrder, pinnedIds),
    [matchedArchive, lineOrder, pinnedIds],
  );

  const pinnedVisible = ordered.filter((entry) => pinnedIds.includes(entry.line.id)).length;
  const foundLines = ordered.length + orderedCompleted.length;
  const matchedEvents =
    ordered.reduce((sum, entry) => sum + visibleStepCount(entry), 0) +
    orderedCompleted.reduce((sum, entry) => sum + visibleStepCount(entry), 0);
  const totalVisible = mainLines.length + archiveLines.length;
  const completedCount = filtering ? phases.completed.length : orderedCompleted.length;
  const jumpDisabled = filtering || orderedCompleted.length === 0;

  // Search should surface archived lines too; leaving the search restores the
  // default collapsed archive.
  useEffect(() => {
    setCompletedOpen(searching);
  }, [searching]);

  // A jump has to expand the archive *before* measuring: otherwise the smooth
  // scroll lands where the collapsed row used to be. Wait for the render that
  // has the expanded body, then scroll to it.
  useEffect(() => {
    if (!jumpRequested || !completedOpen) return;
    completedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setJumpRequested(false);
  }, [jumpRequested, completedOpen]);

  const jumpToCompleted = () => {
    if (jumpDisabled) return;
    setCompletedOpen(true);
    setJumpRequested(true);
  };

  const handleDragStart = (id: string) => (event: DragEvent<HTMLSpanElement>) => {
    if (dragDisabled) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData('text/plain', id);
    event.dataTransfer.effectAllowed = 'move';
    // Ghost the whole card rather than the tiny ⠿ handle.
    const card = (event.currentTarget as HTMLElement).closest('[data-line-card]');
    if (card) event.dataTransfer.setDragImage(card, 24, 20);
    setDragId(id);
  };

  const clearDrag = () => {
    setDragId(null);
    setDropHint(null);
  };

  const handleDragOver = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    if (!dragId || dragDisabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    setDropHint((previous) =>
      previous?.id === targetId && previous.after === after ? previous : { id: targetId, after },
    );
  };

  const handleDrop = (event: DragEvent<HTMLLIElement>, targetId: string) => {
    event.preventDefault();
    if (dragDisabled) {
      clearDrag();
      return;
    }
    const dragged = event.dataTransfer.getData('text/plain') || dragId;
    const after = dropHint?.id === targetId ? dropHint.after : false;
    if (dragged && dragged !== targetId) {
      // Rebuild the *global* id list (working + archived) so completing a line
      // never silently deletes its saved position from localStorage.
      const ids = applyLineOrder(
        [...ordered, ...orderedCompleted],
        (entry) => entry.line.id,
        lineOrder,
        pinnedIds,
      ).map((entry) => entry.line.id);
      const next = moveId(ids, dragged, targetId, after);
      if (next !== ids) {
        // Dropping beside a pinned line pins the dragged one; dropping beside
        // an ordinary line unpins it. That keeps order and pin state consistent.
        const pinSet = new Set(pinnedIds.filter((id) => id !== dragged));
        if (pinnedIds.includes(targetId)) pinSet.add(dragged);
        reorderLines(next, next.filter((id) => pinSet.has(id)));
      }
    }
    clearDrag();
  };

  return (
    <section className="pt-6 nav:pt-4 tab:pt-2">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-ui-lg font-bold text-brand-strong">事件池</h2>
        <span className="text-ui-2xs text-ink-faint">
          {filtering ? (
            `已筛选：${FILTER_LABEL[filter]} · ${ordered.length} 条`
          ) : (
            <>
              {activeLines.length} 条任务线
              {completedLines.length > 0 && ` · 已完成 ${completedLines.length}`}
              {pinnedVisible > 0 && ` · 置顶 ${pinnedVisible}`}
            </>
          )}
        </span>
      </div>

      {/* Opaque from the very top of the scrollport: the pt keeps a small gap
          under the shared header, and the higher z-index keeps drag hints /
          event rows from painting over the fixed search bar. */}
      <div className="sticky top-0 z-20 bg-canvas pt-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2 shadow-soft transition-colors focus-within:border-brand-line">
            <svg
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-ink-faint"
            >
              <circle cx="7" cy="7" r="4.5" />
              <path d="M10.5 10.5 14 14" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setQuery('');
              }}
              placeholder="搜索任务线、事件编号、类型或正文"
              aria-label="搜索事件池"
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-faint"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="shrink-0 rounded-full px-2 py-0.5 text-ui-2xs text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
              >
                清空
              </button>
            )}
          </div>
          {/* Always rendered (disabled when empty) so the sticky bar never
              reflows as lines get completed — one click expands + scrolls. */}
          <button
            type="button"
            data-jump-completed
            onClick={jumpToCompleted}
            disabled={jumpDisabled}
            title={
              filtering
                ? '点上方「已完成」筛选可直接查看全部已归档任务线'
                : orderedCompleted.length === 0
                  ? '还没有已完成的任务线'
                  : '展开并跳转到事件池底部的已完成区'
            }
            className={cn(
              'flex shrink-0 items-center gap-1 whitespace-nowrap rounded-ui-md border px-3 py-2 text-ui-2xs font-semibold transition-colors',
              jumpDisabled
                ? 'cursor-not-allowed border-line bg-surface-soft text-ink-faint'
                : 'border-gold-line bg-gold-soft text-gold hover:border-gold',
            )}
          >
            已完成 {completedCount} <span aria-hidden="true">↓</span>
          </button>
        </div>

        <TrackerFilterChips value={filter} counts={counts} onChange={setFilter} />

        {(searching || filtering) && (
          <p data-filter-hint className="mt-1.5 text-ui-2xs text-ink-faint">
            {searching
              ? `找到 ${foundLines} 条任务线 · ${matchedEvents} 个事件`
              : `正在筛选「${FILTER_LABEL[filter]}」· ${ordered.length} 条任务线`}
            {filtering && ' · 筛选时不可拖拽，状态改变会自动离开当前筛选'}
            {searching && ' · 按 Esc 或「清空」退出'}
          </p>
        )}
        {/* On a phone the three columns stack, which puts the 进度概览 rail
            thousands of pixels below the pool. This mirrors it into the sticky
            bar — only where the clue would otherwise be unreachable, and only
            while no search hint is occupying the row. */}
        {!searching && !filtering && (
          <div data-narrow-progress className="mt-1.5 hidden items-center gap-2 tab:flex">
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-brand-soft">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-300',
                  stats.pct === 100 ? 'bg-gold' : 'bg-brand',
                )}
                style={{ width: `${stats.pct}%` }}
              />
            </div>
            <span className="shrink-0 text-ui-2xs tabular-nums text-ink-faint">
              总进度 {stats.pctLabel}% · {stats.doneSteps}/{stats.totalSteps} 步
            </span>
          </div>
        )}
      </div>

      {totalVisible === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          {filtering
            ? `当前没有「${FILTER_LABEL[filter]}」的任务线，点上方「全部」返回。`
            : '事件池为空。勾选艺人，或把已移出的任务线恢复回来。'}
        </p>
      ) : foundLines === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          没有匹配「{query}」的任务线或事件，换个关键词试试。
        </p>
      ) : (
        <>
          {ordered.length > 0 ? (
            <ul className="flex flex-col gap-3" data-active-pool>
              {ordered.map((entry, index) => {
                const { line } = entry;
                const pinned = pinnedIds.includes(line.id);
                return (
                  <Fragment key={line.id}>
                    {index === pinnedVisible && pinnedVisible > 0 && (
                      <li className="flex items-center gap-2 py-0.5 text-ui-2xs text-ink-faint">
                        <span className="h-px flex-1 bg-line" />
                        {filtering
                          ? `其余 ${ordered.length - pinnedVisible} 条`
                          : `其余 ${ordered.length - pinnedVisible} 条 · 按住 ⠿ 拖动排序`}
                        <span className="h-px flex-1 bg-line" />
                      </li>
                    )}
                    <li
                      className="relative"
                      onDragOver={(event) => handleDragOver(event, line.id)}
                      onDrop={(event) => handleDrop(event, line.id)}
                    >
                      {dropHint?.id === line.id && (
                        <span
                          className={cn(
                            'pointer-events-none absolute left-0 right-0 z-10 h-[3px] rounded-full bg-brand',
                            dropHint.after ? '-bottom-2' : '-top-2',
                          )}
                        />
                      )}
                      <TaskLineCard
                        line={line}
                        matched={entry.matched}
                        query={query}
                        pinned={pinned}
                        onTogglePin={() => togglePin(line.id)}
                        dragDisabled={dragDisabled}
                        isDragging={dragId === line.id}
                        onDragStart={handleDragStart(line.id)}
                        onDragEnd={clearDrag}
                      />
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
              当前没有进行中的任务线，其余都在下方「已完成」区。
            </p>
          )}

          {/* scroll-mt keeps the archive below the taller sticky bar (search +
              filter chips + hint line). */}
          {orderedCompleted.length > 0 && (
            <div
              data-completed-pool
              ref={completedRef}
              className="mt-5 scroll-mt-36 overflow-hidden rounded-ui-md border border-gold-line bg-surface-soft"
            >
              <button
                type="button"
                data-completed-toggle
                onClick={() => setCompletedOpen((value) => !value)}
                aria-expanded={completedOpen}
                className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-left"
              >
                <span
                  className="shrink-0 text-gold transition-transform duration-150"
                  style={{ transform: completedOpen ? 'rotate(90deg)' : 'none' }}
                >
                  ▸
                </span>
                <span className="text-ui-sm font-semibold text-ink">已完成</span>
                <span className="rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs font-semibold text-gold">
                  {orderedCompleted.length} 条
                </span>
                <span className="ml-auto text-ui-2xs text-ink-faint">
                  未放弃的子任务全勾即归档 · 取消勾选可回到事件池
                </span>
              </button>
              {completedOpen && (
                <ul className="flex flex-col gap-3 border-t border-gold-line px-3 py-3">
                  {orderedCompleted.map((entry) => (
                    <li key={entry.line.id}>
                      <TaskLineCard
                        line={entry.line}
                        matched={entry.matched}
                        query={query}
                        pinned={pinnedIds.includes(entry.line.id)}
                        onTogglePin={() => togglePin(entry.line.id)}
                        dragDisabled
                        inCompletedPool
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* Tail space only when an archive exists: without scrollable room
              below it, scrollIntoView hits the bottom and leaves the archive
              half off-screen. 45vh is enough to park it under the sticky bar. */}
          {orderedCompleted.length > 0 && (
            <div data-completed-tail aria-hidden="true" className="h-[45vh]" />
          )}
        </>
      )}
    </section>
  );
}
