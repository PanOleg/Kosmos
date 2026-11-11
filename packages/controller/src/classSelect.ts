import { CLASS_COLOR } from '@horizon/sim/protocol';
import type { ClassId, LobbySlotInfo } from '@horizon/sim/protocol';
import { hexCss } from './feedback';

export const CLASS_META: Record<
  ClassId,
  { name: string; role: string; icon: string; ability: string; about: string }
> = {
  assault: {
    name: 'Штурмовик',
    role: 'Шкода',
    icon: '▲',
    ability: 'Перевантаження',
    about: 'Гвинтівка. Здібність: удвічі швидша стрільба на 5 с',
  },
  engineer: {
    name: 'Інженер',
    role: 'Захист',
    icon: '⬢',
    ability: 'Бар’єр',
    about: 'Дробовик впритул. Здібність: стіна, що тримає кулі',
  },
  medic: {
    name: 'Медик',
    role: 'Підтримка',
    icon: '✚',
    ability: 'Лікувальне поле',
    about: 'Пістолет. Здібність: лікує всіх поруч; піднімає дешевше',
  },
  tech: {
    name: 'Технік',
    role: 'Контроль',
    icon: '⚡\uFE0E',
    ability: 'ЕМІ',
    about: 'Дуга б’є по трьох. Здібність: глушить ворогів, дрони падають',
  },
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
      // Портрет класу — рендер тієї самої моделі, що в грі (docs/models/portraits.py).
      b.innerHTML = `<img class="pt" src="${import.meta.env.BASE_URL}classes/${id}.png" alt="" draggable="false"><span class="nm"><span class="ic">${m.icon}</span> ${m.name}</span><span class="rl" style="color:var(--fg)">${m.role}</span><span class="ab" style="color:var(--fg)">${m.about}</span>`;
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
