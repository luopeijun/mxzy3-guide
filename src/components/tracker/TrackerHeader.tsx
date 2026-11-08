import { useTracker } from '../../hooks/useTracker';

interface Props {
  onClose: () => void;
}

/** Tracker's own top bar: a 浏览 / 追踪 tab switch plus a reset. The 浏览 tab
 *  closes the overlay and reveals the reader underneath. */
export default function TrackerHeader({ onClose }: Props) {
  const { resetAll } = useTracker();

  return (
    <header className="relative z-20 h-16 shrink-0 border-b border-line bg-surface shadow-soft">
      <div className="flex h-full items-center gap-4 px-6 nav:gap-3 nav:px-[14px]">
        <div className="flex items-center gap-1 rounded-full bg-brand-soft p-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-[13px] py-[7px] text-ui-xs text-brand-strong transition-colors hover:bg-surface"
          >
            攻略
          </button>
          <span className="rounded-full bg-brand px-[13px] py-[7px] text-ui-xs font-semibold text-white">
            追踪
          </span>
        </div>
        <span className="font-bold tracking-[0.02em]">事件追踪</span>
        <div className="ml-auto flex items-center gap-3">
          <button
            type="button"
            onClick={resetAll}
            className="text-ui-2xs text-ink-faint transition-colors hover:text-brand-strong"
          >
            重置进度
          </button>
        </div>
      </div>
    </header>
  );
}
