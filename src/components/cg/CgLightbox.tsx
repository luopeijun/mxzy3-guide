import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import SmartImage from '../../ui/SmartImage';
import { IconChevronLeft, IconChevronRight } from '../icons';
import type { CgItem } from '../../types/cg';

interface Props {
  item: CgItem;
  groupName: string;
  collected: boolean;
  position: number;
  total: number;
  hasPrev: boolean;
  hasNext: boolean;
  /** 有对应攻略事件时的深链；没有就不渲染这个入口。 */
  guideHref?: string;
  /** 站点配置：甜蜜乐章只有编号，不显示名称与「获得条件」那一行。 */
  showName?: boolean;
  showCondition?: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onClose: () => void;
}

/** 全屏看图：盖住顶栏，Esc 关闭、←/→ 翻页、打开时锁滚动、关闭后焦点由调用方
 *  还回原来那张卡。灯箱里的图一律全彩——收集只记状态，不解锁内容。
 *  收集按钮自己立刻变「已收集」，因为点亮动画发生在被遮住的网格上，看不见。 */
export default function CgLightbox({
  item, groupName, collected, position, total,
  hasPrev, hasNext, guideHref, showName = true, showCondition = true,
  onPrev, onNext, onToggle, onClose,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const label = [item.code, item.name].filter(Boolean).join(' ');
  /** 先显示已经缓存的缩略图，原图在后台加载完再叠上去，
   *  避免点开大图盯着空黑屏等一两秒。 */
  const originalSrc = item.image ? `${import.meta.env.BASE_URL}${item.image}` : '';
  const [fullReady, setFullReady] = useState(false);

  useEffect(() => {
    setFullReady(false);
    if (!originalSrc) return;
    const pre = new Image();
    pre.onload = () => setFullReady(true);
    pre.src = originalSrc;
    if (pre.complete && pre.naturalWidth > 0) setFullReady(true);
    return () => { pre.onload = null; };
  }, [originalSrc]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      } else if (event.key === 'ArrowLeft' && hasPrev) {
        event.preventDefault();
        onPrev();
      } else if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  const arrowClass = 'absolute top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/45 text-white transition-colors hover:bg-black/70 disabled:opacity-30';

  return (
    <div
      data-cg-lightbox
      data-cg-lightbox-id={item.id}
      role="dialog"
      aria-modal="true"
      aria-label={`${label} 大图`}
      className="fixed inset-0 z-50 flex flex-col bg-black/85 text-white"
    >
      <div className="flex shrink-0 items-center gap-3 px-5 py-3 text-ui-xs text-white/70">
        <span data-cg-lightbox-group>{groupName}</span>
        <span className="tabular-nums" data-cg-lightbox-position>{position} / {total}</span>
        <button
          ref={closeRef}
          type="button"
          data-cg-lightbox-close
          onClick={onClose}
          className="ml-auto rounded-full border border-white/30 px-3 py-1 text-ui-2xs text-white hover:bg-white/15"
        >
          关闭 ×
        </button>
      </div>

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-16 tab:px-12 phone:px-3"
        onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      >
        {item.image ? (
          <div
            className="relative flex h-full w-full items-center justify-center"
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
          >
            <SmartImage
              key={item.id}
              src={item.image}
              priority
              data-cg-lightbox-image
              alt={label}
              className="max-h-full max-w-full rounded-ui-sm object-contain shadow-2xl"
            />
            {fullReady && (
              <img
                data-cg-lightbox-full
                src={originalSrc}
                alt=""
                aria-hidden="true"
                className="cg-fade-in pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 rounded-ui-sm object-contain"
              />
            )}
          </div>
        ) : (
          <div className="rounded-ui-md border border-dashed border-white/30 px-10 py-12 text-center text-ui-sm text-white/60">
            站点未提供图片
          </div>
        )}
        <button
          type="button"
          data-cg-lightbox-prev
          aria-label="上一张"
          disabled={!hasPrev}
          onClick={onPrev}
          className={cn(arrowClass, 'left-3 phone:left-1')}
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          data-cg-lightbox-next
          aria-label="下一张"
          disabled={!hasNext}
          onClick={onNext}
          className={cn(arrowClass, 'right-3 phone:right-1')}
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="shrink-0 border-t border-white/15 px-6 py-4">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              {showName && item.name && (
                <span className="text-ui-xs font-semibold text-brand-line">{item.code}</span>
              )}
              {/* 甜站的名称来自「对应攻略事件」，没映射的 CG 名称是空的：
                 那样就把编号当标题，别留一片空白。 */}
              <h2 className="text-ui-sm font-semibold" data-cg-lightbox-title>
                {showName && item.name ? item.name : item.code}
              </h2>
            </div>
            {/* 说明文字只在这里出现，完整保留；极长的条件最多占 7 行，
                再长就在这一块内部滚动，不会把大图挤没。 */}
            {showCondition && (
              <div className="mt-2 flex items-start gap-2">
                <span className="shrink-0 pt-0.5 text-ui-2xs text-white/50">获得条件</span>
                <p
                  data-cg-lightbox-condition
                  className="cg-condition-scroll max-h-28 min-w-0 flex-1 overflow-y-auto text-ui-xs leading-relaxed text-white/80"
                >
                  {item.condition || '—'}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {guideHref && (
              <a
                data-cg-lightbox-guide
                href={guideHref}
                className="rounded-full border border-white/40 px-4 py-1.5 text-ui-2xs font-semibold text-white transition-colors hover:bg-white/15"
              >
                看攻略 ↗
              </a>
            )}
            <button
              type="button"
              data-cg-lightbox-toggle
              aria-pressed={collected}
              onClick={onToggle}
              className={cn(
                'shrink-0 rounded-full border px-4 py-1.5 text-ui-2xs font-semibold transition-colors',
                collected
                  ? 'border-brand-line bg-brand text-white'
                  : 'border-white/40 text-white hover:bg-white/15',
              )}
            >
              {collected ? '✓ 已收集' : '标记已收集'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
