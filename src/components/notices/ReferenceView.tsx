import { useMemo } from 'react';
import type { NoticeData } from '../../types/notices';
import { cn } from '../../lib/cn';
import { CATEGORY_STYLE } from './categoryStyle';
import { specialStyle } from './specialStyle';
import NoteCard from '../NoteCard';
import NotePage from '../NotePage';
import {
  AWARD_ROWS,
  ALBUM_ROWS,
  DEBUT_GROUPS,
  LENIENCY_ROWS,
  PENALTY_ROWS,
  SCHEDULE_GROUPS,
  type AlbumCell,
} from './referenceTables';

interface Props {
  data: NoticeData;
}

/** 便签索引：标题与滚动定位都用这一份，顺序即页面顺序。 */
const SECTIONS = [
  { key: 'scale', label: '难度换算' },
  { key: 'special', label: '特殊要求影响' },
  { key: 'debut', label: '出道简单通告' },
  { key: 'album', label: '第一年唱片数值' },
  { key: 'grades', label: '类型能力要求' },
  { key: 'penalty', label: '数值负面影响' },
  { key: 'schedule', label: '特殊日程影响' },
  { key: 'leniency', label: '放水情况' },
  { key: 'awards', label: '颁奖典礼' },
  { key: 'growth', label: '艺人成长率' },
  { key: 'notes', label: '原表说明' },
] as const;

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

/** 专辑明细表的合并单元格：被上方 rowSpan 覆盖的行该格缺省，直接跳过。
 *  这张表合并块多，用完整网格线（而非只画横线）才读得清哪个区间属于哪几行。 */
function AlbumTd({ cell, colSpan }: { cell?: AlbumCell; colSpan?: number }) {
  if (!cell) return null;
  return (
    <td
      rowSpan={cell.span ?? 1}
      colSpan={colSpan}
      className="border border-line px-2 py-1.5 text-center align-middle text-ink-muted"
    >
      {cell.v || null}
    </td>
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

  return (
    <NotePage sections={sections}>
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
            name="debut"
            tone="bg-tag-news"
            title="适合出道的简单通告（无需名气）"
            hint="名气不足时的起步选择：按剧种、广告、唱片、主持分组，列出基础属性、是否吃自信与其他属性；「—」表示不吃自信。"
            className="min-[1240px]:col-span-2"
          >
            <div className="mt-3 grid gap-x-10 gap-y-4 min-[900px]:grid-cols-2">
              {DEBUT_GROUPS.map((group) => (
                <div key={group.name}>
                  <h3 className="text-ui-2xs font-semibold text-ink-muted">
                    {group.name}
                    <span className="ml-2 font-normal text-ink-faint">基础属性 {group.base}</span>
                  </h3>
                  <table className="mt-1.5 w-full text-ui-2xs">
                    <thead>
                      <tr className="text-ink-faint">
                        <th className="py-1 text-left font-normal">通告</th>
                        <th className="py-1 text-center font-normal">自信</th>
                        <th className="py-1 text-right font-normal">其他属性</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.name} className="border-t border-line">
                          <td className="py-1 pr-4 text-ink">{row.name}</td>
                          <td className="py-1 text-center text-ink-muted">
                            {row.conf ? '自信' : '—'}
                          </td>
                          <td className="py-1 text-right text-ink-muted">
                            {row.others.join('、') || '—'}
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
            name="album"
            tone="bg-tag-follow"
            title="第一年个人/团体舞曲、另类通告数值要求"
            hint="带「团体」标签的专辑为团体通告；「—」为原表留空记号（无要求）；合并格表示同档专辑共享同一区间。"
            className="min-[1240px]:col-span-2"
          >
            <div className="mt-2.5 overflow-x-auto">
              <table data-album-table className="w-full min-w-[780px] text-ui-2xs">
                <thead>
                  <tr>
                    {['专辑名称', '类别', '难度', '特殊', '公司', '歌艺', '口才', '动感', '体能', '自信'].map(
                      (label, index) => (
                        <th
                          key={label}
                          className={cn(
                            'border border-line bg-surface-soft px-2 py-1.5 font-semibold text-ink-muted',
                            index === 0 ? 'text-left' : 'text-center',
                          )}
                        >
                          {label}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {ALBUM_ROWS.map((row) => (
                    <tr key={row.name}>
                      <td className="border border-line px-2 py-1.5 text-left align-middle text-ink">
                        {/* 团体专辑靠「团体」小标签区分，不用红字：单元格里同时挂着
                            text-ink 和 text-alert 时 Tailwind 的层内顺序会让 ink 胜出，
                            红字本来就渲染不出来；标签也不受单一文字颜色限制。 */}
                        <span className="flex items-center gap-1.5">
                          <span className={cn('min-w-0', row.group && 'font-semibold')}>{row.name}</span>
                          {row.group && (
                            <span
                              data-album-group-tag
                              className="inline-flex shrink-0 items-center rounded-ui-xs bg-brand-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-brand-strong"
                            >
                              团体
                            </span>
                          )}
                        </span>
                      </td>
                      <AlbumTd cell={row.cat} />
                      <AlbumTd cell={row.diff} />
                      <AlbumTd cell={row.special} />
                      <AlbumTd cell={row.company} />
                      <AlbumTd cell={row.sing} />
                      <AlbumTd cell={row.mouth} />
                      <AlbumTd cell={row.move} colSpan={2} />
                      <AlbumTd cell={row.conf} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            name="penalty"
            tone="bg-alert"
            title="通告数值负面影响"
            hint="接这些类型的通告会压低对应属性，规划艺人属性时尽量避开。"
          >
            <table className="mt-2.5 w-full max-w-[420px] text-ui-2xs">
              <tbody>
                {PENALTY_ROWS.map((row) => (
                  <tr key={row.ability} className="border-t border-line first:border-0">
                    <td className="w-[1%] whitespace-nowrap py-1.5 pr-4 font-semibold text-alert">
                      {row.ability}↓
                    </td>
                    <td className="py-1.5 text-ink-muted">{row.types.join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </NoteCard>

          <NoteCard
            name="schedule"
            tone="bg-growth"
            title="特殊日程的数值影响"
            hint="宣传与旅游日程对属性的增减，↑ 表示提升；「其他」列出同步提升的能力。"
          >
            <div className="mt-2.5 flex flex-col gap-3">
              {SCHEDULE_GROUPS.map((group) => (
                <div key={group.name}>
                  <h3 className="text-ui-2xs font-semibold text-ink-muted">{group.name}</h3>
                  <table className="mt-1 w-full max-w-[460px] text-ui-2xs">
                    <thead>
                      <tr className="text-ink-faint">
                        <th className="py-1 text-left font-normal">日程</th>
                        <th className="py-1 text-center font-normal">自信</th>
                        <th className="py-1 text-center font-normal">名气</th>
                        <th className="py-1 text-right font-normal">其他</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={row.name} className="border-t border-line">
                          <td className="py-1 pr-3 text-ink">{row.name}</td>
                          <td className="py-1 text-center">
                            {row.conf ? <span className="text-growth-strong">↑</span> : '—'}
                          </td>
                          <td className="py-1 text-center">
                            {row.fame ? <span className="text-growth-strong">↑</span> : '—'}
                          </td>
                          <td className="py-1 text-right text-ink-muted">
                            {row.others.join('、') || '—'}
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
            name="leniency"
            tone="bg-tag-talk"
            title="通告放水情况一览"
            hint="「放水」指制作人放宽接演门槛；是否放水取决于好感度等条件，按原表照录。"
          >
            <ul className="mt-2.5 flex flex-col">
              {LENIENCY_ROWS.map((row) => (
                <li
                  key={row.who}
                  className="flex gap-2 border-t border-line py-1.5 text-ui-2xs first:border-0"
                >
                  <span className="w-[44%] shrink-0 font-semibold text-ink">{row.who}</span>
                  <span className="min-w-0 flex-1 text-ink-muted">{row.note}</span>
                </li>
              ))}
            </ul>
          </NoteCard>

          <NoteCard
            name="awards"
            tone="bg-series"
            title="颁奖典礼日程"
            hint="四大奖的举办月份与三年日程，数字为 入围|颁奖（日）。"
          >
            <table className="mt-2.5 w-full max-w-[440px] text-ui-2xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="py-1 text-left font-normal">奖项</th>
                  <th className="py-1 text-left font-normal">月份</th>
                  <th className="py-1 text-right font-normal">第一年</th>
                  <th className="py-1 text-right font-normal">第二年</th>
                  <th className="py-1 text-right font-normal">第三年</th>
                </tr>
              </thead>
              <tbody>
                {AWARD_ROWS.map((row) => (
                  <tr key={row.name} className="border-t border-line">
                    <td className="py-1 pr-3 font-semibold text-ink">{row.name}</td>
                    <td className="py-1 pr-3 text-ink-muted">{row.month}</td>
                    {row.dates.map((date, index) => (
                      <td
                        key={index}
                        className="py-1 text-right tabular-nums text-ink-muted"
                      >
                        {date}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
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
    </NotePage>
  );
}
