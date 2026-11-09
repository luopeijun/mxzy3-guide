/** 通告元信息的配色：时间四档文字色 + 十一家公司的索引点色。
 *
 *  时间有顺序性（第一年 → 第二年 → 第三年 → 特殊），值得给文字色；公司没有
 *  顺序，11 家都给文字色会花，所以只落在 6px 小圆点上做「识别索引」——
 *  大块颜色归时间，点缀归公司，两张卡放在一起扫一眼就能认出同一家公司。
 *  令牌都在 `global.css @theme` 里，全部不与既有语义色重复（相似但不重复，
 *  统一明度/饱和度，色相按行业分组）。没登记的值回落墨色 / 灰点。 */

/** 时间档位 → 实色白字药丸类。四档是顺序概念（第一年→第二年→第三年→特殊），
 *  用四种明显不同的底色，扫一眼就能分清；与 growth 绿、alert 红都不撞色。 */
const TIME_PILL: Record<string, string> = {
  第一年: 'bg-year-1 text-white',
  第二年: 'bg-year-2 text-white',
  第三年: 'bg-year-3 text-white',
  特殊: 'bg-year-x text-white',
};

/** 公司与它的圆点底色、文字色一一对应——圆点放大后色相才分得清，文字也同色
 *  双保险，扫一眼就能认出同一家公司。单一数据源，下面两份映射都从它生成。 */
interface CompanyColor {
  name: string;
  dot: string;
  text: string;
}
const COMPANY_COLORS: CompanyColor[] = [
  { name: 'SoSa电视', dot: 'bg-dot-sosa', text: 'text-dot-sosa' },
  { name: '永振电视', dot: 'bg-dot-yongzhen', text: 'text-dot-yongzhen' },
  { name: '日月光音乐', dot: 'bg-dot-yueying', text: 'text-dot-yueying' },
  { name: 'EAMI音乐', dot: 'bg-dot-eami', text: 'text-dot-eami' },
  { name: '京风唱片', dot: 'bg-dot-jingfeng', text: 'text-dot-jingfeng' },
  { name: '全球制片', dot: 'bg-dot-quanqiu', text: 'text-dot-quanqiu' },
  { name: '大宇宙影业', dot: 'bg-dot-dazhou', text: 'text-dot-dazhou' },
  { name: '创意广告', dot: 'bg-dot-chuangyi', text: 'text-dot-chuangyi' },
  { name: '追梦广告', dot: 'bg-dot-zhuimeng', text: 'text-dot-zhuimeng' },
  { name: '翱翔天际', dot: 'bg-dot-aoxiang', text: 'text-dot-aoxiang' },
  { name: '钜子娱乐', dot: 'bg-dot-juzi', text: 'text-dot-juzi' },
];

const COMPANY_DOT: Record<string, string> = Object.fromEntries(
  COMPANY_COLORS.map((company) => [company.name, company.dot]),
);
const COMPANY_TEXT: Record<string, string> = Object.fromEntries(
  COMPANY_COLORS.map((company) => [company.name, company.text]),
);

/** 图例用：把全部公司连同色标一起导出。 */
export const COMPANY_LEGEND = COMPANY_COLORS;

export function timePill(time?: string | null): string {
  return (time && TIME_PILL[time]) || 'text-ink';
}

export function companyDot(company?: string | null): string {
  return (company && COMPANY_DOT[company]) || 'bg-ink-faint';
}

export function companyText(company?: string | null): string {
  return (company && COMPANY_TEXT[company]) || 'text-ink';
}
