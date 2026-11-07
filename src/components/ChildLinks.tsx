import type { GuideNode } from '../types/guide';
import { countBlocks } from '../lib/guide';
import StatusBadge from './StatusBadge';
import { ui } from '../styles/patterns';

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
      <h2 className={ui.sectionTitle}>{title} · {nodes.length}</h2>
      <div className={ui.cardGrid}>
        {nodes.map((node) => (
          <button key={node.id} className={ui.card} type="button" onClick={() => onSelect(node.id)}>
            <div className={ui.cardHead}>
              <span className={ui.cardTitle}>{node.title}</span>
              {node.status === 'missing' && <StatusBadge>待补充</StatusBadge>}
            </div>
            {node.sourceTitle && <div className={ui.cardSource}>原目录：{node.sourceTitle}</div>}
            {node.description && <p className={ui.cardDesc}>{node.description}</p>}
            <div className={ui.cardFoot}>
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
