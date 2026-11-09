import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { NoticeData } from '../../types/notices';
import { companiesOf, filterNotices, type NoticeFilter } from '../../lib/notices';
import NoticeCard from './NoticeCard';
import NoticeDetail from './NoticeDetail';
import NoticeFilterBar from './NoticeFilterBar';
import NoticePager, { DEFAULT_PAGE_SIZE } from './NoticePager';
import NoticeViewTabs from './NoticeViewTabs';
import ReferenceView from './ReferenceView';

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
 *  列表按页渲染（全量 1500+，一页 24 张），翻页由底部分页器控制——避免一次性
 *  挂上几千张卡片。窄屏没有右侧栏，点卡片会从底部盖一层全屏详情。 */
export default function NoticesApp({ data }: Props) {
  const [view, setView] = useState<'list' | 'reference'>('list');
  const [filter, setFilter] = useState<NoticeFilter>(EMPTY_FILTER);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  /** 当前页里最高那张卡的高度：其余卡片都撑到同一高度，网格才不会参差。 */
  const [cardHeight, setCardHeight] = useState(0);
  /** 窗口尺寸变了要重新量一遍高度（列宽变化会让简介换行数变化）。 */
  const [measureTick, setMeasureTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const companies = useMemo(() => companiesOf(data.notices), [data]);
  const results = useMemo(() => filterNotices(data.notices, filter), [data, filter]);
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize));
  const visible = useMemo(
    () => results.slice((page - 1) * pageSize, page * pageSize),
    [results, page, pageSize],
  );
  const selected = useMemo(
    () => data.notices.find((notice) => notice.id === selectedId) ?? null,
    [data.notices, selectedId],
  );

  // 宽屏右栏默认展示本页第一条，避免一进来就是一整块空白提示。筛选或翻页后如果
  // 原来选中的通告不在当前页，也跟着落到这一页的第一条——详情不展示看不见的内容。
  useEffect(() => {
    if (visible.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((notice) => notice.id === selectedId)) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  // 换页或改筛选条件后回到顶部，否则会停在上一次滚到的位置。
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [page, pageSize, filter]);

  // 结果变少时把页码夹回最后一页（例如筛到只剩 3 条，却还停在第 9 页）。
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  // 量当前页所有卡片的自然高度取最大值，再统一设成最小高度。量的是内层内容块
  // 而不是按钮本身：按钮在网格里已经被拉伸过，量它只会量到上一轮的结果。
  // 量之前先把上一轮写上去的 minHeight 摘掉（同步量、同步还原，不会看到跳动），
  // 否则量到的是「撑过之后」的高度，翻到简介更短的一页时卡片也缩不回去。
  useLayoutEffect(() => {
    if (view !== 'list') return;
    const box = listRef.current;
    if (!box) return;
    const cards = [...box.querySelectorAll<HTMLElement>('[data-notice-card]')];
    const saved = cards.map((card) => card.style.minHeight);
    for (const card of cards) card.style.minHeight = '0px';
    let tallest = 0;
    for (const card of cards) {
      const inner = card.querySelector<HTMLElement>('[data-notice-card-inner]');
      if (!inner) continue;
      const style = window.getComputedStyle(card);
      const chrome = [
        'paddingTop',
        'paddingBottom',
        'borderTopWidth',
        'borderBottomWidth',
      ].reduce((sum, key) => sum + (Number.parseFloat(style[key as 'paddingTop']) || 0), 0);
      tallest = Math.max(tallest, inner.getBoundingClientRect().height + chrome);
    }
    cards.forEach((card, index) => {
      card.style.minHeight = saved[index];
    });
    if (tallest > 0) setCardHeight(Math.ceil(tallest));
  }, [visible, view, measureTick]);

  useEffect(() => {
    const onResize = () => setMeasureTick((value) => value + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const patch = (next: Partial<NoticeFilter>) => {
    setFilter((previous) => ({ ...previous, ...next }));
    setPage(1);
  };

  const changePageSize = (size: number) => {
    if (size === pageSize) return;
    // 尽量停在同一批数据上：当前页首条在新页码里的位置。
    setPage(Math.floor(((page - 1) * pageSize) / size) + 1);
    setPageSize(size);
  };

  const pick = (id: string) => {
    setSelectedId(id);
    setDrawerOpen(true);
  };

  return (
    <div data-notices-app className="fixed inset-x-0 bottom-0 top-16 z-40 flex bg-canvas">
      <div className="flex min-w-0 flex-1 flex-col px-6 pb-4 pt-3 tab:px-4 tab:pt-2">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-ui-lg font-bold text-brand-strong">通告库</h1>
          <span className="text-ui-2xs text-ink-faint">
            共 {data.meta.noticeCount} 个通告 · {data.meta.roleCount} 个角色
          </span>
          {view === 'list' && (
            <span className="ml-auto text-ui-2xs tabular-nums text-ink-faint" data-notice-count>
              当前 {results.length} 条
            </span>
          )}
        </div>

        <NoticeViewTabs view={view} onChange={setView} />

        <div className="flex min-h-0 flex-1 gap-6">
          {/* 页签与这块面板连成一体：面板去掉上边框，靠选中页签的下移把页签行那条线盖掉。 */}
          <div
            data-notice-panel
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-b-ui-md border border-t-0 border-line bg-surface"
          >
            {view === 'list' && (
              <NoticeFilterBar
                data={data}
                filter={filter}
                companies={companies}
                onChange={patch}
                onReset={() => {
                  setFilter(EMPTY_FILTER);
                  setPage(1);
                }}
              />
            )}

            {view === 'reference' ? (
              <ReferenceView data={data} />
            ) : (
              <>
                <div
                  ref={listRef}
                  data-notice-list
                  className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]"
                >
                  {results.length === 0 ? (
                    <p className="rounded-ui-md border border-dashed border-line-strong bg-surface-soft px-4 py-10 text-center text-ui-xs text-ink-faint">
                      没有符合条件的通告，改一下筛选或清空搜索试试。
                    </p>
                  ) : (
                    <ul className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(340px,100%),1fr))]">
                      {/* 列数跟着列表容器宽度走，不绑视口断点：右栏出现把列表压窄时
                          会自动退回一列，900 这种「没有右栏但也不宽」的尺寸才排得下两列。 */}
                      {visible.map((notice) => (
                        <li key={notice.id}>
                          <NoticeCard
                            notice={notice}
                            active={notice.id === selectedId}
                            minHeight={cardHeight}
                            onSelect={() => pick(notice.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {results.length > 0 && (
                  <NoticePager
                    page={page}
                    pageCount={pageCount}
                    pageSize={pageSize}
                    total={results.length}
                    onPage={setPage}
                    onPageSize={changePageSize}
                  />
                )}
              </>
            )}
          </div>

          {view === 'list' && (
            <aside className="hidden w-[380px] shrink-0 flex-col overflow-hidden rounded-ui-md border border-line bg-surface min-[1120px]:flex">
              <NoticeDetail data={data} notice={selected} />
            </aside>
          )}
        </div>
      </div>

      {view === 'list' && drawerOpen && (
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
