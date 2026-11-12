import type { TaskLine } from './tracker';

/** A line that hit the search. `matched === null` means the line NAME hit (or
 *  there is no query), so all of its steps are shown. Otherwise only the
 *  steps whose index is in `matched` are shown. */
export interface LineMatch {
  line: TaskLine;
  matched: Set<number> | null;
}

/** Case-insensitive substring match over line name, source chip (artist name /
 *  category), event number, trigger tag and event body. A source hit shows the
 *  whole line, just like a name hit — searching 林芬芬 finds all her lines.
 *  Returns null when nothing in the line matches. */
export function matchLine(line: TaskLine, needle: string): LineMatch | null {
  if (!needle) return { line, matched: null };
  const source = `${line.origin.label} ${line.origin.title}`.toLowerCase();
  if (line.name.toLowerCase().includes(needle) || source.includes(needle)) {
    return { line, matched: null };
  }

  const matched = new Set<number>();
  for (const step of line.steps) {
    if (
      step.label.toLowerCase().includes(needle) ||
      (step.tag ?? '').toLowerCase().includes(needle) ||
      step.text.toLowerCase().includes(needle) ||
      // 甜蜜乐章的「时间 / 概要 / 提示」收在折叠详情里，也要能被搜到。
      (step.details ?? []).some((detail) => detail.text.toLowerCase().includes(needle))
    ) {
      matched.add(step.index);
    }
  }
  return matched.size > 0 ? { line, matched } : null;
}

export function visibleStepCount(entry: LineMatch): number {
  return entry.matched ? entry.matched.size : entry.line.steps.length;
}
