import { CERT_ROWS, TRAINING_ROWS } from '../components/tips/tipsData';
import type {
  SpecialRow, SpecialScope, SpecialsData,
} from '../types/specials';

/** The ten numeric attributes a playthrough has to track. 人气 is a 0–5
 *  popularity grade, not a 0–999 stat, so it needs its own input range. */
export interface AttributeDef {
  key: string;
  max: number;
  hint?: string;
}

export const ATTRIBUTES: AttributeDef[] = [
  { key: '演技', max: 999 },
  { key: '歌艺', max: 999 },
  { key: '口才', max: 999 },
  { key: '仪态', max: 999 },
  { key: '动感', max: 999 },
  { key: '体能', max: 999 },
  { key: '才智', max: 999 },
  { key: '自信', max: 999 },
  { key: '名气', max: 999 },
  { key: '人气', max: 5, hint: '人气是 0–5 的等级，不是 0–999' },
];

export const ATTRIBUTE_KEYS = new Set(ATTRIBUTES.map((item) => item.key));

/** Course grades from sources/training.txt. "未上" is a UI state, not a
 *  game grade: a high attribute only makes the next grade *available*, it
 *  does not mean the course was actually taken. */
export const COURSE_LEVELS = ['未上', '初级', '中级', '高级', '专业'] as const;
export type CourseLevel = (typeof COURSE_LEVELS)[number];

export interface CourseRequirement {
  name: string;
  cert: string;
  level: CourseLevel;
  /** The two attributes this course trains. */
  attrs: [string, string];
}

/** Reuse the tips page's training table instead of duplicating game values. */
export const COURSE_REQUIREMENTS: CourseRequirement[] = TRAINING_ROWS.map((row) => ({
  name: row.name,
  cert: row.cert,
  level: row.grade as CourseLevel,
  attrs: [row.a, row.b],
}));

export interface CertRequirement {
  cert: string;
  attrs: { name: string; min: number }[];
  /** "维也纳课程3次" etc. */
  courseNote: string;
}

export const CERT_REQUIREMENTS: CertRequirement[] = CERT_ROWS.map((row) => ({
  cert: row.name,
  attrs: [...row.need.matchAll(/([^\d,，\s]+)(\d+)/g)].map((match) => ({
    name: match[1],
    min: Number(match[2]),
  })),
  courseNote: row.course,
}));

/** The condition table says 国际音乐学院证书; the training table says
 *  音乐证书. Parse by keyword so both spellings (and role combinations like
 *  「男主：戏剧 + 音乐证书」) resolve to the same three certificates. */
export function certsForName(name: string): string[] {
  const out: string[] = [];
  if (name.includes('音乐')) out.push('音乐证书');
  if (name.includes('戏剧')) out.push('戏剧证书');
  if (name.includes('舞蹈')) out.push('舞蹈证书');
  return out;
}

/** Which certificates a notice (optionally one of its role slots) needs.
 *  Derived from the condition table, so editing the TSV is enough. */
export function certsForNotice(
  data: SpecialsData,
  noticeId: string,
  slot?: string,
): string[] {
  const found = new Set<string>();
  for (const row of data.rows) {
    if (row.notice !== noticeId || row.kind !== 'condition' || row.type !== 'cert') continue;
    if (slot && row.slot !== slot) continue;
    for (const cert of certsForName(row.name)) found.add(cert);
  }
  return [...found];
}

/** Only the courses behind those certificates — never all ten at once. */
export function coursesForCerts(certs: string[]): CourseRequirement[] {
  const wanted = new Set(certs);
  return COURSE_REQUIREMENTS.filter((course) => wanted.has(course.cert));
}

export type ParsedTarget =
  | { kind: 'range'; min: number; max: number; raw: string }
  | { kind: 'value'; min: number; unit?: string; raw: string }
  | { kind: 'multi'; values: number[]; raw: string }
  | null;

/** "630~700" is a range (reaching the lower bound counts), "4000万" a value,
 *  "300/300/3" three sub-requirements. Unknown shapes return null instead of
 *  guessing. */
export function parseTarget(raw: string): ParsedTarget {
  const text = raw.trim();
  if (!text || text === '-') return null;
  if (text.includes('~')) {
    const [min, max] = text.split('~').map(Number);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      return { kind: 'range', min, max, raw: text };
    }
  }
  if (text.includes('/')) {
    const values = text.split('/').map(Number);
    if (values.length > 1 && values.every((value) => Number.isFinite(value))) {
      return { kind: 'multi', values, raw: text };
    }
  }
  const match = /^(\d+(?:\.\d+)?)(万)?$/.exec(text);
  if (match) {
    return { kind: 'value', min: Number(match[1]), unit: match[2], raw: text };
  }
  return null;
}

/** Strip the parenthetical qualifier: 名气（触发前置） → 名气. */
export function normaliseStatName(name: string): string | null {
  const base = name.replace(/[（(].*$/, '').trim();
  return ATTRIBUTE_KEYS.has(base) ? base : null;
}

export function rowsForNotice(data: SpecialsData, noticeId: string): SpecialRow[] {
  return data.rows.filter((row) => row.notice === noticeId);
}

export function conditionsOf(data: SpecialsData, noticeId: string): SpecialRow[] {
  return data.rows.filter((row) => row.notice === noticeId && row.kind === 'condition');
}

export function notesOf(data: SpecialsData, noticeId: string): SpecialRow[] {
  return data.rows.filter((row) => row.notice === noticeId && row.kind === 'note');
}

export const SCOPE_LABELS: Record<SpecialScope, string> = {
  global: '公司共享',
  artist: '按艺人',
  group: '按团体',
  role: '按角色位',
  notice: '仅本通告',
  '-': '只读',
};

export function slotLabel(slot: string): string {
  if (slot === '-') return '—';
  if (slot === 'main') return '主艺人';
  if (slot === 'group') return '团体';
  if (slot.startsWith('role:')) return slot.slice(5);
  return slot;
}
