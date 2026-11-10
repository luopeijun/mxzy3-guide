import { guideNodeId } from '../hooks/useHashSelection';

/**
 * 「从攻略页哪一条事件点进图鉴的」——只记在 sessionStorage 里，跨会话不留痕。
 *
 * 一张 CG 往往有好几个落点（路欧桑的感情线在五个分支页里各写了一遍），图鉴回来后
 * 该回哪一条没有唯一答案；按玩家刚才所在的那一页回去，比固定一个默认落点合理。
 * 直接开 `#/cg/<id>` 深链时没有来源，退回默认落点。
 */
const KEY = 'guide.cg-origin.v1';

export interface CgOrigin {
  cgId: string;
  nodeId: string;
  anchor: string;
}

/** 点事件卡上的 CG 徽标时调用。事件追踪里也复用同一张卡，那里没有攻略节点，不记。 */
export function rememberCgOrigin(cgId: string, anchor: string) {
  const nodeId = guideNodeId();
  if (!nodeId) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ cgId, nodeId, anchor } satisfies CgOrigin));
  } catch {
    // 隐私模式下 sessionStorage 可能不可写；回跳退回默认落点即可。
  }
}

export function readCgOrigin(cgId: string): CgOrigin | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CgOrigin>;
    if (value.cgId !== cgId || !value.nodeId || !value.anchor) return null;
    return { cgId: value.cgId, nodeId: value.nodeId, anchor: value.anchor };
  } catch {
    return null;
  }
}
