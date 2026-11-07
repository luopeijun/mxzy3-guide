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

/** Characters in a node's own body text; whitespace is ignored, punctuation kept. */
export function countChars(node: GuideNode): number {
  return node.blocks.reduce((sum, block) => sum + block.text.replace(/\s/g, '').length, 0);
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
  return [block.text, block.action, block.reward, block.label, block.targetLabel]
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

export function outlineOf(node: GuideNode): { id: string; text: string }[] {
  return node.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'section' || block.kind === 'heading')
    .map(({ block, index }) => ({
      id: block.id ?? `block-${index}`,
      // Labelled headings (questions) read better as a compact marker.
      text: block.label ?? block.text,
    }));
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
