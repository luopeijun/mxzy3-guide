/** Content-level slicing of the event pool: "only CGs" / "only 自动 events",
 *  independent from the status filter (进行中 / 已完成 / …) so the two can be
 *  combined. Pure predicates — the pool component owns the state. */
import type { TaskLine, TaskStep } from './tracker';

/** Every trigger type the guide actually uses, in data frequency order. */
export const CONTENT_TYPES = ['自动', '场景', '新闻', '跟随', '手动', '沟通', '探班'] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export interface ContentFilter {
  /** Only events that produce a CG. */
  cg: boolean;
  /** Trigger types; a step matches if its tag contains any of them. */
  types: ContentType[];
}

export const NO_CONTENT: ContentFilter = { cg: false, types: [] };

export function isContentFilterActive(filter: ContentFilter): boolean {
  return filter.cg || filter.types.length > 0;
}

/** Composite tags such as 「跟随或沟通」 match either side — that is the whole
 *  point of filtering by trigger type. */
export function stepMatchesContent(step: TaskStep, filter: ContentFilter): boolean {
  if (!isContentFilterActive(filter)) return true;
  if (filter.cg && !step.cg) return false;
  if (filter.types.length > 0) {
    const tag = step.tag ?? '';
    if (!filter.types.some((type) => tag.includes(type))) return false;
  }
  return true;
}

export function lineMatchesContent(line: TaskLine, filter: ContentFilter): boolean {
  if (!isContentFilterActive(filter)) return true;
  return line.steps.some((step) => stepMatchesContent(step, filter));
}

/** Steps to keep visible on a card, or `null` (show everything) when no
 *  content filter is active. Never empty for a line that passed the filter. */
export function matchingStepIndices(line: TaskLine, filter: ContentFilter): Set<number> | null {
  if (!isContentFilterActive(filter)) return null;
  const indices = new Set<number>();
  for (const step of line.steps) {
    if (stepMatchesContent(step, filter)) indices.add(step.index);
  }
  return indices;
}

export function toggleType(filter: ContentFilter, type: ContentType): ContentFilter {
  return {
    ...filter,
    types: filter.types.includes(type)
      ? filter.types.filter((item) => item !== type)
      : [...filter.types, type],
  };
}

/** `含 CG · 自动 / 场景` — short enough for the sticky hint line. */
export function contentLabel(filter: ContentFilter): string {
  const parts: string[] = [];
  if (filter.cg) parts.push('含 CG');
  if (filter.types.length > 0) parts.push(filter.types.join(' / '));
  return parts.join(' · ');
}
