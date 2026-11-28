/** 甜蜜乐章自制通告一览（`public/data/sweet/selfmade.json`，由
 *  `scripts/build_sweet_selfmade.py` 烘焙）。
 *
 *  源是攻略 `sources/sweet/self-notices.txt`：按「唱片 / 电视剧 / 电影 → 艺人 → 作品」手写，
 *  记了特殊 / 一般、累积多少天自由活动、类型星级，部分条目带属性门槛。
 *  `code` 是把作品名对上甜蜜乐章通告表后的编码；`guide: false` 的是游戏里确实存在、
 *  但攻略没写的自制品（舞台剧整类 + 一条电视剧），条件栏留空，页面只显示名字与是否已拿到。 */
export interface SweetSelfMadeThreshold {
  /** 演技 / 口才 / 歌艺 …，与存档九项属性同名。 */
  label: string;
  value: number;
}

export interface SweetSelfMadeEntry {
  /** 攻略里的艺人群组名；「其他」是跨艺人的条目，空串只在 extras 里出现。 */
  artist: string;
  /** 甜蜜乐章艺人编号：主角 1，沈惟真 11 …城仲瑄 18，其他记 0。 */
  artistId: number;
  /** music / tv / movie / stage。 */
  section: string;
  code: string;
  /** 游戏内作品名（与自制作品列表一致）。 */
  name: string;
  /** 攻略写法；只有 7 条与游戏译名不同时才会和 name 不一样。 */
  guideName: string;
  category: string;
  /** 特殊 / 一般。 */
  kind: string;
  /** 需要累积的自由活动天数；攻略没写就是 0。 */
  days: number;
  condition: string;
  /** 艺人创作取得页的同名条目：更具体的取得条件（特殊作品多为剧情触发）。
   *  与 condition 合看才是完整版；通告页没写的漏项也能靠它补上。 */
  creation: { kind: string; condition: string } | null;
  /** （类型、星级）括号里的内容，逐段拆开。 */
  tags: string[];
  thresholds: SweetSelfMadeThreshold[];
  guide: boolean;
  /** 攻略漏项的获得方式：pool 需累积自由活动，story 触发剧情直接获得；攻略条目留空。 */
  acquire: '' | 'pool' | 'story';
}

export interface SweetSelfMadeSectionInfo {
  key: string;
  label: string;
  count: number;
  extraCount: number;
}

export interface SweetSelfMadeData {
  meta: {
    entryCount: number;
    extraCount: number;
    artistCount: number;
    sources: string[];
    generatedBy: string;
  };
  sections: SweetSelfMadeSectionInfo[];
  entries: SweetSelfMadeEntry[];
  extras: SweetSelfMadeEntry[];
}
