import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GuideData } from '../types/guide';
import type { ReorderRequest } from '../lib/treeOrder';
import { countCharsDeep, findNodePath, flattenNodes, searchGuide } from '../lib/guide';
import { useGuideData } from '../hooks/useGuideData';
import { useHashSelection } from '../hooks/useHashSelection';
import { useTreeOrder } from '../hooks/useTreeOrder';
import AppShell from '../components/AppShell';
import ContentPanel from '../components/ContentPanel';
import EmptyState from '../components/EmptyState';
import LoadingScreen from '../components/LoadingScreen';
import Sidebar from '../components/Sidebar';
import GameHeader from '../ui/GameHeader';
import TabBar, { type TabItem } from '../ui/TabBar';

/** 甜蜜乐章是独立站点（sweet.html），只共用设计系统与通用组件。
 *  数据、类目、顺序存档都另起一套，不和明星志愿3 的 guide.json 混。 */
const DATA_FILE = 'data/sweet/guide.json';
/** 目录拖拽顺序另存一个键，否则会把另一个站的目录顺序打乱。 */
const ORDER_STORE = { key: 'sweet.tree-order.v1', hoistCategory: false };
const TABS: TabItem[] = [{ id: 'guide', label: '攻略' }];
const EMPTY_HINT = {
  title: '这一页还没整理',
  text: '目录已经按原攻略排好了，正文还没导入。补齐这一节的文字后，这里会自动显示。',
};
const OVERVIEW_HERO = {
  kicker: '明星志愿3 · 甜蜜乐章',
  title: '明星志愿3 甜蜜乐章 · 攻略助手',
  paragraphs: ['目录按原攻略整理，正文还在陆续导入；每一节都先占好位置，补上文字就会显示。'],
  gradientClass: 'bg-[linear-gradient(118deg,#7d1f45,#b32f68_58%,#cf5a8e)]',
};

interface Props {
  data: GuideData;
}

/** 数据就绪后才挂载，`expandedIds` 才能直接取到三个类目（异步加载时
 *  初始化只会拿到空数组，目录会全是折叠状态）。 */
function SweetGuide({ data: source }: Props) {
  const { categories, move, reset, customized } = useTreeOrder(source.categories, ORDER_STORE);

  const guide = useMemo<GuideData>(() => ({ ...source, categories }), [source, categories]);
  const allNodes = useMemo(() => flattenNodes(guide), [guide]);
  const validIds = useMemo(() => new Set(allNodes.map((node) => node.id)), [allNodes]);
  const { selectedId, select } = useHashSelection(validIds);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(categories.map((category) => category.id)),
  );
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const path = useMemo(() => findNodePath(guide, selectedId), [guide, selectedId]);
  const hits = useMemo(() => searchGuide(guide, query), [guide, query]);
  const summary = useMemo(
    () => ({
      items: guide.meta.stats.items,
      chars: guide.categories.reduce((sum, category) => sum + countCharsDeep(category), 0),
    }),
    [guide],
  );

  const currentNode = path[path.length - 1];

  useEffect(() => {
    if (!path.length) return;
    setExpandedIds((previous) => {
      const next = new Set(previous);
      path.forEach((node) => next.add(node.id));
      return next;
    });
  }, [path]);

  const toggle = useCallback((id: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id: string) => {
    select(id);
    setQuery('');
    setSidebarOpen(false);
  }, [select]);

  const handleReorder = useCallback((request: ReorderRequest) => {
    move(request.parentKey, request.dragId, request.targetId, request.place);
  }, [move]);

  const position = allNodes.findIndex((node) => node.id === selectedId);
  const previousNode = position > 0 ? allNodes[position - 1] : null;
  const nextNode = position >= 0 && position < allNodes.length - 1 ? allNodes[position + 1] : null;

  const header = (
    <GameHeader
      title="明星志愿3 甜蜜乐章 · 攻略助手"
      logoSrc={`${import.meta.env.BASE_URL}favicon.ico`}
      onBrandClick={() => handleSelect('')}
      menuButton={(
        <button
          className="hidden h-[34px] w-[34px] items-center justify-center rounded-ui-sm border border-line text-[17px] text-brand nav:flex"
          type="button"
          onClick={() => setSidebarOpen(true)}
          aria-label="打开目录"
        >
          ☰
        </button>
      )}
      tabs={<TabBar items={TABS} activeId="guide" ariaLabel="视图切换" onSelect={() => {}} />}
      crossLink={{
        href: `${import.meta.env.BASE_URL}index.html`,
        label: '‹ 明星志愿3',
        hint: '回到 明星志愿3 攻略助手',
      }}
    />
  );

  if (allNodes.length === 0) {
    return (
      <AppShell
        header={header}
        sidebar={null}
        sidebarOpen={false}
        scrollKey="empty"
        onCloseSidebar={() => setSidebarOpen(false)}
      >
        <div className="mx-auto w-full max-w-[520px] px-6 py-16">
          <EmptyState
            title="甜蜜乐章的内容还没进来"
            text="目录结构为空。把攻略正文整理到 public/data/sweet/guide.json 后刷新即可显示。"
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      header={header}
      scrollKey={selectedId}
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      sidebar={(
        <Sidebar
          categories={guide.categories}
          selectedId={selectedId}
          expandedIds={expandedIds}
          query={query}
          hits={hits}
          open={sidebarOpen}
          summary={summary}
          customized={customized}
          onToggle={toggle}
          onSelect={handleSelect}
          onQueryChange={setQuery}
          onReorder={handleReorder}
          onResetOrder={reset}
          footerNote="正文陆续导入中 · 每节补上文字即显示"
        />
      )}
    >
      <ContentPanel
        data={guide}
        node={currentNode}
        path={path}
        prev={previousNode}
        next={nextNode}
        onSelect={handleSelect}
        emptyHint={EMPTY_HINT}
        overviewHero={OVERVIEW_HERO}
      />
    </AppShell>
  );
}

export default function SweetApp() {
  const { data, error } = useGuideData(DATA_FILE);

  if (error) {
    return (
      <LoadingScreen
        title="攻略数据加载失败"
        text={`无法读取 public/${DATA_FILE}（${error}）。请确认该文件存在且是合法 JSON。`}
      />
    );
  }

  if (!data) {
    return <LoadingScreen title="正在载入甜蜜乐章攻略" text="正在读取分级目录与正文内容…" />;
  }

  return <SweetGuide data={data} />;
}
