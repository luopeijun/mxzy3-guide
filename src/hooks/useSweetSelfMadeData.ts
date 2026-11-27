import { useEffect, useState } from 'react';
import type { SweetSelfMadeData } from '../types/sweetSelfMade';

interface SweetSelfMadeState {
  data: SweetSelfMadeData | null;
  error: string | null;
}

/** 只在浮窗打开时才拉，跟主站 selfmade.json 一个模式。 */
export function useSweetSelfMadeData(enabled: boolean): SweetSelfMadeState {
  const [state, setState] = useState<SweetSelfMadeState>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/sweet/selfmade.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SweetSelfMadeData>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ data: null, error: String(error) });
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return state;
}
