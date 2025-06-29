import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

/**
 * 加载 .obj 地面模型（Netlify 外链），并进行缩放、贴地等处理
 * @param {Object} options - 加载配置
 * @param {string} options.url - 模型外链 URL
 * @param {number} options.targetSize - 模型最大边尺寸（自动缩放）
 * @param {boolean} options.receiveShadow - 是否接收阴影
 * @returns {Promise<THREE.Group>} 返回 Promise，包含加载好的模型 group
 */
export async function createGround({
  url = 'https://spectacular-kelpie-114eb2.netlify.app/mountains.obj',
  targetSize = 8000000,
  receiveShadow = true,
} = {}) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();

    loader.load(
      url,
      (model) => {
        // 设置阴影属性
        model.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = receiveShadow;
            child.castShadow = false;
          }
        });

        // 计算尺寸，自动缩放
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDim;
        model.scale.setScalar(scale);

        // 贴地：将模型底部贴近 y=0
        const newBox = new THREE.Box3().setFromObject(model);
        const yOffset = newBox.min.y;
        model.position.y -= yOffset;

        // 返回为 group
        const group = new THREE.Group();
        group.add(model);
        resolve(group);
      },
      undefined,
      (err) => {
        console.error('地面模型加载失败:', err);
        reject(err);
      }
    );
  });
}
