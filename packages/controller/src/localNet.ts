import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';
import type { ClientTransport, NetState } from './transport';

/** Пара до screen/src/net/localHost.ts: та сама кімната через BroadcastChannel. */
export class LocalNet implements ClientTransport {
  state: NetState = 'idle';
  onMessage: (m: ScreenMessage) => void = () => {};
  onPacket: (v: DataView) => void = () => {};
  onState: (s: NetState) => void = () => {};
  private readonly id = Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) =>
    n.toString(36),
  ).join('');
  private readonly ch: BroadcastChannel;

  constructor(room: string) {
    this.ch = new BroadcastChannel(`horizon-local-${room}`);
    window.addEventListener('pagehide', () => this.ch.postMessage({ k: 'bye', from: this.id }));
  }

  start(hello: () => ControllerMessage): void {
    this.ch.onmessage = (
      e: MessageEvent<{ k: string; from: string; to?: string; data: unknown }>,
    ) => {
      const f = e.data;
      if (f.from !== 'host' || (f.to && f.to !== this.id)) return;
      if (f.k === 'rel') this.onMessage(f.data as ScreenMessage);
      else if (f.k === 'unrel') this.onPacket(new DataView(f.data as ArrayBuffer));
    };
    this.ch.postMessage({ k: 'hello', from: this.id });
    this.state = 'open';
    this.onState('open');
    this.send(hello());
  }

  send(m: ControllerMessage): void {
    this.ch.postMessage({ k: 'rel', from: this.id, to: 'host', data: m });
  }

  sendPacket(buf: ArrayBuffer): void {
    this.ch.postMessage({ k: 'unrel', from: this.id, to: 'host', data: buf });
  }
}
