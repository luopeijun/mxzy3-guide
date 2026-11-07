import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import styles from '../styles/ui.module.css';

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
    <div className={styles.shell}>
      {header}
      <div className={styles.shellBody}>
        {sidebar}
        {sidebarOpen && (
          <div
            className={styles.overlay}
            onClick={onCloseSidebar}
            role="presentation"
            aria-hidden="true"
          />
        )}
        <main className={styles.shellMain} ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  );
}
