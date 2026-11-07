import type { GuideNode } from '../types/guide';
import StatusBadge from './StatusBadge';
import { cn } from '../lib/cn';

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

  // Mutually exclusive tone classes keep hover/active colors unambiguous.
  const tone = active
    ? 'bg-brand-soft font-semibold text-brand-strong'
    : cn(
        'hover:bg-white/75 hover:text-ink',
        isCategory
          ? 'font-bold text-ink'
          : node.status === 'missing'
            ? 'text-ink-faint'
            : 'text-ink-muted',
      );

  const rowClass = cn(
    'flex w-full items-center gap-1.5 rounded-ui-sm px-2 py-1.5 text-left text-ui-sm transition-colors duration-150',
    isCategory && 'border-l-2 border-brand-line',
    tone,
  );

  return (
    <div
      className={isCategory ? 'mt-2.5 first:mt-0' : undefined}
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
    >
      <div className={rowClass}>
        <button
          className="w-4 shrink-0 p-0 text-center text-[10px] leading-none text-ink-faint"
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (expanded ? '收起' : '展开') : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </button>
        <button
          className="min-w-0 flex-1 truncate p-0 text-left"
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
          <span className="shrink-0 text-ui-2xs tabular-nums text-ink-faint">{node.children.length}</span>
        ) : null}
      </div>

      {hasChildren && expanded && (
        <div className="ml-[14px] border-l border-dashed border-line-strong pl-[7px]" role="group">
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
    <div className="flex flex-col gap-px" role="tree">
      {nodes.map((node) => (
        <TreeNode key={node.id} node={node} depth={depth} {...props} />
      ))}
    </div>
  );
}
