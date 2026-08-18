# Spectre implementation plan

## Progress update

Phases 2 through 9 now have a playable first implementation in the shared Hotseat/multiplayer rules engine and Three.js client. Focused automated checks cover registration, proxy combat, Devour, and Shadow movement. Phase 10 validation is in progress; the remaining work after validation is broader edge-case coverage, approved Russian copy, and any rule changes resulting from the open design questions in `Spectre.md`.

This plan is based on the current centralized TypeScript architecture and the rules captured in `Spectre.md`. Implementation should not begin until the replica combat and movement questions in that document are resolved, because those answers determine the state model and command schema.

## Recommended state model

Represent the replica as a dedicated owned combat proxy in `GameState`, not as a second `PlayerState` and not solely as an ordinary destructible `BoardObject`.

Proposed shape:

```ts
type SpectreReplica = {
  ownerId: PlayerId;
  position: Cell;
};
```

Store replicas as `Partial<Record<PlayerId, SpectreReplica>>` or an equivalent list if future characters may own similar proxies. Add explicit combat origin/target data to `PendingAttack` so all Range, line-of-sight, terrain, adjacency, Base, and after-combat calculations use the correct body without temporarily mutating the owner's position.

Do not model a replica as another player: turn order, victory, Hand, actions, status ownership, quest progress, and Colyseus seats are all keyed by `PlayerId` and would become incorrect.

## Phase 1 — settle rules contracts

- Resolve the remaining questions in `Spectre.md` that affect state, targeting, or timing, especially private reveal selection, Shadow Dagger transit/Box-top movement, and Accumulate's combined cap.
- Decide canonical card IDs now. Suggested IDs: `replicate`, `relocate`, `shadow-dagger`, `consume-replica`, `fear`, `solitude`, `deja-vu`, `echo-strike`, `soul-strike`, `displace`, `devour`, `split`, `anguish`, `dispersion`, and `accumulate`.
- Confirm terminology (`ATT`, `DEF`, `MOV`, `Damage`, `Range`, `Square`, `Card`, `Hand`) against existing card copy.

Exit criterion: `Spectre.md` contains no unresolved question that changes serialized game state or command payloads.

## Phase 2 — register character and cards

Update `shared/game.ts`:

- Add `spectre` to `CharacterIdSchema`, `CharacterId`, `HotseatCharacterId`, and `PlayerState.character`.
- Add all 15 card IDs to `CardTypeIdSchema` and define their `CARDS` entries with values, level effects, and effect text.
- Add `SPECTRE_CARD_IDS` and a Spectre entry in `STARTING_DECKS`:
  - defaults: the three starting Attacks, three starting Defends, and three starting Perks;
  - reserve: `replicate`;
  - attack focus: `soul-strike`, `displace`;
  - defend focus: `dispersion`, `accumulate`;
  - perk phase: `consume-replica`, `fear`.
- Extend `createPlayer()` with 16 HP, Move 3, Range 1, Spectre's card collection, and initial Spectre-specific transient state.
- Replace repeated character-name ternaries in hotseat and multiplayer constructors with one exhaustive character metadata lookup to avoid Spectre silently falling back to another name.

Update `src/i18n.ts` with Russian card names/effect text and any Spectre trait/status labels. If translations are not yet approved, add deliberate English fallbacks and track translation completion rather than silently omitting entries.

Tests in `scripts/check-rules.ts`:

- Character schema accepts Spectre in multiplayer.
- Spectre initializes at 17 HP / 3 MOV / Range 1.
- Opening setup guarantees Replicate in Hand, uses the correct nine defaults, and exposes the correct focus and phase choices.
- All Spectre card definitions exist and have the intended kind/value.

## Phase 3 — replica lifecycle and board legality

Update shared state and command schemas in `shared/game.ts`:

- Add serialized HP-less replica state and helper selectors such as `spectreReplica()`, `combatBodyPosition()`, `createOrReplaceReplica()`, and `destroyReplica()`.
- Add placement commands/phases for Replicate and Split. Preserve targeting undo for cancellable Perk placement.
- Validate board bounds, occupancy, terrain, Range, and required line of sight. Permit normal High Ground, Base, and yellow draw Squares; reject Boxes.
- Ensure replacement removes exactly the owner's existing replica.
- Treat replica occupancy consistently in normal movement, line of sight, teleport destination checks, push/pass-through/pull/collision rules, Object targeting, diagonal corner blocking, quests, Base/draw Squares, and object spawning. Normal movement is blocked; explicit pass-through effects may cross it. Object-targeting Perks may select it. Push/pull collision Damage routes to Spectre's HP.
- Ensure owner death immediately removes or ignores the replica and cannot leave a ghost combat target.
- Keep the replica out of turn order, victory checks, player statistics rows, and opening placement.

Tests:

- Replicate Range is 2/3/4 by level and replacement leaves exactly one replica.
- Illegal occupied/out-of-board/blocked destinations are rejected.
- Split creates within Range 1 after combat and handles no legal destination deterministically.
- Replica occupancy interacts correctly with every resolved movement/collision rule.
- Replica alone never grants the yellow start-of-turn draw.

## Phase 4 — combat origins, targets, and Square bonuses

Refactor combat in `shared/game.ts` before adding individual Attack/Defend effects:

- Extend the attack command with an origin (`spectre` or `replica`) when Spectre has a replica, or introduce a short origin-selection phase before target selection. Both origins share Spectre's Hand, Actions, modifiers, limits, and other resources; the replica always attacks at melee Range 1.
- Add a replica target kind or stable target ID for attacks against the proxy.
- Store immutable attacker-origin and defender-body positions in `PendingAttack` so deferred after-combat resolution cannot drift after swaps, pushes, or replica replacement.
- Generalize Range, line of sight, High Ground ATT, terrain protection, adjacency, centered area effects, and Base DEF to accept explicit body positions.
- Route cards, actions, modifiers, statuses, Damage statistics, combat acknowledgement, taking a hit, and losing combat through Spectre's owning `PlayerId` and HP. The HP-less replica remains in play after its owner receives Damage.
- Keep every non-positional combat rule identical between the two bodies; only calculations that depend on an origin, target, Square, direction, Range, line of sight, elevation, Base, or adjacency use the selected body.
- Apply the Base +1 DEF only when the attacked body is on the owner's Base.
- Define replica destruction/Damage routing and victory behavior from the resolved design.

Tests:

- Either legal origin can attack; illegal Range/line-of-sight from the selected origin is rejected even if the other body could attack.
- Replica-origin High Ground and Spectre-origin High Ground do not leak between bodies.
- A replica on Base gains +1 DEF when attacked; Spectre elsewhere does not.
- Taking a hit against the replica reduces Spectre's HP and does not remove the replica.
- Hotseat and simultaneous multiplayer combat stacks produce identical totals and acknowledgements for replica combat.

## Phase 5 — implement starting perks

### Replicate

- Use the lifecycle helpers from Phase 3.
- At Level 2, add public Panic to every adjacent enemy Hand.
- At Level 3, reveal one eligible Card privately to Spectre for each affected enemy using viewer-specific visibility and the resolved selection rule.
- Log each placement, replacement, status addition, and reveal.

### Relocate

- Require an existing replica and atomically exchange the two positions.
- Add a player-choice phase for removing one eligible negative Status from Hand; allow the flow to complete immediately if none exists.
- Store a turn-scoped +1 ATT modifier at Level 2.
- Add 1 Action at Level 3 using the resolved cap/refund behavior.
- Mark the visual movement cause as own-card movement and animate both bodies simultaneously or in a coordinated sequence.

### Shadow Dagger

- Add a Spectre-only direction-selection command and generate the maximal horizontal/vertical/diagonal trail to the board edge; the replica can neither originate nor use it.
- Store trail Squares and expiration turn in `GameState`.
- Drive the dagger projectile along the line and apply Level 2 MOV penalties and Level 3 Perk Damage at each enemy collision animation event. Enemies entering the completed trail later are unaffected.
- Extend pathfinding with a narrowly scoped Spectre trail mode. Use weighted path cost because Column traversal can cost 0 while ordinary steps and Box climbing cost MOV.
- In trail mode, override terrain-edge restrictions such as The Trench's forbidden Low-to-High ascent and future River passability. Preserve normal MOV costs unless explicitly overridden.
- Add reusable transit-only terrain invariants so Spectre cannot finish movement or end the turn in a Column, River, or future non-occupiable trail Square.
- Implement Box-top state, High Ground calculation, rendering height, legal attacks, exit rules, and the 1 Damage fall when the supporting Box is destroyed.
- Clear the trail and its temporary MOV penalties immediately after Spectre's turn ends.

Tests:

- Lines are correct in all eight directions and end at the board edge.
- Column traversal is free only on the active trail and cannot end inside a Column.
- The trail permits forbidden Trench-to-High Ground ascent and future impassable-terrain crossings but rejects turn completion on transit-only terrain.
- Box ascent costs MOV, grants High Ground, and destruction causes the correct fall and Damage.
- Level 2 and 3 affect each eligible enemy exactly once and expire correctly.

## Phase 6 — implement extra perks

### Consume Replica

- Reject use without a replica.
- Snapshot the last replica position, destroy it, add Headache, and set +2/+3 turn-scoped ATT.
- At Level 3, deal 1 Perk Damage to enemies adjacent to the snapshot position.

### Fear

- Snapshot all adjacent enemies before moving any of them so one enemy's movement does not change the affected set.
- Resolve each exact-away destination independently with normal occupancy constraints.
- Use regular character movement visuals, `enemy-ability` movement cause, quest movement accounting if applicable, and `dealElevationDamage = false` behavior.
- Reveal on failed movement, add Panic at Level 2, and add a turn-scoped ATT bonus equal to affected-enemy count at Level 3.
- Define a deterministic order for simultaneous conflicts where two feared enemies want the same destination.

Tests:

- Cardinal and diagonal away vectors, blocked destinations, reveal fallback, shared-destination conflicts, and board edges.
- No High-to-Low Damage from Fear.
- Panic and ATT count use the original affected set.

## Phase 7 — implement attacks

- Add a shared Spectre turn ATT modifier helper used by Relocate, Consume Replica, Fear, and Accumulate; include each modifier in the combat breakdown.
- **Solitude:** inspect all eight adjacent Squares around the target; count players, replicas, Columns, and Objects while excluding the attacking Spectre owner and their replica as specified.
- **Deja Vu:** snapshot replica existence at declaration and resolve the Action/draw at the confirmed timing.
- **Echo Strike:** snapshot or resolve the replica position per the final rule, then deal 1 Attack-effect Damage to all adjacent characters, including Spectre and allies.
- **Soul Strike:** reveal an eligible random Card in web play, with deterministic random injection or a seeded helper for tests.
- **Displace:** invoke the general push pipeline from the resolved origin, handle blocked movement, and prevent unintended double collision Damage.

Tests should cover each card from Spectre and replica origins, with and without a replica, all adjacency exceptions, allies in three-player mode, missing unrevealed Cards, pushes into players/objects/edges, and effect-cancelling Defend Cards.

## Phase 8 — implement defends and prevention

- **Devour:** add a pre-damage combat prevention flag covering combat Damage and every Attack/Defend card-effect Damage event belonging to that combat, destroy the replica, and add Headache. Integrate with combat preview, statistics, Attack-effect cancellation, and deferred acknowledgement.
- **Split:** enter replica-placement after combat without losing the serialized deferred state.
- **Anguish:** after combat, optionally move one Spectre-chosen Pinned, Headache, Exhaust, Burning, or Panic Card instance from the shared Spectre Hand to the attacker's Hand. Resolve with no effect when none is eligible. Treat the transfer as applying a negative Status: Blessing: Shield or equivalent protection can block it, in which case the Card remains with Spectre. Reveal a successful transfer publicly to every player. Skip the transfer if the attacker has already reached 0 HP and ended the match.
- **Dispersion:** use actual received combat Damage, clamp the copied amount to 3 per adjacent enemy, center the blast on whichever body was attacked, and classify it as defensive retaliation Damage.
- **Accumulate:** store each clamped received-combat-Damage bonus independently, stack all pending bonuses for the next Spectre turn, activate them at turn start, and expire them at turn end. Apply the resolved overall cap and per-attack duration.

Tests should cover zero Damage, prevented Damage, lethal combat, effect cancellation, Anguish transfers and protection, replica-centered Dispersion, self/allied adjacency exclusions, the cap of 3 per enemy, stacked Accumulate effects, and multiplayer acknowledgement timing.

## Phase 9 — client rendering, controls, and feedback

Update `src/main.ts`:

- Add Spectre to hotseat and multiplayer character choices, stats, trait summary, hint pages, tactical advice, colors/icons, and results labels.
- Add a procedural Spectre model initially unless a GLB asset is provided. Create a clearly distinct translucent or shadow-tinted replica visual derived from the same silhouette.
- Render replica ownership and selection, legal origin/target/placement highlights, Shadow Dagger direction/trail, Box-top elevation, and stored ATT modifiers.
- Update `syncBoard()` to create, move, replace, and remove replicas from snapshots without flicker.
- Add animations for replica creation/destruction, Relocate swap, dagger/trail, Fear walking, and area pulses. Extend the server event layer only for animations that cannot be inferred safely from state diffs.
- Ensure click handling distinguishes a player, replica, and Object occupying or associated with a Square.
- Display combat modifier sources and attacked-body Base/High Ground details accurately.
- Add Spectre card advice and English/Russian tooltip content.

Update `src/style.css` only where needed for replica/trail/status visuals and responsive targeting prompts.

Manual checks:

- Two-player Hotseat, three-player Hotseat, duel multiplayer, and three-player multiplayer.
- Small laptop layout and touch/click selection.
- Replica visibility against every arena floor color and on High Ground/Base/draw Squares.
- Reconnect/snapshot synchronization during targeting and combat acknowledgement.

## Phase 10 — regression and release verification

Expand `scripts/check-rules.ts` with focused Spectre scenarios plus regression coverage for shared systems changed by the refactor:

- Existing characters retain their stats, attack Range, High Ground, Base DEF, movement, push, and after-combat behavior.
- Objects remain non-defending targets unless explicitly changed.
- Panic, Headache, reveal visibility, turn start draw Squares, Box destruction/respawn, action quests, and match statistics still work.
- Serialization/deserialization preserves replica, trail, Box-top, pending combat body positions, and stored Accumulate state.

Run the repository's required validation sequence:

```powershell
npm run typecheck
npm run check:rules
npm run build
git diff --check
```

Then perform browser verification of the full loop: select Spectre, finish opening focus, create and replace a replica, attack from both bodies, defend the replica on Base, use every targeting flow, complete combat acknowledgements, end turns, and verify multiplayer state synchronization.

## Likely implementation risks

- `shared/game.ts` and `src/main.ts` are large centralized files with repeated character-specific ternaries. Missing one fallback can label or render Spectre as another character.
- Combat after-effects are deferred via serialized state. Interactive after-combat placement (Split) and prevention (Devour) must not be applied only to the pre-acknowledgement preview copy.
- The current reveal flag is global rather than viewer-specific. A private-to-Spectre reveal in three-player mode requires a data-model and client-visibility change.
- Zero-cost movement through Columns makes the current unweighted route assumptions unsafe. Shadow Dagger needs a weighted, stateful traversal calculation rather than a small conditional in the existing BFS.
- Box-top occupancy introduces two entities associated with one board Square. Many existing checks assume one player or one Object per Square and will require deliberate auditing.
- Replica-origin combat can become inconsistent if helpers continue reading `player.position` implicitly. Prefer explicit origin/target context throughout combat rather than temporary position swaps.
