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
  /** company id -> name */
  firms: Record<string, string>;
}

export const EMPTY_TABLES: CaseTables = {
  source: '', cases: {}, needEffect: {}, length: {}, difficulty: [], stars: {}, firms: {},
};

export interface Requirement {
  attr: string;
  value: number;
  /** Grade from the static NeedEffect table. */
  staticGrade: string;
  /** Grade inferred from the value and the star's difficulty ranges. */
  rolledGrade: string;
}

export interface RoleRecord {
  code: string;
  roleCode: string;
  role: string;
  /** Gender required by this role, derived from its Big5 name. */
  gender: Gender;
  star: number;
  values: Record<string, number>;
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

/** One artist state block, read straight from the uploaded save. Field order
 *  was checked field-by-field against the game's save-editor panel. */
export interface ArtistStats {
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
  const gaps = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = leader?.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  const missing = gaps.filter((gap) => gap.diff > 0);
  return {
    artistIndex: leader?.index ?? -1,
    artistName: `${groupName}（队长 ${leaderName}）`,
    eligible: true,
    canAccept: missing.length === 0,
    gaps,
    missing: missing.length,
  };
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
  /** 自家艺人都拍完了的通告，最近 FINISHED_WINDOW_DAYS 天内的。 */
  finished: ShootingNotice[];
  /** 「自制通告及其他」：玩家自己出品的通告清单，按制作顺序。 */
  selfMade: SelfMadeNotice[];
  artists: ArtistStats[];
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
  /** Monday notice-update batches, oldest first. */
  batches: UpdateBatch[];
  /** First batch strictly after today, i.e. the next company refresh. */
  nextUpdate: UpdateBatch | null;
  /** Codes in CaseFirm that the bundled static tables do not know. */
  unknownCodes: string[];
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

    rows.push({
      code: tag.slice(0, 5),
      roleCode: tag,
      role,
      gender: roleGender(role),
      star,
      values,
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

/** Artist attribute blocks: nine abilities, stress/fatigue, a short Big5
 *  status label, the social stats and five notice counters. The 999 "cap"
 *  blocks that follow each real one are filtered out. */
function parseArtists(bytes: Uint8Array, view: DataView, start: number, end: number): ArtistStats[] {
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
    // One block per artist; keep the first so a stray later match cannot shadow it.
    if (seen.has(roleId)) continue;
    seen.add(roleId);
    const signed = o >= 8 && view.getUint32(o - 8, true) === 1;
    index += 1;
    out.push({
      abilities, stress, fatigue, social, gifts, noticeCounts, condition,
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
    const entry = stars?.[String(artist.roleId)];
    const gender: Gender = entry ? (entry[1] ? 'male' : 'female') : 'any';
    const name = entry?.[0] ?? `艺人 #${artist.roleId}`;
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

/** 已完成通告在「已完成」页签里保留多久（天）。
 *
 *  Case 段里躺着整段历史的旧通告块，接取记录也还在。全都列出来没意义，
 *  所以只看杀青日在最近一个月内的 —— 再早的玩家早就不关心了。 */
export const FINISHED_WINDOW_DAYS = 30;

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
  /** 存档记的酬劳，0 表示没读到。 */
  pay: number;
  /** 存档记的已完成天数。 */
  doneDays: number;
}

/** 「自制通告及其他」里的一条：玩家自己出品（少数沿用原厂牌署名）的通告。
 *
 *  真源是 CaseCreate 段 —— 段名后是 4 字节条数，然后每条 28 字节
 *  [编码 5×int32][类别][天数]。这份列表按制作顺序累积，Ending0004 里正好
 *  20 条，跟游戏「通告列表 → 自制通告及其他」的排列一一对应。
 *
 *  名字 / 类型 / 出品公司不在存档里，来自 data1 那份更全的静态表：三合一
 *  同装的 data 目录缺 CD6xx / CD7xx 这一批，20 条里有 10 条读不到名字。
 *
 *  要注意自制通告不进 CaseFirm（当期可接取列表），块里也没有普通通告那种
 *  「周一 / 周一 / 周日」三连档期，所以不能套拍摄中的风险算法；这里只列
 *  清单、存档记的天数、角色，以及已经被哪位艺人接走。 */
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
  /** 已经被接走的记录（存档里 pay > 0 的那几条）。 */
  casts: SelfMadeCast[];
  offset: number;
}

/** 自制通告块里的接演记录。
 *
 *  形状与普通通告一样（[状态位][艺人编号][已完成天数][?][?][酬劳]），但自制
 *  通告的块里还混着一堆长度表 / 角色槽的整数，宽松筛会误报。这里只认**有
 *  酬劳**的那几条 —— 真正接了才有钱，其余候选一律丢掉。仍只看自家艺人：
 *  对手公司的接演跟玩家的排期无关。 */
function readSelfMadeCasts(
  view: DataView,
  start: number,
  end: number,
  ownerIds: number[],
  names: Map<number, string>,
): SelfMadeCast[] {
  const rows: SelfMadeCast[] = [];
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
    if (flag > 3 || done > 60 || a > 99 || b > 99) continue;
    if (pay <= 0 || pay > 1e9) continue;
    rows.push({ artistId: id, artistName: names.get(id) ?? `艺人 #${id}`, pay, doneDays: done });
  }
  return rows;
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
  const today = currentDate?.dayNumber ?? NaN;

  const artistStart = blocks.StarRoleQ ? blocks.StarRoleQ[1] : 0;
  const artistEnd = blocks.Firm ? blocks.Firm[0] : bytes.length;
  const artists = parseArtists(bytes, view, artistStart, artistEnd);
  const roster = parseRoster(bytes);
  // The state block carries the game's roster number at -16, so the panel can
  // show named artists instead of anonymous "状态块 #N" selectors.
  const artistDirectory: ArtistOption[] = ARTIST_DIRECTORY.map((entry) => {
    const block = artists.find((a) => a.roleId === entry.id) ?? null;
    return {
      ...entry,
      artistIndex: block?.index ?? null,
      signed: block?.signed ?? false,
      abilities: block?.abilities ?? [],
    };
  });
  const signedArtistIds = artistDirectory.filter((a) => a.signed).map((a) => a.id);
  const teams = parseTeams(bytes, view, blocks);
  // 每个艺人接下的通告编码，用来判断通告池里哪个角色已经被别人占住。
  const ownersByCode = parseCaseOwners(bytes, view, artists, tables.stars, artistEnd);

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

  /** 已经在拍的通告。判定只认存档：通告块里留着接取记录（艺人 + 已完成天数
   *  + 酬劳），并且这条编码出现在该艺人的作品清单里。只看自家艺人：
   *  对手公司的演员也占角色坑位，但不进表、不算风险。 */
  const shooting: ShootingNotice[] = [];
  /** 自己旗下艺人都拍完了的通告，单独一档给「已完成」页签。 */
  const finished: ShootingNotice[] = [];
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
    // （艺人作品清单是历史累积），所以只留杀青日在最近一个月内的旧块。
    if (!Number.isFinite(today) || today > endDay + FINISHED_WINDOW_DAYS) continue;
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
    // 自家艺人都交差了：整条通告进「已完成」，不再算风险。
    const settled = casts.every((cast) => cast.status === 'done');
    if (!settled && !(today <= endDay)) continue;

    const open = casts.filter((cast) => cast.status !== 'done');
    const risk = !open.length
      ? 'ok'
      : open.some((c) => c.risk === 'late') ? 'late'
        : open.some((c) => c.risk === 'tight') ? 'tight'
          : open.some((c) => c.risk === 'ok') ? 'ok' : 'unknown';

    doneCodes.add(block.code);
    (settled ? finished : shooting).push({
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
  // 已完成：杀青日越近越靠前。
  finished.sort((a, b) => b.endDay - a.endDay);

  // 自制通告及其它：CaseCreate 里列出来的、玩家自己出品的通告。名字要从静态
  // 表查（data1 那份才全），天数 / 接演记录来自 Case 段的第一块。
  const nameOfArtist = new Map(artistDirectory.map((entry) => [entry.id, entry.name]));
  const selfMade: SelfMadeNotice[] = parseCaseCreate(view, blocks).map((code, index) => {
    const info = tables.cases[code];
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === code);
    // 同一编码在 Case 段常常留着好几块（历次接演各一块），第一块就是游戏
    // 通告列表里显示的那条，天数也取它。
    const block = codeBlocks.find((item) => item.code === code) ?? null;
    const rawDays = block ? view.getUint32(block.start + 24, true) : 0;
    const length = noticeRoles
      .map((role) => lengthOf(code, info, role.role))
      .find((hit): hit is number[] => Boolean(hit)) ?? null;
    return {
      seq: index + 1,
      code,
      name: name || '（自制通告）',
      category: categoryOf(code),
      type, subtype, company,
      days: rawDays > 0 && rawDays < 400 ? rawDays : 0,
      daysPerWeek: length?.[1] ?? 0,
      roles: noticeRoles,
      casts: block
        ? readSelfMadeCasts(view, block.start, block.end, signedArtistIds, nameOfArtist)
        : [],
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
    finished,
    selfMade,
    artists,
    artistDirectory,
    signedArtistIds,
    teams,
    roster,
    currentDate,
    batches,
    nextUpdate,
    unknownCodes: [...new Set(unknownCodes)],
  };
}

/** Shortfall of one artist against one role's rolled thresholds. */
export interface MatchResult {
  artistIndex: number;
  artistName: string;
  /** false when the role's gender rules the artist out entirely. */
  eligible: boolean;
  canAccept: boolean;
  gaps: { attr: string; need: number; have: number; diff: number }[];
  missing: number;
}

export function matchRole(
  role: RoleRecord,
  artist: ArtistStats,
  artistName: string,
  gender: Gender = 'any',
): MatchResult {
  const gaps = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = artist.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
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
