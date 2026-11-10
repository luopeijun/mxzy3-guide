import type { GuideData, GuideNode } from '../types/guide';

/** 一张 CG 对应的攻略落点。 */
export interface CgGuideLink {
  nodeId: string;
  /** 节点标题（如「林芬芬」），用在按钮 title 上，让读者知道会跳去哪。 */
  nodeTitle: string;
  /** 事件块的 DOM id，形如 `ev45`；页面级落点（路欧桑剧情整理）没有锚点。 */
  anchor?: string;
}

/**
 * CG id → 攻略事件的反向索引。
 *
 * 正向（事件 → CG）写在数据里（块的 `cgIds`），这里只为反跳建一份内存索引，
 * 不重复落盘：映射改了重跑 `extract_guide.py` 即可，索引永远是当前数据的投影。
 *
 * 只有一对一的映射才会写进 `cgIds`（一对多的事件如美丽之星写真集只做单向），
 * 所以正常情况下一张 CG 只有一个落点；真出现多个时保留第一个。
 */
export function buildCgGuideLinks(data: GuideData): Map<string, CgGuideLink> {
  const links = new Map<string, CgGuideLink>();
  const walk = (node: GuideNode) => {
    for (const block of node.blocks) {
      if (!block.cgIds?.length || !block.anchor) continue;
      for (const id of block.cgIds) {
        if (links.has(id)) continue;
        links.set(id, { nodeId: node.id, nodeTitle: node.title, anchor: block.anchor });
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
