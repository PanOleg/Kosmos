import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGame, type ClassId, type EnemyType } from '@horizon/sim';
import { PlayerView } from './render/players';
import { buildEnemyVisual } from './render/enemies';
import { buildArena } from './render/arena';
import { PostFx } from './render/post';

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
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(2, 4, 4);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.PointLight(0xff2a1a, 30, 10, 1.5);
  rim.position.set(-1.5, 2.2, -2);
  scene.add(rim);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.5, roughness: 0.35 }),
  );
  floor.receiveShadow = true;
  scene.add(floor);
  const classes: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];
  const obj = classes.includes(m as ClassId)
    ? new PlayerView(0, m as ClassId).root
    : buildEnemyVisual(m as EnemyType).root;
  obj.traverse((o) => {
    // Кільце під гравцем у галереї зайве.
    if ((o as THREE.Mesh).geometry?.type === 'RingGeometry') o.visible = false;
  });
  obj.rotation.y = 0.45;
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const h = box.max.y - box.min.y;
  const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
  cam.position.set(0, h * 0.75, h * 3.4);
  cam.lookAt(0, h * 0.48, 0);
  camera = cam;
}
new PostFx(renderer, scene, camera, true).render();
document.title = 'ready';
