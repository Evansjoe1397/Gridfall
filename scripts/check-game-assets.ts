import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { once } from 'node:events';
import { get } from 'node:http';
import express from 'express';
import { assetsForScene, GAME_ASSET_PATHS } from '../src/game-asset-catalog.ts';
import { gameAssetsPlugin } from '../build/game-assets-plugin.ts';
import { MatchLoading } from '../server/match-loading.ts';
import { serveClient } from '../server/serve-client.ts';

assert.deepEqual(assetsForScene(undefined, []), [], 'Menu/statistics must not download gameplay assets');
const shinobi = assetsForScene(undefined, ['shinobi']);
assert.deepEqual(shinobi, ['models/obi-wan-optimized.glb', 'models/obi-wan-meditation.glb']);
const match = assetsForScene('trench', ['john-christ', 'orkk', 'orkk']);
assert.equal(match.length, new Set(match).size);
assert.ok(match.includes('models/john-christ-spirit.glb'), 'Transformations are prepared before a match');
assert.ok(match.includes('textures/trench/F5.png'));
assert.ok(!match.some(path => /lordaeron|nagrand|merylin|moonlight/.test(path)), 'Match loading excludes unrelated resources');
for (const arena of ['nagrand', 'trench', 'lordaeron', 'pipe']) {
  for (const character of ['magician', 'orkk', 'shinobi', 'spectre', 'john-christ', 'merylin', 'wreckna', 'kazka', 'fyrebanks', 'dummy']) {
    for (const path of assetsForScene(arena, [character])) assert.ok(GAME_ASSET_PATHS.includes(path), `Missing build manifest entry: ${path}`);
  }
}

const loading = new MatchLoading();
assert.ok(loading.prepare('nagrand:1', ['P1', 'P2']));
const first = loading.snapshot().token;
assert.ok(loading.blocked);
assert.equal(loading.acknowledge(first, 'P3'), false, 'Unseated acknowledgements cannot unlock a match');
assert.ok(loading.acknowledge(first, 'P1'));
assert.ok(loading.blocked, 'First ready player must wait for the second');
assert.equal(loading.acknowledge(first, 'P1'), false);
assert.ok(loading.acknowledge(first, 'P2'));
assert.equal(loading.blocked, false);
assert.equal(loading.prepare('nagrand:1', ['P1', 'P2']), false, 'State broadcasts/reconnection must not restart loading');
assert.ok(loading.prepare('trench:2', ['P1', 'P2']));
assert.equal(loading.acknowledge(first, 'P1'), false, 'Late acknowledgements cannot unlock the next match');
assert.ok(loading.acknowledge(loading.snapshot().token, 'P1'));
assert.ok(loading.remove('P2'));
assert.equal(loading.blocked, false);

// Exercise the actual build hook and production static middleware, without a browser.
const plugin = gameAssetsPlugin();
const config = await (plugin.config as Function)({}, { command: 'build' });
const manifest = JSON.parse(config.define.__GRIDFALL_ASSETS__) as Record<string, { url: string; bytes: number }>;
for (const [path, entry] of Object.entries(manifest)) {
  const original = readFileSync(`public/${path}`);
  const output = readFileSync(`dist/${entry.url}`);
  assert.deepEqual(output, original, `Rebuild required for ${path}`);
  assert.equal(entry.bytes, original.length);
  assert.ok(entry.url.includes(createHash('sha256').update(original).digest('hex').slice(0, 16)), 'URL must change with asset content');
  assert.equal(existsSync(`dist/${path}`), false, 'Build must not ship duplicate unversioned gameplay assets');
}
assert.equal(existsSync('dist/models/da-orkh.glb'), false, 'Unused source models must not enter the production bundle');
const app = express();
serveClient(app);
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');
try {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const resource = Object.values(manifest).find(entry => entry.bytes < 100_000)!;
  const response = await fetch(`${origin}/${resource.url}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control')!, /max-age=31536000/);
  assert.match(response.headers.get('cache-control')!, /immutable/);
  assert.equal((await response.arrayBuffer()).byteLength, resource.bytes);
  // Native HTTP avoids fetch adding Cache-Control:no-cache to conditional requests.
  const conditionalStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(`${origin}/${resource.url}`, { headers: { 'If-None-Match': response.headers.get('etag')! } }, result => {
      result.resume();
      result.on('end', () => resolve(result.statusCode));
    }).on('error', reject);
  });
  assert.equal(conditionalStatus, 304);
  const index = await fetch(origin);
  assert.equal(index.status, 200);
  assert.doesNotMatch(index.headers.get('cache-control') ?? '', /immutable/);
  assert.match(await index.text(), /assetLoading/);
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
console.log('Asset checks passed: scoped preparation, transformation resources, multiplayer ready barrier, build hashes and HTTP caching.');
