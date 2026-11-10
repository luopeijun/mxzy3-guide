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
  width: number;
  height: number;
  /** 页面级攻略落点（不带事件锚点）：一张 CG 散落在多个分支里时整组跳这一页。 */
  guide?: {
    nodeId: string;
    /** 节点标题，用在按钮 title 上。 */
    title: string;
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
