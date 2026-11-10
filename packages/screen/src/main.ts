import * as THREE from 'three';
import {
  createGame,
  emptyInput,
  step,
  spawnEnemy,
  botInput,
  DT,
  type Game,
  type PlayerInput,
} from '@horizon/sim';
import { buildArena } from './render/arena';
import { GameCamera } from './render/camera';
import { PlayerView } from './render/players';
import { PALETTE } from './render/palette';
import { toX, toZ } from './render/coords';
import { KeyboardInput, LAYOUT_ARROWS, LAYOUT_WASD, type InputSource } from './input/keyboard';
import { DebugOverlay } from './debug/overlay';
import { EnemyRenderer } from './render/enemies';
import { ProjectileRenderer } from './render/projectiles';
import { PickupRenderer } from './render/pickups';
import { FxDirector } from './render/fx';
import { Sfx } from './audio/sfx';
import { Hud } from './ui/hud';
import { showResults } from './ui/results';
import { t } from './ui/i18n';

/**
 * Параметри розробника в URL:
 *   ?p2       — другий гравець на стрілках (Enter — ривок)
 *   ?bots=N   — додати N ботів у вільні слоти
 *   ?seed=N   — сід матчу
 *   ?debug    — fps/draw calls, window.game, клавіші 1/2 спавнять ворогів
 */
const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

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
const cam = new GameCamera(window.innerWidth / window.innerHeight);
const sfx = new Sfx();
const debug = new DebugOverlay();

class BotSource implements InputSource {
  constructor(
    private readonly getGame: () => Game,
    private readonly slot: number,
  ) {}
  read(out: PlayerInput): void {
    botInput(this.getGame(), this.slot, out);
  }
}

interface Match {
  game: Game;
  sources: InputSource[];
  inputs: PlayerInput[];
  playerViews: PlayerView[];
  enemyR: EnemyRenderer;
  bulletR: ProjectileRenderer;
  pickupR: PickupRenderer;
  fx: FxDirector;
  hud: Hud;
  camPoints: { x: number; z: number }[];
  results: HTMLDivElement | null;
  disposables: THREE.Object3D[];
}

let match: Match;
let seed = Number(params.get('seed') ?? Date.now() % 100000);

// Арена статична — будуємо раз на сторінку.
const arena = buildArena(createGame().config.map);
scene.add(arena.group);

function startMatch(): Match {
  const sources: InputSource[] = [new KeyboardInput(LAYOUT_WASD)];
  if (params.has('p2')) sources.push(new KeyboardInput(LAYOUT_ARROWS));
  const bots = Math.min(4 - sources.length, Number(params.get('bots') ?? 0));
  const firstBot = sources.length;
  for (let i = 0; i < bots; i++) sources.push(new BotSource(() => match.game, firstBot + i));

  const game = createGame(
    undefined,
    seed++,
    sources.map(() => ({ classId: 'assault' as const })),
  );
  const playerViews = game.state.players.map((p) => {
    const v = new PlayerView(p.slot);
    scene.add(v.root);
    return v;
  });
  const enemyR = new EnemyRenderer(scene, game.state.enemies.length);
  const bulletR = new ProjectileRenderer(scene, game.state.projectiles.length);
  const pickupR = new PickupRenderer(scene, game.state.pickups.length);
  const fx = new FxDirector(scene, cam, sfx, playerViews, enemyR);
  const m: Match = {
    game,
    sources,
    inputs: game.state.players.map(() => emptyInput()),
    playerViews,
    enemyR,
    bulletR,
    pickupR,
    fx,
    hud: new Hud(game),
    camPoints: game.state.players.map(() => ({ x: 0, z: 0 })),
    results: null,
    disposables: [],
  };
  if (DEBUG) (window as unknown as { game: Game }).game = game;
  // Подія паузи першої хвилі виникає ще в createGame, до першого step — оголошуємо тут.
  const first = game.config.waves[0];
  if (first) {
    m.hud.announce(first.name, t.stationSignal, 2.5);
    sfx.stationSignal();
  }
  return m;
}

function disposeMatch(m: Match): void {
  // Простіше, ніж перевикористання: прибираємо все, що додав матч, арена лишається.
  const keep = new Set<THREE.Object3D>([arena.group]);
  for (const o of [...scene.children]) {
    if (keep.has(o)) continue;
    scene.remove(o);
    // Матеріали — свої в кожного вигляду; геометрії ворогів спільні між матчами, їх не чіпаємо.
    o.traverse((c) => {
      const mat = (c as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
  m.fx.destroy();
  m.hud.destroy();
  m.results?.remove();
}

match = startMatch();

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR' && match.game.state.phase !== 'playing') {
    disposeMatch(match);
    match = startMatch();
    return;
  }
  if (!DEBUG || (e.code !== 'Digit1' && e.code !== 'Digit2')) return;
  const g = match.game;
  const a = g.config.map.airlocks[g.state.tick % 4]!;
  if (e.code === 'Digit1')
    for (let k = 0; k < 4; k++) spawnEnemy(g, 'scout', a.x * 0.9 + (k % 2), a.y * 0.9 + (k >> 1));
  else for (let k = 0; k < 2; k++) spawnEnemy(g, 'gunner', a.x * 0.9 + k * 1.2, a.y * 0.9);
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth / window.innerHeight);
});

function handleMatchEvents(m: Match): void {
  const g = m.game;
  const ev = g.events;
  for (let i = 0; i < ev.count; i++) {
    const e = ev.list[i]!;
    m.fx.handle(e);
    const def = g.config.waves[e.a];
    if (e.type === 'wavePause' && def) {
      m.hud.announce(def.name, t.stationSignal, 2.5);
      sfx.stationSignal();
    } else if (e.type === 'waveCleared' && def && e.b === 0) {
      m.hud.announce(t.waveCleared, '', 2);
    }
  }
}

let last = performance.now();
let acc = 0;

function frame(now: number): void {
  const m = match;
  const g = m.game;
  // Обмеження кадру: після вкладки у фоні не наздоганяємо сотні кроків.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Хіт-стоп: симуляція стоїть кілька кадрів, рендер і частинки — ні.
  if (m.fx.hitStop > 0) m.fx.hitStop = Math.max(0, m.fx.hitStop - dt);
  else acc += dt;
  let steps = 0;
  while (acc >= DT && steps < 6 && m.fx.hitStop <= 0) {
    for (let i = 0; i < m.inputs.length; i++) m.sources[i]?.read(m.inputs[i]!);
    step(g, m.inputs);
    handleMatchEvents(m);
    acc -= DT;
    steps++;
  }
  if (steps === 6) acc = 0;
  const alpha = acc / DT;
  const time = now / 1000;

  if (g.state.phase !== 'playing' && !m.results) {
    const won = g.state.phase === 'won';
    sfx.fanfare(won);
    m.results = showResults(g, won);
  }

  const ps = g.state.players;
  let live = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    m.playerViews[i]!.update(p, alpha, dt, time);
    // Камера тримає в кадрі живих; якщо впали всі — усіх.
    if (!p.down || ps.every((q) => q.down)) {
      m.camPoints[live]!.x = toX(p.x);
      m.camPoints[live]!.z = toZ(p.y);
      live++;
    }
  }
  m.enemyR.update(g.state.enemies, ps, alpha, dt, time);
  m.bulletR.update(g.state.projectiles, alpha);
  m.pickupR.update(g.state.pickups, alpha, time);
  m.fx.update(g, dt);
  arena.update(time);
  cam.update(m.camPoints, live, dt, time);
  m.hud.update(g, cam.camera, dt);
  renderer.render(scene, cam.camera);
  debug.frame(dt, renderer);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
