import styles from '../styles/ui.module.css';

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function SearchBox({ value, onChange, placeholder = '搜索攻略标题或正文' }: Props) {
  return (
    <div className={styles.searchBox}>
      <span className={styles.searchIcon} aria-hidden="true">⌕</span>
      <input
        className={styles.searchInput}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label="搜索攻略"
      />
      {value && (
        <button
          className={styles.clearButton}
          onClick={() => onChange('')}
          aria-label="清空搜索"
          type="button"
        >
          ×
        </button>
      )}
    </div>
  );
}
