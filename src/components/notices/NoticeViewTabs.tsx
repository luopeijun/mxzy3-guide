import { cn } from '../../lib/cn';

interface Props {
  view: 'list' | 'reference';
  onChange: (view: 'list' | 'reference') => void;
}

const TABS = [
  ['list', '通告列表'],
  ['reference', '能力对照'],
] as const;

/** 文件夹式页签：选中的一页与下方内容面板连成一体。
 *
 *  做法是页面底部带 1px 线、选中项整体下移 1px 并把自身的下边框画成面板底色，
 *  于是那条线在选中项下方「断开」，看起来像抽屉口。选中项多补 1px 内边距，
 *  保证下移之后文字仍与未选中项对齐。 */
export default function NoticeViewTabs({ view, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="通告视图"
      data-notice-tabs
      className="flex items-end gap-1 border-b border-line"
    >
      {TABS.map(([key, label]) => {
        const active = view === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            data-notice-view={key}
            aria-selected={active}
            onClick={() => onChange(key)}
            className={cn(
              'shrink-0 rounded-t-ui-md border px-3.5 pt-[6px] text-ui-sm leading-[20px] transition-colors',
              active
                ? '-mb-px border-line border-b-surface bg-surface pb-[7px] font-semibold text-brand-strong'
                : 'border-transparent pb-[6px] text-ink-muted hover:text-brand-strong',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
