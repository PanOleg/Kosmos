import * as THREE from 'three';

/**
 * Атмосфера карти (DECISIONS.md, п. 66): дрібні частинки в повітрі — пил і пісок у пустелі,
 * сніг на «Кризі», іскри-порошинки на станції — та перекотиполе в пустелі. Суто декорація:
 * один Points на ~260 точок і кілька мешів, на гру не впливає.
 */
export interface Ambience {
  group: THREE.Group;
  /** storm — 0..1, сила бурі: пісок летить швидше й густіше. */
  update(time: number, dt: number, storm: number): void;
}

interface Look {
  count: number;
  color: number;
  size: number;
  opacity: number;
  /** Швидкість дрейфу, м/с: вітер по X, падіння по Y, знос по Z. */
  wind: [number, number, number];
  /** Висота шару, м. */
  top: number;
  additive: boolean;
}

const LOOKS: Record<string, Look> = {
  desert: {
    count: 260,
    color: 0xf2dcae,
    size: 0.11,
    opacity: 0.55,
    wind: [2.2, -0.05, 0.5],
    top: 3.5,
    additive: false,
  },
  ice: {
    count: 300,
    color: 0xffffff,
    size: 0.12,
    opacity: 0.8,
    wind: [1.1, -1.6, 0.4],
    top: 9,
    additive: false,
  },
  // Ліс: світляки — повільно здіймаються й погойдуються.
  forest: {
    count: 240,
    color: 0xb8ff70,
    size: 0.13,
    opacity: 0.9,
    wind: [0.15, 0.18, 0.1],
    top: 4.5,
    additive: true,
  },
  station: {
    count: 140,
    color: 0xffb070,
    size: 0.07,
    opacity: 0.6,
    wind: [0.12, 0.25, 0.08],
    top: 5,
    additive: true,
  },
};

const HALF = 34;

/** Детермінований генератор: декорація однакова між запусками. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function createAmbience(mapId: string): Ambience {
  const look = LOOKS[mapId] ?? LOOKS.station!;
  const group = new THREE.Group();
  const r = rng(7);
  const pos = new Float32Array(look.count * 3);
  const phase = new Float32Array(look.count);
  for (let i = 0; i < look.count; i++) {
    pos[i * 3] = (r() * 2 - 1) * HALF;
    pos[i * 3 + 1] = 0.2 + r() * look.top;
    pos[i * 3 + 2] = (r() * 2 - 1) * HALF;
    phase[i] = r() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  const attr = new THREE.BufferAttribute(pos, 3);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', attr);
  const mat = new THREE.PointsMaterial({
    color: look.color,
    size: look.size,
    sizeAttenuation: true,
    transparent: true,
    opacity: look.opacity,
    depthWrite: false,
    blending: look.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  group.add(points);

  // Перекотиполе: гранчасті сухі кулі котяться за вітром через усю карту й підстрибують.
  const weeds: { mesh: THREE.Mesh; lane: number; speed: number; r: number; off: number }[] = [];
  if (mapId === 'desert') {
    const weedMat = new THREE.MeshStandardMaterial({
      color: 0x9a7a48,
      roughness: 1,
      flatShading: true,
      wireframe: false,
    });
    for (let i = 0; i < 4; i++) {
      const rad = 0.32 + r() * 0.2;
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), weedMat);
      mesh.castShadow = true;
      group.add(mesh);
      weeds.push({ mesh, lane: (r() * 2 - 1) * 26, speed: 2.6 + r() * 2, r: rad, off: r() * 80 });
    }
  }

  return {
    group,
    update(time, dt, storm) {
      const k = 1 + storm * 4;
      const [wx, wy, wz] = look.wind;
      for (let i = 0; i < look.count; i++) {
        const j = i * 3;
        const sway = Math.sin(time * 1.3 + phase[i]!) * 0.25;
        let x = pos[j]! + (wx * k + sway) * dt;
        let y = pos[j + 1]! + (wy + Math.cos(time + phase[i]!) * 0.08) * dt;
        let z = pos[j + 2]! + wz * k * dt;
        if (x > HALF) x -= HALF * 2;
        else if (x < -HALF) x += HALF * 2;
        if (z > HALF) z -= HALF * 2;
        else if (z < -HALF) z += HALF * 2;
        if (y < 0.1) y += look.top;
        else if (y > look.top + 0.2) y -= look.top;
        pos[j] = x;
        pos[j + 1] = y;
        pos[j + 2] = z;
      }
      attr.needsUpdate = true;
      mat.opacity = Math.min(1, look.opacity * (1 + storm * 0.6));
      for (const w of weeds) {
        // Шлях по колу довжиною 80 м: поза картою перекотиполе «чекає» наступного заходу.
        const d = (time * w.speed * (1 + storm * 1.5) + w.off) % 80;
        const x = d - 40;
        w.mesh.position.set(
          x,
          w.r + Math.abs(Math.sin(d * 1.1)) * 0.35,
          w.lane + Math.sin(d * 0.21 + w.off) * 2.5,
        );
        w.mesh.rotation.z = -d / w.r;
        w.mesh.rotation.x = d * 0.3;
      }
    },
  };
}
