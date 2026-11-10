import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { RAIL_MIN_WIDTH, ReaderLayoutContext } from '../hooks/useReaderLayout';

interface Props {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  scrollKey: string;
  onCloseSidebar: () => void;
}

/** The sidebar is drawn over the article below the `nav` breakpoint, so the
 *  first paint can guess the article width instead of flashing the rail. */
function estimateWide(): boolean {
  if (typeof window === 'undefined') return false;
  const sidebar = window.innerWidth > 860 ? 302 : 0;
  return window.innerWidth - sidebar >= RAIL_MIN_WIDTH;
}

export default function AppShell({
  header, sidebar, children, sidebarOpen, scrollKey, onCloseSidebar,
}: Props) {
  const mainRef = useRef<HTMLElement>(null);
  const [wide, setWide] = useState(estimateWide);

  useEffect(() => {
    // 带锚点进来（CG 图鉴点「攻略」反跳）时不要置顶：目标位置由 useAnchorJump
    // 负责滚过去，这里再 scrollTo(0) 会把刚定位好的事件顶出视野。
    if (window.location.hash.includes('~')) return;
    mainRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  // The rail only appears when the article column still has room for it.
  useEffect(() => {
    const element = mainRef.current;
    if (!element) return;
    const measure = (width: number) => setWide(width >= RAIL_MIN_WIDTH);
    measure(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => measure(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scrollToTop = useCallback(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const layout = useMemo(() => ({ mainRef, scrollToTop, wide }), [scrollToTop, wide]);

  return (
    <ReaderLayoutContext.Provider value={layout}>
      <div className="flex h-screen flex-col overflow-hidden">
        {header}
        <div className="relative flex min-h-0 flex-1">
          {sidebar}
          {sidebarOpen && (
            <div
              className="hidden bg-[rgba(60,20,38,0.36)] nav:absolute nav:inset-0 nav:z-[25] nav:block"
              onClick={onCloseSidebar}
              role="presentation"
              aria-hidden="true"
            />
          )}
          <main className="min-w-0 flex-1 overflow-y-auto scroll-smooth" ref={mainRef}>
            {children}
          </main>
        </div>
      </div>
    </ReaderLayoutContext.Provider>
  );
}
