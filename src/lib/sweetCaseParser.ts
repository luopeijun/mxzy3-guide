/** 甜蜜乐章 `.sav` 存档解析（第一步：游戏时间 / 公司 / 艺人卡片）。

 *  甜蜜乐章存档与原版三合一完全不同：文件头 4 字节是「解压后长度」，
 *  随后是一段 zlib（78 9c）压缩流。解压后才是真正的存档数据。
 *
 *  已确认的定长字段（偏移都指解压后的字节流）：
 *   - 主角名 @0x04：NUL 结尾 Big5。
 *   - 公司名 @0x19：NUL 结尾 Big5。
 *   - 签约艺人槽位 @0x34 / @0x38 / @0x3c：3 个 int32 艺人编号，−1 表示空。
 *   - 游戏时间 @0x40：[年, 月, 日, 星期]（星期日=7）。
 *   - 艺人当前属性块：`id` 在 +16，后接 `[x][1][0]`，九项 int32 能力从 +32 起
 *     （存档 ×10）；+68/+72 是压力/疲劳，+80 起 5 项是叛逆/性感/亲和/人气/
 *     曝光（后期存档人气会被 capped 到 999999，不能按 10000 拒绝整块），
 *     +264 起 8 项是电视/电影/唱片/广告/主持/舞台剧/走秀/演唱会的作品数；
 *     +332/+348 是两个 [年,月,日,星期] 合约日期四元组，+364 签约金，+368 分红
 *     （主角到期年 4049 是游戏里的长期合约标记，照样显示）。
 *     块有两种形态：带 327680 标记，或不带标记但 +76 为 5/7（沈惟真、主角
 *     常见）；只认标记会把这类艺人的压力/疲劳读成 0。
 *   - 友好度 / 礼物数：存档头部 16B 记录 `[友好度][送礼数][256|257][艺人编号]`，
 *     记录按 200B 步长排布，257 表示已签约；与主站同一套语义。
 *   - 公司形象 / 知名度 / 公关在 `Firm` 段：标记 `[4][\"Firm\\0\"]`，随后
 *     `[公司数][编号][名字字节数][Big5 名字][NUL][知名度][公关][0]`，
 *     编号 1 是我方；知名度与公关存档 ×10，界面按整数显示（向下取整）。
 *   - 艺人成绩（与主站同构的记事表）：`[条数][108]`，每条
 *     `[年][月][日][类型][事项][艺人编号]...[8B 作品编码]`。得奖是类型 5、
 *     事项 21..53；举办活动是类型 6、事项 61..63（歌友會/影友會/演唱會），
 *     规模在 +36、团体场看 +24 非零，团体名写在 +76。单份存档同时保留
 *     2008/2009/2010 的记录，年份取这里。
 *   - 我方团体与主站同构：`[编号101+][名字节长度][Big5 名字]`，名字后
 *     +28/+32 是成员编号（第 0 个队长），+24 是团体唱片数，尾部有「Invaid」
 *     类标记。52 号档是 101 稀奇古怪，成员 15 慕容和希 / 14 姚子奇。
 *   - 得奖记录表（艺人事件簿尾部）：15 条 48B 定长记录 + 一条「從缺」占位；
 *     只保留最近一年，用作艺人成绩表缺失时的兜底。 */


export const SWEET_ABILITY_LABELS = [
  '演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信',
] as const;

/** 甜蜜乐章比原版多舞台剧 / 走秀 / 演唱会，通告统计共 8 类。 */
export const SWEET_NOTICE_LABELS = [
  '电视', '电影', '唱片', '广告', '主持', '舞台剧', '走秀', '演唱会',
] as const;

/** 烘焙自 Data/AwardItem.dat 记录 1..15，顺序即得奖记录表的行序。 */
export const SWEET_AWARD_LABELS = [
  '最佳新人', '最佳演唱人', '最佳团体', '年度专辑',
  '最佳男主角', '最佳女主角', '最佳男配角', '最佳女配角',
  '最佳男演员', '最佳女演员', '最佳主持人', '年度戏剧',
  '最上镜头', '最佳模特儿', '最佳代言人',
] as const;

/** 艺人成绩记事里的事项编号，沿用主站 21..53 那一套。 */
const SWEET_DIARY_AWARD_NAMES: Record<number, string> = {
  21: '最佳新人', 22: '最佳演唱人', 23: '最佳团体', 24: '年度专辑',
  31: '最佳男主角', 32: '最佳女主角', 33: '最佳男配角', 34: '最佳女配角',
  41: '最佳男演员', 42: '最佳女演员', 43: '最佳主持人', 44: '年度戏剧',
  51: '最上镜头', 52: '最佳模特儿', 53: '最佳代言人',
};
const SWEET_DIARY_STRIDE = 108;
const SWEET_DIARY_AWARD_KIND = 5;
const SWEET_DIARY_CEREMONY: Record<number, string> = {
  2: '金曲奖', 3: '金像奖', 4: '金钟奖', 5: '金星奖',
};
/** 23 是团体荣誉，24 / 44 是公司作品奖；和主站同一套分流。 */
const SWEET_DIARY_GROUP_AWARD_IDS = new Set([23]);
const SWEET_DIARY_COMPANY_AWARD_IDS = new Set([24, 44]);
/** 与主站一致：类型 6 才是「举办活动」，61 歌友會 / 62 影友會 / 63 演唱會。 */
const SWEET_DIARY_EVENT_KIND = 6;
const SWEET_DIARY_EVENT_NAMES: Record<number, string> = {
  61: '歌友會', 62: '影友會', 63: '演唱會',
};
const SWEET_DIARY_EVENT_SCALE = ['', '大型', '中型', '小型'];

export interface SweetAward {
  year: number;
  month: number;
  day: number;
  ceremony: string;
  label: string;
  /** 得主名字：个人奖是艺人，团体奖是团名，公司奖是公司名。 */
  winner: string;
  /** 作品名；个人奖也会带作品，页面只给团体 / 年度作品奖显示。 */
  work: string;
  workCode: string;
  artistId: number;
  /** 与公司奖、个人奖互斥：只挂团体卡。 */
  group: boolean;
  /** 与主站一致：公司奖单列，个人奖挂到艺人卡。 */
  company: boolean;
}

/** 「艺人成绩」记事里的举办活动，团体场只挂团体卡。 */
export interface SweetEvent {
  year: number;
  month: number;
  day: number;
  date: string;
  /** 可直接显示，例如「大型團體演唱會」。 */
  label: string;
  kind: number;
  scale: number;
  group: boolean;
  /** 团体场的记事内嵌团名，读不到时由成员编号回查团体。 */
  groupName: string;
  artistId: number;
}

/** 我方团体：成员编号第 0 个是队长，名字来自存档。 */
export interface SweetTeam {
  code: number;
  name: string;
  memberIds: number[];
  memberNames: string[];
  leaderId: number;
  leaderName: string;
  workCount: number;
}

export interface SweetContract {
  signDate: string;
  expireDate: string;
  signingBonus: number;
  dividend: number;
}

export interface SweetArtistCard {
  id: number;
  name: string;
  /** 杜云芊固定占我方一位，这块没有 327680 标记，靠编号 1 + 结构定位。 */
  isProtagonist: boolean;
  /** 九项能力，存档 ×10，这里已 ÷10。 */
  abilities: number[];
  friendship: number;
  gifts: number;
  stress: number;
  fatigue: number;
  /** 叛逆 / 性感 / 亲和 / 人气 / 曝光。 */
  social: number[];
  noticeCounts: number[];
  /** 与主站同样只认合法合约日期；主角或占位块返回 null。 */
  contract: SweetContract | null;
}

export interface SweetSave {
  protagonist: string;
  company: string;
  companyImage: string;
  fame: number;
  pr: number;
  date: { year: number; month: number; day: number; weekday: number };
  signedIds: number[];
  artists: SweetArtistCard[];
  teams: SweetTeam[];
  awards: SweetAward[];
  /** 演唱会 / 影友會 / 歌友會：个人场挂艺人卡，团体场挂团体卡。 */
  events: SweetEvent[];
}

const BLOCK_MARK = 0x00050000; // 327680，艺人属性块头标记
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
// 社交五项里只有「人气」会被游戏 capped 到 999999（后期存档常见），其余仍 ≤10000。
const SOCIAL_LIMIT = 10000;
const POPULARITY_LIMIT = 999999;

type ArtistValues = Omit<SweetArtistCard, 'id' | 'name' | 'isProtagonist' | 'friendship' | 'gifts'>;

const EMPTY_VALUES: ArtistValues = {
  abilities: Array(9).fill(0),
  stress: 0,
  fatigue: 0,
  social: Array(5).fill(0),
  noticeCounts: Array(8).fill(0),
  contract: null,
};

function readI32(view: DataView, offset: number): number {
  return view.getInt32(offset, true);
}

/** NUL 结尾的 Big5 字符串。 */
function readBig5(bytes: Uint8Array, offset: number, limit = 64): string {
  let end = offset;
  const stop = Math.min(offset + limit, bytes.length);
  while (end < stop && bytes[end] !== 0) end += 1;
  if (end === offset) return '';
  try {
    return new TextDecoder('big5').decode(bytes.subarray(offset, end));
  } catch {
    return '';
  }
}

/** zlib 解压：前 4 字节是解压后长度，随后是 78 9c 压缩流。 */
async function inflateSave(file: File): Promise<Uint8Array> {
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const expected = new DataView(header.buffer).getUint32(0, true);
  const compressed = file.slice(4);
  const stream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream('deflate'));
  const raw = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expected && raw.byteLength !== expected) {
    throw new Error(`存档解压长度不符：期望 ${expected}，实得 ${raw.byteLength}`);
  }
  return raw;
}

/** `Firm` 段：编号 1 是我方，名字即公司形象文案；知名度/公关存档 ×10。 */
function readCompany(bytes: Uint8Array, view: DataView): {
  image: string; fame: number; pr: number;
} {
  const marker = [0x04, 0x00, 0x00, 0x00, 0x46, 0x69, 0x72, 0x6d, 0x00]; // [4]"Firm\0"
  let start = -1;
  for (let i = 0; i + marker.length <= bytes.length; i += 1) {
    let match = true;
    for (let k = 0; k < marker.length; k += 1) {
      if (bytes[i + k] !== marker[k]) { match = false; break; }
    }
    if (match) { start = i; break; }
  }
  const empty = { image: '', fame: 0, pr: 0 };
  if (start < 0) return empty;

  let offset = start + marker.length;
  const count = readI32(view, offset);
  offset += 4;
  if (count < 1 || count > 50) return empty;

  let result = empty;
  let found = false;
  for (let index = 0; index < count; index += 1) {
    const id = readI32(view, offset);
    offset += 4;
    const nameLength = readI32(view, offset);
    offset += 4;
    if (nameLength < 0 || nameLength > 64 || offset + nameLength + 13 > bytes.length) return empty;
    const name = readBig5(bytes, offset, nameLength);
    offset += nameLength;
    if (bytes[offset] === 0) offset += 1;
    const rawFame = readI32(view, offset);
    offset += 4;
    const rawPr = readI32(view, offset);
    offset += 4;
    const tail = readI32(view, offset);
    offset += 4;
    if (id !== index + 1 || tail !== 0 || rawFame < 0 || rawPr < 0) return empty;
    if (id === 1) {
      result = { image: name, fame: Math.floor(rawFame / 10), pr: Math.floor(rawPr / 10) };
      found = true;
    }
  }
  return found ? result : empty;
}

interface ArtistBlock {
  values: ArtistValues;
  score: number;
  /** 标记块最可信；无标记但 +76 为 5/7 的是真块，优先于普通噪声。 */
  priority: number;
}

/** 当前合约：块尾两个日期四元组 + 签约金 + 分红；主角用 4049 表示长期合约。 */
function readContract(
  view: DataView, offset: number, bytesLength: number, allowFarExpire = false,
): SweetContract | null {
  if (offset + 372 > bytesLength) return null;
  const sy = readI32(view, offset + 332);
  const sm = readI32(view, offset + 336);
  const sd = readI32(view, offset + 340);
  const ey = readI32(view, offset + 348);
  const em = readI32(view, offset + 352);
  const ed = readI32(view, offset + 356);
  const signingBonus = readI32(view, offset + 364);
  const dividend = readI32(view, offset + 368);
  const validDate = (y: number, m: number, d: number) =>
    y >= 2000 && y <= (allowFarExpire ? 9999 : 2100) && m >= 1 && m <= 12 && d >= 1 && d <= 31;
  if (!validDate(sy, sm, sd) || !validDate(ey, em, ed)) return null;
  if (signingBonus < 0 || dividend < 0 || dividend > 100) return null;
  return {
    signDate: `${sy}/${sm}/${sd}`,
    expireDate: `${ey}/${em}/${ed}`,
    signingBonus,
    dividend,
  };
}

/** 读一个艺人属性块的定长数值；越界或形状不对返回 null。 */
function readArtistBlock(
  view: DataView, offset: number, bytesLength: number, allowFarExpire = false,
): Omit<ArtistBlock, 'priority'> | null {
  const rawAbilities: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const value = readI32(view, offset + 32 + i * 4);
    if (value < 0 || value > 10000) return null;
    rawAbilities.push(value);
  }
  const stress = readI32(view, offset + 68);
  const fatigue = readI32(view, offset + 72);
  if (stress < 0 || stress > 1000 || fatigue < 0 || fatigue > 1000) return null;
  const social = Array.from({ length: 5 }, (_, i) => readI32(view, offset + 80 + i * 4));
  if (!social.every((value, index) => value >= 0
    && value <= (index === 3 ? POPULARITY_LIMIT : SOCIAL_LIMIT))) return null;
  const noticeCounts = Array.from({ length: 8 }, (_, i) => readI32(view, offset + 264 + i * 4));
  if (!noticeCounts.every((value) => value >= 0 && value <= 9999)) return null;
  return {
    values: {
      abilities: rawAbilities.map((value) => value / 10),
      stress,
      fatigue,
      social,
      noticeCounts,
      contract: readContract(view, offset, bytesLength, allowFarExpire),
    },
    score: rawAbilities.reduce((sum, value) => sum + value, 0),
  };
}

/** 扫描艺人属性块。标记块优先，其次是无标记但 +76 为 5/7 的真块。 */
function scanArtists(bytes: Uint8Array, view: DataView): Map<number, ArtistValues> {
  const best = new Map<number, ArtistBlock>();
  for (let offset = 0; offset + 296 <= bytes.length; offset += 1) {
    const id = readI32(view, offset + 16);
    if (id < 1 || id > 110 || id === 1) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const marked = view.getUint32(offset, true) === BLOCK_MARK;
    if (!marked && readI32(view, offset + 76) !== 5 && readI32(view, offset + 76) !== 7) continue;
    const block = readArtistBlock(view, offset, bytes.length);
    if (!block) continue;
    const priority = marked ? 2 : 1;
    const previous = best.get(id);
    if (previous && (previous.priority > priority
      || (previous.priority === priority && previous.score >= block.score))) continue;
    best.set(id, { ...block, priority });
  }
  return new Map([...best].map(([id, block]) => [id, block.values]));
}

/** 主角杜云芊的属性块也可能没有标记，且 +76 不一定是 5/7；取数值和最大的形状匹配块。 */
function scanProtagonist(bytes: Uint8Array, view: DataView): ArtistValues {
  let bestScore = -1;
  let result: ArtistValues = EMPTY_VALUES;
  for (let offset = 0; offset + 296 <= bytes.length; offset += 1) {
    if (readI32(view, offset + 16) !== 1) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const block = readArtistBlock(view, offset, bytes.length, true);
    if (!block || block.score <= bestScore) continue;
    bestScore = block.score;
    result = block.values;
  }
  return result;
}

/** 存档头部的友好度 / 送礼数表，记录 16B、按 200B 步长排布。 */
function scanRelations(view: DataView, bytes: Uint8Array): Map<number, { friendship: number; gifts: number }> {
  const out = new Map<number, { friendship: number; gifts: number }>();
  const limit = Math.min(bytes.length - 16, 10000);
  for (let offset = 0; offset < limit; offset += 1) {
    const friendship = readI32(view, offset);
    if (friendship < 0 || friendship > 999) continue;
    const gifts = readI32(view, offset + 4);
    if (gifts < 0 || gifts > 99) continue;
    const flag = readI32(view, offset + 8);
    if (flag !== 256 && flag !== 257) continue;
    const id = readI32(view, offset + 12);
    if (id < 1 || id > 110 || out.has(id)) continue;
    out.set(id, { friendship, gifts });
  }
  return out;
}

/** 得奖记录表：15 条 48B 记录 + 一条「從缺」；靠尾部占位反查表头。 */
function scanAwards(bytes: Uint8Array, year: number): SweetAward[] {
  const vacancy = [0xb1, 0x71, 0xaf, 0xca]; // Big5「從缺」
  const matchesAt = (offset: number) =>
    offset + vacancy.length <= bytes.length && vacancy.every((b, i) => bytes[offset + i] === b);
  for (let marker = 0; marker + 24 <= bytes.length; marker += 1) {
    if (!matchesAt(marker) || !matchesAt(marker + 20)) continue;
    const start = marker - 15 * 48;
    if (start < 0) continue;
    const rows: SweetAward[] = [];
    let ok = true;
    for (let index = 0; index < 15; index += 1) {
      const offset = start + index * 48;
      if (offset + 48 > bytes.length) { ok = false; break; }
      const winner = readBig5(bytes, offset, 16);
      const work = readBig5(bytes, offset + 20, 16);
      if (!winner || !work || winner === '從缺') { ok = false; break; }
      rows.push({
        year,
        month: 0,
        day: 0,
        ceremony: index < 4 ? '金曲奖' : index < 8 ? '金像奖' : index < 12 ? '金钟奖' : '金星奖',
        label: SWEET_AWARD_LABELS[index],
        winner,
        work,
        workCode: '',
        artistId: 0,
        group: index === 2,
        company: index === 3 || index === 11,
      });
    }
    if (ok) return rows;
  }
  return [];
}

/** 作品编码：8 字节 ASCII，NUL 结尾。 */
function readCode(bytes: Uint8Array, offset: number, limit = 8): string {
  let code = '';
  for (let i = 0; i < limit && offset + i < bytes.length; i += 1) {
    const byte = bytes[offset + i];
    if (!byte) break;
    if (byte < 0x20 || byte > 0x7e) return '';
    code += String.fromCharCode(byte);
  }
  return /^[A-Z]{2}[0-9A-Z]{3}$/.test(code) ? code : '';
}

/** 艺人成绩表在解压流里不一定 4 字节对齐；全档找 `[条数][108]` 且逐条日期合法的一处。 */
function findSweetDiaryTable(view: DataView, length: number): { offset: number; count: number } | null {
  let best: { offset: number; count: number } | null = null;
  for (let offset = 0; offset + 16 <= length; offset += 1) {
    const count = readI32(view, offset);
    if (count < 1 || count > 400 || readI32(view, offset + 4) !== SWEET_DIARY_STRIDE) continue;
    if (offset + 8 + count * SWEET_DIARY_STRIDE > length) continue;
    let ok = true;
    for (let i = 0; i < count && ok; i += 1) {
      const p = offset + 8 + i * SWEET_DIARY_STRIDE;
      const year = readI32(view, p);
      const month = readI32(view, p + 4);
      const day = readI32(view, p + 8);
      const kind = readI32(view, p + 12);
      const thing = readI32(view, p + 16);
      const artistId = readI32(view, p + 20);
      ok = year >= 2000 && year <= 2100 && month >= 1 && month <= 12
        && day >= 1 && day <= 31 && kind <= 40 && thing <= 99 && artistId <= 200;
    }
    if (ok && (!best || count > best.count)) best = { offset, count };
  }
  return best;
}

/** 从存档自带的成绩/作品记录里建立作品编码 → 作品名，供历史得奖记录回查。 */
function scanSweetWorkNames(bytes: Uint8Array, view: DataView): Map<string, string> {
  const out = new Map<string, string>();
  const stride = 1022;
  for (let offset = 0; offset + stride <= bytes.length; offset += 1) {
    const code = readCode(bytes, offset + 68, 5);
    if (!code || bytes[offset + 73] !== 0) continue;
    const kind = readI32(view, offset + 64);
    const nameLength = readI32(view, offset + 74);
    const field = readI32(view, offset + 78);
    if (kind < 1 || kind > 31 || nameLength < 1 || nameLength > 64 || field < 1 || field > 64) continue;
    const years = [readI32(view, offset + 4), readI32(view, offset + 20)];
    if (!years.every((year) => year >= 2000 && year <= 2099)) continue;
    const name = readBig5(bytes, offset + 90, 32);
    if (name && !out.has(code)) out.set(code, name);
  }
  return out;
}

/** 我方团体记录：与明星志愿3同构，但名字是紧排的 Big5，不像 .sa2 每字节占 4B。 */
function scanSweetTeams(bytes: Uint8Array, view: DataView, stars: Record<string, string>): SweetTeam[] {
  const marker = [73, 110, 118, 97, 105, 100]; // "Invaid"
  const out: SweetTeam[] = [];
  for (let o = 0; o + 128 <= bytes.length; o += 1) {
    const code = readI32(view, o);
    // 101..110 才是玩家可建的团体；111 起是游戏预设的 NPC 团体（馬麗安等），不能进我方卡。
    if (code < 101 || code > 110) continue;
    const nameBytes = readI32(view, o + 4);
    if (nameBytes < 4 || nameBytes > 24 || nameBytes % 2 !== 0) continue;
    const nameEnd = o + 8 + nameBytes + 1; // 名字后的 NUL
    if (bytes[nameEnd - 1] !== 0 || nameEnd + 56 > bytes.length) continue;
    const name = readBig5(bytes, o + 8, nameBytes);
    if (!/^[\u4e00-\u9fff]+$/.test(name)) continue;
    const ids = [0, 1, 2].map((j) => readI32(view, nameEnd + 28 + j * 4));
    const hasMarker = readI32(view, nameEnd + 44) === marker.length
      && marker.every((c, j) => bytes[nameEnd + 48 + j] === c);
    const shapeOk = readI32(view, nameEnd + 24) <= 99
      && ids[0] >= 1 && ids[0] <= 110 && ids[1] >= 1 && ids[1] <= 110
      && (ids[2] === 0 || (ids[2] >= 1 && ids[2] <= 110))
      && readI32(view, nameEnd + 40) === 0;
    if (!hasMarker && !shapeOk) continue;
    const memberIds = [...new Set(ids.filter((id) => id >= 1 && id <= 110))];
    const nameOf = (id: number) => stars[String(id)] ?? `艺人${id}`;
    const rawWorkCount = readI32(view, nameEnd + 24);
    out.push({
      code,
      name,
      memberIds,
      memberNames: memberIds.map(nameOf),
      leaderId: memberIds[0] ?? 0,
      leaderName: memberIds.length ? nameOf(memberIds[0]) : '',
      workCount: rawWorkCount >= 0 && rawWorkCount <= 99 ? rawWorkCount : 0,
    });
  }
  return out.sort((a, b) => a.code - b.code);
}

/** 艺人成绩里的举办活动：`[年][月][日][类型=6][事项=61..63][艺人编号]...`；
 *  +24 非零是团体场、+36 是规模（1 大型 / 2 中型 / 3 小型），团体名在 +76。 */
function scanDiaryEvents(
  bytes: Uint8Array,
  view: DataView,
  table: { offset: number; count: number } | null,
): SweetEvent[] {
  if (!table) return [];
  const rows: { event: SweetEvent; day: number }[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    if (readI32(view, p + 12) !== SWEET_DIARY_EVENT_KIND) continue;
    const kind = readI32(view, p + 16);
    const name = SWEET_DIARY_EVENT_NAMES[kind];
    if (!name) continue;
    const scale = readI32(view, p + 36);
    if (scale < 1 || scale > 3) continue;
    const artistId = readI32(view, p + 20);
    if (artistId < 1 || artistId > 110) continue;
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const group = readI32(view, p + 24) > 0;
    const groupName = group ? readBig5(bytes, p + 76, 16) : '';
    const key = `${year}/${month}/${day}|${kind}|${scale}|${group}|${artistId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      event: {
        year, month, day,
        date: `${year}/${month}/${day}`,
        label: `${SWEET_DIARY_EVENT_SCALE[scale]}${group ? '團體' : kind === 63 ? '個人' : ''}${name}`,
        kind, scale, group, groupName, artistId,
      },
      day: year * 10000 + month * 100 + day,
    });
  }
  return rows.sort((a, b) => a.day - b.day || a.event.artistId - b.event.artistId)
    .map((row) => row.event);
}

/**
 * 艺人成绩里的得奖记录：`[年][月][日][类型=5][事项=21..53][艺人编号]...[作品编码]`。
 * 这是与明星志愿3同构的真源，单份存档就能覆盖多年；事件簿尾部 48B 表只作兜底。
 */
function scanDiaryAwards(
  bytes: Uint8Array,
  view: DataView,
  protagonist: string,
  company: string,
  stars: Record<string, string>,
  table: { offset: number; count: number } | null,
): SweetAward[] {
  if (!table) return [];
  const workNames = scanSweetWorkNames(bytes, view);
  const rows: SweetAward[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < table.count; i += 1) {
    const p = table.offset + 8 + i * SWEET_DIARY_STRIDE;
    if (readI32(view, p + 12) !== SWEET_DIARY_AWARD_KIND) continue;
    const awardId = readI32(view, p + 16);
    const label = SWEET_DIARY_AWARD_NAMES[awardId];
    if (!label) continue;
    const artistId = readI32(view, p + 20);
    if (artistId < 1 || artistId > 110) continue;
    const year = readI32(view, p);
    const month = readI32(view, p + 4);
    const day = readI32(view, p + 8);
    const workCode = readCode(bytes, p + 56);
    const key = `${year}-${awardId}-${artistId}-${workCode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const groupAward = SWEET_DIARY_GROUP_AWARD_IDS.has(awardId);
    const companyAward = SWEET_DIARY_COMPANY_AWARD_IDS.has(awardId);
    const embeddedGroup = groupAward ? readBig5(bytes, p + 76, 16) : '';
    rows.push({
      year,
      month,
      day,
      ceremony: SWEET_DIARY_CEREMONY[Math.floor(awardId / 10)] ?? '',
      label,
      winner: groupAward ? (embeddedGroup || stars[String(artistId)] || `团体${artistId}`)
        : companyAward ? company
          : artistId === 1 ? protagonist : stars[String(artistId)] ?? `艺人${artistId}`,
      work: workNames.get(workCode) ?? (workCode || '作品未记录'),
      workCode,
      artistId,
      group: groupAward,
      company: companyAward,
    });
  }
  return rows.sort((a, b) => a.year - b.year || a.month - b.month || a.day - b.day || a.label.localeCompare(b.label));
}

export function formatSweetDate(date: SweetSave['date']): string {
  const w = WEEKDAYS[date.weekday - 1] ?? String(date.weekday);
  return `${date.year}年${date.month}月${date.day}日 星期${w}`;
}

export async function parseSweetSave(file: File, stars: Record<string, string>): Promise<SweetSave> {
  const bytes = await inflateSave(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 0x50) throw new Error('存档数据过短，不是有效的甜蜜乐章存档');

  const signedIds = [0x34, 0x38, 0x3c].map((o) => readI32(view, o)).filter((id) => id >= 1 && id <= 110);
  const protagonist = readBig5(bytes, 0x04);
  const company = readCompany(bytes, view);
  const blocks = scanArtists(bytes, view);
  const relations = scanRelations(view, bytes);
  const withRelation = (id: number, values: ArtistValues) => ({
    ...values,
    friendship: relations.get(id)?.friendship ?? 0,
    gifts: relations.get(id)?.gifts ?? 0,
  });
  const artists: SweetArtistCard[] = [
    {
      id: 1,
      name: protagonist || '杜云芊',
      isProtagonist: true,
      ...withRelation(1, scanProtagonist(bytes, view)),
    },
    ...signedIds.map((id): SweetArtistCard => ({
      id,
      name: stars[String(id)] ?? `艺人${id}`,
      isProtagonist: false,
      ...withRelation(id, blocks.get(id) ?? EMPTY_VALUES),
    })),
  ];

  const date = {
    year: readI32(view, 0x40),
    month: readI32(view, 0x44),
    day: readI32(view, 0x48),
    weekday: readI32(view, 0x4c),
  };
  const companyName = readBig5(bytes, 0x19);
  const teams = scanSweetTeams(bytes, view, stars);
  const diaryTable = findSweetDiaryTable(view, bytes.length);
  const diaryAwards = scanDiaryAwards(bytes, view, protagonist, companyName, stars, diaryTable);
  return {
    protagonist: readBig5(bytes, 0x04),
    company: companyName,
    companyImage: company.image,
    fame: company.fame,
    pr: company.pr,
    date,
    signedIds,
    artists,
    teams,
    awards: diaryAwards.length > 0 ? diaryAwards : scanAwards(bytes, date.year),
    events: scanDiaryEvents(bytes, view, diaryTable),
  };
}
