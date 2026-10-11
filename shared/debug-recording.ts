/** Compact, bounded recordings. No storage, timers, networking, or frame hooks live here. */
export type DebugValue = null | boolean | number | string | DebugValue[] | { [key: string]: DebugValue };
export type DebugChange = { p: string; v?: DebugValue; s?: [number, number, DebugValue[]] };
export type DebugPriority = 'critical' | 'telemetry';
const encoder = new TextEncoder();
const EXPORT_RESERVE = 4096;
const now = () => typeof performance === 'undefined' ? Date.now() : performance.now();
const escapePath = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');

/** Undo JSON contains another entire state, sometimes nested. Preserve its presence and size only. */
export function projectDebugState(input: unknown): DebugValue {
  const parents = new Set<object>();
  let remaining = 200_000;
  function visit(value: unknown, depth: number): DebugValue {
    if (--remaining < 0 || depth > 32) return '[diagnostic projection limit]';
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.length > 16_384 ? `${value.slice(0, 16_384)}[diagnostic string truncated; original characters=${value.length}]` : value;
    if (typeof value !== 'object') return String(value);
    if (parents.has(value)) return '[circular]';
    parents.add(value);
    let result: DebugValue;
    if (Array.isArray(value)) result = value.map((item) => visit(item, depth + 1));
    else {
      const object: Record<string, DebugValue> = Object.create(null);
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined) continue;
        if (key === 'stateJson' && typeof item === 'string') object[key] = { omittedUndoCharacters: item.length };
        else if (/^(password|reconnectionToken|authorization|accessToken|secret|apiKey)$/i.test(key)) object[key] = '[redacted]';
        else object[key] = visit(item, depth + 1);
      }
      result = object;
    }
    parents.delete(value);
    return result;
  }
  return visit(input, 0);
}

function diff(before: DebugValue, after: DebugValue, path: string, changes: DebugChange[]): void {
  if (before === after) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    // Logs grow at the front. Splice their changed middle once, retaining the identical suffix.
    if (path === '/log' || before.every((item) => typeof item === 'string') && after.every((item) => typeof item === 'string')) {
      let head = 0;
      while (head < before.length && head < after.length && before[head] === after[head]) head++;
      let tail = 0;
      while (tail < before.length - head && tail < after.length - head && before[before.length - tail - 1] === after[after.length - tail - 1]) tail++;
      if (head !== before.length || head !== after.length) changes.push({ p: path, s: [head, before.length - head - tail, after.slice(head, after.length - tail)] });
      return;
    }
    for (let index = 0; index < Math.min(before.length, after.length); index++) diff(before[index], after[index], `${path}/${index}`, changes);
    if (before.length !== after.length) changes.push({ p: path, s: [Math.min(before.length, after.length), Math.max(0, before.length - after.length), after.slice(before.length)] });
    return;
  }
  if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
    for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) changes.push({ p: `${path}/${escapePath(key)}` });
    for (const key of Object.keys(after)) {
      const next = `${path}/${escapePath(key)}`;
      if (!Object.hasOwn(before, key)) changes.push({ p: next, v: after[key] });
      else diff(before[key], after[key], next, changes);
    }
    return;
  }
  changes.push({ p: path, v: after });
}

export function diffDebugValues(before: DebugValue, after: DebugValue): DebugChange[] {
  const changes: DebugChange[] = [];
  diff(before, after, '', changes);
  return changes;
}

/** Used by tooling to reconstruct projected states sequentially from state/state.delta records. */
export function applyDebugChanges(state: DebugValue, changes: DebugChange[]): DebugValue {
  for (const change of changes) {
    if (change.p === '') {
      if (change.s && Array.isArray(state)) state.splice(change.s[0], change.s[1], ...change.s[2]);
      else state = change.v ?? null;
      continue;
    }
    const parts = change.p.slice(1).split('/').map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (parts.some((part) => part === '__proto__' || part === 'prototype' || part === 'constructor')) throw new Error('Unsafe diagnostic state path.');
    let target = state as Record<string, DebugValue>;
    for (const part of parts.slice(0, -1)) target = target[part] as Record<string, DebugValue>;
    const key = parts.at(-1)!;
    if (change.s) (target[key] as DebugValue[]).splice(change.s[0], change.s[1], ...change.s[2]);
    else if (Object.hasOwn(change, 'v')) target[key] = change.v!;
    else delete target[key];
  }
  return state;
}

export class DebugRecorder {
  readonly maxBytes: number;
  readonly source: string;
  private lines: string[] = [];
  private lineSequences: number[] = [];
  private bytes = 0;
  private startedAt = Date.now();
  private started = now();
  private sequence = 0;
  private revision = 0;
  private previous: DebugValue | undefined;
  private metadata: DebugValue = null;
  private dropped = { critical: 0, telemetry: 0 };
  private incomplete = false;
  private recordingMs = 0;

  constructor(options: { maxBytes?: number; source?: string } = {}) {
    this.maxBytes = Math.max(8192, Math.floor(options.maxBytes ?? 2 * 1024 * 1024));
    this.source = (options.source ?? 'client').slice(0, 64);
  }

  reset(metadata?: unknown): void {
    this.lines = []; this.lineSequences = []; this.bytes = 0; this.startedAt = Date.now(); this.started = now();
    this.sequence = 0; this.revision = 0; this.previous = undefined; this.dropped = { critical: 0, telemetry: 0 };
    this.incomplete = false; this.recordingMs = 0;
    try {
      this.metadata = projectDebugState(metadata);
      if (encoder.encode(JSON.stringify(this.metadata)).length > 1024) this.metadata = { omitted: 'Recording metadata exceeded 1024-byte limit.' };
    } catch { this.metadata = { omitted: 'Recording metadata could not be inspected.' }; }
  }

  record(kind: string, data?: unknown, priority: DebugPriority = 'critical'): number {
    return this.append(kind, data, priority, false);
  }

  private append(kind: string, data: unknown, priority: DebugPriority, prepared: boolean): number {
    const begin = now();
    const sequence = ++this.sequence;
    // Once gameplay history reaches the cap, retain its prefix and declare the gap explicitly.
    if (this.incomplete && priority === 'critical' || this.bytes >= this.maxBytes * (priority === 'telemetry' ? 0.8 : 1) - EXPORT_RESERVE) {
      this.dropped[priority]++; if (priority === 'critical') this.incomplete = true;
      this.recordingMs += now() - begin;
      return sequence;
    }
    try {
      const line = JSON.stringify({ n: sequence, t: Math.round(now() - this.started), k: kind.slice(0, 100), ...(data === undefined ? {} : { d: prepared ? data : projectDebugState(data) }) });
      const bytes = encoder.encode(line).length + 1;
      if (this.bytes + bytes > this.maxBytes * (priority === 'telemetry' ? 0.8 : 1) - EXPORT_RESERVE) {
        this.dropped[priority]++; if (priority === 'critical') this.incomplete = true;
      } else { this.lines.push(line); this.lineSequences.push(sequence); this.bytes += bytes; }
    } catch { this.dropped[priority]++; if (priority === 'critical') this.incomplete = true; }
    this.recordingMs += now() - begin;
    return sequence;
  }

  state(input: unknown, context?: unknown): void {
    if (this.incomplete) { this.dropped.critical++; return; }
    const begin = now();
    const beforeRecordingMs = this.recordingMs;
    try {
      const next = projectDebugState(input);
      const revision = ++this.revision;
      if (this.previous === undefined) this.append('state', { revision, value: next, ...(context === undefined ? {} : { context: projectDebugState(context) }) }, 'critical', true);
      else {
        const changes: DebugChange[] = [];
        diff(this.previous, next, '', changes);
        if (changes.length) this.append('state.delta', { revision, changes, ...(context === undefined ? {} : { context: projectDebugState(context) }) }, 'critical', true);
      }
      this.previous = next;
    } catch { this.dropped.critical++; this.incomplete = true; }
    this.recordingMs = beforeRecordingMs + now() - begin;
  }

  snapshot() {
    return { source: this.source, startedAt: this.startedAt, bytes: this.bytes, maxBytes: this.maxBytes,
      events: this.lines.length, incomplete: this.incomplete, dropped: { ...this.dropped },
      stateRevision: this.revision, lastSequence: this.sequence, recordingMs: Math.round(this.recordingMs * 100) / 100 };
  }

  exportLines(): string {
    return `${this.exportHeaderLine()}\n${this.lines.join('\n')}\n${JSON.stringify({ k: 'recording.end', ...this.snapshot() })}\n`;
  }

  exportEventLinesAfter(sequence: number): string[] {
    let start = this.lines.length;
    while (start > 0 && this.lineSequences[start - 1] > sequence) start--;
    return this.lines.slice(start);
  }

  exportHeaderLine(): string {
    return JSON.stringify({ k: 'recording', version: 1, ...this.snapshot(), metadata: this.metadata,
      encoding: { n: 'event sequence', t: 'milliseconds since recording start', k: 'kind', d: 'data',
        state: 'Initial projected state. Apply state.delta changes in order: p is JSON Pointer; v sets, absent v deletes; s is [start,deleteCount,insertedItems] splice.',
        omitted: 'Undo stateJson bodies replaced by character counts to prevent recursive state duplication. Gameplay changes and undo results remain recorded. No deterministic replay guarantee.' } });
  }
}
