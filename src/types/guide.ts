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
  /** Marks an `event` that yields a CG, rendered with a brand highlight + 标签. */
  cg?: boolean;
  /** Answer of a `qa` block, shown under the question. */
  answer?: string;
  /** Labelled lines of an `item` block (name in `text`). */
  rows?: ItemRow[];
  /** Extra notes attached to an `item` block. */
  notes?: string[];
  /** Tabular payload of a `table` block. */
  table?: TableData;
}

/** Numeric threshold of a notice, e.g. 歌艺 700. */
export interface RequirementStat {
  label: string;
  value: string;
}

/** A prop a notice consumes, plus where to get it. `steps` spells out a chain
 *  of prerequisites in order; `parts` holds the 材料 of a crafted prop
 *  (天使羽衣 needs four of them). */
export interface RequirementProp {
  name: string;
  /** One-line source, used when the chain is short enough to say in a sentence. */
  from?: string;
  /** Ordered prerequisites, for props that need several conditions first. */
  steps?: string[];
  parts?: RequirementProp[];
}

/** Hand-written summary card at the top of a notice page. */
export interface NodeRequirements {
  /** Attribute threshold the notice itself asks for. */
  stats?: RequirementStat[];
  /** Everything the artist must already have done / hold. */
  cast?: string[];
  /** Props and their sources. */
  items?: RequirementProp[];
  /** Closing remark, e.g. the timing caveat. */
  note?: string;
}

export interface GuideNode {
  id: string;
  title: string;
  aliases?: string[];
  sourceTitle?: string;
  description?: string;
  status: 'ready' | 'missing';
  requirements?: NodeRequirements;
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
