import type { GuideNode, GuideStats } from '../types/guide';
import styles from '../styles/ui.module.css';

interface Props {
  categories: GuideNode[];
  activeCategoryId: string;
  stats: GuideStats;
  onSelect: (id: string) => void;
  onMenuClick: () => void;
}

export default function BrandHeader({
  categories, activeCategoryId, stats, onSelect, onMenuClick,
}: Props) {
  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <button className={styles.menuButton} type="button" onClick={onMenuClick} aria-label="打开目录">
          ☰
        </button>
        <button className={styles.brand} type="button" onClick={() => onSelect('')}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandText}>
            <span className={styles.brandTitle}>明星志愿3 · 攻略助手</span>
            <span className={styles.brandSub}>分级浏览 / 原片 + 资料集</span>
          </span>
        </button>

        <nav className={styles.headerTabs} aria-label="攻略分类">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`${styles.tab} ${activeCategoryId === category.id ? styles.tabActive : ''}`}
              onClick={() => onSelect(category.id)}
            >
              {category.title}
            </button>
          ))}
        </nav>

        <div className={styles.headerMeta}>{stats.items} 条目 · {stats.blocks} 段内容</div>
      </div>
    </header>
  );
}
