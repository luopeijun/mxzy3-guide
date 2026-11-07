import { useCallback, useEffect, useState } from 'react';

function readHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, '');
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
