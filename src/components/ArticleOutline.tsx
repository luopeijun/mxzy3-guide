import { useId, useState } from 'react';
import { cn } from '../lib/cn';
import type { OutlineItem } from '../lib/guide';

interface Props {
  items: OutlineItem[];
  onJump?: (anchor: string) => void;
}

/** `2.` for sections, `2.1.` for sub-titles so nesting reads at a glance. */
function numberItems(items: OutlineItem[]): (OutlineItem & { marker: string })[] {
  let section = 0;
  let subtitle = 0;
  return items.map((item) => {
    // A sub-title before any section has no parent to attach to; show it flat.
    if (item.depth > 0 && section > 0) {
      subtitle += 1;
      return { ...item, marker: `${section}.${subtitle}.` };
    }
    section += 1;
    subtitle = 0;
    return { ...item, marker: `${section}.` };
  });
}

/** In-page section list. Collapsed by default so it reads as a single summary
 *  line, and expands into a vertical numbered list. */
export default function ArticleOutline({ items, onJump }: Props) {
  const [open, setOpen] = useState(false);
  const listId = useId();

  if (items.length === 0) return null;

  const jump = (id: string) => {
    if (onJump) {
      onJump(id);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="mb-[26px] rounded-ui-md border border-line bg-surface-soft" aria-label="本页小节">
      <button
        className="group flex w-full items-center justify-between gap-3 px-[18px] py-[13px] text-left"
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="text-ui-2xs font-bold tracking-[0.08em] text-ink-muted transition-colors group-hover:text-brand-strong">
          本页小节 · {items.length}
        </span>
        <span
          aria-hidden="true"
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center text-ink-faint transition-transform duration-200 group-hover:text-brand',
            open && 'rotate-180',
          )}
        >
          <svg
            viewBox="0 0 12 12"
            className="h-[10px] w-[10px]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </span>
      </button>

      {open && (
        <ol id={listId} className="max-h-[320px] overflow-y-auto border-t border-line px-[10px] py-2">
          {numberItems(items).map((item) => (
            <li
              key={item.id}
              className={cn('relative', item.depth > 0 && 'ml-[7px] pl-[15px]')}
            >
              {item.depth > 0 && (
                <span aria-hidden="true" className="absolute bottom-[8px] left-0 top-[8px] w-px bg-line" />
              )}
              <button
                className="flex w-full items-start gap-2 rounded-ui-sm px-2 py-[7px] text-left text-ui-xs leading-[1.65] text-brand hover:bg-brand-soft hover:no-underline"
                type="button"
                onClick={() => jump(item.id)}
              >
                <span
                  className={cn(
                    'shrink-0 tabular-nums text-ui-2xs text-ink-faint',
                    item.marker.length > 2 ? 'w-[26px]' : 'w-[20px]',
                  )}
                >
                  {item.marker}
                </span>
                <span className="min-w-0">{item.text}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
