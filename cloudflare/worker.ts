import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import { MatchRecordSchema, type MatchRecord } from '../shared/match-history.ts';

type Env = { DB: D1Database; WRITE_KEY: string; IMPORT_KEY: string };
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' };
function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { ...cors, 'Cache-Control': 'no-store' } });
}
async function authorized(request: Request, key: string | undefined): Promise<boolean> {
  if (!key || key.length < 32) return false;
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '';
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(token), digest(key)]);
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
function where(url: URL): { sql: string; values: (string | number)[]; participant: string; participantValues: string[] } {
  const clauses: string[] = []; const values: (string | number)[] = [];
  for (const [param, column] of [['arena', 'arena'], ['mode', 'mode'], ['source', 'source']] as const) {
    const value = url.searchParams.get(param); if (value) {
      if (value === 'unknown' && param !== 'source') clauses.push(`m.${column} IS NULL`);
      else { clauses.push(`m.${column} = ?`); values.push(value); }
    }
  }
  for (const [param, operation] of [['from', '>='], ['to', '<=']] as const) {
    const value = url.searchParams.get(param);
    if (value !== null) {
      if (!/^\d{1,16}$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid date filter');
      clauses.push(`m.ended_at ${operation} ?`); values.push(Number(value));
    }
  }
  const commit = url.searchParams.get('commit');
  if (commit) {
    if (!/^[a-f0-9]{1,64}$/.test(commit)) throw new Error('Invalid commit filter');
    clauses.push('m.commit_sha LIKE ?'); values.push(`${commit}%`);
  }
  const participant: string[] = []; const participantValues: string[] = [];
  const character = url.searchParams.get('character'); const opponent = url.searchParams.get('opponent');
  if (character) { participant.push('p.character = ?'); participantValues.push(character); }
  if (opponent) {
    participant.push('EXISTS (SELECT 1 FROM participants opponent WHERE opponent.match_id = p.match_id AND opponent.seat <> p.seat AND opponent.character = ?)');
    participantValues.push(opponent);
  }
  if (participant.length) { clauses.push(`EXISTS (SELECT 1 FROM participants p WHERE p.match_id = m.id AND ${participant.join(' AND ')})`); values.push(...participantValues); }
  return { sql: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', values,
    participant: participant.length ? ` AND ${participant.join(' AND ')}` : '', participantValues };
}
function insertStatements(db: D1Database, record: MatchRecord, receivedAt: number): D1PreparedStatement[] {
  return [
    db.prepare(`INSERT INTO matches(id, schema_version, source, started_at, ended_at, arena, mode, commit_sha, received_at, record_json)
      VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
      .bind(record.id, record.schemaVersion, record.source, record.startedAt, record.endedAt, record.arena, record.mode, record.commit, receivedAt, JSON.stringify(record)),
    ...record.participants.map(p => db.prepare(`INSERT INTO participants(match_id, seat, character, character_name, result, metrics_json)
      SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM matches WHERE id = ? AND record_json = ?)
      ON CONFLICT(match_id, seat) DO NOTHING`)
      .bind(record.id, p.seat, p.character, p.characterName, p.result, JSON.stringify(p.metrics), record.id, JSON.stringify(record))),
  ];
}
function sameRecord(stored: string, record: MatchRecord): boolean {
  if (record.source !== 'import') return stored === JSON.stringify(record);
  // Provenance keeps the first filename; renaming a legacy file cannot duplicate a match.
  const prior = JSON.parse(stored) as MatchRecord;
  return JSON.stringify({ ...prior, importFile: null }) === JSON.stringify({ ...record, importFile: null });
}
async function limitedBody(request: Request): Promise<unknown> {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('Expected application/json');
  if (Number(request.headers.get('Content-Length')) > 128_000) throw new Error('Request too large');
  if (!request.body) throw new Error('Missing body');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > 128_000) { await reader.cancel(); throw new Error('Request too large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(all));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        await env.DB.prepare('SELECT 1 FROM matches LIMIT 1').all();
        return json({ ok: true, schemaVersion: 1 });
      }
      if (request.method === 'POST' && (url.pathname === '/matches' || url.pathname === '/imports')) {
        const importing = url.pathname === '/imports';
        if (!await authorized(request, importing ? env.IMPORT_KEY : env.WRITE_KEY)) return json({ error: 'Unauthorized' }, 401);
        let record: MatchRecord;
        try {
          record = MatchRecordSchema.parse(await limitedBody(request));
          if (record.source !== (importing ? 'import' : 'multiplayer')) throw new Error('Wrong record source');
        } catch { return json({ error: 'Invalid match record. Check schema, source and dates.' }, 400); }
        // Reject reuse of an ID with different data, while accepting safe retries.
        const prior = await env.DB.prepare('SELECT record_json FROM matches WHERE id = ?').bind(record.id).first<{ record_json: string }>();
        if (prior && !sameRecord(prior.record_json, record)) return json({ error: 'Match ID already contains different data' }, 409);
        if (!prior) await env.DB.batch(insertStatements(env.DB, record, Date.now()));
        // The unique constraint also protects races between retries from multiple clients.
        const stored = await env.DB.prepare('SELECT record_json FROM matches WHERE id = ?').bind(record.id).first<{ record_json: string }>();
        if (!stored || !sameRecord(stored.record_json, record)) return json({ error: 'Match ID conflict' }, 409);
        return json({ id: record.id, duplicate: Boolean(prior) }, prior ? 200 : 201);
      }
      if (request.method === 'GET' && url.pathname === '/history') {
        let filter: ReturnType<typeof where>;
        try { filter = where(url); } catch { return json({ error: 'Invalid filters' }, 400); }
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50));
        const rawCursor = url.searchParams.get('cursor');
        if (rawCursor && !/^\d{1,15}$/.test(rawCursor)) return json({ error: 'Invalid cursor' }, 400);
        const cursor = rawCursor ? Number(rawCursor) : Number.MAX_SAFE_INTEGER;
        const rows = await env.DB.prepare(`SELECT m.sequence, m.received_at, m.record_json FROM matches m WHERE m.sequence < ?${filter.sql} ORDER BY m.sequence DESC LIMIT ?`)
          .bind(cursor, ...filter.values, limit + 1).all<{ sequence: number; received_at: number; record_json: string }>();
        const page = rows.results.slice(0, limit);
        return json({ records: page.map(r => ({ ...JSON.parse(r.record_json), receivedAt: r.received_at })),
          nextCursor: rows.results.length > limit ? String(page.at(-1)!.sequence) : null });
      }
      if (request.method === 'GET' && url.pathname === '/stats') {
        let filter: ReturnType<typeof where>;
        try { filter = where(url); } catch { return json({ error: 'Invalid filters' }, 400); }
        const binding = [...filter.values, ...filter.participantValues];
        const results = await env.DB.batch([
          env.DB.prepare(`SELECT COUNT(*) AS matches FROM matches m WHERE 1=1${filter.sql}`).bind(...filter.values),
          env.DB.prepare(`SELECT p.character, MAX(p.character_name) AS name, COUNT(*) AS games, SUM(p.result = 'winner') AS wins
            FROM participants p JOIN matches m ON m.id=p.match_id WHERE 1=1${filter.sql}${filter.participant} GROUP BY p.character ORDER BY games DESC`).bind(...binding),
          env.DB.prepare(`SELECT p.character, metric.key AS metric, SUM(metric.value) AS sum, COUNT(*) AS count
            FROM participants p JOIN matches m ON m.id=p.match_id, json_each(p.metrics_json) metric
            WHERE metric.type IN ('integer','real')${filter.sql}${filter.participant} GROUP BY p.character, metric.key`).bind(...binding),
          env.DB.prepare(`SELECT p.character, opponent.character AS opponent, COUNT(*) AS games, SUM(p.result = 'winner') AS wins
            FROM participants p JOIN matches m ON m.id=p.match_id JOIN participants opponent ON opponent.match_id=p.match_id AND opponent.seat<>p.seat
            WHERE (SELECT COUNT(*) FROM participants n WHERE n.match_id=m.id)=2${filter.sql}${filter.participant}
            ${url.searchParams.get('opponent') ? 'AND opponent.character = ?' : ''} GROUP BY p.character, opponent.character ORDER BY games DESC`)
            .bind(...binding, ...(url.searchParams.get('opponent') ? [url.searchParams.get('opponent')!] : [])),
        ]);
        const aggregates = (results[1].results as { character: string; name: string; games: number; wins: number }[]).map(row => ({ ...row, metrics: {} as Record<string, { sum: number; count: number }> }));
        for (const metric of results[2].results as { character: string; metric: string; sum: number; count: number }[]) {
          const row = aggregates.find(row => row.character === metric.character);
          if (row) row.metrics[metric.metric] = { sum: metric.sum, count: metric.count };
        }
        return json({ matches: (results[0].results[0] as { matches: number }).matches, aggregates, matchups: results[3].results });
      }
      if (request.method === 'GET' && url.pathname === '/options') {
        const results = await env.DB.batch([
          env.DB.prepare('SELECT DISTINCT character, character_name AS name FROM participants ORDER BY character'),
          env.DB.prepare('SELECT DISTINCT arena FROM matches WHERE arena IS NOT NULL ORDER BY arena'),
          env.DB.prepare('SELECT DISTINCT commit_sha AS sha, json_extract(record_json, \'$.dirty\') AS dirty FROM matches WHERE commit_sha IS NOT NULL ORDER BY sequence DESC LIMIT 100'),
        ]);
        return json({ characters: results[0].results, arenas: results[1].results, commits: results[2].results });
      }
      return json({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('History API error:', error instanceof Error ? error.message : 'Unknown error');
      return json({ error: 'Statistics temporarily unavailable' }, 503);
    }
  },
};
