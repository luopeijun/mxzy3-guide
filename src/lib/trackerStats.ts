import { countDoneSteps, countedSteps, isLineComplete, type TaskLine } from './tracker';

/** Minimal line-state shape the summary needs (hooks never imported into lib). */
export interface StatsState {
  status?: string;
  done?: number[];
  skipped?: number[];
}

export interface PoolStats {
  totalLines: number;
  activeLines: number;
  completedLines: number;
  abandoned: number;
  excluded: number;
  /** Lines skipped by the "include released" switch (still visible in the pool). */
  omittedLines: number;
  /** Steps that still count — skipped ones are excluded from the denominator. */
  totalSteps: number;
  doneSteps: number;
  skippedSteps: number;
  pct: number;
  /** 1/398 rounds to 0%, which reads as "nothing happened" — show <1 instead. */
  pctLabel: string;
}

/** One summary shared by the desktop overview card and the narrow-screen
 *  progress bar, so both read exactly the same numbers.
 *
 *  Stale lines (released artists / former 路欧桑 branches) stay visible in the
 *  pool, but are left out of the completion maths unless `includeReleased` is
 *  on — the user's default is "only count the current roster". */
export function summarisePool(
  pool: TaskLine[],
  getState: (lineId: string) => StatsState | undefined,
  includeReleased = false,
): PoolStats {
  let totalSteps = 0;
  let doneSteps = 0;
  let skippedSteps = 0;
  let abandoned = 0;
  let excluded = 0;
  let activeLines = 0;
  let completedLines = 0;
  let omittedLines = 0;

  for (const line of pool) {
    if (line.staleKind && !includeReleased) {
      omittedLines += 1;
      continue;
    }
    const state = getState(line.id);
    const status = state?.status ?? 'active';
    if (status === 'excluded') {
      excluded += 1;
      continue;
    }
    const done = state?.done ?? [];
    const skipped = state?.skipped ?? [];
    const complete = isLineComplete(line, done, skipped);
    if (complete) completedLines += 1;
    if (status === 'abandoned') abandoned += 1;
    else if (!complete) activeLines += 1;
    // Skipped steps leave the denominator, otherwise 100% is unreachable.
    const counted = countedSteps(line, skipped);
    totalSteps += counted.length;
    skippedSteps += line.steps.length - counted.length;
    doneSteps += countDoneSteps(line, done, skipped);
  }

  const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;
  return {
    totalLines: pool.length - omittedLines,
    activeLines,
    completedLines,
    abandoned,
    excluded,
    omittedLines,
    totalSteps,
    doneSteps,
    skippedSteps,
    pct,
    pctLabel: pct === 0 && doneSteps > 0 ? '<1' : String(pct),
  };
}
