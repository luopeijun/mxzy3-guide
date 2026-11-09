import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { computeGroups } from '../../lib/trackerGroups';
import { useTracker } from '../../hooks/useTracker';
import TaskLineCard from './TaskLineCard';

interface Props {
  data: GuideData;
}

export default function TrackerPool({ data }: Props) {
  const { selectedArtists, getLine } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const visible = useMemo(
    () => pool.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'excluded'),
    [pool, getLine],
  );

  const groups = useMemo(() => computeGroups(visible).filter((g) => g.lines.length > 0), [visible]);

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-ui-lg font-bold text-brand-strong">事件池</h2>
        <span className="text-ui-2xs text-ink-faint">{visible.length} 条任务线</span>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-8 text-center text-ui-xs text-ink-faint">
          事件池为空。勾选艺人，或把已移出的任务线恢复回来。
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mb-6">
            <h3 className="mb-2 text-ui-xs font-semibold text-ink-muted">
              {group.label}
              <span className="ml-1 text-ink-faint">（{group.lines.length}）</span>
            </h3>
            <div className="flex flex-col gap-3">
              {group.lines.map((line) => (
                <TaskLineCard key={line.id} line={line} />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
