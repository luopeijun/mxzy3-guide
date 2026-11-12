import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SweetApp from './SweetApp';
import '../styles/global.css';
import '../styles/theme-sweet.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SweetApp />
  </StrictMode>,
);
