/** Standalone scratch list for the tracker's left rail. It is deliberately
 *  kept out of `guide.progress.v1`: memos are free text about whatever the
 *  player still has to do ("周六前把方若绮的好感刷到 60"), unrelated to the
 *  event pool. Resetting progress or importing a save must never touch them. */
export interface MemoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export const MEMO_KEY = 'guide.memo.v1';
export const MEMO_MAX_LENGTH = 200;

function newId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Drop anything malformed and repair duplicate ids, so a hand-edited or
 *  half-written localStorage entry cannot break rendering. Order is preserved:
 *  memos stay where the player put them. */
export function sanitiseMemos(raw: unknown): MemoItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: MemoItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<MemoItem>;
    if (typeof item.text !== 'string') continue;
    const text = item.text.trim().slice(0, MEMO_MAX_LENGTH);
    if (!text) continue;
    let id = typeof item.id === 'string' && item.id ? item.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({
      id,
      text,
      done: item.done === true,
      createdAt:
        typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
          ? item.createdAt
          : Date.now(),
    });
  }
  return out;
}

export function readMemos(): MemoItem[] {
  try {
    const raw = localStorage.getItem(MEMO_KEY);
    if (!raw) return [];
    return sanitiseMemos(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function writeMemos(list: MemoItem[]): void {
  try {
    localStorage.setItem(MEMO_KEY, JSON.stringify(list));
  } catch {
    // Private mode / quota: the list simply will not survive a reload.
  }
}

/** Unfinished first in creation order, then the finished ones, so a ticked
 *  memo visibly moves into the 已完成 block instead of silently disappearing. */
export function sortMemos(list: MemoItem[]): MemoItem[] {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return a.createdAt - b.createdAt;
  });
}

export function createMemo(text: string, now: number = Date.now()): MemoItem | null {
  const trimmed = text.trim().slice(0, MEMO_MAX_LENGTH);
  if (!trimmed) return null;
  return { id: newId(), text: trimmed, done: false, createdAt: now };
}

export function countUndone(list: MemoItem[]): number {
  return list.filter((item) => !item.done).length;
}
