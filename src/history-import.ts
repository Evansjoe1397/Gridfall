import { HISTORY_CHARACTERS, MatchRecordSchema, type MatchRecord } from '../shared/match-history.ts';

const COLUMN_METRICS: Record<string, string> = {
  'Final HP': 'finalHp', 'Max HP': 'maxHp', 'Squares Moved': 'squaresMoved',
  'Attack Damage': 'attackDamage', 'Perk Damage': 'perkDamage', 'Retaliation Damage': 'defensiveRetaliationDamage',
  'Total Damage': 'totalDamage', 'Objects Destroyed': 'objectsDestroyed', 'HP Healed': 'hitPointsHealed',
  'Combat Damage Blocked': 'combatDamageBlocked',
};
const CHARACTER_IDS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(HISTORY_CHARACTERS).map(([id, name]) => [name.toLowerCase(), id])),
  shinobi: 'shinobi', orkk: 'orkk', 'long hat logan': 'magician', magician: 'magician',
  'john christ': 'john-christ', 'john-christ': 'john-christ', spectre: 'spectre', wreckna: 'wreckna',
  merylin: 'merylin', merlin: 'merylin',
};
export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false; let closed = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === ',' || char === '\r' || char === '\n') {
      row.push(cell); cell = ''; closed = false;
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else if (char === '"') {
      if (cell.length || closed) throw new Error('Malformed CSV quoting');
      quoted = true;
    } else {
      if (closed) throw new Error('Unexpected text after CSV quote');
      cell += char;
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length || closed) { row.push(cell); rows.push(row); }
  return rows;
}
function numberCell(value: string | undefined, label: string): number | null {
  if (value === undefined || value.trim() === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) throw new Error(`${label}: expected a non-negative number`);
  return numeric;
}
function originalText(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}
export async function recordsFromRows(rows: string[][], importFile: string): Promise<MatchRecord[]> {
  const records: MatchRecord[] = [];
  let rounds: number | null = null;
  for (let index = 0; index < rows.length; index++) {
    if (rows[index][0] === 'Gridfall Combat Summary') rounds = null;
    if (rows[index][0] === 'Turns Played') rounds = numberCell(rows[index][1], 'Turns Played');
    const headers = rows[index];
    if (headers[0] !== 'Player' || !headers.includes('Character') || !headers.includes('Result')) continue;
    if (new Set(headers).size !== headers.length) throw new Error(`${importFile}: duplicate column headings`);
    const participants: MatchRecord['participants'] = [];
    for (index++; index < rows.length && /^P[123]$/.test(rows[index][0]); index++) {
      const row = rows[index]; const metrics: Record<string, number | null> = {};
      const name = originalText(row[headers.indexOf('Character')] ?? '').trim();
      if (!name) throw new Error(`${importFile}: missing Character`);
      if (/^(?:test |azure )?dummy$/i.test(name)) throw new Error(`${importFile}: training Dummy summaries are hotseat-only and cannot be imported`);
      const rawResult = row[headers.indexOf('Result')];
      if (!['Winner', 'Defeated', 'Finished'].includes(rawResult)) throw new Error(`${importFile}: unknown Result ${rawResult}`);
      for (let column = 0; column < headers.length; column++) {
        const header = headers[column]; if (['Player', 'Character', 'Result'].includes(header)) continue;
        // Preserve additional numeric columns without guessing their meaning.
        const metric = COLUMN_METRICS[header] ?? `legacy.${header.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
        metrics[metric] = numberCell(row[column], header);
      }
      const character = CHARACTER_IDS[name.toLowerCase()] ?? `legacy:${name.toLowerCase()}`;
      participants.push({ seat: row[0] as 'P1' | 'P2' | 'P3', character,
        characterName: HISTORY_CHARACTERS[character] ?? name, result: rawResult.toLowerCase() as 'winner' | 'defeated' | 'finished', metrics });
    }
    index--;
    participants.sort((a, b) => a.seat.localeCompare(b.seat));
    for (const participant of participants) participant.metrics = Object.fromEntries(Object.entries(participant.metrics).sort(([a], [b]) => a.localeCompare(b)));
    const record: MatchRecord = {
      schemaVersion: 1, id: 'pending', source: 'import', startedAt: null, endedAt: null, durationMs: null,
      rounds, arena: null, mode: participants.length === 3 ? 'ffa' : null, seriesId: null, matchNumber: null,
      commit: null, dirty: null, hostId: null, importFile: importFile.slice(0, 240), participants,
    };
    const canonical = JSON.stringify({ rounds, participants: [...participants].sort((a, b) => a.seat.localeCompare(b.seat)).map(p => ({ ...p, metrics: Object.fromEntries(Object.entries(p.metrics).sort(([a], [b]) => a.localeCompare(b))) })) });
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
    record.id = `import:${Array.from(hash, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    records.push(MatchRecordSchema.parse(record));
  }
  if (!records.length) throw new Error(`${importFile}: no Gridfall Combat Summary found`);
  return records;
}
export async function readHistoryFile(file: File): Promise<MatchRecord[]> {
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: maximum file size is 10 MiB`);
  if (/\.csv$/i.test(file.name)) return recordsFromRows(parseCsv(await file.text()), file.name);
  if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose a CSV or XLSX file');
  // Excel support is downloaded only when an XLSX import is requested.
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const records: MatchRecord[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    if (sheet.rowCount > 20_000 || sheet.columnCount > 80) throw new Error(`${sheet.name}: worksheet too large`);
    sheet.eachRow({ includeEmpty: true }, row => {
      const cells: string[] = [];
      for (let column = 1; column <= sheet.columnCount; column++) {
        const cell = row.getCell(column);
        if (cell.type === ExcelJS.ValueType.Formula) throw new Error(`${sheet.name}: formulas are not supported; paste exported values`);
        cells.push(cell.text);
      }
      while (cells.at(-1) === '') cells.pop();
      rows.push(cells);
    });
    if (rows.some(row => row[0] === 'Player' && row.includes('Character') && row.includes('Result'))) records.push(...await recordsFromRows(rows, `${file.name} / ${sheet.name}`));
  }
  if (!records.length) throw new Error(`${file.name}: no Gridfall summary worksheets found`);
  return records;
}
