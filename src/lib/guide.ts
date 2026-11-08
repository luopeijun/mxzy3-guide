import type { ContentBlock, GuideData, GuideNode } from '../types/guide';

export interface SearchHit {
  node: GuideNode;
  path: GuideNode[];
  snippet?: string;
  score: number;
}

/** Depth-first path to a node, empty when the id is unknown. */
export function findNodePath(data: GuideData, id: string): GuideNode[] {
  const walk = (node: GuideNode, trail: GuideNode[]): GuideNode[] | null => {
    const next = [...trail, node];
    if (node.id === id) return next;
    for (const child of node.children) {
      const found = walk(child, next);
      if (found) return found;
    }
    return null;
  };
  for (const category of data.categories) {
    const found = walk(category, []);
    if (found) return found;
  }
  return [];
}

/** All selectable nodes in display order, used for previous / next navigation. */
export function flattenNodes(data: GuideData): GuideNode[] {
  const result: GuideNode[] = [];
  const walk = (node: GuideNode) => {
    result.push(node);
    node.children.forEach(walk);
  };
  data.categories.forEach(walk);
  return result;
}

/** Table cells, flattened in column order; empty for non-table blocks. */
function tableCells(block: ContentBlock): string[] {
  if (!block.table) return [];
  return block.table.rows.flatMap((row) =>
    block.table!.columns.map((column) => row[column.key] ?? ''),
  );
}

/** Table rows as readable `姓名 演技182 口才140` pairs, for search + snippets. */
function tableText(block: ContentBlock): string {
  if (!block.table) return '';
  const { columns, rows } = block.table;
  const [nameColumn, ...rest] = columns;
  return rows
    .map((row) => {
      const values = rest.map((column) => `${column.label}${row[column.key] ?? ''}`).join(' ');
      return `${row[nameColumn.key] ?? ''} ${values}`;
    })
    .join(' ');
}

/** Labelled rows of an `item` block, flattened. */
function itemRows(block: ContentBlock): string[] {
  return (block.rows ?? []).flatMap((row) => [row.label, row.value]);
}

/** Characters in a node's own body text; whitespace is ignored, punctuation kept. */
export function countChars(node: GuideNode): number {
  return node.blocks.reduce((sum, block) => {
    const own = [
      block.text,
      block.answer ?? '',
      ...itemRows(block),
      ...(block.notes ?? []),
      ...tableCells(block),
    ].join('');
    return sum + own.replace(/\s/g, '').length;
  }, 0);
}

/** Characters including every descendant, used for category-level sizes. */
export function countCharsDeep(node: GuideNode): number {
  return countChars(node) + node.children.reduce((sum, child) => sum + countCharsDeep(child), 0);
}

/** 860 → "860", 12467 → "1.2 万". */
export function formatCount(value: number): string {
  if (value < 10000) return value.toLocaleString('zh-CN');
  const wan = value / 10000;
  return `${wan >= 100 ? Math.round(wan) : Number(wan.toFixed(1))} 万`;
}

export function countItems(node: GuideNode): number {
  return node.children.length + node.children.reduce((sum, child) => sum + countItems(child), 0);
}

function snippetOf(text: string, query: string): string {
  const index = text.toLowerCase().indexOf(query);
  const start = Math.max(0, index - 24);
  const end = Math.min(text.length, start + 96);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

/** Everything in a block that the search box should look at. */
function searchableText(block: ContentBlock): string {
  return [
    block.text,
    block.answer,
    block.action,
    block.reward,
    block.label,
    block.targetLabel,
    ...itemRows(block),
    ...(block.notes ?? []),
    tableText(block),
  ]
    .filter(Boolean)
    .join(' ');
}

/** Lightweight title + full-text search over the generated guide data. */
export function searchGuide(data: GuideData, keyword: string): SearchHit[] {
  const query = keyword.trim().toLowerCase();
  if (!query) return [];

  const hits: SearchHit[] = [];
  const walk = (node: GuideNode, trail: GuideNode[]) => {
    const path = [...trail, node];
    const haystack = [node.title, ...(node.aliases ?? []), node.sourceTitle ?? '']
      .join(' ')
      .toLowerCase();
    const titleMatch = haystack.includes(query);
    const contentMatch = node.blocks.find(
      (block) => searchableText(block).toLowerCase().includes(query),
    );

    if (titleMatch || contentMatch) {
      hits.push({
        node,
        path,
        score: titleMatch ? 2 : 1,
        snippet:
          contentMatch && !titleMatch
            ? snippetOf(searchableText(contentMatch), query)
            : undefined,
      });
    }
    node.children.forEach((child) => walk(child, path));
  };
  data.categories.forEach((category) => walk(category, []));

  return hits.sort((a, b) => b.score - a.score).slice(0, 40);
}

export interface OutlineItem {
  id: string;
  text: string;
  /** 0 = section, 1 = sub-title nested under the preceding section. */
  depth: number;
}

export function outlineOf(node: GuideNode): OutlineItem[] {
  return node.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'section' || block.kind === 'heading')
    .map(({ block, index }) => ({
      id: block.id ?? `block-${index}`,
      // Labelled headings (questions) read better as a compact marker.
      text: block.label ?? block.text,
      depth: block.depth ?? 0,
    }));
}

export interface NumberedOutlineItem extends OutlineItem {
  marker: string;
}

/** `2.` for sections, `2.1.` for sub-titles so the nesting reads at a glance. */
export function numberOutline(items: OutlineItem[]): NumberedOutlineItem[] {
  let section = 0;
  let subtitle = 0;
  return items.map((item) => {
    // A sub-title before any section has no parent to attach to; show it flat.
    if (item.depth > 0 && section > 0) {
      subtitle += 1;
      return { ...item, marker: `${section}.${subtitle}.` };
    }
    section += 1;
    subtitle = 0;
    return { ...item, marker: `${section}.` };
  });
}

/** Fixed marker column so every title starts on the same x; `1.13.` needs more
 *  room than `1.`, and both outlines render markers at the same 12px size. */
export function outlineMarkerWidth(marker: string): string {
  if (marker.length > 3) return 'w-[30px]';
  return marker.length > 2 ? 'w-[25px]' : 'w-[21px]';
}

export interface IndexedBlock extends ContentBlock {
  index: number;
}

export function groupBlocks(blocks: ContentBlock[]): { group: number; blocks: IndexedBlock[] }[] {
  const groups: { group: number; blocks: IndexedBlock[] }[] = [];
  blocks.forEach((block, index) => {
    const indexed = { ...block, index };
    const last = groups[groups.length - 1];
    if (last && last.group === block.group) {
      last.blocks.push(indexed);
    } else {
      groups.push({ group: block.group, blocks: [indexed] });
    }
  });
  return groups;
}
