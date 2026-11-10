import { cn } from '../../lib/cn';
import type { CgItem } from '../../types/cg';

interface Props {
  item: CgItem;
  collected: boolean;
  /** 「全部」页各人物的 CG 混在一起，用一张头像徽标标明归属；分组页不传。 */
  group?: { name: string; avatar?: string };
  /** 有对应攻略事件时给出深链（`#/guide/<nodeId>~<anchor>`），否则不渲染入口。 */
  guideHref?: string;
  guideTitle?: string;
  onToggle: () => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

/** 一张 CG 卡只放编号和名字，保持一行、所有卡片等高；获得条件之类的说明
 *  全放在详情页（灯箱）里，网格里不再挤长文本。
 *  图片本身是「查看大图」的按钮，整块可点；收集开关放在底部信息栏里，**不再浮在
 *  图片上**，这样点图片永远只是看大图、不会再误触到收集圆点。已收集与否完全由底部
 *  信息栏的「✓ 已收集 / ○ 收集」芯片表达（已收的图同时转为彩色），整面墙保持干净。 */
export default function CgCard({ item, collected, group, guideHref, guideTitle, onToggle, onOpen }: Props) {
  return (
    <article
      id={`cg-card-${item.id}`}
      data-cg-card
      data-cg-id={item.id}
      data-cg-collected={collected ? 'true' : 'false'}
      className={cn(
        'scroll-mt-[88px] overflow-hidden rounded-ui-md border bg-surface transition-all duration-200 hover:border-brand-line',
        collected ? 'border-brand-line shadow-soft' : 'border-line',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
        <button
          type="button"
          data-cg-open
          aria-label={`查看大图 ${item.code} ${item.name}`}
          title="查看大图"
          onClick={(event) => onOpen(event.currentTarget)}
          className="absolute inset-0 z-0 block h-full w-full cursor-pointer"
        >
          {item.image ? (
            <img
              src={`${import.meta.env.BASE_URL}${item.image}`}
              alt={`${item.code} ${item.name}`}
              loading="lazy"
              decoding="async"
              className={cn(
                'h-full w-full object-cover transition-all duration-200',
                !collected && 'grayscale',
              )}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center px-2 text-center text-ui-2xs text-ink-faint">
              站点未提供图片
            </span>
          )}
        </button>
      </div>
      {/* 固定行高：有「攻略」入口的卡片不能被这一行撑高，否则整面墙高低不齐。 */}
      <div className="flex h-10 min-w-0 items-center gap-1.5 px-2.5">
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-ui-2xs font-medium leading-none transition-colors',
            collected
              ? 'bg-brand text-white'
              : 'border border-ink-faint text-ink-muted hover:border-brand hover:text-brand-strong',
          )}
        >
          <span aria-hidden className="text-[11px] leading-none">{collected ? '✓' : '○'}</span>
          {collected ? '已收集' : '收集'}
        </button>
        {group && (
          <span
            data-cg-group-tag
            data-cg-group-name={group.name}
            className="pointer-events-none inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-soft py-0.5 pl-0.5 pr-2"
          >
            {group.avatar ? (
              <img
                src={`${import.meta.env.BASE_URL}${group.avatar}`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-5 w-5 shrink-0 rounded-full border border-line-strong object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong bg-brand-soft text-ui-2xs font-semibold text-brand-strong"
              >
                {group.name.slice(0, 1)}
              </span>
            )}
            <span className="truncate text-ui-2xs font-medium text-ink">{group.name}</span>
          </span>
        )}
        <span className="shrink-0 text-ui-2xs font-semibold text-brand-strong">{item.code}</span>
        <span className="truncate text-ui-2xs text-ink" title={item.name}>{item.name}</span>
        {guideHref && (
          <a
            data-cg-guide-link
            href={guideHref}
            title={guideTitle ?? '查看对应攻略事件'}
            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-ui-2xs leading-none text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
          >
            攻略<span aria-hidden className="ml-0.5">›</span>
          </a>
        )}
      </div>
    </article>
  );
}
