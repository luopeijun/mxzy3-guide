/** Pure helpers for the flat, drag-sortable event pool. Order is a full list of
 *  line ids; pinned ids are always lifted to the front in their pin order.
 *  Ids that no longer exist in the pool (artist changed, line excluded) are
 *  simply ignored, so stale localStorage entries are harmless. */
export function applyLineOrder<T>(
  items: T[],
  getId: (item: T) => string,
  order: string[],
  pinned: string[],
): T[] {
  const byId = new Map(items.map((item) => [getId(item), item]));
  const pinSet = new Set(pinned);
  const pinnedItems: T[] = [];
  for (const id of pinned) {
    const item = byId.get(id);
    if (item !== undefined) pinnedItems.push(item);
  }

  const orderPos = new Map(order.map((id, index) => [id, index]));
  const basePos = new Map(items.map((item, index) => [getId(item), index]));
  const rest = items
    .filter((item) => !pinSet.has(getId(item)))
    .sort((a, b) => {
      const oa = orderPos.get(getId(a)) ?? Number.MAX_SAFE_INTEGER;
      const ob = orderPos.get(getId(b)) ?? Number.MAX_SAFE_INTEGER;
      if (oa !== ob) return oa - ob;
      return (basePos.get(getId(a)) ?? 0) - (basePos.get(getId(b)) ?? 0);
    });

  return [...pinnedItems, ...rest];
}

/** New id list when `dragged` is dropped on `target`; `after` picks which side
 *  of the target it lands on. Returns the original array on an invalid drop. */
export function moveId(
  ids: string[],
  dragged: string,
  target: string,
  after: boolean,
): string[] {
  if (dragged === target || !ids.includes(dragged)) return ids;
  const next = ids.filter((id) => id !== dragged);
  const at = next.indexOf(target);
  if (at < 0) return ids;
  next.splice(after ? at + 1 : at, 0, dragged);
  return next;
}
