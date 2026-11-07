import { cn } from '../lib/cn';

interface Props {
  /** Trigger type of an event, e.g. 自动 / 场景 / 跟随 / 手动. */
  label: string;
}

/* One tone per trigger type so cards can be scanned without reading the text:
   自动 = nothing to do, 场景 = travel somewhere, 跟随 = follow an artist,
   手动 = a manual step. Unknown types fall back to a neutral chip. */
const TONE_CLASS: Record<string, string> = {
  自动: 'border-line bg-missing-soft text-missing',
  场景: 'border-brand-line bg-brand-soft text-brand-strong',
  跟随: 'border-gold-line bg-gold-soft text-gold',
  手动: 'border-violet-soft bg-violet-soft text-violet',
};

const FALLBACK_CLASS = 'border-line bg-surface-soft text-ink-muted';

export default function TypeTag({ label }: Props) {
  return (
    <span
      className={cn(
        'mr-1.5 inline-flex items-center rounded-ui-xs border px-1.5 py-px align-[1px] text-ui-2xs font-medium leading-[1.65] whitespace-nowrap',
        TONE_CLASS[label] ?? FALLBACK_CLASS,
      )}
    >
      {label}
    </span>
  );
}
