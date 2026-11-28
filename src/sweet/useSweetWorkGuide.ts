import { useEffect, useMemo, useState } from 'react';
import type { SweetSelfMadeData, SweetSelfMadeEntry } from '../types/sweetSelfMade';

export interface WorkGuide {
  /** 通告页的取得方式（含天数 / 属性门槛），创作页的条件更具体时并列展示。 */
  condition: string;
  creation: string;
  days: number;
  name: string;
}

/** 作品码 → 攻略取得条件。存档侧的作品明细与自制作品都带同样的码，按码直查
 *  就能显示「这部作品怎么拿到」，不靠作品名模糊匹配（译名有 7 处出入）。 */
export function useSweetWorkGuide(enabled: boolean): Map<string, WorkGuide> {
  const [data, setData] = useState<SweetSelfMadeData | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/sweet/selfmade.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<SweetSelfMadeData>;
      })
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { /* 攻略数据可选，读不到只少显示条件，不影响解析 */ });
    return () => { cancelled = true; };
  }, [enabled]);

  return useMemo(() => {
    const index = new Map<string, WorkGuide>();
    if (!data) return index;
    const add = (entry: SweetSelfMadeEntry) => {
      if (!entry.code) return;
      index.set(entry.code, {
        condition: entry.condition,
        creation: entry.creation?.condition ?? '',
        days: entry.days,
        name: entry.name,
      });
    };
    data.entries.forEach(add);
    data.extras.forEach(add);
    return index;
  }, [data]);
}

/** 悬停行 / 作品格里的取得条件摘要：一律从作品码命中的攻略条目取。 */
export function workGuideText(guide: WorkGuide | undefined): string {
  if (!guide) return '';
  const parts: string[] = [];
  if (guide.condition) parts.push(guide.condition);
  if (guide.creation && guide.creation !== guide.condition) parts.push(guide.creation);
  return parts.join('；');
}
