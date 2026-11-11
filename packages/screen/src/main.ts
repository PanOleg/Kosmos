import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  createGame,
  matchSummary,
  stormPhase,
  buildConfig,
  step,
  spawnEnemy,
  botInput,
  DT,
  type ClassId,
  type EnemyType,
  type Game,
  type PlayerInput,
  type SessionSettings,
} from '@horizon/sim';
import { emptyInput } from '@horizon/sim/protocol';
import { buildArena, type ArenaView } from './render/arena';
import { createAmbience, type Ambience } from './render/ambience';
import { HelpOverlay } from './ui/help';
import { nextHint } from './meta/hint';
import { buildDesertArena } from './render/desertArena';
import { Music, type MusicLevel } from './audio/music';
import { Voice } from './audio/voice';
import { loadAudioPrefs, saveAudioPrefs, type AudioChannel } from './audio/prefs';
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
import { PostFx } from './render/post';
import { AbilityRenderer } from './render/abilities';
import { PropRenderer, RocketRenderer } from './render/hazards';
import { BossRenderer } from './render/boss';
import { models } from './render/models';
import { Hud } from './ui/hud';
import { showResults, type ResultsView } from './ui/results';
import { dayNumber, loadProgress, recordMatch, saveProgress } from './meta/progress';
import { LobbyView } from './ui/lobby';
import { t } from './ui/i18n';
import { LobbyHost, PAUSE_BY_SCREEN, type Slot } from './net/lobby';
import { PeerJsHost } from './net/peerjsHost';
import { LocalHost } from './net/localHost';
import { RoomTakenError } from './net/transport';

/**
 * Параметри розробника в URL:
 *   ?quick    — без лобі: клавіатура (WASD) + ?bots=N, одразу матч
 *   ?bots=N   — разом з ?quick: N ботів
 *   ?seed=N   — сід першого матчу
 *   ?debug    — fps/draw calls/затримки, window.game, F1/F2 спавнять ворогів
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
// Легкий серпанок: далеке темнішає, як у задимленій станції на макеті.
scene.fog = new THREE.FogExp2(0x0a0507, 0.007);
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
const music = new Music(() => sfx.audio());
const voice = new Voice(() => sfx.audio());
voice.onSpeaking = (on) => music.setDucked(on);

// Музика / звуки / озвучка окремо (DECISIONS.md, п. 53): пульт на паузі, N / J / V, лобі.
const audioPrefs = loadAudioPrefs();
function applyAudio(): void {
  music.setMuted(!audioPrefs.music);
  sfx.setEnabled(audioPrefs.sfx);
  voice.setEnabled(audioPrefs.voice);
  lobby.audio = { ...audioPrefs };
}
function toggleAudio(what: AudioChannel): void {
  audioPrefs[what] = !audioPrefs[what];
  saveAudioPrefs(audioPrefs);
  applyAudio();
  lobbyView.setAudio(audioPrefs);
  match?.hud.announce(t.audioName[what] ?? what, audioPrefs[what] ? t.audioOn : t.audioOff, 1.2);
}
if (DEBUG) Object.assign(window as unknown as Record<string, unknown>, { sfx, music, voice });
const debug = new DebugOverlay();
// ?lowfx — без постобробки, для слабких ноутбуків.
const LOWFX = params.has('lowfx');
const post = new PostFx(renderer, scene, cam.camera, !LOWFX);
renderer.info.autoReset = false;
if (DEBUG) {
  // Замір вартості кадру: N рендерів підряд, readPixels змушує GPU доробити все до кінця.
  (window as unknown as { bench: (n?: number) => number }).bench = (n = 30) => {
    const px = new Uint8Array(4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) post.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return (performance.now() - t0) / n;
  };
}

// ---------- Лобі й мережа ----------

const lobby = new LobbyHost(
  () => performance.now(),
  // randomUUID — лише в захищеному контексті; екран за http://<LAN-IP> його не має.
  () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(36)).join(''),
);
const lobbyView = new LobbyView(lobby);
const help = new HelpOverlay();

/** Арена вибраної в лобі карти: своє небо, серпанок і світло (DECISIONS.md, п. 49). */
let envBase = 0.32;
let fogBase = 0.007;
/** 0..1 — сила бурі на екрані (серпанок густішає плавно). */
let stormK = 0;
let ambience: Ambience | null = null;
function makeArena(settings: SessionSettings): ArenaView {
  const map = buildConfig(settings).map;
  const a = map.id === 'station' ? buildArena(map) : buildDesertArena(map);
  fogBase = a.sky.fogDensity;
  (scene.background as THREE.Color).setHex(a.sky.background);
  (scene.fog as THREE.FogExp2).color.setHex(a.sky.fog);
  (scene.fog as THREE.FogExp2).density = a.sky.fogDensity;
  renderer.toneMappingExposure = a.sky.exposure;
  post.setBloom(...a.sky.bloom);
  post.setGrade(a.sky.grade);
  envBase = a.sky.env;
  // Звук за картою (п. 50–51): своя музика й фон; у пустелі ще ріг і піщані пориви.
  // Крига — надворі, як пустеля (вітер, ріг, рація), але з холодною електронікою станції.
  sfx.theme = map.id === 'station' ? 'station' : 'desert';
  music.setTheme(map.id);
  voice.setTheme(map.id === 'station' ? 'station' : 'desert');
  scene.environmentIntensity = envBase;
  ambience = createAmbience(map.id);
  a.group.add(ambience.group);
  scene.add(a.group);
  return a;
}
let currentMapId = buildConfig(lobbyView.settings).map.id;
let arena = makeArena(lobbyView.settings);
lobbyView.onSettingsChange = (s) => {
  if (match || buildConfig(s).map.id === currentMapId) return;
  scene.remove(arena.group);
  arena.group.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
  arena = makeArena(s);
  currentMapId = buildConfig(s).map.id;
};

// Мета-прогрес екіпажу (DECISIONS.md, п. 48): рекорди, досягнення, щоденний контракт.
const store = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
const progress = loadProgress(store);
lobbyView.setProgress(progress, dayNumber(new Date()));
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
// Відносна адреса (продакшн: пульт поруч з екраном) — повна, бо QR сканує інший пристрій.
const controllerUrl = LOCAL_NET
  ? `${location.origin}/controller/`
  : new URL(__CONTROLLER_URL__, location.href).href;
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

/** Останній заклик «Сюди!»: хто й до якого моменту (performance.now). */
let rally: { slot: number; until: number } | null = null;

class BotSource implements InputSource {
  constructor(private readonly slot: number) {}
  read(out: PlayerInput): void {
    if (!match) return;
    // «Сюди!» від живого гравця: боти 5 с ідуть до нього.
    const caller =
      rally && performance.now() < rally.until && rally.slot !== this.slot
        ? match.game.state.players[rally.slot]
        : null;
    botInput(match.game, this.slot, out, caller && !caller.down ? caller : null);
    // ?debug: window.forceAbility = true — боти тиснуть здібність, щойно вона готова (огляд ефектів).
    if (DEBUG && (window as unknown as { forceAbility?: boolean }).forceAbility)
      out.ability = match.game.state.tick % 2 === 0;
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
    out.buy = this.s.input.buy;
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
  abilityR: AbilityRenderer;
  rocketR: RocketRenderer;
  propR: PropRenderer;
  bossR: BossRenderer;
  hud: Hud;
  camPoints: { x: number; z: number }[];
  results: ResultsView | null;
  /** Коли показали результати, мс: через RESULTS_AUTO_MS — назад у лобі. */
  resultsAt: number;
  botAnnounced: boolean[];
  /** Вбивства гравців за поточну хвилю — для «найкращого у хвилі». */
  waveKills: number[];
  classes: ClassId[];
}

let match: Match | null = null;
const RESULTS_AUTO_MS = 60000;
lobby.onAgain = () => endMatch();
lobby.onAudio = (what) => toggleAudio(what);
lobby.onPing = (slot) => {
  if (!match || match.results) return;
  match.hud.ping(slot);
  sfx.ping();
  rally = { slot, until: performance.now() + 5000 };
};
applyAudio();
lobbyView.setAudio(audioPrefs);
lobbyView.onAudioToggle = (what) => toggleAudio(what);
let countdown: number | null = null;
let seed = Number(params.get('seed') ?? Date.now() % 100000);

function startMatch(): void {
  // Телефон без зв'язку в лобі в матч не бере: інакше старт чекав би на нього.
  const order = lobby.slots.filter(
    (s): s is Slot => s !== null && s.classId !== null && (s.kind !== 'phone' || s.link !== null),
  );
  if (order.length === 0) return;
  const game = createGame(
    buildConfig(lobbyView.settings),
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
    const v = new PlayerView(p.slot, p.classId, order[p.slot]?.skin);
    scene.add(v.root);
    return v;
  });
  const enemyR = new EnemyRenderer(
    scene,
    game.state.enemies.length,
    arena.sky.enemyTint,
    game.config.map.id,
  );
  const fx = new FxDirector(scene, cam, sfx, playerViews, enemyR);
  match = {
    game,
    slots: order,
    sources,
    inputs: game.state.players.map(() => emptyInput()),
    playerViews,
    enemyR,
    bulletR: new ProjectileRenderer(scene, game.state.projectiles.length),
    pickupR: new PickupRenderer(scene, game.state.pickups.length),
    fx,
    rocketR: new RocketRenderer(scene, game.state.rockets.length),
    propR: new PropRenderer(scene, game.state.props.length),
    bossR: new BossRenderer(scene, game.config.map),
    abilityR: new AbilityRenderer(
      scene,
      fx.sparks,
      sfx,
      cam,
      game.state.players.length,
      game.state.barriers.length,
    ),
    hud: new Hud(game),
    camPoints: game.state.players.map(() => ({ x: 0, z: 0 })),
    results: null,
    resultsAt: 0,
    botAnnounced: order.map(() => false),
    waveKills: order.map(() => 0),
    classes: game.state.players.map((p) => p.classId),
  };
  lobbyView.show(false);
  help.setButtonVisible(false);
  if (DEBUG) {
    (window as unknown as { game: Game }).game = game;
    // window.spawn('kamikaze', 3) — будь-який ворог біля випадкового люка/шлюзу.
    (window as unknown as { spawn: (t: EnemyType, n?: number) => void }).spawn = (t, n = 1) => {
      const pts = ['wasp', 'kamikaze', 'sniper', 'swarm'].includes(t)
        ? game.config.map.vents
        : game.config.map.airlocks;
      const a = pts[game.state.tick % pts.length]!;
      for (let k = 0; k < n; k++)
        spawnEnemy(
          game,
          t,
          a.x * 0.9 + (k % 3),
          a.y * 0.9 + Math.floor(k / 3),
          t === 'swarm' ? 15 : -1,
        );
    };
  }
  const first = game.config.waves[0];
  if (first) {
    match.hud.announce(first.name, t.stationSignal, 2.5);
    voice.say(game.config.map.id === 'station' ? 'start' : 'startDesert', 2);
    const active = lobbyView.settings.modifiers ?? [];
    if (active.length || lobbyView.settings.endless)
      window.setTimeout(
        () =>
          match?.hud.announce(
            t.modsActive(
              [
                ...active.map((m) => t.modName2[m]),
                ...(lobbyView.settings.endless ? [`∞ ${t.endless}`] : []),
              ].join(' · '),
            ),
            '',
            3,
          ),
        2700,
      );
    voice.say('wave1', 1);
    sfx.stationSignal();
    // Особливості карти — у перших трьох матчах на ній (лічильник на цьому екрані).
    const tips = t.mapTip[game.config.map.id];
    if (tips) {
      const key = `horizon-maptips-${game.config.map.id}`;
      let seen = 0;
      try {
        seen = Number(store?.getItem(key) ?? 0) || 0;
        store?.setItem(key, String(seen + 1));
      } catch {
        // Сховище недоступне — просто показуємо щоразу.
      }
      if (seen < 3) match.hud.showTips(tips);
    }
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
  arena.setDarkness(0);
  arena.setReactorVisible(true);
  scene.environmentIntensity = envBase;
  stormK = 0;
  (scene.fog as THREE.FogExp2).density = fogBase;
  match.fx.destroy();
  match.hud.destroy();
  match.results?.remove();
  match = null;
  lobby.backToLobby();
  lobbyView.show(true);
  help.setButtonVisible(true);
}

// ---------- Клавіатура лобі ----------

function firstLocal(kind: Slot['kind']): Slot | undefined {
  return lobby.slots.find((s): s is Slot => s !== null && s.kind === kind);
}

window.addEventListener('keydown', (e) => {
  // Звук перемикається будь-коли — і в лобі, і в матчі.
  const ch: AudioChannel | null =
    e.code === 'KeyN' ? 'music' : e.code === 'KeyJ' ? 'sfx' : e.code === 'KeyV' ? 'voice' : null;
  if (ch) {
    toggleAudio(ch);
    return;
  }
  // Довідка «Як грати» — лише в лобі; поки відкрита, інші клавіші лобі не діють.
  if (!match && (e.code === 'KeyH' || (help.open && e.code === 'Escape'))) {
    help.toggle();
    return;
  }
  if (help.open) return;
  // Повний екран — будь-коли: на телевізорі й проекторі рамка браузера лише заважає.
  if (e.code === 'KeyF' && !e.repeat) {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
    return;
  }
  if (match) {
    if (e.code === 'Enter' && match.results) endMatch();
    if ((e.code === 'Escape' || e.code === 'KeyP') && !match.results)
      lobby.togglePause(PAUSE_BY_SCREEN);
    if (DEBUG && (e.code === 'F1' || e.code === 'F2')) {
      e.preventDefault();
      const g = match.game;
      const a = g.config.map.airlocks[g.state.tick % 4]!;
      if (e.code === 'F1')
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
    case 'KeyM':
      lobbyView.cycleMap();
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
    case 'KeyD':
      lobbyView.cyclePreset();
      break;
    case 'Minus':
    case 'Equal':
      lobbyView.stepWaves(e.code === 'Equal' ? 1 : -1);
      break;
  }
});

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  cam.resize(window.innerWidth / window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// Моделі вантажаться, поки триває лобі; швидкий старт чекає на них.
const modelsReady = models.load().then((ids) => {
  if (ids.length) console.info('[models] підставлено:', ids.join(', '));
});

if (params.has('quick')) {
  void modelsReady.then(() => {
    const s = lobby.addLocal('keyboard');
    if (s) keyboardLayout.set(s, LAYOUT_WASD);
    for (let i = 0; i < Number(params.get('bots') ?? 0); i++) lobby.addLocal('bot');
    startMatch();
  });
}

// ---------- Кадр ----------

function handleMatchEvents(m: Match): void {
  const g = m.game;
  const ev = g.events;
  for (let i = 0; i < ev.count; i++) {
    const e = ev.list[i]!;
    m.fx.handle(e);
    m.abilityR.handle(e);
    if (e.type === 'playerHit') lobby.hurt(e.a, e.value);
    else if (e.type === 'purchase' || e.type === 'purchaseFail') {
      lobby.bought(e.a, e.b, e.type === 'purchase');
      if (e.type === 'purchase') {
        m.hud.purchased(e.a);
        sfx.purchase(true);
      } else sfx.purchase(false);
    }
    if (e.type === 'kill' && e.b >= 0 && e.b < m.waveKills.length) m.waveKills[e.b]!++;
    const def = g.config.waves[e.a];
    const desert = g.config.map.id === 'desert';
    if (e.type === 'wavePause' && def) {
      m.hud.announce(def.name, t.stationSignal, 2.5);
      sfx.stationSignal();
      voice.say(
        def.boss === 'foreman' ? 'foreman' : def.boss === 'core' ? 'core' : `wave${e.a + 1}`,
        def.boss ? 3 : 2,
      );
    } else if (e.type === 'revived' && e.b >= 0) {
      m.hud.announce(t.revived(e.a + 1), '', 1.6);
      voice.say('revived', 1);
    } else if (e.type === 'waveCleared' && def && e.b === 0) {
      // Найкращий у хвилі — лише для команди: одинаку це нічого не каже.
      const best = m.waveKills.indexOf(Math.max(...m.waveKills));
      const bp = g.state.players[best];
      const sub =
        g.state.players.length > 1 && bp && m.waveKills[best]! > 0
          ? t.waveBest(best + 1, t.className[bp.classId] ?? '', m.waveKills[best]!)
          : '';
      m.hud.announce(t.waveCleared, sub, sub ? 3 : 2);
      m.waveKills.fill(0);
      voice.say('cleared', 1);
    } else if (e.type === 'bossPhase') {
      m.hud.announce(t.bossPhase(e.b), e.b === 1 ? t.lightsOut : '', 2.2);
      voice.say(e.b === 1 ? (desert ? 'sandstorm' : 'lightsOut') : `phase${e.b}`, 3);
    } else if (e.type === 'airlockWarn') {
      m.hud.announce(t.airlockAlert, '', 1.5);
      voice.say(desert ? 'airlockDesert' : 'airlock', 3);
    } else if (e.type === 'stormWarn') {
      m.hud.announce(t.stormWarn, t.stormWarnSub, 2.5);
      sfx.airlockWarn(0);
    } else if (e.type === 'storm') {
      if (e.b === 1) {
        // Фраза записана лише про піщану бурю — на «Кризі» хуртовину оголошує тільки напис.
        m.hud.announce(desert ? t.stormOn : t.blizzardOn, '', 2);
        if (desert) voice.say('sandstorm', 3);
        sfx.airlockOpen(0);
      } else m.hud.announce(t.stormOff, '', 1.5);
    } else if (e.type === 'playerDown' && g.state.players.length > 1) {
      voice.say('down', 2);
    }
  }
}

let last = performance.now();
let acc = 0;
// Автоякість (DECISIONS.md, п. 44): постійно міряємо кадр у вікнах по 2 с; якщо повільніше за
// ~45 fps — крок униз і пауза 3 с на перевірку. Назад не піднімаємо: інакше якість «гойдалася б»
// разом із кількістю ворогів. Рівні: 1 — без bloom/MSAA, роздільність 1; 2 — без тіней;
// 3 — роздільність 0.75. Перше вікно після старту/зміни пропускаємо: там компіляція шейдерів.
let qLevel = LOWFX ? 1 : 0;
let qTime = 0;
let qFrames = 0;
let qSkip = 1;
function autoQuality(dt: number): void {
  // ?hifx — завжди повна якість (запис відео, вкладка в фоні на старті).
  if (qLevel >= 3 || params.has('hifx')) return;
  qTime += dt;
  qFrames++;
  if (qTime < (qSkip > 0 ? 3 : 2)) return;
  const avg = qTime / qFrames;
  qTime = 0;
  qFrames = 0;
  if (qSkip > 0) {
    qSkip--;
    return;
  }
  if (avg <= 1 / 45) return;
  qLevel++;
  qSkip = 1;
  if (qLevel === 1) {
    post.disable();
    renderer.setPixelRatio(1);
  } else if (qLevel === 2) {
    // Без проходу тіней кожен об'єкт малюється один раз, а не двічі.
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => {
      if ((o as THREE.Light).isLight) (o as THREE.Light).castShadow = false;
    });
  } else renderer.setPixelRatio(0.75);
  renderer.setSize(window.innerWidth, window.innerHeight);
  console.info(`[quality] кадр ${(avg * 1000).toFixed(1)} мс — рівень ${qLevel}`);
}
(window as unknown as { quality: () => number }).quality = () => qLevel;
let lobbyRenderAt = 0;

function frameLobby(now: number, dt: number): void {
  // Старт: усі готові → 3-2-1. Хтось зняв готовність — відлік скасовується.
  if (countdown !== null) {
    if (!lobby.canStart()) countdown = null;
    else {
      countdown -= dt;
      if (countdown <= 0) {
        countdown = null;
        void modelsReady.then(startMatch);
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
  // Пауза й відлік після неї: симуляція стоїть, рендер живе (DECISIONS.md, п. 42).
  const running = lobby.running();
  if (!running) acc = 0;
  // Хіт-стоп: симуляція стоїть кілька кадрів, рендер і частинки — ні.
  else if (m.fx.hitStop > 0) m.fx.hitStop = Math.max(0, m.fx.hitStop - dt);
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
    const summary = matchSummary(g);
    const day = dayNumber(new Date());
    const outcome = recordMatch(progress, summary, {
      preset: lobbyView.settings.preset,
      foremanWave: g.config.waves.findIndex((w) => w.boss === 'foreman') + 1,
      day,
    });
    saveProgress(store, progress);
    lobbyView.setProgress(progress, day);
    const hint = nextHint(summary, lobbyView.settings.preset);
    m.results = showResults(
      summary,
      t.preset[lobbyView.settings.preset] ?? '',
      outcome,
      hint ? (t.nextHint[hint] ?? '') : '',
    );
    voice.say(
      summary.won ? (g.config.map.id === 'station' ? 'victory' : 'victoryDesert') : 'defeat',
      3,
    );
    if (outcome.newAchievements.length) voice.say('achievement', 1);
    else if (outcome.newRecords.length) voice.say('record', 1);
    if (outcome.contractDone) voice.say('contract', 1);
    m.resultsAt = now;
    lobby.endMatch(summary);
  }
  // Без клавіатури (лише телефони) повернення в лобі — «Ще раз» на пульті або сам за хвилину.
  if (m.results) {
    const left = Math.ceil((m.resultsAt + RESULTS_AUTO_MS - now) / 1000);
    if (left <= 0) {
      endMatch();
      return;
    }
    m.results.setCountdown(left);
  }

  for (let i = 0; i < m.slots.length; i++) {
    const bot = lobby.botControlled(m.slots[i]!);
    if (bot && !m.botAnnounced[i] && m.slots[i]!.kind === 'phone') {
      m.hud.announce(t.botTookOver(i + 1), '', 2.5);
      voice.say('bot', 2);
    }
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
  m.bulletR.update(g.state.projectiles, alpha, m.classes);
  m.pickupR.update(g.state.pickups, alpha, time);
  m.fx.update(g, dt);
  m.abilityR.update(g, dt, time);
  m.rocketR.update(g.state.rockets, time);
  m.propR.update(g.state.props, dt);
  m.bossR.update(g.state.boss, g.state.enemies, ps, dt, time);
  // Фаза 1 Ядра: станція гасить світло, лишаються ліхтарі гравців і світні смуги.
  arena.setDarkness(m.bossR.darkness);
  arena.setReactorVisible(!m.bossR.present);
  scene.environmentIntensity = envBase * (1 - 0.85 * m.bossR.darkness);
  // Буря: серпанок густішає в кілька разів і так само плавно спадає.
  stormK += ((stormPhase(g) === 2 ? 1 : 0) - stormK) * Math.min(1, dt * 1.5);
  (scene.fog as THREE.FogExp2).density = fogBase * (1 + 5 * stormK);
  cam.update(m.camPoints, live, dt, time);
  m.enemyR.updateBars(g.state.enemies, alpha, cam.camera);
  m.hud.update(g, cam.camera, dt);
  m.hud.setPause(lobby.pause, lobby.resumeIn(), m.results ? [] : lobby.dropped(), g);
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

let wasPaused = false;
let wasCounting = false;

/** Інтенсивність музики: лобі й пауза між хвилями — спокій, бій, бос (Прораб і Ядро). */
function musicLevel(): MusicLevel {
  if (!match) return 'calm';
  const w = match.game.state.wave;
  if (w.phase === 'pause' || w.phase === 'done') return 'calm';
  return match.game.config.waves[w.index]?.boss ? 'boss' : 'fight';
}

function frame(now: number): void {
  // Обмеження кадру: після вкладки у фоні не наздоганяємо сотні кроків.
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (document.visibilityState === 'visible') autoQuality(dt);
  lobby.update();
  music.tick();
  music.setLevel(musicLevel());
  // Пауза й відлік — голосом.
  const paused = !!match && lobby.pause !== null;
  const counting = !!match && !paused && lobby.resumeIn() > 0;
  if (paused && !wasPaused) voice.say('pause', 2);
  if (counting && !wasCounting) voice.say('countdown', 3);
  wasPaused = paused;
  wasCounting = counting;
  music.setMuffled(!!match && (lobby.pause !== null || lobby.resumeIn() > 0 || !!match.results));
  if (match) frameMatch(match, now, dt);
  else frameLobby(now, dt);
  arena.update(now / 1000, cam.focusPoint);
  ambience?.update(now / 1000, dt, stormK);
  renderer.info.reset();
  post.render();
  debug.frame(dt, renderer, debugLine());
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
