/** 通告元信息的配色：时间四档文字色 + 十一家公司的索引点色。
 *
 *  时间有顺序性（第一年 → 第二年 → 第三年 → 特殊），值得给文字色；公司没有
 *  顺序，11 家都给文字色会花，所以只落在 6px 小圆点上做「识别索引」——
 *  大块颜色归时间，点缀归公司，两张卡放在一起扫一眼就能认出同一家公司。
 *  令牌都在 `global.css @theme` 里，全部不与既有语义色重复（相似但不重复，
 *  统一明度/饱和度，色相按行业分组）。没登记的值回落墨色 / 灰点。 */

/** 时间档位 → 值文字色。 */
const TIME_CLASS: Record<string, string> = {
  第一年: 'text-year-1',
  第二年: 'text-year-2',
  第三年: 'text-year-3',
  特殊: 'text-year-x',
};

/** 公司 → 索引点底色。 */
const COMPANY_DOT: Record<string, string> = {
  SoSa电视: 'bg-dot-sosa',
  永振电视: 'bg-dot-yongzhen',
  日月光音乐: 'bg-dot-yueying',
  EAMI音乐: 'bg-dot-eami',
  京风唱片: 'bg-dot-jingfeng',
  全球制片: 'bg-dot-quanqiu',
  大宇宙影业: 'bg-dot-dazhou',
  创意广告: 'bg-dot-chuangyi',
  追梦广告: 'bg-dot-zhuimeng',
  翱翔天际: 'bg-dot-aoxiang',
  钜子娱乐: 'bg-dot-juzi',
};

export function timeText(time?: string | null): string {
  return (time && TIME_CLASS[time]) || 'text-ink';
}

export function companyDot(company?: string | null): string {
  return (company && COMPANY_DOT[company]) || 'bg-ink-faint';
}
