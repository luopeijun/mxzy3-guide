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

/** Where a task line comes from, shown as a chip in front of its name. Artist
 *  lines name the artist (and carry their portrait); the rest name the guide
 *  category, so the flat pool still tells you what kind of event you are
 *  looking at. */
export type OriginTone = 'artist' | 'broker' | 'notice' | 'luousang' | 'other';

export interface LineOrigin {
  /** Short chip text. */
  label: string;
  /** Full provenance for the tooltip / screen readers: `类别 · 页面标题`. */
  title: string;
  tone: OriginTone;
  avatar?: string;
}

export interface TaskLine {
  /** Stable id: `节点id::线序号::名称`. */
  id: string;
  nodeId: string;
  name: string;
  kind: LineKind;
  origin: LineOrigin;
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

interface CategoryMeta {
  label: string;
  full: string;
  tone: OriginTone;
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  'game-guide': { label: '经纪人', full: '经纪人事件簿', tone: 'broker' },
  characters: { label: '艺人', full: '艺人事件簿', tone: 'artist' },
  notices: { label: '通告', full: '六大特殊通告', tone: 'notice' },
  'other-events': { label: '其他', full: '其他事件', tone: 'other' },
};

/** Derive the chip from the owning node + its top-level category. Artist pages
 *  are leaves named after the artist, so their title (and portrait) is exactly
 *  the "哪个艺人" answer the chip needs. */
function originOf(node: GuideNode, categoryId: string): LineOrigin {
  if (node.id.startsWith('characters/')) {
    return {
      label: node.title,
      title: `艺人事件簿 · ${node.title}`,
      tone: 'artist',
      avatar: node.avatar,
    };
  }
  if (node.id.startsWith('other-events/luousang/')) {
    return { label: '路欧桑', title: `路欧桑剧情 · ${node.title}`, tone: 'luousang' };
  }
  const meta = CATEGORY_META[categoryId] ?? CATEGORY_META['other-events'];
  return { label: meta.label, title: `${meta.full} · ${node.title}`, tone: meta.tone };
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

/** 只有攻略页该读、不该进池的章节。
 *
 *  路欧桑这三条感情线在角色页里按「情况1~5」各写了一遍，而「其他事件 · 路欧桑剧情整理」
 *  已经把同样五个情况拆成了独立分支节点（`other-events/luousang/*`，按签约组合进池）。
 *  角色页这一份再进池，等于同一批事件在列表里重复两遍、每条几十上百步，纯噪音。
 *  所以按「节点 id + 章节名」把这几条线挡在池外：攻略页照常可读，池子里只留自己的剧情。
 *
 *  删掉的是**线**，不是内容：`seq` 仍然递增，保留下来的线 id 不变，老存档不会失效。 */
const POOL_SKIP: Record<string, { sections?: string[]; headings?: string[] }> = {
  // 路风的「事件」整节就是路桑恋 / 路欧恋分支。
  'characters/lu-feng': { sections: ['事件'] },
  // 桑禾蓓同理；「与主角的感情」不在此列，照常进池。
  'characters/sang-hebei': { sections: ['事件'] },
  // 欧怡青只去掉「路欧恋」一章，纪翔 / 告别 / 黎华那几章照常。
  'characters/ou-yiqing': { headings: ['路欧恋'] },
};

function skipFromPool(nodeId: string, section: string, name: string): boolean {
  const rule = POOL_SKIP[nodeId];
  if (!rule) return false;
  if (rule.sections?.includes(section)) return true;
  return Boolean(rule.headings?.some((heading) => name.startsWith(heading)));
}

function headingText(block: ContentBlock): string {
  return (block.label ?? block.text ?? '').trim() || '未命名章节';
}

function makeLine(
  node: GuideNode,
  seq: number,
  name: string,
  events: { block: ContentBlock; index: number }[],
  origin: LineOrigin,
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
    origin,
    steps,
  };
}

/** One node → zero or more task lines. A node with no events yields nothing. */
function linesFromNode(node: GuideNode, origin: LineOrigin): TaskLine[] {
  if (node.status === 'missing') return [];
  const events = eventEntries(node);
  if (events.length === 0) return [];

  const boundaries = boundaryIndices(node);
  // No usable heading → the whole page is one task line.
  if (boundaries.length === 0) {
    return [makeLine(node, 0, node.title, events, origin)];
  }

  const lines: TaskLine[] = [];
  let seq = 0;
  // Events before the first heading belong to the page itself. Some pages (e.g.
  // the 路欧桑 branches) open with a long event run whose ★ title line is
  // consumed as the page title, so without this they would be silently dropped.
  const preEvents = events.filter((e) => e.index < boundaries[0]);
  if (preEvents.length > 0) {
    lines.push(makeLine(node, seq, node.title, preEvents, origin));
    seq += 1;
  }
  /** 当前所属的大章节（★ 那一层），用来判断这一条线该不该进池。 */
  let section = '';
  for (let b = 0; b < boundaries.length; b += 1) {
    const start = boundaries[b];
    const boundary = node.blocks[start];
    if (boundary.kind === 'section') section = headingText(boundary);
    const end = b + 1 < boundaries.length ? boundaries[b + 1] : node.blocks.length;
    const rangeEvents = events.filter((e) => e.index >= start && e.index < end);
    if (rangeEvents.length === 0) continue; // container heading with no events
    const name = headingText(boundary);
    // `seq` 照常递增：被挡掉的线也占着自己的序号，别的线 id 才不会整体前移。
    const line = makeLine(node, seq, name, rangeEvents, origin);
    seq += 1;
    if (!skipFromPool(node.id, section, name)) lines.push(line);
  }
  return lines;
}

/** Every task line across the whole guide, before artist / 路欧桑 filtering. */
export function extractLines(data: GuideData): TaskLine[] {
  const result: TaskLine[] = [];
  for (const category of data.categories) {
    const walk = (node: GuideNode) => {
      result.push(...linesFromNode(node, originOf(node, category.id)));
      node.children.forEach(walk);
    };
    walk(category);
  }
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

/** Skip indices that still point at a real step. Stale indices left over from
 *  an older data build are dropped so they can never skew the progress maths. */
export function skippedIndices(line: TaskLine, skipped: Iterable<number> = []): Set<number> {
  const raw = skipped instanceof Set ? skipped : new Set(skipped);
  const valid = new Set<number>();
  for (const step of line.steps) if (raw.has(step.index)) valid.add(step.index);
  return valid;
}

/** The steps that still count towards completion — everything except the ones
 *  the player gave up on. A skipped step never blocks the line from finishing. */
export function countedSteps(line: TaskLine, skipped: Iterable<number> = []): TaskStep[] {
  const skip = skippedIndices(line, skipped);
  return line.steps.filter((step) => !skip.has(step.index));
}

/** How many of a line's steps are ticked. `done` holds **block-array indices**,
 *  not 0-based step positions, so membership must be checked via `step.index`.
 *  Comparing `i < line.steps.length` here used to under-count progress badly.
 *  Skipped steps are not counted (they are removed from `done` on skip anyway). */
export function countDoneSteps(
  line: TaskLine,
  done: Iterable<number>,
  skipped: Iterable<number> = [],
): number {
  const set = done instanceof Set ? done : new Set(done);
  const skip = skippedIndices(line, skipped);
  return line.steps.reduce(
    (sum, step) => sum + (!skip.has(step.index) && set.has(step.index) ? 1 : 0),
    0,
  );
}

/** A line counts as complete only when every step that still counts is ticked.
 *  Lines with nothing left to do (empty, or everything skipped) never count, so
 *  a line can never be archived by accident. */
export function isLineComplete(
  line: TaskLine,
  done: Iterable<number>,
  skipped: Iterable<number> = [],
): boolean {
  const counted = countedSteps(line, skipped);
  const set = done instanceof Set ? done : new Set(done);
  return counted.length > 0 && counted.every((step) => set.has(step.index));
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
