export interface CgGroup {
  id: string;
  /** 与 guide.json 的角色节点标题一致，不用 CG 原表的写法。 */
  name: string;
  /** 「主线」即玩家扮演的经纪人本人的 CG，与艺人分组并列。 */
  kind: 'agent' | 'artist';
  /** 攻略侧栏同一张头像；19 组（含经纪人）都有。 */
  avatar?: string;
  /** 对应攻略角色节点 id，留给以后「查看攻略」跳转。 */
  guideId?: string;
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
  /** 收集去重键：两位人物的 CG 若是同一张图（MD5 相同），共享同一个
   *  `collectionId`，于是「收集」只点一次就两个人物同时点亮。普通条目
   *  （主站、以及人物专属 CG）没有这个字段；前端一律用 `collectionId ?? id`
   *  作为收集键，主站因此零变化。 */
  collectionId?: string;
  width: number;
  height: number;
  /** 攻略落点。`anchor` 缺省表示整页落点（一张 CG 散落在多个分支里时，锚到哪个都不对）。 */
  guide?: {
    nodeId: string;
    /** 节点标题，用在按钮 title 上。 */
    title: string;
    /** 事件块的 DOM id，形如 `ev18`：落点明确到一个事件时才有。 */
    anchor?: string;
  };
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
