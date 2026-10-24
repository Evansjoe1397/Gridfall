# Fyrebanks · Fire Mage

Current Hotseat testing setup starts with exactly five Cards: Block with Flames, Fire Shield, Summon Lens, Counterflame and Pocket Lens, the five most recently developed Cards. Earlier unique Cards (Arch Beam, Dragon Claws, Evocation, Flame Ward and Pyrodash) start in the Deck with the existing basic Cards. This temporary opening Hand supersedes the initial-Hand notes in the individual development sections below.

Hotseat-only character: 18 HP, Movement Range 2, Attack Range 2. Available for either seat, the three-player Hotseat test, and Hotseat series. Fyrebanks is excluded from online character validation/selection. His procedural model wears red robes and a wizard hat, with a gold-rimmed monocle and chain; it has idle, attack, and defense poses. Character selection and the archive include a matching SVG profile.

The Trait consists of **Focus Lens** and **Pyro Charges**. Their icons sit below the fighter's HP bar with explanations. Focus Lens explains current-combat FP in its tooltip without a point badge; Pyro Charges has a separate three-slot meter and irregularly orbiting flameballs. FP and Pyro Charges are separate resources; FP never persists between combats.

The separate [Lens Object and Summon Lens Perk](lens.md) can magnify Attacks and modify combat FP. Summon Lens Level 1 summons/replaces it on a chosen adjacent Square; Level 2 optionally pushes it 1 Square with 1 collision Damage; Level 3 arms independent Burning after the next magnified combat's two post-combat effects finish. At outgoing distance 2, only an adjacent Lens with maximum Attack Range exactly 3 grants 2 FP; every other case grants 1 FP.

For an Attack declared at distance `D` with effective maximum Attack Range `R`:

```text
FP = min(3, R − D + 1)
```

The Trait must be enabled and the target must be within Range. Range upgrades contribute to `R`. FP is recorded on that pending Attack using the involved bodies' declaration positions, including a targeted replica, and expires with the combat. Generic Attack Cards do not automatically gain ATT: only their defined FP effects spend this combat's FP.

| Maximum Range | Melee | Distance 2 | Distance 3 | Distance 4 |
| --- | --- | --- | --- | --- |
| 2 | 2 FP | 1 FP | — | — |
| 3 | 3 FP | 2 FP | 1 FP | — |
| 4 | 3 FP | 3 FP | 2 FP | 1 FP |

**Arch Beam** is an Attack Card with base Value 0 and the exact description: “Before combat: +FP to Attack. Apply Burning to target after combat.” Its FP modifier resolves in the ordered before-combat step, after defensive cancellation, and appears in the combat modifier list. Attack-effect Blocks cancel this bonus and its Burning. Heated Debate cancels only the after-combat Burning. Disabling Focus Lens yields 0 FP but does not itself cancel Arch Beam's Burning. Other normal value modifiers, such as Exhaust, still apply.

Burning is given after combat acknowledgement regardless of win, tie, or loss, using the existing forced-status rules and protections. Arch Beam does not create a Patch of Flames Square.

**Dragon Claws** is an Attack Card with base Value 2 and the exact description: “Can use only in melee Range. Before combat: Deal 1 Damage if target is Burning. After combat: Absorb flames in FP Range.” Only adjacent targets are legal, including diagonals, even after maximum Range increases. This applies to characters, replica bodies and Objects; Yamato moving out of melee evades it. A Burning Card must be in the target's Hand to trigger its single pre-combat Attack Card effect Damage. Card effect cancellation and Damage negation apply normally, and a lethal pre-combat hit ends combat cleanly.

After a resolved combat is acknowledged, Dragon Claws invokes Absorb Flames with the FP captured on that Attack as the Range override, regardless of a win, tie, or loss. The base ATT remains 2; FP changes absorption Range only. At maximum Range 4, a melee Attack still absorbs only within capped FP Range 3. Attack-effect Blocks cancel both effects; Heated Debate preserves the earlier Damage but cancels absorption. An Object Attack can still absorb from a nearby eligible source. Burning transferred by absorption grants a Pyro Charge and healing, and can trigger the third-Charge Fireball. The Card is in Fyrebanks' initial Hotseat Hand and archive.

## Pocket Lens

Pocket Lens is an Attack Card with Value 2:

> After combat: Push out yourself from the enemy in a straight line of FP Squares, then create Lens on a Square you attacked from. If you cannot push out, create Lens on the nearest vacant Square adjacent to both you and the target, if any. Return Pocket Lens to your Hand, if you didn't win this combat; otherwise: apply Burning to the target.

It uses this combat's captured FP (maximum 3) and declaration positions. Push the attacker in the opposite compass direction from the Attack; off-axis positions use the same component-sign direction as ordinary pushes. A magnified Attack retreats opposite its incoming caster-to-Lens leg, using magnified combat FP. The retreat is automatic, spends no MOV, and does not end the turn. It respects terrain, Slide entry/continuation, Patch of Flames and Ward movement hooks. Existing Fall Damage applies; this Card adds no collision Damage. Movement stops on fixed Objects, Characters, edges and forbidden Slide/Trench ascents.

On collision with a movable Object, the unused movement after that impact step transfers into the Object, continuing through movable Object chains under normal push rules. This does not push Characters or pull the attacker forward behind the Object. Boxes and other moved Objects also gain Slide continuation on entry from High Ground, including flooded Pipe water. A surviving attacker then replaces the singleton Lens on the captured starting Square if it is empty, including after partial retreat. If blocked movement/zero FP leaves that Square occupied, choose the nearest vacant Square adjacent to both Fyrebanks and the actual enemy target (the attacked replica body when applicable), counting diagonals as adjacent. Prefer shorter geometric distance from Fyrebanks, then from the target; stable coordinates settle ties. For magnified Attacks, the intermediary Lens is not the enemy target. Existing Objects, including the old Lens, exclude fallback Squares. If no candidate exists, skip creation and preserve the old Lens. A successful replacement always destroys the old Lens first, maintaining one globally.

A final Attack total greater than Defense is a win: apply Burning to the living target with normal protections. A tie, loss or missed Attack returns the exact used Card from Discard to Hand. All of these are Attack Card effects, so Blocks and Heated Debate cancel movement, Lens creation and the return/Burning branch. Burning resolves before defensive after-combat reactions such as Fire Shield. An Object Attack also retreats/creates Lens, treats destruction as victory, and cannot apply a Status Card to an Object; if the Object survives, return the Card. No new shortcuts or point counters.

`npm run check:pocket-lens` covers captured FP, both combat modes, outcome/return identity, cancellation, magnification and singleton replacement, blocked origins, Object momentum, character/Object Slide movement, Object Attacks and Fire Shield timing.

## Counterflame

Counterflame is a Defend Card with Value 2:

> Create Patch of Flames on Attacker's Square after combat. If you lost this combat or received a negative effect as a result of it - apply Burning to Attacker.

After combat it creates Patch of Flames on the attacker's current Square (the attacking replica's Square for replica-origin Attacks), including after deferred movement finishes. This happens on wins and ties too; only the direct Burning Card requires the condition below. Normal water, Column and Flood Button restrictions prevent the terrain modification without cancelling the conditional Burning. Creating fire beneath a stationary attacker does not itself grant an entry Burning Card.

Losing means the final Attack total exceeds the final Defense total. A tie alone does not trigger it. It also retaliates after actually receiving a new negative Status Card, effect Damage, forced movement, a stat/MOV reduction, lost buffs, or a forced Card/Spell Echo discard from this combat, even when the defense wins. Existing negative effects, prevented effects, and voluntarily consumed Combat Cards or The Banner do not count. Multiple qualifying conditions still apply only one Burning.

Counterflame follows Attack effects and their required choices, including deferred Pyrodash movement. Summon Lens's independent late Burning remains after both Cards' effects and cannot retroactively trigger Counterflame. Feint/Blessed Might and the attacker's Heated Debate cancel retaliation normally. Trait blocking alone does not cancel this Card. Defeated characters do not retaliate; the attacker must be alive, and normal combat status protections/copy limits apply. Protection forecasts include the deferred retaliation so Blessing: Shield remains selectable when useful. No Pyro Charges are gained from its Burning.

`npm run check:counterflame` covers both combat modes, wins/ties/losses, new/existing/prevented negative effects, ordered pre-combat Damage, forced movement/discards, deferred Pyrodash, Summon Lens ordering, effect cancellation, combat protections, defeat and the current starting Hand.

## Block with Flames

Block with Flames is a Defend Card with Value 1, included in Fyrebanks' initial Hotseat Hand and Defend archive:

> Before combat: cancel the Attack card effect. After combat: gain 1 Pyro Charge if the Attacker is Burning; otherwise, apply Burning to the Attacker.

Its cancellation uses the same ordered timing as existing Blocks: cancel both before- and after-combat Attack Card effects, including Focus Lens bonuses on Arch Beam, Dragon Claws' conditional Damage/absorption, Pyrodash movement, Hex's early MOV theft, and Attack-based cancellation of its own reward. Base Attack Value and combat Damage still resolve against its 1 DEF; it does not gain ordinary Block's Pinned effect.

The after-combat branch resolves after acknowledgement, whether combat is won, tied or lost. Check for Burning in the attacker's Hand then: if present, gain exactly 1 Charge through the shared healing/discharge rules without transferring/removing Burning or giving Burning to the defender. Otherwise apply one Burning to the attacker using normal defensive status protections; that branch grants no Charge or healing. A third Charge discharges normally and is spent even if no enemy is in Range. A blocked Pyro Trait prevents the Charge/heal reward but does not prevent the Card's cancellation or Burning branch. A defeated defender cannot be revived by the Charge reward. Heated Debate from the attacker cancels the after-combat branch while preserving the earlier Attack-effect cancellation.

## Fire Shield

Fire Shield is a Defend Card with base Value 1, included in Fyrebanks' initial Hotseat Hand and Defend archive:

> If you are Burning, Fire Shield has Value 3. Before combat: Absorb Flames. After combat: if you are Burning, apply Burning to the Attacker.

The defender's pre-combat step invokes Absorb Flames once, before Attack pre-combat effects. It uses the normal nearest-source/routed Range, Burning transfer/Patch removal, Charge, healing and third-Charge discharge rules. If this absorption puts Burning into Fyrebanks' Hand, the Card immediately becomes DEF 3 for this combat. Existing Burning also qualifies without a source to absorb; no Burning means DEF 1. The shared `defenseCardValueBonus` supplies the +2 conditional modifier to final resolution, combat-choice previews and the actual Hand display. Normal modifiers such as Exhaust, Base defense and other bonuses still apply; the archive retains its printed base Value 1. Trait blocking prevents Absorb Flames but does not disable the conditional Card value or retaliation.

After combat acknowledgement, its defensive effect checks whether Fyrebanks is still Burning and applies Burning to a living attacker with normal status protection. It does not consume Burning or grant another Charge. This defensive stage follows Attack after-combat effects: Dragon Claws may absorb the defender's last Burning first, preventing retaliation; Arch Beam may apply Burning first, enabling retaliation without retroactively changing the combat's already-resolved DEF. Heated Debate, Feint and Blessed Might can cancel the after-combat retaliation while preserving earlier absorption and DEF. Fire Shield does not cancel the Attack Card effect.

The pre-combat guard prevents repeated absorption across combat choices/resumption. If a third-Charge discharge defeats the attacker before combat, discard the Defend Card once and finish through ordinary lethal cleanup, without a stuck combat choice or duplicate reward.

## Pyrodash

Pyrodash is an Attack Card with base Value 1, available in Fyrebanks' starting Hotseat Hand and archive. After combat, dash toward the target for the FP captured at declaration, without spending MOV or ending the turn. Movement and direction choices wait for combat acknowledgement. Blocks and Heated Debate cancel the after-combat effect; a disabled Focus Lens produces no movement.

For an exactly horizontal, vertical or diagonal target, movement starts automatically. Otherwise the player chooses between the two compass directions bracketing the target by clicking a highlighted board lane. Cardinal and diagonal lanes use red and blue highlights, extending to their first obstacle; there is no direction popup. Clicking any highlighted Square chooses that heading, not a destination, and the rest of the route is automatic. The target's after-combat position determines the headings, while the original combat's FP determines distance. Object Attacks also invoke the effect, using their original target Square after destruction.

Objects, board edges and climbing to a higher elevation reflect the route without consuming distance. The user explicitly confirmed that equal-elevation and downhill travel are allowed. A diagonal collision with a face reverses the blocked component; a corner reverses both components. A straight collision reverses the direction. Thus B2 toward C1 with 3 FP traverses C1, D2, E3; C2 toward C1 traverses C1, C2, C3, provided these are empty Squares. Pyrodash ignores ordinary Slide traversal and movement costs; it cannot destroy obstacles merely by reflecting.

Every Square containing a living enemy body is free, including replicas and repeated crossings. On each pass, apply Burning if that enemy has none in Hand; otherwise deal 1 Attack Card effect Damage. This follows the user's final clarification: the first pass does not both burn and damage. Combat Damage/status protections persist through this deferred movement. New Burning grants no Pyro Charges. A second pass can damage a character burned by the first pass. Empty Squares spend the distance, and the route continues beyond the enemy rather than stopping on their Square.

Before moving, `pyrodashRoute` checks geometry, direction and remaining FP for cycles independently of enemy HP/status changes. A predicted free-movement loop uses at most two outward passes through the first enemy and returns along the route to the original Attack position; this escape permits returning to the starting elevation even when climbing would normally reflect. It overrides the remaining FP distance for that loop only. Both pass effects still respect protection; a non-Burning enemy receives Burning then up to 1 Damage, while an already Burning enemy takes up to 2 Damage. A lethal pass still allows the smoke to finish returning home. A completely blocked origin stays in place. Attack origin is captured before defensive movement, and a return Square occupied by a new obstacle or another living enemy falls back to the dash departure position.

Fyrebanks' body becomes a swirling red-and-blue procedural smoke vortex during the complete reflected route, including loops that end on the starting Square. Damage counters occur when the smoke reaches the affected Square. Patch of Flames and Flame Ward still react to the movement. This is Card movement rather than a Finishing Move: terrain Burning arrives immediately. The automatic Attack effect cannot be cancelled through regular movement undo. Visual resources and body visibility restore on completion, exit and model replacement.

## Evocation

Evocation is a leveled Perk in Fyrebanks' starting Hotseat Hand and Perk archive:

1. Draw 1 card.
2. Absorb Flames in Range.
3. Gain 1 Att Range until the end of turn. Draw a card after the next Attack.

Levels are cumulative. On a Level 3 use, apply its Range bonus **before** the Level 2 absorption, as explicitly requested: grant +1 Attack Range and queue the next-Attack draw, execute the Level 1 draw, then absorb using the updated effective Attack Range. Thus a default Range-2 Fyrebanks can absorb a source at routed Range 3 on the same activation; any third-Charge discharge also uses the increased Attack Range. Spell Echo insertion from Hand executes Level 1 only, and Echo activation follows normal cycling and action/Perk costs.

The Range bonus expires at turn end. The queued draw persists until the next played Attack and is independent of that Attack Card's effect cancellation, hit, win, tie or loss. It draws after combat acknowledgement, or after an Object Attack or lethal pre-combat resolution; an evaded Attack also consumes the reward. A Pyro discharge is not a played Attack. Each activation queues one draw; multiple activations queue multiple Cards for the next Attack. Empty Deck draws use the ordinary draw/Discard reshuffle rules. A status icon shows temporary Range and pending draws. Ordinary buff removal clears these bonuses, and undo snapshots restore them when the activation remains eligible for undo.

## Flame Ward

Flame Ward is a cumulative Perk in Fyrebanks' starting Hotseat Hand and archive:

1. Until the start of your next turn, apply Burning to the first enemy that moves within your current Attack Range and direct line of sight. Triggers once.
2. Also deal 1 Perk Damage to that enemy.
3. Gain +1 Attack Range during enemy turns until the start of your next turn. If the Ward was not triggered, gain 1 Pyro Charge when it expires.

Moving onto or through any qualifying Square triggers the Ward, including walking, Dash, Card movement, teleports (destination only), forced movement and transported replica bodies. Moving while already in Range also qualifies. Activating the Perk, standing still, or moving Fyrebanks toward a stationary enemy does not trigger it. Direct line of sight applies, including blocking Objects and elevated terrain; the Ward does not bend around obstacles. It uses current Range on each step, including other active Range bonuses. Level 3 grants no Range during Fyrebanks' own turn but covers every enemy turn in FFA.

The shield is consumed by the first eligible movement even when Perk/status protections prevent its effects. Triggering grants no Pyro Charge. The Level 3 Range bonus remains after the shield fires, while the unused-Ward reward is cancelled. An unused Ward grants a Charge and the usual 1 HP restoration at the start of the caster's next turn; this can discharge a third-Charge Fireball under the standard rules. The expired Ward's Range does not extend that discharge. Ordinary Burning acquisition still grants no Charges. Trait blocking disables the Charge reward/healing, and buff removal clears the Ward without rewarding it. Movement/Perk undo restores the Ward, Damage, Burning and projectile events together.

A procedural fire shield rotates above Fyrebanks' hat while armed. Level 3 adds a faint blue aura. On triggering, that shield contracts into a fireball launched at the moving enemy; its projectile follows the rendered character until impact, with Damage visuals linked to impact. A dedicated flame-shield status icon in the HUD and overhead strip explains Burning, Damage, duration, Range and the pending unused-Ward reward. After a Level 3 shot, its icon describes the remaining Range bonus.

## Pyro Charges and Absorb Flames

The reusable authoritative effect `absorbFlames(state, playerId, rangeOverride?)` consumes one eligible source. Dragon Claws invokes it after combat with that Attack's captured FP as its Range override. Evocation invokes it at Levels 2/3 using current Attack Range. Arch Beam retains its original effect. `flameAbsorptionSources` exposes the ordered candidates and their paths for Card targeting/previews.

Sources are living enemies with Burning in Hand (including their replica bodies) and active Patch of Flames Squares. The default Range is Fyrebanks' effective Attack Range; a Card can override it. Each candidate uses the shortest eight-direction route around sight-blocking Objects and terrain, without passing through a closed diagonal corner. Each step counts toward Range. The nearest reachable source wins; an enemy wins an equal-distance tie against a Square. Remaining ties use stable board coordinates and body IDs. Non-Burning enemies, extinguished patches and unreachable sources do not qualify.

Absorbing an enemy transfers exactly one existing Burning Card, preserving its instance and original source. Absorbing a Square deletes only its Patch of Flames overlay and creates one Burning Card in Fyrebanks' Hand. A small incoming fireball follows the reversed route from the source Square into Fyrebanks. A successful absorption grants exactly one Pyro Charge and heals 1 HP, capped by maximum HP. No valid source means no changes. Trait blocking disables absorption. Other Burning sources, including movement onto Fyrebanks' own flames, do not grant Charges or healing.

On reaching 3 Charges, all three are immediately spent. The nearest living visible enemy body within Fyrebanks' effective Attack Range receives a Fireball for 2 Damage and Burning, subject to the normal damage/status protections. Its Range is independent of an absorption override. If no enemy qualifies, Charges are still spent with no hit, as explicitly confirmed by the user. The outgoing fireball is sequenced after the incoming absorption reaches Fyrebanks; damage visuals are linked to its impact.

With his Trait active and at least 1 previously accumulated Pyro Charge still held when paying for Burning Dash, Fyrebanks retains normal Burning Damage first, then discards all held Burning Cards and grants +1 MOV per Card in addition to ordinary Dash MOV. This does not spend a Pyro Charge. He chooses his route and can end the turn manually or exhaust the movement. With zero Charges (including after a discharge), missing Charges in an older snapshot, or a blocked Trait, he uses ordinary random Burning Dash with normal Burning removal and no per-Card bonus MOV. The paid Burning/Damage cannot be refunded by cancelling Dash; ordinary movement cancellation can restore a movement segment. Patch encounters during Dash retain the shared deferred-Burning rule: new Cards arrive after turn completion and grant neither Pyro Charges nor additional Dash MOV. Other characters retain their existing Burning Dash rules.

Until the full roster and Focus/Perk choices are defined, Fyrebanks uses a temporary Hotseat test setup: Hand contains Arch Beam, Dragon Claws, Pyrodash, Block with Flames, Fire Shield, Evocation, Flame Ward, two basic Defend Cards and one basic Attack; the draw Deck has two basic Attacks and two basic Defends. He skips opening Focus, Perk Mode pools and ordinary Phase reward selection, following the incomplete-character setup path. His Attack, Defend, Perk and Burning archive entries are available.

Verification: `node --experimental-strip-types scripts/check-fyrebanks.ts` (or `npm run check:fyrebanks` where `tsx` can spawn) covers Hotseat arenas/series, online exclusion, 30 Range/distance combats in both combat modes, effect/trait cancellation, post-combat Burning, consecutive Attacks, modified Range, replica bodies, Exhaust, the model structure and the actual HUD trait composer. Browser verification remains the user's responsibility under `AGENTS.md`.

`node --experimental-transform-types scripts/check-pyro-charges.ts` (or `npm run check:pyro-charges`) checks source routing/priority, transfers and identity, healing, charge discharge and no-target spending, ordinary Burning isolation, controlled Dash, actual HUD markup and visual lifecycle. Transform-types is needed for the existing Firebolt visual's TypeScript parameter properties.

`node --experimental-strip-types scripts/check-dragon-claws.ts` (or `npm run check:dragon-claws`) checks melee restrictions and Yamato evasion, ordered conditional Damage, wins/ties/losses, Blocks and Heated Debate, Damage negation, lethal pre-combat cleanup, captured FP absorption Range/cap, third-Charge discharge, replica targets and Object Attacks in both combat modes.

`node --experimental-strip-types scripts/check-evocation.ts` (or `npm run check:evocation`) checks cumulative levels, Level 3 Range-first ordering, immediate versus queued draws, Range expiry and Focus Lens FP, later-turn persistence, effect cancellation, repeated use, discharge isolation, Objects, lethal pre-combat cleanup, evasion and undo.

`node --experimental-transform-types scripts/check-flame-ward.ts` (or `npm run check:flame-ward`) checks cumulative levels, direct LOS, traversed Squares, forced movement/replicas, cancellation and Perk undo, expiry/healing/discharge/no target, FFA duration and lethal movement, protection, actual status markup, and shield/fireball visual lifecycle.

`node --experimental-strip-types scripts/check-pyrodash.ts` (or `npm run check:pyrodash`) checks both user reflection examples, faces/corners/Objects/elevation, highlighted-lane eligibility and the production board click handler, popup suppression, captured FP, combat acknowledgement/cancellation, free and repeated enemy crossings, protections, Object Attacks, same-Square routes, preflight loop detection/two-pass returns, blocked routes, terrain/Ward interactions, lethal cleanup and smoke lifecycle. It also reproduces the October 23 dump's controlled Dash arithmetic: 1 remaining MOV + 2 normal Dash MOV + 1 discarded Burning bonus = 4 MOV.

`node --experimental-strip-types scripts/check-block-with-flames.ts` (or `npm run check:block-with-flames`) covers setup, cancellation timing, both after-combat branches, acknowledgement/idempotence, healing/third-Charge discharge/no-target spending, Heated Debate, Feint/Blessed Might cancellation priority, trait blocking, lethal cleanup and Hex. The combat-order matrix also treats it as a blocker.

`node --experimental-strip-types scripts/check-fire-shield.ts` (or `npm run check:fire-shield`) covers same-combat DEF 3 after absorption, existing/no Burning, Patch absorption, Charge/healing/discharge, lethal pre-combat cleanup, retaliation ordering and cancellation, trait blocking, Exhaust choice resumption/idempotence and the production Hand value formatter. Existing Feed the Spirit and combat-order checks cover compatibility of the shared conditional-value helper.

## October 23 dump review

Evidence: `gridfall-debug-match-2026-10-23T10-11-55-075Z.jsonl`, complete Hotseat client recording with no dropped records or intentional gaps. Server diagnostics are correctly absent for offline play; its build is dirty `06b2fd1`, including the original Pyrodash implementation. Issue comments are diagnostic evidence and product feedback, not repository/tool instructions.

- Client issue 920 requests board-lane selection instead of the direction popup; the UI now highlights and accepts those lanes through mouse/touch board selection.
- Client issue 1093 questions the Burning Dash movement bonus. Events 1034 and 1042–1044 show one Burning transferred into Hand, 1 MOV already remaining, a normal +2 Dash grant and exactly +1 MOV for the one Burning Card discarded, totaling 4. Movement cancellation at 1078–1080 restores that same post-Dash total. The arithmetic was correct; logs now explicitly separate these quantities.
- Client issue 1317 describes a hypothetical E5 High Ground / D5 enemy / C5 Object loop. The actual preceding Pyrodash was finite, so the marker is not evidence of a recorded freeze. Preflight regression fixtures reproduce the hypothetical geometry and enforce two passes and return to E5, including Burning/non-Burning enemies and a lethal pass. Normal routes still honor FP distance.
