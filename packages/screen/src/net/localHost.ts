import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';
import type { HostTransport, Link } from './transport';

/**
 * Транспорт без мережі: BroadcastChannel між вкладками одного origin (пульт роздається
 * з /controller/ того ж сервера). Для розробки без інтернету й автотестів UI.
 * Протокол той самий; надійність тут ідеальна, тож ненадійний канал просто не губить пакети.
 */
export type LocalFrame =
  | { k: 'hello'; from: string }
  | { k: 'rel'; from: string; to: string; data: unknown }
  | { k: 'unrel'; from: string; to: string; data: ArrayBuffer }
  | { k: 'bye'; from: string };

export const HOST_ID = 'host';

export class LocalHost implements HostTransport {
  private ch: BroadcastChannel | null = null;
  private readonly links = new Map<string, Link & { closed: boolean }>();
  onLink: (link: Link) => void = () => {};

  start(roomCode: string): Promise<void> {
    const ch = new BroadcastChannel(`horizon-local-${roomCode}`);
    this.ch = ch;
    ch.onmessage = (e: MessageEvent<LocalFrame>) => {
      const f = e.data;
      if (f.k === 'hello') {
        this.links.get(f.from)?.onClose();
        const link = {
          id: f.from,
          closed: false,
          get open() {
            return !this.closed;
          },
          sendReliable: (msg: ScreenMessage) =>
            ch.postMessage({ k: 'rel', from: HOST_ID, to: f.from, data: msg } satisfies LocalFrame),
          sendUnreliable: (buf: ArrayBuffer) =>
            ch.postMessage({
              k: 'unrel',
              from: HOST_ID,
              to: f.from,
              data: buf,
            } satisfies LocalFrame),
          onReliable: (_m: ControllerMessage) => {},
          onUnreliable: (_v: DataView) => {},
          onClose: () => {},
          close: () => {
            if (link.closed) return;
            link.closed = true;
            ch.postMessage({ k: 'bye', from: HOST_ID } satisfies LocalFrame);
            link.onClose();
          },
        };
        this.links.set(f.from, link);
        this.onLink(link);
        return;
      }
      const link = this.links.get(f.from);
      if (!link || link.closed) return;
      if (f.k === 'rel' && f.to === HOST_ID) link.onReliable(f.data as ControllerMessage);
      else if (f.k === 'unrel' && f.to === HOST_ID) link.onUnreliable(new DataView(f.data));
      else if (f.k === 'bye') {
        link.closed = true;
        link.onClose();
      }
    };
    return Promise.resolve();
  }

  stop(): void {
    this.ch?.close();
    this.ch = null;
  }
}
