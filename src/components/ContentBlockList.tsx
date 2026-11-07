import type { ContentBlock } from '../types/guide';
import { groupBlocks } from '../lib/guide';
import type { IndexedBlock } from '../lib/guide';

interface Props {
  blocks: ContentBlock[];
}

function BlockView({ block }: { block: IndexedBlock }) {
  switch (block.kind) {
    case 'heading':
      return (
        <h3
          id={`block-${block.index}`}
          className="mt-5 mb-2 scroll-mt-[18px] border-l-[3px] border-brand pl-[10px] text-ui-md font-bold text-brand-strong"
        >
          {block.text}
        </h3>
      );
    case 'event':
      return (
        <div className="mb-1 flex items-start gap-2.5 rounded-ui-sm border border-line bg-surface px-[11px] py-[7px] text-ui-sm leading-[1.8]">
          {block.label && (
            <span className="mt-[3px] min-w-[30px] shrink-0 rounded-ui-xs bg-brand-soft px-[5px] text-center text-ui-2xs font-bold leading-[1.7] text-brand-strong">
              {block.label}
            </span>
          )}
          <span className="min-w-0 flex-1 break-words">{block.text}</span>
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

export default function ContentBlockList({ blocks }: Props) {
  const groups = groupBlocks(blocks);
  if (!groups.length) return null;

  return (
    <article>
      {groups.map((group) => (
        <section key={group.group} className="mb-4">
          {group.blocks.map((block) => <BlockView key={block.index} block={block} />)}
        </section>
      ))}
    </article>
  );
}
