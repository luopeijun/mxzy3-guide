import type { GuideNode } from '../types/guide';
import type { SearchHit } from '../lib/guide';
import GuideTree from './GuideTree';
import SearchBox from './SearchBox';
import SearchResults from './SearchResults';
import styles from '../styles/ui.module.css';

interface Props {
  categories: GuideNode[];
  selectedId: string;
  expandedIds: Set<string>;
  query: string;
  hits: SearchHit[];
  open: boolean;
  stats: { items: number; blocks: number };
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onQueryChange: (value: string) => void;
}

export default function Sidebar({
  categories, selectedId, expandedIds, query, hits, open, stats,
  onToggle, onSelect, onQueryChange,
}: Props) {
  return (
    <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
      <div className={styles.sidebarHead}>
        <div className={styles.sidebarTitleRow}>
          <span className={styles.sidebarTitle}>攻略目录</span>
          <span className={styles.sidebarCount}>4 大类</span>
        </div>
        <SearchBox value={query} onChange={onQueryChange} />
      </div>

      <nav className={styles.sidebarScroll} aria-label="攻略分级目录">
        {query.trim() ? (
          <SearchResults hits={hits} keyword={query.trim()} onSelect={onSelect} />
        ) : (
          <GuideTree
            nodes={categories}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        )}
      </nav>

      <div className={styles.sidebarFoot}>
        共 {stats.items} 个条目 · {stats.blocks} 段正文
        <br />
        纯浏览模式 · 进度追踪即将上线
      </div>
    </aside>
  );
}
