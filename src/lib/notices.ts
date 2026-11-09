import type { GradeRow, Notice, NoticeData, NoticeRole } from '../types/notices';

/** 角色表里的名字和「能力要求」表里的征求对象并不完全一致：电影/电视剧按男女
 *  拆成男主角/女配角，广告按性别拆成男性/女性，唱片和主持则没有角色维度。
 *  这里把它们归一到参照表的键上。 */
export function gradeRole(cat: Notice['cat'], roleName: string): string {
  if (cat === 'movie' || cat === 'tv') {
    if (roleName.includes('主角')) return '主角';
    if (roleName.includes('配角')) return '配角';
    return roleName;
  }
  if (cat === 'ad' || cat === 'music') return '';
  return roleName;
}

export function findGrade(
  data: NoticeData,
  notice: Notice,
  role: NoticeRole,
): GradeRow | undefined {
  const type = notice.type ?? notice.level ?? '';
  const key = gradeRole(notice.cat, role.name);
  return (
    data.grades.find((row) => row.type === type && row.role === key) ??
    data.grades.find((row) => row.type === type && !row.role)
  );
}

/** 难度 1.0–5.0 取整成星数；表里偶尔出现的空值当 1 星处理。 */
export function starsOf(role: NoticeRole): number {
  const raw = role.difficulty ?? 1;
  return Math.min(5, Math.max(1, Math.round(raw)));
}

/** 原表「说明」里对独家代理的解释，用作徽标的悬浮提示。 */
export const EXCLUSIVE_HINT = '一年内不能接其它厂家的同类型广告';

export interface RequirementRow {
  ability: string;
  grade: string;
  range: string;
}

/** 角色在自身难度下，每项能力需要落在哪个区间。数值来自「难度对照表」，
 *  组合方式是 等级字母 × 星数，和游戏内的随机要求一致。 */
export function requirementsFor(
  data: NoticeData,
  notice: Notice,
  role: NoticeRole,
): RequirementRow[] {
  const gradeRow = findGrade(data, notice, role);
  const scale = data.scale.find((row) => row.stars === starsOf(role));
  if (!gradeRow || !scale) return [];
  const rows: RequirementRow[] = [];
  for (const ability of data.abilities) {
    const grade = gradeRow.grades[ability];
    if (!grade) continue;
    rows.push({ ability, grade, range: scale.ranges[grade] ?? '—' });
  }
  return rows;
}

export interface SpecialDelta {
  label: string;
  value: number;
}

export interface SpecialNote {
  kind: string;
  /** 每天对亲和／叛逆／性感的增减；表里没给数值的（例如「吻戏」）为空数组。 */
  deltas: SpecialDelta[];
}

const TONE_FIELDS: { key: 'affinity' | 'rebellion' | 'sexy'; label: string }[] = [
  { key: 'affinity', label: '亲和' },
  { key: 'rebellion', label: '叛逆' },
  { key: 'sexy', label: '性感' },
];

/** 「搞笑」这类特殊要求每天对三项属性造成的增减；和「能力影响」一样按天结算。 */
export function specialNotes(data: NoticeData, role: NoticeRole): SpecialNote[] {
  return (role.specialKinds ?? []).map((kind) => {
    const effect = data.specialEffects.find((item) => item.kind === kind);
    const deltas = TONE_FIELDS.flatMap(({ key, label }) => {
      const value = effect?.[key];
      return value === undefined ? [] : [{ label, value }];
    });
    return { kind, deltas };
  });
}

/** 角色自带的数值门槛，例如「亲和 ≥ 550」。 */
export function thresholdsFor(role: NoticeRole): { label: string; value: number }[] {
  const special = role.special;
  if (!special) return [];
  return TONE_FIELDS.flatMap(({ key, label }) => {
    const value = special[key];
    return value === undefined ? [] : [{ label, value }];
  });
}

/** 每日能力影响：角色表里写了就用它的，否则回落到参照表按类型给的数值。 */
export function gainsFor(
  data: NoticeData,
  notice: Notice,
  role: NoticeRole,
): Record<string, number> {
  if (role.gains && Object.keys(role.gains).length > 0) return role.gains;
  return findGrade(data, notice, role)?.gains ?? {};
}

export function difficultyRange(notice: Notice): [number, number] | null {
  const values = (notice.roles ?? []).map(starsOf);
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

const searchCache = new WeakMap<Notice, string>();

/** 搜索用的扁平文本：名称、编号、类型、制作人、公司、简介、角色名与默认艺人。 */
export function searchText(notice: Notice): string {
  const cached = searchCache.get(notice);
  if (cached) return cached;
  const roles = notice.roles ?? [];
  const text = [
    notice.id,
    notice.name,
    notice.type,
    notice.level,
    notice.kindLabel,
    notice.adType,
    notice.series,
    notice.producer,
    notice.company,
    notice.brief,
    ...roles.map((role) => role.name),
    ...roles.map((role) => role.defaultArtist ?? ''),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  searchCache.set(notice, text);
  return text;
}

export interface NoticeFilter {
  cat: Notice['cat'] | 'all';
  time: string | 'all';
  stars: number | 'all';
  company: string | 'all';
  query: string;
}

export function filterNotices(notices: Notice[], filter: NoticeFilter): Notice[] {
  const needle = filter.query.trim().toLowerCase();
  return notices.filter((notice) => {
    if (filter.cat !== 'all' && notice.cat !== filter.cat) return false;
    if (filter.time !== 'all' && notice.time !== filter.time) return false;
    if (filter.company !== 'all' && notice.company !== filter.company) return false;
    if (filter.stars !== 'all') {
      const range = difficultyRange(notice);
      if (!range || filter.stars < range[0] || filter.stars > range[1]) return false;
    }
    if (needle && !searchText(notice).includes(needle)) return false;
    return true;
  });
}

export function companiesOf(notices: Notice[]): string[] {
  const seen = new Set<string>();
  for (const notice of notices) if (notice.company) seen.add(notice.company);
  return [...seen];
}
