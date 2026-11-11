import { cn } from '../lib/cn';

export type ViewMode = 'guide' | 'tracker' | 'notices' | 'cg' | 'specials';

interface Props {
  mode: ViewMode;
  onViewGuide: () => void;
  onViewTracker: () => void;
  onViewNotices: () => void;
  onViewCg: () => void;
  onViewSpecials: () => void;
}

/** The one shared tab switch for every top-level view. Rendered by the single
 *  global header, so switching views never redraws the header itself.
 *
 *  文字底线式：没有容器底色——未选中是浅墨色文字，悬停提为品牌深色；激活项
 *  品牌深色加粗，文字正下方压一条品牌色短下划线（伪元素画的，随文字走）。 */
export default function ViewTabs({
  mode,
  onViewGuide,
  onViewTracker,
  onViewNotices,
  onViewCg,
  onViewSpecials,
}: Props) {
  const tabClass = (active: boolean) =>
    cn(
      'relative whitespace-nowrap px-0.5 pt-1 pb-[7px] text-ui-xs transition-colors',
      active
        ? cn(
            'font-semibold text-brand-strong',
            "after:absolute after:inset-x-0 after:bottom-0 after:h-[2.5px] after:rounded-full after:bg-brand after:content-['']",
          )
        : 'text-ink-faint hover:text-brand-strong',
    );

  return (
    <nav
      role="tablist"
      aria-label="视图切换"
      className="flex shrink-0 items-center gap-6 nav:gap-4 phone:gap-3"
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
        aria-selected={mode === 'notices'}
        data-tab="notices"
        onClick={onViewNotices}
        className={tabClass(mode === 'notices')}
      >
        通告
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
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'cg'}
        data-tab="cg"
        onClick={onViewCg}
        className={tabClass(mode === 'cg')}
      >
        CG 图鉴
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'specials'}
        data-tab="specials"
        onClick={onViewSpecials}
        className={tabClass(mode === 'specials')}
      >
        六大通告
      </button>
    </nav>
  );
}
