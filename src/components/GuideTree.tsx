import type { GuideNode } from '../types/guide';
import StatusBadge from './StatusBadge';
import styles from '../styles/ui.module.css';

interface SharedProps {
  selectedId: string;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
}

interface Props extends SharedProps {
  nodes: GuideNode[];
  depth?: number;
}

interface TreeNodeProps extends SharedProps {
  node: GuideNode;
  depth: number;
}

function TreeNode({ node, depth = 0, ...props }: TreeNodeProps) {
  const { selectedId, expandedIds, onToggle, onSelect } = props;
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);
  const active = selectedId === node.id;
  const isCategory = depth === 0;

  const rowClass = [
    styles.treeRow,
    active ? styles.treeRowActive : '',
    isCategory ? styles.treeRowCategory : '',
    node.status === 'missing' && !active ? styles.treeRowDimmed : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={isCategory ? styles.treeCategory : undefined} role="treeitem" aria-expanded={hasChildren ? expanded : undefined}>
      <div className={rowClass}>
        <button
          className={styles.treeToggle}
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (expanded ? '收起' : '展开') : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </button>
        <button
          className={styles.treeLabel}
          type="button"
          onClick={() => onSelect(node.id)}
          aria-current={active ? 'page' : undefined}
          title={node.title}
        >
          {node.title}
        </button>
        {node.status === 'missing' ? (
          <StatusBadge>待补充</StatusBadge>
        ) : hasChildren ? (
          <span className={styles.treeCount}>{node.children.length}</span>
        ) : null}
      </div>

      {hasChildren && expanded && (
        <div className={styles.treeChildren} role="group">
          <GuideTree
            nodes={node.children}
            depth={depth + 1}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        </div>
      )}
    </div>
  );
}

/** Recursive tree; the same component renders categories, items and sub-items. */
export default function GuideTree({ nodes, depth = 0, ...props }: Props) {
  return (
    <div className={styles.tree} role="tree">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} depth={depth} {...props} />
      ))}
    </div>
  );
}
