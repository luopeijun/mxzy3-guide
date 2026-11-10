/** Save-file transfer: the JSON envelope written by "导出", plus the merge
 *  rules used when one device's progress lands on another. Deliberately free
 *  of DOM APIs so it can be unit tested and reused. */
import {
  MAX_ARTISTS,
  countSavedSteps,
  sanitiseData,
  type LineState,
  type LineStatus,
  type TrackerData,
} from './trackerData';
import { normaliseStepRefs, type StepRefMap } from './trackerReanchor';
import { ORDER_EPOCH } from './trackerOrder';

export const ARCHIVE_FORMAT = 'stardom3-tracker-save';
/** v2 adds the per-line step snapshot (`steps`) used to re-anchor progress
 *  after the guide data is rebuilt. v1 files are still accepted verbatim. */
export const ARCHIVE_VERSION = 2;

export interface ArchiveSummary {
  artists: number;
  lines: number;
  steps: number;
}

export interface TrackerArchive {
  format: typeof ARCHIVE_FORMAT;
  version: typeof ARCHIVE_VERSION;
  /** ISO timestamp of the export. */
  exportedAt: string;
  /** Human-readable size, so an import can be judged before applying it. */
  summary: ArchiveSummary;
  /** Which event every saved index pointed at. Absent in v1 archives. */
  steps?: StepRefMap;
  data: TrackerData;
}

function summarise(data: TrackerData): ArchiveSummary {
  return {
    artists: data.selectedArtists.length,
    lines: Object.keys(data.lines).length,
    steps: countSavedSteps(data),
  };
}

export function createArchive(
  data: TrackerData,
  refs?: StepRefMap,
  now: Date = new Date(),
): TrackerArchive {
  const archive: TrackerArchive = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: now.toISOString(),
    summary: summarise(data),
    data,
  };
  if (refs && Object.keys(refs).length > 0) archive.steps = refs;
  return archive;
}

export function serialiseArchive(
  data: TrackerData,
  refs?: StepRefMap,
  now?: Date,
  pretty = true,
): string {
  return JSON.stringify(createArchive(data, refs, now), null, pretty ? 2 : undefined);
}

/** `MXZY3-进度-20261109-1420.json` — sorts chronologically in a folder. */
export function archiveFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
  return `MXZY3-进度-${stamp}.json`;
}

const BAD_INPUT = '读取不到存档内容，请确认选的是本页面导出的 .json 文件。';

/** Accept an exported archive, and — because it costs nothing — a bare
 *  TrackerData blob (an old clipboard copy of localStorage). */
export function parseArchive(text: string): TrackerArchive {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('存档内容为空。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(BAD_INPUT);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(BAD_INPUT);
  const record = parsed as Partial<TrackerArchive> & Partial<TrackerData>;

  // Bare data: no envelope, but it carries lines + the v1 marker.
  if (record.format === undefined) {
    return {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: '',
      summary: summarise(sanitiseData(record)),
      data: sanitiseData(record),
    };
  }
  if (record.format !== ARCHIVE_FORMAT) throw new Error(BAD_INPUT);
  // v1 had no step snapshot; its progress is taken at face value.
  if (record.version !== 1 && record.version !== 2) {
    throw new Error(`不认识的存档版本（v${String(record.version)}），请更新页面后再试。`);
  }
  const data = sanitiseData(record.data);
  const steps = normaliseStepRefs(record.steps);
  return {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    summary: summarise(data),
    ...(steps ? { steps } : {}),
    data,
  };
}

function unionNumbers(a: number[], b: number[]): number[] {
  const set = new Set([...a, ...b]);
  return Array.from(set).sort((x, y) => x - y);
}

/** Merge one line. Done/skip sets are unioned; a skipped step wins over a done
 *  one so the union can never contain the same index twice. A non-active
 *  status from either side survives (abandoned/excluded beat "in the pool"),
 *  and local status wins when both sides already archived the line. */
function mergeLine(local: LineState | undefined, incoming: LineState): LineState {
  if (!local) return incoming;
  const skipped = unionNumbers(local.skipped, incoming.skipped);
  const done = unionNumbers(local.done, incoming.done).filter((i) => !skipped.includes(i));
  const status: LineStatus = local.status !== 'active' ? local.status : incoming.status;
  return { status, done, skipped };
}

/** Union of both saves — the safe default, since nothing already recorded on
 *  this device is ever dropped. */
export function mergeProgress(local: TrackerData, incoming: TrackerData): TrackerData {
  const lines: Record<string, LineState> = {};
  for (const [id, state] of Object.entries(local.lines)) lines[id] = state;
  for (const [id, state] of Object.entries(incoming.lines)) {
    lines[id] = mergeLine(lines[id], state);
  }
  // Keep the local artist picks first: they decide which lines are even shown.
  const artists = Array.from(new Set([...local.selectedArtists, ...incoming.selectedArtists])).slice(
    0,
    MAX_ARTISTS,
  );
  const order = Array.from(new Set([...local.order, ...incoming.order]));
  const pinned = Array.from(new Set([...local.pinned, ...incoming.pinned]));
  return {
    version: 1,
    selectedArtists: artists,
    lines,
    order,
    pinned,
    orderEpoch: ORDER_EPOCH,
  };
}

/** Replace is "use the file exactly as it is", except that `order`/`pinned`
 *  ids unknown to the file are dropped — the file is the source of truth. */
export function applyProgress(mode: 'merge' | 'replace', local: TrackerData, incoming: TrackerData) {
  return mode === 'merge' ? mergeProgress(local, incoming) : incoming;
}

export function formatArchiveTime(iso: string): string {
  if (!iso) return '未知时间';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未知时间';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function describeSummary(summary: ArchiveSummary): string {
  return `${summary.artists} 位艺人 · ${summary.lines} 条线有记录 · ${summary.steps} 个已处理步骤`;
}
