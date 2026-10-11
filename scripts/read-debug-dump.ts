import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { applyDebugChanges, type DebugValue, type DebugChange } from '../shared/debug-recording.ts';

// Stream input; never print the entire recording by default.
const [file, ...args] = process.argv.slice(2);
function option(name: string) { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; }
if (!file || args.includes('--help')) {
  console.log('Usage: npm run debug:read -- dump.jsonl [--source client|server] [--from N --to N] [--kind PREFIX] [--state-at N] [--limit 100]\nDefault: summary/index only. Event numbers are local to each source. --state-at reconstructs the projected state through that source event.');
  process.exit(file ? 0 : 1);
}
const sourceFilter = option('--source') ?? 'client';
const from = Number(option('--from') ?? 0);
const to = Number(option('--to') ?? Infinity);
const stateAt = option('--state-at') === undefined ? undefined : Number(option('--state-at'));
const limit = Number(option('--limit') ?? 100);
if (![from, limit, ...(stateAt === undefined ? [] : [stateAt])].every(n => Number.isSafeInteger(n) && n >= 0) || !(to === Infinity || Number.isSafeInteger(to) && to >= from) || !['client', 'server'].includes(sourceFilter)) throw new Error('Invalid range/source. Use nonnegative integer event numbers.');
const eventsRequested = args.some(arg => ['--from', '--to', '--kind'].includes(arg));
if (eventsRequested && stateAt === undefined && limit === 0) process.exit(0);
let source = 'client', printed = 0, state: DebugValue | undefined, lastStateEvent = 0, lineNumber = 0;
let selectedSeen = false, incomplete = false;
const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of lines) {
  lineNumber++;
  if (!line.trim()) continue;
  let record: Record<string, any>;
  try { record = JSON.parse(line); } catch { throw new Error(`Invalid JSON at line ${lineNumber}`); }
  if (record.k === 'dump' && sourceFilter === 'client') incomplete ||= Boolean(record.client?.intentionalGaps || record.client?.incomplete);
  if (record.k === 'section') source = record.source;
  if (record.k === 'recording') {
    source = record.source ?? source;
    if (source === sourceFilter) { selectedSeen = true; incomplete ||= Boolean(record.incomplete); }
  }
  if (stateAt === undefined && !eventsRequested) {
    if (['dump', 'recording', 'recording.end', 'dump.end'].includes(record.k)) console.log(JSON.stringify(record));
    continue;
  }
  if (source !== sourceFilter || typeof record.n !== 'number') continue;
  if (record.k === 'recording.paused' || record.k === 'recording.resumed') incomplete = true;
  if (stateAt !== undefined) {
    if (record.n > stateAt) break;
    if (record.k === 'state') { state = record.d.value; lastStateEvent = record.n; }
    else if (record.k === 'state.delta') {
      if (state === undefined) throw new Error('State delta has no initial checkpoint');
      state = applyDebugChanges(state, record.d.changes as DebugChange[]); lastStateEvent = record.n;
    }
    if (record.n >= stateAt) break;
  } else if (record.n >= from && record.n <= to && (!option('--kind') || record.k.startsWith(option('--kind')))) {
    console.log(line); printed++;
    if (printed >= limit) break;
  }
  if (record.n >= to && stateAt === undefined) break;
}
if (stateAt !== undefined) {
  if (!selectedSeen || state === undefined) throw new Error('No state available for the requested source/event');
  console.log(JSON.stringify({ source: sourceFilter, requestedEvent: stateAt, lastStateEvent, recordingIncomplete: incomplete, state }));
}
