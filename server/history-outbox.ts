import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { MatchRecordSchema, type MatchRecord } from '../shared/match-history.ts';

export function buildIdentity(): { commit: string | null; dirty: boolean | null } {
  const supplied = process.env.GRIDFALL_COMMIT ?? process.env.RENDER_GIT_COMMIT;
  if (supplied && /^[a-f0-9]{40,64}$/.test(supplied)) return { commit: supplied, dirty: null };
  try {
    return { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      dirty: Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim()) };
  } catch { return { commit: null, dirty: null }; }
}

export class HistoryOutbox {
  readonly hostId: string;
  private sending = false;
  private lastWarning = 0;
  constructor(private directory: string, private url: string, private key: string, private send: typeof fetch = fetch) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true });
    const hostFile = join(this.directory, 'host-id');
    this.hostId = existsSync(hostFile) ? readFileSync(hostFile, 'utf8').trim() : randomUUID();
    if (!existsSync(hostFile)) writeFileSync(hostFile, this.hostId, { mode: 0o600 });
  }
  enqueue(record: MatchRecord): void {
    const parsed = MatchRecordSchema.parse(record);
    const filename = join(this.directory, `${parsed.id.replaceAll(':', '_')}.json`);
    if (existsSync(filename)) return;
    const temporary = `${filename}.tmp`;
    writeFileSync(temporary, JSON.stringify(parsed), { mode: 0o600, flush: true });
    renameSync(temporary, filename);
  }
  start(): void {
    if (!this.url || !this.key) console.warn('Match history: completed multiplayer matches will queue locally until GRIDFALL_STATS_URL and GRIDFALL_STATS_WRITE_KEY are configured.');
    const timer = setInterval(() => void this.flush(), 30_000);
    timer.unref();
    void this.flush();
  }
  async flush(): Promise<void> {
    if (this.sending || !this.url || !this.key) return;
    this.sending = true;
    try {
      for (const name of readdirSync(this.directory).filter(name => name.endsWith('.json')).sort().slice(0, 50)) {
        const file = join(this.directory, name);
        let record: MatchRecord;
        try { record = MatchRecordSchema.parse(JSON.parse(readFileSync(file, 'utf8'))); }
        catch { this.warn(`Invalid queued match file: ${name}; retained for recovery.`); continue; }
        const response = await this.send(`${this.url.replace(/\/$/, '')}/matches`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.key}` },
          body: JSON.stringify(record), signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) { this.warn(`Upload returned HTTP ${response.status}; matches remain queued.`); break; }
        const receipt = await response.json() as { id?: string };
        if (receipt.id !== record.id) { this.warn('Invalid upload receipt; match remains queued.'); break; }
        unlinkSync(file);
      }
    } catch { this.warn('Upload unavailable; completed matches remain queued for retry.'); }
    finally { this.sending = false; }
  }
  private warn(message: string): void {
    if (Date.now() - this.lastWarning < 60_000) return;
    this.lastWarning = Date.now(); console.warn(`Match history: ${message}`);
  }
}
