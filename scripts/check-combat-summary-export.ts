import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { buildCombatSummaryCsv, combatSummaryFilename } from '../src/combat-summary-csv.ts';

const createdAt = new Date(2026, 8, 14, 12, 30, 0);
const csv = buildCombatSummaryCsv({
  winner: 'John & Christ',
  turnsPlayed: 12,
  rows: [{
    player: 'P1', character: 'John & Christ', result: 'Winner', finalHp: 4, maxHp: 13,
    squaresMoved: 9, attackDamage: 7, perkDamage: 2, retaliationDamage: 1, totalDamage: 10,
    objectsDestroyed: 3, hpHealed: 4, combatDamageBlocked: 5,
  }],
}, createdAt);

assert.equal(combatSummaryFilename(createdAt), 'gridfall-combat-summary-2026-09-14.csv');
assert.equal(csv.startsWith('\uFEFF"Gridfall Combat Summary"\r\n'), true, 'The CSV includes a UTF-8 BOM and title.');
assert.equal(csv.includes('"Winner","John & Christ"'), true);
assert.equal(csv.includes('"Combat Damage Blocked"'), true);
assert.equal(csv.includes('"P1","John & Christ","Winner","4","13","9","7","2","1","10","3","4","5"'), true, 'The CSV contains every summary statistic.');

if (process.argv[2]) writeFileSync(process.argv[2], csv, 'utf8');

console.log('Combat summary CSV export checks passed.');
