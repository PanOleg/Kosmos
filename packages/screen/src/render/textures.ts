import * as THREE from 'three';

/**
 * Процедурні текстури станції (ассетів немає). Малюються один раз на canvas.
 * Більшість — сірі: колір дає матеріал, тож одна текстура служить усім відтінкам.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Детермінований шум для текстур: однакова картинка між запусками. */
function rng(seed: number): () => number {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Жовто-чорні діагональні смуги небезпеки. */
function hazard(
  x: CanvasRenderingContext2D,
  left: number,
  top: number,
  w: number,
  h: number,
  stripe = 14,
): void {
  x.save();
  x.beginPath();
  x.rect(left, top, w, h);
  x.clip();
  x.fillStyle = '#e0b020';
  x.fillRect(left, top, w, h);
  x.fillStyle = '#16161a';
  for (let i = -h; i < w + h; i += stripe * 2) {
    x.beginPath();
    x.moveTo(left + i, top + h);
    x.lineTo(left + i + stripe, top + h);
    x.lineTo(left + i + stripe + h, top);
    x.lineTo(left + i + h, top);
    x.fill();
  }
  x.restore();
}

/** Плита підлоги 2×2 м: шви, болти, потертості. */
export function floorTiles(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 256);
  const r = rng(7);
  x.fillStyle = '#9a9a9a';
  x.fillRect(0, 0, 256, 256);
  // Рифлення — дрібні насічки, як на технічній підлозі.
  x.fillStyle = 'rgba(0,0,0,0.08)';
  for (let yy = 12; yy < 248; yy += 10)
    for (let xx = 12 + ((yy / 10) % 2) * 5; xx < 248; xx += 10) x.fillRect(xx, yy, 5, 2);
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`;
    x.fillRect(r() * 256, r() * 256, 20 + r() * 60, 10 + r() * 40);
  }
  x.strokeStyle = '#3a3a3a';
  x.lineWidth = 6;
  x.strokeRect(0, 0, 256, 256);
  x.strokeStyle = '#c4c4c4';
  x.lineWidth = 2;
  x.strokeRect(5, 5, 246, 246);
  x.fillStyle = '#505050';
  for (const [bx, by] of [
    [16, 16],
    [240, 16],
    [16, 240],
    [240, 240],
  ] as const) {
    x.beginPath();
    x.arc(bx, by, 5, 0, Math.PI * 2);
    x.fill();
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Карта шорсткості всієї арени: калюжі й мокрі смуги дзеркальні (темне = гладке).
 * Саме в них відбиваються червоні лампи, як на макеті hud.jpg.
 */
export function floorWetness(): THREE.CanvasTexture {
  const [c, x] = canvas(512, 512);
  const r = rng(11);
  x.fillStyle = 'rgb(150,150,150)';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) {
    const px = r() * 512;
    const py = r() * 512;
    const rad = 6 + r() * 26;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(20,20,20,0.95)');
    g.addColorStop(0.7, 'rgba(40,40,40,0.6)');
    g.addColorStop(1, 'rgba(150,150,150,0)');
    x.fillStyle = g;
    x.beginPath();
    x.ellipse(px, py, rad * (1 + r()), rad, r() * Math.PI, 0, Math.PI * 2);
    x.fill();
  }
  return texture(c, false);
}

/** Борт контейнера: гофр, рама, трафаретний номер. Сіра — колір дає матеріал. */
export function containerSide(label: string): THREE.CanvasTexture {
  const [c, x] = canvas(256, 128);
  x.fillStyle = '#b0b0b0';
  x.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 256; i += 12) {
    x.fillStyle = 'rgba(0,0,0,0.22)';
    x.fillRect(i, 0, 4, 128);
    x.fillStyle = 'rgba(255,255,255,0.12)';
    x.fillRect(i + 5, 0, 2, 128);
  }
  x.strokeStyle = '#3c3c3c';
  x.lineWidth = 10;
  x.strokeRect(0, 0, 256, 128);
  x.font = 'bold 34px monospace';
  x.fillStyle = 'rgba(240,240,240,0.75)';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(label, 128, 66);
  // Потерта фарба знизу.
  const g = x.createLinearGradient(0, 90, 0, 128);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = g;
  x.fillRect(0, 90, 256, 38);
  return texture(c);
}

/** Панелі стіни: шви, решітки вентиляції, жовто-чорна смуга внизу. */
export function wallPanels(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#8a8a8e';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(0,0,0,0.25)';
  x.fillRect(0, 0, 4, 256);
  x.fillRect(126, 0, 4, 200);
  x.fillRect(0, 96, 256, 3);
  // Решітки.
  for (const gx of [24, 152]) {
    x.fillStyle = '#4a4a4e';
    x.fillRect(gx, 120, 80, 56);
    x.fillStyle = '#2a2a2e';
    for (let k = 0; k < 7; k++) x.fillRect(gx + 4, 124 + k * 8, 72, 4);
  }
  x.fillStyle = 'rgba(255,255,255,0.08)';
  x.fillRect(8, 8, 110, 80);
  x.fillRect(136, 8, 110, 80);
  hazard(x, 0, 212, 256, 44, 16);
  const t = texture(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Двері шлюзу: дві стулки, смуги небезпеки по краю, напис. */
export function airlockDoor(label: string): THREE.CanvasTexture {
  const [c, x] = canvas(512, 320);
  hazard(x, 0, 0, 512, 320, 22);
  x.fillStyle = '#3a3d44';
  x.fillRect(28, 28, 456, 292);
  x.fillStyle = '#2a2c31';
  x.fillRect(254, 28, 4, 292);
  x.fillStyle = 'rgba(255,255,255,0.06)';
  for (let k = 0; k < 6; k++) x.fillRect(40, 60 + k * 40, 432, 2);
  x.font = 'bold 54px sans-serif';
  x.textAlign = 'center';
  x.fillStyle = 'rgba(230,230,235,0.85)';
  x.fillText(label, 256, 190);
  return texture(c);
}

/** Плоска смуга небезпеки на підлогу перед шлюзом. */
export function hazardStripe(): THREE.CanvasTexture {
  const [c, x] = canvas(256, 64);
  hazard(x, 0, 0, 256, 64, 16);
  return texture(c);
}

/** Емісивна колона реактора: смуги енергії замість суцільної заливки — bloom не зливає її в пляму. */
export function reactorBands(): THREE.CanvasTexture {
  const [c, x] = canvas(64, 256);
  const g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#300404');
  g.addColorStop(0.5, '#ff6040');
  g.addColorStop(1, '#300404');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 256);
  x.fillStyle = 'rgba(20,0,0,0.65)';
  for (let y = 0; y < 256; y += 32) x.fillRect(0, y, 64, 6);
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Екран консолі: рядки «даних» і графік. */
export function screenTexture(color: string): THREE.CanvasTexture {
  const [c, x] = canvas(128, 80);
  const r = rng(color.length * 31 + 3);
  x.fillStyle = '#05080c';
  x.fillRect(0, 0, 128, 80);
  x.fillStyle = color;
  for (let i = 0; i < 6; i++) x.fillRect(8, 8 + i * 8, 20 + r() * 60, 3);
  x.strokeStyle = color;
  x.lineWidth = 2;
  x.beginPath();
  for (let i = 0; i <= 12; i++) x.lineTo(70 + i * 4.5, 60 - r() * 30);
  x.stroke();
  return texture(c);
}
