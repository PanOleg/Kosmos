import type { ClassId } from '@horizon/sim';
import { CLASS_COLOR } from '@horizon/sim/protocol';

/**
 * Єдина палітра за концептами (docs/concepts). Гравці — насичений колір класу на темній броні;
 * вороги — бліда броня з червоними очима; кулі гравців жовто-білі, ворожі — червоні.
 */
export const PALETTE = {
  bg: 0x05060a,
  floor: 0x3a3c42,
  floorCenter: 0x3a2e30,
  floorGreen: 0x2f3a30,
  floorLab: 0x3c434e,
  floorDeck: 0x34373f,
  line: 0x7a8494,
  hull: 0x15171c,
  wall: 0x3a3e48,
  container: [0x7a2f26, 0xb08a2e, 0x5b6068, 0xa0522d, 0x3f4650],
  glass: 0x9fd8ff,
  table: 0x7b8290,
  planter: 0x3c4a3a,
  plant: 0x4f9a4a,
  console: 0x404654,
  core: 0xff3322,
  emergencyRed: 0xff2a1a,
  emergencyAmber: 0xffaa22,
  playerArmor: 0x2b2f37,
  playerArmorLight: 0x5a606c,
  playerShot: 0xfff1a8,
  enemyShot: 0xff2a3a,
  enemy: 0xc9ccd2,
  enemyMid: 0x8d9198,
  enemyDark: 0x2a2c31,
  enemyEye: 0xff2a1a,
  danger: 0xff3b1f,
  part: 0x9ff4ff,
  labLight: 0x9fd0ff,
  workLight: 0xffc860,
};

export function classColor(classId: string): number {
  return CLASS_COLOR[classId as ClassId] ?? 0xffffff;
}

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}
