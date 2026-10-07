import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Keep secrets out of shell arguments and command output. Preserve unrelated .env entries.
if (existsSync('.env')) process.loadEnvFile('.env');
const writeKey = process.env.GRIDFALL_STATS_WRITE_KEY || randomBytes(32).toString('hex');
const importKey = process.env.GRIDFALL_STATS_IMPORT_KEY || randomBytes(32).toString('hex');
const adminKey = process.env.GRIDFALL_STATS_ADMIN_KEY || randomBytes(32).toString('hex');
if ([writeKey, importKey, adminKey].some(key => key.length < 32) || new Set([writeKey, importKey, adminKey]).size !== 3) throw new Error('Use different keys, each at least 32 characters long');
execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'secret', 'bulk', '--config', 'cloudflare/wrangler.jsonc'], {
  input: JSON.stringify({ WRITE_KEY: writeKey, IMPORT_KEY: importKey, ADMIN_KEY: adminKey }), stdio: ['pipe', 'inherit', 'inherit'],
});
let contents = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
for (const [name, value] of Object.entries({ GRIDFALL_STATS_WRITE_KEY: writeKey, GRIDFALL_STATS_IMPORT_KEY: importKey, GRIDFALL_STATS_ADMIN_KEY: adminKey })) {
  const assignment = `${name}=${JSON.stringify(value)}`;
  const expression = new RegExp(`^${name}=.*$`, 'm');
  contents = expression.test(contents) ? contents.replace(expression, assignment) : `${contents.trimEnd()}\n${assignment}\n`;
}
writeFileSync('.env', contents.trimStart(), { mode: 0o600, flush: true });
console.log('Keys configured in Cloudflare and local .env. Share only GRIDFALL_STATS_WRITE_KEY with trusted game hosts.');
