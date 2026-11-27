/** Per-week memo notes imported from the player's own Excel file.
 *
 *  The memo is INDEPENDENT of any save: once imported it is kept in its own
 *  localStorage key and stays put while the player swaps through any number
 *  of saves. Only a fresh import (or an explicit clear) replaces it.
 *
 *  The reader uses the first cell that looks like a date range to locate the
 *  week. Of the remaining columns only the two content columns the reader
 *  actually shows — 当周排班 and 心得备注 — become note cells; timeline helpers
 *  like 年 / 月 / 周次 stay in the sheet but are not displayed on the sticky note.
 */

export interface MemoCell {
  label: string;
  value: string;
}

export interface MemoWeek {
  /** Original date-range text, e.g. "2006.1.8-2006.1.14". */
  rangeText: string;
  fromDay: number;
  toDay: number;
  /** Displayed note columns (当周排班 / 心得备注), in sheet order. */
  cells: MemoCell[];
}

export interface MemoData {
  version: number;
  fileName: string;
  importedAt: number;
  columns: string[];
  weeks: MemoWeek[];
}

export const MEMO_STORAGE_KEY = 'mxzy3.case.memo.v1';
/** 甜蜜乐章便签独立存档，切站不串数据。 */
export const SWEET_MEMO_STORAGE_KEY = 'mxzy3.sweet.case.memo.v1';

/** Whole days since epoch (UTC avoids timezone drift). Mirrors caseParser.dayNumber. */
function dayNum(y: number, m: number, d: number): number {
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

const SEP = String.raw`[.\/年月]`;
const DASH = String.raw`\s*(?:-|–|—|~|至|到)\s*`;

/** Only these columns are shown in the sticky note; 年 / 月 / 周次 and the
 *  date range itself are timeline helpers, not note content. */
const MEMO_CONTENT_LABELS = new Set(['当周排班', '心得备注']);

/** Memos imported before the display filter was added already contain the
 *  timeline columns in localStorage (and may still sit in React state after a
 *  hot reload). Strip them on read AND at render so older imports immediately
 *  show only the two content columns without needing a re-import. */
export function memoDisplayCells(cells: MemoCell[] | undefined): MemoCell[] {
  if (!Array.isArray(cells)) return [];
  return cells.filter((cell) => MEMO_CONTENT_LABELS.has(cell.label));
}

/** Full range with a year on both ends: 2006.1.1-2006.1.7 / 2006年1月1日至2006年1月7日 */
const FULL_RANGE = new RegExp(
  String.raw`(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})${DASH}(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})`,
);
/** Trailing year omitted: 2006.12.31-1.6 (end year inherits the start year, +1 on wrap). */
const SHORT_RANGE = new RegExp(
  String.raw`(\d{4})${SEP}(\d{1,2})${SEP}(\d{1,2})${DASH}(\d{1,2})${SEP}(\d{1,2})`,
);

function nums(match: RegExpExecArray): number[] {
  return match.slice(1).map((part) => Number(part));
}

function rangeFrom(text: string): { from: number; to: number } | null {
  const full = FULL_RANGE.exec(text);
  if (full) {
    const [sy, sm, sd, ey, em, ed] = nums(full);
    return { from: dayNum(sy, sm, sd), to: dayNum(ey, em, ed) };
  }
  const short = SHORT_RANGE.exec(text);
  if (short) {
    const [sy, sm, sd, em, ed] = nums(short);
    const ey = em < sm ? sy + 1 : sy;
    return { from: dayNum(sy, sm, sd), to: dayNum(ey, em, ed) };
  }
  return null;
}

function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

/** Minimal shape of the SheetJS module we rely on. Kept loose so the real
 *  `xlsx` types (dynamic-imported at the call site) satisfy it without casts. */
export interface SheetJsLike {
  read: (data: ArrayBuffer, opts: object) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  utils: { sheet_to_json: (sheet: never, opts: object) => unknown[][] };
}

/** Parse a SheetJS workbook (ArrayBuffer) into memo weeks. */
export function parseMemoWorkbook(buffer: ArrayBuffer, fileName: string, XLSX: SheetJsLike): MemoData {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error('Excel 里没有工作表');
  const rows = XLSX.utils.sheet_to_json(sheet as never, { header: 1, defval: '', raw: false });
  if (!rows.length) throw new Error('Excel 里没有内容');

  const columns = rows[0].map((v) => toText(v));
  const weeks: MemoWeek[] = [];

  for (let r = 1; r < rows.length; r += 1) {
    const cells = rows[r].map((v) => toText(v));
    let rangeIndex = -1;
    let range: { from: number; to: number } | null = null;
    for (let c = 0; c < cells.length; c += 1) {
      const hit = rangeFrom(cells[c]);
      if (hit) { rangeIndex = c; range = hit; break; }
    }
    if (rangeIndex < 0 || !range) continue;   // skip blank / non-week rows
    const noteCells: MemoCell[] = [];
    for (let c = 0; c < cells.length; c += 1) {
      if (c === rangeIndex) continue;
      const label = columns[c] || `第${c + 1}列`;
      if (!MEMO_CONTENT_LABELS.has(label)) continue;
      if (!cells[c]) continue;
      noteCells.push({ label, value: cells[c] });
    }
    weeks.push({
      rangeText: cells[rangeIndex],
      fromDay: range.from,
      toDay: range.to,
      cells: noteCells,
    });
  }

  if (!weeks.length) throw new Error('没找到日期区间列。表头里请保留一列像 2006.1.1-2006.1.7 这样的日期区间');
  weeks.sort((a, b) => a.fromDay - b.fromDay);
  return {
    version: 1,
    fileName,
    importedAt: Date.now(),
    columns,
    weeks,
  };
}

/** Compact header label: repeat the year only when the week crosses years.
 *  2006.8.13-2006.8.19 → 2006.8.13–8.19
 *  2006.12.31-2007.1.6 → 2006.12.31–2007.1.6 */
export function formatWeekRange(rangeText: string): string {
  const full = FULL_RANGE.exec(rangeText);
  if (full) {
    const [sy, sm, sd, ey, em, ed] = nums(full);
    return sy === ey
      ? `${sy}.${sm}.${sd}–${em}.${ed}`
      : `${sy}.${sm}.${sd}–${ey}.${em}.${ed}`;
  }
  const short = SHORT_RANGE.exec(rangeText);
  if (short) {
    const [sy, sm, sd, em, ed] = nums(short);
    const ey = em < sm ? sy + 1 : sy;
    return sy === ey
      ? `${sy}.${sm}.${sd}–${em}.${ed}`
      : `${sy}.${sm}.${sd}–${ey}.${em}.${ed}`;
  }
  return rangeText;
}

/** Find the week whose date range contains the given game date. */
export function findCurrentWeek(
  memo: MemoData | null,
  date: { y: number; m: number; d: number } | null,
): MemoWeek | null {
  if (!memo || !date) return null;
  const day = dayNum(date.y, date.m, date.d);
  return memo.weeks.find((w) => day >= w.fromDay && day <= w.toDay) ?? null;
}

/** localStorage helpers — wrap in try/catch so private mode cannot break the page.
 *  两站共用同一套读写，只是 key 不同；主站仍走下面的 loadMemo / saveMemo。 */
export function loadMemoFrom(key: string): MemoData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw) as MemoData;
    if (data.version !== 1 || !Array.isArray(data.weeks)) return null;
    return {
      ...data,
      weeks: data.weeks.map((week) => ({ ...week, cells: memoDisplayCells(week.cells) })),
    };
  } catch {
    return null;
  }
}

export function saveMemoTo(key: string, data: MemoData | null): void {
  try {
    if (data) localStorage.setItem(key, JSON.stringify(data));
    else localStorage.removeItem(key);
  } catch {
    // ignore storage failures (private mode / quota)
  }
}

export function loadMemo(): MemoData | null {
  return loadMemoFrom(MEMO_STORAGE_KEY);
}

export function saveMemo(data: MemoData | null): void {
  saveMemoTo(MEMO_STORAGE_KEY, data);
}
