export interface CgGroup {
  id: string;
  name: string;
  /** 「主线」即玩家扮演的经纪人本人的 CG，与艺人分组并列。 */
  kind: 'agent' | 'artist';
  count: number;
}

export interface CgItem {
  id: string;
  groupId: string;
  order: number;
  /** 原表编号，如「CG 01」。 */
  code: string;
  /** 原表 CG 名称，如「SD练习室」。 */
  name: string;
  /** 原表「获得条件」，灯箱与卡片都会展示。 */
  condition: string;
  /** 站点未提供图片时为 null，画廊渲染占位格但条目仍然可收集。 */
  image: string | null;
  width: number;
  height: number;
}

export interface CgData {
  version: number;
  meta: {
    itemCount: number;
    groupCount: number;
    missingImageCount: number;
  };
  groups: CgGroup[];
  items: CgItem[];
}
