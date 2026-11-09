import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface NoteSection {
  key: string;
  label: string;
}

/** 便签页骨架：左侧滚动便签网格 + 右栏「本页小结」。
 *  滚动时高亮当前所在便签（取「顶部已经越过容器上沿的最后一块」），
 *  点小结条目平滑滚到对应便签。「能力对照」与「小贴士」两页共用。 */
export default function NotePage({
  sections,
  children,
}: {
  sections: readonly NoteSection[];
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>(sections[0]?.key ?? '');

  // 滚动时高亮当前便签：取「顶部已经越过容器上沿的最后一块」。
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const base = box.getBoundingClientRect().top;
      let current: string = sections[0]?.key ?? '';
      let best = -Infinity;
      for (const section of sections) {
        const card = box.querySelector<HTMLElement>(`[data-note-card="${section.key}"]`);
        if (!card) continue;
        const top = card.getBoundingClientRect().top - base;
        // 并排的两块会同时越线，取更贴近上沿的那块；相等时保留先出现的一块。
        if (top <= 40 && top > best) {
          best = top;
          current = section.key;
        }
      }
      // 滚到底时最后一块可能永远到不了上沿，直接把它点亮。
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
        current = sections[sections.length - 1]?.key ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      box.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const jump = (key: string) => {
    const box = scrollRef.current;
    const card = box?.querySelector<HTMLElement>(`[data-note-card="${key}"]`);
    if (!box || !card) return;
    const top = card.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setActive(key);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-note-scroll
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]"
      >
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-4 min-[1240px]:grid-cols-2">
          {children}
        </div>
      </div>

      <nav
        data-note-rail
        aria-label="本页小结"
        className="hidden w-[176px] shrink-0 border-l border-line px-3 py-5 min-[1120px]:block"
      >
        <p className="px-1 text-ui-2xs font-semibold text-ink-faint">本页小结</p>
        <ul className="mt-2 flex flex-col gap-0.5">
          {sections.map((section) => {
            const current = active === section.key;
            return (
              <li key={section.key}>
                <button
                  type="button"
                  data-note-rail-item={section.key}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => jump(section.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-ui-xs px-2 py-1.5 text-left text-ui-2xs transition-colors',
                    current
                      ? 'bg-brand-soft font-semibold text-brand-strong'
                      : 'text-ink-muted hover:bg-surface-soft hover:text-brand-strong',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      current ? 'bg-brand' : 'bg-line-strong',
                    )}
                  />
                  {section.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
