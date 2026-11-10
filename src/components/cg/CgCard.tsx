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

/** 一张 CG 卡保持所有卡片等高：图片按比例占位，底部一行固定高。
 *  图片本身是「查看大图」的按钮（整块可点）；编号与「全部」页的分组归属做成图片上
 *  的浮层（不响应点击，pure 指示），这样底部信息栏只放「收集芯片 + 名称 + 攻略入口」，
 *  名称能占满剩余宽度，长名也只优雅省略而不再挤掉。已收集的图恢复彩色即表示已收。 */
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
        {/* 分组归属浮层：只在「全部」页出现，纯指示、不挡点击。 */}
        {group && (
          <span
            data-cg-group-tag
            data-cg-group-name={group.name}
            className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full border border-white/40 bg-black/45 px-1.5 py-0.5 backdrop-blur-sm"
          >
            {group.avatar ? (
              <img
                src={`${import.meta.env.BASE_URL}${group.avatar}`}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-5 w-5 shrink-0 rounded-full border border-white/60 object-cover"
              />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-[10px] font-semibold text-white"
              >
                {group.name.slice(0, 1)}
              </span>
            )}
            <span className="truncate text-[10px] font-medium text-white">{group.name}</span>
          </span>
        )}
        {/* 编号浮层：左下角小徽标，纯指示。 */}
        <span
          data-cg-code
          className="pointer-events-none absolute bottom-2 left-2 z-10 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white"
        >
          {item.code}
        </span>
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
        <span className="min-w-0 flex-1 truncate text-ui-2xs text-ink" title={item.name}>{item.name}</span>
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
