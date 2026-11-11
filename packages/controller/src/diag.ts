import { DiagLog, describeError, wallClock } from '@horizon/sim/diag';

/**
 * Журнал діагностики цієї сторінки (DECISIONS.md, п. 69). Переживає оновлення сторінки
 * (sessionStorage), дублюється в консоль. Копія файла — у screen/src і controller/src.
 */
const KEY = 'horizon-diag';

function restore(): string[] {
  try {
    const v: unknown = JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export const diag = new DiagLog(() => wallClock(), 300, restore());

let saveTimer = 0;
const listeners = new Set<() => void>();
diag.onAdd = (line) => {
  console.info('[diag]', line);
  for (const f of listeners) f();
  // Збереження пачкою: рядки йдуть серіями, а запис у сховище не безплатний.
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(diag.lines()));
    } catch {
      // Приватний режим або повне сховище — журнал лишиться тільки в пам'яті.
    }
  }, 500);
};

export function onDiag(f: () => void): void {
  listeners.add(f);
}

export function logNet(text: string): void {
  diag.add('мережа', text);
}

export function logErr(where: string, e: unknown): void {
  diag.add('помилка', `${where}: ${describeError(e)}`);
}

/** Збої самої сторінки: винятки, відхилені проміси, сон вкладки, зникнення мережі. */
export function watchPage(who: string): void {
  diag.add('сторінка', `${who} відкрито · ${navigator.userAgent}`);
  window.addEventListener('error', (e) =>
    diag.add('помилка', `${e.message} @ ${e.filename.split('/').pop() ?? ''}:${e.lineno}`),
  );
  window.addEventListener('unhandledrejection', (e) => logErr('проміс', e.reason));
  document.addEventListener('visibilitychange', () =>
    diag.add(
      'сторінка',
      document.visibilityState === 'visible' ? 'вкладка видима' : 'вкладка у фоні',
    ),
  );
  window.addEventListener('online', () => diag.add('сторінка', 'мережа з’явилась'));
  window.addEventListener('offline', () => diag.add('сторінка', 'мережа зникла'));
  window.addEventListener('pagehide', () => {
    diag.add('сторінка', 'сторінку закрито або оновлено');
    try {
      sessionStorage.setItem(KEY, JSON.stringify(diag.lines()));
    } catch {
      // Див. вище.
    }
  });
}

/** Яким шляхом пішло з'єднання: напряму (host/srflx) чи через ретранслятор (relay). */
export async function routeOf(pc: RTCPeerConnection): Promise<string> {
  try {
    const stats = await pc.getStats();
    let pair: { localCandidateId?: string; remoteCandidateId?: string } | null = null;
    stats.forEach((r: { type: string; state?: string; nominated?: boolean }) => {
      if (r.type === 'candidate-pair' && r.state === 'succeeded' && (r.nominated ?? true))
        pair = r as never;
    });
    if (!pair) return 'шлях невідомий';
    const p = pair as { localCandidateId?: string; remoteCandidateId?: string };
    const kind = (id?: string) => {
      const c = id ? (stats.get(id) as { candidateType?: string; protocol?: string }) : undefined;
      return c ? `${c.candidateType ?? '?'}/${c.protocol ?? '?'}` : '?';
    };
    return `свій ${kind(p.localCandidateId)} ↔ чужий ${kind(p.remoteCandidateId)}`;
  } catch (e) {
    return `шлях невідомий (${describeError(e)})`;
  }
}

/** Стани ICE й з'єднання — у журнал; кандидати — лише підсумком за типами. */
export function watchPeer(pc: RTCPeerConnection, who: string): void {
  const kinds: Record<string, number> = {};
  pc.addEventListener('icecandidate', (e) => {
    const m = e.candidate ? / typ (\w+)/.exec(e.candidate.candidate) : null;
    if (m) kinds[m[1]!] = (kinds[m[1]!] ?? 0) + 1;
  });
  pc.addEventListener('icegatheringstatechange', () => {
    if (pc.iceGatheringState === 'complete')
      logNet(
        `${who}: свої кандидати ${JSON.stringify(kinds)}${kinds.relay ? '' : ' — без relay (TURN не спрацював або не заданий)'}`,
      );
  });
  pc.addEventListener('iceconnectionstatechange', () => {
    const s = pc.iceConnectionState;
    logNet(`${who}: ICE ${s}`);
    if (s === 'connected') void routeOf(pc).then((r) => logNet(`${who}: ${r}`));
  });
  pc.addEventListener('icecandidateerror', (e) => {
    const ev = e as RTCPeerConnectionIceErrorEvent;
    // 701 від STUN на IPv6/mDNS — буденність; цікаві лише відмови TURN.
    if (/^turns?:/.test(ev.url)) logNet(`${who}: TURN ${ev.url} — ${ev.errorCode} ${ev.errorText}`);
  });
}

/**
 * Автоматичне надсилання журналу розробнику (DECISIONS.md, п. 71): нові рядки — на /api/log
 * того самого сайту. Лише в зібраній версії на хостингу; у розробці й за LAN-адресою вимкнено.
 * Помилка чи втрата зв'язку — за 2 с, решта — раз на 30 с; закриття сторінки — sendBeacon.
 */
export function startUpload(role: 'screen' | 'controller', room: () => string): void {
  const host = location.hostname;
  if (!import.meta.env.PROD || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':'))
    return;
  const sid = Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join(
    '',
  );
  let sent = diag.seq;
  let timer = 0;
  const payload = (): string | null => {
    const lines = diag.since(sent);
    if (lines.length === 0) return null;
    sent = diag.seq;
    return JSON.stringify({ role, room: room(), sid, lines });
  };
  const flush = () => {
    window.clearTimeout(timer);
    timer = 0;
    const body = payload();
    if (!body) return;
    // Збій надсилання в журнал не пишемо: інакше він сам себе й породжував би.
    void fetch('/api/log', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  };
  onDiag(() => {
    const last = diag.lines()[diag.lines().length - 1] ?? '';
    const urgent = /\[помилка\]|утрачено|відмов|failed|disconnected/.test(last);
    if (urgent) {
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 2000);
    } else if (!timer) timer = window.setTimeout(flush, 30000);
  });
  window.addEventListener('pagehide', () => {
    const body = payload();
    if (body) navigator.sendBeacon('/api/log', body);
  });
  // Початок сесії — одразу: видно, хто й звідки зайшов, навіть якщо далі все зависне.
  sent = 0;
  timer = window.setTimeout(flush, 4000);
}
