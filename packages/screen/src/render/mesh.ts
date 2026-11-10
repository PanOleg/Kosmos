import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Модель з примітивів, злита в одну геометрію з вершинними кольорами: один draw call.
 * Під glTF замінюється на завантажену геометрію з тими ж двома мешами (корпус + світіння).
 */
export interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  m: THREE.Matrix4;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export function part(
  geo: THREE.BufferGeometry,
  color: number,
  pos: [number, number, number],
  size: [number, number, number] = [1, 1, 1],
  rot: [number, number, number] = [0, 0, 0],
): Part {
  tmpQ.setFromEuler(tmpE.set(rot[0], rot[1], rot[2]));
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    tmpQ.clone(),
    new THREE.Vector3(...size),
  );
  return { geo, color, m };
}

export function merge(parts: Part[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = parts.map((p) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
    if (g.getAttribute('uv')) g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    c.setHex(p.color);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  return mergeGeometries(geos)!;
}

export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
export const SPHERE = new THREE.SphereGeometry(0.5, 12, 8);
export const CONE4 = new THREE.ConeGeometry(0.5, 1, 4);
export const CONE = new THREE.ConeGeometry(0.5, 1, 8);

const UP = new THREE.Vector3(0, 1, 0);

/** Брусок від точки a до точки b (кінцівки, стріли кранів): товщина w×d, довжина = |b − a|. */
export function seg(
  geo: THREE.BufferGeometry,
  color: number,
  a: [number, number, number],
  b: [number, number, number],
  w: number,
  d = w,
): Part {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  const m = new THREE.Matrix4().compose(
    va.add(vb).multiplyScalar(0.5),
    q,
    new THREE.Vector3(w, len, d),
  );
  return { geo, color, m };
}

/**
 * Статичне пакетування: усі непрозорі нерухомі меші групи з однаковим матеріалом зливаються
 * в один (світові матриці запікаються в геометрію). Сотні дрібних деталей реквізиту → десятки
 * draw call. Прозорі, анімовані (userData.dynamic) й багатоматеріальні меші лишаються як є.
 */
export function batchStatic(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<
    THREE.Material,
    { geos: THREE.BufferGeometry[]; cast: boolean; recv: boolean }
  >();
  const remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (
      !m.isMesh ||
      Array.isArray(m.material) ||
      (m as unknown as THREE.InstancedMesh).isInstancedMesh
    )
      return;
    const mat = m.material;
    if (mat.transparent || m.userData.dynamic) return;
    let skip = false;
    for (let p = m.parent; p && p !== root; p = p.parent) if (p.userData.dynamic) skip = true;
    if (skip) return;
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g = g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    // Набір атрибутів має збігатися для злиття: лишаємо позицію, нормаль і UV.
    for (const name of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.getAttribute('uv'))
      g.setAttribute(
        'uv',
        new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2),
      );
    let entry = groups.get(mat);
    if (!entry) {
      entry = { geos: [], cast: false, recv: false };
      groups.set(mat, entry);
    }
    entry.geos.push(g);
    entry.cast ||= m.castShadow;
    entry.recv ||= m.receiveShadow;
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const [mat, e] of groups) {
    const merged = mergeGeometries(e.geos);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.recv;
    root.add(mesh);
  }
}
