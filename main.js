import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 200000, 1e7);
camera.position.set(0, 260000, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.1;

const clock = new THREE.Clock();

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 1);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
scene.add(dirLight);

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(500000, 32, 16),
  new THREE.MeshBasicMaterial({ color: 0xffff88, emissive: 0xffff88 })
);
sun.position.set(1e6, 5e6, -2e6);
scene.add(sun);
dirLight.position.copy(sun.position);

// ✅ 地面模型加载（OBJLoader）
let groundY = 0;
loadGroundModel('https://spectacular-kelpie-114eb2.netlify.app/mountains.obj');

function loadGroundModel(url) {
  const loader = new OBJLoader();
  loader.load(
    url,
    (model) => {
      model.traverse((child) => {
        if (child.isMesh) {
          child.receiveShadow = true;
        }
      });

      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      const targetSize = 8000000;
      const scale = targetSize / maxDim;
      model.scale.setScalar(scale);
      model.position.y -= box.min.y;
      groundY = 0;

      scene.add(model);
    },
    undefined,
    (error) => console.error('地面模型加载失败：', error)
  );
}

const flightBounds = {
  xMin: -5e6, xMax: 5e6,
  yMin: 0, yMax: 1e7,
  zMin: -5e6, zMax: 5e6
};

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
    }`,
  fragmentShader: `
    uniform float time;
    varying vec3 vPos;
    void main(){
      float w = abs(sin(time*0.3 + length(vPos.xy)*0.0003));
      vec3 c = mix(vec3(0.1,0.2,0.8), vec3(0.8,0.1,0.2), w);
      gl_FragColor = vec4(c, 0.3 + 0.2 * w);
    }`,
  transparent: true,
  uniforms: { time: { value: 0 } }
});
const boundaryGlow = new THREE.LineSegments(edgeGeo, glowMaterial);
boundaryGlow.position.set(
  (flightBounds.xMin + flightBounds.xMax) / 2,
  (flightBounds.yMin + flightBounds.yMax) / 2,
  (flightBounds.zMin + flightBounds.zMax) / 2
);
scene.add(boundaryGlow);

let paperPlane = null;
let airflowAtas = null;
let airflowBawah = null;
let isPaused = true;
let velocity = 20000;
let flyTime = 0;
const acceleration = 1000;
const maxVelocity = 800000;
let resetProgress = 0;
let isResetting = false;
const resetDuration = 2;
let originalPosition = new THREE.Vector3(0, 250000, 0);
let resetStart = new THREE.Vector3();
let P_atas = 1, P_bawah = 0.5;

const objPath = '/models/IronMan.obj';
const mtlPath = '/models/IronMan.mtl';
const modelScale = 100000;

new MTLLoader().load(
  mtlPath,
  (mtl) => {
    mtl.preload();
    const objLoader = new OBJLoader();
    objLoader.setMaterials(mtl);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', objPath, true);
    xhr.responseType = 'text';
    xhr.onprogress = onProgress;
    xhr.onerror = onError;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const obj = objLoader.parse(xhr.responseText);
        setupPlane(obj);
      } else {
        onError(new Error(`加载失败: HTTP ${xhr.status}`));
      }
    };
    xhr.send();
  },
  undefined,
  () => {
    const objLoader = new OBJLoader();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', objPath, true);
    xhr.responseType = 'text';
    xhr.onprogress = onProgress;
    xhr.onerror = onError;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const obj = objLoader.parse(xhr.responseText);
        setupPlane(obj);
      } else {
        onError(new Error(`加载失败: HTTP ${xhr.status}`));
      }
    };
    xhr.send();
  }
);

function onProgress(xhr) {
  if (xhr.lengthComputable) {
    const percent = (xhr.loaded / xhr.total) * 100;
    const fill = document.getElementById('progress-fill');
    const text = document.getElementById('loading-text');
    if (fill) fill.style.width = `${percent.toFixed(1)}%`;
    if (text) text.innerText = `加载中... ${percent.toFixed(0)}%`;
  }
}
function onError(error) {
  const text = document.getElementById('loading-text');
  if (text) text.innerText = '模型加载失败 😢';
  console.error('模型加载失败:', error);
}

function setupPlane(obj) {
  paperPlane = obj;
  paperPlane.scale.set(modelScale, modelScale, modelScale);
  paperPlane.position.copy(originalPosition);
  paperPlane.traverse(o => {
    if (o.isMesh) o.castShadow = true;
  });
  scene.add(paperPlane);
  airflowAtas = createAirflowLines(1200, 0xff3333);
  airflowBawah = createAirflowLines(-800, 0x3399ff);

  const loading = document.getElementById('loading-container');
  if (loading) loading.remove();
}

function startReset() {
  isResetting = true;
  resetProgress = 0;
  resetStart = paperPlane.position.clone();
}

function createAirflowLines(yOffset, color) {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([0, 0, 0, 0, yOffset, 0]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

function updateAirflow(line, length) {
  const positions = line.geometry.attributes.position.array;
  positions[4] = length;
  line.geometry.attributes.position.needsUpdate = true;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  controls.update();
  glowMaterial.uniforms.time.value += delta;
  sun.rotateY(0.0005 * delta * 60);
  dirLight.position.copy(sun.position);

  if (!paperPlane) return;

  if (isResetting) {
    resetProgress += delta / resetDuration;
    if (resetProgress >= 1) {
      isResetting = false;
      paperPlane.position.copy(originalPosition);
      flyTime = 0;
      velocity = 200000;
    } else {
      paperPlane.position.lerpVectors(resetStart, originalPosition, resetProgress);
    }
  } else {
    if (isPaused && P_bawah > P_atas) {
      isPaused = false;
      velocity = 200000;
    }
    if (!isPaused) {
      flyTime += delta;
      velocity = Math.min(velocity + acceleration * delta * 60, maxVelocity);
      const diff = P_bawah - P_atas;
      paperPlane.position.x += velocity * delta;
      paperPlane.remove(airflowAtas);
      paperPlane.remove(airflowBawah);
      if (P_atas !== P_bawah) {
        const lift = diff * 0.5;
        paperPlane.position.y += lift * delta * 60;
        const pitchAngle = THREE.MathUtils.clamp(lift * 0.0001, -0.3, 0.3);
        paperPlane.rotation.z = pitchAngle;
        if (P_atas > P_bawah) {
          paperPlane.add(airflowAtas);
          updateAirflow(airflowAtas, diff * 0.2);
        } else {
          paperPlane.add(airflowBawah);
          updateAirflow(airflowBawah, diff * 0.1);
        }
      }

      const pos = paperPlane.position;
      if (pos.y <= groundY + 10 ||
        pos.x < flightBounds.xMin ||
        pos.x > flightBounds.xMax ||
        pos.y > flightBounds.yMax ||
        pos.z < flightBounds.zMin ||
        pos.z > flightBounds.zMax) {
        startReset();
      }
    }
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

document.getElementById('tekananAtasSlider').addEventListener('input', (e) => {
  P_atas = parseFloat(e.target.value) / 100000;
});
document.getElementById('tekananBawahSlider').addEventListener('input', (e) => {
  P_bawah = parseFloat(e.target.value) / 100000;
});
