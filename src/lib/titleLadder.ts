import type { TitleMeta } from './caseParser';

/** 一个门槛项：当前值读不到时 have 为 null（只影响显示，不影响达成判断）。 */
export interface TitleGapItem {
  label: string;
  need: number;
  have: number | null;
  /** 还差多少，已达标为 0；算不出来是 null。 */
  diff: number | null;
}

/** 一种达成方式里的作品条件（彼此是「并」）。 */
export interface TitleBranch {
  /** 这一支要满足的作品门槛；共同门槛在 TitleNext.shared 里，只写一次。 */
  items: TitleGapItem[];
  /** 这一支的作品门槛是否都已达标。 */
  ready: boolean;
}

export interface TitleNext {
  id: number;
  name: string;
  rank: number;
  /** 每一条分支都要满足的属性 / 社交门槛。 */
  shared: TitleGapItem[];
  /** 作品条件的几种达成方式，彼此是「或」；只有一种时长度为 1。 */
  branches: TitleBranch[];
  /** 共同门槛 + 任意一条分支都达成。 */
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

/** 作品门槛用的名字就是游戏「通告统计」那五个，与 NOTICE_COUNT_LABELS 同序。 */
const WORKS_INDEX: Record<string, number> = {
  电视作品: 0, 电影作品: 1, 专辑: 2, 广告: 3, 节目: 4,
};

/** 门槛里属于「作品」的项 —— 同一个称号的不同作品组合之间是「或」的关系。 */
const WORKS_LABELS = new Set(['电视作品', '电影作品', '专辑', '广告', '节目', '作品总数']);

type Need = [string, number];

interface TitleStats {
  abilities: number[];
  social: number[];
  /** 五个已完成作品数；缺了就算不出作品类门槛。 */
  noticeCounts?: number[];
}

function currentValue(label: string, stats: TitleStats): number | null {
  const ability = ABILITY_INDEX[label];
  if (ability !== undefined) return stats.abilities[ability] ?? null;
  const social = SOCIAL_INDEX[label];
  if (social !== undefined) return stats.social[social] ?? null;
  // 作品类门槛直接读游戏自己统计的那五个数：它就是「通告统计」界面上
  // 显示的值，含入司前的履历、不含在拍的通告。
  const works = WORKS_INDEX[label];
  if (works !== undefined) return stats.noticeCounts?.[works] ?? null;
  // 作品总数 = 上面五项相加。
  if (label === '作品总数') {
    const counts = stats.noticeCounts;
    return counts ? counts.slice(0, 5).reduce((sum, n) => sum + n, 0) : null;
  }
  return null;
}

function gapItems(need: Need[], stats: TitleStats): TitleGapItem[] {
  return need.map(([label, value]) => {
    const have = currentValue(label, stats);
    return {
      label,
      need: value,
      have,
      diff: have === null ? null : Math.max(0, Math.ceil(value - have)),
    };
  });
}

const allReady = (items: TitleGapItem[]) => items.every((item) => item.diff === 0);

/** 缺口合计，用来挑「最接近达成」的那条；算不出来的项按最远处理。 */
const sumGap = (items: TitleGapItem[]) =>
  items.reduce((sum, item) => sum + (item.diff ?? 999), 0);

const sameNeed = (a: Need[], b: Need[]) =>
  a.length === b.length && a.every(([label, value], i) => b[i][0] === label && b[i][1] === value);

/**
 * 当前称号的下一档。
 *
 * 称号表本身只给门槛、不给档位，档位来自 `build_case_tables.py` 里人工排的
 * 梯子（`TITLE_LADDERS`），所以这里只做减法，不猜顺序。
 *
 * 同一档常常有几种拿法：`实力派演员` 是「电视 5 部」或「电影 5 部」或
 * 「电视 3 部 + 电影 3 部」，属性门槛三者相同。所以先按**称号名**归组：
 * 同名的合并成一个目标，共同的属性 / 社交门槛提出来只写一次，作品门槛各占
 * 一支「或」；不同名的是并列的另一个称号（电视演员 / 电影演员），分开算，
 * 最后按「已达成 → 缺口最小」挑一个推荐。
 */
export function nextTitle(
  catalog: Record<string, TitleMeta>,
  names: Record<string, string>,
  currentId: number,
  stats: TitleStats,
  gender?: string,
): TitleNext | null {
  const current = catalog[String(currentId)];
  if (!current || current.rank === null || current.rank === undefined) return null;
  // 目录里第三位是 'any'（性别不固定），这时不做性别过滤。
  const known = gender === 'male' || gender === 'female' ? gender : undefined;

  const groups = new Map<string, { id: number; metas: TitleMeta[] }>();
  for (const [id, meta] of Object.entries(catalog)) {
    if (meta.line !== current.line || meta.rank !== current.rank + 1) continue;
    if (known && meta.sex >= 0) {
      const wanted = meta.sex === 1 ? 'male' : 'female';
      if (wanted !== known) continue;
    }
    const name = names[id] ?? '';
    const group = groups.get(name) ?? { id: Number(id), metas: [] };
    group.metas.push(meta);
    groups.set(name, group);
  }
  if (groups.size === 0) return null;

  const built = [...groups].map(([name, group]) => {
    const sharedNeed = group.metas[0].need.filter(([label]) => !WORKS_LABELS.has(label));
    // 同名分支的门槛结构不一定相同（万一不同），那时不敢拆，整条当一支算。
    const splittable = group.metas.every((meta) =>
      sameNeed(meta.need.filter(([label]) => !WORKS_LABELS.has(label)), sharedNeed));
    const shared = gapItems(splittable ? sharedNeed : [], stats);
    const branches: TitleBranch[] = group.metas.map((meta) => {
      const items = gapItems(
        splittable ? meta.need.filter(([label]) => WORKS_LABELS.has(label)) : meta.need,
        stats,
      );
      return { items, ready: allReady(items) };
    });
    return {
      id: group.id,
      name,
      rank: group.metas[0].rank ?? 0,
      shared,
      branches,
      ready: allReady(shared) && branches.some((branch) => branch.ready),
      // 共同缺口 + 最接近那一支的缺口，越小越该推荐。
      gap: sumGap(shared) + Math.min(...branches.map((branch) => sumGap(branch.items))),
    };
  });

  built.sort((a, b) => Number(b.ready) - Number(a.ready) || a.gap - b.gap || a.id - b.id);
  const best = built[0];
  return {
    id: best.id,
    name: best.name,
    rank: best.rank,
    shared: best.shared,
    branches: best.branches,
    ready: best.ready,
  };
}
