import { cn } from '../lib/cn';

interface Props {
  /** Trigger type of an event, e.g. 自动 / 场景 / 跟随 / 手动. */
  label: string;
}

/* One hue per trigger type, so a chip is recognised from its colour alone:
   自动 = nothing to do (warm grey), 场景 = go somewhere (teal),
   新闻 = a headline you only read (indigo), 跟随 = follow an artist (amber),
   手动 = a step you take (plum), 沟通 = someone you talk to (rose).
   The chip is a flat tint with no visible border — the hue does the separating,
   so a page with a hundred of them stays quiet; a transparent 1px border keeps
   every chip the same height. Conditional labels (`自动或场景`) get a dashed
   neutral chip, since neither hue is the whole truth. */
const TONE_CLASS: Record<string, string> = {
  自动: 'border border-transparent bg-tag-auto-soft text-tag-auto',
  场景: 'border border-transparent bg-tag-scene-soft text-tag-scene',
  新闻: 'border border-transparent bg-tag-news-soft text-tag-news',
  跟随: 'border border-transparent bg-tag-follow-soft text-tag-follow',
  手动: 'border border-transparent bg-tag-manual-soft text-tag-manual',
  沟通: 'border border-transparent bg-tag-talk-soft text-tag-talk',
};

const MIXED_CLASS = 'border border-dashed border-line-strong bg-surface-soft text-ink-muted';
const FALLBACK_CLASS = 'bg-missing-soft text-ink-muted';

export default function TypeTag({ label }: Props) {
  const tone = TONE_CLASS[label];
  const mixed = !tone && label.includes('或');

  return (
    <span
      className={cn(
        'mr-1.5 inline-flex items-center rounded-full px-[9px] py-[2px] align-[1px] text-ui-2xs font-semibold leading-[1.6] whitespace-nowrap',
        tone ?? (mixed ? MIXED_CLASS : FALLBACK_CLASS),
      )}
    >
      {label}
    </span>
  );
}
