import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { buildCombatSummaryXlsx, combatSummaryFilename } from '../src/combat-summary-xlsx.ts';

const createdAt = new Date(2026, 8, 14, 12, 30, 0);
const workbook = await buildCombatSummaryXlsx({
  winner: 'John & Christ',
  turnsPlayed: 12,
  rows: [{
    player: 'P1', character: 'John & Christ', result: 'Winner', finalHp: 4, maxHp: 13,
    squaresMoved: 9, attackDamage: 7, perkDamage: 2, retaliationDamage: 1, totalDamage: 10,
    objectsDestroyed: 3, hpHealed: 4, combatDamageBlocked: 5,
  }],
}, createdAt);

assert.equal(new DataView(workbook.buffer, workbook.byteOffset, workbook.byteLength).getUint32(0, true), 0x04034b50, 'The export starts with a ZIP local-file signature.');
assert.equal(combatSummaryFilename(createdAt), 'gridfall-combat-summary-2026-09-14.xlsx');

const parsed = new ExcelJS.Workbook();
await parsed.xlsx.load(workbook);
const sheet = parsed.getWorksheet('Combat Summary');
assert.ok(sheet, 'The generated workbook contains the Combat Summary worksheet.');
assert.equal(sheet.getCell('A1').value, 'Gridfall Combat Summary');
assert.equal(sheet.getCell('B2').value, 'John & Christ');
assert.equal(sheet.getCell('M5').value, 'Combat Damage Blocked');
assert.equal(sheet.getCell('J6').value, 10, 'The exported Total Damage remains numeric.');
assert.equal(sheet.autoFilter, 'A5:M6', 'The summary data has an Excel filter.');

if (process.argv[2]) writeFileSync(process.argv[2], workbook);

console.log('Combat summary XLSX export checks passed.');
