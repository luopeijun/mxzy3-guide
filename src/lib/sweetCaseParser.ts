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
 *     编号 1 是我方；知名度与公关存档 ×10，界面按整数显示（向下取整）。 */

export const SWEET_ABILITY_LABELS = [
  '演技', '口才', '歌艺', '名气', '仪态', '动感', '体能', '才智', '自信',
] as const;

/** 甜蜜乐章比原版多舞台剧 / 走秀 / 演唱会，通告统计共 8 类。 */
export const SWEET_NOTICE_LABELS = [
  '电视', '电影', '唱片', '广告', '主持', '舞台剧', '走秀', '演唱会',
] as const;

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

  return {
    protagonist: readBig5(bytes, 0x04),
    company: readBig5(bytes, 0x19),
    companyImage: company.image,
    fame: company.fame,
    pr: company.pr,
    date: {
      year: readI32(view, 0x40),
      month: readI32(view, 0x44),
      day: readI32(view, 0x48),
      weekday: readI32(view, 0x4c),
    },
    signedIds,
    artists,
  };
}
