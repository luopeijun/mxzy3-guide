/** Shared shape of the tracker save file. Extracted from the provider so the
 *  import/export layer can validate external input with exactly the same rules
 *  that localStorage reads use. */

export const MAX_ARTISTS = 4;

export type LineStatus = 'active' | 'abandoned' | 'excluded';

export interface LineState {
  status: LineStatus;
  /** Event array indices the user has marked done on this line. */
  done: number[];
  /** Event array indices the user gave up on. A skipped step is removed from
   *  `done` and no longer counts towards completing the line. */
  skipped: number[];
}

export interface TrackerData {
  version: 1;
  selectedArtists: string[];
  lines: Record<string, LineState>;
  /** Manual drag order of event-pool line ids (full list, pinned included). */
  order: string[];
  /** Pinned line ids, in pin order — always rendered above the rest. */
  pinned: string[];
}

export function emptyData(): TrackerData {
  return { version: 1, selectedArtists: [], lines: {}, order: [], pinned: [] };
}

function indexList(raw: unknown): number[] {
  return Array.isArray(raw)
    ? Array.from(
        new Set(
          raw.filter(
            (i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0,
          ),
        ),
      )
    : [];
}

/** Older records predate step skipping (and were never validated at all): fill
 *  in `skipped` and drop anything that is not a non-negative integer index. */
export function normaliseLines(raw: unknown): Record<string, LineState> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, LineState> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Partial<LineState>;
    const status: LineStatus =
      entry.status === 'abandoned' || entry.status === 'excluded' ? entry.status : 'active';
    const skipped = indexList(entry.skipped);
    // A step that is skipped is by definition not done; keep them disjoint.
    const done = indexList(entry.done).filter((i) => !skipped.includes(i));
    if (status === 'active' && done.length === 0 && skipped.length === 0) continue;
    out[id] = { status, done, skipped };
  }
  return out;
}

function stringList(raw: unknown): string[] {
  return Array.isArray(raw)
    ? Array.from(new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0)))
    : [];
}

/** Turn arbitrary parsed JSON into a valid TrackerData. Unknown versions are
 *  rejected rather than guessed at; every other field degrades to empty. */
export function sanitiseData(raw: unknown): TrackerData {
  if (!raw || typeof raw !== 'object') throw new Error('存档内容不是有效的进度数据。');
  const parsed = raw as Partial<TrackerData>;
  if (parsed.version !== undefined && parsed.version !== 1) {
    throw new Error(`不认识的存档版本（v${String(parsed.version)}），请更新页面后再试。`);
  }
  if (!parsed.lines || typeof parsed.lines !== 'object') {
    throw new Error('存档里没有进度记录，可能选错了文件。');
  }
  return {
    version: 1,
    selectedArtists: stringList(parsed.selectedArtists).slice(0, MAX_ARTISTS),
    lines: normaliseLines(parsed.lines),
    order: stringList(parsed.order),
    pinned: stringList(parsed.pinned),
  };
}

/** Count persisted steps (done + skipped) — used for archive previews. */
export function countSavedSteps(data: TrackerData): number {
  let total = 0;
  for (const state of Object.values(data.lines)) total += state.done.length + state.skipped.length;
  return total;
}
