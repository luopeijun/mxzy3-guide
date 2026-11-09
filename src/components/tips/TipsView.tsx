import { cn } from '../../lib/cn';
import NoteCard from '../NoteCard';
import NotePage, { type NoteSection } from '../NotePage';
import { AWARD_ROWS } from '../notices/referenceTables';
import {
  ARTIST_TITLES,
  BEAUTY_NOTE,
  BEAUTY_ROWS,
  CERT_ROWS,
  CERT_TONE,
  EASYSHOP,
  EVENT_TIPS,
  GROUP_ENDINGS,
  GROUP_NOTE,
  PARTTIME_ROWS,
  PR_NOTE,
  PRODUCER_GROUPS,
  PROP_ROWS,
  TITLE_ATTRS,
  TITLE_COMMON,
  TITLE_NOTE,
  TRAINING_ROWS,
  type ArtistTitle,
} from './tipsData';

/** 右侧「本页小结」的顺序即页面顺序。 */
const SECTIONS: NoteSection[] = [
  { key: 'jobs', label: '培训与打工' },
  { key: 'certs', label: '证书取得' },
  { key: 'producers', label: '制作人擅长方向' },
  { key: 'props', label: '鱼缸与公关' },
  { key: 'beauty', label: '美丽之星' },
  { key: 'awards', label: '颁奖典礼日程' },
  { key: 'titles', label: '艺人称号' },
  { key: 'easyshop', label: 'EasyShop代言' },
  { key: 'events', label: '关键事件提示' },
  { key: 'group', label: '团体结局' },
];

/** 把「类型：制作人」的行拆成「类型」加粗、制作人跟在后的小段。 */
function ProducerLine({ line }: { line: string }) {
  const segments = line.split('；');
  return (
    <div className="flex flex-col gap-0.5 text-ui-2xs leading-[1.7]">
      {segments.map((segment, index) => {
        const split = segment.indexOf('：');
        const genre = split > 0 ? segment.slice(0, split) : segment;
        const rest = split > 0 ? segment.slice(split + 1) : '';
        return (
          <span key={index}>
            <span className="font-semibold text-ink-muted">{genre}：</span>
            <span className="text-ink-muted">{rest}</span>
          </span>
        );
      })}
    </div>
  );
}

/** 攻略内的「小贴士」便签页：与通告能力对照同款卡片，整页铺满正文区。
 *  通过攻略目录「经纪人事件簿 / 小贴士」进入，用普通节点 id 路由。 */
export default function TipsView() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-baseline gap-x-3 gap-y-1 px-6 pt-4 pb-1">
        <h1 className="text-ui-lg font-bold text-brand-strong">小贴士</h1>
        <span className="text-ui-2xs text-ink-faint">培养、比赛与关键事件的速查便签</span>
      </div>

      <NotePage sections={SECTIONS}>
        <NoteCard
          name="jobs"
          tone="bg-tag-news"
          title="培训与打工"
          className="min-[1240px]:col-span-2"
        >
          <div className="mt-3 grid gap-x-10 gap-y-4 min-[900px]:grid-cols-2">
            <div>
              <h3 className="text-ui-2xs font-semibold text-ink-muted">培训</h3>
              <table className="mt-1.5 w-full text-ui-2xs">
                <thead>
                  <tr className="text-ink-faint">
                    <th className="py-1 text-left font-normal">课程</th>
                    <th className="py-1 text-left font-normal">属性一</th>
                    <th className="py-1 text-left font-normal">属性二</th>
                    <th className="py-1 text-left font-normal">证书</th>
                  </tr>
                </thead>
                <tbody>
                  {TRAINING_ROWS.map((row) => (
                    <tr key={row.name} className="border-t border-line">
                      <td className="py-1 pr-4 text-ink">{row.name}</td>
                      <td className="py-1 pr-4 text-ink-muted">{row.a}</td>
                      <td className="py-1 pr-4 text-ink-muted">{row.b}</td>
                      <td className="py-1">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-ui-xs px-1.5 py-0.5 text-[10px] font-semibold',
                            CERT_TONE[row.cert],
                          )}
                        >
                          {row.cert}：{row.grade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="text-ui-2xs font-semibold text-ink-muted">打工</h3>
              <table className="mt-1.5 w-full text-ui-2xs">
                <thead>
                  <tr className="text-ink-faint">
                    <th className="py-1 text-left font-normal">打工</th>
                    <th className="py-1 text-left font-normal">提升属性</th>
                    <th className="py-1 text-right font-normal">名气</th>
                  </tr>
                </thead>
                <tbody>
                  {PARTTIME_ROWS.map((row) => (
                    <tr key={row.name} className="border-t border-line">
                      <td className="py-1 pr-4 text-ink">{row.name}</td>
                      <td className="py-1 pr-4 text-ink-muted">
                        {row.attrs.join('、')}
                        {row.drop && (
                          <span className="font-semibold text-alert">、{row.drop}↓</span>
                        )}
                      </td>
                      <td className="py-1 text-right text-ink-muted">{row.fame || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </NoteCard>

        <NoteCard
          name="certs"
          tone="bg-gold"
          title="证书取得"
        >
          <ul className="mt-2.5 flex flex-col">
            {CERT_ROWS.map((row) => (
              <li
                key={row.name}
                className="flex flex-wrap items-baseline gap-x-2 border-t border-line py-1.5 text-ui-2xs first:border-0"
              >
                <span
                  className={cn(
                    'inline-flex items-center rounded-ui-xs px-1.5 py-0.5 text-[10px] font-semibold',
                    CERT_TONE[row.name],
                  )}
                >
                  {row.name}
                </span>
                <span className="text-ink-muted">
                  {row.need}；{row.course}
                </span>
              </li>
            ))}
          </ul>
        </NoteCard>

        <NoteCard
          name="producers"
          tone="bg-tag-follow"
          title="制作人擅长方向"
          hint="唱片与电视剧制作人各自擅长剧种；带括号的是备注或解锁条件。"
          className="min-[1240px]:col-span-2"
        >
          <div className="mt-3 flex flex-col gap-4">
            {PRODUCER_GROUPS.map((group) => (
              <div key={group.name} className="border-t border-line pt-3 first:border-0 first:pt-0">
                <h3 className="text-ui-2xs font-semibold text-ink-muted">
                  {group.name}
                  {group.sub && (
                    <span className="ml-2 font-normal text-ink-faint">{group.sub}</span>
                  )}
                </h3>
                <div className="mt-1.5 flex flex-col gap-1">
                  {group.lines.map((line, index) => (
                    <ProducerLine key={index} line={line} />
                  ))}
                </div>
                {group.unlock && (
                  <p className="mt-1.5 text-ui-2xs text-ink-faint">{group.unlock}</p>
                )}
              </div>
            ))}
          </div>
        </NoteCard>

        <NoteCard
          name="props"
          tone="bg-growth"
          title="鱼缸与公关"
          hint="布置价格一览；公关提升可改善与所有制作人的关系。"
        >
          <ul className="mt-2.5 flex flex-col">
            {PROP_ROWS.map((row) => (
              <li
                key={row.name}
                className="flex gap-2 border-t border-line py-1.5 text-ui-2xs first:border-0"
              >
                <span className="w-[44%] shrink-0 font-semibold text-ink">{row.name}</span>
                <span className="min-w-0 flex-1 text-ink-muted">{row.items}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">{PR_NOTE}</p>
        </NoteCard>

        <NoteCard
          name="beauty"
          tone="bg-tag-talk"
          title="美丽之星"
          hint={BEAUTY_NOTE}
        >
          <table className="mt-2.5 w-full max-w-[460px] text-ui-2xs">
            <thead>
              <tr className="text-ink-faint">
                <th className="py-1 text-left font-normal">属性</th>
                <th className="py-1 text-center font-normal">第一年</th>
                <th className="py-1 text-center font-normal">第二年</th>
                <th className="py-1 text-center font-normal">第三年</th>
                <th className="py-1 text-left font-normal">备注</th>
              </tr>
            </thead>
            <tbody>
              {BEAUTY_ROWS.map((row) => (
                <tr key={row.attr} className="border-t border-line">
                  <td className="py-1 pr-4 font-semibold text-ink">{row.attr}</td>
                  {row.years.map((value, index) => (
                    <td
                      key={index}
                      className="py-1 text-center tabular-nums text-ink-muted"
                    >
                      {value.replace(/\|/g, ' / ')}
                    </td>
                  ))}
                  <td className="py-1 pl-4 text-ink-faint">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
          name="titles"
          tone="bg-tag-scene"
          title="艺人称号"
          hint="五项称号的属性、得奖与通告要求需同时满足；共同条件见金底一行。"
          className="min-[1240px]:col-span-2"
        >
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-ui-2xs">
              <thead>
                <tr className="text-ink-faint">
                  <th className="py-1 pr-3 text-left font-normal">称号条件</th>
                  {ARTIST_TITLES.map((title) => (
                    <th key={title.name} className="px-2 py-1 text-left font-semibold text-ink">
                      {title.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TITLE_ATTRS.map((attr) => (
                  <tr key={attr} className="border-t border-line">
                    <td className="py-1 pr-3 text-ink-muted">{attr}</td>
                    {ARTIST_TITLES.map((title) => (
                      <td key={title.name} className="px-2 py-1 tabular-nums text-ink">
                        {title.attrs[attr] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-line">
                  <td className="py-1 pr-3 align-middle text-ink-muted">共同</td>
                  <td colSpan={ARTIST_TITLES.length} className="px-2 py-1.5">
                    <span className="inline-flex items-center rounded-ui-xs bg-gold-soft px-1.5 py-0.5 font-semibold text-gold">
                      {TITLE_COMMON}
                    </span>
                  </td>
                </tr>
                {(
                  [
                    { label: '得奖要求', get: (title: ArtistTitle) => title.award },
                    { label: '通告总数', get: (title: ArtistTitle) => title.notices },
                    { label: '通告要求', get: (title: ArtistTitle) => title.noticeReq },
                    { label: '其他', get: (title: ArtistTitle) => title.extra ?? '' },
                  ] as const
                ).map((row) => (
                  <tr key={row.label} className="border-t border-line">
                    <td className="py-1 pr-3 align-top text-ink-muted">{row.label}</td>
                    {ARTIST_TITLES.map((title) => {
                      const value = row.get(title);
                      return (
                        <td
                          key={title.name}
                          className={cn(
                            'px-2 py-1 leading-[1.6]',
                            value ? 'text-ink-muted' : 'text-ink-faint',
                          )}
                        >
                          {value || '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">{TITLE_NOTE}</p>
        </NoteCard>

        <NoteCard
          name="easyshop"
          tone="bg-tag-manual"
          title="EasyShop代言"
          hint="每年举办的代言竞选；下方为该事件的版本限制与当选条件。"
        >
          <p className="mt-2 inline-flex items-center rounded-ui-xs bg-alert-soft px-1.5 py-0.5 text-ui-2xs font-semibold text-alert">
            {EASYSHOP.limit}
          </p>
          <ul className="mt-2.5 flex flex-col">
            {EASYSHOP.lines.map((line, index) => (
              <li
                key={index}
                className="border-t border-line py-1.5 text-ui-2xs first:border-0"
              >
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ui-2xs font-semibold text-ink-muted">{EASYSHOP.ref}</p>
        </NoteCard>

        <NoteCard
          name="events"
          tone="bg-alert"
          title="关键事件提示"
          hint="几个能赚大钱或拿五星奖励的事件，附触发与完成要点。"
          className="min-[1240px]:col-span-2"
        >
          <div className="mt-3 grid gap-x-10 gap-y-4 min-[900px]:grid-cols-2">
            {EVENT_TIPS.map((event) => (
              <div key={event.title} className="border-t border-line pt-3 first:border-0 min-[900px]:first:border-0">
                <h3 className="flex flex-wrap items-center gap-2 text-ui-2xs font-semibold text-ink-muted">
                  {event.title}
                  {event.tag && (
                    <span className="inline-flex items-center rounded-ui-xs bg-alert-soft px-1.5 py-0.5 text-[10px] font-semibold text-alert">
                      {event.tag}
                    </span>
                  )}
                </h3>
                <ul className="mt-1.5 flex flex-col">
                  {event.lines.map((line, index) => (
                    <li
                      key={index}
                      className="border-t border-line py-1.5 text-ui-2xs first:border-0"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </NoteCard>

        <NoteCard
          name="group"
          tone="bg-tag-auto"
          title="团体结局"
          hint="六档团体结局与所需团体奖、团唱、演唱会数量。"
        >
          <table className="mt-2.5 w-full max-w-[460px] text-ui-2xs">
            <thead>
              <tr className="text-ink-faint">
                <th className="py-1 text-left font-normal">结局</th>
                <th className="py-1 text-center font-normal">团体奖</th>
                <th className="py-1 text-center font-normal">团唱</th>
                <th className="py-1 text-center font-normal">演唱会</th>
              </tr>
            </thead>
            <tbody>
              {GROUP_ENDINGS.map((row) => (
                <tr key={row.name} className="border-t border-line">
                  <td className="py-1 pr-4 text-ink">{row.name}</td>
                  <td
                    className={cn(
                      'py-1 text-center tabular-nums',
                      row.award ? 'text-growth-strong' : 'text-ink-faint',
                    )}
                  >
                    {row.award ? '✓' : '—'}
                  </td>
                  <td className="py-1 text-center text-ink-muted">{row.chorus || '—'}</td>
                  <td className="py-1 text-center text-ink-muted">{row.concert || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-ui-2xs leading-[1.7] text-ink-faint">{GROUP_NOTE}</p>
        </NoteCard>
      </NotePage>
    </div>
  );
}
