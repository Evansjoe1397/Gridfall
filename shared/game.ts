import { z } from 'zod';
import { LORDAERON_ARENA, NAGRAND_ARENA, THE_TRENCH_ARENA, randomNagrandBoxSpawns, randomTrenchBoxSpawns, type ArenaDefinition, type ArenaId } from './arenas.ts';

export const PlayerIdSchema = z.enum(['P1', 'P2', 'P3']);
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export const CharacterIdSchema = z.enum(['shinobi', 'orkk', 'magician', 'john-christ']);
export type CharacterId = z.infer<typeof CharacterIdSchema>;
export type HotseatCharacterId = CharacterId;
export const BOARD_SIZE = 8;
export const CellSchema = z.object({ x: z.number().int().min(1).max(11), y: z.number().int().min(0).max(10) });
export type Cell = z.infer<typeof CellSchema>;
export const CardTypeIdSchema = z.enum(['attack-2', 'attack-3', 'defend-1', 'blessed-light', 'cleanse', 'repent', 'enforce', 'blessed-might', 'blessed-prayer', 'blessing-light', 'blessing-prayer', 'blessing-might', 'echo-pulse', 'fireball', 'portal', 'vicious-mockery', 'banner', 'mythril-helmet', 'boomerang', 'monarch-flush', 'preparation', 'arcane-missle', 'chain-lightning', 'magic-hand', 'shizzle', 'arcane-bolt', 'snowball-effect', 'mana-blast', 'mana-barrage', 'grimoire-cleanse', 'spellblock', 'mana-shield', 'arcane-barrier', 'counterspell', 'blink', 'light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there', 'block', 'flurry-defensive-strikes', 'calmness', 'not-a-shinobi', 'double-jump', 'higround-advantage', 'force-throw', 'force-pull', 'swiftform', 'mind-tricks', 'arkane-arow', 'arm-da-wiz', 'encourage', 'kyk', 'consume-rage', 'fistbolt', 'chain-punchin', 'teef-strike', 'chip-cast', 'shield-bash', 'knee-blast', 'da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer', 'pinned', 'headache', 'exhaust', 'burning', 'panic', 'blessed-block', 'blessing-shield', 'feed-the-spirit', 'thorns', 'blessed-swiftness', 'blessing-swiftness', 'resurrection', 'fear-the-justice', 'inner-peace', 'blessing-faith', 'mind-blast', 'spirit-guardian']);
export type CardTypeId = z.infer<typeof CardTypeIdSchema> | 'blessed-block' | 'blessing-shield' | 'feed-the-spirit' | 'thorns' | 'blessed-swiftness' | 'blessing-swiftness' | 'resurrection' | 'fear-the-justice' | 'inner-peace' | 'blessing-faith' | 'mind-blast' | 'spirit-guardian';

export const GameCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('cancel-movement'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('combat-stack-choice'), playerId: PlayerIdSchema, cardInstanceId: z.string().nullable() }),
  z.object({ type: z.literal('attack'), playerId: PlayerIdSchema, cardInstanceId: z.string(), targetId: z.string(), targetKind: z.enum(['player', 'object']).optional() }),
  z.object({ type: z.literal('play-free-action'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('blessed-prayer-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('inner-peace-status-choice'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('spirit-guardian-square'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('boomerang-target'), playerId: PlayerIdSchema, targetId: PlayerIdSchema }),
  z.object({ type: z.literal('defend'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('pass-defense'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('free-move'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('guard'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('dash'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('cancel-dash'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('play-perk'), playerId: PlayerIdSchema, cardInstanceId: z.string(), destination: z.enum(['direct', 'echo']), replaceExisting: z.boolean().optional() }),
  z.object({ type: z.literal('use-echo-perk'), playerId: PlayerIdSchema, position: z.number().int().min(1).max(3) }),
  z.object({ type: z.literal('end-dance'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('ack-combat'), playerId: PlayerIdSchema, combatExpiresAt: z.number().optional() }),
  z.object({ type: z.literal('force-throw-target'), playerId: PlayerIdSchema, targetKind: z.enum(['player', 'object']), targetId: z.string() }),
  z.object({ type: z.literal('force-throw-direction'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('force-pull-target'), playerId: PlayerIdSchema, targetKind: z.enum(['player', 'object']), targetId: z.string() }),
  z.object({ type: z.literal('arkane-arow-target'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('arm-da-wiz-choice'), playerId: PlayerIdSchema, choice: z.enum(['recall', 'create']) }),
  z.object({ type: z.literal('arm-da-wiz-target'), playerId: PlayerIdSchema, objectId: z.string() }),
  z.object({ type: z.literal('debug-teleport-object'), playerId: PlayerIdSchema, objectId: z.string(), to: CellSchema }),
  z.object({ type: z.literal('kyk-target'), playerId: PlayerIdSchema, objectId: z.string() }),
  z.object({ type: z.literal('kyk-direction'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('exhaust-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('blessing-light-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('blessing-might-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('blessing-shield-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('blessing-faith-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('feed-spirit-decision'), playerId: PlayerIdSchema, cardInstanceId: z.string().nullable() }),
  z.object({ type: z.literal('mythril-helmet-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('mana-barrage-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('cancel-targeting'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('force-disarm-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('flurry-pay'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('flurry-decline'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('flurry-enemy-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('discard-card'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('remove-status'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mana-choice'), playerId: PlayerIdSchema, consume: z.boolean() }),
  z.object({ type: z.literal('minimize-mana-choice'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('preparation-teleport'), playerId: PlayerIdSchema, objectId: z.string() }),
  z.object({ type: z.literal('blink-teleport'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('blink-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('place-character'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('choose-focus'), playerId: PlayerIdSchema, focus: z.enum(['attack', 'defend']) }),
  z.object({ type: z.literal('back-focus-choice'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('choose-focus-card'), playerId: PlayerIdSchema, cardId: CardTypeIdSchema }),
  z.object({ type: z.literal('phase-card-choice'), playerId: PlayerIdSchema, cardId: CardTypeIdSchema }),
  z.object({ type: z.literal('phase-three-operation'), playerId: PlayerIdSchema, cardInstanceId: z.string(), operation: z.enum(['duplicate', 'remove']) }),
  z.object({ type: z.literal('phase-three-finish'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('phase-card-destination'), playerId: PlayerIdSchema, destination: z.enum(['hand', 'top', 'shuffle']) }),
  z.object({ type: z.literal('fireball-target'), playerId: PlayerIdSchema, targetId: PlayerIdSchema }),
  z.object({ type: z.literal('portal-teleport'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('vicious-mockery-decision'), playerId: PlayerIdSchema, use: z.boolean() }),
  z.object({ type: z.literal('preparation-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('arcane-missle-target'), playerId: PlayerIdSchema, targetId: PlayerIdSchema }),
  z.object({ type: z.literal('chain-lightning-target'), playerId: PlayerIdSchema, targetId: PlayerIdSchema }),
  z.object({ type: z.literal('magic-hand-target'), playerId: PlayerIdSchema, targetKind: z.enum(['player', 'object']), targetId: z.string() }),
  z.object({ type: z.literal('magic-hand-direction'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('shizzle-destination'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('snowball-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mana-blast-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mana-blast-refuse'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('grimoire-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mind-tricks-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mind-tricks-finish'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('mind-tricks-enemy-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('end-turn'), playerId: PlayerIdSchema }),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;

export type Card = { id: CardTypeId; name: string; kind: 'attack' | 'defend' | 'perk' | 'status' | 'free-action'; value: number; levelEffects?: readonly string[]; effectText?: string; consumeText?: string; canDiscardForHandLimit?: boolean; cannotBeDiscarded?: boolean; canRemoveAsAction?: boolean };
export type CardInstance = { instanceId: string; cardId: CardTypeId; revealedToOpponent?: boolean; sourcePlayerId?: PlayerId };
export const CARDS: readonly Card[] = [
  { id: 'attack-2', name: 'Attack Card 1', kind: 'attack', value: 2 },
  { id: 'attack-3', name: 'Attack Card 2', kind: 'attack', value: 3 },
  { id: 'defend-1', name: 'Defend Card', kind: 'defend', value: 1 },
  { id: 'blessed-light', name: 'Blessed Light', kind: 'attack', value: 2, effectText: "Shuffle Exhaust into the target's Deck. Create Blessing: Light." },
  { id: 'cleanse', name: 'Cleanse', kind: 'attack', value: 1, effectText: "Apply a Burning Status Card to the target's Hand after combat." },
  { id: 'repent', name: 'Repent!', kind: 'attack', value: 1, effectText: 'After combat, deal 1 Damage to John and 2 Damage to each adjacent enemy.' },
  { id: 'enforce', name: 'Enforce', kind: 'attack', value: 2, effectText: "After combat, apply Panic and add Headache to the target's Hand." },
  { id: 'blessed-might', name: 'Blessed Might', kind: 'attack', value: 3, effectText: 'Cancel the played Defend Card effect unless this Attack effect is Blocked. Create Blessing: Might after combat.' },
  { id: 'blessed-prayer', name: 'Blessed Prayer', kind: 'perk', value: 1, levelEffects: ['Create Blessing: Prayer', 'Gain 1 MOV until end of turn', 'Choose and draw a Card from Discard'] },
  { id: 'blessed-block', name: 'Blessed Block', kind: 'defend', value: 2, effectText: "Before combat: cancel the played Attack Card's effect. At the beginning of John's next eligible turn, create Blessing: Shield." },
  { id: 'feed-the-spirit', name: 'Feed the Spirit', kind: 'defend', value: 0, effectText: 'After combat: if John entered Spirit Form, restore 2 Hit Points. Then, you may Remove a Blessing Card to restore 1 additional Hit Point.' },
  { id: 'thorns', name: 'Thorns', kind: 'defend', value: 2, effectText: "Deal 1 Damage to the Attacker before combat. After combat: if John entered Spirit Form, add a Burning Status Card to the Attacker's Hand." },
  { id: 'blessed-swiftness', name: 'Blessed Swiftness', kind: 'defend', value: 3, effectText: "Annul the opponent's unspent MOV. At the beginning of John's next eligible turn, create Blessing: Swiftness." },
  { id: 'resurrection', name: 'Resurrection', kind: 'defend', value: 0, effectText: "Negate all Damage and teleport to your Base. Draw 1 Card. Don't negate Damage if the teleport is impossible." },
  { id: 'fear-the-justice', name: 'Fear the Justice', kind: 'perk', value: 1, levelEffects: ['Enter Spirit Form', 'Apply Panic to each adjacent enemy', 'Affected enemies Discard 1 Defend Card'] },
  { id: 'inner-peace', name: 'Inner Peace', kind: 'perk', value: 1, levelEffects: ['Exit Spirit Form. Remove 1 negative Status Card from Hand, if possible', 'Remove 1 additional random negative Status Card, preferring Hand, then Deck, then Discard', 'Create Blessing: Faith'] },
  { id: 'mind-blast', name: 'Mind Blast', kind: 'perk', value: 1, levelEffects: ['Force target to Discard 1 Card', 'Deal 1 Damage', "Add 2 Headache Cards on top of the target's Deck"] },
  { id: 'spirit-guardian', name: 'Spirit Guardian', kind: 'perk', value: 1, levelEffects: ['Create a Guardian within Range. Remove it at the beginning of your next turn. While adjacent, gain +1 DEF and block 1 Perk Damage per Action', 'Guardian becomes an invincible Heavy Wall Object; push and pull effects move it only 1 Square', 'Adjacent enemies have -1 Attack and Defend Card Value'] },
  { id: 'blessing-light', name: 'Blessing: Light', kind: 'status', value: 1, effectText: "Decrease the value of the enemy's Defend Card by 1 in combat.", canDiscardForHandLimit: true },
  { id: 'blessing-prayer', name: 'Blessing: Prayer', kind: 'status', value: 1, effectText: 'As a Free Action: lose 1 MOV to draw 1 Card. Expires at the end of this turn.', canDiscardForHandLimit: true },
  { id: 'blessing-might', name: 'Blessing: Might', kind: 'status', value: 2, effectText: 'Apply during combat to increase the Attack Value of your played Card by 2.', canDiscardForHandLimit: true },
  { id: 'blessing-shield', name: 'Blessing: Shield', kind: 'status', value: 1, effectText: 'Absorb 1 Damage from Attack / Defend Card effects. Block 1 negative Status effect that should be applied to you in this combat.', canDiscardForHandLimit: true },
  { id: 'blessing-swiftness', name: 'Blessing: Swiftness', kind: 'status', value: 1, effectText: '+1 MOV while in Hand. Discard automatically at the end of turn if you have more than 5 Cards in Hand.', canDiscardForHandLimit: true },
  { id: 'blessing-faith', name: 'Blessing: Faith', kind: 'status', value: 1, effectText: 'Apply in combat to negate all Damage dealt to both sides. Expires at the beginning of your Turn.', canDiscardForHandLimit: true },
  { id: 'echo-pulse', name: 'Echo Pulse', kind: 'perk', value: 1, levelEffects: ['Draw 1 Card', 'Gain 1 Action', 'Restore 2 HP'] },
  { id: 'fireball', name: 'Fireball', kind: 'perk', value: 2, effectText: "Deal 2 Damage as a Perk at Range 3 and add a Burning Status Card to the target's Hand. Remove Fireball from the game after use." },
  { id: 'portal', name: 'Portal', kind: 'perk', value: 1, effectText: 'Teleport to an empty Square currently visible from the caster. Removed on use or Discard.' },
  { id: 'vicious-mockery', name: 'Vicious Mockery', kind: 'perk', value: 2, effectText: 'Optionally apply during combat for +2 ATT or DEF. Then Remove this Card from the game.' },
  { id: 'banner', name: 'The Banner', kind: 'status', value: 1, effectText: '+1 MOV while this Card is in Hand. Apply as +1 in Combat, then Remove this Card.', canDiscardForHandLimit: true },
  { id: 'mythril-helmet', name: 'Mythril Helmet', kind: 'status', value: 1, effectText: 'Apply during combat to negate all Damage. Then, Remove from the Deck.', canDiscardForHandLimit: true },
  { id: 'boomerang', name: 'Boomerang', kind: 'free-action', value: 1, effectText: 'Discard on top of your Deck. -1 MOV while not in Hand. Use as a Free Action for 1 Damage at Range 3, or automatically use as an Action for 2 Damage at melee Range 1 and Remove this Card.' },
  { id: 'monarch-flush', name: 'Monarch Flush', kind: 'free-action', value: 0, effectText: 'Play as a Free Action. All opponents Reveal their Hands. Then Remove this Card from the game.' },
  { id: 'preparation', name: 'Preparation', kind: 'perk', value: 1, levelEffects: ['Draw 1 Card', 'Gain 1 additional Mana Point', 'Draw 2 Cards, then discard 1 Card from your Hand'], effectText: 'Consume: Can swap places with a visible Object.' },
  { id: 'arcane-missle', name: 'Arcane Missile', kind: 'perk', value: 1, levelEffects: ['Deal 1 Damage to an enemy within Range 3 and line of sight', 'Can maneuver around obstacles within Range 3', 'Global Range'], effectText: 'Consume: +2 Damage.' },
  { id: 'chain-lightning', name: 'Chain Lightning', kind: 'perk', value: 1, levelEffects: ['Deal 1 Damage to an enemy in Range, then bounce to a random adjacent enemy or Object, dealing 1 Damage or destroying the Object', 'Bounce Range is 2, with line of sight calculated from the previous target', 'Bounce 2 times'], effectText: 'Consume: Bounce 4 times.' },
  { id: 'magic-hand', name: 'Magic Hand', kind: 'perk', value: 1, levelEffects: ['Throw an Object 3 Squares within Range 5', 'Global Range', 'Can push enemies; global push distance'], effectText: 'Consume: Gain 1 Action.' },
  { id: 'shizzle', name: 'Shizzle', kind: 'perk', value: 1, levelEffects: ['Dash in a direct line for up to 2 Squares; may pass through enemies and non-Wall Objects', 'Deal 1 Damage to each enemy passed through', 'Increase the maximum Dash distance by 1 Square, up to 3'], effectText: 'Consume: Complete the 2-Square Dash one Square at a time in any direction (3 Squares at Level 3). Cannot pass through Wall Objects and must finish on an empty Square.' },
  { id: 'arcane-bolt', name: 'Arcane Bolt', kind: 'attack', value: 2, effectText: 'Gain +1 ATT until the end of the turn.', consumeText: 'Consume: Gain +2 ATT until the end of the turn instead.' },
  { id: 'snowball-effect', name: 'Snowball Effect', kind: 'attack', value: 1, effectText: "Return this card to Logan's Hand.", consumeText: 'Consume: After combat, draw 1 Card, then discard 1 Card.' },
  { id: 'mana-blast', name: 'Mana Blast', kind: 'attack', value: 1, effectText: 'The target may discard 1 Card. Gain 1 Mana Point if they refuse.', consumeText: 'Consume: +2 ATT. Gain 3 MP if the target refuses to discard.' },
  { id: 'mana-barrage', name: 'Mana Barrage', kind: 'attack', value: 2, effectText: 'During combat, you may spend 1 Mana Point to deal 1 Damage to the target.', consumeText: 'Consume: Deal 2 guaranteed Damage after combat instead.' },
  { id: 'grimoire-cleanse', name: 'Grimoire Cleanse', kind: 'attack', value: 3, effectText: 'If won combat, force the target to Discard 2 Cards.', consumeText: 'Consume: Gain +1 MOV per Card discarded.' },
  { id: 'spellblock', name: 'SpellBlock', kind: 'defend', value: 2, effectText: 'Before combat: cancel the Attack Card effect. Generate Mana Points equal to the amount of Damage blocked in combat.' },
  { id: 'mana-shield', name: 'Mana Shield', kind: 'defend', value: 0, effectText: 'Generate 1 Mana Point before combat. Gain +1 Defend Value per stored Mana Point. After combat, remove 1 Mana Point per Damage blocked.' },
  { id: 'arcane-barrier', name: 'Arcane Barrier', kind: 'defend', value: 2, effectText: "Push the adjacent Attacker 1 Square away. Deal 1 Damage if they can't be pushed." },
  { id: 'counterspell', name: 'Counterspell', kind: 'defend', value: 3, effectText: "If Logan has any stored Mana Points, deal 1 Damage to the attacking Player. Place a Headache Card on top of the enemy's Deck." },
  { id: 'blink', name: 'Blink', kind: 'defend', value: 0, effectText: 'Block all damage in this combat. Remove all Mana Points. If at least 1 Mana Point was removed, Logan Teleports to a currently visible empty Square. Otherwise, discard a Card from your Hand or Deck.' },
  { id: 'light-the-saber', name: 'Light the Saber', kind: 'attack', value: 2, effectText: 'Add 1 -MOV stack.' },
  { id: 'dance-through', name: 'Dance Through', kind: 'attack', value: 2, effectText: 'After combat, move Shinobi 1 Square three times. Can move through enemies and apply 1 -MOV stack to each enemy passed through.' },
  { id: 'force-disarm', name: 'Force Disarm', kind: 'attack', value: 1, effectText: 'Force the enemy to discard 1 Attack Card. If they have no Attack Cards, reveal their Hand and add an Exhaust Card to it.' },
  { id: 'cut-them-legs', name: 'Cut Them Legs', kind: 'attack', value: 3, effectText: "Add 1 -MOV stack after combat. If this Card wins combat, return it to Shinobi's Hand." },
  { id: 'hello-there', name: 'Hello There', kind: 'attack', value: 1, effectText: "Deal 2 additional Damage per -MOV stack. After combat, add a Headache Status Card to the opponent's Hand." },
  { id: 'block', name: 'Block', kind: 'defend', value: 2, effectText: 'Before combat: cancel the Attack Card effect. Apply 1 -MOV stack to the attacker.' },
  { id: 'flurry-defensive-strikes', name: 'Flurry', kind: 'defend', value: 1, effectText: 'If Attacker is on adjacent Square, then deal 1 Damage to the Attacker before combat. You can Lose 1 HP to force the Attacker to Discard 1 Card.' },
  { id: 'calmness', name: 'Calmness', kind: 'defend', value: 0, effectText: 'Negate all damage if the attacker has -MOV stacks. Then remove your positive and negative Status Cards and effects.' },
  { id: 'not-a-shinobi', name: 'Not a Shinobi You Looking For', kind: 'defend', value: 3, effectText: 'After combat, remove all negative effects from Shinobi.' },
  { id: 'double-jump', name: 'Double Jump', kind: 'defend', value: 2, effectText: 'Add 1 DEF per -MOV stack on the attacker. After combat, move Shinobi 1 Square twice. Can move through enemies and apply 1 -MOV stack to each enemy passed through.' },
  { id: 'higround-advantage', name: 'Higround Advantage', kind: 'perk', value: 1, levelEffects: ['Draw a Card from your Deck', 'Gain Lightsaber status or extend its duration', 'Return the next Attack Card played to your Hand'] },
  { id: 'force-throw', name: 'Force Throw', kind: 'perk', value: 1, levelEffects: ['Push an Object 3 Squares within Range 4. Deal 1 Damage if it collides with an enemy', 'Increase the push distance by 1 Square', 'Can push enemies. A pushed enemy takes 1 Damage when colliding with anything; if both colliding targets are enemies, both take 1 Damage'] },
  { id: 'force-pull', name: 'Force Pull', kind: 'perk', value: 1, levelEffects: ['Pull an enemy or Object 1 Square toward Shinobi within Range 4', 'Increase Pull distance and Range by 1 Square', 'Apply 1 -MOV stack to the target'] },
  { id: 'swiftform', name: 'Swiftform', kind: 'perk', value: 1, levelEffects: ['Gain +1 MOV until your next turn. Can move through enemies', 'Gain +2 MOV instead', 'Apply 1 -MOV stack when moving through each enemy. Gain Lightsaber status at the end of the turn'] },
  { id: 'mind-tricks', name: 'Mind Tricks', kind: 'perk', value: 1, levelEffects: ['Shinobi may reveal 1 Card; then each enemy discards 1 Card', 'May reveal up to 2 Cards; then each enemy discards up to 2 Cards', "Shuffle a Headache Card into each enemy's Deck"] },
  { id: 'arkane-arow', name: 'ARKANE AROW', kind: 'perk', value: 1, levelEffects: ['Target a Square within Range 3 and throw your Shield at it. Deal 1 Damage if it collides with an enemy', '+1 Damage and throw Range', "Push an enemy 1 Square on collision. Deal 1 additional Damage if the enemy cannot be pushed"] },
  { id: 'arm-da-wiz', name: 'Arm da Wiz', kind: 'perk', value: 1, levelEffects: ['Recall a chosen Shield from anywhere on the Gaming Board or create a new one without removing existing Shields. Equip the Shield. Pull each enemy passed through 1 Square toward Da Orkk', 'Deal 1 Damage if the Shield passes through an enemy during the Recall', 'Gain 1 Rage Stack and +2 Rage Stacks for each crossed enemy'] },
  { id: 'encourage', name: 'EncouRAGE', kind: 'perk', value: 1, levelEffects: ['Draw a Card from your Deck', 'Gain 1 Rage stack', 'Also draw 1 random Card from your Discard'] },
  { id: 'kyk', name: 'Kyk', kind: 'perk', value: 1, levelEffects: ['Push an adjacent Object or enemy 3 Squares. Enemy collisions deal 1 Damage; remaining movement transfers to the collided target when possible', 'Increase the push distance by 1 Square', 'Deal 3 Damage on collision, but destroy the pushed Object'] },
  { id: 'consume-rage', name: 'Consume Rage', kind: 'perk', value: 1, levelEffects: ['Consume 2 Rage Stacks to heal 1 HP', '+1 HP', 'Add Exhaust Card to each adjacent enemy Hand. Remove all negative Status Cards'] },
  { id: 'fistbolt', name: 'Fistbolt', kind: 'attack', value: 2, effectText: 'If Da Orkk has no Rage, generate 1 Rage Stack before combat. Generate 1 Rage Stack after combat.' },
  { id: 'chain-punchin', name: 'Chain Punchin', kind: 'attack', value: 1, effectText: 'Generate an extra Action if the Shield was not equipped before combat; otherwise, drop the Shield and draw a Card after combat.' },
  { id: 'teef-strike', name: 'Teef Strike', kind: 'attack', value: 1, effectText: "After combat, add an Exhaust Status Card to the enemy's Hand and force them to discard 1 Defend Card." },
  { id: 'chip-cast', name: 'Chip-cast', kind: 'attack', value: 2, effectText: "Add 1 Headache per Rage Stack to the enemy's Discard. Then shuffle all Exhaust and Headache Cards into that enemy's Deck." },
  { id: 'shield-bash', name: 'Shield Bash', kind: 'attack', value: 2, effectText: 'Recall and equip the nearest Shield if one is unequipped. Deal 3 Damage if the Shield passes through an enemy while being Recalled. Otherwise, generate 1 Rage Stack after combat.' },
  { id: 'knee-blast', name: 'Knee Blast', kind: 'attack', value: 3, effectText: "After combat, push the enemy X Squares, where X is the number of Rage Stacks. Add 1 Headache Card to the enemy's Hand if they collide with anything." },
  { id: 'da-blokk', name: 'Da Blokk', kind: 'defend', value: 1, effectText: 'Cancel the Attack Card effect. Generate 2 Rage Stacks if Da Orkk receives Damage in this combat.' },
  { id: 'double', name: 'Double!', kind: 'defend', value: 1, effectText: "Double all Rage received during this combat and for the remainder of the attacking Player's turn." },
  { id: 'arcane-shield', name: 'Arcane Shield', kind: 'defend', value: 2, effectText: 'Recall the nearest Shield if one is unequipped. Deal 2 Damage to an enemy if the Shield goes through them while Recalled.' },
  { id: 'countaspell', name: 'CountaSpell', kind: 'defend', value: 3, effectText: "After combat, add 1 Headache Card per Rage Stack to the attacking enemy's Discard Deck." },
  { id: 'mana-baryer', name: 'Mana Baryer', kind: 'defend', value: 2, effectText: 'Defend Value is 5 if Shield is equipped. Otherwise, Recall the nearest Shield and deal 2 Damage to any enemy it passes through.' },
  { id: 'pinned', name: 'Pinned', kind: 'status', value: 1, effectText: "While this Card is in your Hand, decrease your Character's movement Range by 1. Remove 1 Pinned Card at the end of your turn, except a Pinned Card gained during that same turn. Cannot be discarded due to overstacking." },
  { id: 'headache', name: 'Headache', kind: 'status', value: 0, effectText: 'This Card does nothing except fill your Hand. Can be Removed as an Action. Cannot be Discarded.', cannotBeDiscarded: true, canRemoveAsAction: true },
  { id: 'exhaust', name: 'Exhaust', kind: 'status', value: 0, effectText: 'Your Cards have -1 Attack and Defend Value. Can be Discarded normally. Can be Removed by attaching it to a played Attack or Defend Card during combat for -3 Value.', canDiscardForHandLimit: true },
  { id: 'burning', name: 'Burning', kind: 'status', value: 0, effectText: 'Receive 1 Damage at the end of your turn if Burning remains in Hand. Cannot be Discarded or Removed normally. Performing Dash deals this Damage first, then Removes Burning and spends all Dash movement through random legal adjacent empty Squares.', cannotBeDiscarded: true },
  { id: 'panic', name: 'Panic', kind: 'status', value: 0, effectText: "Can't use Attack or Perk Cards while this Status is in Hand. Free Move Removes all Panic, then spends all currently available movement through random legal adjacent empty Squares.", cannotBeDiscarded: true },
] as const;
// Add Obi Wan Shinobi's unique cards here in creation order. His newest three
// cards become the test opening Hand; older cards remain in his Deck.
const OBI_WAN_CARD_IDS: readonly CardTypeId[] = ['light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there', 'block', 'flurry-defensive-strikes', 'calmness', 'not-a-shinobi', 'double-jump', 'higround-advantage', 'force-throw', 'force-pull', 'swiftform', 'mind-tricks'];
const DA_ORKK_STARTING_PERK_IDS: readonly CardTypeId[] = ['arkane-arow', 'arm-da-wiz', 'encourage', 'kyk', 'consume-rage'];
const DA_ORKK_CARD_IDS: readonly CardTypeId[] = [...DA_ORKK_STARTING_PERK_IDS, 'fistbolt', 'chain-punchin', 'teef-strike', 'shield-bash', 'knee-blast', 'da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer'];
const LOGAN_CARD_IDS: readonly CardTypeId[] = ['preparation', 'arcane-missle', 'chain-lightning', 'magic-hand', 'shizzle', 'arcane-bolt', 'snowball-effect', 'mana-blast', 'mana-barrage', 'grimoire-cleanse', 'spellblock', 'mana-shield', 'arcane-barrier', 'counterspell', 'blink'];
const JOHN_CHRIST_CARD_IDS: readonly CardTypeId[] = ['blessed-light', 'cleanse', 'repent', 'enforce', 'blessed-might', 'blessed-prayer', 'blessed-block', 'feed-the-spirit', 'thorns', 'blessed-swiftness', 'resurrection', 'fear-the-justice', 'inner-peace', 'mind-blast', 'spirit-guardian'];

type StartingDeckDefinition = { defaults: CardTypeId[]; reserve: CardTypeId; attackFocus: CardTypeId[]; defendFocus: CardTypeId[]; perkPhase: CardTypeId[] };
export const STARTING_DECKS: Record<'shinobi' | 'orkk' | 'magician' | 'john-christ', StartingDeckDefinition> = {
  shinobi: {
    defaults: ['light-the-saber', 'dance-through', 'force-disarm', 'block', 'flurry-defensive-strikes', 'calmness', 'force-throw', 'force-pull', 'higround-advantage'],
    reserve: 'higround-advantage', attackFocus: ['cut-them-legs', 'hello-there'], defendFocus: ['not-a-shinobi', 'double-jump'], perkPhase: ['swiftform', 'mind-tricks'],
  },
  orkk: {
    defaults: ['fistbolt', 'teef-strike', 'chain-punchin', 'da-blokk', 'double', 'arcane-shield', 'arkane-arow', 'arm-da-wiz', 'encourage'],
    reserve: 'encourage', attackFocus: ['shield-bash', 'knee-blast'], defendFocus: ['countaspell', 'mana-baryer'], perkPhase: ['kyk', 'consume-rage'],
  },
  magician: {
    defaults: ['arcane-bolt', 'mana-blast', 'snowball-effect', 'spellblock', 'mana-shield', 'arcane-barrier', 'shizzle', 'magic-hand', 'preparation'],
    reserve: 'preparation', attackFocus: ['mana-barrage', 'grimoire-cleanse'], defendFocus: ['counterspell', 'blink'], perkPhase: ['arcane-missle', 'chain-lightning'],
  },
  'john-christ': {
    defaults: ['cleanse', 'blessed-light', 'repent', 'blessed-block', 'feed-the-spirit', 'thorns', 'blessed-prayer', 'fear-the-justice', 'inner-peace'],
    reserve: 'blessed-prayer', attackFocus: ['enforce', 'blessed-might'], defendFocus: ['blessed-swiftness', 'resurrection'], perkPhase: ['mind-blast', 'spirit-guardian'],
  },
};

export type PlayerState = {
  id: PlayerId; name: string; character: 'shinobi' | 'orkk' | 'magician' | 'john-christ' | 'dummy'; hp: number; maxHp: number; moveRange: number; attackRange: number; position: Cell;
  deck: CardInstance[]; hand: CardInstance[]; discard: CardInstance[];
  knownTopCardId: CardTypeId | null;
  spellEcho: [CardInstance | null, CardInstance | null, CardInstance | null];
  actionsRemaining: number; perkUsed: boolean; freeMoveUsed: boolean; movementRemaining: number;
  movedThisTurn: boolean; lightsaberBuff: boolean; lightsaberStacks: number; lightsaberMovementProtection: boolean; highgroundAdvantageBuff: boolean;
  pinnedStacks: number; pinnedGainedThisTurn: number; turnEndPinnedRemoved: boolean; swiftformMoveBonus: number; grimoireMoveBonus: number; swiftformCanPassEnemies: boolean; swiftformPinsPassedEnemies: boolean; swiftformLightsaberAtTurnEnd: boolean; swiftformEnemyUnderfoot: PlayerId | null; swiftformPinnedEnemyIds: PlayerId[];
  movementAnnulledByBlessedSwiftness: boolean;
  rageStacks: number; shieldEquipped: boolean; rageGainLocked: boolean; doubleRageUntilEnemyTurnEnd: boolean;
  manaPoints: number; manaMode: 'generate' | 'consume'; manaConsumeEventId: string | null; arcaneBoltAttackBonus: number; damagedDuringEnemyTurn: boolean;
  spiritForm: boolean; spiritEnemyUnderfoot: PlayerId | null; spiritObjectUnderfoot: string | null; spiritSiphonedEnemyIds: PlayerId[]; spiritSiphonedMovement: number; johnCumulativeMovementRemaining: number; spiritMovementDepleted: boolean; spiritMovementSpentThisTurn: boolean; stoicShell: boolean; stoicShellStacks: number; queuedBlessingCardIds: CardTypeId[]; stoicShellHealedTurn: number | null; stoicShellHealEventId: string | null; stoicShellHealAmount: number;
  visualMovement?: { from: Cell; path: Cell[]; triggerAnimationId?: string; triggerRouteProgress?: number };
  visualMovementCause?: 'voluntary' | 'own-card' | 'enemy-ability';
  matchStats?: MatchStats;
};
export type MatchStats = { squaresMoved: number; attackDamage: number; perkDamage: number; defensiveRetaliationDamage: number; totalDamage: number; hitPointsHealed: number; combatDamageBlocked: number };
export type CombatModifier = { value: number; source: string };
export type PendingAttack = { attackerId: PlayerId; defenderId: PlayerId; cardId: CardTypeId; cardInstanceId: string; attackValue: number; attackModifiers?: CombatModifier[]; returnToHandAfterCombat: boolean; shieldEquippedAtStart?: boolean; rageSpent?: number; generatesMana?: boolean; attackerWasInSpiritForm?: boolean; grimoireDiscardsRemaining?: number; manaShieldManaGenerated?: boolean; manaBarrageManaApplied?: boolean; blessingLightApplied?: boolean; blessingMightApplied?: boolean; blessingShieldApplied?: boolean; blessingShieldPlayerId?: PlayerId; blessingShieldPlayerIds?: PlayerId[]; blessingShieldStatusPlayerIds?: PlayerId[]; blessingFaithApplied?: boolean; blessingFaithDecidedPlayerIds?: PlayerId[]; blessedBlockResolved?: boolean; blessedSwiftnessResolved?: boolean; blessingShieldHeldBeforeBlessedBlock?: boolean; feedSpiritOffered?: boolean; resurrectionNegatesDamage?: boolean; mythrilHelmetApplied?: boolean; combatStackResolved?: boolean; combatStackPreCombatResolved?: boolean; combatStackDefenseCommand?: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; combatStackDefenderAttachedExhaust?: boolean; combatStackDefenderMockery?: boolean; combatStackDefenderBanner?: boolean; combatStackApplied?: Partial<Record<PlayerId, CardTypeId[]>> };
export type BoardObject = { id: string; name: string; hp: number; maxHp: number; position: Cell; kind?: 'wooden-box' | 'orkk-shield' | 'wall-pillar' | 'spirit-guardian'; ownerId?: PlayerId; guardianLevel?: number; heavy?: boolean };
export type ObjectPushAnimation = { id: string; objectId: string; from: Cell; to: Cell; dx: number; dy: number; collided: boolean; path?: Cell[]; collisionAt?: Cell; collisionTargetKind?: 'player' | 'object'; collisionTargetId?: string; removeOnComplete?: boolean; destroy?: boolean; attackAnimationPlayerId?: PlayerId; equipPlayerId?: PlayerId; teleport?: boolean; parachute?: boolean; damage?: { playerId: PlayerId; amount: number; collision: boolean; triggerAnimationId?: string; triggerRouteProgress?: number }; healing?: { playerId: PlayerId; amount: number } };
export type SpellProjectile = { id: string; casterId: PlayerId; targetId: string; from: Cell; to: Cell; path: Cell[]; count: number; damage: number; style?: 'missile' | 'lightning' | 'boomerang' | 'holy-fire' };
export type GamePhase = 'active' | 'choosing-spirit-guardian-square' | 'choosing-boomerang-target' | 'choosing-focus' | 'choosing-focus-card' | 'choosing-phase-card' | 'choosing-phase-three-card' | 'choosing-phase-destination' | 'choosing-base-placement' | 'choosing-mana-mode' | 'choosing-preparation-teleport' | 'choosing-blink-teleport' | 'choosing-blink-discard' | 'choosing-preparation-discard' | 'choosing-blessed-prayer-discard' | 'choosing-arcane-missle-target' | 'choosing-chain-lightning-target' | 'choosing-magic-hand-target' | 'choosing-magic-hand-direction' | 'choosing-shizzle-destination' | 'shizzle-move' | 'choosing-fireball-target' | 'choosing-portal-target' | 'choosing-snowball-discard' | 'mana-blast-offer' | 'choosing-grimoire-discard' | 'defending' | 'choosing-combat-stack' | 'choosing-exhaust' | 'choosing-vicious-mockery' | 'choosing-blessing-light' | 'choosing-blessing-might' | 'choosing-blessing-faith' | 'choosing-mythril-helmet' | 'choosing-mana-barrage' | 'choosing-guard-discard' | 'choosing-dash-discard' | 'choosing-end-discard' | 'choosing-force-disarm-discard' | 'choosing-force-throw-target' | 'choosing-force-throw-direction' | 'choosing-force-pull-target' | 'choosing-arkane-arow-target' | 'choosing-arm-da-wiz-choice' | 'choosing-arm-da-wiz-target' | 'choosing-kyk-target' | 'choosing-kyk-direction' | 'choosing-mind-tricks-discard' | 'choosing-mind-tricks-enemy-discard' | 'flurry-offer' | 'choosing-flurry-enemy-discard' | 'dashing' | 'dance-through' | 'double-jump' | 'finished';
export type CombatReveal = { attackCardId: CardTypeId; defendCardId: CardTypeId | null; attackBase: number; attackTotal: number; defendBase: number; defendTotal: number; attackModifiers?: CombatModifier[]; defendModifiers?: CombatModifier[]; combatWinnerId?: PlayerId; combatDamage?: number; combatStackApplied?: Partial<Record<PlayerId, CardTypeId[]>>; expiresAt: number; acknowledged: PlayerId[]; deferredAfterCombatState?: string; exhaust?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; eligible: PlayerId[]; decided: PlayerId[]; attached: PlayerId[]; defenderMockery: boolean }; viciousMockery?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; eligible: PlayerId[]; decided: PlayerId[]; applied: PlayerId[] }; manaBarrage?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; playerId: PlayerId }; blessingLight?: { defenseCommand: Extract<GameCommand, { type: 'defend' }>; playerId: PlayerId }; blessingMight?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; playerId: PlayerId }; blessingFaith?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; playerId: PlayerId }; mythrilHelmet?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; playerId: PlayerId } };
export type DamageLogEntry = { eventType: 'damage' | 'healing'; turn: number; targetId: PlayerId; sourceId: PlayerId; sourceKind: 'attack' | 'perk' | 'defense' | 'other'; amount: number; hpAfter: number; collision: boolean };
export type PerkTargetingUndo = { deck: CardInstance[]; hand: CardInstance[]; discard: CardInstance[]; spellEcho: [CardInstance | null, CardInstance | null, CardInstance | null]; actionsRemaining: number; perkUsed: boolean; manaPoints: number };
export type GameState = { boardSize: number; turn: number; activePlayerId: PlayerId; phase: GamePhase; players: Record<PlayerId, PlayerState>; objects: BoardObject[]; elevations: Record<string, number>; objectPushAnimations: ObjectPushAnimation[]; spellProjectiles: SpellProjectile[]; pendingAttack: PendingAttack | null; combatReveal: CombatReveal | null; boomerang?: { casterId: PlayerId; cardInstanceId: string } | null; movementUndo?: { playerId: PlayerId; stateJson: string; actionsRemaining: number; perkUsed: boolean } | null; dashCancellation: { previousMovementRemaining: number; discardedCard: CardInstance | null } | null; danceThrough: { playerId?: PlayerId; stepsRemaining: number; enemyUnderfoot: PlayerId | null; damagePrevented: boolean } | null; doubleJump: { playerId: PlayerId; stepsRemaining: number; enemyUnderfoot: PlayerId | null; resumePhase: GamePhase } | null; forceThrow: { casterId: PlayerId; level: number; distance: number; targetRange: number; targetKind: 'player' | 'object' | null; targetId: string | null; undo: PerkTargetingUndo | null } | null; forcePull: { casterId: PlayerId; level: number; distance: number; targetRange: number; undo: PerkTargetingUndo | null } | null; arkaneArow: { casterId: PlayerId; level: number; range: number; undo: PerkTargetingUndo | null } | null; armDaWiz: { casterId: PlayerId; level: number; range: number; canCreate: boolean; canRecall: boolean; undo: PerkTargetingUndo | null } | null; preparation: { casterId: PlayerId; consume: boolean; undo: PerkTargetingUndo | null } | null; arcaneMissle: { casterId: PlayerId; level: number; damage: number; undo: PerkTargetingUndo | null } | null; chainLightning: { casterId: PlayerId; level: number; bounces: number; bounceRange: number; undo: PerkTargetingUndo | null } | null; magicHand: { casterId: PlayerId; level: number; distance: number; consume: boolean; targetKind: 'player' | 'object' | null; targetId: string | null; undo: PerkTargetingUndo | null } | null; shizzle: { casterId: PlayerId; level: number; stepsRemaining: number; consume: boolean; enemyUnderfoot: PlayerId | null; started: boolean; undo: PerkTargetingUndo | null } | null; mindTricks: { casterId: PlayerId; level: number; maxDiscards: number; discarded: number; revealedInstanceIds: string[]; enemyId: PlayerId; enemyDiscardsRemaining: number; undo: PerkTargetingUndo | null } | null; forceDisarm: { targetId: PlayerId; cardKind?: 'attack' | 'defend'; source?: 'force-disarm' | 'teef-strike' } | null; flurry: { defenderId: PlayerId; attackerId: PlayerId; resumePhase: GamePhase; remainingEnemyDiscards: number } | null; pendingManaChoice: PlayerId | null; winner: PlayerId | null; log: string[] };
export type CommandResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };

let instanceSequence = 0;
const discardBaselineByCommand = new WeakMap<GameState, Partial<Record<PlayerId, Set<string>>>>();
function createInitialStateWithPlaceholder(lineup: 'orkk-vs-dummy' | 'shinobi-vs-orkk' = 'orkk-vs-dummy'): GameState {
  const legacy = lineup === 'shinobi-vs-orkk';
  const p1 = createPlayer('P1', legacy ? 'Obi Wan Shinobi' : 'Da Orkk', legacy ? 'shinobi' : 'orkk', { x: 1, y: 3 });
  const p2 = createPlayer('P2', legacy ? 'Da Orkk' : 'Obi Wan Shinobi', legacy ? 'orkk' : 'shinobi', { x: BOARD_SIZE, y: 4 });
  if (legacy) drawCards(p1, 3);
  else p2.hand.push(...p2.deck.splice(0));
  const lineupLog = legacy ? [`Da Orkk enters with his spiked iron shield equipped.`, `Obi Wan Shinobi drew an opening Hand of ${p1.hand.length} cards.`] : [`Nagrand Arena loaded: an 8 by 8 battlefield.`, `Da Orkk and Obi Wan Shinobi each enter with all 15 unique Cards in Hand.`];
  const boxSpawns = randomNagrandBoxSpawns();
  const objects: BoardObject[] = [
    ...NAGRAND_ARENA.pillars.map((label, index) => ({ id: `nagrand-pillar-${index + 1}`, name: 'Wooden Pillar', kind: 'wall-pillar' as const, hp: 999, maxHp: 999, position: cellFromLabel(label) })),
    ...[...NAGRAND_ARENA.boxes, ...boxSpawns].map((label, index) => ({ id: `nagrand-box-${index + 1}`, name: 'Wooden Box', kind: 'wooden-box' as const, hp: 3, maxHp: 3, position: cellFromLabel(label) })),
  ];
  const elevations = Object.fromEntries(NAGRAND_ARENA.highground.map((label) => [label, 1]));
  return { boardSize: BOARD_SIZE, turn: 1, activePlayerId: 'P1', phase: 'active', objects, elevations, objectPushAnimations: [], spellProjectiles: [], pendingAttack: null, combatReveal: null, dashCancellation: null, danceThrough: null, doubleJump: null, forceThrow: null, forcePull: null, arkaneArow: null, armDaWiz: null, preparation: null, arcaneMissle: null, chainLightning: null, magicHand: null, shizzle: null, mindTricks: null, forceDisarm: null, flurry: null, pendingManaChoice: null, winner: null, players: { P1: p1, P2: p2, P3: p2 }, log: [...lineupLog, 'Nagrand Arena test duel initialized. Player 1 begins.'] };
}

export function createInitialState(lineup: 'orkk-vs-dummy' | 'shinobi-vs-orkk' = 'orkk-vs-dummy'): GameState {
  const state = createInitialStateWithPlaceholder(lineup);
  delete (state.players as Partial<Record<PlayerId, PlayerState>>).P3;
  (state as GameState & { roundFirstPlayerId?: PlayerId }).roundFirstPlayerId = 'P1';
  return state;
}

export function createHotseatTestState(includeAllCharacterCards = false, playerCharacter: HotseatCharacterId = 'magician', playerCount: 2 | 3 = 3, opponentCharacter: HotseatCharacterId | 'dummy' = 'dummy'): GameState {
  const state = createInitialState();
  const characterName = playerCharacter === 'orkk' ? 'Da Orkk' : playerCharacter === 'shinobi' ? 'Obi Wan Shinobi' : playerCharacter === 'john-christ' ? 'John Christ' : 'Long Hat Logan';
  if (playerCount === 2) {
    const opponentName = opponentCharacter === 'orkk' ? 'Da Orkk' : opponentCharacter === 'shinobi' ? 'Obi Wan Shinobi' : opponentCharacter === 'magician' ? 'Long Hat Logan' : opponentCharacter === 'john-christ' ? 'John Christ' : 'Test Dummy';
    state.players.P1 = createPlayer('P1', characterName, playerCharacter, cellFromLabel(NAGRAND_ARENA.startingSquares.P1!));
    state.players.P2 = createPlayer('P2', opponentName, opponentCharacter, cellFromLabel(NAGRAND_ARENA.startingSquares.P2!));
    delete (state.players as Partial<Record<PlayerId, PlayerState>>).P3;
    if (opponentCharacter === 'dummy') drawCards(state.players.P2, 5);
    state.activePlayerId = 'P1';
    state.log = [`${characterName} faces ${opponentName} in a 1 versus 1 hotseat match.`, 'Nagrand Arena hotseat duel initialized.'];
    if (!includeAllCharacterCards) {
      const setupPlayers = (opponentCharacter === 'dummy' ? ['P1'] : ['P1', 'P2']) as PlayerId[];
      if (setupPlayers.length > 0) beginOpeningSetup(state, setupPlayers, 'active');
    }
    return state;
  }
  state.boardSize = LORDAERON_ARENA.height;
  state.objects = [
    ...LORDAERON_ARENA.pillars.map((label, index) => ({ id: `lordaeron-pillar-${index + 1}`, name: 'Wooden Pillar', kind: 'wall-pillar' as const, hp: 999, maxHp: 999, position: cellFromLabel(label) })),
    ...LORDAERON_ARENA.boxes.map((label, index) => ({ id: `lordaeron-box-${index + 1}`, name: 'Wooden Box', kind: 'wooden-box' as const, hp: 3, maxHp: 3, position: cellFromLabel(label) })),
  ];
  state.elevations = Object.fromEntries(LORDAERON_ARENA.highground.map((label) => [label, 1]));
  state.players.P1 = createPlayer('P1', characterName, playerCharacter, cellFromLabel(LORDAERON_ARENA.startingSquares.P1!));
  state.players.P2 = createPlayer('P2', 'Test Dummy', 'dummy', cellFromLabel(LORDAERON_ARENA.startingSquares.P2!));
  drawCards(state.players.P2, 5);
  state.players.P3 = createPlayer('P3', 'Test Dummy 2', 'dummy', cellFromLabel(LORDAERON_ARENA.startingSquares.P3!));
  drawCards(state.players.P3, 5);
  state.activePlayerId = 'P1';
  state.log = [`${characterName} faces two Test Dummies in a three-player hotseat match.`, 'Lordaeron Arena hotseat test initialized.'];
  if (!includeAllCharacterCards) beginOpeningSetup(state, ['P1'], 'active');
  return state;
}

// Kept separate from the current arena-selection flow until that UI is updated.
export function createTrenchTestState(includeAllCharacterCards = false, playerCharacter: HotseatCharacterId = 'magician', opponentCharacter: HotseatCharacterId | 'dummy' = 'dummy'): GameState {
  const state = createHotseatTestState(includeAllCharacterCards, playerCharacter, 2, opponentCharacter);
  const boxSpawns = randomTrenchBoxSpawns();
  (state as GameState & { arenaId?: ArenaId }).arenaId = THE_TRENCH_ARENA.id;
  state.boardSize = THE_TRENCH_ARENA.height;
  state.objects = [
    ...THE_TRENCH_ARENA.pillars.map((label, index) => ({
      id: `trench-column-${index + 1}`, name: 'Trench Column', kind: 'wall-pillar' as const,
      hp: 999, maxHp: 999, position: cellFromLabel(label),
    })),
    ...boxSpawns.map((label, index) => ({
      id: `trench-box-${index + 1}`, name: 'Wooden Box', kind: 'wooden-box' as const,
      hp: 3, maxHp: 3, position: cellFromLabel(label),
    })),
  ];
  state.elevations = Object.fromEntries(THE_TRENCH_ARENA.highground.map((label) => [label, 1]));
  state.players.P1.position = cellFromLabel(THE_TRENCH_ARENA.startingSquares.P1!);
  state.players.P2.position = cellFromLabel(THE_TRENCH_ARENA.startingSquares.P2!);
  state.log = ['The Trench loaded: an 8 by 8 battlefield with 4 Boxes.', `${state.players.P1.name} starts at D1; ${state.players.P2.name} starts at E8.`];
  return state;
}

export function createMultiplayerState(characters: Record<PlayerId, CharacterId>, arenaId: Extract<ArenaId, 'nagrand' | 'trench'> = 'nagrand'): GameState {
  // Reuse Nagrand's terrain setup while keeping its deliberately oversized test
  // hands completely separate from a real multiplayer match.
  const state = createInitialState();
  (state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack = true;
  const arena = arenaId === 'trench' ? THE_TRENCH_ARENA : NAGRAND_ARENA;
  const characterName = (character: CharacterId) => character === 'orkk' ? 'Da Orkk' : character === 'magician' ? 'Long Hat Logan' : character === 'john-christ' ? 'John Christ' : 'Obi Wan Shinobi';
  (state as GameState & { arenaId?: ArenaId }).arenaId = arena.id;
  state.boardSize = arena.height;
  state.objects = arena.id === 'trench'
    ? [
      ...arena.pillars.map((label, index) => ({ id: `trench-column-${index + 1}`, name: 'Trench Column', kind: 'wall-pillar' as const, hp: 999, maxHp: 999, position: cellFromLabel(label) })),
      ...randomTrenchBoxSpawns().map((label, index) => ({ id: `trench-box-${index + 1}`, name: 'Wooden Box', kind: 'wooden-box' as const, hp: 3, maxHp: 3, position: cellFromLabel(label) })),
    ]
    : state.objects;
  state.elevations = Object.fromEntries(arena.highground.map((label) => [label, 1]));
  state.players.P1 = createPlayer('P1', characterName(characters.P1), characters.P1, cellFromLabel(arena.startingSquares.P1!));
  state.players.P2 = createPlayer('P2', characterName(characters.P2), characters.P2, cellFromLabel(arena.startingSquares.P2!));
  state.activePlayerId = Math.random() < 0.5 ? 'P1' : 'P2';
  (state as GameState & { roundFirstPlayerId?: PlayerId }).roundFirstPlayerId = state.activePlayerId;
  state.log = [`${state.players.P1.name} and ${state.players.P2.name} enter ${arena.name}.`, `${state.players[state.activePlayerId].name} won the opening turn roll.`];
  beginOpeningSetup(state, ['P1', 'P2'], 'active');
  return state;
}

export type LordaeronPlacementState = {
  order: PlayerId[];
  currentIndex: number;
  availableBaseIds: ('P1' | 'P2' | 'P3')[];
  claims: Partial<Record<PlayerId, 'P1' | 'P2' | 'P3'>>;
};
export type LordaeronGameState = GameState & { lordaeronPlacement?: LordaeronPlacementState };
export type OpeningSetupState = {
  pendingPlayerIds: PlayerId[];
  focusByPlayer: Partial<Record<PlayerId, 'attack' | 'defend'>>;
  after: 'active' | 'placement';
  firstPlayerId: PlayerId;
  secondPlayerId?: PlayerId;
};
export type GameStateWithOpening = LordaeronGameState & { openingSetup?: OpeningSetupState };
type GameStateWithRound = GameState & { roundFirstPlayerId?: PlayerId };
export type ActionQuestDefinition = {
  id: string;
  name: string;
  condition: string;
  reward: string;
  durationRounds: number;
  determineWinners?: (state: GameState, progress: Partial<Record<PlayerId, number>>) => PlayerId[];
  grantReward?: (state: GameState, winnerId: PlayerId) => void;
};
function progressLeaders(state: GameState, progress: Partial<Record<PlayerId, number>>): PlayerId[] {
  const alive = (Object.keys(state.players) as PlayerId[]).filter((id) => state.players[id].hp > 0);
  const best = Math.max(...alive.map((id) => progress[id] ?? 0));
  return alive.filter((id) => (progress[id] ?? 0) === best);
}

export const ACTION_QUEST_POOL: readonly ActionQuestDefinition[] = [
  { id: 'damage-contest', name: 'Damage Contest', condition: 'Who deals the most Damage in the next 3 Rounds.', reward: 'Fireball Card', durationRounds: 3, determineWinners: progressLeaders },
  { id: 'rabbit-run', name: 'Rabbit Run', condition: 'Most distance moved. Teleports count as 1.', reward: 'Portal Card', durationRounds: 5, determineWinners: progressLeaders },
  { id: 'provocateur', name: 'Provocateur', condition: 'Spend the most Rounds starting and ending the same turn on High Ground during the next 5 Rounds.', reward: 'Vicious Mockery Card', durationRounds: 5, determineWinners: progressLeaders },
  { id: 'capture-the-flag', name: 'The Conqueror', condition: "First to take an enemy Flag and end a turn on their own Base. A defeated carrier drops the Flag on their Square.", reward: 'The Banner', durationRounds: 10 },
  { id: 'tank-junior', name: 'Tank Junior', condition: 'Block the most Damage in combat during the next 4 Rounds. Defend Value and damage prevented by Defend Card effects both count.', reward: 'Mythril Helmet', durationRounds: 4, determineWinners: progressLeaders, grantReward: (state, winnerId) => state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'mythril-helmet', revealedToOpponent: true }) },
  { id: 'the-elephant', name: 'The Elephant', condition: 'Destroy the most Objects during the next 4 Rounds.', reward: 'Boomerang', durationRounds: 4, determineWinners: progressLeaders, grantReward: (state, winnerId) => state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'boomerang' }) },
  { id: 'the-gambler', name: 'The Gambler', condition: 'Add the most Cards to your Discard Deck by any means during the next 3 Rounds. Removed Cards do not count.', reward: 'Monarch Flush', durationRounds: 3, determineWinners: progressLeaders, grantReward: (state, winnerId) => state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'monarch-flush' }) },
];
export type QuestPhaseState = {
  actionDamageByPlayer: Partial<Record<PlayerId, number>>;
  usedQuestIds: string[];
  currentQuest: { id: string; announcedRound: number; endsAfterRound: number; winners: PlayerId[]; progress: Partial<Record<PlayerId, number>> } | null;
  lastQuestWinners: PlayerId[];
  progression: Partial<Record<PlayerId, { initialFocus: 'attack' | 'defend'; chosenFocusCard: CardTypeId }>>;
  phaseReward: { phase: 1 | 2 | 3; pendingPlayerIds: PlayerId[]; selectedCardId?: CardTypeId; selectedCardInstanceId?: string; phaseThreeDuplicated?: boolean; phaseThreeRemoved?: boolean } | null;
  turnStartedOnHighGround: Partial<Record<PlayerId, boolean>>;
  captureTheFlag?: { flags: { id: string; ownerId: PlayerId; homeSquares: [Cell, Cell]; homeAnchor: { x: number; y: number }; status: 'home' | 'carried' | 'dropped' | 'captured'; carrierId: PlayerId | null; droppedAt: Cell | null; grabbedFromHome: boolean }[] } | null;
  objectEffectsThisTurn?: Record<string, number>;
  objectRespawns?: { dueRound: number }[];
};

const PHASE_LENGTH_ROUNDS = 5;
function completedPhaseAtRoundStart(round: number): number | null {
  if (round <= 1 || (round - 1) % PHASE_LENGTH_ROUNDS !== 0) return null;
  return (round - 1) / PHASE_LENGTH_ROUNDS;
}
export type GameStateWithQuestPhases = GameStateWithOpening & { questPhases?: QuestPhaseState };

function questPhases(state: GameState): QuestPhaseState {
  const extended = state as GameStateWithQuestPhases;
  const phases = extended.questPhases ??= { actionDamageByPlayer: {}, usedQuestIds: [], currentQuest: null, lastQuestWinners: [], progression: {}, phaseReward: null, turnStartedOnHighGround: {}, captureTheFlag: null };
  phases.captureTheFlag ??= null;
  if (phases.captureTheFlag && !Array.isArray((phases.captureTheFlag as { flags?: unknown }).flags)) phases.captureTheFlag = { flags: createCaptureFlags(state) };
  phases.objectEffectsThisTurn ??= {};
  phases.objectRespawns ??= [];
  return phases;
}

function createCaptureFlags(state: GameState): NonNullable<QuestPhaseState['captureTheFlag']>['flags'] {
  return (Object.keys(state.players) as PlayerId[])
    .filter((id) => state.players[id].hp > 0 && state.players[id].character !== 'dummy')
    .flatMap((ownerId) => {
      const squares = [...ownedBaseSquares(state, ownerId)].map(cellFromLabel);
      if (squares.length < 2) return [];
      const homeSquares: [Cell, Cell] = [{ ...squares[0] }, { ...squares[1] }];
      return [{ id: `capture-flag-${ownerId}`, ownerId, homeSquares, homeAnchor: { x: (homeSquares[0].x + homeSquares[1].x) / 2, y: (homeSquares[0].y + homeSquares[1].y) / 2 }, status: 'home' as const, carrierId: null, droppedAt: null, grabbedFromHome: false }];
    });
}

function updateCaptureTheFlag(state: GameState, playerId: PlayerId, destination: Cell) {
  const phases = questPhases(state);
  const capture = phases.currentQuest?.id === 'capture-the-flag' ? phases.captureTheFlag : null;
  if (!capture) return;
  for (const flag of capture.flags) {
    if (flag.status === 'carried' || flag.status === 'captured') continue;
    const atHomeSquare = flag.ownerId !== playerId && flag.status === 'home' && !flag.grabbedFromHome && flag.homeSquares.some((cell) => cell.x === destination.x && cell.y === destination.y);
    const atDroppedSquare = flag.status === 'dropped' && flag.droppedAt?.x === destination.x && flag.droppedAt.y === destination.y;
    if (!atHomeSquare && !atDroppedSquare) continue;
    flag.status = 'carried'; flag.carrierId = playerId; flag.droppedAt = null; flag.grabbedFromHome = true;
    phases.currentQuest!.progress[playerId] = 1;
    state.log.unshift(`${state.players[playerId].name} grabbed ${state.players[flag.ownerId].name}'s Flag and must return it to their Base.`);
  }
}

function recordQuestMovement(state: GameState, playerId: PlayerId, amount: number, teleport = false, destination?: Cell) {
  if (!teleport && amount > 0 && state.players[playerId]) ensureMatchStats(state.players[playerId]).squaresMoved += amount;
  const current = questPhases(state).currentQuest;
  if (destination) updateCaptureTheFlag(state, playerId, destination);
  if (current?.id !== 'rabbit-run' || amount <= 0) return;
  current.progress[playerId] = (current.progress[playerId] ?? 0) + (teleport ? 1 : amount);
}

function isGuardianWall(object: BoardObject): boolean { return object.kind === 'spirit-guardian' && (object.guardianLevel ?? 1) >= 2; }
function isWallObject(object: BoardObject): boolean { return object.kind === 'wall-pillar' || object.kind === 'orkk-shield' || isGuardianWall(object); }
function isFixedWallObject(object: BoardObject): boolean { return object.kind === 'wall-pillar' || object.kind === 'orkk-shield'; }

function ownedGuardian(state: GameState, playerId: PlayerId): BoardObject | undefined {
  return state.objects.find((object) => object.kind === 'spirit-guardian' && object.ownerId === playerId);
}

export function spiritGuardianDefenseBonus(state: GameState, player: PlayerState): number {
  const guardian = ownedGuardian(state, player.id);
  return guardian && distance(player.position, guardian.position) === 1 ? 1 : 0;
}

type GuardianPerkDamageState = GameState & { guardianPerkActionSequence?: number; currentGuardianPerkActionId?: number | null };
type GuardianProtectedPlayer = PlayerState & { guardianBlockedPerkActionId?: number | null };

function beginGuardianPerkDamageAction(state: GameState) {
  const guardianState = state as GuardianPerkDamageState;
  guardianState.guardianPerkActionSequence = (guardianState.guardianPerkActionSequence ?? 0) + 1;
  guardianState.currentGuardianPerkActionId = guardianState.guardianPerkActionSequence;
}

export function spiritGuardianEnemyPenalty(state: GameState, player: PlayerState): number {
  return state.objects.some((object) => object.kind === 'spirit-guardian' && object.ownerId !== player.id && (object.guardianLevel ?? 1) >= 3 && distance(player.position, object.position) === 1) ? 1 : 0;
}

function removeOwnedGuardian(state: GameState, playerId: PlayerId, reason: string): boolean {
  const guardian = ownedGuardian(state, playerId);
  if (!guardian) return false;
  state.objects = state.objects.filter((object) => object.id !== guardian.id);
  state.log.unshift(`${state.players[playerId].name}'s Spirit Guardian was Removed ${reason}.`);
  return true;
}

function destroyObject(state: GameState, objectId: string, playerId: PlayerId, reason: string): boolean {
  const index = state.objects.findIndex((object) => object.id === objectId);
  if (index < 0 || isWallObject(state.objects[index])) return false;
  const [destroyed] = state.objects.splice(index, 1);
  state.objectPushAnimations.push({
    id: `${state.turn}-destroy-${destroyed.id}-${++instanceSequence}`,
    objectId: destroyed.id, from: { ...destroyed.position }, to: { ...destroyed.position },
    dx: 0, dy: 0, collided: true, removeOnComplete: true, destroy: true,
  });
  if (destroyed.kind === 'spirit-guardian') {
    state.log.unshift(`${state.players[playerId].name} destroyed ${destroyed.name} at ${cellLabel(destroyed.position)}${reason ? ` with ${reason}` : ''}.`);
    return true;
  }
  const phases = questPhases(state);
  if (phases.currentQuest?.id === 'the-elephant') phases.currentQuest.progress[playerId] = (phases.currentQuest.progress[playerId] ?? 0) + 1;
  const respawnDelay = 1 + Math.floor(Math.random() * 3);
  phases.objectRespawns!.push({ dueRound: state.turn + respawnDelay });
  state.log.unshift(`${state.players[playerId].name} destroyed ${destroyed.name} at ${cellLabel(destroyed.position)}${reason ? ` with ${reason}` : ''}. A replacement will arrive in ${respawnDelay} Round${respawnDelay === 1 ? '' : 's'}.`);
  return true;
}

function recordObjectEffect(state: GameState, objectId: string, playerId: PlayerId, effectName: string): boolean {
  const object = state.objects.find((entry) => entry.id === objectId);
  if (!object || isWallObject(object) || object.kind === 'spirit-guardian') return false;
  const phases = questPhases(state);
  const key = `${playerId}:${objectId}`;
  phases.objectEffectsThisTurn![key] = (phases.objectEffectsThisTurn![key] ?? 0) + 1;
  return phases.objectEffectsThisTurn![key] >= 2 && destroyObject(state, objectId, playerId, `two Object effects in one turn (${effectName})`);
}

function boardQuarter(state: GameState, cell: Cell): number {
  return (cell.y < boardHeight(state) / 2 ? 0 : 2) + (cell.x <= boardWidth(state) / 2 ? 1 : 2);
}

function spawnReplacementBox(state: GameState): boolean {
  const arena = isLordaeron(state) ? LORDAERON_ARENA : NAGRAND_ARENA;
  const groups = arena.boxSpawnLocations ?? { highground: arena.highground, highgroundProtected: arena.highgroundProtected, lowground: arena.boxes };
  const ordinaryObjects = state.objects.filter((object) => !isWallObject(object));
  const emptyQuarters = [1, 2, 3, 4].filter((quarter) => !ordinaryObjects.some((object) => boardQuarter(state, object.position) === quarter));
  const quarterPool = emptyQuarters.length > 0 ? emptyQuarters : [1, 2, 3, 4];
  const quarter = quarterPool[Math.floor(Math.random() * quarterPool.length)];
  const typedGroups = [groups.highground, groups.highgroundProtected, groups.lowground];
  const counts = typedGroups.map((labels) => ordinaryObjects.filter((object) => labels.includes(cellLabel(object.position))).length);
  const least = Math.min(...counts);
  const preferred = typedGroups.filter((_, index) => counts[index] === least).flat().filter((label) => boardQuarter(state, cellFromLabel(label)) === quarter);
  const fallback = typedGroups.flat().filter((label) => boardQuarter(state, cellFromLabel(label)) === quarter);
  const available = (preferred.length > 0 ? preferred : fallback).filter((label) => {
    const cell = cellFromLabel(label);
    return !state.objects.some((object) => cellLabel(object.position) === label) && !Object.values(state.players).some((player) => player.position.x === cell.x && player.position.y === cell.y);
  });
  if (available.length === 0) return false;
  const position = cellFromLabel(available[Math.floor(Math.random() * available.length)]);
  const objectId = `respawn-box-${state.turn}-${++instanceSequence}`;
  state.objects.push({ id: objectId, name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position });
  state.objectPushAnimations.push({ id: `${objectId}-parachute`, objectId, from: position, to: position, dx: 0, dy: 0, collided: false, parachute: true });
  state.log.unshift(`A replacement Wooden Box descended by parachute onto ${cellLabel(position)}.`);
  return true;
}

function ensureMatchStats(player: PlayerState): MatchStats {
  const stats = player.matchStats ??= { squaresMoved: 0, attackDamage: 0, perkDamage: 0, defensiveRetaliationDamage: 0, totalDamage: 0, hitPointsHealed: 0, combatDamageBlocked: 0 };
  stats.defensiveRetaliationDamage ??= 0;
  return stats;
}

function recordCombatDamageBlocked(state: GameState, defender: PlayerState, amount: number): number {
  const blocked = Math.max(0, amount);
  if (blocked === 0) return 0;
  ensureMatchStats(defender).combatDamageBlocked += blocked;
  const currentQuest = questPhases(state).currentQuest;
  if (currentQuest?.id === 'tank-junior') currentQuest.progress[defender.id] = (currentQuest.progress[defender.id] ?? 0) + blocked;
  return blocked;
}

function mythrilHelmetDefenseBonus(player: PlayerState): number {
  return 0;
}

function healPlayer(state: GameState, player: PlayerState, amount: number): number {
  const healed = Math.min(Math.max(0, amount), player.maxHp - player.hp);
  player.hp += healed;
  ensureMatchStats(player).hitPointsHealed += healed;
  if (healed > 0) {
    const damageState = state as GameState & { damageLog?: DamageLogEntry[] };
    (damageState.damageLog ??= []).push({ eventType: 'healing', turn: state.turn, targetId: player.id, sourceId: player.id, sourceKind: 'perk', amount: healed, hpAfter: player.hp, collision: false });
    state.objectPushAnimations.push({ id: `${state.turn}-healing-${player.id}-${state.objectPushAnimations.length}`, objectId: '', from: { ...player.position }, to: { ...player.position }, dx: 0, dy: 0, collided: false, healing: { playerId: player.id, amount: healed } });
  }
  return healed;
}

function announceActionQuest(state: GameState, round: number): boolean {
  if (ACTION_QUEST_POOL.length === 0) return true;
  const questState = questPhases(state);
  const available = ACTION_QUEST_POOL.filter((quest) => !questState.usedQuestIds.includes(quest.id));
  if (available.length === 0) {
    const alive = (Object.keys(state.players) as PlayerId[]).filter((id) => state.players[id].hp > 0);
    const best = Math.max(...alive.map((id) => questState.actionDamageByPlayer[id] ?? 0));
    const winners = alive.filter((id) => (questState.actionDamageByPlayer[id] ?? 0) === best);
    questState.lastQuestWinners = winners;
    state.winner = winners[0] ?? null;
    state.phase = 'finished';
    state.log.unshift(`The Action Quest Pool is depleted. ${winners.map((id) => state.players[id].name).join(' and ')} won with ${best} Action Damage.`);
    return false;
  }
  const selected = available[Math.floor(Math.random() * available.length)];
  questState.usedQuestIds.push(selected.id);
  questState.currentQuest = { id: selected.id, announcedRound: round, endsAfterRound: round + selected.durationRounds - 1, winners: [], progress: {} };
  if (selected.id === 'provocateur') questState.turnStartedOnHighGround[state.activePlayerId] = isHighGround(state, state.players[state.activePlayerId].position);
  if (selected.id === 'capture-the-flag') {
    const flags = createCaptureFlags(state);
    questState.captureTheFlag = flags.length > 0 ? { flags } : null;
  } else questState.captureTheFlag = null;
  state.log.unshift(`Action Quest announced: ${selected.name}. ${selected.condition}`);
  return true;
}

function resolveCurrentActionQuest(state: GameState): void {
  const questState = questPhases(state);
  const active = questState.currentQuest;
  if (active) {
    const definition = ACTION_QUEST_POOL.find((quest) => quest.id === active.id);
    const winners = active.winners.length > 0 ? active.winners : definition?.determineWinners?.(state, active.progress) ?? [];
    questState.lastQuestWinners = [...new Set(winners)];
    for (const winnerId of questState.lastQuestWinners) {
      definition?.grantReward?.(state, winnerId);
      if (active.id === 'damage-contest') state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'fireball' });
      if (active.id === 'rabbit-run') state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'portal' });
      if (active.id === 'provocateur') state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'vicious-mockery' });
      if (active.id === 'capture-the-flag') state.players[winnerId].hand.push({ instanceId: `${winnerId}-${++instanceSequence}`, cardId: 'banner', revealedToOpponent: true });
    }
    state.log.unshift(questState.lastQuestWinners.length > 0
      ? `${questState.lastQuestWinners.map((id) => state.players[id].name).join(' and ')} completed ${definition?.name ?? active.id} and received its Reward.`
      : `${definition?.name ?? active.id} ended without a Winner or Reward.`);
    questState.currentQuest = null;
    questState.captureTheFlag = null;
  }
}

function beginOpeningSetup(state: GameState, playerIds: PlayerId[], after: 'active' | 'placement') {
  const setupState = state as GameStateWithOpening;
  const allPlayerIds = Object.keys(state.players) as PlayerId[];
  const placementOrder = setupState.lordaeronPlacement?.order;
  const firstIndex = allPlayerIds.indexOf(state.activePlayerId);
  const roundOrder = placementOrder ?? Array.from({ length: allPlayerIds.length }, (_, offset) => allPlayerIds[(firstIndex + offset) % allPlayerIds.length]);
  setupState.openingSetup = { pendingPlayerIds: [...playerIds], focusByPlayer: {}, after, firstPlayerId: state.activePlayerId, secondPlayerId: roundOrder[1] };
  questPhases(state);
  for (const id of playerIds) { state.players[id].deck = []; state.players[id].hand = []; state.players[id].discard = []; }
  state.activePlayerId = playerIds[0];
  state.phase = 'choosing-focus';
  state.log.unshift(`${state.players[playerIds[0]].name} must choose Attack or Defend Focus.`);
}

function focusCandidates(player: PlayerState, focus: 'attack' | 'defend'): CardTypeId[] {
  if (player.character === 'dummy') return [];
  const definition = STARTING_DECKS[player.character];
  return focus === 'attack' ? definition.attackFocus : definition.defendFocus;
}

function resolveFocusChoice(state: GameState, playerId: PlayerId, focus: 'attack' | 'defend'): CommandResult {
  const opening = (state as GameStateWithOpening).openingSetup;
  if (state.phase !== 'choosing-focus' || !opening || opening.pendingPlayerIds[0] !== playerId) return fail(state, 'This Player is not choosing Focus now.');
  opening.focusByPlayer[playerId] = focus;
  state.phase = 'choosing-focus-card';
  state.log.unshift(`${state.players[playerId].name} chose ${focus === 'attack' ? 'Attack' : 'Defend'} Focus and must choose one sidelined Card.`);
  return ok(state);
}

function returnToFocusChoice(state: GameState, playerId: PlayerId): CommandResult {
  const opening = (state as GameStateWithOpening).openingSetup;
  if (state.phase !== 'choosing-focus-card' || !opening || opening.pendingPlayerIds[0] !== playerId || !opening.focusByPlayer[playerId]) return fail(state, 'This Player cannot return to Focus choice now.');
  delete opening.focusByPlayer[playerId];
  state.phase = 'choosing-focus';
  state.log.unshift(`${state.players[playerId].name} returned to the Attack or Defend Focus choice.`);
  return ok(state);
}

function resolveFocusCardChoice(state: GameState, playerId: PlayerId, cardId: CardTypeId): CommandResult {
  const setupState = state as GameStateWithOpening;
  const opening = setupState.openingSetup;
  const focus = opening?.focusByPlayer[playerId];
  if (state.phase !== 'choosing-focus-card' || !opening || opening.pendingPlayerIds[0] !== playerId || !focus) return fail(state, 'This Player is not choosing a Focus Card now.');
  if (!focusCandidates(state.players[playerId], focus).includes(cardId)) return fail(state, 'That Card is not an available Focus choice.');
  const player = state.players[playerId];
  const definition = STARTING_DECKS[player.character as keyof typeof STARTING_DECKS];
  const shuffledNonReserve = shuffle(definition.defaults.filter((id) => id !== definition.reserve).map((id) => ({ instanceId: `${player.id}-${++instanceSequence}`, cardId: id })));
  player.hand = [shuffledNonReserve.pop()!, shuffledNonReserve.pop()!, { instanceId: `${player.id}-${++instanceSequence}`, cardId: definition.reserve }];
  player.deck = [...shuffledNonReserve, { instanceId: `${player.id}-${++instanceSequence}`, cardId }];
  player.knownTopCardId = cardId;
  questPhases(state).progression[playerId] = { initialFocus: focus, chosenFocusCard: cardId };
  opening.pendingPlayerIds.shift();
  state.log.unshift(`${player.name} placed ${cardDefinition({ instanceId: '', cardId }).name} on top of the Deck and added Reserve Card ${cardDefinition({ instanceId: '', cardId: definition.reserve }).name} to the opening Hand.`);
  if (opening.pendingPlayerIds.length > 0) {
    state.activePlayerId = opening.pendingPlayerIds[0];
    state.phase = 'choosing-focus';
  } else {
    const secondPlayer = opening.secondPlayerId ? state.players[opening.secondPlayerId] : undefined;
    if (secondPlayer) {
      const drawn = drawCards(secondPlayer, 1);
      state.log.unshift(`${secondPlayer.name} goes second in Round 1 and drew ${drawn} additional opening Card${drawn === 1 ? '' : 's'}.`);
    }
    state.activePlayerId = opening.firstPlayerId;
    state.phase = opening.after === 'placement' ? 'choosing-base-placement' : 'active';
    delete setupState.openingSetup;
    if (state.phase === 'active') announceActionQuest(state, 1);
  }
  return ok(state);
}

function startPhaseReward(state: GameState, phase: 1 | 2 | 3) {
  const alive = (Object.keys(state.players) as PlayerId[]).filter((id) => state.players[id].hp > 0 && state.players[id].character !== 'dummy');
  if (alive.length === 0) return;
  const reward = questPhases(state);
  reward.phaseReward = { phase, pendingPlayerIds: alive };
  state.activePlayerId = alive[0];
  state.phase = phase === 3 ? 'choosing-phase-three-card' : 'choosing-phase-card';
  state.log.unshift(`Phase ${phase} ended. ${state.players[alive[0]].name} chooses a Phase reward.`);
}

function phaseCardCandidates(state: GameState, playerId: PlayerId): CardTypeId[] {
  const reward = questPhases(state).phaseReward!;
  const player = state.players[playerId];
  const definition = STARTING_DECKS[player.character as keyof typeof STARTING_DECKS];
  if (reward.phase === 2) return definition.perkPhase;
  const initialFocus = questPhases(state).progression[playerId]?.initialFocus ?? 'attack';
  return initialFocus === 'attack' ? definition.defendFocus : definition.attackFocus;
}

function addPhaseCard(player: PlayerState, cardId: CardTypeId, destination: 'hand' | 'top' | 'shuffle') {
  const instance = { instanceId: `${player.id}-${++instanceSequence}`, cardId };
  if (destination === 'hand') player.hand.push(instance);
  else if (destination === 'top') { player.deck.push(instance); player.knownTopCardId = cardId; }
  else { player.deck = shuffle([...player.deck, instance]); player.knownTopCardId = null; }
}

function finishPhasePlayer(state: GameState) {
  const questState = questPhases(state);
  const reward = questState.phaseReward!;
  reward.selectedCardId = undefined; reward.selectedCardInstanceId = undefined;
  reward.phaseThreeDuplicated = undefined; reward.phaseThreeRemoved = undefined;
  reward.pendingPlayerIds.shift();
  if (reward.pendingPlayerIds.length > 0) {
    state.activePlayerId = reward.pendingPlayerIds[0];
    state.phase = reward.phase === 3 ? 'choosing-phase-three-card' : 'choosing-phase-card';
  } else {
    questState.phaseReward = null;
    state.activePlayerId = (state as GameStateWithRound).roundFirstPlayerId ?? Object.keys(state.players)[0] as PlayerId;
    state.phase = 'active';
    state.log.unshift('All Phase reward choices are complete. Play resumes.');
  }
}

function resolvePhaseCardChoice(state: GameState, playerId: PlayerId, cardId: CardTypeId): CommandResult {
  const questState = questPhases(state); const reward = questState.phaseReward;
  if (state.phase !== 'choosing-phase-card' || !reward || reward.pendingPlayerIds[0] !== playerId) return fail(state, 'This Player is not choosing a Phase Card.');
  if (!phaseCardCandidates(state, playerId).includes(cardId)) return fail(state, 'That Card is not an available Phase reward.');
  reward.selectedCardId = cardId;
  if (questState.lastQuestWinners.includes(playerId)) state.phase = 'choosing-phase-destination';
  else { addPhaseCard(state.players[playerId], cardId, 'shuffle'); finishPhasePlayer(state); }
  return ok(state);
}

function resolvePhaseThreeOperation(state: GameState, playerId: PlayerId, cardInstanceId: string, operation: 'duplicate' | 'remove'): CommandResult {
  const questState = questPhases(state); const reward = questState.phaseReward;
  if (state.phase !== 'choosing-phase-three-card' || reward?.phase !== 3 || reward.pendingPlayerIds[0] !== playerId) return fail(state, 'This Player is not choosing a Phase Three Card.');
  const player = state.players[playerId];
  const card = [...player.deck, ...player.discard, ...player.hand].find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'Phase Three requires a Card currently in the Deck, Discard, or Hand.');
  if (operation === 'remove') {
    if (reward.phaseThreeRemoved) return fail(state, 'This Player has already used the Phase Three Remove action.');
    removeCard(player, cardInstanceId);
    reward.phaseThreeRemoved = true;
    state.log.unshift(`${player.name} used the Phase Three Remove action.`);
    if (reward.phaseThreeDuplicated) finishPhasePlayer(state);
  }
  else {
    if (reward.phaseThreeDuplicated) return fail(state, 'This Player has already used the Phase Three Duplicate action.');
    reward.phaseThreeDuplicated = true;
    reward.selectedCardId = card.cardId; reward.selectedCardInstanceId = cardInstanceId;
    if (questState.lastQuestWinners.includes(playerId)) state.phase = 'choosing-phase-destination';
    else {
      addPhaseCard(player, card.cardId, 'shuffle');
      reward.selectedCardId = undefined; reward.selectedCardInstanceId = undefined;
      state.log.unshift(`${player.name} used the Phase Three Duplicate action.`);
      if (reward.phaseThreeRemoved) finishPhasePlayer(state);
    }
  }
  return ok(state);
}

function finishPhaseThreeChoices(state: GameState, playerId: PlayerId): CommandResult {
  const reward = questPhases(state).phaseReward;
  if (state.phase !== 'choosing-phase-three-card' || reward?.phase !== 3 || reward.pendingPlayerIds[0] !== playerId) return fail(state, 'This Player cannot finish Phase Three choices now.');
  state.log.unshift(`${state.players[playerId].name} finished Phase Three refinement${reward.phaseThreeDuplicated || reward.phaseThreeRemoved ? ' and declined the remaining action' : ' without using either action'}.`);
  finishPhasePlayer(state);
  return ok(state);
}

function resolvePhaseDestination(state: GameState, playerId: PlayerId, destination: 'hand' | 'top' | 'shuffle'): CommandResult {
  const reward = questPhases(state).phaseReward;
  if (state.phase !== 'choosing-phase-destination' || !reward?.selectedCardId || reward.pendingPlayerIds[0] !== playerId) return fail(state, 'No Phase reward destination is pending.');
  addPhaseCard(state.players[playerId], reward.selectedCardId, destination);
  if (reward.phase === 3) {
    reward.selectedCardId = undefined; reward.selectedCardInstanceId = undefined;
    state.log.unshift(`${state.players[playerId].name} used the Phase Three Duplicate action.`);
    if (reward.phaseThreeRemoved) finishPhasePlayer(state);
    else state.phase = 'choosing-phase-three-card';
  } else finishPhasePlayer(state);
  return ok(state);
}

export function createLordaeronMultiplayerState(characters: Record<PlayerId, CharacterId>): GameState {
  const state = createInitialState() as LordaeronGameState;
  (state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack = true;
  const characterName = (character: CharacterId) => character === 'orkk' ? 'Da Orkk' : character === 'magician' ? 'Long Hat Logan' : 'Obi Wan Shinobi';
  state.boardSize = LORDAERON_ARENA.height;
  state.objects = [
    ...LORDAERON_ARENA.pillars.map((label, index) => ({ id: `lordaeron-pillar-${index + 1}`, name: 'Wooden Pillar', kind: 'wall-pillar' as const, hp: 999, maxHp: 999, position: cellFromLabel(label) })),
    ...LORDAERON_ARENA.boxes.map((label, index) => ({ id: `lordaeron-box-${index + 1}`, name: 'Wooden Box', kind: 'wooden-box' as const, hp: 3, maxHp: 3, position: cellFromLabel(label) })),
  ];
  state.elevations = Object.fromEntries(LORDAERON_ARENA.highground.map((label) => [label, 1]));
  for (const id of ['P1', 'P2', 'P3'] as PlayerId[]) {
    const baseId = id as 'P1' | 'P2' | 'P3';
    state.players[id] = createPlayer(id, characterName(characters[id]), characters[id], cellFromLabel(LORDAERON_ARENA.bases[baseId][0]));
  }
  const order = shuffle(['P1', 'P2', 'P3'] as PlayerId[]);
  state.activePlayerId = order[0];
  (state as GameStateWithRound).roundFirstPlayerId = order[0];
  state.lordaeronPlacement = { order, currentIndex: 0, availableBaseIds: ['P1', 'P2', 'P3'], claims: {} };
  state.log = ['Lordaeron Arena loaded for three-player Free For All.', `${state.players[order[0]].name} won the opening roll and chooses a base first.`];
  beginOpeningSetup(state, ['P1', 'P2', 'P3'], 'placement');
  return state;
}

function createPlayer(id: PlayerId, name: string, character: PlayerState['character'], position: Cell): PlayerState {
  const uniqueIds = character === 'shinobi' ? OBI_WAN_CARD_IDS : character === 'orkk' ? DA_ORKK_CARD_IDS : character === 'magician' ? LOGAN_CARD_IDS : character === 'john-christ' ? JOHN_CHRIST_CARD_IDS : [];
  const uniqueCards = uniqueIds.map((cardId) => ({ instanceId: `${id}-${++instanceSequence}`, cardId }));
  const hand: CardInstance[] = [];
  const dummyPool = CARDS.filter((card) => card.kind === 'attack' && card.id !== 'chip-cast' && !JOHN_CHRIST_CARD_IDS.includes(card.id) && !DA_ORKK_CARD_IDS.includes(card.id));
  const dummyDeck = shuffle(Array.from({ length: 10 }, () => ({ instanceId: `${id}-${++instanceSequence}`, cardId: dummyPool[Math.floor(Math.random() * dummyPool.length)].id })));
  const deck = character === 'shinobi' ? shuffle(uniqueCards) : character === 'john-christ' ? uniqueCards.slice(0, -5) : character === 'dummy' ? dummyDeck : [];
  if (character === 'orkk') hand.push(...uniqueCards);
  if (character === 'magician') hand.push(...uniqueCards);
  if (character === 'john-christ') hand.push(...uniqueCards.slice(-5));
  const isOrkk = character === 'orkk';
  const isMagician = character === 'magician';
  const isJohn = character === 'john-christ';
  const maximumHp = isOrkk ? 24 : isMagician ? 18 : isJohn ? 14 : 20;
  return { id, name, character, hp: maximumHp, maxHp: maximumHp, moveRange: isOrkk || isMagician || isJohn ? 3 : 2, attackRange: isJohn ? 3 : isMagician ? 2 : 1, position, deck, hand, discard: [], knownTopCardId: null, spellEcho: [null, null, null], actionsRemaining: 2, perkUsed: false, freeMoveUsed: false, movementRemaining: 0, movedThisTurn: false, lightsaberBuff: false, lightsaberStacks: 0, lightsaberMovementProtection: false, highgroundAdvantageBuff: false, pinnedStacks: 0, pinnedGainedThisTurn: 0, turnEndPinnedRemoved: false, swiftformMoveBonus: 0, grimoireMoveBonus: 0, swiftformCanPassEnemies: false, swiftformPinsPassedEnemies: false, swiftformLightsaberAtTurnEnd: false, swiftformEnemyUnderfoot: null, swiftformPinnedEnemyIds: [], movementAnnulledByBlessedSwiftness: false, rageStacks: 0, shieldEquipped: isOrkk, rageGainLocked: false, doubleRageUntilEnemyTurnEnd: false, manaPoints: 0, manaMode: 'generate', manaConsumeEventId: null, arcaneBoltAttackBonus: 0, damagedDuringEnemyTurn: false, spiritForm: false, spiritEnemyUnderfoot: null, spiritObjectUnderfoot: null, spiritSiphonedEnemyIds: [], spiritSiphonedMovement: 0, johnCumulativeMovementRemaining: 0, spiritMovementDepleted: false, spiritMovementSpentThisTurn: false, stoicShell: false, stoicShellStacks: 0, queuedBlessingCardIds: [], stoicShellHealedTurn: null, stoicShellHealEventId: null, stoicShellHealAmount: 0, matchStats: { squaresMoved: 0, attackDamage: 0, perkDamage: 0, defensiveRetaliationDamage: 0, totalDamage: 0, hitPointsHealed: 0, combatDamageBlocked: 0 } };
}

export function distance(a: Cell, b: Cell): number { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
export function diagonalMovementBlockedByObject(state: GameState, from: Cell, to: Cell): boolean {
  if (Math.abs(to.x - from.x) !== 1 || Math.abs(to.y - from.y) !== 1) return false;
  const sideA = { x: to.x, y: from.y };
  const sideB = { x: from.x, y: to.y };
  const objectAt = (cell: Cell) => state.objects.some((object) => object.position.x === cell.x && object.position.y === cell.y);
  const entityAtSide = (cell: Cell) => objectAt(cell) || Object.values(state.players).some((player) => player.position.x === cell.x && player.position.y === cell.y);
  return entityAtSide(sideA) && entityAtSide(sideB) && (objectAt(sideA) || objectAt(sideB));
}
export function movementPath(state: GameState, player: PlayerState, destination: Cell): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: player.position, path: [] }];
  const visited = new Set([key(player.position)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cell.x === destination.x && current.cell.y === destination.y) return current.path;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state) || visited.has(key(next))) continue;
      if (isForbiddenSlideAscent(state, current.cell, next)) continue;
      if (!player.spiritForm && diagonalMovementBlockedByObject(state, current.cell, next)) continue;
      if (!player.spiritForm && state.objects.some((object) => object.position.x === next.x && object.position.y === next.y)) continue;
      const enemyOccupiesNext = Object.values(state.players).some((candidate) => candidate.hp > 0 && candidate.id !== player.id && candidate.position.x === next.x && candidate.position.y === next.y);
      if (enemyOccupiesNext && (isHighGroundSlideEntry(state, current.cell, next) || (!player.swiftformCanPassEnemies && !player.spiritForm))) continue;
      if (isHighGroundSlideEntry(state, current.cell, next) && (next.x !== destination.x || next.y !== destination.y)) continue;
      visited.add(key(next)); queue.push({ cell: next, path: [...current.path, next] });
    }
  }
  return [];
}
function applySwiftformPinnedOnce(state: GameState, player: PlayerState, enemyId: PlayerId): boolean {
  if (!player.swiftformPinsPassedEnemies || player.swiftformPinnedEnemyIds.includes(enemyId)) return false;
  applyPinned(state.players[enemyId], 1);
  player.swiftformPinnedEnemyIds.push(enemyId);
  return true;
}

function resolveObjectAttack(state: GameState, player: PlayerState, instance: CardInstance, objectId: string): CommandResult {
  const object = state.objects.find((entry) => entry.id === objectId);
  if (!object || (isWallObject(object) && object.kind !== 'spirit-guardian')) return fail(state, 'Only non-Wall Objects and Spirit Guardians can be attacked.');
  const card = cardDefinition(instance);
  const objectAnimationStart = state.objectPushAnimations.length;
  const shieldEquippedAtStart = player.shieldEquipped;
  if (distance(player.position, object.position) > effectiveAttackRange(state, player)) return fail(state, 'Object is outside the attack range.');
  if (!hasLineOfSight(state, player.position, object.position)) return fail(state, 'A Wall Object blocks line of sight to that Object.');
  if (!canAttackTargetSquare(state, player.position, object.position)) return fail(state, 'Terrain protection prevents an Attack from this Square.');
  if (card.id === 'fistbolt' && player.character === 'orkk' && player.rageStacks === 0) player.rageStacks = 1;
  const rageSpent = player.character === 'orkk' ? player.rageStacks : 0;
  const banner = player.hand.find((entry) => entry.cardId === 'banner');
  const highGroundBonus = highGroundAttackValueBonus(state, player, object.position);
  const attackValue = card.value
    + (player.character === 'shinobi' && player.lightsaberBuff ? 1 : 0)
    + rageSpent
    + (player.character === 'john-christ' && player.spiritForm ? 2 : 0)
    + (player.character === 'magician' ? player.arcaneBoltAttackBonus : 0)
    + (card.id === 'mana-blast' && player.manaMode === 'consume' ? 2 : 0)
    + (banner ? 1 : 0)
    + highGroundBonus
    - player.hand.filter((entry) => entry.cardId === 'exhaust').length
    - spiritGuardianEnemyPenalty(state, player);
  discardFromHand(player, instance.instanceId);
  if (banner) removeCard(player, banner.instanceId);
  player.actionsRemaining -= 1;
  if (attackValue > 0 && !isGuardianWall(object)) destroyObject(state, object.id, player.id, `${card.name} Attack Value ${attackValue}`);
  else if (attackValue > 0 && isGuardianWall(object)) state.log.unshift(`${object.name} is invincible at Level ${object.guardianLevel} and ignored all combat Damage.`);
  if (player.highgroundAdvantageBuff || card.id === 'snowball-effect' || (card.id === 'cut-them-legs' && attackValue > 0)) {
    const returned = player.discard.find((entry) => entry.instanceId === instance.instanceId);
    if (returned) { player.discard.splice(player.discard.indexOf(returned), 1); player.hand.push(returned); }
    player.highgroundAdvantageBuff = false;
  }
  if (card.id === 'blessed-light' && player.character === 'john-christ') {
    addBlessingCardToJohn(state, player, 'blessing-light');
    state.log.unshift(`Blessed Light created Blessing: Light for ${player.name}; a Box has no Deck that can receive Exhaust.`);
  }
  if (card.id === 'arcane-bolt') {
    player.arcaneBoltAttackBonus = player.manaMode === 'consume' ? 2 : 1;
    state.log.unshift(`Arcane Bolt${player.manaMode === 'consume' ? ' (Consume)' : ''} granted ${player.name} +${player.arcaneBoltAttackBonus} ATT until end of turn after attacking an Object.`);
  }
  if (card.id === 'mana-barrage') {
    const afterCombatDamage = player.manaMode === 'consume' ? 2 : 0;
    if (afterCombatDamage > 0 && state.objects.some((entry) => entry.id === object.id)) destroyObject(state, object.id, player.id, `Mana Barrage's ${afterCombatDamage} after-combat Damage`);
    state.log.unshift(`Mana Barrage resolved ${afterCombatDamage} after-combat Damage against ${object.name}${afterCombatDamage > 0 && attackValue <= 0 ? ', destroying it after the Attack Value was fully penalized' : ''}.`);
  }
  if (card.id === 'knee-blast' && rageSpent > 0) {
    const survivingObject = state.objects.find((entry) => entry.id === object.id);
    if (survivingObject) {
      const dx = Math.sign(survivingObject.position.x - player.position.x);
      const dy = Math.sign(survivingObject.position.y - player.position.y);
      pushEntity(state, { kind: 'object', id: survivingObject.id, position: survivingObject.position }, dx, dy, rageSpent, 1, player.id, false, 'attack');
      state.log.unshift(`Knee Blast applied its after-combat push to ${survivingObject.name} for up to ${rageSpent} Squares.`);
    }
  }
  if (card.id === 'chain-punchin' && player.character === 'orkk') {
    if (shieldEquippedAtStart) {
      const dropSquares: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const cell = { x: player.position.x + dx, y: player.position.y + dy };
        if (cell.x < 1 || cell.x > boardWidth(state) || cell.y < 0 || cell.y >= boardHeight(state)) continue;
        if (Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)) continue;
        if (state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)) continue;
        dropSquares.push(cell);
      }
      const dropSquare = dropSquares[0];
      if (dropSquare) unequipOrkkShield(state, player.id, dropSquare);
      else state.log.unshift(`Chain Punchin could not drop ${player.name}'s Shield because no adjacent Square was empty.`);
      const drawn = drawCards(player, 1);
      state.log.unshift(`Chain Punchin drew ${drawn} Card after attacking an Object with the Shield equipped.`);
    } else {
      player.actionsRemaining += 1;
      state.log.unshift(`Chain Punchin generated 1 extra Action after attacking an Object without an equipped Shield.`);
    }
  }
  if (card.id === 'shield-bash' && player.character === 'orkk') {
    if (shieldEquippedAtStart) {
      player.rageStacks += 1;
      state.log.unshift(`Shield Bash generated 1 Rage after attacking an Object with the Shield equipped (${player.rageStacks} total).`);
    } else {
      const recall = nearestRecallableOrkkShield(state, player.id, player.position, 16);
      if (recall) {
        const { shield, path } = recall;
        if (path.length > 0) {
          const recallAnimationId = `${state.turn}-shield-bash-object-${state.objectPushAnimations.length}`;
          const crossedEnemyIds = new Set<PlayerId>();
          for (const [pathIndex, cell] of path.entries()) {
            const enemy = Object.values(state.players).find((entry) => entry.id !== player.id && entry.position.x === cell.x && entry.position.y === cell.y);
            if (!enemy || crossedEnemyIds.has(enemy.id)) continue;
            crossedEnemyIds.add(enemy.id);
            const damageAnimationStart = state.objectPushAnimations.length;
            dealDamage(state, enemy, 3, true, player.id, 'attack');
            for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
              if (!event.damage?.collision) continue;
              event.damage.triggerAnimationId = recallAnimationId;
              event.damage.triggerRouteProgress = (pathIndex + 1) / path.length;
            }
          }
          pullEnemiesAlongShieldRecall(state, shield, player.id, path, 'Shield Bash', recallAnimationId);
          state.objectPushAnimations.push({ id: recallAnimationId, objectId: shield.id, from: { ...shield.position }, to: { ...player.position }, dx: Math.sign(player.position.x - shield.position.x), dy: Math.sign(player.position.y - shield.position.y), collided: false, path: path.map((cell) => ({ ...cell })), removeOnComplete: true, equipPlayerId: player.id });
          state.objects = state.objects.filter((entry) => entry.id !== shield.id);
          player.shieldEquipped = true;
          state.log.unshift(`Shield Bash recalled and equipped ${player.name}'s Shield after attacking an Object.`);
        }
      }
    }
  }
  if (player.character === 'magician' && player.manaMode === 'generate') gainManaFromResolvedSpell(state, player);
  if (rageSpent > 0) state.log.unshift(`${player.name} applied ${rageSpent} Rage Stack${rageSpent === 1 ? '' : 's'} to the Attack against an Object without consuming them.`);
  if (card.id === 'fistbolt' && player.character === 'orkk') {
    player.rageStacks += 1;
    state.log.unshift(`Fistbolt generated 1 Rage after combat (${player.rageStacks} total).`);
  }
  if (card.id === 'snowball-effect' && player.character === 'magician' && player.manaMode === 'consume') {
    const drawn = drawCards(player, 1);
    state.phase = 'choosing-snowball-discard';
    state.log.unshift(`Snowball Effect (Consume) drew ${drawn} Card after attacking an Object; ${player.name} must discard 1 Card.`);
  } else if (card.id === 'dance-through' && player.character === 'shinobi') {
    state.phase = 'dance-through';
    state.danceThrough = { stepsRemaining: 3, enemyUnderfoot: null, damagePrevented: false, pinnedEnemyIds: [] } as typeof state.danceThrough & { pinnedEnemyIds: PlayerId[] };
    state.log.unshift('Dance Through: Obi Wan Shinobi may move 1 Square up to 3 times after attacking the Object.');
  }
  if (player.character === 'john-christ' && player.spiritForm) exitSpiritForm(state, player, 'after using an Attack Card');
  if (player.character === 'orkk' && object.kind === 'wooden-box') {
    const destruction = state.objectPushAnimations.slice(objectAnimationStart).find((event) => event.objectId === object.id && event.destroy);
    if (destruction) destruction.attackAnimationPlayerId = player.id;
    else state.objectPushAnimations.push({
      id: `${state.turn}-orkk-box-attack-${object.id}-${state.objectPushAnimations.length}`,
      objectId: object.id,
      from: { ...object.position },
      to: { ...object.position },
      dx: 0,
      dy: 0,
      collided: false,
      attackAnimationPlayerId: player.id,
    });
  }
  state.log.unshift(`${player.name} attacked ${object.name} with ${card.name} at resolved Value ${attackValue}${highGroundBonus ? ', including +1 High Ground' : ''}.`);
  return ok(state);
}

function beginBoomerang(state: GameState, player: PlayerState, cardInstanceId: string): CommandResult {
  const card = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card || cardDefinition(card).kind !== 'free-action') return fail(state, 'That Free Action Card is not in this Player\'s Hand.');
  if (card.cardId === 'monarch-flush') {
    player.hand.splice(player.hand.indexOf(card), 1);
    for (const opponent of Object.values(state.players)) {
      if (opponent.id === player.id) continue;
      opponent.hand.forEach((instance) => { instance.revealedToOpponent = true; });
    }
    state.log.unshift(`${player.name} played Monarch Flush as a Free Action, revealed every opponent Hand, and Removed Monarch Flush from the game.`);
    return ok(state);
  }
  if (card.cardId !== 'boomerang') return fail(state, 'That Free Action is not supported.');
  state.boomerang = { casterId: player.id, cardInstanceId };
  state.phase = 'choosing-boomerang-target';
  state.log.unshift('Boomerang: choose an enemy within Range 3. Range 1 automatically spends an Action for 2 Damage and Removes the Card; Range 2-3 deals 1 Damage as a Free Action. Obstacles do not block its arcing flight.');
  return ok(state);
}

function shuffleBoomerangIntoDeck(player: PlayerState, card: CardInstance) {
  card.revealedToOpponent = false;
  player.deck.push(card);
  player.knownTopCardId = card.cardId;
}

function resolveBoomerangTarget(state: GameState, playerId: PlayerId, targetId: PlayerId): CommandResult {
  const pending = state.boomerang;
  if (state.phase !== 'choosing-boomerang-target' || pending?.casterId !== playerId) return fail(state, 'Boomerang is not waiting for a target.');
  const player = state.players[playerId]; const target = state.players[targetId];
  if (!target || targetId === playerId || target.hp <= 0) return fail(state, 'Choose a living enemy.');
  const targetDistance = distance(player.position, target.position);
  if (targetDistance > 3) return fail(state, 'Target is outside Boomerang Range 3.');
  const meleeUse = targetDistance <= 1;
  if (meleeUse && player.actionsRemaining <= 0) return fail(state, 'Boomerang requires 1 Action when used at melee Range 1.');
  const index = player.hand.findIndex((entry) => entry.instanceId === pending.cardInstanceId && entry.cardId === 'boomerang');
  if (index < 0) return fail(state, 'Boomerang is no longer in Hand.');
  const previousMoveRange = movementRangeForAdjustment(player);
  const [boomerang] = player.hand.splice(index, 1);
  const damage = meleeUse ? 2 : 1;
  if (meleeUse) player.actionsRemaining -= 1;
  dealDamage(state, target, damage, false, playerId, 'other');
  state.spellProjectiles.push({ id: `${state.turn}-boomerang-${++instanceSequence}`, casterId: playerId, targetId, from: { ...player.position }, to: { ...target.position }, path: [{ ...player.position }, { ...target.position }], count: 1, damage, style: 'boomerang' });
  if (!meleeUse) shuffleBoomerangIntoDeck(player, boomerang);
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
  state.boomerang = null;
  if (target.hp > 0) state.phase = 'active';
  state.log.unshift(meleeUse
    ? `${player.name} dealt 2 Damage with Boomerang at melee Range, spent 1 Action, and Removed it from the game.`
    : `${player.name} dealt 1 Damage with Boomerang as a Free Action and placed it on top of the Deck.`);
  return ok(state);
}
export function cellLabel(cell: Cell): string { return `${String.fromCharCode(64 + cell.x)}${cell.y + 1}`; }
function cellFromLabel(label: string): Cell { return { x: label.charCodeAt(0) - 64, y: Number(label.slice(1)) - 1 }; }
export function cardDefinition(instance: CardInstance): Card { return CARDS.find((card) => card.id === instance.cardId)!; }

const HIGHGROUND_PROTECTION = new Set(['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5']);
const BONUS_DRAW_SQUARES = new Set(['D1', 'E1', 'D8', 'E8']);
const arenaForState = (state: GameState): ArenaDefinition => {
  const arenaId = (state as GameState & { arenaId?: ArenaId }).arenaId;
  if (arenaId === 'trench') return THE_TRENCH_ARENA;
  if (arenaId === 'lordaeron' || state.boardSize === LORDAERON_ARENA.height) return LORDAERON_ARENA;
  return NAGRAND_ARENA;
};
const isLordaeron = (state: GameState) => arenaForState(state).id === 'lordaeron';
const boardWidth = (state: GameState) => arenaForState(state).width;
const boardHeight = (state: GameState) => state.boardSize;
const protectedSquares = (state: GameState): ReadonlySet<string> => new Set(arenaForState(state).highgroundProtected);
const drawSquares = (state: GameState): ReadonlySet<string> => new Set(arenaForState(state).drawSquares);
export function isForbiddenSlideAscent(state: GameState, from: Cell, to: Cell): boolean {
  const arena = arenaForState(state);
  const startsOnRestrictedLowSquare = arena.slideSquares?.includes(cellLabel(from)) || arena.trenchSquares?.includes(cellLabel(from));
  return Boolean(startsOnRestrictedLowSquare && arena.highground.includes(cellLabel(to)) && distance(from, to) === 1);
}
function isHighGroundSlideEntry(state: GameState, from: Cell, to: Cell): boolean {
  return isHighGround(state, from) && Boolean(arenaForState(state).slideSquares?.includes(cellLabel(to))) && distance(from, to) === 1;
}
function isHighGround(state: GameState, cell: Cell): boolean { return (state.elevations[cellLabel(cell)] ?? 0) > 0; }
export function canAttackTargetSquare(state: GameState, from: Cell, to: Cell): boolean {
  const arena = arenaForState(state);
  if (arena.adjacentHighgroundOnlyTargets?.includes(cellLabel(to)) && isHighGround(state, from)) return distance(from, to) === 1;
  return !(isHighGround(state, from) && !isHighGround(state, to) && protectedSquares(state).has(cellLabel(to)) && distance(from, to) > 1);
}
export function effectiveAttackRange(state: GameState, player: PlayerState): number {
  return player.attackRange;
}
function isLowGroundOrProtected(state: GameState, cell: Cell): boolean {
  return !isHighGround(state, cell) || protectedSquares(state).has(cellLabel(cell));
}
function highGroundAttackValueBonus(state: GameState, caster: PlayerState, target: Cell): number {
  return Number(isHighGround(state, caster.position) && isLowGroundOrProtected(state, target));
}
function meleeHighGroundDamageBonus(_state: GameState, _caster: PlayerState, _target: Cell, _objectOrigin?: Cell): number {
  return 0;
}
function ownedDefenseBonus(player: PlayerState, state?: GameState): number {
  const claimedBase = state && (state as LordaeronGameState).lordaeronPlacement?.claims[player.id];
  const owned = state && isLordaeron(state)
    ? new Set(claimedBase ? LORDAERON_ARENA.bases[claimedBase] : LORDAERON_ARENA.bases[player.id as 'P1' | 'P2' | 'P3'] ?? [])
    : new Set(state ? arenaForState(state).bases[player.id as 'P1' | 'P2' | 'P3'] ?? [] : player.id === 'P1' ? NAGRAND_ARENA.bases.P1 : NAGRAND_ARENA.bases.P2);
  return owned.has(cellLabel(player.position)) ? 1 : 0;
}
function ownedBaseSquares(state: GameState, playerId: PlayerId): ReadonlySet<string> {
  if (!isLordaeron(state)) return new Set(arenaForState(state).bases[playerId as 'P1' | 'P2' | 'P3'] ?? []);
  const claimedBase = (state as LordaeronGameState).lordaeronPlacement?.claims[playerId];
  return new Set(claimedBase ? LORDAERON_ARENA.bases[claimedBase] : LORDAERON_ARENA.bases[playerId as 'P1' | 'P2' | 'P3'] ?? []);
}
function availableOwnedBaseSquare(state: GameState, player: PlayerState): Cell | null {
  for (const label of ownedBaseSquares(state, player.id)) {
    const cell = cellFromLabel(label);
    const occupiedByOtherPlayer = Object.values(state.players).some((entry) => entry.id !== player.id && entry.hp > 0 && entry.position.x === cell.x && entry.position.y === cell.y);
    const occupiedByObject = state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
    if (!occupiedByOtherPlayer && !occupiedByObject) return cell;
  }
  return null;
}
export function hasLineOfSight(state: GameState, from: Cell, to: Cell): boolean {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 1; step < steps; step++) {
    const cell = { x: Math.round(from.x + (to.x - from.x) * step / steps), y: Math.round(from.y + (to.y - from.y) * step / steps) };
    if (state.objects.some((object) => isWallObject(object) && object.position.x === cell.x && object.position.y === cell.y)) return false;
  }
  return true;
}

export function dealDamage(state: GameState, target: PlayerState, amount: number, collision = false, sourceId: PlayerId = state.activePlayerId, sourceKind: 'attack' | 'perk' | 'defense' | 'other' = 'other'): number {
  let resolvedAmount = Math.max(0, amount);
  const guardianActionId = (state as GuardianPerkDamageState).currentGuardianPerkActionId;
  const protectedTarget = target as GuardianProtectedPlayer;
  const adjacentGuardian = target.character === 'john-christ' && state.objects.some((object) => object.kind === 'spirit-guardian' && object.ownerId === target.id && distance(target.position, object.position) === 1);
  if (resolvedAmount > 0 && sourceKind === 'perk' && guardianActionId && adjacentGuardian && protectedTarget.guardianBlockedPerkActionId !== guardianActionId) {
    resolvedAmount = Math.max(0, resolvedAmount - 1);
    protectedTarget.guardianBlockedPerkActionId = guardianActionId;
    state.log.unshift(`${target.name}'s adjacent Spirit Guardian blocked 1 Perk Damage for this Action.`);
  }
  const dealt = Math.min(target.hp, resolvedAmount);
  target.hp -= dealt;
  if (dealt > 0) {
    const damageState = state as GameState & { damageLog?: DamageLogEntry[] };
    (damageState.damageLog ??= []).push({ eventType: 'damage', turn: state.turn, targetId: target.id, sourceId, sourceKind, amount: dealt, hpAfter: target.hp, collision });
  }
  if (dealt > 0 && sourceId !== target.id && state.players[sourceId]) {
    const stats = ensureMatchStats(state.players[sourceId]);
    if (sourceKind === 'attack') {
      stats.attackDamage += dealt;
      stats.totalDamage += dealt;
    }
    if (sourceKind === 'perk') {
      stats.perkDamage += dealt;
      stats.totalDamage += dealt;
    }
    if (sourceKind === 'defense') {
      stats.defensiveRetaliationDamage += dealt;
      stats.totalDamage += dealt;
    }
    const questState = questPhases(state);
    questState.actionDamageByPlayer[sourceId] = (questState.actionDamageByPlayer[sourceId] ?? 0) + dealt;
    if (questState.currentQuest?.id === 'damage-contest') questState.currentQuest.progress[sourceId] = (questState.currentQuest.progress[sourceId] ?? 0) + dealt;
  }
  if (dealt > 0 && state.activePlayerId !== target.id) target.damagedDuringEnemyTurn = true;
  if (dealt > 0) state.objectPushAnimations.push({ id: `${state.turn}-damage-${target.id}-${state.log.length}-${state.objectPushAnimations.length}`, objectId: '', from: { ...target.position }, to: { ...target.position }, dx: 0, dy: 0, collided: false, damage: { playerId: target.id, amount: dealt, collision } });
  if (dealt > 0 && target.character === 'orkk' && !target.rageGainLocked) {
    const gainedRage = target.doubleRageUntilEnemyTurnEnd ? 2 : 1;
    target.rageStacks += gainedRage;
    target.rageGainLocked = true;
    state.log.unshift(`${target.name} gained ${gainedRage} Rage from taking damage${gainedRage > 1 ? ' while Double! was active' : ''} (${target.rageStacks} total).`);
  }
  if (dealt > 0 && target.character === 'john-christ') {
    if (target.stoicShell) {
      target.stoicShell = false;
      target.stoicShellStacks = 0;
      state.log.unshift(`${target.name}'s Stoic Shell and all of its Stacks were removed by Damage.`);
    }
    if (target.hp > 0) {
      enterSpiritForm(state, target, 'after receiving Damage');
    }
  }
  if (target.hp === 0 && state.phase !== 'finished') {
    const capture = questPhases(state).captureTheFlag;
    for (const flag of capture?.flags ?? []) {
      if (flag.status !== 'carried' || flag.carrierId !== target.id) continue;
      flag.status = 'dropped'; flag.carrierId = null; flag.droppedAt = { ...target.position };
      state.log.unshift(`${target.name} dropped ${state.players[flag.ownerId].name}'s Flag on ${cellLabel(target.position)}.`);
    }
    state.phase = 'finished';
    state.winner = sourceId !== target.id && state.players[sourceId]?.hp > 0
      ? sourceId
      : (Object.keys(state.players) as PlayerId[]).find((id) => id !== target.id && state.players[id].hp > 0) ?? null;
    state.log.unshift(`${target.name} was defeated${state.winner ? `; ${state.players[state.winner].name} wins the match!` : '.'}`);
  }
  return dealt;
}

function dealCombatCardEffectDamage(state: GameState, target: PlayerState, amount: number, sourceId: PlayerId, sourceKind: 'attack' | 'defense', collision = false): number {
  const pending = state.pendingAttack;
  let adjusted = amount;
  if (adjusted > 0 && (pending?.blessingFaithApplied || pending?.mythrilHelmetApplied) && (target.id === pending.attackerId || target.id === pending.defenderId)) {
    recordCombatDamageBlocked(state, target, adjusted);
    state.log.unshift(`${pending?.blessingFaithApplied ? 'Blessing: Faith' : 'Mythril Helmet'} negated ${adjusted} Damage to ${target.name}.`);
    adjusted = 0;
  }
  if (adjusted > 0 && pending?.resurrectionNegatesDamage && target.id === pending.defenderId) {
    recordCombatDamageBlocked(state, target, adjusted);
    state.log.unshift(`Resurrection negated ${adjusted} Damage from the enemy ${sourceKind === 'attack' ? 'Attack' : 'Defend'} Card effect.`);
    adjusted = 0;
  }
  const shieldPlayers = pending?.blessingShieldPlayerIds ?? (pending?.blessingShieldPlayerId ? [pending.blessingShieldPlayerId] : []);
  if (adjusted > 0 && pending?.blessingShieldApplied && shieldPlayers.includes(target.id) && sourceId !== target.id) {
    adjusted = Math.max(0, adjusted - 1);
    pending.blessingShieldPlayerIds = shieldPlayers.filter((id) => id !== target.id);
    pending.blessingShieldApplied = pending.blessingShieldPlayerIds.length > 0;
    recordCombatDamageBlocked(state, target, 1);
    state.log.unshift(`Blessing: Shield absorbed 1 Damage from the enemy ${sourceKind === 'attack' ? 'Attack' : 'Defend'} Card effect.`);
  }
  return dealDamage(state, target, adjusted, collision, sourceId, sourceKind);
}

function blessingShieldBlocksCombatStatus(state: GameState, target: PlayerState, statusId: CardTypeId): boolean {
  const pending = state.pendingAttack;
  if (!pending?.blessingShieldStatusPlayerIds?.includes(target.id)) return false;
  pending.blessingShieldStatusPlayerIds = pending.blessingShieldStatusPlayerIds.filter((id) => id !== target.id);
  state.log.unshift(`Blessing: Shield blocked ${cardDefinition({ instanceId: '', cardId: statusId }).name} from being applied to ${target.name} during combat.`);
  return true;
}

function spiritFormBlocksCard(player: PlayerState, card: Card): boolean {
  return player.character === 'john-christ' && player.spiritForm && /bless/i.test(card.name);
}

function exitSpiritForm(state: GameState, player: PlayerState, reason: string) {
  if (player.character !== 'john-christ' || !player.spiritForm) return;
  if (player.spiritMovementDepleted && player.johnCumulativeMovementRemaining > 0) player.johnCumulativeMovementRemaining -= 1;
  player.spiritForm = false;
  player.attackRange = 3;
  player.spiritEnemyUnderfoot = null;
  player.spiritObjectUnderfoot = null;
  player.spiritMovementDepleted = false;
  player.movementRemaining = player.freeMoveUsed ? player.johnCumulativeMovementRemaining : 0;
  state.log.unshift(`${player.name} left Spirit Form ${reason}.`);
}

function enterSpiritForm(state: GameState, player: PlayerState, reason: string) {
  if (player.character !== 'john-christ') return;
  const wasActive = player.spiritForm;
  if (!wasActive && player.freeMoveUsed) player.johnCumulativeMovementRemaining = Math.max(0, player.movementRemaining);
  player.spiritForm = true;
  player.attackRange = 1;
  if (!wasActive) {
    player.movementRemaining = player.spiritMovementSpentThisTurn && player.johnCumulativeMovementRemaining <= 0 ? 0 : 1;
    player.spiritMovementDepleted = false;
  }
  state.log.unshift(`${player.name} ${wasActive ? 'remained in' : 'entered'} Spirit Form ${reason}.`);
}

export function queueBlessingCard(player: PlayerState, cardId: CardTypeId) {
  const card = cardDefinition({ instanceId: '', cardId });
  if (player.character !== 'john-christ' || !/\bBlessing\b/i.test(card.name)) return false;
  player.queuedBlessingCardIds.push(cardId);
  return true;
}

function addBlessingCardToJohn(state: GameState, player: PlayerState, cardId: CardTypeId) {
  const card = cardDefinition({ instanceId: '', cardId });
  if (player.character !== 'john-christ' || !/\bBlessing\b/i.test(card.name)) return false;
  player.hand.push({ instanceId: `${player.id}-blessing-${++instanceSequence}`, cardId, revealedToOpponent: true });
  player.stoicShell = true;
  state.log.unshift(`${player.name} received ${card.name} and immediately gained Stoic Shell.`);
  return true;
}

export function isCardRevealedToOpponents(player: PlayerState, instance: CardInstance): boolean {
  return Boolean(instance.revealedToOpponent)
    || (player.character === 'john-christ' && /\bBlessing\b/i.test(cardDefinition(instance).name));
}

function applySlideSquare(state: GameState, player: PlayerState, enteredFrom: Cell): Cell | null {
  const arena = arenaForState(state);
  const slideLabel = cellLabel(player.position);
  if (!arena.slideSquares?.includes(slideLabel) || !isHighGround(state, enteredFrom)) return null;
  const dx = player.position.x - enteredFrom.x;
  const dy = player.position.y - enteredFrom.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return null;
  const forced = { x: player.position.x + dx, y: player.position.y + dy };
  if (forced.x < 1 || forced.x > boardWidth(state) || forced.y < 0 || forced.y >= boardHeight(state)) {
    state.log.unshift(`${player.name} entered Slide Square ${slideLabel}, but the board edge stopped the Slide.`);
    return null;
  }

  const blockingObject = state.objects.find((object) => object.position.x === forced.x && object.position.y === forced.y);
  if (blockingObject) {
    if (isWallObject(blockingObject)) {
      state.log.unshift(`${player.name} entered Slide Square ${slideLabel}, but ${blockingObject.name} stopped the Slide.`);
      return null;
    }
    const pushedTo = { x: forced.x + dx, y: forced.y + dy };
    const pushBlocked = pushedTo.x < 1 || pushedTo.x > boardWidth(state) || pushedTo.y < 0 || pushedTo.y >= boardHeight(state)
      || state.objects.some((object) => object.id !== blockingObject.id && object.position.x === pushedTo.x && object.position.y === pushedTo.y)
      || Object.values(state.players).some((candidate) => candidate.hp > 0 && candidate.position.x === pushedTo.x && candidate.position.y === pushedTo.y);
    if (pushBlocked) {
      destroyObject(state, blockingObject.id, player.id, 'a Slide collision');
    } else {
      const from = { ...blockingObject.position };
      blockingObject.position = pushedTo;
      state.objectPushAnimations.push({ id: `${state.turn}-slide-object-${++instanceSequence}`, objectId: blockingObject.id, from, to: { ...pushedTo }, dx, dy, collided: false, path: [{ ...pushedTo }] });
      state.log.unshift(`${player.name}'s Slide pushed ${blockingObject.name} from ${cellLabel(from)} to ${cellLabel(pushedTo)}.`);
    }
  }

  const blockingPlayer = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.hp > 0 && candidate.position.x === forced.x && candidate.position.y === forced.y);
  if (blockingPlayer) {
    dealDamage(state, blockingPlayer, 1, true, player.id, 'other');
    if (blockingPlayer.hp > 0) {
      const pushedTo = { x: forced.x + dx, y: forced.y + dy };
      const pushBlocked = pushedTo.x < 1 || pushedTo.x > boardWidth(state) || pushedTo.y < 0 || pushedTo.y >= boardHeight(state)
        || isForbiddenSlideAscent(state, forced, pushedTo)
        || state.objects.some((object) => object.position.x === pushedTo.x && object.position.y === pushedTo.y)
        || Object.values(state.players).some((candidate) => candidate.id !== blockingPlayer.id && candidate.hp > 0 && candidate.position.x === pushedTo.x && candidate.position.y === pushedTo.y);
      if (pushBlocked) {
        state.log.unshift(`${blockingPlayer.name} received 1 collision Damage but could not be pushed by ${player.name}'s Slide.`);
        return null;
      }
      const from = { ...blockingPlayer.position };
      blockingPlayer.position = pushedTo;
      blockingPlayer.visualMovement = { from, path: [{ ...pushedTo }] };
      recordQuestMovement(state, blockingPlayer.id, 1, true, pushedTo);
      markCharacterMoved(blockingPlayer, 'enemy-ability');
      state.log.unshift(`${blockingPlayer.name} received 1 Damage and was pushed to ${cellLabel(pushedTo)} by ${player.name}'s Slide.`);
    }
  }

  player.position = forced;
  player.visualMovement?.path.push({ ...forced });
  state.log.unshift(`${player.name} slid automatically from ${slideLabel} to ${cellLabel(forced)} without spending MOV.`);
  return forced;
}

function captureMovementUndo(state: GameState, player: PlayerState) {
  if (state.movementUndo?.playerId === player.id) return;
  const snapshot = structuredClone(state);
  snapshot.movementUndo = null;
  state.movementUndo = { playerId: player.id, stateJson: JSON.stringify(snapshot), actionsRemaining: player.actionsRemaining, perkUsed: player.perkUsed };
}

function cancelMovement(state: GameState, playerId: PlayerId): CommandResult {
  const undo = state.movementUndo;
  const player = state.players[playerId];
  if (!undo || undo.playerId !== playerId || playerId !== state.activePlayerId) return fail(state, 'There is no movement to cancel.');
  if (!['active', 'dashing'].includes(state.phase)) return fail(state, 'Movement cannot be cancelled during the current choice.');
  if (player.actionsRemaining !== undo.actionsRemaining || player.perkUsed !== undo.perkUsed) return fail(state, 'Movement cannot be cancelled after using an Action.');
  const restored = JSON.parse(undo.stateJson) as GameState;
  restored.movementUndo = null;
  restored.log.unshift(`${restored.players[playerId].name} cancelled their movement and returned to the position before movement began.`);
  return ok(restored);
}

export function applyCommand(source: GameState, rawCommand: unknown): CommandResult {
  const parsed = GameCommandSchema.safeParse(rawCommand);
  if (!parsed.success) return fail(source, 'Invalid command.');
  const command = parsed.data;
  const state = structuredClone(source);
  discardBaselineByCommand.set(state, Object.fromEntries((Object.keys(state.players) as PlayerId[]).map((id) => [id, new Set(state.players[id].discard.map((card) => card.instanceId))])));
  if (command.type === 'cancel-movement') return cancelMovement(state, command.playerId);
  if (command.type === 'combat-stack-choice') return submitLocalCombatStackChoice(state, command.playerId, command.cardInstanceId);
  if (command.type === 'place-character') return resolveLordaeronPlacement(state, command.playerId, command.to);
  if (command.type === 'choose-focus') return resolveFocusChoice(state, command.playerId, command.focus);
  if (command.type === 'back-focus-choice') return returnToFocusChoice(state, command.playerId);
  if (command.type === 'choose-focus-card') return resolveFocusCardChoice(state, command.playerId, command.cardId);
  if (command.type === 'phase-card-choice') return resolvePhaseCardChoice(state, command.playerId, command.cardId);
  if (command.type === 'phase-three-operation') return resolvePhaseThreeOperation(state, command.playerId, command.cardInstanceId, command.operation);
  if (command.type === 'phase-three-finish') return finishPhaseThreeChoices(state, command.playerId);
  if (command.type === 'phase-card-destination') return resolvePhaseDestination(state, command.playerId, command.destination);
  if (command.type === 'fireball-target') return resolveFireballTarget(state, command.playerId, command.targetId);
  if (command.type === 'portal-teleport') return resolvePortalTeleport(state, command.playerId, command.to);
  if (command.type === 'ack-combat') return acknowledgeCombat(state, command.playerId, command.combatExpiresAt);
  if (command.type === 'mana-choice') return resolveManaChoice(state, command.playerId, command.consume);
  if (command.type === 'minimize-mana-choice') return minimizeManaChoice(state, command.playerId);
  if (command.type === 'exhaust-decision') return resolveExhaustDecision(state, command.playerId, command.use);
  if (command.type === 'blessing-light-decision') return resolveBlessingLightDecision(state, command.playerId, command.use);
  if (command.type === 'blessing-might-decision') return resolveBlessingMightDecision(state, command.playerId, command.use);
  if (command.type === 'blessing-shield-decision') return resolveBlessingShieldDecision(state, command.playerId, command.use);
  if (command.type === 'blessing-faith-decision') return resolveBlessingFaithDecision(state, command.playerId, command.use);
  if (command.type === 'feed-spirit-decision') return resolveFeedSpiritDecision(state, command.playerId, command.cardInstanceId);
  if (command.type === 'blessed-prayer-discard') return resolveBlessedPrayerDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'inner-peace-status-choice') return resolveInnerPeaceStatusChoice(state, command.playerId, command.cardInstanceId);
  if (command.type === 'spirit-guardian-square') return resolveSpiritGuardianSquare(state, command.playerId, command.to);
  if (command.type === 'mythril-helmet-decision') return resolveMythrilHelmetDecision(state, command.playerId, command.use);
  if (command.type === 'mana-barrage-decision') return resolveManaBarrageDecision(state, command.playerId, command.use);
  if (command.type === 'vicious-mockery-decision') return resolveViciousMockeryDecision(state, command.playerId, command.use);
  if (state.phase === 'finished') return fail(source, 'This match is already over.');
  if (command.type === 'defend' || command.type === 'pass-defense') return resolveDefense(state, command);
  if (command.type === 'force-disarm-discard') return resolveForceDisarmDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'flurry-pay') return resolveFlurryPay(state, command.playerId, command.cardInstanceId);
  if (command.type === 'flurry-decline') return resolveFlurryDecline(state, command.playerId);
  if (command.type === 'flurry-enemy-discard') return resolveFlurryEnemyDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'discard-card') return resolveFinishingDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'force-throw-target') return selectForceThrowTarget(state, command.playerId, command.targetKind, command.targetId);
  if (command.type === 'force-throw-direction') return resolveForceThrowDirection(state, command.playerId, command.to);
  if (command.type === 'force-pull-target') return selectForcePullTarget(state, command.playerId, command.targetKind, command.targetId);
  if (command.type === 'arkane-arow-target') return resolveArkaneArowTarget(state, command.playerId, command.to);
  if (command.type === 'arm-da-wiz-choice') return resolveArmDaWizChoice(state, command.playerId, command.choice);
  if (command.type === 'arm-da-wiz-target') return resolveArmDaWizTarget(state, command.playerId, command.objectId);
  if (command.type === 'debug-teleport-object') return teleportTestObject(state, command.playerId, command.objectId, command.to);
  if (command.type === 'kyk-target') return selectKykTarget(state, command.playerId, command.objectId);
  if (command.type === 'kyk-direction') return resolveKykDirection(state, command.playerId, command.to);
  if (command.type === 'preparation-teleport') return resolvePreparationTeleport(state, command.playerId, command.objectId);
  if (command.type === 'blink-teleport') return resolveBlinkTeleport(state, command.playerId, command.to);
  if (command.type === 'blink-discard') return resolveBlinkDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'preparation-discard') return resolvePreparationDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'snowball-discard') return resolveSnowballDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'mana-blast-discard') return resolveManaBlastDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'mana-blast-refuse') return resolveManaBlastRefuse(state, command.playerId);
  if (command.type === 'grimoire-discard') return resolveGrimoireDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'arcane-missle-target') return resolveArcaneMissleTarget(state, command.playerId, command.targetId);
  if (command.type === 'chain-lightning-target') return resolveChainLightningTarget(state, command.playerId, command.targetId);
  if (command.type === 'magic-hand-target') return selectMagicHandTarget(state, command.playerId, command.targetKind, command.targetId);
  if (command.type === 'magic-hand-direction') return resolveMagicHandDirection(state, command.playerId, command.to);
  if (command.type === 'shizzle-destination') return resolveShizzleDestination(state, command.playerId, command.to);
  if (command.type === 'cancel-targeting') return cancelCardTargeting(state, command.playerId);
  if (command.type === 'boomerang-target') return resolveBoomerangTarget(state, command.playerId, command.targetId);
  if (command.type === 'mind-tricks-discard') return resolveMindTricksDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'mind-tricks-finish') return finishMindTricksSelection(state, command.playerId);
  if (command.type === 'mind-tricks-enemy-discard') return resolveMindTricksEnemyDiscard(state, command.playerId, command.cardInstanceId);
  if (command.type === 'move' && state.phase === 'double-jump') {
    if (state.doubleJump?.playerId !== command.playerId) return fail(source, 'Only Shinobi may resolve Double Jump movement.');
    return moveDoubleJump(state, state.players[command.playerId], command.to);
  }
  if (command.playerId !== state.activePlayerId) return fail(source, 'It is not this player’s turn.');
  if (command.type === 'cancel-dash') return cancelDash(state, command.playerId);
  if (command.type === 'end-dance') return endDance(state, command.playerId);
  if (command.type === 'end-turn' && state.phase === 'choosing-end-discard') {
    if (state.players[command.playerId].hand.length > 5) return fail(source, 'Discard until no more than 5 cards remain before ending the turn.');
    return ok(endTurn(state));
  }
  if (!['active', 'dashing', 'dance-through', 'double-jump', 'shizzle-move'].includes(state.phase)) return fail(source, 'Complete the current card choice first.');

  const player = state.players[command.playerId];
  if (player.swiftformEnemyUnderfoot && command.type !== 'move') return fail(source, 'Shinobi must continue moving and leave the enemy-occupied square before taking another action or ending the turn.');
  if (player.spiritEnemyUnderfoot && command.type !== 'move') return fail(source, 'Spirit Form must continue moving and leave the enemy-occupied Square before taking another action or ending the turn.');
  if (player.spiritObjectUnderfoot && command.type !== 'move') return fail(source, 'Spirit Form must continue moving and leave the Object-occupied Square before taking another action or ending the turn.');
  if (command.type === 'remove-status') {
    if (state.phase !== 'active') return fail(source, 'Status Cards can only be Removed as an Action during the active phase.');
    if (player.actionsRemaining <= 0) return fail(source, 'No actions remain.');
    const instance = player.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance) return fail(source, 'That Status Card is not in the Hand.');
    const status = cardDefinition(instance);
    if (status.kind !== 'status' || !status.canRemoveAsAction) return fail(source, 'This card cannot be Removed as an Action.');
    state.movementUndo = null;
    removeCard(player, instance.instanceId);
    player.actionsRemaining -= 1;
    state.log.unshift(`${player.name} spent 1 Action to Remove ${status.name} from the game.`);
    return ok(state);
  }
  if (command.type === 'end-turn') {
    if (state.phase === 'dance-through' || state.phase === 'double-jump') return fail(source, 'Complete the card movement first.');
    return ok(endTurn(state));
  }

  if (command.type === 'move') {
    if (state.phase === 'dance-through') return moveDanceThrough(state, player, command.to);
    if (state.phase === 'shizzle-move') return moveShizzle(state, player, command.to);
    if (player.movementRemaining <= 0) return fail(source, 'No movement remains. Use Free Move + Draw Card first.');
    const path = movementPath(state, player, command.to);
    const cost = path.length;
    const spiritEnemySquares = player.spiritForm
      ? path.filter((cell) => Object.values(state.players).some((candidate) => candidate.id !== player.id && candidate.position.x === cell.x && candidate.position.y === cell.y)).length
      : 0;
    const spiritObjectSquares = player.spiritForm
      ? path.filter((cell) => state.objects.some((object) => object.position.x === cell.x && object.position.y === cell.y)).length
      : 0;
    const spiritRefunds = spiritEnemySquares + spiritObjectSquares;
    // Occupied-Square refunds are earned only after Spirit Form reaches those
    // Squares. They cannot be borrowed in advance to authorize a longer path.
    if (cost < 1 || cost > player.movementRemaining) return fail(source, 'That square costs more movement than remains.');
    const targetEnemy = Object.values(state.players).find((candidate) => candidate.hp > 0 && candidate.id !== player.id && candidate.position.x === command.to.x && candidate.position.y === command.to.y);
    if (targetEnemy && isHighGroundSlideEntry(state, player.position, command.to)) return fail(source, 'An occupied Slide Square cannot be entered from adjacent High Ground.');
    const targetObject = state.objects.find((object) => object.position.x === command.to.x && object.position.y === command.to.y);
    if (targetObject && !player.spiritForm) return fail(source, 'That square is occupied by an Object.');
    if (targetEnemy && !player.spiritForm && (!player.swiftformCanPassEnemies || player.movementRemaining - cost <= 0)) return fail(source, 'Shinobi may pass through an enemy with Swiftform, but must retain enough movement to leave their square.');
    const previousUnderfoot = player.swiftformEnemyUnderfoot;
    const movementOrigin = { ...player.position };
    captureMovementUndo(state, player);
    recordQuestMovement(state, player.id, cost, false, command.to);
    player.visualMovement = { from: movementOrigin, path: path.map((cell) => ({ ...cell })) };
    player.position = command.to;
    player.movementRemaining = Math.max(0, player.movementRemaining - cost + spiritRefunds);
    if (player.character === 'john-christ') {
      if (player.spiritForm) {
        player.spiritMovementSpentThisTurn = true;
        player.spiritMovementDepleted ||= player.movementRemaining <= 0;
      }
      else player.johnCumulativeMovementRemaining = player.movementRemaining;
    }
    const slideEnteredFrom = path.length > 1 ? path[path.length - 2] : movementOrigin;
    applySlideSquare(state, player, slideEnteredFrom);
    if (player.swiftformCanPassEnemies) {
      const passedIds = new Set(path.slice(0, -1).flatMap((cell) => Object.values(state.players).filter((candidate) => candidate.id !== player.id && candidate.position.x === cell.x && candidate.position.y === cell.y).map((candidate) => candidate.id)));
      for (const enemyId of passedIds) {
        const appliedPinned = applySwiftformPinnedOnce(state, player, enemyId);
        state.log.unshift(`${player.name} moved through ${state.players[enemyId].name}${appliedPinned ? ' and applied Pinned' : player.swiftformPinsPassedEnemies ? '; Swiftform had already affected this enemy this turn' : ''}.`);
      }
      if (previousUnderfoot) {
        const appliedPinned = applySwiftformPinnedOnce(state, player, previousUnderfoot);
        state.log.unshift(`${player.name} completed movement through ${state.players[previousUnderfoot].name}${appliedPinned ? ' and applied Pinned' : player.swiftformPinsPassedEnemies ? '; Swiftform had already affected this enemy this turn' : ''}.`);
      }
      player.swiftformEnemyUnderfoot = targetEnemy?.id ?? null;
    }
    if (player.spiritForm) {
      player.spiritEnemyUnderfoot = targetEnemy?.id ?? null;
      player.spiritObjectUnderfoot = targetObject?.id ?? null;
      const crossedEnemies = new Map<PlayerId, PlayerState>();
      for (const cell of path) for (const candidate of Object.values(state.players)) {
        if (candidate.id !== player.id && candidate.hp > 0 && candidate.position.x === cell.x && candidate.position.y === cell.y) crossedEnemies.set(candidate.id, candidate);
      }
      for (const enemy of crossedEnemies.values()) {
        if (player.spiritSiphonedEnemyIds.includes(enemy.id)) continue;
        const previousMoveRange = movementRangeForAdjustment(enemy);
        player.spiritSiphonedEnemyIds.push(enemy.id);
        enemy.spiritSiphonedMovement += 1;
        adjustUnspentMovementForRangeChange(enemy, previousMoveRange);
        state.log.unshift(`${player.name} siphoned 1 MOV from ${enemy.name} in Spirit Form. The penalty lasts until the end of ${enemy.name}'s turn.`);
      }
      if (spiritEnemySquares > 0) state.log.unshift(`${player.name} passed through ${spiritEnemySquares} enemy-occupied Square${spiritEnemySquares === 1 ? '' : 's'} in Spirit Form and regained ${spiritEnemySquares} MOV.`);
      if (spiritObjectSquares > 0) state.log.unshift(`${player.name} passed through ${spiritObjectSquares} Object-occupied Square${spiritObjectSquares === 1 ? '' : 's'} in Spirit Form and regained ${spiritObjectSquares} MOV.`);
    }
    markCharacterMoved(player, 'voluntary');
    if (state.phase === 'dashing') state.dashCancellation = null;
    state.log.unshift(`${player.name} moved ${cost} to ${cellLabel(player.position)} (${player.movementRemaining} movement left).`);
    if (state.phase === 'dashing' && player.movementRemaining === 0) return ok(endTurn(state));
    return ok(state);
  }

  if (state.phase !== 'active') return fail(source, 'Only movement is available during Dash.');
  if (command.type === 'free-move') {
    if (player.freeMoveUsed) return fail(source, 'Free Move was already used this turn.');
    player.freeMoveUsed = true;
    const grantedMovement = effectiveMoveRange(player);
    if (player.character === 'john-christ') {
      player.johnCumulativeMovementRemaining += johnCumulativeMoveRange(player);
      if (player.spiritForm) {
        player.movementRemaining = Math.max(player.movementRemaining, 1);
        player.spiritMovementDepleted = false;
      } else player.movementRemaining = player.johnCumulativeMovementRemaining;
    } else player.movementRemaining += grantedMovement;
    const drawn = drawCards(player, 1);
    state.log.unshift(`${player.name} used Free Move, drew ${drawn} card, and gained ${grantedMovement} movement.`);
    const panicIds = player.hand.filter((card) => card.cardId === 'panic').map((card) => card.instanceId);
    if (panicIds.length > 0) {
      for (const instanceId of panicIds) removeCard(player, instanceId);
      const path = spendMovementRandomly(state, player, 'Panic');
      state.log.unshift(`${player.name} Removed ${panicIds.length} Panic Status Card${panicIds.length === 1 ? '' : 's'} with Free Move and spent ${path.length} movement randomly.`);
    }
    return ok(state);
  }
  if (command.type === 'attack') {
    if (player.hand.some((card) => card.cardId === 'panic')) return fail(source, 'Panic prevents the use of Attack Cards until Free Move Removes it.');
    if (player.actionsRemaining <= 0) return fail(source, 'No actions remain.');
    const instance = player.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance || cardDefinition(instance).kind !== 'attack') return fail(source, 'That Attack card is not in the hand.');
    const card = cardDefinition(instance);
    if (spiritFormBlocksCard(player, card)) return fail(source, 'John Christ cannot use Cards containing “Bless” while in Spirit Form.');
    state.movementUndo = null;
    if (command.targetKind === 'object') return resolveObjectAttack(state, player, instance, command.targetId);
    const defender = state.players[command.targetId as PlayerId];
    if (!defender) return fail(source, 'That enemy does not exist.');
    if (command.targetId === command.playerId) return fail(source, 'A character cannot attack itself.');
    if (distance(player.position, defender.position) > effectiveAttackRange(state, player)) return fail(source, 'Target is outside the attack range.');
    if (!hasLineOfSight(state, player.position, defender.position)) return fail(source, 'A Wall Object blocks line of sight to that target.');
    if (!canAttackTargetSquare(state, player.position, defender.position)) return fail(source, 'Terrain protection prevents an Attack from this Square.');
    Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
    const simultaneousCombatStack = Boolean((state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack);
    if (!simultaneousCombatStack && card.id === 'fistbolt' && player.character === 'orkk' && player.rageStacks === 0) {
      player.rageStacks = 1;
      state.log.unshift(`${player.name} generated 1 Rage with Fistbolt before combat.`);
    }
    discardFromHand(player, instance.instanceId);
    player.actionsRemaining -= 1;
    const banner = simultaneousCombatStack ? undefined : player.hand.find((entry) => entry.cardId === 'banner');
    const bannerBonus = banner ? 1 : 0;
    if (banner) { removeCard(player, banner.instanceId); state.log.unshift(`${player.name} applied The Banner for +1 ATT and Removed it.`); }
    const lightsaberBonus = player.character === 'shinobi' && player.lightsaberBuff ? 1 : 0;
    const rageBonus = player.character === 'orkk' ? player.rageStacks : 0;
    const highGroundBonus = highGroundAttackValueBonus(state, player, defender.position);
    const exhaustPenalty = player.hand.filter((entry) => entry.cardId === 'exhaust').length;
    const guardianPenalty = spiritGuardianEnemyPenalty(state, player);
    const returnToHandAfterCombat = player.highgroundAdvantageBuff || card.id === 'snowball-effect';
    if (player.highgroundAdvantageBuff) player.highgroundAdvantageBuff = false;
    const magicianAttackBonus = player.character === 'magician' ? player.arcaneBoltAttackBonus : 0;
    const spiritAttackBonus = player.character === 'john-christ' && player.spiritForm ? 2 : 0;
    const manaBlastConsumeBonus = card.id === 'mana-blast' && player.manaMode === 'consume' ? 2 : 0;
    const attackModifiers: CombatModifier[] = [
      lightsaberBonus && { value: lightsaberBonus, source: 'Lightsaber status' },
      rageBonus && { value: rageBonus, source: `${rageBonus} Rage Stack${rageBonus === 1 ? '' : 's'}` },
      highGroundBonus && { value: highGroundBonus, source: 'High Ground advantage' },
      magicianAttackBonus && { value: magicianAttackBonus, source: 'Arcane Bolt bonus' },
      spiritAttackBonus && { value: spiritAttackBonus, source: 'Spirit Form' },
      manaBlastConsumeBonus && { value: manaBlastConsumeBonus, source: 'Mana Blast Consume' },
      bannerBonus && { value: bannerBonus, source: 'The Banner' },
      exhaustPenalty && { value: -exhaustPenalty, source: `${exhaustPenalty} Exhaust Card${exhaustPenalty === 1 ? '' : 's'} in Hand` },
      guardianPenalty && { value: -guardianPenalty, source: 'adjacent enemy Spirit Guardian' },
    ].filter((modifier): modifier is CombatModifier => Boolean(modifier));
    state.pendingAttack = { attackerId: player.id, defenderId: defender.id, cardId: card.id, cardInstanceId: instance.instanceId, attackValue: card.value + lightsaberBonus + rageBonus + highGroundBonus + magicianAttackBonus + spiritAttackBonus + manaBlastConsumeBonus + bannerBonus - exhaustPenalty - guardianPenalty, attackModifiers, returnToHandAfterCombat, shieldEquippedAtStart: player.shieldEquipped, rageSpent: rageBonus, generatesMana: player.character === 'magician' && player.manaMode === 'generate', attackerWasInSpiritForm: Boolean(spiritAttackBonus) };
    state.phase = 'defending';
    state.log.unshift(`${player.name} played and discarded ${card.name} (${card.value + lightsaberBonus + rageBonus + highGroundBonus + magicianAttackBonus + spiritAttackBonus + manaBlastConsumeBonus + bannerBonus - exhaustPenalty - guardianPenalty}${lightsaberBonus ? ', including +1 Lightsaber' : ''}${rageBonus ? `, including +${rageBonus} Rage` : ''}${spiritAttackBonus ? ', including +2 Spirit Form' : ''}${highGroundBonus ? ', including +1 High Ground' : ''}${bannerBonus ? ', including +1 The Banner' : ''}${magicianAttackBonus ? `, including +${magicianAttackBonus} Arcane Bolt` : ''}${manaBlastConsumeBonus ? ', including +2 Mana Blast Consume' : ''}${exhaustPenalty ? `, including -${exhaustPenalty} Exhaust` : ''}${guardianPenalty ? ', including -1 adjacent enemy Spirit Guardian' : ''}). ${defender.name} may defend.`);
    if (spiritAttackBonus) exitSpiritForm(state, player, 'after using an Attack Card');
    return ok(state);
  }
  if (command.type === 'play-free-action') {
    Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
    const blessingPrayer = player.hand.find((entry) => entry.instanceId === command.cardInstanceId && entry.cardId === 'blessing-prayer');
    if (blessingPrayer) {
      if (player.spiritForm) return fail(source, 'John Christ cannot use Cards containing “Bless” while in Spirit Form.');
      if (player.movementRemaining < 1) return fail(source, 'Blessing: Prayer requires 1 available MOV.');
      player.movementRemaining -= 1;
      if (player.character === 'john-christ') player.johnCumulativeMovementRemaining = Math.max(0, player.johnCumulativeMovementRemaining - 1);
      removeCard(player, blessingPrayer.instanceId);
      const drawn = drawCards(player, 1);
      state.log.unshift(`${player.name} used Blessing: Prayer as a Free Action, lost 1 MOV, drew ${drawn} Card, and Removed the Blessing.`);
      return ok(state);
    }
    return beginBoomerang(state, player, command.cardInstanceId);
  }
  if (command.type === 'play-perk') {
    const result = playPerkFromHand(state, player, command);
    if (result.ok) result.state.movementUndo = null;
    return result;
  }
  if (command.type === 'use-echo-perk') {
    const result = useEchoPerk(state, player, command.position);
    if (result.ok) result.state.movementUndo = null;
    return result;
  }
  if (command.type === 'guard') {
    if (!player.freeMoveUsed) return fail(source, 'Use Free Move + Draw Card before selecting Guard.');
    const drawn = drawCards(player, 1);
    if (player.hand.length === 0) return fail(source, 'There is no card available to discard.');
    if (!player.hand.some((entry) => !cardDefinition(entry).cannotBeDiscarded)) {
      const winner = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.hp > 0)?.id ?? null;
      player.hp = 0;
      state.phase = 'finished';
      state.winner = winner;
      state.log.unshift(`${player.name} chose Guard but had no legal Card to discard after drawing and lost the duel${winner ? `; ${state.players[winner].name} wins the match!` : '.'}`);
      return ok(state);
    }
    state.phase = 'choosing-guard-discard';
    state.log.unshift(`${player.name} chose Guard and drew ${drawn} card. Select 1 card to discard.`);
    return ok(state);
  }
  if (command.type === 'dash') {
    if (!player.freeMoveUsed) return fail(source, 'Use Free Move + Draw Card before selecting Dash.');
    if (player.hand.some((entry) => entry.cardId === 'burning')) {
      state.dashCancellation = { previousMovementRemaining: player.movementRemaining, discardedCard: null };
      (state.dashCancellation as typeof state.dashCancellation & { previousJohnCumulativeMovementRemaining: number }).previousJohnCumulativeMovementRemaining = player.johnCumulativeMovementRemaining;
      state.phase = 'dashing';
      const dashMovement = effectiveMoveRange(player);
      grantMovement(player, dashMovement);
      state.log.unshift(`${player.name} used Burning as the Dash cost and adds ${dashMovement} movement (${player.movementRemaining} total).`);
      return ok(resolveBurningDash(state, player));
    }
    if (!player.hand.some((entry) => !cardDefinition(entry).cannotBeDiscarded && !isBlessingCard(entry))) return fail(source, 'There is no non-Blessing Card available to discard for Dash.');
    state.dashCancellation = { previousMovementRemaining: player.movementRemaining, discardedCard: null };
    (state.dashCancellation as typeof state.dashCancellation & { previousJohnCumulativeMovementRemaining: number }).previousJohnCumulativeMovementRemaining = player.johnCumulativeMovementRemaining;
    state.phase = 'choosing-dash-discard';
    state.log.unshift(`${player.name} chose Dash. Select 1 card to discard.`);
    return ok(state);
  }
  return fail(source, 'That action is not available.');
}

function playPerkFromHand(state: GameState, player: PlayerState, command: Extract<GameCommand, { type: 'play-perk' }>): CommandResult {
  const validation = validatePerkAction(state, player);
  if (validation) return validation;
  const instance = player.hand.find((card) => card.instanceId === command.cardInstanceId);
  if (!instance || cardDefinition(instance).kind !== 'perk') return fail(state, 'That Perk card is not in the hand.');
  const perk = cardDefinition(instance);
  if (spiritFormBlocksCard(player, perk)) return fail(state, 'John Christ cannot use Cards containing “Bless” while in Spirit Form.');
  if (perk.id === 'vicious-mockery') return fail(state, 'Vicious Mockery can only be applied optionally during combat.');
  if ((perk.id === 'fireball' || perk.id === 'portal') && command.destination !== 'direct') return fail(state, `${perk.name} is a Reward Card and cannot be placed in Spell Echo.`);
  if (perk.id === 'arkane-arow' && (player.character !== 'orkk' || !player.shieldEquipped)) return fail(state, 'ARKANE AROW requires Da Orkk to have his Shield equipped.');
  if (perk.id === 'arm-da-wiz' && (player.character !== 'orkk' || player.shieldEquipped)) return fail(state, 'Arm da Wiz requires Da Orkk to have his Shield unequipped.');
  beginGuardianPerkDamageAction(state);
  Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
  const targetingUndo = snapshotPerkTargeting(player);
  player.actionsRemaining -= 1;
  player.perkUsed = true;
  if (perk.id === 'fireball') {
    const handIndex = player.hand.findIndex((card) => card.instanceId === instance.instanceId);
    player.hand.splice(handIndex, 1);
    (state as GameState & { fireball?: { casterId: PlayerId; undo: PerkTargetingUndo } | null }).fireball = { casterId: player.id, undo: targetingUndo };
    state.phase = 'choosing-fireball-target';
    state.log.unshift(`${player.name} used the one-use Fireball Reward. Choose an enemy within Range 3.`);
    return ok(state);
  }
  if (perk.id === 'portal') {
    discardFromHand(player, instance.instanceId);
    (state as GameState & { portal?: { casterId: PlayerId; undo: PerkTargetingUndo } | null }).portal = { casterId: player.id, undo: targetingUndo };
    state.phase = 'choosing-portal-target';
    state.log.unshift(`${player.name} used Portal. Choose any empty Square to teleport to.`);
    return ok(state);
  }
  if (command.destination === 'direct') {
    discardFromHand(player, instance.instanceId);
    applyPerkEffects(state, player, perk, 1);
    if (state.phase === 'active') gainManaFromResolvedSpell(state, player);
    attachTargetingUndo(state, player.id, targetingUndo);
    state.log.unshift(`${player.name} played ${perk.name} directly at level 1 and discarded it.`);
    return ok(state);
  }
  const oldPositionOne = player.spellEcho[0];
  if (oldPositionOne && !command.replaceExisting) return fail(state, 'Confirm discarding the Perk currently in Spell Echo position 1.');
  if (oldPositionOne) {
    oldPositionOne.revealedToOpponent = false;
    player.discard.push(oldPositionOne);
  }
  const handIndex = player.hand.findIndex((card) => card.instanceId === instance.instanceId);
  const [echoCard] = player.hand.splice(handIndex, 1);
  echoCard.revealedToOpponent = true;
  player.spellEcho[0] = echoCard;
  applyPerkEffects(state, player, perk, 1);
  if (state.phase === 'active') gainManaFromResolvedSpell(state, player);
  attachTargetingUndo(state, player.id, targetingUndo);
  state.log.unshift(`${player.name} placed ${perk.name} in Spell Echo 1 and used its level 1 effects${oldPositionOne ? ', discarding the previous Perk' : ''}.`);
  return ok(state);
}

function useEchoPerk(state: GameState, player: PlayerState, position: number): CommandResult {
  const validation = validatePerkAction(state, player);
  if (validation) return validation;
  const index = position - 1;
  const instance = player.spellEcho[index];
  if (!instance) return fail(state, `Spell Echo position ${position} is empty.`);
  const perk = cardDefinition(instance);
  if (perk.kind !== 'perk') return fail(state, 'Only Perk cards may occupy Spell Echo.');
  if (spiritFormBlocksCard(player, perk)) return fail(state, 'John Christ cannot use Cards containing “Bless” while in Spirit Form.');
  if (perk.id === 'arkane-arow' && (player.character !== 'orkk' || !player.shieldEquipped)) return fail(state, 'ARKANE AROW requires Da Orkk to have his Shield equipped.');
  if (perk.id === 'arm-da-wiz' && (player.character !== 'orkk' || player.shieldEquipped)) return fail(state, 'Arm da Wiz requires Da Orkk to have his Shield unequipped.');
  beginGuardianPerkDamageAction(state);
  Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
  const targetingUndo = snapshotPerkTargeting(player);
  player.actionsRemaining -= 1;
  player.perkUsed = true;
  applyPerkEffects(state, player, perk, position);
  if (state.phase === 'active') gainManaFromResolvedSpell(state, player);
  if (index === 1) [player.spellEcho[0], player.spellEcho[1]] = [player.spellEcho[1], player.spellEcho[0]];
  if (index === 2) player.spellEcho = [player.spellEcho[2], player.spellEcho[0], player.spellEcho[1]];
  attachTargetingUndo(state, player.id, targetingUndo);
  state.log.unshift(`${player.name} used ${perk.name} from Spell Echo ${position} at level ${position}; it cycled to position 1.`);
  return ok(state);
}

function validatePerkAction(state: GameState, player: PlayerState): CommandResult | null {
  if (state.phase !== 'active') return fail(state, 'Perks can only be used during the active phase.');
  if (player.actionsRemaining <= 0) return fail(state, 'No actions remain.');
  if (player.perkUsed) return fail(state, 'Only one Perk action may be used per turn.');
  if (player.hand.some((card) => card.cardId === 'panic')) return fail(state, 'Panic prevents the use of Perk Cards until Free Move Removes it.');
  return null;
}

function applyPerkEffects(state: GameState, player: PlayerState, perk: Card, level: number) {
  if (perk.id === 'spirit-guardian') {
    (state as GameState & { spiritGuardian?: { casterId: PlayerId; level: number; undo: PerkTargetingUndo | null } | null }).spiritGuardian = { casterId: player.id, level, undo: null };
    state.phase = 'choosing-spirit-guardian-square';
    state.log.unshift(`Spirit Guardian level ${level}: choose an empty Square within Range ${effectiveAttackRange(state, player)}.`);
    return;
  }
  if (perk.id === 'mind-blast') {
    state.arcaneMissle = { casterId: player.id, level, damage: 0, undo: null };
    (state as GameState & { mindBlast?: { casterId: PlayerId; level: number } | null }).mindBlast = { casterId: player.id, level };
    state.phase = 'choosing-arcane-missle-target';
    state.log.unshift(`Mind Blast level ${level}: select an enemy within Range ${effectiveAttackRange(state, player)} and line of sight.`);
    return;
  }
  if (perk.id === 'inner-peace') {
    exitSpiritForm(state, player, 'through Inner Peace');
    const handStatuses = player.hand.filter(isNegativeStatusCard);
    if (handStatuses.length > 0) {
      (state as GameState & { innerPeace?: { playerId: PlayerId; level: number } | null }).innerPeace = { playerId: player.id, level };
      state.phase = 'choosing-blessed-prayer-discard';
      state.log.unshift(`Inner Peace level 1: ${player.name} may choose 1 negative Status Card from Hand to Remove.`);
    } else completeInnerPeace(state, player, level);
    return;
  }
  if (perk.id === 'fear-the-justice') {
    enterSpiritForm(state, player, 'through Fear the Justice');
    const affectedEnemies = level >= 2
      ? Object.values(state.players).filter((enemy) => enemy.id !== player.id && enemy.hp > 0 && distance(player.position, enemy.position) === 1)
      : [];
    for (const enemy of affectedEnemies) {
      enemy.hand.push({ instanceId: `${enemy.id}-panic-${++instanceSequence}`, cardId: 'panic', revealedToOpponent: true, sourcePlayerId: player.id });
      state.log.unshift(`Fear the Justice applied Panic to adjacent enemy ${enemy.name}.`);
    }
    if (level >= 3) {
      const discardTargets = affectedEnemies.filter((enemy) => enemy.hand.some((card) => cardDefinition(card).kind === 'defend')).map((enemy) => enemy.id);
      if (discardTargets.length > 0) {
        const [targetId, ...remainingTargetIds] = discardTargets;
        state.forceDisarm = { targetId, cardKind: 'defend', source: 'force-disarm', remainingTargetIds } as typeof state.forceDisarm & { remainingTargetIds: PlayerId[] };
        state.phase = 'choosing-force-disarm-discard';
        state.log.unshift(`Fear the Justice requires ${state.players[targetId].name} to discard 1 Defend Card.`);
      } else state.log.unshift('Fear the Justice found no Defend Cards among the affected enemies.');
    }
    return;
  }
  if (perk.id === 'blessed-prayer') {
    addBlessingCardToJohn(state, player, 'blessing-prayer');
    if (level >= 2) {
      grantMovement(player, 1);
      state.log.unshift(`Blessed Prayer level 2 granted ${player.name} 1 MOV until end of turn.`);
    }
    if (level >= 3) {
      if (player.discard.length > 0) {
        state.phase = 'choosing-blessed-prayer-discard';
        state.log.unshift(`Blessed Prayer level 3: ${player.name} must choose a Card to draw from Discard.`);
      } else state.log.unshift(`Blessed Prayer level 3 found no Card in ${player.name}'s Discard.`);
    }
    return;
  }
  if (perk.id === 'preparation') {
    const consume = player.manaMode === 'consume';
    if (level >= 3) {
      const drawn = drawCards(player, 2);
      grantMana(player, 1);
      state.preparation = { casterId: player.id, consume, undo: null };
      state.phase = 'choosing-preparation-discard';
      state.log.unshift(`Preparation level 3${consume ? ' with Consume' : ''}: ${player.name} drew ${drawn} Cards and must discard any 1 Card from Hand${consume ? ' before teleporting' : ''}.`);
    } else {
      const drawn = drawCards(player, 1);
      if (level >= 2) grantMana(player, 1);
      if (consume) {
        state.preparation = { casterId: player.id, consume: true, undo: null };
        state.phase = 'choosing-preparation-teleport';
      }
      state.log.unshift(`Preparation level ${level}${consume ? ' with Consume' : ''}: ${player.name} drew ${drawn} Card${drawn === 1 ? '' : 's'}${level >= 2 ? ' and gained 1 extra Mana' : ''}${consume ? '; now choose a visible Object to swap with' : ''}.`);
    }
    return;
  }
  if (perk.id === 'arcane-missle') {
    state.arcaneMissle = { casterId: player.id, level, damage: player.manaMode === 'consume' ? 3 : 1, undo: null };
    state.phase = 'choosing-arcane-missle-target';
    state.log.unshift(`Arcane Missile level ${level}: select an enemy target.`);
    return;
  }
  if (perk.id === 'chain-lightning') {
    state.chainLightning = { casterId: player.id, level, bounces: player.manaMode === 'consume' ? 4 : level >= 3 ? 2 : 1, bounceRange: level >= 2 ? 2 : 1, undo: null };
    state.phase = 'choosing-chain-lightning-target';
    state.log.unshift(`Chain Lightning level ${level}: select an enemy within Range ${effectiveAttackRange(state, player)} and line of sight.`);
    return;
  }
  if (perk.id === 'magic-hand') {
    const consume = player.manaMode === 'consume';
    state.magicHand = { casterId: player.id, level, distance: level >= 3 ? boardWidth(state) + boardHeight(state) : 3, consume, targetKind: null, targetId: null, undo: null };
    state.phase = 'choosing-magic-hand-target';
    state.log.unshift(`Magic Hand level ${level}: select ${level >= 3 ? 'an Object or enemy' : 'an Object'} ${level >= 2 ? 'anywhere on the Board' : 'within Range 5'}.`);
    return;
  }
  if (perk.id === 'shizzle') {
    const consume = player.manaMode === 'consume';
    state.shizzle = { casterId: player.id, level, stepsRemaining: level >= 3 ? 3 : 2, consume, enemyUnderfoot: null, started: false, undo: null };
    state.phase = consume ? 'shizzle-move' : 'choosing-shizzle-destination';
    state.log.unshift(consume ? `Shizzle (Consume): move ${state.shizzle.stepsRemaining} times, one Square in any direction.` : `Shizzle level ${level}: select an empty destination in a direct line up to ${state.shizzle.stepsRemaining} Squares away.`);
    return;
  }
  if (perk.id === 'echo-pulse') {
    if (level >= 1) { const drawn = drawCards(player, 1); state.log.unshift(`${perk.name} level 1: ${player.name} drew ${drawn} card.`); }
    if (level >= 2) { player.actionsRemaining += 1; state.log.unshift(`${perk.name} level 2: ${player.name} gained 1 Action.`); }
    if (level >= 3) { const restored = healPlayer(state, player, 2); state.log.unshift(`${perk.name} level 3: ${player.name} restored ${restored} HP.`); }
    return;
  }
  if (perk.id === 'higround-advantage') {
    if (level >= 1) { const drawn = drawCards(player, 1); state.log.unshift(`${perk.name} level 1: ${player.name} drew ${drawn} card.`); }
    if (level >= 2 && player.character === 'shinobi') {
      const previousMoveRange = effectiveMoveRange(player);
      player.lightsaberBuff = true; player.lightsaberStacks += 1;
      adjustUnspentMovementForRangeChange(player, previousMoveRange);
      state.log.unshift(`${perk.name} level 2: Lightsaber gained 1 duration stack (${player.lightsaberStacks} total).`);
    }
    if (level >= 3) { player.highgroundAdvantageBuff = true; state.log.unshift(`${perk.name} level 3: Shinobi's next Attack card will return to Hand.`); }
    return;
  }
  if (perk.id === 'force-throw') {
    const canTargetPlayer = level >= 3;
    const hasObject = state.objects.length > 0;
    const hasEnemyPlayer = canTargetPlayer && Object.values(state.players).some((candidate) => candidate.id !== player.id);
    if (!hasObject && !hasEnemyPlayer) {
      state.log.unshift(`${perk.name} found no valid target.`);
      return;
    }
    state.forceThrow = { casterId: player.id, level, distance: level >= 2 ? 4 : 3, targetRange: 4, targetKind: null, targetId: null, undo: null };
    state.phase = 'choosing-force-throw-target';
    state.log.unshift(`${perk.name}: select ${canTargetPlayer ? 'an Object or enemy Player' : 'an Object'} to push.`);
    return;
  }
  if (perk.id === 'force-pull') {
    state.forcePull = { casterId: player.id, level, distance: level >= 2 ? 2 : 1, targetRange: level >= 2 ? 5 : 4, undo: null };
    state.phase = 'choosing-force-pull-target';
    state.log.unshift(`${perk.name}: select an enemy Player or Object to pull.`);
    return;
  }
  if (perk.id === 'encourage') {
    const drawnFromDeck = drawCards(player, 1);
    state.log.unshift(`EncouRAGE level 1: ${player.name} drew ${drawnFromDeck} Card from Deck.`);
    if (level >= 2) {
      player.rageStacks += 1;
      state.log.unshift(`EncouRAGE level 2: ${player.name} gained 1 Rage (${player.rageStacks} total).`);
    }
    if (level >= 3) {
      let recovered = 0;
      if (player.discard.length > 0) {
        const index = Math.floor(Math.random() * player.discard.length);
        const [card] = player.discard.splice(index, 1);
        const definition = cardDefinition(card);
        card.revealedToOpponent = definition.kind === 'status';
        player.hand.push(card);
        if (card.cardId === 'pinned') {
          player.pinnedStacks += 1;
          player.pinnedGainedThisTurn = (player.pinnedGainedThisTurn ?? 0) + 1;
        }
        recovered = 1;
        state.log.unshift(`EncouRAGE level 3: ${player.name} randomly recovered ${definition.name} from Discard.`);
      }
      if (!recovered) state.log.unshift(`EncouRAGE level 3: ${player.name}'s Discard was empty.`);
    }
    return;
  }
  if (perk.id === 'kyk') {
    const hasAdjacentTarget = state.objects.some((object) => object.kind !== 'wall-pillar' && distance(object.position, player.position) === 1)
      || Object.values(state.players).some((enemy) => enemy.id !== player.id && distance(enemy.position, player.position) === 1);
    if (!hasAdjacentTarget) { state.log.unshift('Kyk found no adjacent Object or enemy.'); return; }
    state.forceThrow = { casterId: player.id, level, distance: level >= 2 ? 4 : 3, targetRange: 1, targetKind: null, targetId: null, undo: null };
    state.phase = 'choosing-kyk-target';
    state.log.unshift('Kyk: select an adjacent Object or enemy to push.');
    return;
  }
  if (perk.id === 'consume-rage') {
    const rageCost = 2;
    if (player.rageStacks >= rageCost) {
      player.rageStacks -= rageCost;
      const healed = healPlayer(state, player, level >= 2 ? 2 : 1);
      state.log.unshift(`Consume Rage removed ${rageCost} Rage and healed ${player.name} for ${healed} HP.`);
    } else state.log.unshift(`Consume Rage could not heal ${player.name}: ${rageCost} Rage stacks were required.`);
    if (level >= 3) {
      const adjacentEnemies = Object.values(state.players).filter((entry) => entry.id !== player.id && distance(entry.position, player.position) === 1);
      adjacentEnemies.forEach((enemy) => enemy.hand.push({ instanceId: `${enemy.id}-status-${++instanceSequence}`, cardId: 'exhaust', revealedToOpponent: true }));
      removeAllDebuffs(player, true);
      state.log.unshift(`Consume Rage level 3 added Exhaust to ${adjacentEnemies.length} adjacent enem${adjacentEnemies.length === 1 ? 'y' : 'ies'} and removed all negative Status Cards from ${player.name}.`);
    }
    return;
  }
  if (perk.id === 'arkane-arow') {
    state.arkaneArow = { casterId: player.id, level, range: level >= 2 ? 4 : 3, undo: null };
    state.phase = 'choosing-arkane-arow-target';
    state.log.unshift(`${perk.name} level ${level}: select a Square within Range ${level >= 2 ? 4 : 3}.`);
    return;
  }
  if (perk.id === 'arm-da-wiz') {
    const range = boardWidth(state) * boardHeight(state);
    const shields = state.objects.filter((entry) => entry.kind === 'orkk-shield' && entry.ownerId === player.id);
    const canRecall = shields.some((shield) => armDaWizPath(state, shield, player.position, range).length > 0);
    const canCreate = true;
    state.armDaWiz = { casterId: player.id, level, range, canCreate, canRecall, undo: null };
    state.phase = 'choosing-arm-da-wiz-choice';
    state.log.unshift(`${perk.name} level ${level}: choose whether to recall a Shield from anywhere on the Board or create and equip a new one.`);
    return;
  }
  if (perk.id === 'swiftform') {
    const moveBonus = level >= 2 ? 2 : 1;
    player.swiftformMoveBonus = moveBonus;
    player.swiftformCanPassEnemies = true;
    player.swiftformPinnedEnemyIds = [];
    if (player.freeMoveUsed) player.movementRemaining += moveBonus;
    if (level >= 3 && player.character === 'shinobi') {
      player.swiftformLightsaberAtTurnEnd = true;
      player.swiftformPinsPassedEnemies = true;
    }
    state.log.unshift(`Swiftform level ${level}: ${player.name} gained +${moveBonus} MOV and may move through enemies${level >= 3 ? ', applying Pinned once per enemy and gaining Lightsaber at turn end' : ''}.`);
    return;
  }
  if (perk.id === 'mind-tricks') {
    const enemyId: PlayerId = player.id === 'P1' ? 'P2' : 'P1';
    state.mindTricks = { casterId: player.id, level, maxDiscards: level >= 2 ? 2 : 1, discarded: 0, revealedInstanceIds: [], enemyId, enemyDiscardsRemaining: 0, undo: null };
    state.phase = 'choosing-mind-tricks-discard';
    state.log.unshift(`Mind Tricks level ${level}: ${player.name} may reveal up to ${level >= 2 ? 2 : 1} card${level >= 2 ? 's' : ''}, or resolve it without revealing.`);
  }
}

const NEGATIVE_STATUS_CARD_IDS = new Set<CardTypeId>(['pinned', 'headache', 'exhaust', 'burning', 'panic']);
function isNegativeStatusCard(card: CardInstance): boolean {
  return NEGATIVE_STATUS_CARD_IDS.has(card.cardId);
}

function completeInnerPeace(state: GameState, player: PlayerState, level: number) {
  if (level >= 2) {
    const piles: Array<{ name: 'Hand' | 'Deck' | 'Discard'; cards: CardInstance[] }> = [
      { name: 'Hand', cards: player.hand },
      { name: 'Deck', cards: player.deck },
      { name: 'Discard', cards: player.discard },
    ];
    const preferredPile = piles.find((pile) => pile.cards.some(isNegativeStatusCard));
    const candidates = preferredPile?.cards.filter(isNegativeStatusCard) ?? [];
    if (preferredPile && candidates.length > 0) {
      const removed = candidates[Math.floor(Math.random() * candidates.length)];
      removeCard(player, removed.instanceId);
      state.log.unshift(`Inner Peace level 2 randomly Removed ${cardDefinition(removed).name} from ${player.name}'s ${preferredPile.name}.`);
    } else state.log.unshift(`Inner Peace level 2 found no additional negative Status Card to Remove.`);
  }
  if (level >= 3) {
    addBlessingCardToJohn(state, player, 'blessing-faith');
    state.log.unshift(`Inner Peace level 3 created Blessing: Faith for ${player.name}.`);
  }
  (state as GameState & { innerPeace?: { playerId: PlayerId; level: number } | null }).innerPeace = null;
  state.phase = 'active';
}

function resolveInnerPeaceStatusChoice(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const innerPeace = (state as GameState & { innerPeace?: { playerId: PlayerId; level: number } | null }).innerPeace;
  if (state.phase !== 'choosing-blessed-prayer-discard' || !innerPeace || innerPeace.playerId !== playerId) return fail(state, 'Inner Peace is not waiting for this Player.');
  const player = state.players[playerId];
  const selected = player.hand.find((card) => card.instanceId === cardInstanceId && isNegativeStatusCard(card));
  if (!selected) return fail(state, 'Inner Peace requires a negative Status Card from Hand.');
  const name = cardDefinition(selected).name;
  removeCard(player, selected.instanceId);
  state.log.unshift(`Inner Peace level 1 Removed ${name} from ${player.name}'s Hand.`);
  completeInnerPeace(state, player, innerPeace.level);
  return ok(state);
}

function resolveBlessedPrayerDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  if (state.phase !== 'choosing-blessed-prayer-discard' || state.activePlayerId !== playerId) return fail(state, 'Blessed Prayer is not waiting for this Player.');
  const player = state.players[playerId];
  const index = player.discard.findIndex((card) => card.instanceId === cardInstanceId);
  if (index < 0) return fail(state, 'Choose a Card from your Discard.');
  const [drawn] = player.discard.splice(index, 1);
  drawn.revealedToOpponent = false;
  player.hand.push(drawn);
  state.phase = 'active';
  state.log.unshift(`${player.name} drew ${cardDefinition(drawn).name} from Discard with Blessed Prayer.`);
  return ok(state);
}

function resolveLordaeronPlacement(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const lordState = state as LordaeronGameState;
  const placement = lordState.lordaeronPlacement;
  if (state.phase !== 'choosing-base-placement' || !placement) return fail(state, 'Character placement is not active.');
  if (placement.order[placement.currentIndex] !== playerId) return fail(state, 'Another Player must place their Character first.');
  const label = cellLabel(to);
  const selectedBase = placement.availableBaseIds.find((baseId) => LORDAERON_ARENA.bases[baseId].includes(label));
  if (!selectedBase) return fail(state, 'Choose a Square on one of the highlighted unclaimed bases.');
  state.players[playerId].position = { ...to };
  placement.claims[playerId] = selectedBase;
  placement.availableBaseIds = placement.availableBaseIds.filter((baseId) => baseId !== selectedBase);
  state.log.unshift(`${state.players[playerId].name} claimed the ${selectedBase} base and deployed at ${label}.`);
  placement.currentIndex += 1;
  if (placement.currentIndex < placement.order.length) {
    state.activePlayerId = placement.order[placement.currentIndex];
    state.log.unshift(`${state.players[state.activePlayerId].name} chooses from ${placement.availableBaseIds.length} remaining base${placement.availableBaseIds.length === 1 ? '' : 's'}.`);
  } else {
    state.activePlayerId = placement.order[0];
    state.phase = 'active';
    announceActionQuest(state, 1);
    state.log.unshift(`Deployment complete. ${state.players[state.activePlayerId].name} begins the battle.`);
  }
  return ok(state);
}

function resolveViciousMockeryDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.viciousMockery;
  if (state.phase !== 'choosing-vicious-mockery' || !choice || !choice.eligible.includes(playerId) || choice.decided.includes(playerId)) return fail(state, 'This Player has no pending Vicious Mockery decision.');
  if (use) {
    const player = state.players[playerId]; const index = player.hand.findIndex((card) => card.cardId === 'vicious-mockery');
    if (index < 0) return fail(state, 'Vicious Mockery is not in this Player’s Hand.');
    player.hand.splice(index, 1); choice.applied.push(playerId);
    if (state.pendingAttack?.attackerId === playerId) {
      state.pendingAttack.attackValue += 2;
      state.combatReveal!.attackTotal += 2;
    } else state.combatReveal!.defendTotal += 2;
    state.log.unshift(`${player.name} applied Vicious Mockery for +2 ${state.pendingAttack?.attackerId === playerId ? 'ATT' : 'DEF'} and Removed it from the game.`);
  }
  choice.decided.push(playerId);
  if (choice.decided.length < choice.eligible.length) return ok(state);
  const defenseCommand = choice.defenseCommand; const defenderMockery = choice.applied.includes(defenseCommand.playerId);
  state.combatReveal = null; state.phase = 'defending';
  return resolveDefense(state, defenseCommand, false, false, true, defenderMockery);
}

function resolveExhaustDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const exhaust = state.combatReveal?.exhaust;
  if (state.phase !== 'choosing-exhaust' || !exhaust || !exhaust.eligible.includes(playerId) || exhaust.decided.includes(playerId)) return fail(state, 'This player has no pending Exhaust decision.');
  if (use) {
    const player = state.players[playerId];
    const index = player.hand.findIndex((card) => card.cardId === 'exhaust');
    if (index < 0) return fail(state, 'There is no Exhaust Card available to attach.');
    player.hand.splice(index, 1);
    exhaust.attached.push(playerId);
    if (state.pendingAttack?.attackerId === playerId) {
      state.pendingAttack.attackValue -= 2;
      if (state.combatReveal) state.combatReveal.attackTotal -= 2;
    }
    state.log.unshift(`${player.name} attached and Removed Exhaust for a -3 card Value modifier.`);
  }
  exhaust.decided.push(playerId);
  if (exhaust.decided.length < exhaust.eligible.length) return ok(state);
  const defenseCommand = exhaust.defenseCommand;
  const defenderAttached = exhaust.attached.includes(defenseCommand.playerId);
  state.combatReveal = null; state.phase = 'defending';
  return resolveDefense(state, defenseCommand, true, defenderAttached, true, exhaust.defenderMockery);
}

function resolveBlessingLightDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.blessingLight;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-blessing-light' || !choice || !pending || choice.playerId !== playerId) return fail(state, 'This Player has no pending Blessing: Light decision.');
  if (use) {
    const player = state.players[playerId];
    const blessing = player.hand.find((card) => card.cardId === 'blessing-light');
    if (!blessing) return fail(state, 'Blessing: Light is not in this Player’s Hand.');
    removeCard(player, blessing.instanceId);
    pending.blessingLightApplied = true;
    state.log.unshift(`${player.name} applied Blessing: Light for -1 to the enemy Defend Card and Removed the Blessing.`);
  } else pending.blessingLightApplied = false;
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function resolveBlessingMightDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.blessingMight;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-blessing-might' || !choice || !pending || choice.playerId !== playerId) return fail(state, 'This Player has no pending Blessing: Might decision.');
  const player = state.players[playerId];
  if (pending.attackerWasInSpiritForm) return fail(state, 'Blessing: Might cannot be used in a combat where John participated in Spirit Form.');
  if (use) {
    const blessing = player.hand.find((card) => card.cardId === 'blessing-might');
    if (!blessing) return fail(state, 'Blessing: Might is not in this Player’s Hand.');
    removeCard(player, blessing.instanceId);
    pending.attackValue += 2;
    pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: 2, source: 'Blessing: Might' }];
    pending.blessingMightApplied = true;
    state.log.unshift(`${player.name} applied Blessing: Might for +2 ATT and Removed the Blessing.`);
  } else pending.blessingMightApplied = false;
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function resolveBlessingShieldDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.mythrilHelmet;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-mythril-helmet' || !choice || !pending || choice.playerId !== playerId || pending.blessingShieldApplied !== undefined) return fail(state, 'This Player has no pending Blessing: Shield decision.');
  const player = state.players[playerId];
  if (player.spiritForm) return fail(state, 'Blessing: Shield cannot be used while John is in Spirit Form.');
  if (use) {
    const blessing = player.hand.find((card) => card.cardId === 'blessing-shield');
    if (!blessing) return fail(state, 'Blessing: Shield is not in this Player’s Hand.');
    removeCard(player, blessing.instanceId);
    pending.blessingShieldApplied = true;
    pending.blessingShieldPlayerId = playerId;
    pending.blessingShieldPlayerIds = [playerId];
    pending.blessingShieldStatusPlayerIds = [playerId];
    state.log.unshift(`${player.name} applied Blessing: Shield to absorb 1 Damage from Attack Card effects and Removed the Blessing.`);
  } else pending.blessingShieldApplied = false;
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function resolveBlessingFaithDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.blessingFaith;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-blessing-faith' || !choice || !pending || choice.playerId !== playerId) return fail(state, 'This Player has no pending Blessing: Faith decision.');
  const player = state.players[playerId];
  if (player.spiritForm) return fail(state, 'Blessing: Faith cannot be used while John is in Spirit Form.');
  pending.blessingFaithDecidedPlayerIds = [...(pending.blessingFaithDecidedPlayerIds ?? []), playerId];
  if (use) {
    const blessing = player.hand.find((card) => card.cardId === 'blessing-faith');
    if (!blessing) return fail(state, 'Blessing: Faith is not in this Player’s Hand.');
    removeCard(player, blessing.instanceId);
    pending.blessingFaithApplied = true;
    state.log.unshift(`${player.name} applied Blessing: Faith to negate all Damage dealt to both combatants and Removed the Blessing.`);
  }
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function resolveFeedSpiritDecision(state: GameState, playerId: PlayerId, cardInstanceId: string | null): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'mana-blast-offer' || !pending?.feedSpiritOffered || pending.defenderId !== playerId) return fail(state, 'Feed the Spirit has no pending Blessing decision for this Player.');
  const john = state.players[playerId];
  if (cardInstanceId) {
    const blessing = john.hand.find((card) => card.instanceId === cardInstanceId && cardDefinition(card).name.startsWith('Blessing:'));
    if (!blessing) return fail(state, 'Choose an available Blessing Card to Remove.');
    removeCard(john, blessing.instanceId);
    const healed = healPlayer(state, john, 1);
    state.log.unshift(`Feed the Spirit Removed ${cardDefinition(blessing).name} and restored ${healed} additional Hit Point to ${john.name}.`);
  } else state.log.unshift(`${john.name} declined to Remove a Blessing Card for Feed the Spirit.`);
  state.pendingAttack = null;
  state.phase = 'active';
  return ok(state);
}

function resolveMythrilHelmetDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.mythrilHelmet;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-mythril-helmet' || !choice || !pending || choice.playerId !== playerId) return fail(state, 'This Player has no pending Mythril Helmet decision.');
  if (use) {
    const player = state.players[playerId];
    const helmet = player.hand.find((card) => card.cardId === 'mythril-helmet');
    if (!helmet) return fail(state, 'Mythril Helmet is not in this Player’s Hand.');
    removeCard(player, helmet.instanceId);
    pending.mythrilHelmetApplied = true;
    state.log.unshift(`${player.name} applied Mythril Helmet to negate all Damage in this combat, then Removed it from the Deck.`);
  } else pending.mythrilHelmetApplied = false;
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function resolveManaBarrageDecision(state: GameState, playerId: PlayerId, use: boolean): CommandResult {
  const choice = state.combatReveal?.manaBarrage;
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-mana-barrage' || !choice || !pending || choice.playerId !== playerId || pending.cardId !== 'mana-barrage') return fail(state, 'This Player has no pending Mana Barrage decision.');
  const logan = state.players[playerId];
  if (use) {
    if (logan.manaPoints < 1) return fail(state, 'Logan has no Mana Point available to apply.');
    logan.manaPoints -= 1;
    pending.manaBarrageManaApplied = true;
    state.log.unshift(`${logan.name} applied 1 Mana Point to Mana Barrage for 1 Damage during combat (${logan.manaPoints} Mana remaining).`);
  } else {
    pending.manaBarrageManaApplied = false;
    state.log.unshift(`${logan.name} kept the stored Mana and did not empower Mana Barrage.`);
  }
  const defenseCommand = choice.defenseCommand;
  state.combatReveal = null;
  state.phase = 'defending';
  return resolveDefense(state, defenseCommand);
}

function blessedMightCancelsDefenseCard(pending: PendingAttack, defenseCardId: CardTypeId | null): boolean {
  return pending.cardId === 'blessed-might' && Boolean(defenseCardId) && !['block', 'da-blokk', 'spellblock'].includes(defenseCardId!);
}

const COMBAT_CARD_IDS = new Set<CardTypeId>(['exhaust', 'vicious-mockery', 'banner', 'mythril-helmet', 'blessing-light', 'blessing-might', 'blessing-shield', 'blessing-faith']);

function combatCardApplicable(state: GameState, player: PlayerState, card: CardInstance, defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>): boolean {
  const pending = state.pendingAttack;
  if (!pending || !COMBAT_CARD_IDS.has(card.cardId)) return false;
  const attacker = player.id === pending.attackerId;
  // Taking the Hit gives the Defender no played Card to modify or protect with
  // a Combat Card. The Attacker may still use any otherwise-applicable option.
  if (!attacker && defenseCommand.type === 'pass-defense') return false;
  if (card.cardId === 'exhaust') {
    const currentValue = attacker ? state.combatReveal?.attackTotal ?? pending.attackValue : state.combatReveal?.defendTotal ?? 0;
    if (currentValue <= 0) return false;
  }
  if (card.cardId === 'blessing-light') return attacker && defenseCommand.type === 'defend' && !pending.attackerWasInSpiritForm;
  if (card.cardId === 'blessing-might') return attacker && !pending.attackerWasInSpiritForm;
  if (card.cardId.startsWith('blessing-') && (player.spiritForm || (attacker && pending.attackerWasInSpiritForm))) return false;
  if (card.cardId === 'blessing-shield' && player.id === pending.defenderId && pending.blessedBlockResolved && !pending.blessingShieldHeldBeforeBlessedBlock) return false;
  return true;
}

export function applicableCombatCardInstanceIds(state: GameState, playerId: PlayerId): string[] {
  const pending = state.pendingAttack;
  const defenseCommand = pending?.combatStackDefenseCommand;
  if (!pending || !defenseCommand || ![pending.attackerId, pending.defenderId].includes(playerId)) return [];
  const player = state.players[playerId];
  return player.hand.filter((card) => combatCardApplicable(state, player, card, defenseCommand)).map((card) => card.instanceId);
}

function beginMultiplayerCombatStack(state: GameState, command: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>): CommandResult {
  const pending = state.pendingAttack!;
  const defender = state.players[pending.defenderId];
  const defendCard = command.type === 'defend' ? defender.hand.find((card) => card.instanceId === command.cardInstanceId) : null;
  pending.combatStackDefenseCommand = command;
  pending.combatStackPreCombatResolved = true;
  const attacker = state.players[pending.attackerId];
  if (pending.cardId === 'fistbolt' && attacker.character === 'orkk' && attacker.rageStacks === 0) {
    attacker.rageStacks = 1;
    pending.attackValue += 1;
    pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: 1, source: 'Fistbolt pre-combat Rage' }];
    state.log.unshift(`${attacker.name} generated 1 Rage from Fistbolt after the Defender's pre-combat effect resolved.`);
  }
  const defendDefinition = defendCard ? cardDefinition(defendCard) : null;
  const revealedDefendTotal = defendDefinition
    ? (defendDefinition.id === 'mana-baryer' && defender.shieldEquipped ? 5 : defendDefinition.value
      + (defendDefinition.id === 'mana-shield' ? defender.manaPoints : 0)
      + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0)
      + (defender.character === 'orkk' && defender.shieldEquipped ? 1 : 0))
      + ownedDefenseBonus(defender, state)
      + spiritGuardianDefenseBonus(state, defender)
      - spiritGuardianEnemyPenalty(state, defender)
      + (defendDefinition.id === 'double-jump' ? pinnedCount(attacker) : 0)
      + mythrilHelmetDefenseBonus(defender)
      - defender.hand.filter((card) => card.cardId === 'exhaust').length
    : 0;
  state.combatReveal = {
    attackCardId: pending.cardId,
    defendCardId: defendCard?.cardId ?? null,
    attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value,
    attackTotal: pending.attackValue,
    defendBase: defendDefinition?.value ?? 0,
    defendTotal: Math.max(0, revealedDefendTotal),
    expiresAt: Date.now() + 86_400_000,
    acknowledged: [],
  };
  state.phase = 'choosing-combat-stack';
  const combatants = [pending.attackerId, pending.defenderId];
  const stackState = state as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> };
  stackState.combatStackSelections = Object.fromEntries(combatants.filter((id) => applicableCombatCardInstanceIds(state, id).length === 0).map((id) => [id, []]));
  state.log.unshift('Attack and Defend Cards were revealed. Both Players now choose Combat Cards privately.');
  if (combatants.every((id) => stackState.combatStackSelections?.[id])) return resolveMultiplayerCombatStack(state, stackState.combatStackSelections);
  return ok(state);
}

export function resolveMultiplayerCombatStack(state: GameState, selections: Partial<Record<PlayerId, string[]>>): CommandResult {
  const pending = state.pendingAttack;
  const defenseCommand = pending?.combatStackDefenseCommand;
  if (state.phase !== 'choosing-combat-stack' || !pending || !defenseCommand) return fail(state, 'No multiplayer Combat Stack is awaiting selections.');
  delete (state as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> }).combatStackSelections;
  const applied: Partial<Record<PlayerId, CardTypeId[]>> = {};
  let defenderAttachedExhaust = false;
  let defenderMockery = false;
  for (const playerId of [pending.attackerId, pending.defenderId]) {
    const player = state.players[playerId];
    const selectedIds = [...new Set(selections[playerId] ?? [])];
    if (selectedIds.length > 1) return fail(state, `${player.name} may apply only one Combat Card per combat.`);
    const selectedCards = selectedIds.map((instanceId) => player.hand.find((card) => card.instanceId === instanceId));
    if (selectedCards.some((card) => !card || !combatCardApplicable(state, player, card, defenseCommand))) return fail(state, `${player.name} selected an unavailable Combat Card.`);
    applied[playerId] = selectedCards.map((card) => card!.cardId);
    for (const card of selectedCards as CardInstance[]) {
      removeCard(player, card.instanceId);
      if (card.cardId === 'vicious-mockery') {
        if (playerId === pending.attackerId) { pending.attackValue += 2; pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: 2, source: 'Vicious Mockery' }]; }
        else defenderMockery = true;
      } else if (card.cardId === 'banner') {
        if (playerId === pending.attackerId) { pending.attackValue += 1; pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: 1, source: 'The Banner' }]; }
        else pending.combatStackDefenderBanner = true;
      } else if (card.cardId === 'exhaust') {
        if (playerId === pending.attackerId) { pending.attackValue -= 2; pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: -2, source: 'attached Exhaust (replaces held -1)' }]; }
        else defenderAttachedExhaust = true;
      } else if (card.cardId === 'blessing-might') {
        pending.attackValue += 2; pending.attackModifiers = [...(pending.attackModifiers ?? []), { value: 2, source: 'Blessing: Might' }]; pending.blessingMightApplied = true;
      } else if (card.cardId === 'blessing-light') pending.blessingLightApplied = true;
      else if (card.cardId === 'blessing-shield') {
        pending.blessingShieldApplied = true;
        pending.blessingShieldPlayerId ??= playerId;
        pending.blessingShieldPlayerIds = [...new Set([...(pending.blessingShieldPlayerIds ?? []), playerId])];
        pending.blessingShieldStatusPlayerIds = [...new Set([...(pending.blessingShieldStatusPlayerIds ?? []), playerId])];
      }
      else if (card.cardId === 'blessing-faith') pending.blessingFaithApplied = true;
      else if (card.cardId === 'mythril-helmet') pending.mythrilHelmetApplied = true;
    }
  }
  pending.blessingMightApplied ??= false;
  pending.blessingLightApplied ??= false;
  pending.blessingShieldApplied ??= false;
  pending.blessingFaithApplied ??= false;
  pending.mythrilHelmetApplied ??= false;
  pending.blessingFaithDecidedPlayerIds = [pending.attackerId, pending.defenderId];
  pending.combatStackResolved = true;
  pending.combatStackDefenderAttachedExhaust = defenderAttachedExhaust;
  pending.combatStackDefenderMockery = defenderMockery;
  pending.combatStackApplied = applied;
  state.combatReveal = null;
  state.phase = 'defending';
  state.log.unshift(`Combat Cards revealed together: ${[pending.attackerId, pending.defenderId].map((id) => `${state.players[id].name}: ${(applied[id] ?? []).map((cardId) => cardDefinition({ instanceId: '', cardId }).name).join(', ') || 'none'}`).join(' · ')}.`);
  return resolveDefense(state, defenseCommand, true, defenderAttachedExhaust, true, defenderMockery);
}

function submitLocalCombatStackChoice(state: GameState, playerId: PlayerId, cardInstanceId: string | null): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-combat-stack' || !pending?.combatStackDefenseCommand) return fail(state, 'No Combat Stack selection is available.');
  const combatants = [pending.attackerId, pending.defenderId];
  if (!combatants.includes(playerId)) return fail(state, 'Only Players in this combat may choose a Combat Card.');
  const localState = state as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> };
  localState.combatStackSelections ??= {};
  if (localState.combatStackSelections[playerId]) return fail(state, 'This Player already locked their Combat Card choice.');
  if (cardInstanceId) {
    const card = state.players[playerId].hand.find((entry) => entry.instanceId === cardInstanceId);
    if (!card || !combatCardApplicable(state, state.players[playerId], card, pending.combatStackDefenseCommand)) return fail(state, 'That Combat Card is not applicable.');
  }
  localState.combatStackSelections[playerId] = cardInstanceId ? [cardInstanceId] : [];
  if (combatants.every((id) => localState.combatStackSelections?.[id])) {
    const selections = localState.combatStackSelections;
    delete localState.combatStackSelections;
    return resolveMultiplayerCombatStack(state, selections);
  }
  state.log.unshift(`${state.players[playerId].name} locked a private Combat Card choice.`);
  return ok(state);
}

function resolveDefense(state: GameState, command: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>, exhaustResolved = false, defenderAttachedExhaust = false, mockeryResolved = false, defenderMockery = false): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'defending' || !pending) return fail(state, 'There is no attack to defend.');
  if (pending.defenderId !== command.playerId) return fail(state, 'Only the targeted player may respond.');
  const defender = state.players[command.playerId];
  const defenderSpiritFormAtCombatStart = defender.spiritForm;
  const shieldEquippedAtDefenseStart = defender.shieldEquipped;
  if (command.type === 'defend') {
    const selectedDefense = defender.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!selectedDefense || cardDefinition(selectedDefense).kind !== 'defend') return fail(state, 'That Defend card is not in the hand.');
    if (spiritFormBlocksCard(defender, cardDefinition(selectedDefense))) return fail(state, 'John Christ cannot use Cards containing “Bless” while in Spirit Form.');
    if (selectedDefense.cardId === 'mana-shield' && !pending.manaShieldManaGenerated && !blessedMightCancelsDefenseCard(pending, selectedDefense.cardId)) {
      const generated = grantMana(defender, 1);
      pending.manaShieldManaGenerated = true;
      state.log.unshift(`Mana Shield generated ${generated} Mana before combat (${defender.manaPoints}/3).`);
    }
    if (selectedDefense.cardId === 'blessed-block' && !pending.blessedBlockResolved) {
      pending.blessingShieldHeldBeforeBlessedBlock = defender.hand.some((card) => card.cardId === 'blessing-shield');
      queueBlessingCard(defender, 'blessing-shield');
      pending.blessedBlockResolved = true;
      state.log.unshift(`Blessed Block queued Blessing: Shield for the beginning of ${defender.name}'s next eligible turn.`);
    }
    if (selectedDefense.cardId === 'blessed-swiftness' && !pending.blessedSwiftnessResolved) {
      const attacker = state.players[pending.attackerId];
      const annulledMovement = attacker.movementRemaining;
      attacker.movementRemaining = 0;
      attacker.movementAnnulledByBlessedSwiftness = true;
      queueBlessingCard(defender, 'blessing-swiftness');
      pending.blessedSwiftnessResolved = true;
      state.log.unshift(`Blessed Swiftness annulled ${annulledMovement} unspent MOV from ${attacker.name} and queued Blessing: Swiftness for the beginning of ${defender.name}'s next eligible turn.`);
    }
  }
  if ((state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack && !pending.combatStackResolved) {
    return beginMultiplayerCombatStack(state, command);
  }
  if (pending.blessingMightApplied === undefined) {
    const attacker = state.players[pending.attackerId];
    const blessing = attacker.hand.some((card) => card.cardId === 'blessing-might');
    if (blessing && !pending.attackerWasInSpiritForm) {
      let defendCardId: CardTypeId | null = null;
      let defendBase = 0;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
        defendCardId = instance.cardId; defendBase = cardDefinition(instance).value;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase, defendTotal: defendBase, expiresAt: Date.now() + 86_400_000, acknowledged: [], blessingMight: { defenseCommand: command, playerId: attacker.id } };
      state.phase = 'choosing-blessing-might';
      state.log.unshift(`${attacker.name} may apply Blessing: Might for +2 ATT.`);
      return ok(state);
    }
    pending.blessingMightApplied = false;
  }
  if (pending.blessingShieldApplied === undefined) {
    const shieldPlayer = [state.players[pending.attackerId], defender].find((player) => player.hand.some((card) => card.cardId === 'blessing-shield') && !player.spiritForm && (player.id !== defender.id || !pending.blessedBlockResolved || pending.blessingShieldHeldBeforeBlessedBlock));
    if (shieldPlayer) {
      let defendCardId: CardTypeId | null = null;
      let defendBase = 0;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
        defendCardId = instance.cardId;
        defendBase = cardDefinition(instance).value;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase, defendTotal: defendBase, expiresAt: Date.now() + 86_400_000, acknowledged: [], mythrilHelmet: { defenseCommand: command, playerId: shieldPlayer.id } };
      state.phase = 'choosing-mythril-helmet';
      state.log.unshift(`${shieldPlayer.name} may apply Blessing: Shield to absorb 1 Damage from an enemy Attack or Defend Card effect.`);
      return ok(state);
    }
    pending.blessingShieldApplied = false;
  }
  if (!pending.blessingFaithApplied) {
    const decided = pending.blessingFaithDecidedPlayerIds ?? [];
    const faithPlayer = [state.players[pending.attackerId], defender].find((candidate) => !decided.includes(candidate.id) && !candidate.spiritForm && (candidate.id !== pending.attackerId || !pending.attackerWasInSpiritForm) && candidate.hand.some((card) => card.cardId === 'blessing-faith'));
    if (faithPlayer) {
      let defendCardId: CardTypeId | null = null;
      let defendBase = 0;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
        defendCardId = instance.cardId;
        defendBase = cardDefinition(instance).value;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase, defendTotal: defendBase, expiresAt: Date.now() + 86_400_000, acknowledged: [], blessingFaith: { defenseCommand: command, playerId: faithPlayer.id } };
      state.phase = 'choosing-blessing-faith';
      state.log.unshift(`${faithPlayer.name} may apply Blessing: Faith to negate all Damage dealt to both sides in this combat.`);
      return ok(state);
    }
  }
  if (pending.mythrilHelmetApplied === undefined) {
    const helmet = defender.hand.some((card) => card.cardId === 'mythril-helmet');
    if (helmet) {
      let defendCardId: CardTypeId | null = null;
      let defendBase = 0;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
        defendCardId = instance.cardId;
        defendBase = cardDefinition(instance).value;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase, defendTotal: defendBase, expiresAt: Date.now() + 86_400_000, acknowledged: [], mythrilHelmet: { defenseCommand: command, playerId: defender.id } };
      state.phase = 'choosing-mythril-helmet';
      state.log.unshift(`${defender.name} may apply Mythril Helmet to negate all Damage in this combat.`);
      return ok(state);
    }
    pending.mythrilHelmetApplied = false;
  }
  const attackerForManaBarrage = state.players[pending.attackerId];
  if (pending.cardId === 'mana-barrage' && attackerForManaBarrage.manaMode !== 'consume' && pending.manaBarrageManaApplied === undefined) {
    if (attackerForManaBarrage.manaPoints > 0) {
      let defendCardId: CardTypeId | null = null;
      let defendBase = 0;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
        defendCardId = instance.cardId;
        defendBase = cardDefinition(instance).value;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase, defendTotal: defendBase, expiresAt: Date.now() + 86_400_000, acknowledged: [], manaBarrage: { defenseCommand: command, playerId: pending.attackerId } };
      state.phase = 'choosing-mana-barrage';
      state.log.unshift(`${attackerForManaBarrage.name} may spend 1 Mana Point to make Mana Barrage deal 1 Damage during combat.`);
      return ok(state);
    }
    pending.manaBarrageManaApplied = false;
  }
  if (command.type === 'defend' && pending.blessingLightApplied === undefined) {
    const attacker = state.players[pending.attackerId];
    const blessing = attacker.hand.some((card) => card.cardId === 'blessing-light');
    if (blessing) {
      const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!;
      const definition = cardDefinition(instance);
      const previewDefenseTotal = (definition.id === 'mana-baryer' && defender.shieldEquipped ? 5 : definition.value + (definition.id === 'mana-shield' ? defender.manaPoints : 0) + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0) + (defender.character === 'orkk' && defender.shieldEquipped ? 1 : 0)) + ownedDefenseBonus(defender, state) + spiritGuardianDefenseBonus(state, defender) - spiritGuardianEnemyPenalty(state, defender) + (definition.id === 'double-jump' ? pinnedCount(attacker) : 0) + mythrilHelmetDefenseBonus(defender) - defender.hand.filter((card) => card.cardId === 'exhaust').length;
      state.combatReveal = { attackCardId: pending.cardId, defendCardId: instance.cardId, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase: definition.value, defendTotal: Math.max(0, previewDefenseTotal), expiresAt: Date.now() + 86_400_000, acknowledged: [], blessingLight: { defenseCommand: command, playerId: attacker.id } };
      state.phase = 'choosing-blessing-light';
      state.log.unshift(`${attacker.name} may apply Blessing: Light to reduce the enemy Defend Card by 1.`);
      return ok(state);
    }
    pending.blessingLightApplied = false;
  }
  if (!mockeryResolved) {
    const attacker = state.players[pending.attackerId]; const eligible: PlayerId[] = [];
    if (attacker.hand.some((card) => card.cardId === 'vicious-mockery')) eligible.push(attacker.id);
    if (command.type === 'defend' && defender.hand.some((card) => card.cardId === 'vicious-mockery')) eligible.push(defender.id);
    if (eligible.length > 0) {
      let previewDefenseBase = 0; let previewDefenseTotal = 0; let previewDefenseCard: CardTypeId | null = null;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId)!; const definition = cardDefinition(instance);
        previewDefenseCard = instance.cardId; previewDefenseBase = definition.value;
        previewDefenseTotal = (definition.id === 'mana-baryer' && defender.shieldEquipped ? 5 : definition.value + (definition.id === 'mana-shield' ? defender.manaPoints : 0) + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0) + (defender.character === 'orkk' && defender.shieldEquipped ? 1 : 0)) + ownedDefenseBonus(defender, state) + spiritGuardianDefenseBonus(state, defender) - spiritGuardianEnemyPenalty(state, defender) + (definition.id === 'double-jump' ? pinnedCount(attacker) : 0) + mythrilHelmetDefenseBonus(defender) - defender.hand.filter((card) => card.cardId === 'exhaust').length;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId: previewDefenseCard, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase: previewDefenseBase, defendTotal: Math.max(0, previewDefenseTotal), expiresAt: Date.now() + 86_400_000, acknowledged: [], viciousMockery: { defenseCommand: command, eligible, decided: [], applied: [] } };
      state.phase = 'choosing-vicious-mockery';
      state.log.unshift(`Vicious Mockery decision: ${eligible.map((id) => state.players[id].name).join(' and ')} may Remove it for +2 to their combat Card.`);
      return ok(state);
    }
  }
  if (!exhaustResolved) {
    const attacker = state.players[pending.attackerId];
    const eligible: PlayerId[] = [];
    if (pending.attackValue > 0 && attacker.hand.some((card) => card.cardId === 'exhaust')) eligible.push(attacker.id);
    let previewDefenseBase = 0; let previewDefenseTotal = 0; let previewDefenseCard: CardTypeId | null = null;
    if (command.type === 'defend') {
      const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId);
      if (!instance || cardDefinition(instance).kind !== 'defend') return fail(state, 'That Defend card is not in the hand.');
      const definition = cardDefinition(instance); previewDefenseCard = instance.cardId; previewDefenseBase = definition.value;
      previewDefenseTotal = (definition.id === 'mana-baryer' && defender.shieldEquipped ? 5 : definition.value + (definition.id === 'mana-shield' ? defender.manaPoints : 0) + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0) + (defender.character === 'orkk' && defender.shieldEquipped ? 1 : 0)) + ownedDefenseBonus(defender, state) + spiritGuardianDefenseBonus(state, defender) - spiritGuardianEnemyPenalty(state, defender)
        + (definition.id === 'double-jump' ? pinnedCount(attacker) : 0) + (defender.hand.some((card) => card.cardId === 'banner') ? 1 : 0) + mythrilHelmetDefenseBonus(defender) - defender.hand.filter((card) => card.cardId === 'exhaust').length;
      if (previewDefenseTotal + (defenderMockery ? 2 : 0) > 0 && defender.hand.some((card) => card.cardId === 'exhaust')) eligible.push(defender.id);
    }
    if (eligible.length > 0) {
      state.combatReveal = { attackCardId: pending.cardId, defendCardId: previewDefenseCard, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase: previewDefenseBase, defendTotal: Math.max(0, previewDefenseTotal + (defenderMockery ? 2 : 0)), expiresAt: Date.now() + 86_400_000, acknowledged: [], exhaust: { defenseCommand: command, eligible, decided: [], attached: [], defenderMockery } };
      state.phase = 'choosing-exhaust';
      state.log.unshift(`Exhaust decision: ${eligible.map((id) => state.players[id].name).join(' and ')} may attach one Exhaust for -3 Value.`);
      return ok(state);
    }
  }
  let defenseValue = 0;
  let defenseBaseValue = 0;
  let defenseCardId: CardTypeId | null = null;
  let defendModifiers: CombatModifier[] = [];
  if (command.type === 'defend') {
    const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance || cardDefinition(instance).kind !== 'defend') return fail(state, 'That Defend card is not in the hand.');
    defenseCardId = instance.cardId;
    const defenseCard = cardDefinition(instance);
    const defenseEffectsCancelled = blessedMightCancelsDefenseCard(pending, defenseCardId);
    defenseBaseValue = defenseCard.value;
    const doubleJumpBonus = defenseCard.id === 'double-jump' && !defenseEffectsCancelled ? pinnedCount(state.players[pending.attackerId]) : 0;
    const simultaneousCombatStack = Boolean((state as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack);
    const defenderBanner = simultaneousCombatStack
      ? (pending.combatStackDefenderBanner ? { instanceId: 'combat-stack-banner', cardId: 'banner' as const } : undefined)
      : defender.hand.find((card) => card.cardId === 'banner');
    const bannerDefenseBonus = defenderBanner ? 1 : 0;
    const manaShieldBonus = defenseCard.id === 'mana-shield' && !defenseEffectsCancelled ? defender.manaPoints : 0;
    const lightsaberDefenseBonus = defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0;
    const equippedShieldBonus = defender.character === 'orkk' && shieldEquippedAtDefenseStart && defenseCard.id !== 'mana-baryer' ? 1 : 0;
    const manaBaryerTransformation = defenseCard.id === 'mana-baryer' && shieldEquippedAtDefenseStart && !defenseEffectsCancelled ? 5 - defenseCard.value : 0;
    const baseDefenseBonus = ownedDefenseBonus(defender, state);
    const guardianDefenseBonus = spiritGuardianDefenseBonus(state, defender);
    const guardianEnemyPenalty = spiritGuardianEnemyPenalty(state, defender);
    const heldExhaustPenalty = defender.hand.filter((card) => card.cardId === 'exhaust').length;
    defenseValue = Math.max(0, defenseCard.value + manaBaryerTransformation + manaShieldBonus + lightsaberDefenseBonus + equippedShieldBonus + baseDefenseBonus + guardianDefenseBonus + doubleJumpBonus + bannerDefenseBonus + mythrilHelmetDefenseBonus(defender) + (defenderMockery ? 2 : 0) - guardianEnemyPenalty - heldExhaustPenalty - (defenderAttachedExhaust ? 3 : 0) - (pending.blessingLightApplied ? 1 : 0));
    defendModifiers = [
      manaBaryerTransformation && { value: manaBaryerTransformation, source: 'Mana Baryer with equipped Shield' },
      manaShieldBonus && { value: manaShieldBonus, source: `${manaShieldBonus} stored Mana Point${manaShieldBonus === 1 ? '' : 's'}` },
      lightsaberDefenseBonus && { value: lightsaberDefenseBonus, source: 'Lightsaber status' },
      equippedShieldBonus && { value: equippedShieldBonus, source: 'equipped Shield' },
      baseDefenseBonus && { value: baseDefenseBonus, source: 'own Base' },
      guardianDefenseBonus && { value: guardianDefenseBonus, source: 'adjacent owned Spirit Guardian' },
      guardianEnemyPenalty && { value: -guardianEnemyPenalty, source: 'adjacent enemy Spirit Guardian' },
      doubleJumpBonus && { value: doubleJumpBonus, source: `${doubleJumpBonus} attacker Pinned Stack${doubleJumpBonus === 1 ? '' : 's'}` },
      bannerDefenseBonus && { value: bannerDefenseBonus, source: 'The Banner' },
      defenderMockery && { value: 2, source: 'Vicious Mockery' },
      heldExhaustPenalty && { value: -heldExhaustPenalty, source: `${heldExhaustPenalty} Exhaust Card${heldExhaustPenalty === 1 ? '' : 's'} in Hand` },
      defenderAttachedExhaust && { value: -3, source: 'attached Exhaust' },
      pending.blessingLightApplied && { value: -1, source: 'Blessing: Light' },
    ].filter((modifier): modifier is CombatModifier => Boolean(modifier));
    if (defenderBanner && !simultaneousCombatStack) { removeCard(defender, defenderBanner.instanceId); state.log.unshift(`${defender.name} applied The Banner for +1 DEF and Removed it.`); }
    discardFromHand(defender, instance.instanceId);
    if (defenseCardId === 'flurry-defensive-strikes' && !defenseEffectsCancelled) {
      const attacker = state.players[pending.attackerId];
      if (distance(defender.position, attacker.position) === 1) {
        dealCombatCardEffectDamage(state, attacker, 1, defender.id, 'defense');
        state.log.unshift(`Flurry dealt 1 pre-combat damage to adjacent attacker ${attacker.name}.`);
        if (attacker.hp === 0) {
          if (pending.generatesMana) gainManaFromResolvedSpell(state, attacker);
          const rageSpent = pending.rageSpent ?? 0;
          if (attacker.character === 'orkk' && rageSpent > 0) {
            attacker.rageStacks = Math.max(0, attacker.rageStacks - rageSpent);
            state.log.unshift(`${attacker.name} consumed all ${rageSpent} Rage Stack${rageSpent === 1 ? '' : 's'} applied to the Attack (${attacker.rageStacks} remaining).`);
          }
          state.pendingAttack = null;
          state.phase = 'finished';
          state.winner = defender.id;
          state.log.unshift(`${defender.name} wins before combat begins!`);
          return ok(state);
        }
      } else state.log.unshift(`Flurry dealt no pre-combat damage because ${attacker.name} was not adjacent.`);
    }
    if (defenseCardId === 'thorns' && !defenseEffectsCancelled) {
      const attacker = state.players[pending.attackerId];
      const dealt = dealCombatCardEffectDamage(state, attacker, 1, defender.id, 'defense');
      state.log.unshift(`Thorns dealt ${dealt} Damage to ${attacker.name} before combat.`);
      if (attacker.hp === 0) {
        state.pendingAttack = null;
        state.phase = 'finished';
        state.winner = defender.id;
        state.log.unshift(`${defender.name} wins before combat begins!`);
        return ok(state);
      }
    }
  }
  const attackerBeforeCombatEffects = state.players[pending.attackerId];
  const defenseEffectsCancelled = blessedMightCancelsDefenseCard(pending, defenseCardId);
  const resurrectionDestination = defenseCardId === 'resurrection' && !defenseEffectsCancelled ? availableOwnedBaseSquare(state, defender) : null;
  pending.resurrectionNegatesDamage = Boolean(resurrectionDestination);
  const defenderPinnedBeforeDefenseEffects = pinnedCount(defender);
  const calmnessNegatesDamage = defenseCardId === 'calmness' && !defenseEffectsCancelled && pinnedCount(attackerBeforeCombatEffects) > 0;
  const blinkNegatesDamage = defenseCardId === 'blink' && !defenseEffectsCancelled;
  const defenseNegatesDamage = calmnessNegatesDamage || blinkNegatesDamage || Boolean(pending.mythrilHelmetApplied) || Boolean(pending.resurrectionNegatesDamage) || Boolean(pending.blessingFaithApplied);
  const attackCardDebuffsPrevented = calmnessNegatesDamage;
  const calculatedDamage = Math.max(0, pending.attackValue - defenseValue);
  const damage = defenseNegatesDamage ? 0 : calculatedDamage;
  if (defenseCardId === 'double' && !defenseEffectsCancelled) {
    defender.doubleRageUntilEnemyTurnEnd = true;
    state.log.unshift(`Double! will double all Rage ${defender.name} receives until the end of ${state.players[pending.attackerId].name}'s turn.`);
  }
  dealDamage(state, defender, damage, false, pending.attackerId, 'attack');
  recordCombatDamageBlocked(state, defender, pending.attackValue - damage);
  state.log.unshift(`${defender.name} ${defenseCardId ? `discarded ${cardDefinition({ instanceId: '', cardId: defenseCardId }).name} (${defenseValue})` : 'declined to defend'} and received ${damage} damage.`);
  const attackerAfterCombat = state.players[pending.attackerId];
  const rageSpent = pending.rageSpent ?? 0;
  if (attackerAfterCombat.character === 'orkk' && rageSpent > 0) {
    attackerAfterCombat.rageStacks = Math.max(0, attackerAfterCombat.rageStacks - rageSpent);
    state.log.unshift(`${attackerAfterCombat.name} consumed all ${rageSpent} Rage Stack${rageSpent === 1 ? '' : 's'} applied to the Attack (${attackerAfterCombat.rageStacks} remaining).`);
  }
  const stateBeforeAfterCombatEffects = structuredClone(state);
  if (defenseCardId === 'resurrection' && !defenseEffectsCancelled) {
    const drawn = drawCards(defender, 1);
    if (resurrectionDestination) {
      const origin = { ...defender.position };
      recordQuestMovement(state, defender.id, 1, true, resurrectionDestination);
      defender.position = { ...resurrectionDestination };
      defender.visualMovement = { from: origin, path: [{ ...resurrectionDestination }] };
      markCharacterMoved(defender, 'own-card');
      state.log.unshift(`Resurrection negated all Damage, teleported ${defender.name} to ${cellLabel(resurrectionDestination)}, and drew ${drawn} Card.`);
    } else state.log.unshift(`Resurrection could not teleport ${defender.name} because both Base Squares were occupied, so Damage was not negated; ${defender.name} still drew ${drawn} Card.`);
  }
  if (defenseCardId === 'calmness' && !defenseEffectsCancelled) {
    if (calmnessNegatesDamage) {
      removeAllBuffs(defender);
      removeAllDebuffs(defender);
      state.log.unshift(`Calmness negated ${calculatedDamage} combat damage and removed all positive and negative Status Cards and effects from ${defender.name}.`);
    }
  }
  const attackEffectsCancelled = defenseCardId === 'block' || defenseCardId === 'da-blokk' || defenseCardId === 'spellblock' || defenseCardId === 'blessed-block';
  if (attackEffectsCancelled) state.log.unshift(`${cardDefinition({ instanceId: '', cardId: defenseCardId! }).name} cancelled the Attack card's additional effects.`);
  if (defenseEffectsCancelled) state.log.unshift(`Blessed Might cancelled ${cardDefinition({ instanceId: '', cardId: defenseCardId! }).name}'s Defend Card effect; its printed Defend Value still applied.`);
  if (defenseCardId === 'spellblock') {
    const blockedDamage = Math.max(0, Math.min(pending.attackValue, defenseValue));
    const gainedMana = grantMana(defender, blockedDamage);
    state.log.unshift(`SpellBlock blocked ${blockedDamage} Damage and generated ${gainedMana} Mana for ${defender.name} (${defender.manaPoints}/3).`);
  }
  if (defenseCardId === 'mana-shield' && !defenseEffectsCancelled) {
    const blockedDamage = Math.max(0, Math.min(pending.attackValue, defenseValue));
    const spentMana = Math.min(defender.manaPoints, blockedDamage);
    defender.manaPoints -= spentMana;
    state.log.unshift(`Mana Shield blocked ${blockedDamage} Damage and removed ${spentMana} Mana after combat (${defender.manaPoints}/3 remaining).`);
  }
  if (defenseCardId === 'block') {
    const attacker = state.players[pending.attackerId];
    if (!blessingShieldBlocksCombatStatus(state, attacker, 'pinned')) {
      const pinnedStacks = applyPinned(attacker, 1);
      state.log.unshift(`Block applied 1 Pinned stack to ${attacker.name} (${pinnedStacks} total).`);
    }
  }
  if (defenseCardId === 'da-blokk' && damage > 0) {
    defender.rageStacks += 1;
    state.log.unshift(`Da Blokk generated 1 additional Rage; together with damage Rage, ${defender.name} gained 2 Rage from this combat (${defender.rageStacks} total).`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'light-the-saber') {
    if (!attackCardDebuffsPrevented) {
      if (!blessingShieldBlocksCombatStatus(state, defender, 'pinned')) {
        const pinnedStacks = applyPinned(defender, 1);
        state.log.unshift(`Light the Saber added 1 Pinned stack to ${defender.name} (${pinnedStacks} total).`);
      }
    }
  }
  if (!attackEffectsCancelled && pending.cardId === 'cut-them-legs') {
    if (!attackCardDebuffsPrevented) {
      if (!blessingShieldBlocksCombatStatus(state, defender, 'pinned')) {
        const pinnedStacks = applyPinned(defender, 1);
        state.log.unshift(`Cut Them Legs added 1 Pinned stack to ${defender.name} (${pinnedStacks} total).`);
      }
    }
    if (damage > 0) {
      const attacker = state.players[pending.attackerId];
      const discardIndex = attacker.discard.findIndex((card) => card.instanceId === pending.cardInstanceId);
      if (discardIndex >= 0) {
        const [returnedCard] = attacker.discard.splice(discardIndex, 1);
        returnedCard.revealedToOpponent = false;
        attacker.hand.push(returnedCard);
        state.log.unshift(`Cut Them Legs won combat and returned to ${attacker.name}'s Hand.`);
      }
    }
  }
  if (pending.cardId === 'hello-there') {
    const additionalDamage = defenderPinnedBeforeDefenseEffects * 2;
    if (attackEffectsCancelled && additionalDamage > 0) {
      recordCombatDamageBlocked(state, defender, additionalDamage);
      state.log.unshift(`${cardDefinition({ instanceId: '', cardId: defenseCardId! }).name} prevented ${additionalDamage} additional Damage from Hello There.`);
    } else if (!attackEffectsCancelled && additionalDamage > 0 && !defenseNegatesDamage) {
      const dealt = dealCombatCardEffectDamage(state, defender, additionalDamage, pending.attackerId, 'attack');
      state.log.unshift(`Hello There dealt ${dealt} additional damage from ${defenderPinnedBeforeDefenseEffects} Pinned stack${defenderPinnedBeforeDefenseEffects === 1 ? '' : 's'}.`);
    } else if (!attackEffectsCancelled && additionalDamage > 0) {
      recordCombatDamageBlocked(state, defender, additionalDamage);
      state.log.unshift(`${blinkNegatesDamage ? 'Blink' : 'Calmness'} negated ${additionalDamage} additional damage from Hello There.`);
    } else if (additionalDamage === 0) {
      state.log.unshift('Hello There found no Pinned stacks and dealt no additional damage.');
    }
    if (!attackEffectsCancelled && !attackCardDebuffsPrevented) {
      if (!blessingShieldBlocksCombatStatus(state, defender, 'headache')) {
        defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
        state.log.unshift(`Hello There added a Headache Status Card to ${defender.name}'s Hand.`);
      }
    } else state.log.unshift('The defending card prevented Hello There from applying Headache during this combat.');
  }
  if (!attackEffectsCancelled && pending.cardId === 'blessed-light') {
    if (!blessingShieldBlocksCombatStatus(state, defender, 'exhaust')) {
      const exhaust = { instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'exhaust' as const, revealedToOpponent: false };
      if (defender.deck.length === 0) defender.deck.push(exhaust);
      else defender.deck = shuffle([...defender.deck, exhaust]);
    }
    const john = state.players[pending.attackerId];
    addBlessingCardToJohn(state, john, 'blessing-light');
    state.log.unshift(`Blessed Light created Blessing: Light for ${john.name}.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'blessed-might') {
    const john = state.players[pending.attackerId];
    addBlessingCardToJohn(state, john, 'blessing-might');
    state.log.unshift(`Blessed Might created Blessing: Might for ${john.name} after combat.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'cleanse' && defender.hp > 0) {
    if (!blessingShieldBlocksCombatStatus(state, defender, 'burning')) {
      defender.hand.push({ instanceId: `${defender.id}-burning-${++instanceSequence}`, cardId: 'burning', revealedToOpponent: true, sourcePlayerId: pending.attackerId });
      state.log.unshift(`Cleanse applied a Burning Status Card to ${defender.name}'s Hand after combat.`);
    }
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'enforce' && defender.hp > 0) {
    if (!blessingShieldBlocksCombatStatus(state, defender, 'panic')) defender.hand.push({ instanceId: `${defender.id}-panic-${++instanceSequence}`, cardId: 'panic', revealedToOpponent: true, sourcePlayerId: pending.attackerId });
    if (!blessingShieldBlocksCombatStatus(state, defender, 'headache')) defender.hand.push({ instanceId: `${defender.id}-headache-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true, sourcePlayerId: pending.attackerId });
    state.log.unshift(`Enforce resolved its Panic and Headache effects against ${defender.name} after combat.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'repent') {
    const john = state.players[pending.attackerId];
    const adjacentEnemies = Object.values(state.players).filter((enemy) => enemy.id !== john.id && enemy.hp > 0 && distance(john.position, enemy.position) === 1);
    const allCombatDamageNegated = pending.blessingFaithApplied || pending.mythrilHelmetApplied;
    const selfDamage = john.hp > 0 && !allCombatDamageNegated ? dealDamage(state, john, 1, false, john.id, 'attack') : 0;
    if (john.hp > 0 && allCombatDamageNegated) recordCombatDamageBlocked(state, john, 1);
    for (const enemy of adjacentEnemies) state.spellProjectiles.push({ id: `${state.turn}-repent-holy-fire-${enemy.id}-${++instanceSequence}`, casterId: john.id, targetId: enemy.id, from: { ...enemy.position }, to: { ...enemy.position }, path: [{ ...enemy.position }, { ...enemy.position }], count: 1, damage: 2, style: 'holy-fire' });
    const damagedEnemies = adjacentEnemies.map((enemy) => ({ enemy, dealt: enemy.id === defender.id && defenseNegatesDamage ? 0 : enemy.id === defender.id ? dealCombatCardEffectDamage(state, enemy, 2, john.id, 'attack') : dealDamage(state, enemy, 2, false, john.id, 'attack') }));
    state.log.unshift(`Repent! dealt ${selfDamage} Damage to ${john.name} and 2 Damage to ${damagedEnemies.filter(({ dealt }) => dealt > 0).map(({ enemy }) => enemy.name).join(', ') || 'no adjacent enemies'} after combat.`);
  }
  if (attackCardDebuffsPrevented && ['light-the-saber', 'cut-them-legs'].includes(pending.cardId)) {
    state.log.unshift("Calmness prevented the attacking card from applying debuffs during this combat.");
  }
  if (pending.returnToHandAfterCombat && (pending.cardId !== 'snowball-effect' || !attackEffectsCancelled)) {
    const attackerForReturn = state.players[pending.attackerId];
    const discardIndex = attackerForReturn.discard.findIndex((card) => card.instanceId === pending.cardInstanceId);
    if (discardIndex >= 0) {
      const [returnedCard] = attackerForReturn.discard.splice(discardIndex, 1);
      returnedCard.revealedToOpponent = false;
      attackerForReturn.hand.push(returnedCard);
      state.log.unshift(`${pending.cardId === 'snowball-effect' ? 'Snowball Effect' : 'Higround Advantage'} returned ${cardDefinition(returnedCard).name} to ${attackerForReturn.name}'s Hand.`);
    }
  }
  if (!attackEffectsCancelled && pending.cardId === 'arcane-bolt') {
    const logan = state.players[pending.attackerId];
    logan.arcaneBoltAttackBonus = attackerBeforeCombatEffects.manaMode === 'consume' ? 2 : 1;
    state.log.unshift(`Arcane Bolt${attackerBeforeCombatEffects.manaMode === 'consume' ? ' (Consume)' : ''} granted ${logan.name} +${logan.arcaneBoltAttackBonus} ATT until end of turn.`);
  }
  let manaBarrageCombatDamage = 0;
  if (pending.cardId === 'mana-barrage' && attackerBeforeCombatEffects.manaMode === 'consume') {
    const dealt = dealCombatCardEffectDamage(state, defender, 2, pending.attackerId, 'attack');
    state.log.unshift(`Mana Barrage (Consume) dealt ${dealt} guaranteed Damage after combat.`);
  } else if (pending.cardId === 'mana-barrage' && pending.manaBarrageManaApplied) {
    if (attackEffectsCancelled || defenseNegatesDamage) {
      recordCombatDamageBlocked(state, defender, 1);
      state.log.unshift(`${defenseCardId ? cardDefinition({ instanceId: '', cardId: defenseCardId }).name : 'the Defence effect'} prevented Mana Barrage's 1 Mana-powered Damage.`);
    } else {
      manaBarrageCombatDamage = dealCombatCardEffectDamage(state, defender, 1, pending.attackerId, 'attack');
      state.log.unshift(`Mana Barrage dealt 1 Damage from the Mana Point applied during combat.`);
    }
  }
  if (!attackEffectsCancelled && pending.cardId === 'chain-punchin') {
    const orkk = state.players[pending.attackerId];
    if (pending.shieldEquippedAtStart) {
      const dropSquares: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const cell = { x: orkk.position.x + dx, y: orkk.position.y + dy };
        if (cell.x < 1 || cell.x > boardWidth(state) || cell.y < 0 || cell.y >= boardHeight(state)) continue;
        const occupied = Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)
          || state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
        if (!occupied) dropSquares.push(cell);
      }
      const dropSquare = dropSquares[0];
      if (dropSquare) unequipOrkkShield(state, orkk.id, dropSquare);
      else state.log.unshift(`Chain Punchin could not drop ${orkk.name}'s Shield because no adjacent Square was empty.`);
      const drawn = drawCards(orkk, 1);
      state.log.unshift(`Chain Punchin drew ${drawn} Card after the equipped Shield was dropped.`);
    } else {
      orkk.actionsRemaining += 1;
      state.log.unshift(`Chain Punchin generated 1 extra Action because ${orkk.name}'s Shield was not equipped during combat.`);
    }
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'teef-strike') {
    if (!blessingShieldBlocksCombatStatus(state, defender, 'exhaust')) {
      defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'exhaust', revealedToOpponent: true });
      state.log.unshift(`Teef Strike added an Exhaust Status Card to ${defender.name}'s Hand after combat.`);
    }
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'chip-cast') {
    const headacheCount = pending.rageSpent ?? 0;
    for (let index = 0; index < headacheCount; index++) if (!blessingShieldBlocksCombatStatus(state, defender, 'headache')) defender.discard.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
    const isChipStatus = (card: CardInstance) => card.cardId === 'exhaust' || card.cardId === 'headache';
    const handStatuses = defender.hand.filter(isChipStatus);
    const discardStatuses = defender.discard.filter(isChipStatus);
    defender.hand = defender.hand.filter((card) => !isChipStatus(card));
    defender.discard = defender.discard.filter((card) => !isChipStatus(card));
    const shuffledStatuses = [...handStatuses, ...discardStatuses].map((card) => ({ ...card, revealedToOpponent: false }));
    defender.deck = shuffle([...defender.deck, ...shuffledStatuses]); defender.knownTopCardId = null;
    state.log.unshift(`Chip-cast added ${headacheCount} Headache Card${headacheCount === 1 ? '' : 's'} and shuffled ${shuffledStatuses.length} Exhaust and Headache Card${shuffledStatuses.length === 1 ? '' : 's'} into ${defender.name}'s Deck.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'shield-bash' && !pending.shieldEquippedAtStart) {
    const orkk = state.players[pending.attackerId];
    const recall = nearestRecallableOrkkShield(state, orkk.id, orkk.position, 16);
    if (recall) {
      const { shield, path } = recall;
      if (path.length > 0) {
        const recallAnimationId = `${state.turn}-shield-bash-${state.objectPushAnimations.length}`;
        const crossedEnemyIds = new Set<PlayerId>();
        for (const [pathIndex, cell] of path.entries()) {
          const enemy = Object.values(state.players).find((entry) => entry.id !== orkk.id && entry.position.x === cell.x && entry.position.y === cell.y);
          if (!enemy || crossedEnemyIds.has(enemy.id)) continue;
          crossedEnemyIds.add(enemy.id);
          const damageAnimationStart = state.objectPushAnimations.length;
          dealCombatCardEffectDamage(state, enemy, 3, orkk.id, 'attack', true);
          for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
            if (!event.damage?.collision) continue;
            event.damage.triggerAnimationId = recallAnimationId;
            event.damage.triggerRouteProgress = (pathIndex + 1) / path.length;
          }
          state.log.unshift(`Shield Bash's Shield passed through ${enemy.name} and dealt 3 damage.`);
        }
        pullEnemiesAlongShieldRecall(state, shield, orkk.id, path, 'Shield Bash', recallAnimationId);
        state.objectPushAnimations.push({ id: recallAnimationId, objectId: shield.id, from: { ...shield.position }, to: { ...orkk.position }, dx: Math.sign(orkk.position.x - shield.position.x), dy: Math.sign(orkk.position.y - shield.position.y), collided: false, path: path.map((cell) => ({ ...cell })), removeOnComplete: true, equipPlayerId: orkk.id });
        state.objects = state.objects.filter((entry) => entry.id !== shield.id);
        orkk.shieldEquipped = true;
        state.log.unshift(`Shield Bash recalled and equipped ${orkk.name}'s Shield after combat.`);
      } else state.log.unshift(`Shield Bash could not find a walkable path from the Shield to ${orkk.name}.`);
    } else state.log.unshift('Shield Bash found no Shield on the Board to recall.');
  }
  if (!attackEffectsCancelled && pending.cardId === 'knee-blast') {
    const pushDistance = pending.rageSpent ?? 0;
    const attacker = state.players[pending.attackerId];
    const dx = Math.sign(defender.position.x - attacker.position.x);
    const dy = Math.sign(defender.position.y - attacker.position.y);
    const collided = pushDistance > 0 && pushEntity(state, { kind: 'player', id: defender.id, position: defender.position }, dx, dy, pushDistance, 1, attacker.id, false, 'attack');
    state.log.unshift(`Knee Blast pushed ${defender.name} ${pushDistance} Square${pushDistance === 1 ? '' : 's'} away from ${attacker.name}${collided ? ' until a collision' : ''}.`);
    if (collided && !attackCardDebuffsPrevented) {
      if (!blessingShieldBlocksCombatStatus(state, defender, 'headache')) {
        defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
        state.log.unshift(`Knee Blast's collision added a Headache Status Card to ${defender.name}'s Hand.`);
      }
    }
  }
  if (defenseCardId === 'arcane-shield' && !shieldEquippedAtDefenseStart && !defenseEffectsCancelled) {
    const recall = nearestRecallableOrkkShield(state, defender.id, defender.position, 16);
    if (recall) {
      const { shield, path } = recall;
      if (path.length > 0) {
        const recallAnimationId = `${state.turn}-arcane-shield-${state.objectPushAnimations.length}`;
        const crossedEnemyIds = new Set<PlayerId>();
        for (const [pathIndex, cell] of path.entries()) {
          const enemy = Object.values(state.players).find((entry) => entry.id !== defender.id && entry.position.x === cell.x && entry.position.y === cell.y);
          if (!enemy || crossedEnemyIds.has(enemy.id)) continue;
          crossedEnemyIds.add(enemy.id);
          const damageAnimationStart = state.objectPushAnimations.length;
          dealCombatCardEffectDamage(state, enemy, 2, defender.id, 'defense', true);
          for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
            if (!event.damage?.collision) continue;
            event.damage.triggerAnimationId = recallAnimationId;
            event.damage.triggerRouteProgress = (pathIndex + 1) / path.length;
          }
          state.log.unshift(`Arcane Shield passed through ${enemy.name}'s occupied Square and dealt 2 Damage.`);
        }
        state.objectPushAnimations.push({ id: recallAnimationId, objectId: shield.id, from: { ...shield.position }, to: { ...defender.position }, dx: Math.sign(defender.position.x - shield.position.x), dy: Math.sign(defender.position.y - shield.position.y), collided: false, path: path.map((cell) => ({ ...cell })), removeOnComplete: true, equipPlayerId: defender.id });
        state.objects = state.objects.filter((entry) => entry.id !== shield.id);
        defender.shieldEquipped = true;
        state.log.unshift(`Arcane Shield recalled and equipped ${defender.name}'s Shield after combat.`);
      } else state.log.unshift(`Arcane Shield could not find a walkable path from the Shield to ${defender.name}.`);
    } else state.log.unshift('Arcane Shield found no Shield on the Board to recall.');
  }
  if (defenseCardId === 'countaspell' && !defenseEffectsCancelled) {
    const attacker = state.players[pending.attackerId];
    const headacheCount = defender.rageStacks;
    for (let index = 0; index < headacheCount; index++) if (!blessingShieldBlocksCombatStatus(state, attacker, 'headache')) attacker.discard.push({ instanceId: `${attacker.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
    state.log.unshift(`CountaSpell added ${headacheCount} Headache Card${headacheCount === 1 ? '' : 's'} to ${attacker.name}'s Discard Deck after combat.`);
  }
  if (defenseCardId === 'mana-baryer' && !shieldEquippedAtDefenseStart && !defenseEffectsCancelled) {
    const recall = nearestRecallableOrkkShield(state, defender.id, defender.position, 16);
    if (recall) {
      const { shield, path } = recall;
      if (path.length > 0) {
        const recallAnimationId = `${state.turn}-mana-baryer-${state.objectPushAnimations.length}`;
        const crossedEnemyIds = new Set<PlayerId>();
        for (const [pathIndex, cell] of path.entries()) {
          const enemy = Object.values(state.players).find((entry) => entry.id !== defender.id && entry.position.x === cell.x && entry.position.y === cell.y);
          if (!enemy || crossedEnemyIds.has(enemy.id)) continue;
          crossedEnemyIds.add(enemy.id);
          const damageAnimationStart = state.objectPushAnimations.length;
          dealCombatCardEffectDamage(state, enemy, 2, defender.id, 'defense', true);
          for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
            if (!event.damage?.collision) continue;
            event.damage.triggerAnimationId = recallAnimationId;
            event.damage.triggerRouteProgress = (pathIndex + 1) / path.length;
          }
          state.log.unshift(`Mana Baryer's Shield passed through ${enemy.name} and dealt 2 damage.`);
        }
        pullEnemiesAlongShieldRecall(state, shield, defender.id, path, 'Mana Baryer', recallAnimationId);
        state.objectPushAnimations.push({ id: recallAnimationId, objectId: shield.id, from: { ...shield.position }, to: { ...defender.position }, dx: Math.sign(defender.position.x - shield.position.x), dy: Math.sign(defender.position.y - shield.position.y), collided: false, path: path.map((cell) => ({ ...cell })), removeOnComplete: true, equipPlayerId: defender.id });
        state.objects = state.objects.filter((entry) => entry.id !== shield.id);
        defender.shieldEquipped = true;
        state.log.unshift(`Mana Baryer recalled and equipped ${defender.name}'s Shield after combat.`);
      } else state.log.unshift(`Mana Baryer could not find a walkable path from the Shield to ${defender.name}.`);
    } else state.log.unshift('Mana Baryer found no Shield on the Board to recall.');
  }
  if (defenseCardId === 'arcane-barrier' && !defenseEffectsCancelled) {
    const attacker = state.players[pending.attackerId];
    if (distance(defender.position, attacker.position) !== 1) {
      state.log.unshift(`Arcane Barrier could not affect ${attacker.name} because the attacker was not adjacent to ${defender.name}.`);
    } else {
      const dx = Math.sign(attacker.position.x - defender.position.x);
      const dy = Math.sign(attacker.position.y - defender.position.y);
      const destination = { x: attacker.position.x + dx, y: attacker.position.y + dy };
      const blocked = destination.x < 1 || destination.x > boardWidth(state) || destination.y < 0 || destination.y >= boardHeight(state)
        || Object.values(state.players).some((entry) => entry.id !== attacker.id && entry.position.x === destination.x && entry.position.y === destination.y)
        || state.objects.some((entry) => entry.position.x === destination.x && entry.position.y === destination.y);
      if (blocked) {
        dealCombatCardEffectDamage(state, attacker, 1, defender.id, 'defense');
        state.log.unshift(`Arcane Barrier could not push ${attacker.name} and dealt 1 Damage instead.`);
      } else {
        const origin = { ...attacker.position };
        recordQuestMovement(state, attacker.id, 1, false, destination);
        attacker.position = destination;
        attacker.visualMovement = { from: origin, path: [{ ...destination }] };
        markCharacterMoved(attacker, 'enemy-ability');
        applyElevationDropDamage(state, { kind: 'player', id: attacker.id, position: origin }, origin, destination, defender.id, 'other');
        state.log.unshift(`Arcane Barrier pushed ${attacker.name} 1 Square away from ${defender.name}.`);
      }
    }
  }
  if (defenseCardId === 'not-a-shinobi' && !defenseEffectsCancelled) {
    removeAllDebuffs(defender);
    state.log.unshift(`Not a Shinobi You Looking For removed all negative effects from ${defender.name} after combat.`);
  }
  if (defenseCardId === 'counterspell' && !defenseEffectsCancelled) {
    const retaliation = defender.manaPoints > 0 ? 1 : 0;
    if (retaliation > 0) dealCombatCardEffectDamage(state, state.players[pending.attackerId], retaliation, defender.id, 'defense');
    const counterTarget = state.players[pending.attackerId];
    if (!blessingShieldBlocksCombatStatus(state, counterTarget, 'headache')) {
      counterTarget.deck.push({ instanceId: `${pending.attackerId}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: false });
      counterTarget.knownTopCardId = 'headache';
      state.log.unshift(`Counterspell ${retaliation > 0 ? `dealt 1 Damage to ${counterTarget.name} and ` : ''}placed Headache on top of their Deck${retaliation > 0 ? ' because Logan had stored Mana' : ''}.`);
    }
  }
  let blinkCanTeleport = false;
  let blinkNeedsDiscard = false;
  if (defenseCardId === 'blink' && !defenseEffectsCancelled) {
    const removedMana = defender.manaPoints;
    defender.manaPoints = 0;
    if (removedMana > 0) {
      blinkCanTeleport = true;
      state.log.unshift(`Blink removed ${removedMana} Mana and will teleport ${defender.name} after combat.`);
    } else {
      const handDiscard = defender.hand.find((card) => card.cardId !== 'pinned' && !cardDefinition(card).cannotBeDiscarded);
      if (handDiscard) {
        blinkNeedsDiscard = true;
        state.log.unshift(`Blink found no Mana; ${defender.name} must choose a Card from Hand to discard.`);
      } else {
        let deckIndex = -1;
        for (let index = defender.deck.length - 1; index >= 0; index--) {
          if (cardDefinition(defender.deck[index]).kind !== 'status') { deckIndex = index; break; }
        }
        if (deckIndex >= 0) {
          const [discarded] = defender.deck.splice(deckIndex, 1);
          defender.discard.push(discarded);
          state.log.unshift(`Blink found no Mana or eligible Hand Card; ${cardDefinition(discarded).name} was moved from the top of ${defender.name}'s Deck to Discard.`);
        } else state.log.unshift(`Blink found no Mana and no eligible Card in ${defender.name}'s Hand or Deck to discard.`);
      }
    }
  }
  if (pending.generatesMana) gainManaFromResolvedSpell(state, state.players[pending.attackerId]);
  const attacker = state.players[pending.attackerId];
  if (!attackEffectsCancelled && pending.cardId === 'fistbolt') {
    attacker.rageStacks += 1;
    state.log.unshift(`Fistbolt generated 1 Rage after combat (${attacker.rageStacks} total).`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'shield-bash' && pending.shieldEquippedAtStart) {
    attacker.rageStacks += 1;
    state.log.unshift(`Shield Bash generated 1 Rage after all combat effects resolved because ${attacker.name}'s Shield was already equipped (${attacker.rageStacks} total).`);
  }
  let postCombatChoicePending = false;
  if (attacker.hp === 0) { state.phase = 'finished'; state.winner = defender.id; state.log.unshift(`${defender.name} wins the duel!`); }
  else if (defender.hp === 0) { state.phase = 'finished'; state.winner = pending.attackerId; state.log.unshift(`${attacker.name} wins the duel!`); }
  else if (!attackEffectsCancelled && pending.cardId === 'force-disarm') {
    const attackCards = defender.hand.filter((card) => cardDefinition(card).kind === 'attack');
    if (attackCards.length > 0) {
      state.phase = 'choosing-force-disarm-discard';
      state.forceDisarm = { targetId: defender.id, cardKind: 'attack', source: 'force-disarm' };
      state.log.unshift(`${defender.name} must discard 1 Attack card due to Force Disarm.`);
    } else {
      defender.hand.forEach((card) => { card.revealedToOpponent = true; });
      if (!blessingShieldBlocksCombatStatus(state, defender, 'exhaust')) defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'exhaust', revealedToOpponent: true });
      state.phase = 'active';
      state.log.unshift(`${defender.name} had no Attack Card; Force Disarm revealed their Hand and added an Exhaust Card to it.`);
    }
  }
  else if (!attackEffectsCancelled && pending.cardId === 'teef-strike') {
    const defendCards = defender.hand.filter((card) => cardDefinition(card).kind === 'defend');
    if (defendCards.length > 0) {
      state.phase = 'choosing-force-disarm-discard';
      state.forceDisarm = { targetId: defender.id, cardKind: 'defend', source: 'teef-strike' };
      state.log.unshift(`${defender.name} must discard 1 Defend Card due to Teef Strike.`);
    } else {
      state.phase = 'active';
      state.log.unshift(`${defender.name} had no Defend Card to discard for Teef Strike.`);
    }
  }
  else if (!attackEffectsCancelled && pending.cardId === 'dance-through') {
    state.phase = 'dance-through';
    state.danceThrough = { stepsRemaining: 3, enemyUnderfoot: null, damagePrevented: false, pinnedEnemyIds: [] } as typeof state.danceThrough & { pinnedEnemyIds: PlayerId[] };
    state.log.unshift('Dance Through: Obi Wan Shinobi may move 1 square up to 3 times.');
  } else state.phase = 'active';
  if (blinkCanTeleport && state.phase !== 'finished') {
    state.phase = 'choosing-blink-teleport';
    postCombatChoicePending = true;
    state.log.unshift(`Blink: ${defender.name} must choose an empty Square to teleport to.`);
  }
  if (blinkNeedsDiscard && state.phase !== 'finished') {
    state.phase = 'choosing-blink-discard';
    postCombatChoicePending = true;
  }
  if (!attackEffectsCancelled && pending.cardId === 'mana-blast' && state.phase !== 'finished') {
    const discardable = defender.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded);
    if (discardable.length > 0) {
      state.phase = 'mana-blast-offer';
      postCombatChoicePending = true;
      state.log.unshift(`${defender.name} may discard 1 Card to prevent ${attacker.name} from gaining Mana from Mana Blast.`);
    } else {
      state.log.unshift(`${defender.name} had no Card they could discard; Mana Blast grants no Mana.`);
    }
  }
  if (!attackEffectsCancelled && pending.cardId === 'grimoire-cleanse' && damage > 0 && state.phase !== 'finished') {
    const discardableCount = defender.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded).length;
    if (discardableCount > 0) {
      pending.grimoireDiscardsRemaining = Math.min(2, discardableCount);
      state.phase = 'choosing-grimoire-discard';
      postCombatChoicePending = true;
      state.log.unshift(`${defender.name} must discard ${pending.grimoireDiscardsRemaining} Card${pending.grimoireDiscardsRemaining === 1 ? '' : 's'} for Grimoire Cleanse.`);
    } else state.log.unshift(`${defender.name} had no eligible Cards to discard for Grimoire Cleanse.`);
  } else if (!attackEffectsCancelled && pending.cardId === 'grimoire-cleanse' && damage === 0) {
    state.log.unshift(`Grimoire Cleanse did not win combat, so ${defender.name} does not discard Cards.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'snowball-effect' && attacker.manaMode === 'consume' && state.phase !== 'finished') {
    const drawn = drawCards(attacker, 1);
    state.phase = 'choosing-snowball-discard';
    state.log.unshift(`Snowball Effect (Consume): ${attacker.name} drew ${drawn} Card and must discard 1 Card from Hand.`);
  }
  if (defenseCardId === 'double-jump' && state.phase !== 'finished') {
    const resumePhase = state.phase;
    state.phase = 'double-jump';
    state.doubleJump = { playerId: defender.id, stepsRemaining: 2, enemyUnderfoot: null, resumePhase, pinnedEnemyIds: [] } as typeof state.doubleJump & { pinnedEnemyIds: PlayerId[] };
    state.log.unshift('Double Jump: Obi Wan Shinobi must move 1 square twice.');
  }
  if (defenseCardId === 'flurry-defensive-strikes' && state.phase !== 'finished') {
    const attackerCanDiscard = attacker.hand.some((card) => !cardDefinition(card).cannotBeDiscarded);
    if (attackerCanDiscard) {
      state.flurry = { defenderId: defender.id, attackerId: pending.attackerId, resumePhase: state.phase, remainingEnemyDiscards: 0 };
      state.phase = 'flurry-offer';
      state.log.unshift(`${defender.name} may lose 1 HP to force ${attacker.name} to discard 1 Card.`);
    } else state.log.unshift(`Flurry's optional effect was unavailable because ${attacker.name} had no eligible Card to discard.`);
  }
  if (defenseCardId === 'feed-the-spirit' && !defenseEffectsCancelled && state.phase !== 'finished') {
    if (!defenderSpiritFormAtCombatStart && defender.spiritForm) {
      const healed = healPlayer(state, defender, 2);
      state.log.unshift(`Feed the Spirit restored ${healed} Hit Points because ${defender.name} entered Spirit Form during combat.`);
    }
    const blessings = defender.hand.filter((card) => cardDefinition(card).name.startsWith('Blessing:'));
    if (blessings.length > 0) {
      pending.feedSpiritOffered = true;
      state.phase = 'mana-blast-offer';
      postCombatChoicePending = true;
      state.log.unshift(`${defender.name} may Remove a Blessing Card to restore 1 additional Hit Point with Feed the Spirit.`);
    }
  }
  if (defenseCardId === 'thorns' && !defenseEffectsCancelled && !defenderSpiritFormAtCombatStart && defender.spiritForm && state.phase !== 'finished') {
    if (!blessingShieldBlocksCombatStatus(state, attacker, 'burning')) {
      attacker.hand.push({ instanceId: `${attacker.id}-burning-${++instanceSequence}`, cardId: 'burning', revealedToOpponent: true, sourcePlayerId: defender.id });
      state.log.unshift(`Thorns added a Burning Status Card to ${attacker.name}'s Hand after ${defender.name} entered Spirit Form.`);
    }
  }
  if (!postCombatChoicePending) state.pendingAttack = null;
  state.combatReveal = null;
  // Finalize discard-based quest progress in the deferred result now. The
  // acknowledgement command receives a deserialized state and therefore cannot
  // reuse this command's WeakMap discard baseline later.
  scorePendingDiscards(state);
  const deferredAfterCombatState = JSON.stringify(state);
  const attackCard = cardDefinition({ instanceId: '', cardId: pending.cardId });
  stateBeforeAfterCombatEffects.combatReveal = { attackCardId: pending.cardId, defendCardId: defenseCardId, attackBase: attackCard.value, attackTotal: pending.attackValue, defendBase: defenseBaseValue, defendTotal: defenseValue, attackModifiers: pending.attackModifiers ?? [], defendModifiers, combatWinnerId: pending.attackValue > defenseValue ? pending.attackerId : pending.defenderId, combatDamage: damage + manaBarrageCombatDamage, combatStackApplied: pending.combatStackApplied, expiresAt: Date.now() + 10_000, acknowledged: [], deferredAfterCombatState };
  return ok(stateBeforeAfterCombatEffects);
}

function acknowledgeCombat(state: GameState, playerId: PlayerId, combatExpiresAt?: number): CommandResult {
  const reveal = state.combatReveal;
  if (!reveal) return ok(state);
  if (combatExpiresAt != null && reveal.expiresAt !== combatExpiresAt) return ok(state);
  const participants = state.pendingAttack ? [state.pendingAttack.attackerId, state.pendingAttack.defenderId] : (Object.keys(state.players) as PlayerId[]).slice(0, 2);
  if (!participants.includes(playerId)) return fail(state, 'Only players in this combat may acknowledge its result.');
  if (!reveal.acknowledged.includes(playerId)) reveal.acknowledged.push(playerId);
  if (participants.every((id) => reveal.acknowledged.includes(id))) {
    if (reveal.deferredAfterCombatState) {
      const resolvedState = JSON.parse(reveal.deferredAfterCombatState) as GameState;
      resolvedState.combatReveal = null;
      return ok(resolvedState);
    }
    state.combatReveal = null;
  }
  return ok(state);
}

function resolveFlurryDecline(state: GameState, playerId: PlayerId): CommandResult {
  if (state.phase !== 'flurry-offer' || state.flurry?.defenderId !== playerId) return fail(state, 'No Flurry choice is pending for this player.');
  state.phase = state.flurry.resumePhase;
  state.log.unshift(`${state.players[playerId].name} declined the Flurry discard.`);
  state.flurry = null;
  return ok(state);
}

function resolveFlurryPay(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const flurry = state.flurry;
  if (state.phase !== 'flurry-offer' || !flurry || flurry.defenderId !== playerId) return fail(state, 'No Flurry choice is pending for this player.');
  const defender = state.players[playerId];
  {
    const attacker = state.players[flurry.attackerId];
    defender.hp = Math.max(0, defender.hp - 1);
    state.log.unshift(`${defender.name} lost 1 HP to activate Flurry's forced discard.`);
    if (defender.hp === 0) {
      state.phase = 'finished'; state.winner = attacker.id; state.flurry = null;
      state.log.unshift(`${attacker.name} wins the duel!`);
      return ok(state);
    }
    const discardable = attacker.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded);
    if (discardable.length === 0) {
      state.phase = flurry.resumePhase; state.flurry = null;
      state.log.unshift(`${attacker.name} had no card eligible for Flurry's forced discard.`);
      return ok(state);
    }
    flurry.remainingEnemyDiscards = 1;
    state.phase = 'choosing-flurry-enemy-discard';
    state.log.unshift(`${attacker.name} must choose ${flurry.remainingEnemyDiscards} Card${flurry.remainingEnemyDiscards === 1 ? '' : 's'} to discard.`);
    return ok(state);
  }
  /* Legacy card-payment flow retained below only for save compatibility; new Flurry resolves above.
  const payment = defender.hand.find((card) => card.instanceId === cardInstanceId);
  if (!payment) return fail(state, 'That payment card is not in Shinobi’s Hand.');
  const paymentDefinition = cardDefinition(payment);
  if (paymentDefinition.cannotBeDiscarded) return fail(state, `${paymentDefinition.name} cannot be discarded.`);
  const paymentName = paymentDefinition.name;
  discardFromHand(defender, cardInstanceId);
  const attacker = state.players[flurry.attackerId];
  state.log.unshift(`${defender.name} discarded ${paymentName} to activate Flurry’s forced discard.`);
  if (attacker.hand.length <= 2) {
    const discardable = attacker.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded);
    const count = discardable.length;
    for (const card of discardable) discardFromHand(attacker, card.instanceId);
    state.phase = flurry.resumePhase;
    state.log.unshift(`${attacker.name} discarded their whole Hand (${count} card${count === 1 ? '' : 's'}).`);
    state.flurry = null;
  } else {
    flurry.remainingEnemyDiscards = Math.min(1, attacker.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded).length);
    if (flurry.remainingEnemyDiscards === 0) {
      state.phase = flurry.resumePhase; state.flurry = null;
      state.log.unshift(`${attacker.name} had no cards eligible for Flurry's forced discard.`);
      return ok(state);
    }
    state.phase = 'choosing-flurry-enemy-discard';
    state.log.unshift(`${attacker.name} must choose 2 cards to discard.`);
  }
  return ok(state);
  */
}

function resolveFlurryEnemyDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const flurry = state.flurry;
  if (state.phase !== 'choosing-flurry-enemy-discard' || !flurry || flurry.attackerId !== playerId) return fail(state, 'No Flurry enemy discard is pending for this player.');
  const attacker = state.players[playerId];
  const card = attacker.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'That card is not in the attacker’s Hand.');
  const definition = cardDefinition(card);
  if (definition.cannotBeDiscarded) return fail(state, `${definition.name} cannot be discarded.`);
  const name = definition.name;
  discardFromHand(attacker, cardInstanceId);
  flurry.remainingEnemyDiscards -= 1;
  state.log.unshift(`${attacker.name} discarded ${name} (${flurry.remainingEnemyDiscards} remaining).`);
  if (flurry.remainingEnemyDiscards === 0 || !attacker.hand.some((entry) => !cardDefinition(entry).cannotBeDiscarded)) {
    state.phase = flurry.resumePhase;
    state.flurry = null;
  }
  return ok(state);
}

function resolveForceDisarmDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  if (state.phase !== 'choosing-force-disarm-discard' || state.forceDisarm?.targetId !== playerId) return fail(state, 'No Force Disarm discard is pending for this player.');
  const player = state.players[playerId];
  const card = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  const requiredKind = state.forceDisarm.cardKind ?? 'attack';
  const fearJustice = 'remainingTargetIds' in state.forceDisarm;
  const mindBlast = 'mindBlastLevel' in state.forceDisarm;
  const source = mindBlast ? 'Mind Blast' : fearJustice ? 'Fear the Justice' : state.forceDisarm.source === 'teef-strike' ? 'Teef Strike' : 'Force Disarm';
  if (!card || cardDefinition(card).cannotBeDiscarded || (!mindBlast && cardDefinition(card).kind !== requiredKind)) return fail(state, mindBlast ? 'Mind Blast requires a discardable Card.' : `${source} requires a ${requiredKind === 'attack' ? 'Attack' : 'Defend'} Card to be discarded.`);
  const name = cardDefinition(card).name;
  discardFromHand(player, cardInstanceId);
  state.log.unshift(`${player.name} discarded ${name} due to ${source}.`);
  if (mindBlast) {
    const pending = state.forceDisarm as typeof state.forceDisarm & { mindBlastLevel: number; mindBlastCasterId: PlayerId };
    finishMindBlast(state, state.players[pending.mindBlastCasterId], player, pending.mindBlastLevel);
    return ok(state);
  }
  const remainingTargetIds = fearJustice ? ((state.forceDisarm as typeof state.forceDisarm & { remainingTargetIds: PlayerId[] }).remainingTargetIds ?? []) : [];
  const nextTargetId = remainingTargetIds.find((id) => state.players[id].hand.some((entry) => cardDefinition(entry).kind === 'defend'));
  if (nextTargetId) {
    const nextIndex = remainingTargetIds.indexOf(nextTargetId);
    state.forceDisarm = { targetId: nextTargetId, cardKind: 'defend', source: 'force-disarm', remainingTargetIds: remainingTargetIds.slice(nextIndex + 1) } as typeof state.forceDisarm & { remainingTargetIds: PlayerId[] };
    state.log.unshift(`Fear the Justice requires ${state.players[nextTargetId].name} to discard 1 Defend Card.`);
  } else {
    state.forceDisarm = null;
    state.phase = 'active';
  }
  return ok(state);
}

type PushEntity = { kind: 'player' | 'object'; id: string; position: Cell };
function snapshotPerkTargeting(player: PlayerState): PerkTargetingUndo {
  return structuredClone({ deck: player.deck, hand: player.hand, discard: player.discard, spellEcho: player.spellEcho, actionsRemaining: player.actionsRemaining, perkUsed: player.perkUsed, manaPoints: player.manaPoints });
}
function attachTargetingUndo(state: GameState, playerId: PlayerId, undo: PerkTargetingUndo) {
  const guardian = (state as GameState & { spiritGuardian?: { casterId: PlayerId; level: number; undo: PerkTargetingUndo | null } | null }).spiritGuardian;
  if (guardian?.casterId === playerId) guardian.undo = undo;
  if (state.forceThrow?.casterId === playerId) state.forceThrow.undo = undo;
  if (state.forcePull?.casterId === playerId) state.forcePull.undo = undo;
  if (state.arkaneArow?.casterId === playerId) state.arkaneArow.undo = undo;
  if (state.armDaWiz?.casterId === playerId) state.armDaWiz.undo = undo;
  if (state.preparation?.casterId === playerId) state.preparation.undo = undo;
  if (state.arcaneMissle?.casterId === playerId) state.arcaneMissle.undo = undo;
  if (state.chainLightning?.casterId === playerId) state.chainLightning.undo = undo;
  if (state.magicHand?.casterId === playerId) state.magicHand.undo = undo;
  if (state.shizzle?.casterId === playerId) state.shizzle.undo = undo;
  if (state.mindTricks?.casterId === playerId) state.mindTricks.undo = undo;
}

function resolveSpiritGuardianSquare(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const extended = state as GameState & { spiritGuardian?: { casterId: PlayerId; level: number; undo: PerkTargetingUndo | null } | null };
  const pending = extended.spiritGuardian;
  if (state.phase !== 'choosing-spirit-guardian-square' || pending?.casterId !== playerId) return fail(state, 'Spirit Guardian is not waiting for this Square.');
  const caster = state.players[playerId];
  if (to.x < 1 || to.x > boardWidth(state) || to.y < 0 || to.y >= boardHeight(state)) return fail(state, 'That Square is outside the Gaming Board.');
  if (distance(caster.position, to) > effectiveAttackRange(state, caster)) return fail(state, `Spirit Guardian must be created within Range ${effectiveAttackRange(state, caster)}.`);
  if (Object.values(state.players).some((player) => player.hp > 0 && player.position.x === to.x && player.position.y === to.y) || state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Spirit Guardian requires an empty Square.');
  removeOwnedGuardian(state, playerId, 'when a new Guardian was created');
  state.objects.push({ id: `${playerId}-spirit-guardian-${++instanceSequence}`, name: 'Spirit Guardian', kind: 'spirit-guardian', hp: pending.level >= 2 ? 999 : 1, maxHp: pending.level >= 2 ? 999 : 1, position: { ...to }, ownerId: playerId, guardianLevel: pending.level, heavy: pending.level >= 2 });
  extended.spiritGuardian = null;
  state.phase = 'active';
  state.log.unshift(`${caster.name} created a level ${pending.level} Spirit Guardian at ${cellLabel(to)}${pending.level >= 2 ? ' as an invincible Wall Object' : ''}.`);
  return ok(state);
}

function resolveFireballTarget(state: GameState, playerId: PlayerId, targetId: PlayerId): CommandResult {
  const extended = state as GameState & { fireball?: { casterId: PlayerId; undo: PerkTargetingUndo } | null };
  const pending = extended.fireball;
  if (state.phase !== 'choosing-fireball-target' || pending?.casterId !== playerId) return fail(state, 'Fireball is not waiting for this target.');
  const caster = state.players[playerId]; const target = state.players[targetId];
  if (!target || targetId === playerId || target.hp <= 0) return fail(state, 'Choose a living enemy.');
  if (distance(caster.position, target.position) > 3) return fail(state, 'Fireball has Range 3.');
  if (!hasLineOfSight(state, caster.position, target.position)) return fail(state, 'A Wall Object blocks Fireball line of sight.');
  const damage = 2 + meleeHighGroundDamageBonus(state, caster, target.position);
  const dealt = dealDamage(state, target, damage, false, playerId, 'perk');
  if (target.hp > 0) target.hand.push({ instanceId: `${target.id}-burning-${++instanceSequence}`, cardId: 'burning', revealedToOpponent: true, sourcePlayerId: playerId });
  extended.fireball = null; state.phase = 'active';
  state.log.unshift(`${caster.name}'s Fireball dealt ${dealt} Damage to ${target.name}${damage > 2 ? ', including +1 from High Ground' : ''} and applied Burning; the Reward Card was Removed from the game.`);
  return ok(state);
}

function resolvePortalTeleport(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const extended = state as GameState & { portal?: { casterId: PlayerId; undo: PerkTargetingUndo } | null };
  const pending = extended.portal;
  if (state.phase !== 'choosing-portal-target' || pending?.casterId !== playerId) return fail(state, 'Portal is not waiting for this destination.');
  if (to.x < 1 || to.x > boardWidth(state) || to.y < 0 || to.y >= boardHeight(state)) return fail(state, 'That Square is outside the Gaming Board.');
  if (Object.values(state.players).some((player) => player.position.x === to.x && player.position.y === to.y) || state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Portal requires an empty Square.');
  const player = state.players[playerId]; const from = { ...player.position };
  if (!hasLineOfSight(state, from, to)) return fail(state, 'Portal can only land on a Square currently visible from its caster.');
  recordQuestMovement(state, playerId, 1, true, to); player.position = { ...to };
  extended.portal = null; state.phase = 'active';
  state.log.unshift(`${player.name} used Portal to teleport from ${cellLabel(from)} to ${cellLabel(to)}. Portal was moved to the Discard.`);
  return ok(state);
}

function cancelCardTargeting(state: GameState, playerId: PlayerId): CommandResult {
  if (state.phase === 'choosing-boomerang-target' && state.boomerang?.casterId === playerId) {
    state.boomerang = null; state.phase = 'active';
    state.log.unshift(`${state.players[playerId].name} cancelled Boomerang before resolving it.`);
    return ok(state);
  }
  const extended = state as GameState & { fireball?: { casterId: PlayerId; undo: PerkTargetingUndo } | null; portal?: { casterId: PlayerId; undo: PerkTargetingUndo } | null; spiritGuardian?: { casterId: PlayerId; level: number; undo: PerkTargetingUndo | null } | null };
  const force = state.forceThrow ?? state.forcePull ?? state.arkaneArow ?? state.armDaWiz ?? state.preparation ?? state.arcaneMissle ?? state.chainLightning ?? state.magicHand ?? state.shizzle ?? state.mindTricks ?? extended.fireball ?? extended.portal ?? extended.spiritGuardian;
  const forceThrowIsPending = state.phase === 'choosing-force-throw-target' || state.phase === 'choosing-force-throw-direction' || state.phase === 'choosing-kyk-target' || state.phase === 'choosing-kyk-direction';
  const forcePullIsPending = state.phase === 'choosing-force-pull-target';
  const arkaneArowIsPending = state.phase === 'choosing-arkane-arow-target';
  const armDaWizIsPending = state.phase === 'choosing-arm-da-wiz-choice' || state.phase === 'choosing-arm-da-wiz-target';
  const mindTricksIsPending = state.phase === 'choosing-mind-tricks-discard' && state.mindTricks?.discarded === 0;
  const preparationIsPending = state.phase === 'choosing-preparation-teleport';
  const arcaneMissleIsPending = state.phase === 'choosing-arcane-missle-target';
  const chainLightningIsPending = state.phase === 'choosing-chain-lightning-target';
  const magicHandIsPending = state.phase === 'choosing-magic-hand-target' || state.phase === 'choosing-magic-hand-direction';
  const shizzleIsPending = state.phase === 'choosing-shizzle-destination' || (state.phase === 'shizzle-move' && state.shizzle?.started === false);
  const fireballIsPending = state.phase === 'choosing-fireball-target';
  const portalIsPending = state.phase === 'choosing-portal-target';
  const spiritGuardianIsPending = state.phase === 'choosing-spirit-guardian-square';
  if ((!forceThrowIsPending && !forcePullIsPending && !arkaneArowIsPending && !armDaWizIsPending && !mindTricksIsPending && !preparationIsPending && !arcaneMissleIsPending && !chainLightningIsPending && !magicHandIsPending && !shizzleIsPending && !fireballIsPending && !portalIsPending && !spiritGuardianIsPending) || !force || force.casterId !== playerId) return fail(state, 'This card can no longer be cancelled.');
  if (force.undo) {
    const player = state.players[playerId];
    player.deck = force.undo.deck; player.hand = force.undo.hand; player.discard = force.undo.discard; player.spellEcho = force.undo.spellEcho;
    player.actionsRemaining = force.undo.actionsRemaining; player.perkUsed = force.undo.perkUsed; player.manaPoints = force.undo.manaPoints;
  }
  const cardName = spiritGuardianIsPending ? 'Spirit Guardian' : portalIsPending ? 'Portal' : fireballIsPending ? 'Fireball' : preparationIsPending ? 'Preparation' : arcaneMissleIsPending ? 'Arcane Missile' : chainLightningIsPending ? 'Chain Lightning' : magicHandIsPending ? 'Magic Hand' : shizzleIsPending ? 'Shizzle' : mindTricksIsPending ? 'Mind Tricks' : armDaWizIsPending ? 'Arm da Wiz' : arkaneArowIsPending ? 'ARKANE AROW' : forcePullIsPending ? 'Force Pull' : state.phase.startsWith('choosing-kyk') ? 'Kyk' : 'Force Throw';
  state.forceThrow = null; state.forcePull = null; state.arkaneArow = null; state.armDaWiz = null; state.preparation = null; state.arcaneMissle = null; state.chainLightning = null; state.magicHand = null; state.shizzle = null; state.mindTricks = null; (state as GameState & { mindBlast?: unknown }).mindBlast = null; state.phase = 'active';
  extended.fireball = null;
  extended.portal = null;
  extended.spiritGuardian = null;
  state.log.unshift(`${state.players[playerId].name} cancelled ${cardName} before resolving it.`);
  return ok(state);
}
function resolveMindTricksDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const mind = state.mindTricks;
  if (state.phase !== 'choosing-mind-tricks-discard' || !mind || mind.casterId !== playerId) return fail(state, 'Mind Tricks is not waiting for this discard.');
  if (mind.discarded >= mind.maxDiscards) return fail(state, 'Mind Tricks has reached its discard limit.');
  const player = state.players[playerId];
  const card = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'That card is not in the Hand.');
  if (card.revealedToOpponent || mind.revealedInstanceIds.includes(card.instanceId)) return fail(state, 'That card is already revealed to the opponent.');
  card.revealedToOpponent = true;
  const name = cardDefinition(card).name;
  mind.revealedInstanceIds.push(card.instanceId); mind.discarded += 1;
  state.log.unshift(`${player.name} revealed ${name} for Mind Tricks and kept it in Hand (${mind.discarded}/${mind.maxDiscards}).`);
  if (mind.discarded >= mind.maxDiscards) return finishMindTricksSelection(state, playerId);
  return ok(state);
}
function finishMindTricksSelection(state: GameState, playerId: PlayerId): CommandResult {
  const mind = state.mindTricks;
  if (state.phase !== 'choosing-mind-tricks-discard' || !mind || mind.casterId !== playerId) return fail(state, 'Mind Tricks selection is not active.');
  const enemy = state.players[mind.enemyId];
  if (mind.level >= 3) {
    enemy.deck.push({ instanceId: `${enemy.id}-status-${++instanceSequence}`, cardId: 'headache' });
    enemy.deck = shuffle(enemy.deck); enemy.knownTopCardId = null;
    state.log.unshift(`Mind Tricks shuffled a Headache into ${enemy.name}'s Deck.`);
  }
  mind.enemyDiscardsRemaining = Math.min(mind.discarded, enemy.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded).length);
  if (mind.enemyDiscardsRemaining === 0) { state.mindTricks = null; state.phase = 'active'; return ok(state); }
  state.phase = 'choosing-mind-tricks-enemy-discard';
  state.log.unshift(`${enemy.name} must discard ${mind.enemyDiscardsRemaining} card${mind.enemyDiscardsRemaining === 1 ? '' : 's'} due to Mind Tricks.`);
  return ok(state);
}
function resolveMindTricksEnemyDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const mind = state.mindTricks;
  if (state.phase !== 'choosing-mind-tricks-enemy-discard' || !mind || mind.enemyId !== playerId) return fail(state, 'Mind Tricks is not waiting for this enemy discard.');
  const enemy = state.players[playerId];
  const card = enemy.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'That card is not in the Hand.');
  if (cardDefinition(card).cannotBeDiscarded) return fail(state, `${cardDefinition(card).name} cannot be discarded.`);
  discardFromHand(enemy, cardInstanceId); mind.enemyDiscardsRemaining -= 1;
  if (mind.enemyDiscardsRemaining <= 0 || !enemy.hand.some((entry) => !cardDefinition(entry).cannotBeDiscarded)) { state.mindTricks = null; state.phase = 'active'; }
  return ok(state);
}

function resolvePreparationTeleport(state: GameState, playerId: PlayerId, objectId: string): CommandResult {
  const preparation = state.preparation;
  if (state.phase !== 'choosing-preparation-teleport' || !preparation || preparation.casterId !== playerId) return fail(state, 'Preparation is not waiting for an Object to swap.');
  const player = state.players[playerId];
  const object = state.objects.find((entry) => entry.id === objectId);
  if (!object || object.kind === 'wall-pillar') return fail(state, 'Preparation requires a movable Object or an unequipped Shield.');
  if (!hasLineOfSight(state, player.position, object.position)) return fail(state, 'Preparation can only swap with an Object currently visible from its caster.');
  const playerOrigin = { ...player.position };
  const objectOrigin = { ...object.position };
  recordQuestMovement(state, player.id, 1, true, objectOrigin);
  player.position = objectOrigin;
  object.position = playerOrigin;
  markCharacterMoved(player, 'own-card');
  state.objectPushAnimations.push({ id: `${state.turn}-preparation-swap-${object.id}-${state.objectPushAnimations.length}`, objectId: object.id, from: objectOrigin, to: playerOrigin, dx: 0, dy: 0, collided: false, teleport: true });
  state.preparation = null;
  state.phase = 'active';
  state.log.unshift(`Preparation (Consume): ${player.name} swapped places with ${object.name}, teleporting from ${cellLabel(playerOrigin)} to ${cellLabel(objectOrigin)}.`);
  return ok(state);
}

function resolveBlinkTeleport(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  if (state.phase !== 'choosing-blink-teleport' || state.pendingAttack?.defenderId !== playerId) return fail(state, 'Blink is not waiting for this teleport destination.');
  if (to.x < 1 || to.x > boardWidth(state) || to.y < 0 || to.y >= boardHeight(state)) return fail(state, 'That Square is outside the board.');
  if (Object.values(state.players).some((entry) => entry.position.x === to.x && entry.position.y === to.y) || state.objects.some((entry) => entry.position.x === to.x && entry.position.y === to.y)) return fail(state, 'Blink requires an empty Square.');
  const player = state.players[playerId];
  if (!hasLineOfSight(state, player.position, to)) return fail(state, 'Blink can only land on a Square currently visible from its caster.');
  recordQuestMovement(state, player.id, 1, true, to);
  player.position = { ...to };
  markCharacterMoved(player, 'own-card');
  state.pendingAttack = null;
  state.phase = 'active';
  state.log.unshift(`Blink teleported ${player.name} to ${cellLabel(to)}.`);
  return ok(state);
}

function resolveBlinkDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  if (state.phase !== 'choosing-blink-discard' || state.pendingAttack?.defenderId !== playerId) return fail(state, 'Blink is not waiting for this discard.');
  const player = state.players[playerId];
  const card = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'That Card is not in the Hand.');
  if (card.cardId === 'pinned' || cardDefinition(card).cannotBeDiscarded) return fail(state, `${cardDefinition(card).name} cannot be discarded by Blink.`);
  const name = cardDefinition(card).name;
  discardFromHand(player, cardInstanceId);
  state.pendingAttack = null;
  state.phase = 'active';
  state.log.unshift(`Blink found no Mana; ${player.name} chose to discard ${name}.`);
  return ok(state);
}

function resolvePreparationDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const preparation = state.preparation;
  if (state.phase !== 'choosing-preparation-discard' || !preparation || preparation.casterId !== playerId) return fail(state, 'Preparation is not waiting for a discard.');
  const player = state.players[playerId];
  const instance = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!instance) return fail(state, 'That Card is not in the Hand.');
  if (cardDefinition(instance).cannotBeDiscarded) return fail(state, `${cardDefinition(instance).name} cannot be discarded.`);
  const name = cardDefinition(instance).name;
  discardFromHand(player, cardInstanceId);
  if (preparation.consume) {
    state.phase = 'choosing-preparation-teleport';
    state.log.unshift(`${player.name} discarded ${name}; Preparation now requires a visible Object to swap with.`);
  } else {
    state.preparation = null;
    state.phase = 'active';
    gainManaFromResolvedSpell(state, player);
    state.log.unshift(`${player.name} discarded ${name} to finish Preparation.`);
  }
  return ok(state);
}

function resolveSnowballDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  if (state.phase !== 'choosing-snowball-discard' || state.activePlayerId !== playerId) return fail(state, 'Snowball Effect is not waiting for this discard.');
  const player = state.players[playerId];
  const instance = player.hand.find((card) => card.instanceId === cardInstanceId);
  if (!instance) return fail(state, 'That Card is not in the Hand.');
  const card = cardDefinition(instance);
  if (card.cannotBeDiscarded) return fail(state, `${card.name} cannot be discarded.`);
  discardFromHand(player, cardInstanceId);
  state.phase = 'active';
  state.log.unshift(`${player.name} discarded ${card.name} to finish Snowball Effect's Consume effect.`);
  return ok(state);
}

function resolveManaBlastDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'mana-blast-offer' || !pending || pending.cardId !== 'mana-blast' || pending.defenderId !== playerId) return fail(state, 'Mana Blast is not waiting for this discard.');
  const defender = state.players[playerId];
  const instance = defender.hand.find((card) => card.instanceId === cardInstanceId);
  if (!instance) return fail(state, 'That Card is not in the Hand.');
  const card = cardDefinition(instance);
  if (card.cannotBeDiscarded) return fail(state, `${card.name} cannot be discarded.`);
  discardFromHand(defender, cardInstanceId);
  state.pendingAttack = null; state.phase = 'active';
  state.log.unshift(`${defender.name} discarded ${card.name}; Mana Blast generated no Mana.`);
  return ok(state);
}

function resolveManaBlastRefuse(state: GameState, playerId: PlayerId): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'mana-blast-offer' || !pending || pending.cardId !== 'mana-blast' || pending.defenderId !== playerId) return fail(state, 'Mana Blast is not waiting for this decision.');
  const attacker = state.players[pending.attackerId];
  const amount = attacker.manaMode === 'consume' ? 3 : 1;
  const gained = grantMana(attacker, amount);
  state.pendingAttack = null; state.phase = 'active';
  state.log.unshift(`${state.players[playerId].name} refused to discard; ${attacker.name} gained ${gained} Mana from Mana Blast (${attacker.manaPoints}/3).`);
  return ok(state);
}

function resolveGrimoireDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'choosing-grimoire-discard' || !pending || pending.cardId !== 'grimoire-cleanse' || pending.defenderId !== playerId || !pending.grimoireDiscardsRemaining) return fail(state, 'Grimoire Cleanse is not waiting for this discard.');
  const defender = state.players[playerId];
  const instance = defender.hand.find((card) => card.instanceId === cardInstanceId);
  if (!instance) return fail(state, 'That Card is not in the Hand.');
  const card = cardDefinition(instance);
  if (card.cannotBeDiscarded) return fail(state, `${card.name} cannot be discarded.`);
  discardFromHand(defender, cardInstanceId);
  const logan = state.players[pending.attackerId];
  const consume = logan.manaMode === 'consume';
  if (consume) logan.movementRemaining += 1;
  pending.grimoireDiscardsRemaining -= 1;
  state.log.unshift(`${defender.name} discarded ${card.name}${consume ? `; Grimoire Cleanse (Consume) granted ${logan.name} +1 MOV (${logan.movementRemaining} available)` : ''}.`);
  const eligibleRemain = defender.hand.some((entry) => !cardDefinition(entry).cannotBeDiscarded);
  if (pending.grimoireDiscardsRemaining <= 0 || !eligibleRemain) { state.pendingAttack = null; state.phase = 'active'; }
  return ok(state);
}

export function arcaneMisslePath(state: GameState, caster: PlayerState, target: PlayerState, level: number): Cell[] | null {
  if (level >= 3) return [{ ...caster.position }, { ...target.position }];
  const range = effectiveAttackRange(state, caster);
  if (level === 1) return distance(caster.position, target.position) <= range && hasLineOfSight(state, caster.position, target.position) ? [{ ...caster.position }, { ...target.position }] : null;
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const blocked = new Set(state.objects.map((object) => key(object.position)));
  Object.values(state.players).filter((entry) => entry.id !== caster.id && entry.id !== target.id).forEach((entry) => blocked.add(key(entry.position)));
  const queue: Cell[][] = [[{ ...caster.position }]];
  const visited = new Set([key(caster.position)]);
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last.x === target.position.x && last.y === target.position.y) return path;
    if (path.length - 1 >= range) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const next = { x: last.x + dx, y: last.y + dy };
      const nextKey = key(next);
      if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state) || visited.has(nextKey) || (blocked.has(nextKey) && nextKey !== key(target.position))) continue;
      visited.add(nextKey); queue.push([...path, next]);
    }
  }
  return null;
}

export function mindBlastCanTarget(state: GameState, caster: PlayerState, target: PlayerState): boolean {
  return target.id !== caster.id && target.hp > 0 && distance(caster.position, target.position) <= effectiveAttackRange(state, caster) && hasLineOfSight(state, caster.position, target.position);
}

function finishMindBlast(state: GameState, caster: PlayerState, target: PlayerState, level: number) {
  state.forceDisarm = null;
  (state as GameState & { mindBlast?: { casterId: PlayerId; level: number } | null }).mindBlast = null;
  if (level >= 2) {
    const dealt = dealDamage(state, target, 1, false, caster.id, 'perk');
    state.log.unshift(`Mind Blast dealt ${dealt} Damage to ${target.name}.`);
  }
  if (level >= 3 && target.hp > 0) {
    for (let index = 0; index < 2; index += 1) {
      target.deck.push({ instanceId: `${target.id}-mind-blast-headache-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true, sourcePlayerId: caster.id });
    }
    target.knownTopCardId = 'headache';
    state.log.unshift(`Mind Blast added 2 Headache Cards on top of ${target.name}'s Deck.`);
  }
  if (state.phase !== 'finished') state.phase = 'active';
}

function resolveArcaneMissleTarget(state: GameState, playerId: PlayerId, targetId: PlayerId): CommandResult {
  const missile = state.arcaneMissle;
  if (state.phase !== 'choosing-arcane-missle-target' || !missile || missile.casterId !== playerId) return fail(state, 'Arcane Missile is not waiting for a target.');
  if (targetId === playerId) return fail(state, 'Arcane Missile must target an enemy.');
  const caster = state.players[playerId];
  const target = state.players[targetId];
  const mindBlast = (state as GameState & { mindBlast?: { casterId: PlayerId; level: number } | null }).mindBlast;
  if (mindBlast) {
    if (!target || !mindBlastCanTarget(state, caster, target)) return fail(state, `Mind Blast requires an enemy within Range ${effectiveAttackRange(state, caster)} and line of sight.`);
    state.arcaneMissle = null;
    const eligible = target.hand.some((card) => !cardDefinition(card).cannotBeDiscarded);
    if (eligible) {
      state.forceDisarm = { targetId, source: 'force-disarm', mindBlastLevel: mindBlast.level, mindBlastCasterId: playerId } as typeof state.forceDisarm & { mindBlastLevel: number; mindBlastCasterId: PlayerId };
      state.phase = 'choosing-force-disarm-discard';
      state.log.unshift(`Mind Blast forces ${target.name} to choose 1 Card to discard.`);
    } else {
      state.log.unshift(`${target.name} has no Card that Mind Blast can discard.`);
      finishMindBlast(state, caster, target, mindBlast.level);
    }
    return ok(state);
  }
  const path = target && arcaneMisslePath(state, caster, target, missile.level);
  if (!path) return fail(state, missile.level === 1 ? 'Target must be within Range 3 and direct line of sight.' : 'Target cannot be reached within Arcane Missile range.');
  const dealt = dealDamage(state, target, missile.damage, false, playerId, 'perk');
  state.spellProjectiles.push({ id: `${state.turn}-arcane-${++instanceSequence}`, casterId: playerId, targetId, from: { ...caster.position }, to: { ...target.position }, path, count: missile.level, damage: dealt });
  state.arcaneMissle = null;
  state.phase = 'active';
  gainManaFromResolvedSpell(state, caster);
  state.log.unshift(`${caster.name} cast Arcane Missile level ${missile.level} at ${target.name} for ${dealt} Damage${missile.damage === 3 ? ' with Consume' : ''}.`);
  return ok(state);
}

function resolveChainLightningTarget(state: GameState, playerId: PlayerId, targetId: PlayerId): CommandResult {
  const chain = state.chainLightning;
  if (state.phase !== 'choosing-chain-lightning-target' || !chain || chain.casterId !== playerId) return fail(state, 'Chain Lightning is not waiting for a target.');
  if (targetId === playerId) return fail(state, 'Chain Lightning must initially target an enemy.');
  const caster = state.players[playerId];
  const initial = state.players[targetId];
  const initialRange = effectiveAttackRange(state, caster);
  if (!initial || distance(caster.position, initial.position) > initialRange || !hasLineOfSight(state, caster.position, initial.position)) return fail(state, `Initial target must be an enemy within Range ${initialRange} and line of sight.`);

  type ChainTarget = { kind: 'player' | 'object'; id: string; position: Cell };
  let current: ChainTarget = { kind: 'player', id: initial.id, position: { ...initial.position } };
  const strike = (from: Cell, target: ChainTarget, hop: number) => {
    if (target.kind === 'player') dealDamage(state, state.players[target.id as PlayerId], 1, false, playerId, 'perk');
    else destroyObject(state, target.id, playerId, 'Chain Lightning');
    state.spellProjectiles.push({ id: `${state.turn}-chain-${++instanceSequence}`, casterId: playerId, targetId: target.id, from: { ...from }, to: { ...target.position }, path: [{ ...from }, { ...target.position }], count: 1, damage: target.kind === 'player' ? 1 : 0, style: 'lightning' });
    state.log.unshift(`Chain Lightning strike ${hop + 1} hit ${target.kind === 'player' ? state.players[target.id as PlayerId].name : 'an Object'}.`);
  };

  strike(caster.position, current, 0);
  for (let bounce = 0; bounce < chain.bounces; bounce++) {
    const playerTargets: ChainTarget[] = Object.values(state.players)
      .filter((player) => player.id !== caster.id && !(current.kind === 'player' && current.id === player.id) && distance(current.position, player.position) <= chain.bounceRange && hasLineOfSight(state, current.position, player.position))
      .map((player) => ({ kind: 'player', id: player.id, position: { ...player.position } }));
    const objectTargets: ChainTarget[] = state.objects
      .filter((object) => !(current.kind === 'object' && current.id === object.id) && distance(current.position, object.position) <= chain.bounceRange && hasLineOfSight(state, current.position, object.position))
      .map((object) => ({ kind: 'object', id: object.id, position: { ...object.position } }));
    const candidates = [...playerTargets, ...objectTargets];
    if (candidates.length === 0) { state.log.unshift(`Chain Lightning stopped after ${bounce} completed bounce${bounce === 1 ? '' : 's'}: no target was in range and line of sight.`); break; }
    const nearestDistance = Math.min(...candidates.map((candidate) => distance(current.position, candidate.position)));
    const nearest = candidates.filter((candidate) => distance(current.position, candidate.position) === nearestDistance);
    const next = nearest[Math.floor(Math.random() * nearest.length)];
    const from = { ...current.position };
    current = next;
    strike(from, current, bounce + 1);
  }
  state.chainLightning = null;
  state.phase = 'active';
  gainManaFromResolvedSpell(state, caster);
  return ok(state);
}

function selectForcePullTarget(state: GameState, playerId: PlayerId, targetKind: 'player' | 'object', targetId: string): CommandResult {
  const pull = state.forcePull;
  if (state.phase !== 'choosing-force-pull-target' || !pull || pull.casterId !== playerId) return fail(state, 'Force Pull is not waiting for a target.');
  if (targetKind === 'player' && targetId === playerId) return fail(state, 'Force Pull cannot target its caster.');
  if (targetKind === 'object' && state.objects.some((object) => object.id === targetId && isFixedWallObject(object))) return fail(state, 'Fixed Wall Objects cannot be pulled.');
  const target = getPushEntity(state, targetKind, targetId);
  if (!target) return fail(state, 'That Force Pull target does not exist.');
  const caster = state.players[playerId];
  if (distance(caster.position, target.position) > pull.targetRange) return fail(state, 'That target is outside Force Pull range.');
  if (targetKind === 'player' && !hasLineOfSight(state, caster.position, target.position)) return fail(state, 'A Wall Object blocks line of sight to that Player.');
  const path = shortestPullPath(state, target, caster.position);
  const pulledObject = targetKind === 'object' ? state.objects.find((object) => object.id === targetId) : null;
  const steps = Math.min(pulledObject?.heavy ? 1 : pull.distance, path.length);
  const destination = steps > 0 ? path[steps - 1] : target.position;
  let previous = target.position;
  for (const next of path.slice(0, steps)) { applyElevationDropDamage(state, target, previous, next); previous = next; }
  if (target.kind === 'player') {
    const moved = state.players[target.id as PlayerId]; recordQuestMovement(state, moved.id, steps, false, destination); moved.position = { ...destination };
    if (steps > 0) markCharacterMoved(moved, 'enemy-ability');
  } else {
    state.objects.find((object) => object.id === target.id)!.position = { ...destination };
    recordObjectEffect(state, target.id, playerId, 'Force Pull');
  }
  if (pull.level >= 3 && target.kind === 'player') applyPinned(state.players[target.id as PlayerId], 1);
  state.log.unshift(`Force Pull moved ${entityName(state, target)} ${steps} square${steps === 1 ? '' : 's'} toward ${caster.name}${pull.level >= 3 && target.kind === 'player' ? ' and applied Pinned' : ''}.`);
  state.forcePull = null; state.phase = 'active';
  return ok(state);
}
function shortestPullPath(state: GameState, target: PushEntity, casterCell: Cell): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const origin = { ...target.position };
  const lineX = casterCell.x - origin.x;
  const lineY = casterCell.y - origin.y;
  const lineDeviation = (cell: Cell) => Math.abs(lineX * (cell.y - origin.y) - lineY * (cell.x - origin.x));
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: origin, path: [] }];
  const visited = new Set([key(origin)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (distance(current.cell, casterCell) === 1) return current.path;
    const neighbors: { cell: Cell; diagonal: boolean }[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      neighbors.push({ cell: { x: current.cell.x + dx, y: current.cell.y + dy }, diagonal: dx !== 0 && dy !== 0 });
    }
    neighbors.sort((a, b) => distance(a.cell, casterCell) - distance(b.cell, casterCell)
      || lineDeviation(a.cell) - lineDeviation(b.cell)
      || Number(a.diagonal) - Number(b.diagonal)
      || a.cell.x - b.cell.x
      || a.cell.y - b.cell.y);
    for (const { cell: next } of neighbors) {
      if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state) || visited.has(key(next))) continue;
      if (next.x === casterCell.x && next.y === casterCell.y) continue;
      if (target.kind === 'player' && isForbiddenSlideAscent(state, current.cell, next)) continue;
      if (entityAt(state, next, target)) continue;
      visited.add(key(next)); queue.push({ cell: next, path: [...current.path, next] });
    }
  }
  return [];
}

export function arkaneArowPath(state: GameState, caster: PlayerState, target: Cell, range: number): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const deltaX = target.x - caster.position.x; const deltaY = target.y - caster.position.y;
  const directSteps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const isStraightLine = deltaX === 0 || deltaY === 0 || Math.abs(deltaX) === Math.abs(deltaY);
  if (isStraightLine && directSteps > 0 && directSteps <= range) {
    const stepX = Math.sign(deltaX); const stepY = Math.sign(deltaY);
    const directPath = Array.from({ length: directSteps }, (_, index) => ({ x: caster.position.x + stepX * (index + 1), y: caster.position.y + stepY * (index + 1) }));
    return directPath;
  }
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: { ...caster.position }, path: [] }];
  const visited = new Set([key(caster.position)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cell.x === target.x && current.cell.y === target.y) return current.path;
    if (current.path.length >= range) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state) || visited.has(key(next))) continue;
      const isTarget = next.x === target.x && next.y === target.y;
      const occupied = Object.values(state.players).some((entry) => entry.id !== caster.id && entry.position.x === next.x && entry.position.y === next.y)
        || state.objects.some((entry) => entry.position.x === next.x && entry.position.y === next.y);
      if (occupied && !isTarget) continue;
      visited.add(key(next)); queue.push({ cell: next, path: [...current.path, next] });
    }
  }
  return [];
}

function armDaWizPath(state: GameState, shield: BoardObject, orkkCell: Cell, range: number): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  type RecallRoute = { cell: Cell; path: Cell[]; enemiesCrossed: number; turns: number; lineDeviation: number };
  const enemyAt = (cell: Cell) => Object.values(state.players).some((entry) => entry.id !== shield.ownerId && entry.position.x === cell.x && entry.position.y === cell.y);
  const lineX = orkkCell.x - shield.position.x;
  const lineY = orkkCell.y - shield.position.y;
  const deviationFromDirectLine = (cell: Cell) => Math.abs(lineX * (cell.y - shield.position.y) - lineY * (cell.x - shield.position.x));
  const isBetterRoute = (candidate: RecallRoute, existing: RecallRoute) => candidate.enemiesCrossed > existing.enemiesCrossed
    || (candidate.enemiesCrossed === existing.enemiesCrossed && candidate.turns < existing.turns)
    || (candidate.enemiesCrossed === existing.enemiesCrossed && candidate.turns === existing.turns && candidate.lineDeviation < existing.lineDeviation);
  let frontier: RecallRoute[] = [{ cell: { ...shield.position }, path: [], enemiesCrossed: 0, turns: 0, lineDeviation: 0 }];
  let shortestDestination: RecallRoute | null = null;
  let shortestDistance = 0;
  // Keep a separate best route to each Square at every exact depth. A global
  // visited set would erase the deliberate one-step detours that Recall is
  // allowed to take through an enemy. Once the first destination route is
  // found, inspect the complete next layer and prefer it only when it crosses
  // more enemies than the best shortest route.
  for (let step = 1; step <= range + 1 && frontier.length > 0; step++) {
    const nextFrontier = new Map<string, RecallRoute>();
    for (const current of frontier) {
      const neighbors: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        neighbors.push({ x: current.cell.x + dx, y: current.cell.y + dy });
      }
      neighbors.sort((a, b) => distance(a, orkkCell) - distance(b, orkkCell) || a.x - b.x || a.y - b.y);
      for (const next of neighbors) {
        if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state)) continue;
        const isOrkk = next.x === orkkCell.x && next.y === orkkCell.y;
        const blockedByObject = state.objects.some((entry) => entry.id !== shield.id && entry.position.x === next.x && entry.position.y === next.y);
        if (blockedByObject && !isOrkk) continue;
        if ((next.x === shield.position.x && next.y === shield.position.y) || current.path.some((cell) => cell.x === next.x && cell.y === next.y)) continue;
        const previousCell = current.path.length > 1 ? current.path[current.path.length - 2] : shield.position;
        const previousDx = Math.sign(current.cell.x - previousCell.x);
        const previousDy = Math.sign(current.cell.y - previousCell.y);
        const nextDx = Math.sign(next.x - current.cell.x);
        const nextDy = Math.sign(next.y - current.cell.y);
        const nextKey = `${key(next)}:${nextDx},${nextDy}`;
        const changedDirection = current.path.length > 0 && (previousDx !== nextDx || previousDy !== nextDy);
        const candidate: RecallRoute = {
          cell: next,
          path: [...current.path, next],
          enemiesCrossed: current.enemiesCrossed + Number(enemyAt(next)),
          turns: current.turns + Number(changedDirection),
          lineDeviation: current.lineDeviation + deviationFromDirectLine(next),
        };
        const existing = nextFrontier.get(nextKey);
        if (!existing || isBetterRoute(candidate, existing)) nextFrontier.set(nextKey, candidate);
      }
    }
    const destination = [...nextFrontier.values()]
      .filter((route) => route.cell.x === orkkCell.x && route.cell.y === orkkCell.y)
      .reduce<RecallRoute | null>((best, route) => !best || isBetterRoute(route, best) ? route : best, null);
    if (destination && !shortestDestination) {
      if (step > range && destination.enemiesCrossed === 0) return [];
      shortestDestination = destination;
      shortestDistance = step;
    } else if (destination && shortestDestination && step === shortestDistance + 1) {
      if (destination.enemiesCrossed > shortestDestination.enemiesCrossed) return destination.path;
    }
    if (shortestDestination && step >= shortestDistance + 1) return shortestDestination.path;
    frontier = [...nextFrontier.values()];
  }
  return shortestDestination?.path ?? [];
}

function nearestRecallableOrkkShield(state: GameState, ownerId: PlayerId, orkkCell: Cell, range: number): { shield: BoardObject; path: Cell[] } | null {
  return state.objects
    .filter((entry) => entry.kind === 'orkk-shield' && entry.ownerId === ownerId)
    .map((shield) => ({ shield, path: armDaWizPath(state, shield, orkkCell, range) }))
    .filter((entry) => entry.path.length > 0)
    .sort((a, b) => distance(a.shield.position, orkkCell) - distance(b.shield.position, orkkCell)
      || a.path.length - b.path.length
      || a.shield.id.localeCompare(b.shield.id))[0] ?? null;
}

function pullEnemiesAlongShieldRecall(state: GameState, shield: BoardObject, orkkId: PlayerId, path: Cell[], sourceName: string, triggerAnimationId?: string): void {
  const orkk = state.players[orkkId];
  const passes: { enemyId: PlayerId; pathIndex: number }[] = [];
  for (const [pathIndex, cell] of path.entries()) {
    const enemy = Object.values(state.players).find((entry) => entry.id !== orkkId && entry.position.x === cell.x && entry.position.y === cell.y);
    if (!enemy || passes.some((entry) => entry.enemyId === enemy.id)) continue;
    passes.push({ enemyId: enemy.id, pathIndex });
  }
  for (const pass of passes.sort((a, b) => b.pathIndex - a.pathIndex)) {
    const enemy = state.players[pass.enemyId];
    const destination = {
      x: enemy.position.x + Math.sign(orkk.position.x - enemy.position.x),
      y: enemy.position.y + Math.sign(orkk.position.y - enemy.position.y),
    };
    const blocked = (destination.x === orkk.position.x && destination.y === orkk.position.y)
      || Object.values(state.players).some((entry) => entry.id !== enemy.id && entry.position.x === destination.x && entry.position.y === destination.y)
      || state.objects.some((entry) => entry.id !== shield.id && entry.position.x === destination.x && entry.position.y === destination.y);
    if (blocked) {
      state.log.unshift(`${sourceName} could not pull ${enemy.name} closer because the next Square toward ${orkk.name} was blocked.`);
      continue;
    }
    const from = { ...enemy.position };
    recordQuestMovement(state, enemy.id, 1, false, destination);
    enemy.position = { ...destination };
    markCharacterMoved(enemy, 'enemy-ability');
    if (triggerAnimationId) enemy.visualMovement = { from, path: [{ ...destination }], triggerAnimationId, triggerRouteProgress: (pass.pathIndex + 1) / path.length };
    state.log.unshift(`${sourceName} pulled ${enemy.name} 1 Square toward ${orkk.name}, to ${cellLabel(destination)}.`);
  }
}

function resolveArmDaWizChoice(state: GameState, playerId: PlayerId, choice: 'recall' | 'create'): CommandResult {
  const arm = state.armDaWiz;
  if (state.phase !== 'choosing-arm-da-wiz-choice' || !arm || arm.casterId !== playerId) return fail(state, 'Arm da Wiz is not waiting for this choice.');
  if (choice === 'create') {
    if (!arm.canCreate) return fail(state, 'A new Shield cannot be created right now.');
    state.players[playerId].shieldEquipped = true;
    if (arm.level >= 3) {
      state.players[playerId].rageStacks += 1;
      state.log.unshift(`Arm da Wiz generated 1 Rage Stack (${state.players[playerId].rageStacks} total).`);
    }
    state.armDaWiz = null; state.phase = 'active';
    state.log.unshift(`${state.players[playerId].name} created and instantly equipped a new Iron Shield. Existing Shields remain on the Board.`);
    return ok(state);
  }
  if (!arm.canRecall) return fail(state, 'There is no Shield on the Board with a valid recall path.');
  state.phase = 'choosing-arm-da-wiz-target';
  state.log.unshift('Arm da Wiz: target a Shield anywhere on the Board to recall.');
  return ok(state);
}

function resolveArmDaWizTarget(state: GameState, playerId: PlayerId, objectId: string): CommandResult {
  const arm = state.armDaWiz;
  if (state.phase !== 'choosing-arm-da-wiz-target' || !arm || arm.casterId !== playerId) return fail(state, 'Arm da Wiz is not waiting for a Shield target.');
  const shield = state.objects.find((entry) => entry.id === objectId && entry.kind === 'orkk-shield' && entry.ownerId === playerId);
  if (!shield) return fail(state, 'That is not one of Da Orkk’s Shields.');
  const orkk = state.players[playerId];
  const path = armDaWizPath(state, shield, orkk.position, arm.range);
  if (path.length === 0) return fail(state, 'That Shield has no valid recall path to Da Orkk.');
  const recallAnimationId = `${state.turn}-arm-da-wiz-${shield.id}-${state.objectPushAnimations.length}`;
  // Arm da Wiz is resolved entirely from board occupancy: an enemy is affected
  // when any Square in the Shield's calculated recall path contains that enemy.
  // No mesh, animation, timing, or physics collision is consulted.
  const shieldPasses: { enemyId: PlayerId; pathIndex: number }[] = [];
  for (const [pathIndex, cell] of path.entries()) {
    const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === cell.x && entry.position.y === cell.y);
    if (!enemy || shieldPasses.some((entry) => entry.enemyId === enemy.id)) continue;
    shieldPasses.push({ enemyId: enemy.id, pathIndex });
    if (arm.level >= 2) {
      const damage = 1 + meleeHighGroundDamageBonus(state, orkk, enemy.position, shield.position);
      const damageAnimationStart = state.objectPushAnimations.length;
      dealDamage(state, enemy, damage, true, playerId, 'perk');
      for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
        if (!event.damage?.collision) continue;
        event.damage.triggerAnimationId = recallAnimationId;
        event.damage.triggerRouteProgress = (pathIndex + 1) / path.length;
      }
      state.log.unshift(`Arm da Wiz's Shield passed through ${enemy.name}'s occupied Square and dealt ${damage} damage${damage > 1 ? ' including +1 from High Ground' : ''}.`);
    }
  }
  pullEnemiesAlongShieldRecall(state, shield, playerId, path, 'Arm da Wiz');
  state.objectPushAnimations.push({
    id: recallAnimationId,
    objectId: shield.id,
    from: { ...shield.position },
    to: { ...orkk.position },
    dx: Math.sign(orkk.position.x - shield.position.x),
    dy: Math.sign(orkk.position.y - shield.position.y),
    collided: false,
    path: path.map((cell) => ({ ...cell })),
    removeOnComplete: true,
    equipPlayerId: playerId,
  });
  state.objects = state.objects.filter((entry) => entry.id !== shield.id);
  orkk.shieldEquipped = true;
  state.log.unshift(`${orkk.name} recalled and equipped his Shield.`);
  if (arm.level >= 3) {
    const rageGained = 1 + shieldPasses.length * 2;
    orkk.rageStacks += rageGained;
    state.log.unshift(`Arm da Wiz generated ${rageGained} Rage Stack${rageGained === 1 ? '' : 's'}: 1 base and ${shieldPasses.length * 2} from crossed enemies (${orkk.rageStacks} total).`);
  }
  state.armDaWiz = null; state.phase = 'active';
  return ok(state);
}

function resolveArkaneArowTarget(state: GameState, playerId: PlayerId, target: Cell): CommandResult {
  const throwState = state.arkaneArow;
  if (state.phase !== 'choosing-arkane-arow-target' || !throwState || throwState.casterId !== playerId) return fail(state, 'ARKANE AROW is not waiting for a target Square.');
  const caster = state.players[playerId];
  if (!caster.shieldEquipped) return fail(state, 'Da Orkk no longer has his Shield equipped.');
  const path = arkaneArowPath(state, caster, target, throwState.range);
  if (path.length === 0) return fail(state, `That Square cannot be reached within Range ${throwState.range}.`);
  const collisionIndex = path.findIndex((cell) => Object.values(state.players).some((entry) => entry.id !== playerId && entry.position.x === cell.x && entry.position.y === cell.y)
    || state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y));
  const collisionCell = collisionIndex >= 0 ? path[collisionIndex] : target;
  const travelledPath = collisionIndex >= 0 ? path.slice(0, collisionIndex + 1) : path;
  const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === collisionCell.x && entry.position.y === collisionCell.y);
  const obstacle = state.objects.find((entry) => entry.position.x === collisionCell.x && entry.position.y === collisionCell.y);
  const collision = Boolean(enemy || obstacle);
  const shieldId = `${playerId}-iron-shield-${state.turn}-${++instanceSequence}`;
  const shieldAnimationId = `${state.turn}-arkane-arow-${shieldId}`;
  const damageAnimationStart = state.objectPushAnimations.length;
  const previous = travelledPath.length > 1 ? travelledPath[travelledPath.length - 2] : caster.position;
  const isClear = (cell: Cell) => !Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)
    && !state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
  let shieldLanding = { ...target };
  if (collision) {
    if (isClear(previous)) shieldLanding = { ...previous };
    else {
      const approaches: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const candidate = { x: collisionCell.x + dx, y: collisionCell.y + dy };
        if (candidate.x < 1 || candidate.x > boardWidth(state) || candidate.y < 0 || candidate.y >= boardHeight(state) || !isClear(candidate)) continue;
        if (arkaneArowPath(state, caster, candidate, throwState.range).length > 0) approaches.push(candidate);
      }
      approaches.sort((a, b) => distance(a, previous) - distance(b, previous));
      if (!approaches[0]) return fail(state, 'The Shield has no clear approach Square on which it can stop after this collision.');
      shieldLanding = approaches[0];
    }
  }
  let pushed = false;
  if (enemy) {
    const baseCollisionDamage = throwState.level >= 2 ? 2 : 1;
    const collisionDamage = baseCollisionDamage + meleeHighGroundDamageBonus(state, caster, enemy.position);
    dealDamage(state, enemy, collisionDamage, true, playerId, 'perk');
    state.log.unshift(`ARKANE AROW collided with ${enemy.name} and dealt ${collisionDamage} damage.`);
    if (throwState.level >= 3) {
      const dx = Math.sign(collisionCell.x - previous.x); const dy = Math.sign(collisionCell.y - previous.y);
      const destination = { x: enemy.position.x + dx, y: enemy.position.y + dy };
      const inBounds = destination.x >= 1 && destination.x <= boardWidth(state) && destination.y >= 0 && destination.y < boardHeight(state);
      const blocked = !inBounds || Object.values(state.players).some((entry) => entry.id !== enemy.id && entry.position.x === destination.x && entry.position.y === destination.y)
        || state.objects.some((entry) => entry.position.x === destination.x && entry.position.y === destination.y);
      if (!blocked) {
        const pushFrom = { ...enemy.position };
        recordQuestMovement(state, enemy.id, 1, false, destination); enemy.position = destination; markCharacterMoved(enemy, 'enemy-ability');
        enemy.visualMovement = { from: pushFrom, path: [{ ...destination }], triggerAnimationId: shieldAnimationId };
        pushed = true;
        state.log.unshift(`ARKANE AROW pushed ${enemy.name} to ${cellLabel(destination)}.`);
      } else {
        dealDamage(state, enemy, 1, true, playerId, 'perk');
        state.log.unshift(`${enemy.name} could not be pushed and received 1 additional damage.`);
      }
    }
  } else if (obstacle) state.log.unshift(`ARKANE AROW collided with ${obstacle.name}.`);
  for (const event of state.objectPushAnimations.slice(damageAnimationStart)) {
    if (event.damage?.collision) event.damage.triggerAnimationId = shieldAnimationId;
  }
  caster.shieldEquipped = false;
  state.objects.push({ id: shieldId, name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: playerId, hp: 999, maxHp: 999, position: { ...shieldLanding } });
  const animationPath = collision ? travelledPath.slice(0, -1) : travelledPath;
  state.objectPushAnimations.push({
    id: shieldAnimationId,
    objectId: shieldId,
    from: { ...caster.position },
    to: { ...shieldLanding },
    dx: Math.sign(collisionCell.x - previous.x),
    dy: Math.sign(collisionCell.y - previous.y),
    collided: collision,
    path: animationPath.map((cell) => ({ ...cell })),
    collisionAt: collision ? { ...collisionCell } : undefined,
    collisionTargetKind: enemy ? 'player' : obstacle ? 'object' : undefined,
    collisionTargetId: enemy?.id ?? obstacle?.id,
  });
  state.arkaneArow = null; state.phase = 'active';
  state.log.unshift(collision ? `Da Orkk's Shield Wall stopped at ${cellLabel(shieldLanding)}, adjacent to the collision at ${cellLabel(collisionCell)}${enemy && pushed ? ', after pushing the enemy away' : ''}.` : `Da Orkk's Shield Wall now stands at ${cellLabel(shieldLanding)}.`);
  return ok(state);
}

export function kykDirectionAllowed(orkk: Cell, object: Cell, to: Cell): boolean {
  const rawX = to.x - object.x; const rawY = to.y - object.y;
  if (!rawX && !rawY) return false;
  const dirX = Math.sign(rawX); const dirY = Math.sign(rawY);
  const linear = rawX === 0 || rawY === 0 || Math.abs(rawX) === Math.abs(rawY);
  if (!linear) return false;
  const relativeX = object.x - orkk.x; const relativeY = object.y - orkk.y;
  if (relativeX !== 0 && relativeY !== 0) return dirX === relativeX && dirY === relativeY;
  if (dirX !== 0 && dirY !== 0) return false;
  return !(dirX === -relativeX && dirY === -relativeY);
}

function selectKykTarget(state: GameState, playerId: PlayerId, objectId: string): CommandResult {
  const kyk = state.forceThrow;
  if (state.phase !== 'choosing-kyk-target' || !kyk || kyk.casterId !== playerId) return fail(state, 'Kyk is not waiting for a target.');
  const object = state.objects.find((entry) => entry.id === objectId);
  const enemy = state.players[objectId as PlayerId];
  if (object?.kind === 'wall-pillar') return fail(state, 'Wall Objects cannot be moved.');
  const target = object ?? (enemy?.id !== playerId ? enemy : null);
  if (!target || distance(target.position, state.players[playerId].position) !== 1) return fail(state, 'Kyk requires an Object or enemy adjacent to Da Orkk.');
  kyk.targetKind = object ? 'object' : 'player'; kyk.targetId = objectId; state.phase = 'choosing-kyk-direction';
  state.log.unshift('Kyk: select a highlighted legal push direction.');
  return ok(state);
}

function resolveKykDirection(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const kyk = state.forceThrow;
  if (state.phase !== 'choosing-kyk-direction' || !kyk || kyk.casterId !== playerId || !kyk.targetId) return fail(state, 'Kyk is not waiting for a push direction.');
  const target = getPushEntity(state, kyk.targetKind!, kyk.targetId);
  if (!target) return fail(state, 'The selected target no longer exists.');
  const orkk = state.players[playerId];
  if (!kykDirectionAllowed(orkk.position, target.position, to)) return fail(state, 'That direction is not legal for this target’s position relative to Da Orkk.');
  const dx = Math.sign(to.x - target.position.x); const dy = Math.sign(to.y - target.position.y);
  if (target.kind === 'player') {
    const collisionBonus = meleeHighGroundDamageBonus(state, orkk, target.position);
    pushEntity(state, target, dx, dy, kyk.distance, kyk.level, playerId, true, 'perk', true, collisionBonus);
    state.forceThrow = null; state.phase = 'active';
    state.log.unshift(`Kyk pushed ${entityName(state, target)} up to ${kyk.distance} Squares.`);
    return ok(state);
  }
  const object = state.objects.find((entry) => entry.id === target.id)!;
  const start = { ...object.position }; const traveled: Cell[] = [];
  let current = { ...start }; let hitEnemy: PlayerState | null = null; let collided = false;
  for (let step = 0; step < kyk.distance; step++) {
    const next = { x: current.x + dx, y: current.y + dy };
    if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state)) { collided = true; break; }
    const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === next.x && entry.position.y === next.y);
    const blockingObject = state.objects.some((entry) => entry.id !== object.id && entry.position.x === next.x && entry.position.y === next.y);
    const blockedByOrkk = orkk.position.x === next.x && orkk.position.y === next.y;
    if (enemy || blockingObject || blockedByOrkk) { hitEnemy = enemy ?? null; collided = true; break; }
    current = next; traveled.push({ ...current });
  }
  object.position = { ...current };
  if (hitEnemy) {
    const baseDamage = kyk.level >= 3 ? 3 : 1;
    const damage = baseDamage + meleeHighGroundDamageBonus(state, orkk, hitEnemy.position);
    dealDamage(state, hitEnemy, damage, true, playerId, 'perk');
    state.log.unshift(`Kyk's Object collided with ${hitEnemy.name} and dealt ${damage} damage.`);
  }
  const destroysObject = kyk.level >= 3;
  state.objectPushAnimations.push({ id: `${state.turn}-kyk-${state.objectPushAnimations.length}`, objectId: object.id, from: start, to: { ...current }, dx, dy, collided, path: traveled, removeOnComplete: destroysObject });
  if (destroysObject) destroyObject(state, object.id, playerId, 'Kyk');
  else recordObjectEffect(state, object.id, playerId, 'Kyk');
  state.forceThrow = null; state.phase = 'active';
  state.log.unshift(`Kyk pushed ${object.name} up to ${kyk.distance} Squares.`);
  return ok(state);
}
function resolveShizzleDestination(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const shizzle = state.shizzle;
  if (state.phase !== 'choosing-shizzle-destination' || !shizzle || shizzle.casterId !== playerId) return fail(state, 'Shizzle is not waiting for a destination.');
  if (to.x < 1 || to.x > boardWidth(state) || to.y < 0 || to.y >= boardHeight(state)) return fail(state, 'That Square is outside the board.');
  const player = state.players[playerId];
  const dxTotal = to.x - player.position.x; const dyTotal = to.y - player.position.y;
  const steps = Math.max(Math.abs(dxTotal), Math.abs(dyTotal));
  const linear = dxTotal === 0 || dyTotal === 0 || Math.abs(dxTotal) === Math.abs(dyTotal);
  if (steps < 1 || steps > shizzle.stepsRemaining || !linear) return fail(state, `Choose a Square in a direct line up to ${shizzle.stepsRemaining} Squares away.`);
  const dx = Math.sign(dxTotal); const dy = Math.sign(dyTotal);
  const path = Array.from({ length: steps }, (_, index) => ({ x: player.position.x + dx * (index + 1), y: player.position.y + dy * (index + 1) }));
  const automaticSlideIndex = path.findIndex((cell, index) => isHighGroundSlideEntry(state, index === 0 ? player.position : path[index - 1], cell));
  if (automaticSlideIndex >= 0 && automaticSlideIndex < path.length - 1) return fail(state, 'Movement must stop when entering a Slide Square from High Ground so its automatic movement can resolve.');
  if (path.some((cell, index) => isForbiddenSlideAscent(state, index === 0 ? player.position : path[index - 1], cell))) return fail(state, 'Characters cannot move directly from a Slide or Trench Square onto High Ground.');
  if (path.some((cell, index) => isHighGroundSlideEntry(state, index === 0 ? player.position : path[index - 1], cell) && Object.values(state.players).some((candidate) => candidate.id !== player.id && candidate.hp > 0 && candidate.position.x === cell.x && candidate.position.y === cell.y))) return fail(state, 'An occupied Slide Square cannot be entered from adjacent High Ground.');
  if (path.some((cell, index) => diagonalMovementBlockedByObject(state, index === 0 ? player.position : path[index - 1], cell))) return fail(state, 'An adjacent Object blocks diagonal movement along that route.');
  if (path.some((cell) => state.objects.some((object) => isWallObject(object) && object.position.x === cell.x && object.position.y === cell.y))) return fail(state, 'Shizzle cannot pass through Wall Objects.');
  if (state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Shizzle must finish on an empty Square.');
  if (Object.values(state.players).some((entry) => entry.id !== playerId && entry.position.x === to.x && entry.position.y === to.y)) return fail(state, 'Shizzle must finish on an empty Square.');
  const passedEnemies = shizzle.level >= 2 ? Object.values(state.players).filter((entry) => entry.id !== playerId && path.slice(0, -1).some((cell) => cell.x === entry.position.x && cell.y === entry.position.y)) : [];
  recordQuestMovement(state, player.id, steps, false, to);
  const enteredFrom = path.length > 1 ? path[path.length - 2] : { ...player.position };
  player.visualMovement = { from: { ...player.position }, path: path.map((cell) => ({ ...cell })) };
  player.position = { ...to };
  applySlideSquare(state, player, enteredFrom);
  markCharacterMoved(player, 'own-card');
  for (const enemy of passedEnemies) dealDamage(state, enemy, 1, true, playerId, 'perk');
  state.shizzle = null; state.phase = 'active';
  gainManaFromResolvedSpell(state, player);
  state.log.unshift(`Shizzle moved ${player.name} ${steps} Squares to ${cellLabel(to)}${passedEnemies.length ? ` and dealt 1 Damage to ${passedEnemies.map((enemy) => enemy.name).join(', ')}` : ''}.`);
  return ok(state);
}

function moveShizzle(state: GameState, player: PlayerState, to: Cell): CommandResult {
  const shizzle = state.shizzle;
  if (state.phase !== 'shizzle-move' || !shizzle || shizzle.casterId !== player.id) return fail(state, 'Shizzle Consume movement is not active.');
  if (distance(player.position, to) !== 1) return fail(state, 'Shizzle Consume moves exactly one Square at a time.');
  if (isForbiddenSlideAscent(state, player.position, to)) return fail(state, 'Characters cannot move directly from a Slide or Trench Square onto High Ground.');
  if (diagonalMovementBlockedByObject(state, player.position, to)) return fail(state, 'An adjacent Object blocks that diagonal movement.');
  if (to.x < 1 || to.x > boardWidth(state) || to.y < 0 || to.y >= boardHeight(state)) return fail(state, 'That Square is outside the board.');
  const targetObject = state.objects.find((object) => object.position.x === to.x && object.position.y === to.y);
  if (targetObject && isWallObject(targetObject)) return fail(state, 'Shizzle cannot move through a Wall Object.');
  if (targetObject && shizzle.stepsRemaining <= 1) return fail(state, 'Shizzle must finish on an empty Square.');
  const targetEnemy = Object.values(state.players).find((entry) => entry.id !== player.id && entry.position.x === to.x && entry.position.y === to.y);
  if (targetEnemy && isHighGroundSlideEntry(state, player.position, to)) return fail(state, 'An occupied Slide Square cannot be entered from adjacent High Ground.');
  if (targetEnemy && shizzle.stepsRemaining <= 1) return fail(state, 'Shizzle must finish on an empty Square.');
  const passedEnemy = shizzle.enemyUnderfoot ? state.players[shizzle.enemyUnderfoot] : null;
  const enteredFrom = { ...player.position };
  recordQuestMovement(state, player.id, 1, false, to);
  player.visualMovement = { from: enteredFrom, path: [{ ...to }] };
  player.position = { ...to };
  applySlideSquare(state, player, enteredFrom);
  markCharacterMoved(player, 'own-card');
  shizzle.started = true; shizzle.stepsRemaining -= 1; shizzle.enemyUnderfoot = targetEnemy?.id ?? null;
  if (passedEnemy && shizzle.level >= 2) dealDamage(state, passedEnemy, 1, true, player.id, 'perk');
  state.log.unshift(`${player.name} Shizzled to ${cellLabel(to)} (${shizzle.stepsRemaining} steps remain)${passedEnemy && shizzle.level >= 2 ? `, dealing 1 Damage to ${passedEnemy.name}` : ''}.`);
  if (shizzle.stepsRemaining === 0) {
    state.shizzle = null; state.phase = 'active'; gainManaFromResolvedSpell(state, player);
    state.log.unshift('Shizzle Consume movement completed.');
  }
  return ok(state);
}
function selectMagicHandTarget(state: GameState, playerId: PlayerId, targetKind: 'player' | 'object', targetId: string): CommandResult {
  const hand = state.magicHand;
  if (state.phase !== 'choosing-magic-hand-target' || !hand || hand.casterId !== playerId) return fail(state, 'Magic Hand is not waiting for a target.');
  if (targetKind === 'player' && hand.level < 3) return fail(state, 'Magic Hand can push enemies only at Level 3.');
  if (targetKind === 'player' && targetId === playerId) return fail(state, 'Magic Hand cannot target its caster.');
  if (targetKind === 'object' && state.objects.some((object) => object.id === targetId && isFixedWallObject(object))) return fail(state, 'Fixed Wall Objects cannot be pushed by Magic Hand.');
  const target = getPushEntity(state, targetKind, targetId);
  if (!target) return fail(state, 'That Magic Hand target does not exist.');
  const caster = state.players[playerId];
  if (hand.level < 2 && distance(caster.position, target.position) > 5) return fail(state, 'Magic Hand Level 1 has Range 5.');
  hand.targetKind = targetKind; hand.targetId = targetId;
  state.phase = 'choosing-magic-hand-direction';
  state.log.unshift('Magic Hand: select a linear outward push direction.');
  return ok(state);
}

function resolveMagicHandDirection(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const hand = state.magicHand;
  if (state.phase !== 'choosing-magic-hand-direction' || !hand || hand.casterId !== playerId || !hand.targetKind || !hand.targetId) return fail(state, 'Magic Hand is not waiting for a direction.');
  const target = getPushEntity(state, hand.targetKind, hand.targetId);
  if (!target) return fail(state, 'The Magic Hand target no longer exists.');
  const rawDx = to.x - target.position.x; const rawDy = to.y - target.position.y;
  const selectedDistance = Math.max(Math.abs(rawDx), Math.abs(rawDy));
  const linear = rawDx === 0 || rawDy === 0 || Math.abs(rawDx) === Math.abs(rawDy);
  if (selectedDistance < 1 || !linear) return fail(state, 'Choose a linear push direction.');
  const dx = Math.sign(rawDx); const dy = Math.sign(rawDy);
  const caster = state.players[playerId];
  pushEntity(state, target, dx, dy, hand.distance, hand.level, playerId, false, 'perk', false);
  if (hand.consume) {
    caster.actionsRemaining += 1;
    state.log.unshift(`Magic Hand (Consume) granted ${caster.name} 1 Action (${caster.actionsRemaining} available).`);
  }
  state.magicHand = null; state.phase = 'active';
  gainManaFromResolvedSpell(state, caster);
  state.log.unshift(`Magic Hand threw ${entityName(state, target)} with ${hand.level >= 3 ? 'global' : hand.distance} push distance. No collision Damage was dealt.`);
  return ok(state);
}
function selectForceThrowTarget(state: GameState, playerId: PlayerId, targetKind: 'player' | 'object', targetId: string): CommandResult {
  const force = state.forceThrow;
  if (state.phase !== 'choosing-force-throw-target' || !force || force.casterId !== playerId) return fail(state, 'Force Throw is not waiting for a target.');
  if (targetKind === 'player' && force.level < 3) return fail(state, 'Only level 3 Force Throw can target enemy Players.');
  if (targetKind === 'player' && targetId === playerId) return fail(state, 'Force Throw cannot target its caster.');
  if (targetKind === 'object' && state.objects.some((object) => object.id === targetId && isFixedWallObject(object))) return fail(state, 'Fixed Wall Objects cannot be pushed.');
  const target = getPushEntity(state, targetKind, targetId);
  if (!target) return fail(state, 'That Force Throw target does not exist.');
  const caster = state.players[playerId];
  if (distance(caster.position, target.position) > force.targetRange) return fail(state, 'That target is outside Force Throw range.');
  if (targetKind === 'player' && !hasLineOfSight(state, caster.position, target.position)) return fail(state, 'A Wall Object blocks line of sight to that Player.');
  force.targetKind = targetKind; force.targetId = targetId; state.phase = 'choosing-force-throw-direction';
  state.log.unshift('Force Throw: select an adjacent square to set the push direction.');
  return ok(state);
}

function resolveForceThrowDirection(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const force = state.forceThrow;
  if (state.phase !== 'choosing-force-throw-direction' || !force || force.casterId !== playerId || !force.targetKind || !force.targetId) return fail(state, 'Force Throw is not waiting for a direction.');
  const target = getPushEntity(state, force.targetKind, force.targetId);
  if (!target) return fail(state, 'The Force Throw target no longer exists.');
  const rawDx = to.x - target.position.x; const rawDy = to.y - target.position.y;
  const selectedDistance = Math.max(Math.abs(rawDx), Math.abs(rawDy));
  const linear = rawDx === 0 || rawDy === 0 || Math.abs(rawDx) === Math.abs(rawDy);
  if (selectedDistance < 1 || selectedDistance > force.distance || !linear) return fail(state, `Choose a linear direction within ${force.distance} squares.`);
  const dx = Math.sign(rawDx); const dy = Math.sign(rawDy);
  const caster = state.players[playerId];
  const awayX = target.position.x - caster.position.x; const awayY = target.position.y - caster.position.y;
  if (dx * awayX + dy * awayY < 0) return fail(state, 'Force Throw cannot pull a target toward its caster.');
  state.objectPushAnimations = [];
  const collisionBonus = force.targetKind === 'object'
    ? Number(caster.attackRange === 1 && isHighGround(state, caster.position) && isHighGround(state, target.position))
    : meleeHighGroundDamageBonus(state, caster, target.position);
  pushEntity(state, target, dx, dy, force.distance, force.level, playerId, true, 'perk', true, collisionBonus);
  state.objects = state.objects.filter((object) => object.hp > 0);
  state.forceThrow = null; state.phase = 'active';
  state.log.unshift('Force Throw resolved.');
  return ok(state);
}

function getPushEntity(state: GameState, kind: 'player' | 'object', id: string): PushEntity | null {
  const entity = kind === 'player' ? state.players[id as PlayerId] : state.objects.find((object) => object.id === id);
  return entity ? { kind, id, position: entity.position } : null;
}
function entityAt(state: GameState, cell: Cell, excluding: PushEntity): PushEntity | null {
  const player = Object.values(state.players).find((candidate) => !(excluding.kind === 'player' && candidate.id === excluding.id) && candidate.position.x === cell.x && candidate.position.y === cell.y);
  if (player) return { kind: 'player', id: player.id, position: player.position };
  const object = state.objects.find((candidate) => !(excluding.kind === 'object' && candidate.id === excluding.id) && candidate.position.x === cell.x && candidate.position.y === cell.y);
  return object ? { kind: 'object', id: object.id, position: object.position } : null;
}
function pushEntity(state: GameState, entity: PushEntity, dx: number, dy: number, movement: number, level: number, casterId: PlayerId, dealCollisionDamage = true, sourceKind: 'attack' | 'perk' | 'other' = 'other', dealElevationDamage = true, collisionDamageBonus = 0): boolean {
  const pushedObject = entity.kind === 'object' ? state.objects.find((candidate) => candidate.id === entity.id) : null;
  if (pushedObject && isFixedWallObject(pushedObject)) return true;
  const start = { ...entity.position };
  const travelled: Cell[] = [];
  const finishObjectAnimation = (collided: boolean) => {
    if (entity.kind === 'player') {
      if (travelled.length > 0) state.players[entity.id as PlayerId].visualMovement = { from: start, path: travelled.map((cell) => ({ ...cell })) };
      return;
    }
    const current = getPushEntity(state, entity.kind, entity.id);
    if (current) {
      const destroyed = recordObjectEffect(state, entity.id, casterId, 'push');
      state.objectPushAnimations.push({ id: `${state.turn}-${state.log.length}-${entity.id}-${state.objectPushAnimations.length}`, objectId: entity.id, from: start, to: { ...current.position }, dx, dy, collided, path: travelled.map((cell) => ({ ...cell })), removeOnComplete: destroyed });
    }
  };
  let remaining = pushedObject?.heavy ? Math.min(1, movement) : movement;
  while (remaining > 0) {
    const current = getPushEntity(state, entity.kind, entity.id); if (!current) return false;
    const next = { x: current.position.x + dx, y: current.position.y + dy };
    if (current.kind === 'player' && isForbiddenSlideAscent(state, current.position, next)) {
      state.log.unshift(`${entityName(state, current)} could not be moved directly from a Slide or Trench Square onto High Ground.`);
      finishObjectAnimation(true);
      return true;
    }
    if (next.x < 1 || next.x > boardWidth(state) || next.y < 0 || next.y >= boardHeight(state)) {
      if (dealCollisionDamage) damageCollisionEntity(state, current, level, casterId, sourceKind, collisionDamageBonus);
      state.log.unshift(`${entityName(state, current)} collided with the board edge${dealCollisionDamage && current.kind === 'player' && current.id !== casterId ? ' and took 1 Damage' : ''}.`);
      finishObjectAnimation(true);
      return true;
    }
    const occupant = entityAt(state, next, current);
    if (occupant) {
      if (dealCollisionDamage) { damageCollisionEntity(state, current, level, casterId, sourceKind, collisionDamageBonus); damageCollisionEntity(state, occupant, level, casterId, sourceKind, collisionDamageBonus); }
      state.log.unshift(`${entityName(state, current)} collided with ${entityName(state, occupant)}.`);
      const transferred = remaining - 1;
      if (transferred > 0) pushEntity(state, occupant, dx, dy, transferred, level, casterId, dealCollisionDamage, sourceKind, dealElevationDamage, collisionDamageBonus);
      finishObjectAnimation(true);
      return true;
    }
    let slidTo: Cell | null = null;
    if (current.kind === 'player') {
      const movedPlayer = state.players[current.id as PlayerId];
      const enteredFrom = { ...current.position };
      recordQuestMovement(state, current.id as PlayerId, 1, false, next);
      movedPlayer.position = next;
      slidTo = applySlideSquare(state, movedPlayer, enteredFrom);
      markCharacterMoved(movedPlayer, current.id === casterId ? 'own-card' : 'enemy-ability');
    }
    else state.objects.find((object) => object.id === current.id)!.position = next;
    travelled.push({ ...next });
    if (slidTo) travelled.push({ ...slidTo });
    if (dealElevationDamage) applyElevationDropDamage(state, current, current.position, next, casterId, sourceKind);
    remaining -= 1;
  }
  finishObjectAnimation(false);
  return false;
}
function damageCollisionEntity(state: GameState, entity: PushEntity, level: number, casterId: PlayerId, sourceKind: 'attack' | 'perk' | 'other' = 'other', bonus = 0) {
  if (entity.kind === 'player' && entity.id !== casterId) {
    const target = state.players[entity.id as PlayerId];
    dealDamage(state, target, 1 + (isLowGroundOrProtected(state, target.position) ? bonus : 0), true, casterId, sourceKind);
  }
}
function applyElevationDropDamage(state: GameState, entity: PushEntity, from: Cell, to: Cell, sourceId: PlayerId = state.activePlayerId, sourceKind: 'attack' | 'perk' | 'other' = 'other') {
  const elevation = (cell: Cell) => state.elevations[cellLabel(cell)] ?? 0;
  if (elevation(from) <= elevation(to)) return;
  if (entity.kind === 'player') dealDamage(state, state.players[entity.id as PlayerId], 1, false, sourceId, sourceKind);
  state.log.unshift(`${entityName(state, entity)} moved from High Ground to Low Ground and received 1 damage.`);
}
function entityName(state: GameState, entity: PushEntity) { return entity.kind === 'player' ? state.players[entity.id as PlayerId].name : state.objects.find((object) => object.id === entity.id)?.name ?? 'Object'; }

function moveDanceThrough(state: GameState, player: PlayerState, to: Cell): CommandResult {
  const dance = state.danceThrough;
  if (!dance || state.phase !== 'dance-through') return fail(state, 'Dance Through is not active.');
  if (distance(player.position, to) !== 1) return fail(state, 'Dance Through moves exactly one square at a time.');
  if (isForbiddenSlideAscent(state, player.position, to)) return fail(state, 'Characters cannot move directly from a Slide or Trench Square onto High Ground.');
  if (diagonalMovementBlockedByObject(state, player.position, to)) return fail(state, 'An adjacent Object blocks that diagonal movement.');
  const targetEnemy = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.position.x === to.x && candidate.position.y === to.y);
  if (targetEnemy && isHighGroundSlideEntry(state, player.position, to)) return fail(state, 'An occupied Slide Square cannot be entered from adjacent High Ground.');
  if (state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Dance Through cannot move through an Object.');
  if (targetEnemy && dance.stepsRemaining <= 1) return fail(state, 'Not enough Dance Through movement remains to leave the occupied square.');
  const passedEnemy = dance.enemyUnderfoot ? state.players[dance.enemyUnderfoot] : null;
  const enteredFrom = { ...player.position };
  recordQuestMovement(state, player.id, 1, false, to);
  player.visualMovement = { from: enteredFrom, path: [{ ...to }] };
  player.position = to;
  applySlideSquare(state, player, enteredFrom);
  markCharacterMoved(player, 'own-card');
  dance.stepsRemaining -= 1;
  dance.enemyUnderfoot = targetEnemy?.id ?? null;
  state.log.unshift(`${player.name} danced to ${cellLabel(to)} (${dance.stepsRemaining} steps left).`);
  if (passedEnemy) {
    const danceWithPins = dance as typeof dance & { pinnedEnemyIds?: PlayerId[] };
    danceWithPins.pinnedEnemyIds ??= [];
    if (!danceWithPins.pinnedEnemyIds.includes(passedEnemy.id)) {
      danceWithPins.pinnedEnemyIds.push(passedEnemy.id);
      const pinnedStacks = applyPinned(passedEnemy, 1);
      state.log.unshift(`Dance Through passed through ${passedEnemy.name} and applied 1 Pinned stack (${pinnedStacks} total).`);
    } else state.log.unshift(`Dance Through had already applied Pinned to ${passedEnemy.name} during this movement.`);
  }
  if (dance.stepsRemaining === 0) { state.phase = 'active'; state.danceThrough = null; state.log.unshift('Dance Through movement completed.'); }
  return ok(state);
}

function endDance(state: GameState, playerId: PlayerId): CommandResult {
  if (state.phase !== 'dance-through' || !state.danceThrough || playerId !== state.activePlayerId) return fail(state, 'Dance Through is not active.');
  if (state.danceThrough.enemyUnderfoot) return fail(state, 'Obi Wan Shinobi must leave the enemy-occupied square.');
  state.phase = 'active'; state.danceThrough = null;
  state.log.unshift('Obi Wan Shinobi ended Dance Through movement.');
  return ok(state);
}

function moveDoubleJump(state: GameState, player: PlayerState, to: Cell): CommandResult {
  const jump = state.doubleJump;
  if (!jump || state.phase !== 'double-jump' || jump.playerId !== player.id) return fail(state, 'Double Jump is not active.');
  if (distance(player.position, to) !== 1) return fail(state, 'Double Jump moves exactly one square at a time.');
  if (isForbiddenSlideAscent(state, player.position, to)) return fail(state, 'Characters cannot move directly from a Slide or Trench Square onto High Ground.');
  if (diagonalMovementBlockedByObject(state, player.position, to)) return fail(state, 'An adjacent Object blocks that diagonal movement.');
  const targetEnemy = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.position.x === to.x && candidate.position.y === to.y);
  if (targetEnemy && isHighGroundSlideEntry(state, player.position, to)) return fail(state, 'An occupied Slide Square cannot be entered from adjacent High Ground.');
  if (state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Double Jump cannot move through an Object.');
  if (targetEnemy && jump.stepsRemaining <= 1) return fail(state, 'Shinobi must end Double Jump on an empty square.');
  const passedEnemy = jump.enemyUnderfoot ? state.players[jump.enemyUnderfoot] : null;
  const enteredFrom = { ...player.position };
  recordQuestMovement(state, player.id, 1, false, to);
  player.visualMovement = { from: enteredFrom, path: [{ ...to }] };
  player.position = to;
  applySlideSquare(state, player, enteredFrom);
  markCharacterMoved(player, 'own-card');
  jump.stepsRemaining -= 1;
  jump.enemyUnderfoot = targetEnemy?.id ?? null;
  state.log.unshift(`${player.name} double-jumped to ${cellLabel(to)} (${jump.stepsRemaining} steps left).`);
  if (passedEnemy) {
    const jumpWithPins = jump as typeof jump & { pinnedEnemyIds?: PlayerId[] };
    jumpWithPins.pinnedEnemyIds ??= [];
    if (!jumpWithPins.pinnedEnemyIds.includes(passedEnemy.id)) {
      jumpWithPins.pinnedEnemyIds.push(passedEnemy.id);
      const pinnedStacks = applyPinned(passedEnemy, 1);
      state.log.unshift(`Double Jump passed through ${passedEnemy.name} and applied 1 Pinned stack (${pinnedStacks} total).`);
    } else state.log.unshift(`Double Jump had already applied Pinned to ${passedEnemy.name} during this movement.`);
  }
  if (jump.stepsRemaining === 0) {
    state.phase = jump.resumePhase;
    state.doubleJump = null;
    state.log.unshift('Double Jump movement completed.');
  }
  return ok(state);
}

function resolveFinishingDiscard(state: GameState, playerId: PlayerId, cardInstanceId: string): CommandResult {
  if (playerId !== state.activePlayerId || !['choosing-guard-discard', 'choosing-dash-discard', 'choosing-end-discard'].includes(state.phase)) return fail(state, 'No discard is pending.');
  const player = state.players[playerId];
  const card = player.hand.find((entry) => entry.instanceId === cardInstanceId);
  if (!card) return fail(state, 'That card is not in the hand.');
  if (cardDefinition(card).cannotBeDiscarded) return fail(state, `${cardDefinition(card).name} cannot be discarded.`);
  if (state.phase === 'choosing-dash-discard' && isBlessingCard(card)) return fail(state, 'Blessing Cards cannot be discarded to pay for Dash.');
  if (state.phase === 'choosing-end-discard' && !canDiscardAtHandLimit(cardDefinition(card))) return fail(state, 'This Status Card cannot be discarded during end-of-turn hand-limit discarding.');
  const discardedSnapshot = { ...card };
  discardFromHand(player, cardInstanceId);
  state.log.unshift(`${player.name} discarded ${cardDefinition(card).name}.`);
  if (state.phase === 'choosing-end-discard') {
    if (player.hand.length > 5) {
      state.log.unshift(`${player.name} must discard ${player.hand.length - 5} more card${player.hand.length - 5 === 1 ? '' : 's'}.`);
      return ok(state);
    }
    state.log.unshift(`${player.name} may discard more eligible cards or select End Turn.`);
    return ok(state);
  }
  if (state.phase === 'choosing-guard-discard') return ok(endTurn(state));
  if (state.dashCancellation) state.dashCancellation.discardedCard = discardedSnapshot;
  state.phase = 'dashing';
  const dashMovement = effectiveMoveRange(player);
  grantMovement(player, dashMovement);
  state.log.unshift(`${player.name} begins Dash and adds ${dashMovement} movement (${player.movementRemaining} total).`);
  if (player.hand.some((entry) => entry.cardId === 'burning')) return ok(resolveBurningDash(state, player));
  if (player.movementRemaining === 0) return ok(endTurn(state));
  return ok(state);
}

function spendMovementRandomly(state: GameState, player: PlayerState, effectName: string): Cell[] {
  const start = { ...player.position }; const path: Cell[] = [];
  while (player.movementRemaining > 0) {
    const candidates: Cell[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const candidate = { x: player.position.x + dx, y: player.position.y + dy };
      if (candidate.x < 1 || candidate.x > boardWidth(state) || candidate.y < 0 || candidate.y >= boardHeight(state)) continue;
      if (isForbiddenSlideAscent(state, player.position, candidate)) continue;
      if (diagonalMovementBlockedByObject(state, player.position, candidate)) continue;
      if (state.objects.some((object) => object.position.x === candidate.x && object.position.y === candidate.y)) continue;
      if (Object.values(state.players).some((entry) => entry.id !== player.id && entry.position.x === candidate.x && entry.position.y === candidate.y)) continue;
      candidates.push(candidate);
    }
    if (candidates.length === 0) {
      state.log.unshift(`${player.name}'s ${effectName} movement had no legal adjacent empty Square; the remaining movement was lost.`);
      player.movementRemaining = 0;
      break;
    }
    const destination = candidates[Math.floor(Math.random() * candidates.length)];
    const enteredFrom = { ...player.position };
    recordQuestMovement(state, player.id, 1, false, destination);
    player.position = { ...destination }; path.push({ ...destination }); player.movementRemaining -= 1;
    const slidTo = applySlideSquare(state, player, enteredFrom);
    if (slidTo) path.push({ ...slidTo });
  }
  if (path.length > 0) {
    player.visualMovement = { from: start, path };
    markCharacterMoved(player, 'own-card');
  }
  return path;
}

function resolveBurningDash(state: GameState, player: PlayerState): GameState {
  const burningCards = player.hand.filter((card) => card.cardId === 'burning');
  for (const burning of burningCards) {
    const sourceId = burning.sourcePlayerId && state.players[burning.sourcePlayerId] ? burning.sourcePlayerId : player.id;
    player.rageGainLocked = false;
    dealDamage(state, player, 1, false, sourceId, 'perk');
  }
  const burningIds = burningCards.map((card) => card.instanceId);
  for (const instanceId of burningIds) removeCard(player, instanceId);
  state.log.unshift(`${player.name} received ${burningCards.length} Damage from Burning before Dash movement.`);
  if (player.hp <= 0 || state.winner) return state;
  const path = spendMovementRandomly(state, player, 'Burning Dash');
  state.log.unshift(`${player.name} Removed ${burningIds.length} Burning Status Card${burningIds.length === 1 ? '' : 's'} by Dashing and moved randomly ${path.length} Square${path.length === 1 ? '' : 's'}.`);
  state.dashCancellation = null;
  return endTurn(state);
}

function cancelDash(state: GameState, playerId: PlayerId): CommandResult {
  if (playerId !== state.activePlayerId || !['choosing-dash-discard', 'dashing'].includes(state.phase) || !state.dashCancellation) return fail(state, 'Dash can no longer be cancelled.');
  const player = state.players[playerId];
  const cancellation = state.dashCancellation;
  if (cancellation.discardedCard) {
    const discardIndex = player.discard.findIndex((card) => card.instanceId === cancellation.discardedCard!.instanceId);
    if (discardIndex >= 0) {
      player.discard.splice(discardIndex, 1);
      player.hand.push(cancellation.discardedCard);
      if (cancellation.discardedCard.cardId === 'pinned') player.pinnedStacks += 1;
    }
  }
  player.movementRemaining = cancellation.previousMovementRemaining;
  const previousCumulative = (cancellation as typeof cancellation & { previousJohnCumulativeMovementRemaining?: number }).previousJohnCumulativeMovementRemaining;
  if (player.character === 'john-christ' && previousCumulative != null) player.johnCumulativeMovementRemaining = previousCumulative;
  state.dashCancellation = null;
  state.phase = 'active';
  state.log.unshift(`${player.name} cancelled Dash before moving.`);
  return ok(state);
}

function endTurn(state: GameState): GameState {
  state.movementUndo = null;
  (state as GuardianPerkDamageState).currentGuardianPerkActionId = null;
  const current = state.players[state.activePlayerId];
  const burningCards = current.hand.filter((card) => card.cardId === 'burning');
  for (const burning of burningCards) {
    const sourceId = burning.sourcePlayerId && state.players[burning.sourcePlayerId] ? burning.sourcePlayerId : current.id;
    current.rageGainLocked = false;
    dealDamage(state, current, 1, false, sourceId, 'perk');
  }
  if (burningCards.length > 0) state.log.unshift(`${current.name} received ${burningCards.length} Damage from Burning at the end of the turn.`);
  if (current.hp <= 0 || state.winner) return state;
  current.movementAnnulledByBlessedSwiftness = false;
  if (current.spiritSiphonedMovement > 0) {
    state.log.unshift(`${current.name}'s Spirit Form movement siphon penalty expired at the end of the turn.`);
    current.spiritSiphonedMovement = 0;
  }
  let removedSwiftness = 0;
  while (current.hand.length >= 6) {
    const automaticBlessing = current.hand.find((card) => card.cardId === 'blessing-swiftness');
    if (!automaticBlessing) break;
    removeCard(current, automaticBlessing.instanceId);
    removedSwiftness += 1;
  }
  if (removedSwiftness > 0) state.log.unshift(`${removedSwiftness} Blessing: Swiftness Card${removedSwiftness === 1 ? '' : 's'} ${removedSwiftness === 1 ? 'was' : 'were'} automatically Removed at the beginning of ${current.name}'s end-turn process.`);
  scorePendingDiscards(state);
  const expiredPrayerCount = current.hand.filter((card) => card.cardId === 'blessing-prayer').length;
  if (expiredPrayerCount > 0) {
    current.hand = current.hand.filter((card) => card.cardId !== 'blessing-prayer');
    state.log.unshift(`${expiredPrayerCount} Blessing: Prayer Card${expiredPrayerCount === 1 ? '' : 's'} expired and ${expiredPrayerCount === 1 ? 'was' : 'were'} Removed at the end of ${current.name}'s turn.`);
  }
  if (!current.turnEndPinnedRemoved) {
    removePinnedAtTurnEnd(state, current);
    current.turnEndPinnedRemoved = true;
  }
  if (current.hand.length > 5) {
    const requiredDiscards = current.hand.length - 5;
    const eligibleDiscards = current.hand.filter((card) => canDiscardAtHandLimit(cardDefinition(card))).length;
    if (eligibleDiscards < requiredDiscards) {
      const winner: PlayerId = current.id === 'P1' ? 'P2' : 'P1';
      current.hp = 0; state.phase = 'finished'; state.winner = winner;
      state.log.unshift(`${current.name} could not discard enough Character cards to meet the Hand limit and lost the duel.`);
      return state;
    }
    state.phase = 'choosing-end-discard';
    state.log.unshift(`${current.name} must discard ${current.hand.length - 5} card${current.hand.length - 5 === 1 ? '' : 's'} before ending the turn.`);
    return state;
  }
  for (const player of Object.values(state.players)) {
    if (!player.doubleRageUntilEnemyTurnEnd) continue;
    player.doubleRageUntilEnemyTurnEnd = false;
    state.log.unshift(`Double! expired for ${player.name} at the end of ${current.name}'s turn.`);
  }
  updateLightsaberAtTurnEnd(state, current);
  exitSpiritForm(state, current, 'at the end of the turn');
  if (current.character === 'magician') current.manaMode = 'generate';
  advanceSpellEchoAtTurnEnd(state, current);
  if (current.character === 'orkk' && current.rageStacks > 0) {
    current.rageStacks -= 1;
    state.log.unshift(`${current.name} lost 1 Rage at the end of the turn (${current.rageStacks} remaining).`);
  }
  if (current.arcaneBoltAttackBonus > 0) state.log.unshift(`Arcane Bolt's +${current.arcaneBoltAttackBonus} ATT bonus expired for ${current.name}.`);
  current.arcaneBoltAttackBonus = 0;
  current.swiftformMoveBonus = 0; current.grimoireMoveBonus = 0; current.swiftformCanPassEnemies = false; current.swiftformPinsPassedEnemies = false; current.swiftformLightsaberAtTurnEnd = false; current.swiftformEnemyUnderfoot = null; current.swiftformPinnedEnemyIds = [];
  current.spiritSiphonedEnemyIds = [];
  current.movedThisTurn = false;
  return finalizeTurn(state);
}

function finalizeTurn(state: GameState): GameState {
  const endingQuest = questPhases(state);
  endingQuest.objectEffectsThisTurn = {};
  if (endingQuest.currentQuest?.id === 'provocateur' && endingQuest.turnStartedOnHighGround[state.activePlayerId] && isHighGround(state, state.players[state.activePlayerId].position)) {
    endingQuest.currentQuest.progress[state.activePlayerId] = (endingQuest.currentQuest.progress[state.activePlayerId] ?? 0) + 1;
    state.log.unshift(`${state.players[state.activePlayerId].name} started and ended the turn on High Ground, gaining 1 Provocateur progress.`);
  }
  const deliveredFlag = endingQuest.captureTheFlag?.flags.find((flag) => flag.status === 'carried' && flag.carrierId === state.activePlayerId && flag.ownerId !== state.activePlayerId);
  if (endingQuest.currentQuest?.id === 'capture-the-flag' && deliveredFlag && ownedBaseSquares(state, state.activePlayerId).has(cellLabel(state.players[state.activePlayerId].position))) {
    deliveredFlag.status = 'captured';
    deliveredFlag.carrierId = null;
    endingQuest.currentQuest.winners = [state.activePlayerId];
    endingQuest.currentQuest.progress[state.activePlayerId] = 2;
    state.log.unshift(`${state.players[state.activePlayerId].name} returned the Flag to their Base and completed Capture the Flag.`);
    resolveCurrentActionQuest(state);
  }
  const turnOrder = Object.keys(state.players).filter((id) => state.players[id as PlayerId].hp > 0) as PlayerId[];
  const currentIndex = turnOrder.indexOf(state.activePlayerId);
  const nextId = turnOrder[(currentIndex + 1) % turnOrder.length];
  let roundFirstPlayerId = (state as GameStateWithRound).roundFirstPlayerId ?? turnOrder[0];
  if (!turnOrder.includes(roundFirstPlayerId)) {
    const allIds = Object.keys(state.players) as PlayerId[];
    const previousIndex = allIds.indexOf(roundFirstPlayerId);
    roundFirstPlayerId = Array.from({ length: allIds.length }, (_, offset) => allIds[(previousIndex + offset + 1) % allIds.length]).find((id) => state.players[id].hp > 0) ?? turnOrder[0];
    (state as GameStateWithRound).roundFirstPlayerId = roundFirstPlayerId;
    state.log.unshift(`${state.players[roundFirstPlayerId].name} became the first Player for Round counting.`);
  }
  const beginsNewRound = nextId === roundFirstPlayerId;
  if (beginsNewRound) {
    state.turn += 1;
  }
  const dueRespawnIndex = endingQuest.objectRespawns?.findIndex((entry) => entry.dueRound <= state.turn) ?? -1;
  if (dueRespawnIndex >= 0) {
    endingQuest.objectRespawns!.splice(dueRespawnIndex, 1);
    if (!spawnReplacementBox(state)) endingQuest.objectRespawns!.push({ dueRound: state.turn + 1 });
  }
  state.activePlayerId = nextId; state.phase = 'active'; state.pendingAttack = null; state.dashCancellation = null; state.danceThrough = null; state.doubleJump = null; state.forceThrow = null; state.forcePull = null; state.arkaneArow = null; state.armDaWiz = null; state.preparation = null; state.arcaneMissle = null; state.chainLightning = null; state.magicHand = null; state.shizzle = null; state.mindTricks = null; state.forceDisarm = null; state.flurry = null; state.pendingManaChoice = null;
  const next = state.players[nextId];
  if (endingQuest.currentQuest?.id === 'provocateur') endingQuest.turnStartedOnHighGround[nextId] = isHighGround(state, next.position);
  for (const player of Object.values(state.players)) player.damagedDuringEnemyTurn = false;
  next.actionsRemaining = 2; next.perkUsed = false; next.freeMoveUsed = false; next.movementRemaining = 0; next.johnCumulativeMovementRemaining = 0; next.spiritMovementDepleted = false; next.spiritMovementSpentThisTurn = false; next.pinnedGainedThisTurn = 0; next.turnEndPinnedRemoved = false;
  if (next.character === 'john-christ') {
    removeOwnedGuardian(state, next.id, 'at the beginning of John\'s next turn');
    next.stoicShellHealedTurn = null;
    next.stoicShellHealEventId = null;
    next.stoicShellHealAmount = 0;
    const beganWithStoicShell = next.stoicShell;
    if (beganWithStoicShell && next.hp < next.maxHp) {
      next.stoicShellStacks += 1;
      const healed = healPlayer(state, next, next.stoicShellStacks);
      if (healed > 0) {
        next.stoicShellHealedTurn = state.turn;
        next.stoicShellHealEventId = `stoic-shell-heal-${next.id}-${++instanceSequence}`;
        next.stoicShellHealAmount = healed;
      }
      state.log.unshift(`${next.name} gained a Stoic Shell Stack (${next.stoicShellStacks} total) and restored ${healed} HP. All Stacks remain until HP Damage removes them.`);
    } else if (beganWithStoicShell) {
      state.log.unshift(`${next.name} began the turn at maximum HP, so Stoic Shell remained at ${next.stoicShellStacks} Stack${next.stoicShellStacks === 1 ? '' : 's'} without gaining another.`);
    } else if (next.queuedBlessingCardIds.length > 0) {
      const queued = next.queuedBlessingCardIds.splice(0);
      for (const cardId of queued) addBlessingCardToJohn(state, next, cardId);
    }
  }
  const expiringFaith = next.hand.filter((card) => card.cardId === 'blessing-faith');
  for (const faith of expiringFaith) removeCard(next, faith.instanceId);
  if (expiringFaith.length > 0) state.log.unshift(`${next.name} Removed ${expiringFaith.length} unused Blessing: Faith Card${expiringFaith.length === 1 ? '' : 's'} at the beginning of the turn.`);
  if (drawSquares(state).has(cellLabel(next.position))) {
    const drawn = drawCards(next, 1);
    state.log.unshift(`${next.name} started the turn on ${cellLabel(next.position)} and drew ${drawn} additional Card${drawn === 1 ? '' : 's'}.`);
  }
  if (next.character === 'orkk' && !next.shieldEquipped && next.rageStacks === 0) {
    next.rageStacks = 1;
    state.log.unshift(`${next.name} began the turn without his Shield and gained 1 Rage.`);
  }
  if (next.character === 'magician') {
    next.manaMode = 'generate';
    if (next.manaPoints === 3) {
      state.phase = 'choosing-mana-mode';
      state.pendingManaChoice = next.id;
      state.log.unshift(`${next.name} has 3 Mana. Choose Consume for advanced spell effects this turn, or Generate to retain Mana and continue charging after spells resolve.`);
    }
  }
  const completedPhase = beginsNewRound ? completedPhaseAtRoundStart(state.turn) : null;
  const currentQuest = questPhases(state).currentQuest;
  if (completedPhase !== null) {
    // Phase boundaries are the authoritative Action Quest restart schedule.
    // Keeping this tied to PHASE_LENGTH_ROUNDS makes future Phase-length
    // changes automatically move both Quest resolution and announcement.
    resolveCurrentActionQuest(state);
    if (!announceActionQuest(state, state.turn)) return state;
    if (completedPhase <= 3) {
      startPhaseReward(state, completedPhase as 1 | 2 | 3);
      return state;
    }
  } else if (beginsNewRound && currentQuest && state.turn > currentQuest.endsAfterRound) {
    resolveCurrentActionQuest(state);
  }
  state.log.unshift(beginsNewRound ? `Round ${state.turn}: ${next.name} begins the new Round.` : `${next.name} begins their move in Round ${state.turn}.`);
  return state;
}

function resolveManaChoice(state: GameState, playerId: PlayerId, consume: boolean): CommandResult {
  const player = state.players[playerId];
  const choiceStillAvailable = player.actionsRemaining === 2 && !player.freeMoveUsed;
  if (!['choosing-mana-mode', 'active'].includes(state.phase) || state.pendingManaChoice !== playerId || state.activePlayerId !== playerId || player.character !== 'magician' || !choiceStillAvailable) return fail(state, 'Classic Wizardry must be chosen before using an Action or Free Movement + Draw.');
  if (consume) {
    if (player.manaPoints < 3) return fail(state, 'Consume requires 3 Mana Points.');
    player.manaPoints = 0;
    player.manaMode = 'consume';
    player.manaConsumeEventId = `mana-consume-${state.turn}-${player.id}-${++instanceSequence}`;
    state.log.unshift(`${player.name} consumed 3 Mana. Attack and Perk spells gain their advanced effects this turn, but normal spell resolution cannot generate Mana.`);
  } else {
    player.manaMode = 'generate';
    state.log.unshift(`${player.name} retained 3 Mana and chose Generate for this turn.`);
  }
  state.pendingManaChoice = null;
  state.phase = 'active';
  return ok(state);
}

function minimizeManaChoice(state: GameState, playerId: PlayerId): CommandResult {
  if (state.phase !== 'choosing-mana-mode' || state.pendingManaChoice !== playerId || state.activePlayerId !== playerId) return fail(state, 'Classic Wizardry is not waiting for this Player.');
  state.phase = 'active';
  state.log.unshift(`${state.players[playerId].name} minimized the Consume decision to review the Hand and battlefield.`);
  return ok(state);
}

export function grantMana(player: PlayerState, amount = 1): number {
  const gained = Math.max(0, Math.min(amount, 3 - player.manaPoints));
  player.manaPoints += gained;
  return gained;
}

function gainManaFromResolvedSpell(state: GameState, player: PlayerState) {
  if (player.character !== 'magician' || player.manaMode !== 'generate') return;
  const gained = grantMana(player, 1);
  state.log.unshift(gained > 0 ? `${player.name} generated 1 Mana after resolving a spell (${player.manaPoints}/3).` : `${player.name}'s Mana storage is already full (3/3).`);
}

export function unequipOrkkShield(state: GameState, playerId: PlayerId, position: Cell): boolean {
  const player = state.players[playerId];
  if (player.character !== 'orkk' || !player.shieldEquipped) return false;
  if (Object.values(state.players).some((entry) => entry.position.x === position.x && entry.position.y === position.y)) return false;
  if (state.objects.some((entry) => entry.position.x === position.x && entry.position.y === position.y)) return false;
  player.shieldEquipped = false;
  state.objects.push({ id: `${playerId}-iron-shield-${state.turn}-${++instanceSequence}`, name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: playerId, hp: 999, maxHp: 999, position: { ...position } });
  state.log.unshift(`${player.name} unequipped his Shield at ${cellLabel(position)}.`);
  return true;
}

export function equipOrkkShield(state: GameState, playerId: PlayerId): boolean {
  const player = state.players[playerId];
  const index = state.objects.findIndex((entry) => entry.kind === 'orkk-shield' && entry.ownerId === playerId);
  if (player.character !== 'orkk' || player.shieldEquipped || index < 0) return false;
  state.objects.splice(index, 1);
  player.shieldEquipped = true;
  state.log.unshift(`${player.name} equipped his Iron Shield.`);
  return true;
}

export function drawCards(player: PlayerState, count: number): number {
  const previousMoveRange = movementRangeForAdjustment(player);
  let drawn = 0;
  for (let index = 0; index < count; index++) {
    if (player.deck.length === 0 && player.discard.length > 0) { player.deck = shuffle(player.discard.splice(0)); player.knownTopCardId = null; }
    const card = player.deck.pop();
    if (!card) break;
    player.knownTopCardId = null;
    player.hand.push(card);
    if (cardDefinition(card).kind === 'status' || (player.character === 'john-christ' && /\bBlessing\b/i.test(cardDefinition(card).name))) card.revealedToOpponent = true;
    if (card.cardId === 'pinned') {
      player.pinnedStacks += 1;
      player.pinnedGainedThisTurn = (player.pinnedGainedThisTurn ?? 0) + 1;
    }
    drawn += 1;
  }
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
  return drawn;
}
function teleportTestObject(state: GameState, playerId: PlayerId, objectId: string, to: Cell): CommandResult {
  if (state.phase !== 'active' || state.activePlayerId !== playerId) return fail(state, 'The test object can only be moved during the active player’s turn.');
  const object = state.objects.find((entry) => entry.id === objectId && entry.name === 'Wooden Box');
  if (!object) return fail(state, 'Only the Wooden Box can be teleported with this test control.');
  const occupiedByPlayer = Object.values(state.players).some((entry) => entry.position.x === to.x && entry.position.y === to.y);
  const occupiedByObject = state.objects.some((entry) => entry.id !== object.id && entry.position.x === to.x && entry.position.y === to.y);
  if (occupiedByPlayer || occupiedByObject) return fail(state, 'The Wooden Box can only teleport to an empty Square.');
  const from = { ...object.position };
  object.position = { ...to };
  state.objectPushAnimations.push({ id: `${state.turn}-box-teleport-${state.objectPushAnimations.length}`, objectId, from, to: { ...to }, dx: 0, dy: 0, collided: false, teleport: true });
  state.log.unshift(`Test control teleported the Wooden Box from ${cellLabel(from)} to ${cellLabel(to)}.`);
  return ok(state);
}
export function revealCardToOpponent(state: GameState, ownerId: PlayerId, instanceId: string): boolean {
  const card = state.players[ownerId].hand.find((entry) => entry.instanceId === instanceId);
  if (!card) return false;
  card.revealedToOpponent = true;
  return true;
}
export function markCharacterMoved(player: PlayerState, cause: 'voluntary' | 'own-card' | 'enemy-ability') {
  player.visualMovementCause = cause;
  if (cause === 'own-card') return;
  player.movedThisTurn = true;
  if (cause === 'voluntary') {
    if (player.lightsaberStacks > 0) {
      player.lightsaberStacks -= 1;
      player.lightsaberMovementProtection = true;
    } else player.lightsaberMovementProtection = false;
  }
}
export function effectiveMoveRange(player: PlayerState): number {
  if (player.character === 'john-christ' && player.spiritForm) return 1;
  return normalEffectiveMoveRange(player);
}
function normalEffectiveMoveRange(player: PlayerState): number {
  const boomerangMovePenalty = [...(player.deck ?? []), ...(player.discard ?? [])].some((card) => card.cardId === 'boomerang') ? 1 : 0;
  const lightsaberMoveBonus = player.character === 'shinobi' && player.lightsaberBuff ? 1 : 0;
  const bannerMoveBonus = (player.hand ?? []).filter((card) => card.cardId === 'banner').length;
  const blessingSwiftnessMoveBonus = (player.hand ?? []).filter((card) => card.cardId === 'blessing-swiftness').length;
  return Math.max(0, (player.moveRange ?? 0) + lightsaberMoveBonus + bannerMoveBonus + blessingSwiftnessMoveBonus + (player.swiftformMoveBonus ?? 0) + (player.grimoireMoveBonus ?? 0) - pinnedCount(player) - boomerangMovePenalty - (player.spiritSiphonedMovement ?? 0));
}
function johnCumulativeMoveRange(player: PlayerState): number {
  return normalEffectiveMoveRange(player);
}
function movementRangeForAdjustment(player: PlayerState): number {
  return player.character === 'john-christ' ? johnCumulativeMoveRange(player) : effectiveMoveRange(player);
}
function grantMovement(player: PlayerState, amount: number) {
  const granted = Math.max(0, amount);
  if (player.character !== 'john-christ') {
    player.movementRemaining += granted;
    return;
  }
  player.johnCumulativeMovementRemaining += granted;
  if (player.spiritForm) player.movementRemaining = Math.min(1, Math.max(player.movementRemaining, 1));
  else player.movementRemaining = player.johnCumulativeMovementRemaining;
}
function adjustUnspentMovementForRangeChange(player: PlayerState, previousMoveRange: number) {
  if (!player.freeMoveUsed) return;
  const delta = movementRangeForAdjustment(player) - previousMoveRange;
  if (player.character === 'john-christ') {
    player.johnCumulativeMovementRemaining = Math.max(0, player.johnCumulativeMovementRemaining + delta);
    if (!player.spiritForm) player.movementRemaining = player.johnCumulativeMovementRemaining;
    return;
  }
  player.movementRemaining = Math.max(0, player.movementRemaining + delta);
}
function canDiscardAtHandLimit(card: Card): boolean {
  return !card.cannotBeDiscarded && (card.kind !== 'status' || card.canDiscardForHandLimit === true);
}
export function applyPinned(player: PlayerState, stacks = 1): number {
  const previousMoveRange = movementRangeForAdjustment(player);
  const applied = Math.max(0, Math.floor(stacks));
  for (let index = 0; index < applied; index++) player.hand.push({ instanceId: `${player.id}-status-${++instanceSequence}`, cardId: 'pinned', revealedToOpponent: true });
  player.pinnedStacks += applied;
  player.pinnedGainedThisTurn = (player.pinnedGainedThisTurn ?? 0) + applied;
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
  return pinnedCount(player);
}
export function pinnedCount(player: PlayerState): number {
  return Math.max(player.pinnedStacks ?? 0, (player.hand ?? []).filter((card) => card.cardId === 'pinned').length);
}
function removePinnedAtTurnEnd(state: GameState, player: PlayerState) {
  const protectedPinned = Math.min(player.pinnedGainedThisTurn ?? 0, pinnedCount(player));
  if (pinnedCount(player) <= protectedPinned) {
    if (protectedPinned > 0) state.log.unshift(`${player.name}'s newly gained Pinned Status cannot be removed during the same turn.`);
    return;
  }
  const pinnedCards = player.hand.filter((card) => card.cardId === 'pinned');
  if (pinnedCards.length > 0) {
    const removed = pinnedCards[Math.floor(Math.random() * pinnedCards.length)];
    removeCard(player, removed.instanceId);
  } else if (player.pinnedStacks > 0) player.pinnedStacks -= 1;
  else return;
  state.log.unshift(`${player.name} removed 1 Pinned Status Card (${pinnedCount(player)} remaining).`);
}
function updateLightsaberAtTurnEnd(state: GameState, player: PlayerState) {
  if (player.character !== 'shinobi') {
    player.lightsaberBuff = false;
    player.lightsaberStacks = 0;
    player.lightsaberMovementProtection = false;
    player.swiftformLightsaberAtTurnEnd = false;
    return;
  }
  if (player.movedThisTurn) {
    if (player.lightsaberMovementProtection) state.log.unshift('A Lightsaber duration stack preserved Lightsaber after movement.');
    else {
      if (player.lightsaberBuff) state.log.unshift('Lightsaber expired because Obi Wan Shinobi moved this turn.');
      player.lightsaberBuff = false;
    }
  } else {
    if (!player.lightsaberBuff) state.log.unshift('Lightsaber empowered Obi Wan Shinobi with +1 ATT, +1 DEF, and +1 MOV.');
    player.lightsaberBuff = true;
  }
  if (player.swiftformLightsaberAtTurnEnd) {
    player.lightsaberBuff = true;
    state.log.unshift('Swiftform granted Lightsaber status at the end of the turn.');
  }
  player.lightsaberMovementProtection = false;
}
function removeAllBuffs(player: PlayerState) {
  const previousMoveRange = movementRangeForAdjustment(player);
  player.lightsaberBuff = false;
  player.lightsaberStacks = 0;
  player.lightsaberMovementProtection = false;
  player.highgroundAdvantageBuff = false;
  player.swiftformMoveBonus = 0;
  player.grimoireMoveBonus = 0;
  player.swiftformCanPassEnemies = false;
  player.swiftformPinsPassedEnemies = false;
  player.swiftformLightsaberAtTurnEnd = false;
  player.swiftformEnemyUnderfoot = null;
  player.swiftformPinnedEnemyIds = [];
  player.arcaneBoltAttackBonus = 0;
  player.doubleRageUntilEnemyTurnEnd = false;
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
}
function removeAllDebuffs(player: PlayerState, removeBurning = false) {
  const previousMoveRange = movementRangeForAdjustment(player);
  player.pinnedStacks = 0;
  player.pinnedGainedThisTurn = 0;
  const negativeStatusIds: CardTypeId[] = ['pinned', 'headache', 'exhaust', ...(removeBurning ? ['burning' as const, 'panic' as const] : [])];
  player.hand = player.hand.filter((entry) => !negativeStatusIds.includes(entry.cardId));
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
}
function advanceSpellEchoAtTurnEnd(state: GameState, player: PlayerState) {
  const [positionOne, positionTwo, positionThree] = player.spellEcho;
  if (player.perkUsed || !positionOne || (positionOne && positionTwo && positionThree)) return;
  player.spellEcho = [null, positionOne, positionTwo ?? positionThree];
  state.log.unshift(`${player.name}'s Spell Echo advanced upward, leaving position 1 available.`);
}
function isBlessingCard(instance: CardInstance): boolean {
  return cardDefinition(instance).name.startsWith('Blessing:');
}
function discardFromHand(player: PlayerState, instanceId: string) {
  const previousMoveRange = movementRangeForAdjustment(player);
  const index = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return;
  const [card] = player.hand.splice(index, 1);
  if (card.cardId === 'pinned') player.pinnedStacks = Math.max(0, player.pinnedStacks - 1);
  if (card.cardId === 'boomerang') {
    shuffleBoomerangIntoDeck(player, card);
    adjustUnspentMovementForRangeChange(player, previousMoveRange);
    return;
  }
  if (isBlessingCard(card)) {
    adjustUnspentMovementForRangeChange(player, previousMoveRange);
    return;
  }
  if (card.cardId === 'portal') {
    adjustUnspentMovementForRangeChange(player, previousMoveRange);
    return;
  }
  card.revealedToOpponent = false;
  player.discard.push(card);
  adjustUnspentMovementForRangeChange(player, previousMoveRange);
}
export function removeCard(player: PlayerState, instanceId: string): CardInstance | null {
  const previousMoveRange = movementRangeForAdjustment(player);
  for (const pile of [player.hand, player.deck, player.discard]) {
    const index = pile.findIndex((card) => card.instanceId === instanceId);
    if (index < 0) continue;
    const [removed] = pile.splice(index, 1);
    if (removed.cardId === 'pinned' && pile === player.hand) player.pinnedStacks = Math.max(0, player.pinnedStacks - 1);
    adjustUnspentMovementForRangeChange(player, previousMoveRange);
    return removed;
  }
  return null;
}
function shuffle<T>(items: T[]): T[] { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }
function scorePendingDiscards(state: GameState) {
  const baseline = discardBaselineByCommand.get(state);
  if (!baseline) return;
  const currentQuest = questPhases(state).currentQuest;
  if (currentQuest?.id === 'the-gambler') {
    for (const id of Object.keys(state.players) as PlayerId[]) {
      const prior = baseline[id] ?? new Set<string>();
      const added = state.players[id].discard.filter((card) => !prior.has(card.instanceId)).length;
      if (added > 0) currentQuest.progress[id] = (currentQuest.progress[id] ?? 0) + added;
    }
  }
  discardBaselineByCommand.delete(state);
}
function ok(state: GameState): CommandResult {
  scorePendingDiscards(state);
  // Individual card handlers may restore their normal follow-up phase after
  // resolving damage. A defeated Character must always take precedence.
  const defeated = (Object.keys(state.players) as PlayerId[]).find((id) => state.players[id].hp <= 0);
  if (defeated && state.phase !== 'finished') {
    state.phase = 'finished';
    state.winner = state.winner && state.players[state.winner]?.hp > 0
      ? state.winner
      : (Object.keys(state.players) as PlayerId[]).find((id) => id !== defeated && state.players[id].hp > 0) ?? null;
    state.log.unshift(`${state.players[defeated].name} was defeated${state.winner ? `; ${state.players[state.winner].name} wins the match!` : '.'}`);
  }
  return { ok: true, state };
}
function fail(state: GameState, error: string): CommandResult { return { ok: false, state, error }; }
