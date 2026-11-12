import type { GuideNode } from '../types/guide';
import { cn } from '../lib/cn';
import { HIGHLIGHT_ENABLED } from '../hooks/useHighlightPref';
import HighlightSwitch from './HighlightSwitch';
import GameHeader from '../ui/GameHeader';
import ViewTabs, { type ViewMode } from './ViewTabs';

interface Props {
  categories: GuideNode[];
  activeCategoryId: string;
  mode: ViewMode;
  onViewGuide: () => void;
  onViewTracker: () => void;
  onViewNotices: () => void;
  onViewCg: () => void;
  onViewSpecials: () => void;
  onSelect: (id: string) => void;
  onMenuClick: () => void;
}

/** 明星志愿3 的顶栏：骨架在 `ui/GameHeader`，这里只填站名、五个页签、
 *  攻略分类胶囊和跨站入口。 */
export default function BrandHeader({
  categories, activeCategoryId, mode, onViewGuide, onViewTracker, onViewNotices, onViewCg,
  onViewSpecials, onSelect, onMenuClick,
}: Props) {
  const menuButton = mode === 'guide' ? (
    <button
      className="hidden h-[34px] w-[34px] items-center justify-center rounded-ui-sm border border-line text-[17px] text-brand nav:flex"
      type="button"
      onClick={onMenuClick}
      aria-label="打开目录"
    >
      ☰
    </button>
  ) : null;

  return (
    <GameHeader
      title="明星志愿3 · 攻略助手"
      logoSrc={`${import.meta.env.BASE_URL}favicon.ico`}
      onBrandClick={() => onSelect('')}
      menuButton={menuButton}
      tabs={(
        <ViewTabs
          mode={mode}
          onViewGuide={onViewGuide}
          onViewTracker={onViewTracker}
          onViewNotices={onViewNotices}
          onViewCg={onViewCg}
          onViewSpecials={onViewSpecials}
        />
      )}
      crossLink={{
        href: `${import.meta.env.BASE_URL}sweet.html`,
        label: '甜蜜乐章 ›',
        hint: '打开 明星志愿3 甜蜜乐章 攻略助手',
      }}
      right={(
        <>
          {mode === 'guide' && (
            <nav className="flex items-center gap-1 tab:gap-0 nav:hidden" aria-label="攻略分类">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={cn(
                    'whitespace-nowrap rounded-full px-[13px] py-[7px] text-ui-xs transition-colors duration-150 tab:px-[9px] tab:py-1.5',
                    activeCategoryId === category.id
                      ? 'bg-brand-soft font-semibold text-brand-strong'
                      : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
                  )}
                  onClick={() => onSelect(category.id)}
                >
                  {category.title}
                </button>
              ))}
            </nav>
          )}

          {HIGHLIGHT_ENABLED && <HighlightSwitch />}
        </>
      )}
    />
  );
}
