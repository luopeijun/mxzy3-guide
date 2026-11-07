import { useEffect, useState } from 'react';

/** Band of the viewport that counts as "being read": below the header, above
 *  the lower half. The first heading inside it is the current section. */
const BAND = '-16px 0px -58% 0px';

/**
 * Tracks which section heading the reader is currently inside.
 *
 * IntersectionObserver is clipped by the scrolling ancestor, so headings below
 * the fold never report as visible. When nothing sits in the band (between two
 * headings, or past the last one) the previous highlight is kept rather than
 * cleared, which avoids flicker while scrolling fast.
 */
export function useActiveOutline(ids: string[]): string {
  const key = ids.join('|');
  const [active, setActive] = useState('');

  useEffect(() => {
    setActive('');
    if (!ids.length) return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        const first = ids.find((id) => visible.has(id));
        if (first) setActive(first);
      },
      { rootMargin: BAND, threshold: 0 },
    );

    ids.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
    // `ids` is keyed by content so a re-render never rebuilds the observer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return active;
}
