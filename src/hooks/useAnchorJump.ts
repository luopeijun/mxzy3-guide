import { useCallback, useEffect } from 'react';

const FLASH_CLASS = 'anchor-flash';
const FLASH_MS = 1800;

/** Ring pulse so the eye lands on the block that was jumped to. */
function flash(el: HTMLElement) {
  el.classList.remove(FLASH_CLASS);
  void el.offsetWidth; // restart the animation if it is already running
  el.classList.add(FLASH_CLASS);
  window.setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_MS);
}

function anchorFromHash(): string {
  const raw = window.location.hash.replace(/^#\/?/, '');
  return raw.includes('~') ? raw.split('~')[1] : '';
}

/**
 * In-page anchor jumps for the current guide node.
 *
 * Clicking a link scrolls smoothly, flashes the target and rewrites the hash
 * as `#/node-id~anchor`, so refreshing or sharing the URL lands on the same
 * block. The hash is rewritten with `replaceState` to avoid a `hashchange`
 * event, which would otherwise reset the selected node.
 */
export function useAnchorJump(nodeId: string) {
  const jump = useCallback(
    (anchor: string) => {
      const el = document.getElementById(anchor);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flash(el);
      if (nodeId) {
        window.history.replaceState(null, '', `#/${nodeId}~${anchor}`);
      }
    },
    [nodeId],
  );

  // Restore the anchor on load / refresh, once the node content has rendered.
  useEffect(() => {
    const anchor = anchorFromHash();
    if (!anchor) return;

    let frame = 0;
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ block: 'start' });
        flash(el);
        return;
      }
      if (tries++ < 30) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [nodeId]);

  return jump;
}
