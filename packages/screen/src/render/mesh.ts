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
