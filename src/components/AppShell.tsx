import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface Props {
  header: ReactNode;
  sidebar: ReactNode;
  children: ReactNode;
  sidebarOpen: boolean;
  scrollKey: string;
  onCloseSidebar: () => void;
}

export default function AppShell({
  header, sidebar, children, sidebarOpen, scrollKey, onCloseSidebar,
}: Props) {
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [scrollKey]);

  return (
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
  );
}
