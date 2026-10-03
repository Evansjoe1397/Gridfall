export function formatSummaryDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return 'Unavailable';
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s`;
}

export function elapsedSummaryDuration(startedAt: number | undefined, endedAt: number | undefined): number | undefined {
  return startedAt !== undefined && endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined;
}
