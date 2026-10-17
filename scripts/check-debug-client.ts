import assert from 'node:assert/strict';
import { BrowserDebugRecorder, DebugChunkCollector, buildDebugBundle, DEBUG_DUMP_LIMIT_BYTES } from '../src/debug-recorder';
import { createDeveloperPanel } from '../src/developerPanel';

const lines = (text: string) => text.trim().split('\n').map((line) => JSON.parse(line));
const size = (text: string) => new TextEncoder().encode(text).length;
const full = buildDebugBundle('{"k":"recording"}\n', { incomplete: false }, { status: 'offline' }, { turn: 1 });
assert.equal(lines(full).at(-1).incomplete, false, 'Offline matches have complete client history');
const oversized = buildDebugBundle('{"k":"recording"}\n', {}, { status: 'offline' }, { items: Array.from({ length: 2000 }, () => '€'.repeat(4000)) });
assert.ok(size(oversized) <= DEBUG_DUMP_LIMIT_BYTES);
assert.ok(lines(oversized).at(-1).omitted.includes('current-state'));
const serverIncomplete = buildDebugBundle('{"k":"recording"}\n', {}, { status: 'received', text: '{"k":"recording","incomplete":true}\n' }, {});
assert.equal(lines(serverIncomplete).at(-1).incomplete, true);
const collector = new DebugChunkCollector();
assert.equal(collector.accept({ index: 1, total: 2, text: 'B' }), undefined);
assert.equal(collector.accept({ index: 0, total: 2, text: 'A' }), 'AB');
assert.throws(() => new DebugChunkCollector().accept({ index: 0, total: 513, text: 'A' }));
assert.throws(() => new DebugChunkCollector().accept({ index: 0, total: 1, text: 'A'.repeat(48 * 1024 + 1) }));
const bigCollector = new DebugChunkCollector();
for (let i = 0; i < 400; i++) bigCollector.accept({ index: i, total: 400, text: '1234' });
const byteCollector = new DebugChunkCollector();
assert.throws(() => {
  for (let i = 0; i < 100; i++) byteCollector.accept({ index: i, total: 100, text: '€'.repeat(10_000) });
}, /exceed size/);

// Minimal asynchronous DOM/IndexedDB fakes verify lifecycle behavior without launching a browser.
const listeners = new Map<string, (() => void)[]>();
const downloads: Blob[] = [];
const sessions = new Map<string, any>(), chunks = new Map<string, any>();
const tabStorage = new Map<string, string>();
let longTaskCallback: ((list: { getEntries: () => { duration: number }[] }) => void) | undefined;
function fakeRequest<T>(result: T) {
  const value: any = { result, onsuccess: null, onerror: null };
  queueMicrotask(() => value.onsuccess?.());
  return value;
}
const realSetTimeout = globalThis.setTimeout;
function fakeTransaction() {
  const tx: any = { oncomplete: null, onerror: null, onabort: null };
  tx.objectStore = (name: string) => {
    const map = name === 'sessions' ? sessions : chunks;
    return {
      getAll: () => fakeRequest([...map.values()]),
      get: (key: string) => fakeRequest(map.get(key)),
      put: (value: any) => { map.set(name === 'sessions' ? value.id : `${value.session}:${value.number}`, structuredClone(value)); },
      delete: (key: string) => map.delete(key),
      index: () => ({
        getAll: (key: string) => fakeRequest([...chunks.values()].filter((item) => item.session === key)),
        openCursor: (key: string) => {
          const entries = [...chunks.entries()].filter(([, item]) => item.session === key);
          let i = 0;
          const cursor: any = {};
          const step = () => {
            const entry = entries[i++];
            cursor.result = entry ? { delete: () => chunks.delete(entry[0]), continue: () => queueMicrotask(step) } : null;
            cursor.onsuccess?.();
          };
          queueMicrotask(step); return cursor;
        },
      }),
    };
  };
  realSetTimeout(() => tx.oncomplete?.(), 1);
  return tx;
}
const fakeDb = { transaction: () => fakeTransaction() };
const on = (name: string, listener: () => void) => listeners.set(name, [...(listeners.get(name) ?? []), listener]);
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'test', language: 'en', onLine: true, hardwareConcurrency: 4 } });
Object.assign(globalThis, {
  window: { addEventListener: on, devicePixelRatio: 1, innerWidth: 100, innerHeight: 100, prompt: () => { throw new Error('Native dialogs must not be used'); } },
  document: { hidden: false, addEventListener: on, createElement: () => ({ click() {}, href: '', download: '' }) },
  indexedDB: { open: () => fakeRequest(fakeDb) },
  sessionStorage: { getItem: (key: string) => tabStorage.get(key) ?? null, setItem: (key: string, value: string) => tabStorage.set(key, value) },
  PerformanceObserver: class {
    static supportedEntryTypes = ['longtask'];
    constructor(callback: typeof longTaskCallback) { longTaskCallback = callback; }
    observe() {}
  },
  IDBKeyRange: { only: (key: string) => key },
  setInterval: () => 0,
  setTimeout: ((callback: (...args: any[]) => void, delay?: number) => {
    const timer = realSetTimeout(callback, delay === 20_000 ? 1 : delay);
    if (delay === 30_000) timer.unref();
    return timer;
  }),
});
URL.createObjectURL = ((blob: Blob) => { downloads.push(blob); return 'blob:test'; }) as typeof URL.createObjectURL;
URL.revokeObjectURL = () => {};

const browser = new BrowserDebugRecorder();
assert.equal(browser.markIssue({}, 'Before starting'), false);
assert.match(browser.status(), /Start a game/);
browser.start({ mode: 'local', match: 'A' });
const metadataHandlers = new Map<string, (value: unknown) => void>();
browser.attachRoom({ onMessage: (name: string, handler: (value: unknown) => void) => metadataHandlers.set(name, handler), send() {} });
metadataHandlers.get('debug-meta')!({ recordingId: 'server-A', revision: 3, event: 8, elapsedMs: 1500, password: 'never copy' });
browser.state({ turn: 1, log: [] });
browser.attachRoom(null);
for (let i = 0; i < 200; i++) browser.event('runtime.error', { message: 'Repeated fault', stack: 'same-stack' });
for (let i = 0; i < 100; i++) browser.event('client.handled-error', { message: 'Failed model', error: 'same error' });
longTaskCallback!({ getEntries: () => [{ duration: 75 }, { duration: 100 }] });
longTaskCallback!({ getEntries: () => [{ duration: 80 }] });
browser.frame(100); browser.frame(116);
(document as any).hidden = true;
listeners.get('visibilitychange')!.forEach((listener) => listener());
(document as any).hidden = false;
listeners.get('visibilitychange')!.forEach((listener) => listener());
browser.frame(10_000); browser.frame(10_016);
browser.sample(() => ({ calls: 10, triangles: 20, animations: [] }), true);
await browser.exportDump({ turn: 1 });
const offlineDump = lines(await downloads.at(-1)!.text());
assert.ok(!offlineDump.some((event) => event.k === 'performance.frame-gap'), 'Hidden-tab duration must not look like a gameplay stall');
assert.equal(offlineDump.at(-1).incomplete, false);
assert.equal(offlineDump.filter((event) => event.k === 'runtime.error').length, 1);
assert.equal(offlineDump.find((event) => event.k === 'runtime.error-repeats').d.count, 199);
assert.equal(offlineDump.filter((event) => event.k === 'client.handled-error').length, 1);
assert.equal(offlineDump.find((event) => event.k === 'runtime.error-repeats' && event.d.kind === 'client.handled-error').d.count, 99);
assert.equal(offlineDump.filter((event) => event.k === 'performance.long-tasks').length, 1);
assert.equal(offlineDump.find((event) => event.k === 'performance.long-tasks').d.count, 3);
assert.equal(offlineDump.find((event) => event.k === 'state').d.context.server.revision, 3);
assert.ok(!JSON.stringify(offlineDump).includes('never copy'));
await (browser as any).persistence;
const idA = (browser as any).session;
assert.ok([...chunks.values()].some((chunk) => chunk.session === idA));

browser.toggleRecording();
const count = (browser as any).recorder.snapshot().events;
browser.event('test.paused'); browser.state({ turn: 2 }); browser.frame(20_000);
let sampled = false;
browser.sample(() => { sampled = true; return {}; });
assert.equal(sampled, false);
assert.equal((browser as any).recorder.snapshot().events, count);
assert.equal(browser.markIssue({ turn: 2 }, 'Paused issue'), true);
assert.ok((browser as any).recorder.exportLines().includes('"recordingPaused":true'), 'Explicit issue marker must work while paused');
assert.match(browser.status(), /Issue marker saved/);
assert.equal(lines((browser as any).recorder.exportLines()).find((event) => event.k === 'issue').d.comment, 'Paused issue');
assert.equal(browser.markIssue({ turn: 2 }, 'x'.repeat(2100)), true);
assert.equal(lines((browser as any).recorder.exportLines()).filter((event) => event.k === 'issue').at(-1).d.comment.length, 2000);
browser.toggleRecording(); browser.state({ turn: 2 });
await browser.exportDump({ turn: 2 });
assert.equal(lines(await downloads.at(-1)!.text()).at(-1).incomplete, true, 'Paused interval must be explicitly incomplete');

const roomHandlers = new Map<string, (value: unknown) => void>();
browser.attachRoom({ onMessage: (name: string, handler: (value: unknown) => void) => roomHandlers.set(name, handler), send() {} });
await browser.exportDump({ turn: 2 });
const timeoutDump = lines(await downloads.at(-1)!.text());
assert.equal(timeoutDump[0].server.status, 'timeout');
assert.ok(timeoutDump.some((event) => event.k === 'state'), 'Missing server must still download local history');
browser.attachRoom(null);

browser.event('test.last-A');
(browser as any).flush();
browser.start({ mode: 'local', match: 'B' });
browser.event('test.first-B');
(browser as any).flush();
await (browser as any).persistence;
const idB = (browser as any).session;
assert.notEqual(idA, idB);
const aText = [...chunks.values()].filter((chunk) => chunk.session === idA).map((chunk) => chunk.text).join('');
const bText = [...chunks.values()].filter((chunk) => chunk.session === idB).map((chunk) => chunk.text).join('');
assert.ok(aText.includes('test.last-A') && !aText.includes('test.first-B'));
assert.ok(bText.includes('test.first-B') && !bText.includes('test.last-A'), 'Queued writes must retain original match ID');
await browser.exportPrevious();
assert.ok((await downloads.at(-1)!.text()).includes('test.last-A'));

tabStorage.delete('gridfall.debug.tab');
const otherTab = new BrowserDebugRecorder();
otherTab.start({ match: 'other-tab' }); otherTab.event('test.other-tab'); (otherTab as any).flush();
await (otherTab as any).persistence;
assert.ok(sessions.has(idB), 'Another tab must not prune a live recording');
assert.ok([...chunks.values()].some((chunk) => chunk.session === idB));
const oldMetaHandler = roomHandlers.get('debug-meta')!;
browser.start({ match: 'C' }); oldMetaHandler({ recordingId: 'stale', revision: 99, event: 100, elapsedMs: 1 });
assert.equal((browser as any).serverMeta, undefined, 'New match must detach old room metadata');
await (browser as any).persistence;

// Exercise the actual panel buttons and form with DOM fakes, including cancellation and failure.
const elements: any[] = [];
(document as any).createElement = (tag: string) => {
  const handlers = new Map<string, (event: any) => void>();
  const element: any = { tag, style: {}, hidden: false, value: '', children: [],
    setAttribute() {}, append(...children: any[]) { this.children.push(...children); },
    addEventListener(name: string, handler: (event: any) => void) { handlers.set(name, handler); },
    focus() { this.focused = true; },
    fire(name: string) { handlers.get(name)?.({ preventDefault() {} }); },
  };
  elements.push(element); return element;
};
(document as any).body = { append() {} };
const comments: string[] = [];
let canSave = true;
createDeveloperPanel(() => [], { exportDump() {}, toggleRecording() {}, status: () => 'Marker result',
  markIssue: (comment) => { comments.push(comment); return canSave; } });
const button = (label: string) => elements.find((entry) => entry.textContent === label);
const form = elements.find((entry) => entry.tag === 'form');
const textarea = elements.find((entry) => entry.tag === 'textarea');
button('Mark issue').fire('click');
assert.equal(form.hidden, false);
assert.equal(textarea.focused, true);
textarea.value = 'Rendering froze';
button('Cancel').fire('click');
assert.equal(form.hidden, true);
assert.deepEqual(comments, []);
button('Mark issue').fire('click'); form.fire('submit');
assert.deepEqual(comments, ['Rendering froze']);
assert.equal(form.hidden, true);
assert.equal(textarea.value, '');
button('Mark issue').fire('click'); form.fire('submit');
assert.equal(comments.at(-1), '', 'Comments are optional');
canSave = false;
button('Mark issue').fire('click'); textarea.value = 'Keep on failure'; form.fire('submit');
assert.equal(form.hidden, false);
assert.equal(textarea.value, 'Keep on failure');

console.log('Debug client checks passed: byte cap, incomplete history, chunk validation, offline/timeout exports, visibility, pause/resume, paused markers, error grouping, long-task aggregation, server correlation, and isolated match/tab persistence.');
