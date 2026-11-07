import { useState } from 'react';
import { cn } from '../lib/cn';
import { numberOutline } from '../lib/guide';
import type { OutlineItem } from '../lib/guide';
import { useActiveOutline } from '../hooks/useActiveOutline';
import { useReaderLayout } from '../hooks/useReaderLayout';
import { IconChevronLeft, IconChevronRight, IconChevronUp } from './icons';

const STORAGE_KEY = 'guide.rail.v1';

/** The folded choice is a reading preference, so it outlives the page. */
function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, collapsed ? 'collapsed' : 'open');
  } catch {
    // Private mode: the rail still works, it just forgets the choice.
  }
}

interface Props {
  items: OutlineItem[];
  onJump: (anchor: string) => void;
}

/**
 * Side rail for article pages: every heading of this page plus a back-to-top
 * button, pinned beside the text.
 *
 * It is a real layout column, not an overlay, so it can never cover the article.
 * The column keeps its width either way — folding the rail only hides the list,
 * so the text never jumps sideways. When the column itself gets tight, AppShell
 * drops the rail and the outline card at the top of the article takes over.
 */
export default function PageRail({ items, onJump }: Props) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { scrollToTop } = useReaderLayout();
  const active = useActiveOutline(items.map((item) => item.id));
  const numbered = numberOutline(items);
  const hasItems = numbered.length > 0;
  const folded = collapsed && hasItems;

  const toggle = () => {
    setCollapsed((previous) => {
      writeCollapsed(!previous);
      return !previous;
    });
  };

  return (
    <nav
      aria-label="本页小节"
      className="sticky top-6 flex w-[192px] shrink-0 flex-col items-end"
    >
      {hasItems && (folded ? (
        <div className="flex w-9 flex-col items-center rounded-ui-md border border-line bg-surface shadow-soft">
          <button
            type="button"
            onClick={toggle}
            title="展开本页小节"
            aria-label="展开本页小节"
            className="flex h-7 w-full items-center justify-center rounded-t-ui-md text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand"
          >
            <IconChevronLeft className="h-[10px] w-[10px]" />
          </button>
          <button
            type="button"
            onClick={toggle}
            aria-label={`展开本页小节，共 ${numbered.length} 条`}
            className="group flex w-full flex-col items-center gap-1.5 py-2.5"
          >
            <span className="text-ui-2xs font-bold tracking-[0.22em] text-ink-muted [writing-mode:vertical-rl] group-hover:text-brand-strong">
              本页小节
            </span>
            <span className="text-ui-2xs tabular-nums text-ink-faint">{numbered.length}</span>
          </button>
        </div>
      ) : (
        <div className="w-full rounded-ui-md border border-line bg-surface shadow-soft">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="flex items-baseline gap-1.5 text-ui-2xs font-bold tracking-[0.08em] text-ink-muted">
              本页小节
              <span className="tabular-nums text-ink-faint">{numbered.length}</span>
            </span>
            <button
              type="button"
              onClick={toggle}
              title="收起本页小节"
              aria-label="收起本页小节"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-ui-xs text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand"
            >
              <IconChevronRight className="h-[10px] w-[10px]" />
            </button>
          </div>

          <ol className="max-h-[calc(100vh-272px)] overflow-y-auto overscroll-contain px-2 py-2">
            {numbered.map((item) => {
              const isActive = item.id === active;
              return (
                <li key={item.id} className={cn('relative', item.depth > 0 && 'ml-[6px] pl-[11px]')}>
                  {item.depth > 0 && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-[6px] left-0 top-[6px] w-px bg-line"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => onJump(item.id)}
                    aria-current={isActive ? 'location' : undefined}
                    className={cn(
                      'flex w-full items-start gap-1.5 rounded-ui-xs py-[5px] pr-1.5 text-left text-ui-2xs leading-[1.6] transition-colors duration-150',
                      isActive
                        ? 'bg-brand-soft font-semibold text-brand-strong'
                        : 'text-ink-muted hover:bg-surface-soft hover:text-brand-strong',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 pl-1.5 tabular-nums',
                        item.marker.length > 2 ? 'w-[27px]' : 'w-[21px]',
                        isActive ? 'text-brand' : 'text-ink-faint',
                      )}
                    >
                      {item.marker}
                    </span>
                    <span className="line-clamp-2 min-w-0">{item.text}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      ))}

      <button
        type="button"
        onClick={scrollToTop}
        title="回到页面顶部"
        aria-label="回到页面顶部"
        className={cn(
          'flex items-center justify-center border border-line bg-surface text-ink-muted',
          'transition-colors duration-150 hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong',
          folded
            ? 'mt-2 h-9 w-9 rounded-ui-sm'
            : 'w-full gap-1.5 rounded-ui-sm py-[7px] text-ui-2xs font-semibold',
          !hasItems && 'w-full',
        )}
      >
        <IconChevronUp className={cn(folded ? 'h-[11px] w-[11px]' : 'h-[10px] w-[10px]')} />
        {!folded && '回到顶部'}
      </button>
    </nav>
  );
}
