import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGame, type ClassId, type EnemyType } from '@horizon/sim';
import { PlayerView } from './render/players';
import { buildEnemyVisual, setEnemySet } from './render/enemies';
import { buildArena } from './render/arena';
import { PostFx } from './render/post';
import { models } from './render/models';

/**
 * Галерея для доведення вигляду: одна модель крупним планом у ракурсі концептів
 * (?m=assault|engineer|medic|tech|scout|gunner) або карта згори (?m=map).
 * Порівнюється з docs/concepts; у грі не використовується.
 */
const m = new URLSearchParams(location.search).get('m') ?? 'assault';
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0e12);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.32;

await models.load();
// ?set=desert — пустельний вигляд ворогів (механічні тварини).
setEnemySet(new URLSearchParams(location.search).get('set') ?? '');
let camera: THREE.Camera;
if (m === 'map') {
  const arena = buildArena(createGame().config.map);
  scene.add(arena.group);
  arena.update(1);
  // Ізометричний вид згори, як на map.jpg.
  const s = 36;
  const ortho = new THREE.OrthographicCamera(
    -s * (innerWidth / innerHeight),
    s * (innerWidth / innerHeight),
    s,
    -s,
    1,
    300,
  );
  ortho.position.set(0, 120, 30);
  ortho.lookAt(0, 0, 0);
  camera = ortho;
} else {
  // Світло, як на картках концептів: тепле згори, червоний контур ззаду, темна підлога.
  scene.add(new THREE.HemisphereLight(0x9a8a96, 0x3a1410, 1.1));
  const key = new THREE.DirectionalLight(0xfff4ea, 2.6);
  key.position.set(2, 4, 4);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.PointLight(0xff2a1a, 10, 10, 1.5);
  rim.position.set(-1.5, 2.2, -2);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.35 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);
  const classes: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];
  let obj: THREE.Object3D;
  if (classes.includes(m as ClassId)) obj = new PlayerView(0, m as ClassId).root;
  else {
    const v = buildEnemyVisual(m as EnemyType);
    // Дрони в грі висять у повітрі: піднімаємо, щоб не входили в підлогу.
    if (['wasp', 'kamikaze', 'sniper', 'swarm'].includes(m)) v.body.position.y = 1.2;
    obj = v.root;
  }
  obj.traverse((o) => {
    // Кільце під гравцем у галереї зайве.
    if ((o as THREE.Mesh).geometry?.type === 'RingGeometry') o.visible = false;
  });
  obj.rotation.y = 0.45;
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  // Кадруємо за найбільшим розміром: пласкі дрони інакше вилазять за кадр.
  const h = Math.max(size.y, size.x * 0.8, size.z * 0.8, 1.2);
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  cam.position.set(0, h * 0.75, h * 3.4);
  cam.lookAt(0, h * 0.48, 0);
  camera = cam;
}
new PostFx(renderer, scene, camera, true).render();
document.title = 'ready';
