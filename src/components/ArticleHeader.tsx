import type { GuideNode } from '../types/guide';
import StatusBadge from './StatusBadge';
import styles from '../styles/ui.module.css';

interface Props {
  node: GuideNode;
  blockCount: number;
}

export default function ArticleHeader({ node, blockCount }: Props) {
  return (
    <div className={styles.articleHead}>
      <div className={styles.articleTitleRow}>
        <h1 className={styles.articleTitle}>{node.title}</h1>
        {node.status === 'missing' ? (
          <StatusBadge>待补充</StatusBadge>
        ) : (
          <StatusBadge variant="primary">已收录</StatusBadge>
        )}
      </div>

      {node.sourceTitle && <div className={styles.articleSource}>原目录：{node.sourceTitle}</div>}
      {node.description && <p className={styles.articleDesc}>{node.description}</p>}

      <div className={styles.articleStats}>
        <span>{node.children.length} 个子条目</span>
        <span>{blockCount} 段正文</span>
        {node.aliases?.length ? <span>别名：{node.aliases.join('、')}</span> : null}
      </div>
    </div>
  );
}
