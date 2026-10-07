import { z } from 'zod';

// Add metrics without rewriting old records. Missing means unknown, never zero.
export const METRICS = {
  squaresMoved: 'Squares moved', attackDamage: 'Attack damage', perkDamage: 'Perk damage',
  defensiveRetaliationDamage: 'Retaliation damage', totalDamage: 'Total damage', creditedDamage: 'All credited damage',
  hitPointsHealed: 'HP healed', combatDamageBlocked: 'Combat damage blocked',
  objectsDestroyed: 'Objects destroyed', damageTaken: 'HP damage taken', finalHp: 'Final HP', maxHp: 'Max HP',
} as const;
export type MetricId = keyof typeof METRICS;
export const HISTORY_CHARACTERS: Record<string, string> = {
  shinobi: 'Obi Wan Shinobi', orkk: 'Da Orkk', magician: 'Long Hat Logan',
  'john-christ': 'John Christ', spectre: 'Spectre', wreckna: 'Wreckna', merylin: 'Merylin Pendragon',
};
const nullableText = z.string().max(160).nullable();
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000).nullable();
export const MatchRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(160).regex(/^[a-zA-Z0-9:_-]+$/),
  source: z.enum(['multiplayer', 'import']),
  startedAt: timestamp, endedAt: timestamp,
  durationMs: z.number().nonnegative().nullable(), rounds: z.number().int().positive().nullable(),
  arena: nullableText, mode: z.enum(['duel', 'ffa', 'series', 'tournament']).nullable(),
  seriesId: nullableText, matchNumber: z.number().int().min(1).max(3).nullable(),
  commit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), dirty: z.boolean().nullable(),
  hostId: nullableText, importFile: z.string().max(240).nullable(),
  participants: z.array(z.object({
    seat: z.enum(['P1', 'P2', 'P3']), character: z.string().min(1).max(80),
    characterName: z.string().min(1).max(100), result: z.enum(['winner', 'defeated', 'finished']),
    metrics: z.record(z.string().min(1).max(80).regex(/^[a-z][a-zA-Z0-9_.-]*$/).refine(key => !['constructor', 'prototype', '__proto__'].includes(key)), z.number().finite().nonnegative().nullable()).refine((v) => Object.keys(v).length <= 80, 'Too many metrics'),
  })).min(2).max(3),
}).superRefine((record, ctx) => {
  if (new Set(record.participants.map(p => p.seat)).size !== record.participants.length) ctx.addIssue({ code: 'custom', message: 'Duplicate player seat' });
  if (record.participants.filter(p => p.result === 'winner').length > 1) ctx.addIssue({ code: 'custom', message: 'Multiple winners' });
  if (record.startedAt !== null && record.endedAt !== null && record.endedAt < record.startedAt) ctx.addIssue({ code: 'custom', message: 'End precedes start' });
  if (record.source === 'import' && (record.startedAt !== null || record.endedAt !== null)) ctx.addIssue({ code: 'custom', message: 'Legacy imports have unknown match dates' });
});
export type MatchRecord = z.infer<typeof MatchRecordSchema>;
export type StoredMatchRecord = MatchRecord & { receivedAt: number };
export type HistoryFilter = { from?: number; to?: number; arena?: string; mode?: string; character?: string; opponent?: string; commit?: string; source?: string };

export function filterHistory(records: StoredMatchRecord[], filter: HistoryFilter): StoredMatchRecord[] {
  return records.filter(record => {
    if (filter.from !== undefined && (record.endedAt === null || record.endedAt < filter.from)) return false;
    if (filter.to !== undefined && (record.endedAt === null || record.endedAt > filter.to)) return false;
    if (filter.arena && record.arena !== (filter.arena === 'unknown' ? null : filter.arena) || filter.mode && record.mode !== (filter.mode === 'unknown' ? null : filter.mode) || filter.source && record.source !== filter.source) return false;
    if (filter.commit && !record.commit?.startsWith(filter.commit)) return false;
    const selected = record.participants.filter(p => !filter.character || p.character === filter.character);
    return selected.some(p => !filter.opponent || record.participants.some(other => other.seat !== p.seat && other.character === filter.opponent));
  });
}

export type CharacterAggregate = { character: string; name: string; games: number; wins: number; metrics: Record<string, { sum: number; count: number }> };
export function aggregateHistory(records: StoredMatchRecord[], filter: HistoryFilter = {}): CharacterAggregate[] {
  const rows = new Map<string, CharacterAggregate>();
  for (const record of filterHistory(records, filter)) for (const p of record.participants) {
    if (filter.character && p.character !== filter.character) continue;
    if (filter.opponent && !record.participants.some(other => other.seat !== p.seat && other.character === filter.opponent)) continue;
    const row = rows.get(p.character) ?? { character: p.character, name: p.characterName, games: 0, wins: 0, metrics: {} };
    row.games++; if (p.result === 'winner') row.wins++;
    for (const [metric, value] of Object.entries(p.metrics)) {
      if (value === null || !Number.isFinite(value)) continue;
      const item = row.metrics[metric] ??= { sum: 0, count: 0 };
      item.sum += value; item.count++;
    }
    rows.set(p.character, row);
  }
  return [...rows.values()].sort((a, b) => b.games - a.games || a.name.localeCompare(b.name));
}
