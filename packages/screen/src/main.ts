import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createGame,
  step,
  spawnEnemy,
  botInput,
  DT,
  type Game,
  type PlayerInput,
} from '@horizon/sim';
import { emptyInput } from '@horizon/sim/protocol';
import { buildArena } from './render/arena';
import { GameCamera } from './render/camera';
import { PlayerView } from './render/players';
import { PALETTE } from './render/palette';
import { toX, toZ } from './render/coords';
import {
  KeyboardInput,
  LAYOUT_ARROWS,
  LAYOUT_WASD,
  type InputSource,
  type KeyLayout,
} from './input/keyboard';
import { DebugOverlay } from './debug/overlay';
import { EnemyRenderer } from './render/enemies';
import { ProjectileRenderer } from './render/projectiles';
import { PickupRenderer } from './render/pickups';
import { FxDirector } from './render/fx';
import { Sfx } from './audio/sfx';
import { Hud } from './ui/hud';
import { showResults } from './ui/results';
import { LobbyView } from './ui/lobby';
import { t } from './ui/i18n';
import { LobbyHost, type Slot } from './net/lobby';
import { PeerJsHost } from './net/peerjsHost';
import { LocalHost } from './net/localHost';
import { RoomTakenError } from './net/transport';

/**
 * Параметри розробника в URL:
 *   ?quick    — без лобі: клавіатура (WASD) + ?bots=N, одразу матч
 *   ?bots=N   — разом з ?quick: N ботів
 *   ?seed=N   — сід першого матчу
 *   ?debug    — fps/draw calls/затримки, window.game, клавіші 1/2 спавнять ворогів
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
// Слабке оточення для металу: без нього металеві плити й броня виходять майже чорними.
// Генерується раз (PMREM), у кадрі нічого не коштує.
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();
}
const cam = new GameCamera(window.innerWidth / window.innerHeight);
const sfx = new Sfx();
const debug = new DebugOverlay();
const arena = buildArena(createGame().config.map);
scene.add(arena.group);

// ---------- Лобі й мережа ----------

const lobby = new LobbyHost(
  () => performance.now(),
  () => crypto.randomUUID(),
);
const lobbyView = new LobbyView(lobby);
const keyboardLayout = new Map<Slot, KeyLayout>();
const ROOM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function roomCode(): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
  return s;
}

// ?net=local — без інтернету: пульти в інших вкладках цього ж origin (/controller/).
const LOCAL_NET = params.get('net') === 'local';
const transport = LOCAL_NET ? new LocalHost() : new PeerJsHost();
const controllerUrl = LOCAL_NET ? `${location.origin}/controller/` : __CONTROLLER_URL__;
const roomQuery = (code: string) => `?room=${code}${LOCAL_NET ? '&net=local' : ''}`;
transport.onLink = (link) => lobby.attach(link);

async function openRoom(): Promise<void> {
  lobbyView.setRoom('', null, controllerUrl);
  for (;;) {
    const code = roomCode();
    try {
      await transport.start(code);
      lobbyView.setRoom(roomQuery(code), code, controllerUrl);
      return;
    } catch (err) {
      // Код зайнятий — інший; сервер недоступний — повтор за кілька секунд.
      if (!(err instanceof RoomTakenError)) {
        lobbyView.setRoom('', null, controllerUrl, t.roomError);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
}
void openRoom();

// ---------- Матч ----------

class BotSource implements InputSource {
  constructor(private readonly slot: number) {}
  read(out: PlayerInput): void {
    if (match) botInput(match.game, this.slot, out);
  }
}

/** Телефон; якщо зв'язку немає довше за поріг — веде бот, повернення — знову телефон. */
class PhoneSource implements InputSource {
  private readonly bot: BotSource;
  constructor(private readonly s: Slot) {
    this.bot = new BotSource(s.index);
  }
  read(out: PlayerInput): void {
    if (lobby.botControlled(this.s)) {
      this.bot.read(out);
      return;
    }
    out.move.x = this.s.input.move.x;
    out.move.y = this.s.input.move.y;
    out.ability = this.s.input.ability;
    out.dash = this.s.input.dash;
  }
}

interface Match {
  game: Game;
  slots: Slot[];
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
  botAnnounced: boolean[];
}

let match: Match | null = null;
let countdown: number | null = null;
let seed = Number(params.get('seed') ?? Date.now() % 100000);

function startMatch(): void {
  // Телефон без зв'язку в лобі в матч не бере: інакше старт чекав би на нього.
  const order = lobby.slots.filter(
    (s): s is Slot => s !== null && s.classId !== null && (s.kind !== 'phone' || s.link !== null),
  );
  if (order.length === 0) return;
  const game = createGame(
    undefined,
    seed++,
    order.map((s) => ({ classId: s.classId! })),
  );
  lobby.beginMatch(game, order);
  const sources = order.map((s): InputSource => {
    if (s.kind === 'keyboard') return new KeyboardInput(keyboardLayout.get(s) ?? LAYOUT_WASD);
    if (s.kind === 'bot') return new BotSource(s.index);
    return new PhoneSource(s);
  });
  const playerViews = game.state.players.map((p) => {
    const v = new PlayerView(p.slot, p.classId);
    scene.add(v.root);
    return v;
  });
  const enemyR = new EnemyRenderer(scene, game.state.enemies.length);
  match = {
    game,
    slots: order,
    sources,
    inputs: game.state.players.map(() => emptyInput()),
    playerViews,
    enemyR,
    bulletR: new ProjectileRenderer(scene, game.state.projectiles.length),
    pickupR: new PickupRenderer(scene, game.state.pickups.length),
    fx: new FxDirector(scene, cam, sfx, playerViews, enemyR),
    hud: new Hud(game),
    camPoints: game.state.players.map(() => ({ x: 0, z: 0 })),
    results: null,
    botAnnounced: order.map(() => false),
  };
  lobbyView.show(false);
  if (DEBUG) (window as unknown as { game: Game }).game = game;
  const first = game.config.waves[0];
  if (first) {
    match.hud.announce(first.name, t.stationSignal, 2.5);
    sfx.stationSignal();
  }
}

function endMatch(): void {
  if (!match) return;
  const keep = new Set<THREE.Object3D>([arena.group]);
  for (const o of [...scene.children]) {
    if (keep.has(o)) continue;
    scene.remove(o);
    // Матеріали — свої в кожного вигляду; геометрії моделей спільні між матчами, їх не чіпаємо.
    o.traverse((c) => {
      const mat = (c as THREE.Mesh).material;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
  }
  match.fx.destroy();
  match.hud.destroy();
  match.results?.remove();
  match = null;
  lobby.backToLobby();
  lobbyView.show(true);
}

// ---------- Клавіатура лобі ----------

function firstLocal(kind: Slot['kind']): Slot | undefined {
  return lobby.slots.find((s): s is Slot => s !== null && s.kind === kind);
}

window.addEventListener('keydown', (e) => {
  if (match) {
    if (e.code === 'Enter' && match.results) endMatch();
    if (DEBUG && (e.code === 'Digit1' || e.code === 'Digit2')) {
      const g = match.game;
      const a = g.config.map.airlocks[g.state.tick % 4]!;
      if (e.code === 'Digit1')
        for (let k = 0; k < 4; k++)
          spawnEnemy(g, 'scout', a.x * 0.9 + (k % 2), a.y * 0.9 + (k >> 1));
      else for (let k = 0; k < 2; k++) spawnEnemy(g, 'gunner', a.x * 0.9 + k * 1.2, a.y * 0.9);
    }
    return;
  }
  const kb = firstLocal('keyboard');
  switch (e.code) {
    case 'Space': {
      // Перший клавіатурний гравець — WASD, другий — стрілки.
      const layouts = [...keyboardLayout.values()];
      const layout = !layouts.includes(LAYOUT_WASD)
        ? LAYOUT_WASD
        : !layouts.includes(LAYOUT_ARROWS)
          ? LAYOUT_ARROWS
          : null;
      if (!layout) break;
      const s = lobby.addLocal('keyboard');
      if (s) keyboardLayout.set(s, layout);
      break;
    }
    case 'KeyB':
      lobby.addLocal('bot');
      break;
    case 'KeyQ':
    case 'KeyE':
      if (kb) lobby.cycleClass(kb, e.code === 'KeyE' ? 1 : -1);
      break;
    case 'Backspace': {
      const last = [...lobby.slots].reverse().find((s) => s && s.kind !== 'phone');
      if (last) {
        keyboardLayout.delete(last);
        lobby.remove(last.index);
      }
      break;
    }
    case 'Enter':
      if (lobby.canStart() && countdown === null) countdown = 3;
      break;
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth / window.innerHeight);
});

if (params.has('quick')) {
  const s = lobby.addLocal('keyboard');
  if (s) keyboardLayout.set(s, LAYOUT_WASD);
  for (let i = 0; i < Number(params.get('bots') ?? 0); i++) lobby.addLocal('bot');
  startMatch();
}

// ---------- Кадр ----------

function handleMatchEvents(m: Match): void {
  const g = m.game;
  const ev = g.events;
  for (let i = 0; i < ev.count; i++) {
    const e = ev.list[i]!;
    m.fx.handle(e);
    if (e.type === 'playerHit') lobby.hurt(e.a, e.value);
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
let lobbyRenderAt = 0;

function frameLobby(now: number, dt: number): void {
  // Старт: усі готові → 3-2-1. Хтось зняв готовність — відлік скасовується.
  if (countdown !== null) {
    if (!lobby.canStart()) countdown = null;
    else {
      countdown -= dt;
      if (countdown <= 0) {
        countdown = null;
        startMatch();
        return;
      }
    }
  } else if (lobby.canStart() && lobby.slots.some((s) => s?.kind === 'phone')) {
    // Коли в лобі є телефони, їхня «готовність» і є стартом — екрану тиснути не треба.
    countdown = 3;
  }
  if (now - lobbyRenderAt > 200) {
    lobbyRenderAt = now;
    lobbyView.render(countdown);
  }
  cam.update([], 0, dt, now / 1000);
}

function frameMatch(m: Match, now: number, dt: number): void {
  const g = m.game;
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
    lobby.endMatch();
  }

  for (let i = 0; i < m.slots.length; i++) {
    const bot = lobby.botControlled(m.slots[i]!);
    if (bot && !m.botAnnounced[i] && m.slots[i]!.kind === 'phone')
      m.hud.announce(t.botTookOver(i + 1), '', 2.5);
    m.botAnnounced[i] = bot;
  }

  const ps = g.state.players;
  const allDown = ps.every((q) => q.down);
  let live = 0;
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i]!;
    m.playerViews[i]!.update(p, alpha, dt, time);
    // Камера тримає в кадрі живих; якщо впали всі — усіх.
    if (!p.down || allDown) {
      m.camPoints[live]!.x = toX(p.x);
      m.camPoints[live]!.z = toZ(p.y);
      live++;
    }
  }
  m.enemyR.update(g.state.enemies, ps, alpha, dt, time);
  m.bulletR.update(g.state.projectiles, alpha);
  m.pickupR.update(g.state.pickups, alpha, time);
  m.fx.update(g, dt);
  cam.update(m.camPoints, live, dt, time);
  m.enemyR.updateBars(g.state.enemies, alpha, cam.camera);
  m.hud.update(g, cam.camera, dt);
}

function debugLine(): string {
  const parts: string[] = [];
  for (const s of lobby.slots) {
    if (s?.kind !== 'phone') continue;
    parts.push(
      `P${s.index + 1} ${s.link ? (Number.isNaN(s.rtt) ? '…' : `${Math.round(s.rtt)}ms`) : 'off'}`,
    );
  }
  return parts.join('  ');
}

function frame(now: number): void {
  // Обмеження кадру: після вкладки у фоні не наздоганяємо сотні кроків.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  lobby.update();
  if (match) frameMatch(match, now, dt);
  else frameLobby(now, dt);
  arena.update(now / 1000);
  renderer.render(scene, cam.camera);
  debug.frame(dt, renderer, debugLine());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
