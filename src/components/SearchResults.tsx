import type { SearchHit } from '../lib/guide';
import styles from '../styles/ui.module.css';

interface Props {
  hits: SearchHit[];
  keyword: string;
  onSelect: (id: string) => void;
}

export default function SearchResults({ hits, keyword, onSelect }: Props) {
  if (!hits.length) {
    return <div className={styles.resultsEmpty}>没有找到与「{keyword}」相关的内容</div>;
  }

  return (
    <div className={styles.results}>
      <div className={styles.sidebarCount}>找到 {hits.length} 条结果</div>
      {hits.map((hit) => (
        <button
          key={hit.node.id}
          className={styles.resultItem}
          type="button"
          onClick={() => onSelect(hit.node.id)}
        >
          <div className={styles.resultTitle}>{hit.node.title}</div>
          <div className={styles.resultPath}>
            {hit.path.slice(0, -1).map((item) => item.title).join(' / ')}
          </div>
          {hit.snippet && <div className={styles.resultSnippet}>{hit.snippet}</div>}
        </button>
      ))}
    </div>
  );
}
