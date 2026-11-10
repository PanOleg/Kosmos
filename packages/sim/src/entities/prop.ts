/** Укриття, поставлене Прорабом: дзеркало динамічного слота геометрії світу. */
export interface Prop {
  alive: boolean;
  x: number;
  y: number;
  rot: number;
  len: number;
  thick: number;
  height: number;
}

export function createPropPool(capacity: number): Prop[] {
  const pool: Prop[] = [];
  for (let i = 0; i < capacity; i++)
    pool.push({ alive: false, x: 0, y: 0, rot: 0, len: 0, thick: 0, height: 0 });
  return pool;
}
