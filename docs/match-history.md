# Multiplayer match history

Central storage uses Cloudflare Workers + D1. Reading is public. Writes require a server key; legacy imports require a different import key. Cloudflare Tunnel and the game server's location do not affect the central address.

Current API: https://gridfall-statistics.arigusee.workers.dev (`/health`, `/stats`, `/history`, `/options`).

## Game integration

Only `DuelRoom` saves results. Hotseat never calls the history collector. When a multiplayer battle reaches `finished`, its record is written to a disk outbox before broadcasting the state. Each battle has a session UUID and battle number, including individual battles in a best-of-three/tournament. The next battle and unfinished series do not delay or cancel saving a completed battle.

The server retries uploads immediately and every 30 seconds, resumes after restart, and deletes a queued file only after a matching API receipt. Cloudflare stores immutable match IDs; identical retries return success and conflicting records return HTTP 409. Queue failures log a warning and preserve files. Keep `.gridfall-history` on a persistent disk on cloud hosts: ephemeral disks cannot preserve unsent records when an instance is destroyed.

The repository includes the public default API URL in `shared/stats-config.ts`. Hosts only need a `.env` with `GRIDFALL_STATS_WRITE_KEY`. `GRIDFALL_STATS_URL` can override the default; `GRIDFALL_STATS_OUTBOX` can select a persistent folder. Secrets never use `VITE_*`, are never included in the client bundle, and `/api/stats-config` returns only the public URL. Node must support `process.loadEnvFile` (Node 22+ recommended).

The Statistics button opens history, server-side aggregates and two-player matchups. Filters cover dates, arena, mode, characters/opponent, commit and imported/live source. Date filters exclude unknown dates. Winrate counts character appearances; mirror matches count both seats. Two-player matchup reports exclude FFA. Metric averages show coverage and exclude unknown values.

## Data and future metrics

Every record contains schema version, match ID, source, start/end timestamps in UTC milliseconds, duration, rounds, arena, mode, series ID/battle number, server Git commit, working-tree dirty flag and persistent random host ID. D1 assigns `receivedAt` separately; it is never used as the date of an imported battle. Seat IDs are local to a match and do not identify a human across servers.

Per participant: character ID/name, outcome, all current match counters, final/max HP, and actual HP damage taken from recorded damage events (including self/environment damage; HP payments are not damage). `totalDamage` matches the result table and old CSV: attack + perk + retaliation. `creditedDamage` separately preserves the broader internal counter, which can also include other attributed damage; old CSV cannot recover this counter. The dirty flag distinguishes modified checkouts from the clean commit; deployed hosts can set `GRIDFALL_COMMIT` (or Render supplies `RENDER_GIT_COMMIT`), in which case working-tree state is unknown.

Optional metrics live in a JSON object rather than mandatory SQL columns. Add a stable numeric key and label in `shared/match-history.ts`, collect it in `server/match-record.ts`, and extend checks. Old rows stay untouched. Missing/explicit-null metrics mean **unknown**; zero means measured zero. SQL `json_each` only averages numeric entries and reports their count. Do not change a metric's meaning under the same key: introduce a new key. Breaking envelope changes require a new schema reader and migration; additive optional metrics do not.

New columns that could be useful later include attack/defense card counts, individual perk usage, quest completions, and actual turns taken per seat. These need dedicated gameplay instrumentation (and undo handling); they cannot reliably be inferred from end HP or the final deck. Current end summaries do not identify human players.

## Legacy import

Statistics → Import old summaries accepts current Gridfall CSV exports and XLSX files with the same exported rows on individual worksheets. ExcelJS loads on demand only for XLSX. First select files and preview; then enter `GRIDFALL_STATS_IMPORT_KEY` from your local `.env` and upload. The browser keeps the key in memory and clears the input on close/success. Do not share the import key with ordinary players.

Imported records have `source=import`, file/sheet provenance, and **null start/end dates, duration, commit, arena, and series information**. Known character names map to stable IDs. Three participants imply FFA; two-player legacy mode remains unknown because a CSV cannot distinguish a duel from a series battle. Present metrics and rounds are preserved; absent fields are not fabricated. Additional numeric CSV columns remain available in match details as `legacy.*` metrics.

Import IDs are SHA-256 hashes of normalized exported content. Reimporting the same file, renamed copies, and duplicate worksheets are safe. Two genuinely separate matches with exactly identical old summaries are indistinguishable because legacy CSV contains no match ID; the preview explains this limitation. Old CSV also does not identify hotseat versus multiplayer: select only known completed multiplayer summaries. Formula cells are rejected: import exported values, not calculated worksheets. An old summary only recovers the battles actually present in that file.

## Cloudflare administration

1. `npx wrangler login`
2. If configuring another account, create a D1 database and update `cloudflare/wrangler.jsonc` with its ID.
3. `npm run stats:migrate`
4. `npm run stats:deploy`
5. `npx tsx scripts/configure-stats-secrets.ts` sets separate keys and stores them in local `.env` without printing them.

For local Worker development: apply the migration with `npx wrangler d1 migrations apply gridfall-statistics --local --config cloudflare/wrangler.jsonc`, put local `WRITE_KEY` and `IMPORT_KEY` in `cloudflare/.dev.vars`, and run `npm run stats:dev`. Point `GRIDFALL_STATS_URL` at the local Worker and restart the game server. Keep credentials, `.env`, `.dev.vars`, `.wrangler` and the outbox out of Git.

Validation: `npm run check:match-history`, `npm run typecheck`, `npm run build`, `npx wrangler deploy --dry-run --config cloudflare/wrangler.jsonc`. The history check exercises the actual Worker against SQLite, including imports, SQL reports, auth, schema compatibility and queue recovery. No browser automation is used.
