import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** 锚点矩形：hover 卡片优先贴在锚点上方，空间不够再翻到下方，最后夹在视口内。 */
export interface HoverAnchor {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface FloatingCardProps {
  anchor: HoverAnchor;
  onEnter: () => void;
  onLeave: () => void;
  className?: string;
  children: ReactNode;
}

/** 两站共用的 hover 浮层外壳。 */
export default function FloatingCard({
  anchor, onEnter, onLeave, className, children,
}: FloatingCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const padding = 8;
    const gap = 8;
    const maxLeft = Math.max(padding, window.innerWidth - width - padding);
    const left = Math.min(Math.max(padding, anchor.right - width), maxLeft);
    let top = anchor.top - height - gap;
    if (top < padding) top = anchor.bottom + gap;
    if (top + height > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - height - padding);
    }
    setPosition({ left, top });
  }, [anchor.left, anchor.right, anchor.top, anchor.bottom]);

  return (
    <div
      ref={cardRef}
      data-case-special-hover
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        'fixed z-50 max-h-[calc(100vh-16px)] overflow-y-auto rounded-ui-md border border-line-strong bg-canvas shadow-soft',
        className,
      )}
      style={position
        ? { left: position.left, top: position.top }
        : { left: -9999, top: -9999, visibility: 'hidden' }}
    >
      {children}
    </div>
  );
}
