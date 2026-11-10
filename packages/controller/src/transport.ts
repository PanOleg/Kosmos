import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';

export type NetState = 'idle' | 'connecting' | 'open' | 'lost';

/** Межа пульта з мережею: PeerJS або локальний BroadcastChannel реалізують одне й те саме. */
export interface ClientTransport {
  state: NetState;
  onMessage: (m: ScreenMessage) => void;
  onPacket: (v: DataView) => void;
  onState: (s: NetState) => void;
  start(hello: () => ControllerMessage): void;
  send(m: ControllerMessage): void;
  sendPacket(buf: ArrayBuffer): void;
}
