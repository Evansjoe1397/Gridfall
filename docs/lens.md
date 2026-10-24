# Lens

**Global invariant: at most one Lens may exist anywhere on the board, across all Players and creation effects.** Both Summon Lens and Pocket Lens destroy the existing Lens before creating a valid replacement. If Pocket Lens cannot retreat, it first searches for the nearest vacant Square adjacent to both Fyrebanks and the attack target; if none exists, it preserves the existing Lens. Future Lens-creating Cards must obey this same rule; the shared creation hook rejects a second live Lens.

The Lens is a singleton destructible Object with 1 HP, Box-like targeting and push/pull behavior. Its procedural model is convex glass in a gold standing frame, with a Box-sized footprint and golden/glass destruction pieces. Fyrebanks' Summon Lens Perk summons it; `summonLens(state, playerId, position)` remains the reusable creation hook. The hook rejects occupied/out-of-bounds Squares and a second live Lens. The Perk destroys the previous Lens before summoning its replacement.

## Summon Lens Perk

The Card is in Fyrebanks' Hotseat Hand and Perk archive. Levels are cumulative:

1. Choose an empty adjacent Square and summon Lens there. A valid choice destroys any previous Lens, regardless of owner, then creates the new one. The previous Lens remains until that choice is made.
2. Optionally push the new Lens 1 Square. Use the Force Throw direction rule: the direction may be perpendicular or away from Fyrebanks, and cannot point toward him. On collision, deal 1 Perk Damage and try to push the enemy or movable Object 1 Square in the same direction; Lens takes the vacated Square and survives. Fixed Objects remain in place. A Column, another occupied Square or board edge prevents displacement and Lens stays before the occupied Square. A blocked enemy also receives the ordinary extra 1 collision Damage from hitting its blocker (2 total including the Lens impact). This does not push a chain of Objects. **Keep Lens here** skips this step. Moving from High Ground onto a Slide grants the normal free continuation in the incoming direction, continuing across flooded Pipe water; entering a Slide from low ground grants no extra movement. Displaced targets use the existing forced-movement, Slide and terrain rules.
3. After placement and optional push, arm a single Burning bonus on the next magnified Attack through Lens. A dedicated flame/Lens status icon explains it. The bonus persists across turns and ordinary Attacks, does not stack, and is consumed when a magnified combat is committed. Cancelled target selections preserve it. It is a Perk effect independent of the Attack Card's effects and their cancellation. Burning is applied only after both Cards' post-combat effects and choices finish, including Fire Shield retaliation, Pyrodash movement, and Split placement. It cannot retroactively enable effects in that combat. Normal out-of-combat forced-status protections/copy limits still apply; no Burning is given to a defeated target.

Esc cancels the entire Perk during placement or optional push, restoring the previous Lens, Card/Spell Echo state, Action and bonus. Normal Perk undo remains available after completion unless information or combat has committed it. Choosing **Keep Lens here** completes the Perk, including Level 3.

Fyrebanks can magnify an Attack by targeting a Lens within that Card's Range and clear line of sight, along a row, column or exact diagonal. Committing the magnified Attack turns the Lens to face the selected enemy body, including replicas and off-axis targets. Its direction persists after combat/movement and is restored with state undo; cancelling selection leaves it unchanged. Dragon Claws always resolves a normal Object Attack and destroys it. An off-axis Attack asks for destruction confirmation instead. Other characters attack it normally.

Magnification highlights living enemy bodies, including replicas, within Range 2 and clear line of sight from the Lens. The second target need not be in direct Range or line of sight from Fyrebanks. Selecting it commits ordinary player combat, spends the Card/Attack Action once, and leaves the Lens intact. The real attacker position remains unchanged for combat. Before commitment, Esc or Cancel Lens restores the preceding selection and the entire game state, including movement/Perk undo history.

FP uses the declaration's effective maximum Attack Range:

| Target distance from Lens | Combat FP |
| --- | --- |
| 1 Square | Normal FP against the Lens, plus 1; capped at 3 |
| 2 Squares, adjacent Lens, maximum Attack Range **exactly 3** | 2 |
| 2 Squares, every other case (including maximum Range 2 or 4+) | 1 |

Blocked Focus Lens grants 0 FP. FP remains local to this combat and only powers the Card's defined effects.

Magnified Pyrodash first heads toward the Lens. Crossing it resets the remaining distance to the full captured combat FP and redirects toward the selected enemy. If that outgoing target is off-axis, choose one of the two highlighted outgoing lanes from the Lens before movement starts; the complete movement then runs automatically. The Lens relays the dash once; later collisions reflect normally. Existing higher-ground/Object/edge reflections, free enemy Squares, Burning/Damage, cancellation and loop safety remain in effect.

`npm run check:lens` covers singleton creation, movement/destruction, both combat modes, cancellation/undo, FP across maximum Ranges 1–5, LOS on both legs, replica targets, Pyrodash reset/turn/lane choices, production board targeting and model disposal. Browser verification remains with the user under AGENTS.md.

`npm run check:lens-perk` covers all levels, singleton replacement/restoration, optional push, legal directions/collision, High Ground Slide entry, Action/Spell Echo undo, independent late Burning in both combat modes, deferred defense/movement completion, and the production status composer/board click handler.
