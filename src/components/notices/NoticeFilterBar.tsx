import type { NoticeData } from '../../types/notices';
import { cn } from '../../lib/cn';
import type { NoticeFilter } from '../../lib/notices';
import { CATEGORY_STYLE } from './categoryStyle';

interface Props {
  data: NoticeData;
  filter: NoticeFilter;
  resultCount: number;
  companies: string[];
  view: 'list' | 'reference';
  onChange: (patch: Partial<NoticeFilter>) => void;
  onReset: () => void;
  onViewChange: (view: 'list' | 'reference') => void;
}

const TIMES = ['第一年', '第二年', '第三年', '特殊'] as const;

function chipClass(active: boolean) {
  return cn(
    'whitespace-nowrap rounded-full border px-2.5 py-1 text-ui-2xs transition-colors',
    active
      ? 'border-brand bg-brand font-semibold text-white'
      : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
  );
}

/** 通告库的筛选条：搜索 + 公司 + 分类 / 时间 / 难度。三种筛选互相独立，结果取交集。 */
export default function NoticeFilterBar({
  data,
  filter,
  resultCount,
  companies,
  view,
  onChange,
  onReset,
  onViewChange,
}: Props) {
  const dirty =
    filter.cat !== 'all' ||
    filter.time !== 'all' ||
    filter.stars !== 'all' ||
    filter.company !== 'all' ||
    filter.query.trim() !== '';

  return (
    <div data-notice-filters className="shrink-0 border-b border-line bg-canvas px-6 pb-3 pt-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-ui-lg font-bold text-brand-strong">通告库</h1>
        <span className="text-ui-2xs text-ink-faint">
          共 {data.meta.noticeCount} 个通告 · {data.meta.roleCount} 个角色
        </span>
        <div
          role="tablist"
          aria-label="通告视图"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface p-1"
        >
          {([
            ['list', '通告列表'],
            ['reference', '能力对照'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              data-notice-view={key}
              aria-selected={view === key}
              onClick={() => onViewChange(key)}
              className={cn(
                'rounded-full px-2.5 py-1 text-ui-2xs transition-colors',
                view === key
                  ? 'bg-brand font-semibold text-white'
                  : 'text-ink-muted hover:text-brand-strong',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {view === 'list' && (
          <span className="text-ui-2xs tabular-nums text-ink-faint" data-notice-count>
            当前 {resultCount} 条
          </span>
        )}
      </div>

      {view === 'list' && (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-ui-md border border-line bg-surface px-3 py-2 transition-colors focus-within:border-brand-line">
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
            value={filter.query}
            onChange={(event) => onChange({ query: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onChange({ query: '' });
            }}
            placeholder="搜索通告名称、编号、制作人、简介或角色"
            aria-label="搜索通告"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-ui-sm text-ink outline-none placeholder:text-ink-faint"
          />
          {filter.query && (
            <button
              type="button"
              onClick={() => onChange({ query: '' })}
              className="shrink-0 rounded-full px-2 py-0.5 text-ui-2xs text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
            >
              清空
            </button>
          )}
        </div>

        <label className="flex shrink-0 items-center gap-1.5 rounded-ui-md border border-line bg-surface px-2.5 py-2 text-ui-2xs text-ink-faint">
          公司
          <select
            value={filter.company}
            onChange={(event) => onChange({ company: event.target.value })}
            className="max-w-[130px] bg-transparent text-ui-2xs text-ink outline-none"
            aria-label="按公司筛选"
          >
            <option value="all">全部</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        </label>

        {dirty && (
          <button
            type="button"
            data-notice-reset
            onClick={onReset}
            className="shrink-0 rounded-ui-md border border-line bg-surface px-2.5 py-2 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
          >
            重置筛选
          </button>
        )}
      </div>

      <div
        className="mt-2 grid grid-cols-5 gap-1.5 tab:grid-cols-3"
        data-notice-cats
        role="group"
        aria-label="按分类筛选"
      >
        {data.categories.map((category) => {
          const active = filter.cat === category.key;
          return (
            <button
              key={category.key}
              type="button"
              data-notice-cat={category.key}
              aria-pressed={active}
              onClick={() => onChange({ cat: active ? 'all' : category.key })}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-ui-sm border px-2 py-1.5 text-ui-2xs transition-colors',
                active
                  ? 'border-brand bg-brand font-semibold text-white'
                  : 'border-line bg-surface text-ink-muted hover:border-brand-line hover:text-brand-strong',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-white' : CATEGORY_STYLE[category.key].bar)} />
              <span className="whitespace-nowrap">{category.name}</span>
              <span className={cn('tabular-nums', active ? 'text-white/80' : 'text-ink-faint')}>
                {category.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-ui-2xs text-ink-faint">时间</span>
          <button
            type="button"
            aria-pressed={filter.time === 'all'}
            onClick={() => onChange({ time: 'all' })}
            className={chipClass(filter.time === 'all')}
          >
            不限
          </button>
          {TIMES.map((time) => (
            <button
              key={time}
              type="button"
              data-notice-time={time}
              aria-pressed={filter.time === time}
              onClick={() => onChange({ time: filter.time === time ? 'all' : time })}
              className={chipClass(filter.time === time)}
            >
              {time}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="shrink-0 text-ui-2xs text-ink-faint">难度</span>
          <button
            type="button"
            aria-pressed={filter.stars === 'all'}
            onClick={() => onChange({ stars: 'all' })}
            className={chipClass(filter.stars === 'all')}
          >
            不限
          </button>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              data-notice-star={star}
              aria-pressed={filter.stars === star}
              onClick={() => onChange({ stars: filter.stars === star ? 'all' : star })}
              className={chipClass(filter.stars === star)}
              title={`只看含有 ${star} 星角色的通告`}
            >
              {star}★
            </button>
          ))}
        </div>
      </div>
        </>
      )}
    </div>
  );
}
