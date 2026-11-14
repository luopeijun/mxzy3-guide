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

/** Role reservations verified against the game screen for Auto.sa2. The save
 *  does not expose a reliable generic booking field, so the reader ships these
 *  two known cases and lets the player edit the mapping in the UI. */
export const DEFAULT_RESERVATIONS: Record<string, string> = {
  TV0211: '黎华',
  TV2211: '黎华',
};

/** The 18 signable artists, numbered as in the game's save-editor roster.
 *  The number is the game's own role id; each artist state block stores that
 *  same id 16 bytes before its nine abilities, so no guessing is needed. */
export interface ArtistDirectoryEntry {
  id: number;
  name: string;
  /** Traditional-Chinese spelling used by the save's Big5 name table. */
  traditional: string;
}

export const ARTIST_DIRECTORY: ArtistDirectoryEntry[] = [
  { id: 1, name: '林芬芬', traditional: '林芬芬' },
  { id: 2, name: '桑禾蓓', traditional: '桑禾蓓' },
  { id: 3, name: '欧怡青', traditional: '歐怡青' },
  { id: 4, name: '苏嫚君', traditional: '蘇嫚君' },
  { id: 5, name: '路敏', traditional: '路敏' },
  { id: 6, name: '萧依莉', traditional: '蕭依莉' },
  { id: 7, name: '天晴', traditional: '天晴' },
  { id: 8, name: '陈奕夫', traditional: '陳奕夫' },
  { id: 9, name: '关古威', traditional: '關古威' },
  { id: 10, name: '路风', traditional: '路風' },
  { id: 11, name: '纪翔', traditional: '紀翔' },
  { id: 12, name: '姚子奇', traditional: '姚子奇' },
  { id: 65, name: '姚子莹', traditional: '姚子瑩' },
  { id: 72, name: '克烈斯', traditional: '克烈斯' },
  { id: 74, name: '新名纱雪', traditional: '新名紗雪' },
  { id: 75, name: '聆香', traditional: '聆香' },
  { id: 76, name: '卫亚', traditional: '衛亞' },
  { id: 77, name: '原少纬', traditional: '原少緯' },
];

/** Ids 78 / 79 are placeholder blocks whose nine abilities are all 1111. */
export const PLACEHOLDER_ARTIST_IDS = [78, 79];

const PREFIXES = ['CD', 'CF', 'MV', 'TV', 'SH', 'FS', 'TH', 'SP'];
const NAME_BLOCKS = [
  'Case', 'CaseEnd', 'CaseFirm', 'CaseCreate', 'PrepareCase',
  'StarRoleQ', 'Firm', 'Schedule',
];

export interface CaseTables {
  source: string;
  /** code -> [name, type, subtype, company] */
  cases: Record<string, string[]>;
  /** `type|role` -> nine ability grades (0 none, 1 A, 2 B, 3 C, 4 D) */
  needEffect: Record<string, number[]>;
  /** star 1..5 -> [[A lo,hi], [B lo,hi], [C lo,hi], [D lo,hi]] */
  difficulty: number[][][];
  /** company id -> name */
  firms: Record<string, string>;
}

export const EMPTY_TABLES: CaseTables = {
  source: '', cases: {}, needEffect: {}, difficulty: [], firms: {},
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

/** One Monday update batch of a production company, read from every notice
 *  block in the save (not only the eleven currently registered ones). */
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

export interface ParseResult {
  saveName: string;
  saveSize: number;
  readAt: string;
  blocks: Record<string, [number, number]>;
  roleRecordCount: number;
  notices: CaseNotice[];
  artists: ArtistStats[];
  /** The 18 signable artists, resolved against the state blocks in this save. */
  artistDirectory: ArtistOption[];
  /** Numbers of the artists the save marks as signed (1..4 of them). */
  signedArtistIds: number[];
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
  reservations: Record<string, string>,
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
      star,
      values,
      requirements: [],
      reservedBy: reservations[tag] ?? '',
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
  let index = 0;
  for (let o = Math.max(0, start); o + 140 <= Math.min(end, bytes.length); o += 4) {
    const abilities = Array.from({ length: 9 }, (_, j) => view.getUint32(o + 4 * j, true));
    if (!abilities.every((v) => v > 100 && v <= 6000)) continue;
    const stress = view.getUint32(o + 36, true);
    const fatigue = view.getUint32(o + 40, true);
    if (stress >= 300 || fatigue >= 300) continue;
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
    if (!social.every((v) => v <= 2000)) continue;
    const gifts = view.getUint32(socialAt + 20, true);
    const noticeCounts = Array.from({ length: 5 }, (_, j) => view.getUint32(socialAt + 24 + 4 * j, true));
    if (!noticeCounts.every((v) => v <= 9999)) continue;
    // Ids 78 / 79 are unused template blocks whose nine abilities are all 1111.
    if (abilities.every((v) => v === abilities[0])) continue;
    const roleId = o >= 16 ? view.getUint32(o - 16, true) : 0;
    if (PLACEHOLDER_ARTIST_IDS.includes(roleId)) continue;
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

/** Parse one uploaded save. The buffer is a snapshot: the game may overwrite
 *  Auto.sa2 on disk at any moment, but this copy never changes. */
export function parseSave(
  buffer: ArrayBuffer,
  tables: CaseTables,
  saveName: string,
  reservations: Record<string, string> = DEFAULT_RESERVATIONS,
): ParseResult {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const blocks = findInt32Names(bytes, view, NAME_BLOCKS);
  if (!blocks.Case || !blocks.CaseEnd) {
    throw new Error('存档里找不到 Case / CaseEnd 段，可能不是明星志愿3 的 .sa2 存档，或版本不兼容。');
  }

  const [caseStart, caseEnd] = [blocks.Case[1], blocks.CaseEnd[0]];
  const roles = parseRoles(bytes, view, caseStart, caseEnd, reservations);
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

  // Group every scheduled notice block by its Monday open date.
  const byDay = new Map<number, UpdateBatch>();
  for (const row of batchRows) {
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
  const unknownCodes: string[] = [];
  const notices: CaseNotice[] = firm.map((item) => {
    const info = tables.cases[item.code];
    if (!info) unknownCodes.push(item.code);
    const [name = '', type = '', subtype = '', company = ''] = info ?? [];
    const noticeRoles = roles.filter((role) => role.code === item.code);
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
      daysToOpen, daysToDeadline, daysToStart, daysToEnd,
      executedDays, remainingDays,
      status,
      roles: noticeRoles,
    };
  });

  return {
    saveName,
    saveSize: bytes.length,
    readAt: new Date().toLocaleString('zh-CN', { hour12: false }),
    blocks,
    roleRecordCount: roles.length,
    notices,
    artists,
    artistDirectory,
    signedArtistIds,
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
  canAccept: boolean;
  gaps: { attr: string; need: number; have: number; diff: number }[];
  missing: number;
}

export function matchRole(role: RoleRecord, artist: ArtistStats, artistName: string): MatchResult {
  const gaps = ATTRS
    .filter((attr) => role.values[attr])
    .map((attr) => {
      const need = role.values[attr];
      const have = artist.abilities[ATTRS.indexOf(attr)] ?? 0;
      return { attr, need, have, diff: need - have };
    });
  const missing = gaps.filter((gap) => gap.diff > 0);
  return {
    artistIndex: artist.index,
    artistName,
    canAccept: missing.length === 0,
    gaps,
    missing: missing.length,
  };
}

/** CSV export, matching the columns shown in the reader. */
export function toCsv(result: ParseResult): string {
  const lines = [[
    '游戏日期', '通告编号', '通告名称', '大类', '节目类型', '制作公司',
    '开放接取', '停止接取', '距截止(天)', '执行开始', '执行结束', '执行天数',
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
