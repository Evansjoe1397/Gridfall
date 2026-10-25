# Patch of Flames

Patch of Flames is an additive Square modification, also called a **Burning Square**. It preserves the underlying Base, Draw, High Ground, Slide, Trench, or ordinary Square. It expires at the start of its creator's next turn, before turn-start Burning or Ward rewards, and may be extinguished/absorbed earlier. Counterflame, Wall of Fire, Fyrestarter and Ray of Fire create it.

Future authoritative Card/ability handlers can call:

```ts
modifySquare(state, cell, 'patch-of-flames', creatorId); // true when allowed
isBurningSquare(state, cell);
```

`state.squareModifications` stores modifications by Square label; `state.flameSquareCreators` stores the creator of each Patch. Both travel with normal state snapshots, multiplayer updates, combat continuations and undo snapshots. Pass the defender's ID for defensive creation; omitting the creator defaults to the active player. Reapplying fire refreshes its creator. In matches with several Fyrebanks, only the incoming player's Patches expire. Older snapshots without ownership expire their Patches on the next Fyrebanks turn. Expiry removes only the fire overlay. Absorption, Water and flooding also clear ownership metadata so flames cannot reappear later.

Columns and Flood Buttons reject flames even if their Object is missing. Water and active Shallow Water reject flames. `modifySquare(state, cell, 'water' | 'shallow-water')` immediately deletes an existing flame overlay. The Pipe's flooding also permanently deletes flames in its flooded zone; draining does not bring them back. Dry flood-zone Squares can burn.

A living character receives one Burning Card in Hand at turn start on fire, one when leaving a Burning Square, and one when entering one. Entry and departure are separate interactions: crossing an intermediate Burning Square gives two Cards. Actual walking and Card/forced-movement paths include intermediate Squares and automatic Slides; teleportation touches only its departure and arrival Squares. Environmental Burning has no enemy Card source and does not depend on enemy combat-effect permissions. Receiving a Card does not itself deal Damage.

During the active character's finishing Dash, these interactions queue Cards in `pendingDashBurning`. The Cards enter Hand only when that turn fully completes, after its Burning Damage step and any intervening end-turn choices. They therefore deal no Damage that turn and do not restart random Burning Dash movement. Existing Burning Cards retain their usual rules. Movement cancellation and action undo restore both the Hand and queued Cards from their snapshots.

`src/patch-of-flames.ts` renders persistent animated flames at the Square's surface height using shared procedural shaders and geometry. It removes expired/extinguished patches and clears them when leaving a match. It does not intercept board clicks or require image assets.

Verification: `npm run check:patch-of-flames` covers authoritative commands in both combat modes, terrain restrictions, water, traversal, forced movement, cancellation, undo, turn timing, Dash, and the non-browser visual lifecycle. `npm run check:flames-lifecycle` covers creator-based expiry and the October 25 dump's Burning-removal regression, including The Gambler/reshuffle and movement undo.

If `tsx` is blocked by sandbox process-spawn permissions, run `node --experimental-strip-types scripts/check-patch-of-flames.ts` instead.
