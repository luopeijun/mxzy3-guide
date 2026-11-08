import { Fragment } from 'react';
import type { ContentBlock } from '../types/guide';
import { groupBlocks } from '../lib/guide';
import type { IndexedBlock } from '../lib/guide';
import DataTable from './DataTable';
import OptionLine from './OptionLine';
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
  if (block.kind === 'option') {
    return <OptionLine text={block.text} className="ml-[10px]" />;
  }
  return <p className="text-ui-sm leading-[1.8] break-words text-ink">{block.text}</p>;
}

/** One catalogue entry: its name, a few labelled lines and optional notes. */
function ItemCard({ block }: { block: IndexedBlock }) {
  return (
    <div className="mb-2.5 rounded-ui-sm border border-line bg-surface px-3 py-2.5">
      <p className="text-ui-sm font-bold leading-[1.7] break-words text-ink">{block.text}</p>
      {(block.rows?.length ?? 0) > 0 && (
        <div className="mt-1.5 flex flex-col gap-[3px]">
          {block.rows!.map((row, position) => (
            <p key={position} className="flex items-start gap-2 text-ui-sm leading-[1.75]">
              <span
                className={
                  row.label.startsWith('＋')
                    ? 'mt-px w-[54px] shrink-0 text-ui-2xs font-bold leading-[2] text-brand-strong'
                    : 'mt-px w-[54px] shrink-0 text-ui-2xs leading-[2] text-ink-faint'
                }
              >
                {row.label}
              </span>
              <span className="min-w-0 flex-1 break-words text-ink">{row.value}</span>
            </p>
          ))}
        </div>
      )}
      {block.notes?.map((note, position) => (
        <p
          key={`note-${position}`}
          className="mt-1.5 rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-2.5 py-1.5 text-ui-2xs leading-[1.8] text-note"
        >
          {note}
        </p>
      ))}
    </div>
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
          className="mt-5 mb-2 flex scroll-mt-[18px] items-center gap-2 text-ui-md font-bold text-brand-strong"
        >
          <span aria-hidden className="inline-block h-2 w-2 shrink-0 rotate-45 bg-brand" />
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
      return <OptionLine text={block.text} className="mb-[3px] ml-10 phone:ml-[22px]" />;
    case 'note':
      return (
        <p className="mb-[5px] whitespace-pre-line rounded-r-ui-sm border-l-[3px] border-gold bg-note-soft px-3 py-2 text-ui-sm leading-[1.8] text-note">
          {block.text}
        </p>
      );
    case 'qa':
      // Every Q&A pair is its own item: a dot in the gutter for the question,
      // and the answer nested under it, so a long run of questions stays scannable.
      return (
        <div className="mb-3.5">
          <p className="relative pl-[19px] text-ui-sm leading-[1.75] break-words text-ink">
            <span
              aria-hidden="true"
              className="absolute left-[6px] top-[11px] h-[5px] w-[5px] rounded-full bg-brand"
            />
            {block.text}
          </p>
          {block.answer && (
            <p className="mt-1 flex items-start gap-1.5 pl-[19px]">
              <span className="mt-[3px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-ui-2xs font-bold leading-[1.6] text-brand-strong">
                答
              </span>
              <span className="min-w-0 flex-1 text-ui-sm leading-[1.75] break-words text-ink">
                {block.answer}
              </span>
            </p>
          )}
        </div>
      );
    case 'table':
      return block.table ? <DataTable data={block.table} /> : null;
    case 'item':
      return <ItemCard block={block} />;
    default: {
      // A list item carries a round dot in the gutter and a hanging indent, so
      // a run of names/types reads as separate entries instead of one text wall.
      if (block.bullet) {
        return (
          <p className="relative mb-1 mt-2 pl-[19px] text-ui-md leading-[1.9] break-words text-ink">
            <span
              aria-hidden="true"
              className="absolute left-[6px] top-[12px] h-[5px] w-[5px] rounded-full bg-brand"
            />
            {block.text}
          </p>
        );
      }
      // Nested lines (e.g. the a/b/c alternatives under a numbered condition)
      // step in once per level and fade a notch so the hierarchy reads at a glance.
      if (block.depth === 2) {
        return (
          <p className="mb-1 ml-[42px] text-ui-sm leading-[1.85] break-words text-ink-muted">
            {block.text}
          </p>
        );
      }
      if (block.depth === 1) {
        return (
          <p className="mb-1 ml-[19px] text-ui-md leading-[1.9] break-words text-ink">
            {block.text}
          </p>
        );
      }
      return <p className="mb-1 text-ui-md leading-[1.9] break-words text-ink">{block.text}</p>;
    }
  }
}

export default function ContentBlockList({ blocks, onJump }: Props) {
  const groups = groupBlocks(blocks);
  if (!groups.length) return null;

  return (
    <article>
      {groups.map((group, index) => {
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
        // Catalogue entries are one card each, with no section wrapper around them.
        if (first.kind === 'item') {
          return (
            <Fragment key={group.group}>
              {group.blocks.map((block) => <ItemCard key={block.index} block={block} />)}
            </Fragment>
          );
        }
        // A long hairline above every major section (except the first) marks the
        // boundary between chapters — the section title alone read too weakly.
        const sectionRule = first.kind === 'section' && index > 0 && (
          <div className="mb-6 mt-7 border-t border-brand-line" />
        );
        return (
          <Fragment key={group.group}>
            {sectionRule}
            <section className="mb-4">
              {group.blocks.map((block) => <BlockView key={block.index} block={block} />)}
            </section>
          </Fragment>
        );
      })}
    </article>
  );
}
