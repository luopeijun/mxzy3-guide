import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GuideData } from './types/guide';
import type { ReorderRequest } from './lib/treeOrder';
import { countCharsDeep, findNodePath, flattenNodes, searchGuide } from './lib/guide';
import { isNoticesRoute, isTrackerRoute, guideNodeId, useHashSelection } from './hooks/useHashSelection';
import { useGuideData } from './hooks/useGuideData';
import { useNoticeData } from './hooks/useNoticeData';
import { useTreeOrder } from './hooks/useTreeOrder';
import { HighlightProvider } from './hooks/useHighlightPref';
import { TrackerProvider } from './hooks/useTracker';
import AppShell from './components/AppShell';
import BrandHeader from './components/BrandHeader';
import ContentPanel from './components/ContentPanel';
import EmptyState from './components/EmptyState';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';
import NoticesApp from './components/notices/NoticesApp';
import TrackerApp from './components/tracker/TrackerApp';
import type { ViewMode } from './components/ViewTabs';

interface GuideAppProps {
  data: GuideData;
  mode: ViewMode;
  onViewGuide: () => void;
  onViewTracker: () => void;
  onViewNotices: () => void;
}

function GuideApp({ data: source, mode, onViewGuide, onViewTracker, onViewNotices }: GuideAppProps) {
  // The reader may drag levels of the tree around; everything below reads the
  // ordered copy so the header tabs, search and prev/next follow the new order.
  const { categories, move, reset, customized } = useTreeOrder(source.categories);
  const data = useMemo<GuideData>(() => ({ ...source, categories }), [source, categories]);

  const allNodes = useMemo(() => flattenNodes(data), [data]);
  const validIds = useMemo(() => new Set(allNodes.map((node) => node.id)), [allNodes]);
  const { selectedId, select } = useHashSelection(validIds);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(categories.map((category) => category.id)),
  );
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const path = useMemo(() => findNodePath(data, selectedId), [data, selectedId]);
  const hits = useMemo(() => searchGuide(data, query), [data, query]);
  const summary = useMemo(
    () => ({
      items: data.meta.stats.items,
      chars: data.categories.reduce((sum, category) => sum + countCharsDeep(category), 0),
    }),
    [data],
  );
  const currentNode = path[path.length - 1];
  const activeCategoryId = path[0]?.id ?? '';

  // Keep ancestors of the current node expanded.
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

  return (
    <AppShell
      scrollKey={selectedId}
      sidebarOpen={sidebarOpen}
      onCloseSidebar={() => setSidebarOpen(false)}
      header={(
        <BrandHeader
          categories={data.categories}
          activeCategoryId={activeCategoryId}
          summary={summary}
          mode={mode}
          onViewGuide={onViewGuide}
          onViewTracker={onViewTracker}
          onViewNotices={onViewNotices}
          onSelect={handleSelect}
          onMenuClick={() => setSidebarOpen(true)}
        />
      )}
      sidebar={(
        <Sidebar
          categories={data.categories}
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
        />
      )}
    >
      <ContentPanel
        data={data}
        node={currentNode}
        path={path}
        prev={previousNode}
        next={nextNode}
        onSelect={handleSelect}
      />
    </AppShell>
  );
}

/** 「通告」tab 只在进入时才请求 notices.json，加载失败也限制在这个视图里。 */
function NoticesView() {
  const { data, error } = useNoticeData(true);
  const shell = 'fixed inset-x-0 bottom-0 top-16 z-40 flex items-center justify-center bg-canvas p-6';

  if (error) {
    return (
      <div className={shell}>
        <div className="w-full max-w-[520px]">
          <EmptyState
            title="通告数据加载失败"
            text={`无法读取 public/data/notices.json（${error}）。请确认已运行 python scripts/extract_notices.py 生成数据。`}
          />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={shell}>
        <div className="w-full max-w-[520px]">
          <EmptyState title="正在载入通告" text="正在读取通告、角色与能力对照表…" />
        </div>
      </div>
    );
  }

  return <NoticesApp data={data} />;
}

export default function App() {
  const { data, error } = useGuideData();
  const [mode, setMode] = useState<ViewMode>(() =>
    isNoticesRoute() ? 'notices' : isTrackerRoute() ? 'tracker' : 'guide',
  );
  // Last guide node id, so closing the tracker lands back where the reader was.
  // Seeded from the URL, because the hashchange listener below only fires on
  // later navigations, not on the load that opened this very page.
  const lastNodeRef = useRef<string>(
    isTrackerRoute() || isNoticesRoute() ? '' : guideNodeId(),
  );

  useEffect(() => {
    const onChange = () => {
      if (isTrackerRoute()) {
        setMode('tracker');
      } else if (isNoticesRoute()) {
        setMode('notices');
      } else {
        setMode('guide');
        const nodeId = guideNodeId();
        if (nodeId) lastNodeRef.current = nodeId;
      }
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  if (error) {
    return (
      <LoadingScreen
        title="攻略数据加载失败"
        text={`无法读取 public/data/guide.json（${error}）。请确认已运行 python scripts/extract_guide.py 生成数据。`}
      />
    );
  }

  if (!data) {
    return <LoadingScreen title="正在载入攻略" text="正在读取分级目录与正文内容…" />;
  }

  const firstNodeId = (): string => {
    const leaf = flattenNodes(data).find((node) => node.children.length === 0);
    return leaf?.id ?? '';
  };

  const closeTracker = () => {
    window.location.hash = `/guide/${lastNodeRef.current || firstNodeId()}`;
  };

  const openTracker = () => {
    window.location.hash = '/tracker';
  };

  const openNotices = () => {
    window.location.hash = '/notices';
  };

  return (
    <TrackerProvider>
      <HighlightProvider>
        <GuideApp
          data={data}
          mode={mode}
          onViewGuide={closeTracker}
          onViewTracker={openTracker}
          onViewNotices={openNotices}
        />
        {mode === 'tracker' && <TrackerApp data={data} />}
        {mode === 'notices' && <NoticesView />}
      </HighlightProvider>
    </TrackerProvider>
  );
}
