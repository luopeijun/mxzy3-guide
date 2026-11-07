import type { ReactNode } from 'react';
import styles from '../styles/ui.module.css';

interface Props {
  children: ReactNode;
  variant?: 'missing' | 'accent' | 'primary';
}

const VARIANT_CLASS = {
  missing: styles.badgeMissing,
  accent: styles.badgeAccent,
  primary: styles.badgePrimary,
};

export default function StatusBadge({ children, variant = 'missing' }: Props) {
  return <span className={`${styles.badge} ${VARIANT_CLASS[variant]}`}>{children}</span>;
}
