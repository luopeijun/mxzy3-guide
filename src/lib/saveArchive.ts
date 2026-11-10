/** Unified save envelope: one file that carries both the event-tracker progress
 *  and the CG collection, so a user moving between devices only juggles a single
 *  backup instead of one file per feature. The tracker half reuses the existing
 *  `TrackerArchive` envelope verbatim; the CG half is a tiny `{version,collected}`
 *  blob. Old tracker-only files (`stardom3-tracker-save`) are still accepted and
 *  simply import with no CG half. */
import { ARCHIVE_FORMAT, type TrackerArchive } from './trackerTransfer';
import { CG_CHANGED_EVENT, readCgRaw, writeCg } from './cg';

export const SAVE_FORMAT = 'mxzy3-save';
export const SAVE_VERSION = 1;

export interface CgPart {
  version: 1;
  collected: string[];
}

export interface SaveSummary {
  trackerLines: number;
  cgCollected: number;
  hasCg: boolean;
}

export interface SaveArchive {
  format: typeof SAVE_FORMAT;
  version: typeof SAVE_VERSION;
  exportedAt: string;
  summary: SaveSummary;
  tracker?: TrackerArchive;
  cg?: CgPart;
}

export function createSaveArchive(
  tracker: TrackerArchive,
  cg: CgPart,
  now: Date = new Date(),
): SaveArchive {
  return {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    exportedAt: now.toISOString(),
    summary: {
      trackerLines: tracker.summary.lines,
      cgCollected: cg.collected.length,
      hasCg: true,
    },
    tracker,
    cg,
  };
}

export function serialiseSaveArchive(archive: SaveArchive, pretty = true): string {
  return JSON.stringify(archive, null, pretty ? 2 : undefined);
}

/** `MXZY3-存档-20261110-1430.json` — sorts chronologically in a folder. */
export function saveArchiveFileName(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `MXZY3-存档-${stamp}.json`;
}

const BAD_INPUT = '读取不到存档内容，请确认选的是本页面导出的 .json 文件。';

export function parseSaveArchive(text: string): SaveArchive {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new Error('存档内容为空。');
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(BAD_INPUT);
  }
  if (!parsed || typeof parsed !== 'object') throw new Error(BAD_INPUT);
  const record = parsed as Record<string, unknown>;

  if (record.format === SAVE_FORMAT) {
    const tracker = record.tracker as TrackerArchive | undefined;
    const cg = record.cg as CgPart | undefined;
    const summary = (record.summary ?? {
      trackerLines: tracker?.summary?.lines ?? 0,
      cgCollected: cg?.collected?.length ?? 0,
      hasCg: Boolean(cg),
    }) as SaveSummary;
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
      summary,
      tracker,
      cg,
    };
  }

  if (record.format === ARCHIVE_FORMAT) {
    const tracker = record as unknown as TrackerArchive;
    return {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      exportedAt: typeof tracker.exportedAt === 'string' ? tracker.exportedAt : '',
      summary: {
        trackerLines: tracker.summary?.lines ?? 0,
        cgCollected: 0,
        hasCg: false,
      },
      tracker,
      cg: undefined,
    };
  }

  throw new Error(BAD_INPUT);
}

export function describeSaveSummary(summary: SaveSummary): string {
  const cg = summary.hasCg
    ? `${summary.cgCollected} 张 CG 已收集`
    : '不含 CG 收集';
  return `${summary.trackerLines} 条线有记录 · ${cg}`;
}

/** Union the incoming CG ids into whatever is already collected locally (read
 *  raw, so it needs no item list loaded) and persist. The CG collection is
 *  always merged, never replaced, so an import can never drop what is already
 *  ticked here. Notifies the mounted CG view to re-read. */
export function applyCgToLocal(incoming: string[]): void {
  const local = readCgRaw();
  const merged = new Set([...local, ...incoming]);
  writeCg(merged);
  window.dispatchEvent(new Event(CG_CHANGED_EVENT));
}
