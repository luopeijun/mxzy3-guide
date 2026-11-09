import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/** 一张便签：顶部一条色带当作索引标记，标题旁再点一个同色圆点。
 *  「能力对照」与「小贴士」两页共用同一张卡片骨架，data-note-card 供
 *  右栏小结滚动定位与 CDP 断言使用。 */
export default function NoteCard({
  name,
  tone,
  title,
  hint,
  className,
  children,
}: {
  name: string;
  tone: string;
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-note-card={name}
      className={cn(
        'relative overflow-hidden rounded-ui-md border border-line bg-surface shadow-soft',
        className,
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', tone)} aria-hidden="true" />
      <div className="px-5 pb-4 pt-4">
        <h2 className="flex items-center gap-1.5 text-ui-sm font-bold text-brand-strong">
          <span className={cn('h-1.5 w-1.5 rounded-full', tone)} aria-hidden="true" />
          {title}
        </h2>
        {hint && <p className="mt-1 text-ui-2xs leading-[1.7] text-ink-faint">{hint}</p>}
        {children}
      </div>
    </section>
  );
}
