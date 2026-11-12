import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** 两个站点平级共存：index.html 是明星志愿3，sweet.html 是甜蜜乐章。
 *  共用同一份源码与设计系统，各自一套数据与主题令牌。 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        sweet: 'sweet.html',
      },
    },
  },
});
