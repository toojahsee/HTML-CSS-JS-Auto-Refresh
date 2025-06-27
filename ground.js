import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

export async function createGround({
  url = 'https://github.com/toojahsee/Connect.github/raw/refs/heads/master/public/mountains.obj',
  targetSize = 8000000,
  receiveShadow = true,
} = {}) {
  return new Promise((resolve, reject) => {
    const loader = new OBJLoader();
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error('加载失败: ' + res.status);
        return res.text();
      })
      .then(objText => {
        const model = loader.parse(objText);

        model.traverse((child) => {
          if (child.isMesh) {
            child.receiveShadow = receiveShadow;
            child.castShadow = false;
          }
        });

        // 自动缩放模型使其最大尺寸为 targetSize
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = targetSize / maxDim;
        model.scale.setScalar(scale);

        // 将模型放到地面上（底部贴地）
        const newBox = new THREE.Box3().setFromObject(model);
        const yOffset = newBox.min.y;
        model.position.y -= yOffset;

        const group = new THREE.Group();
        group.add(model);
        resolve(group);
      })
      .catch(err => {
        console.error('地面模型加载失败:', err);
        reject(err);
      });
  });
}