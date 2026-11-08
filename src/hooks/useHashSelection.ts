import { useCallback, useEffect, useState } from 'react';

export function readHash(): string {
  // `#/node-id~anchor` keeps the in-page anchor in the same fragment.
  const raw = window.location.hash.replace(/^#\/?/, '').split('~')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** True when the URL points at the standalone tracker view rather than a node. */
export function isTrackerRoute(): boolean {
  return readHash() === 'tracker';
}

/** The guide node id implied by the current hash, or '' on the tracker route or
 *  with nothing selected. Understands both the explicit `#/guide/...` prefix and
 *  legacy bookmarks that lack it, so old deep links keep working. */
export function guideNodeId(): string {
  const h = readHash();
  if (h === 'tracker') return '';
  if (h.startsWith('guide/')) return h.slice('guide/'.length);
  return h; // legacy: node id without the `guide/` prefix
}

/** Keep the selected guide node in the URL hash for refresh-safe deep links. */
export function useHashSelection(validIds: Set<string>) {
  const [rawId, setRawId] = useState(guideNodeId);

  useEffect(() => {
    const onChange = () => setRawId(guideNodeId());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const select = useCallback((id: string) => {
    setRawId(id);
    window.location.hash = `/guide/${id}`;
  }, []);

  return {
    selectedId: validIds.has(rawId) ? rawId : '',
    select,
  };
}
