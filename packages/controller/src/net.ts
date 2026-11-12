import Peer, { type DataConnection } from 'peerjs';
import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';
import type { ClientTransport, NetState } from './transport';
import { iceServers } from './ice';
import { logErr, logNet, watchPeer } from './diag';

const PEER_PREFIX = 'horizon-room-';
const INPUT_CHANNEL_ID = 100;
/** Скільки чекаємо на відповідь екрана, перш ніж дзвонити заново. */
const ATTEMPT_MS = 7000;
/** Скільки терпимо ICE disconnected, перш ніж вважати лінію втраченою. */
const LIMBO_MS = 3000;

/**
 * Клієнт пульта. Надійний JSON-канал через PeerJS + власний узгоджений ненадійний канал
 * поверх того ж RTCPeerConnection (див. screen/src/net/peerjsHost.ts).
 * Перепідключається сам: телефон засинає, вкладка йде у фон, мережа моргає.
 */
export class ControllerNet implements ClientTransport {
  state: NetState = 'idle';
  onMessage: (m: ScreenMessage) => void = () => {};
  onPacket: (v: DataView) => void = () => {};
  onState: (s: NetState) => void = () => {};
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private unreliable: RTCDataChannel | null = null;
  private retryTimer = 0;
  private attemptTimer = 0;
  /** Чекаємо на відкриття сигналінгу, щоб подзвонити. */
  private wantCall = false;
  private retries = 0;
  /** Повідомлення, яке надсилається першим після кожного (пере)підключення. */
  private helloFactory: () => ControllerMessage = () => ({ t: 'hello', v: 1, token: '' });

  constructor(private readonly room: string) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state !== 'open') this.reconnectSoon(0);
    });
    window.addEventListener('online', () => this.state !== 'open' && this.reconnectSoon(0));
  }

  private ice: RTCIceServer[] = [];

  start(hello: () => ControllerMessage): void {
    this.helloFactory = hello;
    void iceServers().then((ice) => {
      this.ice = ice;
      this.connect();
    });
  }

  private setState(s: NetState): void {
    if (this.state === s) return;
    logNet(`стан: ${this.state} → ${s}`);
    this.state = s;
    this.onState(s);
  }

  private connect(): void {
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.attemptTimer);
    this.setState(this.state === 'open' || this.state === 'lost' ? 'lost' : 'connecting');
    if (!this.peer || this.peer.destroyed) {
      const peer = new Peer({ config: { iceServers: this.ice } });
      this.peer = peer;
      // Один обробник на все життя peer: раніше кожна спроба додавала свій, і коли сигналінг
      // нарешті відкривався, на екран летіло півтора десятка дзвінків одразу.
      peer.on('open', (id) => {
        logNet(`сигналінг відкрито, мій id ${id.slice(0, 6)}`);
        if (this.wantCall && peer === this.peer) this.call(peer);
      });
      peer.on('error', (err) => {
        // peer-unavailable — екран із таким кодом не знайдено (закритий або код інший).
        logErr('сигналінг', err);
        // Сигналінг потрібен лише щоб додзвонитися: живу лінію його збій не чіпає.
        if (this.state === 'open' || peer !== this.peer) return;
        this.dropConn();
        this.reconnectSoon();
      });
      peer.on('disconnected', () => {
        logNet('сервер сигналінгу від’єднався');
        if (this.state !== 'open' && peer === this.peer) this.reconnectSoon();
      });
    }
    const peer = this.peer;
    this.wantCall = true;
    if (peer.open) this.call(peer);
    else if (peer.disconnected) peer.reconnect();
    // Екран міг зникнути з мережі, а сервер сигналінгу ще цього не помітив: дзвінок іде в
    // нікуди без жодної помилки. Тож спроба має строк, після якого починаємо заново.
    this.attemptTimer = window.setTimeout(() => {
      if (this.state === 'open') return;
      logNet(`спроба не вдалася за ${ATTEMPT_MS / 1000} с — ще раз`);
      this.retries++;
      this.dropConn();
      // Сигналінг так і не відкрився — мережа могла змінитися, беремо свіже з'єднання.
      if (!peer.open) {
        this.peer = null;
        peer.destroy();
      }
      this.reconnectSoon(0);
    }, ATTEMPT_MS);
  }

  private call(peer: Peer): void {
    this.wantCall = false;
    this.dropConn();
    const conn = peer.connect(PEER_PREFIX + this.room, { serialization: 'json', reliable: true });
    this.conn = conn;
    logNet(`дзвоню в кімнату ${this.room} (спроба ${this.retries + 1})`);
    if (conn.peerConnection) watchPeer(conn.peerConnection, 'екран');
    conn.on('open', () => {
      if (conn !== this.conn) return;
      window.clearTimeout(this.attemptTimer);
      logNet('канал відкрито');
      this.unreliable = conn.peerConnection.createDataChannel('input', {
        negotiated: true,
        id: INPUT_CHANNEL_ID,
        ordered: false,
        maxRetransmits: 0,
      });
      this.unreliable.binaryType = 'arraybuffer';
      this.unreliable.onmessage = (e) => this.onPacket(new DataView(e.data as ArrayBuffer));
      this.unreliable.onopen = () => logNet('канал вводу відкрито');
      const ch = this.unreliable;
      // Власне закриття каналу теж приходить сюди — це не збій.
      ch.onerror = (e) =>
        this.unreliable === ch && logErr('канал вводу', (e as RTCErrorEvent).error);
      // conn.peerConnection після закриття стає null — тримаємо власне посилання.
      const pc = conn.peerConnection;
      // Коротке «disconnected» мережа часто лікує сама — даємо їй кілька секунд, перш ніж
      // рвати лінію й дзвонити заново.
      let limbo = 0;
      pc.addEventListener('iceconnectionstatechange', () => {
        const s = pc.iceConnectionState;
        window.clearTimeout(limbo);
        if (s === 'failed' || s === 'closed') this.lose(conn, `ICE ${s}`);
        else if (s === 'disconnected')
          limbo = window.setTimeout(
            () => this.lose(conn, `ICE disconnected довше ${LIMBO_MS / 1000} с`),
            LIMBO_MS,
          );
      });
      this.retries = 0;
      this.inputWarned = false;
      this.setState('open');
      void conn.send(this.helloFactory());
    });
    conn.on('data', (d) => conn === this.conn && this.onMessage(d as ScreenMessage));
    conn.on('close', () => this.lose(conn, 'канал закрився'));
    conn.on('error', (err) => {
      logErr('канал', err);
      this.lose(conn, 'помилка каналу');
    });
  }

  private lose(conn: DataConnection, why: string): void {
    if (conn !== this.conn) return;
    logNet(`зв'язок утрачено — ${why}`);
    this.dropConn();
    this.setState('lost');
    this.reconnectSoon();
  }

  private dropConn(): void {
    this.unreliable?.close();
    this.unreliable = null;
    const c = this.conn;
    this.conn = null;
    c?.close();
  }

  private reconnectSoon(delay?: number): void {
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.attemptTimer);
    // Експоненційна пауза 0.5 → 4 с: не довбати сервер, але й не чекати довго.
    const d = delay ?? Math.min(4000, 500 * 2 ** this.retries++);
    this.retryTimer = window.setTimeout(() => {
      this.dropConn();
      this.connect();
    }, d);
  }

  send(m: ControllerMessage): void {
    if (this.conn?.open) void this.conn.send(m);
  }

  sendPacket(buf: ArrayBuffer): void {
    if (this.unreliable?.readyState === 'open') this.unreliable.send(buf);
    else if (this.state === 'open' && !this.inputWarned) {
      // Лобі працює, а рух — ні: надійний канал є, канал вводу не відкрився.
      this.inputWarned = true;
      logNet(`ввід не йде: канал вводу ${this.unreliable?.readyState ?? 'відсутній'}`);
    }
  }
  private inputWarned = false;
}
