import { useEffect, useState } from 'react';
import type { SpecialsData } from '../types/specials';

interface SpecialsDataState {
  data: SpecialsData | null;
  error: string | null;
}

/** Only fetched when the board is opened, like notices.json / cg.json. */
export function useSpecialsData(enabled: boolean): SpecialsDataState {
  const [state, setState] = useState<SpecialsDataState>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/specials.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SpecialsData>;
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
