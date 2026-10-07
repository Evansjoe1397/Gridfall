import type { DamageLogEntry, GameState, PlayerId } from '../shared/game.ts';
import { MatchRecordSchema, type MatchRecord } from '../shared/match-history.ts';

export type MatchContext = { sessionId: string; hostId: string; commit: string | null; dirty: boolean | null; arena: string; mode: NonNullable<MatchRecord['mode']> };
export function finishedMatchRecord(state: GameState, context: MatchContext): MatchRecord | null {
  if (state.phase !== 'finished' || state.series?.hotseat) return null;
  const number = state.series?.match ?? 1;
  const damageLog = (state as GameState & { damageLog?: DamageLogEntry[] }).damageLog ?? [];
  return MatchRecordSchema.parse({
    schemaVersion: 1, id: `${context.sessionId}:${number}`, source: 'multiplayer',
    startedAt: state.matchStartedAt ?? null, endedAt: state.matchEndedAt ?? null,
    durationMs: state.matchStartedAt !== undefined && state.matchEndedAt !== undefined ? Math.max(0, state.matchEndedAt - state.matchStartedAt) : null,
    rounds: state.turn, arena: state.series?.arenaOrder[number - 1] ?? context.arena, mode: context.mode,
    seriesId: state.series ? context.sessionId : null, matchNumber: state.series ? number : null,
    commit: context.commit, dirty: context.dirty, hostId: context.hostId, importFile: null,
    participants: (Object.keys(state.players) as PlayerId[]).map(seat => {
      const player = state.players[seat];
      const stats = player.matchStats;
      return {
        seat, character: player.character, characterName: player.name,
        result: seat === state.winner ? 'winner' : player.hp <= 0 ? 'defeated' : 'finished',
        metrics: { ...stats,
          // Match the end-of-battle table and legacy CSV; keep the broader internal counter separately.
          totalDamage: stats ? stats.attackDamage + stats.perkDamage + (stats.defensiveRetaliationDamage ?? 0) : null,
          creditedDamage: stats?.totalDamage ?? null, finalHp: player.hp, maxHp: player.maxHp,
          damageTaken: damageLog.filter(e => e.eventType === 'damage' && e.targetId === seat).reduce((sum, e) => sum + e.amount, 0) },
      };
    }),
  });
}
