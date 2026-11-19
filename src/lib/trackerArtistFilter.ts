import type { GuideData } from '../types/guide';
import { listArtists, LUO_ARTIST_IDS, type TaskLine } from './tracker';
import type { TrackerSiteConfig } from './trackerConfig';

export interface ArtistChoice {
  /** 艺人攻略页的节点 id，与 TaskLine.nodeId 同源。 */
  id: string;
  label: string;
}

/** 筛选 artists 一律取左侧「追踪艺人」名单（含已解约，含甜站固定主角），
 *  而不是从池里的任务线反推——没勾的艺人根本不该出现在这个筛选里。 */
export function trackedArtistChoices(
  trackedIds: string[],
  data: GuideData,
  config: TrackerSiteConfig,
): ArtistChoice[] {
  const titles = new Map(listArtists(data, config).map((artist) => [artist.id, artist.title]));
  if (config.protagonist) titles.set(config.protagonist.id, config.protagonist.title);
  return trackedIds.map((id) => ({ id, label: titles.get(id) ?? id }));
}

/** 选中的多个艺人彼此取并集；路欧桑线属于三位当事人共有，选任一位都能看到。 */
export function lineMatchesArtists(line: TaskLine, selected: string[]): boolean {
  if (selected.length === 0) return true;
  if (line.kind === 'artist') return selected.includes(line.nodeId);
  if (line.kind === 'luousang') return LUO_ARTIST_IDS.some((id) => selected.includes(id));
  return false;
}

export function toggleArtistChoice(selected: string[], id: string): string[] {
  return selected.includes(id)
    ? selected.filter((item) => item !== id)
    : [...selected, id];
}

/** 分类也是同维度多选取并集：经纪人事件簿 / 其他事件等来自站点配置。 */
export function toggleGroupChoice<T extends string>(selected: T[], key: T): T[] {
  return selected.includes(key)
    ? selected.filter((item) => item !== key)
    : [...selected, key];
}
