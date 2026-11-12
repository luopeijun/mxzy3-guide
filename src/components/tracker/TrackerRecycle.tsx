import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';

interface Props {
  data: GuideData;
}

/** 放弃 / 移出的任务线集中在这里，可单条恢复——比池底那条「全部恢复」更可控。 */
export default function TrackerRecycle({ data }: Props) {
  const { config, poolSelection, getLine, setLineStatus, restoreExcluded } = useTracker();
  const pool = useMemo(
    () => buildPool(data, poolSelection, config),
    [data, poolSelection, config],
  );

  const items = useMemo(
    () =>
      pool
        .map((line) => ({ line, status: getLine(line.id)?.status ?? 'active' }))
        .filter((item) => item.status !== 'active'),
    [pool, getLine],
  );

  const excludedCount = items.filter((item) => item.status === 'excluded').length;

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="text-ui-sm font-bold text-brand-strong">已放弃 / 已移出</h2>
        <span className="text-ui-2xs text-ink-faint">{items.length} 条</span>
      </div>

      {items.length === 0 ? (
        <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">
          没有放弃或移出的任务线。任务线卡片上的「放弃」「移出池子」会归档到这里。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {items.map(({ line, status }) => (
            <li
              key={line.id}
              className="flex items-center gap-2 rounded-ui-sm border border-line bg-surface-soft px-2.5 py-1.5"
            >
              <span
                className={
                  status === 'abandoned'
                    ? 'shrink-0 rounded-full bg-missing-soft px-1.5 py-px text-ui-2xs text-missing'
                    : 'shrink-0 rounded-full bg-surface px-1.5 py-px text-ui-2xs text-ink-faint ring-1 ring-line-strong'
                }
              >
                {status === 'abandoned' ? '放弃' : '移出'}
              </span>
              <span className="min-w-0 flex-1 truncate text-ui-xs text-ink-muted" title={line.name}>
                {line.name}
              </span>
              <button
                type="button"
                onClick={() => setLineStatus(line.id, 'active')}
                className="shrink-0 text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
              >
                恢复
              </button>
            </li>
          ))}
        </ul>
      )}

      {excludedCount > 0 && (
        <button
          type="button"
          onClick={restoreExcluded}
          className="mt-3 w-full rounded-ui-sm border border-line px-3 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
        >
          恢复全部移出的 {excludedCount} 条
        </button>
      )}
    </section>
  );
}
