import { useEffect, useState } from 'react';
import type { GuideData } from '../types/guide';

interface GuideDataState {
  data: GuideData | null;
  error: string | null;
}

/** Load guide.json at runtime so content updates never require a JS rebuild. */
export function useGuideData(): GuideDataState {
  const [state, setState] = useState<GuideDataState>({ data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/guide.json`)
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
  }, []);

  return state;
}
