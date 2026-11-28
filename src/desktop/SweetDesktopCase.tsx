import { useEffect } from 'react';
import SweetCaseView from '../sweet/SweetCaseView';
import DesktopBar from './DesktopBar';
import useDesktopSaveBridge from './useDesktopSaveBridge';

/** 甜蜜乐章的桌面解析页：沿用与明星志愿3 同款顶栏和内容版式，
 *  只是目录 / 档位 / 自动跟随走 sweet 那一份配置。 */
export default function SweetDesktopCase() {
  // 粉色主题由 html[data-game='sweet'] 驱动；只在甜站页期间挂上，回首页 / 主站页自动还原。
  useEffect(() => {
    const previous = document.documentElement.getAttribute('data-game');
    document.documentElement.setAttribute('data-game', 'sweet');
    return () => {
      if (previous === null) document.documentElement.removeAttribute('data-game');
      else document.documentElement.setAttribute('data-game', previous);
    };
  }, []);

  const bridge = useDesktopSaveBridge('sweet');

  return (
    <>
      <DesktopBar site="sweet" {...bridge} />
      <SweetCaseView externalSave={bridge.externalSave} />
    </>
  );
}
