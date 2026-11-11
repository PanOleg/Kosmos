/**
 * Журнал діагностики (DECISIONS.md, п. 69): кільцевий буфер рядків «час [тег] текст» для
 * пошуку збоїв зв'язку. Спільний для екрана й пульта; без DOM і мережі — час і сховище
 * передаються ззовні. Пульт пересилає свої рядки екрану (drain), тож на екрані видно обидва боки.
 */
export class DiagLog {
  private readonly buf: string[] = [];
  /** Скільки останніх рядків ще не забрано через drain(). */
  private pending = 0;
  /** Викликається після кожного нового рядка (перемальовка, збереження). */
  onAdd: (line: string) => void = () => {};

  constructor(
    private readonly clock: () => string,
    private readonly cap = 300,
    initial: string[] = [],
  ) {
    for (const l of initial.slice(-cap)) if (typeof l === 'string') this.buf.push(l);
  }

  private lastKey = '';
  private repeats = 0;

  /**
   * Той самий рядок підряд (помилка в кожному кадрі) пишеться один раз, далі лише рахується:
   * журнал не має ані гальмувати гру, ані витісняти корисне.
   */
  add(tag: string, text: string): void {
    const key = `[${tag}] ${text}`;
    if (key === this.lastKey) {
      this.repeats++;
      return;
    }
    if (this.repeats > 0)
      this.own(`${this.clock()} [${tag}] попередній рядок повторився ще ${this.repeats} раз(ів)`);
    this.lastKey = key;
    this.repeats = 0;
    this.own(`${this.clock()} ${key}`);
  }

  private own(line: string): void {
    this.push(line.slice(0, MAX_LINE));
    this.pending = Math.min(this.pending + 1, this.cap);
  }

  /** Чужі рядки (від пульта) — як є, з позначкою джерела; у drain() не потрапляють. */
  addForeign(source: string, lines: unknown): number {
    if (!Array.isArray(lines)) return 0;
    let n = 0;
    for (const l of lines.slice(-MAX_FOREIGN)) {
      if (typeof l !== 'string') continue;
      this.push(`${source} ${l}`.slice(0, MAX_LINE));
      n++;
    }
    return n;
  }

  /** Скільки рядків додано за весь час (разом із чужими) — курсор для since(). */
  seq = 0;

  /** Рядки, додані після позначки seq (свої й чужі); не старіші за місткість буфера. */
  since(seq: number): string[] {
    const n = Math.min(this.seq - seq, this.buf.length);
    return n > 0 ? this.buf.slice(-n) : [];
  }

  private push(line: string): void {
    this.seq++;
    this.buf.push(line);
    if (this.buf.length > this.cap) this.buf.shift();
    this.onAdd(line);
  }

  /** Рядки, додані після попереднього drain(). */
  drain(): string[] {
    const out = this.pending > 0 ? this.buf.slice(-this.pending) : [];
    this.pending = 0;
    return out;
  }

  lines(): readonly string[] {
    return this.buf;
  }

  text(): string {
    return this.buf.join('\n');
  }
}

const MAX_LINE = 300;
/** Стільки рядків за раз приймаємо від пульта. */
export const MAX_FOREIGN = 80;

/** Короткий опис помилки для журналу: тип PeerJS, ім'я й текст. */
export function describeError(e: unknown): string {
  if (e instanceof Error) {
    const type = (e as { type?: unknown }).type;
    return `${typeof type === 'string' ? `${type}: ` : ''}${e.name}: ${e.message}`;
  }
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return String(e);
  }
}

/** Місцевий час ГГ:ХХ:СС.ммм. */
export function wallClock(d: Date = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
