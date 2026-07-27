# Gridfall Development Handoff

Read this file first when continuing development in a fresh Codex thread.

## Repository

- Workspace: `C:\Users\evans\BoardGame\BoardGame2`
- Repository: `https://github.com/Evansjoe1397/Gridfall.git`
- Branch: `agent/multiplayer-decks-quests-boxes`
- Current HEAD and remote: `b832efa` (`Expand combat rules quests and gameplay UI`)
- Stack: TypeScript, Three.js, Vite, XState, Colyseus
- Rules engine and shared state: `shared/game.ts`
- Client, UI, and Three.js scene: `src/main.ts`
- Styling: `src/style.css`
- Regression suite: `scripts/check-rules.ts`

Do not commit or push unless the user explicitly requests it. Preserve all
existing work and inspect `git status` before editing.

## Current Working Tree

At the time of this handoff, four files contain intentional uncommitted work:

```text
 M scripts/check-rules.ts
 M shared/game.ts
 M src/main.ts
 M src/style.css
```

Do not discard or overwrite these changes. They contain:

1. Temporary, reversible Version B card-only styling.
2. Fixed Hotseat Duel HUD seat positions.
3. Updated Shield Bash behavior and descriptions.
4. Enemy-preferring shortest-path logic for Shield recall.
5. Regression tests for the new Shield behavior.

`HANDOFF.md` itself becomes modified by this handoff update.

## Current Validation State

The following commands passed after the latest gameplay changes:

```powershell
npm run typecheck
npm run check:rules
npm run build
git diff --check
```

The production build still reports the known warning that the main JavaScript
chunk is larger than 500 kB.

## Development Server

The development server was running when this handoff was written:

- Client: `http://localhost:5173/`
- Colyseus multiplayer server: port `2567`
- Logs: `dev-server.log` and `dev-server-error.log`

Before starting another copy, check whether the existing Node/Vite processes are
still running.

## Latest Uncommitted Changes

### Version B card styling

Only the cards were restyled. The earlier full Version B layout experiment was
completely reverted because it did not fit the desired design.

The active card design is isolated at the end of `src/style.css` between:

```css
/* TEMPORARY CARD DESIGN — VERSION B */
/* END TEMPORARY CARD DESIGN — VERSION B */
```

It adds:

- Red accents for Attack Cards.
- Cyan accents for Defend Cards.
- Gold accents for Perk Cards.
- Orange accents for Status Cards.
- Violet accents for Free Action Cards.
- Brighter names and rules text.
- A boxed Card Value treatment.
- Matching colors and design in hover previews.

It does not change hand layout, card sizes, gameplay, or Consume rules. Consume
remains ordinary italic text within the rules copy. If the user requests a
revert, remove only this marked CSS section.

### Fixed Hotseat Duel HUD seats

In a two-player Hotseat test:

- P1 health and statuses remain in the left HUD slot.
- P2 health and statuses remain in the right HUD slot.
- They no longer swap when the active/acting player changes.

The helper is `hudSeatPlayerIds()` in `src/main.ts`. Three-player Hotseat and
online perspective behavior remain unchanged.

### Shield Bash

Current card:

- Attack Value: 2.
- If the Shield was unequipped at combat start, recall and equip it.
- Each enemy crossed by the recalled Shield receives 3 Damage.
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
- Among routes with the same minimum length, it prefers the route crossing the
  greatest number of enemy-occupied Squares.
- It never adds steps solely to hit an enemy.
- Board Objects still block intermediate recall Squares.

This path helper is shared by Arm da Wiz, Shield Bash, and Mana Baryer recalls,
so the preference applies to all Shield recall effects. Damage remains specific
to the card that initiated the recall; the one-Square pull is the general recall
effect.

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

## Suggested Fresh-Thread Prompt

> Continue development of Gridfall in `C:\Users\evans\BoardGame\BoardGame2`.
> Read `HANDOFF.md` first, inspect the current Git status, and preserve all
> existing uncommitted work. Do not push unless I explicitly request it. My next
> requested change is: [describe change].
