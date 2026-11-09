import type { Notice } from '../../types/notices';
import { EXCLUSIVE_HINT, difficultyRange, starsOf } from '../../lib/notices';
import { cn } from '../../lib/cn';
import StarBadge from './StarBadge';
import { CATEGORY_STYLE } from './categoryStyle';

interface Props {
  notice: Notice;
  active: boolean;
  /** 这一页里最高那张卡的高度；为空时按自身内容撑开。 */
  minHeight?: number;
  onSelect: () => void;
}

/** 元信息的一格：上面标签、下面值，类型后面再挂一行小字（剧种细分 / 广告篇名）。 */
function MetaCell({
  field,
  label,
  value,
  sub,
}: {
  field: 'type' | 'time' | 'company';
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div data-notice-meta={field} className="min-w-0 bg-surface-soft px-2 py-1.5">
      <dt className="text-ui-2xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 min-w-0">
        <span className="block truncate text-ui-xs font-semibold text-ink" title={value}>
          {value}
        </span>
        {sub && (
          <span className="mt-0.5 block truncate text-ui-2xs text-ink-faint" title={sub}>
            {sub}
          </span>
        )}
      </dd>
    </div>
  );
}

/** 一条通告的摘要卡。
 *
 *  卡片上真正要回答的是「这条通告是什么、什么时候、哪家公司、多难、还缺谁」，
 *  所以把这五件事排成固定位置：右上角星级徽标、名称、三格元信息、角色行。
 *  简介完整展开不做截断——同页卡片统一高度由 `NoticesApp` 量完最高的一张传进来。 */
export default function NoticeCard({ notice, active, minHeight = 0, onSelect }: Props) {
  const style = CATEGORY_STYLE[notice.cat];
  const range = difficultyRange(notice);
  const roles = notice.roles ?? [];
  const pending = roles.filter((role) => !role.defaultArtist).length;
  // 广告的「类型」是等级（演技B），篇名另挂一行；电视剧则把单本/连续剧挂在下面。
  const typeSub = notice.series ?? notice.kindLabel;

  return (
    <button
      type="button"
      data-notice-card
      data-notice-id={notice.id}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      style={minHeight ? { minHeight } : undefined}
      className={cn(
        'group relative flex w-full flex-col rounded-ui-md border bg-surface p-4 text-left shadow-soft transition duration-150 hover:-translate-y-0.5 hover:border-brand-line hover:shadow-card',
        active ? 'border-brand ring-1 ring-brand-line' : 'border-line',
      )}
    >
      {/* 内容块单独包一层，测量时量它才不会把按钮被拉伸的那部分算进去。 */}
      <div data-notice-card-inner className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-ui-2xs font-semibold', style.pill)}>
              {style.label}
            </span>
            <span className="text-ui-2xs tabular-nums text-ink-faint">{notice.id}</span>
            {notice.exclusive && (
              <span
                className="rounded-full bg-gold-soft px-1.5 py-0.5 text-ui-2xs text-gold"
                title={`独家代理：${EXCLUSIVE_HINT}`}
              >
                独家
              </span>
            )}
          </div>
          {range && <StarBadge value={range} size="lg" />}
        </div>

        <h3 className="mt-2 text-ui-lg font-bold leading-snug text-ink group-hover:text-brand-strong">
          {notice.name}
        </h3>

        <dl className="mt-2.5 grid grid-cols-3 gap-px overflow-hidden rounded-ui-sm border border-line bg-line">
          <MetaCell field="type" label="类型" value={notice.type ?? notice.level ?? '—'} sub={typeSub} />
          <MetaCell field="time" label="时间" value={notice.time ?? '—'} />
          <MetaCell field="company" label="公司" value={notice.company ?? '—'} />
        </dl>

        {notice.brief && (
          <p className="mt-2.5 text-ui-xs leading-[1.8] text-ink-muted">{notice.brief}</p>
        )}

        {roles.length > 0 && (
          <div className="mt-auto pt-3">
            <div className="mb-1.5 flex items-baseline gap-2 text-ui-2xs">
              <span className="text-ink-faint">角色 {roles.length}</span>
              {pending > 0 ? (
                <span data-notice-pending className="font-semibold text-brand-strong">
                  待定 {pending}
                </span>
              ) : (
                <span className="text-growth-strong">已全部指定</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* 同一个征求对象出现两次（特殊要求不同）就老老实实排两个，不并成 ×2。 */}
              {roles.map((role, index) => {
                const defined = Boolean(role.defaultArtist);
                return (
                  <span
                    key={`${role.name}-${index}`}
                    data-notice-role-chip
                    data-role-state={defined ? 'defined' : 'pending'}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-ui-xs border px-1.5 py-0.5 text-ui-2xs',
                      defined
                        ? 'border-brand-line bg-brand-soft text-brand-strong'
                        : 'border-dashed border-line-strong bg-surface-soft text-ink-muted',
                    )}
                  >
                    <span className="font-medium">{role.name}</span>
                    <span className="font-semibold tabular-nums text-gold">{starsOf(role)}★</span>
                    {defined ? (
                      <span className="font-semibold">{role.defaultArtist}</span>
                    ) : (
                      <span className="font-semibold text-missing">待定</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
