import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import SmartImage from '../ui/SmartImage';
import type { DragEvent, KeyboardEvent } from 'react';
import type { GuideNode } from '../types/guide';
import type { Place, ReorderRequest } from '../lib/treeOrder';
import { ROOT_KEY } from '../lib/treeOrder';
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
  /** Omit to keep the tree read-only. */
  onReorder?: (request: ReorderRequest) => void;
}

interface LevelProps extends SharedProps {
  nodes: GuideNode[];
  parentKey: string;
  depth: number;
  onReorder?: (request: ReorderRequest) => void;
}

interface TreeNodeProps extends SharedProps {
  node: GuideNode;
  parentKey: string;
  depth: number;
  previousId?: string;
  nextId?: string;
  onReorder?: (request: ReorderRequest) => void;
}

interface DragSession {
  /** Id of the row being dragged, null when idle. */
  dragId: string | null;
  /** Level the dragged row belongs to; drops are only allowed on that same level. */
  dragParent: string | null;
  drop: { id: string; place: Place } | null;
  start: (id: string, parentKey: string) => void;
  end: () => void;
  over: (id: string, place: Place) => void;
  leave: (id: string) => void;
}

const DragContext = createContext<DragSession | null>(null);

/** Upper half of the row inserts before it, lower half after it. */
function placeAt(event: DragEvent<HTMLElement>): Place {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

function TreeNode({
  node, parentKey, depth = 0, previousId, nextId, onReorder, ...props
}: TreeNodeProps) {
  const { selectedId, expandedIds, onToggle, onSelect } = props;
  const drag = useContext(DragContext);
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

  const dragging = drag?.dragId === node.id;
  const dropPlace = drag?.drop?.id === node.id ? drag.drop.place : null;
  // Same level only: a category cannot be dropped into another category's children.
  const acceptsDrop = Boolean(drag?.dragId) && drag?.dragParent === parentKey && !dragging;

  const rowClass = cn(
    'relative flex w-full items-center gap-1.5 rounded-ui-sm px-2 py-1.5 text-left text-ui-sm transition-colors duration-150',
    isCategory && 'border-l-2 border-brand-line',
    onReorder && 'cursor-grab select-none active:cursor-grabbing',
    tone,
    dragging && 'opacity-40',
  );

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey || !onReorder) return;
    if (event.key === 'ArrowUp' && previousId) {
      event.preventDefault();
      onReorder({ parentKey, dragId: node.id, targetId: previousId, place: 'before' });
    } else if (event.key === 'ArrowDown' && nextId) {
      event.preventDefault();
      onReorder({ parentKey, dragId: node.id, targetId: nextId, place: 'after' });
    }
  };

  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? expanded : undefined}
      className={isCategory ? 'mt-2.5 first:mt-0' : undefined}
    >
      <div
        className={rowClass}
        data-node-id={node.id}
        draggable={Boolean(onReorder)}
        onDragStart={(event) => {
          event.stopPropagation();
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', node.id);
          drag?.start(node.id, parentKey);
        }}
        onDragEnd={() => drag?.end()}
        onDragOver={(event) => {
          if (!acceptsDrop) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          drag?.over(node.id, placeAt(event));
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && event.currentTarget.contains(next)) return;
          drag?.leave(node.id);
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!acceptsDrop || !onReorder || !drag?.dragId) {
            drag?.end();
            return;
          }
          onReorder({
            parentKey,
            dragId: drag.dragId,
            targetId: node.id,
            place: placeAt(event),
          });
          drag.end();
        }}
      >
        {dropPlace && (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-x-1 h-[2px] rounded-full bg-brand',
              dropPlace === 'before' ? '-top-px' : '-bottom-px',
            )}
          />
        )}
        <button
          className="w-4 shrink-0 p-0 text-center text-[10px] leading-none text-ink-faint"
          type="button"
          onClick={() => hasChildren && onToggle(node.id)}
          aria-label={hasChildren ? (expanded ? '收起' : '展开') : undefined}
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (expanded ? '▾' : '▸') : '·'}
        </button>
        {node.avatar && (
          <SmartImage
            src={node.avatar}
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-5 w-5 shrink-0 rounded-full border border-line-strong object-cover"
          />
        )}
        <button
          className="min-w-0 flex-1 truncate p-0 text-left"
          type="button"
          onClick={() => onSelect(node.id)}
          onKeyDown={handleKeyDown}
          aria-current={active ? 'page' : undefined}
          title={onReorder ? `${node.title}（拖拽或 Alt+↑↓ 调整同级顺序）` : node.title}
        >
          {node.title}
        </button>
        {onReorder && (
          <span className="hidden shrink-0 items-center gap-px touch:flex">
            <button
              className="h-6 w-5 rounded-ui-sm text-ui-xs leading-none text-ink-faint disabled:opacity-25"
              type="button"
              aria-label={`把「${node.title}」上移一位`}
              disabled={!previousId}
              onClick={() => previousId && onReorder({ parentKey, dragId: node.id, targetId: previousId, place: 'before' })}
            >
              ↑
            </button>
            <button
              className="h-6 w-5 rounded-ui-sm text-ui-xs leading-none text-ink-faint disabled:opacity-25"
              type="button"
              aria-label={`把「${node.title}」下移一位`}
              disabled={!nextId}
              onClick={() => nextId && onReorder({ parentKey, dragId: node.id, targetId: nextId, place: 'after' })}
            >
              ↓
            </button>
          </span>
        )}
        {node.status === 'missing' ? (
          <StatusBadge>待补充</StatusBadge>
        ) : hasChildren ? (
          <span className="shrink-0 text-ui-2xs tabular-nums text-ink-faint">{node.children.length}</span>
        ) : null}
      </div>

      {hasChildren && expanded && (
        <div className="ml-[14px] flex flex-col gap-px border-l border-dashed border-line-strong pl-[7px]" role="group">
          <TreeLevel
            nodes={node.children}
            parentKey={node.id}
            depth={depth + 1}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onToggle={onToggle}
            onSelect={onSelect}
            onReorder={onReorder}
          />
        </div>
      )}
    </div>
  );
}

/** Renders one level; the rows stay direct children of the tree or of a group. */
function TreeLevel({ nodes, parentKey, depth, ...props }: LevelProps) {
  return (
    <>
      {nodes.map((node, index) => (
        <TreeNode
          key={node.id}
          node={node}
          parentKey={parentKey}
          depth={depth}
          previousId={nodes[index - 1]?.id}
          nextId={nodes[index + 1]?.id}
          {...props}
        />
      ))}
    </>
  );
}

/** Recursive tree; the same component renders categories, items and sub-items. */
export default function GuideTree({ nodes, onReorder, ...props }: Props) {
  const [drag, setDrag] = useState<{ id: string; parentKey: string } | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: Place } | null>(null);

  const start = useCallback((id: string, parentKey: string) => {
    setDrag({ id, parentKey });
    setDrop(null);
  }, []);

  const end = useCallback(() => {
    setDrag(null);
    setDrop(null);
  }, []);

  const over = useCallback((id: string, place: Place) => {
    setDrop((previous) =>
      previous?.id === id && previous.place === place ? previous : { id, place },
    );
  }, []);

  const leave = useCallback((id: string) => {
    setDrop((previous) => (previous?.id === id ? null : previous));
  }, []);

  const session = useMemo<DragSession>(
    () => ({
      dragId: drag?.id ?? null,
      dragParent: drag?.parentKey ?? null,
      drop,
      start,
      end,
      over,
      leave,
    }),
    [drag, drop, start, end, over, leave],
  );

  return (
    <DragContext.Provider value={session}>
      <div className="flex flex-col gap-px" role="tree">
        <TreeLevel
          nodes={nodes}
          parentKey={ROOT_KEY}
          depth={0}
          onReorder={onReorder}
          {...props}
        />
      </div>
    </DragContext.Provider>
  );
}
