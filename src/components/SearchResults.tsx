import type { SearchHit } from '../lib/guide';
import { ui } from '../styles/patterns';

interface Props {
  hits: SearchHit[];
  keyword: string;
  onSelect: (id: string) => void;
}

export default function SearchResults({ hits, keyword, onSelect }: Props) {
  if (!hits.length) {
    return <div className="px-3 py-6 text-center text-ui-xs text-ink-faint">没有找到与「{keyword}」相关的内容</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={ui.meta}>找到 {hits.length} 条结果</div>
      {hits.map((hit) => (
        <button
          key={hit.node.id}
          className="w-full rounded-ui-sm border border-transparent px-[10px] py-2 text-left transition-colors duration-150 hover:border-line hover:bg-surface"
          type="button"
          onClick={() => onSelect(hit.node.id)}
        >
          <div className="text-ui-sm font-semibold text-ink">{hit.node.title}</div>
          <div className="mt-0.5 text-ui-2xs text-ink-faint">
            {hit.path.slice(0, -1).map((item) => item.title).join(' / ')}
          </div>
          {hit.snippet && (
            <div className="mt-[5px] border-l-2 border-brand-line pl-2 text-ui-2xs leading-[1.5] text-ink-muted">
              {hit.snippet}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
