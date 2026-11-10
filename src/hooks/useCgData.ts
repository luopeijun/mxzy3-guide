import { useEffect, useState } from 'react';
import type { CgData } from '../types/cg';

interface CgDataState {
  data: CgData | null;
  error: string | null;
}

/** 与通告数据一样只在进入 CG 图鉴时请求，浏览攻略的人不必下载这份清单。 */
export function useCgData(enabled: boolean): CgDataState {
  const [state, setState] = useState<CgDataState>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/cg.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<CgData>;
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
