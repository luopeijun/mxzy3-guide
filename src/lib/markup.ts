/** Inline emphasis markers shared by the data layer and the UI.
 *
 *  Two forms are decoded by HighlightText and stripped everywhere text is
 *  measured or searched, so the markers never leak into copy or counts:
 *    `**关键词**`      — generic emphasis (used by the notice summary card)
 *    `{时间:…}` 等      — typed highlights; the label tells the UI which tint to
 *                        use, so 条件 / 时间 / 地点 / 人物 / 选项 / 物品 read apart. */

export type HighlightKind =
  | 'time'
  | 'place'
  | 'person'
  | 'choice'
  | 'item'
  | 'condition'
  | 'key';

export interface TextSegment {
  text: string;
  kind?: HighlightKind;
}

const KIND_BY_LABEL: Record<string, HighlightKind> = {
  时间: 'time',
  地点: 'place',
  人物: 'person',
  选项: 'choice',
  物品: 'item',
  条件: 'condition',
};

const TOKEN_RE = /\*\*(.+?)\*\*|\{(时间|地点|人物|选项|物品|条件):([^{}]*)\}/g;

/** Split inline markup into plain and highlighted runs, in source order. */
export function parseInline(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ text: text.slice(cursor, start) });
    const kind = match[1] ? 'key' : KIND_BY_LABEL[match[2]];
    segments.push({ text: match[1] ?? match[3], kind });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });

  return segments;
}

/** The same text with every marker removed — used for search and counting. */
export function plainText(text: string): string {
  return text.replace(TOKEN_RE, (_match, bold: string, _label: string, inner: string) =>
    bold ?? inner,
  );
}
