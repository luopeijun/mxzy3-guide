/** 池子顺序的版本。老存档（epoch 0）把「路欧桑剧情」那几条线排在池子最末，
 *  2026-11 起提到「艺人事件」后面；读到老存档时迁移一次，之后用户拖到哪就停在哪。 */
export const ORDER_EPOCH = 2;

const LUOSANG_PREFIX = 'other-events/luousang/';
const ARTIST_PREFIX = 'characters/';

/** 把路欧桑线整段挪到「最后一条艺人线」后面，其他线的相对次序一律不动。 */
export function hoistLuosangLines(order: string[]): string[] {
  const luosang = order.filter((id) => id.startsWith(LUOSANG_PREFIX));
  if (luosang.length === 0) return order;
  const rest = order.filter((id) => !id.startsWith(LUOSANG_PREFIX));
  let artistAt = -1;
  let guideAt = -1;
  rest.forEach((id, index) => {
    if (id.startsWith(ARTIST_PREFIX)) artistAt = index + 1;
    else if (id.startsWith('game-guide/')) guideAt = index + 1;
  });
  // 没选过艺人时退到「经纪人事件」之后，别把感情线顶到最前面。
  const at = artistAt >= 0 ? artistAt : Math.max(0, guideAt);
  return [...rest.slice(0, at), ...luosang, ...rest.slice(at)];
}

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
