import { useState } from 'react';
import { cn } from '../lib/cn';
import { formatWeekRange, memoDisplayCells, type MemoWeek } from '../lib/memoNotes';

/** 本周便签：存档解析页的独立备忘录。按当前存档的游戏日期落到哪一周，
 *  原样显示那一周的内容列，并可前后翻周、一键回到当前。只提醒、不编辑、
 *  不统计，也不跟存档绑定。桌面宽屏作为右栏顶部常驻卡（默认展开），
 *  窄屏在正文顶部给简版兜底。
 *
 *  两站共用：DOM / data-case-memo-* 保持不变；只有模板下载地址按站点传入。 */
export function MemoNote({
  week,
  weekOffset,
  showNav,
  canPrev,
  canNext,
  fileName,
  error,
  onImport,
  onClear,
  onPrev,
  onNext,
  onReset,
  variant = 'inline',
  templateHref = `${import.meta.env.BASE_URL}memo-template.xlsx`,
}: {
  week: MemoWeek | null;
  weekOffset: number;
  showNav: boolean;
  canPrev: boolean;
  canNext: boolean;
  fileName: string;
  error: string;
  onImport: () => void;
  onClear: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReset: () => void;
  variant?: 'aside' | 'inline';
  templateHref?: string;
}) {
  const [open, setOpen] = useState(true);
  const isAside = variant === 'aside';
  return (
    <section
      data-case-memo
      data-case-memo-variant={variant}
      className={cn('rounded-ui-md border border-line bg-surface', isAside ? 'shrink-0 p-2' : 'px-3 py-2')}
    >
      <button
        type="button"
        data-case-memo-toggle
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="block w-full text-left text-ui-xs font-semibold text-ink-muted transition-colors hover:text-brand-strong"
      >
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-sm bg-tag-auto" />
          <span data-case-memo-label className="shrink-0">
            {weekOffset === 0 ? '本周便签' : weekOffset < 0 ? `前 ${-weekOffset} 周` : `后 ${weekOffset} 周`}
          </span>
          <span className="ml-auto shrink-0 text-ui-2xs font-normal text-ink-faint">{open ? '收起' : '展开'}</span>
        </span>
        {week && (
          <span
            data-case-memo-range
            title={week.rangeText}
            className="mt-0.5 block whitespace-nowrap text-ui-2xs font-normal text-ink-faint"
          >
            {formatWeekRange(week.rangeText)}
          </span>
        )}
      </button>
      {error && (
        <p data-case-memo-error className="mt-1 text-ui-2xs text-alert">备忘录导入失败：{error}</p>
      )}
      {open && (
        <>
          {week ? (
            <div
              data-case-memo-body
              className={cn(
                'mt-2 grid gap-2',
                isAside ? 'max-h-[min(32vh,240px)] grid-cols-1 overflow-y-auto pr-0.5' : 'phone:grid-cols-1 sm:grid-cols-2',
              )}
            >
              {memoDisplayCells(week.cells).map((cell, i) => (
                <div key={i} className="rounded-ui-sm bg-canvas px-2.5 py-2">
                  <div className="mb-1 text-ui-2xs font-semibold text-ink-faint">{cell.label}</div>
                  <div className="whitespace-pre-wrap break-words text-ui-2xs leading-relaxed text-ink">{cell.value}</div>
                </div>
              ))}
            </div>
          ) : (
            <p data-case-memo-empty className="mt-2 text-ui-2xs text-ink-faint">
              {fileName ? '当前游戏日期不在备忘录的周区间内。' : '还没导入备忘录。点「导入备忘录」选一个自己填好的 Excel，或先下载模板。'}
            </p>
          )}
          {showNav && (
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                data-case-memo-prev
                disabled={!canPrev}
                onClick={onPrev}
                className="rounded-full border border-line px-2 py-0.5 text-ui-2xs font-normal text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted"
              >
                ← 上一周
              </button>
              <button
                type="button"
                data-case-memo-next
                disabled={!canNext}
                onClick={onNext}
                className="rounded-full border border-line px-2 py-0.5 text-ui-2xs font-normal text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-muted"
              >
                下一周 →
              </button>
              {weekOffset !== 0 && (
                <button
                  type="button"
                  data-case-memo-current
                  onClick={onReset}
                  className="ml-auto text-ui-2xs font-normal text-brand-strong transition-colors hover:underline"
                >
                  回到当前
                </button>
              )}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
            <button
              type="button"
              data-case-memo-import
              onClick={onImport}
              className="rounded-full border border-line px-2 py-0.5 text-ui-2xs font-normal text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              导入备忘录
            </button>
            {fileName && (
              <button
                type="button"
                onClick={onClear}
                className="text-ui-2xs font-normal text-ink-faint transition-colors hover:text-alert"
              >
                清除
              </button>
            )}
            <a
              href={templateHref}
              download="备忘录模板.xlsx"
              className="text-ui-2xs text-ink-faint underline decoration-line-strong underline-offset-2 transition-colors hover:text-brand-strong"
            >
              下载模板
            </a>
          </div>
        </>
      )}
    </section>
  );
}
