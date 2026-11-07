import { useCallback, useEffect, useState } from 'react';

function readHash(): string {
  // `#/node-id~anchor` keeps the in-page anchor in the same fragment.
  const raw = window.location.hash.replace(/^#\/?/, '').split('~')[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Keep the selected guide node in the URL hash for refresh-safe deep links. */
export function useHashSelection(validIds: Set<string>) {
  const [rawId, setRawId] = useState(readHash);

  useEffect(() => {
    const onChange = () => setRawId(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const select = useCallback((id: string) => {
    setRawId(id);
    window.location.hash = `/${id}`;
  }, []);

  return {
    selectedId: validIds.has(rawId) ? rawId : '',
    select,
  };
}
