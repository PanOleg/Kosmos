import * as THREE from 'three';

/**
 * Одна спільна камера: дивиться на центр мас гравців під кутом ~58°,
 * відсувається, щоб усі влазили в кадр. Тремтіння додається поверх, не впливає на ціль.
 */
export class GameCamera {
  readonly camera: THREE.PerspectiveCamera;
  private readonly focus = new THREE.Vector3();
  private distance = 34;
  private trauma = 0;
  private readonly offsetDir = new THREE.Vector3(0, Math.sin(1.0), Math.cos(1.0));

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 400);
  }

  /** 0..1, квадратичне згасання дає «удар», а не постійне дрижання. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(points: { x: number; z: number }[], dt: number, time: number): void {
    if (points.length > 0) {
      let cx = 0;
      let cz = 0;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of points) {
        cx += p.x;
        cz += p.z;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
      cx /= points.length;
      cz /= points.length;
      const spread = Math.max(maxX - minX, (maxZ - minZ) * 1.4);
      const want = Math.min(56, Math.max(34, 26 + spread * 0.9));
      const k = 1 - Math.exp(-dt * 4);
      this.focus.x += (cx - this.focus.x) * k;
      this.focus.z += (cz - this.focus.z) * k;
      this.distance += (want - this.distance) * (1 - Math.exp(-dt * 2));
    }
    const c = this.camera;
    c.position.copy(this.focus).addScaledVector(this.offsetDir, this.distance);
    c.lookAt(this.focus);

    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      // Детермінований шум із синусів — плавніший за випадкові числа.
      c.position.x += Math.sin(time * 71.3) * s * 0.5;
      c.position.y += Math.sin(time * 53.1 + 1.3) * s * 0.35;
      c.position.z += Math.sin(time * 61.7 + 2.1) * s * 0.5;
      c.rotation.z += Math.sin(time * 47.9) * s * 0.02;
      this.trauma = Math.max(0, this.trauma - dt * 1.8);
    }
  }

  resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
}
