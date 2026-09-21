export type CombatSummaryExportRow = {
  player: string;
  character: string;
  result: 'Winner' | 'Defeated' | 'Finished';
  finalHp: number;
  maxHp: number;
  squaresMoved: number;
  attackDamage: number;
  perkDamage: number;
  retaliationDamage: number;
  totalDamage: number;
  objectsDestroyed: number;
  hpHealed: number;
  combatDamageBlocked: number;
};

export type CombatSummaryExport = {
  winner: string | null;
  turnsPlayed: number;
  rows: CombatSummaryExportRow[];
};

const HEADERS = ['Player', 'Character', 'Result', 'Final HP', 'Max HP', 'Squares Moved', 'Attack Damage', 'Perk Damage', 'Retaliation Damage', 'Total Damage', 'Objects Destroyed', 'HP Healed', 'Combat Damage Blocked'];

function csvCell(value: string | number): string {
  const raw = String(value);
  const safe = typeof value === 'string' && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(',');
}

export function buildCombatSummaryCsv(summary: CombatSummaryExport): string {
  const rows = [
    csvRow(['Gridfall Combat Summary']),
    csvRow(['Winner', summary.winner ?? 'No winner']),
    csvRow(['Turns Played', summary.turnsPlayed]),
    '',
    csvRow(HEADERS),
    ...summary.rows.map((entry) => csvRow([
      entry.player, entry.character, entry.result, entry.finalHp, entry.maxHp, entry.squaresMoved,
      entry.attackDamage, entry.perkDamage, entry.retaliationDamage, entry.totalDamage,
      entry.objectsDestroyed, entry.hpHealed, entry.combatDamageBlocked,
    ])),
  ];
  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

export function combatSummaryFilename(createdAt = new Date()): string {
  const date = [createdAt.getFullYear(), String(createdAt.getMonth() + 1).padStart(2, '0'), String(createdAt.getDate()).padStart(2, '0')].join('-');
  return `gridfall-combat-summary-${date}.csv`;
}
