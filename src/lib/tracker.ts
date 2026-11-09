import type { ContentBlock, GuideData, GuideNode } from '../types/guide';
import { plainText } from './markup';

/** A single triggerable event inside a task line. `index` is the event's
 *  position in the owning node's `blocks` array — that is the stable step id
 *  the tracker keys progress against (per the user's "数组下标定位第几步"). */
export interface TaskStep {
  index: number;
  label: string;
  tag?: string;
  cg: boolean;
  text: string;
}

export type LineKind = 'artist' | 'luousang' | 'non-artist';

export interface TaskLine {
  /** Stable id: `节点id::线序号::名称`. */
  id: string;
  nodeId: string;
  name: string;
  kind: LineKind;
  steps: TaskStep[];
}

/** The three artists whose love triangle (路欧桑) has sign-off-dependent
 *  branches in the data. */
export const LUO_ARTIST_IDS = [
  'characters/lu-feng',
  'characters/ou-yiqing',
  'characters/sang-hebei',
] as const;

function kindOf(nodeId: string): LineKind {
  if (nodeId.startsWith('characters/')) return 'artist';
  if (nodeId.startsWith('other-events/luousang/')) return 'luousang';
  return 'non-artist';
}

/** Event blocks of a node, tagged with their original array index. */
function eventEntries(node: GuideNode): { block: ContentBlock; index: number }[] {
  return node.blocks
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => block.kind === 'event');
}

/** Section / depth-1 heading boundaries. Depth-2 headings are sub-parts of a
 *  chapter and must NOT split a task line, so they are ignored here. */
function boundaryIndices(node: GuideNode): number[] {
  const indices: number[] = [];
  node.blocks.forEach((block, index) => {
    if (block.kind === 'section') indices.push(index);
    else if (block.kind === 'heading' && (block.depth ?? 0) !== 2) indices.push(index);
  });
  return indices;
}

function headingText(block: ContentBlock): string {
  return (block.label ?? block.text ?? '').trim() || '未命名章节';
}

function makeLine(
  node: GuideNode,
  seq: number,
  name: string,
  events: { block: ContentBlock; index: number }[],
): TaskLine {
  const steps: TaskStep[] = events.map(({ block, index }) => ({
    index,
    label: block.label ?? '',
    tag: block.tag,
    cg: Boolean(block.cg),
    text: plainText(block.text),
  }));
  return {
    id: `${node.id}::${seq}::${name}`,
    nodeId: node.id,
    name,
    kind: kindOf(node.id),
    steps,
  };
}

/** One node → zero or more task lines. A node with no events yields nothing. */
function linesFromNode(node: GuideNode): TaskLine[] {
  if (node.status === 'missing') return [];
  const events = eventEntries(node);
  if (events.length === 0) return [];

  const boundaries = boundaryIndices(node);
  // No usable heading → the whole page is one task line.
  if (boundaries.length === 0) {
    return [makeLine(node, 0, node.title, events)];
  }

  const lines: TaskLine[] = [];
  let seq = 0;
  // Events before the first heading belong to the page itself. Some pages (e.g.
  // the 路欧桑 branches) open with a long event run whose ★ title line is
  // consumed as the page title, so without this they would be silently dropped.
  const preEvents = events.filter((e) => e.index < boundaries[0]);
  if (preEvents.length > 0) {
    lines.push(makeLine(node, seq, node.title, preEvents));
    seq += 1;
  }
  for (let b = 0; b < boundaries.length; b += 1) {
    const start = boundaries[b];
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : node.blocks.length;
    const rangeEvents = events.filter((e) => e.index >= start && e.index < end);
    if (rangeEvents.length === 0) continue; // container heading with no events
    lines.push(makeLine(node, seq, headingText(node.blocks[start]), rangeEvents));
    seq += 1;
  }
  return lines;
}

/** Every task line across the whole guide, before artist / 路欧桑 filtering. */
export function extractLines(data: GuideData): TaskLine[] {
  const result: TaskLine[] = [];
  const walk = (node: GuideNode) => {
    result.push(...linesFromNode(node));
    node.children.forEach(walk);
  };
  data.categories.forEach(walk);
  return result;
}

/** Which 路欧桑 branch nodes enter, given the signed subset of the trio.
 *  Pairs → the mutual branch; a solo artist not in any chosen pair → its
 *  `only-*` branch. */
export function luousangBranchesFor(trio: string[]): Set<string> {
  const has = (id: string) => trio.includes(id);
  const set = new Set<string>();

  const pairs: [string[], string][] = [
    [['characters/lu-feng', 'characters/sang-hebei'], 'other-events/luousang/lufeng-sanghebei'],
    [['characters/lu-feng', 'characters/ou-yiqing'], 'other-events/luousang/lufeng-ouyiqing'],
  ];
  const paired = new Set<string>();
  for (const [pair, id] of pairs) {
    if (pair.every(has)) {
      set.add(id);
      pair.forEach((a) => paired.add(a));
    }
  }

  const solos: Record<string, string> = {
    'characters/lu-feng': 'other-events/luousang/only-lufeng',
    'characters/ou-yiqing': 'other-events/luousang/only-ouyiqing',
    'characters/sang-hebei': 'other-events/luousang/only-sanghebei',
  };
  for (const [artist, id] of Object.entries(solos)) {
    if (has(artist) && !paired.has(artist)) set.add(id);
  }
  return set;
}

/** The default pool for a selection: every non-artist line, the chosen
 *  artists' lines, and the 路欧桑 branches implied by the trio subset. */
export function buildPool(data: GuideData, selectedArtists: string[]): TaskLine[] {
  const all = extractLines(data);
  const selected = new Set(selectedArtists);
  const trio = LUO_ARTIST_IDS.filter((id) => selected.has(id));
  const branches = luousangBranchesFor(trio);
  return all.filter((line) => {
    if (line.kind === 'artist') return selected.has(line.nodeId);
    if (line.kind === 'luousang') return branches.has(line.nodeId);
    return true;
  });
}

/** How many of a line's steps are ticked. `done` holds **block-array indices**,
 *  not 0-based step positions, so membership must be checked via `step.index`.
 *  Comparing `i < line.steps.length` here used to under-count progress badly. */
export function countDoneSteps(line: TaskLine, done: Iterable<number>): number {
  const set = done instanceof Set ? done : new Set(done);
  return line.steps.reduce((sum, step) => sum + (set.has(step.index) ? 1 : 0), 0);
}

/** A line counts as complete only when *every* one of its steps is ticked.
 *  Empty lines and stale done indices (left over from an older data build)
 *  never count, so a line can never be archived by accident. */
export function isLineComplete(line: TaskLine, done: Iterable<number>): boolean {
  return line.steps.length > 0 && countDoneSteps(line, done) === line.steps.length;
}

/** Leaf artist nodes under the 艺人事件簿 category, for the setup picker. */
export function listArtists(data: GuideData): { id: string; title: string; avatar?: string }[] {
  const category = data.categories.find((c) => c.id === 'characters');
  if (!category) return [];
  const leaves: GuideNode[] = [];
  const walk = (node: GuideNode) => {
    if (node.children.length === 0) leaves.push(node);
    else node.children.forEach(walk);
  };
  category.children.forEach(walk);
  return leaves
    .map((node) => ({ id: node.id, title: node.title, avatar: node.avatar }))
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}
