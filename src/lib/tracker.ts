import type { ContentBlock, ContentBlockKind, GuideData, GuideNode } from '../types/guide';
import { plainText } from './markup';
import { MAIN_TRACKER_CONFIG, type TrackerSiteConfig } from './trackerConfig';

/** A single triggerable event inside a task line. `index` is the event's
 *  position in the owning node's `blocks` array — that is the stable step id
 *  the tracker keys progress against (per the user's "数组下标定位第几步"). */
/** 事件标题下面的补充行（甜蜜乐章的「时间 / 概要 / 提示」）。 */
export interface StepDetail {
  kind: ContentBlockKind;
  text: string;
  bullet?: boolean;
}

export interface TaskStep {
  index: number;
  label: string;
  tag?: string;
  cg: boolean;
  text: string;
  /** 折叠箭头点开后显示的详情；明星志愿3 的事件正文已在 text 里，为空。 */
  details?: StepDetail[];
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

/** Why a line is "stale": its artist has been released, or its 路欧桑 branch
 *  is no longer implied by the current roster. Stale lines stay in the pool
 *  (progress must never vanish) but carry a grey badge and are left out of the
 *  completion maths unless the user opts in. */
export type StaleKind = 'released' | 'former-branch';

export interface TaskLine {
  /** Stable id: `节点id::线序号::名称`. */
  id: string;
  nodeId: string;
  name: string;
  kind: LineKind;
  origin: LineOrigin;
  steps: TaskStep[];
  staleKind?: StaleKind;
}

/** The three artists whose love triangle (路欧桑) has sign-off-dependent
 *  branches in the data. */
export const LUO_ARTIST_IDS = [
  'characters/lu-feng',
  'characters/ou-yiqing',
  'characters/sang-hebei',
] as const;

function kindOf(nodeId: string, config: TrackerSiteConfig): LineKind {
  if (nodeId.startsWith(config.artistPrefix)) return 'artist';
  if (config.branchPrefix && nodeId.startsWith(config.branchPrefix)) return 'luousang';
  return 'non-artist';
}

/** Derive the chip from the owning node + its top-level category. Artist pages
 *  are leaves named after the artist, so their title (and portrait) is exactly
 *  the "哪个艺人" answer the chip needs. */
function originOf(node: GuideNode, categoryId: string, config: TrackerSiteConfig): LineOrigin {
  if (node.id.startsWith(config.artistPrefix)) {
    const full = config.categoryMeta[config.artistCategoryId]?.full ?? '艺人事件簿';
    return {
      label: node.title,
      title: `${full} · ${node.title}`,
      tone: 'artist',
      avatar: node.avatar,
    };
  }
  if (config.branchPrefix && node.id.startsWith(config.branchPrefix)) {
    return { label: '路欧桑', title: `路欧桑剧情 · ${node.title}`, tone: 'luousang' };
  }
  // Unknown category: same fallback as the original hard-coded map (其他事件).
  const meta = config.categoryMeta[categoryId] ?? { label: '其他', full: '其他事件', tone: 'other' as const };
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

function skipFromPool(
  nodeId: string,
  section: string,
  name: string,
  config: TrackerSiteConfig,
): boolean {
  const rule = config.poolSkip[nodeId];
  if (!rule) return false;
  if (rule.sections?.includes(section)) return true;
  return Boolean(rule.headings?.some((heading) => name.startsWith(heading)));
}

function headingText(block: ContentBlock): string {
  return (block.label ?? block.text ?? '').trim() || '未命名章节';
}

/** 甜蜜乐章把事件正文拆成紧跟在 event 后面、同一 group 的 paragraph / note
 *  （时间、概要、提示）。收进步骤的折叠详情；明星志愿3 的 event.text 本身
 *  就是整段正文，不开这个开关，行为零变化。 */
function detailsFor(node: GuideNode, index: number, enabled: boolean): StepDetail[] {
  if (!enabled) return [];
  const blocks = node.blocks;
  const group = blocks[index].group;
  const out: StepDetail[] = [];
  for (let i = index + 1; i < blocks.length; i += 1) {
    const block = blocks[i];
    if (
      block.group !== group ||
      block.kind === 'event' ||
      block.kind === 'section' ||
      block.kind === 'heading'
    ) break;
    const text = plainText(block.text).trim();
    if (text) out.push({ kind: block.kind, text, bullet: block.bullet });
  }
  return out;
}

function makeLine(
  node: GuideNode,
  seq: number,
  name: string,
  events: { block: ContentBlock; index: number }[],
  origin: LineOrigin,
  config: TrackerSiteConfig,
): TaskLine {
  const steps: TaskStep[] = events.map(({ block, index }) => ({
    index,
    label: block.label ?? '',
    tag: block.tag,
    cg: Boolean(block.cg),
    text: plainText(block.text),
    details: detailsFor(node, index, Boolean(config.stepDetails)),
  }));
  return {
    id: `${node.id}::${seq}::${name}`,
    nodeId: node.id,
    name,
    kind: kindOf(node.id, config),
    origin,
    steps,
  };
}

/** One node → zero or more task lines. A node with no events yields nothing. */
function linesFromNode(node: GuideNode, origin: LineOrigin, config: TrackerSiteConfig): TaskLine[] {
  if (node.status === 'missing') return [];
  const events = eventEntries(node);
  if (events.length === 0) return [];

  const boundaries = boundaryIndices(node);
  // No usable heading → the whole page is one task line.
  if (boundaries.length === 0) {
    return [makeLine(node, 0, node.title, events, origin, config)];
  }

  const lines: TaskLine[] = [];
  let seq = 0;
  // Events before the first heading belong to the page itself. Some pages (e.g.
  // the 路欧桑 branches) open with a long event run whose ★ title line is
  // consumed as the page title, so without this they would be silently dropped.
  const preEvents = events.filter((e) => e.index < boundaries[0]);
  if (preEvents.length > 0) {
    lines.push(makeLine(node, seq, node.title, preEvents, origin, config));
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
    const line = makeLine(node, seq, name, rangeEvents, origin, config);
    seq += 1;
    if (!skipFromPool(node.id, section, name, config)) lines.push(line);
  }
  return lines;
}

/** Every task line across the whole guide, before artist / 路欧桑 filtering. */
export function extractLines(
  data: GuideData,
  config: TrackerSiteConfig = MAIN_TRACKER_CONFIG,
): TaskLine[] {
  const result: TaskLine[] = [];
  for (const category of data.categories) {
    // 配了节点白名单的类目只放行名单里的页面（及其后代）；没配的类目全收。
    const allowlist = config.poolNodeAllowlist?.[category.id];
    const allowed = allowlist ? new Set(allowlist) : null;
    const walk = (node: GuideNode, parentAllowed: boolean) => {
      const inPool = !allowed || parentAllowed || allowed.has(node.id);
      if (inPool) {
        result.push(...linesFromNode(node, originOf(node, category.id, config), config));
      }
      node.children.forEach((child) => walk(child, inPool));
    };
    walk(category, false);
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

/** Everything the pool needs to decide membership. The tracked list is the
 *  whole playthrough (roster + released); the roster alone decides 路欧桑
 *  branches — a released artist must never reopen a branch. */
export interface PoolSelection {
  /** Roster + released: every artist whose lines stay visible. */
  trackedArtists: string[];
  /** Currently under contract (≤4). 路欧桑 branches read *only* this. */
  rosterArtists: string[];
  /** Released artists: their lines get a grey 「已解约」 badge. */
  releasedArtists: string[];
  /** 路欧桑 branch node ids that already have recorded progress. A branch
   *  implied by an older roster stays in the pool once work was done on it. */
  retainedBranches: string[];
}

/** The default pool: every non-artist line, all tracked artists' lines, and
 *  the 路欧桑 branches implied by the *roster* (plus retained old branches).
 *  Lines no longer implied by the current roster are marked stale rather than
 *  dropped, so progress never disappears when the roster changes. */
export function buildPool(
  data: GuideData,
  selection: PoolSelection,
  config: TrackerSiteConfig = MAIN_TRACKER_CONFIG,
): TaskLine[] {
  const all = extractLines(data, config);
  const tracked = new Set(selection.trackedArtists);
  const released = new Set(selection.releasedArtists);
  const roster = new Set(selection.rosterArtists);
  const trio = LUO_ARTIST_IDS.filter((id) => roster.has(id));
  const branches = luousangBranchesFor(trio);
  const retained = new Set(selection.retainedBranches);
  const result: TaskLine[] = [];
  for (const line of all) {
    let staleKind: StaleKind | undefined;
    if (line.kind === 'artist') {
      if (!tracked.has(line.nodeId)) continue;
      if (released.has(line.nodeId)) staleKind = 'released';
    } else if (line.kind === 'luousang') {
      const current = branches.has(line.nodeId);
      if (!current && !retained.has(line.nodeId)) continue;
      if (!current) staleKind = 'former-branch';
    }
    result.push(staleKind ? { ...line, staleKind } : line);
  }
  return result;
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

/** Leaf artist nodes under the artist category, for the setup picker. */
export function listArtists(
  data: GuideData,
  config: TrackerSiteConfig = MAIN_TRACKER_CONFIG,
): { id: string; title: string; avatar?: string }[] {
  const category = data.categories.find((c) => c.id === config.artistCategoryId);
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
