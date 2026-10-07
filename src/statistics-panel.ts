import { type CharacterAggregate, type MatchRecord, type StoredMatchRecord } from '../shared/match-history.ts';
import { DEFAULT_STATS_URL } from '../shared/stats-config.ts';
import { readHistoryFile } from './history-import.ts';
import { mountHistoryDeletion } from './history-deletion.ts';
import { HISTORY_PAGE_SIZE, HistoryPaging } from './history-paging.ts';
import { STATS_GROUPS, type StatsGroup } from './statistics-metrics.ts';
import { escape, percent, metricLabel, arenaLabel, characterLabel, participantTable, historyRows } from './statistics-view.ts';
import './statistics-panel.css';

type Stats = { matches: number; aggregates: CharacterAggregate[]; matchups: { character: string; opponent: string; games: number; wins: number }[] };
type History = { records: StoredMatchRecord[]; nextCursor: string | null };
type Options = { characters: { character: string; name: string }[]; arenas: { arena: string }[]; commits: { sha: string; dirty: number | null }[] };
export function mountStatisticsPanel(button: HTMLElement): HTMLDialogElement {
  const dialog = document.createElement('dialog'); dialog.id = 'statisticsDialog'; dialog.className = 'statistics-dialog';
  dialog.setAttribute('aria-labelledby', 'statisticsTitle');
  dialog.innerHTML = `<header><h2 id="statisticsTitle">Statistics</h2><button type="button" data-close aria-label="Close statistics">Close</button></header>
    <nav class="statistics-tabs" aria-label="Statistics views"><button type="button" data-tab="overview" aria-current="page">Overview</button><button type="button" data-tab="matchups">Matchups</button><button type="button" data-tab="history">History <span data-total></span></button><button type="button" data-tab="import" hidden>Import</button></nav>
    <form class="statistics-filters">
      <label>Character<select name="character"><option value="">All characters</option></select></label>
      <label>Opponent<select name="opponent"><option value="">All opponents</option></select></label>
      <label>Arena<select name="arena"><option value="">All arenas</option><option value="unknown">Unknown</option></select></label>
      <label>Mode<select name="mode"><option value="">All modes</option><option value="duel">Duel</option><option value="ffa">FFA</option><option value="series">Series</option><option value="tournament">Tournament</option><option value="unknown">Unknown</option></select></label>
      <details class="statistics-extra-filters"><summary>More filters</summary><div><label>From<input type="date" name="from"></label><label>Through<input type="date" name="to"></label><label>Source<select name="source"><option value="">All sources</option><option value="multiplayer">Live</option><option value="import">Imported</option></select></label><label>Commit<input name="commit" maxlength="64" placeholder="SHA prefix" pattern="[a-f0-9]{1,64}" list="statisticsCommits"><datalist id="statisticsCommits"></datalist></label></div></details>
      <div class="statistics-filter-actions"><button type="submit">Apply</button><button type="reset">Reset</button><span class="statistics-status" role="status" aria-live="polite"></span></div>
    </form>
    <section data-panel="overview"><div class="statistics-section-tools"><label class="statistics-metric">Stats <select data-metric>${Object.entries(STATS_GROUPS).map(([id, group]) => `<option value="${id}">${group.label}</option>`).join('')}</select></label></div><div class="statistics-scroll" data-aggregates></div></section>
    <section data-panel="matchups" hidden><div class="statistics-section-tools"><span class="statistics-note">Two-player battles</span></div><div class="statistics-scroll" data-matchups></div></section>
    <section data-panel="history" hidden><div class="statistics-history-heading"><span>Characters / winner ★</span><span>Arena / mode</span><span>Date</span><span>Duration</span><span></span></div><div data-history></div><div class="statistics-pagination"><button type="button" data-previous disabled>Previous</button><span data-page></span><button type="button" data-next disabled>Next</button></div></section>
    <section data-panel="import" hidden><div class="statistics-import-row"><label>CSV / XLSX<input type="file" accept=".csv,.xlsx" multiple data-files></label><button type="button" data-preview>Preview</button><button type="button" data-upload disabled>Import</button></div><p data-import-status role="status" aria-live="polite"></p><div class="statistics-scroll" data-import-preview></div></section>`;
  document.body.append(dialog);
  const element = <T extends HTMLElement>(selector: string) => dialog.querySelector<T>(selector)!;
  const form = element<HTMLFormElement>('form'); const status = element('.statistics-status');
  const paging = new HistoryPaging();
  let url = DEFAULT_STATS_URL; let params = new URLSearchParams(); let revision = 0; let pageBusy = false;
  let canImport = false; let canDelete = false;
  let stats: Stats | null = null; let importing: MatchRecord[] = []; let uploadBusy = false;
  function selectTab(tab: string): void {
    dialog.querySelectorAll<HTMLElement>('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== tab; });
    dialog.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => {
      if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
    });
    form.hidden = tab === 'import';
  }
  dialog.querySelectorAll<HTMLElement>('[data-tab]').forEach(button => button.addEventListener('click', () => selectTab(button.dataset.tab!)));
  async function get<T>(path: string): Promise<T> {
    const response = await fetch(`${url.replace(/\/$/, '')}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Statistics unavailable (HTTP ${response.status}).`);
    return response.json() as Promise<T>;
  }
  function renderAggregates(): void {
    if (!stats) return;
    const metrics = STATS_GROUPS[element<HTMLSelectElement>('[data-metric]').value as StatsGroup].metrics;
    element('[data-aggregates]').innerHTML = stats.aggregates.length ? `<table><thead><tr><th>Character</th><th>Games</th><th>Wins</th><th>Winrate</th>${metrics.map(metric => `<th>Avg ${escape(metricLabel(metric).toLowerCase().replace(/hp/g, 'HP'))}</th>`).join('')}</tr></thead><tbody>${stats.aggregates.map(row => {
      const averages = metrics.map(metric => {
        const value = row.metrics[metric];
        return `<td>${value?.count ? (value.sum / value.count).toFixed(2) : '—'}</td>`;
      }).join('');
      return `<tr><th>${characterLabel(row.character, row.name)}</th><td>${row.games}</td><td>${row.wins}</td><td>${percent(row.wins, row.games)}</td>${averages}</tr>`;
    }).join('')}</tbody></table>` : '<p class="statistics-empty">No matches.</p>';
    const names = new Map(stats.aggregates.map(row => [row.character, row.name]));
    element('[data-matchups]').innerHTML = stats.matchups.length ? `<table><thead><tr><th>Character</th><th>Opponent</th><th>Games</th><th>Wins</th><th>Winrate</th></tr></thead><tbody>${stats.matchups.map(row => `<tr><th>${characterLabel(row.character, names.get(row.character) ?? row.character)}</th><td>${characterLabel(row.opponent, names.get(row.opponent) ?? row.opponent)}</td><td>${row.games}</td><td>${row.wins}</td><td>${percent(row.wins, row.games)}</td></tr>`).join('')}</tbody></table>` : '<p class="statistics-empty">No matchups.</p>';
  }
  function pageParams(): URLSearchParams {
    const result = new URLSearchParams(params); result.set('limit', String(HISTORY_PAGE_SIZE));
    if (paging.cursor) result.set('cursor', paging.cursor);
    return result;
  }
  function renderPage(page: History): void {
    paging.nextCursor = page.nextCursor;
    element('[data-history]').innerHTML = historyRows(page.records, canDelete);
    const start = paging.index * HISTORY_PAGE_SIZE;
    element('[data-page]').textContent = page.records.length ? `${start + 1}–${start + page.records.length} / ${stats?.matches ?? '—'}` : '0 matches';
    element<HTMLButtonElement>('[data-previous]').disabled = pageBusy || paging.index === 0;
    element<HTMLButtonElement>('[data-next]').disabled = pageBusy || !paging.nextCursor;
  }
  async function loadPage(): Promise<boolean> {
    const current = revision;
    pageBusy = true;
    element<HTMLButtonElement>('[data-previous]').disabled = true; element<HTMLButtonElement>('[data-next]').disabled = true;
    try {
      const page = await get<History>(`/history?${pageParams()}`);
      if (current !== revision) return false;
      if (!page.records.length && paging.previous()) { pageBusy = false; return await loadPage(); }
      pageBusy = false; renderPage(page); status.textContent = '';
      return true;
    } catch (error) { if (current === revision) status.textContent = error instanceof Error ? error.message : 'Could not load history.'; return false; }
    finally {
      pageBusy = false;
      element<HTMLButtonElement>('[data-previous]').disabled = paging.index === 0;
      element<HTMLButtonElement>('[data-next]').disabled = !paging.nextCursor;
    }
  }
  async function movePage(forward: boolean): Promise<void> {
    if (pageBusy) return;
    const saved = paging.snapshot(); const current = revision;
    if (!(forward ? paging.next() : paging.previous())) return;
    if (!await loadPage() && current === revision) {
      paging.restore(saved);
      element<HTMLButtonElement>('[data-previous]').disabled = paging.index === 0;
      element<HTMLButtonElement>('[data-next]').disabled = !paging.nextCursor;
    }
  }
  async function refresh(resetPage = true): Promise<void> {
    const current = ++revision; status.textContent = 'Loading…';
    if (resetPage) paging.reset();
    params = new URLSearchParams();
    for (const [key, raw] of new FormData(form)) {
      const value = String(raw); if (!value) continue;
      if (key === 'from' || key === 'to') {
        const boundary = new Date(`${value}T00:00:00`); if (key === 'to') boundary.setDate(boundary.getDate() + 1);
        params.set(key, String(boundary.getTime() - (key === 'to' ? 1 : 0)));
      } else params.set(key, value);
    }
    try {
      const [newStats, history] = await Promise.all([get<Stats>(`/stats?${params}`), get<History>(`/history?${pageParams()}`)]);
      if (revision !== current) return;
      stats = newStats; element('[data-total]').textContent = String(stats.matches);
      renderAggregates(); renderPage(history);
      if (!history.records.length && paging.previous()) await loadPage();
      status.textContent = '';
    } catch (error) {
      if (revision !== current) return;
      stats = null; paging.reset();
      for (const selector of ['[data-history]', '[data-aggregates]', '[data-matchups]']) element(selector).innerHTML = '';
      element('[data-total]').textContent = ''; element('[data-page]').textContent = '';
      element<HTMLButtonElement>('[data-previous]').disabled = true; element<HTMLButtonElement>('[data-next]').disabled = true;
      status.textContent = error instanceof Error ? error.message : 'Could not load statistics.';
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
    select.innerHTML = '<option value="">All arenas</option><option value="unknown">Unknown</option>' + options.arenas.map(a => `<option value="${escape(a.arena)}">${escape(arenaLabel(a.arena))}</option>`).join(''); select.value = selected;
    element('datalist').innerHTML = options.commits.map(c => `<option value="${escape(c.sha)}">${escape(c.sha.slice(0, 10))}${c.dirty ? ' (modified)' : ''}</option>`).join('');
  }
  button.addEventListener('click', async () => {
    if (!dialog.open) dialog.showModal();
    status.textContent = 'Loading…'; canImport = false; canDelete = false;
    try {
      const response = await fetch('/api/stats-config', { signal: AbortSignal.timeout(3000) });
      if (response.ok) {
        const config = await response.json() as { url?: string; canImport?: boolean; canDelete?: boolean };
        if (config.url) url = config.url; canImport = config.canImport === true; canDelete = config.canDelete === true;
      }
    } catch { /* Static/tunnel hosts retain public reporting, with no management credentials. */ }
    element('[data-tab="import"]').hidden = !canImport;
    if (!canImport && !element('[data-panel="import"]').hidden) selectTab('history');
    void loadOptions().catch(() => {}); await refresh();
  });
  element('[data-close]').addEventListener('click', () => dialog.close());
  mountHistoryDeletion(element('[data-history]'), () => canDelete, async () => { await refresh(false); void loadOptions().catch(() => {}); });
  form.addEventListener('submit', event => { event.preventDefault(); void refresh(); });
  form.addEventListener('reset', () => queueMicrotask(() => void refresh()));
  element('[data-metric]').addEventListener('change', renderAggregates);
  element('[data-next]').addEventListener('click', () => void movePage(true));
  element('[data-previous]').addEventListener('click', () => void movePage(false));
  element('[data-preview]').addEventListener('click', async () => {
    if (uploadBusy || !canImport) return;
    importing = []; element<HTMLButtonElement>('[data-upload]').disabled = true;
    const importStatus = element('[data-import-status]'); importStatus.textContent = 'Reading…'; element('[data-import-preview]').innerHTML = '';
    try {
      const files = Array.from(element<HTMLInputElement>('[data-files]').files ?? []);
      if (!files.length) throw new Error('Choose files.'); if (files.length > 100) throw new Error('Up to 100 files per import.');
      const records: MatchRecord[] = []; for (const file of files) records.push(...await readHistoryFile(file));
      importing = [...new Map(records.map(record => [record.id, record])).values()];
      element('[data-import-preview]').innerHTML = importing.map(record => `<details class="statistics-import-record"><summary>${escape(record.importFile)} · ${record.participants.map(p => characterLabel(p.character, p.characterName)).join(' vs ')}</summary><div class="statistics-scroll">${participantTable(record)}</div></details>`).join('');
      importStatus.textContent = `${importing.length} matches · ${records.length - importing.length} duplicates. Dates will remain unknown. Import only multiplayer battles.`;
      element<HTMLButtonElement>('[data-upload]').disabled = !importing.length;
    } catch (error) { importing = []; importStatus.textContent = error instanceof Error ? error.message : 'Could not read files.'; }
  });
  element('[data-upload]').addEventListener('click', async () => {
    if (uploadBusy || !importing.length || !canImport) return;
    const importStatus = element('[data-import-status]');
    uploadBusy = true; element<HTMLButtonElement>('[data-upload]').disabled = true; element<HTMLButtonElement>('[data-preview]').disabled = true;
    let inserted = 0; let duplicates = 0;
    try {
      for (const record of importing) {
        const response = await fetch('/api/stats-management/imports', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gridfall-Management': '1' }, body: JSON.stringify(record), signal: AbortSignal.timeout(20_000) });
        if (!response.ok) throw new Error(`Import failed (HTTP ${response.status}). Check the host configuration; retry is safe.`);
        const receipt = await response.json() as { duplicate: boolean; deleted?: boolean };
        if (receipt.deleted) throw new Error('This summary was deleted and cannot be reimported.');
        if (receipt.duplicate) duplicates++; else inserted++;
        importStatus.textContent = `${inserted} imported · ${duplicates} duplicates…`;
      }
      importStatus.textContent = `${inserted} imported · ${duplicates} already present.`; importing = [];
      await loadOptions(); await refresh();
    } catch (error) { importStatus.textContent = `${inserted} imported · ${duplicates} duplicates. ${error instanceof Error ? error.message : 'Import failed.'}`; }
    finally { uploadBusy = false; element<HTMLButtonElement>('[data-upload]').disabled = !importing.length; element<HTMLButtonElement>('[data-preview]').disabled = false; }
  });
  return dialog;
}
