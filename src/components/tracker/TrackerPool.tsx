import { useMemo, useState } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { computeGroups } from '../../lib/trackerGroups';
import { matchLine, visibleStepCount, type LineMatch } from '../../lib/trackerSearch';
import { useTracker } from '../../hooks/useTracker';
import TaskLineCard from './TaskLineCard';

interface Props {
  data: GuideData;
}

interface PoolGroup {
  key: string;
  label: string;
  entries: LineMatch[];
}

export default function TrackerPool({ data }: Props) {
  const { selectedArtists, getLine } = useTracker();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const visible = useMemo(
    () => pool.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'excluded'),
    [pool, getLine],
  );

  const groups = useMemo<PoolGroup[]>(() => {
    return computeGroups(visible)
      .map((group) => ({
        key: group.key,
        label: group.label,
        entries: group.lines
          .map((line) => matchLine(line, needle))
          .filter((entry): entry is LineMatch => entry !== null),
      }))
      .filter((group) => group.entries.length > 0);
  }, [visible, needle]);

  const matchedLines = groups.reduce((sum, group) => sum + group.entries.length, 0);
  const matchedEvents = groups.reduce(
    (sum, group) => sum + group.entries.reduce((n, entry) => n + visibleStepCount(entry), 0),
    0,
  );

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-ui-lg font-bold text-brand-strong">事件池</h2>
        <span className="text-ui-2xs text-ink-faint">{visible.length} 条任务线</span>
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
        {needle && (
          <p className="mt-1.5 text-ui-2xs text-ink-faint">
            找到 {matchedLines} 条任务线 · {matchedEvents} 个事件（按 Esc 或「清空」退出搜索）
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          事件池为空。勾选艺人，或把已移出的任务线恢复回来。
        </p>
      ) : matchedLines === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          没有匹配「{query}」的任务线或事件，换个关键词试试。
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mb-6">
            <h3 className="mb-2 text-ui-xs font-semibold text-ink-muted">
              {group.label}
              <span className="ml-1 text-ink-faint">（{group.entries.length}）</span>
            </h3>
            <div className="flex flex-col gap-3">
              {group.entries.map(({ line, matched }) => (
                <TaskLineCard key={line.id} line={line} matched={matched} query={query} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
