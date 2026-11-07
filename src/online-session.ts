import type { Room } from '@colyseus/sdk';
import { RECONNECT_MAX_DELAY_MS, RECONNECT_MAX_RETRIES } from '../shared/reconnection.ts';

type SessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Shared across tabs on the same origin. Retain sessionStorage as a migration
// source for sessions created before shared storage was introduced.
export class OnlineSessions {
  constructor(private shared: () => SessionStorage, private legacy: () => SessionStorage) {}

  private key(roomId: string) { return `gridfall.reconnection.${roomId}`; }

  read(roomId: string): string | null {
    try {
      const token = this.shared().getItem(this.key(roomId));
      if (token) return token;
    } catch { /* Storage may be disabled; a live connection must still work. */ }
    try { return this.legacy().getItem(this.key(roomId)); } catch { return null; }
  }

  save(roomId: string, token: string): void {
    try { this.shared().setItem(this.key(roomId), token); } catch { /* Fall back to this tab. */ }
    try { this.legacy().setItem(this.key(roomId), token); } catch { /* Storage is optional. */ }
  }

  forget(roomId: string, token: string): void {
    // An old tab must never erase the credentials of its replacement.
    for (const storage of [this.shared, this.legacy]) {
      try {
        const target = storage();
        if (target.getItem(this.key(roomId)) === token) target.removeItem(this.key(roomId));
      } catch { /* Storage is optional. */ }
    }
  }
}

export function trackOnlineSession(room: Room, sessions: OnlineSessions): void {
  sessions.save(room.roomId, room.reconnectionToken);
  room.reconnection.minUptime = 0;
  room.reconnection.maxRetries = RECONNECT_MAX_RETRIES;
  room.reconnection.maxDelay = RECONNECT_MAX_DELAY_MS;
  room.onReconnect(() => {
    // The SDK emits onReconnect before assigning the rotated token.
    queueMicrotask(() => sessions.save(room.roomId, room.reconnectionToken));
  });
}
