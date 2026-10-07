import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import type { D1Database } from '@cloudflare/workers-types';
import worker from '../cloudflare/worker.ts';
import { HistoryOutbox } from '../server/history-outbox.ts';
import { finishedMatchRecord } from '../server/match-record.ts';
import { createMultiplayerState, createBestOfThreeState, applyCommand, type GameState } from '../shared/game.ts';
import { aggregateHistory, MatchRecordSchema, type StoredMatchRecord } from '../shared/match-history.ts';
import { buildCombatSummaryCsv } from '../src/combat-summary-csv.ts';
import { parseCsv, readHistoryFile, recordsFromRows } from '../src/history-import.ts';

const context = { sessionId: 'session-a', hostId: 'host-a', commit: 'a'.repeat(40), dirty: true, arena: 'nagrand', mode: 'duel' as const };
const game = createMultiplayerState({ P1: 'shinobi', P2: 'orkk', P3: 'spectre' });
assert.equal(finishedMatchRecord(game, context), null, 'Unfinished battle must not be saved');
game.phase = 'finished'; game.winner = 'P1'; game.players.P2.hp = 0;
game.matchStartedAt = 1000; game.matchEndedAt = 51000;
Object.assign(game.players.P1.matchStats!, { attackDamage: 8, perkDamage: 3, defensiveRetaliationDamage: 2, totalDamage: 20 });
Object.assign(game, { damageLog: [{ eventType: 'damage', targetId: 'P1', amount: 3 }, { eventType: 'healing', targetId: 'P1', amount: 2 }] });
const live = finishedMatchRecord(game, context)!;
assert.equal(live.durationMs, 50000);
assert.equal(live.participants[0].metrics.damageTaken, 3);
assert.equal(live.participants[0].metrics.totalDamage, 13);
assert.equal(live.participants[0].metrics.creditedDamage, 20);
assert.equal(live.dirty, true);
assert.equal(live.commit, context.commit);
assert.throws(() => MatchRecordSchema.parse({ ...live, participants: [live.participants[0], live.participants[0]] }));
assert.throws(() => MatchRecordSchema.parse({ ...live, source: 'import' }));

let tournament = createBestOfThreeState('tournament', { P1: ['shinobi', 'magician'], P2: ['orkk', 'spectre'] });
tournament.phase = 'active'; tournament.activePlayerId = 'P1'; tournament.players.P2.hp = 0;
const win = applyCommand(tournament, { type: 'free-move', playerId: 'P1' });
assert.equal(win.ok, true); tournament = win.state;
const firstBattle = finishedMatchRecord(tournament, { ...context, sessionId: 'tournament', mode: 'tournament' })!;
assert.equal(firstBattle.matchNumber, 1);
assert.equal(firstBattle.seriesId, 'tournament');
assert.equal(tournament.series!.results.length, 1, 'A completed battle is saved before the whole tournament ends');
assert.equal(firstBattle.mode, 'tournament');
for (const playerId of ['P1', 'P2'] as const) {
  const next = applyCommand(tournament, { type: 'ready-series-match', playerId }); assert.equal(next.ok, true); tournament = next.state;
}
assert.equal(finishedMatchRecord(tournament, context), null, 'Starting the next battle must not resave the old battle');
tournament.series!.hotseat = true; tournament.phase = 'finished';
assert.equal(finishedMatchRecord(tournament, context), null, 'Hotseat must not be saved');

const csv = buildCombatSummaryCsv({ winner: 'Shinobi', turnsPlayed: 5, rows: [
  { player: 'P1', character: 'Shinobi', result: 'Winner', finalHp: 5, maxHp: 10, squaresMoved: 12, attackDamage: 8, perkDamage: 2, retaliationDamage: 1, totalDamage: 11, objectsDestroyed: 1, hpHealed: 2, combatDamageBlocked: 4 },
  { player: 'P2', character: 'Long Hat Logan', result: 'Defeated', finalHp: 0, maxHp: 10, squaresMoved: 9, attackDamage: 3, perkDamage: 1, retaliationDamage: 0, totalDamage: 4, objectsDestroyed: 0, hpHealed: 0, combatDamageBlocked: 3 },
] });
const imported = (await recordsFromRows(parseCsv(csv), 'old.csv'))[0];
assert.equal(imported.endedAt, null); assert.equal(imported.startedAt, null); assert.equal(imported.commit, null);
assert.equal(imported.mode, null); assert.equal(imported.participants[1].character, 'magician');
assert.equal(imported.participants[0].metrics.damageTaken, undefined, 'Absent metric must stay unknown');
assert.equal(imported.participants[0].metrics.defensiveRetaliationDamage, 1);
assert.equal((await recordsFromRows(parseCsv(csv), 'renamed.csv'))[0].id, imported.id);
assert.deepEqual(parseCsv('"a,b","quoted ""word"""\r\n"multi\nline",2'), [['a,b', 'quoted "word"'], ['multi\nline', '2']]);
assert.throws(() => parseCsv('"unterminated'));
assert.throws(() => parseCsv('"closed"oops,2'));
await assert.rejects(recordsFromRows([['Player', 'Character', 'Result', 'Total Damage'], ['P1', 'Shinobi', 'Winner', '-1'], ['P2', 'Orkk', 'Defeated', '0']], 'invalid.csv'));
await assert.rejects(recordsFromRows([['Player', 'Character', 'Result'], ['P1', 'Test Dummy', 'Winner'], ['P2', 'Da Orkk', 'Defeated']], 'hotseat.csv'), /hotseat-only/);
const workbook = new ExcelJS.Workbook();
for (const name of ['Match 1', 'Match 2']) { const sheet = workbook.addWorksheet(name); for (const row of parseCsv(csv)) sheet.addRow(row); }
const xlsx = await workbook.xlsx.writeBuffer();
const sheets = await readHistoryFile(new File([xlsx as unknown as ArrayBuffer], 'old.xlsx'));
assert.equal(sheets.length, 2); assert.equal(sheets[0].id, sheets[1].id);
assert.equal(sheets[0].importFile, 'old.xlsx / Match 1');

const database = new DatabaseSync(':memory:');
database.exec(readFileSync(new URL('../cloudflare/migrations/0001_history.sql', import.meta.url), 'utf8'));
class Statement {
  private values: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...values: (string | number | null)[]) { this.values = values; return this; }
  async all() {
    const prepared = database.prepare(this.sql);
    const results = prepared.columns().length ? prepared.all(...this.values) : (prepared.run(...this.values), []);
    return { success: true, results, meta: {} };
  }
  async first() { return (await this.all()).results[0] ?? null; }
}
const db = { prepare: (sql: string) => new Statement(sql), async batch(statements: Statement[]) {
  database.exec('BEGIN');
  try { const results = []; for (const statement of statements) results.push(await statement.all()); database.exec('COMMIT'); return results; }
  catch (error) { database.exec('ROLLBACK'); throw error; }
} } as unknown as D1Database;
const env = { DB: db, WRITE_KEY: 'w'.repeat(64), IMPORT_KEY: 'i'.repeat(64) };
async function request(path: string, body?: unknown, token?: string) {
  return worker.fetch(new Request(`https://stats.example${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
}
assert.equal((await request('/health')).status, 200);
assert.equal((await request('/matches', live)).status, 401);
assert.equal((await request('/imports', imported, env.WRITE_KEY)).status, 401, 'Host key must not authorize import');
assert.equal((await request('/matches', imported, env.WRITE_KEY)).status, 400, 'Live endpoint must not accept legacy imports');
assert.equal((await request('/matches', live, env.WRITE_KEY)).status, 201);
assert.equal((await request('/matches', live, env.WRITE_KEY)).status, 200, 'Retry is idempotent');
assert.equal((await request('/matches', { ...live, rounds: 100 }, env.WRITE_KEY)).status, 409);
assert.equal((await request('/imports', imported, env.IMPORT_KEY)).status, 201);
assert.equal((await request('/imports', { ...imported, importFile: 'renamed.csv' }, env.IMPORT_KEY)).status, 200);
const oldSchema = { ...live, id: 'old-metric', participants: live.participants.map(p => ({ ...p, metrics: { totalDamage: 0, newMetric: 7 } })) };
assert.equal((await request('/matches', oldSchema, env.WRITE_KEY)).status, 201);
const ffa: GameState = structuredClone(game);
ffa.players.P3 = structuredClone(ffa.players.P2); ffa.players.P3.id = 'P3'; ffa.players.P3.character = 'spectre'; ffa.players.P3.name = 'Spectre';
assert.equal((await request('/matches', finishedMatchRecord(ffa, { ...context, sessionId: 'ffa', mode: 'ffa', arena: 'lordaeron' }), env.WRITE_KEY)).status, 201);
const report = await (await request('/stats')).json() as { matches: number; aggregates: ReturnType<typeof aggregateHistory>; matchups: { character: string; opponent: string; games: number }[] };
assert.equal(report.matches, 4);
const history = await (await request('/history?limit=2')).json() as { records: StoredMatchRecord[]; nextCursor: string };
assert.equal(history.records.length, 2); assert.ok(history.nextCursor);
const older = await (await request(`/history?limit=2&cursor=${history.nextCursor}`)).json() as { records: StoredMatchRecord[]; nextCursor: null };
assert.equal(older.records.length, 2); assert.equal(older.nextCursor, null);
const all = [...history.records, ...older.records];
const reference = aggregateHistory(all);
assert.deepEqual(report.aggregates.sort((a, b) => a.character.localeCompare(b.character)), reference.sort((a, b) => a.character.localeCompare(b.character)));
assert.equal(report.aggregates.find(p => p.character === 'shinobi')!.metrics.damageTaken.count, 2, 'Unknown fields do not become zeros in averages');
assert.ok(!report.matchups.some(p => p.character === 'spectre' || p.opponent === 'spectre'), 'FFA is excluded from two-player matchups');
const filtered = await (await request('/stats?character=shinobi&opponent=magician&arena=unknown&mode=unknown')).json() as typeof report;
assert.equal(filtered.matches, 1); assert.equal(filtered.aggregates.length, 1); assert.equal(filtered.aggregates[0].character, 'shinobi');
assert.equal(filtered.matchups.length, 1); assert.equal(filtered.matchups[0].opponent, 'magician');
assert.equal((await (await request('/stats?from=1000&to=51000')).json() as typeof report).matches, 3, 'Imported unknown dates excluded from date filters');
assert.equal((await request('/stats?from=oops')).status, 400);
assert.equal((await request('/history?cursor=oops')).status, 400);
const options = await (await request('/options')).json() as { characters: unknown[] };
assert.equal(options.characters.length, 4);

const temporary = mkdtempSync(join(tmpdir(), 'gridfall-history-check-'));
try {
  const unavailable = new HistoryOutbox(temporary, 'https://stats.example', env.WRITE_KEY, async () => new Response('Unavailable', { status: 503 }));
  unavailable.enqueue(live); unavailable.enqueue(live); await unavailable.flush();
  assert.equal(readdirSync(temporary).filter(name => name.endsWith('.json')).length, 1, 'Failed upload retained, no duplicate file');
  const restored = new HistoryOutbox(temporary, 'https://stats.example', env.WRITE_KEY, async (_url, options) => {
    const record = JSON.parse(options!.body as string);
    return request('/matches', record, env.WRITE_KEY);
  });
  assert.equal(restored.hostId, unavailable.hostId, 'Host identity survives restart');
  await restored.flush();
  assert.equal(readdirSync(temporary).filter(name => name.endsWith('.json')).length, 0, 'Retry acknowledgement removes queue entry');
} finally { rmSync(temporary, { recursive: true, force: true }); database.close(); }
console.log('Match history checks passed: completion, interrupted tournament, import CSV/XLSX, schema evolution, SQL filters/aggregates, authorization, deduplication and durable retries.');
