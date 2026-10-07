import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DEFAULT_STATS_URL } from '../shared/stats-config.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const base = (process.env.GRIDFALL_STATS_URL || DEFAULT_STATS_URL).replace(/\/$/, '');
const get = async (path: string) => {
  const response = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${path} must be publicly readable`);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
  return response.json();
};
assert.equal((await get('/health')).ok, true);
const report = await get('/stats'); assert.equal(typeof report.matches, 'number');
assert.ok(Array.isArray((await get('/history')).records));
assert.ok(Array.isArray((await get('/options')).characters));
const postInvalid = (path: string, key?: string) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) }, body: '{}', signal: AbortSignal.timeout(15_000) });
assert.equal((await postInvalid('/matches')).status, 401);
assert.equal((await postInvalid('/imports')).status, 401);
if (process.env.GRIDFALL_STATS_WRITE_KEY) {
  assert.equal((await postInvalid('/matches', process.env.GRIDFALL_STATS_WRITE_KEY)).status, 400, 'Configured host key must authorize validation');
  assert.equal((await postInvalid('/imports', process.env.GRIDFALL_STATS_WRITE_KEY)).status, 401, 'Host key must not authorize import');
}
if (process.env.GRIDFALL_STATS_IMPORT_KEY) {
  assert.equal((await postInvalid('/imports', process.env.GRIDFALL_STATS_IMPORT_KEY)).status, 400, 'Configured import key must authorize validation');
}
const preflight = await fetch(`${base}/imports`, { method: 'OPTIONS', headers: { Origin: 'https://example.trycloudflare.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' }, signal: AbortSignal.timeout(15_000) });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
assert.ok(preflight.headers.get('Access-Control-Allow-Methods')?.includes('DELETE'));
const deleteMissing = (key?: string) => fetch(`${base}/matches/verification-missing-${crypto.randomUUID()}`, {
  method: 'DELETE', headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: AbortSignal.timeout(15_000),
});
assert.equal((await deleteMissing()).status, 401);
if (process.env.GRIDFALL_STATS_WRITE_KEY) assert.equal((await deleteMissing(process.env.GRIDFALL_STATS_WRITE_KEY)).status, 401);
if (process.env.GRIDFALL_STATS_IMPORT_KEY) assert.equal((await deleteMissing(process.env.GRIDFALL_STATS_IMPORT_KEY)).status, 401);
if (process.env.GRIDFALL_STATS_ADMIN_KEY) assert.equal((await deleteMissing(process.env.GRIDFALL_STATS_ADMIN_KEY)).status, 404, 'Admin key authorizes deletion lookup; no real match is deleted');
console.log(`Central statistics API verified: health, public reports/history, authentication and cross-origin requests. ${report.matches} stored matches. No test records were inserted.`);
