import { cn } from '../lib/cn';

interface Props {
  mode: 'guide' | 'tracker';
  onViewGuide: () => void;
  onViewTracker: () => void;
}

/** The one shared tab switch for both top-level views. Rendered by the single
 *  global header, so switching views never redraws the header itself. */
export default function ViewTabs({ mode, onViewGuide, onViewTracker }: Props) {
  const tabClass = (active: boolean) =>
    cn(
      'rounded-full px-[13px] py-[7px] text-ui-xs transition-colors whitespace-nowrap',
      active
        ? 'bg-brand font-semibold text-white'
        : 'text-brand-strong hover:bg-surface',
    );

  return (
    <nav
      role="tablist"
      aria-label="视图切换"
      className="flex shrink-0 items-center gap-1 rounded-full bg-brand-soft p-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'guide'}
        onClick={onViewGuide}
        className={tabClass(mode === 'guide')}
      >
        攻略
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'tracker'}
        onClick={onViewTracker}
        className={tabClass(mode === 'tracker')}
      >
        事件追踪
      </button>
    </nav>
  );
}
