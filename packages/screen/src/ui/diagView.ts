import { diag, onDiag } from '../diag';

/**
 * Вікно журналу діагностики (DECISIONS.md, п. 69): клавіша L або кнопка «≡» у лобі.
 * Показує події екрана й рядки, які надіслали пульти (позначка «П1…П4»).
 */
const css = `
.diag { position: fixed; inset: 0; z-index: 41; display: none; align-items: center; justify-content: center;
  background: rgba(4,6,12,.82); backdrop-filter: blur(6px); font-family: 'Inter', system-ui, sans-serif; color: #e8ecf4; }
.diag.on { display: flex; }
.diag .box { width: min(1100px, 94vw); height: 86vh; display: flex; flex-direction: column; gap: 12px;
  background: rgba(14,18,30,.96); border: 1px solid rgba(255,255,255,.14); border-radius: 16px; padding: 22px 26px; }
.diag h2 { margin: 0; font-size: 22px; letter-spacing: .04em; }
.diag .sub { font-size: 13px; opacity: .6; }
.diag pre { flex: 1; margin: 0; overflow: auto; font: 12.5px/1.5 ui-monospace, Menlo, monospace; white-space: pre-wrap;
  word-break: break-word; background: rgba(0,0,0,.35); border-radius: 10px; padding: 12px 14px; user-select: text; }
.diag .row { display: flex; gap: 10px; align-items: center; }
.diag button { padding: 9px 16px; border-radius: 10px; border: 1px solid rgba(255,255,255,.25);
  background: rgba(255,255,255,.08); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; }
.diag .note { font-size: 13px; opacity: .7; }
.diagbtn { position: fixed; right: 66px; bottom: 16px; z-index: 30; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.3); background: rgba(10,14,26,.7); color: #fff; font-size: 18px; font-weight: 800; cursor: pointer; }
`;

export class DiagView {
  private readonly root = document.createElement('div');
  private readonly btn = document.createElement('button');
  private readonly pre: HTMLPreElement;
  private readonly note: HTMLElement;

  constructor() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    this.root.className = 'diag';
    this.root.innerHTML = `<div class="box"><h2>Журнал зв'язку</h2>
<div class="sub">Події екрана й пультів (П1…П4). Якщо щось не працює — скопіюйте й надішліть розробнику.</div>
<pre></pre>
<div class="row"><button data-a="copy">Скопіювати</button><button data-a="save">Зберегти файл</button><span class="note"></span><span style="flex:1"></span><button data-a="close">Закрити (L)</button></div></div>`;
    this.pre = this.root.querySelector('pre')!;
    this.note = this.root.querySelector('.note')!;
    this.root.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (e.target === this.root || a === 'close') this.show(false);
      else if (a === 'copy') void this.copy();
      else if (a === 'save') this.save();
    });
    this.btn.className = 'diagbtn';
    this.btn.textContent = '≡';
    this.btn.title = "Журнал зв'язку (L)";
    this.btn.addEventListener('click', () => this.toggle());
    document.body.append(this.root, this.btn);
    onDiag(() => this.open && this.render());
  }

  get open(): boolean {
    return this.root.classList.contains('on');
  }

  private render(): void {
    // Якщо читач біля низу — тримаємо низ; прокрутив угору — не смикаємо.
    const stick = this.pre.scrollHeight - this.pre.scrollTop - this.pre.clientHeight < 40;
    this.pre.textContent = diag.text() || 'Поки порожньо.';
    if (stick) this.pre.scrollTop = this.pre.scrollHeight;
  }

  private async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(diag.text());
      this.note.textContent = 'Скопійовано';
    } catch {
      // Екран за http://<LAN-IP> не має доступу до буфера обміну — лишається файл.
      this.note.textContent = 'Буфер недоступний — збережіть файл';
    }
  }

  private save(): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([diag.text()], { type: 'text/plain' }));
    a.download = `horizon-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.note.textContent = 'Збережено';
  }

  show(on: boolean): void {
    this.root.classList.toggle('on', on);
    this.note.textContent = '';
    if (on) {
      this.render();
      this.pre.scrollTop = this.pre.scrollHeight;
    }
  }

  toggle(): void {
    this.show(!this.open);
  }

  /** Кнопку показуємо лише в лобі; клавіша L працює й у матчі. */
  setButtonVisible(on: boolean): void {
    this.btn.style.display = on ? 'block' : 'none';
  }
}
