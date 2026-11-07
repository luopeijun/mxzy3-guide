import EmptyState from './EmptyState';
import styles from '../styles/ui.module.css';

interface Props {
  title: string;
  text: string;
}

export default function LoadingScreen({ title, text }: Props) {
  return (
    <div className={styles.loading}>
      <div className={styles.loadingCard}>
        <EmptyState title={title} text={text} />
      </div>
    </div>
  );
}
