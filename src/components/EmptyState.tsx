import type { ReactNode } from 'react';
import styles from '../styles/ui.module.css';

interface Props {
  icon?: string;
  title: string;
  text: string;
  children?: ReactNode;
}

export default function EmptyState({ icon = '◇', title, text, children }: Props) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden="true">{icon}</div>
      <h2 className={styles.emptyTitle}>{title}</h2>
      <p className={styles.emptyText}>{text}</p>
      {children}
    </div>
  );
}
