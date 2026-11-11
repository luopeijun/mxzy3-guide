import { useCallback, useEffect, useMemo, useState } from 'react';
import { COURSE_LEVELS, type CourseLevel } from '../lib/specials';
import {
  SPECIALS_STORAGE_KEY,
  emptyState,
  readState,
  trimSoloAssignments,
  type SpecialsState,
} from '../lib/specialsState';
import type { SpecialNotice } from '../types/specials';

/** Board-local save state. Deliberately not a context: only #/specials mounts
 *  it, and the four 旗下 artists come from the tracker save via props. */
export function useSpecials(notices: SpecialNotice[] = []) {
  const [state, setState] = useState<SpecialsState>(() =>
    trimSoloAssignments(readState(), notices));

  useEffect(() => {
    try {
      localStorage.setItem(SPECIALS_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode / quota: the board still works for this session.
    }
  }, [state]);

  const toggleEnabled = useCallback((noticeId: string) => {
    setState((previous) => ({
      ...previous,
      enabled: previous.enabled.includes(noticeId)
        ? previous.enabled.filter((id) => id !== noticeId)
        : [...previous.enabled, noticeId],
    }));
  }, []);

  const assign = useCallback((noticeId: string, slot: string, artistId: string, limit = 4, replace = false) => {
    setState((previous) => {
      if (previous.groupLocked[noticeId]) return previous;
      const current = previous.assignments[noticeId]?.[slot] ?? [];
      if (current.includes(artistId)) return previous;
      const next = current.length >= limit
        // A full slot can still be swapped (single-artist notices, one person
        // per role) — the caller decides whether that is allowed.
        ? (replace ? [artistId] : null)
        : [...current, artistId];
      if (!next) return previous;
      return {
        ...previous,
        assignments: {
          ...previous.assignments,
          [noticeId]: { ...previous.assignments[noticeId], [slot]: next },
        },
      };
    });
  }, []);

  const unassign = useCallback((noticeId: string, slot: string, artistId: string) => {
    setState((previous) => {
      if (previous.groupLocked[noticeId]) return previous;
      const current = previous.assignments[noticeId]?.[slot] ?? [];
      if (!current.includes(artistId)) return previous;
      return {
        ...previous,
        assignments: {
          ...previous.assignments,
          [noticeId]: {
            ...previous.assignments[noticeId],
            [slot]: current.filter((id) => id !== artistId),
          },
        },
      };
    });
  }, []);

  const setStat = useCallback((artistId: string, attr: string, value: number | null) => {
    setState((previous) => {
      const attrs = { ...previous.stats[artistId] };
      if (value === null) delete attrs[attr];
      else attrs[attr] = value;
      return { ...previous, stats: { ...previous.stats, [artistId]: attrs } };
    });
  }, []);

  const cycleCourse = useCallback((artistId: string, course: string) => {
    setState((previous) => {
      const grades = { ...previous.courses[artistId] };
      const current = grades[course] ?? '未上';
      const nextIndex = (COURSE_LEVELS.indexOf(current as CourseLevel) + 1) % COURSE_LEVELS.length;
      const next = COURSE_LEVELS[nextIndex];
      if (next === '未上') delete grades[course];
      else grades[course] = next;
      return { ...previous, courses: { ...previous.courses, [artistId]: grades } };
    });
  }, []);

  const setValue = useCallback((key: string, value: number) => {
    setState((previous) => {
      const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
      const values = { ...previous.values };
      if (safe === 0) delete values[key];
      else values[key] = safe;
      return { ...previous, values };
    });
  }, []);

  const bump = useCallback((key: string, delta: number) => {
    setState((previous) => {
      const safe = Math.max(0, (previous.values[key] ?? 0) + delta);
      const values = { ...previous.values };
      if (safe === 0) delete values[key];
      else values[key] = safe;
      return { ...previous, values };
    });
  }, []);

  const toggleCheck = useCallback((key: string) => {
    setState((previous) => {
      const values = { ...previous.values };
      if (values[key]) delete values[key];
      else values[key] = 1;
      return { ...previous, values };
    });
  }, []);

  /** Tick / untick a checklist row (stat / resource). This is the authoritative
   *  progress signal; numbers are only an optional peek elsewhere. */
  const toggleDone = useCallback((rowId: string) => {
    setState((previous) => ({
      ...previous,
      done: previous.done.includes(rowId)
        ? previous.done.filter((id) => id !== rowId)
        : [...previous.done, rowId],
    }));
  }, []);

  const setGroupLocked = useCallback((noticeId: string, locked: boolean) => {
    setState((previous) => ({
      ...previous,
      groupLocked: { ...previous.groupLocked, [noticeId]: locked },
    }));
  }, []);

  const reset = useCallback(() => setState(emptyState()), []);

  return useMemo(
    () => ({
      state,
      toggleEnabled,
      assign,
      unassign,
      setStat,
      cycleCourse,
      setValue,
      bump,
      toggleCheck,
      toggleDone,
      setGroupLocked,
      reset,
    }),
    [state, toggleEnabled, assign, unassign, setStat, cycleCourse, setValue, bump, toggleCheck, toggleDone, setGroupLocked, reset],
  );
}
