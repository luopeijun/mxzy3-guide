export type ContentBlockKind = 'heading' | 'event' | 'option' | 'note' | 'paragraph';

export interface ContentBlock {
  kind: ContentBlockKind;
  text: string;
  group: number;
  /** Short marker shown in front of the text, e.g. an event number or 问题１. */
  label?: string;
  /** Stable in-page anchor id, used by outline links and jump targets. */
  id?: string;
  /** Option name for question cards, e.g. 爱的教育. */
  action?: string;
  /** Extra reward attached to an option, e.g. 人面狮王身纸镇. */
  reward?: string;
  /** Anchor id this block links to, e.g. q3. */
  target?: string;
  /** Text on the jump chip, e.g. 接问题３ or 问题结束. */
  targetLabel?: string;
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
