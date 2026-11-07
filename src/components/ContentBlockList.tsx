import type { ContentBlock } from '../types/guide';
import { groupBlocks } from '../lib/guide';
import type { IndexedBlock } from '../lib/guide';
import styles from '../styles/ui.module.css';

interface Props {
  blocks: ContentBlock[];
}

function BlockView({ block }: { block: IndexedBlock }) {
  switch (block.kind) {
    case 'heading':
      return <h3 id={`block-${block.index}`} className={styles.blockHeading}>{block.text}</h3>;
    case 'event':
      return (
        <div className={styles.event}>
          {block.label && <span className={styles.eventLabel}>{block.label}</span>}
          <span className={styles.eventText}>{block.text}</span>
        </div>
      );
    case 'option':
      return <p className={styles.option}>{block.text}</p>;
    case 'note':
      return <p className={styles.note}>{block.text}</p>;
    default:
      return <p className={styles.paragraph}>{block.text}</p>;
  }
}

export default function ContentBlockList({ blocks }: Props) {
  const groups = groupBlocks(blocks);
  if (!groups.length) return null;

  return (
    <article className={styles.blockList}>
      {groups.map((group) => (
        <section key={group.group} className={styles.blockGroup}>
          {group.blocks.map((block) => <BlockView key={block.index} block={block} />)}
        </section>
      ))}
    </article>
  );
}
