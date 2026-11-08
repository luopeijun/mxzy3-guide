import type { GuideNode } from '../types/guide';
import { countCharsDeep, formatCount } from '../lib/guide';
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
            {node.avatar ? (
              // 角色卡：头像在左，标题与说明在右，横排更像「人物卡片」。
              <div className="flex items-start gap-3.5">
                <img
                  src={`${import.meta.env.BASE_URL}${node.avatar}`}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 shrink-0 rounded-ui-sm border border-line object-cover"
                />
                <div className="min-w-0 flex-1">
                  <div className={ui.cardHead}>
                    <span className={ui.cardTitle}>{node.title}</span>
                    {node.status === 'missing' && <StatusBadge>待补充</StatusBadge>}
                  </div>
                  {node.description && <p className={ui.cardDesc}>{node.description}</p>}
                  <div className={ui.cardFoot}>
                    {node.status === 'missing'
                      ? '攻略文档中暂未收录'
                      : `约 ${formatCount(countCharsDeep(node))} 字${node.children.length ? ` · ${node.children.length} 个子条目` : ''}`}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className={ui.cardHead}>
                  <span className={ui.cardTitle}>{node.title}</span>
                  {node.status === 'missing' && <StatusBadge>待补充</StatusBadge>}
                </div>
                {node.description && <p className={ui.cardDesc}>{node.description}</p>}
                <div className={ui.cardFoot}>
                  {node.status === 'missing'
                    ? '攻略文档中暂未收录'
                    : `约 ${formatCount(countCharsDeep(node))} 字${node.children.length ? ` · ${node.children.length} 个子条目` : ''}`}
                </div>
              </>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}
