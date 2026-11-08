import { useState } from 'react';
import type { TaskLine } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';
import TypeTag from '../TypeTag';

interface Props {
  line: TaskLine;
}

/** One task line: a progress bar plus an expandable list of triggerable steps.
 *  The line itself can be 放弃 (kept but dimmed) or 移出池子 (hidden). */
export default function TaskLineCard({ line }: Props) {
  const { getLine, isDone, toggleStep, setLineStatus } = useTracker();
  const state = getLine(line.id);
  const abandoned = (state?.status ?? 'active') === 'abandoned';
  const doneSet = new Set(state?.done ?? []);
  const doneCount = line.steps.filter((step) => doneSet.has(step.index)).length;
  const total = line.steps.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-ui-md border bg-surface shadow-soft',
        abandoned ? 'border-line-strong opacity-70' : 'border-line',
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label={open ? '收起步骤' : '展开步骤'}
            className="mt-0.5 shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-ui-sm font-semibold text-ink">{line.name}</h4>
              {abandoned && (
                <span className="shrink-0 rounded-full bg-missing-soft px-2 py-0.5 text-ui-2xs text-missing">
                  已放弃
                </span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-soft">
                <div
                  className={cn('h-full transition-all duration-300', pct === 100 ? 'bg-gold' : 'bg-brand')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 whitespace-nowrap text-ui-2xs text-ink-faint">
                {doneCount}/{total}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLineStatus(line.id, abandoned ? 'active' : 'abandoned')}
            className="rounded-ui-sm border border-line px-3 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
          >
            {abandoned ? '恢复追踪' : '放弃'}
          </button>
          <button
            type="button"
            onClick={() => setLineStatus(line.id, 'excluded')}
            className="rounded-ui-sm border border-line px-3 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
          >
            移出池子
          </button>
        </div>
      </div>

      {open && (
        <ul className="border-t border-line px-4 py-1">
          {line.steps.map((step) => {
            const done = isDone(line.id, step.index);
            return (
              <li key={step.index}>
                <button
                  type="button"
                  onClick={() => toggleStep(line.id, step.index)}
                  className="flex w-full items-start gap-2 py-2 text-left"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[11px]',
                      done ? 'bg-brand text-white' : 'border border-line-strong text-transparent',
                    )}
                  >
                    ✓
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="text-ui-2xs font-medium text-ink-faint">{step.label}</span>
                      {step.cg && (
                        <span className="rounded bg-gold-soft px-1 text-ui-2xs font-semibold text-gold">
                          CG
                        </span>
                      )}
                      {step.tag && <TypeTag label={step.tag} />}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 block text-ui-xs leading-[1.6] line-clamp-2',
                        done ? 'text-ink-faint line-through' : 'text-ink-muted',
                      )}
                    >
                      {step.text}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
