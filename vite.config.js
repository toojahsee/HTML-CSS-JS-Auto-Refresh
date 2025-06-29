// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径部署时必备
  assetsInclude: ['**/*.obj', '**/*.gltf', '**/*.bin'],
  server: {
    headers: {
      'Access-Control-Allow-Origin': '*', // 🟡 开启 CORS 支持（开发环境）
    },
  },
});
