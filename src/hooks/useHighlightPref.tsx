import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** Master switch for the whole 高亮 feature. Set to `false` to pause it:
 *  the header toggle is hidden and no highlights render anywhere (the marker
 *  data in guide.json is left untouched, so flipping this back to `true` and
 *  re-showing the switch restores everything with no data loss). The user
 *  decided the highlight pass was premature and wants to focus on completing
 *  the body text first, so for now the feature is parked rather than deleted. */
export const HIGHLIGHT_ENABLED = false;

/** Body copy can be tinted or left plain. The switch only reaches 正文 —
 *  速览卡 stays highlighted either way, because there the tint *is* the
 *  layout (see HighlightText's `persistent` prop). The choice is remembered so
 *  a reader who dislikes the colour does not have to flip it every visit. */

interface HighlightPref {
  enabled: boolean;
  toggle: () => void;
}

const STORAGE_KEY = 'guide.highlight';

const HighlightContext = createContext<HighlightPref>({ enabled: false, toggle: () => {} });

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      // Default OFF: a missing key (or any value other than "on") means plain.
      return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      // Private mode: the preference just will not survive a reload.
    }
  }, [enabled]);

  const value = useMemo<HighlightPref>(
    () => ({ enabled, toggle: () => setEnabled((previous) => !previous) }),
    [enabled],
  );

  return <HighlightContext.Provider value={value}>{children}</HighlightContext.Provider>;
}

export function useHighlightPref() {
  return useContext(HighlightContext);
}
