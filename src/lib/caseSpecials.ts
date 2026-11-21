import { ATTRS, starGender, type CaseTables, type ParseResult } from './caseParser';
import { artistCertificates, certificateGuide, type CertificateGuide } from './caseCertificates';
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
  /** 条件表的 hint：道具获得方法，hover 时显示。 */
  hint: string;
}

export interface SlotGap {
  label: string;
  met: number;
  total: number;
  /** 未达标项的具体差值；达标项不计入。 */
  gaps: string[];
}

export interface CertMatchStat {
  name: string;
  min: number;
  have: number;
}

export interface CertMatchGuide extends Omit<CertificateGuide, 'attrs'> {
  stats: CertMatchStat[];
}

export interface CertMatch {
  name: string;
  /** 只有存档里真的持有证书才为 true；属性达标但没有证书不打勾。 */
  met: boolean;
  detail: string;
  guides: CertMatchGuide[];
}

export interface ArtistMatch {
  id: number;
  name: string;
  met: number;
  total: number;
  gaps: string[];
  /** 按通告坑位拆开的缺口，hover 时分别显示男主角 / 男配角差多少。 */
  slots: SlotGap[];
  /** 该艺人的证书判定：有证书才打绿勾，hover 显示学院课程与属性对比。 */
  certs: CertMatch[];
  /** 硬性前置数值判定（如电影主角 1 次、电影 2 部），进达标分母。 */
  required: { name: string; met: boolean; detail: string }[];
  /** 触发前置的可选数值判定（男/女按性别各认自己那组），不进达标分母。 */
  optional: { name: string; met: boolean; detail: string }[];
}

export interface GroupMatch {
  code: number;
  name: string;
  met: number;
  total: number;
  gaps: string[];
}

export type LiveNoticeStatus = 'done' | 'close' | 'progress' | 'none' | 'manual';

/** 存档作品清单里已经拍完的六大通告：谁 / 什么时候 / 什么角色。 */
export interface FilmedRecord {
  date: string;
  name: string;
  role: string;
  workCode: string;
  workName: string;
  /** 该艺人是否为存档里的签约艺人，用于名字加粗。 */
  own: boolean;
}

export interface LiveNotice {
  notice: SpecialNotice;
  /** 按精确作品编码从存档作品清单里认出的已完成记录。 */
  filmed: FilmedRecord[];
  /** note 行里 id 带 `.node.` 的关键事件节点，按表里顺序展示。 */
  nodes: SpecialRow[];
  /** 事件驱动通告：标题行不显示数值进度条，改写「按事件节点推进」。 */
  eventDriven: boolean;
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

/** 存档证书用短名（戏剧/音乐/舞蹈），条件表用全名（戏剧证书/…）。统一成短名再比。 */
function certKey(name: string): string {
  return name.replace(/证书$/, '');
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
  if (row.type === 'count' && row.name.includes('电影主角')) {
    const have = ctx.result.works.filter((work) =>
      work.noticeIndex === 1 && work.role.includes('主角') && work.artistId === artist.roleId).length;
    return {
      met: have >= min,
      detail: `电影主角 ${have}/${min}`,
      gap: have < min ? statGap('电影主角', have, min) : '',
    };
  }
  if (row.type === 'count' && (row.name.includes('唱片') || row.name.includes('电影'))) {
    const isFilm = row.name.includes('电影');
    const label = isFilm ? '电影' : '唱片';
    const have = artist.noticeCounts[isFilm ? 1 : 2] ?? 0;
    return {
      met: have >= min,
      detail: `${label} ${have}/${min}`,
      gap: have < min ? statGap(label, have, min) : '',
    };
  }
  if (row.type === 'cert') {
    const needed = certsForName(row.name);
    if (!needed.length) return null;
    const held = (ctx.certs.get(artist.roleId) ?? []).map(certKey);
    const missing = needed.filter((cert) => !held.includes(certKey(cert)));
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
  return { name: label, gameName, have, met: have > 0, optional, hint: row.hint };
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

/** 六大特殊通告的成品编码。只认精确编码，不用 6xx 前缀泛判。 */
const SPECIAL_WORK_CODES: Record<string, string> = {
  'proud-of-the-world': 'MV601',
  'doomsday-warrior': 'MV602',
  'kunlun-adventure': 'MV603',
  'eternal-love': 'CD603',
  angel: 'CD604',
  galaxy: 'CD602',
};

function artistNameOf(id: number, ctx: EvalContext): string {
  return ctx.result.artistDirectory.find((option) => option.id === id)?.name
    ?? ctx.tables.stars?.[String(id)]?.[0]
    ?? `编号${id}`;
}

function filmedRecords(noticeId: string, ctx: EvalContext): FilmedRecord[] {
  const code = SPECIAL_WORK_CODES[noticeId];
  if (!code) return [];

  const groupRows = ctx.result.groupWorks
    .filter((work) => work.workCode === code)
    .map((work): FilmedRecord => ({
      date: work.date,
      name: ctx.result.teams.find((team) => team.memberIds.includes(work.artistId))?.name
        ?? artistNameOf(work.artistId, ctx),
      role: '',
      workCode: work.workCode,
      workName: work.workName,
      own: false,
    }));

  const personalRows = ctx.result.works
    .filter((work) => work.workCode === code)
    .map((work): FilmedRecord => ({
      date: work.date,
      name: artistNameOf(work.artistId, ctx),
      role: work.role,
      workCode: work.workCode,
      workName: work.workName,
      own: ctx.signedIds.has(work.artistId),
    }));

  const unique = new Map<string, FilmedRecord>();
  for (const record of [...groupRows, ...personalRows]) {
    unique.set(`${record.name}|${record.date}|${record.role}`, record);
  }
  return [...unique.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );
}

/** 男艺人专属通告：笑傲天际（男主角 / 男配角，只按男主角计分）、
 *  万年之恋（只有男主角坑）。末日战士按性别分坑（男主角给男艺人、女主角给女艺人）。
 *  性别只认游戏表。 */
const MALE_ONLY_NOTICES = new Set(['proud-of-the-world', 'eternal-love']);
/** key = 通告 id，value = [男艺人坑位, 女艺人坑位]。每位艺人只认自己性别那一项。 */
const GENDER_SLOT_NOTICES: Record<string, [string, string]> = {
  'doomsday-warrior': ['main', 'support'],
};
/** 事件驱动通告：走事件节点，不按数值条件显示进度条。 */
const EVENT_DRIVEN_NOTICES = new Set(['proud-of-the-world', 'doomsday-warrior', 'eternal-love']);

const SLOT_LABELS: Record<string, string> = {
  main: '男主角',
  support: '男配角',
  'role:男主角': '男主角',
  'role:男配角': '男配角',
};

function slotLabel(slot: string, notice: SpecialNotice): string {
  if (MALE_ONLY_NOTICES.has(notice.id)) {
    return SLOT_LABELS[slot] ?? (slot.startsWith('role:') ? slot.slice(5) : slot);
  }
  const pair = GENDER_SLOT_NOTICES[notice.id];
  if (pair) {
    return slot === pair[0] ? '男主角' : slot === pair[1] ? '女主角'
      : slot.startsWith('role:') ? slot.slice(5) : slot;
  }
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
      // 带「（可选）」的艺人数值行只做判定展示，不进达标分母。
      const optionalRows = conditions.filter((condition) =>
        condition.row.scope === 'artist' && cleanName(condition.row.name).optional);
      const readable = conditions.filter((condition) =>
        condition.state !== 'manual' && !optionalRows.includes(condition));
      const met = readable.filter((condition) => condition.state === 'met').length;
      const manual = conditions.filter((condition) => condition.state === 'manual').length;

      const allArtistRows = readable.filter((condition) => Object.keys(condition.byArtist).length > 0);
      const maleOnly = MALE_ONLY_NOTICES.has(notice.id);
      const genderSlots = GENDER_SLOT_NOTICES[notice.id];
      // 男女分坑通告：坑位匹配只算真正贴在角色上的数值行（phase=notice）。
      // 甄选阶段的证书前置（phase=prepare）仍留在总条件里，但不混进男女两坑的 4 项对比。
      const artistRows = genderSlots
        ? allArtistRows.filter((condition) => condition.row.phase === 'notice')
        : allArtistRows;
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

      // 笑傲天际是男主角专属通告：只按男主角 4 项计分，男配角只在 hover 看差值。
      // 末日战士男女分坑：男艺人只认男主角、女艺人只认女主角，各自按自己坑位计分。
      const qualifyingRowsOf = (artist: ArtistStats): LiveCondition[] => {
        if (maleOnly) return artistRows.filter((condition) => slotOf(condition) === 'main');
        if (genderSlots) {
          const gender = starGender(artist.roleId, tables.stars);
          const slot = gender === 'female' ? genderSlots[1] : genderSlots[0];
          return bySlot.get(slot) ?? [];
        }
        return artistRows;
      };
      // hover 里列哪些坑位的差值：笑傲天际把男主角/男配角两坑都列出来对照；
      // 末日战士男女互斥，只列该艺人性别对应的那一个坑。
      const visibleSlotsOf = (artist: ArtistStats): [string, LiveCondition[]][] => {
        if (maleOnly) return [...bySlot];
        if (genderSlots) {
          const gender = starGender(artist.roleId, tables.stars);
          const slot = gender === 'female' ? genderSlots[1] : genderSlots[0];
          return [[slot, bySlot.get(slot) ?? []]];
        }
        return [...bySlot];
      };

      const certRows = readable.filter((condition) => condition.row.type === 'cert');

      const matches = candidates.map((artist): ArtistMatch => {
        const qualifyingRows = qualifyingRowsOf(artist);
        const gaps = qualifyingRows
          .filter((condition) => !condition.byArtist[artist.roleId])
          .map((condition) => condition.row.name);
        const slots: SlotGap[] = visibleSlotsOf(artist).map(([slot, rows]) => ({
          label: slotLabel(slot, notice),
          met: rows.filter((condition) => condition.byArtist[artist.roleId]).length,
          total: rows.length,
          gaps: rows
            .filter((condition) => !condition.byArtist[artist.roleId])
            .map((condition) =>
              condition.gapByArtist[artist.roleId]
              || condition.detailByArtist[artist.roleId]
              || condition.row.name),
        }));
        const heldCerts = ctx.certs.get(artist.roleId) ?? [];
        const certs: CertMatch[] = certRows
          .flatMap((condition) => {
            const held = heldCerts.map(certKey);
            return certsForName(condition.row.name).map((name) => {
              const met = held.includes(certKey(name));
              const guide = certificateGuide(name);
              return {
                name,
                met,
                detail: met ? name : `缺 ${name}`,
                guides: guide ? [{
                  cert: guide.cert,
                  title: guide.title,
                  academy: guide.academy,
                  courses: guide.courses,
                  stats: guide.attrs.map((attr) => ({
                    name: attr.name,
                    min: attr.min,
                    have: abilityValue(artist, attr.name) ?? 0,
                  })),
                }] : [],
              };
            });
          })
          .filter((cert, index, all) => all.findIndex((item) => item.name === cert.name) === index);
        // 硬性前置：phase=prepare 的艺人数值行（电影主角 / 电影作品数），每位艺人各判一次。
        const required = conditions
          .filter((condition) => condition.row.phase === 'prepare'
            && condition.row.type === 'count'
            && !cleanName(condition.row.name).optional
            && !optionalRows.includes(condition)
            && condition.byArtist[artist.roleId] !== undefined)
          .map((condition) => ({
            name: condition.row.name,
            met: !!condition.byArtist[artist.roleId],
            detail: condition.detailByArtist[artist.roleId] ?? '',
          }));
        // 可选前置按性别认自己那组：男艺人看 main、女艺人看 support。
        const gender = starGender(artist.roleId, tables.stars);
        const optionalSlot = genderSlots
          ? gender === 'female' ? genderSlots[1] : genderSlots[0]
          : 'main';
        const optional = optionalRows
          .filter((condition) => slotOf(condition) === optionalSlot)
          .map((condition) => ({
            name: cleanName(condition.row.name).label,
            met: !!condition.byArtist[artist.roleId],
            detail: condition.detailByArtist[artist.roleId] ?? '',
          }));
        return {
          id: artist.roleId,
          name: result.artistDirectory.find((option) => option.id === artist.roleId)?.name ?? String(artist.roleId),
          met: qualifyingRows.length - gaps.length,
          total: qualifyingRows.length,
          gaps,
          slots,
          certs,
          required,
          optional,
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
        filmed: filmedRecords(notice.id, ctx),
        nodes,
        eventDriven: EVENT_DRIVEN_NOTICES.has(notice.id),
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
    doneCount: notices.filter((notice) => notice.filmed.length > 0).length,
  };
}

export const LIVE_STATUS_LABELS: Record<LiveNoticeStatus, string> = {
  done: '存档条件已达成',
  close: '差 1 项',
  progress: '推进中',
  none: '未开始',
  manual: '待手工确认',
};
