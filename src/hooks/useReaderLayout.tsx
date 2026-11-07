import { createContext, useContext } from 'react';
import type { RefObject } from 'react';

/** Narrower than this the article column cannot spare a rail, so the rail
 *  steps aside and the in-page outline card at the top of the article takes
 *  over. Measured on the scroll container, not the window, because the sidebar
 *  eats 302px of the width above the `nav` breakpoint. */
export const RAIL_MIN_WIDTH = 960;

export interface ReaderLayout {
  /** The scrolling article column (`<main>`). */
  mainRef: RefObject<HTMLElement | null>;
  scrollToTop: () => void;
  /** True when the main column is wide enough to host the side rail. */
  wide: boolean;
}

export const ReaderLayoutContext = createContext<ReaderLayout | null>(null);

export function useReaderLayout(): ReaderLayout {
  const value = useContext(ReaderLayoutContext);
  if (!value) throw new Error('useReaderLayout must be used inside AppShell');
  return value;
}
