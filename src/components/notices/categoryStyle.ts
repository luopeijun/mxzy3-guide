import type { NoticeCategory } from '../../types/notices';

/** 每个分类各取一个既有的语义色相，和事件卡上的触发类型标签用同一套令牌，
 *  这样通告页不用再往 @theme 里加颜色。甜蜜乐章多出的舞台剧 / 时装秀也沿用
 *  这两组现成的暖色，两站视觉保持同一套。 */
export const CATEGORY_STYLE: Record<NoticeCategory, { label: string; pill: string; bar: string }> = {
  movie: { label: '电影', pill: 'bg-tag-news-soft text-tag-news', bar: 'bg-tag-news' },
  tv: { label: '电视剧', pill: 'bg-tag-scene-soft text-tag-scene', bar: 'bg-tag-scene' },
  music: { label: '唱片', pill: 'bg-brand-soft text-brand-strong', bar: 'bg-brand' },
  ad: { label: '广告', pill: 'bg-tag-follow-soft text-tag-follow', bar: 'bg-tag-follow' },
  show: { label: '主持', pill: 'bg-tag-manual-soft text-tag-manual', bar: 'bg-tag-manual' },
  stage: { label: '舞台剧', pill: 'bg-tag-stage-soft text-tag-stage', bar: 'bg-tag-stage' },
  fashion: { label: '时装秀', pill: 'bg-tag-runway-soft text-tag-runway', bar: 'bg-tag-runway' },
};
