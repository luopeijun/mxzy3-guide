import { useCallback, useMemo, useState } from 'react';
import type { GuideNode } from '../types/guide';
import type { OrderMap, Place } from '../lib/treeOrder';
import {
  applyOrder,
  moveIds,
  readOrder,
  siblingsOf,
  writeOrder,
} from '../lib/treeOrder';

/**
 * Keeps a user-made order of the sidebar tree.
 *
 * Only the levels the reader actually moved are stored (parent id -> child ids),
 * so regenerating guide.json never invalidates the rest of the tree; unknown ids
 * are ignored and new nodes fall back to their source position at the end.
 */
export function useTreeOrder(source: GuideNode[]) {
  const [order, setOrder] = useState<OrderMap>(readOrder);
  const categories = useMemo(() => applyOrder(source, order), [source, order]);

  const move = useCallback(
    (parentKey: string, dragId: string, targetId: string, place: Place) => {
      const siblings = siblingsOf(categories, parentKey);
      if (!siblings) return;
      const ids = moveIds(siblings.map((node) => node.id), dragId, targetId, place);
      if (!ids) return;
      setOrder((previous) => {
        const next = { ...previous, [parentKey]: ids };
        writeOrder(next);
        return next;
      });
    },
    [categories],
  );

  const reset = useCallback(() => {
    setOrder({});
    writeOrder({});
  }, []);

  return {
    categories,
    move,
    reset,
    customized: Object.keys(order).length > 0,
  };
}
