import type { PlayerInput } from '@horizon/sim';

export interface InputSource {
  /** Заповнює out без алокацій. */
  read(out: PlayerInput): void;
}

export interface KeyLayout {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  dash: string[];
  ability: string[];
}

export const LAYOUT_WASD: KeyLayout = {
  up: ['KeyW'],
  down: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  dash: ['Space'],
  ability: ['ShiftLeft', 'KeyE'],
};

export const LAYOUT_ARROWS: KeyLayout = {
  up: ['ArrowUp'],
  down: ['ArrowDown'],
  left: ['ArrowLeft'],
  right: ['ArrowRight'],
  dash: ['Enter', 'Numpad0'],
  ability: ['ShiftRight', 'Slash'],
};

const pressed = new Set<string>();
let installed = false;

function install(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    pressed.add(e.code);
  });
  window.addEventListener('keyup', (e) => pressed.delete(e.code));
  window.addEventListener('blur', () => pressed.clear());
}

const any = (codes: string[]): boolean => codes.some((c) => pressed.has(c));

export class KeyboardInput implements InputSource {
  constructor(private readonly layout: KeyLayout = LAYOUT_WASD) {
    install();
  }

  read(out: PlayerInput): void {
    const l = this.layout;
    // +y = північ = вгору екрана.
    out.move.x = (any(l.right) ? 1 : 0) - (any(l.left) ? 1 : 0);
    out.move.y = (any(l.up) ? 1 : 0) - (any(l.down) ? 1 : 0);
    out.dash = any(l.dash);
    out.ability = any(l.ability);
  }
}

export function isKeyDown(code: string): boolean {
  return pressed.has(code);
}
