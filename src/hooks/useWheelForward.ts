import { useEffect, type RefObject } from 'react';

const LINE_HEIGHT = 16;

/** Can this element still scroll a little further in the wheel's direction? */
function canScroll(el: HTMLElement, delta: number): boolean {
  const { overflowY } = getComputedStyle(el);
  if (!/auto|scroll/.test(overflowY)) return false;
  if (el.scrollHeight <= el.clientHeight + 1) return false;
  return delta > 0
    ? el.scrollTop + el.clientHeight < el.scrollHeight - 1
    : el.scrollTop > 1;
}

/** Is this element a real vertical scrollport (as opposed to a column that is
 *  merely marked overflow-auto but fits its content)? */
function isScrollport(el: HTMLElement): boolean {
  const { overflowY } = getComputedStyle(el);
  return /auto|scroll/.test(overflowY) && el.scrollHeight > el.clientHeight + 1;
}

/** Wheel routing for the desktop tracker's three independent columns:
 *
 *  1. A nested scroller under the pointer (e.g. batch multi-select) keeps the
 *     wheel while it can still move.
 *  2. The column under the pointer owns the wheel whenever IT has a scrollbar.
 *     Scrolling a long left rail must never move the event pool as well — the
 *     two columns moving together reads as a broken layout. At that column's
 *     boundary the wheel is swallowed, so it cannot fall through to the guide
 *     page underneath the overlay either.
 *  3. Only when the column has no scrollbar (collapsed rails, or the shared
 *     header outside the overlay) is the wheel forwarded to the event pool,
 *     so the pointer no longer has to stay inside the middle column.
 *
 *  The narrow stacked layout has a single page scroller and is left entirely
 *  to the browser. A native non-passive listener is required: React registers
 *  `wheel` as passive, so preventDefault() inside onWheel would be ignored.
 */
export function useWheelForward(poolRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      const pool = poolRef.current;
      if (!pool || event.defaultPrevented || event.ctrlKey) return;
      // Trackpad horizontal swipes and ctrl+wheel zoom keep their native meaning.
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      // Narrow layout: the middle column is not a scrollport, the whole page is.
      if (!/auto|scroll/.test(getComputedStyle(pool).overflowY)) return;

      const node = event.target instanceof Element ? event.target : null;
      const column = node?.closest('aside, main') ?? null;
      const delta = event.deltaY;

      // Nested scrollers take precedence over their column.
      for (let el: Element | null = node; el && el !== column; el = el.parentElement) {
        if (el instanceof HTMLElement && canScroll(el, delta)) return;
      }

      if (column instanceof HTMLElement && isScrollport(column)) {
        if (!canScroll(column, delta)) event.preventDefault();
        return; // native scrolling for this column only
      }

      // Short rail or pointer outside the overlay: drive the event pool.
      if (!canScroll(pool, delta)) {
        event.preventDefault(); // pool at its boundary: nothing else may move
        return;
      }
      const unit = event.deltaMode === 1 ? LINE_HEIGHT
        : event.deltaMode === 2 ? pool.clientHeight
          : 1;
      pool.scrollTop += delta * unit;
      event.preventDefault();
    };

    // Bound to window so the shared global header (outside the overlay) is
    // covered too. The listener exists only while the tracker is mounted.
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => window.removeEventListener('wheel', onWheel);
  }, [poolRef]);
}
