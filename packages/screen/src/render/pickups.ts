import * as THREE from 'three';
import { TICKS_PER_SEC, type Pickup } from '@horizon/sim';
import { PALETTE } from './palette';

/** Деталі: світлі шестерні (як іконка в HUD), обертаються й підстрибують; перед зникненням блимають. */
export class PickupRenderer {
  private readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene, capacity: number) {
    this.mesh = new THREE.InstancedMesh(
      gearGeometry(),
      new THREE.MeshStandardMaterial({
        color: PALETTE.part,
        emissive: PALETTE.part,
        emissiveIntensity: 2.2,
        roughness: 0.3,
        metalness: 0.6,
      }),
      capacity,
    );
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }

  update(list: Pickup[], alpha: number, time: number): void {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const k = list[i]!;
      if (!k.alive) continue;
      // Блимання в останні 3 с.
      if (k.life < 3 * TICKS_PER_SEC && Math.sin(time * 25) < 0) continue;
      const x = k.px + (k.x - k.px) * alpha;
      const y = k.py + (k.y - k.py) * alpha;
      const flying = k.magnet >= 0;
      this.p.set(x, flying ? 0.7 : 0.45 + Math.sin(time * 4 + i) * 0.12, -y);
      // Шестерня стоїть ребром і крутиться — читається як деталь, а не як куля.
      this.e.set(Math.PI / 2 - 0.5, 0, time * 3 + i);
      this.q.setFromEuler(this.e);
      const sc = flying ? 0.8 : 1;
      this.s.set(sc, sc, sc);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

function gearGeometry(): THREE.BufferGeometry {
  // Профіль шестерні з 8 зубцями, видавлений у товщину.
  const shape = new THREE.Shape();
  const teeth = 8;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.32 : 0.24;
    if (i === 0) shape.moveTo(Math.cos(a0) * r, Math.sin(a0) * r);
    else shape.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    shape.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  g.translate(0, 0, -0.05);
  return g;
}
