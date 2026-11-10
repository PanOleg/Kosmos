import * as THREE from 'three';
import { createGame, emptyInput, step, DT, type PlayerInput } from '@horizon/sim';
import { buildArena } from './render/arena';
import { GameCamera } from './render/camera';
import { PlayerView } from './render/players';
import { PALETTE } from './render/palette';
import { toX, toZ } from './render/coords';
import { KeyboardInput, type InputSource } from './input/keyboard';
import { DebugOverlay } from './debug/overlay';

const container = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.bg);

const game = createGame(undefined, 1);
const arena = buildArena(game.config.map);
scene.add(arena.group);

const cam = new GameCamera(window.innerWidth / window.innerHeight);
const playerViews = game.state.players.map((p) => {
  const v = new PlayerView(p.slot);
  scene.add(v.root);
  return v;
});

const sources: InputSource[] = [new KeyboardInput()];
const inputs: PlayerInput[] = game.state.players.map(() => emptyInput());
const debug = new DebugOverlay();

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth / window.innerHeight);
});

const camPoints = game.state.players.map(() => ({ x: 0, z: 0 }));
let last = performance.now();
let acc = 0;

function frame(now: number): void {
  // Обмеження кадру: після вкладки у фоні не наздоганяємо сотні кроків.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 6) {
    for (let i = 0; i < inputs.length; i++) sources[i]?.read(inputs[i]!);
    step(game, inputs);
    acc -= DT;
    steps++;
  }
  if (steps === 6) acc = 0;
  const alpha = acc / DT;
  const time = now / 1000;

  const ps = game.state.players;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    playerViews[i]!.update(p, alpha, dt, time);
    camPoints[i]!.x = toX(p.x);
    camPoints[i]!.z = toZ(p.y);
  }
  arena.update(time);
  cam.update(camPoints, dt, time);
  renderer.render(scene, cam.camera);
  debug.frame(dt, renderer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
