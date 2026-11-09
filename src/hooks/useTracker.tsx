import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  MAX_ARTISTS,
  emptyData,
  normaliseLines,
  type LineState,
  type LineStatus,
  type TrackerData,
} from '../lib/trackerData';
import { applyProgress } from '../lib/trackerTransfer';

export { MAX_ARTISTS };
export type { LineState, LineStatus, TrackerData } from '../lib/trackerData';

const STORAGE_KEY = 'guide.progress.v1';

function readStorage(): TrackerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    const parsed = JSON.parse(raw) as Partial<TrackerData>;
    if (!parsed || parsed.version !== 1) return emptyData();
    return {
      version: 1,
      selectedArtists: Array.isArray(parsed.selectedArtists) ? parsed.selectedArtists : [],
      lines: normaliseLines(parsed.lines),
      // v1 records written before drag/pin existed simply have no order yet.
      order: Array.isArray(parsed.order) ? parsed.order : [],
      pinned: Array.isArray(parsed.pinned) ? parsed.pinned : [],
    };
  } catch {
    return emptyData();
  }
}

interface TrackerContextValue {
  selectedArtists: string[];
  setArtists: (ids: string[]) => void;
  toggleArtist: (id: string) => void;
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
  resetAll: () => void;
}

const TrackerContext = createContext<TrackerContextValue>({
  selectedArtists: [],
  setArtists: () => {},
  toggleArtist: () => {},
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Private mode / quota: progress simply will not persist.
    }
  }, [data]);

  const setArtists = useCallback((ids: string[]) => {
    const trimmed = ids.slice(0, MAX_ARTISTS);
    setData((previous) => ({ ...previous, selectedArtists: trimmed }));
  }, []);

  const toggleArtist = useCallback((id: string) => {
    setData((previous) => {
      const has = previous.selectedArtists.includes(id);
      if (!has && previous.selectedArtists.length >= MAX_ARTISTS) return previous;
      const nextArtists = has
        ? previous.selectedArtists.filter((a) => a !== id)
        : [...previous.selectedArtists, id];
      return { ...previous, selectedArtists: nextArtists };
    });
  }, []);

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

  const resetAll = useCallback(() => setData(emptyData()), []);

  const snapshot = useCallback(() => data, [data]);

  const importProgress = useCallback((next: TrackerData, mode: 'merge' | 'replace') => {
    setData((previous) => applyProgress(mode, previous, next));
  }, []);

  const value = useMemo<TrackerContextValue>(
    () => ({
      selectedArtists: data.selectedArtists,
      setArtists,
      toggleArtist,
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
      resetAll,
    }),
    [
      data.selectedArtists,
      data.order,
      data.pinned,
      setArtists,
      toggleArtist,
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
      resetAll,
    ],
  );

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>;
}

export function useTracker() {
  return useContext(TrackerContext);
}
