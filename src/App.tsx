import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GuideData } from './types/guide';
import { findNodePath, flattenNodes, searchGuide } from './lib/guide';
import { useHashSelection } from './hooks/useHashSelection';
import { useGuideData } from './hooks/useGuideData';
import AppShell from './components/AppShell';
import BrandHeader from './components/BrandHeader';
import ContentPanel from './components/ContentPanel';
import LoadingScreen from './components/LoadingScreen';
import Sidebar from './components/Sidebar';

function GuideApp({ data }: { data: GuideData }) {
  const allNodes = useMemo(() => flattenNodes(data), [data]);
  const validIds = useMemo(() => new Set(allNodes.map((node) => node.id)), [allNodes]);
  const { selectedId, select } = useHashSelection(validIds);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () => new Set(data.categories.map((category) => category.id)),
  );
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const path = useMemo(() => findNodePath(data, selectedId), [data, selectedId]);
  const hits = useMemo(() => searchGuide(data, query), [data, query]);
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
          stats={data.meta.stats}
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
          stats={data.meta.stats}
          onToggle={toggle}
          onSelect={handleSelect}
          onQueryChange={setQuery}
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

export default function App() {
  const { data, error } = useGuideData();

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

  return <GuideApp data={data} />;
}
