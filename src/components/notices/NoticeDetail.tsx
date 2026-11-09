import { useMemo } from 'react';
import type { Notice, NoticeData, NoticeRole } from '../../types/notices';
import {
  gainsFor,
  requirementsFor,
  specialNotes,
  starsOf,
  thresholdsFor,
} from '../../lib/notices';
import { cn } from '../../lib/cn';
import Stars from './Stars';
import { CATEGORY_STYLE } from './categoryStyle';

interface Props {
  data: NoticeData;
  notice: Notice | null;
  onClose?: () => void;
}

function MetaRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-ui-2xs leading-[1.9]">
      <span className="w-[52px] shrink-0 text-ink-faint">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink">{value}</span>
    </div>
  );
}

/** 一个角色：难度、能力要求区间、特殊要求、每日能力影响。角色表里的简介只在
 *  有内容时展开，避免详情面板被大段剧本占满。 */
function RoleBlock({
  data,
  notice,
  role,
}: {
  data: NoticeData;
  notice: Notice;
  role: NoticeRole;
}) {
  const stars = starsOf(role);
  const requirements = useMemo(() => requirementsFor(data, notice, role), [data, notice, role]);
  const effects = specialNotes(data, role);
  const thresholds = thresholdsFor(role);
  const gains = gainsFor(data, notice, role);
  const gainEntries = Object.entries(gains).filter(([, value]) => value !== 0);

  return (
    <li data-notice-role className="rounded-ui-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-ui-sm font-semibold text-ink">{role.name}</span>
        <Stars value={stars} />
        {role.defaultArtist && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-ui-2xs text-brand-strong">
            默认 {role.defaultArtist}
          </span>
        )}
      </div>

      {requirements.length > 0 ? (
        <div className="mt-2">
          <div className="text-ui-2xs text-ink-faint">能力要求 · {stars} 星</div>
          <div className="mt-1 grid max-w-[460px] grid-cols-2 gap-x-3 gap-y-1 nav:grid-cols-1">
            {requirements.map((row) => (
              <div key={row.ability} className="flex items-baseline gap-1.5 text-ui-2xs">
                <span className="text-ink-muted">{row.ability}</span>
                <span className="font-semibold text-brand-strong">{row.grade}</span>
                <span className="tabular-nums text-ink">{row.range}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-ui-2xs text-ink-faint">这类通告在表里没有能力等级对照。</p>
      )}

      {(thresholds.length > 0 || effects.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-notice-special>
          <span className="text-ui-2xs text-ink-faint">特殊要求</span>
          {thresholds.map((item) => (
            <span
              key={item.label}
              data-notice-chip="threshold"
              className="rounded-ui-xs bg-gold-soft px-1.5 py-0.5 text-ui-2xs text-gold"
              title="接这个角色需要的最低属性"
            >
              {item.label} ≥ {item.value}
            </span>
          ))}
          {effects.map((effect) => (
            <span
              key={effect.kind}
              data-notice-chip="effect"
              className="rounded-ui-xs border border-line-strong bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-muted"
              title={
                effect.text
                  ? `特殊要求「${effect.kind}」每天的能力增减`
                  : `特殊要求「${effect.kind}」，不增减亲和／叛逆／性感`
              }
            >
              {effect.text ? `${effect.kind} · ${effect.text}` : effect.kind}
            </span>
          ))}
        </div>
      )}

      {gainEntries.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-ui-2xs text-ink-faint">每日影响</span>
          {gainEntries.map(([ability, value]) => (
            <span
              key={ability}
              className={cn(
                'rounded-full px-1.5 py-px text-ui-2xs tabular-nums',
                value > 0 ? 'bg-growth-soft text-growth-strong' : 'bg-missing-soft text-missing',
              )}
            >
              {ability} {value > 0 ? '+' : ''}
              {value}
            </span>
          ))}
        </div>
      )}

      {role.brief && (
        <p className="mt-2 border-t border-line pt-2 text-ui-2xs leading-[1.8] text-ink-muted">
          {role.brief}
        </p>
      )}
    </li>
  );
}

export default function NoticeDetail({ data, notice, onClose }: Props) {
  if (!notice) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-ui-sm font-semibold text-ink-muted">选一条通告查看详情</p>
        <p className="text-ui-2xs leading-[1.8] text-ink-faint">
          左侧列表点任意一张卡片，这里会列出它的角色、能力要求、特殊要求与每日影响。
        </p>
      </div>
    );
  }

  const style = CATEGORY_STYLE[notice.cat];
  return (
    <div data-notice-detail className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-ui-2xs font-semibold', style.pill)}>
              {style.label}
            </span>
            <span className="text-ui-2xs tabular-nums text-ink-faint">{notice.id}</span>
            {notice.exclusive && (
              <span className="rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs text-gold">
                独家代理
              </span>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="关闭详情"
              className="shrink-0 rounded-full border border-line px-2 py-0.5 text-ui-2xs text-ink-muted transition-colors hover:border-brand-line hover:text-brand-strong"
            >
              关闭
            </button>
          )}
        </div>
        <h2 className="mt-1.5 text-ui-xl font-bold leading-tight text-ink">{notice.name}</h2>
        {notice.kindLabel && (
          <p className="text-ui-2xs text-ink-faint">{notice.kindLabel}</p>
        )}
        <div className="mt-2">
          <MetaRow label="类型" value={notice.type ?? notice.level} />
          <MetaRow label="系列" value={notice.series} />
          <MetaRow label="品类" value={notice.adType} />
          <MetaRow label="时间" value={notice.time} />
          <MetaRow label="公司" value={notice.company} />
          <MetaRow label="制作人" value={notice.producer} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">
        {notice.brief && (
          <section className="mb-4">
            <h3 className="mb-1 text-ui-2xs font-semibold text-ink-faint">简介</h3>
            <p className="text-ui-xs leading-[1.9] text-ink-muted">{notice.brief}</p>
          </section>
        )}

        <section>
          <h3 className="mb-2 flex items-baseline gap-2 text-ui-2xs font-semibold text-ink-faint">
            角色
            <span className="tabular-nums">{(notice.roles ?? []).length}</span>
          </h3>
          <ul className="flex flex-col gap-2">
            {(notice.roles ?? []).map((role, index) => (
              <RoleBlock
                key={`${role.id ?? role.name}-${index}`}
                data={data}
                notice={notice}
                role={role}
              />
            ))}
          </ul>
        </section>

        <p className="mt-4 text-ui-2xs leading-[1.8] text-ink-faint">
          能力要求来自「难度对照表」：等级字母 × 星数换算成具体区间，S/L 会在区间内随机。
        </p>
      </div>
    </div>
  );
}
