import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/** 课程 / 打工 → 能加的属性（玩家口述）：hover 差值时按缺口属性推荐。
 *  打工只列属性、不铺每档数值：存档读不到当前是新手还是资深，按属性给方向就够。 */
const TRAINING_COURSES: { name: string; attrs: string[] }[] = [
  { name: '音感发声', attrs: ['歌艺', '自信'] },
  { name: '乐器乐理', attrs: ['歌艺', '才智'] },
  { name: '声音表情', attrs: ['演技', '口才'] },
  { name: '肢体动作', attrs: ['演技', '动感'] },
  { name: '说话技巧', attrs: ['口才', '自信'] },
  { name: '摄影训练', attrs: ['仪态', '体能'] },
  { name: '舞台表演', attrs: ['仪态', '动感'] },
  { name: '有氧舞蹈', attrs: ['动感', '体能'] },
  { name: '快速记忆', attrs: ['口才', '才智'] },
  { name: '美姿美仪', attrs: ['仪态', '自信'] },
];

/** 只列能补的正向属性：压力 / 疲劳是副作用，唱片助理的动感是 -1，都不算。 */
const WORKS: { name: string; attrs: string[] }[] = [
  { name: '唱片助理', attrs: ['歌艺', '才智'] },
  { name: '戏剧配音', attrs: ['演技', '名气', '自信'] },
  { name: '幕后合音', attrs: ['歌艺', '仪态', '名气'] },
  { name: 'MV 演出', attrs: ['演技', '名气', '自信'] },
  { name: '节目助理', attrs: ['口才', '体能', '名气', '自信'] },
  { name: '舞群伴舞', attrs: ['动感', '体能', '名气'] },
  { name: '平面模特', attrs: ['仪态', '自信', '名气'] },
];

export type CourseHint = { kind: '训练' | '打工' | '道具'; name: string; attrs: string[]; text?: string };
const HINTS_BY_ATTR: Record<string, CourseHint[]> = {};
for (const course of TRAINING_COURSES) {
  for (const attr of course.attrs) {
    (HINTS_BY_ATTR[attr] ??= []).push({ kind: '训练', name: course.name, attrs: course.attrs });
  }
}
for (const work of WORKS) {
  for (const attr of work.attrs) {
    (HINTS_BY_ATTR[attr] ??= []).push({ kind: '打工', name: work.name, attrs: work.attrs });
  }
}

/** 道具属性行（Item.dat 原文，繁体）里的属性写法 -> 页面简体名。
 *  九项能力带数字（口才+10），社交门槛（叛逆/性感/亲和/人气/曝光）常写成
 *  「親和力上升 / 性感上升叛逆上升」这种没有数字的定性描述，两种都要认。
 *  只列正向加成；像八卦雜誌「才智-20」、冰山雪蓮「人氣-40」这类负项不算「能补」。 */
const ITEM_ATTR_TRAD: Record<string, string> = {
  演技: '演技', 口才: '口才', 才智: '才智', 自信: '自信',
  儀態: '仪态', 動感: '动感', 體能: '体能', 歌藝: '歌艺', 名氣: '名气',
  叛逆: '叛逆', 性感: '性感', 親和: '亲和', 親和力: '亲和',
  人氣: '人气', 曝光: '曝光',
};
// 「XX上升」没有数字，只能靠上面的繁体写法白名单匹配；长的写法排前面，
// 这样「親和力上升」不会被「親和」抢先切成两半。
const ITEM_RISING_RE = new RegExp(
  `(${Object.keys(ITEM_ATTR_TRAD).sort((a, b) => b.length - a.length).join('|')})上升`,
  'g',
);

/** 两站存档道具结构同构（code / quantity / name / stats），这里只取需要的字段。 */
export interface HintItem {
  code: number;
  quantity: number;
  name?: string;
  stats?: string;
}

/** 从存档已拥有的道具里建「缺口属性 -> 可补道具」索引。显示沿用道具表原文
 *  （和道具面板一致），一行里所有增减都写出来，不只写补的那一项。 */
export function itemHintsFor(items: HintItem[]): Record<string, CourseHint[]> {
  const out: Record<string, CourseHint[]> = {};
  for (const it of items) {
    if (it.quantity <= 0 || !it.stats) continue;
    const matched = new Set<string>();
    // 带数字：口才+10 / 性感+50；只收正向，才智-20 / 人氣-40 不算。
    for (const [, attr, raw] of it.stats.matchAll(/([^\s+\-]+)([+-]\d+)/g)) {
      const simple = ITEM_ATTR_TRAD[attr];
      if (!simple || Number(raw) <= 0) continue;
      matched.add(simple);
    }
    // 无数字：親和力上升 / 性感上升叛逆上升（男性香水一行补两项）。
    for (const [, attr] of it.stats.matchAll(ITEM_RISING_RE)) {
      const simple = ITEM_ATTR_TRAD[attr];
      if (simple) matched.add(simple);
    }
    const text = `${it.name ?? `道具 ${it.code}`}（${it.stats.replace(/\s+/g, '，')}）`;
    for (const attr of matched) {
      (out[attr] ??= []).push({ kind: '道具', name: it.name ?? `道具 ${it.code}`, attrs: [attr], text });
    }
  }
  return out;
}

/** Hover a missing ability and see what can raise it. Portal to body so the
 *  popover is not clipped by the case tab's own overflow-y content column.
 *  Moving the mouse onto the popover keeps it open; leaving closes it.
 *  主站与甜蜜乐章共用同一套 DOM / data-case-* 属性；label 只用来改写触发词的
 *  数字格式（甜站差值保留一位小数），不传则沿用主站的 Math.ceil。 */
export function GapCourseHint({
  gap, itemHints, social = false, label,
}: {
  gap: { attr: string; diff: number };
  itemHints: Record<string, CourseHint[]>;
  social?: boolean;
  label?: ReactNode;
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 社交门槛没有训练 / 打工课程，只看道具联动；九项能力照旧两者都有。
  const hints = [
    ...(social ? [] : HINTS_BY_ATTR[gap.attr] ?? []),
    ...(itemHints[gap.attr] ?? []),
  ];

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => () => cancelClose(), [cancelClose]);

  // 社交门槛保留原来的粉色小标签；没有可补道具时也不改变既有外观。
  const pill = social
    ? 'inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 align-baseline font-semibold text-brand-strong'
    : '';
  const text = <>{label ?? <>{gap.attr} {Math.ceil(gap.diff)}</>}</>;
  if (hints.length === 0) {
    return social
      ? <span data-case-social-gap title="从存档读取的附加属性门槛（无等级）" className={pill}>{text}</span>
      : <span>{text}</span>;
  }
  return (
    <span
      data-case-course-hint={gap.attr}
      {...(social ? { 'data-case-social-gap': '' } : {})}
      title={social ? '从存档读取的附加属性门槛（无等级）' : undefined}
      className={cn('cursor-help decoration-dotted underline-offset-2 hover:underline', pill)}
      onMouseEnter={(ev) => {
        cancelClose();
        const r = ev.currentTarget.getBoundingClientRect();
        setAnchor({ x: r.left + r.width / 2, y: r.top });
      }}
      // 留一点时间让鼠标穿过触发词和浮窗之间的 6px 空隙
      onMouseLeave={() => {
        cancelClose();
        closeTimer.current = setTimeout(() => setAnchor(null), 150);
      }}
    >
      {text}
      {anchor && createPortal(
        <div
          data-case-course-popover
          className="pointer-events-auto fixed z-50 w-[360px] rounded-ui-md border border-line-strong bg-surface px-2.5 py-1.5 text-ui-2xs shadow-lg"
          style={{ left: anchor.x, top: anchor.y - 6, transform: 'translate(-50%, -100%)' }}
          onMouseEnter={cancelClose}
          onMouseLeave={() => setAnchor(null)}
        >
          <div className="mb-0.5 font-semibold text-brand-strong">可补 {gap.attr}</div>
          {(['训练', '打工', '道具'] as const).map((kind) => {
            const group = hints.filter((hint) => hint.kind === kind);
            if (group.length === 0) return null;
            return (
              <div key={kind}>
                <div className="font-semibold text-ink-faint">【{kind}】</div>
                {group.map((hint) => {
                  // 道具整行照抄道具表（含负项），训练 / 打工只列能补的属性。
                  const shown = hint.text ?? (() => {
                    const pair = hint.attrs.slice(0, 2).includes(gap.attr)
                      ? hint.attrs.slice(0, 2)
                      : [gap.attr, ...hint.attrs.filter((attr) => attr !== gap.attr)].slice(0, 2);
                    return `${hint.name}（${pair.join(' · ')}）`;
                  })();
                  return (
                    <div key={hint.name} className="whitespace-nowrap pl-3 text-ink-muted">
                      {shown}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </span>
  );
}
