import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

const BASE = import.meta.env.BASE_URL;

/** 调用方偶尔已经拼过 BASE_URL（例如顶栏 logo），别再拼一次变成 ././*. */
function resolve(path: string): string {
  return /^(https?:|\/|data:|blob:)/.test(path) || path.startsWith(BASE)
    ? path
    : `${BASE}${path}`;
}

/** 原图路径 -> 缩略图路径，与 scripts/build_image_thumbs.py 的镜像目录一一对应。
 *  非 images/ 下的图（如站点 logo）没有缩略图，调用方传 thumb={false} 即可。 */
export function thumbSrc(src: string): string {
  const dot = src.lastIndexOf('.');
  const stem = dot > src.lastIndexOf('/') ? src.slice(0, dot) : src;
  return `${stem.replace(/^images\//, 'images/thumbs/')}.webp`;
}

type NativeImgProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src' | 'loading' | 'decoding' | 'fetchPriority'
>;

interface Props extends NativeImgProps {
  /** 相对 public 的路径，如 images/cg/chen-6.webp。 */
  src: string;
  /** 默认走缩略图；看大图的灯箱要传 false 用原图。 */
  thumb?: boolean;
  /** 首屏要立刻出来的图：eager + high priority，其余一律 lazy。 */
  priority?: boolean;
  /** 加载期间显示骨架占位（要求父容器是 relative，如 CG 卡片的图片框）。 */
  skeleton?: boolean;
  /** 文档流里的大图没有固定高度时，加载期间用这个宽高比撑出占位。 */
  aspect?: number;
}

/** 全站统一的图片：小尺寸展示走缩略图、按需加载、加载完淡入、失败自动退回原图。
 *
 *  缩略图是构建时生成的（卡片 560px、头像 128px、封面 800px），体积只有原图的
 *  几分之一；原图保留给灯箱。GitHub Pages 这种高延迟链路上，这一层比任何动画都管用。
 *  骨架只解决「等待时别是一片空白」，不额外发请求，也不会改变布局尺寸。 */
export default function SmartImage({
  src, thumb = true, priority = false, skeleton = false, aspect,
  className, style, alt, onLoad, onError, ...rest
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  /** 骨架只在快进入视口时才渲染：一页几十张卡片，别让视口外的扫光动画
   *  在后台空跑（原生 lazy 图片本来就不会发请求）。 */
  const [nearViewport, setNearViewport] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setLoaded(false);
    setFallback(false);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    if (!skeleton) return;
    const el = imgRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setNearViewport(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        io.disconnect();
      }
    }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [skeleton, src]);

  const target = thumb && !fallback ? thumbSrc(src) : src;
  const state = failed ? 'error' : loaded ? 'loaded' : 'loading';

  return (
    <>
      {skeleton && nearViewport && state !== 'loaded' && (
        <span
          data-image-skeleton
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden bg-surface-soft"
        >
          {state === 'error' ? (
            <span className="relative text-ui-2xs text-ink-faint">图片加载失败</span>
          ) : (
            <>
              <span className="image-shimmer absolute inset-0" />
              <svg viewBox="0 0 24 24" className="relative h-6 w-6 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="8.5" cy="9.5" r="1.5" />
                <path d="m4 17 5-4 3.5 3 3-2.5 4.5 3.5" strokeLinejoin="round" />
              </svg>
            </>
          )}
        </span>
      )}
      <img
        {...rest}
        ref={imgRef}
        src={resolve(target)}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        data-image-state={state}
        data-image-src={target}
        onLoad={(event) => { setLoaded(true); onLoad?.(event); }}
        onError={(event) => {
          // 缩略图丢失（旧缓存、手动删图、测试里的假路径）→ 静默退回原图。
          if (thumb && !fallback) {
            setFallback(true);
            setLoaded(false);
            return;
          }
          setFailed(true);
          onError?.(event);
        }}
        style={aspect && state !== 'loaded' ? { aspectRatio: String(aspect), ...style } : style}
        className={cn(
          'bg-surface-soft',
          skeleton && 'transition-opacity duration-300',
          skeleton && (state === 'loaded' ? 'opacity-100' : 'opacity-0'),
          className,
        )}
      />
    </>
  );
}
