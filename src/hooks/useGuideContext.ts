import { createContext, useContext } from 'react';
import type { GuideData } from '../types/guide';

/** Exposes the loaded guide data application-wide so views that do not receive
 *  it as a prop (notably the CG page) can still re-anchor imported tracker
 *  progress against the current event lines. */
export const GuideDataContext = createContext<GuideData | null>(null);

export function useGuideContext(): GuideData | null {
  return useContext(GuideDataContext);
}
