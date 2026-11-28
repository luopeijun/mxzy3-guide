import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/global.css';
// 粉色主题只在 html[data-game='sweet'] 下生效，主站解析页不受影响。
import '../styles/theme-sweet.css';
import DesktopApp from './DesktopApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DesktopApp />
  </StrictMode>,
);
