/** 自制通告创作条件（`public/data/selfmade.json`，由 `scripts/build_selfmade.py` 烘焙）。
 *
 *  源是攻略 `sources/self-made.txt`：按「艺人 → 作品名－条件」手写。
 *  `code` 是作品名对上静态通告库后的编码；对不上就是 null，
 *  页面照常列出条件，但没法按存档判断拿没拿到。 */
export type SelfMadeThresholdKind = 'attr' | 'friendship' | 'gifts';

export interface SelfMadeThreshold {
  label: string;
  value: number;
  kind: SelfMadeThresholdKind;
}

export interface SelfMadeEntry {
  /** song / script。 */
  section: string;
  artist: string;
  name: string;
  /** 静态通告编码；null = 静态表里没有这条作品。 */
  code: string | null;
  condition: string;
  thresholds: SelfMadeThreshold[];
  /** 作品名括号里的资料片 / 备注说明。 */
  note: string;
}

export interface SelfMadeSectionInfo {
  key: string;
  name: string;
  /** 「满足条件后需安排自由活动大于20天」这类补充说明。 */
  note: string;
}

export interface SelfMadeData {
  meta: { source: string; count: number; coded: number; note: string };
  sections: SelfMadeSectionInfo[];
  entries: SelfMadeEntry[];
}
