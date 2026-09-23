# Gridfall Development Handoff

Updated 2026-09-20. Read this document completely before continuing.

## Workspace and instructions

- Workspace: `C:\Users\evans\BoardGame\BoardGame2`
- Repository: `https://github.com/Evansjoe1397/Gridfall.git`
- Branch: `main`
- Local HEAD: `4da1925` (`Cycle character archive animations`)
- At this handoff, `main` is not reported ahead of or behind `origin/main` by `git status -sb`. No fetch was performed while preparing the handoff.
- Read `AGENTS.md` before doing any work. It prohibits browser checks and browser automation unless the user explicitly overrides that rule.
- Preserve all existing work. Do not commit or push unless the user explicitly requests it.
- Use `apply_patch` for source edits and hidden windows for long-running background processes.
- The user requested this handoff so development can continue in a different chat. No additional feature request is pending.

## Uncommitted work to preserve

The post-game combat-summary download is being migrated from Excel (`.xlsx`) to CSV (`.csv`). The working tree intentionally contains:

- `package.json` - removed the `exceljs` dependency.
- `package-lock.json` - dependency tree updated by `npm uninstall exceljs` (91 packages removed).
- `src/main.ts` - imports the CSV helper, downloads a UTF-8 CSV blob, uses a `.csv` filename, and displays CSV-specific button/status text.
- `src/combat-summary-csv.ts` - new CSV serializer and filename helper.
- `src/combat-summary-xlsx.ts` - deleted because the Excel exporter is no longer used.
- `scripts/check-combat-summary-export.ts` - changed from XLSX workbook checks to CSV content, escaping, safety, and filename checks.
- `HANDOFF.md` - this handoff update.

The CSV keeps the existing exported data: winner, turns, player, character, result, final/max HP, movement, attack/perk/retaliation/total damage, objects destroyed, HP healed, and combat damage blocked. It uses a UTF-8 BOM, CRLF rows, quoted cells, escaped quotes, and protection against spreadsheet formula injection for string values beginning with spreadsheet control characters.

Do not restore the deleted XLSX module or reinstall `exceljs` unless the user changes direction.

## Validation of the CSV migration

Completed successfully before this handoff:

- `npm run check:combat-summary-export`: PASS (`Combat summary CSV export checks passed.`)
- `npm run typecheck`: PASS
- `npm run build`: PASS
- `git diff --check`: PASS, with only normal Git LF/CRLF working-copy warnings

The production build still emits the known non-fatal JavaScript chunk-size warning. No browser or visual verification was performed, in accordance with `AGENTS.md`.

## Current Git state

Expected status after this handoff:

```text
## main...origin/main
 M HANDOFF.md
 M package-lock.json
 M package.json
 M scripts/check-combat-summary-export.ts
 D src/combat-summary-xlsx.ts
 M src/main.ts
?? src/combat-summary-csv.ts
```

There are several historical safety stashes (`stash@{0}` through `stash@{4}`). They were created around earlier pulls and their work has generally already been restored or committed. Do not apply or drop any stash without first inspecting it and confirming it is actually needed.

## Recent committed baseline

Recent commits, newest first:

- `4da1925` Cycle character archive animations
- `07d1d67` Merge branch `main`
- `8fb4ded` Fixed the hot potato placement and style
- `841de4d` Add Da Orkk attack animation
- `2add5b4` Obi Wan attack animations plus combat/effect text improvements
- `047ebfc` Merge branch `main`
- `3d8ee25` UI improvements and Merylin animation fixes
- `7035f42` Added models and animations for Merylin Pendragon

The character archive animation cycle introduced in `4da1925` excludes movement animations, per the user's follow-up request.

Many gameplay and UI changes from prior development sessions are already committed, including combat effect ordering, object combat handling, character/card/perk updates, archive status tabs, post-match statistics export, and public multiplayer work. Treat the current code and regression scripts as authoritative rather than relying on old handoff descriptions.

## Runtime and launch guidance

No listener was detected on ports `5173` or `2567` while preparing this handoff. Full process command-line inspection was denied by the current shell permissions, so recheck ports and processes before launching.

Development mode:

1. Check ports `5173` and `2567` to avoid duplicate servers.
2. Run `npm run dev` from the repository root.
3. Vite client: `http://localhost:5173/`
4. Multiplayer server: `http://localhost:2567/`

Public multiplayer must follow the workflow in `AGENTS.md`: build, run the production server on port `2567`, expose that same origin with one Cloudflare Quick Tunnel, and verify local and public HTTP reachability without a browser. Quick-tunnel URLs are temporary.

## Code map and validation guidance

- `shared/game.ts`: authoritative cards, state, commands, targeting, combat, traits, quests, and combat statistics.
- `shared/arenas.ts`: boards and arena definitions.
- `server/index.ts`: Colyseus rooms, seats, lobby state, and broadcasts.
- `src/main.ts`: primary UI, online client, Three.js board/characters, archive, lobby previews, and post-match UI.
- `src/style.css`: layout and visual styling.
- `src/combat-summary-csv.ts`: uncommitted post-match CSV serializer.
- `scripts/check-combat-summary-export.ts`: focused CSV regression check.
- Other `scripts/check-*.ts` files: focused gameplay regressions.

Large rules and UI files contain layered historical logic. Search related selectors, state, and command handlers before making changes. Keep Hotseat and multiplayer behavior aligned unless explicitly directed otherwise.

The last documented full `npm run check:rules` run stopped at the pre-existing assertion `Each tied Tank Junior leader receives Helmet.` in `scripts/check-rules.ts`. Do not claim the complete rules suite passes unless it is rerun successfully, and do not broaden unrelated work into fixing that assertion without a request.

## Prompt for the new conversation

Continue development of Gridfall in `C:\Users\evans\BoardGame\BoardGame2`. Read `HANDOFF.md` and `AGENTS.md` completely first. Inspect Git status and preserve the uncommitted CSV combat-summary migration described in the handoff. Do not apply or drop the historical safety stashes unless they are inspected and demonstrably needed. Do not commit or push unless I explicitly request it. Use non-browser verification as required by `AGENTS.md`. Wait for my next development request.
