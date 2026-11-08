export type ContentBlockKind =
  | 'section'
  | 'heading'
  | 'event'
  | 'option'
  | 'note'
  | 'paragraph'
  | 'qa'
  | 'item'
  | 'table';

export interface TableColumn {
  key: string;
  label: string;
  /** Numbers: right-aligned with tabular figures. */
  numeric?: boolean;
  /** Marks the highest value of this column on every row. */
  highlight?: boolean;
  /** Second line under the value, e.g. the growth bonus of that attribute. */
  growthKey?: string;
}

export interface TableData {
  columns: TableColumn[];
  rows: Record<string, string>[];
}

/** One labelled line of an `item` block, e.g. 简介 / 功用 / 入手地点 / ＋4. */
export interface ItemRow {
  label: string;
  value: string;
}

export interface ContentBlock {
  kind: ContentBlockKind;
  text: string;
  group: number;
  /** Short marker shown in front of the text, e.g. an event number or 问题１. */
  label?: string;
  /** Trigger type of an event, rendered as a tag: 自动 / 场景 / 跟随 / 手动. */
  tag?: string;
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
  /** Footnote under an option, e.g. the bracket note after 问题结束. */
  hint?: string;
  /** Nesting level of a section (0) or a sub-title (1), used by the outline. */
  depth?: number;
  /** Marks a `paragraph` as a list item, rendered with a leading round dot. */
  bullet?: boolean;
  /** Answer of a `qa` block, shown under the question. */
  answer?: string;
  /** Labelled lines of an `item` block (name in `text`). */
  rows?: ItemRow[];
  /** Extra notes attached to an `item` block. */
  notes?: string[];
  /** Tabular payload of a `table` block. */
  table?: TableData;
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

/** Header / sidebar summary, derived at runtime so new content shows up immediately. */
export interface GuideSummary {
  items: number;
  chars: number;
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
