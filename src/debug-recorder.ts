import { DebugRecorder, projectDebugState, diffDebugValues, type DebugValue } from '../shared/debug-recording';

export const DEBUG_DUMP_LIMIT_BYTES = 5 * 1024 * 1024;
const CLIENT_BYTES = 2 * 1024 * 1024;
const SERVER_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const byteSize = (text: string) => encoder.encode(text).length;
type IndexEntry = { source: string; n: number; k: string; t: number };
type ServerResult = { status: string; text?: string; error?: string };

/** A separate state appendix is expendable; chronological gameplay must never be cut silently. */
export function buildDebugBundle(client: string, summary: unknown, server: ServerResult, state: unknown,
  index: IndexEntry[] = [], limitBytes = DEBUG_DUMP_LIMIT_BYTES): string {
  const omitted: string[] = [];
  let serverSummary: Record<string, unknown> | undefined;
  const allIndex = [...index];
  if (server.text) {
    try {
      const headerLine = server.text.slice(0, server.text.indexOf('\n'));
      serverSummary = JSON.parse(headerLine);
      for (const line of server.text.split('\n')) {
        if (allIndex.length >= 512) break;
        if (!/"k":"[^"]*(?:error|issue|drop|reconnect|leave|left|failed|rejected)/.test(line)) continue;
        const event = JSON.parse(line);
        if (typeof event.n === 'number') allIndex.push({ source: 'server', n: event.n, k: event.k, t: event.t });
      }
    } catch { serverSummary = { incomplete: true, error: 'Invalid server recording header' }; }
  }
  const header = JSON.stringify({ k: 'dump', version: 1, exportedAt: new Date().toISOString(),
    limitBytes, client: summary, server: { status: server.status, summary: serverSummary ? { incomplete: serverSummary.incomplete, events: serverSummary.events, dropped: serverSummary.dropped } : undefined,
      ...(server.error ? { error: server.error } : {}) },
    index: allIndex, reading: 'Read the index first, then each source timeline sequentially. Client/server clocks are relative to their own recording starts; network.debug-meta correlates authoritative revisions. State appendix is current at export request. performance.sample.delta changes use the same JSON Pointer/splice format as state.delta.' }) + '\n';
  const reserve = 4096;
  let text = header;
  const addSection = (source: string, content: string) => {
    const section = JSON.stringify({ k: 'section', source }) + '\n' + content;
    if (byteSize(text) + byteSize(section) > limitBytes - reserve) { omitted.push(source); return; }
    text += section;
  };
  addSection('client', client);
  if (server.text) addSection('server', server.text);
  else if (server.status !== 'offline') omitted.push('server');
  const stateLine = JSON.stringify({ k: 'current-state', d: projectDebugState(state) }) + '\n';
  if (byteSize(text) + byteSize(stateLine) <= limitBytes - reserve) text += stateLine;
  else omitted.push('current-state');
  const clientIncomplete = !!(summary && typeof summary === 'object' && 'incomplete' in summary && summary.incomplete);
  const intentionalGaps = !!(summary && typeof summary === 'object' && 'intentionalGaps' in summary && summary.intentionalGaps);
  text += JSON.stringify({ k: 'dump.end', incomplete: clientIncomplete || intentionalGaps || !!serverSummary?.incomplete || omitted.length > 0,
    omitted, note: 'Missing server diagnostics are expected for offline games. Recorder headers/footers declare dropped telemetry and any incomplete gameplay prefix.' }) + '\n';
  // Protect callers supplying an unexpectedly huge header or malicious peer metadata.
  if (byteSize(text) > limitBytes) return JSON.stringify({ k: 'dump', version: 1, limitBytes }) + '\n' +
    JSON.stringify({ k: 'dump.end', incomplete: true, omitted: ['client', 'server', 'current-state'], error: 'Export envelope exceeds size limit' }) + '\n';
  return text;
}

/** Strict bounds prevent an export response allocating arbitrary client memory. */
export class DebugChunkCollector {
  private chunks = new Map<number, string>();
  private total = 0;
  private bytes = 0;
  accept(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') throw new Error('Invalid diagnostic chunk');
    const { index, total, text } = value as { index: number; total: number; text: string };
    if (!Number.isInteger(total) || total < 1 || total > 512 || !Number.isInteger(index) || index < 0 || index >= total ||
      typeof text !== 'string' || text.length > 48 * 1024 || (this.total && total !== this.total)) throw new Error('Invalid diagnostic chunk bounds');
    this.total = total;
    if (this.chunks.has(index)) {
      if (this.chunks.get(index) !== text) throw new Error('Conflicting diagnostic chunk');
      return undefined;
    }
    this.bytes += byteSize(text);
    if (this.bytes > SERVER_BYTES) throw new Error('Server diagnostics exceed size limit');
    this.chunks.set(index, text);
    if (this.chunks.size !== total) return undefined;
    return Array.from({ length: total }, (_, i) => this.chunks.get(i)!).join('');
  }
}

type SavedSession = { id: string; tabId: string; startedAt: number; header: string; summary: ReturnType<DebugRecorder['snapshot']>; chunks: number };
type SavedChunk = { session: string; number: number; text: string };
function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error); });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = transaction.onabort = () => reject(transaction.error); });
}
function openStorage(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('gridfall-debug-recordings', 1);
    opening.onupgradeneeded = () => {
      opening.result.createObjectStore('sessions', { keyPath: 'id' });
      opening.result.createObjectStore('chunks', { keyPath: ['session', 'number'] }).createIndex('session', 'session');
    };
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => reject(new Error('Diagnostic storage blocked'));
  });
}
function download(text: string, suffix: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `gridfall-debug-${suffix}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
const shortError = (error: unknown) => String(error instanceof Error ? error.message : error).slice(0, 2000)
  .replace(/(https?:\/\/[^\s?#]+)[?#][^\s)]*/g, '$1[parameters removed]');

export class BrowserDebugRecorder {
  private recorder = new DebugRecorder({ maxBytes: CLIENT_BYTES, source: 'client' });
  private started = false;
  private isPaused = false;
  private persistenceStarted = false;
  private persistenceAllowed = true;
  private tabId = '';
  private session = '';
  private sequence = 0;
  private chunkNumber = 0;
  private previous: SavedSession | undefined;
  private storage: Promise<IDBDatabase> | undefined;
  private persistence = Promise.resolve();
  private storageStatus = 'starting';
  private lastFrame: number | undefined;
  private frameCount = 0;
  private frameTotal = 0;
  private frameMax = 0;
  private workTotal = 0;
  private workMax = 0;
  private gaps: number[] = [];
  private lastSample = -Infinity;
  private previousSample: DebugValue | undefined;
  private sampleAnomalous = false;
  private pauseCount = 0;
  private index: IndexEntry[] = [];
  private indexOmitted = 0;
  private room: any;
  private pending: { id: string; collector: DebugChunkCollector; finish: (result: ServerResult) => void } | undefined;
  private exporting = false;
  private exportStatus = '';
  private ping: { id: number; start: number } | undefined;
  private pingId = 0;
  private timerTicks = 0;
  private serverMeta: { recordingId: string; revision: number; event: number; elapsedMs: number } | undefined;
  private repeatedErrors = new Map<string, { kind: string; original: number; repeats: number; firstAt: number; lastAt: number }>();
  private longTasks = { count: 0, totalMs: 0, maxMs: 0 };

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      const saved = sessionStorage.getItem('gridfall.debug.tab');
      this.tabId = saved && /^[a-z0-9-]{1,128}$/i.test(saved) ? saved : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem('gridfall.debug.tab', this.tabId);
    } catch { this.persistenceAllowed = false; this.storageStatus = 'unavailable: tab session storage disabled'; }
    if (this.persistenceAllowed) this.storage = openStorage();
    if (this.storage) {
    this.persistence = this.persistence.then(async () => {
      const db = await this.storage!;
      const transaction = db.transaction('sessions', 'readonly');
      const sessions = await request<SavedSession[]>(transaction.objectStore('sessions').getAll());
      if (!this.session) this.previous = sessions.filter((entry) => entry.tabId === this.tabId).sort((a, b) => b.startedAt - a.startedAt)[0];
      this.storageStatus = 'available (saved every 5s)';
    }).catch((error) => { this.storageStatus = `unavailable: ${shortError(error)}`; });
    }
    window.addEventListener('error', (event) => this.event('runtime.error', { message: shortError(event.message),
      file: shortError(event.filename), line: event.lineno, column: event.colno, stack: shortError(event.error?.stack ?? '') }));
    window.addEventListener('unhandledrejection', (event) => this.event('runtime.rejection', { error: shortError(event.reason) }));
    window.addEventListener('online', () => this.event('network.online'));
    window.addEventListener('offline', () => this.event('network.offline'));
    document.addEventListener('visibilitychange', () => {
      this.lastFrame = undefined;
      this.event('page.visibility', { hidden: document.hidden });
      this.flush();
    });
    window.addEventListener('pagehide', () => this.flush());
    document.addEventListener('webglcontextlost', () => this.event('render.context-lost'), true);
    document.addEventListener('webglcontextrestored', () => this.event('render.context-restored'), true);
    try {
      if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.includes('longtask')) {
        const observer = new PerformanceObserver((list) => {
          if (!this.recordingEnabled) return;
          for (const entry of list.getEntries()) {
            this.longTasks.count++; this.longTasks.totalMs += entry.duration;
            this.longTasks.maxMs = Math.max(this.longTasks.maxMs, entry.duration);
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      }
    } catch { /* Unsupported diagnostics must not affect gameplay. */ }
    setInterval(() => { if (!this.recordingEnabled) return; this.summarizeDiagnostics(); this.flush(); this.timerTicks++; if (this.timerTicks % 2 === 0) this.sendPing(); }, 5000);
  }

  start(metadata: unknown): void {
    this.summarizeDiagnostics(); this.flush(true); this.attachRoom(null);
    this.recorder = new DebugRecorder({ maxBytes: CLIENT_BYTES, source: 'client' });
    this.recorder.reset({ game: metadata, client: { userAgent: navigator.userAgent, language: navigator.language,
      hardwareConcurrency: navigator.hardwareConcurrency, devicePixelRatio: window.devicePixelRatio,
      viewport: [window.innerWidth, window.innerHeight], online: navigator.onLine, hidden: document.hidden } });
    this.started = true;
    this.session = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.sequence = this.chunkNumber = this.indexOmitted = 0;
    this.index = []; this.lastFrame = undefined; this.lastSample = -Infinity; this.previousSample = undefined;
    this.pauseCount = this.isPaused ? 1 : 0;
    this.sampleAnomalous = false;
    this.repeatedErrors.clear(); this.longTasks = { count: 0, totalMs: 0, maxMs: 0 };
    this.frameCount = this.frameTotal = this.frameMax = this.workTotal = this.workMax = 0; this.gaps = [];
    this.persistenceStarted = false;
    if (!this.isPaused) this.beginPersistence();
  }
  private record(kind: string, data?: unknown, telemetry = false, force = false): number | undefined {
    if (!this.started || (!force && !this.recordingEnabled)) return;
    try {
      const before = this.recorder.snapshot().events;
      const n = this.recorder.record(kind, data, telemetry ? 'telemetry' : 'critical');
      if (this.recorder.snapshot().events === before) return;
      if (/issue|error|reject|context-lost|frame-gap|anomaly|network\.(drop|reconnect|leave|left|offline|connect-fail)/.test(kind)) {
        if (this.index.length < 256) this.index.push({ source: 'client', n, k: kind, t: Date.now() - this.recorder.snapshot().startedAt });
        else this.indexOmitted++;
      }
      return n;
    } catch { this.exportStatus = 'Diagnostic event failed'; }
  }
  event(kind: string, data?: unknown): void {
    if (!this.recordingEnabled) return;
    if (!/^(runtime\.(error|rejection)|client\.handled-error|asset[.-].*error)$/.test(kind)) { this.record(kind, data); return; }
    try {
      const fingerprint = `${kind}:${JSON.stringify(projectDebugState(data)).slice(0, 8192)}`;
      const repeated = this.repeatedErrors.get(fingerprint), time = Date.now();
      if (repeated) { repeated.repeats++; repeated.lastAt = time; return; }
      if (this.repeatedErrors.size >= 32) this.summarizeRepeatedErrors(true);
      const original = this.record(kind, data);
      if (original !== undefined) this.repeatedErrors.set(fingerprint, { kind, original, repeats: 0, firstAt: time, lastAt: time });
    } catch { this.exportStatus = 'Error diagnostics failed'; }
  }
  state(state: unknown): void {
    if (this.recordingEnabled) try { this.recorder.state(state, this.serverMeta ? { server: this.serverMeta } : undefined); }
    catch { this.exportStatus = 'State diagnostics failed'; }
  }
  get paused(): boolean { return this.isPaused; }
  get recordingEnabled(): boolean { return this.started && !this.isPaused; }
  toggleRecording(): void {
    if (!this.isPaused) {
      this.summarizeDiagnostics(); this.record('recording.paused', { scope: 'client', gap: 'Client events are unavailable until resumed; shared server history continues.' });
      this.pauseCount++; this.flush(); this.isPaused = true;
    } else {
      this.isPaused = false;
      if (this.started && !this.persistenceStarted) this.beginPersistence();
      this.record('recording.resumed', { scope: 'client', gap: true });
    }
    this.lastFrame = undefined; this.lastSample = -Infinity; this.previousSample = undefined;
    this.sampleAnomalous = false;
  }
  frame(time: number, workMs = 0): void {
    if (!this.recordingEnabled || document.hidden) { this.lastFrame = undefined; return; }
    if (this.lastFrame !== undefined) {
      const duration = time - this.lastFrame;
      this.frameCount++; this.frameTotal += duration; this.frameMax = Math.max(this.frameMax, duration);
      this.workTotal += workMs; this.workMax = Math.max(this.workMax, workMs);
      if (duration >= 250 && this.gaps.length < 16) this.gaps.push(Math.round(duration));
    }
    this.lastFrame = time;
  }
  private summarizeFrames() {
    if (!this.frameCount) return;
    const summary = { count: this.frameCount, meanMs: +(this.frameTotal / this.frameCount).toFixed(2),
      maxMs: Math.round(this.frameMax), meanWorkMs: +(this.workTotal / this.frameCount).toFixed(2),
      maxWorkMs: Math.round(this.workMax), gapsMs: this.gaps, hidden: document.hidden };
    this.record(this.frameMax >= 250 ? 'performance.frame-gap' : 'performance.frames', summary, true);
    this.frameCount = this.frameTotal = this.frameMax = this.workTotal = this.workMax = 0; this.gaps = [];
  }
  private summarizeRepeatedErrors(clear = false) {
    for (const repeated of this.repeatedErrors.values()) {
      if (repeated.repeats) this.record('runtime.error-repeats', { kind: repeated.kind, originalEvent: repeated.original,
        count: repeated.repeats, firstAt: repeated.firstAt, lastAt: repeated.lastAt });
      repeated.repeats = 0;
    }
    if (clear) this.repeatedErrors.clear();
  }
  private summarizeDiagnostics() {
    if (!this.recordingEnabled) return;
    this.summarizeFrames(); this.summarizeRepeatedErrors();
    if (this.longTasks.count) {
      this.record('performance.long-tasks', { count: this.longTasks.count,
        totalMs: Math.round(this.longTasks.totalMs), maxMs: Math.round(this.longTasks.maxMs) }, true);
      this.longTasks = { count: 0, totalMs: 0, maxMs: 0 };
    }
  }
  sample(provider: () => unknown, force = false): void {
    if (!this.started || (!force && !this.recordingEnabled)) return;
    const time = performance.now();
    if (!force && time - this.lastSample < 5000) return;
    this.lastSample = time;
    try {
      if (!force && this.recorder.snapshot().bytes >= CLIENT_BYTES * 0.8 - 1024) {
        this.record('performance.sample', undefined, true); return;
      }
      const begin = performance.now(), value = projectDebugState(provider());
      const sampleMs = Math.round((performance.now() - begin) * 100) / 100;
      if (force) this.recorder.record('diagnostic.sample', { value, sampleMs });
      else {
        const changes = this.previousSample === undefined ? undefined : diffDebugValues(this.previousSample, value);
        let remaining = 5000;
        const anomaly = (entry: DebugValue): boolean => {
          if (--remaining < 0 || !entry || typeof entry !== 'object') return false;
          if (!Array.isArray(entry) && (entry.overdue === true || entry.clockNotAdvancing === true)) return true;
          return Object.values(entry).some(anomaly);
        };
        const anomalous = anomaly(value);
        if (anomalous && !this.sampleAnomalous) this.record('performance.sample-anomaly', { sampleMs, note: 'Overdue waits or nonprogressing animation clocks; inspect following diagnostic sample.' }, true);
        this.sampleAnomalous = anomalous;
        const before = this.recorder.snapshot().events;
        if (changes === undefined) this.record('performance.sample', { value, sampleMs }, true);
        else if (changes.length) this.record('performance.sample.delta', { changes, sampleMs }, true);
        if (this.recorder.snapshot().events > before || changes?.length === 0) this.previousSample = value;
      }
    } catch { /* Sampling must remain fail-open. */ }
  }
  attachRoom(room: any): void {
    if (this.room === room) return;
    if (this.pending) this.pending.finish({ status: 'unavailable', error: 'Room changed during export' });
    this.room = room;
    this.ping = undefined;
    this.serverMeta = undefined;
    if (!room) return;
    room.onMessage('debug-meta', (value: any) => {
      if (this.room !== room || !value || typeof value.recordingId !== 'string' || value.recordingId.length > 128 ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 || !Number.isSafeInteger(value.event) || value.event < 0 ||
        !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0) return;
      this.serverMeta = { recordingId: value.recordingId, revision: value.revision, event: value.event, elapsedMs: value.elapsedMs };
      this.record('network.debug-meta', this.serverMeta);
    });
    room.onMessage('debug-export-chunk', (value: any) => {
      const pending = this.pending;
      if (!pending || value?.requestId !== pending.id) return;
      try { const text = pending.collector.accept(value); if (text !== undefined) pending.finish({ status: 'received', text }); }
      catch (error) { pending.finish({ status: 'invalid', error: shortError(error) }); }
    });
    room.onMessage('debug-export-error', (value: any) => {
      const pending = this.pending;
      if (pending && pending.id === value?.requestId) pending.finish({ status: 'unavailable', error: shortError(value.error) });
    });
    room.onMessage('debug-pong', (value: any) => {
      const ping = this.ping;
      if (this.room !== room || !ping || ping.id !== value?.id) return;
      this.record('network.latency', { rttMs: Math.round(performance.now() - ping.start) }, true); this.ping = undefined;
    });
  }
  private sendPing() {
    if (!this.recordingEnabled || !this.room || document.hidden) return;
    if (this.ping) this.record('network.ping-timeout', { afterMs: Math.round(performance.now() - this.ping.start) }, true);
    const id = ++this.pingId;
    this.ping = { id, start: performance.now() };
    try { this.room.send('debug-ping', { id }); } catch { this.ping = undefined; }
  }
  private serverDump(): Promise<ServerResult> {
    if (!this.room) return Promise.resolve({ status: 'offline' });
    return new Promise((resolve) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const timer = setTimeout(() => finish({ status: 'timeout', error: 'Server diagnostics did not arrive within 20 seconds' }), 20_000);
      const finish = (result: ServerResult) => {
        clearTimeout(timer); if (this.pending?.id === id) this.pending = undefined; resolve(result);
      };
      this.pending = { id, collector: new DebugChunkCollector(), finish };
      try { this.room.send('debug-export', { requestId: id }); } catch (error) { finish({ status: 'unavailable', error: shortError(error) }); }
    });
  }
  async exportDump(state: unknown): Promise<void> {
    if (this.exporting) return;
    this.exporting = true; this.exportStatus = 'Preparing export…';
    try {
      this.summarizeDiagnostics(); this.record('diagnostic.export-request');
      // Capture immediately; gameplay may continue during the server response.
      const client = this.recorder.exportLines(), snapshot = { ...this.recorder.snapshot(), indexOmitted: this.indexOmitted,
        intentionalGaps: this.pauseCount, paused: this.isPaused };
      const current = projectDebugState(state), index = [...this.index];
      this.flush(true);
      const server = await this.serverDump();
      const text = buildDebugBundle(client, snapshot, server, current, index);
      download(text, 'match');
      this.exportStatus = `Exported ${(byteSize(text) / 1024).toFixed(0)} KiB${snapshot.incomplete ? ' · INCOMPLETE history' : ''}${server.status === 'timeout' ? ' · server unavailable' : ''}`;
    } catch (error) { this.exportStatus = `Export failed: ${shortError(error)}`; }
    finally { this.exporting = false; }
  }
  markIssue(state: unknown): void {
    const comment = window.prompt('Describe the issue (optional, up to 2,000 characters). Attach screenshots alongside the downloaded dump.');
    if (comment === null) return;
    try {
      this.record('issue', { comment: comment.slice(0, 2000), recordingPaused: this.isPaused }, false, true);
      this.recorder.state(state, { diagnostic: 'issue', ...(this.serverMeta ? { server: this.serverMeta } : {}) });
      if (this.started && !this.persistenceStarted) this.beginPersistence();
      this.flush(true);
    } catch { this.exportStatus = 'Issue marker failed'; }
  }
  status(): string {
    const summary = this.recorder.snapshot();
    return `${this.isPaused ? 'PAUSED client · ' : ''}${(summary.bytes / 1024).toFixed(0)} / ${CLIENT_BYTES / 1024} KiB client${summary.incomplete ? ' · INCOMPLETE history (cap reached)' : ''}` +
      ` · recovery ${this.storageStatus}${this.exportStatus ? ` · ${this.exportStatus}` : ''}`;
  }
  hasPrevious(): boolean { return !!this.previous; }
  private beginPersistence() {
    if (!this.persistenceAllowed) return;
    this.persistenceStarted = true;
    const id = this.session, recorder = this.recorder;
    this.storage ??= openStorage();
    this.persistence = this.persistence.then(async () => {
      const db = await this.storage!;
      const read = db.transaction('sessions', 'readonly');
      const sessions = (await request<SavedSession[]>(read.objectStore('sessions').getAll())).filter((entry) => entry.tabId === this.tabId);
      const previous = sessions.sort((a, b) => b.startedAt - a.startedAt)[0];
      if (this.session === id) this.previous = previous;
      const transaction = db.transaction(['sessions', 'chunks'], 'readwrite');
      const done = completed(transaction);
      for (const old of sessions.filter((entry) => entry.id !== previous?.id)) {
        transaction.objectStore('sessions').delete(old.id);
        const cursor = transaction.objectStore('chunks').index('session').openCursor(IDBKeyRange.only(old.id));
        cursor.onsuccess = () => { const entry = cursor.result; if (entry) { entry.delete(); entry.continue(); } };
      }
      transaction.objectStore('sessions').put({ id, tabId: this.tabId, startedAt: recorder.snapshot().startedAt,
        header: recorder.exportHeaderLine(), summary: recorder.snapshot(), chunks: 0 } satisfies SavedSession);
      await done; this.storageStatus = 'available (saved every 5s)';
    }).catch((error) => { this.storageStatus = `unavailable: ${shortError(error)}`; });
  }
  private flush(force = false) {
    if (!this.started || (!force && !this.recordingEnabled) || !this.storage || this.storageStatus.startsWith('unavailable')) return;
    const recorder = this.recorder, id = this.session;
    const lines = recorder.exportEventLinesAfter(this.sequence);
    const previousSequence = this.sequence;
    this.sequence = recorder.snapshot().lastSequence;
    if (this.sequence === previousSequence && !lines.length) return;
    const number = this.chunkNumber, text = lines.length ? lines.join('\n') + '\n' : '';
    if (lines.length) this.chunkNumber++;
    const saved: SavedSession = { id, tabId: this.tabId, startedAt: recorder.snapshot().startedAt, header: recorder.exportHeaderLine(),
      summary: recorder.snapshot(), chunks: this.chunkNumber };
    this.persistence = this.persistence.then(async () => {
      const db = await this.storage!;
      const transaction = db.transaction(['sessions', 'chunks'], 'readwrite'), done = completed(transaction);
      if (text) transaction.objectStore('chunks').put({ session: id, number, text } satisfies SavedChunk);
      transaction.objectStore('sessions').put(saved);
      await done;
    }).catch((error) => { this.storageStatus = `unavailable: ${shortError(error)}`; });
  }
  async exportPrevious(): Promise<void> {
    if (!this.previous || !this.storage || this.exporting) return;
    this.exporting = true;
    try {
      await this.persistence;
      const db = await this.storage, previous = this.previous;
      const transaction = db.transaction(['sessions', 'chunks'], 'readonly');
      const [saved, chunks] = await Promise.all([
        request<SavedSession | undefined>(transaction.objectStore('sessions').get(previous.id)),
        request<SavedChunk[]>(transaction.objectStore('chunks').index('session').getAll(IDBKeyRange.only(previous.id))),
      ]);
      if (!saved) throw new Error('Previous recording no longer available');
      const stream = saved.header + '\n' + chunks.sort((a, b) => a.number - b.number).map((chunk) => chunk.text).join('') +
        JSON.stringify({ k: 'recording.end', ...saved.summary, recovery: 'Last persisted prefix; up to 5 seconds before reload or crash may be missing.' }) + '\n';
      const text = buildDebugBundle(stream, { ...saved.summary, incomplete: true, recovery: true }, { status: 'previous-client-only' }, null);
      download(text, 'previous'); this.exportStatus = 'Previous client recording exported (saved prefix)';
    } catch (error) { this.exportStatus = `Recovery export failed: ${shortError(error)}`; }
    finally { this.exporting = false; }
  }
}

export const debugRecorder = new BrowserDebugRecorder();
