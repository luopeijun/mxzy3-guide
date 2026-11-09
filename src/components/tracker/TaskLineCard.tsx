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
  /** Expand on mount and keep matching steps visible — used by the content
   *  filter, where every visible card is already a hit list. */
  forceOpen?: boolean;
  /** Search shows 「命中 N 个事件」; the content filter must not, or the badge
   *  eats the whole title on a 560px column. */
  showMatchBadge?: boolean;
  isDragging?: boolean;
  onDragStart?: (event: DragEvent<HTMLSpanElement>) => void;
  onDragEnd?: () => void;
  /** Nudge the line one slot up/down. HTML5 drag does not work in iOS Safari,
   *  so narrow viewports get buttons instead of the ⠿ handle. */
  onMove?: (delta: -1 | 1) => void;
  moveUpDisabled?: boolean;
  moveDownDisabled?: boolean;
  /** Sorting is off while a search/filter shows a partial list. */
  moveDisabled?: boolean;
}

/** 子事件编号（3-1 / 3-1-1）的层级 = `－`/`-` 的个数，用来做缩进，和攻略正文一致。 */
function stepDepth(label: string): number {
  return label.match(/[-－]/g)?.length ?? 0;
}

/** 一条事件：勾选框 + 玫红编号 pill + 类型 tag + 正文，与攻略正文的事件卡同一套观感。
 *  左侧勾选区即切换完成；右侧「⊘」按钮或右键可单独放弃这一步——被放弃的步骤
 *  不再计入这条线的完成度，也不影响其它步骤。 */
function StepRow({ lineId, step, query }: { lineId: string; step: TaskStep; query: string }) {
  const { isDone, isSkipped, toggleStep, toggleStepSkip } = useTracker();
  const done = isDone(lineId, step.index);
  const skipped = isSkipped(lineId, step.index);
  const depth = stepDepth(step.label);
  // Indent by shrinking the row as well as offsetting it: `w-full` plus a
  // margin would push the right edge past the card and give the middle column
  // a horizontal scrollbar.
  const indent = depth * 20;
  const needle = query.trim().toLowerCase();
  const hit = (value: string) => needle.length > 0 && value.toLowerCase().includes(needle);

  return (
    <div
      data-step-row
      data-step-cg={step.cg ? 'yes' : undefined}
      data-step-tag={step.tag || undefined}
      data-step-skipped={skipped ? 'yes' : undefined}
      onContextMenu={(event) => {
        event.preventDefault();
        toggleStepSkip(lineId, step.index);
      }}
      title={skipped ? '已放弃这一步 · 点右侧「恢复」或再次右键撤销' : '点勾选框完成 · 右键放弃这一步'}
      className={cn(
        'flex w-full items-start gap-2 rounded-ui-sm border px-3 py-2.5 transition-colors',
        skipped
          ? 'border-dashed border-line-strong bg-surface-soft'
          : cn(step.cg ? 'border-brand bg-brand-soft' : 'border-line bg-surface',
            done ? 'opacity-55' : 'hover:border-brand-line hover:bg-surface-soft'),
        depth > 0 && 'border-l-2 border-l-brand-line',
      )}
      style={depth > 0 ? { marginLeft: indent, width: `calc(100% - ${indent}px)` } : undefined}
    >
      <button
        type="button"
        onClick={() => toggleStep(lineId, step.index)}
        aria-pressed={done}
        disabled={skipped}
        aria-label={`${done ? '取消完成' : '标记完成'}：${step.label || step.text.slice(0, 18)}`}
        className="flex min-w-0 flex-1 items-start gap-2.5 text-left disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            'mt-[4px] flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[3px] text-[10px] leading-none transition-colors',
            skipped
              ? 'border border-dashed border-line-strong bg-surface text-transparent'
              : done
                ? 'bg-brand text-white'
                : 'border border-line-strong bg-surface text-transparent',
          )}
        >
          ✓
        </span>
        {step.label && (
          <span
            className={cn(
              'mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs px-[5px] text-center text-ui-2xs font-bold leading-[1.7]',
              skipped
                ? 'bg-surface text-ink-faint line-through'
                : step.cg
                  ? 'bg-brand text-white'
                  : 'bg-brand-soft text-brand-strong',
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
          {step.cg && !skipped && (
            <span className="mr-1.5 inline-flex items-center rounded-ui-xs border border-gold-line bg-gold-soft px-[5px] py-[1px] align-middle text-ui-2xs font-bold leading-[1.6] text-gold">
              CG
            </span>
          )}
          <span className={done || skipped ? 'text-ink-faint line-through' : 'text-ink'}>
            <MarkText text={step.text} query={query} />
          </span>
          {skipped && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-surface px-1.5 py-px align-baseline text-ui-2xs text-ink-faint ring-1 ring-line-strong">
              已放弃
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        data-step-skip
        onClick={() => toggleStepSkip(lineId, step.index)}
        aria-label={`${skipped ? '恢复' : '放弃'}步骤：${step.label || step.text.slice(0, 18)}`}
        title={
          skipped
            ? '恢复这一步：重新计回这条线的完成度'
            : '放弃这一步：不计入完成度，也不影响其它步骤'
        }
        className={cn(
          'mt-[3px] flex h-[20px] shrink-0 items-center justify-center rounded-ui-xs border text-ui-2xs leading-none transition-colors',
          skipped
            ? 'border-brand-line bg-brand-soft px-1.5 font-semibold text-brand-strong hover:border-brand'
            : 'w-[22px] border-transparent text-ink-faint opacity-55 hover:border-line-strong hover:bg-surface-soft hover:text-missing hover:opacity-100',
        )}
      >
        {skipped ? '恢复' : '⊘'}
      </button>
    </div>
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
  forceOpen = false,
  showMatchBadge = true,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onMove,
  moveUpDisabled = true,
  moveDownDisabled = true,
  moveDisabled = false,
}: Props) {
  const { getLine, setLineStatus, setLineSteps } = useTracker();
  const state = getLine(line.id);
  const status = state?.status ?? 'active';
  const abandoned = status === 'abandoned';
  const excluded = status === 'excluded';
  const doneSet = new Set(state?.done ?? []);
  const skippedSet = new Set(state?.skipped ?? []);
  // 被放弃的步骤不再参与完成度：它既不要求勾选，也不计入分母。
  const counted = line.steps.filter((step) => !skippedSet.has(step.index));
  const skippedCount = line.steps.length - counted.length;
  const doneCount = counted.filter((step) => doneSet.has(step.index)).length;
  const total = counted.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);
  const allDone = total > 0 && doneCount === total;
  const someDone = doneCount > 0 && !allDone;
  // 已有进度的线默认展开，回来接着上次的位置点；已完成池里的卡片默认收起，
  // 让归档区保持紧凑。
  const defaultOpen = !inCompletedPool && (state?.done?.length ?? 0) > 0;
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const steps = matched ? line.steps.filter((step) => matched.has(step.index)) : line.steps;

  // 搜索 / 内容筛选时自动展开，让命中的事件直接可见；退出后回到默认态。
  useEffect(() => {
    if (query.trim() || forceOpen) setOpen(true);
    else setOpen(!inCompletedPool && (state?.done?.length ?? 0) > 0);
  }, [query, forceOpen]);

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
            'shrink-0 select-none px-1 text-ui-sm leading-none text-ink-faint tab:hidden',
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
          disabled={total === 0}
          title={
            total === 0
              ? '这一条的所有步骤都已放弃'
              : allDone
                ? '取消整条完成（不含已放弃的步骤）'
                : '勾选框：一次勾选全部未放弃的子任务'
          }
          onClick={() =>
            setLineSteps(line.id, allDone ? [] : counted.map((step) => step.index))
          }
          className={cn(
            'flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[4px] border text-[11px] font-bold leading-none transition-colors',
            allDone
              ? 'border-brand bg-brand text-white'
              : someDone
                ? 'border-brand bg-brand-soft text-brand-strong'
                : 'border-line-strong bg-surface text-transparent hover:border-brand',
            total === 0 && 'cursor-not-allowed opacity-40',
          )}
        >
          {someDone ? '−' : '✓'}
        </button>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={`${open ? '收起' : '展开'}事件：${line.origin.title} · ${line.name}`}
          // A zero flex-basis lets the title shrink to nothing on a phone
          // instead of wrapping the toolbar below it, which hid the event name
          // completely. The floor forces the wrap. Filtered/searching cards
          // need the wider floor: otherwise the 命中 badge and the artist chip
          // leave one character of the name, which was the whole bug.
          className={cn(
            'flex flex-1 items-center gap-2 text-left',
            matched ? 'min-w-[200px]' : 'min-w-[130px]',
          )}
        >
          <span
            className="shrink-0 text-ink-muted transition-transform duration-150"
            style={{ transform: open ? 'rotate(90deg)' : 'none' }}
          >
            ▸
          </span>
          <LineOriginTag origin={line.origin} query={query} />
          <span
            data-line-name
            // Two lines on a phone: the reorder buttons eat the width that
            // used to fit 「女艺人的疑惑」 vs 「女艺人的请求」 apart.
            className="min-w-0 truncate text-ui-sm font-semibold text-ink tab:line-clamp-2 tab:whitespace-normal"
          >
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
          {skippedCount > 0 && (
            <span
              data-skipped-badge
              title="这条线里有步骤被单独放弃，它们不计入完成度"
              className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-ui-2xs text-ink-faint ring-1 ring-line-strong"
            >
              已放弃 {skippedCount} 步
            </span>
          )}
          {pinned && (
            <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs font-semibold text-gold">
              置顶
            </span>
          )}
          {matched && showMatchBadge && (
            <span className="shrink-0 rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs text-gold">
              命中 {matched.size} 个事件
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-2">
          {/* The bar is the first thing to go on a narrow card: with it the
              title gets squeezed to zero width and the card becomes unreadable.
              The 1/5 readout stays, so no information is lost. */}
          <div className="block h-2 w-[110px] overflow-hidden rounded-full bg-brand-soft tab:hidden min-[1280px]:w-[200px]">
            <div
              className={cn('h-full transition-all duration-300', pct === 100 ? 'bg-gold' : 'bg-brand')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span
            data-line-progress
            title={skippedCount > 0 ? `已放弃 ${skippedCount} 步，不计入完成度` : undefined}
            className="w-14 shrink-0 whitespace-nowrap text-right text-ui-2xs tabular-nums text-ink-faint"
          >
            {doneCount}/{total}
            {skippedCount > 0 && <span className="ml-1 text-ink-faint/70">·弃{skippedCount}</span>}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {onMove && (
            <span data-move-group className="hidden shrink-0 items-center gap-1 tab:flex">
              {([-1, 1] as const).map((delta) => {
                const disabled = moveDisabled || (delta === -1 ? moveUpDisabled : moveDownDisabled);
                return (
                  <button
                    key={delta}
                    type="button"
                    data-move={delta === -1 ? 'up' : 'down'}
                    disabled={disabled}
                    onClick={() => onMove(delta)}
                    aria-label={delta === -1 ? '上移一位' : '下移一位'}
                    title={
                      moveDisabled
                        ? '筛选时不可排序'
                        : disabled
                          ? delta === -1
                            ? '已经在最前面'
                            : '已经在最后面'
                          : delta === -1
                            ? '上移一位'
                            : '下移一位'
                    }
                    className={cn(
                      'flex h-[22px] w-[22px] items-center justify-center rounded-ui-xs border text-ui-2xs leading-none transition-colors',
                      disabled
                        ? 'cursor-not-allowed border-line text-ink-faint opacity-40'
                        : 'border-line text-ink-muted hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong',
                    )}
                  >
                    {delta === -1 ? '↑' : '↓'}
                  </button>
                );
              })}
            </span>
          )}
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
