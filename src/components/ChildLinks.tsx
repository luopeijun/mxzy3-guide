import type { GuideNode } from '../types/guide';
import { countBlocks } from '../lib/guide';
import StatusBadge from './StatusBadge';
import styles from '../styles/ui.module.css';

interface Props {
  nodes: GuideNode[];
  onSelect: (id: string) => void;
  title?: string;
}

/** Reused by category pages and items that own sub-items. */
export default function ChildLinks({ nodes, onSelect, title = '下级条目' }: Props) {
  if (!nodes.length) return null;

  return (
    <section>
      <h2 className={styles.sectionTitle}>{title} · {nodes.length}</h2>
      <div className={styles.categoryGrid}>
        {nodes.map((node) => (
          <button
            key={node.id}
            className={styles.categoryCard}
            type="button"
            onClick={() => onSelect(node.id)}
          >
            <div className={styles.categoryCardHead}>
              <span className={styles.categoryCardTitle}>{node.title}</span>
              {node.status === 'missing' && <StatusBadge>待补充</StatusBadge>}
            </div>
            {node.sourceTitle && <div className={styles.categoryCardSource}>原目录：{node.sourceTitle}</div>}
            {node.description && <p className={styles.categoryCardDesc}>{node.description}</p>}
            <div className={styles.categoryCardFoot}>
              {node.status === 'missing'
                ? '攻略文档中暂未收录'
                : `${countBlocks(node)} 段内容${node.children.length ? ` · ${node.children.length} 个子条目` : ''}`}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
