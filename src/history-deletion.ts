// Event delegation covers history pages added later and keeps management outside the reporting UI.
export function mountHistoryDeletion(root: HTMLElement, canDelete: () => boolean, refresh: () => Promise<void>): void {
  root.addEventListener('click', async event => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>('[data-delete-action]');
    if (!button || !root.contains(button)) return;
    event.preventDefault();
    const controls = button.closest<HTMLElement>('[data-delete-match]')!;
    const confirmation = controls.querySelector<HTMLElement>('[data-delete-confirmation]')!;
    const status = controls.querySelector<HTMLElement>('[data-delete-status]')!;
    if (button.dataset.deleteAction === 'start') { (controls as HTMLDetailsElement).open = true; confirmation.hidden = false; return; }
    if (button.dataset.deleteAction === 'cancel') { confirmation.hidden = true; return; }
    if (!canDelete()) { status.textContent = 'Open the game on the host at localhost to manage history.'; return; }
    const buttons = controls.querySelectorAll<HTMLButtonElement>('button');
    buttons.forEach(button => { button.disabled = true; }); status.textContent = 'Removing match…';
    try {
      const response = await fetch(`/api/stats-management/matches/${encodeURIComponent(controls.dataset.deleteMatch!)}`, {
        method: 'DELETE', headers: { 'X-Gridfall-Management': '1' }, signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`Could not delete match (HTTP ${response.status}). Check the host configuration; retry is safe.`);
      await refresh();
    } catch (error) { status.textContent = error instanceof Error ? error.message : 'Could not delete match. Retry is safe.'; }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  });
}
