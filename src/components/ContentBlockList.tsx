import type { ContentBlock } from '../types/guide';
import { groupBlocks } from '../lib/guide';
import type { IndexedBlock } from '../lib/guide';
import { cn } from '../lib/cn';
import QuestionCard from './QuestionCard';
import TypeTag from './TypeTag';

interface Props {
  blocks: ContentBlock[];
  onJump?: (anchor: string) => void;
}

/**
 * One event line plus everything that belongs to it (options, follow-up text,
 * reminders) rendered inside a single card, so an event never gets split apart.
 */
function EventCard({ blocks }: { blocks: IndexedBlock[] }) {
  const [head, ...rest] = blocks;

  return (
    <div className="mb-3 rounded-ui-sm border border-line bg-surface px-3 py-2.5">
      <div className="flex items-start gap-2.5 text-ui-sm leading-[1.85]">
        {head.label && (
          <span className="mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-center text-ui-2xs font-bold leading-[1.7] text-brand-strong">
            {head.label}
          </span>
        )}
        <span className="min-w-0 flex-1 break-words">
          {head.tag && <TypeTag label={head.tag} />}
          {head.text}
        </span>
      </div>
      {rest.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5 pl-[40px]">
          {rest.map((block) => <EventDetail key={block.index} block={block} />)}
        </div>
      )}
    </div>
  );
}

function EventDetail({ block }: { block: IndexedBlock }) {
  if (block.kind === 'note') {
    return (
      <p className="rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-2.5 py-1.5 text-ui-2xs leading-[1.8] text-note">
        {block.text}
      </p>
    );
  }
  return (
    <p
      className={cn(
        'text-ui-sm leading-[1.8] break-words',
        block.kind === 'option' ? 'text-ink-muted' : 'text-ink',
      )}
    >
      {block.text}
    </p>
  );
}

function BlockView({ block }: { block: IndexedBlock }) {
  switch (block.kind) {
    case 'section':
      return (
        <h3
          id={block.id ?? `block-${block.index}`}
          className="mt-7 mb-3 scroll-mt-[18px] text-ui-lg font-bold tracking-[0.01em] text-brand-strong"
        >
          {block.text}
        </h3>
      );
    case 'heading':
      return (
        <h3
          id={block.id ?? `block-${block.index}`}
          className="mt-5 mb-2 scroll-mt-[18px] border-l-[3px] border-brand pl-[10px] text-ui-md font-bold text-brand-strong"
        >
          {block.text}
        </h3>
      );
    case 'event':
      return (
        <div className="mb-1 flex items-start gap-2.5 text-ui-sm leading-[1.8]">
          {block.label && (
            <span className="mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-center text-ui-2xs font-bold leading-[1.7] text-brand-strong">
              {block.label}
            </span>
          )}
          <span className="min-w-0 flex-1 break-words">
            {block.tag && <TypeTag label={block.tag} />}
            {block.text}
          </span>
        </div>
      );
    case 'option':
      return <p className="mb-[3px] pl-10 text-ui-sm leading-[1.85] text-ink-muted phone:pl-[22px]">{block.text}</p>;
    case 'note':
      return (
        <p className="mb-[5px] rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-3 py-2 text-ui-sm leading-[1.8] text-note">
          {block.text}
        </p>
      );
    default:
      return <p className="mb-1 text-ui-md leading-[1.9] break-words text-ink">{block.text}</p>;
  }
}

export default function ContentBlockList({ blocks, onJump }: Props) {
  const groups = groupBlocks(blocks);
  if (!groups.length) return null;

  return (
    <article>
      {groups.map((group) => {
        const [first, ...rest] = group.blocks;
        const options = rest.filter((block) => block.kind === 'option');
        // A labelled heading with options is a question card (see QuestionCard).
        if (onJump && first.kind === 'heading' && first.id && options.length) {
          return (
            <QuestionCard key={group.group} heading={first} options={options} onJump={onJump} />
          );
        }
        // Numbered events keep their options and reminders inside one card.
        if (first.kind === 'event') {
          return <EventCard key={group.group} blocks={group.blocks} />;
        }
        return (
          <section key={group.group} className="mb-4">
            {group.blocks.map((block) => <BlockView key={block.index} block={block} />)}
          </section>
        );
      })}
    </article>
  );
}
