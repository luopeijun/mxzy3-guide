import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import type { TaskLine, TaskStep } from '../../lib/tracker';
import { useTracker } from '../../hooks/useTracker';
import { cn } from '../../lib/cn';
import TypeTag from '../TypeTag';
import MarkText from './MarkText';
import LineOriginTag from './LineOriginTag';

interface Props {
  line: TaskLine;
  /** Step indices that hit the search; null = show every step. */
  matched?: Set<number> | null;
  /** Current search query, used for highlighting and auto-expanding. */
  query?: string;
  pinned?: boolean;
  onTogglePin?: () => void;
  /** Drag is disabled while a search filter is active (a partial list cannot
   *  define a global order) and inside the archived 已完成 pool. */
  dragDisabled?: boolean;
  /** Rendered inside the 已完成 pool: starts collapsed, shows a 已完成 badge. */
  inCompletedPool?: boolean;
  isDragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLSpanElement>) => void;
  onDragEnd?: () => void;
}

/** 子事件编号（3-1 / 3-1-1）的层级 = `－`/`-` 的个数，用来做缩进，和攻略正文一致。 */
function stepDepth(label: string): number {
  return label.match(/[-－]/g)?.length ?? 0;
}

/** 一条事件：勾选框 + 玫红编号 pill + 类型 tag + 正文，与攻略正文的事件卡同一套观感。
 *  整行可点即切换完成，CG 事件用玫红描边 + 浅粉底。 */
function StepRow({ lineId, step, query }: { lineId: string; step: TaskStep; query: string }) {
  const { isDone, toggleStep } = useTracker();
  const done = isDone(lineId, step.index);
  const depth = stepDepth(step.label);
  const needle = query.trim().toLowerCase();
  const hit = (value: string) => needle.length > 0 && value.toLowerCase().includes(needle);

  return (
    <button
      type="button"
      onClick={() => toggleStep(lineId, step.index)}
      aria-pressed={done}
      className={cn(
        'flex w-full items-start gap-2.5 rounded-ui-sm border px-3 py-2.5 text-left transition-colors',
        step.cg ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
        done ? 'opacity-55' : 'hover:border-brand-line hover:bg-surface-soft',
        depth > 0 && 'border-l-2 border-l-brand-line',
      )}
      style={depth > 0 ? { marginLeft: depth * 20 } : undefined}
    >
      <span
        className={cn(
          'mt-[4px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] text-[10px] leading-none transition-colors',
          done ? 'bg-brand text-white' : 'border border-line-strong bg-surface text-transparent',
        )}
      >
        ✓
      </span>
      {step.label && (
        <span
          className={cn(
            'mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs px-[5px] text-center text-ui-2xs font-bold leading-[1.7]',
            step.cg ? 'bg-brand text-white' : 'bg-brand-soft text-brand-strong',
            hit(step.label) && 'ring-2 ring-gold',
          )}
        >
          {step.label}
        </span>
      )}
      <span className="min-w-0 flex-1 text-ui-sm leading-[1.85] break-words">
        {step.tag && (
          <span className={cn(hit(step.tag) && 'rounded-full ring-2 ring-gold')}>
            <TypeTag label={step.tag} />
          </span>
        )}
        {step.cg && (
          <span className="mr-1.5 inline-flex items-center rounded-ui-xs border border-gold-line bg-gold-soft px-[5px] py-[1px] align-middle text-ui-2xs font-bold leading-[1.6] text-gold">
            CG
          </span>
        )}
        <span className={done ? 'text-ink-faint line-through' : 'text-ink'}>
          <MarkText text={step.text} query={query} />
        </span>
      </span>
    </button>
  );
}

/** One task line: a master checkbox + progress bar + expandable step list.
 *  The master checkbox ticks / clears every step at once, which is what moves
 *  the line into (or back out of) the 已完成 pool. The line itself can also be
 *  放弃 (kept but dimmed) or 移出池子 (hidden). */
export default function TaskLineCard({
  line,
  matched = null,
  query = '',
  pinned = false,
  onTogglePin,
  dragDisabled = false,
  inCompletedPool = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
}: Props) {
  const { getLine, setLineStatus, setLineSteps } = useTracker();
  const state = getLine(line.id);
  const status = state?.status ?? 'active';
  const abandoned = status === 'abandoned';
  const excluded = status === 'excluded';
  const doneSet = new Set(state?.done ?? []);
  const doneCount = line.steps.filter((step) => doneSet.has(step.index)).length;
  const total = line.steps.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = total > 0 && doneCount === total;
  const someDone = doneCount > 0 && !allDone;
  // 已有进度的线默认展开，回来接着上次的位置点；已完成池里的卡片默认收起，
  // 让归档区保持紧凑。
  const defaultOpen = !inCompletedPool && (state?.done?.length ?? 0) > 0;
  const [open, setOpen] = useState(defaultOpen);
  const steps = matched ? line.steps.filter((step) => matched.has(step.index)) : line.steps;

  // 搜索时自动展开，让命中的事件直接可见；退出搜索后回到默认态。
  useEffect(() => {
    if (query.trim()) setOpen(true);
    else setOpen(!inCompletedPool && (state?.done?.length ?? 0) > 0);
  }, [query]);

  return (
    <div
      data-line-card
      data-line-id={line.id}
      className={cn(
        'rounded-ui-md border bg-surface shadow-soft',
        abandoned ? 'border-line-strong opacity-70' : 'border-line',
        inCompletedPool && 'border-gold-line bg-surface-soft',
        pinned && 'ring-1 ring-gold-line',
        isDragging && 'opacity-40',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <span
          draggable={!dragDisabled}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title={dragDisabled ? '当前不可拖拽排序' : '按住拖动排序'}
          aria-label="拖拽排序"
          className={cn(
            'shrink-0 select-none px-1 text-ui-sm leading-none text-ink-faint',
            dragDisabled
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-grab hover:text-brand-strong active:cursor-grabbing',
          )}
        >
          ⠿
        </span>
        <button
          type="button"
          role="checkbox"
          data-master-checkbox
          aria-checked={allDone ? 'true' : someDone ? 'mixed' : 'false'}
          aria-label={`${allDone ? '取消完成' : '完成整条'}任务线：${line.name}`}
          title={allDone ? '取消整条完成' : '勾选框：一次勾选全部子任务'}
          onClick={() =>
            setLineSteps(line.id, allDone ? [] : line.steps.map((step) => step.index))
          }
          className={cn(
            'flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border text-[11px] font-bold leading-none transition-colors',
            allDone
              ? 'border-brand bg-brand text-white'
              : someDone
                ? 'border-brand bg-brand-soft text-brand-strong'
                : 'border-line-strong bg-surface text-transparent hover:border-brand',
          )}
        >
          {someDone ? '−' : '✓'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}事件：${line.origin.title} · ${line.name}`}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <LineOriginTag origin={line.origin} query={query} />
          <span data-line-name className="min-w-0 truncate text-ui-sm font-semibold text-ink">
            <MarkText text={line.name} query={query} />
          </span>
          {inCompletedPool && (
            <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs font-semibold text-gold">
              已完成
            </span>
          )}
          {abandoned && (
            <span className="shrink-0 rounded-full bg-missing-soft px-2 py-0.5 text-ui-2xs text-missing">
              已放弃
            </span>
          )}
          {excluded && (
            <span
              data-excluded-badge
              className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-faint ring-1 ring-line-strong"
            >
              已移出
            </span>
          )}
          {pinned && (
            <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs font-semibold text-gold">
              置顶
            </span>
          )}
          {matched && (
            <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs text-gold">
              命中 {matched.size} 个事件
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <div className="h-2 w-[110px] overflow-hidden rounded-full bg-brand-soft min-[1280px]:w-[200px]">
            <div
              className={cn('h-full transition-all duration-300', pct === 100 ? 'bg-gold' : 'bg-brand')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="w-11 shrink-0 whitespace-nowrap text-right text-ui-2xs tabular-nums text-ink-faint">
            {doneCount}/{total}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePin}
            className={cn(
              'rounded-ui-sm border px-2.5 py-1 text-ui-2xs transition-colors',
              pinned
                ? 'border-gold-line bg-gold-soft text-gold hover:border-gold'
                : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
            )}
          >
            {pinned ? '取消置顶' : '置顶'}
          </button>
          <button
            type="button"
            disabled={excluded}
            title={excluded ? '先恢复进池，再决定是否放弃' : undefined}
            onClick={() => setLineStatus(line.id, abandoned ? 'active' : 'abandoned')}
            className={cn(
              'rounded-ui-sm border border-line px-2.5 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong',
              excluded && 'cursor-not-allowed opacity-50 hover:border-line hover:text-ink-muted',
            )}
          >
            {abandoned ? '恢复追踪' : '放弃'}
          </button>
          {excluded ? (
            <button
              type="button"
              data-restore-line
              onClick={() => setLineStatus(line.id, 'active')}
              className="rounded-ui-sm border border-brand-line bg-brand-soft px-2.5 py-1 text-ui-2xs font-semibold text-brand-strong transition-colors hover:border-brand"
            >
              恢复进池
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setLineStatus(line.id, 'excluded')}
              className="rounded-ui-sm border border-line px-2.5 py-1 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              移出池子
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-line px-4 py-3">
          <ul className="flex flex-col gap-2">
            {steps.map((step) => (
              <li key={step.index}>
                <StepRow lineId={line.id} step={step} query={query} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
