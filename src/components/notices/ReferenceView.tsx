import { useMemo } from 'react';
import type { NoticeData } from '../../types/notices';
import { cn } from '../../lib/cn';
import { CATEGORY_STYLE } from './categoryStyle';

interface Props {
  data: NoticeData;
}

/** 等级字母的配色：A 最紧（玫瑰）、D 最松（灰），一眼能看出要求高低。 */
const GRADE_STYLE: Record<string, string> = {
  A: 'bg-brand-soft text-brand-strong',
  B: 'bg-tag-scene-soft text-tag-scene',
  C: 'bg-gold-soft text-gold',
  D: 'bg-surface-soft text-ink-faint',
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

/** 「能力对照」：把表里那些计算性质的内容摊开——难度换算、特殊要求影响、
 *  类型要求、艺人成长率。玩家真正要回答的问题是「我这个艺人能不能接」。 */
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

  return (
    <div
      data-notice-reference
      className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]"
    >
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
        <section className="rounded-ui-md border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-ui-sm font-bold text-brand-strong">难度换算</h2>
          <p className="mt-1 text-ui-2xs leading-[1.8] text-ink-faint">
            通告的能力要求写作等级字母，实际区间由「字母 × 星数」查表得出；S/L 会在区间内随机。
            通告卡片上的星数就是角色难度。
          </p>
          <table className="mt-3 w-full max-w-[560px] text-ui-2xs">
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
                  <td className="py-1.5 text-ink">{row.label}</td>
                  {['A', 'B', 'C', 'D'].map((grade) => (
                    <td key={grade} className="py-1.5 text-right tabular-nums text-ink-muted">
                      {row.ranges[grade] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-ui-md border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-ui-sm font-bold text-brand-strong">特殊要求影响</h2>
          <p className="mt-1 text-ui-2xs leading-[1.8] text-ink-faint">
            角色带「搞笑」「反派」这类特殊要求时，拍摄期间每天对三项属性造成的增减。
          </p>
          <table className="mt-3 w-full max-w-[440px] text-ui-2xs">
            <thead>
              <tr className="text-ink-faint">
                <th className="py-1 text-left font-normal">特殊要求</th>
                <th className="py-1 text-right font-normal">亲和</th>
                <th className="py-1 text-right font-normal">叛逆</th>
                <th className="py-1 text-right font-normal">性感</th>
              </tr>
            </thead>
            <tbody>
              {data.specialEffects.map((row) => (
                <tr key={row.kind} className="border-t border-line">
                  <td className="py-1.5 text-ink">{row.kind}</td>
                  {(['affinity', 'rebellion', 'sexy'] as const).map((field) => {
                    const value = row[field];
                    return (
                      <td
                        key={field}
                        className={cn(
                          'py-1.5 text-right tabular-nums',
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
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-ui-md border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-ui-sm font-bold text-brand-strong">类型能力要求</h2>
          <p className="mt-1 text-ui-2xs leading-[1.8] text-ink-faint">
            按「类型 × 征求对象」列出每项能力的等级要求与每日成长；没有列出的能力不作要求。
          </p>
          <div className="mt-3 flex flex-col gap-4">
            {groups.map((group) => (
              <div key={group.key} data-reference-group={group.key}>
                <h3 className="flex items-center gap-2 text-ui-2xs font-semibold text-ink-muted">
                  <span className={cn('h-1.5 w-1.5 rounded-full', CATEGORY_STYLE[group.key].bar)} />
                  {group.name}
                  <span className="font-normal text-ink-faint">{group.rows.length} 条</span>
                </h3>
                <table className="mt-1.5 w-full table-fixed text-ui-2xs">
                  <colgroup>
                    <col className="w-[26%]" />
                    <col className="w-[14%]" />
                    <col />
                    <col className="w-[26%]" />
                  </colgroup>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={`${row.type}-${row.role}`} className="border-t border-line align-top">
                        <td className="py-1.5 pr-2 text-ink">{row.type}</td>
                        <td className="py-1.5 pr-2 text-ink-faint">{row.role || '—'}</td>
                        <td className="py-1.5 pr-2">
                          <span className="flex flex-wrap gap-1">
                            {Object.entries(row.grades).map(([ability, grade]) => (
                              <GradeChip key={ability} ability={ability} grade={grade} />
                            ))}
                          </span>
                        </td>
                        <td className="py-1.5 text-right text-ink-muted">
                          {gainText(row.gains).join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-ui-md border border-line bg-surface p-4 shadow-soft">
          <h2 className="text-ui-sm font-bold text-brand-strong">艺人成长率</h2>
          <p className="mt-1 text-ui-2xs leading-[1.8] text-ink-faint">
            百分数，基础成长 100。赠送物品时只看这一列；表格里唯一的最高值会标出来。
          </p>
          <div className="-mx-1 mt-3 overflow-x-auto px-1">
            <table data-growth-table className="w-full min-w-[640px] text-ui-2xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="py-1 pr-2 text-left font-normal">艺人</th>
                  {data.abilities.map((ability) => (
                    <th key={ability} className="py-1 px-1 text-right font-normal">
                      {ability}
                    </th>
                  ))}
                  <th className="py-1 pl-1 text-right font-normal">合计</th>
                </tr>
              </thead>
              <tbody>
                {data.growth.map((row) => (
                  <tr key={row.artist} className="border-t border-line">
                    <td className="py-1.5 pr-2 whitespace-nowrap text-ink">{row.artist}</td>
                    {data.abilities.map((ability) => {
                      const value = row.values[ability];
                      const best = value !== undefined && value === bestValues[ability];
                      return (
                        <td
                          key={ability}
                          className={cn(
                            'py-1.5 px-1 text-right tabular-nums',
                            best ? 'bg-brand-soft font-semibold text-brand-strong' : 'text-ink-muted',
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
        </section>

        {(data.notes ?? []).length > 0 && (
          <section
            data-reference-notes
            className="rounded-ui-md border border-line bg-surface-soft p-4"
          >
            <h2 className="text-ui-sm font-bold text-brand-strong">原表说明</h2>
            <p className="mt-1 text-ui-2xs leading-[1.8] text-ink-faint">
              通告表的作者在「说明」页里留下的几段，按原文照录。
            </p>
            <ul className="mt-2 flex max-w-[760px] flex-col gap-1.5">
              {(data.notes ?? []).map((note) => (
                <li
                  key={note}
                  className="flex gap-2 text-ui-2xs leading-[1.9] text-ink-muted"
                >
                  <span className="shrink-0 text-ink-faint">·</span>
                  <span className="min-w-0 flex-1">{note}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
