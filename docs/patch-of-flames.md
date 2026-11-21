# Patch of Flames

Patch of Flames is an additive Square modification, also called a **Burning Square**. It preserves the underlying Base, Draw, High Ground, Slide, Trench, or ordinary Square. It expires at the start of its creator's next turn, before Ward rewards, and may be extinguished/absorbed earlier. Counterflame, Fyrestarter and Ray of Fire create it; Wall of Fire's revised effect no longer creates fire.

Future authoritative Card/ability handlers can call:

```ts
modifySquare(state, cell, 'patch-of-flames', creatorId); // true when allowed
isBurningSquare(state, cell);
```

`state.squareModifications` stores modifications by Square label; `state.flameSquareCreators` stores the creator of each Patch. Both travel with normal state snapshots, multiplayer updates, combat continuations and undo snapshots. Pass the defender's ID for defensive creation; omitting the creator defaults to the active player. Reapplying fire refreshes its creator. In matches with several Fyrebanks, only the incoming player's Patches expire. Older snapshots without ownership expire their Patches on the next Fyrebanks turn. Expiry removes only the fire overlay. Absorption, Water and flooding also clear ownership metadata so flames cannot reappear later.

Columns and Flood Buttons reject flames even if their Object is missing. Water and active Shallow Water reject flames. `modifySquare(state, cell, 'water' | 'shallow-water')` immediately deletes an existing flame overlay. The Pipe's flooding also permanently deletes flames in its flooded zone; draining does not bring them back. Dry flood-zone Squares can burn.

A living character receives at most one environmental Burning Card per visit to a Patch. Walking, Dash and self-directed Card movement grant it on entry; departure from that same Patch grants nothing further, even in a separate action or after forced movement. Leaving and returning starts a new visit. Forced arrival grants no Card immediately: departure, whether voluntary or forced, pays the visit instead. If the character remains on the Patch until their turn fully completes, the Card arrives after end-turn Damage and choices, so it deals no Damage that turn. Turn start does not grant another Card for the same residence. Fire created under a stationary character follows the unpaid-residence rule.

Actual walking and Card/forced-movement paths include intermediate Squares and automatic Slides; teleportation touches only its departure and arrival Squares. `state.flameVisits` tracks each character's current Patch and whether the visit has already granted or queued a Card. This state survives transport, combat continuations and undo; extinction or expiry clears visits for that Patch. Environmental Burning records the Patch creator in `sourcePlayerId` for future Damage statistics and carries `environmentalBurning` to preserve its existing environmental Damage/protection behavior. Gaining it still does not depend on enemy combat-effect permissions. Receiving a Card does not itself deal Damage.

Pyrodash ignores Patch of Flames entry and departure entirely while its route executes, so passing through fire grants or queues no Burning. A final landing on fire remains an unpaid visit for subsequent ordinary departure or full turn completion. Flame Ward and non-terrain Burning effects remain active.

During the active character's finishing Dash, these interactions queue Cards in `pendingDashBurning`. The Cards enter Hand only when that turn fully completes, after its Burning Damage step and any intervening end-turn choices. They therefore deal no Damage that turn and do not restart random Burning Dash movement. Existing Burning Cards retain their usual rules. Movement cancellation and action undo restore both the Hand and queued Cards from their snapshots.

`pendingDashBurningSources` preserves each queued Card's creator until delivery, including different Patch creators on the same route. Absorbing a Patch or transferring its Burning also preserves provenance. Future Burning Damage sourced from Fyrebanks counts toward his Attack Damage and Total Damage, including Dash payment and turn-end Damage. Self-Damage does not count as Damage dealt. Statistics attribution does not change Damage prevention, copy limits or environmental permissions; older Cards without recoverable source metadata cannot be retroactively attributed.

Burning still deals 1 Damage per held Card. All Burning Cards paid for one Dash, or resolved together at turn end, count as one Damage source for Da Orkk's Rage: at most 1 Rage, including while Double! is active. Separate non-Burning Damage keeps its normal Rage rules.

`src/patch-of-flames.ts` renders persistent animated flames at the Square's surface height using shared procedural shaders and geometry. It removes expired/extinguished patches and clears them when leaving a match. It does not intercept board clicks or require image assets.

Verification: `npm run check:patch-of-flames` covers authoritative commands in both combat modes, terrain restrictions, water, traversal, forced movement, cancellation, undo, turn timing, Dash, and the non-browser visual lifecycle. `npm run check:flames-lifecycle` covers creator-based expiry and the October 25 dump's Burning-removal regression, including The Gambler/reshuffle and movement undo.

If `tsx` is blocked by sandbox process-spawn permissions, run `node --experimental-strip-types scripts/check-patch-of-flames.ts` instead.
