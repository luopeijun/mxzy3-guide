import { useCallback, useEffect, useState } from 'react';

export function readHash(): string {
  // `#/node-id~anchor` keeps the in-page anchor in the same fragment.
  const raw = window.location.hash.replace(/^#\/?/, '').split('~')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** True when the URL points at the standalone tracker view rather than a node. */
export function isTrackerRoute(): boolean {
  return readHash() === 'tracker';
}

/** True when the URL points at the 通告 tab. */
export function isNoticesRoute(): boolean {
  return readHash() === 'notices';
}

/** True when the URL points at the CG 图鉴 tab, including the deep link
 *  `#/cg/<cgId>` that the guide's CG badge produces. */
export function isCgRoute(): boolean {
  const h = readHash();
  return h === 'cg' || h.startsWith('cg/');
}

/** `#/cg/group/<groupId>` 这一段：图鉴当前停在哪个分组。 */
const CG_GROUP_PREFIX = 'group/';

/** 图鉴当前分组 id，`#/cg` / `#/cg/<cgId>` 都算「没指定分组」返回 ''。 */
export function cgGroupId(): string {
  const h = readHash();
  const prefix = `cg/${CG_GROUP_PREFIX}`;
  return h.startsWith(prefix) ? h.slice(prefix.length) : '';
}

/** The CG id in `#/cg/<cgId>`, or '' when the tab was opened without one. */
export function cgItemId(): string {
  const h = readHash();
  if (!h.startsWith('cg/')) return '';
  const rest = h.slice('cg/'.length);
  return rest.startsWith(CG_GROUP_PREFIX) ? '' : rest;
}

/** 上一次看的分组：从攻略点「CG 图鉴」回来时直接回到这一组，而不是复位成「全部」。 */
let lastCgGroup = 'all';

export function rememberCgGroup(groupId: string) {
  if (groupId) lastCgGroup = groupId;
}

/** 「CG 图鉴」页签要跳去的地址（带上上次看的分组）。 */
export function cgTabHash(): string {
  return lastCgGroup === 'all' ? '/cg' : `/cg/${CG_GROUP_PREFIX}${encodeURIComponent(lastCgGroup)}`;
}

/** 把分组写进 URL，刷新 / 复制链接都还能停在同一个人物上。
 *
 *  用 replaceState 而不是改 hash：切分组不该往历史栈里塞一条，后退仍然是「离开图鉴」。
 *  也刻意不派发 hashchange —— 点击方自己已经 setGroupId 了，重复触发只会让列表抖一下。 */
export function writeCgGroupHash(groupId: string) {
  const hash = groupId === 'all'
    ? '#/cg'
    : `#/cg/${CG_GROUP_PREFIX}${encodeURIComponent(groupId)}`;
  if (window.location.hash === hash) return;
  window.history.replaceState(null, '', hash);
}

/** The guide node id implied by the current hash, or '' on a standalone view or
 *  with nothing selected. Understands both the explicit `#/guide/...` prefix and
 *  legacy bookmarks that lack it, so old deep links keep working. */
export function guideNodeId(): string {
  const h = readHash();
  if (h === 'tracker' || h === 'notices') return '';
  if (isCgRoute()) return '';
  if (h.startsWith('guide/')) return h.slice('guide/'.length);
  return h; // legacy: node id without the `guide/` prefix
}

/** Keep the selected guide node in the URL hash for refresh-safe deep links. */
export function useHashSelection(validIds: Set<string>) {
  const [rawId, setRawId] = useState(guideNodeId);

  useEffect(() => {
    const onChange = () => setRawId(guideNodeId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const select = useCallback((id: string) => {
    setRawId(id);
    window.location.hash = `/guide/${id}`;
  }, []);

  return {
    selectedId: validIds.has(rawId) ? rawId : '',
    select,
  };
}
