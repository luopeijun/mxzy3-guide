import { isLineComplete, skippedIndices, type TaskLine } from './tracker';

/** The five mutually exclusive states a task line can be in. Priority is
 *  excluded > completed > abandoned > inProgress > notStarted, which matches
 *  what the pool already does: excluded lines are skipped entirely, and a
 *  fully ticked line goes to the 已完成 archive even if it was 放弃 first. */
export type LinePhase = 'inProgress' | 'notStarted' | 'completed' | 'abandoned' | 'excluded';

/** 'all' keeps the existing pool layout (working list + collapsed archive). */
export type LineFilter = 'all' | LinePhase;

export const FILTER_ORDER: LineFilter[] = [
  'all',
  'inProgress',
  'notStarted',
  'completed',
  'abandoned',
  'excluded',
];

export const FILTER_LABEL: Record<LineFilter, string> = {
  all: '全部',
  inProgress: '进行中',
  notStarted: '未开始',
  completed: '已完成',
  abandoned: '已放弃',
  excluded: '已移出',
};

export const FILTER_HINT: Record<LineFilter, string> = {
  all: '全部任务线（进行中的事件池 + 底部已完成区）',
  inProgress: '已勾选部分子任务、还没做完的线',
  notStarted: '一个子任务都没勾、也没放弃步骤的线',
  completed: '未放弃的子任务全部勾选、已归档的线',
  abandoned: '主动点了「放弃」的线',
  excluded: '点了「移出池子」的线，可在这里直接恢复',
};

/** Only the fields phaseOf needs. Declared locally so lib never imports hooks. */
export interface PhaseState {
  status?: string;
  done?: number[];
  skipped?: number[];
}

/** A line has "progress" when any *valid* step index is ticked. done stores
 *  event-block array indices, not 0-based step numbers — never use
 *  `done.length` or `i < steps.length` to decide this. */
export function hasProgress(line: TaskLine, done: Iterable<number> = []): boolean {
  const set = done instanceof Set ? done : new Set(done);
  return line.steps.some((step) => set.has(step.index));
}

export function phaseOf(line: TaskLine, state?: PhaseState): LinePhase {
  if (state?.status === 'excluded') return 'excluded';
  if (isLineComplete(line, state?.done ?? [], state?.skipped ?? [])) return 'completed';
  if (state?.status === 'abandoned') return 'abandoned';
  // Giving up on a step is still work done on the line: without this a line
  // whose only record is a skipped step would hide under 未开始.
  const skipped = skippedIndices(line, state?.skipped ?? []).size > 0;
  return hasProgress(line, state?.done ?? []) || skipped ? 'inProgress' : 'notStarted';
}

/** Bucket every line once, preserving the incoming order inside each bucket. */
export function groupPhases<T extends TaskLine>(
  lines: T[],
  getState: (lineId: string) => PhaseState | undefined,
): Record<LinePhase, T[]> {
  const result: Record<LinePhase, T[]> = {
    inProgress: [],
    notStarted: [],
    completed: [],
    abandoned: [],
    excluded: [],
  };
  for (const line of lines) {
    result[phaseOf(line, getState(line.id))].push(line);
  }
  return result;
}
