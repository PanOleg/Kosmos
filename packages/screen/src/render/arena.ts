import * as THREE from 'three';
import type { MapDef, Obstacle } from '@horizon/sim';
import { PALETTE } from './palette';
import { toX, toZ } from './coords';

export interface ArenaView {
  group: THREE.Group;
  update(time: number): void;
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

  // Підлога: чотири сектори різного відтінку + центр.
  const sectorColors = [PALETTE.floor, PALETTE.floorLab, PALETTE.floorGreen, PALETTE.floorDeck];
  for (let s = 0; s < 4; s++) {
    // Сектор s центрований на куті π/2 − s·π/2 (північ, схід, південь, захід).
    const mid = Math.PI / 2 - (s * Math.PI) / 2;
    const geo = new THREE.CircleGeometry(R, 32, mid - Math.PI / 4, Math.PI / 2);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: sectorColors[s], roughness: 0.85, metalness: 0.2 }),
    );
    m.receiveShadow = true;
    g.add(m);
  }
  const center = new THREE.Mesh(
    new THREE.CircleGeometry(10, 48).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.floorCenter, roughness: 0.7, metalness: 0.3 }),
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
  const hazard = new THREE.Mesh(
    new THREE.RingGeometry(9.7, 10.3, 96).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: PALETTE.emergencyAmber,
      transparent: true,
      opacity: 0.18,
    }),
  );
  hazard.position.y = 0.012;
  g.add(hazard);

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
    color: PALETTE.wall,
    roughness: 0.8,
    metalness: 0.3,
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
  planet.position.set(-R - 55, -70, 0);
  g.add(planet);

  // Перешкоди.
  for (const o of map.obstacles) g.add(makeObstacle(o));

  // Шлюзи й вентиляційні люки.
  for (const a of map.airlocks) {
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.4, 0.4),
      new THREE.MeshStandardMaterial({
        color: 0x2c2f36,
        emissive: PALETTE.emergencyAmber,
        emissiveIntensity: 0.08,
        metalness: 0.6,
        roughness: 0.4,
      }),
    );
    const ang = Math.atan2(a.y, a.x);
    door.position.set(toX(a.x) * 1.05, 1.2, toZ(a.y) * 1.05);
    door.rotation.y = ang + Math.PI / 2;
    g.add(door);
    const stripe = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 0.8).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: PALETTE.emergencyAmber,
        transparent: true,
        opacity: 0.35,
      }),
    );
    stripe.position.set(toX(a.x) * 0.98, 0.015, toZ(a.y) * 0.98);
    stripe.rotation.y = ang + Math.PI / 2;
    g.add(stripe);
  }
  for (const v of map.vents) {
    const vent = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.3, 6).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x555b66, transparent: true, opacity: 0.5 }),
    );
    vent.position.set(toX(v.x), 0.014, toZ(v.y));
    g.add(vent);
  }

  // Світло. Мало точкових джерел — інтегрована графіка; решту настрою дають емісивні смуги.
  g.add(new THREE.HemisphereLight(0x8a9aba, 0x2a1a18, 1.4));
  const moon = new THREE.DirectionalLight(0xb0c8ff, 1.6);
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

  const coreLight = new THREE.PointLight(PALETTE.core, 40, 22, 1.6);
  coreLight.position.set(0, 3, 0);
  g.add(coreLight);
  flick.push({ light: coreLight, base: 40, phase: 0 });

  // Світло секторів за картою-концептом: вантажний — бурштинове робоче, лабораторія — холодне
  // блакитне, оранжерея — тепле жовте, палуба — червоне аварійне. По одному джерелу на сектор.
  const sectorLight = [
    PALETTE.emergencyAmber,
    PALETTE.labLight,
    PALETTE.workLight,
    PALETTE.emergencyRed,
  ];
  for (let s = 0; s < 4; s++) {
    const a = Math.PI / 2 - (s * Math.PI) / 2;
    const color = sectorLight[s]!;
    const l = new THREE.PointLight(color, 70, 30, 1.5);
    l.position.set(Math.cos(a) * (R - 9), 5, -Math.sin(a) * (R - 9));
    g.add(l);
    flick.push({ light: l, base: 70, phase: s * 1.7 + 0.3 });
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

  return {
    group: g,
    update(time: number) {
      planet.rotation.y = time * 0.01;
      stars.rotation.y = time * 0.002;
      for (const f of flick) {
        // Мерехтіння: повільна хвиля + рідкісні короткі провали.
        const slow = 0.85 + 0.15 * Math.sin(time * 2.1 + f.phase);
        const glitch = Math.sin(time * 37 + f.phase * 13) > 0.97 ? 0.25 : 1;
        if (f.light) f.light.intensity = f.base * slow * glitch;
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

function makeObstacle(o: Obstacle): THREE.Object3D {
  if (o.kind === 'circle') {
    if (o.tag === 'core') return makeCore(o.r, o.height);
    // Клумба: бетонна чаша + кущ (кущ вищий за укриття — частково ховає ворогів).
    const grp = new THREE.Group();
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(o.r, o.r * 1.05, o.height * 0.6, 20),
      new THREE.MeshStandardMaterial({ color: PALETTE.planter, roughness: 0.9 }),
    );
    pot.position.y = o.height * 0.3;
    pot.castShadow = pot.receiveShadow = true;
    grp.add(pot);
    const bush = new THREE.Mesh(
      new THREE.IcosahedronGeometry(o.r * 1.25, 0),
      new THREE.MeshStandardMaterial({ color: PALETTE.plant, roughness: 0.8, flatShading: true }),
    );
    bush.position.y = o.height * 0.6 + o.r * 0.5;
    bush.scale.y = 0.75;
    bush.castShadow = true;
    grp.add(bush);
    grp.position.set(toX(o.x), 0, toZ(o.y));
    return grp;
  }

  let mat: THREE.Material;
  switch (o.tag) {
    case 'container': {
      const idx = Math.abs(Math.round(o.x * 7 + o.y * 3)) % PALETTE.container.length;
      mat = new THREE.MeshStandardMaterial({
        color: PALETTE.container[idx],
        roughness: 0.7,
        metalness: 0.4,
      });
      break;
    }
    case 'glass':
      mat = new THREE.MeshStandardMaterial({
        color: PALETTE.glass,
        transparent: true,
        opacity: 0.25,
        roughness: 0.1,
        metalness: 0.1,
        emissive: PALETTE.glass,
        emissiveIntensity: 0.15,
      });
      break;
    case 'table':
      mat = new THREE.MeshStandardMaterial({
        color: PALETTE.table,
        roughness: 0.5,
        metalness: 0.6,
      });
      break;
    case 'planter':
      mat = new THREE.MeshStandardMaterial({ color: PALETTE.planter, roughness: 0.9 });
      break;
    case 'divider':
      mat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.8, metalness: 0.3 });
      break;
    default:
      mat = new THREE.MeshStandardMaterial({
        color: PALETTE.console,
        emissive: 0x3366aa,
        emissiveIntensity: 0.25,
      });
  }
  const m = new THREE.Mesh(containerGeo, mat);
  m.scale.set(o.hw * 2, o.height, o.hh * 2);
  m.position.set(toX(o.x), o.height / 2, toZ(o.y));
  m.rotation.y = o.rot;
  m.castShadow = o.tag !== 'glass';
  m.receiveShadow = true;
  if (o.tag === 'container') {
    // Ребра контейнера — силует читається без текстур.
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(containerGeo),
      new THREE.LineBasicMaterial({ color: 0x1a1d22 }),
    );
    m.add(edges);
  }
  return m;
}

function makeCore(r: number, h: number): THREE.Object3D {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r * 1.15, 0.8, 32),
    new THREE.MeshStandardMaterial({ color: 0x2b2d33, metalness: 0.7, roughness: 0.4 }),
  );
  base.position.y = 0.4;
  base.receiveShadow = base.castShadow = true;
  g.add(base);
  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, h, 24),
    new THREE.MeshStandardMaterial({
      color: PALETTE.core,
      emissive: PALETTE.core,
      emissiveIntensity: 0.9,
    }),
  );
  column.position.y = h / 2;
  g.add(column);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r * 0.8, 0.12, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x6a6e78, metalness: 0.8, roughness: 0.3 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.2 + i * 1.1;
    g.add(ring);
  }
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
