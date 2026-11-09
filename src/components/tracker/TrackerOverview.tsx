import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool, countDoneSteps, countedSteps, isLineComplete } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';

interface Props {
  data: GuideData;
}

/** Compact progress summary that rounds out the selector panel: how many lines
 *  are in the pool, how many steps are done, and what was abandoned/excluded. */
export default function TrackerOverview({ data }: Props) {
  const { selectedArtists, getLine, resetAll } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const stats = useMemo(() => {
    let totalSteps = 0;
    let doneSteps = 0;
    let skippedSteps = 0;
    let abandoned = 0;
    let excluded = 0;
    let activeLines = 0;
    let completedLines = 0;
    for (const line of pool) {
      const state = getLine(line.id);
      const status = state?.status ?? 'active';
      if (status === 'excluded') {
        excluded += 1;
        continue;
      }
      const done = state?.done ?? [];
      const skipped = state?.skipped ?? [];
      const complete = isLineComplete(line, done, skipped);
      if (complete) completedLines += 1;
      if (status === 'abandoned') abandoned += 1;
      else if (!complete) activeLines += 1;
      // 被放弃的步骤不计入分母，否则百分比永远到不了 100%。
      const counted = countedSteps(line, skipped);
      totalSteps += counted.length;
      skippedSteps += line.steps.length - counted.length;
      doneSteps += countDoneSteps(line, done, skipped);
    }
    const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
    return {
      totalLines: pool.length,
      activeLines,
      completedLines,
      abandoned,
      excluded,
      totalSteps,
      doneSteps,
      skippedSteps,
      pct,
    };
  }, [pool, getLine]);

  const rows: Array<[string, number, string]> = [
    ['进行中', stats.activeLines, 'text-brand-strong'],
    ['放弃', stats.abandoned, 'text-ink-muted'],
    ['移出', stats.excluded, 'text-ink-faint'],
  ];

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="text-ui-sm font-bold text-brand-strong">进度概览</h2>
        <button
          type="button"
          onClick={resetAll}
          className="text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
        >
          重置进度
        </button>
      </div>
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
          {stats.skippedSteps > 0 && ` · 已放弃 ${stats.skippedSteps} 步`}
          {stats.completedLines > 0 && ` · ${stats.completedLines} 条线已归档`}
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
