import type { TitleMeta } from './caseParser';

/** 一个门槛项：当前值算不出来的（作品数按游戏内口径统计）have 为 null。 */
export interface TitleGapItem {
  label: string;
  need: number;
  have: number | null;
  /** 还差多少，已达标为 0；算不出来是 null。 */
  diff: number | null;
}

export interface TitleNext {
  id: number;
  name: string;
  rank: number;
  items: TitleGapItem[];
  /** 所有能算的门槛都已达标（作品数不影响这个标记）。 */
  ready: boolean;
}

/** 与 ATTRS 同序，称号表的属性门槛也用这个名字。 */
const ABILITY_INDEX: Record<string, number> = {
  演技: 0, 口才: 1, 歌艺: 2, 名气: 3, 仪态: 4, 动感: 5, 体能: 6, 才智: 7, 自信: 8,
};

/** 与存档里的社交五项同序。 */
const SOCIAL_INDEX: Record<string, number> = {
  叛逆: 0, 性感: 1, 亲和: 2, 人气: 3, 曝光: 4,
};

function currentValue(label: string, stats: { abilities: number[]; social: number[] }): number | null {
  const ability = ABILITY_INDEX[label];
  if (ability !== undefined) return stats.abilities[ability] ?? null;
  const social = SOCIAL_INDEX[label];
  if (social !== undefined) return stats.social[social] ?? null;
  // 电视 / 电影 / 专辑 / 广告 / 节目 / 作品总数：存档里那五个计数器是当期通告数，
  // 不是累计作品数（广告新人也能是 0），拿它算差值会误导，所以只显示目标值。
  return null;
}

/**
 * 当前称号的下一档：同一条线上 rank 高一级的称号里，挑最接近达成的那一个。
 *
 * 称号表本身只给门槛、不给档位，档位来自 `build_case_tables.py` 里人工排的
 * 梯子（`TITLE_LADDERS`），所以这里只做减法，不猜顺序。
 * 同档有多个变体（男女版 / 电视电影版）时按「未达成项最少、总缺口最小」挑，
 * 再按性别过滤，避免把女艺人指向只给男艺人的称号。
 */
export function nextTitle(
  catalog: Record<string, TitleMeta>,
  names: Record<string, string>,
  currentId: number,
  stats: { abilities: number[]; social: number[] },
  gender?: string,
): TitleNext | null {
  const current = catalog[String(currentId)];
  if (!current || current.rank === null || current.rank === undefined) return null;
  // 目录里第三位是 'any'（性别不固定），这时不做性别过滤。
  const known = gender === 'male' || gender === 'female' ? gender : undefined;

  const scored = [];
  for (const [id, meta] of Object.entries(catalog)) {
    if (meta.line !== current.line || meta.rank !== current.rank + 1) continue;
    if (known && meta.sex >= 0) {
      const wanted = meta.sex === 1 ? 'male' : 'female';
      if (wanted !== known) continue;
    }
    const items: TitleGapItem[] = meta.need.map(([label, need]) => {
      const have = currentValue(label, stats);
      return {
        label,
        need,
        have,
        diff: have === null ? null : Math.max(0, Math.ceil(need - have)),
      };
    });
    scored.push({
      id: Number(id),
      rank: meta.rank ?? 0,
      items,
      unmet: items.filter((item) => item.diff === null || item.diff > 0).length,
      total: items.reduce((sum, item) => sum + (item.diff ?? 0), 0),
    });
  }

  if (scored.length === 0) return null;
  scored.sort((a, b) => a.unmet - b.unmet || a.total - b.total || a.id - b.id);
  const best = scored[0];
  return {
    id: best.id,
    name: names[String(best.id)] ?? '',
    rank: best.rank,
    items: best.items,
    ready: best.items.every((item) => item.diff === 0),
  };
}
