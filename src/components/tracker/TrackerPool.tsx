import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool, type LineKind, type TaskLine } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';
import TaskLineCard from './TaskLineCard';

const KIND_ORDER: LineKind[] = ['artist', 'luousang', 'non-artist'];
const KIND_LABEL: Record<LineKind, string> = {
  artist: '艺人任务线',
  luousang: '路欧桑剧情',
  'non-artist': '其他事件',
};

interface Props {
  data: GuideData;
}

export default function TrackerPool({ data }: Props) {
  const { selectedArtists, getLine, restoreExcluded } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const visible = useMemo(
    () => pool.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'excluded'),
    [pool, getLine],
  );
  const excludedCount = pool.length - visible.length;

  const groups = useMemo(() => {
    const buckets: Record<LineKind, TaskLine[]> = { artist: [], luousang: [], 'non-artist': [] };
    for (const line of visible) buckets[line.kind].push(line);
    return KIND_ORDER.map((kind) => ({ kind, label: KIND_LABEL[kind], lines: buckets[kind] }));
  }, [visible]);

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
        groups.map(
          (group) =>
            group.lines.length > 0 && (
              <div key={group.kind} className="mb-6">
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
            ),
        )
      )}

      {excludedCount > 0 && (
        <button
          type="button"
          onClick={restoreExcluded}
          className="mt-2 text-ui-2xs text-ink-faint underline-offset-2 hover:text-brand-strong hover:underline"
        >
          已移出 {excludedCount} 条任务线，点击全部恢复
        </button>
      )}
    </section>
  );
}
