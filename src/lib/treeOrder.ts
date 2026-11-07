import type { GuideNode } from '../types/guide';

/** Key of the top level (the four categories). */
export const ROOT_KEY = 'root';
const STORAGE_KEY = 'guide.tree-order.v1';

export type Place = 'before' | 'after';
/** parent key -> ordered child ids. Levels never moved are simply absent. */
export type OrderMap = Record<string, string[]>;

export interface ReorderRequest {
  parentKey: string;
  dragId: string;
  targetId: string;
  place: Place;
}

/** localStorage is optional: private mode or a full quota must not break the tree. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isOrderMap(value: unknown): value is OrderMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string'),
  );
}

export function readOrder(): OrderMap {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return isOrderMap(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeOrder(order: OrderMap): void {
  try {
    const target = storage();
    if (!target) return;
    if (Object.keys(order).length === 0) target.removeItem(STORAGE_KEY);
    else target.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    /* quota exceeded — keep the in-memory order */
  }
}

/** Sort one level by a stored id list; ids missing from it keep source order and go last. */
export function sortSiblings(nodes: GuideNode[], ids: string[] | undefined): GuideNode[] {
  if (!ids?.length) return nodes;
  const rank = new Map(ids.map((id, index) => [id, index]));
  const weight = (node: GuideNode, index: number) => rank.get(node.id) ?? ids.length + index;
  return nodes
    .map((node, index) => ({ node, index }))
    .sort((a, b) => weight(a.node, a.index) - weight(b.node, b.index))
    .map(({ node }) => node);
}

/** Apply the saved order level by level, keeping nodes themselves untouched. */
export function applyOrder(nodes: GuideNode[], order: OrderMap, parentKey = ROOT_KEY): GuideNode[] {
  return sortSiblings(nodes, order[parentKey]).map((node) =>
    node.children.length
      ? { ...node, children: applyOrder(node.children, order, node.id) }
      : node,
  );
}

export function findNode(nodes: GuideNode[], id: string): GuideNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = findNode(node.children, id);
    if (found) return found;
  }
  return null;
}

/** The children of `parentKey`, or null when that level does not exist. */
export function siblingsOf(categories: GuideNode[], parentKey: string): GuideNode[] | null {
  if (parentKey === ROOT_KEY) return categories;
  return findNode(categories, parentKey)?.children ?? null;
}

/** Move `dragId` next to `targetId`; null when the move would change nothing. */
export function moveIds(
  ids: string[],
  dragId: string,
  targetId: string,
  place: Place,
): string[] | null {
  if (dragId === targetId) return null;
  const source = ids.indexOf(dragId);
  if (source < 0 || ids.indexOf(targetId) < 0) return null;

  const next = ids.filter((id) => id !== dragId);
  const anchor = next.indexOf(targetId);
  next.splice(place === 'before' ? anchor : anchor + 1, 0, dragId);
  return next.join('\u0000') === ids.join('\u0000') ? null : next;
}
