import { ATTRS, starGender, type CaseTables, type ParseResult } from './caseParser';
import { artistCertificates } from './caseCertificates';
import { certsForName, normaliseStatName, parseTarget } from './specials';
import type { ArtistStats } from './caseParser';
import type { SpecialNotice, SpecialRow, SpecialsData } from '../types/specials';

export type LiveConditionState = 'met' | 'unmet' | 'manual';

export interface LiveCondition {
  row: SpecialRow;
  state: LiveConditionState;
  detail: string;
  byArtist: Record<number, boolean>;
  /** 每位艺人自己的数值详情，供艺人匹配的 hover 逐项显示缺口。 */
  detailByArtist: Record<number, string>;
  /** 未达标时带差值的文案（如「演技 差 42.4（457.6/500）」）。 */
  gapByArtist: Record<number, string>;
  byGroup: Record<number, boolean>;
}

export interface ItemCheck {
  name: string;
  gameName: string;
  have: number;
  met: boolean;
  /** 条件表里写了「（可选）」的道具：有就打钩，没有也不影响达标。 */
  optional: boolean;
}

export interface SlotGap {
  label: string;
  met: number;
  total: number;
  /** 未达标项的具体差值；达标项不计入。 */
  gaps: string[];
}

export interface ArtistMatch {
  id: number;
  name: string;
  met: number;
  total: number;
  gaps: string[];
  /** 按通告坑位拆开的缺口，hover 时分别显示男主角 / 男配角差多少。 */
  slots: SlotGap[];
}

export interface GroupMatch {
  code: number;
  name: string;
  met: number;
  total: number;
  gaps: string[];
}

export type LiveNoticeStatus = 'done' | 'close' | 'progress' | 'none' | 'manual';

export interface LiveNotice {
  notice: SpecialNotice;
  /** note 行里 id 带 `.node.` 的关键事件节点，按表里顺序展示。 */
  nodes: SpecialRow[];
  conditions: LiveCondition[];
  items: ItemCheck[];
  matches: ArtistMatch[];
  groups: GroupMatch[];
  met: number;
  total: number;
  manual: number;
  status: LiveNoticeStatus;
}

export interface LiveSpecialsReport {
  notices: LiveNotice[];
  doneCount: number;
}

/** TSV 里的简体名 → 游戏 Item.dat 的繁体名。取当前持有数，不计已消耗。 */
const ITEM_ALIASES: Record<string, string> = {
  大侠金牌: '大俠金牌',
  魅影: '魅影',
  魔咒: '魔咒',
  狐眼: '狐眼',
  圣约翰的千年十字架: '千年聖約翰十字架',
  人鱼的眼泪: '人魚的眼淚',
  天使的羽翼: '天使的羽翼',
  精灵的祈祷: '精靈的祈禱',
  光丝布料: '光絲布料',
  天使的音乐盒: '天使的音樂盒',
  天使羽衣: '天使羽衣',
  昆仑仙境软体: '崑崙仙境',
  真虹羽纱: '真虹紗羽',
  九尾狐皮裳: '九尾狐皮裳',
  如意金箍棒: '如意金箍棒',
  龙尾散: '龍尾散',
};

interface EvalContext {
  result: ParseResult;
  tables: CaseTables;
  signed: ArtistStats[];
  signedIds: Set<number>;
  certs: Map<number, string[]>;
}

function cleanName(name: string): { label: string; optional: boolean } {
  return {
    label: name.replace(/[（(]可选[）)]/g, '').trim(),
    optional: /[（(]可选[）)]/.test(name),
  };
}

/** 范围条件按区间上限判定：500~550 要 550 才算达标（用户定稿）。 */
function targetOf(row: SpecialRow): number {
  const parsed = parseTarget(row.target);
  if (!parsed) return 1;
  if (parsed.kind === 'multi') return parsed.values[0] ?? 1;
  return parsed.kind === 'range' ? parsed.max : parsed.min;
}

function multiAttrs(name: string): string[] | null {
  const match = /[（(]([^）)]*\/[^）)]*)[）)]/.exec(name);
  if (!match) return null;
  const attrs = match[1].split('/').map((item) => item.trim());
  return attrs.length > 1 ? attrs : null;
}

function abilityValue(artist: ArtistStats, name: string): number | null {
  if (name === '人气') return artist.social[3] ?? 0;
  const index = ATTRS.indexOf(name as (typeof ATTRS)[number]);
  return index >= 0 ? artist.abilities[index] ?? 0 : null;
}

function largeConcert(artist: ArtistStats, ctx: EvalContext): boolean {
  return ctx.result.events.some((event) =>
    event.artistId === artist.roleId && event.kind === 63 && event.scale === 1 && !event.group);
}

function shortGap(value: number): string {
  return String(Number(value.toFixed(1)));
}

function statGap(label: string, have: number, min: number): string {
  return `${label} 差 ${shortGap(min - have)}（${have}/${min}）`;
}

/** artist-scope rows we can read from a .sa2. Everything else stays manual. */
function evaluateArtistRow(
  row: SpecialRow,
  artist: ArtistStats,
  ctx: EvalContext,
): { met: boolean; detail: string; gap: string } | null {
  const min = targetOf(row);
  if (row.type === 'stat') {
    const parsed = parseTarget(row.target);
    const attrs = multiAttrs(row.name);
    if (attrs && parsed?.kind === 'multi' && attrs.length === parsed.values.length) {
      const gaps: string[] = [];
      const details: string[] = [];
      attrs.forEach((attr, index) => {
        const have = abilityValue(artist, attr) ?? 0;
        details.push(`${attr} ${have}/${parsed.values[index]}`);
        if (have < parsed.values[index]) gaps.push(statGap(attr, have, parsed.values[index]));
      });
      return gaps.length
        ? { met: false, detail: details.join(' · '), gap: gaps.join(' · ') }
        : { met: true, detail: details.join(' · '), gap: '' };
    }
    const attr = normaliseStatName(row.name);
    const have = attr === null ? null : abilityValue(artist, attr);
    if (have === null || attr === null) return null;
    return {
      met: have >= min,
      detail: `${attr} ${have}/${min}`,
      gap: have < min ? statGap(attr, have, min) : '',
    };
  }
  if (row.type === 'count' && row.name.includes('唱片')) {
    const have = artist.noticeCounts[2] ?? 0;
    return {
      met: have >= min,
      detail: `唱片 ${have}/${min}`,
      gap: have < min ? statGap('唱片', have, min) : '',
    };
  }
  if (row.type === 'cert') {
    const needed = certsForName(row.name);
    if (!needed.length) return null;
    const held = ctx.certs.get(artist.roleId) ?? [];
    const missing = needed.filter((cert) => !held.includes(cert));
    return {
      met: missing.length === 0,
      detail: missing.length ? `缺 ${missing.join('、')}` : needed.join('、'),
      gap: missing.length ? `缺 ${missing.join('、')}` : '',
    };
  }
  if (row.type === 'flag' && row.name.includes('大型个人演唱会')) {
    const met = largeConcert(artist, ctx);
    const detail = met ? '已办大型个人演唱会' : '未记录大型个人演唱会';
    return { met, detail, gap: met ? '' : detail };
  }
  return null;
}

function evaluateGlobalRow(row: SpecialRow, ctx: EvalContext): { met: boolean; detail: string } | null {
  const min = targetOf(row);
  if (row.type === 'count' && row.name.includes('出演电影')) {
    const have = ctx.signed.reduce((sum, artist) => sum + (artist.noticeCounts[1] ?? 0), 0);
    return { met: have >= min, detail: `旗下电影 ${have}/${min}` };
  }
  if (row.type === 'count' && row.name.includes('担任主角')) {
    const have = ctx.result.works.filter((work) =>
      work.noticeIndex === 1 && work.role.includes('主角') && ctx.signedIds.has(work.artistId)).length;
    return { met: have >= min, detail: `电影主角 ${have}/${min}` };
  }
  return null;
}

function evaluateGroupRow(
  row: SpecialRow,
  group: ParseResult['teams'][number],
  ctx: EvalContext,
): { met: boolean; detail: string } | null {
  const min = targetOf(row);
  if (row.type === 'count' && row.name.includes('唱片')) {
    const have = group.workCount ?? 0;
    return { met: have >= min, detail: `团体唱片 ${have}/${min}` };
  }
  if (row.type === 'cert') {
    const needed = certsForName(row.name);
    if (!needed.length || !group.memberIds.length) return null;
    const missing = group.memberIds.filter((id) => {
      const held = ctx.certs.get(id) ?? [];
      return needed.some((cert) => !held.includes(cert));
    });
    return {
      met: missing.length === 0,
      detail: missing.length ? `${missing.length} 位成员缺证书` : '全体成员已取得',
    };
  }
  return null;
}

function itemCheck(row: SpecialRow, ctx: EvalContext): ItemCheck {
  const { label, optional } = cleanName(row.name);
  const gameName = ITEM_ALIASES[label] ?? label;
  const have = ctx.result.items.find((item) => item.name === gameName)?.quantity ?? 0;
  return { name: label, gameName, have, met: have > 0, optional };
}

function artistDetail(
  ctx: EvalContext,
  byArtist: Record<number, boolean>,
  detailByArtist: Record<number, string>,
): string {
  const names = ctx.signed.filter((artist) => byArtist[artist.roleId]);
  if (names.length) return names.slice(0, 2).map((artist) => detailByArtist[artist.roleId]).join(' · ');
  if (!ctx.signed.length) return '存档没有已签约艺人';
  return ctx.signed.slice(0, 2).map((artist) => detailByArtist[artist.roleId]).join(' · ');
}

function evaluateRow(row: SpecialRow, ctx: EvalContext): LiveCondition {
  const blank: LiveCondition = {
    row,
    state: 'manual',
    detail: '存档读不到这一项',
    byArtist: {},
    detailByArtist: {},
    gapByArtist: {},
    byGroup: {},
  };

  if (row.type === 'item') {
    const check = itemCheck(row, ctx);
    return {
      ...blank,
      state: check.met ? 'met' : 'unmet',
      detail: check.met ? `${check.gameName} 持有 ${check.have}` : `${check.gameName} 未持有`,
    };
  }

  if (row.scope === 'artist') {
    const byArtist: Record<number, boolean> = {};
    const detailByArtist: Record<number, string> = {};
    const gapByArtist: Record<number, string> = {};
    let readable = false;
    for (const artist of ctx.signed) {
      const result = evaluateArtistRow(row, artist, ctx);
      if (!result) continue;
      readable = true;
      byArtist[artist.roleId] = result.met;
      detailByArtist[artist.roleId] = result.detail;
      gapByArtist[artist.roleId] = result.gap;
    }
    if (!readable) return blank;
    const met = ctx.signed.some((artist) => byArtist[artist.roleId]);
    return {
      ...blank,
      state: met ? 'met' : 'unmet',
      detail: artistDetail(ctx, byArtist, detailByArtist),
      byArtist,
      detailByArtist,
      gapByArtist,
      byGroup: {},
    };
  }

  if (row.scope === 'global') {
    const result = evaluateGlobalRow(row, ctx);
    if (!result) return blank;
    return { ...blank, state: result.met ? 'met' : 'unmet', detail: result.detail };
  }

  if (row.scope === 'group') {
    const byGroup: Record<number, boolean> = {};
    let readable = false;
    for (const group of ctx.result.teams) {
      const result = evaluateGroupRow(row, group, ctx);
      if (!result) continue;
      readable = true;
      byGroup[group.code] = result.met;
    }
    if (!readable) return blank;
    const met = ctx.result.teams.some((group) => byGroup[group.code]);
    return {
      ...blank,
      state: met ? 'met' : 'unmet',
      detail: ctx.result.teams.length
        ? `${ctx.result.teams.filter((group) => byGroup[group.code]).length} 个团体达标`
        : '存档没有我方团体',
      byGroup,
    };
  }

  return blank;
}

/** 笑傲天际只有男主角 / 男配角两个坑位，女艺人不能参与。性别只认游戏表。 */
const MALE_ONLY_NOTICES = new Set(['proud-of-the-world']);

const SLOT_LABELS: Record<string, string> = {
  main: '男主角',
  support: '男配角',
  'role:男主角': '男主角',
  'role:男配角': '男配角',
};

function slotLabel(slot: string, maleOnly: boolean): string {
  if (maleOnly) return SLOT_LABELS[slot] ?? (slot.startsWith('role:') ? slot.slice(5) : slot);
  return slot === 'main' ? '主角' : slot.startsWith('role:') ? slot.slice(5) : slot;
}

function statusOf(met: number, total: number, manual: number): LiveNoticeStatus {
  if (!total) return 'manual';
  if (met === total) return 'done';
  if (total - met === 1) return 'close';
  if (met > 0) return 'progress';
  return manual > 0 ? 'progress' : 'none';
}

export function evaluateLiveSpecials(
  data: SpecialsData,
  result: ParseResult,
  tables: CaseTables,
): LiveSpecialsReport {
  const signed = result.artists.filter((artist) => artist.signed);
  const ctx: EvalContext = {
    result,
    tables,
    signed,
    signedIds: new Set(signed.map((artist) => artist.roleId)),
    certs: artistCertificates(result.items, tables),
  };

  const notices = data.notices
    .filter((notice) => notice.id !== '_global')
    .map((notice): LiveNotice => {
      const rows = data.rows.filter((row) => row.notice === notice.id && row.kind === 'condition');
      const nodes = data.rows.filter((row) =>
        row.notice === notice.id && row.kind === 'note' && row.id.includes('.node.'));
      const conditions = rows.map((row) => evaluateRow(row, ctx));
      const readable = conditions.filter((condition) => condition.state !== 'manual');
      const met = readable.filter((condition) => condition.state === 'met').length;
      const manual = conditions.length - readable.length;

      const artistRows = readable.filter((condition) => Object.keys(condition.byArtist).length > 0);
      const maleOnly = MALE_ONLY_NOTICES.has(notice.id);
      const candidates = maleOnly
        ? signed.filter((artist) => starGender(artist.roleId, tables.stars) === 'male')
        : signed;

      const slotOf = (condition: LiveCondition): string =>
        condition.row.slot && condition.row.slot !== '-' ? condition.row.slot : 'main';
      const bySlot = new Map<string, LiveCondition[]>();
      for (const condition of artistRows) {
        const slot = slotOf(condition);
        bySlot.set(slot, [...(bySlot.get(slot) ?? []), condition]);
      }

      // 笑傲天际是男主角专属的特殊通告：达标数只按男主角 4 项算，
      // 男配角那组只在 hover 里看差值，不参与绿勾与进度分母。
      const qualifyingRows = maleOnly
        ? artistRows.filter((condition) => slotOf(condition) === 'main')
        : artistRows;

      const matches = candidates.map((artist): ArtistMatch => {
        const gaps = qualifyingRows
          .filter((condition) => !condition.byArtist[artist.roleId])
          .map((condition) => condition.row.name);
        const slots: SlotGap[] = [...bySlot].map(([slot, rows]) => ({
          label: slotLabel(slot, maleOnly),
          met: rows.filter((condition) => condition.byArtist[artist.roleId]).length,
          total: rows.length,
          gaps: rows
            .filter((condition) => !condition.byArtist[artist.roleId])
            .map((condition) =>
              condition.gapByArtist[artist.roleId]
              || condition.detailByArtist[artist.roleId]
              || condition.row.name),
        }));
        return {
          id: artist.roleId,
          name: result.artistDirectory.find((option) => option.id === artist.roleId)?.name ?? String(artist.roleId),
          met: qualifyingRows.length - gaps.length,
          total: qualifyingRows.length,
          gaps,
          slots,
        };
      }).filter((match) => match.total > 0)
        .sort((a, b) => b.met - a.met || a.gaps.length - b.gaps.length);

      const groupRows = readable.filter((condition) => Object.keys(condition.byGroup).length > 0);
      const groups = result.teams.map((group): GroupMatch => {
        const gaps = groupRows
          .filter((condition) => !condition.byGroup[group.code])
          .map((condition) => condition.row.name);
        return {
          code: group.code,
          name: group.name,
          met: groupRows.length - gaps.length,
          total: groupRows.length,
          gaps,
        };
      }).filter((match) => match.total > 0)
        .sort((a, b) => b.met - a.met || a.gaps.length - b.gaps.length);

      return {
        notice,
        nodes,
        conditions,
        items: conditions
          .filter((condition) => condition.row.type === 'item')
          .map((condition) => itemCheck(condition.row, ctx)),
        matches,
        groups,
        met,
        total: readable.length,
        manual,
        status: statusOf(met, readable.length, manual),
      };
    });

  return {
    notices,
    doneCount: notices.filter((notice) => notice.status === 'done').length,
  };
}

export const LIVE_STATUS_LABELS: Record<LiveNoticeStatus, string> = {
  done: '存档条件已达成',
  close: '差 1 项',
  progress: '推进中',
  none: '未开始',
  manual: '待手工确认',
};
