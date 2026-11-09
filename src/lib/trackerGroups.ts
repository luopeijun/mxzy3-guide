import type { TaskLine } from './tracker';

/** Display groups, aligned to the guide's own top-level categories. The
 *  non-artist pool from v2 is split into 经纪人事件簿 (game-guide) and 其他事件
 *  (notices + other-events); 艺人事件簿 is the artist opt-in, and 路欧桑剧情
 *  keeps its sign-off-dependent auto-branching. */
export type GroupKey = 'broker' | 'artist' | 'luousang' | 'other';

export const GROUP_ORDER: GroupKey[] = ['broker', 'other', 'artist', 'luousang'];
export const GROUP_LABEL: Record<GroupKey, string> = {
  broker: '经纪人事件簿',
  other: '其他事件',
  artist: '艺人事件簿',
  luousang: '路欧桑剧情',
};

export function groupOf(line: TaskLine): GroupKey {
  if (line.kind === 'artist') return 'artist';
  if (line.kind === 'luousang') return 'luousang';
  if (line.nodeId.startsWith('game-guide/')) return 'broker';
  return 'other';
}

export interface PoolGroup {
  key: GroupKey;
  label: string;
  lines: TaskLine[];
}

/** Bucket lines into ordered display groups (excluded lines kept so the left
 *  panel can show restore controls). */
export function computeGroups(lines: TaskLine[]): PoolGroup[] {
  const buckets: Record<GroupKey, TaskLine[]> = { broker: [], artist: [], luousang: [], other: [] };
  for (const line of lines) buckets[groupOf(line)].push(line);
  return GROUP_ORDER.map((key) => ({ key, label: GROUP_LABEL[key], lines: buckets[key] }));
}
