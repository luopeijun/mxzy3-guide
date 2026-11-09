import { useEffect, useState } from 'react';
import type { NoticeData } from '../types/notices';

interface NoticeDataState {
  data: NoticeData | null;
  error: string | null;
}

/** 通告数据单独一份 JSON，只在进入「通告」tab 时才请求 —— 浏览攻略的人不必
 *  为 900KB 的表格付出首屏成本。同样在运行时加载，改表不用重新打包。 */
export function useNoticeData(enabled: boolean): NoticeDataState {
  const [state, setState] = useState<NoticeDataState>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/notices.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<NoticeData>;
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
