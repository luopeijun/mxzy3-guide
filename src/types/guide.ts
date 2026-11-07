export type ContentBlockKind = 'heading' | 'event' | 'option' | 'note' | 'paragraph';

export interface ContentBlock {
  kind: ContentBlockKind;
  text: string;
  group: number;
  label?: string;
}

export interface GuideNode {
  id: string;
  title: string;
  aliases?: string[];
  sourceTitle?: string;
  description?: string;
  status: 'ready' | 'missing';
  blocks: ContentBlock[];
  children: GuideNode[];
}

export interface GuideStats {
  categories: number;
  items: number;
  blocks: number;
  readyItems: number;
  missingItems: number;
  sourceParagraphs: number;
}

export interface GuideData {
  meta: {
    title: string;
    source: string;
    generatedBy: string;
    stats: GuideStats;
  };
  categories: GuideNode[];
}
