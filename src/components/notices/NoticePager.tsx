import { useEffect, useState } from 'react';
import { cn } from '../../lib/cn';
import { IconChevronLeft, IconChevronRight } from '../icons';

/** 每页条数候选。24 是默认值：双列下正好排满一屏左右。 */
export const PAGE_SIZES = [12, 24, 48, 96] as const;
export const DEFAULT_PAGE_SIZE = 24;

interface Props {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}

type Slot = number | 'gap';

/** 页码序列：首末页始终在场，当前页左右各留一页，其余折叠成省略号。
 *  靠近两端时多铺两个数字，免得刚进页面就看见「1 2 … 27」。 */
function pageSlots(current: number, total: number): Slot[] {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  let start = current - 1;
  let end = current + 1;
  if (current <= 3) {
    start = 2;
    end = 4;
  } else if (current >= total - 2) {
    start = total - 3;
    end = total - 1;
  }
  const slots: Slot[] = [1];
  if (start > 2) slots.push('gap');
  for (let value = Math.max(2, start); value <= Math.min(total - 1, end); value += 1) {
    slots.push(value);
  }
  if (end < total - 1) slots.push('gap');
  slots.push(total);
  return slots;
}

function stepClass(disabled: boolean) {
  return cn(
    'flex h-7 items-center justify-center rounded-ui-xs border px-1.5 text-ui-2xs transition-colors',
    disabled
      ? 'cursor-not-allowed border-line text-line-strong'
      : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
  );
}

/** 通告列表的分页器：首末页跳转、上一页/下一页、页码、每页条数与「跳至 N 页」。
 *  只渲染当前这一页的卡片，翻页即换数据，长列表不会驻留上千个 DOM 节点。 */
export default function NoticePager({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: Props) {
  const [jump, setJump] = useState('');
  // 页码一变，「跳至」里的旧数字就过期了；不清掉会让人以为已经填好。
  useEffect(() => setJump(''), [page]);

  const atFirst = page <= 1;
  const atLast = page >= pageCount;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const submitJump = () => {
    const value = Number.parseInt(jump, 10);
    if (Number.isNaN(value)) return;
    onPage(Math.min(pageCount, Math.max(1, value)));
  };

  return (
    <div
      data-notice-pager
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-5 py-2.5 phone:justify-center phone:px-3"
    >
      <span data-notice-range className="text-ui-2xs tabular-nums text-ink-faint">
        第 {from}–{to} 条 · 共 {total} 条
      </span>

      <label className="flex items-center gap-1.5 text-ui-2xs text-ink-faint">
        每页
        <select
          data-notice-page-size
          value={pageSize}
          aria-label="每页显示多少条"
          onChange={(event) => onPageSize(Number(event.target.value))}
          className="rounded-ui-xs border border-line bg-surface py-1 pl-1.5 pr-1 text-ui-2xs tabular-nums text-ink outline-none transition-colors hover:border-brand-line"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        条
      </label>

      <nav aria-label="通告分页" className="ml-auto flex items-center gap-1 phone:ml-0">
        <button
          type="button"
          data-notice-page="prev"
          aria-label="上一页"
          title="上一页"
          disabled={atFirst}
          onClick={() => onPage(page - 1)}
          className={cn(stepClass(atFirst), 'w-7 px-0')}
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pageSlots(page, pageCount).map((slot, index) =>
          slot === 'gap' ? (
            <span
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-0.5 text-ui-2xs text-ink-faint"
            >
              …
            </span>
          ) : (
            <button
              key={slot}
              type="button"
              data-notice-page-num={slot}
              aria-current={slot === page ? 'page' : undefined}
              aria-label={`第 ${slot} 页`}
              onClick={() => onPage(slot)}
              className={cn(
                'h-7 min-w-7 rounded-ui-xs border px-1.5 text-ui-2xs tabular-nums transition-colors',
                slot === page
                  ? 'border-brand bg-brand font-semibold text-white'
                  : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
              )}
            >
              {slot}
            </button>
          ),
        )}

        <button
          type="button"
          data-notice-page="next"
          aria-label="下一页"
          title="下一页"
          disabled={atLast}
          onClick={() => onPage(page + 1)}
          className={cn(stepClass(atLast), 'w-7 px-0')}
        >
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </nav>

      <form
        className="flex items-center gap-1.5 text-ui-2xs text-ink-faint"
        onSubmit={(event) => {
          event.preventDefault();
          submitJump();
        }}
      >
        跳至
        <input
          data-notice-jump
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          aria-label={`跳转到第几页，共 ${pageCount} 页`}
          placeholder="页码"
          className="h-7 w-11 rounded-ui-xs border border-line bg-surface text-center text-ui-2xs tabular-nums text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-brand-line"
        />
        页
        <button
          type="submit"
          data-notice-jump-go
          disabled={jump.trim() === ''}
          className={cn(
            'h-7 rounded-ui-xs border px-2 text-ui-2xs transition-colors',
            jump.trim() === ''
              ? 'cursor-not-allowed border-line text-ink-faint'
              : 'border-line text-ink-muted hover:border-brand-line hover:text-brand-strong',
          )}
        >
          跳转
        </button>
      </form>
    </div>
  );
}
