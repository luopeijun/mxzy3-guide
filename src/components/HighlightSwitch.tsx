import { cn } from '../lib/cn';
import { useHighlightPref } from '../hooks/useHighlightPref';

/** Header switch for body-copy tints. The 速览 card keeps its highlights, so
 *  the label says 正文 to keep the promise narrow. */
export default function HighlightSwitch() {
  const { enabled, toggle } = useHighlightPref();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label="正文高亮"
      title={enabled ? '关闭正文高亮（速览卡不受影响）' : '打开正文高亮'}
      onClick={toggle}
      className="group flex shrink-0 items-center gap-2 rounded-full text-ui-2xs text-ink-faint transition-colors duration-150 hover:text-ink"
    >
      <span className="whitespace-nowrap tab:hidden">正文高亮</span>
      <span
        className={cn(
          'relative h-[18px] w-[32px] rounded-full transition-colors duration-150',
          enabled ? 'bg-brand' : 'bg-brand-line',
        )}
        aria-hidden="true"
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(28,18,22,0.28)] transition-all duration-150',
            enabled ? 'left-[16px]' : 'left-[2px]',
          )}
        />
      </span>
    </button>
  );
}
