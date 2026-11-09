export type NoticeCategory = 'movie' | 'tv' | 'music' | 'ad' | 'show';

/** 特殊要求里的数值门槛（亲和 / 叛逆 / 性感）。 */
export interface NoticeSpecial {
  affinity?: number;
  rebellion?: number;
  sexy?: number;
}

export interface NoticeRole {
  /** 角色编号（MV0011 这类），唱片/主持没有单独的编号。 */
  id?: string;
  /** 电影/电视剧是「男主角」，广告是「男性」，唱片是「团体」，主持是「主持人」。 */
  name: string;
  /** 1–5，来源表里是 1.0–5.0 的浮点。 */
  difficulty?: number;
  /** 「搞笑」「反派」「反串」等，复合标签已拆开。 */
  specialKinds?: string[];
  special?: NoticeSpecial;
  /** 每日能力增减，键是九项能力之一。 */
  gains?: Record<string, number>;
  defaultArtist?: string;
  brief?: string;
}

export interface Notice {
  id: string;
  cat: NoticeCategory;
  name: string;
  /** 剧种 / 曲风 / 节目类型；广告的等级放在 level。 */
  type?: string;
  /** 电视剧的「连续剧 / 单元剧 / 短片」。 */
  series?: string;
  producer?: string;
  time?: string;
  company?: string;
  brief?: string;
  /** 广告等级（演技B 这类）。 */
  level?: string;
  /** 广告篇名（诱惑篇 这类）。 */
  kindLabel?: string;
  /** 广告品类（饮料、家电用品…）。 */
  adType?: string;
  /** 独家代理：一年内不能接其它厂家的同类型广告。 */
  exclusive?: boolean;
  roles?: NoticeRole[];
}

/** 类型 × 征求对象 → 每项能力的要求等级（A/B/C/D）与每日成长。 */
export interface GradeRow {
  type: string;
  role: string;
  grades: Record<string, string>;
  gains?: Record<string, number>;
}

export interface ScaleRow {
  stars: number;
  label: string;
  /** 等级字母 → 「180-300」这样的区间。 */
  ranges: Record<string, string>;
}

export interface SpecialEffect {
  kind: string;
  affinity?: number;
  rebellion?: number;
  sexy?: number;
  note?: string;
}

export interface ArtistGrowth {
  artist: string;
  values: Record<string, number>;
  total?: number;
}

export interface NoticeData {
  meta: {
    noticeCount: number;
    roleCount: number;
    sources: string[];
    generatedBy: string;
  };
  abilities: string[];
  categories: { key: NoticeCategory; name: string; count: number }[];
  notices: Notice[];
  grades: GradeRow[];
  scale: ScaleRow[];
  specialEffects: SpecialEffect[];
  growth: ArtistGrowth[];
  /** 原表「说明」页里几段散文：难度换算的例子、独家代理的含义、数据来源。 */
  notes?: string[];
}
