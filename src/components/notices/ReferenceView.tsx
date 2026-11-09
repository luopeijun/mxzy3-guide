import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { NoticeData } from '../../types/notices';
import { cn } from '../../lib/cn';
import { CATEGORY_STYLE } from './categoryStyle';
import { specialStyle } from './specialStyle';

interface Props {
  data: NoticeData;
}

/** 便签索引：标题与滚动定位都用这一份，顺序即页面顺序。 */
const SECTIONS = [
  { key: 'scale', label: '难度换算' },
  { key: 'special', label: '特殊要求影响' },
  { key: 'grades', label: '类型能力要求' },
  { key: 'growth', label: '艺人成长率' },
  { key: 'notes', label: '原表说明' },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

/** 等级字母的配色：A 最紧（玫瑰）、D 最松（暖灰），一眼能看出要求高低。
 *  D 原来用 surface-soft，底色几乎和卡片同色，远看就是一团浅灰字，
 *  换成 tag-auto 这组暖灰后底色能立起来，又不至于抢 A/B/C 的彩。 */
const GRADE_STYLE: Record<string, string> = {
  A: 'bg-brand-soft text-brand-strong',
  B: 'bg-tag-scene-soft text-tag-scene',
  C: 'bg-gold-soft text-gold',
  D: 'bg-tag-auto-soft text-tag-auto',
};

function GradeChip({ ability, grade }: { ability: string; grade: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-ui-xs px-1.5 py-0.5 text-ui-2xs',
        GRADE_STYLE[grade] ?? GRADE_STYLE.D,
      )}
    >
      {ability}
      <span className="font-bold tabular-nums">{grade}</span>
    </span>
  );
}

function gainText(gains: Record<string, number> | undefined): string[] {
  if (!gains) return [];
  return Object.entries(gains)
    .filter(([, value]) => value !== 0)
    .map(([ability, value]) => `${ability} ${value > 0 ? '+' : ''}${value}`);
}

/** 一张便签：顶部一条色带当作索引标记，标题旁再点一个同色圆点。 */
function NoteCard({
  name,
  tone,
  title,
  hint,
  className,
  children,
}: {
  name: SectionKey;
  tone: string;
  title: string;
  hint: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-reference-card={name}
      className={cn(
        'relative overflow-hidden rounded-ui-md border border-line bg-surface shadow-soft',
        className,
      )}
    >
      <span className={cn('absolute inset-x-0 top-0 h-[3px]', tone)} aria-hidden="true" />
      <div className="px-5 pb-4 pt-4">
        <h2 className="flex items-center gap-1.5 text-ui-sm font-bold text-brand-strong">
          <span className={cn('h-1.5 w-1.5 rounded-full', tone)} aria-hidden="true" />
          {title}
        </h2>
        <p className="mt-1 text-ui-2xs leading-[1.7] text-ink-faint">{hint}</p>
        {children}
      </div>
    </section>
  );
}

/** 「能力对照」：把表里那些计算性质的内容摊开——难度换算、特殊要求影响、
 *  类型要求、艺人成长率。玩家真正要回答的问题是「我这个艺人能不能接」。
 *
 *  宽屏排成两列便签（表窄的两块并排），右侧是「本页小结」：点条目滚到对应便签，
 *  滚动时反过来高亮当前所在的那块。 */
export default function ReferenceView({ data }: Props) {
  // 类型 → 分类，用通告数据本身推导，避免在代码里再维护一份类型清单。
  const typeCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const notice of data.notices) {
      const type = notice.type ?? notice.level;
      if (type && !map.has(type)) map.set(type, notice.cat);
    }
    return map;
  }, [data.notices]);

  const groups = useMemo(
    () =>
      data.categories.map((category) => {
        const rows = data.grades.filter((row) => typeCategory.get(row.type) === category.key);
        // 参照表是「所有类型的主角」再「所有类型的配角」，读起来要来回对照。
        // 这里按类型首次出现的顺序聚在一起，同一类型的两个对象相邻。
        const order = new Map<string, number>();
        for (const row of rows) if (!order.has(row.type)) order.set(row.type, order.size);
        return {
          ...category,
          rows: [...rows].sort((a, b) => (order.get(a.type) ?? 0) - (order.get(b.type) ?? 0)),
        };
      }),
    [data.categories, data.grades, typeCategory],
  );

  // 成长率每列的最高值加底色：和游戏里的属性表一样，只标唯一的最高值。
  const bestValues = useMemo(() => {
    const best: Record<string, number> = {};
    for (const ability of data.abilities) {
      const values = data.growth.map((row) => row.values[ability] ?? 0);
      const max = Math.max(...values);
      if (values.filter((value) => value === max).length === 1) best[ability] = max;
    }
    return best;
  }, [data.abilities, data.growth]);

  const hasNotes = (data.notes ?? []).length > 0;
  const sections = useMemo(
    () => SECTIONS.filter((section) => section.key !== 'notes' || hasNotes),
    [hasNotes],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<SectionKey>('scale');

  // 滚动时高亮当前便签：取「顶部已经越过容器上沿的最后一块」。
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const base = box.getBoundingClientRect().top;
      let current: SectionKey = sections[0]?.key ?? 'scale';
      let best = -Infinity;
      for (const section of sections) {
        const card = box.querySelector<HTMLElement>(`[data-reference-card="${section.key}"]`);
        if (!card) continue;
        const top = card.getBoundingClientRect().top - base;
        // 并排的两块会同时越线，取更贴近上沿的那块；相等时保留先出现的一块。
        if (top <= 40 && top > best) {
          best = top;
          current = section.key;
        }
      }
      // 滚到底时最后一块可能永远到不了上沿，直接把它点亮。
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) {
        current = sections[sections.length - 1]?.key ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      box.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sections]);

  const jump = (key: SectionKey) => {
    const box = scrollRef.current;
    const card = box?.querySelector<HTMLElement>(`[data-reference-card="${key}"]`);
    if (!box || !card) return;
    const top = card.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    setActive(key);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={scrollRef}
        data-notice-reference
        className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]"
      >
        <div className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-4 min-[1240px]:grid-cols-2">
          <NoteCard
            name="scale"
            tone="bg-brand"
            title="难度换算"
            hint="能力要求写作等级字母，实际区间由「字母 × 星数」查表得出；S/L 在区间内随机。"
          >
            <table className="mt-2.5 w-full max-w-[520px] text-ui-2xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="py-1 text-left font-normal">难度</th>
                  {['A', 'B', 'C', 'D'].map((grade) => (
                    <th key={grade} className="py-1 text-right font-normal">
                      {grade}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.scale.map((row) => (
                  <tr key={row.stars} className="border-t border-line">
                    <td className="py-1 text-ink">{row.label}</td>
                    {['A', 'B', 'C', 'D'].map((grade) => (
                      <td key={grade} className="py-1 text-right tabular-nums text-ink-muted">
                        {row.ranges[grade] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </NoteCard>

          <NoteCard
            name="special"
            tone="bg-gold"
            title="特殊要求影响"
            hint="带「搞笑」「反派」这类要求时，拍摄期间每天对三项属性的增减，每格都是每天的数值。"
          >
            <table className="mt-2.5 w-full max-w-[480px] text-ui-2xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="py-1 text-left font-normal">特殊要求</th>
                  <th className="py-1 text-right font-normal">亲和 / 天</th>
                  <th className="py-1 text-right font-normal">叛逆 / 天</th>
                  <th className="py-1 text-right font-normal">性感 / 天</th>
                </tr>
              </thead>
              <tbody>
                {data.specialEffects.map((row) => {
                  const tone = specialStyle(row.kind);
                  return (
                    <tr key={row.kind} className="border-t border-line">
                      <td className="py-1">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-ui-xs border px-1.5 py-0.5 font-semibold',
                            tone.chip,
                          )}
                        >
                          <span
                            className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                            aria-hidden="true"
                          />
                          {row.kind}
                        </span>
                      </td>
                      {(['affinity', 'rebellion', 'sexy'] as const).map((field) => {
                        const value = row[field];
                        return (
                          <td
                            key={field}
                            className={cn(
                              'py-1 text-right tabular-nums',
                              value === undefined
                                ? 'text-ink-faint'
                                : value > 0
                                  ? 'text-growth-strong'
                                  : 'text-missing',
                            )}
                          >
                            {value === undefined ? '—' : `${value > 0 ? '+' : ''}${value}`}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">
              「—」表示该项不增不减，例如「吻戏」只是题材限制，不带属性变化。
            </p>
          </NoteCard>

          <NoteCard
            name="grades"
            tone="bg-tag-scene"
            title="类型能力要求"
            hint="按「类型 × 征求对象」列出每项能力的等级，以及拍摄期间每天的能力增减；没列出的能力不作要求。"
            className="min-[1240px]:col-span-2"
          >
            <div className="mt-3 flex flex-col gap-4">
              {groups.map((group) => (
                <div
                  key={group.key}
                  data-reference-group={group.key}
                  className="border-t border-line pt-3 first:border-0 first:pt-0"
                >
                  <h3 className="flex items-center gap-2 text-ui-2xs font-semibold text-ink-muted">
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', CATEGORY_STYLE[group.key].bar)}
                    />
                    {group.name}
                    <span className="font-normal text-ink-faint">{group.rows.length} 条</span>
                  </h3>
                  <table className="mt-1.5 w-full text-ui-2xs">
                    <tbody>
                      {group.rows.map((row) => (
                        <tr
                          key={`${row.type}-${row.role}`}
                          className="border-t border-line align-top"
                        >
                          <td className="whitespace-nowrap py-1.5 pr-6 text-ink">{row.type}</td>
                          <td className="whitespace-nowrap py-1.5 pr-8 text-ink-faint">
                            {row.role || '—'}
                          </td>
                          <td className="py-1.5 pr-6">
                            <span className="flex flex-wrap gap-1">
                              {Object.entries(row.grades).map(([ability, grade]) => (
                                <GradeChip key={ability} ability={ability} grade={grade} />
                              ))}
                            </span>
                          </td>
                          <td className="w-[1%] whitespace-nowrap py-1.5 text-right text-ink-muted">
                            {gainText(row.gains).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </NoteCard>

          <NoteCard
            name="growth"
            tone="bg-tag-manual"
            title="艺人成长率"
            hint="百分数，基础成长 100。赠送物品时只看这一列；表格里唯一的最高值会标出来。"
            className="min-[1240px]:col-span-2"
          >
            <div className="mt-2.5 overflow-x-auto">
              <table data-growth-table className="w-full min-w-[680px] text-ui-2xs">
                <thead>
                  <tr className="text-ink-faint">
                    <th className="py-1 pr-2 text-left font-normal">艺人</th>
                    {data.abilities.map((ability) => (
                      <th key={ability} className="px-1 py-1 text-right font-normal">
                        {ability}
                      </th>
                    ))}
                    <th className="py-1 pl-1 text-right font-normal">合计</th>
                  </tr>
                </thead>
                <tbody>
                  {data.growth.map((row) => (
                    <tr key={row.artist} className="border-t border-line">
                      <td className="whitespace-nowrap py-1.5 pr-2 text-ink">{row.artist}</td>
                      {data.abilities.map((ability) => {
                        const value = row.values[ability];
                        const best = value !== undefined && value === bestValues[ability];
                        return (
                          <td
                            key={ability}
                            className={cn(
                              'px-1 py-1.5 text-right tabular-nums',
                              best
                                ? 'bg-brand-soft font-semibold text-brand-strong'
                                : 'text-ink-muted',
                            )}
                          >
                            {value ?? '—'}
                          </td>
                        );
                      })}
                      <td className="py-1.5 pl-1 text-right tabular-nums text-ink-faint">
                        {row.total ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </NoteCard>

          {hasNotes && (
            <NoteCard
              name="notes"
              tone="bg-tag-auto"
              title="原表说明"
              hint="通告表的作者在「说明」页里留下的几段，按原文照录。"
              className="min-[1240px]:col-span-2"
            >
              <ul data-reference-notes className="mt-2.5 grid gap-1.5 min-[1240px]:grid-cols-2">
                {(data.notes ?? []).map((note) => (
                  <li
                    key={note}
                    className="flex gap-2 rounded-ui-sm bg-surface-soft px-2.5 py-1.5 text-ui-2xs leading-[1.8] text-ink-muted"
                  >
                    <span className="shrink-0 text-ink-faint">·</span>
                    <span className="min-w-0 flex-1">{note}</span>
                  </li>
                ))}
              </ul>
            </NoteCard>
          )}
        </div>
      </div>

      <nav
        data-reference-rail
        aria-label="本页小结"
        className="hidden w-[176px] shrink-0 border-l border-line px-3 py-5 min-[1120px]:block"
      >
        <p className="px-1 text-ui-2xs font-semibold text-ink-faint">本页小结</p>
        <ul className="mt-2 flex flex-col gap-0.5">
          {sections.map((section) => {
            const current = active === section.key;
            return (
              <li key={section.key}>
                <button
                  type="button"
                  data-reference-rail-item={section.key}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => jump(section.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-ui-xs px-2 py-1.5 text-left text-ui-2xs transition-colors',
                    current
                      ? 'bg-brand-soft font-semibold text-brand-strong'
                      : 'text-ink-muted hover:bg-surface-soft hover:text-brand-strong',
                  )}
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      current ? 'bg-brand' : 'bg-line-strong',
                    )}
                  />
                  {section.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
