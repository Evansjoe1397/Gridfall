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

export async function buildCombatSummaryXlsx(summary: CombatSummaryExport, createdAt = new Date()): Promise<Uint8Array> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gridfall';
  workbook.created = createdAt;
  workbook.modified = createdAt;
  const sheet = workbook.addWorksheet('Combat Summary', {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
  });

  sheet.mergeCells('A1:M1');
  const title = sheet.getCell('A1');
  title.value = 'Gridfall Combat Summary';
  title.font = { name: 'Calibri', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF071C17' } };
  title.alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 28;

  sheet.getCell('A2').value = 'Winner';
  sheet.getCell('B2').value = summary.winner ?? 'No winner';
  sheet.getCell('A3').value = 'Turns Played';
  sheet.getCell('B3').value = summary.turnsPlayed;
  sheet.getCell('A2').font = { bold: true };
  sheet.getCell('A3').font = { bold: true };

  const headerRow = sheet.getRow(5);
  headerRow.values = HEADERS;
  headerRow.height = 34;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF166C5A' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF9ABFB5' } },
      left: { style: 'thin', color: { argb: 'FF9ABFB5' } },
      bottom: { style: 'thin', color: { argb: 'FF9ABFB5' } },
      right: { style: 'thin', color: { argb: 'FF9ABFB5' } },
    };
  });

  for (const entry of summary.rows) {
    sheet.addRow([
      entry.player, entry.character, entry.result, entry.finalHp, entry.maxHp, entry.squaresMoved,
      entry.attackDamage, entry.perkDamage, entry.retaliationDamage, entry.totalDamage,
      entry.objectsDestroyed, entry.hpHealed, entry.combatDamageBlocked,
    ]);
  }

  const widths = [12, 23, 12, 11, 11, 19, 19, 19, 21, 19, 21, 16, 23];
  widths.forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
  sheet.autoFilter = { from: 'A5', to: `M${Math.max(5, summary.rows.length + 5)}` };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

export function combatSummaryFilename(createdAt = new Date()): string {
  const date = [createdAt.getFullYear(), String(createdAt.getMonth() + 1).padStart(2, '0'), String(createdAt.getDate()).padStart(2, '0')].join('-');
  return `gridfall-combat-summary-${date}.xlsx`;
}
