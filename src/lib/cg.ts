/** CG 收集状态。像备忘录一样独立于 `guide.progress.v1`：重置事件追踪进度、
 *  导入旧存档都不该把玩家勾过的 CG 清掉。以后接进存档导出时再单独处理。 */
export const CG_KEY = 'guide.cg.v1';

/** 只保留当前清单里真实存在的 id，手改 localStorage 或旧版本数据都不会
 *  让统计数字虚高，也不会让已下架的 CG 卡在「已收集」状态。 */
export function sanitiseCg(raw: unknown, validIds: Set<string>): Set<string> {
  const out = new Set<string>();
  if (!raw || typeof raw !== 'object') return out;
  const collected = (raw as { collected?: unknown }).collected;
  if (!Array.isArray(collected)) return out;
  for (const id of collected) {
    if (typeof id === 'string' && validIds.has(id)) out.add(id);
  }
  return out;
}

export function readCg(validIds: Set<string>): Set<string> {
  try {
    const raw = localStorage.getItem(CG_KEY);
    return raw ? sanitiseCg(JSON.parse(raw), validIds) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

export function writeCg(collected: Set<string>): void {
  try {
    localStorage.setItem(CG_KEY, JSON.stringify({ version: 1, collected: [...collected] }));
  } catch {
    // 隐私模式 / 配额不足：本次会话内仍然正常点亮，只是不落盘。
  }
}
