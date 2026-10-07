import { METRICS, type CharacterAggregate, type MatchRecord, type StoredMatchRecord } from '../shared/match-history.ts';
import { DEFAULT_STATS_URL } from '../shared/stats-config.ts';
import { readHistoryFile } from './history-import.ts';
import { formatSummaryDuration } from './summary-duration.ts';
import './statistics-panel.css';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]!));
const percent = (wins: number, games: number) => games ? `${(wins / games * 100).toFixed(1)}%` : '—';
const date = (value: number | null) => value === null ? 'Unknown date' : new Date(value).toLocaleString();
const metricLabel = (name: string) => METRICS[name as keyof typeof METRICS] ?? name;
function participantTable(record: MatchRecord): string {
  const metrics = [...new Set(record.participants.flatMap(p => Object.keys(p.metrics)))];
  return `<table><thead><tr><th>Character</th><th>Result</th>${metrics.map(metric => `<th>${escape(metricLabel(metric))}</th>`).join('')}</tr></thead><tbody>${record.participants.map(p => `<tr><th>${escape(p.characterName)}</th><td>${escape(p.result)}</td>${metrics.map(metric => `<td>${p.metrics[metric] ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
type Stats = { matches: number; aggregates: CharacterAggregate[]; matchups: { character: string; opponent: string; games: number; wins: number }[] };
type Options = { characters: { character: string; name: string }[]; arenas: { arena: string }[]; commits: { sha: string; dirty: number | null }[] };
export function mountStatisticsPanel(button: HTMLElement): HTMLDialogElement {
  const dialog = document.createElement('dialog'); dialog.id = 'statisticsDialog'; dialog.className = 'statistics-dialog';
  dialog.setAttribute('aria-labelledby', 'statisticsTitle');
  dialog.innerHTML = `<header><div><p class="eyebrow">MULTIPLAYER ARCHIVE</p><h2 id="statisticsTitle">Statistics</h2></div><button type="button" data-close aria-label="Close statistics">Close</button></header>
    <p>Completed multiplayer battles from every host. Each battle in a series is recorded separately.</p>
    <form class="statistics-filters">
      <label>From<input type="date" name="from"></label><label>Through<input type="date" name="to"></label>
      <label>Character<select name="character"><option value="">All characters</option></select></label>
      <label>Opponent<select name="opponent"><option value="">All opponents</option></select></label>
      <label>Arena<select name="arena"><option value="">All arenas</option><option value="unknown">Unknown arena</option></select></label>
      <label>Mode<select name="mode"><option value="">All modes</option><option value="duel">Duel</option><option value="ffa">FFA</option><option value="series">Series</option><option value="tournament">Tournament</option><option value="unknown">Unknown mode</option></select></label>
      <label>Source<select name="source"><option value="">All sources</option><option value="multiplayer">Multiplayer</option><option value="import">Imported</option></select></label>
      <label>Commit<input name="commit" maxlength="64" placeholder="SHA prefix" pattern="[a-f0-9]{1,64}" list="statisticsCommits"><datalist id="statisticsCommits"></datalist></label>
      <div class="statistics-filter-actions"><button type="submit">Apply filters</button><button type="reset">Reset</button></div>
    </form>
    <p class="statistics-status" role="status" aria-live="polite"></p>
    <p class="statistics-explanation">Date filters exclude matches with unknown dates. Missing metrics stay unknown. Winrate is calculated per character appearance; mirror matches include both players. FFA and two-player modes can be filtered separately.</p>
    <section><h3>Character winrates</h3><label class="statistics-metric">Average metric <select data-metric>${Object.entries(METRICS).map(([id, label]) => `<option value="${id}"${id === 'totalDamage' ? ' selected' : ''}>${label}</option>`).join('')}</select></label><div class="statistics-scroll" data-aggregates></div></section>
    <section><h3>Two-player matchups</h3><p>FFA is excluded from this table. Games and winrate are shown from the first character's perspective.</p><div class="statistics-scroll" data-matchups></div></section>
    <section><h3>Match history</h3><p>Newest saved records first. Imported dates remain unknown.</p><div data-history></div><button type="button" data-more hidden>Load older matches</button></section>
    <section class="statistics-import"><h3>Import old summaries</h3><p>Choose current Gridfall CSV exports, or an XLSX workbook with exports on separate sheets. Import only known completed multiplayer battles: old files do not identify hotseat versus multiplayer. Preview before uploading. Identical summaries are treated as duplicates because old exports contain no match ID.</p>
      <div class="statistics-import-row"><label>Summary files<input type="file" accept=".csv,.xlsx" multiple data-files></label><button type="button" data-preview>Preview import</button></div>
      <div class="statistics-scroll" data-import-preview></div>
      <div class="statistics-import-row"><label>Import key<input type="password" data-import-key autocomplete="off" placeholder="Separate import key"></label>
      <button type="button" data-upload disabled>Import previewed matches</button></div><p data-import-status role="status" aria-live="polite"></p>
    </section>`;
  document.body.append(dialog);
  const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const form = element<HTMLFormElement>('form'); const status = element('.statistics-status');
  let url = DEFAULT_STATS_URL; let cursor: string | null = null; let params = new URLSearchParams(); let revision = 0;
  let stats: Stats | null = null; let importing: MatchRecord[] = []; let uploadBusy = false;
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(`${url.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Statistics API returned HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }
  function renderAggregates(): void {
    if (!stats) return;
    const metric = element<HTMLSelectElement>('[data-metric]').value;
    element('[data-aggregates]').innerHTML = `<table><thead><tr><th>Character</th><th>Games</th><th>Wins</th><th>Winrate</th><th>Average ${escape(metricLabel(metric))}</th><th>Metric coverage</th></tr></thead><tbody>${stats.aggregates.map(row => {
      const value = row.metrics[metric];
      return `<tr><th>${escape(row.name)}</th><td>${row.games}</td><td>${row.wins}</td><td>${percent(row.wins, row.games)}</td><td>${value?.count ? (value.sum / value.count).toFixed(2) : '—'}</td><td>${value?.count ?? 0} / ${row.games}</td></tr>`;
    }).join('')}</tbody></table>`;
    const names = new Map(stats.aggregates.map(row => [row.character, row.name]));
    element('[data-matchups]').innerHTML = `<table><thead><tr><th>Character</th><th>Opponent</th><th>Games</th><th>Wins</th><th>Winrate</th></tr></thead><tbody>${stats.matchups.map(row => `<tr><th>${escape(names.get(row.character) ?? row.character)}</th><td>${escape(names.get(row.opponent) ?? row.opponent)}</td><td>${row.games}</td><td>${row.wins}</td><td>${percent(row.wins, row.games)}</td></tr>`).join('')}</tbody></table>`;
  }
  function appendHistory(records: StoredMatchRecord[]): void {
    element('[data-history]').insertAdjacentHTML('beforeend', records.map(record => {
      return `<details class="statistics-match"><summary><strong>${escape(record.participants.map(p => p.characterName).join(' vs '))}</strong><span>${escape(date(record.endedAt))} · ${record.source === 'import' ? 'Imported' : 'Multiplayer'} · ${escape(record.arena ?? 'Unknown arena')} · ${escape(record.mode ?? 'Unknown mode')}${record.matchNumber ? ` · Battle ${record.matchNumber}` : ''}</span></summary>
        <p>Winner: ${escape(record.participants.find(p => p.result === 'winner')?.characterName ?? 'No winner')} · Rounds: ${record.rounds ?? '—'} · Duration: ${formatSummaryDuration(record.durationMs ?? undefined)}</p>
        <p>Started: ${escape(date(record.startedAt))} · Ended: ${escape(date(record.endedAt))} · Commit: ${escape(record.commit ?? 'Unknown')}${record.dirty === true ? ' (uncommitted changes)' : record.dirty === null && record.commit ? ' (working tree unknown)' : ''}</p>
        <p>ID: ${escape(record.id)}${record.seriesId ? ` · Series: ${escape(record.seriesId)}` : ''} · Schema: ${record.schemaVersion}${record.importFile ? ` · File: ${escape(record.importFile)}` : ''}</p>
        <div class="statistics-scroll">${participantTable(record)}</div></details>`;
    }).join(''));
  }
  async function refresh(): Promise<void> {
    const current = ++revision; status.textContent = 'Loading statistics…';
    params = new URLSearchParams();
    for (const [key, raw] of new FormData(form)) {
      const value = String(raw); if (!value) continue;
      if (key === 'from' || key === 'to') {
        // Match the local timezone used to display dates, including daylight saving changes.
        const boundary = new Date(`${value}T00:00:00`);
        if (key === 'to') boundary.setDate(boundary.getDate() + 1);
        params.set(key, String(boundary.getTime() - (key === 'to' ? 1 : 0)));
      } else params.set(key, value);
    }
    element<HTMLButtonElement>('[data-more]').hidden = true;
    try {
      if (!url) throw new Error('Central statistics API is not configured yet. Completed multiplayer matches are queued on the host.');
      const [newStats, history] = await Promise.all([get<Stats>(`/stats?${params}`), get<{ records: StoredMatchRecord[]; nextCursor: string | null }>(`/history?${params}`)]);
      if (revision !== current) return;
      stats = newStats; cursor = history.nextCursor;
      renderAggregates(); element('[data-history]').innerHTML = ''; appendHistory(history.records);
      element<HTMLButtonElement>('[data-more]').hidden = !cursor;
      status.textContent = `${stats.matches} matching battles. ${stats.matches ? 'Expand a match to see all recorded metrics.' : 'No matches for these filters.'}`;
    } catch (error) {
      if (revision !== current) return;
      stats = null; cursor = null;
      for (const selector of ['[data-history]', '[data-aggregates]', '[data-matchups]']) element(selector).innerHTML = '';
      status.textContent = error instanceof Error ? error.message : 'Could not load statistics. Apply filters to retry.';
    }
  }
  async function loadOptions(): Promise<void> {
    const options = await get<Options>('/options');
    for (const key of ['character', 'opponent']) {
      const select = element<HTMLSelectElement>(`[name="${key}"]`); const selected = select.value;
      select.innerHTML = `<option value="">All ${key === 'character' ? 'characters' : 'opponents'}</option>` + options.characters.map(p => `<option value="${escape(p.character)}">${escape(p.name)}</option>`).join('');
      select.value = selected;
    }
    const select = element<HTMLSelectElement>('[name="arena"]'); const selected = select.value;
    select.innerHTML = '<option value="">All arenas</option><option value="unknown">Unknown arena</option>' + options.arenas.map(a => `<option value="${escape(a.arena)}">${escape(a.arena)}</option>`).join(''); select.value = selected;
    element('datalist').innerHTML = options.commits.map(c => `<option value="${escape(c.sha)}">${escape(c.sha.slice(0, 10))}${c.dirty ? ' (modified)' : ''}</option>`).join('');
  }
  button.addEventListener('click', async () => {
    if (!dialog.open) dialog.showModal();
    status.textContent = 'Loading statistics…';
    try {
      const response = await fetch('/api/stats-config', { signal: AbortSignal.timeout(3000) });
      if (response.ok) { const config = await response.json() as { url?: string }; if (config.url) url = config.url; }
    } catch { /* Static hosts use the central URL included in the build. */ }
    void loadOptions().catch(() => {}); await refresh();
  });
  element('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { element<HTMLInputElement>('[data-import-key]').value = ''; });
  form.addEventListener('submit', event => { event.preventDefault(); void refresh(); });
  form.addEventListener('reset', () => queueMicrotask(() => void refresh()));
  element('[data-metric]').addEventListener('change', renderAggregates);
  element('[data-more]').addEventListener('click', async () => {
    if (!cursor) return;
    const current = revision; const more = element<HTMLButtonElement>('[data-more]'); more.disabled = true;
    try {
      const pageParams = new URLSearchParams(params); pageParams.set('cursor', cursor);
      const page = await get<{ records: StoredMatchRecord[]; nextCursor: string | null }>(`/history?${pageParams}`);
      if (current !== revision) return;
      appendHistory(page.records); cursor = page.nextCursor; more.hidden = !cursor;
    } catch { if (current === revision) status.textContent = 'Could not load older matches. Retry Load older matches.'; }
    finally { more.disabled = false; }
  });
  element('[data-preview]').addEventListener('click', async () => {
    if (uploadBusy) return;
    importing = []; element<HTMLButtonElement>('[data-upload]').disabled = true;
    const importStatus = element('[data-import-status]'); importStatus.textContent = 'Reading files…'; element('[data-import-preview]').innerHTML = '';
    try {
      const files = Array.from(element<HTMLInputElement>('[data-files]').files ?? []);
      if (!files.length) throw new Error('Select summary files first.');
      if (files.length > 100) throw new Error('Import up to 100 files at a time.');
      const records: MatchRecord[] = [];
      for (const file of files) records.push(...await readHistoryFile(file));
      importing = [...new Map(records.map(record => [record.id, record])).values()];
      element('[data-import-preview]').innerHTML = `<table><thead><tr><th>File / sheet</th><th>Characters</th><th>Winner</th><th>Rounds</th><th>Date</th></tr></thead><tbody>${importing.map(record => `<tr><td>${escape(record.importFile)}</td><td>${escape(record.participants.map(p => p.characterName).join(' vs '))}</td><td>${escape(record.participants.find(p => p.result === 'winner')?.characterName ?? 'No winner')}</td><td>${record.rounds ?? '—'}</td><td>Unknown · Imported</td></tr>`).join('')}</tbody></table>`;
      element('[data-import-preview]').insertAdjacentHTML('beforeend', importing.map(record => `<details class="statistics-match"><summary>${escape(record.importFile)} · Inspect imported metrics</summary>${participantTable(record)}</details>`).join(''));
      importStatus.textContent = `${importing.length} matches ready; ${records.length - importing.length} identical summaries skipped. Dates, commit, arena and absent metrics will stay unknown.`;
      element<HTMLButtonElement>('[data-upload]').disabled = !importing.length;
    } catch (error) { importing = []; importStatus.textContent = error instanceof Error ? error.message : 'Could not read import'; }
  });
  element('[data-upload]').addEventListener('click', async () => {
    if (uploadBusy || !importing.length) return;
    const key = element<HTMLInputElement>('[data-import-key]').value.trim(); const importStatus = element('[data-import-status]');
    if (key.length < 32) { importStatus.textContent = 'Enter the separate import key before uploading.'; return; }
    if (!url) { importStatus.textContent = 'Statistics API is not configured.'; return; }
    uploadBusy = true; element<HTMLButtonElement>('[data-upload]').disabled = true; element<HTMLButtonElement>('[data-preview]').disabled = true;
    let inserted = 0; let duplicates = 0;
    try {
      for (const record of importing) {
        const response = await fetch(`${url.replace(/\/$/, '')}/imports`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify(record), signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error(`Import returned HTTP ${response.status}. Retrying is safe; already uploaded matches will be skipped.`);
        const receipt = await response.json() as { duplicate: boolean };
        if (receipt.duplicate) duplicates++; else inserted++;
        importStatus.textContent = `${inserted} imported, ${duplicates} already present…`;
      }
      importStatus.textContent = `${inserted} matches imported; ${duplicates} already present. Match dates remain unknown.`;
      importing = []; element<HTMLInputElement>('[data-import-key]').value = '';
      await loadOptions(); await refresh();
    } catch (error) { importStatus.textContent = `${inserted} imported, ${duplicates} already present. ${error instanceof Error ? error.message : 'Import failed'}`; }
    finally { uploadBusy = false; element<HTMLButtonElement>('[data-upload]').disabled = !importing.length; element<HTMLButtonElement>('[data-preview]').disabled = false; }
  });
  return dialog;
}
