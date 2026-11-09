import { useState } from 'react';
import { cn } from '../../lib/cn';
import {
  CONTENT_TYPES,
  NO_CONTENT,
  contentLabel,
  isContentFilterActive,
  toggleType,
  type ContentFilter,
} from '../../lib/trackerContent';

interface Props {
  value: ContentFilter;
  onChange: (next: ContentFilter) => void;
}

/** One collapsed row by default (the sticky bar must not grow on idle), with
 *  the active selection spelled out so the pool never looks mysteriously
 *  short. Opening it reveals CG + every trigger type the data uses; the chips
 *  are multi-select because 「跟随或沟通」-style events should be findable from
 *  either side. */
export default function TrackerContentChips({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const active = isContentFilterActive(value);

  const chip = (selected: boolean, gold = false) =>
    cn(
      'rounded-ui-sm border px-2 py-1 text-ui-2xs font-semibold leading-[1.5] transition-colors',
      selected
        ? gold
          ? 'border-gold-line bg-gold-soft text-gold'
          : 'border-brand bg-brand text-white'
        : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
    );

  return (
    <div data-content-filter className="mt-1.5">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-content-toggle
          aria-expanded={open}
          aria-label="按 CG 或触发类型筛选事件"
          onClick={() => setOpen((previous) => !previous)}
          className={cn(
            'flex min-w-0 items-center gap-1.5 rounded-ui-sm border px-2 py-1 text-ui-2xs font-semibold transition-colors',
            active
              ? 'border-brand-line bg-brand-soft text-brand-strong'
              : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
          )}
        >
          <span className="shrink-0">内容</span>
          <span data-content-label className="min-w-0 truncate">
            {active ? contentLabel(value) : '不限'}
          </span>
          <span
            aria-hidden="true"
            className={cn('shrink-0 transition-transform duration-150', open && 'rotate-180')}
          >
            ▾
          </span>
        </button>
        {active && (
          <button
            type="button"
            data-content-clear
            onClick={() => onChange(NO_CONTENT)}
            className="shrink-0 text-ui-2xs text-ink-faint underline-offset-2 transition-colors hover:text-brand-strong hover:underline"
          >
            清除
          </button>
        )}
        <span className="ml-auto shrink-0 text-ui-2xs text-ink-faint">
          {open ? '可多选 · 复合类型任一侧命中' : ''}
        </span>
      </div>

      {open && (
        <div
          data-content-panel
          className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-ui-sm border border-line bg-surface p-2 shadow-soft"
        >
          <button
            type="button"
            data-content-key="cg"
            aria-pressed={value.cg}
            onClick={() => onChange({ ...value, cg: !value.cg })}
            className={chip(value.cg, true)}
          >
            CG
          </button>
          <span aria-hidden="true" className="h-4 w-px bg-line" />
          {CONTENT_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              data-content-key={type}
              aria-pressed={value.types.includes(type)}
              onClick={() => onChange(toggleType(value, type))}
              className={chip(value.types.includes(type))}
            >
              {type}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
