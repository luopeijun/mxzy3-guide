import type { GuideData, GuideNode } from '../types/guide';

/** 一张 CG 对应的攻略落点。 */
export interface CgGuideLink {
  nodeId: string;
  /** 节点标题（如「林芬芬」），用在按钮 title 上，让读者知道会跳去哪。 */
  nodeTitle: string;
  /** 事件块的 DOM id，形如 `ev45`；页面级落点（美丽之星写真集）没有事件号时才缺省。 */
  anchor?: string;
}

/**
 * 路风 / 桑禾蓓 / 欧怡青的恋情 CG 统一由「路欧桑剧情整理」承接。
 *
 * 这三人的感情线在各自艺人页里也写了一遍，但按约定艺人页只做浏览：跳转与进度收集
 * 都走整理页那一套。同一张图两边都有事件时（如欧怡青的告别演唱会 ou-8），图鉴点
 * 「攻略」优先回整理页，而不是把人带到艺人事件簿里。
 */
const LUOUSANG_PREFIX = 'other-events/luousang/';

export { LUOUSANG_PREFIX };

/**
 * CG id → 攻略事件的落点列表（第一个是默认落点）。
 *
 * 正向（事件 → CG）写在数据里（块的 `cgIds`），这里只为反跳建一份内存索引，
 * 不重复落盘：映射改了重跑 `extract_guide.py` 即可，索引永远是当前数据的投影。
 *
 * 一张 CG 可能有好几个落点：路欧桑的感情线在五个分支页里各写了一遍，同一张图
 * 「只有 X 在旗下」和「两人都在旗下」两页都拿得到。所以存列表而不是单个：从攻略
 * 点进来时记住来源（见 `cgOrigin.ts`），返回时优先回到那一页；直接开深链就用第一个。
 */
export function buildCgGuideLinks(data: GuideData): Map<string, CgGuideLink[]> {
  const links = new Map<string, CgGuideLink[]>();
  const walk = (node: GuideNode) => {
    for (const block of node.blocks) {
      if (!block.cgIds?.length || !block.anchor) continue;
      for (const id of block.cgIds) {
        const entry: CgGuideLink = {
          nodeId: node.id,
          nodeTitle: node.title,
          anchor: block.anchor,
        };
        const list = links.get(id);
        if (list) list.push(entry);
        else links.set(id, [entry]);
      }
    }
    node.children.forEach(walk);
  };
  data.categories.forEach(walk);
  return links;
}

/** 攻略页的深链：`#/guide/<nodeId>~<anchor>`，与 `useAnchorJump` 同一套格式。
 *  页面级落点没有锚点，直接进这一页的顶部（`#/guide/<nodeId>`）。 */
export function cgGuideHref(link: CgGuideLink): string {
  return link.anchor
    ? `#/guide/${link.nodeId}~${link.anchor}`
    : `#/guide/${link.nodeId}`;
}

/** 按钮 title：锚到事件的写「对应攻略事件」，整页落点写「完整剧情整理」。 */
export function cgGuideTitle(link: CgGuideLink): string {
  return `${link.nodeTitle} · ${link.anchor ? '对应攻略事件' : '完整剧情整理'}`;
}
