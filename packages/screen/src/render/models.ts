import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Готові glTF-моделі замість примітивів (DECISIONS.md, п. 24; вимоги — docs/models/README.md).
 * public/models/manifest.json перелічує наявні моделі; чого там немає — малюється примітивами.
 */
export interface ModelEntry {
  /** Висота в грі, метри: модель масштабується під неї. */
  height: number;
  /** Поворот у градусах, якщо модель дивиться не на +Z. */
  yaw?: number;
  /**
   * Статична модель ворога (DECISIONS.md, п. 45): без скелета й кліпів, замінює примітиви
   * й малюється тим самим InstancedMesh на тип. Меші з «glow» у назві — світне око, решта —
   * корпус з кольорами вершин. Початок координат моделі — центр тіла: зсуваємо лише по висоті.
   */
  static?: boolean;
}

export interface StaticParts {
  hull: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
}

const staticParts = new Map<string, StaticParts>();

/** Лише позиція, нормаль і колір (RGB): так геометрії однакові з примітивами й зливаються. */
function bakeStatic(scene: THREE.Object3D, scale: number, lift: number): StaticParts {
  scene.updateMatrixWorld(true);
  const hull: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4().makeScale(scale, scale, scale);
  m.premultiply(new THREE.Matrix4().makeTranslation(0, lift * scale, 0));
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.getAttribute('position').clone());
    const n = src.getAttribute('position').count;
    const col = new Float32Array(n * 3).fill(1);
    const c = src.getAttribute('color');
    if (c) for (let i = 0; i < n; i++) col.set([c.getX(i), c.getY(i), c.getZ(i)], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m, mesh.matrixWorld));
    g.computeVertexNormals();
    (/glow/i.test(mesh.name) ? glow : hull).push(g);
  });
  const merge = (list: THREE.BufferGeometry[]) =>
    list.length === 0
      ? new THREE.BufferGeometry()
      : list.length === 1
        ? list[0]!
        : mergeGeometries(list)!;
  return { hull: merge(hull), glow: merge(glow) };
}

interface Loaded {
  gltf: GLTF;
  entry: ModelEntry;
  /** Масштаб і зсув, що ставлять модель ступнями на підлогу в центр. */
  scale: number;
  offset: THREE.Vector3;
}

export interface ModelInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  /** Матеріали цього екземпляра (клоновані): для спалаху влучання. */
  materials: THREE.MeshStandardMaterial[];
  play(name: string, fade?: number): void;
  update(dt: number): void;
  /** Спалах влучання 0..1 поверх власного світіння моделі (візори, очі не гаснуть). */
  flash(k: number, r?: number, g?: number, b?: number): void;
}

const loaded = new Map<string, Loaded>();

/** Синоніми назв кліпів: моделі з різних джерел називають їх по-різному. */
const CLIP_ALIASES: Record<string, string[]> = {
  idle: ['idle', 'stand', 'breathing'],
  run: ['run', 'running', 'walk', 'walking', 'jog'],
  shoot: ['shoot', 'shooting', 'fire', 'attack', 'punch'],
  attack: ['attack', 'punch', 'slash', 'shoot', 'fire'],
  dash: ['dash', 'roll', 'dodge', 'jump'],
  down: ['down', 'death', 'die', 'dead'],
  death: ['death', 'die', 'dead'],
  hover: ['hover', 'idle', 'fly'],
};

function findClip(clips: THREE.AnimationClip[], name: string): THREE.AnimationClip | undefined {
  for (const alias of CLIP_ALIASES[name] ?? [name]) {
    const c =
      clips.find((k) => k.name.toLowerCase() === alias) ??
      clips.find((k) => k.name.toLowerCase().includes(alias));
    if (c) return c;
  }
  return undefined;
}

export const models = {
  has(id: string): boolean {
    return loaded.has(id) || staticParts.has(id);
  },

  /** Статична модель ворога замість примітивів; null — немає. */
  staticParts(id: string): StaticParts | null {
    return staticParts.get(id) ?? null;
  },

  /** Завантажує все з маніфесту. Помилки окремих файлів не валять гру: модель просто лишається примітивом. */
  async load(): Promise<string[]> {
    const base = `${import.meta.env.BASE_URL}models/`;
    let manifest: Record<string, ModelEntry>;
    try {
      const res = await fetch(`${base}manifest.json`, { cache: 'no-cache' });
      if (!res.ok) return [];
      manifest = (await res.json()) as Record<string, ModelEntry>;
    } catch {
      return [];
    }
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const ids = Object.keys(manifest);
    await Promise.all(
      ids.map(async (id) => {
        try {
          const gltf = await loader.loadAsync(`${base}${id}.glb`);
          const entry = manifest[id]!;
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const size = box.getSize(new THREE.Vector3());
          const scale = entry.height / Math.max(1e-6, size.y);
          const center = box.getCenter(new THREE.Vector3());
          if (entry.static) {
            staticParts.set(id, bakeStatic(gltf.scene, scale, -box.min.y));
            return;
          }
          gltf.scene.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.castShadow = true;
              m.receiveShadow = true;
            }
          });
          loaded.set(id, {
            gltf,
            entry,
            scale,
            offset: new THREE.Vector3(-center.x, -box.min.y, -center.z),
          });
        } catch (err) {
          console.warn(`[models] ${id}.glb не завантажено, лишаються примітиви`, err);
        }
      }),
    );
    return [...loaded.keys(), ...staticParts.keys()];
  },

  instantiate(id: string): ModelInstance | null {
    const l = loaded.get(id);
    if (!l) return null;
    // SkeletonUtils.clone коректно копіює скінінг; звичайний clone() ділив би один скелет на всіх.
    const inner = SkeletonUtils.clone(l.gltf.scene);
    inner.position.copy(l.offset);
    const pivot = new THREE.Group();
    pivot.add(inner);
    pivot.scale.setScalar(l.scale);
    pivot.rotation.y = THREE.MathUtils.degToRad(l.entry.yaw ?? 0);
    const root = new THREE.Group();
    root.add(pivot);

    const materials: THREE.MeshStandardMaterial[] = [];
    const baseEmissive: THREE.Color[] = [];
    inner.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const clone = (mat: THREE.Material) => {
        const c = mat.clone() as THREE.MeshStandardMaterial;
        if ('emissive' in c) {
          materials.push(c);
          baseEmissive.push(c.emissive.clone());
        }
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(clone) : clone(m.material);
    });

    const clips = l.gltf.animations;
    const mixer = clips.length > 0 ? new THREE.AnimationMixer(inner) : null;
    let current: THREE.AnimationAction | null = null;
    let currentName = '';
    return {
      root,
      mixer,
      materials,
      play(name: string, fade = 0.15) {
        if (!mixer || name === currentName) return;
        currentName = name;
        const clip = findClip(clips, name);
        if (!clip) return;
        const next = mixer.clipAction(clip);
        next.reset().fadeIn(fade).play();
        current?.fadeOut(fade);
        current = next;
      },
      update(dt: number) {
        mixer?.update(dt);
      },
      flash(k: number, r = 1, g = 1, b = 1) {
        for (let i = 0; i < materials.length; i++) {
          const base = baseEmissive[i]!;
          materials[i]!.emissive.setRGB(base.r + k * r, base.g + k * g, base.b + k * b);
        }
      },
    };
  },
};
