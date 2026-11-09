import type { Notice } from '../../types/notices';
import { difficultyRange, starsOf } from '../../lib/notices';
import { cn } from '../../lib/cn';
import Stars from './Stars';
import { CATEGORY_STYLE } from './categoryStyle';

interface Props {
  notice: Notice;
  active: boolean;
  onSelect: () => void;
}

/** 一条通告的摘要卡：分类色标 + 名称 + 元信息 + 简介 + 角色难度。 */
export default function NoticeCard({ notice, active, onSelect }: Props) {
  const style = CATEGORY_STYLE[notice.cat];
  const range = difficultyRange(notice);
  const meta = [notice.type ?? notice.level, notice.kindLabel, notice.time, notice.company]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      data-notice-card
      data-notice-id={notice.id}
      aria-current={active ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'group relative flex w-full flex-col rounded-ui-md border bg-surface p-4 text-left shadow-soft transition duration-150 hover:-translate-y-0.5 hover:border-brand-line hover:shadow-card',
        active ? 'border-brand ring-1 ring-brand-line' : 'border-line',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-ui-2xs font-semibold', style.pill)}>
            {style.label}
          </span>
          <span className="text-ui-2xs tabular-nums text-ink-faint">{notice.id}</span>
          {notice.exclusive && (
            <span className="rounded-full bg-gold-soft px-1.5 py-0.5 text-ui-2xs text-gold">
              独家
            </span>
          )}
        </div>
        {range && (
          <span className="shrink-0">
            <Stars value={range[1]} />
          </span>
        )}
      </div>

      <h3 className="mt-1.5 text-ui-md font-bold leading-snug text-ink group-hover:text-brand-strong">
        {notice.name}
      </h3>
      <p className="mt-0.5 text-ui-2xs text-ink-faint">{meta}</p>

      {notice.brief && (
        <p className="mt-2 line-clamp-2 text-ui-xs leading-[1.8] text-ink-muted">{notice.brief}</p>
      )}

      {(notice.roles ?? []).length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {(notice.roles ?? []).map((role, index) => (
            <span
              key={`${role.id ?? role.name}-${index}`}
              className="inline-flex items-center gap-1 rounded-ui-xs border border-line bg-surface-soft px-1.5 py-0.5 text-ui-2xs text-ink-muted"
            >
              {role.name}
              {role.difficulty !== undefined && (
                <span className="tabular-nums text-gold">{starsOf(role)}★</span>
              )}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
