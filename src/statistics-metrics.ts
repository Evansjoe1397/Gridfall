import type { MetricId } from '../shared/match-history.ts';

export const STATS_GROUPS = {
  dealt: { label: 'Damage dealt', metrics: ['totalDamage', 'attackDamage', 'perkDamage', 'defensiveRetaliationDamage'] },
  received: { label: 'Damage received', metrics: ['damageTaken', 'combatDamageBlocked', 'hitPointsHealed', 'finalHp'] },
  misc: { label: 'Misc', metrics: ['squaresMoved', 'objectsDestroyed'] },
} as const satisfies Record<string, { label: string; metrics: readonly MetricId[] }>;
export type StatsGroup = keyof typeof STATS_GROUPS;
