import type { LineOrigin } from '../../lib/tracker';
import { cn } from '../../lib/cn';

/** One hue per source category, so a chip is recognised from its colour alone
 *  even in the flat pool. Artist lines additionally carry the artist portrait —
 *  that is the "哪个艺人的事件" answer without repeating the full category name. */
const TONE_CLASS: Record<LineOrigin['tone'], string> = {
  artist: 'border-brand-line bg-brand-soft text-brand-strong',
  broker: 'border-transparent bg-tag-news-soft text-tag-news',
  notice: 'border-transparent bg-tag-follow-soft text-tag-follow',
  luousang: 'border-transparent bg-tag-manual-soft text-tag-manual',
  other: 'border-transparent bg-tag-scene-soft text-tag-scene',
};

interface Props {
  origin: LineOrigin;
}

export default function LineOriginTag({ origin }: Props) {
  return (
    <span
      data-origin-tag
      data-origin-tone={origin.tone}
      title={origin.title}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-[6px] py-[2px] text-ui-2xs font-semibold leading-[1.6] whitespace-nowrap',
        TONE_CLASS[origin.tone],
      )}
    >
      {origin.tone === 'artist' &&
        (origin.avatar ? (
          <img
            src={`${import.meta.env.BASE_URL}${origin.avatar}`}
            alt=""
            className="h-[16px] w-[16px] shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full bg-brand text-[9px] leading-none text-white">
            {origin.label.slice(0, 1)}
          </span>
        ))}
      <span>{origin.label}</span>
    </span>
  );
}
