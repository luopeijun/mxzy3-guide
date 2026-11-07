import styles from '../styles/ui.module.css';

interface Props {
  items: { id: string; text: string }[];
}

export default function ArticleOutline({ items }: Props) {
  if (items.length === 0) return null;

  return (
    <section className={styles.outline} aria-label="本页小节">
      <div className={styles.outlineTitle}>本页小节 · {items.length}</div>
      <div className={styles.outlineList}>
        {items.map((item) => (
          <button
            key={item.id}
            className={styles.outlineItem}
            type="button"
            onClick={() => document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            title={item.text}
          >
            {item.text}
          </button>
        ))}
      </div>
    </section>
  );
}
