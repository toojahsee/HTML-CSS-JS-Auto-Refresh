import * as THREE from 'three';

export function createGround({
  size = 8000000,
  thickness = 2000,
  baseColor = 0x228B22,
  topColor = 0x44cc66, // 渐变到这个颜色
  receiveShadow = true,
} = {}) {
  // ✅ 创建地面几何体
  const geometry = new THREE.BoxGeometry(size, thickness, size);

  // ✅ 顶点颜色渐变：使用顶点颜色实现从中心向外的渐变效果
  const colors = [];
  const positionAttr = geometry.attributes.position;

  for (let i = 0; i < positionAttr.count; i++) {
    const y = positionAttr.getY(i);
    const ratio = (y + thickness / 2) / thickness; // bottom=0, top=1

    const color = new THREE.Color(baseColor).lerp(new THREE.Color(topColor), ratio);
    colors.push(color.r, color.g, color.b);
  }

  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.1
  });

  const groundBox = new THREE.Mesh(geometry, material);
  groundBox.position.y = -thickness / 2;
  groundBox.receiveShadow = receiveShadow;

  const group = new THREE.Group();
  group.add(groundBox);

  return group;
}