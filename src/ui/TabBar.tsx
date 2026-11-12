import { cn } from '../lib/cn';

export interface TabItem {
  id: string;
  label: string;
  /** Optional hook for the CDP regressions (`[data-tab="cg"]` etc.). */
  dataTab?: string;
}

interface Props {
  items: TabItem[];
  activeId: string;
  ariaLabel: string;
  onSelect: (id: string) => void;
}

/** 文字底线式页签，两个站点共用一套视觉：未选中是浅墨色文字，悬停提为品牌
 *  深色；激活项品牌深色加粗，文字正下方压一条品牌色短下划线（伪元素画的，
 *  随文字走）。页签内容由调用方给，明星志愿3 是五个入口，甜蜜乐章先只有攻略。 */
export default function TabBar({ items, activeId, ariaLabel, onSelect }: Props) {
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
      aria-label={ariaLabel}
      className="flex shrink-0 items-center gap-6 nav:gap-4 phone:gap-3"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={activeId === item.id}
          data-tab={item.dataTab}
          onClick={() => onSelect(item.id)}
          className={tabClass(activeId === item.id)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
