import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MapDef } from '@horizon/sim';
import { toX, toZ } from './coords';

/**
 * Контактні тіні під перешкодами (DECISIONS.md, п. 58): темні розмиті плями на підлозі біля
 * основи контейнерів, скель, столів. Без них об'єкти «висять». Не залежать від карти тіней,
 * тож лишаються й на найнижчій якості; два меші (прямокутні й круглі плями) на всю арену.
 */
function blurTex(round: boolean): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d')!;
  ctx.filter = 'blur(12px)';
  ctx.fillStyle = '#000';
  if (round) {
    ctx.beginPath();
    ctx.arc(64, 64, 38, 0, Math.PI * 2);
    ctx.fill();
  } else ctx.fillRect(26, 26, 76, 76);
  return new THREE.CanvasTexture(cv);
}

export function contactShadows(map: MapDef, opacity: number, grow = 1.1): THREE.Group {
  const rects: THREE.BufferGeometry[] = [];
  const rounds: THREE.BufferGeometry[] = [];
  for (const o of map.obstacles) {
    if (o.tag === 'glass') continue;
    // Пляма ширша за основу: текстура має розмиті поля ~20% з кожного боку.
    if (o.kind === 'circle') {
      const d = (o.r * 2 + grow) * 1.55;
      rounds.push(
        new THREE.PlaneGeometry(d, d).rotateX(-Math.PI / 2).translate(toX(o.x), 0.018, toZ(o.y)),
      );
    } else
      rects.push(
        new THREE.PlaneGeometry((o.hw * 2 + grow) * 1.55, (o.hh * 2 + grow) * 1.55)
          .rotateX(-Math.PI / 2)
          .rotateY(o.rot)
          .translate(toX(o.x), 0.018, toZ(o.y)),
      );
  }
  const g = new THREE.Group();
  for (const [list, round] of [
    [rects, false],
    [rounds, true],
  ] as const) {
    if (list.length === 0) continue;
    const m = new THREE.Mesh(
      mergeGeometries(list)!,
      new THREE.MeshBasicMaterial({
        map: blurTex(round),
        transparent: true,
        opacity,
        depthWrite: false,
        color: 0x000000,
      }),
    );
    m.renderOrder = 1;
    g.add(m);
  }
  // Уже злито: batchStatic не чіпає.
  g.userData.dynamic = true;
  return g;
}
