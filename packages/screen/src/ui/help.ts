/**
 * Довідка «Як грати» (DECISIONS.md, п. 67): одна сторінка поверх лобі для тих, хто вперше
 * взяв пульт. Клавіша H або кнопка «?» — показати/сховати; Esc теж ховає.
 */
const css = `
.help { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
  background: rgba(4,6,12,.82); backdrop-filter: blur(6px); font-family: 'Inter', system-ui, sans-serif; color: #e8ecf4; }
.help.on { display: flex; }
.help .box { width: min(980px, 92vw); max-height: 90vh; overflow: auto; background: rgba(14,18,30,.96);
  border: 1px solid rgba(255,255,255,.14); border-radius: 16px; padding: 26px 32px; }
.help h2 { margin: 0 0 14px; font-size: 26px; letter-spacing: .04em; }
.help .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 34px; }
.help h3 { margin: 0 0 4px; font-size: 14px; letter-spacing: .12em; text-transform: uppercase; color: #ffcc40; }
.help p { margin: 0; font-size: 15px; line-height: 1.5; opacity: .92; }
.help .cls b { display: inline-block; min-width: 96px; }
.help .foot { margin-top: 16px; font-size: 13px; opacity: .55; text-align: center; }
.helpbtn { position: fixed; right: 18px; bottom: 16px; z-index: 30; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.3); background: rgba(10,14,26,.7); color: #fff; font-size: 20px; font-weight: 800; cursor: pointer; }
`;

const html = `<div class="box">
<h2>Як грати</h2>
<div class="grid">
<div><h3>Мета</h3><p>Разом відбити всі хвилі й здолати Ядро. Програш — коли впали всі одразу.</p></div>
<div><h3>Керування з телефона</h3><p>Ліва половина екрана — рух, різкий рух пальцем — ривок. Праворуч — здібність. Стрільба автоматична: персонаж сам цілить у найближчого ворога.</p></div>
<div class="cls"><h3>Класи</h3><p><b style="color:#ff5a5a">Штурмовик</b> гвинтівка; перевантаження — шквал вогню.<br><b style="color:#ffa040">Інженер</b> дробовик зблизька; ставить бар'єр.<br><b style="color:#5ae08a">Медик</b> пістолет здалеку; поле лікує всіх поруч.<br><b style="color:#5aa0ff">Технік</b> дуга б'є кількох; ЕМІ глушить дронів.</p></div>
<div><h3>Упав напарник</h3><p>Підійдіть і тримайте кнопку здібності — це коштує деталей. Не встигли — він повернеться на початку наступної хвилі.</p></div>
<div><h3>Деталі й магазин</h3><p>З ворогів падають деталі ⚙ — у кожного свій рахунок. Між хвилями відкривається магазин: зброя, броня, здібність, аптечка.</p></div>
<div><h3>Небезпека на підлозі</h3><p>Червоні кола й лінії — туди зараз ударить. Вийдіть із зони або перетніть її ривком. У Панцира й Турелі слабке місце ззаду.</p></div>
<div><h3>Корисне</h3><p>📣 на пульті — покликати напарників «Сюди!». ⏸ (утримати) — пауза. Якщо зв'язок зник, персонажа тимчасово веде бот.</p></div>
<div><h3>Карти й режими</h3><p>Пустеля: зибучі піски й бурі, вороги з усіх боків. Крига: замети й хуртовини. Режими в лобі ускладнюють матч; «Без кінця» — хвилі після Ядра.</p></div>
</div>
<div class="foot">H або Esc — закрити</div>
</div>`;

export class HelpOverlay {
  private readonly root = document.createElement('div');
  private readonly btn = document.createElement('button');

  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this.root.className = 'help';
    this.root.innerHTML = html;
    this.root.addEventListener('click', () => this.show(false));
    this.btn.className = 'helpbtn';
    this.btn.textContent = '?';
    this.btn.title = 'Як грати (H)';
    this.btn.addEventListener('click', () => this.toggle());
    document.body.append(this.root, this.btn);
  }

  get open(): boolean {
    return this.root.classList.contains('on');
  }

  show(on: boolean): void {
    this.root.classList.toggle('on', on);
  }

  toggle(): void {
    this.show(!this.open);
  }

  /** Кнопку «?» показуємо лише в лобі: у матчі вона заважала б картці гравця. */
  setButtonVisible(on: boolean): void {
    this.btn.style.display = on ? 'block' : 'none';
    if (!on) this.show(false);
  }
}
