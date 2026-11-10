import { cn } from '../../lib/cn';
import type { CgItem } from '../../types/cg';

/** 卡片尺寸档位，由 CgApp 的「大/中/小」开关传入。 */
export type CgCardSize = 'sm' | 'md' | 'lg';

interface Props {
  item: CgItem;
  collected: boolean;
  /** 小档（300px 列宽）整体更紧凑：字号与信息条都缩小、名称单行；中/大档 14px、信息条 56px。 */
  size?: CgCardSize;
  /** 「全部」页各人物的 CG 混在一起，用左上角头像徽标标明归属；分组页不传。 */
  group?: { name: string; avatar?: string };
  /** 有对应攻略事件时给出深链（`#/guide/<nodeId>~<anchor>`），否则不渲染入口。 */
  guideHref?: string;
  guideTitle?: string;
  onToggle: () => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

/** 一张 CG 卡：图片占主体，左上角浮「归属标签 + CG 序号」两个徽标（纯展示、不挡点击）；
 *  底部一行只放收集芯片 + 名称 + 攻略入口，同一尺寸下所有卡片等高。
 *  CG 序号移到图片上后，底栏名称拿到最多横向空间，单行即可完整显示（不再换行）。
 *  中/大档（≥380px 列宽）字号 14px、信息条 56px；小档（300px 列宽）整体缩小：
 *  字号 12px、信息条 44px、收集按钮更小，名称仍是单行（最长 12 字也放得下）。
 *  图片本身是「查看大图」按钮，整块可点，图上徽标是 pointer-events-none 不误触。 */
export default function CgCard({ item, collected, size = 'md', group, guideHref, guideTitle, onToggle, onOpen }: Props) {
  const isSm = size === 'sm';
  const fontPx = isSm ? 'text-[12px]' : 'text-[14px]';
  const btnH = isSm ? 'h-5' : 'h-6';
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
        {/* 左上角浮层：归属标签（仅「全部」页）+ CG 序号，纯展示不挡点击。小档缩一圈。 */}
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex flex-col gap-1">
          {group && (
            <span
              data-cg-group-tag
              data-cg-group-name={group.name}
              className={cn(
                'flex items-center gap-1 rounded-full bg-white/80 py-0.5 pl-0.5 pr-2 shadow-soft backdrop-blur-sm',
                isSm ? 'gap-0.5 pr-1.5' : '',
              )}
            >
              {group.avatar ? (
                <img
                  src={`${import.meta.env.BASE_URL}${group.avatar}`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  decoding="async"
                  className={cn('shrink-0 rounded-full border border-line-strong object-cover', isSm ? 'h-4 w-4' : 'h-5 w-5')}
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-brand-soft font-semibold text-brand-strong',
                    isSm ? 'h-4 w-4 text-[10px]' : 'h-5 w-5 text-ui-2xs',
                  )}
                >
                  {group.name.slice(0, 1)}
                </span>
              )}
              <span className={cn('truncate font-medium text-ink', isSm ? 'text-[11px]' : 'text-ui-2xs')}>{group.name}</span>
            </span>
          )}
          <span
            data-cg-code
            className={cn(
              'w-fit rounded-full bg-white/80 px-1.5 py-0.5 font-semibold text-brand-strong shadow-soft backdrop-blur-sm',
              isSm ? 'text-[10px]' : 'text-[11px]',
            )}
          >
            {item.code}
          </span>
        </div>
      </div>
      {/* 固定行高：底栏与图片之间不画分隔线（图片边缘 + 白底已足够区分）；
          高度固定（中/大档 h-14、小档 h-11）保住同尺寸等高。CG 序号已移到图上，
          所以底栏只剩「收集 + 名称 + 攻略」，名称独占一行完整显示、不再换行。 */}
      <div className={cn('flex min-w-0 items-center gap-1.5 px-2.5', isSm ? 'h-11 gap-1' : 'h-14')}>
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'flex shrink-0 items-center gap-1 rounded-full px-2 font-medium leading-none transition-colors',
            btnH,
            fontPx,
            collected
              ? 'bg-brand text-white'
              : 'border border-ink-faint text-ink-muted hover:border-brand hover:text-brand-strong',
          )}
        >
          <span aria-hidden className={cn('leading-none', fontPx)}>{collected ? '✓' : '○'}</span>
          {collected ? '已收集' : '收集'}
        </button>
        <span
          data-cg-name
          className={cn('min-w-0 truncate font-medium text-ink', fontPx)}
          title={item.name}
        >{item.name}</span>
        {guideHref && (
          <a
            data-cg-guide-link
            href={guideHref}
            title={guideTitle ?? '查看对应攻略事件'}
            className={cn('ml-auto shrink-0 rounded-full px-1.5 py-0.5 leading-none text-ink-faint transition-colors hover:bg-brand-soft hover:text-brand-strong', fontPx)}
          >
            攻略<span aria-hidden className="ml-0.5">›</span>
          </a>
        )}
      </div>
    </article>
  );
}
