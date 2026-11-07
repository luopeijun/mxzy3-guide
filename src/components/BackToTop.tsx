import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import { useReaderLayout } from '../hooks/useReaderLayout';
import { IconChevronUp } from './icons';

/** Only worth showing once a screenful has been read. */
const SHOW_AFTER = 320;

/**
 * Corner back-to-top for widths that cannot host the side rail.
 *
 * The article reserves a gutter of the same width (see ContentPanel) so the
 * button sits beside the text instead of on top of it.
 */
export default function BackToTop() {
  const { mainRef, scrollToTop } = useReaderLayout();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    const onScroll = () => setShown(element.scrollTop > SHOW_AFTER);
    onScroll();
    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [mainRef]);

  return (
    <button
      type="button"
      onClick={scrollToTop}
      title="回到页面顶部"
      aria-label="回到页面顶部"
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      className={cn(
        'fixed bottom-[18px] right-[9px] z-20 flex h-8 w-8 items-center justify-center rounded-full',
        'border border-line bg-surface text-brand shadow-card transition duration-150',
        'hover:border-brand-line hover:bg-brand-soft hover:text-brand-strong',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0',
      )}
    >
      <IconChevronUp className="h-[11px] w-[11px]" />
    </button>
  );
}
