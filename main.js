import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createGround } from './ground.js';

// —— 场景初始化 ——
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 1e7);
camera.position.set(0, 2600, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// 控制器
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.enablePan = true;
controls.enableZoom = true;
controls.enableRotate = true;
controls.rotateSpeed = 0.5;
controls.zoomSpeed = 0.5;

// 环境光 + 定向光
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

// —— 模拟太阳球体 ——
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(500000, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xffff88, emissive: 0xffff88 })
);
sun.position.set(1e6, 5e6, -2e6);
scene.add(sun);
dirLight.position.copy(sun.position);

// 地面
const ground = createGround();
ground.receiveShadow = true;
scene.add(ground);
const groundY = 0;

// —— 科幻边界框 ——
const flightBounds = { xMin: -5e6, xMax: 5e6, yMin: 0, yMax: 1e7, zMin: -5e6, zMax: 5e6 };
const boundaryGeo = new THREE.BoxGeometry(
  flightBounds.xMax - flightBounds.xMin,
  flightBounds.yMax - flightBounds.yMin,
  flightBounds.zMax - flightBounds.zMin
);
const edgeGeo = new THREE.EdgesGeometry(boundaryGeo);
const glowMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vPos;
    void main(){
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform float time;
    varying vec3 vPos;
    void main(){
      float w = abs(sin(time*0.3 + length(vPos.xy)*0.0003));
      vec3 c = mix(vec3(0.1,0.2,0.8), vec3(0.8,0.1,0.2), w);
      gl_FragColor = vec4(c, 0.3 + 0.2 * w);
    }
  `,
  transparent: true,
  uniforms: { time: { value: 0 } }
});
const boundaryGlow = new THREE.LineSegments(edgeGeo, glowMaterial);
boundaryGlow.position.set(
  (flightBounds.xMin + flightBounds.xMax)/2,
  (flightBounds.yMin + flightBounds.yMax)/2,
  (flightBounds.zMin + flightBounds.zMax)/2
);
scene.add(boundaryGlow);

// —— 飞机与气流设置 ——
let paperPlane = null, airflowAtas = null, airflowBawah = null;
let flyTime = 0, velocity = 2000;
const maxVelocity = 1000, acceleration = 0.01;
const originalPosition = new THREE.Vector3(0, 250000, 0);
let isPaused = false, isResetting = false, resetProgress = 0;
const resetDuration = 2, resetStart = new THREE.Vector3();

// 压强滑块控制
const tekananAtas = document.getElementById('tekananAtasSlider');
const tekananBawah = document.getElementById('tekananBawahSlider');
let P_atas = +tekananAtas.value, P_bawah = +tekananBawah.value;
tekananAtas.addEventListener('input', () => P_atas = +tekananAtas.value);
tekananBawah.addEventListener('input', () => P_bawah = +tekananBawah.value);

// 气流线生成/更新
function createAirflowLines(offsetY, color, count=12){
  const g = new THREE.Group();
  for(let i=0; i<count; i++){
    const pts = [];
    for(let j=0; j<80; j++){
      pts.push(new THREE.Vector3(j*50, offsetY + Math.sin(j*0.3+i)*50, Math.cos(i*0.5)*200));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    geo.attributes.position.setUsage(THREE.DynamicDrawUsage);
    g.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.6 })));
  }
  return g;
}
function updateAirflow(g, speed){
  if(!g) return;
  g.children.forEach(line=>{
    const pos = line.geometry.attributes.position;
    for(let i=0;i<pos.count;i++){
      pos.array[i*3] += speed;
      if(pos.array[i*3]>5000) pos.array[i*3] = -5000;
    }
    pos.needsUpdate = true;
  });
}

// 提示 UI
const hint = document.createElement('div');
hint.style.cssText = 'position:absolute;top:20px;left:50%;transform:translateX(-50%);padding:5px 10px;background:rgba(0,0,0,0.6);color:#fff;font-family:sans-serif;border-radius:4px;display:none;';
hint.innerText = '⚠️ 飞出边界，正在重置…';
document.body.appendChild(hint);

// 顶亮底暗材质
const planeMaterial = new THREE.ShaderMaterial({
  vertexShader: `
    varying float vY;
    void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    varying float vY;
    void main(){
      float b = smoothstep(-20.0,20.0,vY);
      vec3 c = mix(vec3(0.2), vec3(1.0), b);
      gl_FragColor = vec4(c,1.0);
    }
  `,
  side: THREE.DoubleSide
});

// 加载飞机模型
new GLTFLoader().load('scene.gltf', gltf=>{
  paperPlane = gltf.scene;
  paperPlane.scale.set(100,100,100);
  paperPlane.position.copy(originalPosition);
  paperPlane.traverse(o=>{
    if(o.isMesh){
      o.castShadow = true;
      o.material = planeMaterial.clone();
    }
  });
  scene.add(paperPlane);
  airflowAtas = createAirflowLines(1200,0xff3333);
  airflowBawah = createAirflowLines(-800,0x3399ff);
},undefined,console.error);

// 启动重置过程
function startReset(){
  isResetting = true;
  resetProgress = 0;
  resetStart.copy(paperPlane.position);
  hint.style.display = 'block';
}

// 主循环
function animate(){
  requestAnimationFrame(animate);
  controls.update();
  glowMaterial.uniforms.time.value += 0.02;

  sun.rotateY(0.0005);
  dirLight.position.copy(sun.position);

  if(paperPlane){
    if(isResetting){
      resetProgress += 0.02/resetDuration;
      if(resetProgress>=1){
        isResetting=false;
        paperPlane.position.copy(originalPosition);
        flyTime = 0; velocity = 200;
        hint.style.display='none';
      } else {
        paperPlane.position.lerpVectors(resetStart, originalPosition, resetProgress);
      }
    } else {
      if(isPaused && P_bawah > P_atas){
        isPaused = false; velocity = 200;
      }
      if(!isPaused){
        flyTime += 0.02;
        velocity = Math.min(velocity + acceleration, maxVelocity);
        const delta = P_bawah - P_atas;
        paperPlane.position.x += velocity;

        paperPlane.remove(airflowAtas);
        paperPlane.remove(airflowBawah);

        if(P_atas !== P_bawah){
          const lift = delta * 0.5;
          paperPlane.position.y += lift;

          // 机头倾斜效果：根据 lift 倾斜
          const pitchAngle = THREE.MathUtils.clamp(lift * 0.0001, -0.3, 0.3); // 适当限制角度
          paperPlane.rotation.x = -pitchAngle;

          paperPlane.rotation.z = pitchAngle;

          if(P_atas > P_bawah){
            paperPlane.add(airflowAtas);
            updateAirflow(airflowAtas, (P_atas - P_bawah) * 0.2);
          } else {
            paperPlane.add(airflowBawah);
            updateAirflow(airflowBawah, (P_bawah - P_atas) * 0.1);
          }
        }

        const pos = paperPlane.position;
        if(pos.y <= groundY + 10){ isPaused = true; velocity = 0; }
        if(pos.x < flightBounds.xMin || pos.x > flightBounds.xMax ||
           pos.y > flightBounds.yMax || pos.z < flightBounds.zMin || pos.z > flightBounds.zMax){
          startReset();
        }
      }
    }
  }

  renderer.render(scene, camera);
}
animate();

// 自适应窗口
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});