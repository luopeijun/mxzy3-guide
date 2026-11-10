import { cn } from '../../lib/cn';
import type { CgItem } from '../../types/cg';

interface Props {
  item: CgItem;
  collected: boolean;
  /** 「全部」页各人物的 CG 混在一起，用一张头像徽标标明归属；分组页不传。 */
  group?: { name: string; avatar?: string };
  onToggle: () => void;
  onOpen: (trigger: HTMLButtonElement) => void;
}

/** 一张 CG 卡只放编号和名字，保持一行、所有卡片等高；获得条件之类的说明
 *  全放在详情页（灯箱）里，网格里不再挤长文本。
 *  图片本身是「查看大图」的按钮，右上角圆勾只管收集状态，两者互不干扰：
 *  没收集的图也能打开看全彩大图，看大图不会偷偷改记录。
 *  未收集只用灰度区分，不再盖面纱或问号，整面墙保持干净。 */
export default function CgCard({ item, collected, group, onToggle, onOpen }: Props) {
  return (
    <article
      data-cg-card
      data-cg-id={item.id}
      data-cg-collected={collected ? 'true' : 'false'}
      className={cn(
        'overflow-hidden rounded-ui-md border bg-surface transition-all duration-200 hover:border-brand-line',
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
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full text-ui-sm ring-2 ring-surface transition-colors',
            collected
              ? 'bg-brand text-white'
              : 'border-2 border-ink-faint bg-surface/95 hover:border-brand',
          )}
        >
          {collected ? '✓' : ''}
        </button>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-2.5 py-2.5">
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
      </div>
    </article>
  );
}
