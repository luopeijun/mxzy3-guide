import type { GuideNode, GuideStats } from '../types/guide';
import { cn } from '../lib/cn';

interface Props {
  categories: GuideNode[];
  activeCategoryId: string;
  stats: GuideStats;
  onSelect: (id: string) => void;
  onMenuClick: () => void;
}

export default function BrandHeader({
  categories, activeCategoryId, stats, onSelect, onMenuClick,
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
          <span
            className="h-[26px] w-[26px] shrink-0 rotate-45 rounded-[7px] bg-[linear-gradient(135deg,#8e3a72,#5c2350)] shadow-[0_3px_8px_rgba(92,35,80,0.3)]"
            aria-hidden="true"
          />
          <span className="flex flex-col whitespace-nowrap leading-[1.25]">
            <span className="text-ui-md font-bold tracking-[0.02em]">明星志愿3 · 攻略助手</span>
            <span className="text-ui-2xs text-ink-faint">分级浏览 / 原片 + 资料集</span>
          </span>
        </button>

        <nav className="ml-auto flex items-center gap-1 tab:gap-0 nav:hidden" aria-label="攻略分类">
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

        <div className="whitespace-nowrap border-l border-line pl-[18px] text-ui-2xs text-ink-faint tab:hidden">
          {stats.items} 条目 · {stats.blocks} 段内容
        </div>
      </div>
    </header>
  );
}
