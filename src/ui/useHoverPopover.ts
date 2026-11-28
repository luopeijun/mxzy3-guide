import { useCallback, useEffect, useRef, useState } from 'react';

/** 两站通告统计共用的悬停浮层开关。
 *
 *  纯 CSS `group-hover` 会在鼠标离开胶囊的瞬间把浮层切成 `pointer-events-none`，
 *  胶囊和浮层之间那几像素空隙就成了「死亡区」，鼠标根本进不去。这里改成：
 *  离开触发区先延时收起，期间浮层仍可接收鼠标；鼠标进到浮层就取消定时器，
 *  直到真正离开浮层才收起。键盘 focus 走同一套逻辑。 */
export function useHoverPopover(delay = 260) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setOpen(true);
  }, []);

  const scheduleClose = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setOpen(false);
    }, delay);
  }, [delay]);

  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

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
