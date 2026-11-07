import type { GuideData } from '../types/guide';
import { countItems } from '../lib/guide';
import StatusBadge from './StatusBadge';
import styles from '../styles/ui.module.css';

interface Props {
  data: GuideData;
  onSelect: (id: string) => void;
}

export default function Overview({ data, onSelect }: Props) {
  const { stats } = data.meta;

  return (
    <div className={styles.content}>
      <section className={styles.hero}>
        <div className={styles.heroEyebrow}>STARDOM 3 · GUIDE BROWSER</div>
        <h1 className={styles.heroTitle}>明星志愿3 · 攻略助手</h1>
        <p className={styles.heroText}>
          将原版攻略整理为四大分级，逐层展开查看。当前为纯浏览版本，条目进度追踪会在下一步加入。
        </p>
        <div className={styles.heroStats}>
          <div>
            <div className={styles.heroStatValue}>{stats.categories}</div>
            <div className={styles.heroStatLabel}>攻略分级</div>
          </div>
          <div>
            <div className={styles.heroStatValue}>{stats.items}</div>
            <div className={styles.heroStatLabel}>条目 / 子条目</div>
          </div>
          <div>
            <div className={styles.heroStatValue}>{stats.blocks}</div>
            <div className={styles.heroStatLabel}>正文段落</div>
          </div>
          <div>
            <div className={styles.heroStatValue}>{stats.sourceParagraphs}</div>
            <div className={styles.heroStatLabel}>原文段落</div>
          </div>
        </div>
      </section>

      <h2 className={styles.sectionTitle}>按分级浏览</h2>
      <div className={styles.categoryGrid}>
        {data.categories.map((category) => (
          <button
            key={category.id}
            className={styles.categoryCard}
            type="button"
            onClick={() => onSelect(category.id)}
          >
            <div className={styles.categoryCardHead}>
              <span className={styles.categoryCardTitle}>{category.title}</span>
              <StatusBadge variant="accent">{countItems(category)} 项</StatusBadge>
            </div>
            {category.sourceTitle && (
              <div className={styles.categoryCardSource}>原目录：{category.sourceTitle}</div>
            )}
            {category.description && <p className={styles.categoryCardDesc}>{category.description}</p>}
            <div className={styles.categoryCardFoot}>{category.children.length} 个一级条目 → 点击查看</div>
          </button>
        ))}
      </div>

      <div className={styles.notice}>
        数据来源：{data.meta.source}。目录中 {stats.missingItems} 个条目在这份文档中暂未收录，已在树与页面中标注「待补充」；
        「结局条件一览」等内容按原文档实际位置归入对应分级。
      </div>
    </div>
  );
}
