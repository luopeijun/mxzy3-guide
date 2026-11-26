/** 甜蜜乐章 `.sav` 存档解析（第一步：游戏时间 / 公司 / 艺人卡片）。

 *  甜蜜乐章存档与原版三合一完全不同：文件头 4 字节是「解压后长度」，
 *  随后是一段 zlib（78 9c）压缩流。解压后才是真正的存档数据。
 *
 *  已确认的定长字段（偏移都指解压后的字节流）：
 *   - 主角名 @0x04：NUL 结尾 Big5。
 *   - 公司名 @0x19：NUL 结尾 Big5。
 *   - 签约艺人槽位 @0x34 / @0x38 / @0x3c：3 个 int32 艺人编号，−1 表示空。
 *   - 游戏时间 @0x40：[年, 月, 日, 星期]（星期日=7）。
 *   - 艺人当前属性块：块头 `[327680][x][x][x][id][x][1][0]`（id 在 +16）后
 *     紧接九项 int32 能力（演技/口才/歌艺/名气/智慧/才艺/体能/仪态/自信，
 *     从 +32 起）。
 *
 *  性格 / 知名度 / 公关等字段尚未定位，第一步不读，避免读出错值。 */

export const SWEET_ABILITY_LABELS = [
  '演技', '口才', '歌艺', '名气', '智慧', '才艺', '体能', '仪态', '自信',
] as const;

export interface SweetArtistCard {
  id: number;
  name: string;
  abilities: number[];
}

export interface SweetSave {
  protagonist: string;
  company: string;
  date: { year: number; month: number; day: number; weekday: number };
  signedIds: number[];
  artists: SweetArtistCard[];
}

const BLOCK_MARK = 0x00050000; // 327680，艺人属性块头标记
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];

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

/** 扫描艺人属性块。返回 id -> 九项能力。 */
function scanArtists(bytes: Uint8Array, view: DataView): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let offset = 0; offset + 68 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) !== BLOCK_MARK) continue;
    const id = readI32(view, offset + 16);
    if (id < 1 || id > 110) continue;
    if (readI32(view, offset + 24) !== 1 || readI32(view, offset + 28) !== 0) continue;
    const abilities: number[] = [];
    let ok = true;
    for (let i = 0; i < 9; i += 1) {
      const value = readI32(view, offset + 32 + i * 4);
      if (value < 0 || value > 10000) { ok = false; break; }
      abilities.push(value);
    }
    if (ok && !out.has(id)) out.set(id, abilities);
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
  const blocks = scanArtists(bytes, view);
  const artists = signedIds.map((id) => ({
    id,
    name: stars[String(id)] ?? `艺人${id}`,
    abilities: blocks.get(id) ?? Array(9).fill(0),
  }));

  return {
    protagonist: readBig5(bytes, 0x04),
    company: readBig5(bytes, 0x19),
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
