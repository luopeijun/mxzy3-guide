import { useMemo, useState } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { computeGroups, GROUP_LABEL, type GroupKey } from '../../lib/trackerGroups';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';
import ArtistAvatar from './ArtistAvatar';

interface Props {
  data: GuideData;
}

type Filter = GroupKey | 'all';

const SHORT_LABEL: Record<GroupKey, string> = {
  broker: '经纪人',
  other: '其他',
  artist: '艺人',
  luousang: '路欧桑',
};

const STATUS_LABEL: Record<string, string> = {
  active: '在池',
  excluded: '已移出',
  abandoned: '已放弃',
};
const STATUS_TONE: Record<string, string> = {
  active: 'text-ink-faint',
  excluded: 'text-missing',
  abandoned: 'text-ink-muted',
};

/** Batch selector: a scrollable, multi-select list of every line in the pool's
 *  scope. Check any subset (or all), then 批量移出 / 批量添加 in one click.
 *  「添加」restores lines that were excluded or abandoned back into the pool.
 *  Like the artist picker, the whole panel collapses to a single 50px row by
 *  default; the full editor is rendered only while expanded. */
export default function TrackerCategories({ data }: Props) {
  const { poolSelection, getLine, setManyStatus } = useTracker();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [onlyOut, setOnlyOut] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  const pool = useMemo(() => buildPool(data, poolSelection), [data, poolSelection]);
  const groups = useMemo(() => computeGroups(pool), [pool]);
  const inPoolTotal = pool.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'excluded').length;

  const rows = useMemo(() => {
    const scoped = filter === 'all' ? pool : (groups.find((g) => g.key === filter)?.lines ?? []);
    return onlyOut
      ? scoped.filter((line) => (getLine(line.id)?.status ?? 'active') !== 'active')
      : scoped;
  }, [pool, groups, filter, onlyOut, getLine]);

  const allChecked = rows.length > 0 && rows.every((line) => checked.has(line.id));
  const checkedCount = checked.size;

  const toggleAll = () => {
    setChecked((previous) => {
      const next = new Set(previous);
      for (const line of rows) {
        if (allChecked) next.delete(line.id);
        else next.add(line.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setChecked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const apply = (status: 'excluded' | 'active') => {
    if (checkedCount === 0) return;
    setManyStatus([...checked], status);
    setChecked(new Set());
  };

  return (
    <section data-batch-panel className="rounded-ui-md border border-line bg-surface shadow-soft">
      <div className="flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          data-batch-toggle
          aria-expanded={open}
          aria-label={open ? '收起分类批量操作' : '展开分类批量操作'}
          title={open ? '收起批量选择' : '展开批量选择：勾选任务线后可一次移出或添加'}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <h2 className="shrink-0 text-ui-sm font-bold text-brand-strong">分类批量操作</h2>
          {/* Short summary only: no truncate, so the collapsed row never shows
              a half sentence (the same rule as the artist picker's hint). */}
          <span data-batch-hint className="shrink-0 whitespace-nowrap text-ui-2xs text-ink-faint">
            在池 {inPoolTotal}/{pool.length}
          </span>
        </button>
        {checkedCount > 0 && (
          <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-ui-2xs text-brand-strong">
            已选 {checkedCount} 条
          </span>
        )}
      </div>

      {open && (
        <div data-batch-body className="border-t border-line px-5 pb-5 pt-3">
          <p className="text-ui-2xs leading-[1.7] text-ink-muted">
            勾选下方任务线（可跨分类），一次批量移出或添加；「添加」会把已移出、已放弃的线放回事件池。
          </p>

          {/* Fixed 3-column grid, always all five chips. A flex-wrap row reflowed
              whenever a group became empty (or the active chip lost its border),
              making the whole panel jump between 3+1 / 2+2 layouts. Equal-width
              cells and a 1px border on BOTH states keep every chip pinned. */}
          <div data-batch-chips className="mt-3 grid grid-cols-3 gap-1.5">
            {(['all', ...groups.map((g) => g.key)] as Filter[]).map((key) => {
              const lines = key === 'all' ? pool : (groups.find((g) => g.key === key)?.lines ?? []);
              const inPool = key === 'all'
                ? inPoolTotal
                : lines.filter((l) => (getLine(l.id)?.status ?? 'active') !== 'excluded').length;
              const label = key === 'all' ? '全部' : SHORT_LABEL[key];
              const active = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-chip-key={key}
                  aria-pressed={active}
                  onClick={() => setFilter(key)}
                  title={
                    key === 'all'
                      ? '全部任务线'
                      : lines.length === 0
                        ? `${GROUP_LABEL[key]}（暂无任务线）`
                        : GROUP_LABEL[key]
                  }
                  className={cn(
                    'flex min-w-0 items-center justify-center gap-1 rounded-full border px-1 py-1 text-ui-2xs tabular-nums transition-colors',
                    active
                      ? 'border-brand bg-brand text-white'
                      : 'border-line bg-surface-soft text-ink-muted hover:border-brand-line hover:text-brand-strong',
                    lines.length === 0 && 'opacity-50',
                  )}
                >
                  <span className="shrink-0">{label}</span>
                  <span className="shrink-0 opacity-80">
                    {inPool}/{lines.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              disabled={rows.length === 0}
              className="rounded-ui-sm border border-line px-2 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong disabled:opacity-40"
            >
              {allChecked ? '取消全选' : '全选当前'}
            </button>
            <button
              type="button"
              onClick={() => setOnlyOut((value) => !value)}
              className={cn(
                'rounded-ui-sm border px-2 py-1 text-ui-2xs transition-colors',
                onlyOut
                  ? 'border-brand-line bg-brand-soft text-brand-strong'
                  : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
              )}
            >
              只看未进池
            </button>
            <span className="ml-auto shrink-0 text-ui-2xs text-ink-faint">已选 {checkedCount} 条</span>
          </div>

          <div
            data-batch-list
            className="mt-2 h-[260px] overflow-y-auto overscroll-contain rounded-ui-sm border border-line bg-surface-soft p-1.5"
          >
            {rows.length === 0 ? (
              <p className="px-2 py-6 text-center text-ui-2xs text-ink-faint">
                没有符合条件的任务线。
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {rows.map((line) => {
                  const status = getLine(line.id)?.status ?? 'active';
                  const on = checked.has(line.id);
                  return (
                    <li key={line.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleOne(line.id)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-ui-xs border px-2 py-1.5 text-left transition-colors',
                          on ? 'border-brand-line bg-brand-soft' : 'border-transparent bg-surface hover:border-line',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] text-[10px] leading-none',
                            on ? 'bg-brand text-white' : 'border border-line-strong bg-surface text-transparent',
                          )}
                        >
                          ✓
                        </span>
                        {/* 艺人线的章节名看不出属于谁，补一个头像；标题保持章节名。 */}
                        {line.origin.tone === 'artist' && (
                          <ArtistAvatar
                            avatar={line.origin.avatar}
                            label={line.origin.label}
                            size="sm"
                          />
                        )}
                        <span
                          className="min-w-0 flex-1 truncate text-ui-2xs text-ink"
                          title={`${line.origin.title} · ${line.name}`}
                        >
                          {line.name}
                        </span>
                        <span className={cn('shrink-0 text-ui-2xs', STATUS_TONE[status])}>
                          {STATUS_LABEL[status]}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={checkedCount === 0}
              onClick={() => apply('excluded')}
              className="flex-1 rounded-ui-sm border border-line px-2 py-2 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
            >
              批量移出{checkedCount > 0 ? ` (${checkedCount})` : ''}
            </button>
            <button
              type="button"
              disabled={checkedCount === 0}
              onClick={() => apply('active')}
              className="flex-1 rounded-ui-sm border border-brand-line bg-brand-soft px-2 py-2 text-ui-2xs font-semibold text-brand-strong transition-colors hover:bg-brand-line/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              批量添加{checkedCount > 0 ? ` (${checkedCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
