/**
 * ICE-сервери для WebRTC. STUN — публічний Google. TURN (ретранслятор) потрібен, коли пряме
 * з'єднання неможливе: сайт в інтернеті не знає LAN-адреси екрана, а mDNS у багатьох мережах
 * не працює (DECISIONS.md, п. 43). VITE_TURN_URL — адреса видачі облікових даних Metered
 * (`https://<app>.metered.live/api/v1/turn/credentials?apiKey=…`), задається при збірці.
 * Вбудований TURN PeerJS не відповідає, тому його не використовуємо.
 * Копія — у screen/src/net/ice.ts і controller/src/ice.ts (симуляція без браузерного коду).
 */
import { logErr, logNet } from './diag';

let cached: Promise<RTCIceServer[]> | null = null;

export function iceServers(): Promise<RTCIceServer[]> {
  cached ??= load();
  return cached;
}

async function load(): Promise<RTCIceServer[]> {
  const base: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const url = import.meta.env.VITE_TURN_URL as string | undefined;
  if (!url) {
    logNet('TURN не заданий: лише STUN (працює тільки в одній мережі)');
    return base;
  }
  try {
    const r = await fetch(url);
    if (r.ok) {
      const turn = (await r.json()) as RTCIceServer[];
      logNet(`TURN: отримано ${turn.length} серверів`);
      return [...base, ...turn];
    }
    logNet(`TURN: сервер облікових даних відповів ${r.status}`);
  } catch (e) {
    logErr('TURN', e);
  }
  return base;
}
