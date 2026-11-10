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

/** 一张 CG 卡保持所有卡片等高：图片按比例占位，底部信息栏固定两行。
 *  第一行（小字 meta）：归属 tag + 编号 + 攻略入口；
 *  第二行（主角）：CG 名称独占整行宽度（最多两行，不再被挤掉），右侧放收集按钮。
 *  图片本身是「查看大图」的按钮，整块可点，不叠任何收集控件，避免误触。 */
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
      {/* 第一行：归属 tag + 编号（左） · 攻略入口（右），都是小字 meta。 */}
      <div className="flex h-5 min-w-0 items-center gap-2 px-2.5 pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {group && (
            <span
              data-cg-group-tag
              data-cg-group-name={group.name}
              className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-surface-soft py-0.5 pl-0.5 pr-1.5"
            >
              {group.avatar ? (
                <img
                  src={`${import.meta.env.BASE_URL}${group.avatar}`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className="h-4 w-4 shrink-0 rounded-full border border-line-strong object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line-strong bg-brand-soft text-ui-2xs font-semibold text-brand-strong"
                >
                  {group.name.slice(0, 1)}
                </span>
              )}
              <span className="truncate text-ui-2xs font-medium text-ink">{group.name}</span>
            </span>
          )}
          <span data-cg-code className="shrink-0 text-ui-2xs font-semibold text-brand-strong">{item.code}</span>
        </div>
        {guideHref && (
          <a
            data-cg-guide-link
            href={guideHref}
            title={guideTitle ?? '查看对应攻略事件'}
            className="shrink-0 rounded-full px-1.5 py-0.5 text-ui-2xs leading-none text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong"
          >
            攻略<span aria-hidden className="ml-0.5">›</span>
          </a>
        )}
      </div>
      {/* 第二行：名称独占主角位（放大、最多两行）+ 收集按钮，两者垂直居中。固定高度保住等高。 */}
      <div className="flex h-[44px] items-center justify-between gap-2 px-2.5 pb-1.5">
        <span
          className="min-w-0 flex-1 overflow-hidden text-[15px] font-semibold leading-snug text-ink line-clamp-2"
          title={item.name}
        >
          {item.name}
        </span>
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-ui-2xs font-medium leading-none transition-colors',
            collected
              ? 'bg-brand text-white'
              : 'border border-ink-faint text-ink-muted hover:border-brand hover:text-brand-strong',
          )}
        >
          <span aria-hidden className="text-[11px] leading-none">{collected ? '✓' : '○'}</span>
          {collected ? '已收集' : '收集'}
        </button>
      </div>
    </article>
  );
}
