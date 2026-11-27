import {
  useCallback, useEffect, useLayoutEffect, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode,
} from 'react';
import { cn } from '../lib/cn';

/* NP鸡浮窗外壳：两站共用同一套拖拽、贴边摆放与高度过渡，站点只换头部内容与正文。
 *
 * 面板高度按正文实测值写成 px 并带过渡：两个视图的内容高度常常差一大截，
 * 若让面板自己跟着内容长高，整个面板会「跳」一下（顶栏整块位移）。
 * 高度由 ResizeObserver 量到后延到下一帧再写——同一帧写样式浏览器不给过渡。 */

const ORB_WIDTH = 60;
const ORB_HEIGHT = 54;
const ORB_EDGE = 8;
const PANEL_GAP = 10;
const PANEL_EDGE = 8;
const PANEL_MAX_HEIGHT = 560;
const PANEL_MAX_RATIO = 0.72;
const PANEL_MIN_HEIGHT = 160;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface AssistantDockProps {
  /** 面板无障碍标题，同时用于关闭按钮的 aria-label。 */
  label: string;
  /** 鸡仔右上角的角标，空串则不显示。 */
  badge?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 头部内容（页签、进度等）；关闭按钮由外壳渲染。 */
  header: ReactNode;
  /** 面板关闭（× / Esc / 点外面）之前调用，用来顺手收起浮层。 */
  onClose?: () => void;
  /** 面板正文滚动，浮层要跟着收起。 */
  onPanelScroll?: () => void;
  /** 开始拖动鸡仔，浮层要跟着收起。 */
  onDragStart?: () => void;
  /** 渲染在浮窗根节点里的绝对定位浮层（hover 卡片），点它不算「点外面」。 */
  overlay?: ReactNode;
  children: ReactNode;
}

export default function AssistantDock({
  label, badge, open, onOpenChange, header, onClose, onPanelScroll, onDragStart, overlay, children,
}: AssistantDockProps) {
  const [orbPos, setOrbPos] = useState(() => ({
    x: typeof window === 'undefined'
      ? 0
      : Math.max(ORB_EDGE, window.innerWidth - ORB_WIDTH - (window.innerWidth >= 1120 ? 280 : 20)),
    y: typeof window === 'undefined' ? 0 : Math.max(ORB_EDGE, window.innerHeight - ORB_HEIGHT - 64),
  }));
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(null);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelBodyRef = useRef<HTMLDivElement>(null);
  const panelContentRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const close = useCallback(() => {
    onClose?.();
    onOpenChange(false);
  }, [onClose, onOpenChange]);

  // 视口变化时把鸡仔夹回可见范围。
  useEffect(() => {
    const onResize = () => {
      setOrbPos((current) => ({
        x: clamp(current.x, ORB_EDGE, window.innerWidth - ORB_WIDTH - ORB_EDGE),
        y: clamp(current.y, ORB_EDGE, window.innerHeight - ORB_HEIGHT - ORB_EDGE),
      }));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 浮窗跟着 NP鸡走：左右按 NP鸡在视口的位置选对齐边，上下优先放在空间更大的一侧。
  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      setPanelHeight(null);
      return;
    }
    const measure = () => {
      const panel = panelRef.current;
      const content = panelContentRef.current;
      if (!panel || !content) return null;
      const width = panel.getBoundingClientRect().width;
      const contentHeight = content.offsetHeight + (headRef.current?.offsetHeight ?? 0);
      const above = orbPos.y + ORB_HEIGHT / 2 >= window.innerHeight / 2;
      const space = above
        ? orbPos.y - PANEL_GAP - PANEL_EDGE
        : window.innerHeight - (orbPos.y + ORB_HEIGHT) - PANEL_GAP - PANEL_EDGE;
      const limit = Math.min(PANEL_MAX_HEIGHT, window.innerHeight * PANEL_MAX_RATIO);
      const height = Math.max(
        PANEL_MIN_HEIGHT,
        Math.min(contentHeight, limit, Math.max(PANEL_MIN_HEIGHT, space)),
      );
      const centerX = orbPos.x + ORB_WIDTH / 2;
      let left: number;
      if (centerX < window.innerWidth / 3) left = orbPos.x;
      else if (centerX > window.innerWidth * 2 / 3) left = orbPos.x + ORB_WIDTH - width;
      else left = centerX - width / 2;
      left = clamp(left, PANEL_EDGE, window.innerWidth - width - PANEL_EDGE);
      const top = clamp(
        above ? orbPos.y - PANEL_GAP - height : orbPos.y + ORB_HEIGHT + PANEL_GAP,
        PANEL_EDGE,
        Math.max(PANEL_EDGE, window.innerHeight - height - PANEL_EDGE),
      );
      return { left, top, height };
    };
    const apply = (box: { left: number; top: number; height: number } | null) => {
      if (!box) return;
      setPanelPos((current) => (
        current && current.left === box.left && current.top === box.top
          ? current : { left: box.left, top: box.top }
      ));
      setPanelHeight(box.height);
    };
    apply(measure());
    let frame = 0;
    const queue = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply(measure());
      });
    };
    const observer = new ResizeObserver(queue);
    if (panelContentRef.current) observer.observe(panelContentRef.current);
    if (headRef.current) observer.observe(headRef.current);
    window.addEventListener('resize', queue);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', queue);
    };
  }, [open, orbPos.x, orbPos.y]);

  // 点面板外面或按 Esc 收起。
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const onOrbPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: orbPos.x,
      y: orbPos.y,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const onOrbPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    onDragStart?.();
    setOrbPos({
      x: clamp(drag.x + dx, ORB_EDGE, window.innerWidth - ORB_WIDTH - ORB_EDGE),
      y: clamp(drag.y + dy, ORB_EDGE, window.innerHeight - ORB_HEIGHT - ORB_EDGE),
    });
  };
  const onOrbPointerEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      // 拖动结束后的 click 不应再切换抽屉开合。
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      ref={rootRef}
      data-case-special-assistant
      className="fixed z-30"
      style={{ left: orbPos.x, top: orbPos.y }}
    >
      {open && (
        <section
          ref={panelRef}
          data-case-special-panel
          aria-label={label}
          className={cn(
            'fixed flex w-[min(440px,calc(100vw-40px))] flex-col overflow-hidden rounded-ui-md border border-line-strong bg-canvas shadow-soft',
            panelHeight === null ? 'max-h-[min(72vh,560px)]' : '',
            dragging || panelHeight === null ? '' : 'transition-[height,top] duration-200 ease-out',
          )}
          style={panelPos
            ? {
              left: panelPos.left,
              top: panelPos.top,
              ...(panelHeight === null ? {} : { height: panelHeight }),
            }
            : { left: -9999, top: -9999, visibility: 'hidden' }}
        >
          <div ref={headRef} className="flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
            {header}
            <button
              type="button"
              aria-label={`关闭${label}`}
              onClick={close}
              className="rounded px-1 text-ui-xs text-ink-faint transition-colors hover:bg-surface-soft hover:text-ink"
            >
              ×
            </button>
          </div>

          <div
            ref={panelBodyRef}
            className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
            onScroll={onPanelScroll}
          >
            <div ref={panelContentRef}>{children}</div>
          </div>
        </section>
      )}

      {open && overlay}

      <button
        type="button"
        data-case-special-orb
        aria-label={`拖动或点击${label}`}
        aria-expanded={open}
        draggable={false}
        onPointerDown={onOrbPointerDown}
        onPointerMove={onOrbPointerMove}
        onPointerUp={onOrbPointerEnd}
        onPointerCancel={onOrbPointerEnd}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          onOpenChange(!open);
        }}
        className={cn(
          'relative flex h-[54px] w-[60px] touch-none select-none items-center justify-center',
          dragging ? 'cursor-grabbing' : 'cursor-grab',
          open && 'drop-shadow-[0_2px_5px_rgba(192,48,111,0.35)]',
        )}
      >
        <img
          data-case-mascot
          src={`${import.meta.env.BASE_URL}six-notice-mascot.png`}
          alt=""
          className="h-full w-full object-contain"
          draggable={false}
        />
        {badge && (
          <span className="absolute -right-1 -top-0.5 min-w-[20px] rounded-full border border-brand-line bg-brand-soft px-1 text-center text-[10px] leading-[16px] text-brand-strong">
            {badge}
          </span>
        )}
      </button>
    </div>
  );
}
