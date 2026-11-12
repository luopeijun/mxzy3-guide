import { useMemo, useState } from 'react';
import type { GuideData } from '../../types/guide';
import { buildPool } from '../../lib/tracker';
import { summarisePool } from '../../lib/trackerStats';
import { useTracker } from '../../hooks/useTracker';

interface Props {
  data: GuideData;
}

/** Compact progress summary that rounds out the selector panel: how many lines
 *  are in the pool, how many steps are done, and what was abandoned/excluded. */
export default function TrackerOverview({ data }: Props) {
  const {
    config,
    poolSelection,
    includeReleased,
    setIncludeReleased,
    getLine,
    resetAll,
  } = useTracker();
  const [confirmReset, setConfirmReset] = useState(false);
  const pool = useMemo(
    () => buildPool(data, poolSelection, config),
    [data, poolSelection, config],
  );
  const stats = useMemo(
    () => summarisePool(pool, getLine, includeReleased),
    [pool, getLine, includeReleased],
  );
  const staleCount = pool.filter((line) => line.staleKind).length;

  const rows: Array<[string, number, string]> = [
    ['进行中', stats.activeLines, 'text-brand-strong'],
    ['放弃', stats.abandoned, 'text-ink-muted'],
    ['移出', stats.excluded, 'text-ink-faint'],
  ];

  return (
    <section className="rounded-ui-md border border-line bg-surface p-5 shadow-soft">
      <div className="flex items-baseline justify-between">
        <h2 className="text-ui-sm font-bold text-brand-strong">进度概览</h2>
        {confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(false)}
            className="text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
          >
            取消
          </button>
        ) : (
          <button
            type="button"
            data-reset-request
            onClick={() => setConfirmReset(true)}
            className="text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
          >
            重置进度
          </button>
        )}
      </div>

      {confirmReset && (
        <div
          data-reset-confirm
          className="mt-3 rounded-ui-sm border border-line-strong bg-surface-soft p-2.5"
        >
          <p className="text-ui-2xs leading-[1.7] text-ink-muted">
            重置会清空全部勾选、放弃与排序记录。想留底的话，先在下方「全部存档」导出；重置后也可以在那里撤销这一次。
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              data-reset-confirm-button
              onClick={() => {
                resetAll();
                setConfirmReset(false);
              }}
              className="flex-1 rounded-ui-sm border border-missing bg-missing-soft px-2.5 py-1.5 text-ui-2xs font-semibold text-missing transition-colors hover:border-missing"
            >
              确认重置
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="flex-1 rounded-ui-sm border border-line px-2.5 py-1.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              取消
            </button>
          </div>
        </div>
      )}

      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-ui-2xs text-ink-muted">步骤完成度</span>
          <span className="text-ui-sm font-semibold text-brand-strong">{stats.pctLabel}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-300"
            style={{ width: `${stats.pct}%` }}
          />
        </div>
        <p className="mt-1 text-ui-2xs text-ink-faint">
          已完成 {stats.doneSteps} / {stats.totalSteps} 个步骤
          {stats.skippedSteps > 0 && ` · 已放弃 ${stats.skippedSteps} 步`}
          {stats.completedLines > 0 && ` · ${stats.completedLines} 条线已归档`}
        </p>
        {staleCount > 0 && (
          <label
            className="mt-2.5 flex cursor-pointer items-center gap-2 text-ui-2xs text-ink-muted"
            title={config.includeReleasedTip}
          >
            <input
              type="checkbox"
              data-include-released
              checked={includeReleased}
              onChange={(event) => setIncludeReleased(event.target.checked)}
              style={{ accentColor: 'var(--color-brand)' }}
              className="h-3.5 w-3.5 shrink-0"
            />
            <span>包含已解约（{staleCount} 条线）</span>
          </label>
        )}
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {rows.map(([label, value, tone]) => (
          <div key={label} className="rounded-ui-sm border border-line bg-surface-soft py-2">
            <dt className="text-ui-2xs text-ink-faint">{label}</dt>
            <dd className={`mt-0.5 text-ui-lg font-semibold ${tone}`}>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
