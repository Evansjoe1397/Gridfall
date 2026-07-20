# Gridfall Development Handoff

Use this document as the first context message in a fresh Codex thread.

## Project

- Workspace: `C:\Users\evans\BoardGame\BoardGame2`
- Repository: `https://github.com/Evansjoe1397/Gridfall.git`
- Current branch at handoff: `agent/multiplayer-decks-quests-boxes`
- Stack: TypeScript, Three.js, Vite, XState, Colyseus
- Main rules engine: `shared/game.ts`
- Main client/UI/Three.js scene: `src/main.ts`
- Styling: `src/style.css`
- Rule regression suite: `scripts/check-rules.ts`

## Commands

```powershell
npm run dev
npm run typecheck
npm run check:rules
npm run build
```

`npm run build` currently succeeds with the known Vite warning that the main JavaScript chunk exceeds 500 kB.

## Working Rules

- Do not commit or push unless explicitly requested.
- Preserve existing user changes and use targeted edits.
- Validate rule changes with `npm run typecheck`, `npm run check:rules`, and `npm run build`.
- Multiplayer uses Nagrand Arena for two players and Lordaeron Arena for three-player Free For All.
- Hotseat supports selectable two- or three-player formats with Test Dummies.

## Current Characters

- Obi Wan Shinobi — Lightsaber Wizard, 20 HP, MOV 2, Range 2.
  - Lightsaber is unique to Shinobi and grants +1 ATT, +1 DEF, and +1 MOV while empowered.
- Da Orkk — Wizard of Strength, 26 HP, MOV 3, melee Range 1.
  - Uses Rage and an equipable Shield.
- Long Hat Logan — The Magician, 18 HP, MOV 3, Range 2.
  - Uses Classic Wizardry and up to 3 Mana.
- Test Dummy — training opponent.

## Important Implemented Systems

- Deck, Hand, Discard, Status Cards, Spell Echo, reserve/focus opening setup, phase rewards, and Action Quests.
- Animated movement, Push/Pull, collision effects, High Ground, protected High Ground, bases, draw Squares, pillars, boxes, and Shields.
- Hotseat and Colyseus multiplayer flows.
- HINTS window with English/Russian rules and contextual card advice.
- Discard viewer and publicly known top-Deck card preview.
- End-of-match statistics per character:
  - Squares Moved
  - Attack Damage
  - Perk Damage
  - Total Damage (Attack + Perk + defensive retaliation)
  - Hit Points Healed
  - Combat Damage Blocked
- End-of-match results table.

## Most Recent Rule Changes

- Lightsaber can only be gained/displayed by Shinobi; invalid state on other characters is cleared.
- Lightsaber now grants +1 MOV in addition to +1 ATT and +1 DEF.
- Force Throw Level 1 target Range is 4; higher levels retain Range 4.
- Force Pull Level 1 target Range is 4; Levels 2 and 3 have Range 5.
- Total Damage includes Attack Damage, Perk Damage, and damage caused by defensive card retaliation. Environmental/unrelated damage is excluded.

## Compatibility Notes

- `PlayerState.matchStats` is optional so older multiplayer state payloads remain readable; the rules engine initializes missing statistics lazily.
- `knownTopCardId` is used for public top-of-Deck information.
- Large files contain historical responsive-layout overrides. Inspect nearby CSS selectors before adding another override.
- Direct damage should go through `dealDamage(...)` with the correct source kind (`attack`, `perk`, `defense`, or `other`) so statistics and Action Quests remain accurate.
- Character movement should pass through `recordQuestMovement(...)`; teleports pass `teleport = true` and do not increase the match Squares Moved statistic.

## Suggested Fresh-Thread Prompt

> Continue development of Gridfall in `C:\Users\evans\BoardGame\BoardGame2`. Read `HANDOFF.md` first, inspect the current Git status, and preserve existing work. Do not push unless I explicitly request it. My next requested change is: [describe change].
