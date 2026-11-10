/**
 * Зворотний зв'язок пульта й «правила поведінки» мобільного браузера:
 * колір фону, вібрація, екран не гасне, альбомна орієнтація, звук після першого дотику.
 */
let audio: AudioContext | null = null;
let wakeLock: { release(): Promise<void> } | null = null;

export function hexCss(c: number): string {
  return '#' + c.toString(16).padStart(6, '0');
}

/** Фон — притемнений колір класу: видно на периферії зору, не сліпить у темряві. */
export function setPlayerColor(color: number | null): void {
  const root = document.documentElement.style;
  if (color === null) {
    root.setProperty('--bg', '#0b1020');
    root.setProperty('--c', '#ffffff');
    return;
  }
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  root.setProperty('--c', hexCss(color));
  root.setProperty(
    '--bg',
    `rgb(${Math.round(r * 0.35)}, ${Math.round(g * 0.35)}, ${Math.round(b * 0.35)})`,
  );
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      `rgb(${Math.round(r * 0.35)}, ${Math.round(g * 0.35)}, ${Math.round(b * 0.35)})`,
    );
}

export function hurt(amount: number): void {
  document.body.classList.remove('hurt');
  void document.body.offsetWidth;
  document.body.classList.add('hurt');
  // iOS Safari vibrate не підтримує — там лишається спалах і звук.
  navigator.vibrate?.(Math.min(200, 40 + amount * 4));
  blip(110, 0.12, 0.25);
}

export function blip(freq: number, dur: number, gain = 0.15): void {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Усе, що браузер дозволяє лише з жесту користувача: звук, повний екран, орієнтація, wake lock. */
export async function onUserGesture(): Promise<void> {
  if (!audio) {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio = new Ctx();
  }
  if (audio.state === 'suspended') await audio.resume().catch(() => {});
  await requestWakeLock();
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
  if (!document.fullscreenElement && el.requestFullscreen) {
    try {
      await el.requestFullscreen({ navigationUI: 'hide' });
      await (
        screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
      ).lock?.('landscape');
    } catch {
      // iOS не дає ні fullscreen, ні lock — тоді показуємо підказку «поверніть телефон».
    }
  }
}

async function requestWakeLock(): Promise<void> {
  const wl = (
    navigator as Navigator & {
      wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
    }
  ).wakeLock;
  if (!wl || wakeLock) return;
  try {
    wakeLock = await wl.request('screen');
    (wakeLock as unknown as EventTarget).addEventListener('release', () => (wakeLock = null));
  } catch {
    // Немає захищеного контексту або батарея економить — не критично.
  }
}

// Після повернення з фону wake lock знято браузером — просимо знову.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void requestWakeLock();
});

/** Масштабування, прокрутка, виділення, контекстне меню, жести iOS — вимкнено. */
export function lockPage(): void {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('gesturestart', stop);
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
}
