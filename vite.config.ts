import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** 两个站点平级共存：index.html 是明星志愿3，sweet.html 是甜蜜乐章。
 *  desktop.html 是 Electron 桌面端入口，只挂存档解析，共用同一份组件与样式。 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sweet: 'sweet.html',
        desktop: 'desktop.html',
      },
    },
  },
});
