import type { ControllerMessage, ScreenMessage } from '@horizon/sim/protocol';

/**
 * Межа між грою й мережею. Ігрова логіка бачить лише Link; PeerJS, власний сигналінг-сервер
 * чи будь-що інше реалізує HostTransport і більше нічого не змінює.
 */
export interface Link {
  readonly id: string;
  readonly open: boolean;
  /** Через ретранслятор (TURN): повільніше й витрачає місячний ліміт; null — невідомо. */
  relay?: boolean | null;
  sendReliable(msg: ScreenMessage): void;
  /** Ненадійний невпорядкований канал; мовчки губиться, якщо ще не відкритий. */
  sendUnreliable(buf: ArrayBuffer): void;
  onReliable: (msg: ControllerMessage) => void;
  onUnreliable: (view: DataView) => void;
  onClose: () => void;
  close(): void;
}

export interface HostTransport {
  /** Реєструє кімнату; кидає RoomTakenError, якщо код зайнятий. */
  start(roomCode: string): Promise<void>;
  onLink: (link: Link) => void;
  stop(): void;
}

export class RoomTakenError extends Error {}
