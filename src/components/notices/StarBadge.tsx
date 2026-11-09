import { cn } from '../../lib/cn';

interface Props {
  /** 单个星数，或角色的星数区间（一张通告里角色难度不一定一样）。 */
  value: number | [number, number];
  size?: 'sm' | 'md' | 'lg';
  /** 实心金底白字用于卡片和详情标题；角色行用软底，免得一屏里全是深色块。 */
  tone?: 'solid' | 'soft';
}

const SIZE = {
  sm: { box: 'gap-[2px] px-1.5 py-0.5', num: 'text-ui-2xs', star: 'text-[10px]' },
  md: { box: 'gap-0.5 px-1.5 py-1', num: 'text-ui-sm', star: 'text-ui-2xs' },
  lg: { box: 'gap-0.5 px-2 py-1', num: 'text-ui-lg', star: 'text-ui-2xs' },
} as const;

/** 星级徽标：一个数字 + 一颗星。
 *
 *  以前用五颗空心小星，12px 的 ☆ 几乎看不清，也不方便比较两张卡谁更难。
 *  收成「4★」这样一个带底色的块，数字本身就能比大小。 */
export default function StarBadge({ value, size = 'md', tone = 'solid' }: Props) {
  const [min, max] = typeof value === 'number' ? [value, value] : value;
  const label = min === max ? `${min} 星` : `${min} 到 ${max} 星`;
  const dims = SIZE[size];

  return (
    <span
      data-star-badge
      className={cn(
        'inline-flex items-baseline rounded-ui-xs font-bold leading-none tabular-nums',
        dims.box,
        tone === 'solid'
          ? 'bg-gold text-white shadow-soft'
          : 'border border-gold-line bg-gold-soft text-gold',
      )}
      aria-label={`难度 ${label}`}
      title={`难度 ${label}`}
    >
      <span className={dims.num}>{min === max ? min : `${min}–${max}`}</span>
      <span className={cn(dims.star, 'font-normal opacity-80')}>★</span>
    </span>
  );
}
