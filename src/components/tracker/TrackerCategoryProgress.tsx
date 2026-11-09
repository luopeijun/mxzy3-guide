import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool, countDoneSteps } from '../../lib/tracker';
import { computeGroups } from '../../lib/trackerGroups';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';

interface Props {
  data: GuideData;
}

/** Per-category completion, so the right rail answers "which part of the guide
 *  have I actually cleared" without expanding every line. */
export default function TrackerCategoryProgress({ data }: Props) {
  const { selectedArtists, getLine } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const rows = useMemo(() => {
    return computeGroups(pool)
      .filter((group) => group.lines.length > 0)
      .map((group) => {
        let done = 0;
        let total = 0;
        let excluded = 0;
        for (const line of group.lines) {
          const state = getLine(line.id);
          if ((state?.status ?? 'active') === 'excluded') {
            excluded += 1;
            continue;
          }
          total += line.steps.length;
          done += countDoneSteps(line, state?.done ?? []);
        }
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return { key: group.key, label: group.label, done, total, pct, excluded };
      });
  }, [pool, getLine]);

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <h2 className="text-ui-sm font-bold text-brand-strong">分类进度</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-ui-2xs text-ink-faint">事件池为空。</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-ui-xs text-ink">
                  {row.label}
                  {row.excluded > 0 && (
                    <span className="ml-1 text-ui-2xs text-ink-faint">移出 {row.excluded}</span>
                  )}
                </span>
                <span className="shrink-0 text-ui-2xs text-ink-faint">
                  {row.done}/{row.total}
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-soft">
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-300',
                      row.pct === 100 ? 'bg-gold' : 'bg-brand',
                    )}
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-ui-2xs tabular-nums text-ink-faint">
                  {row.pct}%
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
