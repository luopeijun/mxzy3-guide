import type { GuideNode, GuideSummary } from '../types/guide';
import { formatCount } from '../lib/guide';
import { cn } from '../lib/cn';
import { HIGHLIGHT_ENABLED } from '../hooks/useHighlightPref';
import HighlightSwitch from './HighlightSwitch';

interface Props {
  categories: GuideNode[];
  activeCategoryId: string;
  summary: GuideSummary;
  onSelect: (id: string) => void;
  onMenuClick: () => void;
}

export default function BrandHeader({
  categories, activeCategoryId, summary, onSelect, onMenuClick,
}: Props) {
  return (
    <header className="relative z-20 h-16 shrink-0 border-b border-line bg-surface shadow-soft">
      <div className="flex h-full items-center gap-6 px-6 nav:gap-3 nav:px-[14px]">
        <button
          className="hidden h-[34px] w-[34px] items-center justify-center rounded-ui-sm border border-line text-[17px] text-brand nav:flex"
          type="button"
          onClick={onMenuClick}
          aria-label="打开目录"
        >
          ☰
        </button>
        <button className="flex min-w-0 items-center gap-[11px]" type="button" onClick={() => onSelect('')}>
          <img
            src={`${import.meta.env.BASE_URL}favicon.ico`}
            alt=""
            className="h-[26px] w-[26px] shrink-0 rounded-[6px]"
            aria-hidden="true"
          />
          <span className="whitespace-nowrap text-ui-md font-bold tracking-[0.02em]">明星志愿3 · 攻略助手</span>
        </button>

        <div className="ml-auto flex items-center gap-4 nav:gap-3">
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

          {HIGHLIGHT_ENABLED && <HighlightSwitch />}

          <button
            type="button"
            onClick={() => {
              window.location.hash = '/tracker';
            }}
            className="rounded-full border border-brand-line bg-brand-soft px-[13px] py-[7px] text-ui-xs font-semibold text-brand-strong transition-colors hover:bg-brand hover:text-white tab:px-[9px]"
          >
            事件追踪
          </button>

          <div className="whitespace-nowrap border-l border-line pl-[18px] text-ui-2xs text-ink-faint tab:hidden">
            {summary.items} 条目 · {formatCount(summary.chars)} 字
          </div>
        </div>
      </div>
    </header>
  );
}
