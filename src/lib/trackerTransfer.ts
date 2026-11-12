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

/** Import/export tuning from the site config. 甜蜜乐章 uses its own format
 *  marker, so a 明星志愿3 save can never be imported there (or vice versa) —
 *  the line ids share no namespace and a wrong-site import would be garbage. */
export interface ArchiveOpts {
  format?: string;
  maxArtists?: number;
  protagonistId?: string;
  filePrefix?: string;
}

export interface ArchiveSummary {
  artists: number;
  lines: number;
  steps: number;
}

export interface TrackerArchive {
  format: string;
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
    // Tracked artists, not just the current roster — a released artist still
    // has lines worth exporting.
    artists: data.selectedArtists.length + data.releasedArtists.length,
    lines: Object.keys(data.lines).length,
    steps: countSavedSteps(data),
  };
}

export function createArchive(
  data: TrackerData,
  refs?: StepRefMap,
  now: Date = new Date(),
  opts?: ArchiveOpts,
): TrackerArchive {
  const archive: TrackerArchive = {
    format: opts?.format ?? ARCHIVE_FORMAT,
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
  opts?: ArchiveOpts,
): string {
  return JSON.stringify(createArchive(data, refs, now, opts), null, pretty ? 2 : undefined);
}

/** `MXZY3-进度-20261109-1420.json` — sorts chronologically in a folder. */
export function archiveFileName(now: Date = new Date(), filePrefix = 'MXZY3'): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}`;
  return `${filePrefix}-进度-${stamp}.json`;
}

const BAD_INPUT = '读取不到存档内容，请确认选的是本页面导出的 .json 文件。';

/** Accept an exported archive, and — because it costs nothing — a bare
 *  TrackerData blob (an old clipboard copy of localStorage). */
export function parseArchive(text: string, opts?: ArchiveOpts): TrackerArchive {
  const format = opts?.format ?? ARCHIVE_FORMAT;
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

  const sanitise = (raw: unknown): TrackerData =>
    sanitiseData(raw, { maxArtists: opts?.maxArtists, protagonistId: opts?.protagonistId });

  // Bare data: no envelope, but it carries lines + the v1 marker.
  if (record.format === undefined) {
    return {
      format,
      version: ARCHIVE_VERSION,
      exportedAt: '',
      summary: summarise(sanitise(record)),
      data: sanitise(record),
    };
  }
  if (record.format !== format) throw new Error(BAD_INPUT);
  // v1 had no step snapshot; its progress is taken at face value.
  if (record.version !== 1 && record.version !== 2) {
    throw new Error(`不认识的存档版本（v${String(record.version)}），请更新页面后再试。`);
  }
  const data = sanitise(record.data);
  const steps = normaliseStepRefs(record.steps);
  return {
    format,
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
export function mergeProgress(
  local: TrackerData,
  incoming: TrackerData,
  opts?: ArchiveOpts,
): TrackerData {
  const maxArtists = opts?.maxArtists ?? MAX_ARTISTS;
  const lines: Record<string, LineState> = {};
  for (const [id, state] of Object.entries(local.lines)) lines[id] = state;
  for (const [id, state] of Object.entries(incoming.lines)) {
    lines[id] = mergeLine(lines[id], state);
  }
  // Union both tracked lists. Local roster picks come first, then the incoming
  // roster; anything past the roster cap (or explicitly released on either
  // side) is tracked as released instead of being silently dropped.
  const union = Array.from(
    new Set([
      ...local.selectedArtists,
      ...incoming.selectedArtists,
      ...local.releasedArtists,
      ...incoming.releasedArtists,
    ]),
  );
  const released = new Set([...local.releasedArtists, ...incoming.releasedArtists]);
  const picked: string[] = [];
  const releasedArtists: string[] = [];
  for (const id of union) {
    if (released.has(id) || picked.length >= maxArtists) releasedArtists.push(id);
    else picked.push(id);
  }
  // The protagonist is never released and always keeps a roster slot.
  let selectedArtists = picked;
  if (opts?.protagonistId) {
    const protagonistId = opts.protagonistId;
    const rest = picked.filter((id) => id !== protagonistId).slice(0, maxArtists - 1);
    selectedArtists = [protagonistId, ...rest];
    for (let i = releasedArtists.length - 1; i >= 0; i -= 1) {
      if (releasedArtists[i] === protagonistId) releasedArtists.splice(i, 1);
    }
  }
  const order = Array.from(new Set([...local.order, ...incoming.order]));
  const pinned = Array.from(new Set([...local.pinned, ...incoming.pinned]));
  return {
    version: 1,
    selectedArtists,
    releasedArtists,
    lines,
    order,
    pinned,
    orderEpoch: ORDER_EPOCH,
  };
}

/** Replace is "use the file exactly as it is", except that `order`/`pinned`
 *  ids unknown to the file are dropped — the file is the source of truth. */
export function applyProgress(
  mode: 'merge' | 'replace',
  local: TrackerData,
  incoming: TrackerData,
  opts?: ArchiveOpts,
) {
  return mode === 'merge' ? mergeProgress(local, incoming, opts) : incoming;
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
