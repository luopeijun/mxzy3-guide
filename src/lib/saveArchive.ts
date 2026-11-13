/** Unified save envelope: one file that carries the event-tracker progress, the
 *  CG collection, and (on 明星志愿3 only) the six-specials board, so a user
 *  moving between devices only juggles a single backup instead of one file per
 *  feature. The tracker half reuses the existing `TrackerArchive` envelope
 *  verbatim; the CG half is a tiny `{version,collected}` blob; the specials half
 *  is the full board state. Old tracker-only files (`stardom3-tracker-save` /
 *  `sweet-tracker-save`) and old two-part saves (no specials) are still accepted
 *  and simply import with no specials half.
 *
 *  Everything site-specific (envelope marker, CG storage key, file-name prefix)
 *  comes in through `SaveOpts`, so 甜蜜乐章 can reuse this file for its own
 *  progress + CG save without a single `if (site === ...)` here. */
import type { ArchiveOpts, TrackerArchive } from './trackerTransfer';
import { parseArchive } from './trackerTransfer';
import type { SpecialsState } from './specialsState';
import { CG_CHANGED_EVENT, CG_KEY, readCgRaw, writeCg } from './cg';

/** 明星志愿3 的统一存档标记；甜蜜乐章用 `sweet-save`（见 TrackerSiteConfig），
 *  两站的存档因此永远不会被互相导入。 */
export const SAVE_FORMAT = 'mxzy3-save';
export const SAVE_VERSION = 1;

export interface CgPart {
  version: 1;
  collected: string[];
}

export interface SpecialsPart {
  version: 1;
  state: SpecialsState;
}

export interface SaveSummary {
  trackerLines: number;
  cgCollected: number;
  hasCg: boolean;
  specialsEnabled: number;
  hasSpecials: boolean;
}

export interface SaveArchive {
  format: string;
  version: typeof SAVE_VERSION;
  exportedAt: string;
  summary: SaveSummary;
  tracker?: TrackerArchive;
  cg?: CgPart;
  specials?: SpecialsPart;
}

/** Per-site wiring of the envelope itself. `tracker` carries the roster rules
 *  (cap / protagonist) plus the legacy tracker-only marker this site accepts,
 *  so a file exported by the other site is rejected outright. */
export interface SaveOpts {
  /** This site's unified marker (`mxzy3-save` / `sweet-save`). */
  format: string;
  /** Exported file-name prefix (`MXZY3` / `甜蜜乐章`). */
  filePrefix: string;
  /** localStorage key the CG half is read from and written to
   *  (`guide.cg.v1` / `sweet.cg.v1`). */
  cgKey: string;
  tracker: ArchiveOpts;
}

export function createSaveArchive(
  tracker: TrackerArchive,
  cg: CgPart,
  specials: SpecialsPart | undefined,
  now: Date,
  opts: SaveOpts,
): SaveArchive {
  return {
    format: opts.format,
    version: SAVE_VERSION,
    exportedAt: now.toISOString(),
    summary: {
      trackerLines: tracker.summary.lines,
      cgCollected: cg.collected.length,
      hasCg: true,
      specialsEnabled: specials ? specials.state.enabled.length : 0,
      hasSpecials: Boolean(specials),
    },
    tracker,
    cg,
    ...(specials ? { specials } : {}),
  };
}

export function serialiseSaveArchive(archive: SaveArchive, pretty = true): string {
  return JSON.stringify(archive, null, pretty ? 2 : undefined);
}

/** `MXZY3-存档-20261110-1430.json` / `甜蜜乐章-存档-….json` — sorts
 *  chronologically in a folder. */
export function saveArchiveFileName(now: Date, prefix: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${prefix}-存档-${stamp}.json`;
}

const BAD_INPUT = '读取不到存档内容，请确认选的是本页面导出的 .json 文件。';

export function parseSaveArchive(text: string, opts: SaveOpts): SaveArchive {
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

  if (record.format === opts.format) {
    const tracker = record.tracker as TrackerArchive | undefined;
    const cg = record.cg as CgPart | undefined;
    const specials = record.specials as SpecialsPart | undefined;
    const summary = (record.summary ?? {
      trackerLines: tracker?.summary?.lines ?? 0,
      cgCollected: cg?.collected?.length ?? 0,
      hasCg: Boolean(cg),
      specialsEnabled: specials?.state?.enabled?.length ?? 0,
      hasSpecials: Boolean(specials),
    }) as SaveSummary;
    return {
      format: opts.format,
      version: SAVE_VERSION,
      exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
      summary,
      tracker,
      cg,
      ...(specials ? { specials } : {}),
    };
  }

  // Tracker-only saves (or a bare TrackerData blob pasted from an old version):
  // accepted only for this site's own legacy marker, so a 明星志愿3 进度文件
  // still cannot be dropped into 甜蜜乐章 (or the other way round).
  const legacy = typeof record.format === 'string' ? record.format : '';
  if (!legacy || opts.tracker.format === legacy) {
    const tracker = parseArchive(trimmed, opts.tracker);
    return {
      format: opts.format,
      version: SAVE_VERSION,
      exportedAt: typeof tracker.exportedAt === 'string' ? tracker.exportedAt : '',
      summary: {
        trackerLines: tracker.summary?.lines ?? 0,
        cgCollected: 0,
        hasCg: false,
        specialsEnabled: 0,
        hasSpecials: false,
      },
      tracker,
      cg: undefined,
      specials: undefined,
    };
  }

  throw new Error(BAD_INPUT);
}

/** `hasSpecials` comes from the site config: 甜蜜乐章 has no 六大通告 board, so
 *  its summary must not mention one (主站输出与此前逐字一致). */
export function describeSaveSummary(summary: SaveSummary, hasSpecials = true): string {
  const cg = summary.hasCg ? `${summary.cgCollected} 张 CG 已收集` : '不含 CG 收集';
  if (!hasSpecials) return `${summary.trackerLines} 条线有记录 · ${cg}`;
  const specials = summary.hasSpecials
    ? `${summary.specialsEnabled} 张通告已配置`
    : '不含六大通告';
  return `${summary.trackerLines} 条线有记录 · ${cg} · ${specials}`;
}

/** Union the incoming CG ids into whatever is already collected locally (read
 *  raw, so it needs no item list loaded) and persist. The CG collection is
 *  always merged, never replaced, so an import can never drop what is already
 *  ticked here. Notifies the mounted CG view to re-read. `key` is the site's CG
 *  storage key — 甜蜜乐章 writes `sweet.cg.v1`, never the 明星志愿3 pool. */
export function applyCgToLocal(incoming: string[], key: string = CG_KEY): void {
  const local = readCgRaw(key);
  const merged = new Set([...local, ...incoming]);
  writeCg(merged, key);
  window.dispatchEvent(new Event(CG_CHANGED_EVENT));
}
