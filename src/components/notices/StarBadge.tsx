import { cn } from '../../lib/cn';

interface Props {
  /** 单个星数，或角色的星数区间（一张通告里角色难度不一定一样）。 */
  value: number | [number, number];
  size?: 'sm' | 'md' | 'lg';
}

const SIZE = {
  sm: { star: 'text-[9px]', gap: 'gap-px' },
  md: { star: 'text-[13px]', gap: 'gap-[1.5px]' },
  lg: { star: 'text-[15px]', gap: 'gap-[2px]' },
} as const;

const TOTAL = 5;

/** 星级：一直是五颗星，点亮几颗就是几星。
 *
 *  数字徽标比大小更快，但读起来没有「难度」的感觉，所以回到星条本身；
 *  星星放大到 11–15px 并改用实心字，一星与五星的差别一眼就能数出来。
 *  区间（3–5 星）里「一定满足」的部分用实心金，剩下的可能区间用半透明金，
 *  区间外是空心灰——既看得出最低到哪，也看得出这不是一个确定的星数。 */
export default function StarBadge({ value, size = 'md' }: Props) {
  const [min, max] = typeof value === 'number' ? [value, value] : value;
  const label = min === max ? `${min} 星` : `${min} 到 ${max} 星`;
  const dims = SIZE[size];

  return (
    <span
      data-star-badge
      data-star-value={min === max ? String(min) : `${min}-${max}`}
      className={cn('inline-flex items-baseline leading-none', dims.gap)}
      aria-label={`难度 ${label}`}
      title={`难度 ${label}`}
    >
      {Array.from({ length: TOTAL }, (_, index) => {
        const n = index + 1;
        const solid = n <= min;
        const maybe = !solid && n <= max;
        return (
          <span
            key={n}
            aria-hidden="true"
            className={cn(
              dims.star,
              solid ? 'text-gold' : maybe ? 'text-gold/40' : 'text-line-strong',
            )}
          >
            {solid || maybe ? '★' : '☆'}
          </span>
        );
      })}
    </span>
  );
}
