import { cn } from '../../lib/cn';
import type { CgItem } from '../../types/cg';

interface Props {
  item: CgItem;
  collected: boolean;
  onToggle: () => void;
}

/** 一张 CG 卡。未收集用「灰 + 提亮 + 面纱 + 问号」，不是压暗：整墙浅色才不会
 *  像图片加载失败，也仍然看得出轮廓方便查漏。已收集恢复全彩并加品牌色边框，
 *  圆勾是唯一的点击目标，点图片本身不会误改记录（灯箱后续再接）。 */
export default function CgCard({ item, collected, onToggle }: Props) {
  return (
    <article
      data-cg-card
      data-cg-id={item.id}
      data-cg-collected={collected ? 'true' : 'false'}
      className={cn(
        'overflow-hidden rounded-ui-md border bg-surface transition-all duration-200',
        collected ? 'border-brand-line shadow-soft' : 'border-line',
      )}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-soft">
        {item.image ? (
          <img
            src={`${import.meta.env.BASE_URL}${item.image}`}
            alt={`${item.code} ${item.name}`}
            loading="lazy"
            decoding="async"
            className={cn(
              'h-full w-full object-cover transition-all duration-200',
              !collected && 'grayscale opacity-85',
            )}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-surface-soft text-ink-faint">
            <span className="text-ui-2xl leading-none" aria-hidden="true">?</span>
            <span className="text-ui-2xs">站点未提供图片</span>
          </div>
        )}
        {item.image && !collected && (
          <>
            <div className="pointer-events-none absolute inset-0 bg-surface/10" />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-line-strong bg-surface/85 text-ui-lg font-semibold text-ink-faint">
                ?
              </span>
            </span>
          </>
        )}
        <button
          type="button"
          data-cg-toggle
          aria-pressed={collected}
          aria-label={`${collected ? '取消收集' : '标记已收集'} ${item.code} ${item.name}`}
          title={collected ? '取消收集' : '标记已收集'}
          onClick={onToggle}
          className={cn(
            'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-ui-sm ring-2 ring-surface transition-colors',
            collected
              ? 'bg-brand text-white'
              : 'border-2 border-ink-faint bg-surface/95 hover:border-brand',
          )}
        >
          {collected ? '✓' : ''}
        </button>
      </div>
      <div className="px-2.5 py-2">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 text-ui-2xs font-semibold text-brand-strong">{item.code}</span>
          <span className="truncate text-ui-2xs text-ink" title={item.name}>{item.name}</span>
        </div>
        <p className="mt-0.5 truncate text-ui-2xs text-ink-faint" title={item.condition}>
          {item.condition || '—'}
        </p>
      </div>
    </article>
  );
}
