import type { GuideNode } from '../types/guide';
import styles from '../styles/ui.module.css';

interface Props {
  prev: GuideNode | null;
  next: GuideNode | null;
  onSelect: (id: string) => void;
}

export default function PrevNextNav({ prev, next, onSelect }: Props) {
  return (
    <nav className={styles.prevNext} aria-label="相邻条目">
      {prev ? (
        <button className={styles.navCard} type="button" onClick={() => onSelect(prev.id)}>
          <div className={styles.navLabel}>← 上一条</div>
          <div className={styles.navTitle}>{prev.title}</div>
        </button>
      ) : (
        <div className={`${styles.navCard} ${styles.navCardPlaceholder}`} />
      )}
      {next ? (
        <button className={`${styles.navCard} ${styles.navCardNext}`} type="button" onClick={() => onSelect(next.id)}>
          <div className={styles.navLabel}>下一条 →</div>
          <div className={styles.navTitle}>{next.title}</div>
        </button>
      ) : (
        <div className={`${styles.navCard} ${styles.navCardNext} ${styles.navCardPlaceholder}`} />
      )}
    </nav>
  );
}
