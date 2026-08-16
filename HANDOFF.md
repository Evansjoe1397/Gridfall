# Gridfall Development Handoff

Read this file first when continuing development in a fresh Codex chat.

## Repository

- Workspace: `C:\Users\evans\BoardGame\BoardGame2`
- Repository: `https://github.com/Evansjoe1397/Gridfall.git`
- Branch: `main`
- Current local and remote HEAD: `26f7f0c` (`Da Orkh multiple shields support`)
- Stack: TypeScript, Three.js, Vite, XState, Colyseus
- Rules/state: `shared/game.ts`
- Arena definitions: `shared/arenas.ts`
- Client/UI/Three.js scene: `src/main.ts`
- Styling: `src/style.css`
- Translations: `src/i18n.ts`
- Regression checks: `scripts/check-rules.ts`

Do not commit or push unless the user explicitly requests it. Always inspect
`git status` before editing and preserve existing work.

## Current Working Tree

The tree was clean before this handoff was refreshed. `HANDOFF.md` is now the
only intentional local modification. The latest `git pull --ff-only origin
main` reported that the repository was already up to date.

## Runtime State

As of 2026-08-15, the development server and Cloudflare quick tunnel are not
running. The previous temporary public URL is no longer valid.

To launch development mode, first check ports 5173 and 2567, then run:

```powershell
npm run dev
```

- Vite client: `http://localhost:5173/`
- Colyseus multiplayer server: `http://localhost:2567/`

For public multiplayer, first run `npm run build`, keep the server on port
2567 running, and expose that port with Cloudflare Tunnel. Port 2567 serves
both `dist` and the WebSocket rooms, so one tunnel is sufficient:

```powershell
cloudflared tunnel --url http://127.0.0.1:2567 --no-autoupdate
```

Quick-tunnel URLs are temporary and change whenever the tunnel restarts.

## Latest Validation

After pulling commit `26f7f0c`, `npm run build` passed. The build included and
served both imported multiplayer character models:

- `public/models/da-orkh-optimized.glb` (Da Orkk)
- `public/models/long-hat-logan.glb` (Long Hat Logan)

Both returned HTTP 200 locally and through the then-active public tunnel. No
source edits were required to enable them; the earlier problem was a stale
`dist` directory without the model files. The public server must be rebuilt
after model/source changes because port 2567 serves `dist`.

The normal full validation sequence is:

```powershell
npm run typecheck
npm run check:rules
npm run build
git diff --check
```

The production build has a known non-fatal warning that its main JavaScript
chunk exceeds 500 kB.

## Current Multiplayer and Models

- Online character selection includes Obi Wan Shinobi, Da Orkk, Long Hat
  Logan, and John Christ.
- The same character may be selected by multiple players.
- `syncBoard()` in `src/main.ts` creates the appropriate model for every
  player, including online snapshots.
- Da Orkk uses `createDaOrkk()` and asynchronously installs
  `da-orkh-optimized.glb`, with procedural fallback on load failure.
- Logan uses `createLongHatLogan()` and asynchronously installs
  `long-hat-logan.glb`, with procedural fallback on load failure.
- Logan's imported model contains Idle, Walk, Power, and independently orbiting
  Mana Orb animation behavior.

## Recent Git History

```text
26f7f0c Da Orkh multiple shields support
7d73f3e Da Orkh animations improvements and fixes
b86d40c Reduce Da Orkh model filesize
7424489 Cleanup
b8a44d8 Added new Da Orkh model and animations
8c7f433 Make orbs rotation animation independent
ab91935 Switch to new mage model and animations
6bad75a Expand Gridfall combat characters and arenas
```

## Important Current Detail

The last rules question answered concerned Da Orkk's `ARKANE AROW` Perk:

- Level 1 throw Range: 3.
- Levels 2 and 3 throw Range: 4.
- Level 3 adds its push/collision upgrade but no further Range increase.

The definition is in `shared/game.ts`; targeting stores Range 3 at Level 1 and
Range 4 at Level 2 or above.

## Development Guidance

- Large rules and UI files contain layered historical behavior. Search all
  related functions/selectors before adding overrides.
- Keep Hotseat and multiplayer behavior aligned unless explicitly requested
  otherwise.
- Test responsive UI on small laptop screens.
- Add or update rule checks for gameplay changes.
- Do not delete or overwrite user changes in a dirty worktree.

## Suggested New-Chat Prompt

> Continue development of Gridfall in `C:\Users\evans\BoardGame\BoardGame2`.
> Read `HANDOFF.md` completely first, inspect the current Git status, and
> preserve existing work. Do not commit or push unless I explicitly request
> it. My next request is: [describe the next task].
