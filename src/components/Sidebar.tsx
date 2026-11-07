import type { GuideNode } from '../types/guide';
import type { SearchHit } from '../lib/guide';
import GuideTree from './GuideTree';
import SearchBox from './SearchBox';
import SearchResults from './SearchResults';
import { cn } from '../lib/cn';

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
    <aside
      data-open={open}
      className={cn(
        'flex w-[302px] shrink-0 flex-col border-r border-line bg-sidebar',
        'nav:absolute nav:inset-y-0 nav:left-0 nav:z-30 nav:w-[min(86vw,302px)]',
        'nav:-translate-x-[102%] nav:shadow-float nav:transition-transform nav:duration-200',
        'data-[open=true]:translate-x-0',
      )}
    >
      <div className="border-b border-line px-4 pt-[18px] pb-3">
        <div className="mb-3 flex items-baseline justify-between">
          <span className="text-ui-xs font-bold tracking-[0.08em] text-ink-muted">攻略目录</span>
          <span className="text-ui-2xs text-ink-faint">4 大类</span>
        </div>
        <SearchBox value={query} onChange={onQueryChange} />
      </div>

      <nav className="flex-1 overflow-y-auto px-[10px] pt-3 pb-6" aria-label="攻略分级目录">
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

      <div className="border-t border-line px-4 pt-[10px] pb-[14px] text-ui-2xs leading-[1.6] text-ink-faint">
        共 {stats.items} 个条目 · {stats.blocks} 段正文
        <br />
        纯浏览模式 · 进度追踪即将上线
      </div>
    </aside>
  );
}
