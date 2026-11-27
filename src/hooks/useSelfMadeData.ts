import { useEffect, useState } from 'react';
import type { SelfMadeData } from '../types/selfmade';

interface SelfMadeDataState {
  data: SelfMadeData | null;
  error: string | null;
}

/** 只在打开助手时才拉，跟 specials.json 一个模式。 */
export function useSelfMadeData(enabled: boolean): SelfMadeDataState {
  const [state, setState] = useState<SelfMadeDataState>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/selfmade.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SelfMadeData>;
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
