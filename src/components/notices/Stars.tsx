import { cn } from '../../lib/cn';

/** 五颗星，满星金色、空心浅色。通告的难度就是星数，和游戏里一致。 */
export default function Stars({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[1px] tabular-nums',
        size === 'md' ? 'text-ui-sm' : 'text-ui-2xs',
      )}
      aria-label={`难度 ${value} 星`}
      title={`难度 ${value} 星`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= value ? 'text-gold' : 'text-line-strong'}>
          {star <= value ? '★' : '☆'}
        </span>
      ))}
    </span>
  );
}
