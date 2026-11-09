import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';

interface Props {
  data: GuideData;
}

/** Compact progress summary that rounds out the selector panel: how many lines
 *  are in the pool, how many steps are done, and what was abandoned/excluded. */
export default function TrackerOverview({ data }: Props) {
  const { selectedArtists, getLine } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const stats = useMemo(() => {
    let totalSteps = 0;
    let doneSteps = 0;
    let abandoned = 0;
    let excluded = 0;
    let activeLines = 0;
    for (const line of pool) {
      const status = getLine(line.id)?.status ?? 'active';
      if (status === 'excluded') {
        excluded += 1;
        continue;
      }
      if (status === 'abandoned') abandoned += 1;
      else activeLines += 1;
      totalSteps += line.steps.length;
      doneSteps += getLine(line.id)?.done.filter((i) => i < line.steps.length).length ?? 0;
    }
    const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
    return { totalLines: pool.length, activeLines, abandoned, excluded, totalSteps, doneSteps, pct };
  }, [pool, getLine]);

  const rows: Array<[string, number, string]> = [
    ['在池任务线', stats.activeLines, 'text-brand-strong'],
    ['放弃', stats.abandoned, 'text-ink-muted'],
    ['移出', stats.excluded, 'text-ink-faint'],
  ];

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <h2 className="text-ui-sm font-bold text-brand-strong">进度概览</h2>
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-ui-2xs text-ink-muted">步骤完成度</span>
          <span className="text-ui-sm font-semibold text-brand-strong">{stats.pct}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <p className="mt-1 text-ui-2xs text-ink-faint">
          已完成 {stats.doneSteps} / {stats.totalSteps} 个步骤
        </p>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="rounded-ui-sm border border-line bg-surface-soft py-2">
            <dt className="text-ui-2xs text-ink-faint">{label}</dt>
            <dd className={`mt-0.5 text-ui-lg font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
