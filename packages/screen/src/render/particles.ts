import * as THREE from 'three';

/**
 * Пул частинок на одному InstancedMesh: структура масивів, без алокацій після створення.
 * additive — для іскор і спалахів; без нього — для уламків з гравітацією й відскоком.
 */
export class ParticleSystem {
  private readonly mesh: THREE.InstancedMesh;
  private readonly cap: number;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly col: Float32Array;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(
    scene: THREE.Scene,
    capacity: number,
    private readonly opts: { additive: boolean; gravity: number; drag: number; bounce: boolean },
  ) {
    this.cap = capacity;
    this.pos = new Float32Array(capacity * 3);
    this.vel = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.spin = new Float32Array(capacity);
    this.col = new Float32Array(capacity * 3);
    const mat = opts.additive
      ? new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        })
      : new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.4 });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, capacity);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.castShadow = !opts.additive;
    scene.add(this.mesh);
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    life: number,
    size: number,
    color: number,
  ): void {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.spin[i] = (Math.random() - 0.5) * 20;
    this.c.setHex(color);
    this.col[i * 3] = this.c.r;
    this.col[i * 3 + 1] = this.c.g;
    this.col[i * 3 + 2] = this.c.b;
  }

  /** Сферичний сплеск у півсфері навколо напряму (dx, dz) у площині підлоги. */
  burst(
    count: number,
    x: number,
    y: number,
    z: number,
    dx: number,
    dz: number,
    speed: number,
    spread: number,
    life: number,
    size: number,
    color: number,
  ): void {
    const base = Math.atan2(dz, dx);
    for (let k = 0; k < count; k++) {
      const a = base + (Math.random() - 0.5) * spread;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const up = (Math.random() * 0.8 + 0.2) * speed * 0.6;
      this.emit(
        x,
        y,
        z,
        Math.cos(a) * sp,
        up,
        Math.sin(a) * sp,
        life * (0.6 + Math.random() * 0.6),
        size * (0.6 + Math.random() * 0.8),
        color,
      );
    }
  }

  update(dt: number): void {
    let n = 0;
    const { gravity, drag, bounce, additive } = this.opts;
    const dragK = Math.exp(-drag * dt);
    const ic = this.mesh.instanceColor!;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const l = this.life[i]!;
      if (l <= 0) continue;
      const i3 = i * 3;
      this.vel[i3 + 1]! -= gravity * dt;
      this.vel[i3]! *= dragK;
      this.vel[i3 + 1]! *= dragK;
      this.vel[i3 + 2]! *= dragK;
      this.pos[i3]! += this.vel[i3]! * dt;
      this.pos[i3 + 1]! += this.vel[i3 + 1]! * dt;
      this.pos[i3 + 2]! += this.vel[i3 + 2]! * dt;
      if (bounce && this.pos[i3 + 1]! < 0.05) {
        this.pos[i3 + 1] = 0.05;
        this.vel[i3 + 1] = Math.abs(this.vel[i3 + 1]!) * 0.35;
        this.vel[i3]! *= 0.6;
        this.vel[i3 + 2]! *= 0.6;
        this.spin[i]! *= 0.5;
      }
      const t = l / this.maxLife[i]!;
      // Іскри зменшуються до нуля; уламки тримають розмір і зникають в останній чверті.
      const sc = this.size[i]! * (additive ? t : Math.min(1, t * 4));
      this.v.set(this.pos[i3]!, this.pos[i3 + 1]!, this.pos[i3 + 2]!);
      const rot = this.spin[i]! * (this.maxLife[i]! - l);
      this.e.set(rot, rot * 0.7, 0);
      this.q.setFromEuler(this.e);
      this.s.set(sc, sc, additive ? sc * 2.5 : sc);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(n, this.m);
      const k = additive ? Math.min(1, t * 1.5) : 1;
      ic.setXYZ(n, this.col[i3]! * k, this.col[i3 + 1]! * k, this.col[i3 + 2]! * k);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    ic.needsUpdate = true;
  }
}
