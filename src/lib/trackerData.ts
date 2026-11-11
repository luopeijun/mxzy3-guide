/** Shared shape of the tracker save file. Extracted from the provider so the
 *  import/export layer can validate external input with exactly the same rules
 *  that localStorage reads use. */

import { ORDER_EPOCH, hoistLuosangLines } from './trackerOrder';

/** Hard cap on the *roster* (artists currently under contract). The tracked
 *  list itself is unbounded: releasing someone keeps their lines in the pool. */
export const MAX_ARTISTS = 4;

export type LineStatus = 'active' | 'abandoned' | 'excluded';

/** An artist in the tracked list, with the single state bit the UI needs. */
export type ArtistStatus = 'active' | 'released';

export interface ArtistEntry {
  id: string;
  status: ArtistStatus;
}

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
  /** Roster: artists currently under contract (≤ MAX_ARTISTS). 路欧桑 branch
   *  selection reads *only* this list, never the released ones. */
  selectedArtists: string[];
  /** Released but still tracked: their lines stay in the pool with progress
   *  intact. No cap — a playthrough may sign 5+ people one after another. */
  releasedArtists: string[];
  lines: Record<string, LineState>;
  /** Manual drag order of event-pool line ids (full list, pinned included). */
  order: string[];
  /** Pinned line ids, in pin order — always rendered above the rest. */
  pinned: string[];
  /** Which generation of池子顺序 the `order` was dragged in; old saves get their
   *  路欧桑 lines hoisted once (see `hoistLuosangLines`). */
  orderEpoch: number;
}

export function emptyData(): TrackerData {
  return {
    version: 1,
    selectedArtists: [],
    releasedArtists: [],
    lines: {},
    order: [],
    pinned: [],
    orderEpoch: ORDER_EPOCH,
  };
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

/** The two persisted arrays are mutually exclusive: the roster wins if an id
 *  somehow appears in both. Keeping this in one place means every reader sees
 *  exactly the same list. */
export function normaliseArtists(
  selectedRaw: unknown,
  releasedRaw: unknown,
): { selectedArtists: string[]; releasedArtists: string[] } {
  const selectedArtists = stringList(selectedRaw).slice(0, MAX_ARTISTS);
  const roster = new Set(selectedArtists);
  const releasedArtists = stringList(releasedRaw).filter((id) => !roster.has(id));
  return { selectedArtists, releasedArtists };
}

/** One tracked list with a state bit — the shape the picker actually renders.
 *  Roster first, released after, so the grid keeps a stable reading order. */
export function artistRoster(
  data: Pick<TrackerData, 'selectedArtists' | 'releasedArtists'>,
): ArtistEntry[] {
  const entries: ArtistEntry[] = [];
  const seen = new Set<string>();
  for (const id of data.selectedArtists) {
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, status: 'active' });
  }
  for (const id of data.releasedArtists) {
    if (seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, status: 'released' });
  }
  return entries;
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
  const order = stringList(parsed.order);
  const epoch = typeof parsed.orderEpoch === 'number' ? parsed.orderEpoch : 0;
  const artists = normaliseArtists(parsed.selectedArtists, parsed.releasedArtists);
  return {
    version: 1,
    ...artists,
    lines: normaliseLines(parsed.lines),
    // 老存档把路欧桑线拖在最后，读进来先按新顺序挪一次；之后顺序归用户。
    order: epoch < ORDER_EPOCH ? hoistLuosangLines(order) : order,
    pinned: stringList(parsed.pinned),
    orderEpoch: ORDER_EPOCH,
  };
}

/** Count persisted steps (done + skipped) — used for archive previews. */
export function countSavedSteps(data: TrackerData): number {
  let total = 0;
  for (const state of Object.values(data.lines)) total += state.done.length + state.skipped.length;
  return total;
}
