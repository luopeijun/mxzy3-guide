import { useEffect, useState } from 'react';
import type { GuideData } from '../types/guide';

interface GuideDataState {
  data: GuideData | null;
  error: string | null;
}

/** Load a guide.json at runtime so content updates never require a JS rebuild.
 *  Two sites share this hook; `file` is a path under `public/`, so the
 *  甜蜜乐章 entry passes `data/sweet/guide.json` and keeps its own dataset. */
export function useGuideData(file = 'data/guide.json'): GuideDataState {
  const [state, setState] = useState<GuideDataState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, error: null });
    fetch(`${import.meta.env.BASE_URL}${file}`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<GuideData>;
      })
      .then((data) => {
        if (!cancelled) setState({ data, error: null });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ data: null, error: String(error) });
      });
    return () => { cancelled = true; };
  }, [file]);

  return state;
}
