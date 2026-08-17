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

The helper is `hudSeatPlayerIds()` in `src/main.ts`. Three-player Hotseat and
online perspective behavior remain unchanged.

### Shield Bash

Current card:

- Attack Value: 2.
- If the Shield was unequipped at combat start, recall and equip it.
- Each enemy crossed by the recalled Shield receives 2 Damage.
- The general Shield-recall pull remains active: crossed enemies are pulled one
  Square toward Da Orkk when legal.
- If the Shield was already equipped at combat start, generate 1 Rage after all
  deferred combat effects resolve.
- The Rage reward is applied after the usual post-Attack Rage removal, so a
  zero-Rage Orkk ends with one Rage from this branch.
- Attack-effect-cancelling Defend Cards still cancel Shield Bash's additional
  effects.

The card definition and resolution are in `shared/game.ts`; tactical advice is
in `src/main.ts`. Regression tests cover both equipped and unequipped branches.

### Shield recall route priority

`armDaWizPath()` now uses layered breadth-first search:

- Cardinal and diagonal moves both cost exactly one step.
- A Shield always takes a minimum-length legal route.
- Among routes with the same minimum length, it first prefers fewer diagonal
  steps and then the route crossing the greatest number of enemy-occupied Squares.
- It never adds steps or diagonal movement solely to hit an enemy.
- Board Objects still block intermediate recall Squares.

This path helper is shared by Arm da Wiz, Shield Bash, Arcane Shield, and Mana
Baryer recalls, so the preference applies to all Shield recall effects. Automatic
recalls choose the Shield whose optimal route crosses the most enemies, using the
nearest Shield only as a tie-breaker. Damage remains specific to the card that
initiated the recall; the one-Square pull is the general recall effect.

## Important Current Rules

### Characters

- Obi Wan Shinobi: 20 HP, MOV 2, melee Attack Range 1.
  - Lightsaber grants +1 ATT, +1 DEF, and +1 MOV while active.
  - Shinobi Attack Cards use his melee range; ranged Perks specify their own
    ranges.
- Da Orkk: 26 HP, MOV 3, Attack Range 1.
  - Rage applies all stacks to an Attack Card, then removes one stack after
    combat.
  - One Rage stack is removed at the end of Da Orkk's turn.
  - Da Orkk can gain one Rage per overall damaging card/action effect during his
    own turn; separate later actions may grant Rage again.
- Long Hat Logan: 18 HP, MOV 3, Attack Range 2.
  - Uses Classic Wizardry and up to three Mana.

### Board movement and visibility

- Characters cannot occupy or pass through Columns, Objects, Wall Objects, or
  other characters unless a card explicitly permits passing through them.
- Columns are immovable.
- Wall Objects and Columns block line of sight; ordinary Objects do not.
- Diagonal movement is blocked only when an Object touches the relevant corner
  from the blocking side.
- Teleports may land only on empty Squares visible from the caster's starting
  location.
- Pass-through movement must animate through occupied Squares.

### Combat timing

- Attack and Defend after-combat effects are deferred until both players
  acknowledge the combat result.
- Direct damage should use `dealDamage(...)` with the correct source kind.
- Character movement should use `recordQuestMovement(...)`.
- Character death must transition immediately to the finished state and show
  the match result.

### Rage

- Rage gained from a single overall card/action effect is capped at one stack,
  even if that effect contains multiple damage instances.
- A separate later action during the same turn can grant another stack.
- An Attack receives the full bonus from all current Rage, then one stack is
  removed after combat.
- One more stack is removed at the end of Da Orkk's turn.

## Major Existing Systems

- Hotseat Duel and three-player Free For All.
- Colyseus multiplayer.
- Character selection with core stats and trait tooltips.
- Deck, Hand, Discard, Status Cards, Spell Echo, focus/reserve setup, and phase
  rewards.
- Action Quest pool tied to Phase transitions.
- Object destruction and delayed Box respawning.
- Push, Pull, collision, teleport, pass-through animation, High Ground, bases,
  Columns, Boxes, and Shields.
- HINTS with English/Russian advice, My Cards, and Damage Log.
- Damage Log includes damage and healing.
- End-of-match statistics and results screen.

## Working Guidance

- Large rules and UI files contain layered historical behavior. Search for all
  related selectors/functions before adding another override.
- Keep UI changes responsive for small laptop screens and test two- and
  three-player modes separately.
- Add or update checks in `scripts/check-rules.ts` for gameplay changes.
- Run typecheck, rule checks, build, and `git diff --check` before handing off.
- Do not push unless explicitly requested.

## Suggested New-Chat Prompt

> Continue development of Gridfall in `C:\Users\evans\BoardGame\BoardGame2`.
> Read `HANDOFF.md` completely first, inspect the current Git status, and
> preserve existing work. Do not commit or push unless I explicitly request
> it. My next request is: [describe the next task].
