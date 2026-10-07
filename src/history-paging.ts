export const HISTORY_PAGE_SIZE = 20;
export class HistoryPaging {
  private cursors: (string | null)[] = [null];
  index = 0;
  nextCursor: string | null = null;
  get cursor(): string | null { return this.cursors[this.index]; }
  snapshot() { return { cursors: [...this.cursors], index: this.index, nextCursor: this.nextCursor }; }
  restore(state: ReturnType<HistoryPaging['snapshot']>): void { this.cursors = [...state.cursors]; this.index = state.index; this.nextCursor = state.nextCursor; }
  reset(): void { this.cursors = [null]; this.index = 0; this.nextCursor = null; }
  next(): boolean {
    if (!this.nextCursor) return false;
    this.cursors[this.index + 1] = this.nextCursor;
    this.index++; this.nextCursor = null; return true;
  }
  previous(): boolean {
    if (!this.index) return false;
    this.index--; this.nextCursor = null; return true;
  }
}
