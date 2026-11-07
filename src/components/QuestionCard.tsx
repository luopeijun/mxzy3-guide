import type { IndexedBlock } from '../lib/guide';

interface Props {
  heading: IndexedBlock;
  options: IndexedBlock[];
  onJump: (anchor: string) => void;
}

/** An option's destination: either a jump link or a terminal marker. */
function TargetChip({
  block,
  onJump,
}: {
  block: IndexedBlock;
  onJump: (anchor: string) => void;
}) {
  if (block.target) {
    return (
      <button
        className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-brand-line bg-brand-soft px-2.5 py-[2px] text-ui-2xs font-semibold text-brand-strong transition-colors duration-150 hover:border-brand hover:bg-brand hover:text-white"
        type="button"
        aria-label={`跳到${block.targetLabel}`}
        onClick={() => onJump(block.target as string)}
      >
        {block.targetLabel} ↓
      </button>
    );
  }
  if (!block.targetLabel) return null;
  return (
    <span className="ml-auto shrink-0 rounded-full border border-line px-2.5 py-[2px] text-ui-2xs text-ink-faint">
      {block.targetLabel}
    </span>
  );
}

/** One question of the opening interview, with its three anchored options. */
export default function QuestionCard({ heading, options, onJump }: Props) {
  return (
    <section
      id={heading.id}
      className="mb-3 scroll-mt-4 rounded-ui-md border border-line bg-surface px-4 py-3.5 shadow-soft"
    >
      <header className="flex items-baseline gap-2.5">
        <span className="shrink-0 rounded-ui-xs bg-brand-soft px-2 py-[2px] text-ui-2xs font-bold tracking-[0.04em] text-brand-strong">
          {heading.label}
        </span>
        <h3 className="min-w-0 text-ui-md font-bold leading-[1.6] text-brand-strong">{heading.text}</h3>
      </header>

      <ul className="mt-1.5">
        {options.map((option) => (
          <li
            key={option.index}
            className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-ui-sm border-t border-line/70 px-1 py-[7px] first:border-t-0 hover:bg-surface-soft"
          >
            <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full bg-brand-soft text-ui-2xs font-bold text-brand-strong">
              {option.label}
            </span>
            <span className="shrink-0 text-ui-sm font-semibold text-ink">{option.action}</span>
            {option.text && (
              <span className="min-w-0 text-ui-sm leading-[1.7] text-ink-muted">{option.text}</span>
            )}
            {option.reward && (
              <span className="shrink-0 rounded-full border border-gold-line bg-gold-soft px-2 py-[1px] text-ui-2xs font-medium text-gold">
                获得 {option.reward}
              </span>
            )}
            <TargetChip block={option} onJump={onJump} />
          </li>
        ))}
      </ul>
    </section>
  );
}
