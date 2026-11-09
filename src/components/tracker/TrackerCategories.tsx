import { useMemo } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { computeGroups } from '../../lib/trackerGroups';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';

interface Props {
  data: GuideData;
}

/** Per-category batch controls: every group gets a quick 全部移出 / 恢复 toggle
 *  so the selector panel doubles as a control center, not just an opt-in list. */
export default function TrackerCategories({ data }: Props) {
  const { selectedArtists, getLine, setManyStatus } = useTracker();
  const pool = useMemo(() => buildPool(data, selectedArtists), [data, selectedArtists]);

  const groups = useMemo(() => computeGroups(pool), [pool]);

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <h2 className="text-ui-sm font-bold text-brand-strong">分类批量操作</h2>
      <p className="mt-1 text-ui-2xs leading-[1.7] text-ink-muted">
        非艺人内容默认全部进池，这里可整类移出或一键恢复。
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {groups.map((group) => {
          if (group.lines.length === 0) return null;
          const ids = group.lines.map((l) => l.id);
          const excluded = group.lines.filter(
            (l) => (getLine(l.id)?.status ?? 'active') === 'excluded',
          ).length;
          const allOut = excluded === group.lines.length;
          const label = allOut ? '恢复' : '全部移出';
          return (
            <li
              key={group.key}
              className="flex items-center gap-2 rounded-ui-sm border border-line bg-surface-soft px-3 py-2"
            >
              <span className="min-w-0 flex-1 truncate text-ui-xs text-ink">
                {group.label}
                <span className="ml-1 text-ink-faint">
                  {group.lines.length - excluded}/{group.lines.length}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setManyStatus(ids, allOut ? 'active' : 'excluded')}
                className={cn(
                  'shrink-0 rounded-full px-3 py-[5px] text-ui-2xs font-medium transition-colors',
                  allOut
                    ? 'bg-brand-soft text-brand-strong hover:bg-brand-line/40'
                    : 'border border-line-strong text-ink-muted hover:border-brand-line hover:text-brand-strong',
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
