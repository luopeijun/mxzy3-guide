import { cn } from '../../lib/cn';

interface Props {
  /** Relative path from guide.json (`images/characters/<slug>-logo.*`). */
  avatar?: string;
  /** Artist name, used for the initial fallback and the alt text. */
  label: string;
  /** sm = 16px (pool chip), xs = 14px (dense batch list rows). */
  size?: 'xs' | 'sm';
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  xs: 'h-[14px] w-[14px] text-[8px]',
  sm: 'h-[16px] w-[16px] text-[9px]',
};

/** Tiny circular artist portrait. Falls back to the first character of the name
 *  when the node has no avatar image, so a row is never left without a badge. */
export default function ArtistAvatar({ avatar, label, size = 'sm', className }: Props) {
  if (avatar) {
    return (
      <img
        data-artist-avatar
        src={`${import.meta.env.BASE_URL}${avatar}`}
        alt={label}
        title={label}
        className={cn('shrink-0 rounded-full object-cover', SIZE_CLASS[size], className)}
      />
    );
  }
  return (
    <span
      data-artist-avatar
      data-avatar-fallback
      title={label}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-brand font-bold leading-none text-white',
        SIZE_CLASS[size],
        className,
      )}
    >
      {label.slice(0, 1)}
    </span>
  );
}
