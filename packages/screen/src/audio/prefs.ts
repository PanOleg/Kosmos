import type { AudioPrefs } from '@horizon/sim/protocol';

/**
 * Музика, звуки подій і озвучка вмикаються окремо (DECISIONS.md, п. 53): з пульта на паузі,
 * клавішами N / J / V або в лобі. Зберігається на пристрої з екраном.
 */
export type AudioChannel = keyof AudioPrefs;

const KEY = 'horizon-audio';

export function loadAudioPrefs(): AudioPrefs {
  const prefs: AudioPrefs = { music: true, sfx: true, voice: true };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(prefs, JSON.parse(raw) as Partial<AudioPrefs>);
    // Старий окремий перемикач озвучки.
    else if (localStorage.getItem('horizon-voice') === 'off') prefs.voice = false;
  } catch {
    /* приватний режим — усе ввімкнено */
  }
  return prefs;
}

export function saveAudioPrefs(p: AudioPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* не критично */
  }
}
