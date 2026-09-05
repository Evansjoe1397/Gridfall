# Spectre

Status: design specification; implementation has not started.

Spectre is a melee skirmisher who projects an immobile replica, attacks from either body, and turns positioning uncertainty into card pressure. The replica is not merely a marker: it can be used as an attack origin, can defend itself, can hold important board squares, and can be exchanged or consumed by Spectre.

## Core stats

- Hit Points: 18
- Move: 3
- Attack Range: 1 (melee)

## Unique trait: Replica

Spectre normally controls one replica; Haunt may create one replica behind each enemy.

- Creating a replica while one already exists removes and replaces the existing replica.
- The replica is visually distinct from Spectre.
- The replica cannot move through normal movement or Free Move.
- The replica has no HP.
- The replica can originate any of Spectre's Attack Cards at melee Range 1. Every enemy in Range of the selected origin is a legal target.
- The replica can be selected as the target of an enemy Attack Card. This starts standard combat: Spectre plays a Defend Card from the shared Hand or takes the hit.
- If the replica is attacked and Spectre takes the hit or loses combat, all resulting Damage is dealt to Spectre's HP. The replica remains in play.
- Playing a Defend Card for an attacked replica resolves completely regular combat. The replica changes only positional calculations; it does not change card ownership, Damage ownership, combat timing, or combat resources.
- Spectre and the replica share everything: Hand, Deck, Discard, Actions, movement allowance, statuses, card modifiers, turn limits, and other resources. The replica is a second board body, not a second player.
- When attacking, the Spectre player may freely choose Spectre or the replica as the origin, provided the chosen origin has a legal target.
  - UI refinement: while an Attack Card is selected, highlight the union of legal targets for Spectre and the replica, including attackable Objects. The currently selected body is the preferred origin when both can reach the target; if only the other body can reach it, use that body automatically.
- The replica blocks normal movement and line of sight.
- The replica can be pushed, can be passed through by effects that permit passing through an occupied Square, and is treated as an Object by rules that inspect or target Objects.
- Normal movement cannot enter or cross the replica's Square. Cards and traits that explicitly allow passing through occupied characters or Objects may cross it.
- Object-targeting Perks may target the replica.
- The replica can be pushed and pulled. If its forced movement causes collision Damage under the general rule or the resolving Card, that Damage is dealt to Spectre's HP; the replica still has no separate HP.
- Although the replica is treated as an Object generally, Spectre and Spectre's own replica are explicitly ignored when Solitude checks the target's adjacent Objects and characters.
- Unless a card says otherwise, effects that refer specifically to Spectre do not automatically refer to the replica.
- Effects that refer to “you and your replica” or “either body” explicitly include both.

### Board-square ownership

- If the replica starts Spectre's turn on a yellow draw Square while Spectre does not, Spectre does not receive that Square's start-of-turn bonus draw.
- If the replica is attacked while occupying Spectre's Base, the replica receives the normal +1 DEF Base bonus.
- If Spectre is attacked while only the replica occupies Spectre's Base, Spectre does not receive the +1 DEF Base bonus.
- These rules make the acting or defending body's position authoritative; the replica cannot remotely transfer Square bonuses to Spectre.
- More generally, every positional combat calculation uses the body involved: Attack Range and line of sight use the attacking body; High Ground uses the acting body's Square; Base DEF uses the attacked body's Square; and effects centered on the attacker or defender use that body's position. Damage and all non-positional effects still belong to Spectre.
- A replica may occupy a normal High Ground Square, Base, or yellow draw Square, but may not be placed on top of a Box.

### Terminology used below

- **Adjacent** means Range 1 using the game's normal Chebyshev distance, so orthogonal and diagonal neighbors both count.
- **Straight line** means horizontal, vertical, or diagonal.
- Perk levels are cumulative: a Level 3 use resolves its Level 1, Level 2, and Level 3 effects unless an effect explicitly replaces an earlier value.
- **Reveal 1 Card** means reveal one previously unrevealed Card in that enemy's Hand to Spectre only. The other opponents in a three-player match do not see it. The selection rule still needs confirmation; see Open questions.

## Starting perks

### Replicate — starting Reserve Card

Create or improve Spectre's replica.

- **Level 1:** Create a replica on an empty visible Square within Range 2 of Spectre, then draw 1 Card. The replica can attack and defend but cannot move. Remove an existing replica before creating the new one.
  - Example: Spectre at D4 may create the replica on any legal Square no farther than two Squares away, including diagonally.
  - Placement requires line of sight, obeys normal board bounds, and requires an unoccupied destination. Wooden Boxes block Replicate's placement line of sight in addition to Columns and other Wall Objects, even though ordinary Attack line of sight may pass through a Box.
  - High Ground terrain between Spectre and the destination blocks line of sight. On The Trench, a Spectre inside the central trench cannot place a replica on Rows 2 or 7 through the intervening High Ground ridges.
  - The destination may be a normal High Ground Square, Base, or yellow draw Square, but cannot be a Box or a Square occupied by another entity.
- **Level 2:** Increase the creation Range by 1, to Range 3. Pull every enemy within Range 2 of the newly created replica exactly one Square toward it. After all pulls resolve, add one Panic Card to the Hand of every enemy adjacent to the replica.
  - Enemies already adjacent remain in place. If the direct Square is blocked, the enemy uses the first legal one-Square step of the shortest route toward the replica; if no route exists, that enemy remains in place.
  - Pulled enemies turn to face the replica and move over approximately one second. During the pull, a twitching energy line colored like the replica links the newly created replica's chest to each moving enemy.
- **Level 3:** Increase the creation Range by 1 again, to Range 4. Gain 1 Action unconditionally.

### Relocate

Exchange Spectre's position with the replica and cleanse Spectre.

- **Level 1:** Swap Spectre and the replica. Remove one negative Status Card from Spectre's Hand and gain +1 MOV.
  - Example: this is a true exchange; both destinations were already occupied by the two bodies, so neither needs to be an empty Square.
  - Refinement: the negative Status should be chosen by the Spectre player when more than one is eligible.
- **Level 2:** Spectre gains +1 ATT until the end of the turn.
  - Refinement: the bonus applies to attacks originating from either Spectre or the replica because both play Spectre's Attack Cards; confirmation is requested below.
- **Level 3:** Gain 1 Action.
  - Refinement: because playing a Perk normally costs 1 Action, this refunds that Action rather than producing a net extra Action unless another modifier changes the cost.

### Shadow Dagger

Throw a dagger to create a temporary traversal line.

- **Level 1:** Throw a dagger in a straight line to the board edge. Until turn end, Spectre may follow its trail through forbidden terrain (including characters) and gains +1 MOV. Crossing forbidden terrain costs 0 MOV. Spectre may climb Boxes along the trail and use them as High Ground.
  - Origin selection occurs before the dagger is thrown. `Tab` switches between Spectre and the replica, `Enter` confirms, and either body may also be clicked.
  - The Perk may be cancelled during origin selection or subsequent direction selection because no dagger action has executed yet. Cancellation restores the Card, Action, Perk availability, and Spell Echo arrangement to their pre-use state.
  - If no replica exists, the body-selection step is skipped and direction selection starts from Spectre immediately.
  - UI refinement: during direction selection, every Board Square lying horizontally, vertically, or diagonally from the selected body is a highlighted direction target. Terrain and Objects do not interrupt these rays because the dagger continues to the Board edge.
  - The dagger has unlimited Range within the current board and continues to the board edge.
  - The line may be horizontal, vertical, or diagonal.
  - Entering a trail Square occupied by another character, a Column, a Shield, a Tomb, the replica, or another non-Box Object costs the normal 1 MOV.
  - Leaving that occupied Square for the next trail Square costs 0 MOV. The free transition is the exit, not the entry.
  - Empty trail Squares cost normal MOV unless reached by the free exit described above. Entering a Wooden Box Square always costs normal MOV, including when the previous Square contains a character or non-Box Object.
  - Occupied trail Squares are transit-only, except that Spectre may remain on top of a Wooden Box. During movement, Spectre may temporarily enter a character, Column, Shield, Tomb, or other Object Square and continue with a later movement input.
  - If entering such a transit-only Square spends Spectre's last MOV, the client keeps or automatically restores movement selection so the free trail exit remains selectable at 0 MOV. End Turn stays disabled until Spectre leaves the occupied Square.
  - The trail temporarily overrides terrain traversal restrictions. Spectre may follow it between Squares even when the normal terrain rules forbid that transition.
  - Example: on The Trench, Spectre may climb directly from a Trench Square to adjacent High Ground when both lie along the shadow trail.
  - Future impassable transit terrain, such as a River, may be crossed while following the trail.
  - The trail does not make invalid resting terrain a legal end-of-turn position. Spectre may end the turn only on an empty legal Square or on top of a Wooden Box. For example, Spectre may temporarily enter a Column while moving but must leave it before ending the turn.
  - Spectre may end the turn on top of a Box on the trail.
  - A Box adds one local elevation level to Spectre. A Box on Low Ground puts Spectre at ordinary High Ground height; a Box on High Ground puts Spectre one level above ordinary High Ground.
  - Therefore, Spectre on a High Ground Box gains the normal +1 High Ground ATT even against a target standing on ordinary High Ground.
  - The extra Box level does not increase Attack Range or grid distance. Against a target on Low Ground, Range and terrain protection are calculated as if Spectre were simply standing on the underlying High Ground Square.
  - If that Box is destroyed, Spectre falls one level onto the underlying terrain and takes 1 falling Damage. This applies even when the Box was on High Ground and Spectre lands on High Ground rather than Low Ground.
  - The replica cannot use the trail.
  - The dagger continues along its full line, and its enemy effects resolve at the moment the moving dagger collides with each enemy model. This timing must be synchronized with the projectile animation.
  - Enemies entering the completed trail later do not receive its Level 2 or Level 3 effects.
  - Remove the entire trail immediately after Spectre's turn ends.
  - The moving dagger and Spectre's trail traversal pass through all board Objects, including Da Orkk's Shield and Wreckna's Tomb.
- **Level 2:** Steal 1 MOV from every enemy hit by the travelling dagger until the end of the turn. Each affected enemy loses 1 maximum and unspent MOV, while Spectre gains +1 maximum and unspent MOV for each affected enemy.
  - Example: hitting two enemies gives Spectre +2 MOV and gives each of those enemies -1 MOV until Spectre's turn ends.
  - This uses the same immediate “Steal MOV” adjustment principle as Wreckna's Hex: the gained MOV is immediately available, and an affected enemy's currently unspent MOV is reduced when applicable.
- **Level 3:** Every enemy hit by the travelling dagger receives 1 Damage.
  - Refinement: this is Perk Damage and should use the game's standard damage pipeline and statistics.

## Extra perks

### Consume Replica

Destroy the replica to convert it into a short offensive burst.

- **Level 1:** Destroy the replica. Gain +2 ATT until the end of the turn. Add one Headache Card to Spectre's Hand.
  - Refinement: the replica is a required cost; the Perk cannot be played if no replica exists.
- **Level 2:** Gain an additional +1 ATT until the end of the turn, for +3 ATT total.
- **Level 3:** Gain 1 Action. You may use another Perk this turn.

### Haunt

- **Level 1:** Create a replica behind each enemy character and gain +1 ATT until the end of the turn. Replace all existing replicas.
  - “Behind” is based on the enemy's current facing toward its closest living enemy, quantized to one of the eight grid directions.
  - If the directly-behind Square contains only a Wooden Box, place the replica atop it; the replica counts as being on High Ground.
  - If the directly-behind Square is outside the board or otherwise unavailable, use the available adjacent Square closest to the behind direction. Equal alternatives are resolved clockwise for deterministic play.
- **Level 2:** Every enemy reveals 1 random Card from their Hand privately to Spectre.
- **Level 3:** Gain 1 Action.

## Starting attacks

### Solitude — 2 ATT

Gain +2 ATT if the target has no adjacent Objects or characters other than Spectre and Spectre's replica.

- Columns normally count as Objects and therefore prevent the bonus. A Column or other non-Box Object currently sharing Spectre's Square because she is traversing it with Shadow Dagger is ignored together with Spectre.
- Other board Objects, allies, and enemies adjacent to the target prevent the bonus.
- Spectre and Spectre's replica are ignored when checking the target's adjacent Squares.
- Example: the target is adjacent only to the attacking replica and a Column; the Column prevents the bonus. If Spectre is currently inside that Column through Shadow Dagger, the Column is ignored and Solitude gains +2 ATT.
- Refinement: check the condition when the Attack is declared so the combat preview shows the correct ATT modifier.

### Deja Vu — 1 ATT

If Spectre controls a replica when this Attack is played, gain 1 Action and draw 1 Card. Otherwise, create a copy of Deja Vu and shuffle it into Spectre's Deck.

- Refinement: check for the replica at Attack declaration. The reward should not be lost if the replica is destroyed later in the same combat.
- The replica branch restores the Action and draws before combat resolution.
- Without a replica, the played Deja Vu is discarded normally and a new copy is immediately created and shuffled into Spectre's Deck. The Attack still costs its Action and resolves normally.

### Echo Strike — 2 ATT

After combat, the replica deals 1 Damage to every adjacent character.

- “Every adjacent character” includes enemies, allies in a 2×2 or three-player match, and Spectre.
- The replica itself is not damaged by its own pulse.
- Refinement: the pulse requires a replica at resolution unless the replica's combat-start position is meant to be remembered.
- Refinement: this should be direct Attack-card effect Damage credited to Spectre, but it is not additional combat Damage.

## Extra attacks

### Soul Strike — 3 ATT

- The enemy first chooses a Block Card or chooses to take the hit. Any intervening combat choices finish, then Soul Strike checks the Cards remaining in their Hand only once the selected defense is committed.
- If the enemy has no Cards in Hand, deal 2 additional Damage. Therefore, an enemy who uses their only Block Card receives the additional Damage.
- Otherwise, reveal 1 random Perk, Attack, or Block Card from their remaining Hand privately to Spectre. Status and Free Action Cards are not eligible for this random reveal.
- If the revealed Card is a Perk, discard it.
- If the revealed Card is an Attack, mark it. The enemy must use a marked Attack before any unmarked Attack the next time they choose to Attack.
- If the revealed Card is a Block, mark it. In later combat, only the marked Block is available; all other Block Cards are disabled. The enemy may still choose to take the hit instead.
- A marked Card may still be discarded for the Hand limit or by another effect. Its forced-use marker ends as soon as it leaves the Hand.
- The combat resolution dialogue identifies the Card Soul Strike revealed and whether it was discarded or marked.

### Displace — 3 ATT

Push the attacked enemy one Square directly away from the body that performed the Attack. If Spectre attacked, push away from Spectre; if the replica attacked, push away from the replica. If the enemy cannot be pushed, deal 1 additional Damage.

- Spectre has Attack-origin priority. If both Spectre and her replica can legally reach the chosen target, the Attack always originates from Spectre. The replica is the attacking body only when Spectre cannot legally reach the target herself.
- The push origin is captured when the Attack is declared and remains the attacking body's combat position through after-combat resolution.
- Refinement: use the general push/collision system for legal destination checks. Confirm whether a normal collision also deals collision Damage in addition to this Card's 1 extra Damage.
- A character cannot be pushed directly from a Slide or Trench Square onto High Ground. Such an uphill Displace is blocked and deals the Card's 1 extra Damage.
- The combat feed identifies the calculated destination and exact blocking reason, using Spectre or the replica according to the Attack's actual origin.

## Starting defends

### Devour — 1 DEF

Destroy a replica. Prevent all Damage, negative effects, and Status Cards from this combat. Add Headache to your Hand.

- Devour can only resolve while Spectre controls at least one replica. If there is exactly one, it is destroyed automatically. If there are several, Spectre chooses one after combat.
- Its protection covers combat Damage and negative Attack or combat effects, including forced movement, forced discards, and Status Cards. Unrelated external effects are not covered.
- The Headache created by Devour itself is the sole exception and is always added, even when the prevented Damage would have been zero.

### Split — 2 DEF

After combat, create an additional replica on an empty Square within Range 1 of Spectre. Existing replicas remain.

- The replica can attack and defend but cannot move.
- Range is measured from Spectre, and the Spectre player chooses the destination.
- Refinement: if no legal Square exists, the effect does nothing rather than delaying combat completion.

### Anguish — 2 DEF

If Spectre suffers Damage during the combat, draw one Card. After combat, you may transfer one negative Status Card from Spectre's Hand to the attacker's Hand.

- This effect is optional.
- The draw is not optional and occurs only when at least one Damage event in this combat actually reduces Spectre's HP. A fully blocked attack draws nothing. Resolve the draw before choosing a Status to transfer, so a newly drawn negative Status is eligible.
- During the choice, the controlling perspective remains Spectre's: show Spectre's Hand and only its eligible negative Status Cards. The attacker remains the opponent and must not receive visibility of Spectre's private Cards through this UI step.
- Spectre may decline using the visible continue button or Escape; either option completes Anguish and returns the game to the active phase.
- The transfer uses the shared Spectre Hand even when the replica was attacked.
- Spectre chooses which eligible negative Status Card to transfer. Eligible Cards are Pinned, Headache, Exhaust, Burning, and Panic.
- If Spectre has no eligible negative Status Card, Anguish resolves normally without transferring anything.
- Move the existing Card instance rather than creating a copy, preserving its identity and removing it from Spectre's Hand.
- Transferring the Card counts as applying a negative Status effect. Blessing: Shield or another applicable Status protection may block it; when blocked, the Card remains in Spectre's Hand.
- The transferred Status Card is immediately revealed publicly to every player, following the game's normal negative-Status visibility.
- If the attacker reaches 0 HP before Anguish resolves, skip the transfer because the match has already ended.

## Extra defends

### Dispersion — 2 DEF

After combat, deal the combat Damage Spectre received to adjacent enemies, up to a maximum of 3 Damage per enemy.

- Example: Spectre receives 2 combat Damage; each adjacent enemy receives 2 Damage. If Spectre receives 5, each receives 3.
- Refinement: only actual combat Damage received after DEF and prevention is copied; card-effect Damage is excluded.
- Deal the copied amount to every adjacent enemy, capped at 3 Damage per enemy; it is not a divided Damage pool.
- The blast is centered on the body that was attacked. If the replica defended, use the replica's adjacent Squares; if Spectre defended, use Spectre's adjacent Squares.

### Accumulate — 2 DEF

During Spectre's next turn, gain ATT equal to the combat Damage received, up to a maximum of +3 ATT.

- Example: receiving 2 combat Damage stores +2 ATT; receiving 5 stores +3 ATT.
- Refinement: the stored bonus applies for the whole next Spectre turn and then expires.
- Multiple pending Accumulate bonuses stack. Each use stores its own received-Damage amount, capped at +3 ATT, and the stored amounts are added together for Spectre's next turn.
- UI refinement: show stored Accumulate, active Accumulate, and other temporary Spectre ATT as separate status indicators under the character name. Stored Accumulate states the bonus waiting for the next turn; active Accumulate states the bonus applying to every Attack this turn; temporary ATT combines current-turn bonuses from Relocate, Consume Replica, and Haunt.
- Refinement: whether the combined stack has an overall cap and whether it applies to every Attack during that turn still require confirmation.

## Card roster and progression mapping

The design exactly matches the current 15-card character structure.

- Default nine-card set: Replicate, Relocate, Shadow Dagger, Solitude, Deja Vu, Echo Strike, Devour, Split, Anguish.
- Reserve Card: Replicate. The current opening setup guarantees the Reserve in the opening Hand.
- Attack Focus choices: Soul Strike or Displace.
- Defend Focus choices: Dispersion or Accumulate.
- Phase 1 reward: choose from the opposite focus category, matching the existing character progression.
- Phase 2 Perk choices: Consume Replica or Haunt.
- Phase 3 refinement: use the shared duplicate/remove-card flow.

The current opening setup empties all piles, shuffles the eight non-Reserve default Cards, gives two of those plus Replicate as the opening Hand, and puts the selected focus Card on top of the Deck. The second player draws one additional opening Card.

## Codebase-informed design facts

- Gridfall uses Chebyshev Range: diagonal and orthogonal adjacency both count as Range 1.
- Perks are direct Level 1 plays or occupy one of three Spell Echo positions. An Echo use resolves at that position's level, and implemented perks generally treat higher levels cumulatively.
- A player normally has two Actions, can use only one Perk action per turn, and a Perk costs one Action.
- Attacks and Defends use one shared player Hand. A replica therefore needs an explicit attack/defend origin or target field; creating a second full PlayerState would incorrectly give it HP, actions, a Hand, and a turn.
- Board Objects currently cannot defend and are attacked through an object-destruction path rather than normal character combat. The replica should therefore be a dedicated owned board entity or a first-class combat proxy, not an ordinary BoardObject without additional combat routing.
- Attack commands currently target a Player or an Object. Replica attacks need an origin choice, while attacks against a replica need a new target kind or proxy identifier.
- The +1 Base DEF bonus is currently calculated only from the defending PlayerState's position. It must be generalized to the attacked body's position for the replica rule.
- Yellow/draw Square bonuses are currently checked only against the active PlayerState's position at turn start. The existing behavior already matches the rule that a replica alone cannot grant Spectre a bonus draw, provided the replica is not represented by replacing Spectre's position.
- High Ground ATT is calculated from the player's stored position. Replica-origin attacks and Box-top movement require combat to accept an explicit origin/elevation context.
- Existing Columns are `wall-pillar` Board Objects and block normal movement and line of sight. Shadow Dagger uses a scoped movement mode in which forbidden terrain edges may be crossed and characters and Objects may be passed through. Entering an occupied character or non-Box Object Square costs normal MOV; leaving it along the trail costs 0 MOV. Wooden Box entry always costs normal MOV, and every transit-only occupied Square must be exited before the turn ends.
- The board currently stores elevation by Square, not by an entity standing on top of a Box. Box-top occupancy needs a dedicated state representation so High Ground, object destruction, falling Damage, rendering, and legal occupancy remain synchronized.
- Status support already exists for Panic and Headache. Panic is public, blocks Attacks and Perks, and is removed by Free Move; Headache is removable as an Action and cannot be discarded.
- Reveals are currently stored per Card instance as the global boolean `revealedToOpponent`. Spectre-only reveals in a three-player match therefore require viewer-specific visibility state rather than reusing the existing flag unchanged.
- After-combat effects are serialized into a deferred state and applied after both combatants acknowledge the reveal. Split, Echo Strike, Dispersion, and Accumulate should follow that timing system.
- Match statistics distinguish combat Attack Damage, Perk Damage, defensive retaliation Damage, and other Damage. Each Spectre effect needs an explicit source classification.
- Hotseat and multiplayer share `shared/game.ts`, but character identity, names, selection UI, models, tooltips, tactical advice, targeting highlights, animations, and translations also require updates in `src/main.ts`, `src/i18n.ts`, and the server event layer where animations need broadcasts.

## Open questions

### Reveals and other card timing

1. Does Relocate's ATT bonus apply to replica-origin attacks? Does its cleanse remove a player-chosen negative Status, and may Relocate be used with no negative Status in Hand?
2. How is “standing atop a Box” entered and exited? Can any character attack Spectre there, can Spectre attack normally, and can another entity occupy the underlying Box Square?
3. Does Deja Vu grant its Action and draw before combat, after combat, or only if the Attack resolves? Can the gained Action exceed the normal maximum of two?
4. For Split, does Spectre choose the replica Square after combat, and what happens if combat ends the match or no legal adjacent Square exists?
5. Does Accumulate have an overall combined ATT cap after stacking, and does the resulting bonus apply to every Attack during the next turn?

## Current implementation findings and provisional rulings

The first playable implementation uses the following precise rulings. They are recorded here so the code and design document cannot silently diverge:

- Web-only private reveals choose a random eligible unrevealed Card and store viewer-specific visibility for Spectre. Public reveals continue to use the existing global reveal flag.
- Replicate Level 2 waits 0.5 seconds after the replica appears before its pull animation begins. Enemies turn toward the replica and the energy tethers appear when the pull starts. It resolves every one-Square enemy pull before checking adjacency and adding Panic. Occupied destinations and forbidden uphill Slide edges block individual pulls. Level 3 then grants its Action unconditionally.
- Soul Strike resolves after the defender locks in a Block Card or takes the hit and all intervening combat choices are complete. It checks the remaining Hand, deals 2 additional Damage when empty, otherwise privately reveals a random eligible Perk/Attack/Block Card, and carries the revealed Card and outcome into the combat summary. Revealed Perks are discarded; revealed Attack and Block Cards remain marked until used or otherwise discarded. While a Block is marked, the UI disables every unmarked Block in later combat, while still allowing the defender to take the hit.
- Relocate's ATT applies to both Spectre- and replica-origin Attacks. Level 1 grants +1 available MOV. If negative Status Cards exist, Spectre must choose one; if none exist, the swap completes without a choice. Its extra Action may exceed two.
- Deja Vu checks for a replica when the Attack is declared. With one, it immediately restores one Action and draws one Card; without one, it immediately creates a new copy in the shuffled Deck. The restored Action may exceed two.
- Shadow Dagger first serializes a Spectre-or-replica origin choice, then measures its direction and complete trail from that selected body's captured position. `Tab` switches, `Enter` confirms, clicking either body selects it, and cancellation remains available through direction selection. Spectre may then transit through characters and all Objects while following the trail. Entering a character or non-Box Object Square—including a Column, Shield, Tomb, or the replica—costs normal MOV; the next transition leaving it along the trail costs 0 MOV. Entering a Wooden Box always costs normal MOV. The UI accepts a transit-only Square as an intermediate movement destination, but Spectre must leave it before ending the turn. A turn may end only on an empty legal Square or atop a Wooden Box.
- Shadow trail movement overrides forbidden terrain edges such as Trench-to-High-Ground ascent. The trail is retained in serialized state through the end of Spectre's turn, then the trail and its temporary MOV penalties are cleared together.
- Box-top occupancy is explicit Spectre state. Entering a Box along the trail costs normal MOV, raises the Three.js model, and adds one elevation level for Spectre-origin combat. A High Ground Box is therefore above ordinary High Ground and grants +1 ATT against ordinary High Ground targets, while Attack Range still uses the underlying Square's normal grid distance and terrain rules. Destroying the supporting Box clears that state, deals 1 falling Damage even when the underlying Square is High Ground, and immediately animates Spectre falling vertically to the underlying terrain without changing her Square.
- Haunt replaces all existing replicas, then derives each enemy's facing from its closest living enemy and creates a replica in the best available adjacent Square behind it. A Wooden Box is a legal destination and supports the replica as High Ground. Level 2 privately reveals one random Card per enemy, and Level 3 grants 1 Action.
- Relocate swaps Box-top state along with position, so Spectre inherits a Haunt replica's supporting Box and a replica moved to Spectre's former Square inherits any Box that supported Spectre there.
- Displace measures “away” from the body that originated the Attack: Spectre when she can legally reach the target, otherwise the replica when it is the only body that can reach. Spectre has priority when both bodies can reach. The serialized `attackerPosition` fixes that origin through after-combat resolution. Displace follows the general terrain restriction that a character cannot be pushed directly from a Slide or Trench Square onto High Ground. A blocked one-Square push deals exactly 1 extra card-effect Damage and does not also invoke generic collision Damage. The combat feed reports the attempted destination and whether terrain, a character, an Object, or the board edge blocked it.
- Split placement is measured from Spectre, even when a replica was attacked. It creates another replica without removing or replacing existing replicas, and combat remains pending until placement resolves.
- Accumulate's per-use storage is capped at +3, but the combined stored total is not capped. The full combined bonus applies to every Attack during Spectre's next turn and expires at its end.
- Consume Replica Level 3 restores the Action spent to use it and resets Spectre's once-per-turn Perk restriction, allowing one additional Perk this turn.
- The replica is serialized as an owned HP-less Board entity plus combat-proxy metadata. This keeps it out of turn order while allowing movement/line-of-sight blocking, Object movement effects, and combat against the owner's shared HP and Hand.
- Hotseat and multiplayer use the same command schema and shared resolver. Replica origin, target body, and both combat positions are serialized in `PendingAttack`, so reconnection and deferred combat acknowledgement preserve positional rules.

## Implementation status

- Registered Spectre, all 15 Cards, stats, starting deck, Reserve, focus choices, and perk progression.
- Added Hotseat and multiplayer character selection, trait copy, hints, procedural Three.js Spectre/replica models, replica idle motion, and a live Shadow trail ribbon.
- Implemented replica placement/replacement, shared combat, selected attack origins, attacks against replicas, Base DEF by attacked body, collision/elevation Damage routing, and private reveals.
- Implemented Replicate, Relocate, Shadow Dagger, Consume Replica, Haunt, Solitude, Deja Vu, Echo Strike, Soul Strike, Displace, Devour, Split, Anguish, Dispersion, and Accumulate.
- Added focused rule checks for character registration, card registration, replica-origin combat, attacking a replica, Devour, Shadow trail traversal/final destinations, and multi-target MOV stealing/expiry.
