import type { PlayerId } from '../shared/game.ts';

/** Per-match acknowledgements cannot unlock a later match after a slow download. */
export class MatchLoading {
  private key = '';
  private token = 0;
  private pending = new Set<PlayerId>();
  get blocked() { return this.pending.size > 0; }
  prepare(key: string, seats: Iterable<PlayerId>) {
    if (key === this.key) return false;
    this.key = key;
    this.token++;
    this.pending = new Set(seats);
    return true;
  }
  acknowledge(token: number, seat: PlayerId) {
    return token === this.token && this.pending.delete(seat);
  }
  remove(seat: PlayerId) { return this.pending.delete(seat); }
  snapshot() { return { token: this.token, pendingSeats: [...this.pending] }; }
}
