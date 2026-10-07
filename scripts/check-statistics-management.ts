import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { request as httpRequest } from 'node:http';
import { managementCapabilities, statsManagementRouter } from '../server/stats-management.ts';
import { HISTORY_PAGE_SIZE, HistoryPaging } from '../src/history-paging.ts';

const config = { url: 'https://stats.example', adminKey: 'a'.repeat(64), importKey: 'i'.repeat(64) };
const calls: { url: string; options: RequestInit }[] = [];
const app = express();
app.get('/api/stats-config', (request, response) => response.json({ url: config.url, ...managementCapabilities(request, config) }));
app.use('/api/stats-management', statsManagementRouter(config, async (url, options) => {
  calls.push({ url: String(url), options: options! });
  return Response.json({ id: 'battle:1', duplicate: false, deleted: true, unexpectedSecret: config.adminKey });
}));
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
// Native HTTP preserves an explicitly spoofed Host header (fetch may replace it).
function fetch(url: string, options: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: options.method, headers: options.headers, agent: false }, response => {
      const chunks: Buffer[] = []; response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(new Response(Buffer.concat(chunks).toString('utf8'), { status: response.statusCode })));
    });
    request.on('error', reject); request.setTimeout(10_000, () => request.destroy(new Error('HTTP check timed out')));
    if (options.body) request.write(options.body); request.end();
  });
}
try {
  const capabilities = await (await fetch(`${origin}/api/stats-config`)).json();
  assert.equal(capabilities.canImport, true); assert.equal(capabilities.canDelete, true);
  assert.ok(!JSON.stringify(capabilities).includes(config.adminKey)); assert.ok(!JSON.stringify(capabilities).includes(config.importKey));
  const tunnel = await (await fetch(`${origin}/api/stats-config`, { headers: { Host: 'game.trycloudflare.com' } })).json();
  assert.equal(tunnel.canImport, false); assert.equal(tunnel.canDelete, false);
  const forwarded = await (await fetch(`${origin}/api/stats-config`, { headers: { 'CF-Connecting-IP': '1.2.3.4' } })).json();
  assert.equal(forwarded.canDelete, false, 'Tunnel connection over loopback is not a local administrator');
  const headers = { Origin: origin, 'X-Gridfall-Management': '1' };
  const route = `${origin}/api/stats-management/matches/battle%3A1`;
  for (const rejected of [{}, { ...headers, Origin: 'https://attacker.example' }, { ...headers, Host: 'game.trycloudflare.com' },
    { ...headers, 'CF-Ray': 'tunnel' }, { ...headers, 'X-Forwarded-For': '1.2.3.4' }, { ...headers, 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await fetch(route, { method: 'DELETE', headers: rejected })).status, 403);
  }
  assert.equal(calls.length, 0, 'Blocked requests must never reach the privileged API');
  const deleted = await fetch(route, { method: 'DELETE', headers });
  assert.equal(deleted.status, 200);
  const receipt = await deleted.text(); assert.ok(!receipt.includes(config.adminKey)); assert.ok(!receipt.includes('unexpectedSecret'));
  assert.equal(calls[0].url, 'https://stats.example/matches/battle%3A1');
  assert.equal((calls[0].options.headers as Record<string, string>).Authorization, `Bearer ${config.adminKey}`);
  const imported = await fetch(`${origin}/api/stats-management/imports`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'import:1' }) });
  assert.equal(imported.status, 200);
  assert.equal((calls[1].options.headers as Record<string, string>).Authorization, `Bearer ${config.importKey}`);
  assert.equal(calls[1].options.body, JSON.stringify({ id: 'import:1' }));
  assert.equal((await fetch(`${origin}/api/stats-management/matches/invalid%2Fid`, { method: 'DELETE', headers })).status, 400);
  const paging = new HistoryPaging(); assert.equal(HISTORY_PAGE_SIZE, 20); assert.equal(paging.previous(), false);
  paging.nextCursor = '80'; assert.equal(paging.next(), true); assert.equal(paging.cursor, '80'); assert.equal(paging.index, 1);
  paging.nextCursor = '60'; paging.next(); assert.equal(paging.cursor, '60');
  paging.previous(); assert.equal(paging.cursor, '80'); paging.nextCursor = '60';
  const saved = paging.snapshot(); paging.next(); paging.restore(saved);
  assert.equal(paging.cursor, '80'); assert.equal(paging.nextCursor, '60', 'Failed page requests retain a retryable next cursor');
  paging.reset(); assert.equal(paging.cursor, null); assert.equal(paging.index, 0);
} finally { await new Promise<void>(resolve => server.close(() => resolve())); }
console.log('Statistics management checks passed: local automatic credentials, blocked tunnel/CSRF requests, separate privileges, secret-free receipts and pagination.');
