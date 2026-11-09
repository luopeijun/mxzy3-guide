/** Progress is keyed by **block-array index**, so a rebuilt `guide.json` can
 *  silently shift every later event by one and hand a tick to the wrong step.
 *  Saves therefore carry a snapshot of what each processed index pointed at; on
 *  import the ticks are re-anchored by event content instead of trusting the
 *  raw number. Pure data logic, no DOM. */
import type { TaskLine, TaskStep } from './tracker';
import type { LineState, TrackerData } from './trackerData';

/** What one saved index pointed at when the archive was written. `hint` is the
 *  opening of the event body: the step `label` is usually just the ordinal
 *  ("1", "2", …), which is exactly what shifts when an event is inserted — the
 *  body text survives. */
export interface StepRef {
  index: number;
  label: string;
  hint?: string;
}

export type StepRefMap = Record<string, StepRef[]>;

export interface ReanchorReport {
  /** Saved lines that no longer exist in the current guide data. */
  missingLines: string[];
  /** Ticks re-pointed at a different index. */
  movedSteps: number;
  /** Ticks whose event could not be found, so they had to be dropped. */
  droppedSteps: number;
}

export function emptyReport(): ReanchorReport {
  return { missingLines: [], movedSteps: 0, droppedSteps: 0 };
}

const HINT_LENGTH = 24;

/** Normalised opening of an event body — the strongest identity we have. */
function hintOf(text: string | undefined): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, HINT_LENGTH);
}

function labelOf(step: Pick<TaskStep, 'label'> | undefined): string {
  return (step?.label ?? '').trim();
}

/** Snapshot only the steps that actually hold a tick: done ∪ skipped. Lines
 *  and steps with no progress are omitted, so archives stay small. */
export function captureStepRefs(lines: readonly TaskLine[], saved: TrackerData): StepRefMap {
  const byId = new Map(lines.map((line) => [line.id, line]));
  const refs: StepRefMap = {};
  for (const [id, state] of Object.entries(saved.lines)) {
    const line = byId.get(id);
    if (!line || !state) continue;
    const wanted = new Set([...state.done, ...state.skipped]);
    const steps = line.steps
      .filter((step) => wanted.has(step.index))
      .map((step) => {
        const ref: StepRef = { index: step.index, label: labelOf(step) };
        const hint = hintOf(step.text);
        if (hint) ref.hint = hint;
        return ref;
      });
    if (steps.length > 0) refs[id] = steps;
  }
  return refs;
}

/** Keep only well-formed entries: `[{index, label, hint?}]` per line. */
export function normaliseStepRefs(raw: unknown): StepRefMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: StepRefMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    const steps: StepRef[] = [];
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const ref = item as Partial<StepRef>;
      if (!Number.isInteger(ref.index) || typeof ref.label !== 'string') continue;
      steps.push({
        index: ref.index as number,
        label: ref.label,
        ...(typeof ref.hint === 'string' && ref.hint ? { hint: ref.hint } : {}),
      });
    }
    if (steps.length > 0) out[id] = steps;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Closest index wins when the same anchor appears more than once, which keeps
 *  repeated events from jumping across the line. */
function closest(steps: TaskStep[], index: number): TaskStep {
  let best = steps[0];
  for (const step of steps) {
    if (Math.abs(step.index - index) < Math.abs(best.index - index)) best = step;
  }
  return best;
}

/** Find where a saved step lives now. Body hint first (survives renumbering),
 *  ordinal label second (the only signal older archives have). */
function locate(line: TaskLine, ref: StepRef | undefined, oldIndex: number, taken: Set<number>) {
  const hint = ref?.hint?.trim();
  if (hint) {
    const byHint = line.steps.filter((step) => !taken.has(step.index) && hintOf(step.text) === hint);
    if (byHint.length > 0) return closest(byHint, oldIndex);
  }
  const label = labelOf(ref);
  if (label) {
    const byLabel = line.steps.filter(
      (step) => !taken.has(step.index) && labelOf(step) === label,
    );
    if (byLabel.length > 0) return closest(byLabel, oldIndex);
  }
  return null;
}

/** Re-point a save's `done`/`skipped` at the events they were recorded
 *  against. Without a snapshot the save is passed through untouched — that is
 *  the only sane option for archives written before snapshots existed. */
export function reanchorProgress(
  incoming: TrackerData,
  refs: StepRefMap | undefined,
  allLines: readonly TaskLine[],
): { data: TrackerData; report: ReanchorReport } {
  const report = emptyReport();
  if (!refs) return { data: incoming, report };

  const byId = new Map(allLines.map((line) => [line.id, line]));
  const lines: Record<string, LineState> = {};

  for (const [id, state] of Object.entries(incoming.lines)) {
    const line = byId.get(id);
    const lineRefs = refs[id];
    if (!line) {
      report.missingLines.push(id);
      lines[id] = state;
      continue;
    }
    if (!lineRefs) {
      // No snapshot for this line: trust the numbers, but keep them honest.
      lines[id] = state;
      continue;
    }

    const taken = new Set<number>();
    const remap = (indices: readonly number[]) => {
      const mapped: number[] = [];
      for (const oldIndex of indices) {
        const ref = lineRefs.find((item) => item.index === oldIndex);
        const hit = locate(line, ref, oldIndex, taken);
        if (hit) {
          taken.add(hit.index);
          mapped.push(hit.index);
          if (hit.index !== oldIndex) report.movedSteps += 1;
          continue;
        }
        // Nothing in the snapshot (a stale index from an older build): keep it
        // only if the current line still has that slot, so stale numbers can
        // never leak into the progress maths.
        if (!ref && line.steps.some((step) => step.index === oldIndex) && !taken.has(oldIndex)) {
          taken.add(oldIndex);
          mapped.push(oldIndex);
          continue;
        }
        report.droppedSteps += 1;
      }
      return mapped.sort((a, b) => a - b);
    };

    // Skipped first: a step cannot be both given up and done.
    const skipped = remap(state.skipped);
    const done = remap(state.done);

    const next: LineState = { status: state.status, done, skipped };
    if (next.status === 'active' && done.length === 0 && skipped.length === 0) continue;
    lines[id] = next;
  }

  return { data: { ...incoming, lines }, report };
}

/** One-line summary for the import preview; `null` when nothing moved. */
export function describeReport(report: ReanchorReport | null): string | null {
  if (!report) return null;
  const parts: string[] = [];
  if (report.movedSteps > 0) parts.push(`${report.movedSteps} 个步骤按事件内容重新对齐`);
  if (report.droppedSteps > 0) parts.push(`${report.droppedSteps} 个步骤在当前攻略里找不到，已略过`);
  if (report.missingLines.length > 0) {
    parts.push(`${report.missingLines.length} 条线在当前攻略里没有对应页面，记录会保留但暂不显示`);
  }
  return parts.length > 0 ? parts.join('；') : null;
}
