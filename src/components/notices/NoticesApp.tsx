import { useEffect, useMemo, useState } from 'react';
import type { NoticeData } from '../../types/notices';
import { companiesOf, filterNotices, type NoticeFilter } from '../../lib/notices';
import NoticeCard from './NoticeCard';
import NoticeDetail from './NoticeDetail';
import NoticeFilterBar from './NoticeFilterBar';

const PAGE = 60;
const EMPTY_FILTER: NoticeFilter = {
  cat: 'all',
  time: 'all',
  stars: 'all',
  company: 'all',
  query: '',
};

interface Props {
  data: NoticeData;
}

/** 通告库：顶部筛选 + 中间卡片列表 + 右侧详情。
 *
 *  列表一次只渲染 60 条（全量 1500+），翻到底再点「加载更多」——避免一次性挂上
 *  几千张卡片。窄屏没有右侧栏，点卡片会从底部盖一层全屏详情。 */
export default function NoticesApp({ data }: Props) {
  const [filter, setFilter] = useState<NoticeFilter>(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const companies = useMemo(() => companiesOf(data.notices), [data]);
  const results = useMemo(() => filterNotices(data.notices, filter), [data, filter]);
  const visible = results.slice(0, limit);
  const selected = useMemo(
    () => data.notices.find((notice) => notice.id === selectedId) ?? null,
    [data.notices, selectedId],
  );

  // 宽屏右栏默认展示第一条，避免一进来就是一整块空白提示。筛选后如果原来选中的
  // 通告已经不在结果里，也跟着落到第一条——详情不能展示被筛掉的内容。窄屏不受
  // 影响：抽屉只在主动点卡片时打开。
  useEffect(() => {
    if (results.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !results.some((notice) => notice.id === selectedId)) {
      setSelectedId(results[0].id);
    }
  }, [results, selectedId]);

  const patch = (next: Partial<NoticeFilter>) => {
    setFilter((previous) => ({ ...previous, ...next }));
    setLimit(PAGE);
  };

  const pick = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  return (
    <div data-notices-app className="fixed inset-x-0 bottom-0 top-16 z-40 flex bg-canvas">
      <div className="flex min-w-0 flex-1 flex-col">
        <NoticeFilterBar
          data={data}
          filter={filter}
          resultCount={results.length}
          companies={companies}
          onChange={patch}
          onReset={() => {
            setFilter(EMPTY_FILTER);
            setLimit(PAGE);
          }}
        />

        <div
          data-notice-list
          className="min-h-0 flex-1 overflow-y-auto px-6 py-4 [scrollbar-gutter:stable]"
        >
          {results.length === 0 ? (
            <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-10 text-center text-ui-xs text-ink-faint">
              没有符合条件的通告，改一下筛选或清空搜索试试。
            </p>
          ) : (
            <>
              <ul className="grid gap-3 min-[1280px]:grid-cols-2">
                {visible.map((notice) => (
                  <li key={notice.id}>
                    <NoticeCard
                      notice={notice}
                      active={notice.id === selectedId}
                      onSelect={() => pick(notice.id)}
                    />
                  </li>
                ))}
              </ul>
              {results.length > visible.length && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    data-notice-more
                    onClick={() => setLimit((value) => value + PAGE)}
                    className="rounded-full border border-line bg-surface px-4 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
                  >
                    还有 {results.length - visible.length} 条 · 加载更多
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <aside className="hidden w-[380px] shrink-0 flex-col border-l border-line bg-surface min-[1120px]:flex">
        <NoticeDetail data={data} notice={selected} />
      </aside>

      {drawerOpen && (
        <div
          data-notice-drawer
          className="absolute inset-0 z-50 flex flex-col bg-canvas min-[1120px]:hidden"
        >
          <NoticeDetail data={data} notice={selected} onClose={() => setDrawerOpen(false)} />
        </div>
      )}
    </div>
  );
}
