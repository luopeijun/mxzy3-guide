import { useMemo } from 'react';
import type { Notice, NoticeData, NoticeRole } from '../../types/notices';
import {
  EXCLUSIVE_HINT,
  difficultyRange,
  gainsFor,
  requirementsFor,
  specialNotes,
  starsOf,
  thresholdsFor,
} from '../../lib/notices';
import { cn } from '../../lib/cn';
import StarBadge from './StarBadge';
import { CATEGORY_STYLE } from './categoryStyle';
import { companyDot, timeText } from './infoStyle';
import { specialStyle } from './specialStyle';

interface Props {
  data: NoticeData;
  notice: Notice | null;
  onClose?: () => void;
}

function MetaRow({
  label,
  value,
  valueClass,
  dotClass,
}: {
  label: string;
  value?: string;
  valueClass?: string;
  dotClass?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-ui-2xs leading-[1.9]">
      <span className="w-[52px] shrink-0 text-ink-faint">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {dotClass && (
          <span
            className={cn('h-1.5 w-1.5 shrink-0 rounded-full', dotClass)}
            title={`公司色标：${value}`}
          />
        )}
        <span className={cn('min-w-0 break-words', valueClass ?? 'text-ink')}>{value}</span>
      </span>
    </div>
  );
}

/** 一个角色：难度、能力要求（接演条件）、特殊要求（门槛与标签），以及拍摄期间
 *  每天结算的能力影响。角色表里的简介只在有内容时展开，避免详情面板被大段剧本占满。 */
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
  const notes = specialNotes(data, role);
  const thresholds = thresholdsFor(role);
  const gains = gainsFor(data, notice, role);
  const gainEntries = Object.entries(gains).filter(([, value]) => value !== 0);
  // 只有带数值的特殊要求才进「每天影响」，没有数值的（目前只有「吻戏」）
  // 只作为接演条件留在上面一行，不占每日增减的位置。
  const dailyNotes = notes.filter((note) => note.deltas.length > 0);

  return (
    <li data-notice-role className="rounded-ui-md border border-line bg-surface p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-ui-sm font-semibold text-ink">{role.name}</span>
        <span className="text-ui-xs font-semibold tabular-nums text-gold">{stars}★</span>
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

      {(thresholds.length > 0 || notes.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" data-notice-special>
          <span className="text-ui-2xs text-ink-faint">特殊要求</span>
          {thresholds.map((item) => (
            <span
              key={item.label}
              data-notice-chip="threshold"
              className="rounded-full bg-line/70 px-2 py-0.5 text-ui-2xs tabular-nums text-ink-muted"
              title="接这个角色需要的最低属性"
            >
              {item.label} ≥ {item.value}
            </span>
          ))}
          {notes.map((note) => {
            const tone = specialStyle(note.kind);
            return (
              <span
                key={note.kind}
                data-notice-chip="tag"
                data-notice-kind={note.kind}
                className={cn(
                  'inline-flex items-center gap-1 rounded-ui-xs border px-1.5 py-0.5 text-ui-2xs font-semibold',
                  tone.chip,
                )}
                title={
                  note.deltas.length
                    ? `「${note.kind}」每天对${note.deltas.map((item) => item.label).join('、')}造成增减，见下方每天影响`
                    : `「${note.kind}」，不增减亲和／叛逆／性感`
                }
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', tone.dot)} aria-hidden="true" />
                {note.kind}
              </span>
            );
          })}
        </div>
      )}

      {(gainEntries.length > 0 || dailyNotes.length > 0) && (
        <div data-notice-daily className="mt-2 rounded-ui-sm bg-surface-soft px-2.5 py-2">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="text-ui-2xs font-semibold text-ink-muted">每天影响</span>
            <span className="text-ui-2xs text-ink-faint">拍摄期间每天结算一次</span>
          </div>
          <div className="mt-1 flex flex-col gap-1">
            {gainEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {gainEntries.map(([ability, value]) => (
                  <span
                    key={ability}
                    data-notice-chip="gain"
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
            {dailyNotes.map((note) => {
              const tone = specialStyle(note.kind);
              return (
                <div
                  key={note.kind}
                  data-notice-daily-special={note.kind}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span className="text-ui-2xs text-ink-faint">特殊要求</span>
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-ui-xs border px-1.5 py-px text-ui-2xs font-semibold',
                      tone.chip,
                    )}
                  >
                    <span
                      className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
                      aria-hidden="true"
                    />
                    {note.kind}
                  </span>
                  {note.deltas.map((item) => (
                    <span
                      key={item.label}
                      className={cn(
                        'rounded-full px-1.5 py-px text-ui-2xs tabular-nums',
                        item.value > 0
                          ? 'bg-growth-soft text-growth-strong'
                          : 'bg-missing-soft text-missing',
                      )}
                    >
                      {item.label} {item.value > 0 ? '+' : ''}
                      {item.value}
                    </span>
                  ))}
                </div>
              );
            })}
          </div>
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
          左侧列表点任意一张卡片，这里会列出它的角色、能力要求、特殊要求与每天影响。
        </p>
      </div>
    );
  }

  const style = CATEGORY_STYLE[notice.cat];
  const range = difficultyRange(notice);
  return (
    <div data-notice-detail className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line px-5 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full px-2 py-0.5 text-ui-2xs font-semibold', style.pill)}>
              {style.label}
            </span>
            <span className="text-ui-2xs tabular-nums text-ink-faint">{notice.id}</span>
            {range && <StarBadge value={range} size="md" />}
            {notice.exclusive && (
              <span
                className="rounded-full bg-gold-soft px-2 py-0.5 text-ui-2xs text-gold"
                title={`独家代理：${EXCLUSIVE_HINT}`}
              >
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
          <MetaRow label="时间" value={notice.time} valueClass={timeText(notice.time)} />
          <MetaRow label="公司" value={notice.company} dotClass={companyDot(notice.company)} />
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
          能力要求由「难度对照表」按 等级字母 × 星数 换算，S/L 会在区间内随机。
          「每天影响」指拍摄期间每天结算一次：拍多少天就结算多少次；特殊要求自带的增减也按同样方式每天结算。
        </p>
      </div>
    </div>
  );
}
