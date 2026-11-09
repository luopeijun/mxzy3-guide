import { Fragment, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { matchLine, visibleStepCount, type LineMatch } from '../../lib/trackerSearch';
import { applyLineOrder, moveId } from '../../lib/trackerOrder';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';
import TaskLineCard from './TaskLineCard';

interface Props {
  data: GuideData;
}

interface DropHint {
  id: string;
  after: boolean;
}

/** One flat, globally ordered pool. Categories stay visible in the left/right
 *  rails as filters and stats, but no longer split the list — otherwise a drag
 *  could never cross a category boundary and 置顶 would only be local. */
export default function TrackerPool({ data }: Props) {
  const { selectedArtists, getLine, lineOrder, pinnedIds, togglePin, reorderLines } = useTracker();
  const [query, setQuery] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const visible = useMemo(
    () => pool.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'excluded'),
    [pool, getLine],
  );

  const matched = useMemo<LineMatch[]>(
    () =>
      visible
        .map((line) => matchLine(line, needle))
        .filter((entry): entry is LineMatch => entry !== null),
    [visible, needle],
  );

  const ordered = useMemo(
    () => applyLineOrder(matched, (entry) => entry.line.id, lineOrder, pinnedIds),
    [matched, lineOrder, pinnedIds],
  );

  const pinnedVisible = ordered.filter((entry) => pinnedIds.includes(entry.line.id)).length;
  const matchedEvents = ordered.reduce((sum, entry) => sum + visibleStepCount(entry), 0);

  const handleDragStart = (id: string) => (event: DragEvent<HTMLSpanElement>) => {
    if (searching) {
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
    if (!dragId || searching) return;
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
    const dragged = event.dataTransfer.getData('text/plain') || dragId;
    const after = dropHint?.id === targetId ? dropHint.after : false;
    if (dragged && dragged !== targetId) {
      const ids = ordered.map((entry) => entry.line.id);
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
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-ui-lg font-bold text-brand-strong">事件池</h2>
        <span className="text-ui-2xs text-ink-faint">
          {visible.length} 条任务线
          {pinnedVisible > 0 && ` · 置顶 ${pinnedVisible}`}
        </span>
      </div>

      <div className="sticky top-0 z-10 bg-canvas pb-3">
        <div className="flex items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2 shadow-soft transition-colors focus-within:border-brand-line">
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
        {searching && (
          <p className="mt-1.5 text-ui-2xs text-ink-faint">
            找到 {ordered.length} 条任务线 · {matchedEvents} 个事件（按 Esc 或「清空」退出；搜索时不可拖拽）
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          事件池为空。勾选艺人，或把已移出的任务线恢复回来。
        </p>
      ) : ordered.length === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          没有匹配「{query}」的任务线或事件，换个关键词试试。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {ordered.map((entry, index) => {
            const { line } = entry;
            const pinned = pinnedIds.includes(line.id);
            return (
              <Fragment key={line.id}>
                {index === pinnedVisible && pinnedVisible > 0 && (
                  <li className="flex items-center gap-2 py-0.5 text-ui-2xs text-ink-faint">
                    <span className="h-px flex-1 bg-line" />
                    其余 {ordered.length - pinnedVisible} 条 · 按住 ⠿ 拖动排序
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
                    dragDisabled={searching}
                    isDragging={dragId === line.id}
                    onDragStart={handleDragStart(line.id)}
                    onDragEnd={clearDrag}
                  />
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}
