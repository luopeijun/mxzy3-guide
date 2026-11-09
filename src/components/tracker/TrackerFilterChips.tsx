import { cn } from '../../lib/cn';
import {
  FILTER_HINT,
  FILTER_LABEL,
  FILTER_ORDER,
  type LineFilter,
} from '../../lib/trackerFilter';

interface Props {
  value: LineFilter;
  counts: Record<LineFilter, number>;
  onChange: (filter: LineFilter) => void;
}

/** A permanently six-cell grid: chips never appear/disappear or wrap when a
 *  count changes, so switching filters cannot reflow the sticky bar. Both the
 *  selected and idle states keep a 1px border (otherwise each chip would be
 *  2px wider and nudge the whole row). */
export default function TrackerFilterChips({ value, counts, onChange }: Props) {
  return (
    <div
      data-filter-chips
      role="group"
      aria-label="按任务线状态筛选"
      className="mt-2 grid grid-cols-6 gap-1.5 phone:grid-cols-3"
    >
      {FILTER_ORDER.map((key) => {
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            data-filter-key={key}
            aria-pressed={selected}
            title={FILTER_HINT[key]}
            onClick={() => onChange(key)}
            className={cn(
              'flex min-w-0 items-center justify-center gap-1.5 rounded-ui-sm border px-1.5 py-1.5 text-ui-2xs font-semibold leading-[1.5] transition-colors',
              selected
                ? 'border-brand bg-brand text-white'
                : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
              counts[key] === 0 && !selected && 'opacity-55',
            )}
          >
            <span className="shrink-0 whitespace-nowrap">{FILTER_LABEL[key]}</span>
            <span className="shrink-0 tabular-nums opacity-80">{counts[key]}</span>
          </button>
        );
      })}
    </div>
  );
}
