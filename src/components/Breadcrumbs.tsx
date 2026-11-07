import type { GuideNode } from '../types/guide';
import styles from '../styles/ui.module.css';

interface Props {
  path: GuideNode[];
  onSelect: (id: string) => void;
}

export default function Breadcrumbs({ path, onSelect }: Props) {
  return (
    <nav className={styles.breadcrumbs} aria-label="当前位置">
      <button className={styles.crumb} type="button" onClick={() => onSelect('')}>
        攻略总览
      </button>
      {path.map((node, index) => (
        <span key={node.id}>
          <span className={styles.crumbSeparator}>›</span>
          <button
            className={`${styles.crumb} ${index === path.length - 1 ? styles.crumbCurrent : ''}`}
            type="button"
            onClick={() => onSelect(node.id)}
          >
            {node.title}
          </button>
        </span>
      ))}
    </nav>
  );
}
