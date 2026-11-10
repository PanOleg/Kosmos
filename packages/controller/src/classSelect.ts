import { CLASS_COLOR } from '@horizon/sim/protocol';
import type { ClassId, LobbySlotInfo } from '@horizon/sim/protocol';
import { hexCss } from './feedback';

export const CLASS_META: Record<ClassId, { name: string; role: string; icon: string }> = {
  assault: { name: 'Штурмовик', role: 'Шкода', icon: '▲' },
  engineer: { name: 'Інженер', role: 'Захист', icon: '⬢' },
  medic: { name: 'Медик', role: 'Підтримка', icon: '✚' },
  tech: { name: 'Технік', role: 'Контроль', icon: '⚡' },
};

const IDS: ClassId[] = ['assault', 'engineer', 'medic', 'tech'];

/** Чотири великі картки класів; зайняті іншими — притемнені й неактивні. */
export class ClassSelect {
  private readonly cards = new Map<ClassId, HTMLButtonElement>();

  constructor(root: HTMLElement, onPick: (c: ClassId) => void) {
    for (const id of IDS) {
      const m = CLASS_META[id];
      const b = document.createElement('button');
      b.className = 'cls';
      b.style.color = hexCss(CLASS_COLOR[id]);
      b.innerHTML = `<span class="ic">${m.icon}</span><span class="nm">${m.name}</span><span class="rl" style="color:var(--fg)">${m.role}</span>`;
      b.addEventListener('click', () => onPick(id));
      root.appendChild(b);
      this.cards.set(id, b);
    }
  }

  render(mySlot: number, slots: LobbySlotInfo[]): void {
    const mine = slots.find((s) => s.slot === mySlot)?.classId ?? null;
    for (const id of IDS) {
      const b = this.cards.get(id)!;
      const taken = slots.some((s) => s.slot !== mySlot && s.classId === id);
      b.classList.toggle('sel', mine === id);
      b.classList.toggle('taken', taken);
      b.disabled = taken;
      b.style.borderColor = mine === id ? hexCss(CLASS_COLOR[id]) : 'transparent';
    }
  }
}
