/** 七种特殊要求各占一个色相，和事件卡上的触发类型标签共用同一套令牌。
 *
 *  字母本身太细，读不出「反派」和「吻戏」的区别，所以每个标签都配一个同色圆点：
 *  颜色先扫到，文字再确认。没登记的标签回落到中性灰，不影响新增标签的显示。 */
export interface SpecialStyle {
  /** 胶囊底色 + 文字色 + 描边。 */
  chip: string;
  /** 标签前的小圆点。 */
  dot: string;
}

const FALLBACK: SpecialStyle = {
  chip: 'border-line-strong bg-surface-soft text-ink-muted',
  dot: 'bg-ink-faint',
};

export const SPECIAL_STYLE: Record<string, SpecialStyle> = {
  // 搞笑：琥珀，最容易和「热闹」联想在一起
  搞笑: { chip: 'border-tag-follow/45 bg-tag-follow-soft text-tag-follow', dot: 'bg-tag-follow' },
  // 反串：墨绿，中性偏冷，和性别反差的「意外感」错开暖色系
  反串: { chip: 'border-tag-scene/45 bg-tag-scene-soft text-tag-scene', dot: 'bg-tag-scene' },
  // 暴力：砖红，唯一一个「危险」色，扫一眼就知道这条不轻
  暴力: { chip: 'border-alert-line bg-alert-soft text-alert', dot: 'bg-alert' },
  // 反派：暗玫，比品牌粉更沉，不抢正派角色的视觉
  反派: { chip: 'border-tag-talk/45 bg-tag-talk-soft text-tag-talk', dot: 'bg-tag-talk' },
  // 裸露：紫，和「吻戏」的粉拉开距离
  裸露: { chip: 'border-tag-manual/45 bg-tag-manual-soft text-tag-manual', dot: 'bg-tag-manual' },
  // 丑化：暖灰，最低调的一档
  丑化: { chip: 'border-tag-auto/45 bg-tag-auto-soft text-tag-auto', dot: 'bg-tag-auto' },
  // 吻戏：品牌粉，最常见也最无害的一个
  吻戏: { chip: 'border-brand-line bg-brand-soft text-brand-strong', dot: 'bg-brand' },
};

export function specialStyle(kind: string): SpecialStyle {
  return SPECIAL_STYLE[kind] ?? FALLBACK;
}
