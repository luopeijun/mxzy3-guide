import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { readCg, writeCg } from '../../lib/cg';
import type { CgData } from '../../types/cg';
import CgCard from './CgCard';

const PAGE_SIZE = 60;

interface Props {
  data: CgData;
}

/** CG 图鉴：左侧按人物分组（男主 + 18 位艺人），右侧一面缩略图墙。
 *
 *  分组是原表天然切好的 19 组，每组 6–13 张，比 204 张一次铺完更好查漏；
 *  「全部」才需要分页。收集状态只由卡片右上角的圆勾改变，点图片不会误记。 */
export default function CgApp({ data }: Props) {
  const validIds = useMemo(() => new Set(data.items.map((item) => item.id)), [data.items]);
  const [collected, setCollected] = useState<Set<string>>(() => readCg(validIds));
  const [groupId, setGroupId] = useState('all');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  const toggle = (id: string) => {
    setCollected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      writeCg(next);
      return next;
    });
  };

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [groupId, onlyMissing]);

  const groupCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number }>();
    for (const item of data.items) {
      const entry = counts.get(item.groupId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (collected.has(item.id)) entry.done += 1;
      counts.set(item.groupId, entry);
    }
    return counts;
  }, [data.items, collected]);

  const groupItems = useMemo(
    () => (groupId === 'all'
      ? data.items
      : data.items.filter((item) => item.groupId === groupId)),
    [data.items, groupId],
  );
  const groupDone = useMemo(
    () => groupItems.reduce((sum, item) => sum + (collected.has(item.id) ? 1 : 0), 0),
    [groupItems, collected],
  );
  const filtered = useMemo(
    () => (onlyMissing
      ? groupItems.filter((item) => !collected.has(item.id))
      : groupItems),
    [groupItems, onlyMissing, collected],
  );
  const visible = useMemo(() => filtered.slice(0, limit), [filtered, limit]);

  const activeName = groupId === 'all'
    ? '全部'
    : (data.groups.find((group) => group.id === groupId)?.name ?? '全部');
  const percent = data.items.length
    ? Math.round((collected.size / data.items.length) * 100)
    : 0;

  const groupButton = (id: string, name: string, total: number, done: number) => {
    const active = groupId === id;
    return (
      <button
        key={id}
        type="button"
        data-cg-group
        data-cg-group-id={id}
        aria-pressed={active}
        onClick={() => setGroupId(id)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-ui-sm px-2.5 py-1.5 text-ui-xs transition-colors',
          'tab:w-auto tab:shrink-0 tab:whitespace-nowrap',
          active
            ? 'bg-brand-soft font-semibold text-brand-strong'
            : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
        )}
      >
        <span>{name}</span>
        <span className="text-ui-2xs tabular-nums text-ink-faint">{done}/{total}</span>
      </button>
    );
  };

  return (
    <div
      data-cg-app
      className="fixed inset-x-0 bottom-0 top-16 z-40 flex flex-col bg-canvas px-6 pb-4 pt-3 tab:px-4 tab:pt-2"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-ui-lg font-bold text-brand-strong">CG 图鉴</h1>
        <span className="text-ui-2xs text-ink-faint">
          共 {data.meta.itemCount} 张 · {data.meta.groupCount} 位角色
          {data.meta.missingImageCount > 0 && ` · ${data.meta.missingImageCount} 张站点未提供图片`}
        </span>
        <div className="ml-auto flex items-center gap-2.5 text-ui-2xs tabular-nums text-ink-faint">
          <span data-cg-progress>已收集 {collected.size} / {data.items.length}</span>
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full bg-brand transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-5 tab:flex-col tab:gap-3">
        <aside
          data-cg-groups
          className="flex w-[190px] shrink-0 flex-col overflow-y-auto rounded-ui-md border border-line bg-surface p-2 [scrollbar-gutter:stable] tab:w-full tab:overflow-x-auto tab:p-1.5"
        >
          <div className="flex flex-col gap-0.5 tab:flex-row tab:gap-1.5">
            {groupButton('all', '全部', data.items.length, collected.size)}
            {data.groups.map((group) => {
              const count = groupCounts.get(group.id) ?? { total: group.count, done: 0 };
              return groupButton(group.id, group.name, count.total, count.done);
            })}
          </div>
        </aside>

        <div
          data-cg-panel
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-ui-md border border-line bg-surface"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-4 py-2">
            <h2 className="text-ui-sm font-semibold text-ink">{activeName}</h2>
            <span className="text-ui-2xs tabular-nums text-ink-faint">
              {groupDone} / {groupItems.length} 已收集
            </span>
            <button
              type="button"
              data-cg-filter
              aria-pressed={onlyMissing}
              onClick={() => setOnlyMissing((value) => !value)}
              className={cn(
                'ml-auto rounded-full border px-3 py-1 text-ui-2xs transition-colors',
                onlyMissing
                  ? 'border-brand-line bg-brand-soft font-semibold text-brand-strong'
                  : 'border-line text-ink-muted hover:text-brand-strong',
              )}
            >
              {onlyMissing ? '显示全部' : '只看未收集'}
            </button>
          </div>

          <div
            data-cg-scroll
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 [scrollbar-gutter:stable]"
          >
            {filtered.length === 0 ? (
              <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-10 text-center text-ui-xs text-ink-faint">
                {onlyMissing ? '这个分组已经全部收集完了。' : '这个分组暂时没有 CG。'}
              </p>
            ) : (
              <>
                <ul
                  data-cg-grid
                  data-cg-count={visible.length}
                  className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(190px,100%),1fr))]"
                >
                  {visible.map((item) => (
                    <li key={item.id}>
                      <CgCard
                        item={item}
                        collected={collected.has(item.id)}
                        onToggle={() => toggle(item.id)}
                      />
                    </li>
                  ))}
                </ul>
                {visible.length < filtered.length && (
                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      data-cg-load-more
                      onClick={() => setLimit((value) => value + PAGE_SIZE)}
                      className="rounded-full border border-line px-4 py-1.5 text-ui-2xs text-ink-muted hover:border-brand-line hover:text-brand-strong"
                    >
                      加载更多（还有 {filtered.length - visible.length} 张）
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
