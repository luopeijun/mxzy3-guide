/** Reads the current notices and their rolled ability thresholds from a
 *  Stardom 3 (Traditional Chinese 3-in-1) *.sa2 save file.
 *
 *  Everything happens in the browser on the uploaded ArrayBuffer: no upload to
 *  a server, no network request beyond the bundled static tables. The game
 *  keeps only ranges in data/Difficulty.tab; the concrete thresholds rolled for
 *  this playthrough live in the save's `Case` block, one 192-byte record per
 *  role. `CaseFirm` lists the notices registered for the current period.
 *
 *  Layout mirrors scripts/build_case_tables.py and the standalone
 *  parse_case_values.py probe; keep the offsets in sync when either changes.
 */

export const ATTRS = ['演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信'] as const;
/** 通告统计 in the game's own order (see the save editor's 通告統計 panel). */
export const NOTICE_COUNT_LABELS = ['电视', '电影', '唱片', '广告', '主持'] as const;
const GRADES = ['', 'A', 'B', 'C', 'D'];
const WEEKDAYS = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** The two-letter code prefix is the notice category; no static table needed. */
export const CATEGORY_BY_PREFIX: Record<string, string> = {
  CD: '唱片', CF: '广告', MV: '电影', TV: '电视剧', SH: '主持',
  FS: '时装', TH: '舞台剧', SP: '特别',
};

export function categoryOf(code: string): string {
  return CATEGORY_BY_PREFIX[code.slice(0, 2)] ?? '其他';
}

/** Length 表用的通告种类。电视剧/主持的 subtype 本身就是种类，唱片则要把
 *  個人/團體/原聲帶 归到「唱片」这一行，所以按前缀补一层。 */
const KIND_BY_PREFIX: Record<string, string> = {
  CD: '唱片', CF: '廣告', MV: '電影', TV: '', SH: '',
};

/** 已被其他艺人预约的角色（角色码 -> 艺人名）。
 *
 *  这一列回答的是「这个角色已被谁占掉，所以我接不了」。**只能来自存档**，
 *  不能凭印象硬填：角色记录本身只保存通告的角色定义（同一张通告在两个
 *  存档里逐字节相同），预约关系记在艺人的行程上，目前还没有解出可用的
 *  字段，所以这里保持为空 —— 读不到就不显示，宁缺勿错。 */
export const RESERVED_ROLES: Record<string, string> = {};

/** A role may be gender-restricted (男主角 / 女性 …) or open to anyone. */
export type Gender = 'female' | 'male' | 'any';

/** Role names carry their own gender: 男主角/男配角/男性, 女主角/女配角/女性.
 *  Names like 外景主持 / 助理主持 / 個人 / 團體 have no gender restriction. */
export function roleGender(roleName: string): Gender {
  if (roleName.includes('女')) return 'female';
  if (roleName.includes('男')) return 'male';
  return 'any';
}

/** A gender-restricted role is only comparable against matching artists.
 *  'any' on either side means no restriction (also keeps the fixture tests
 *  that call matchRole without a gender happy). */
export function canTakeRole(role: RoleRecord, gender: Gender): boolean {
  return gender === 'any' || role.gender === 'any' || role.gender === gender;
}

/** The 18 signable artists, numbered as in the game's save-editor roster.
 *  The number is the game's own role id; each artist state block stores that
 *  same id 16 bytes before its nine abilities, so no guessing is needed.
 *  Gender comes from the player's roster (9 women, 9 men). */
export interface ArtistDirectoryEntry {
  id: number;
  name: string;
  /** Traditional-Chinese spelling used by the save's Big5 name table. */
  traditional: string;
  gender: Gender;
}

export const ARTIST_DIRECTORY: ArtistDirectoryEntry[] = [
  { id: 1, name: '林芬芬', traditional: '林芬芬', gender: 'female' },
  { id: 2, name: '桑禾蓓', traditional: '桑禾蓓', gender: 'female' },
  { id: 3, name: '欧怡青', traditional: '歐怡青', gender: 'female' },
  { id: 4, name: '苏嫚君', traditional: '蘇嫚君', gender: 'female' },
  { id: 5, name: '路敏', traditional: '路敏', gender: 'female' },
  { id: 6, name: '萧依莉', traditional: '蕭依莉', gender: 'female' },
  { id: 7, name: '天晴', traditional: '天晴', gender: 'male' },
  { id: 8, name: '陈奕夫', traditional: '陳奕夫', gender: 'male' },
  { id: 9, name: '关古威', traditional: '關古威', gender: 'male' },
  { id: 10, name: '路风', traditional: '路風', gender: 'male' },
  { id: 11, name: '纪翔', traditional: '紀翔', gender: 'male' },
  { id: 12, name: '姚子奇', traditional: '姚子奇', gender: 'male' },
  { id: 65, name: '姚子莹', traditional: '姚子瑩', gender: 'female' },
  { id: 72, name: '克烈斯', traditional: '克烈斯', gender: 'male' },
  { id: 74, name: '新名纱雪', traditional: '新名紗雪', gender: 'female' },
  { id: 75, name: '聆香', traditional: '聆香', gender: 'female' },
  { id: 76, name: '卫亚', traditional: '衛亞', gender: 'male' },
  { id: 77, name: '原少纬', traditional: '原少緯', gender: 'male' },
];

/** Ids 78 / 79 are placeholder blocks whose nine abilities are all 1111. */
export const PLACEHOLDER_ARTIST_IDS = [78, 79];

const PREFIXES = ['CD', 'CF', 'MV', 'TV', 'SH', 'FS', 'TH', 'SP'];
const NAME_BLOCKS = [
  'Case', 'CaseEnd', 'CaseFirm', 'CaseCreate', 'PrepareCase',
  'StarRoleQ', 'Firm', 'Team', 'Schedule',
];

export interface CaseTables {
  source: string;
  /** code -> [name, type, subtype, company] */
  cases: Record<string, string[]>;
  /** `type|role` -> nine ability grades (0 none, 1 A, 2 B, 3 C, 4 D) */
  needEffect: Record<string, number[]>;
  /** `kind|role` -> [工作天数, 每週可排天数上限]. */
  length?: Record<string, number[]>;
  /** star 1..5 -> [[A lo,hi], [B lo,hi], [C lo,hi], [D lo,hi]] */
  difficulty: number[][][];
  /** 艺人编号 -> [名字, 性别]（1 男 0 女），用来给「已被谁预约」署名。 */
  stars?: Record<string, [string, number]>;
  /** 称号编号 -> 简体称号名，来自 Nickname.tab；存档艺人块 -12 处存的就是这个编号。 */
  titles?: Record<string, string>;
  /** company id -> name */
  firms: Record<string, string>;
  /** 道具 code -> [名称, 分类, 说明, 属性行]，来自 Item.dat 烘焙。 */
  items: Record<string, string[]>;
}

export const EMPTY_TABLES: CaseTables = {
  source: '', cases: {}, needEffect: {}, length: {}, difficulty: [],
  stars: {}, titles: {}, firms: {}, items: {},
};

export interface Requirement {
  attr: string;
  value: number;
  /** Grade from the static NeedEffect table. */
  staticGrade: string;
  /** Grade inferred from the value and the star's difficulty ranges. */
  rolledGrade: string;
  /** 社交接演门槛（叛逆/性感/亲和）没有 A/B/C 等级，UI 用这个标记区分显示。 */
  social?: boolean;
}

/** 角色记录里 `off+76 / +80 / +84` 的三个接演门槛，与艺人 social 的前三项同序同量纲。 */
export interface SocialThresholds {
  rebellion: number;
  sexy: number;
  affinity: number;
}

export interface RoleRecord {
  code: string;
  roleCode: string;
  role: string;
  /** Gender required by this role, derived from its Big5 name. */
  gender: Gender;
  star: number;
  values: Record<string, number>;
  /** 从存档读取的社交接演门槛；三项都是 0 表示这个角色没有额外要求。 */
  social: SocialThresholds;
  requirements: Requirement[];
  /** Artist who has booked this role, e.g. 黎华. Empty means available. */
  reservedBy: string;
  offset: number;
}

/** 'upcoming' not open yet, 'open' bookable, 'closing' deadline within 7 days,
 *  'expired' past the deadline. */
export type NoticeStatus = 'upcoming' | 'open' | 'closing' | 'expired';

export interface CaseNotice {
  code: string;
  name: string;
  /** Broad category derived from the code prefix, e.g. TV -> 电视剧. */
  category: string;
  /** Fine-grained programme type from the static tables, e.g. 愛情偶像劇. */
  type: string;
  subtype: string;
  company: string;
  firmSlot: number;
  firmName: string;
  /** [open for booking (Monday), shooting start (Monday), shooting end (Sunday)]. */
  openDate: string;
  periodStart: string;
  periodEnd: string;
  /** One day before shooting starts, i.e. the last day to accept. */
  deadline: string;
  /** Inclusive length of the shooting period. */
  execDays: number;
  /** 需要的工作天数 (游戏 Length 表), 0 when the table has no match. */
  workDays: number;
  /** 每週最多可排几天工作, 0 when unknown. */
  daysPerWeek: number;
  /** Signed day counts relative to the game's current date. */
  daysToOpen: number;
  daysToDeadline: number;
  daysToStart: number;
  daysToEnd: number;
  /** Executed / remaining days when shooting is in progress, else 0. */
  executedDays: number;
  remainingDays: number;
  status: NoticeStatus;
  roles: RoleRecord[];
}

/** 这张通告上还有几个角色没被人接走。
 *  存档里没有该通告的角色记录时也是 0 —— 那是「不知道」，不是「满了」。 */
export function freeRoleCount(notice: CaseNotice): number {
  return notice.roles.reduce((sum, role) => (role.reservedBy ? sum : sum + 1), 0);
}

/** 现在还能接取：还没停止接取（`open` / `closing`），并且至少有一个角色空着。
 *  「下周更新」的还没开放、已停止接取的也进不去，所以都不算；读不到角色记录的
 *  同样不算 —— 宁可漏掉，不要让人照着一条其实接不了的通告去排档期。
 *
 *  这是「未预约」那一档：只问还有没有角色没人接，**我方接不接得上另说**，
 *  能不能接还要看自家艺人性别与数值，见 `canTakeNotice()`。 */
export function isAcceptable(notice: CaseNotice): boolean {
  if (notice.status !== 'open' && notice.status !== 'closing') return false;
  return freeRoleCount(notice) > 0;
}

/** 「满足条件」：角色未预约，并且至少有一个空角色自家接得上。
 *  `fits` 由调用方给 —— 主站拿 `matchRole()` / `matchGroupRole()` 判断性别与九项
 *  数值是否都够，这里只管「未预约 + 有人达标」这件事本身，方便单测。 */
export function canTakeNotice(
  notice: CaseNotice,
  fits: (role: RoleRecord) => boolean,
): boolean {
  if (!isAcceptable(notice)) return false;
  return notice.roles.some((role) => !role.reservedBy && fits(role));
}

/** One artist state block, read straight from the uploaded save. Field order
 *  was checked field-by-field against the game's save-editor panel. */
export interface ArtistStats {
  /** 友好度，整数、不缩放；来自存档头部的角色友好度表，缺记录时为 null。 */
  friendship: number | null;
  /** Nine ability values, in the same order as ATTRS. */
  abilities: number[];
  stress: number;
  fatigue: number;
  /** [叛逆, 性感, 亲和, 人气, 曝光] */
  social: number[];
  gifts: number;
  /** 电视 / 电影 / 唱片 / 广告 / 主持 completed counts. */
  noticeCounts: number[];
  /** Short Big5 status label such as 正常. */
  condition: string;
  /** 游戏内称号编号，存在状态块起始前 12 字节；0 = 还没有称号（例如刚签下、还没作品）。 */
  titleId: number;
  /** 称号名（简体），由 titleId 查烘焙进站点的 Nickname 表得来；读不到就是空串。 */
  title: string;
  /** The game's roster number, stored 16 bytes before the nine abilities. */
  roleId: number;
  /** 1 means this artist is currently signed by the player's company. */
  signed: boolean;
  offset: number;
  index: number;
}

/** One selectable artist in the top panel: fixed roster number plus whichever
 *  state block the save happens to contain for them. */
export interface ArtistOption extends ArtistDirectoryEntry {
  /** null when this artist has no state block in this save yet. */
  artistIndex: number | null;
  signed: boolean;
  /** 存档里的称号名；空串表示还没有称号。 */
  title: string;
  /** Nine abilities, for the roster chip tooltip. */
  abilities: number[];
}

export interface RosterEntry {
  id: number;
  name: string;
}

export interface GameDate {
  y: number;
  m: number;
  d: number;
  weekday: number;
  text: string;
  label: string;
  dayNumber: number;
}

/** 我方公司的四件套。
 *
 *  公司名与主角姓名在存档头部的定长字段里（@4 20 字节 / @24 16 字节，Big5，
 *  遇 NUL 截断）；资金是头部 @80 的 int32。形象 / 知名度 / 公关 不在头部，
 *  而在 `Firm` 段：段体先是公司数量，然后每家一条
 *  `[编号][形象字节数][每字节一个 int32][知名度][公关][0]`，编号 1 就是我方，
 *  2..5 是对手公司（名字在游戏的 Firm.dat 里，存档只记数值）。 */
export interface CompanyInfo {
  /** 公司名称。 */
  name: string;
  /** 主角姓名。 */
  protagonist: string;
  /** 公司形象，例如「注入新血的」。 */
  image: string;
  /** 知名度。 */
  fame: number;
  /** 公关。 */
  pr: number;
  /** 资金，可能是负数（负债）。 */
  money: number;
  /** 这条记录在存档里的位置，排错用。 */
  offset: number;
}

/** One Monday update batch of a production company, built from the notices the
 *  reader is actually showing (their 接取日 = 开放接取那个周一). */
export interface UpdateBatch {
  date: string;
  dayNumber: number;
  label: string;
  companies: string[];
  kinds: string[];
  codes: string[];
  daysAway: number;
  /** true = the save already contains this batch; false = extrapolated. */
  scheduled: boolean;
}

/** A team the player has formed, read straight from the save.
 *  The save keeps them in its `Team` section: [编码][名字节长度][Big5 名字] and
 *  the member artist numbers a fixed distance after the name. 我方团体从 101 起；
 *  存档里没有这条记录，就是旗下没有团体。 */
export interface TeamRecord {
  /** 团体编码：101、102…，读不到就是旗下没有团体。 */
  code: number;
  /** 团体名，直接取存档里的 Big5 字符串。 */
  name: string;
  /** 成员艺人编号，第 0 个就是队长。 */
  memberIds: number[];
  /** 存档里这条记录的位置。 */
  offset: number;
}

/** A team as shown in the reader: ids resolved to names via ARTIST_DIRECTORY. */
export interface GroupRecord extends TeamRecord {
  leaderId: number;
  leaderName: string;
  memberNames: string[];
}

/** A role whose name contains 團體 / 团体 is filled by a group, not a solo
 *  artist, so its numeric match should be tested against the group's leader. */
export function isGroupRole(role: RoleRecord): boolean {
  return /團體|团体/.test(role.role);
}

/** Group-role match: only the leader's personal abilities matter; member
 *  stats are irrelevant, per the player's rule. */
export function matchGroupRole(
  role: RoleRecord,
  leader: ArtistStats | null,
  groupName: string,
  leaderName: string,
): MatchResult {
  const gaps: MatchResult['gaps'] = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = leader?.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  for (const [key, attr, idx] of [['rebellion', '叛逆', 0], ['sexy', '性感', 1], ['affinity', '亲和', 2]] as const) {
    const need = role.social[key];
    if (!need) continue;
    const have = leader?.social[idx] ?? 0;
    gaps.push({ attr, need, have, diff: need - have, social: true });
  }
  const missing = gaps.filter((gap) => gap.diff > 0);
  return {
    artistIndex: leader?.index ?? -1,
    // 团体通告是「整团」接的：名字写队名，队长与成员由 UI 另起一行列全。
    artistName: groupName || leaderName,
    eligible: true,
    canAccept: missing.length === 0,
    gaps,
    missing: missing.length,
  };
}

/** One row of the save's owned-item list.
 *
 *  存档里这是一段连续的 16 字节小端记录：`[编号, 状态码, 数量, 附字段]`，
 *  一段通常几十到上百条。编号是游戏里统一的道具 id（例如 917 = 附着唇印的卡片）；
 *  `数量` 为 0 表示背包里没有（UI 不展示）。名称 / 分类 / 说明 / 属性行来自烘焙进
 *  case-tables.json 的道具表（Item.dat），存档本身不带这些文本。 */
export interface OwnedItem {
  code: number;
  flag: number;
  quantity: number;
  meta: number;
  /** 道具名称（来自道具表，缺省回退为「道具 <code>」）。 */
  name?: string;
  /** 分类：一般物品 / 特殊物品 / 公司物品（来自道具表的 type 字段）。 */
  category?: string;
  /** 物品说明（来自道具表，可能为空）。 */
  desc?: string;
  /** 属性行，如「儀態+5  自信+5」（来自道具表，可能为空）。 */
  stats?: string;
}

export interface ParseResult {
  saveName: string;
  saveSize: number;
  readAt: string;
  blocks: Record<string, [number, number]>;
  roleRecordCount: number;
  notices: CaseNotice[];
  /** 已在拍 / 待开拍的通告（只看自己旗下艺人），来自存档里的接取记录。 */
  shooting: ShootingNotice[];
  /** 「自制通告及其他」：玩家自己出品的通告清单，按制作顺序。 */
  selfMade: SelfMadeNotice[];
  artists: ArtistStats[];
  /** 艺人编号 -> 友好度（整数），独立于状态块的头部友好度表。 */
  friendship: Record<number, number>;
  /** The 18 signable artists, resolved against the state blocks in this save. */
  artistDirectory: ArtistOption[];
  /** Numbers of the artists the save marks as signed (1..4 of them). */
  signedArtistIds: number[];
  /** Live 人气 / 名气 / 通告数量 keyed by team code, read straight from the save.
   *  The player's actual groups are chosen in the UI from the static KNOWN_TEAMS;
   *  this map only supplies the numbers for whichever codes the save contains. */
  teams: TeamRecord[];
  /** Full 284-byte role-name table at the head of the save. */
  roster: RosterEntry[];
  /** Dates from the save header, used for all countdowns. */
  currentDate: GameDate | null;
  /** 我方公司：名称 / 主角 / 形象 / 知名度 / 公关 / 资金。 */
  company: CompanyInfo | null;
  /** Monday notice-update batches, oldest first. */
  batches: UpdateBatch[];
  /** First batch strictly after today, i.e. the next company refresh. */
  nextUpdate: UpdateBatch | null;
  /** Codes in CaseFirm that the bundled static tables do not know. */
  unknownCodes: string[];
  /** 存档里解析出的整段道具清单（含数量 0 的），UI 只展示数量 > 0 的。 */
  items: OwnedItem[];
}

let decoder: TextDecoder | null = null;

/** Big5 is the encoding of the Traditional Chinese release. All modern
 *  browsers ship the WHATWG `big5` decoder; fail loudly if one does not. */
function decodeBig5(bytes: Uint8Array): string {
  if (!decoder) {
    try {
      decoder = new TextDecoder('big5');
    } catch {
      throw new Error('当前浏览器不支持 Big5 解码，无法读取游戏内的繁体文字。请换用 Chrome / Edge / Firefox 再试。');
    }
  }
  return decoder.decode(bytes);
}

/** NUL-terminated Big5 string, with the surrounding NULs trimmed like the
 *  Python probe does (an interior NUL survives and is rejected later). */
function big5String(bytes: Uint8Array, start: number, end: number): string {
  return decodeBig5(bytes.subarray(start, end)).replace(/^\0+|\0+$/g, '');
}

function asciiString(bytes: Uint8Array, start: number, end: number): string {
  const slice = bytes.subarray(start, end);
  const stop = slice.indexOf(0);
  const body = stop < 0 ? slice : slice.subarray(0, stop);
  let out = '';
  for (const byte of body) out += String.fromCharCode(byte);
  return out;
}

function isDigit(byte: number): boolean {
  return byte >= 0x30 && byte <= 0x39;
}

function isCode(text: string): boolean {
  if (text.length !== 5 && text.length !== 6) return false;
  if (!PREFIXES.includes(text.slice(0, 2))) return false;
  const digits = text.slice(2);
  if (!/^\d{3,4}$/.test(digits)) return false;
  return true;
}

/** Whole days since the epoch; UTC avoids local-timezone DARPA drift. */
export function dayNumber(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/** "2006/2/13" -> day number; returns NaN for blank / malformed text. */
export function parseDay(text: string): number {
  const parts = text.split('/').map(Number);
  if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) return NaN;
  return dayNumber(parts[0], parts[1], parts[2]);
}

/** Day number -> "2006/2/12". */
export function dayText(day: number): string {
  const date = new Date(day * 86400000);
  return `${date.getUTCFullYear()}/${date.getUTCMonth() + 1}/${date.getUTCDate()}`;
}

/** 钱按亿 / 万拆开写：12000 → 1万2000，110002000 → 1亿1000万2000，
 *  不到一万原样给（5000 → 5000）。每一段都不再加千分位。 */
export function moneyText(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  let rest = Math.abs(Math.round(value));
  const yi = Math.floor(rest / 100000000);
  rest -= yi * 100000000;
  const wan = Math.floor(rest / 10000);
  rest -= wan * 10000;
  let out = '';
  if (yi) out += `${yi}亿`;
  if (wan) out += `${wan}万`;
  if (rest || !out) out += `${rest}`;
  return sign + out;
}

/** Locate named blocks whose characters are stored one ASCII int32 per char. */
function findInt32Names(
  bytes: Uint8Array,
  view: DataView,
  targets: string[],
): Record<string, [number, number]> {
  const wanted = new Set(targets);
  const words = Math.floor(bytes.length / 4);
  const found: Record<string, [number, number]> = {};
  let i = 0;
  while (i < words) {
    const first = view.getUint32(i * 4, true);
    if (first >= 0x20 && first <= 0x7a) {
      let j = i;
      let text = '';
      while (j < words) {
        const value = view.getUint32(j * 4, true);
        if (value < 0x20 || value > 0x7a) break;
        text += String.fromCharCode(value);
        j += 1;
      }
      if (wanted.has(text) && !(text in found)) found[text] = [i * 4, j * 4];
      i = j;
    } else {
      i += 1;
    }
  }
  return found;
}

/** Scan the Case block for 192-byte role records holding rolled thresholds. */
function parseRoles(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
): RoleRecord[] {
  const rows: RoleRecord[] = [];
  let i = start;
  while (i < end) {
    const prefix = i + 1 < end
      ? String.fromCharCode(bytes[i], bytes[i + 1])
      : '';
    if (!PREFIXES.includes(prefix)) {
      i += 1;
      continue;
    }
    let length = 0;
    while (length < 4 && i + 2 + length < end && isDigit(bytes[i + 2 + length])) length += 1;
    if (length < 3) {
      i += 1;
      continue;
    }
    const matched = asciiString(bytes, i, i + 2 + length);
    const off = i - 12;
    const advance = 2 + length;
    i += advance;
    if (off < start || off + 192 > bytes.length) continue;

    const tag = asciiString(bytes, off + 12, off + 20);
    if (tag !== matched || !isCode(tag)) continue;

    const role = big5String(bytes, off + 20, off + 32);
    if (!role || role.length > 8 || /[\x00-\x7f]/.test(role)) continue;

    const star = view.getUint32(off + 32, true);
    const values: Record<string, number> = {};
    let plausible = false;
    for (let j = 0; j < ATTRS.length; j += 1) {
      const value = view.getUint32(off + 40 + 4 * j, true);
      if (value >= 50 && value <= 999) plausible = true;
      if (value) values[ATTRS[j]] = value;
    }
    if (!(star >= 1 && star <= 5) || !plausible) continue;

    // 社交接演门槛紧跟在九项能力之后：off+76 叛逆 / +80 性感 / +84 亲和。
    // 与艺人 social 前三项同量纲（都是几百的直接值，不做 ×10 换算），
    // 全部为 0 表示这个角色没有额外要求。逐一跨 27 份存档核对过槽位。
    const social: SocialThresholds = {
      rebellion: view.getUint32(off + 76, true),
      sexy: view.getUint32(off + 80, true),
      affinity: view.getUint32(off + 84, true),
    };

    rows.push({
      code: tag.slice(0, 5),
      roleCode: tag,
      role,
      gender: roleGender(role),
      star,
      values,
      social,
      requirements: [],
      reservedBy: RESERVED_ROLES[tag] ?? '',
      offset: off,
    });
  }
  return rows;
}

/** CaseFirm: [seq, firmSlot, length, code-as-int32-chars] records. */
function parseCaseFirm(
  view: DataView,
  start: number,
  byteLength: number,
): { seq: number; firm: number; code: string }[] {
  const out: { seq: number; firm: number; code: string }[] = [];
  const firstWord = Math.floor(start / 4) + 1;
  const limit = Math.min(Math.floor(byteLength / 4), Math.floor(start / 4) + 200);
  for (let word = firstWord; word < limit; word += 1) {
    const off = word * 4;
    let chars = '';
    for (let j = 0; j < 5; j += 1) {
      const value = view.getUint32(off + 4 * j, true);
      if (value < 0x20 || value > 0x7a) break;
      chars += String.fromCharCode(value);
    }
    if (chars.length !== 5) continue;
    if (!/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(chars)) continue;
    const seq = view.getUint32(off - 12, true);
    const firm = view.getUint32(off - 8, true);
    const length = view.getUint32(off - 4, true);
    if (length === 5) out.push({ seq, firm, code: chars });
  }
  return out;
}

function gradeOf(value: number, star: number, difficulty: number[][][]): string {
  const ranges = difficulty[star - 1];
  if (!ranges) return '';
  for (let idx = 0; idx < ranges.length; idx += 1) {
    const [lo, hi] = ranges[idx];
    if (value >= lo && value <= hi) return GRADES[idx + 1] ?? '';
  }
  return '?';
}

function isBig5Pair(first: number, second: number): boolean {
  return first >= 0xa1 && first <= 0xf9 && second >= 0x40 && second <= 0xfe;
}

/** A NUL-terminated Big5 name made only of double-byte characters. */
function readBig5Name(bytes: Uint8Array, off: number, limit = 14): string {
  const buf: number[] = [];
  for (let i = 0; i + 1 < limit; i += 2) {
    const a = bytes[off + i];
    const b = bytes[off + i + 1];
    if (!a || !b || !isBig5Pair(a, b)) break;
    buf.push(a, b);
  }
  if (buf.length < 4) return '';
  return decodeBig5(Uint8Array.from(buf));
}

/** The 284-byte role-name table at the head of the save. Locate its base by
 *  looking for three consecutive Chinese names, then read the whole roster. */
export function parseRoster(bytes: Uint8Array): RosterEntry[] {
  let base = -1;
  for (let o = 0; o < 20000; o += 4) {
    if (readBig5Name(bytes, o) && readBig5Name(bytes, o + 284) && readBig5Name(bytes, o + 568)) {
      base = o;
      break;
    }
  }
  if (base < 0) return [];
  const out: RosterEntry[] = [];
  let blanks = 0;
  for (let k = 0; k < 60; k += 1) {
    const name = readBig5Name(bytes, base + k * 284);
    blanks = name ? 0 : blanks + 1;
    if (blanks >= 3 && out.length > 4) break; // a few empty slots are normal
    out.push({ id: k, name });
  }
  return out;
}

/** 友好度表：存档头部按 284 字节一条排列，字段为
 *  [友好度 int32][0][256/257][艺人编号 int32]。用编号反查，不依赖固定偏移。 */
function parseFriendship(view: DataView, bytes: Uint8Array): Record<number, number> {
  const out: Record<number, number> = {};
  const ids = new Set(ARTIST_DIRECTORY.map((a) => a.id));
  const limit = Math.min(bytes.length - 16, 20000);
  for (let p = 0; p + 16 <= limit; p += 4) {
    const value = view.getUint32(p, true);
    if (value > 9999) continue;
    const marker = view.getUint32(p + 8, true);
    if (marker !== 256 && marker !== 257) continue;
    const id = view.getUint32(p + 12, true);
    if (!ids.has(id) || id in out) continue;
    out[id] = value;
  }
  return out;
}

/** Artist attribute blocks: nine abilities, stress/fatigue, a short Big5
 *  status label, the social stats and five notice counters. The 999 "cap"
 *  blocks that follow each real one are filtered out. */
function parseArtists(
  bytes: Uint8Array,
  view: DataView,
  start: number,
  end: number,
  friendship: Record<number, number>,
  titles: Record<string, string>,
): ArtistStats[] {
  const out: ArtistStats[] = [];
  const seen = new Set<number>();
  let index = 0;
  for (let o = Math.max(0, start); o + 140 <= Math.min(end, bytes.length); o += 4) {
    const rawAbilities = Array.from({ length: 9 }, (_, j) => view.getUint32(o + 4 * j, true));
    // Abilities are stored ×10. 9999 is a legitimate value (the UI shows 999.9),
    // which is why the ceiling has to sit above 9990 — otherwise late-game
    // saves whose artists are near the cap drop out completely.
    if (!rawAbilities.every((v) => v > 100 && v <= 12000)) continue;
    // The save stores every ability ×10 (the in-game UI hides the decimal), so a
    // four-digit value like 1886 is really 188.6. Divide back to the displayed
    // scale before comparing with the three-digit notice requirements.
    const abilities = rawAbilities.map((v) => v / 10);
    const stress = view.getUint32(o + 36, true);
    const fatigue = view.getUint32(o + 40, true);
    if (stress > 500 || fatigue > 500) continue;
    const labelLength = view.getUint32(o + 44, true);
    if (labelLength < 2 || labelLength > 12 || o + 48 + labelLength * 4 + 100 > bytes.length) continue;
    const statusBytes = new Uint8Array(labelLength);
    let statusOk = true;
    for (let j = 0; j < labelLength; j += 1) {
      const v = view.getUint32(o + 48 + 4 * j, true);
      // One byte per int32: either plain ASCII or a sign-extended Big5 byte.
      if (v > 0xff && v < 0xffffff80) statusOk = false;
      statusBytes[j] = v & 0xff;
    }
    if (!statusOk) continue;
    const condition = decodeBig5(statusBytes);
    // The status label is the discriminator: the 999 "cap" blocks that follow
    // each artist have no such Chinese label and are filtered out here.
    if (!/^[\u4e00-\u9fff]+$/.test(condition)) continue;
    const socialAt = o + 48 + labelLength * 4;
    const social = Array.from({ length: 5 }, (_, j) => view.getUint32(socialAt + 4 * j, true));
    // 名气 / 魅力 in newer saves reach four digits (×10 scale), so this is only
    // a sanity bound; it must not be tight enough to drop real artists.
    if (!social.every((v) => v <= 99999)) continue;
    const gifts = view.getUint32(socialAt + 20, true);
    const noticeCounts = Array.from({ length: 5 }, (_, j) => view.getUint32(socialAt + 24 + 4 * j, true));
    if (!noticeCounts.every((v) => v <= 9999)) continue;
    // Ids 78 / 79 are unused template blocks whose nine abilities are all 1111.
    if (abilities.every((v) => v === abilities[0])) continue;
    const roleId = o >= 16 ? view.getUint32(o - 16, true) : 0;
    if (PLACEHOLDER_ARTIST_IDS.includes(roleId)) continue;
    // 称号编号紧跟在角色编号后面（块头 `[编号][称号][公司][?]`）。
    // 0 表示还没有称号：刚签下、还没作品时会读到 0，不是解析失败。
    const titleId = o >= 16 ? view.getUint32(o - 12, true) : 0;
    // One block per artist; keep the first so a stray later match cannot shadow it.
    if (seen.has(roleId)) continue;
    seen.add(roleId);
    const signed = o >= 8 && view.getUint32(o - 8, true) === 1;
    index += 1;
    out.push({
      friendship: roleId in friendship ? friendship[roleId] : null,
      abilities, stress, fatigue, social, gifts, noticeCounts, condition,
      titleId, title: (titleId > 0 && titles[String(titleId)]) || '',
      roleId, signed, offset: o, index,
    });
  }
  return out;
}

interface DateTuple { y: number; m: number; d: number; w: number; day: number }

function fmtDate(t: DateTuple): string {
  return `${t.y}/${t.m}/${t.d}`;
}

/** The game stores [year, month, day, weekday] int32 tuples, with 1 = Monday
 *  and 7 = Sunday. Verified: 2006/1/16 is w1, 2006/4/9 is w7. */
function noticeDates(view: DataView, start: number, end: number): DateTuple[] {
  const dates: DateTuple[] = [];
  for (let o = start; o + 16 <= end; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && w >= 1 && w <= 7) {
      dates.push({ y, m, d, w, day: dayNumber(y, m, d) });
      o += 12; // skip the rest of the tuple; the loop adds the final 4
    }
  }
  return dates;
}

/** A bookable notice has exactly three consecutive dates:
 *  open (Monday), shooting start (Monday), shooting end (Sunday). */
function scheduleDates(dates: DateTuple[]): DateTuple[] | null {
  for (let i = 0; i + 2 < dates.length; i += 1) {
    const [a, b, c] = [dates[i], dates[i + 1], dates[i + 2]];
    if (a.w === 1 && b.w === 1 && c.w === 7 && a.day < b.day && b.day < c.day) {
      return [a, b, c];
    }
  }
  return null;
}

/** Notice blocks start with the code stored as one ASCII int32 per character. */
function findCodeBlocks(
  view: DataView, start: number, end: number,
): { code: string; start: number; end: number }[] {
  const marks: { code: string; start: number }[] = [];
  for (let o = start; o + 20 <= end; o += 4) {
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(o + 4 * j, true);
      if (v < 0x20 || v > 0x7a) break;
      code += String.fromCharCode(v);
    }
    if (code.length === 5 && /^(?:CD|CF|MV|TV|SH|FS|TH|SP)[0-9A-Z]{3}$/.test(code)) {
      marks.push({ code, start: o });
      o += 16;
    }
  }
  return marks.map((mark, index) => ({
    ...mark,
    end: index + 1 < marks.length ? marks[index + 1].start : end,
  }));
}

/** The save header keeps the in-game date as [year, month, day, weekday]. */
function readCurrentDate(view: DataView, byteLength: number): GameDate | null {
  const limit = Math.min(byteLength, 4096);
  for (let o = 0; o + 16 <= limit; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31 && w >= 1 && w <= 7) {
      return {
        y, m, d, weekday: w,
        text: `${y}/${m}/${d}`,
        label: WEEKDAYS[w] ?? '',
        dayNumber: dayNumber(y, m, d),
      };
    }
  }
  return null;
}

/** 定长 Big5 字段：遇 NUL 截断。玩家名短的后面是未初始化残留，解出控制字符
 *  就整段丢掉 —— 宁可显示空白，也不把乱码糊到界面上。 */
function readFixedText(bytes: Uint8Array, start: number, length: number): string {
  if (start + length > bytes.length) return '';
  const slice = bytes.subarray(start, start + length);
  const stop = slice.indexOf(0);
  const body = stop < 0 ? slice : slice.subarray(0, stop);
  if (body.length < 2) return '';
  const text = decodeBig5(body);
  return /[\u0000-\u001f\ufffd]/.test(text) ? '' : text;
}

/** `Firm` 段体：先公司数量，然后每家一条
 *  `[编号][形象字节数][每字节一个 int32][知名度][公关][0]`。编号 1 是我方，
 *  2..5 是对手公司。形象里的字节是按**有符号** int32 存的，取低 8 位再拼。 */
function readFirmStats(
  bytes: Uint8Array,
  view: DataView,
  block: [number, number] | undefined,
): { image: string; fame: number; pr: number; offset: number } | null {
  if (!block) return null;
  const body = block[1];
  if (body + 4 > bytes.length) return null;
  const count = view.getInt32(body, true);
  if (count < 1 || count > 32) return null;
  let o = body + 4;
  for (let i = 0; i < count; i += 1) {
    if (o + 12 > bytes.length) return null;
    const id = view.getInt32(o, true);
    const len = view.getInt32(o + 4, true);
    if (id < 1 || id > 32 || len < 0 || len > 64) return null;
    const dataAt = o + 8;
    if (dataAt + len * 4 + 12 > bytes.length) return null;
    if (id !== 1) {
      // 不是我方就跳过，结构照样要按长度推。
      o = dataAt + len * 4 + 12;
      continue;
    }
    const chars = new Uint8Array(len);
    for (let k = 0; k < len; k += 1) chars[k] = view.getInt32(dataAt + k * 4, true) & 0xff;
    const fame = view.getInt32(dataAt + len * 4, true);
    const pr = view.getInt32(dataAt + len * 4 + 4, true);
    if (fame < 0 || fame > 99999999 || pr < 0 || pr > 99999999) return null;
    const image = decodeBig5(chars).replace(/\0/g, '').trim();
    return {
      image: /[\ufffd]/.test(image) ? '' : image,
      fame,
      pr,
      offset: o,
    };
  }
  return null;
}

/** 公司信息：名字与主角在头部定长字段，形象 / 知名度 / 公关在 `Firm` 段，
 *  资金在头部 @80（可以是负数）。 */
export function parseCompany(
  bytes: Uint8Array,
  view: DataView,
  firm: [number, number] | undefined,
): CompanyInfo | null {
  const name = readFixedText(bytes, 4, 20);
  const protagonist = readFixedText(bytes, 24, 16);
  const money = bytes.length >= 84 ? view.getInt32(80, true) : NaN;
  const stats = readFirmStats(bytes, view, firm);
  if (!name && !protagonist && !stats) return null;
  return {
    name,
    protagonist,
    image: stats?.image ?? '',
    fame: stats?.fame ?? NaN,
    pr: stats?.pr ?? NaN,
    money,
    offset: stats?.offset ?? 0,
  };
}

/** Read the player's teams from the save's `Team` section.
 *
 *  Layout verified against Auto / Story0001 / Story0003 / Story0004 /
 *  Story0007 / Ending0009: a team record is [编码][名字节长度][Big5 名字] and,
 *  a fixed distance after the name, the member artist numbers (第 0 个是队长).
 *  A team the player never formed simply has no record — 旗下没有团体时这里是空数组。
 *
 *  The section also holds each team's current 通告, whose record quotes the
 *  team name too. Two shapes count as a real team: the usual one ends with the
 *  "Invaid" class label, and (Ending0009 的 101 大小姐) some records stop right
 *  after the member numbers. 通告 references match neither, so they stay out. */
export function parseTeams(
  bytes: Uint8Array,
  view: DataView,
  blocks: Record<string, [number, number]>,
): TeamRecord[] {
  const start = blocks.Team ? blocks.Team[1] : -1;
  const end = blocks.Schedule ? blocks.Schedule[0] : bytes.length;
  if (start < 0 || start >= bytes.length) return [];
  const limit = Math.min(end, bytes.length);
  const MARKER = [73, 110, 118, 97, 105, 100]; // "Invaid", the class's own label
  const out: TeamRecord[] = [];
  for (let o = start; o + 120 <= limit; o += 4) {
    const code = view.getUint32(o, true);
    if (code < 101 || code > 199) continue;
    const nameBytes = view.getUint32(o + 4, true);
    if (nameBytes < 4 || nameBytes > 24 || nameBytes % 2 !== 0) continue;
    const chars = new Uint8Array(nameBytes);
    let isText = true;
    for (let j = 0; j < nameBytes; j += 1) {
      const v = view.getUint32(o + 8 + 4 * j, true);
      if (v > 0xff && v < 0xffffff80) { isText = false; break; }
      chars[j] = v & 0xff;
    }
    if (!isText) continue;
    const name = decodeBig5(chars);
    if (!/^[\u4e00-\u9fff]+$/.test(name)) continue;
    const nameEnd = o + 8 + nameBytes * 4;
    if (nameEnd + 72 > bytes.length) continue;
    const hasMarker = view.getUint32(nameEnd + 44, true) === MARKER.length
      && MARKER.every((c, j) => view.getUint32(nameEnd + 48 + 4 * j, true) === c);
    const idA = view.getUint32(nameEnd + 28, true);
    const idB = view.getUint32(nameEnd + 32, true);
    const idC = view.getUint32(nameEnd + 36, true);
    // 没有尾部标记的记录：名字后面先是一个小数值，再是两三个艺人编号，然后归零。
    const shapeOk = view.getUint32(nameEnd + 24, true) <= 99
      && idA >= 1 && idA <= 96 && idB >= 1 && idB <= 96
      && (idC === 0 || (idC >= 1 && idC <= 96))
      && view.getUint32(nameEnd + 40, true) === 0;
    if (!hasMarker && !shapeOk) continue;
    const memberIds: number[] = [];
    for (let j = 0; j < 3; j += 1) {
      const id = view.getUint32(nameEnd + 28 + 4 * j, true);
      if (id >= 1 && id <= 96 && !memberIds.includes(id)) memberIds.push(id);
    }
    if (out.some((team) => team.code === code)) continue;
    out.push({ code, name, memberIds, offset: o });
  }
  return out.sort((a, b) => a.code - b.code);
}

/** Resolve a team's member ids to display names; 第 0 个成员就是队长。 */
export function buildGroupRecord(
  team: TeamRecord,
  nameOf: (id: number) => string,
): GroupRecord {
  const leaderId = team.memberIds[0] ?? 0;
  return {
    ...team,
    leaderId,
    leaderName: team.memberIds.length ? nameOf(leaderId) : '',
    memberNames: team.memberIds.map(nameOf),
  };
}

/** 通告被谁接走了。
 *
 *  存档里没有「角色 → 艺人」的字段（192 字节的角色记录在两个存档间逐字节比对过，
 *  除了 roll 出来的星级/数值，没有空位放艺人编号）。艺人与通告的对应写在
 *  **艺人状态块后面那串「作品清单」**里：每条 28 字节，形如
 *  `[类别][5 字符通告编码][子类]`，连续的清单一直排到下一个艺人块的表头。
 *  所以按「块 N 之后到块 N+1 表头」切区间，把区间内出现的编码都算作块 N 的作品。
 *
 *  实测对上：Auto 存档里接了「守候 / 背叛」男主角的是 13 号（黎華），
 *  Story0007 里接下「天才與白痴」男主角与「最後一次再想他」的是 76 号（衛亞）。
 *  通告池里出现的编码只可能是当期的，所以命中的就是当前预约。 */
export function parseCaseOwners(
  bytes: Uint8Array,
  view: DataView,
  artists: ArtistStats[],
  stars: CaseTables['stars'],
  limit: number,
): Record<string, { id: number; name: string; gender: Gender }[]> {
  const out: Record<string, { id: number; name: string; gender: Gender }[]> = {};
  const rows = [...artists].sort((a, b) => a.offset - b.offset);
  for (let k = 0; k < rows.length; k += 1) {
    const artist = rows[k];
    // 清单排在块后面，到下一个块的表头（id 在能力值前 16 字节）为止。
    const end = Math.min(k + 1 < rows.length ? rows[k + 1].offset - 16 : limit, bytes.length);
    // 命名优先用存档数据表 stars；但 StarRole.dat 在 #75 处是一条「千萬不要用」占位
    // 记录，stars 表里没有它，于是回退到人工核对的 ARTIST_DIRECTORY（已含 #75 = 聆香）。
    // 两个来源之外的编号才兜底成「艺人 #N」。性别同理。
    const entry = stars?.[String(artist.roleId)];
    const dirEntry = ARTIST_DIRECTORY.find((a) => a.id === artist.roleId);
    const gender: Gender = entry
      ? (entry[1] ? 'male' : 'female')
      : (dirEntry ? dirEntry.gender : 'any');
    const name = entry?.[0] ?? dirEntry?.name ?? `艺人 #${artist.roleId}`;
    const code = readNoticeCode(view, artist.offset, end);
    for (const item of code) {
      const list = (out[item] ??= []);
      if (!list.some((owner) => owner.id === artist.roleId)) {
        list.push({ id: artist.roleId, name, gender });
      }
    }
  }
  return out;
}

/** 5 个 ascii 字符挤在 20 字节里的通告编码，扫区间内每一个 4 字节位置。 */
function readNoticeCode(view: DataView, start: number, end: number): string[] {
  const out: string[] = [];
  for (let o = start; o + 20 <= end; o += 4) {
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(o + 4 * j, true);
      if (v < 0x20 || v > 0x7a) { code = ''; break; }
      code += String.fromCharCode(v);
    }
    if (code.length !== 5 || !/^(?:CD|CF|MV|TV|SH)[0-9A-Z]{3}$/.test(code)) continue;
    out.push(code);
    o += 16;
  }
  return out;
}

/** 一条正在拍（或已拍完 / 已逾期）的通告。
 *
 *  筹备中的通告来自 CaseFirm（当期可接取列表），已经在拍的不在这里 ——
 *  它们在 Case 段留着一条带「接取记录」的通告块。接取记录的形状在
 *  Auto(CF014 蕭依莉)、Ending0009(CD089 / CD090 / MV031)、Story0007
 *  (MV601) 上逐字节核对过：
 *
 *    [艺人编号][已完成天数][状态][?][酬劳]
 *
 *  即艺人后面紧跟已完成天数（样本里 4 / 23 / 34 / 0 全对得上），再隔
 *  12 字节是这条通告的酬劳（5000 / 950 万 / 1550 万）。酬劳不进静态表：
 *  同一个 CD089 在 Ending0009 记 950 万、在 Story0007 记 790 万，会随接演
 *  艺人变化，所以只认存档里的值。 */
export type ShootingRisk = 'ok' | 'tight' | 'late' | 'unknown';
/** 一位接演艺人自己的进度状态：还没到开拍日 / 正在拍 / 已经拍够天数。 */
export type ShootingStatus = 'pending' | 'shooting' | 'done';

/** 排期余量的提醒阈值（天）。
 *
 *  玩家口径：不判断「排得下 / 排不下」这种结论，只给两种提醒 ——
 *  1) 剩下的日子按每周上限折算后，离「刚好够」还剩 ≤ 5 天 → 逾期风险
 *     （艺人会失误、会生病，余量太薄就可能拖过杀青）；
 *  2) 折算完还不够 → 违约提醒。 */
export const RISK_SLACK_DAYS = 5;

/** 按「还能排几天」和「还要拍几天」的差额给提醒。
 *  多出来的余量 ≤ RISK_SLACK_DAYS 就算有逾期风险。 */
export function riskOf(needDays: number, canShootDays: number, daysPerWeek: number): ShootingRisk {
  if (needDays <= 0) return 'ok';
  if (!(daysPerWeek > 0)) return 'unknown';
  const slack = canShootDays - needDays;
  if (slack < 0) return 'late';
  return slack <= RISK_SLACK_DAYS ? 'tight' : 'ok';
}

/** 一条通告里某一位接演艺人的进度。
 *
 *  同一条通告上，不同艺人各拿一个角色、各拍各的天数、各拿各的酬劳，
 *  所以进度必须按「通告 × 艺人」分开算 —— 拿 notice 上的合计值会错。 */
export interface ShootingCast {
  artistId: number;
  artistName: string;
  /** 该艺人在这条通告里拿到的角色；null 表示角色都已被别人占满。 */
  role: RoleRecord | null;
  /** 这条通告 + 这个角色要拍几天（Length 表），0 表示静态表没这条。 */
  workDays: number;
  /** 每週最多能排几天。 */
  daysPerWeek: number;
  /** 存档里记的、这位艺人的已完成天数。 */
  doneDays: number;
  /** 存档里记的、这位艺人的酬劳，0 表示没读到。 */
  pay: number;
  /** 这位艺人还要再拍几天。 */
  needDays: number;
  /** 按每週上限折算，剩下的日子里最多还能排几天。 */
  canShootDays: number;
  risk: ShootingRisk;
  status: ShootingStatus;
}

export interface ShootingNotice {
  code: string;
  name: string;
  category: string;
  type: string;
  subtype: string;
  company: string;
  firmName: string;
  /** 角色与难度（星级），和筹备中表格同一套角色记录。 */
  roles: RoleRecord[];
  /** 接演的艺人，一人一条进度。 */
  casts: ShootingCast[];
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  /** 到杀青还剩几个日历日；NaN 表示存档没有档期可读。 */
  daysLeft: number;
  /** 这条通告最差的那位艺人的风险，用来给整条通告排序/标色。 */
  risk: ShootingRisk;
  offset: number;
}

/** 一位接演艺人自己在这条自制通告上的记录。 */
export interface SelfMadeCast {
  artistId: number;
  artistName: string;
  /** 这位艺人拿到的角色；null 表示角色格已经分配完。 */
  role: RoleRecord | null;
  /** 存档记的酬劳，0 表示没读到。 */
  pay: number;
  /** 是不是自己旗下的艺人。对手公司的演员只用来占角色格，不上表。 */
  mine: boolean;
  /** 这位艺人自己已经拍完的天数（存档 +8 那一格）。 */
  doneDays: number;
  /** 这位艺人还差几天 = 总天数 - 已完成；0 表示他那份拍完了。 */
  needDays: number;
  /** 这位艺人这条通告上总共要拍几天：优先取长度表，查不到才用存档的
   *  「已完成 + 还差」。 */
  workDays: number;
  /** 团体通告（角色名带「團體」）签约的是整个团，这里给出团名与成员；
   *  个人通告为 null。天数仍然算在这位接演艺人（通常是团长）身上。 */
  group: { name: string; leaderName: string; memberNames: string[] } | null;
}

/** 自制通告的档期状态，全部由块里的「开拍日 → 杀青日」推出来。
 *  `overdue` = 档期已经过去，但还有艺人没拍完（存档里「还差」不是 0）。 */
export type SelfMadeStatus = 'pending' | 'shooting' | 'done' | 'overdue' | 'unknown';

/** 「自制通告及其他」里的一条：玩家自己出品（少数沿用原厂牌署名）的通告。
 *
 *  真源是 CaseCreate 段 —— 段名后是 4 字节条数，然后每条 28 字节
 *  [编码 5×int32][类别][天数]。这份列表按制作顺序累积，Ending0004 里正好
 *  20 条，跟游戏「通告列表 → 自制通告及其他」的排列一一对应。
 *
 *  名字 / 类型 / 出品公司不在存档里，来自 data1 那份更全的静态表：三合一
 *  同装的 data 目录缺 CD6xx / CD7xx 这一批，20 条里有 10 条读不到名字。
 *
 *  要注意自制通告不进 CaseFirm（当期可接取列表），但有**自己一套档期**：
 *  块里按顺序躺着几个 [年][月][日][周几] 四元组，第一个永远是周一（开拍
 *  日），第二个是杀青日，再往后（有的块有）是上档 / 下档。所以进度状态
 *  完全由「今天」落在这段区间的哪一侧决定，跟拍摄中同一口径。 */
export interface SelfMadeNotice {
  /** 在自制列表里的序号，1 起，就是游戏里的排列顺序。 */
  seq: number;
  code: string;
  name: string;
  category: string;
  type: string;
  subtype: string;
  company: string;
  /** 存档里记的天数，与游戏列表名字后面的括号数字一致；0 表示没读到。 */
  days: number;
  /** Length 表的每週上限，用来估算要排几周；0 表示查不到。 */
  daysPerWeek: number;
  roles: RoleRecord[];
  /** 接演记录，按存档里的接取顺序；含对手公司的人，用 mine 区分。 */
  casts: SelfMadeCast[];
  /** 开拍日 / 杀青日，空的表示这一块读不到档期。 */
  startDate: string;
  endDate: string;
  startDay: number;
  endDay: number;
  /** 距杀青还有几个日历日；NaN 表示没有档期。 */
  daysLeft: number;
  /** 距开拍还有几个日历日；已经开拍时 ≤ 0，NaN 表示没有档期。 */
  daysToStart: number;
  status: SelfMadeStatus;
  offset: number;
}

/** 自制通告块里的一条接演记录长这样（24 字节）：
 *  [状态位 0..3][艺人编号 1..96][已完成天数][?][还差天数][酬劳]。
 *
 *  「已完成」在前（+8）、「还差」在后（+16）：Story0055 的卫亚（有朋自遠方來）
 *  读出来是 22 / 3 —— 拍了 22 天、还差 3 天，跟游戏界面对得上。
 *
 *  总天数不从这两个数相加，而是**先查长度表**（`notice-length.csv`，唱片 25 天
 *  这一类），因为「还差」那一格会被游戏中途改写（Story0055 的聆香已完成 10、
 *  记录里却写着还差 5，实际还差 15），相加会算少。只有长度表查不到时才退回
 *  「已完成 + 还差」。
 *
 *  块里还混着长度表、角色槽的一堆整数，单看形状会误报，所以要求酬劳是
 *  **万位整数**，并且只认连续排成一串的那一段（真接演总是连着的）。 */
function isSelfMadeCast(view: DataView, offset: number, limit: number): boolean {
  if (offset < 0 || offset + 24 > limit) return false;
  const flag = view.getUint32(offset, true);
  const artistId = view.getUint32(offset + 4, true);
  if (flag > 3 || artistId < 1 || artistId > 96) return false;
  const a = view.getUint32(offset + 8, true);
  const b = view.getUint32(offset + 12, true);
  const c = view.getUint32(offset + 16, true);
  const pay = view.getUint32(offset + 20, true);
  if (a > 999 || b > 99 || c > 99) return false;
  return pay >= 10000 && pay <= 100000000 && pay % 10000 === 0;
}

/** 读出这条自制通告的接演名单，并按接取顺序分配角色。
 *
 *  角色分配跟拍摄中完全一样：带着**全部**接演人一起走，对手公司的演员也
 *  占一格，否则自家艺人会落到别人那格上（男主角 / 男配角错位）。 */
function readSelfMadeCasts(
  view: DataView,
  start: number,
  end: number,
  mineIds: Set<number>,
  names: Map<number, string>,
  genders: Map<number, Gender>,
  roles: RoleRecord[],
  workOf: (role: RoleRecord | null) => number,
): SelfMadeCast[] {
  const limit = Math.min(end, view.byteLength);
  let bestStart = -1;
  let bestLen = 0;
  for (let o = start + 16; o + 24 <= limit; o += 4) {
    if (!isSelfMadeCast(view, o, limit)) continue;
    let len = 1;
    let p = o + 24;
    while (isSelfMadeCast(view, p, limit)) {
      len += 1;
      p += 24;
    }
    if (len > bestLen) {
      bestLen = len;
      bestStart = o;
    }
  }
  if (bestStart < 0) return [];

  const rows: SelfMadeCast[] = [];
  const claimed = new Set<string>();
  for (let i = 0; i < bestLen; i += 1) {
    const base = bestStart + i * 24;
    const artistId = view.getUint32(base + 4, true);
    const pay = view.getUint32(base + 20, true);
    const gender = genders.get(artistId) ?? 'any';
    let role = roles.find((item) => !claimed.has(item.roleCode) && canTakeRole(item, gender)) ?? null;
    if (role) claimed.add(role.roleCode);
    else if (roles.length === 1) role = roles[0];
    const doneDays = view.getUint32(base + 8, true);
    const savedNeed = view.getUint32(base + 16, true);
    // 总天数以长度表为准（唱片 25 / 连续剧主角 45…），「还差」那一格只在长度表
    // 查不到时才拿来兜底 —— 它会随进度被游戏改写，直接相加会少算。
    const tableWork = workOf(role);
    const workDays = tableWork > 0
      ? Math.max(tableWork, doneDays)
      : Math.max(doneDays, doneDays + savedNeed);
    rows.push({
      artistId,
      artistName: names.get(artistId) ?? `编号${artistId}`,
      role,
      pay,
      mine: mineIds.has(artistId),
      doneDays,
      needDays: Math.max(0, workDays - doneDays),
      workDays,
      group: null,
    });
  }
  return rows;
}

/** 自制通告块里的档期四元组，按块内顺序。
 *
 *  第一个是开拍日（全库 446 个块无一例外都是周一），第二个是杀青日；
 *  有的块后面还跟着上档 / 下档两个日期，这里一并返回，由调用方取前两个。 */
function readSelfMadeDates(view: DataView, start: number, end: number): DateTuple[] {
  const out: DateTuple[] = [];
  const limit = Math.min(end, view.byteLength);
  for (let o = start; o + 16 <= limit; o += 4) {
    const y = view.getUint32(o, true);
    const m = view.getUint32(o + 4, true);
    const d = view.getUint32(o + 8, true);
    const w = view.getUint32(o + 12, true);
    if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31 || w < 1 || w > 7) continue;
    out.push({ y, m, d, w, day: Math.floor(Date.UTC(y, m - 1, d) / 86400000) });
    o += 12;
  }
  return out;
}

/** CaseCreate 段：自制通告的编码清单，按制作顺序。
 *
 *  段名后面跟 4 字节条数，再 4 字节（固定值 5），然后每条 28 字节：
 *  [编码 5×int32][类别 4=唱片 / 2=电视][天数]。最后一条只有 24 字节（少了
 *  末尾那个字段），所以只读编码，天数另外从 Case 段的块头取。 */
function parseCaseCreate(
  view: DataView, blocks: Record<string, [number, number]>,
): string[] {
  const section = blocks.CaseCreate;
  if (!section) return [];
  const head = section[1];
  if (head + 12 > view.byteLength) return [];
  const count = view.getUint32(head, true);
  if (count > 400) return [];
  const out: string[] = [];
  for (let k = 0; k < count; k += 1) {
    const at = head + 8 + k * 28;
    if (at + 20 > view.byteLength) break;
    let code = '';
    for (let j = 0; j < 5; j += 1) {
      const v = view.getUint32(at + 4 * j, true);
      if (v < 0x20 || v > 0x7a) { code = ''; break; }
      code += String.fromCharCode(v);
    }
    if (!/^(?:CD|CF|MV|TV|SH|FS|TH|SP)[0-9A-Z]{3}$/.test(code)) break;
    out.push(code);
  }
  return out;
}

/** 剩下 N 个日历日、每週最多 M 天，最多还能排几天。 */
export function shootableDays(remaining: number, perWeek: number): number {
  if (!(remaining > 0) || !(perWeek > 0)) return 0;
  const weeks = Math.ceil(remaining / 7);
  return Math.min(remaining, weeks * perWeek);
}

/** 从通告块里读接取记录，一位艺人一条。
 *
 *  记录是 24 字节一条：
 *
 *      [状态位][艺人编号][已完成天数][?][?][酬劳]
 *
 *  即编号后紧跟完成天数，编号前 4 字节是个 0~3 的状态位，编号后 16 字节
 *  才是这位艺人拿到的酬劳。Auto(CF014 萧依莉 4 天 / 5000)、
 *  Ending0009(MV031 原少緯 34 天 / 1550 万、桑禾蓓 29 天 / 1450 万、
 *  天晴 22 天 / 31 万、林芬芬 22 天 / 150 万)、Story0007(MV601 衛亞 40 天 /
 *  1500 万、姚子奇 25 天 / 810 万) 都按这个形状对上。
 *
 *  块后面还有日期段，里面的年份/日号会撞上 1、2、6 这类小艺人编号，所以
 *  每条候选都要过筛：状态位 0~3、完成天数 ≤ 60、中间两个字段 ≤ 99、酬劳
 *  要么 0 要么 ≥ 1000。筛过之后同一艺人只取第一条，避免串到邻近档期。 */
function readProgress(
  view: DataView,
  start: number,
  end: number,
  ownerIds: number[],
): { artistId: number; doneDays: number; pay: number }[] {
  const rows: { artistId: number; doneDays: number; pay: number }[] = [];
  if (ownerIds.length === 0) return rows;
  const wanted = new Set(ownerIds);
  const from = start + 400;
  const limit = Math.min(end, view.byteLength);
  for (let o = from; o + 20 <= limit; o += 4) {
    const id = view.getUint32(o, true);
    if (!wanted.has(id)) continue;
    if (rows.some((row) => row.artistId === id)) continue;
    const flag = view.getUint32(o - 4, true);
    const done = view.getUint32(o + 4, true);
    const a = view.getUint32(o + 8, true);
    const b = view.getUint32(o + 12, true);
    const pay = view.getUint32(o + 16, true);
    if (flag > 3) continue;
    if (done > 60 || a > 99 || b > 99) continue;
    if (pay > 1e9) continue;
    if (pay > 0 && pay < 1000) continue;
    rows.push({ artistId: id, doneDays: done, pay });
  }
  return rows;
}

/** 从存档里抠出「我拥有的道具」清单。
 *
 *  存档没有给这段数据起段名，定位靠形态：一段连续的 16 字节小端记录
 *  `[编号, 状态码, 数量, 附字段]`。难点在于这段数据由密集的小整数堆成，
 *  从任意 4 字节偏移读都「长得像」一条记录，所以必须按 16 字节一步去扩段、
 *  并且要求编号**非递减**（真实清单 2→…→2038 是升序的，错位的读取会立刻
 *  出现 0 / 乱序而断掉）。取最长的一段即为道具清单。长度不够就当没找到。
 *
 *  注意：状态码**不能**拿来当过滤条件——它不是道具类型（类型在 Item.dat），
 *  存档里取值五花八门（Auto 里就见过 0/1/2/3/4/7/30/97/0xffffffff，其中
 *  0xffffffff 是借據、男孩的劇本这类剧情道具，97 是爱神巧克力）。按状态码
 *  白名单过滤会把清单从中间断成几段，「最长一段」就丢东西了（2026-11-14
 *  与游戏物品窗口截图核对：Auto 整段应检出 21 件拥有）。
 *
 *  数量 0 的行（店里的、曾经有过但用完的）也在这段里，调用方按需要过滤。 */
export function parseItems(view: DataView, bytes: Uint8Array): OwnedItem[] {
  const n = bytes.length;
  const isItemRow = (o: number): boolean => {
    if (o + 16 > n) return false;
    const code = view.getUint32(o, true);
    const qty = view.getUint32(o + 8, true);
    const meta = view.getUint32(o + 12, true);
    return (
      code > 0 && code < 100000 &&
      qty >= 0 && qty < 100000 &&
      meta >= 0 && meta < 1000
    );
  };
  let bestStart = -1;
  let bestLen = 0;
  let i = 0;
  while (i + 16 <= n) {
    if (!isItemRow(i)) {
      i += 4;
      continue;
    }
    let len = 0;
    let o = i;
    let lastCode = 0;
    while (o + 16 <= n && isItemRow(o)) {
      const code = view.getUint32(o, true);
      if (code < lastCode) break; // 编号必须非递减，错位读取会立刻断掉
      lastCode = code;
      len += 1;
      o += 16;
    }
    if (len > bestLen) {
      bestLen = len;
      bestStart = i;
    }
    i = o > i + 16 ? o : i + 4;
  }
  if (bestLen < 15) return [];
  const items: OwnedItem[] = [];
  for (let k = 0; k < bestLen; k += 1) {
    const o = bestStart + k * 16;
    items.push({
      code: view.getUint32(o, true),
      flag: view.getUint32(o + 4, true),
      quantity: view.getUint32(o + 8, true),
      meta: view.getUint32(o + 12, true),
    });
  }
  return items;
}

/** Parse one uploaded save. The buffer is a snapshot: the game may overwrite
 *  Auto.sa2 on disk at any moment, but this copy never changes. */
export function parseSave(
  buffer: ArrayBuffer,
  tables: CaseTables,
  saveName: string,
): ParseResult {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const blocks = findInt32Names(bytes, view, NAME_BLOCKS);
  if (!blocks.Case || !blocks.CaseEnd) {
    throw new Error('存档里找不到 Case / CaseEnd 段，可能不是明星志愿3 的 .sa2 存档，或版本不兼容。');
  }

  const [caseStart, caseEnd] = [blocks.Case[1], blocks.CaseEnd[0]];
  const roles = parseRoles(bytes, view, caseStart, caseEnd);
  const firm = blocks.CaseFirm ? parseCaseFirm(view, blocks.CaseFirm[1], bytes.length) : [];
  const codeBlocks = findCodeBlocks(view, caseStart, caseEnd);
  const currentDate = readCurrentDate(view, bytes.length);
  const company = parseCompany(bytes, view, blocks.Firm);
  const today = currentDate?.dayNumber ?? NaN;

  const artistStart = blocks.StarRoleQ ? blocks.StarRoleQ[1] : 0;
  const artistEnd = blocks.Firm ? blocks.Firm[0] : bytes.length;
  const friendship = parseFriendship(view, bytes);
  const artists = parseArtists(bytes, view, artistStart, artistEnd, friendship, tables.titles ?? {});
  const roster = parseRoster(bytes);
  // The state block carries the game's roster number at -16, so the panel can
  // show named artists instead of anonymous "状态块 #N" selectors.
  const artistDirectory: ArtistOption[] = ARTIST_DIRECTORY.map((entry) => {
    const block = artists.find((a) => a.roleId === entry.id) ?? null;
    return {
      ...entry,
      artistIndex: block?.index ?? null,
      signed: block?.signed ?? false,
      title: block?.title ?? '',
      abilities: block?.abilities ?? [],
    };
  });
  const signedArtistIds = artistDirectory.filter((a) => a.signed).map((a) => a.id);
  const teams = parseTeams(bytes, view, blocks);
  // 每个艺人接下的通告编码，用来判断通告池里哪个角色已经被别人占住。
  const ownersByCode = parseCaseOwners(bytes, view, artists, tables.stars, artistEnd);
  const items = parseItems(view, bytes).map((it) => {
    const meta = tables.items?.[String(it.code)];
    return {
      ...it,
      name: meta?.[0] ?? `道具 ${it.code}`,
      category: meta?.[1] ?? '',
      desc: meta?.[2] ?? '',
      stats: meta?.[3] ?? '',
    };
  });

  /** code -> best [open, start, end] triple found anywhere in the Case block. */
  const datesByCode: Record<string, DateTuple[]> = {};
  const batchRows: { code: string; company: string; kind: string; dates: DateTuple[] }[] = [];
  for (const block of codeBlocks) {
    const triple = scheduleDates(noticeDates(view, block.start, block.end));
    if (!triple) continue;
    const previous = datesByCode[block.code];
    if (!previous || triple[0].day > previous[0].day) datesByCode[block.code] = triple;
    const info = tables.cases[block.code];
    batchRows.push({
      code: block.code,
      company: info?.[3] ?? '',
      kind: categoryOf(block.code),
      dates: triple,
    });
  }

  // 只按「表里真正列出来的通告」归并批次：存档的 Case 段里还留着大量早已
  // 结束的历史通告，把它们算进来会冒出玩家根本没在等的批次（曾经显示 9 批）。
  const shownCodes = new Set(firm.map((item) => item.code));
  const byDay = new Map<number, UpdateBatch>();
  for (const row of batchRows) {
    if (!shownCodes.has(row.code)) continue;
    const day = row.dates[0].day;
    let batch = byDay.get(day);
    if (!batch) {
      batch = {
        date: fmtDate(row.dates[0]), dayNumber: day,
        label: WEEKDAYS[row.dates[0].w] ?? '',
        companies: [], kinds: [], codes: [],
        daysAway: Number.isFinite(today) ? day - today : NaN,
        scheduled: true,
      };
      byDay.set(day, batch);
    }
    if (row.company && !batch.companies.includes(row.company)) batch.companies.push(row.company);
    if (!batch.kinds.includes(row.kind)) batch.kinds.push(row.kind);
    if (!batch.codes.includes(row.code)) batch.codes.push(row.code);
  }
  const batches = [...byDay.values()].sort((a, b) => a.dayNumber - b.dayNumber);
  const nextUpdate = Number.isFinite(today)
    ? batches.find((batch) => batch.dayNumber > today) ?? null
    : null;
  /** 通告要拍几天、一周最多排几天，来自游戏的 Length 表。表的 key 是
   *  「通告种类|角色」：电视剧按 連續劇/單元劇/短片，电影/广告/唱片按 subtype，
   *  主持按节目类型（知性談話 等），唱片还要把 個人/團體 归到「唱片」下。 */
  const lengthOf = (code: string, info: string[] | undefined, role: string): number[] | null => {
    const type = info?.[1] ?? '';
    const subtype = info?.[2] ?? '';
    const kinds = [subtype, type, KIND_BY_PREFIX[code.slice(0, 2)] ?? ''];
    for (const kind of kinds) {
      if (!kind) continue;
      const hit = tables.length?.[`${kind}|${role}`];
      if (hit && hit[0]) return hit;
    }
    return null;
  };
  const unknownCodes: string[] = [];
  const notices: CaseNotice[] = firm.map((item) => {
    const info = tables.cases[item.code];
    if (!info) unknownCodes.push(item.code);
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === item.code);
    // 通告池里的编码只可能是当期通告，命中的艺人就是把它接走的人。角色记录里
    // 没有艺人编号，所以按性别落到第一个还对得上的角色（男→男主角，女→女主角）。
    const taken = new Set<string>();
    for (const owner of ownersByCode[item.code] ?? []) {
      const target = noticeRoles.find(
        (role) => !taken.has(role.roleCode) && canTakeRole(role, owner.gender),
      );
      if (!target) continue;
      target.reservedBy = owner.name;
      taken.add(target.roleCode);
    }
    for (const role of noticeRoles) {
      const grades = tables.needEffect[`${type}|${role.role}`];
      role.requirements = ATTRS
        .filter((attr) => role.values[attr])
        .map((attr) => ({
          attr,
          value: role.values[attr],
          staticGrade: grades ? GRADES[grades[ATTRS.indexOf(attr)]] ?? '' : '',
          rolledGrade: gradeOf(role.values[attr], role.star, tables.difficulty),
        }));
      // 社交门槛（叛逆/性感/亲和）是角色的隐藏接演条件，直接从存档读。
      // 它们没有 A/B/C 等级，用 social 标记让 UI 只显示「亲和 650」。
      for (const [key, attr] of [['rebellion', '叛逆'], ['sexy', '性感'], ['affinity', '亲和']] as const) {
        const value = role.social[key];
        if (value) role.requirements.push({ attr, value, staticGrade: '', rolledGrade: '', social: true });
      }
    }
    const length = noticeRoles
      .map((role) => lengthOf(item.code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;
    const triple = datesByCode[item.code];
    const openDate = triple ? fmtDate(triple[0]) : '';
    const periodStart = triple ? fmtDate(triple[1]) : '';
    const periodEnd = triple ? fmtDate(triple[2]) : '';
    const deadline = triple ? dayText(triple[1].day - 1) : '';
    const openDay = triple ? triple[0].day : NaN;
    const startDay = triple ? triple[1].day : NaN;
    const endDay = triple ? triple[2].day : NaN;
    const deadlineDay = startDay - 1;
    const execDays = endDay - startDay + 1;
    const daysToOpen = openDay - today;
    const daysToDeadline = deadlineDay - today;
    const daysToStart = startDay - today;
    const daysToEnd = endDay - today;
    const inProgress = Number.isFinite(today) && today >= startDay && today <= endDay;
    const executedDays = inProgress ? today - startDay + 1 : (today > endDay ? execDays : 0);
    const remainingDays = inProgress ? endDay - today : 0;
    let status: NoticeStatus = 'open';
    if (!triple) status = 'open';
    else if (daysToDeadline < 0) status = 'expired';
    else if (daysToOpen > 0) status = 'upcoming';
    else if (daysToDeadline <= 7) status = 'closing';
    return {
      code: item.code,
      name: name || '（存档专有 / 自制通告）',
      category: categoryOf(item.code),
      type, subtype, company,
      firmSlot: item.firm,
      firmName: tables.firms[String(item.firm)] ?? '',
      openDate, periodStart, periodEnd, deadline,
      execDays: Number.isFinite(execDays) ? execDays : 0,
      workDays: length?.[0] ?? 0,
      daysPerWeek: length?.[1] ?? 0,
      daysToOpen, daysToDeadline, daysToStart, daysToEnd,
      executedDays, remainingDays,
      status,
      roles: noticeRoles,
    };
  });

  /** 各公司开放接取、已经接下、还没杀青的通告。判定只认存档：通告块里留着
   *  接取记录（艺人 + 已完成天数 + 酬劳），并叠加「今天不晚于杀青日」。
   *  自家艺人都拍满天数的那条直接不列 —— 没有在赶期的人。只看自家艺人：
   *  对手公司的演员也占角色坑位，但不进表、不算风险。 */
  const shooting: ShootingNotice[] = [];
  const doneCodes = new Set<string>();
  const openCodes = new Set(firm.map((item) => item.code));
  // 玩家只关心自己公司的艺人：同一部戏里对手公司的演员照样有接取记录，
  // 但进度、酬劳、违约风险都跟玩家无关，不进表也不提醒。
  const mineIds = new Set(signedArtistIds);
  for (const block of codeBlocks) {
    if (doneCodes.has(block.code)) continue;
    // 还挂在 CaseFirm 里的说明是「筹备中、可接取」，即便已经有艺人预约，
    // 也留在上面那张表里，不进拍摄中。
    if (openCodes.has(block.code)) continue;
    const owners = ownersByCode[block.code] ?? [];
    if (owners.length === 0) continue;
    const progress = readProgress(view, block.start, block.end, owners.map((o) => o.id));
    if (progress.length === 0) continue;
    const triple = datesByCode[block.code];
    if (!triple) continue;
    const startDay = triple[1].day;
    const endDay = triple[2].day;
    // 存档的 Case 段里躺着大量早就杀青的旧块，它们的接取记录同样非零
    // （艺人作品清单是历史累积），所以杀青日一过就不再列。
    if (!Number.isFinite(today) || today > endDay) continue;
    const daysLeft = endDay - today;
    const info = tables.cases[block.code];
    const [, type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === block.code);
    const fallbackLength = noticeRoles
      .map((role) => lengthOf(block.code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;

    // 一位艺人一个角色：按存档里的接取顺序分配，男/女主角先落到性别对得上的那一格。
    // 已经分配出去的角色不再给别人，所以同一段对手戏不会被两个艺人共用一格。
    // 分配必须带着全部接演人一起走 —— 对手公司的演员也占着角色坑位，先把
    // 自家艺人挑出来再分，就会把他错放到别人那格上。
    const claimed = new Set<string>();
    const casts: ShootingCast[] = [];
    for (const row of progress) {
      const owner = owners.find((o) => o.id === row.artistId);
      const gender = owner?.gender ?? 'any';
      let role = noticeRoles.find((r) => !claimed.has(r.roleCode) && canTakeRole(r, gender)) ?? null;
      if (role) claimed.add(role.roleCode);
      // 只有一个角色的通告（团体、合唱一类），后接的人也占同一格。
      else if (noticeRoles.length === 1) role = noticeRoles[0];
      // 没有签约名单可参照时不做过滤，避免整档「拍摄中」被清空。
      if (mineIds.size > 0 && !mineIds.has(row.artistId)) continue;
      const length = (role ? lengthOf(block.code, info, role.role) : null) ?? fallbackLength;
      const workDays = length?.[0] ?? 0;
      const daysPerWeek = length?.[1] ?? 0;
      const done = workDays > 0 && row.doneDays >= workDays;
      const needDays = done ? 0 : workDays > 0 ? Math.max(0, workDays - row.doneDays) : 0;
      const canShoot = shootableDays(daysLeft, daysPerWeek);
      casts.push({
        artistId: row.artistId,
        artistName: owner?.name || `编号${row.artistId}`,
        role,
        workDays, daysPerWeek,
        doneDays: row.doneDays,
        pay: row.pay,
        needDays, canShootDays: canShoot,
        risk: done ? 'ok' : riskOf(needDays, canShoot, daysPerWeek),
        status: done ? 'done' : today < startDay ? 'pending' : 'shooting',
      });
    }
    if (casts.length === 0) continue;
    // 自家艺人都交差了就整条收起来：没有在赶期的人，写进表格只是噪音。
    if (casts.every((cast) => cast.status === 'done')) continue;

    const open = casts.filter((cast) => cast.status !== 'done');
    const risk = open.some((c) => c.risk === 'late') ? 'late'
      : open.some((c) => c.risk === 'tight') ? 'tight'
        : open.some((c) => c.risk === 'ok') ? 'ok' : 'unknown';

    doneCodes.add(block.code);
    shooting.push({
      code: block.code,
      name: info?.[0] || '（存档专有 / 自制通告）',
      category: categoryOf(block.code),
      type, subtype, company,
      firmName: '',
      roles: noticeRoles,
      casts,
      startDate: fmtDate(triple[1]),
      endDate: fmtDate(triple[2]),
      startDay, endDay, daysLeft,
      risk,
      offset: block.start,
    });
  }
  shooting.sort((a, b) => {
    const rank: Record<ShootingRisk, number> = { late: 0, tight: 1, unknown: 2, ok: 3 };
    if (rank[a.risk] !== rank[b.risk]) return rank[a.risk] - rank[b.risk];
    return (Number.isFinite(a.endDay) ? a.endDay : Infinity) - (Number.isFinite(b.endDay) ? b.endDay : Infinity);
  });


  // 自制通告及其它：CaseCreate 里列出来的、玩家自己出品的通告。名字要从静态
  // 表查（data1 那份才全），天数 / 档期 / 接演记录来自 Case 段的第一块。
  const nameOfArtist = new Map(artistDirectory.map((entry) => [entry.id, entry.name]));
  const genderOfArtist = new Map(artistDirectory.map((entry) => [entry.id, entry.gender]));
  const groupRecords = teams.map((team) =>
    buildGroupRecord(team, (id) => nameOfArtist.get(id) ?? `编号${id}`));
  const selfMade: SelfMadeNotice[] = parseCaseCreate(view, blocks).map((code, index) => {
    const info = tables.cases[code];
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === code);
    // 同一编码在 Case 段常常留着好几块（历次接演各一块），第一块就是游戏
    // 通告列表里显示的那条，天数与档期也取它。
    const block = codeBlocks.find((item) => item.code === code) ?? null;
    const rawDays = block ? view.getUint32(block.start + 24, true) : 0;
    const length = noticeRoles
      .map((role) => lengthOf(code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;
    // 档期：块里第一个日期是开拍（周一），第二个是杀青；后两个是上档 / 下档，
    // 不参与状态判断。开拍不是周一的块一律当没档期，宁可不显示也不猜。
    const stamps = block ? readSelfMadeDates(view, block.start, block.end) : [];
    const start = stamps[0] && stamps[0].w === 1 && stamps[1] ? stamps[0] : null;
    const finish = start ? stamps[1] : null;
    const startDay = start ? start.day : NaN;
    const endDay = finish ? finish.day : NaN;
    const casts = block
      ? readSelfMadeCasts(
        view, block.start, block.end, mineIds, nameOfArtist, genderOfArtist, noticeRoles,
        (role) => ((role ? lengthOf(code, info, role.role) : null) ?? length)?.[0] ?? 0,
      )
      : [];
    // 团体通告（角色名带「團體」）签的是整个团，不是团长一个人：表里写团名，
    // 天数仍算在这位接演艺人（一般就是团长）身上。
    for (const cast of casts) {
      if (!cast.role || !isGroupRole(cast.role)) continue;
      const group = groupRecords.find((item) => item.memberIds.includes(cast.artistId));
      if (group) {
        cast.group = {
          name: group.name,
          leaderName: group.leaderName,
          memberNames: group.memberNames,
        };
      }
    }
    let status: SelfMadeStatus = 'unknown';
    if (start && finish && Number.isFinite(today)) {
      status = today < startDay ? 'pending' : today <= endDay ? 'shooting' : 'done';
    }
    // 一个人都没接（连对手公司的都没有）就只能是「未开拍」—— 档期只是挂在
    // 通告列表上的排期，没人进组就谈不上拍摄中，更谈不上已完成。
    if (casts.length === 0) status = 'pending';
    else if (status === 'done') {
      // 结局存档会把已经杀青的通告的「已完成」清零（Ending0004 里全都是 0），
      // 档期已过又写着 0 的按拍满处理，否则一条拍完的戏会显示「0 / 45 还差 45」。
      for (const cast of casts) {
        if (cast.doneDays === 0 && cast.workDays > 0) {
          cast.doneDays = cast.workDays;
          cast.needDays = 0;
        }
      }
      // 档期过了却还有没拍完的人：不能算「已完成」，那是逾期。
      if (casts.some((cast) => cast.needDays > 0)) status = 'overdue';
    }
    return {
      seq: index + 1,
      code,
      name: name || '（自制通告）',
      category: categoryOf(code),
      type, subtype, company,
      days: rawDays > 0 && rawDays < 400 ? rawDays : 0,
      daysPerWeek: length?.[1] ?? 0,
      roles: noticeRoles,
      casts,
      startDate: start ? fmtDate(start) : '',
      endDate: finish ? fmtDate(finish) : '',
      startDay, endDay,
      daysLeft: Number.isFinite(endDay) && Number.isFinite(today) ? endDay - today : NaN,
      daysToStart: Number.isFinite(startDay) && Number.isFinite(today) ? startDay - today : NaN,
      status,
      offset: block?.start ?? 0,
    };
  });

  return {
    saveName,
    saveSize: bytes.length,
    readAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    blocks,
    roleRecordCount: roles.length,
    notices,
    shooting,
    selfMade,
    artists,
    friendship,
    artistDirectory,
    signedArtistIds,
    teams,
    roster,
    currentDate,
    company,
    batches,
    nextUpdate,
    unknownCodes: [...new Set(unknownCodes)],
    items,
  };
}

/** Shortfall of one artist against one role's rolled thresholds. */
export interface MatchResult {
  artistIndex: number;
  artistName: string;
  /** false when the role's gender rules the artist out entirely. */
  eligible: boolean;
  canAccept: boolean;
  /** 社交门槛差值带 social 标记，UI 用它把隐藏条件和九项数值换成不同颜色。 */
  gaps: { attr: string; need: number; have: number; diff: number; social?: boolean }[];
  missing: number;
}

export function matchRole(
  role: RoleRecord,
  artist: ArtistStats,
  artistName: string,
  gender: Gender = 'any',
): MatchResult {
  const gaps: MatchResult['gaps'] = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = artist.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  // 社交门槛与九项能力一起决定能否接演：叛逆/性感/亲和直接比艺人 social 前三项。
  for (const [key, attr, idx] of [['rebellion', '叛逆', 0], ['sexy', '性感', 1], ['affinity', '亲和', 2]] as const) {
    const need = role.social[key];
    if (!need) continue;
    const have = artist.social[idx] ?? 0;
    gaps.push({ attr, need, have, diff: need - have, social: true });
  }
  const missing = gaps.filter((gap) => gap.diff > 0);
  const eligible = canTakeRole(role, gender);
  return {
    artistIndex: artist.index,
    artistName,
    eligible,
    canAccept: eligible && missing.length === 0,
    gaps,
    missing: missing.length,
  };
}

/** CSV export, matching the columns shown in the reader. */
export function toCsv(result: ParseResult): string {
  const lines = [[
    '游戏日期', '通告编号', '通告名称', '大类', '节目类型', '制作公司',
    '开放接取', '停止接取', '距截止(天)', '执行开始', '执行结束', '执行天数',
    '工作天数', '每周上限',
    '已执行天数', '剩余天数', '角色', '预约艺人', '难度(星)', '所需数值', '静态等级',
  ]];
  for (const notice of result.notices) {
    for (const role of notice.roles) {
      const req = role.requirements;
      lines.push([
        result.currentDate?.text ?? '', notice.code, notice.name,
        notice.category, notice.type, notice.company,
        notice.openDate, notice.deadline,
        Number.isFinite(notice.daysToDeadline) ? String(notice.daysToDeadline) : '',
        notice.periodStart, notice.periodEnd, String(notice.execDays),
        notice.workDays ? String(notice.workDays) : '',
        notice.daysPerWeek ? String(notice.daysPerWeek) : '',
        String(notice.executedDays), String(notice.remainingDays),
        role.role, role.reservedBy, String(role.star),
        req.map((x) => `${x.attr}${x.value}`).join(' '),
        req.filter((x) => x.staticGrade).map((x) => `${x.attr}${x.staticGrade}`).join(' '),
      ]);
    }
  }
  return '\uFEFF' + lines
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}
