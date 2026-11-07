import type { GuideData, GuideNode } from '../types/guide';
import { outlineOf } from '../lib/guide';
import ArticleHeader from './ArticleHeader';
import ArticleOutline from './ArticleOutline';
import Breadcrumbs from './Breadcrumbs';
import ChildLinks from './ChildLinks';
import ContentBlockList from './ContentBlockList';
import EmptyState from './EmptyState';
import Overview from './Overview';
import PrevNextNav from './PrevNextNav';
import styles from '../styles/ui.module.css';

interface Props {
  data: GuideData;
  node?: GuideNode;
  path: GuideNode[];
  prev: GuideNode | null;
  next: GuideNode | null;
  onSelect: (id: string) => void;
}

export default function ContentPanel({ data, node, path, prev, next, onSelect }: Props) {
  if (!node) return <Overview data={data} onSelect={onSelect} />;

  const isCategory = path.length === 1;
  const showEmpty = node.status === 'missing'
    || (node.blocks.length === 0 && node.children.length === 0);

  return (
    <div className={styles.content}>
      <Breadcrumbs path={path} onSelect={onSelect} />
      <ArticleHeader node={node} blockCount={node.blocks.length} />
      <ArticleOutline items={outlineOf(node)} />
      <ContentBlockList blocks={node.blocks} />
      {node.children.length > 0 && (
        <ChildLinks
          nodes={node.children}
          onSelect={onSelect}
          title={isCategory ? '一级条目' : '下级条目'}
        />
      )}
      {showEmpty && (
        <EmptyState
          title="这个条目还没有内容"
          text="原攻略目录里有这一节，但《明星志愿3攻略.docx》中暂未收录对应正文。分级位置已保留，补充内容后会自动显示。"
        />
      )}
      <PrevNextNav prev={prev} next={next} onSelect={onSelect} />
    </div>
  );
}
