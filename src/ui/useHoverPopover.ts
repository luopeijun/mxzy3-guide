import { useCallback, useEffect, useRef, useState } from 'react';

/** 两站通告统计共用的悬停浮层开关。
 *
 *  纯 CSS `group-hover` 会在鼠标离开胶囊的瞬间把浮层切成 `pointer-events-none`，
 *  胶囊和浮层之间那几像素空隙就成了「死亡区」，鼠标根本进不去。这里改成：
 *  离开触发区先延时收起，期间浮层仍可接收鼠标；鼠标进到浮层就取消定时器，
 *  直到真正离开浮层才收起。键盘 focus 走同一套逻辑。
 *
 *  关闭时间与主站 GapCourseHint 一致（150ms）。另外所有实例共享「当前打开的
 *  浮层」：新浮层一打开就让其他浮层立即收起，避免从一个胶囊移到另一个时
 *  两个框同时悬着重叠。 */
const activeOwners = new Set<symbol>();
const closeListeners = new Set<() => void>();

function closeOthers(owner: symbol) {
  let hasOther = false;
  for (const other of activeOwners) {
    if (other !== owner) hasOther = true;
  }
  if (!hasOther) return;
  activeOwners.clear();
  for (const listener of closeListeners) listener();
}

export function useHoverPopover(delay = 150) {
  const owner = useRef<symbol>(Symbol('work-hover-popover')).current;
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onExternalClose = () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setOpen(false);
    };
    closeListeners.add(onExternalClose);
    return () => {
      closeListeners.delete(onExternalClose);
      activeOwners.delete(owner);
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [owner]);

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    closeOthers(owner);
    activeOwners.add(owner);
    setOpen(true);
  }, [owner]);

  const scheduleClose = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      activeOwners.delete(owner);
      setOpen(false);
    }, delay);
  }, [delay, owner]);

  return {
    open,
    handlers: {
      onMouseEnter: cancelClose,
      onMouseLeave: scheduleClose,
      onFocus: cancelClose,
      onBlur: scheduleClose,
    },
  };
}
