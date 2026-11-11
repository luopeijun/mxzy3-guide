import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  MAX_ARTISTS,
  emptyData,
  normaliseArtists,
  normaliseLines,
  sanitiseData,
  artistRoster,
  type ArtistStatus,
  type LineState,
  type LineStatus,
  type TrackerData,
} from '../lib/trackerData';
import { ORDER_EPOCH, hoistLuosangLines } from '../lib/trackerOrder';
import type { PoolSelection } from '../lib/tracker';
import { applyProgress } from '../lib/trackerTransfer';

export { MAX_ARTISTS };
export type { LineState, LineStatus, TrackerData } from '../lib/trackerData';

const STORAGE_KEY = 'guide.progress.v1';

/** One-shot snapshot taken right before a destructive action (reset / overwrite
 *  import), so an accidental wipe can be undone instead of re-typed. */
const BACKUP_KEY = 'guide.progress.backup.v1';

export interface ProgressBackup {
  at: string;
  reason: 'reset' | 'replace';
  data: TrackerData;
}

function readBackup(): ProgressBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProgressBackup>;
    if (!parsed || (parsed.reason !== 'reset' && parsed.reason !== 'replace')) return null;
    return {
      at: typeof parsed.at === 'string' ? parsed.at : '',
      reason: parsed.reason,
      data: sanitiseData(parsed.data),
    };
  } catch {
    return null;
  }
}

/** Is there anything worth preserving? An empty save has nothing to undo. */
function hasContent(data: TrackerData): boolean {
  return (
    data.selectedArtists.length > 0 ||
    data.releasedArtists.length > 0 ||
    data.order.length > 0 ||
    data.pinned.length > 0 ||
    Object.keys(data.lines).length > 0
  );
}

function readStorage(): TrackerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<TrackerData>;
    if (!parsed || parsed.version !== 1) return emptyData();
    const order = Array.isArray(parsed.order) ? parsed.order : [];
    const epoch = typeof parsed.orderEpoch === 'number' ? parsed.orderEpoch : 0;
    const artists = normaliseArtists(parsed.selectedArtists, parsed.releasedArtists);
    return {
      version: 1,
      ...artists,
      lines: normaliseLines(parsed.lines),
      // v1 records written before drag/pin existed simply have no order yet.
      // 老存档的路欧桑线排在最后，按新顺序挪到「艺人事件」后面（只迁一次）。
      order: epoch < ORDER_EPOCH ? hoistLuosangLines(order) : order,
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
      orderEpoch: ORDER_EPOCH,
    };
  } catch {
    return emptyData();
  }
}

interface TrackerContextValue {
  /** Roster: artists currently under contract (≤4). */
  selectedArtists: string[];
  /** Released but still tracked. */
  releasedArtists: string[];
  /** Roster + released, deduplicated. */
  trackedArtists: string[];
  /** One list with a state bit, for the artist picker. */
  artists: { id: string; status: ArtistStatus }[];
  rosterFull: boolean;
  /** Everything buildPool needs, derived once per data change. */
  poolSelection: PoolSelection;
  /** Completion maths skips stale lines by default; this switch opts in. */
  includeReleased: boolean;
  setIncludeReleased: (value: boolean) => void;
  setArtists: (ids: string[]) => void;
  toggleArtist: (id: string) => void;
  /** 解约 / 复签 — moves an artist between the two lists, never drops it. */
  setArtistStatus: (id: string, status: ArtistStatus) => void;
  getLine: (lineId: string) => LineState | undefined;
  isDone: (lineId: string, stepIndex: number) => boolean;
  toggleStep: (lineId: string, stepIndex: number) => void;
  /** Give up on a single step (or undo it). Only this step is affected. */
  isSkipped: (lineId: string, stepIndex: number) => boolean;
  toggleStepSkip: (lineId: string, stepIndex: number) => void;
  /** Replace the whole done set of one line (master checkbox: all or none). */
  setLineSteps: (lineId: string, done: number[]) => void;
  setLineStatus: (lineId: string, status: LineStatus) => void;
  setManyStatus: (lineIds: string[], status: LineStatus) => void;
  restoreExcluded: () => void;
  lineOrder: string[];
  pinnedIds: string[];
  togglePin: (lineId: string) => void;
  reorderLines: (order: string[], pinned: string[]) => void;
  /** Current save, for the export layer. */
  snapshot: () => TrackerData;
  /** Apply an imported save: merge into local progress, or replace it whole. */
  importProgress: (next: TrackerData, mode: 'merge' | 'replace') => void;
  /** Snapshot kept from the last reset / overwrite, so it can be rolled back. */
  backup: ProgressBackup | null;
  undoBackup: () => void;
  dismissBackup: () => void;
  resetAll: () => void;
}

const TrackerContext = createContext<TrackerContextValue>({
  selectedArtists: [],
  releasedArtists: [],
  trackedArtists: [],
  artists: [],
  rosterFull: false,
  poolSelection: { trackedArtists: [], rosterArtists: [], releasedArtists: [], retainedBranches: [] },
  includeReleased: false,
  setIncludeReleased: () => {},
  setArtists: () => {},
  toggleArtist: () => {},
  setArtistStatus: () => {},
  getLine: () => undefined,
  isDone: () => false,
  toggleStep: () => {},
  isSkipped: () => false,
  toggleStepSkip: () => {},
  setLineSteps: () => {},
  setLineStatus: () => {},
  setManyStatus: () => {},
  restoreExcluded: () => {},
  lineOrder: [],
  pinnedIds: [],
  togglePin: () => {},
  reorderLines: () => {},
  snapshot: emptyData,
  importProgress: () => {},
  backup: null,
  undoBackup: () => {},
  dismissBackup: () => {},
  resetAll: () => {},
});

/** Persist a single line, dropping the record when it falls back to the
 *  default (active with nothing done) so storage stays lean. */
function persistLine(
  lines: Record<string, LineState>,
  lineId: string,
  patch: Partial<LineState>,
): Record<string, LineState> {
  const next = { ...lines };
  const current = next[lineId] ?? { status: 'active' as LineStatus, done: [], skipped: [] };
  const merged: LineState = {
    status: patch.status ?? current.status,
    done: patch.done ?? current.done,
    skipped: patch.skipped ?? current.skipped,
  };
  if (merged.status === 'active' && merged.done.length === 0 && merged.skipped.length === 0) {
    delete next[lineId];
  } else {
    next[lineId] = merged;
  }
  return next;
}

export function TrackerProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<TrackerData>(readStorage);
  const [backup, setBackup] = useState<ProgressBackup | null>(readBackup);
  // Purely local view option, like the CG size toggle: reset on reload.
  const [includeReleased, setIncludeReleased] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Private mode / quota: progress simply will not persist.
    }
  }, [data]);

  // The backup outlives a reload: a user who wiped progress by mistake may well
  // refresh the page before noticing.
  useEffect(() => {
    try {
      if (backup) localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      else localStorage.removeItem(BACKUP_KEY);
    } catch {
      // Ignore: no backup is a degraded but working state.
    }
  }, [backup]);

  /** Replace the roster wholesale. Kept for the transfer layer / tests; the
   *  picker uses toggleArtist and setArtistStatus instead. */
  const setArtists = useCallback((ids: string[]) => {
    setData((previous) => ({
      ...previous,
      ...normaliseArtists(ids, previous.releasedArtists),
    }));
  }, []);

  /** Clicking the artist button: add to the tracked list, or drop it entirely.
   *  A full roster no longer blocks the pick — the newcomer is simply recorded
   *  as released, which is exactly the "signed after a release" case. */
  const toggleArtist = useCallback((id: string) => {
    setData((previous) => {
      const { selectedArtists, releasedArtists } = normaliseArtists(
        previous.selectedArtists,
        previous.releasedArtists,
      );
      const tracked = selectedArtists.includes(id) || releasedArtists.includes(id);
      if (tracked) {
        return {
          ...previous,
          selectedArtists: selectedArtists.filter((a) => a !== id),
          releasedArtists: releasedArtists.filter((a) => a !== id),
        };
      }
      if (selectedArtists.length < MAX_ARTISTS) {
        return { ...previous, selectedArtists: [...selectedArtists, id], releasedArtists };
      }
      return { ...previous, selectedArtists, releasedArtists: [...releasedArtists, id] };
    });
  }, []);

  /** Corner badge: 旗下 ⇄ 已解约. Re-signing needs a free roster slot;
   *  releasing always works. Neither action ever touches line progress. */
  const setArtistStatus = useCallback((id: string, status: ArtistStatus) => {
    setData((previous) => {
      const { selectedArtists, releasedArtists } = normaliseArtists(
        previous.selectedArtists,
        previous.releasedArtists,
      );
      const inRoster = selectedArtists.includes(id);
      const inReleased = releasedArtists.includes(id);
      if (!inRoster && !inReleased) return previous;
      if (status === 'released') {
        if (inReleased) return previous;
        return {
          ...previous,
          selectedArtists: selectedArtists.filter((a) => a !== id),
          releasedArtists: [...releasedArtists, id],
        };
      }
      if (inRoster) return previous;
      if (selectedArtists.length >= MAX_ARTISTS) return previous;
      return {
        ...previous,
        selectedArtists: [...selectedArtists, id],
        releasedArtists: releasedArtists.filter((a) => a !== id),
      };
    });
  }, []);

  const artists = useMemo(() => artistRoster(data), [data]);
  const trackedArtists = useMemo(() => artists.map((entry) => entry.id), [artists]);
  const rosterFull = data.selectedArtists.length >= MAX_ARTISTS;

  /** 路欧桑 branches that already have recorded progress stay in the pool after
   *  a roster change (decision: never silently lose progress). Line ids are
   *  `nodeId::seq::name`, so the node prefix is all we need. */
  const retainedBranches = useMemo(() => {
    const set = new Set<string>();
    for (const lineId of Object.keys(data.lines)) {
      const nodeId = lineId.split('::')[0];
      if (nodeId.startsWith('other-events/luousang/')) set.add(nodeId);
    }
    return [...set];
  }, [data.lines]);

  const poolSelection = useMemo<PoolSelection>(
    () => ({
      trackedArtists,
      rosterArtists: data.selectedArtists,
      releasedArtists: data.releasedArtists,
      retainedBranches,
    }),
    [trackedArtists, data.selectedArtists, data.releasedArtists, retainedBranches],
  );

  const getLine = useCallback(
    (lineId: string) => data.lines[lineId],
    [data.lines],
  );

  const isDone = useCallback(
    (lineId: string, stepIndex: number) =>
      (data.lines[lineId]?.done ?? []).includes(stepIndex),
    [data.lines],
  );

  const isSkipped = useCallback(
    (lineId: string, stepIndex: number) =>
      (data.lines[lineId]?.skipped ?? []).includes(stepIndex),
    [data.lines],
  );

  const toggleStep = useCallback((lineId: string, stepIndex: number) => {
    setData((previous) => {
      const current = previous.lines[lineId]?.done ?? [];
      const done = current.includes(stepIndex)
        ? current.filter((i) => i !== stepIndex)
        : [...current, stepIndex];
      const lines = persistLine(previous.lines, lineId, {
        status: previous.lines[lineId]?.status ?? 'active',
        done,
      });
      return { ...previous, lines };
    });
  }, []);

  /** Skipping touches exactly one step: it is dropped from `done` (a skipped
   *  step is not "done") and added to `skipped`, where it stops counting
   *  towards the line's completion. Undo simply removes it again. */
  const toggleStepSkip = useCallback((lineId: string, stepIndex: number) => {
    setData((previous) => {
      const state = previous.lines[lineId];
      const skipped = state?.skipped ?? [];
      const skip = !skipped.includes(stepIndex);
      const lines = persistLine(previous.lines, lineId, {
        status: state?.status ?? 'active',
        done: skip ? (state?.done ?? []).filter((i) => i !== stepIndex) : (state?.done ?? []),
        skipped: skip ? [...skipped, stepIndex] : skipped.filter((i) => i !== stepIndex),
      });
      return { ...previous, lines };
    });
  }, []);

  const setLineSteps = useCallback((lineId: string, done: number[]) => {
    setData((previous) => ({
      ...previous,
      lines: persistLine(previous.lines, lineId, {
        status: previous.lines[lineId]?.status ?? 'active',
        done,
      }),
    }));
  }, []);

  const setLineStatus = useCallback((lineId: string, status: LineStatus) => {
    setData((previous) => {
      const current = previous.lines[lineId]?.done ?? [];
      return { ...previous, lines: persistLine(previous.lines, lineId, { status, done: current }) };
    });
  }, []);

  const setManyStatus = useCallback((lineIds: string[], status: LineStatus) => {
    setData((previous) => {
      let lines = previous.lines;
      for (const id of lineIds) {
        const current = lines[id]?.done ?? [];
        lines = persistLine(lines, id, { status, done: current });
      }
      return { ...previous, lines };
    });
  }, []);

  const restoreExcluded = useCallback(() => {
    setData((previous) => {
      const lines: Record<string, LineState> = {};
      for (const [id, state] of Object.entries(previous.lines)) {
        if (state.status === 'excluded') {
          if (state.done.length > 0 || state.skipped.length > 0) {
            lines[id] = { status: 'active', done: state.done, skipped: state.skipped };
          }
        } else {
          lines[id] = state;
        }
      }
      return { ...previous, lines };
    });
  }, []);

  const togglePin = useCallback((lineId: string) => {
    setData((previous) => ({
      ...previous,
      pinned: previous.pinned.includes(lineId)
        ? previous.pinned.filter((id) => id !== lineId)
        : [...previous.pinned, lineId],
    }));
  }, []);

  /** One atomic write for a drag operation, so order and pin state never
   *  disagree about which lines sit in the pinned block. */
  const reorderLines = useCallback((order: string[], pinned: string[]) => {
    setData((previous) => ({ ...previous, order, pinned }));
  }, []);

  const resetAll = useCallback(() => {
    if (!hasContent(data)) {
      setData(emptyData());
      return;
    }
    setBackup({ at: new Date().toISOString(), reason: 'reset', data });
    setData(emptyData());
  }, [data]);

  const snapshot = useCallback(() => data, [data]);

  const importProgress = useCallback(
    (next: TrackerData, mode: 'merge' | 'replace') => {
      // Old tracker-only archives bypass sanitiseData entirely, so they carry no
      // releasedArtists. Normalise here — one choke point for every import path
      // — otherwise a replace would store a shape the rest of the app cannot
      // iterate over.
      const safe: TrackerData = {
        ...next,
        ...normaliseArtists(next.selectedArtists, next.releasedArtists),
      };
      // Merging is additive and safe; replacing throws the local save away, so
      // keep a one-shot snapshot to roll back to.
      if (mode === 'replace' && hasContent(data)) {
        setBackup({ at: new Date().toISOString(), reason: 'replace', data });
      }
      setData((previous) => applyProgress(mode, previous, safe));
    },
    [data],
  );

  const undoBackup = useCallback(() => {
    if (!backup) return;
    setData(backup.data);
    setBackup(null);
  }, [backup]);

  const dismissBackup = useCallback(() => setBackup(null), []);

  const value = useMemo<TrackerContextValue>(
    () => ({
      selectedArtists: data.selectedArtists,
      releasedArtists: data.releasedArtists,
      trackedArtists,
      artists,
      rosterFull,
      poolSelection,
      includeReleased,
      setIncludeReleased,
      setArtists,
      toggleArtist,
      setArtistStatus,
      getLine,
      isDone,
      toggleStep,
      isSkipped,
      toggleStepSkip,
      setLineSteps,
      setLineStatus,
      setManyStatus,
      restoreExcluded,
      lineOrder: data.order,
      pinnedIds: data.pinned,
      togglePin,
      reorderLines,
      snapshot,
      importProgress,
      backup,
      undoBackup,
      dismissBackup,
      resetAll,
    }),
    [
      data.selectedArtists,
      data.releasedArtists,
      data.order,
      data.pinned,
      trackedArtists,
      artists,
      rosterFull,
      poolSelection,
      includeReleased,
      setArtists,
      toggleArtist,
      setArtistStatus,
      getLine,
      isDone,
      toggleStep,
      isSkipped,
      toggleStepSkip,
      setLineSteps,
      setLineStatus,
      setManyStatus,
      restoreExcluded,
      togglePin,
      reorderLines,
      snapshot,
      importProgress,
      backup,
      undoBackup,
      dismissBackup,
      resetAll,
    ],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  return useContext(TrackerContext);
}
