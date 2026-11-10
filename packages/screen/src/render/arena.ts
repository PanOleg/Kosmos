import * as THREE from 'three';
import { buildDecor } from './decor';
import type { MapDef, Obstacle } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';
import { batchStatic } from './mesh';
import {
  airlockDoor,
  containerSide,
  floorTiles,
  floorWetness,
  hazardStripe,
  reactorBands,
  screenTexture,
  wallPanels,
} from './textures';

export interface ArenaView {
  group: THREE.Group;
  update(time: number): void;
  /** Темрява фази 1 Ядра: 0 — звичайне світло, 1 — вимкнене (лишаються емісиви й ліхтарі гравців). */
  setDarkness(k: number): void;
  /** Ховає колону й клітку реактора, поки на ньому стоїть Ядро. */
  setReactorVisible(on: boolean): void;
  /** Небо, серпанок, сила оточення й експозиція — у кожної карти свої (п. 49). */
  sky: ArenaSky;
}

export interface ArenaSky {
  background: number;
  fog: number;
  fogDensity: number;
  env: number;
  exposure: number;
  /** Поріг і сила bloom. */
  bloom: [number, number];
}

interface FlickerLight {
  light?: THREE.PointLight;
  base: number;
  phase: number;
  emissive?: THREE.MeshStandardMaterial;
}

const WEST_START = (Math.PI * 3) / 4;
const WEST_LEN = Math.PI / 2;

export function buildArena(map: MapDef): ArenaView {
  const g = new THREE.Group();
  const R = map.radius;
  const flick: FlickerLight[] = [];

  // Підлога: металеві плити 2×2 м з швами (як на концепті hud.jpg), чотири сектори різного відтінку.
  const tiles = floorTiles();
  // UV кола покривають діаметр: R повторів = плита 2 м.
  tiles.repeat.set(R, R);
  // Калюжі на всю арену: темне в карті = гладке, там відбиваються лампи.
  const wet = floorWetness();
  const sectorColors = [PALETTE.floor, PALETTE.floorLab, PALETTE.floorGreen, PALETTE.floorDeck];
  for (let s = 0; s < 4; s++) {
    // Сектор s центрований на куті π/2 − s·π/2 (північ, схід, південь, захід).
    const mid = Math.PI / 2 - (s * Math.PI) / 2;
    const geo = new THREE.CircleGeometry(R, 32, mid - Math.PI / 4, Math.PI / 2);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: sectorColors[s],
        map: tiles,
        roughnessMap: wet,
        roughness: 1,
        metalness: 0.5,
      }),
    );
    m.receiveShadow = true;
    g.add(m);
  }
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: PALETTE.floorCenter,
      map: tiles,
      roughnessMap: wet,
      roughness: 0.9,
      metalness: 0.55,
    }),
  );
  center.position.y = 0.005;
  center.receiveShadow = true;
  g.add(center);

  // Розмітка: кільця й радіальні лінії — дають масштаб і швидкість на око.
  const lineMat = new THREE.MeshBasicMaterial({
    color: PALETTE.line,
    transparent: true,
    opacity: 0.35,
  });
  for (const r of [10, 20]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r - 0.06, r + 0.06, 96).rotateX(-Math.PI / 2),
      lineMat,
    );
    ring.position.y = 0.01;
    g.add(ring);
  }

  // Обшивка станції навколо арени, крім заходу — там ілюмінатор у космос.
  const hull = new THREE.Mesh(
    new THREE.RingGeometry(
      R + 0.4,
      R + 60,
      64,
      1,
      WEST_START + WEST_LEN,
      Math.PI * 2 - WEST_LEN,
    ).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.hull, roughness: 0.9 }),
  );
  hull.position.y = 2.6;
  g.add(hull);

  // Зовнішня стіна сегментами; на заході — низька рама ілюмінатора.
  const segs = 48;
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x6a6e78,
    map: wallPanels(),
    roughness: 0.6,
    metalness: 0.45,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x5a6070,
    roughness: 0.4,
    metalness: 0.6,
  });
  const segLen = ((Math.PI * 2 * R) / segs) * 1.02;
  for (let i = 0; i < segs; i++) {
    const a = ((i + 0.5) / segs) * Math.PI * 2;
    const inWest = angleIn(a, WEST_START, WEST_LEN);
    const h = inWest ? 0.4 : 2.6;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(segLen, h, 0.8), inWest ? frameMat : wallMat);
    wall.position.set(Math.cos(a) * (R + 0.4), h / 2, -Math.sin(a) * (R + 0.4));
    wall.rotation.y = a + Math.PI / 2;
    wall.castShadow = !inWest;
    wall.receiveShadow = true;
    g.add(wall);
  }
  // Скло ілюмінатора: ледь помітний відблиск.
  const glassRing = new THREE.Mesh(
    new THREE.RingGeometry(R + 0.8, R + 14, 48, 1, WEST_START, WEST_LEN).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x6fb8ff,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
    }),
  );
  glassRing.position.y = 0.3;
  g.add(glassRing);
  // Ребра рами.
  for (let i = 0; i <= 6; i++) {
    const a = WEST_START + (WEST_LEN * i) / 6;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(14, 0.25, 0.3), frameMat);
    rib.position.set(Math.cos(a) * (R + 7.5), 0.3, -Math.sin(a) * (R + 7.5));
    rib.rotation.y = a;
    g.add(rib);
  }

  // Космос: зорі й планета під станцією на заході.
  const stars = makeStars();
  g.add(stars);
  const planet = makePlanet();
  planet.userData.dynamic = true;
  planet.position.set(-R - 55, -70, 0);
  g.add(planet);

  // Перешкоди.
  let reactor: THREE.Object3D | null = null;
  for (const o of map.obstacles) {
    const obj = makeObstacle(o);
    // Реактор не пакується: у бою з Ядром його ховає тіло боса.
    if (o.kind === 'circle' && o.tag === 'core') {
      obj.userData.dynamic = true;
      reactor = obj;
    }
    g.add(obj);
  }

  // Шлюзи: двері з маркуванням і написом, червоні лампи обабіч, смуга небезпеки на підлозі.
  const lockNames = ['ШЛЮЗ ПН', 'ШЛЮЗ СХ', 'ШЛЮЗ ПД', 'ШЛЮЗ ЗХ'];
  const stripeTex = hazardStripe();
  const lockLampMat = new THREE.MeshStandardMaterial({
    color: PALETTE.emergencyRed,
    emissive: PALETTE.emergencyRed,
    emissiveIntensity: 2.4,
  });
  for (const a of map.airlocks) {
    const ang = Math.atan2(a.y, a.x);
    const grp = new THREE.Group();
    const doorMat = new THREE.MeshStandardMaterial({
      map: airlockDoor(lockNames[a.sector] ?? 'ШЛЮЗ'),
      metalness: 0.5,
      roughness: 0.5,
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 0.3), [
      wallMat,
      wallMat,
      wallMat,
      wallMat,
      doorMat,
      wallMat,
    ]);
    door.position.y = 1.3;
    grp.add(door);
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.4, 0.2), lockLampMat);
      lamp.position.set(side * 2.5, 1.4, 0.12);
      grp.add(lamp);
    }
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 0.9).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }),
    );
    stripe.position.set(0, 0.015, 0.9);
    grp.add(stripe);
    // Двері на стіні, лицем до центру арени.
    grp.position.set(toX(Math.cos(ang) * (R + 0.05)), 0, toZ(Math.sin(ang) * (R + 0.05)));
    grp.rotation.y = Math.atan2(-toX(Math.cos(ang)), -toZ(Math.sin(ang)));
    g.add(grp);
  }
  flick.push({ base: 0, phase: 4.1, emissive: lockLampMat });
  for (const v of map.vents) {
    const vent = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.3, 6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x555b66, transparent: true, opacity: 0.5 }),
    );
    vent.position.set(toX(v.x), 0.014, toZ(v.y));
    g.add(vent);
  }

  // Світло. Мало точкових джерел — інтегрована графіка; решту настрою дають емісивні смуги.
  // Розсіяне світло з червонуватим відтінком: станція залита аварійним світлом.
  const hemi = new THREE.HemisphereLight(0x9a8a96, 0x3a1410, 1.25);
  g.add(hemi);
  const moon = new THREE.DirectionalLight(0xb0c0e0, 1.2);
  moon.position.set(-30, 40, 10);
  moon.target.position.set(0, 0, 0);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  const sc = moon.shadow.camera;
  sc.left = -R;
  sc.right = R;
  sc.top = R;
  sc.bottom = -R;
  sc.near = 1;
  sc.far = 120;
  moon.shadow.bias = -0.0008;
  g.add(moon, moon.target);

  const coreLight = new THREE.PointLight(PALETTE.core, 75, 28, 1.5);
  coreLight.position.set(0, 3, 0);
  g.add(coreLight);
  flick.push({ light: coreLight, base: 75, phase: 0 });

  // Світло секторів за картою-концептом: вантажний — червоне аварійне, лабораторія — холодне
  // блакитне, оранжерея — тепле жовте, палуба — червоне аварійне. По одному джерелу на сектор.
  const sectorLight = [
    PALETTE.emergencyRed,
    PALETTE.labLight,
    PALETTE.workLight,
    PALETTE.emergencyRed,
  ];
  for (let s = 0; s < 4; s++) {
    const a = Math.PI / 2 - (s * Math.PI) / 2;
    const color = sectorLight[s]!;
    // На висоті 8 м: нижче верхівки кущів і контейнерів підходять надто близько й пересвічуються.
    const base = s === 2 ? 45 : 70;
    const l = new THREE.PointLight(color, base, 34, 1.4);
    l.position.set(Math.cos(a) * (R - 9), 8, -Math.sin(a) * (R - 9));
    g.add(l);
    flick.push({ light: l, base, phase: s * 1.7 + 0.3 });
  }

  // Червоні аварійні лампи по периметру стіни (лише емісив, без джерел світла) і жовті
  // робочі смуги внизу — ритм кола, як на концепті.
  const redMat = new THREE.MeshStandardMaterial({
    color: PALETTE.emergencyRed,
    emissive: PALETTE.emergencyRed,
    emissiveIntensity: 2.2,
  });
  const workMat = new THREE.MeshStandardMaterial({
    color: PALETTE.workLight,
    emissive: PALETTE.workLight,
    emissiveIntensity: 1.2,
  });
  const lampGeo = new THREE.BoxGeometry(1.1, 0.35, 0.2);
  const stripGeo = new THREE.BoxGeometry(1.6, 0.08, 0.1);
  for (let i = 0; i < 24; i++) {
    const a = ((i + 0.5) / 24) * Math.PI * 2;
    if (angleIn(a, WEST_START, WEST_LEN)) continue;
    const lamp = new THREE.Mesh(lampGeo, redMat);
    lamp.position.set(Math.cos(a) * (R - 0.05), 2.2, -Math.sin(a) * (R - 0.05));
    lamp.rotation.y = a + Math.PI / 2;
    g.add(lamp);
    const strip = new THREE.Mesh(stripGeo, workMat);
    strip.position.set(Math.cos(a + 0.06) * (R - 0.05), 0.5, -Math.sin(a + 0.06) * (R - 0.05));
    strip.rotation.y = a + Math.PI / 2;
    g.add(strip);
  }
  // Лампи мерехтять окремо від джерел світла: лише емісив.
  flick.push({ base: 0, phase: 2.2, emissive: redMat });

  // Сонячні панелі назовні корпусу — силует орбітальної станції.
  const panelMat = new THREE.MeshStandardMaterial({
    color: 0x1d3a6e,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x0a1a3a,
    emissiveIntensity: 0.5,
  });
  const strutMat = new THREE.MeshStandardMaterial({
    color: 0x555b66,
    metalness: 0.7,
    roughness: 0.5,
  });
  for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
    const grp = new THREE.Group();
    const strut = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, 0.4), strutMat);
    strut.position.x = 7;
    grp.add(strut);
    for (const off of [-3, 3]) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(9, 0.15, 4.5), panelMat);
      panel.position.set(12, 0, off);
      grp.add(panel);
    }
    grp.position.set(Math.cos(a) * (R + 2), 1.5, -Math.sin(a) * (R + 2));
    grp.rotation.y = a;
    g.add(grp);
  }

  // Наповнення відсіків (труби, розмітка, обладнання, трава) — вже злите у три меші.
  g.add(buildDecor(map));

  // Сотні деталей реквізиту → десятки draw call. Мерехтливі лампи лишаються окремими:
  // їхні матеріали спільні, тож злиття не заважає анімації емісиву.
  // ?nobatch — без злиття, для налагодження вигляду окремих деталей.
  if (!new URLSearchParams(location.search).has('nobatch')) batchStatic(g);

  let dark = 0;
  return {
    group: g,
    sky: {
      background: PALETTE.bg,
      fog: 0x0a0507,
      fogDensity: 0.007,
      env: 0.32,
      exposure: 1.1,
      bloom: [0.9, 0.55],
    },
    setDarkness(k: number) {
      dark = k;
    },
    setReactorVisible(on: boolean) {
      if (reactor) reactor.visible = on;
    },
    update(time: number) {
      // У темряві лишається дрібка розсіяного світла, щоб силуети не зникали зовсім.
      const lit = 1 - 0.92 * dark;
      hemi.intensity = 1.25 * (1 - 0.8 * dark);
      moon.intensity = 1.2 * lit;
      planet.rotation.y = time * 0.01;
      stars.rotation.y = time * 0.002;
      for (const f of flick) {
        // Мерехтіння: повільна хвиля + рідкісні короткі провали.
        const slow = 0.85 + 0.15 * Math.sin(time * 2.1 + f.phase);
        const glitch = Math.sin(time * 37 + f.phase * 13) > 0.97 ? 0.25 : 1;
        if (f.light) f.light.intensity = f.base * slow * glitch * lit;
        if (f.emissive) f.emissive.emissiveIntensity = 2 * slow * glitch;
      }
    },
  };
}

function angleIn(a: number, start: number, length: number): boolean {
  const d = (((a - start) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return d <= length;
}

const containerGeo = new THREE.BoxGeometry(1, 1, 1);
const containerTex = new Map<string, THREE.Texture>();
let containerSeq = 0;
const screenRed = screenTexture('#ff5a3a');
const screenBlue = screenTexture('#7cc8ff');
const darkMetal = new THREE.MeshStandardMaterial({
  color: 0x2a2d33,
  metalness: 0.6,
  roughness: 0.45,
});
const trimMat = new THREE.MeshStandardMaterial({ color: 0xd0a020, metalness: 0.4, roughness: 0.5 });
const rimStripe = (() => {
  const t = hazardStripe();
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(0.6, 1);
  return t;
})();
const rimMat = new THREE.MeshStandardMaterial({
  color: 0x9a9aa0,
  map: rimStripe,
  metalness: 0.4,
  roughness: 0.55,
});
const tableTop = new THREE.MeshStandardMaterial({
  color: 0x8a909c,
  metalness: 0.7,
  roughness: 0.3,
});
const planterMat = new THREE.MeshStandardMaterial({ color: PALETTE.planter, roughness: 0.9 });
const dividerMat = new THREE.MeshStandardMaterial({
  color: 0x5a5e68,
  map: wallPanels(),
  roughness: 0.6,
  metalness: 0.45,
});
const dividerLight = new THREE.MeshStandardMaterial({
  color: PALETTE.emergencyRed,
  emissive: PALETTE.emergencyRed,
  emissiveIntensity: 1.8,
});

const screenMats = new Map<THREE.Texture, THREE.MeshStandardMaterial>();
/** Матеріал екрана кешується за текстурою: однакові матеріали зливаються в один draw call. */
function screenMat(tex: THREE.Texture): THREE.MeshStandardMaterial {
  let m = screenMats.get(tex);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: 0x000000,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: 1.3,
    });
    screenMats.set(tex, m);
  }
  return m;
}

function makeObstacle(o: Obstacle): THREE.Object3D {
  if (o.kind === 'circle') {
    if (o.tag === 'core') return makeCore(o.r, o.height);
    return makePlanter(o.x, o.y, o.r, o.height);
  }
  const grp = new THREE.Group();
  grp.position.set(toX(o.x), 0, toZ(o.y));
  grp.rotation.y = o.rot;
  const w = o.hw * 2;
  const d = o.hh * 2;
  const box = (
    mat: THREE.Material,
    sx: number,
    sy: number,
    sz: number,
    x = 0,
    y = sy / 2,
    z = 0,
  ) => {
    const m = new THREE.Mesh(containerGeo, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    grp.add(m);
    return m;
  };

  switch (o.tag) {
    case 'container': {
      // Гофрований контейнер із номером і жовтими кутниками (концепти map.jpg і hud.jpg).
      const label = `B-${String(++containerSeq).padStart(2, '0')}`;
      let tex = containerTex.get(label);
      if (!tex) {
        tex = containerSide(label);
        containerTex.set(label, tex);
      }
      const idx = Math.abs(Math.round(o.x * 7 + o.y * 3)) % PALETTE.container.length;
      box(
        new THREE.MeshStandardMaterial({
          color: PALETTE.container[idx],
          map: tex,
          roughness: 0.6,
          metalness: 0.45,
        }),
        w,
        o.height,
        d,
      );
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          box(
            trimMat,
            0.12,
            o.height + 0.02,
            0.12,
            (sx * w) / 2,
            (o.height + 0.02) / 2,
            (sz * d) / 2,
          );
      break;
    }
    case 'glass': {
      box(
        new THREE.MeshStandardMaterial({
          color: PALETTE.glass,
          transparent: true,
          opacity: 0.18,
          roughness: 0.05,
          metalness: 0.2,
          emissive: PALETTE.glass,
          emissiveIntensity: 0.12,
          depthWrite: false,
        }),
        w,
        o.height,
        d,
      ).castShadow = false;
      // Металева рама скла: зверху й по краях.
      const long = w > d;
      box(darkMetal, long ? w : 0.12, 0.1, long ? 0.12 : d, 0, o.height, 0);
      for (const e of [-1, 1])
        box(
          darkMetal,
          0.12,
          o.height,
          0.12,
          long ? (e * w) / 2 : 0,
          o.height / 2,
          long ? 0 : (e * d) / 2,
        );
      break;
    }
    case 'table': {
      // Лабораторний стіл: стільниця на тумбі й монітори з холодним світлом.
      box(darkMetal, w * 0.9, o.height - 0.08, d * 0.8);
      box(tableTop, w, 0.08, d, 0, o.height - 0.04, 0);
      const n = Math.max(1, Math.round(Math.max(w, d) / 1.2));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const scr = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.04), [
          darkMetal,
          darkMetal,
          darkMetal,
          darkMetal,
          screenMat(screenBlue),
          darkMetal,
        ]);
        scr.position.set(w > d ? t * w : 0, o.height + 0.22, w > d ? -d * 0.25 : t * d);
        if (w <= d) scr.rotation.y = Math.PI / 2;
        grp.add(scr);
      }
      break;
    }
    case 'planter': {
      // Довга грядка з рядом рослин.
      box(planterMat, w, o.height * 0.7, d);
      const n = Math.max(2, Math.round(Math.max(w, d) / 0.7));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const p = plant(0.35 + (i % 3) * 0.06, i);
        p.position.set(w > d ? t * w : 0, o.height * 0.7, w > d ? 0 : t * d);
        grp.add(p);
      }
      break;
    }
    case 'divider': {
      box(dividerMat, w, o.height, d);
      // Червона світна смуга по верху перегородки — ритм аварійного світла.
      box(dividerLight, w * 0.9, 0.06, d + 0.04, 0, o.height + 0.03, 0);
      break;
    }
    case 'rim': {
      // Бортик реакторної зали: метал зі смугою небезпеки й червоною кромкою.
      box(rimMat, w, o.height, d);
      box(dividerLight, w, 0.05, 0.12, 0, o.height + 0.025, 0);
      break;
    }
    default: {
      // Пульт реакторної зали: корпус і нахилений екран аварійного кольору.
      box(darkMetal, w, o.height * 0.8, d);
      const scr = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.04, d * 0.7), [
        darkMetal,
        darkMetal,
        screenMat(screenRed),
        darkMetal,
        darkMetal,
        darkMetal,
      ]);
      scr.position.set(0, o.height * 0.85, 0);
      scr.rotation.x = -0.5;
      grp.add(scr);
    }
  }
  return grp;
}

const plantMats = [0x3f8a3c, 0x4f9a4a, 0x2f7034, 0x5aa850].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }),
);
const leafGeo = new THREE.IcosahedronGeometry(1, 0);

function plant(size: number, seed: number): THREE.Object3D {
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    // Сід буває від'ємним (південь арени), а остача в JS — теж: нормалізуємо індекс.
    const n = plantMats.length;
    const m = new THREE.Mesh(leafGeo, plantMats[(((seed + k) % n) + n) % n]!);
    const a = seed * 2.4 + k * 2.1;
    m.position.set(Math.cos(a) * size * 0.4, size * (0.5 + k * 0.25), Math.sin(a) * size * 0.4);
    m.scale.set(size * 0.6, size * 0.8, size * 0.6);
    m.rotation.set(a, a * 0.7, 0);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

function makePlanter(x: number, y: number, r: number, h: number): THREE.Object3D {
  // Клумба: бетонна чаша й густий кущ із кількох куп листя різних відтінків.
  const grp = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h * 0.6, 20), planterMat);
  pot.position.y = h * 0.3;
  pot.castShadow = pot.receiveShadow = true;
  grp.add(pot);
  const n = 5 + Math.round(r * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + x;
    const rr = i === 0 ? 0 : r * 0.55;
    const p = plant(r * (i === 0 ? 1.1 : 0.7), i + Math.round(y));
    p.position.set(Math.cos(a) * rr, h * 0.6, Math.sin(a) * rr);
    grp.add(p);
  }
  grp.position.set(toX(x), 0, toZ(y));
  return grp;
}

function makeCore(r: number, h: number): THREE.Object3D {
  // Реактор: колона зі смугами енергії (не суцільна пляма під bloom), клітка зі стійок і кілець.
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.15, 0.8, 32),
    new THREE.MeshStandardMaterial({ color: 0x2b2d33, metalness: 0.7, roughness: 0.4 }),
  );
  base.position.y = 0.4;
  base.receiveShadow = base.castShadow = true;
  g.add(base);
  const bands = reactorBands();
  bands.repeat.set(1, 2);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, h, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0x200404,
      emissive: 0xffffff,
      emissiveMap: bands,
      emissiveIntensity: 1.6,
    }),
  );
  column.position.y = h / 2;
  g.add(column);
  const metal = new THREE.MeshStandardMaterial({ color: 0x6a6e78, metalness: 0.8, roughness: 0.3 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.18, h + 0.6, 0.18), metal);
    strut.position.set(Math.cos(a) * r * 0.72, (h + 0.6) / 2, Math.sin(a) * r * 0.72);
    strut.castShadow = true;
    g.add(strut);
  }
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.75, 0.1, 8, 32), metal);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2 + i * 1.2;
    g.add(ring);
  }
  // Верхнє кільце замість суцільної кришки: згори видно світло колони.
  const cap = new THREE.Mesh(new THREE.TorusGeometry(r * 0.72, 0.16, 8, 32), metal);
  cap.rotation.x = Math.PI / 2;
  cap.position.y = h + 0.6;
  g.add(cap);
  // Смуга небезпеки навколо основи.
  const stripeTex = hazardStripe();
  stripeTex.wrapS = THREE.RepeatWrapping;
  stripeTex.repeat.set(8, 1);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(r * 1.2, r * 1.45, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.7 }),
  );
  ring.position.y = 0.02;
  g.add(ring);
  return g;
}

function makeStars(): THREE.Points {
  const n = 1500;
  const pos = new Float32Array(n * 3);
  // Детермінізм рендеру не потрібен, але хай зоряне небо однакове між запусками.
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 40 + rnd() * 160;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = -20 - rnd() * 120;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xc8d4ff, size: 0.35, sizeAttenuation: true }),
  );
}

function makePlanet(): THREE.Object3D {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2a3f6a');
  grad.addColorStop(0.5, '#5a7aa8');
  grad.addColorStop(1, '#1d2b4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  // Смуги хмар.
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(${200 + (i % 3) * 15}, ${210 + (i % 2) * 20}, 240, ${0.05 + (i % 5) * 0.03})`;
    const y = (i * 37) % 256;
    ctx.fillRect(0, y, 512, 3 + (i % 7));
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(48, 48, 32),
    new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 1,
      emissive: 0x1a2a50,
      emissiveIntensity: 0.4,
    }),
  );
  planet.rotation.z = 0.3;
  g.add(planet);
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(50, 48, 32),
    new THREE.MeshBasicMaterial({
      color: 0x6fa8ff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    }),
  );
  g.add(atmo);
  return g;
}
