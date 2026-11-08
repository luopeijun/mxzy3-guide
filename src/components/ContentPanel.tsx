import type { GuideData, GuideNode } from '../types/guide';
import { outlineOf } from '../lib/guide';
import { cn } from '../lib/cn';
import { useAnchorJump } from '../hooks/useAnchorJump';
import { useReaderLayout } from '../hooks/useReaderLayout';
import ArticleHeader from './ArticleHeader';
import ArticleOutline from './ArticleOutline';
import BackToTop from './BackToTop';
import Breadcrumbs from './Breadcrumbs';
import ChildLinks from './ChildLinks';
import ContentBlockList from './ContentBlockList';
import EmptyState from './EmptyState';
import Overview from './Overview';
import PageRail from './PageRail';
import PrevNextNav from './PrevNextNav';
import RequirementsCard from './RequirementsCard';
import { ui } from '../styles/patterns';

interface Props {
  data: GuideData;
  node?: GuideNode;
  path: GuideNode[];
  prev: GuideNode | null;
  next: GuideNode | null;
  onSelect: (id: string) => void;
}

export default function ContentPanel({ data, node, path, prev, next, onSelect }: Props) {
  const jump = useAnchorJump(node?.id ?? '');
  const { wide } = useReaderLayout();

  if (!node) return <Overview data={data} onSelect={onSelect} />;

  const isCategory = path.length === 1;
  const showEmpty = node.status === 'missing'
    || (node.blocks.length === 0 && node.children.length === 0);
  const outline = outlineOf(node);

  return (
    <div className={cn(ui.reader, wide ? 'max-w-[1168px]' : 'max-w-[952px]')}>
      {/* Narrow columns keep a gutter for the corner back-to-top button, so it
          never sits on top of the text. */}
      <div className={cn(ui.article, !wide && 'pr-6 nav:pr-[26px]')}>
        <Breadcrumbs path={path} onSelect={onSelect} />
        <ArticleHeader node={node} />
        {node.requirements && <RequirementsCard requirements={node.requirements} />}
        {!wide && <ArticleOutline items={outline} onJump={jump} />}
        <ContentBlockList
          blocks={node.blocks}
          onJump={jump}
          indentSubEvents={node.id.startsWith('other-events/luousang/')}
        />
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

      {wide ? <PageRail items={outline} onJump={jump} /> : <BackToTop />}
    </div>
  );
}
