import {
  COURSE_LEVELS,
  COURSE_REQUIREMENTS,
  CERT_REQUIREMENTS,
  certsForName,
  certsForNotice,
  normaliseStatName,
  parseTarget,
  type CourseLevel,
} from './specials';
import type { SpecialNotice, SpecialRow, SpecialsData } from '../types/specials';

/** The board keeps its own save. The four 旗下 artists are *read* from the
 *  tracker save (guide.progress.v1) and never copied here, so the two tools
 *  cannot disagree about who is under contract. */
export const SPECIALS_STORAGE_KEY = 'guide.specials.v1';

export interface SpecialsState {
  version: 1;
  /** Notices actually being pursued this playthrough. The rest stay grey. */
  enabled: string[];
  /** noticeId → slot → artist ids. A slot may hold several candidates. */
  assignments: Record<string, Record<string, string[]>>;
  /** Manual "I've satisfied this" ticks, keyed by row id. The whole board is a
   *  checklist: ticking is the source of truth for progress. Numbers (stats /
   *  courses / funds) are an *optional* peek you open per row, never required. */
  done: string[];
  /** artistId → attribute → current value. Missing means "not entered yet". */
  stats: Record<string, Record<string, number>>;
  /** artistId → course → grade. Missing means 未上. */
  courses: Record<string, Record<string, CourseLevel>>;
  /** conditionKey → number. Counters, funds and 0/1 checkboxes all live here. */
  values: Record<string, number>;
  /** A locked 银河 group cannot be edited without an explicit dissolve. */
  groupLocked: Record<string, boolean>;
}

/** A fresh board starts with every notice enabled — players untick the ones
 *  they are not pursuing. Existing saves always keep their own selection.
 *  `defaultEnabled` comes from the runtime data so a new notice joins the
 *  default automatically. */
export function emptyState(defaultEnabled: string[] = []): SpecialsState {
  return {
    version: 1,
    enabled: [...defaultEnabled],
    assignments: {},
    done: [],
    stats: {},
    courses: {},
    values: {},
    groupLocked: {},
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function numberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object') return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

/** Tolerate hand-edited / older saves: unknown keys and grades are dropped,
 *  but a partial save keeps everything it does know. */
export function sanitiseState(raw: unknown, defaultEnabled: string[] = []): SpecialsState {
  if (!raw || typeof raw !== 'object') return emptyState(defaultEnabled);
  const parsed = raw as Partial<SpecialsState>;
  const stats: Record<string, Record<string, number>> = {};
  if (parsed.stats && typeof parsed.stats === 'object') {
    for (const [artistId, attrs] of Object.entries(parsed.stats)) {
      stats[artistId] = numberMap(attrs);
    }
  }
  const courses: Record<string, Record<string, CourseLevel>> = {};
  if (parsed.courses && typeof parsed.courses === 'object') {
    for (const [artistId, grades] of Object.entries(parsed.courses)) {
      if (!grades || typeof grades !== 'object') continue;
      const clean: Record<string, CourseLevel> = {};
      for (const [course, grade] of Object.entries(grades)) {
        if (COURSE_LEVELS.includes(grade as CourseLevel)) {
          clean[course] = grade as CourseLevel;
        }
      }
      courses[artistId] = clean;
    }
  }
  const assignments: Record<string, Record<string, string[]>> = {};
  if (parsed.assignments && typeof parsed.assignments === 'object') {
    for (const [noticeId, slots] of Object.entries(parsed.assignments)) {
      if (!slots || typeof slots !== 'object') continue;
      const clean: Record<string, string[]> = {};
      for (const [slot, ids] of Object.entries(slots)) {
        clean[slot] = [...new Set(stringList(ids))];
      }
      assignments[noticeId] = clean;
    }
  }
  const locked: Record<string, boolean> = {};
  if (parsed.groupLocked && typeof parsed.groupLocked === 'object') {
    for (const [id, value] of Object.entries(parsed.groupLocked)) {
      if (value === true) locked[id] = true;
    }
  }
  return {
    version: 1,
    enabled: [...new Set(stringList(parsed.enabled))],
    assignments,
    done: [...new Set(stringList(parsed.done))],
    stats,
    courses,
    values: numberMap(parsed.values),
    groupLocked: locked,
  };
}

export function readState(defaultEnabled: string[] = []): SpecialsState {
  try {
    const raw = localStorage.getItem(SPECIALS_STORAGE_KEY);
    if (!raw) return emptyState(defaultEnabled);
    return sanitiseState(JSON.parse(raw), defaultEnabled);
  } catch {
    return emptyState(defaultEnabled);
  }
}

/** How many artists one slot may hold. Named roles are one person each,
 *  银河's group takes 2–4, and 天使 / 万年之恋 are single-artist notices — the
 *  rest are candidate pools that may hold up to four. */
export function slotLimit(notice: SpecialNotice, slot: string): number {
  if (slot.startsWith('role:')) return 1;
  if (slot === 'group') return 4;
  if (slot === 'main' && notice.soloMain) return 1;
  return 4;
}

/** Older saves may hold a candidate pool on a now-solo notice. Keep the first
 *  artist and drop the rest — the extra names could never be the contractor. */
export function trimSoloAssignments(state: SpecialsState, notices: SpecialNotice[]): SpecialsState {
  const solo = new Set(notices.filter((notice) => notice.soloMain).map((notice) => notice.id));
  let changed = false;
  const assignments: Record<string, Record<string, string[]>> = {};
  for (const [noticeId, slots] of Object.entries(state.assignments)) {
    if (!solo.has(noticeId)) {
      assignments[noticeId] = slots;
      continue;
    }
    const next: Record<string, string[]> = {};
    for (const [slot, ids] of Object.entries(slots)) {
      if (slot === 'main' && ids.length > 1) {
        next[slot] = ids.slice(0, 1);
        changed = true;
      } else {
        next[slot] = ids;
      }
    }
    assignments[noticeId] = next;
  }
  return changed ? { ...state, assignments } : state;
}

/** A notice's assignable slots. 昆仑 has three named role slots and no 主艺人
 *  (the `main` in its slots comes from the four attribute rows, which are
 *  checked against all three roles). 银河 has one group slot. */
export function assignableSlots(notice: SpecialNotice): string[] {
  const slots = notice.slots.filter((slot) => slot !== '-');
  const roles = slots.filter((slot) => slot.startsWith('role:'));
  if (roles.length) return roles;
  if (slots.includes('group')) return ['group'];
  if (slots.includes('main')) return ['main'];
  return ['main'];
}

/** The artists whose numbers a row reads. Company-wide and notice-only rows
 *  have no owner at all. */
export function artistsForRow(
  row: SpecialRow,
  notice: SpecialNotice,
  state: SpecialsState,
): string[] {
  if (row.scope === 'global' || row.scope === 'notice' || row.scope === '-') return [];
  const assigned = state.assignments[notice.id] ?? {};
  if (row.scope === 'group') return assigned.group ?? [];
  if (row.scope === 'role') return assigned[row.slot] ?? [];
  // artist scope
  if (row.slot.startsWith('role:')) return assigned[row.slot] ?? [];
  const slots = assignableSlots(notice);
  if (slots.some((slot) => slot.startsWith('role:'))) {
    // 昆仑's attribute rows carry slot=main but must be met by all three roles.
    return [...new Set(slots.flatMap((slot) => assigned[slot] ?? []))];
  }
  return assigned.main ?? [];
}

/** Which certificates an artist has to work on, derived from the *enabled*
 *  notices they are assigned to. This is what makes the course list on-demand. */
export function certsForArtist(
  data: SpecialsData,
  state: SpecialsState,
  artistId: string,
): string[] {
  const found = new Set<string>();
  const notices = data.notices.filter((n) => state.enabled.includes(n.id));
  for (const notice of notices) {
    for (const row of data.rows) {
      if (row.notice !== notice.id || row.kind !== 'condition' || row.type !== 'cert') continue;
      if (!artistsForRow(row, notice, state).includes(artistId)) continue;
      for (const cert of certsForName(row.name)) found.add(cert);
    }
  }
  return [...found];
}

/** Behind one certificate: which attributes are still short (a read-only hint),
 *  and the full list of courses it needs with the grade currently reached.
 *  Courses are always listed so the user can track "上到哪个等级了"; attributes
 *  are shown only when they fall short, since numeric thresholds are not the
 *  board's focus. A certificate still needs its own 「已取得」 tick. */
export interface CertGap {
  course: string;
  required: CourseLevel;
  current: CourseLevel;
}

export function certGaps(
  cert: string,
  artistId: string,
  state: SpecialsState,
): { attrs: string[]; courseList: CertGap[] } {
  const attrs: string[] = [];
  const courseList: CertGap[] = [];
  const requirement = CERT_REQUIREMENTS.find((row) => row.cert === cert);
  if (requirement) {
    for (const { name, min } of requirement.attrs) {
      const value = state.stats[artistId]?.[name];
      if (value === undefined) attrs.push(`${name} 未录入`);
      else if (value < min) attrs.push(`${name} 差 ${min - value}`);
    }
  }
  for (const course of COURSE_REQUIREMENTS.filter((row) => row.cert === cert)) {
    const grade = (state.courses[artistId]?.[course.name] ?? '未上') as CourseLevel;
    courseList.push({ course: course.name, required: course.level, current: grade });
  }
  return { attrs, courseList };
}

export function certKey(cert: string, artistId: string): string {
  return `cert:${artistId}:${cert}`;
}

export type EvalInput = 'none' | 'check' | 'counter' | 'number';

export interface EvalPart {
  key: string;
  label: string;
  input: EvalInput;
  met: boolean;
  detail: string;
  value: number;
  /** Counter / number target, or 1 for checkboxes. */
  target: number;
  /** Artist this part belongs to. Parts of one artist are ANDed; across
   *  candidate-pool artists they are ORed. */
  ownerId?: string;
  /** Display name of that artist, without the certificate suffix. Multi-owner
   *  rows split per artist and use this as the row head. */
  ownerLabel?: string;
  gaps?: string[];
  /** All courses this certificate needs, each with the grade reached so far. */
  courseList?: CertGap[];
}

export interface RowEval {
  row: SpecialRow;
  parts: EvalPart[];
  met: boolean;
  shared: boolean;
  ownerLabel: string;
  /** True for stat / resource rows: they have no auto gate, so the checklist
   *  checkbox is authoritative and any number is an optional peek. */
  doneEligible: boolean;
}

interface EvalContext {
  notice: SpecialNotice;
  state: SpecialsState;
  titles: Map<string, string>;
}

function labelFor(artistId: string, titles: Map<string, string>): string {
  return titles.get(artistId) ?? artistId;
}

function statPart(
  artistId: string,
  attr: string,
  min: number,
  ctx: EvalContext,
): EvalPart {
  const value = ctx.state.stats[artistId]?.[attr];
  const met = value !== undefined && value >= min;
  return {
    key: `stat:${artistId}:${attr}`,
    label: labelFor(artistId, ctx.titles),
    ownerId: artistId,
    ownerLabel: labelFor(artistId, ctx.titles),
    input: 'number',
    met,
    detail: value === undefined ? `${attr} 未录入` : met ? `${attr} ${value} ✓` : `${attr} 差 ${min - value}`,
    value: value ?? 0,
    target: min,
  };
}

function numberPart(
  key: string,
  label: string,
  input: EvalInput,
  value: number,
  target: number,
  suffix = '',
  ownerId?: string,
): EvalPart {
  const met = value >= target;
  return {
    key,
    label,
    input,
    met,
    detail: `${value} / ${target}${suffix}`,
    value,
    target,
    ownerId,
    // Every artist-scoped call passes the artist name as `label`.
    ...(ownerId ? { ownerLabel: label } : {}),
  };
}

/** Multi-attribute row: 慈善义演邀约（歌艺/仪态/人气） with target 300/300/3. */
function multiStatAttrs(name: string): string[] | null {
  const match = /[（(]([^）)]*\/[^）)]*)[）)]/.exec(name);
  if (!match) return null;
  const attrs = match[1].split('/').map((item) => item.trim());
  return attrs.length > 1 ? attrs : null;
}

function evaluateRow(row: SpecialRow, ctx: EvalContext): RowEval {
  const { notice, state, titles } = ctx;
  const target = parseTarget(row.target);
  const min = target && target.kind !== 'multi' ? target.min : (target?.kind === 'multi' ? target.values[0] : 1);
  const owners = artistsForRow(row, notice, state);
  const parts: EvalPart[] = [];
  const isKunlunRoles = assignableSlots(notice).some((slot) => slot.startsWith('role:'));
  // 昆仑 attributes must hold for every role; candidate pools only need one.
  const requireAll = isKunlunRoles && row.slot === 'main' && row.scope === 'artist';

  if (row.type === 'stat') {
    const attrs = multiStatAttrs(row.name);
    if (attrs && target?.kind === 'multi' && attrs.length === target.values.length) {
      for (const artistId of owners) {
        attrs.forEach((attr, index) => parts.push(statPart(artistId, attr, target.values[index], ctx)));
      }
    } else {
      const attr = normaliseStatName(row.name);
      if (attr && row.scope === 'artist') {
        for (const artistId of owners) parts.push(statPart(artistId, attr, min, ctx));
      } else {
        // 团体名气 / 团体人气 are group-level numbers, not artist attributes.
        const key = `gval:${notice.id}:${row.id}`;
        parts.push(numberPart(key, '团体', 'number', state.values[key] ?? 0, min));
      }
    }
  } else if (row.type === 'cert') {
    const certs = certsForName(row.name);
    if (!owners.length) {
      parts.push({
        key: `cert:${notice.id}:${row.id}`, label: '未指派', input: 'none', met: false,
        detail: '先在卡头指派艺人', value: 0, target: 1,
      });
    }
    for (const artistId of owners) {
      for (const cert of certs) {
        const key = certKey(cert, artistId);
        const held = (state.values[key] ?? 0) >= 1;
        const { attrs, courseList } = certGaps(cert, artistId, state);
        const unmetCourses = courseList.filter(
          (item) => COURSE_LEVELS.indexOf(item.current) < COURSE_LEVELS.indexOf(item.required),
        ).length;
        parts.push({
          key,
          // Pure certificate name: the row head already carries the role /
          // artist, so repeating it here just widens the line.
          label: cert,
          ownerId: artistId,
          ownerLabel: labelFor(artistId, titles),
          input: 'check',
          met: held,
          detail: held ? '已取得' : attrs.length || unmetCourses ? `还差 ${attrs.length + unmetCourses} 项` : '属性课程已凑齐 · 待取证',
          value: state.values[key] ?? 0,
          target: 1,
          gaps: attrs,
          courseList,
        });
      }
    }
  } else if (row.type === 'count') {
    if (row.scope === 'artist') {
      for (const artistId of owners) {
        const key = `count:${artistId}:${row.name}`;
        parts.push(numberPart(key, labelFor(artistId, titles), 'counter', state.values[key] ?? 0, min, '', artistId));
      }
    } else if (row.scope === 'group') {
      const key = `count:${notice.id}:${row.id}`;
      parts.push(numberPart(key, '团体', 'counter', state.values[key] ?? 0, min));
    } else {
      const key = `count:${row.name}`;
      parts.push(numberPart(key, '公司共享', 'counter', state.values[key] ?? 0, min));
    }
  } else if (row.type === 'resource') {
    const key = `resource:${row.name}`;
    const unit = target?.kind === 'value' ? target.unit ?? '' : '';
    parts.push(numberPart(key, '公司共享', 'number', state.values[key] ?? 0, min, unit));
  } else if (row.type === 'item') {
    const key = row.scope === 'global' ? `item:${row.name}` : `item:${notice.id}:${row.id}`;
    parts.push(numberPart(key, row.scope === 'global' ? '公司共享' : '仅本通告', 'check', state.values[key] ?? 0, 1));
  } else {
    // flag
    if (row.scope === 'artist') {
      for (const artistId of owners) {
        const key = `flag:${artistId}:${row.name}`;
        parts.push(numberPart(key, labelFor(artistId, titles), 'check', state.values[key] ?? 0, 1, '', artistId));
      }
    } else if (row.scope === 'global') {
      const key = `flag:${row.name}`;
      parts.push(numberPart(key, '公司共享', 'check', state.values[key] ?? 0, 1));
    } else {
      const key = `flag:${notice.id}:${row.id}`;
      parts.push(numberPart(key, row.scope === 'group' ? '团体' : '仅本通告', 'check', state.values[key] ?? 0, 1));
    }
  }

  if (!parts.length) {
    // An artist-scoped row with nobody assigned must not silently read as met.
    parts.push({
      key: `unassigned:${notice.id}:${row.id}`, label: '未指派', input: 'none', met: false,
      detail: '先在卡头指派艺人', value: 0, target: 1,
    });
  }

  // Parts of one artist are ANDed (both diplomas for a certificate, all three
  // stats of a multi-attribute row). Across a candidate pool only one artist
  // has to qualify; named roles / group members all do, and 昆仑's `main`
  // attribute rows are checked against all three roles.
  const groups = new Map<string, EvalPart[]>();
  for (const part of parts) {
    const groupKey = part.ownerId ? `a:${part.ownerId}` : `k:${part.key}`;
    const list = groups.get(groupKey) ?? [];
    list.push(part);
    groups.set(groupKey, list);
  }
  const perOwner = [...groups.values()].map((list) => list.every((part) => part.met));
  const requireEveryOwner = row.scope === 'role' || row.scope === 'group' || requireAll;

  // stat / resource rows have no auto gate, so the checklist tick is the source
  // of truth and any number you enter is an optional, expandable peek only.
  const doneEligible = (row.type === 'stat' && owners.length > 0) || row.type === 'resource';
  const met = doneEligible
    ? ctx.state.done.includes(row.id)
    : requireEveryOwner ? perOwner.every(Boolean) : perOwner.some(Boolean);

  const ownerLabel = row.scope === 'global' ? '公司共享'
    : row.scope === 'group' ? '团体'
      : row.scope === 'role' ? (row.slot.startsWith('role:') ? row.slot.slice(5) : '角色位')
        : row.scope === 'notice' ? '仅本通告'
          : owners.length ? owners.map((id) => labelFor(id, titles)).join('、') : '按艺人';

  return { row, parts, met, shared: false, ownerLabel, doneEligible };
}

export interface BoardEval {
  byNotice: Record<string, RowEval[]>;
  sharedKeys: Set<string>;
  /** A key shared by >=2 enabled notices. Used for the 「共享」 badge. */
  enabledCount: Record<string, number>;
}

/** Evaluate every condition row once, then mark keys that appear in more than
 *  one enabled notice — that is the entire "shared state" mechanism: one value,
 *  several cards reading it. */
export function evaluateBoard(
  data: SpecialsData,
  state: SpecialsState,
  titles: Map<string, string>,
): BoardEval {
  const byNotice: Record<string, RowEval[]> = {};
  const counts: Record<string, number> = {};
  for (const notice of data.notices) {
    const rows = data.rows
      .filter((row) => row.notice === notice.id && row.kind === 'condition')
      .map((row) => evaluateRow(row, { notice, state, titles }));
    byNotice[notice.id] = rows;
    if (!state.enabled.includes(notice.id)) continue;
    // Count *notices*, not rows: two rows in the same card reading one
    // attribute are not "shared between cards".
    const keys = new Set<string>();
    for (const row of rows) {
      for (const part of row.parts) keys.add(part.key);
    }
    for (const key of keys) counts[key] = (counts[key] ?? 0) + 1;
  }
  const sharedKeys = new Set(Object.entries(counts).filter(([, n]) => n > 1).map(([key]) => key));
  for (const rows of Object.values(byNotice)) {
    for (const row of rows) {
      // Reserve the badge for state the user actually edits in more than one
      // card. Done-based stat / resource rows tick per notice, so their
      // shared-looking attribute key must not earn a misleading badge.
      row.shared = !row.doneEligible
        && row.parts.some((part) => sharedKeys.has(part.key) && part.input !== 'none');
    }
  }
  return { byNotice, sharedKeys, enabledCount: counts };
}

export function noticeProgress(rows: RowEval[] | undefined): { met: number; total: number } {
  const list = rows ?? [];
  return { met: list.filter((row) => row.met).length, total: list.length };
}

/** Courses needed by an artist's enabled notices, plus the full ten for the
 *  optional "show all" fold. */
export interface CourseEntry {
  name: string;
  cert: string;
  required: CourseLevel;
  current: CourseLevel;
  needed: boolean;
}

export function courseEntriesForArtist(
  data: SpecialsData,
  state: SpecialsState,
  artistId: string,
): CourseEntry[] {
  const certs = certsForArtist(data, state, artistId);
  const neededCerts = new Set(certs);
  return COURSE_REQUIREMENTS.map((course) => ({
    name: course.name,
    cert: course.cert,
    required: course.level,
    current: state.courses[artistId]?.[course.name] ?? '未上',
    needed: neededCerts.has(course.cert),
  }));
}

/** Convenience for the review/test layer: how many courses a notice asks for. */
export function coursesForNotice(data: SpecialsData, noticeId: string, slot?: string): string[] {
  return coursesForCertsNames(certsForNotice(data, noticeId, slot));
}

function coursesForCertsNames(certs: string[]): string[] {
  const wanted = new Set(certs);
  return COURSE_REQUIREMENTS.filter((course) => wanted.has(course.cert)).map((course) => course.name);
}
