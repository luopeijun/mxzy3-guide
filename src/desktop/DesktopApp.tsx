import { useEffect, useState } from 'react';
import DesktopHome from './DesktopHome';
import MainCaseDesktop from './MainCaseDesktop';
import SweetDesktopCase from './SweetDesktopCase';

function currentRoute() {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash;
  if (hash.startsWith('#/case')) return 'case';
  if (hash.startsWith('#/sweet')) return 'sweet';
  return 'home';
}

/** 桌面版只有一个入口 HTML：先选游戏，再进各自的存档解析页。
 *  切页时用 hash，不用路由库，也不加载另一个站点的数据。 */
export default function DesktopApp() {
  const [route, setRoute] = useState(currentRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (route === 'case') return <MainCaseDesktop />;
  if (route === 'sweet') return <SweetDesktopCase />;
  return <DesktopHome />;
}
