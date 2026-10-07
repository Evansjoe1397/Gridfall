import { METRICS, type MatchRecord, type StoredMatchRecord } from '../shared/match-history.ts';
import { characterProfile } from './character-profiles.ts';
import type { CharacterId } from '../shared/game.ts';
import { formatSummaryDuration } from './summary-duration.ts';

export const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
export const percent = (wins: number, games: number) => games ? `${(wins / games * 100).toFixed(1)}%` : '—';
export const metricLabel = (name: string) => name === 'damageTaken' ? 'Damage taken' : METRICS[name as keyof typeof METRICS] ?? name;
export const arenaLabel = (arena: string | null) => ({ nagrand: 'Nagrand Arena', lordaeron: 'Lordaeron Arena', trench: 'The Trench', pipe: 'The Pipe' }[arena ?? ''] ?? arena ?? '—');
export const modeLabel = (mode: string | null) => ({ duel: 'Duel', ffa: 'FFA', series: 'Series', tournament: 'Tournament' }[mode ?? ''] ?? mode ?? '—');
const dateLabel = (value: number | null) => value === null ? '—' : new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function characterLabel(character: string, name: string, winner = false): string {
  const portrait = characterProfile(character as CharacterId);
  return `<span class="statistics-character${winner ? ' is-winner' : ''}" title="${escape(name)}"><span class="statistics-face" aria-hidden="true">${portrait ? `<img src="${escape(portrait)}" alt="" loading="lazy" draggable="false">` : '?'}</span><span>${escape(name)}</span>${winner ? '<span class="statistics-winner" title="Winner" aria-label="Winner">★</span>' : ''}</span>`;
}
export function participantTable(record: MatchRecord): string {
  const metrics = [...new Set(record.participants.flatMap(p => Object.keys(p.metrics)))].filter(metric => metric !== 'creditedDamage');
  return `<table><thead><tr><th>Character</th><th>Result</th>${metrics.map(metric => `<th>${escape(metricLabel(metric))}</th>`).join('')}</tr></thead><tbody>${record.participants.map(p => `<tr><th>${characterLabel(p.character, p.characterName)}</th><td>${escape(p.result)}</td>${metrics.map(metric => `<td>${p.metrics[metric] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export function historyRows(records: StoredMatchRecord[], canDelete: boolean): string {
  if (!records.length) return '<p class="statistics-empty">No matches.</p>';
  return records.map(record => `<details class="statistics-match" name="statistics-match" data-delete-match="${escape(record.id)}"><summary>
    <span class="statistics-contestants">${record.participants.map(p => characterLabel(p.character, p.characterName, p.result === 'winner')).join('<span class="statistics-versus">vs</span>')}</span>
    <span class="statistics-row-arena">${escape(arenaLabel(record.arena))}<small>${escape(modeLabel(record.mode))}${record.matchNumber ? ` · ${record.matchNumber}` : ''}</small></span>
    <span class="statistics-row-date">${escape(dateLabel(record.endedAt))}${record.source === 'import' ? '<small class="statistics-import-badge">Imported</small>' : ''}</span>
    <span class="statistics-row-duration">${record.durationMs === null ? '—' : formatSummaryDuration(record.durationMs)}</span>
    ${canDelete ? '<button class="statistics-delete-icon" type="button" data-delete-action="start" aria-label="Delete this match" title="Delete match">×</button>' : '<span></span>'}
    </summary><div class="statistics-match-body">
    <div class="statistics-delete-confirmation" data-delete-confirmation hidden><span>Delete this battle?</span> <button type="button" data-delete-action="confirm">Delete</button> <button type="button" data-delete-action="cancel">Cancel</button></div><p data-delete-status role="status" aria-live="polite"></p>
    <div class="statistics-match-meta"><span>${record.rounds ?? '—'} rounds</span><span title="Match started">${escape(dateLabel(record.startedAt))}</span><span title="Commit">${escape(record.commit?.slice(0, 10) ?? 'Unknown commit')}${record.dirty ? ' · modified' : ''}</span></div>
    <div class="statistics-scroll">${participantTable(record)}</div>
    <details class="statistics-record-info"><summary>Record details</summary><dl><dt>ID</dt><dd>${escape(record.id)}</dd><dt>Commit</dt><dd>${escape(record.commit ?? '—')}</dd><dt>Series</dt><dd>${escape(record.seriesId ?? '—')}</dd>${record.importFile ? `<dt>File</dt><dd>${escape(record.importFile)}</dd>` : ''}<dt>Schema</dt><dd>${record.schemaVersion}</dd></dl></details></div></details>`).join('');
}
