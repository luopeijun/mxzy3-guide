import type { TaskLine } from './tracker';
import { MAIN_TRACKER_CONFIG, type TrackerSiteConfig } from './trackerConfig';

/** Display groups, aligned to the guide's own top-level categories. The
 *  non-artist pool from v2 is split into 经纪人事件簿 (game-guide) and 其他事件
 *  (notices + other-events); 艺人事件簿 is the artist opt-in, and 路欧桑剧情
 *  keeps its sign-off-dependent auto-branching.
 *
 *  顺序跟着侧栏与事件池走：经纪人 → 艺人 → 路欧桑 → 其他。甜蜜乐章没有路欧桑，
 *  由站点配置给出自己的分组清单（经纪人 → 艺人 → 支线）。 */
export type GroupKey = 'broker' | 'artist' | 'luousang' | 'other';

export const GROUP_ORDER: GroupKey[] = ['broker', 'artist', 'luousang', 'other'];
export const GROUP_LABEL: Record<GroupKey, string> = {
  broker: '经纪人事件簿',
  other: '其他事件',
  artist: '艺人事件簿',
  luousang: '路欧桑剧情',
};

export function groupOf(line: TaskLine, config: TrackerSiteConfig = MAIN_TRACKER_CONFIG): GroupKey {
  if (line.kind === 'artist') return 'artist';
  if (line.kind === 'luousang') return 'luousang';
  if (line.nodeId.startsWith(config.brokerPrefix)) return 'broker';
  return 'other';
}

export interface PoolGroup {
  key: GroupKey;
  label: string;
  lines: TaskLine[];
}

/** Bucket lines into ordered display groups (excluded lines kept so the left
 *  panel can show restore controls). Only the site's configured groups are
 *  emitted — 明星志愿3 keeps all four (empty 路欧桑 group still renders its
 *  chip, per the "chips 恒定" rule), 甜蜜乐章 has three. */
export function computeGroups(
  lines: TaskLine[],
  config: TrackerSiteConfig = MAIN_TRACKER_CONFIG,
): PoolGroup[] {
  const buckets: Record<GroupKey, TaskLine[]> = { broker: [], artist: [], luousang: [], other: [] };
  for (const line of lines) buckets[groupOf(line, config)].push(line);
  return config.groups.map(({ key, label }) => ({ key, label, lines: buckets[key] }));
}
