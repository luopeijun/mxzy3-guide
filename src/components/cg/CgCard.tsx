import { cn } from '../../lib/cn';
import type { CgItem } from '../../types/cg';

interface Props {
  item: CgItem;
  collected: boolean;
  /** 「全部」页各人物的 CG 混在一起，用左上角头像徽标标明归属；分组页不传。 */
  group?: { name: string; avatar?: string };
  /** 有对应攻略事件时给出深链（`#/guide/<nodeId>~<anchor>`），否则不渲染入口。 */
  guideHref?: string;
  guideTitle?: string;
  onToggle: () => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

/** 一张 CG 卡：图片占主体，左上角浮一个归属标签（头像+名称，纯展示、不挡点击）；
 *  底部一行只放收集芯片 + 序号 + 名称 + 攻略入口，所有卡片等高。
 *  名称用 truncate 兜底（窄屏不溢出），网格最小卡宽（CgApp 里的 380px）按
 *  「最长 12 字名称(14px) + 全部固定元素（不含图上 tag）」算出来，桌面宽度下保证一行看完所有元素。
 *  图片本身是「查看大图」按钮，整块可点，图上 tag 是 pointer-events-none 不误触。 */
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
        {/* 归属标签浮在图片左上角，纯展示不挡点击（分组页不传 group，故不显示）。 */}
        {group && (
          <span
            data-cg-group-tag
            data-cg-group-name={group.name}
            className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full bg-white/80 py-0.5 pl-0.5 pr-2 shadow-soft backdrop-blur-sm"
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
      </div>
      {/* 固定行高 + 顶部细线：底栏成为一条干净的横向信息条，和图片分隔开；
          高度固定（h-14）让 14px 文字有呼吸空间，也保住所有卡片等高。 */}
      <div className="flex h-14 min-w-0 items-center gap-1.5 border-t border-line px-2.5">
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[14px] font-medium leading-none transition-colors',
            collected
              ? 'bg-brand text-white'
              : 'border border-ink-faint text-ink-muted hover:border-brand hover:text-brand-strong',
          )}
        >
          <span aria-hidden className="text-[14px] leading-none">{collected ? '✓' : '○'}</span>
          {collected ? '已收集' : '收集'}
        </button>
        <span className="shrink-0 text-[14px] font-semibold text-brand-strong">{item.code}</span>
        <span data-cg-name className="min-w-0 truncate text-[14px] font-medium text-ink" title={item.name}>{item.name}</span>
        {guideHref && (
          <a
            data-cg-guide-link
            href={guideHref}
            title={guideTitle ?? '查看对应攻略事件'}
            className="ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-[14px] leading-none text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
          >
            攻略<span aria-hidden className="ml-0.5">›</span>
          </a>
        )}
      </div>
    </article>
  );
}
