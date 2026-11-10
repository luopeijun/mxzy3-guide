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
 * as `#/guide/node-id~anchor`, so refreshing or sharing the URL lands on the
 * same block. The hash is rewritten with `replaceState` to avoid a `hashchange`
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
        window.history.replaceState(null, '', `#/guide/${nodeId}~${anchor}`);
      }
    },
    [nodeId],
  );

  // Restore the anchor on load / refresh, once the node content has rendered.
  // 也监听 hashchange：从 CG 图鉴点「攻略」回来时，节点可能没变（同一角色页），
  // 只有锚点变了 —— 那种情况不会重新挂载组件，只能靠这个监听。
  useEffect(() => {
    let frame = 0;
    const timers: number[] = [];

    const place = (el: HTMLElement) => {
      // `behavior: instant` 绕开 main 上的 scroll-smooth：平滑滚动期间如果封面图
      // 加载完把内容撑高，落点会偏（实测能差 200px+），这里要的是准而不是顺。
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
    };

    const run = () => {
      const anchor = anchorFromHash();
      if (!anchor) return;
      let tries = 0;
      const tick = () => {
        const el = document.getElementById(anchor);
        if (el) {
          place(el);
          flash(el);
          // 图片 / 字体晚到会把刚定位好的事件顶下去，补两次校正。
          timers.push(window.setTimeout(() => place(el), 200));
          timers.push(window.setTimeout(() => place(el), 600));
          return;
        }
        if (tries++ < 60) frame = requestAnimationFrame(tick);
      };
      tick();
    };
    run();
    window.addEventListener('hashchange', run);
    return () => {
      window.removeEventListener('hashchange', run);
      cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [nodeId]);

  return jump;
}
