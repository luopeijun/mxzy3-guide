import CaseReaderApp from '../components/case/CaseReaderApp';
import { GuideDataContext } from '../hooks/useGuideContext';
import { useGuideData } from '../hooks/useGuideData';
import DesktopBar from './DesktopBar';
import useDesktopSaveBridge from './useDesktopSaveBridge';

/** 明星志愿3 的桌面解析页：目录、档位、自动跟随都只走 main 那一份配置。 */
export default function MainCaseDesktop() {
  // 场景解锁提示读「场景开启方法」页；桌面端也要有同一份 GuideDataContext。
  const { data: guide } = useGuideData();
  const bridge = useDesktopSaveBridge('main');

  return (
    <GuideDataContext.Provider value={guide}>
      <DesktopBar site="main" {...bridge} />
      <CaseReaderApp externalSave={bridge.externalSave} />
    </GuideDataContext.Provider>
  );
}
