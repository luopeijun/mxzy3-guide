import type { GuideNode } from '../types/guide';
import { countChars, countCharsDeep, formatCount } from '../lib/guide';
import StatusBadge from './StatusBadge';

interface Props {
  node: GuideNode;
}

export default function ArticleHeader({ node }: Props) {
  const hasChildren = node.children.length > 0;
  const chars = hasChildren ? countCharsDeep(node) : countChars(node);

  return (
    <div className="mb-6 border-b border-line pb-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-ui-2xl font-bold leading-[1.35] tracking-[0.01em] phone:text-ui-xl">{node.title}</h1>
        {node.status === 'missing' ? (
          <StatusBadge>待补充</StatusBadge>
        ) : (
          <StatusBadge variant="primary">已收录</StatusBadge>
        )}
      </div>

      {node.description && <p className="mt-3 text-ui-md leading-[1.8] text-ink-muted">{node.description}</p>}

      <div className="mt-[14px] flex flex-wrap gap-4 text-ui-2xs text-ink-faint">
        {hasChildren && <span>{node.children.length} 个子条目</span>}
        {chars > 0 && <span>约 {formatCount(chars)} 字</span>}
        {node.aliases?.length ? <span>别名：{node.aliases.join('、')}</span> : null}
      </div>
    </div>
  );
}
