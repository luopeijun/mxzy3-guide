import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/** Body copy can be tinted or left plain. The switch only reaches 正文 —
 *  速览卡 stays highlighted either way, because there the tint *is* the
 *  layout (see HighlightText's `persistent` prop). The choice is remembered so
 *  a reader who dislikes the colour does not have to flip it every visit. */

interface HighlightPref {
  enabled: boolean;
  toggle: () => void;
}

const STORAGE_KEY = 'guide.highlight';

const HighlightContext = createContext<HighlightPref>({ enabled: true, toggle: () => {} });

export function HighlightProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== 'off';
    } catch {
      return true;
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
