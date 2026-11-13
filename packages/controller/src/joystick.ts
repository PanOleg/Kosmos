/**
 * Плаваючий стік у лівій половині: центр там, де торкнувся палець; гра наосліп.
 * Ривок — «кидок»: стік за мить відлітає від центру майже до краю. Окрема кнопка
 * не потрібна: великий палець і так лежить на стіку.
 */
export class Joystick {
  x = 0;
  y = 0;
  /** Ривок тримається кілька пакетів, щоб пережити втрату одного — симуляція бере фронт. */
  dashUntil = 0;
  private pointer: number | null = null;
  private cx = 0;
  private cy = 0;
  private readonly radius = 60;
  private history: { t: number; d: number }[] = [];

  constructor(
    zone: HTMLElement,
    private readonly base: HTMLElement,
    private readonly knob: HTMLElement,
    private readonly onFlick: () => void,
  ) {
    zone.addEventListener('pointerdown', (e) => {
      // Новий дотик завжди забирає стік. Старі Safari інколи не надсилають pointerup
      // (системний жест, втрачене захоплення) — без цього стік лишався «зайнятим» назавжди.
      this.pointer = e.pointerId;
      zone.classList.add('touch');
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        // Старий Safari може відмовити в захопленні — стік працює й без нього.
      }
      const r = zone.getBoundingClientRect();
      this.cx = e.clientX - r.left;
      this.cy = e.clientY - r.top;
      this.place(base, this.cx, this.cy);
      this.place(knob, this.cx, this.cy);
      base.style.display = knob.style.display = 'block';
      this.history = [{ t: e.timeStamp, d: 0 }];
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointer) return;
      const r = zone.getBoundingClientRect();
      let dx = e.clientX - r.left - this.cx;
      let dy = e.clientY - r.top - this.cy;
      const d = Math.hypot(dx, dy);
      // Палець далеко за край — центр підтягується слідом, стік не «застрягає».
      if (d > this.radius * 1.6) {
        const k = (d - this.radius * 1.6) / d;
        this.cx += dx * k;
        this.cy += dy * k;
        dx -= dx * k;
        dy -= dy * k;
        this.place(base, this.cx, this.cy);
      }
      const n = Math.min(1, Math.hypot(dx, dy) / this.radius);
      const a = Math.atan2(dy, dx);
      this.x = Math.cos(a) * n;
      this.y = -Math.sin(a) * n;
      // Мертва зона: дрібне тремтіння пальця не рухає персонажа.
      if (n < 0.12) this.x = this.y = 0;
      this.place(
        knob,
        this.cx + Math.cos(a) * n * this.radius,
        this.cy + Math.sin(a) * n * this.radius,
      );
      this.detectFlick(e.timeStamp, n);
    });
    const reset = () => {
      if (this.pointer === null) return;
      this.pointer = null;
      zone.classList.remove('touch');
      this.x = this.y = 0;
      base.style.display = knob.style.display = 'none';
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId === this.pointer) reset();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
    // Запобіжники на випадок, коли кінець дотику до зони не дійшов: на екрані не лишилось
    // жодного пальця або сторінка пішла у фон — стік відпущено, персонаж не біжить сам.
    const noFingers = (e: TouchEvent) => {
      if (e.touches.length === 0) reset();
    };
    document.addEventListener('touchend', noFingers);
    document.addEventListener('touchcancel', noFingers);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') reset();
    });
  }

  private detectFlick(t: number, n: number): void {
    this.history.push({ t, d: n });
    while (this.history.length > 0 && t - this.history[0]!.t > 110) this.history.shift();
    const oldest = this.history[0]!;
    // З майже центру до майже краю за ≤110 мс — це кидок, а не звичайний рух.
    if (n > 0.9 && oldest.d < 0.35 && t > this.dashUntil) {
      this.dashUntil = t + 150;
      this.history.length = 0;
      this.onFlick();
    }
  }

  private place(el: HTMLElement, x: number, y: number): void {
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }
}
