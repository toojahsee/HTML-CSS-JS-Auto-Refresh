import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // Render 部署关键路径设置
  assetsInclude: ['**/*.obj', '**/*.gltf', '**/*.bin'], // 可加载 GLTF / BIN 等模型资源
});