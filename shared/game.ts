import { z } from 'zod';

export const PlayerIdSchema = z.enum(['P1', 'P2']);
export type PlayerId = z.infer<typeof PlayerIdSchema>;
export const CharacterIdSchema = z.enum(['shinobi', 'orkk']);
export type CharacterId = z.infer<typeof CharacterIdSchema>;
export const BOARD_SIZE = 8;
export const CellSchema = z.object({ x: z.number().int().min(1).max(BOARD_SIZE), y: z.number().int().min(0).max(BOARD_SIZE - 1) });
export type Cell = z.infer<typeof CellSchema>;
export const CardTypeIdSchema = z.enum(['attack-2', 'attack-3', 'defend-1', 'echo-pulse', 'light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there', 'block', 'flurry-defensive-strikes', 'calmness', 'not-a-shinobi', 'double-jump', 'higround-advantage', 'force-throw', 'force-pull', 'swiftform', 'mind-tricks', 'arkane-arow', 'arm-da-wiz', 'encourage', 'kyk', 'consume-rage', 'fistbolt', 'chain-punchin', 'teef-strike', 'chip-cast', 'knee-blast', 'da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer', 'pinned', 'headache', 'exhaust']);
export type CardTypeId = z.infer<typeof CardTypeIdSchema>;

export const GameCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('move'), playerId: PlayerIdSchema, to: CellSchema }),
  z.object({ type: z.literal('attack'), playerId: PlayerIdSchema, cardInstanceId: z.string(), targetId: PlayerIdSchema }),
  z.object({ type: z.literal('defend'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('pass-defense'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('free-move'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('guard'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('dash'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('cancel-dash'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('play-perk'), playerId: PlayerIdSchema, cardInstanceId: z.string(), destination: z.enum(['direct', 'echo']), replaceExisting: z.boolean().optional() }),
  z.object({ type: z.literal('use-echo-perk'), playerId: PlayerIdSchema, position: z.number().int().min(1).max(3) }),
  z.object({ type: z.literal('end-dance'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('ack-combat'), playerId: PlayerIdSchema }),
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
  z.object({ type: z.literal('cancel-targeting'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('force-disarm-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('flurry-pay'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('flurry-decline'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('flurry-enemy-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('discard-card'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('remove-status'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mind-tricks-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('mind-tricks-finish'), playerId: PlayerIdSchema }),
  z.object({ type: z.literal('mind-tricks-enemy-discard'), playerId: PlayerIdSchema, cardInstanceId: z.string() }),
  z.object({ type: z.literal('end-turn'), playerId: PlayerIdSchema }),
]);
export type GameCommand = z.infer<typeof GameCommandSchema>;

export type Card = { id: CardTypeId; name: string; kind: 'attack' | 'defend' | 'perk' | 'status'; value: number; levelEffects?: readonly string[]; effectText?: string; canDiscardForHandLimit?: boolean; cannotBeDiscarded?: boolean; canRemoveAsAction?: boolean };
export type CardInstance = { instanceId: string; cardId: CardTypeId; revealedToOpponent?: boolean };
export const CARDS: readonly Card[] = [
  { id: 'attack-2', name: 'Attack Card 1', kind: 'attack', value: 2 },
  { id: 'attack-3', name: 'Attack Card 2', kind: 'attack', value: 3 },
  { id: 'defend-1', name: 'Defend Card', kind: 'defend', value: 1 },
  { id: 'echo-pulse', name: 'Echo Pulse', kind: 'perk', value: 1, levelEffects: ['Draw 1 card', 'Gain 1 Action', 'Restore 2 HP'] },
  { id: 'light-the-saber', name: 'Light the Saber', kind: 'attack', value: 2, effectText: 'Add -MOV stack. Draw a card, if lost combat.' },
  { id: 'dance-through', name: 'Dance Through', kind: 'attack', value: 2, effectText: 'After combat, Shinobi can move through 1 Square x3 times; can move through enemies. Deal 1 DMG to each enemy that was passed through. Must end on an empty Square.' },
  { id: 'force-disarm', name: 'Force Disarm', kind: 'attack', value: 1, effectText: 'Force enemy to Discard 1 Attack Card. If this enemy does not have an Attack Card, reveal their Hand instead. If lost combat, add -MOV stack to the enemy.' },
  { id: 'cut-them-legs', name: 'Cut Them Legs', kind: 'attack', value: 3, effectText: "Add -MOV stack after combat. If won combat, return this card to Shinobi's Hand." },
  { id: 'hello-there', name: 'Hello There', kind: 'attack', value: 1, effectText: "Additionally deal x2 Damage per one -MOV Stack. After combat, add a Headache Status Card to the opponent's Hand." },
  { id: 'block', name: 'Block', kind: 'defend', value: 2, effectText: 'Cancels the Attack card effect. If Shinobi received Damage during this combat, deal 1 Damage to the attacker and apply -MOV Stack.' },
  { id: 'flurry-defensive-strikes', name: 'Flurry of Defensive Strikes', kind: 'defend', value: 1, effectText: 'Before starting Combat, the attacking enemy receives 1 Damage. Shinobi can discard 1 card, so the enemy must discard 2 cards.' },
  { id: 'calmness', name: 'Calmness', kind: 'defend', value: 0, effectText: 'Negate all combat and after combat damage if the Attacking Player has -MOV stacks. Then remove all -MOV stacks from the Attacker and remove all buffs and debuffs from Shinobi. If damage is received, apply -MOV stack to the Attacker.' },
  { id: 'not-a-shinobi', name: 'Not a Shinobi You Looking For', kind: 'defend', value: 3, effectText: 'After combat, remove all negative effects from Shinobi and apply Lightsaber status.' },
  { id: 'double-jump', name: 'Double Jump', kind: 'defend', value: 2, effectText: 'Add 1 Defend Value per -MOV stack on the Attacking enemy. After combat, move Shinobi for 2 Squares; can move through enemies and apply -MOV stack if you do. Must end on an empty Square.' },
  { id: 'higround-advantage', name: 'Higround Advantage', kind: 'perk', value: 1, levelEffects: ['Draw a Card from Deck', 'Gain Lightsaber status or extend its duration', 'Next Attack card played is returned to your Hand'] },
  { id: 'force-throw', name: 'Force Throw', kind: 'perk', value: 1, levelEffects: ['Push an Object 2 Squares. Deal 1 Damage on collision and transfer remaining movement', 'Push an Object 3 Squares', 'Can push enemy Players. If two collide, both receive 1 Damage'] },
  { id: 'force-pull', name: 'Force Pull', kind: 'perk', value: 1, levelEffects: ['Pull an enemy or Object 1 Square toward Shinobi at Range 2', '+1 Square Pull and +1 Range', 'Apply -MOV Stack to target'] },
  { id: 'swiftform', name: 'Swiftform', kind: 'perk', value: 1, levelEffects: ['Gain +2 MOV for this turn. Can move through enemies', 'Get Lightsaber status at the end of this turn', 'When moving through each enemy, add -MOV stack once'] },
  { id: 'mind-tricks', name: 'Mind Tricks', kind: 'perk', value: 1, levelEffects: ['Shinobi may reveal 1 card, then each enemy discards 1 card', 'May reveal up to 2 cards, then each enemy discards up to 2 cards', "Shuffle Headache into each enemy's Deck"] },
  { id: 'arkane-arow', name: 'ARKANE AROW', kind: 'perk', value: 1, levelEffects: ['Target a Square within Range 3 and throw your Shield at it. Deal 1 Damage if it collides with an enemy', 'Throw Range becomes 4', "Push an enemy 1 Square on collision. Deal 1 additional Damage if the enemy can't be pushed"] },
  { id: 'arm-da-wiz', name: 'Arm da Wiz', kind: 'perk', value: 1, levelEffects: ['Recall the Shield within Range 3. If it was destroyed or is out of Range, create and equip a Shield', 'Deal 1 Damage when the recalled Shield collides with an enemy', 'Pull a collided enemy 1 Square toward Da Orkk and deal 1 additional Damage to each enemy adjacent to Da Orkk'] },
  { id: 'encourage', name: 'EncouRAGE', kind: 'perk', value: 1, levelEffects: ['Draw a Card from Deck', 'Gain 1 Rage stack', 'Also draw 1 random Card from Discard'] },
  { id: 'kyk', name: 'Kyk', kind: 'perk', value: 1, levelEffects: ['Push an adjacent Object 3 Squares. Deal 1 Damage to an enemy it collides with', '+1 Square Push', 'Deal 3 collision Damage, but destroy the pushed Object'] },
  { id: 'consume-rage', name: 'Consume Rage', kind: 'perk', value: 1, levelEffects: ['Remove 3 Rage stacks to heal 1 HP', 'Remove only 2 Rage stacks to heal 1 HP', "Add an Exhaust Card to each adjacent enemy's Hand"] },
  { id: 'fistbolt', name: 'Fistbolt', kind: 'attack', value: 2, effectText: 'Generate a Rage Stack before combat if Da Orkk has no Rage Stacks.' },
  { id: 'chain-punchin', name: 'Chain Punchin', kind: 'attack', value: 1, effectText: 'Generate an extra Action if Shield was not equipped during this combat; otherwise, drop Shield after combat. Generate 1 Rage Stack after combat.' },
  { id: 'teef-strike', name: 'Teef Strike', kind: 'attack', value: 1, effectText: "Add an Exhaust Card to the enemy's Hand after combat." },
  { id: 'chip-cast', name: 'Chip-cast', kind: 'attack', value: 2, effectText: "Add 1 Headache per Rage Stack to the enemy's Discard. Then shuffle all Exhaust and Headache Cards into that enemy's Deck." },
  { id: 'knee-blast', name: 'Knee Blast', kind: 'attack', value: 3, effectText: "After combat, push the enemy X Squares, where X is the number of Rage Stacks. Add 1 Headache Card to the enemy's Hand if they collide with anything." },
  { id: 'da-blokk', name: 'Da Blokk', kind: 'defend', value: 1, effectText: 'Cancel the Attack card effect. Generate 2 Rage Stacks if Da Orkk receives Damage in this combat.' },
  { id: 'double', name: 'Double!', kind: 'defend', value: 1, effectText: "Double all Rage received during this combat and until the end of the attacking Player's turn." },
  { id: 'arcane-shield', name: 'Arcane Shield', kind: 'defend', value: 2, effectText: 'Drop the Shield at a random Square adjacent to Da Orkk. If Shield was not equipped, gain 1 Rage Stack after combat.' },
  { id: 'countaspell', name: 'CountaSpell', kind: 'defend', value: 3, effectText: "After combat, add 1 Headache Card per Rage Stack to the attacking enemy's Discard Deck." },
  { id: 'mana-baryer', name: 'Mana Baryer', kind: 'defend', value: 2, effectText: 'Defend Value is 4 if Shield is equipped. Otherwise, recall Shield and deal 2 Damage if it passes through an enemy.' },
  { id: 'pinned', name: 'Pinned', kind: 'status', value: 1, effectText: "While this card is in your Hand, decrease Character movement range by 1. Remove one Pinned card at the end of your turn. Can't Discard in overstacking." },
  { id: 'headache', name: 'Headache', kind: 'status', value: 0, effectText: "Does nothing, fills the Hand. Can be Removed as an Action. Can't be Discarded.", cannotBeDiscarded: true, canRemoveAsAction: true },
  { id: 'exhaust', name: 'Exhaust', kind: 'status', value: 0, effectText: 'Your cards have -1 Attack and Defend Value. Can Discard normally. Can Remove by attaching to a played Attack or Defend card during Combat for -3 Value.', canDiscardForHandLimit: true },
] as const;
// Add Obi Wan Shinobi's unique cards here in creation order. His newest three
// cards become the test opening Hand; older cards remain in his Deck.
const OBI_WAN_CARD_IDS: readonly CardTypeId[] = ['light-the-saber', 'dance-through', 'force-disarm', 'cut-them-legs', 'hello-there', 'block', 'flurry-defensive-strikes', 'calmness', 'not-a-shinobi', 'double-jump', 'higround-advantage', 'force-throw', 'force-pull', 'swiftform', 'mind-tricks'];
const DA_ORKK_STARTING_PERK_IDS: readonly CardTypeId[] = ['arkane-arow', 'arm-da-wiz', 'encourage', 'kyk', 'consume-rage'];
const DA_ORKK_CARD_IDS: readonly CardTypeId[] = [...DA_ORKK_STARTING_PERK_IDS, 'fistbolt', 'chain-punchin', 'teef-strike', 'chip-cast', 'knee-blast', 'da-blokk', 'double', 'arcane-shield', 'countaspell', 'mana-baryer'];

export type PlayerState = {
  id: PlayerId; name: string; character: 'shinobi' | 'orkk' | 'dummy'; hp: number; maxHp: number; moveRange: number; attackRange: number; position: Cell;
  deck: CardInstance[]; hand: CardInstance[]; discard: CardInstance[];
  spellEcho: [CardInstance | null, CardInstance | null, CardInstance | null];
  actionsRemaining: number; perkUsed: boolean; freeMoveUsed: boolean; movementRemaining: number;
  movedThisTurn: boolean; lightsaberBuff: boolean; lightsaberStacks: number; lightsaberMovementProtection: boolean; highgroundAdvantageBuff: boolean;
  pinnedStacks: number; turnEndPinnedRemoved: boolean; swiftformMoveBonus: number; swiftformCanPassEnemies: boolean; swiftformPinsPassedEnemies: boolean; swiftformLightsaberAtTurnEnd: boolean; swiftformEnemyUnderfoot: PlayerId | null; swiftformPinnedEnemyIds: PlayerId[];
  rageStacks: number; shieldEquipped: boolean; rageGainLocked: boolean; doubleRageUntilEnemyTurnEnd: boolean;
};
export type PendingAttack = { attackerId: PlayerId; defenderId: PlayerId; cardId: CardTypeId; cardInstanceId: string; attackValue: number; returnToHandAfterCombat: boolean; shieldEquippedAtStart?: boolean; rageSpent?: number };
export type BoardObject = { id: string; name: string; hp: number; maxHp: number; position: Cell; kind?: 'wooden-box' | 'orkk-shield' | 'wall-pillar'; ownerId?: PlayerId };
export type ObjectPushAnimation = { id: string; objectId: string; from: Cell; to: Cell; dx: number; dy: number; collided: boolean; path?: Cell[]; removeOnComplete?: boolean; equipPlayerId?: PlayerId; teleport?: boolean; damage?: { playerId: PlayerId; amount: number; collision: boolean } };
export type GamePhase = 'active' | 'defending' | 'choosing-exhaust' | 'choosing-guard-discard' | 'choosing-dash-discard' | 'choosing-end-discard' | 'choosing-force-disarm-discard' | 'choosing-force-throw-target' | 'choosing-force-throw-direction' | 'choosing-force-pull-target' | 'choosing-arkane-arow-target' | 'choosing-arm-da-wiz-choice' | 'choosing-arm-da-wiz-target' | 'choosing-kyk-target' | 'choosing-kyk-direction' | 'choosing-mind-tricks-discard' | 'choosing-mind-tricks-enemy-discard' | 'flurry-offer' | 'choosing-flurry-enemy-discard' | 'dashing' | 'dance-through' | 'double-jump' | 'finished';
export type CombatReveal = { attackCardId: CardTypeId; defendCardId: CardTypeId | null; attackBase: number; attackTotal: number; defendBase: number; defendTotal: number; expiresAt: number; acknowledged: PlayerId[]; exhaust?: { defenseCommand: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>; eligible: PlayerId[]; decided: PlayerId[]; attached: PlayerId[] } };
export type PerkTargetingUndo = { hand: CardInstance[]; discard: CardInstance[]; spellEcho: [CardInstance | null, CardInstance | null, CardInstance | null]; actionsRemaining: number; perkUsed: boolean };
export type GameState = { turn: number; activePlayerId: PlayerId; phase: GamePhase; players: Record<PlayerId, PlayerState>; objects: BoardObject[]; elevations: Record<string, number>; objectPushAnimations: ObjectPushAnimation[]; pendingAttack: PendingAttack | null; combatReveal: CombatReveal | null; dashCancellation: { previousMovementRemaining: number; discardedCard: CardInstance | null } | null; danceThrough: { stepsRemaining: number; enemyUnderfoot: PlayerId | null; damagePrevented: boolean } | null; doubleJump: { playerId: PlayerId; stepsRemaining: number; enemyUnderfoot: PlayerId | null; resumePhase: GamePhase } | null; forceThrow: { casterId: PlayerId; level: number; distance: number; targetRange: number; targetKind: 'player' | 'object' | null; targetId: string | null; undo: PerkTargetingUndo | null } | null; forcePull: { casterId: PlayerId; level: number; distance: number; targetRange: number; undo: PerkTargetingUndo | null } | null; arkaneArow: { casterId: PlayerId; level: number; range: number; undo: PerkTargetingUndo | null } | null; armDaWiz: { casterId: PlayerId; level: number; range: number; canCreate: boolean; canRecall: boolean; undo: PerkTargetingUndo | null } | null; mindTricks: { casterId: PlayerId; level: number; maxDiscards: number; discarded: number; revealedInstanceIds: string[]; enemyId: PlayerId; enemyDiscardsRemaining: number; undo: PerkTargetingUndo | null } | null; forceDisarm: { targetId: PlayerId } | null; flurry: { defenderId: PlayerId; attackerId: PlayerId; resumePhase: GamePhase; remainingEnemyDiscards: number } | null; winner: PlayerId | null; log: string[] };
export type CommandResult = { ok: true; state: GameState } | { ok: false; state: GameState; error: string };

let instanceSequence = 0;
export function createInitialState(lineup: 'orkk-vs-dummy' | 'shinobi-vs-orkk' = 'orkk-vs-dummy'): GameState {
  const legacy = lineup === 'shinobi-vs-orkk';
  const p1 = createPlayer('P1', legacy ? 'Obi Wan Shinobi' : 'Da Orkk', legacy ? 'shinobi' : 'orkk', { x: 1, y: 3 });
  const p2 = createPlayer('P2', legacy ? 'Da Orkk' : 'Obi Wan Shinobi', legacy ? 'orkk' : 'shinobi', { x: BOARD_SIZE, y: 4 });
  if (legacy) drawCards(p1, 3);
  else p2.hand.push(...p2.deck.splice(0));
  const lineupLog = legacy ? [`Da Orkk enters with his spiked iron shield equipped.`, `Obi Wan Shinobi drew an opening Hand of ${p1.hand.length} cards.`] : [`Nagrand Arena loaded: an 8 by 8 battlefield.`, `Da Orkk and Obi Wan Shinobi each enter with all 15 unique Cards in Hand.`];
  const pillarCells: Cell[] = [{ x: 1, y: 0 }, { x: 1, y: 7 }, { x: 8, y: 0 }, { x: 8, y: 7 }, { x: 3, y: 2 }, { x: 3, y: 5 }, { x: 6, y: 2 }, { x: 6, y: 5 }];
  const objects: BoardObject[] = [
    ...pillarCells.map((position, index) => ({ id: `nagrand-pillar-${index + 1}`, name: 'Wooden Pillar', kind: 'wall-pillar' as const, hp: 999, maxHp: 999, position })),
    { id: 'nagrand-box-e1', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 5, y: 0 } },
    { id: 'nagrand-box-d8', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: 4, y: 7 } },
  ];
  const elevations = Object.fromEntries(['D4', 'D5', 'E4', 'E5'].map((label) => [label, 1]));
  return { turn: 1, activePlayerId: 'P1', phase: 'active', objects, elevations, objectPushAnimations: [], pendingAttack: null, combatReveal: null, dashCancellation: null, danceThrough: null, doubleJump: null, forceThrow: null, forcePull: null, arkaneArow: null, armDaWiz: null, mindTricks: null, forceDisarm: null, flurry: null, winner: null, players: { P1: p1, P2: p2 }, log: [...lineupLog, 'Nagrand Arena test duel initialized. Player 1 begins.'] };
}

export function createMultiplayerState(characters: Record<PlayerId, CharacterId>): GameState {
  // Reuse Nagrand's terrain setup while keeping its deliberately oversized test
  // hands completely separate from a real multiplayer match.
  const state = createInitialState();
  const characterName = (character: CharacterId) => character === 'orkk' ? 'Da Orkk' : 'Obi Wan Shinobi';
  state.players.P1 = createPlayer('P1', characterName(characters.P1), characters.P1, { x: 1, y: 3 });
  state.players.P2 = createPlayer('P2', characterName(characters.P2), characters.P2, { x: BOARD_SIZE, y: 4 });
  for (const player of Object.values(state.players)) {
    player.deck = shuffle([...player.deck, ...player.hand]);
    player.hand = [];
    drawCards(player, 3);
  }
  state.activePlayerId = Math.random() < 0.5 ? 'P1' : 'P2';
  state.log = [
    `${state.players.P1.name} and ${state.players.P2.name} enter Nagrand Arena.`,
    'Both Decks were shuffled and each Player drew 3 Cards.',
    `${state.players[state.activePlayerId].name} won the opening turn roll.`,
  ];
  return state;
}

function createPlayer(id: PlayerId, name: string, character: PlayerState['character'], position: Cell): PlayerState {
  const uniqueIds = character === 'shinobi' ? OBI_WAN_CARD_IDS : character === 'orkk' ? DA_ORKK_CARD_IDS : [];
  const uniqueCards = uniqueIds.map((cardId) => ({ instanceId: `${id}-${++instanceSequence}`, cardId }));
  const hand: CardInstance[] = [];
  const dummyPool = CARDS.filter((card) => card.kind !== 'status' && !DA_ORKK_CARD_IDS.includes(card.id));
  const dummyDeck = shuffle(Array.from({ length: 10 }, () => ({ instanceId: `${id}-${++instanceSequence}`, cardId: dummyPool[Math.floor(Math.random() * dummyPool.length)].id })));
  const deck = character === 'shinobi' ? shuffle(uniqueCards) : character === 'dummy' ? dummyDeck : [];
  if (character === 'orkk') hand.push(...uniqueCards);
  const isOrkk = character === 'orkk';
  const maximumHp = isOrkk ? 26 : 20;
  return { id, name, character, hp: maximumHp, maxHp: maximumHp, moveRange: isOrkk ? 3 : 2, attackRange: isOrkk ? 1 : 2, position, deck, hand, discard: [], spellEcho: [null, null, null], actionsRemaining: 2, perkUsed: false, freeMoveUsed: false, movementRemaining: 0, movedThisTurn: false, lightsaberBuff: false, lightsaberStacks: 0, lightsaberMovementProtection: false, highgroundAdvantageBuff: false, pinnedStacks: 0, turnEndPinnedRemoved: false, swiftformMoveBonus: 0, swiftformCanPassEnemies: false, swiftformPinsPassedEnemies: false, swiftformLightsaberAtTurnEnd: false, swiftformEnemyUnderfoot: null, swiftformPinnedEnemyIds: [], rageStacks: 0, shieldEquipped: isOrkk, rageGainLocked: false, doubleRageUntilEnemyTurnEnd: false };
}

export function distance(a: Cell, b: Cell): number { return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }
export function movementPath(state: GameState, player: PlayerState, destination: Cell): Cell[] {
  if (!player.swiftformCanPassEnemies) return [destination];
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: player.position, path: [] }];
  const visited = new Set([key(player.position)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cell.x === destination.x && current.cell.y === destination.y) return current.path;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE || visited.has(key(next))) continue;
      if (state.objects.some((object) => object.position.x === next.x && object.position.y === next.y)) continue;
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
export function cellLabel(cell: Cell): string { return `${String.fromCharCode(64 + cell.x)}${cell.y + 1}`; }
export function cardDefinition(instance: CardInstance): Card { return CARDS.find((card) => card.id === instance.cardId)!; }

const HIGHGROUND_PROTECTION = new Set(['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5']);
const BONUS_DRAW_SQUARES = new Set(['D1', 'E1', 'D8', 'E8']);
function isHighGround(state: GameState, cell: Cell): boolean { return (state.elevations[cellLabel(cell)] ?? 0) > 0; }
function ownedDefenseBonus(player: PlayerState): number {
  const owned = player.id === 'P1' ? new Set(['A4', 'A5']) : new Set(['H4', 'H5']);
  return owned.has(cellLabel(player.position)) ? 1 : 0;
}
export function hasLineOfSight(state: GameState, from: Cell, to: Cell): boolean {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  for (let step = 1; step < steps; step++) {
    const cell = { x: Math.round(from.x + (to.x - from.x) * step / steps), y: Math.round(from.y + (to.y - from.y) * step / steps) };
    if (state.objects.some((object) => object.kind === 'wall-pillar' && object.position.x === cell.x && object.position.y === cell.y)) return false;
  }
  return true;
}

function dealDamage(state: GameState, target: PlayerState, amount: number, collision = false): number {
  const dealt = Math.min(target.hp, Math.max(0, amount));
  target.hp -= dealt;
  if (dealt > 0) state.objectPushAnimations.push({ id: `${state.turn}-damage-${target.id}-${state.log.length}-${state.objectPushAnimations.length}`, objectId: '', from: { ...target.position }, to: { ...target.position }, dx: 0, dy: 0, collided: false, damage: { playerId: target.id, amount: dealt, collision } });
  if (dealt > 0 && target.character === 'orkk' && state.activePlayerId !== target.id && !target.rageGainLocked) {
    const gainedRage = target.doubleRageUntilEnemyTurnEnd ? 2 : 1;
    target.rageStacks += gainedRage;
    target.rageGainLocked = true;
    state.log.unshift(`${target.name} gained ${gainedRage} Rage from taking damage during an enemy turn${gainedRage > 1 ? ' while Double! was active' : ''} (${target.rageStacks} total).`);
  }
  return dealt;
}

export function applyCommand(source: GameState, rawCommand: unknown): CommandResult {
  const parsed = GameCommandSchema.safeParse(rawCommand);
  if (!parsed.success) return fail(source, 'Invalid command.');
  const command = parsed.data;
  const state = structuredClone(source);
  if (command.type === 'ack-combat') return acknowledgeCombat(state, command.playerId);
  if (command.type === 'exhaust-decision') return resolveExhaustDecision(state, command.playerId, command.use);
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
  if (command.type === 'cancel-targeting') return cancelCardTargeting(state, command.playerId);
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
  if (!['active', 'dashing', 'dance-through', 'double-jump'].includes(state.phase)) return fail(source, 'Complete the current card choice first.');

  const player = state.players[command.playerId];
  if (player.swiftformEnemyUnderfoot && command.type !== 'move') return fail(source, 'Shinobi must continue moving and leave the enemy-occupied square before taking another action or ending the turn.');
  if (command.type === 'remove-status') {
    if (state.phase !== 'active') return fail(source, 'Status Cards can only be Removed as an Action during the active phase.');
    if (player.actionsRemaining <= 0) return fail(source, 'No actions remain.');
    const instance = player.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance) return fail(source, 'That Status Card is not in the Hand.');
    const status = cardDefinition(instance);
    if (status.kind !== 'status' || !status.canRemoveAsAction) return fail(source, 'This card cannot be Removed as an Action.');
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
    if (player.movementRemaining <= 0) return fail(source, 'No movement remains. Use Free Move + Draw Card first.');
    const path = movementPath(state, player, command.to);
    const cost = player.swiftformCanPassEnemies ? path.length : distance(player.position, command.to);
    if (cost < 1 || cost > player.movementRemaining) return fail(source, 'That square costs more movement than remains.');
    const targetEnemy = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.position.x === command.to.x && candidate.position.y === command.to.y);
    if (state.objects.some((object) => object.position.x === command.to.x && object.position.y === command.to.y)) return fail(source, 'That square is occupied by an Object.');
    if (targetEnemy && (!player.swiftformCanPassEnemies || player.movementRemaining - cost <= 0)) return fail(source, 'Shinobi may pass through an enemy with Swiftform, but must retain enough movement to leave their square.');
    const previousUnderfoot = player.swiftformEnemyUnderfoot;
    player.position = command.to;
    player.movementRemaining -= cost;
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
    markCharacterMoved(player, 'voluntary');
    if (state.phase === 'dashing') state.dashCancellation = null;
    state.log.unshift(`${player.name} moved ${cost} to ${cellLabel(command.to)} (${player.movementRemaining} movement left).`);
    if (state.phase === 'dashing' && player.movementRemaining === 0) return ok(endTurn(state));
    return ok(state);
  }

  if (state.phase !== 'active') return fail(source, 'Only movement is available during Dash.');
  if (command.type === 'free-move') {
    if (player.freeMoveUsed) return fail(source, 'Free Move was already used this turn.');
    player.freeMoveUsed = true;
    const grantedMovement = effectiveMoveRange(player);
    player.movementRemaining += grantedMovement;
    const drawn = drawCards(player, 1);
    state.log.unshift(`${player.name} used Free Move, drew ${drawn} card, and gained ${grantedMovement} movement.`);
    return ok(state);
  }
  if (command.type === 'attack') {
    if (player.actionsRemaining <= 0) return fail(source, 'No actions remain.');
    const instance = player.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance || cardDefinition(instance).kind !== 'attack') return fail(source, 'That Attack card is not in the hand.');
    const defender = state.players[command.targetId];
    if (command.targetId === command.playerId) return fail(source, 'A character cannot attack itself.');
    if (distance(player.position, defender.position) > player.attackRange) return fail(source, 'Target is outside the attack range.');
    if (!hasLineOfSight(state, player.position, defender.position)) return fail(source, 'A Wall Object blocks line of sight to that target.');
    if (isHighGround(state, player.position) && !isHighGround(state, defender.position) && HIGHGROUND_PROTECTION.has(cellLabel(defender.position)) && distance(player.position, defender.position) > 1) return fail(source, 'Highground Protection prevents this attack unless the High Ground attacker is adjacent.');
    const card = cardDefinition(instance);
    Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
    if (card.id === 'fistbolt' && player.character === 'orkk' && player.rageStacks === 0) {
      player.rageStacks = 1;
      state.log.unshift(`${player.name} generated 1 Rage with Fistbolt before combat.`);
    }
    discardFromHand(player, instance.instanceId);
    player.actionsRemaining -= 1;
    const lightsaberBonus = player.character === 'shinobi' && player.lightsaberBuff ? 1 : 0;
    const rageBonus = player.character === 'orkk' ? player.rageStacks : 0;
    const highGroundBonus = isHighGround(state, player.position) && !isHighGround(state, defender.position) ? 1 : 0;
    const exhaustPenalty = player.hand.filter((entry) => entry.cardId === 'exhaust').length;
    if (rageBonus > 0) player.rageStacks = 0;
    const returnToHandAfterCombat = player.highgroundAdvantageBuff;
    if (returnToHandAfterCombat) player.highgroundAdvantageBuff = false;
    state.pendingAttack = { attackerId: player.id, defenderId: defender.id, cardId: card.id, cardInstanceId: instance.instanceId, attackValue: card.value + lightsaberBonus + rageBonus + highGroundBonus - exhaustPenalty, returnToHandAfterCombat, shieldEquippedAtStart: player.shieldEquipped, rageSpent: rageBonus };
    state.phase = 'defending';
    state.log.unshift(`${player.name} played and discarded ${card.name} (${card.value + lightsaberBonus + rageBonus + highGroundBonus - exhaustPenalty}${lightsaberBonus ? ', including +1 Lightsaber' : ''}${rageBonus ? `, including +${rageBonus} Rage` : ''}${highGroundBonus ? ', including +1 High Ground' : ''}${exhaustPenalty ? `, including -${exhaustPenalty} Exhaust` : ''}). ${defender.name} may defend.`);
    return ok(state);
  }
  if (command.type === 'play-perk') return playPerkFromHand(state, player, command);
  if (command.type === 'use-echo-perk') return useEchoPerk(state, player, command.position);
  if (command.type === 'guard') {
    if (!player.freeMoveUsed) return fail(source, 'Use Free Move + Draw Card before selecting Guard.');
    const drawn = drawCards(player, 1);
    if (player.hand.length === 0) return fail(source, 'There is no card available to discard.');
    state.phase = 'choosing-guard-discard';
    state.log.unshift(`${player.name} chose Guard and drew ${drawn} card. Select 1 card to discard.`);
    return ok(state);
  }
  if (command.type === 'dash') {
    if (!player.freeMoveUsed) return fail(source, 'Use Free Move + Draw Card before selecting Dash.');
    if (player.hand.length === 0) return fail(source, 'There is no card available to discard.');
    state.dashCancellation = { previousMovementRemaining: player.movementRemaining, discardedCard: null };
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
  if (perk.id === 'arkane-arow' && (player.character !== 'orkk' || !player.shieldEquipped)) return fail(state, 'ARKANE AROW requires Da Orkk to have his Shield equipped.');
  if (perk.id === 'arm-da-wiz' && (player.character !== 'orkk' || player.shieldEquipped)) return fail(state, 'Arm da Wiz requires Da Orkk to have his Shield unequipped.');
  Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
  const targetingUndo = snapshotPerkTargeting(player);
  player.actionsRemaining -= 1;
  player.perkUsed = true;
  if (command.destination === 'direct') {
    discardFromHand(player, instance.instanceId);
    applyPerkEffects(state, player, perk, 1);
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
  if (perk.id === 'arkane-arow' && (player.character !== 'orkk' || !player.shieldEquipped)) return fail(state, 'ARKANE AROW requires Da Orkk to have his Shield equipped.');
  if (perk.id === 'arm-da-wiz' && (player.character !== 'orkk' || player.shieldEquipped)) return fail(state, 'Arm da Wiz requires Da Orkk to have his Shield unequipped.');
  Object.values(state.players).forEach((entry) => { entry.rageGainLocked = false; });
  const targetingUndo = snapshotPerkTargeting(player);
  player.actionsRemaining -= 1;
  player.perkUsed = true;
  applyPerkEffects(state, player, perk, position);
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
  return null;
}

function applyPerkEffects(state: GameState, player: PlayerState, perk: Card, level: number) {
  if (perk.id === 'echo-pulse') {
    if (level >= 1) { const drawn = drawCards(player, 1); state.log.unshift(`${perk.name} level 1: ${player.name} drew ${drawn} card.`); }
    if (level >= 2) { player.actionsRemaining += 1; state.log.unshift(`${perk.name} level 2: ${player.name} gained 1 Action.`); }
    if (level >= 3) { const restored = Math.min(2, player.maxHp - player.hp); player.hp += restored; state.log.unshift(`${perk.name} level 3: ${player.name} restored ${restored} HP.`); }
    return;
  }
  if (perk.id === 'higround-advantage') {
    if (level >= 1) { const drawn = drawCards(player, 1); state.log.unshift(`${perk.name} level 1: ${player.name} drew ${drawn} card.`); }
    if (level >= 2) { player.lightsaberBuff = true; player.lightsaberStacks += 1; state.log.unshift(`${perk.name} level 2: Lightsaber gained 1 duration stack (${player.lightsaberStacks} total).`); }
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
    state.forceThrow = { casterId: player.id, level, distance: level >= 2 ? 3 : 2, targetRange: player.attackRange, targetKind: null, targetId: null, undo: null };
    state.phase = 'choosing-force-throw-target';
    state.log.unshift(`${perk.name}: select ${canTargetPlayer ? 'an Object or enemy Player' : 'an Object'} to push.`);
    return;
  }
  if (perk.id === 'force-pull') {
    state.forcePull = { casterId: player.id, level, distance: level >= 2 ? 2 : 1, targetRange: level >= 2 ? 3 : 2, undo: null };
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
        if (card.cardId === 'pinned') player.pinnedStacks += 1;
        recovered = 1;
        state.log.unshift(`EncouRAGE level 3: ${player.name} randomly recovered ${definition.name} from Discard.`);
      }
      if (!recovered) state.log.unshift(`EncouRAGE level 3: ${player.name}'s Discard was empty.`);
    }
    return;
  }
  if (perk.id === 'kyk') {
    const adjacentObjects = state.objects.filter((object) => distance(object.position, player.position) === 1);
    if (adjacentObjects.length === 0) { state.log.unshift('Kyk found no adjacent Object.'); return; }
    state.forceThrow = { casterId: player.id, level, distance: level >= 2 ? 4 : 3, targetRange: 1, targetKind: null, targetId: null, undo: null };
    state.phase = 'choosing-kyk-target';
    state.log.unshift('Kyk: select an adjacent Object to push.');
    return;
  }
  if (perk.id === 'consume-rage') {
    const rageCost = level >= 2 ? 2 : 3;
    if (player.rageStacks >= rageCost) {
      player.rageStacks -= rageCost;
      const healed = Math.min(1, player.maxHp - player.hp); player.hp += healed;
      state.log.unshift(`Consume Rage removed ${rageCost} Rage and healed ${player.name} for ${healed} HP.`);
    } else state.log.unshift(`Consume Rage could not heal ${player.name}: ${rageCost} Rage stacks were required.`);
    if (level >= 3) {
      const adjacentEnemies = Object.values(state.players).filter((entry) => entry.id !== player.id && distance(entry.position, player.position) === 1);
      adjacentEnemies.forEach((enemy) => enemy.hand.push({ instanceId: `${enemy.id}-status-${++instanceSequence}`, cardId: 'exhaust', revealedToOpponent: true }));
      state.log.unshift(`Consume Rage level 3 added Exhaust to ${adjacentEnemies.length} adjacent enem${adjacentEnemies.length === 1 ? 'y' : 'ies'}.`);
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
    const range = 3;
    const shields = state.objects.filter((entry) => entry.kind === 'orkk-shield' && entry.ownerId === player.id);
    const canRecall = shields.some((shield) => armDaWizPath(state, shield, player.position, range).length > 0);
    const canCreate = shields.length === 0 || !canRecall;
    state.armDaWiz = { casterId: player.id, level, range, canCreate, canRecall, undo: null };
    state.phase = 'choosing-arm-da-wiz-choice';
    state.log.unshift(`${perk.name} level ${level}: choose whether to recall an in-range Shield${canCreate ? ' or create and equip a replacement' : ''}.`);
    return;
  }
  if (perk.id === 'swiftform') {
    player.swiftformMoveBonus = 2;
    player.swiftformCanPassEnemies = true;
    player.swiftformPinnedEnemyIds = [];
    if (player.freeMoveUsed) player.movementRemaining += 2;
    if (level >= 2) player.swiftformLightsaberAtTurnEnd = true;
    if (level >= 3) player.swiftformPinsPassedEnemies = true;
    state.log.unshift(`Swiftform level ${level}: ${player.name} gained +2 MOV and may move through enemies${level >= 3 ? ', applying Pinned when passing through them' : ''}.`);
    return;
  }
  if (perk.id === 'mind-tricks') {
    const enemyId: PlayerId = player.id === 'P1' ? 'P2' : 'P1';
    state.mindTricks = { casterId: player.id, level, maxDiscards: level >= 2 ? 2 : 1, discarded: 0, revealedInstanceIds: [], enemyId, enemyDiscardsRemaining: 0, undo: null };
    state.phase = 'choosing-mind-tricks-discard';
    state.log.unshift(`Mind Tricks level ${level}: ${player.name} may reveal up to ${level >= 2 ? 2 : 1} card${level >= 2 ? 's' : ''}, or resolve it without revealing.`);
  }
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
  return resolveDefense(state, defenseCommand, true, defenderAttached);
}

function resolveDefense(state: GameState, command: Extract<GameCommand, { type: 'defend' | 'pass-defense' }>, exhaustResolved = false, defenderAttachedExhaust = false): CommandResult {
  const pending = state.pendingAttack;
  if (state.phase !== 'defending' || !pending) return fail(state, 'There is no attack to defend.');
  if (pending.defenderId !== command.playerId) return fail(state, 'Only the targeted player may respond.');
  const defender = state.players[command.playerId];
  const shieldEquippedAtDefenseStart = defender.shieldEquipped;
  if (!exhaustResolved) {
    const attacker = state.players[pending.attackerId];
    const eligible: PlayerId[] = [];
    if (attacker.hand.some((card) => card.cardId === 'exhaust')) eligible.push(attacker.id);
    if (command.type === 'defend' && defender.hand.some((card) => card.cardId === 'exhaust')) eligible.push(defender.id);
    if (eligible.length > 0) {
      let previewDefenseBase = 0; let previewDefenseTotal = 0; let previewDefenseCard: CardTypeId | null = null;
      if (command.type === 'defend') {
        const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId);
        if (!instance || cardDefinition(instance).kind !== 'defend') return fail(state, 'That Defend card is not in the hand.');
        const definition = cardDefinition(instance); previewDefenseCard = instance.cardId; previewDefenseBase = definition.value;
        previewDefenseTotal = (definition.id === 'mana-baryer' && defender.shieldEquipped ? 4 : definition.value + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0) + (defender.character === 'orkk' && defender.shieldEquipped ? 1 : 0)) + ownedDefenseBonus(defender)
          + (definition.id === 'double-jump' ? pinnedCount(attacker) : 0) - defender.hand.filter((card) => card.cardId === 'exhaust').length;
      }
      state.combatReveal = { attackCardId: pending.cardId, defendCardId: previewDefenseCard, attackBase: cardDefinition({ instanceId: '', cardId: pending.cardId }).value, attackTotal: pending.attackValue, defendBase: previewDefenseBase, defendTotal: previewDefenseTotal, expiresAt: Date.now() + 86_400_000, acknowledged: [], exhaust: { defenseCommand: command, eligible, decided: [], attached: [] } };
      state.phase = 'choosing-exhaust';
      state.log.unshift(`Exhaust decision: ${eligible.map((id) => state.players[id].name).join(' and ')} may attach one Exhaust for -3 Value.`);
      return ok(state);
    }
  }
  let defenseValue = 0;
  let defenseBaseValue = 0;
  let defenseCardId: CardTypeId | null = null;
  if (command.type === 'defend') {
    const instance = defender.hand.find((card) => card.instanceId === command.cardInstanceId);
    if (!instance || cardDefinition(instance).kind !== 'defend') return fail(state, 'That Defend card is not in the hand.');
    defenseCardId = instance.cardId;
    const defenseCard = cardDefinition(instance);
    defenseBaseValue = defenseCard.value;
    const doubleJumpBonus = defenseCard.id === 'double-jump' ? pinnedCount(state.players[pending.attackerId]) : 0;
    defenseValue = (defenseCard.id === 'mana-baryer' && shieldEquippedAtDefenseStart ? 4 : defenseCard.value + (defender.character === 'shinobi' && defender.lightsaberBuff ? 1 : 0) + (defender.character === 'orkk' && shieldEquippedAtDefenseStart ? 1 : 0)) + ownedDefenseBonus(defender) + doubleJumpBonus - defender.hand.filter((card) => card.cardId === 'exhaust').length - (defenderAttachedExhaust ? 3 : 0);
    discardFromHand(defender, instance.instanceId);
    if (defenseCardId === 'flurry-defensive-strikes') {
      const attacker = state.players[pending.attackerId];
      dealDamage(state, attacker, 1);
      state.log.unshift(`Flurry of Defensive Strikes dealt 1 pre-combat damage to ${attacker.name}.`);
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
  const calmnessNegatesDamage = defenseCardId === 'calmness' && pinnedCount(attackerBeforeCombatEffects) > 0;
  const attackCardDebuffsPrevented = calmnessNegatesDamage || defenseCardId === 'not-a-shinobi';
  const calculatedDamage = Math.max(0, pending.attackValue - defenseValue);
  const damage = calmnessNegatesDamage ? 0 : calculatedDamage;
  if (defenseCardId === 'double') {
    defender.doubleRageUntilEnemyTurnEnd = true;
    state.log.unshift(`Double! will double all Rage ${defender.name} receives until the end of ${state.players[pending.attackerId].name}'s turn.`);
  }
  dealDamage(state, defender, damage);
  state.log.unshift(`${defender.name} ${defenseCardId ? `discarded ${cardDefinition({ instanceId: '', cardId: defenseCardId }).name} (${defenseValue})` : 'declined to defend'} and received ${damage} damage.`);
  if (defenseCardId === 'calmness') {
    if (calmnessNegatesDamage) {
      const removedStacks = pinnedCount(attackerBeforeCombatEffects);
      removeAllDebuffs(attackerBeforeCombatEffects);
      removeAllBuffs(defender);
      removeAllDebuffs(defender);
      state.log.unshift(`Calmness negated ${calculatedDamage} combat damage, removed ${removedStacks} Pinned stacks from ${attackerBeforeCombatEffects.name}, and removed all buffs and debuffs from Shinobi.`);
    } else if (damage > 0) {
      const pinnedStacks = applyPinned(attackerBeforeCombatEffects, 1);
      state.log.unshift(`Calmness received damage and applied 1 Pinned stack to ${attackerBeforeCombatEffects.name} (${pinnedStacks} total).`);
    }
  }
  if (defenseCardId === 'not-a-shinobi') {
    removeAllDebuffs(defender);
    defender.lightsaberBuff = true;
    state.log.unshift(`Not a Shinobi You Looking For removed all negative effects from ${defender.name} and applied Lightsaber.`);
  }
  const attackEffectsCancelled = defenseCardId === 'block' || defenseCardId === 'da-blokk';
  if (attackEffectsCancelled) state.log.unshift(`${cardDefinition({ instanceId: '', cardId: defenseCardId! }).name} cancelled the Attack card's additional effects.`);
  if (defenseCardId === 'block' && damage > 0) {
    const attacker = state.players[pending.attackerId];
    dealDamage(state, attacker, 1);
    const pinnedStacks = applyPinned(attacker, 1);
    state.log.unshift(`Block retaliated for 1 damage and applied 1 Pinned stack to ${attacker.name} (${pinnedStacks} total).`);
  }
  if (defenseCardId === 'da-blokk' && damage > 0) {
    defender.rageStacks += 1;
    state.log.unshift(`Da Blokk generated 1 additional Rage; together with damage Rage, ${defender.name} gained 2 Rage from this combat (${defender.rageStacks} total).`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'light-the-saber') {
    if (!attackCardDebuffsPrevented) {
      const pinnedStacks = applyPinned(defender, 1);
      state.log.unshift(`Light the Saber added 1 Pinned stack to ${defender.name} (${pinnedStacks} total).`);
    }
    if (damage === 0) {
      const attacker = state.players[pending.attackerId];
      const drawn = drawCards(attacker, 1);
      state.log.unshift(`Light the Saber lost combat; ${attacker.name} drew ${drawn} card.`);
    }
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'force-disarm' && damage === 0) {
    const pinnedStacks = applyPinned(defender, 1);
    state.log.unshift(`Force Disarm lost combat and added 1 Pinned stack to ${defender.name} (${pinnedStacks} total).`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'cut-them-legs') {
    if (!attackCardDebuffsPrevented) {
      const pinnedStacks = applyPinned(defender, 1);
      state.log.unshift(`Cut Them Legs added 1 Pinned stack to ${defender.name} (${pinnedStacks} total).`);
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
  if (!attackEffectsCancelled && pending.cardId === 'hello-there') {
    const defenderPinned = pinnedCount(defender);
    const additionalDamage = defenderPinned * 2;
    if (additionalDamage > 0 && !calmnessNegatesDamage) {
      dealDamage(state, defender, additionalDamage);
      state.log.unshift(`Hello There dealt ${additionalDamage} additional damage from ${defenderPinned} Pinned stack${defenderPinned === 1 ? '' : 's'}.`);
    } else if (additionalDamage > 0) {
      state.log.unshift(`Calmness negated ${additionalDamage} additional damage from Hello There.`);
    } else {
      state.log.unshift('Hello There found no Pinned stacks and dealt no additional damage.');
    }
    if (!attackCardDebuffsPrevented) {
      defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
      state.log.unshift(`Hello There added a Headache Status Card to ${defender.name}'s Hand.`);
    } else state.log.unshift('The defending card prevented Hello There from applying Headache during this combat.');
  }
  if (attackCardDebuffsPrevented && ['light-the-saber', 'force-disarm', 'cut-them-legs'].includes(pending.cardId)) {
    state.log.unshift("Calmness prevented the attacking card from applying debuffs during this combat.");
  }
  if (pending.returnToHandAfterCombat) {
    const attackerForReturn = state.players[pending.attackerId];
    const discardIndex = attackerForReturn.discard.findIndex((card) => card.instanceId === pending.cardInstanceId);
    if (discardIndex >= 0) {
      const [returnedCard] = attackerForReturn.discard.splice(discardIndex, 1);
      returnedCard.revealedToOpponent = false;
      attackerForReturn.hand.push(returnedCard);
      state.log.unshift(`Higround Advantage returned ${cardDefinition(returnedCard).name} to ${attackerForReturn.name}'s Hand.`);
    }
  }
  if (!attackEffectsCancelled && pending.cardId === 'chain-punchin') {
    const orkk = state.players[pending.attackerId];
    if (pending.shieldEquippedAtStart) {
      const dropSquares: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const cell = { x: orkk.position.x + dx, y: orkk.position.y + dy };
        if (cell.x < 1 || cell.x > BOARD_SIZE || cell.y < 0 || cell.y >= BOARD_SIZE) continue;
        const occupied = Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)
          || state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
        if (!occupied) dropSquares.push(cell);
      }
      const dropSquare = dropSquares[0];
      if (dropSquare) unequipOrkkShield(state, orkk.id, dropSquare);
      else state.log.unshift(`Chain Punchin could not drop ${orkk.name}'s Shield because no adjacent Square was empty.`);
    } else {
      orkk.actionsRemaining += 1;
      state.log.unshift(`Chain Punchin generated 1 extra Action because ${orkk.name}'s Shield was not equipped during combat.`);
    }
    orkk.rageStacks += 1;
    state.log.unshift(`Chain Punchin generated 1 Rage after combat (${orkk.rageStacks} total).`);
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'teef-strike') {
    defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'exhaust', revealedToOpponent: true });
    state.log.unshift(`Teef Strike added an Exhaust Status Card to ${defender.name}'s Hand after combat.`);
  }
  if (!attackEffectsCancelled && !attackCardDebuffsPrevented && pending.cardId === 'chip-cast') {
    const headacheCount = pending.rageSpent ?? 0;
    for (let index = 0; index < headacheCount; index++) defender.discard.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
    const isChipStatus = (card: CardInstance) => card.cardId === 'exhaust' || card.cardId === 'headache';
    const handStatuses = defender.hand.filter(isChipStatus);
    const discardStatuses = defender.discard.filter(isChipStatus);
    defender.hand = defender.hand.filter((card) => !isChipStatus(card));
    defender.discard = defender.discard.filter((card) => !isChipStatus(card));
    const shuffledStatuses = [...handStatuses, ...discardStatuses].map((card) => ({ ...card, revealedToOpponent: false }));
    defender.deck = shuffle([...defender.deck, ...shuffledStatuses]);
    state.log.unshift(`Chip-cast added ${headacheCount} Headache Card${headacheCount === 1 ? '' : 's'} and shuffled ${shuffledStatuses.length} Exhaust and Headache Card${shuffledStatuses.length === 1 ? '' : 's'} into ${defender.name}'s Deck.`);
  }
  if (!attackEffectsCancelled && pending.cardId === 'knee-blast') {
    const pushDistance = pending.rageSpent ?? 0;
    const attacker = state.players[pending.attackerId];
    const dx = Math.sign(defender.position.x - attacker.position.x);
    const dy = Math.sign(defender.position.y - attacker.position.y);
    const collided = pushDistance > 0 && pushEntity(state, { kind: 'player', id: defender.id, position: defender.position }, dx, dy, pushDistance, 1, attacker.id, false);
    state.log.unshift(`Knee Blast pushed ${defender.name} ${pushDistance} Square${pushDistance === 1 ? '' : 's'} away from ${attacker.name}${collided ? ' until a collision' : ''}.`);
    if (collided && !attackCardDebuffsPrevented) {
      defender.hand.push({ instanceId: `${defender.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
      state.log.unshift(`Knee Blast's collision added a Headache Status Card to ${defender.name}'s Hand.`);
    }
  }
  if (defenseCardId === 'arcane-shield') {
    if (shieldEquippedAtDefenseStart) {
      const adjacentEmpty: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const cell = { x: defender.position.x + dx, y: defender.position.y + dy };
        if (cell.x < 1 || cell.x > BOARD_SIZE || cell.y < 0 || cell.y >= BOARD_SIZE) continue;
        const occupied = Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)
          || state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
        if (!occupied) adjacentEmpty.push(cell);
      }
      const dropSquare = adjacentEmpty[Math.floor(Math.random() * adjacentEmpty.length)];
      if (dropSquare) unequipOrkkShield(state, defender.id, dropSquare);
      else state.log.unshift(`Arcane Shield could not drop ${defender.name}'s Shield because no adjacent Square was empty.`);
    } else {
      defender.rageStacks += 1;
      state.log.unshift(`Arcane Shield generated 1 Rage after combat because ${defender.name}'s Shield was not equipped (${defender.rageStacks} total).`);
    }
  }
  if (defenseCardId === 'countaspell') {
    const attacker = state.players[pending.attackerId];
    const headacheCount = defender.rageStacks;
    for (let index = 0; index < headacheCount; index++) attacker.discard.push({ instanceId: `${attacker.id}-status-${++instanceSequence}`, cardId: 'headache', revealedToOpponent: true });
    state.log.unshift(`CountaSpell added ${headacheCount} Headache Card${headacheCount === 1 ? '' : 's'} to ${attacker.name}'s Discard Deck after combat.`);
  }
  if (defenseCardId === 'mana-baryer' && !shieldEquippedAtDefenseStart) {
    const shield = state.objects.find((entry) => entry.kind === 'orkk-shield' && entry.ownerId === defender.id);
    if (shield) {
      const path = armDaWizPath(state, shield, defender.position, 16);
      if (path.length > 0) {
        const crossedEnemyIds = new Set<PlayerId>();
        for (const cell of path) {
          const enemy = Object.values(state.players).find((entry) => entry.id !== defender.id && entry.position.x === cell.x && entry.position.y === cell.y);
          if (!enemy || crossedEnemyIds.has(enemy.id)) continue;
          crossedEnemyIds.add(enemy.id);
          dealDamage(state, enemy, 2, true);
          state.log.unshift(`Mana Baryer's Shield passed through ${enemy.name} and dealt 2 damage.`);
        }
        state.objectPushAnimations.push({ id: `${state.turn}-mana-baryer-${state.objectPushAnimations.length}`, objectId: shield.id, from: { ...shield.position }, to: { ...defender.position }, dx: Math.sign(defender.position.x - shield.position.x), dy: Math.sign(defender.position.y - shield.position.y), collided: crossedEnemyIds.size > 0, path: path.map((cell) => ({ ...cell })), removeOnComplete: true, equipPlayerId: defender.id });
        state.objects = state.objects.filter((entry) => entry.id !== shield.id);
        defender.shieldEquipped = true;
        state.log.unshift(`Mana Baryer recalled and equipped ${defender.name}'s Shield after combat.`);
      } else state.log.unshift(`Mana Baryer could not find a walkable path from the Shield to ${defender.name}.`);
    } else state.log.unshift('Mana Baryer found no Shield on the Board to recall.');
  }
  state.pendingAttack = null;
  const attacker = state.players[pending.attackerId];
  if (attacker.hp === 0) { state.phase = 'finished'; state.winner = defender.id; state.log.unshift(`${defender.name} wins the duel!`); }
  else if (defender.hp === 0) { state.phase = 'finished'; state.winner = pending.attackerId; state.log.unshift(`${attacker.name} wins the duel!`); }
  else if (!attackEffectsCancelled && pending.cardId === 'force-disarm') {
    const attackCards = defender.hand.filter((card) => cardDefinition(card).kind === 'attack');
    if (attackCards.length > 0) {
      state.phase = 'choosing-force-disarm-discard';
      state.forceDisarm = { targetId: defender.id };
      state.log.unshift(`${defender.name} must discard 1 Attack card due to Force Disarm.`);
    } else {
      defender.hand.forEach((card) => { card.revealedToOpponent = true; });
      state.phase = 'active';
      state.log.unshift(`${defender.name} had no Attack card; Force Disarm revealed their Hand.`);
    }
  }
  else if (!attackEffectsCancelled && pending.cardId === 'dance-through') {
    state.phase = 'dance-through';
    state.danceThrough = { stepsRemaining: 3, enemyUnderfoot: null, damagePrevented: calmnessNegatesDamage };
    state.log.unshift('Dance Through: Obi Wan Shinobi may move 1 square up to 3 times.');
  } else state.phase = 'active';
  if (defenseCardId === 'double-jump' && state.phase !== 'finished') {
    const resumePhase = state.phase;
    state.phase = 'double-jump';
    state.doubleJump = { playerId: defender.id, stepsRemaining: 2, enemyUnderfoot: null, resumePhase };
    state.log.unshift('Double Jump: Obi Wan Shinobi must move 1 square twice.');
  }
  if (defenseCardId === 'flurry-defensive-strikes' && state.phase !== 'finished') {
    state.flurry = { defenderId: defender.id, attackerId: pending.attackerId, resumePhase: state.phase, remainingEnemyDiscards: 0 };
    state.phase = 'flurry-offer';
    state.log.unshift(`${defender.name} may discard 1 card to force ${attacker.name} to discard 2 cards.`);
  }
  if (defenseCardId) {
    const attackCard = cardDefinition({ instanceId: '', cardId: pending.cardId });
    state.combatReveal = { attackCardId: pending.cardId, defendCardId: defenseCardId, attackBase: attackCard.value, attackTotal: pending.attackValue, defendBase: defenseBaseValue, defendTotal: defenseValue, expiresAt: Date.now() + 10_000, acknowledged: [] };
  }
  return ok(state);
}

function acknowledgeCombat(state: GameState, playerId: PlayerId): CommandResult {
  const reveal = state.combatReveal;
  if (!reveal) return fail(state, 'There is no combat result to acknowledge.');
  if (!reveal.acknowledged.includes(playerId)) reveal.acknowledged.push(playerId);
  if (Date.now() >= reveal.expiresAt || reveal.acknowledged.length === 2) state.combatReveal = null;
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
    flurry.remainingEnemyDiscards = Math.min(2, attacker.hand.filter((card) => !cardDefinition(card).cannotBeDiscarded).length);
    if (flurry.remainingEnemyDiscards === 0) {
      state.phase = flurry.resumePhase; state.flurry = null;
      state.log.unshift(`${attacker.name} had no cards eligible for Flurry's forced discard.`);
      return ok(state);
    }
    state.phase = 'choosing-flurry-enemy-discard';
    state.log.unshift(`${attacker.name} must choose 2 cards to discard.`);
  }
  return ok(state);
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
  if (!card || cardDefinition(card).kind !== 'attack') return fail(state, 'Force Disarm requires an Attack card to be discarded.');
  const name = cardDefinition(card).name;
  discardFromHand(player, cardInstanceId);
  state.forceDisarm = null;
  state.phase = 'active';
  state.log.unshift(`${player.name} discarded ${name} due to Force Disarm.`);
  return ok(state);
}

type PushEntity = { kind: 'player' | 'object'; id: string; position: Cell };
function snapshotPerkTargeting(player: PlayerState): PerkTargetingUndo {
  return structuredClone({ hand: player.hand, discard: player.discard, spellEcho: player.spellEcho, actionsRemaining: player.actionsRemaining, perkUsed: player.perkUsed });
}
function attachTargetingUndo(state: GameState, playerId: PlayerId, undo: PerkTargetingUndo) {
  if (state.forceThrow?.casterId === playerId) state.forceThrow.undo = undo;
  if (state.forcePull?.casterId === playerId) state.forcePull.undo = undo;
  if (state.arkaneArow?.casterId === playerId) state.arkaneArow.undo = undo;
  if (state.armDaWiz?.casterId === playerId) state.armDaWiz.undo = undo;
  if (state.mindTricks?.casterId === playerId) state.mindTricks.undo = undo;
}
function cancelCardTargeting(state: GameState, playerId: PlayerId): CommandResult {
  const force = state.forceThrow ?? state.forcePull ?? state.arkaneArow ?? state.armDaWiz ?? state.mindTricks;
  const forceThrowIsPending = state.phase === 'choosing-force-throw-target' || state.phase === 'choosing-force-throw-direction' || state.phase === 'choosing-kyk-target' || state.phase === 'choosing-kyk-direction';
  const forcePullIsPending = state.phase === 'choosing-force-pull-target';
  const arkaneArowIsPending = state.phase === 'choosing-arkane-arow-target';
  const armDaWizIsPending = state.phase === 'choosing-arm-da-wiz-choice' || state.phase === 'choosing-arm-da-wiz-target';
  const mindTricksIsPending = state.phase === 'choosing-mind-tricks-discard' && state.mindTricks?.discarded === 0;
  if ((!forceThrowIsPending && !forcePullIsPending && !arkaneArowIsPending && !armDaWizIsPending && !mindTricksIsPending) || !force || force.casterId !== playerId) return fail(state, 'This card can no longer be cancelled.');
  if (force.undo) {
    const player = state.players[playerId];
    player.hand = force.undo.hand; player.discard = force.undo.discard; player.spellEcho = force.undo.spellEcho;
    player.actionsRemaining = force.undo.actionsRemaining; player.perkUsed = force.undo.perkUsed;
  }
  const cardName = mindTricksIsPending ? 'Mind Tricks' : armDaWizIsPending ? 'Arm da Wiz' : arkaneArowIsPending ? 'ARKANE AROW' : forcePullIsPending ? 'Force Pull' : state.phase.startsWith('choosing-kyk') ? 'Kyk' : 'Force Throw';
  state.forceThrow = null; state.forcePull = null; state.arkaneArow = null; state.armDaWiz = null; state.mindTricks = null; state.phase = 'active';
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
    enemy.deck = shuffle(enemy.deck);
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
function selectForcePullTarget(state: GameState, playerId: PlayerId, targetKind: 'player' | 'object', targetId: string): CommandResult {
  const pull = state.forcePull;
  if (state.phase !== 'choosing-force-pull-target' || !pull || pull.casterId !== playerId) return fail(state, 'Force Pull is not waiting for a target.');
  if (targetKind === 'player' && targetId === playerId) return fail(state, 'Force Pull cannot target its caster.');
  if (targetKind === 'object' && state.objects.find((object) => object.id === targetId)?.kind === 'wall-pillar') return fail(state, 'Wall Objects cannot be pulled.');
  const target = getPushEntity(state, targetKind, targetId);
  if (!target) return fail(state, 'That Force Pull target does not exist.');
  const caster = state.players[playerId];
  if (distance(caster.position, target.position) > pull.targetRange) return fail(state, 'That target is outside Force Pull range.');
  if (targetKind === 'player' && !hasLineOfSight(state, caster.position, target.position)) return fail(state, 'A Wall Object blocks line of sight to that Player.');
  const path = shortestPullPath(state, target, caster.position);
  const steps = Math.min(pull.distance, path.length);
  const destination = steps > 0 ? path[steps - 1] : target.position;
  let previous = target.position;
  for (const next of path.slice(0, steps)) { applyElevationDropDamage(state, target, previous, next); previous = next; }
  if (target.kind === 'player') {
    const moved = state.players[target.id as PlayerId]; moved.position = { ...destination };
    if (steps > 0) markCharacterMoved(moved, 'enemy-ability');
  } else state.objects.find((object) => object.id === target.id)!.position = { ...destination };
  if (pull.level >= 3 && target.kind === 'player') applyPinned(state.players[target.id as PlayerId], 1);
  state.log.unshift(`Force Pull moved ${entityName(state, target)} ${steps} square${steps === 1 ? '' : 's'} toward ${caster.name}${pull.level >= 3 && target.kind === 'player' ? ' and applied Pinned' : ''}.`);
  state.forcePull = null; state.phase = 'active';
  return ok(state);
}
function shortestPullPath(state: GameState, target: PushEntity, casterCell: Cell): Cell[] {
  const key = (cell: Cell) => `${cell.x},${cell.y}`;
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: { ...target.position }, path: [] }];
  const visited = new Set([key(target.position)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (distance(current.cell, casterCell) === 1) return current.path;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE || visited.has(key(next))) continue;
      if (next.x === casterCell.x && next.y === casterCell.y) continue;
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
    const clearUntilTarget = directPath.slice(0, -1).every((cell) => !Object.values(state.players).some((entry) => entry.id !== caster.id && entry.position.x === cell.x && entry.position.y === cell.y)
      && !state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y));
    if (clearUntilTarget) return directPath;
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
      if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE || visited.has(key(next))) continue;
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
  const deltaX = orkkCell.x - shield.position.x; const deltaY = orkkCell.y - shield.position.y;
  const directSteps = Math.max(Math.abs(deltaX), Math.abs(deltaY));
  const isStraightLine = deltaX === 0 || deltaY === 0 || Math.abs(deltaX) === Math.abs(deltaY);
  if (isStraightLine && directSteps > 0 && directSteps <= range) {
    const stepX = Math.sign(deltaX); const stepY = Math.sign(deltaY);
    const directPath = Array.from({ length: directSteps }, (_, index) => ({ x: shield.position.x + stepX * (index + 1), y: shield.position.y + stepY * (index + 1) }));
    // Enemy-occupied Squares never block Shield recall. Only Board Objects force
    // the Shield to abandon its direct line and use the maneuvering pathfinder.
    const clearOfObjects = directPath.slice(0, -1).every((cell) => !state.objects.some((entry) => entry.id !== shield.id && entry.position.x === cell.x && entry.position.y === cell.y));
    if (clearOfObjects) return directPath;
  }
  const queue: { cell: Cell; path: Cell[] }[] = [{ cell: { ...shield.position }, path: [] }];
  const visited = new Set([key(shield.position)]);
  while (queue.length) {
    const current = queue.shift()!;
    if (current.cell.x === orkkCell.x && current.cell.y === orkkCell.y) return current.path;
    if (current.path.length >= range) continue;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      const next = { x: current.cell.x + dx, y: current.cell.y + dy };
      if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE || visited.has(key(next))) continue;
      const isOrkk = next.x === orkkCell.x && next.y === orkkCell.y;
      const blockedByObject = state.objects.some((entry) => entry.id !== shield.id && entry.position.x === next.x && entry.position.y === next.y);
      if (blockedByObject && !isOrkk) continue;
      visited.add(key(next)); queue.push({ cell: next, path: [...current.path, next] });
    }
  }
  return [];
}

function resolveArmDaWizChoice(state: GameState, playerId: PlayerId, choice: 'recall' | 'create'): CommandResult {
  const arm = state.armDaWiz;
  if (state.phase !== 'choosing-arm-da-wiz-choice' || !arm || arm.casterId !== playerId) return fail(state, 'Arm da Wiz is not waiting for this choice.');
  if (choice === 'create') {
    if (!arm.canCreate) return fail(state, 'A Shield can only be created when the old Shield is destroyed or outside recall Range.');
    const removedShields = state.objects.filter((entry) => entry.kind === 'orkk-shield' && entry.ownerId === playerId).length;
    state.objects = state.objects.filter((entry) => entry.kind !== 'orkk-shield' || entry.ownerId !== playerId);
    state.players[playerId].shieldEquipped = true;
    state.armDaWiz = null; state.phase = 'active';
    state.log.unshift(`${state.players[playerId].name} created and instantly equipped a new Iron Shield${removedShields > 0 ? `, removing ${removedShields} previous Shield Wall${removedShields === 1 ? '' : 's'} from the Board` : ''}.`);
    return ok(state);
  }
  if (!arm.canRecall) return fail(state, 'There is no Shield within recall Range.');
  state.phase = 'choosing-arm-da-wiz-target';
  state.log.unshift('Arm da Wiz: target an in-range Shield to recall.');
  return ok(state);
}

function resolveArmDaWizTarget(state: GameState, playerId: PlayerId, objectId: string): CommandResult {
  const arm = state.armDaWiz;
  if (state.phase !== 'choosing-arm-da-wiz-target' || !arm || arm.casterId !== playerId) return fail(state, 'Arm da Wiz is not waiting for a Shield target.');
  const shield = state.objects.find((entry) => entry.id === objectId && entry.kind === 'orkk-shield' && entry.ownerId === playerId);
  if (!shield) return fail(state, 'That is not one of Da Orkk’s Shields.');
  const orkk = state.players[playerId];
  const path = armDaWizPath(state, shield, orkk.position, arm.range);
  if (path.length === 0) return fail(state, `That Shield is outside recall Range ${arm.range}.`);
  // Arm da Wiz is resolved entirely from board occupancy: an enemy is affected
  // when any Square in the Shield's calculated recall path contains that enemy.
  // No mesh, animation, timing, or physics collision is consulted.
  const shieldPasses: { enemyId: PlayerId; pathIndex: number }[] = [];
  for (const [pathIndex, cell] of path.entries()) {
    const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === cell.x && entry.position.y === cell.y);
    if (!enemy || shieldPasses.some((entry) => entry.enemyId === enemy.id)) continue;
    shieldPasses.push({ enemyId: enemy.id, pathIndex });
    if (arm.level >= 2) {
      dealDamage(state, enemy, 1, true);
      state.log.unshift(`Arm da Wiz's Shield passed through ${enemy.name}'s occupied Square and dealt 1 damage.`);
    }
  }
  if (arm.level >= 3 && shieldPasses.length > 0) {
    // Resolve enemies nearest to Da Orkk first. Each enemy follows the exact
    // outgoing segment of the Shield route instead of recalculating a diagonal.
    const enemiesToPull = [...shieldPasses].sort((a, b) => b.pathIndex - a.pathIndex);
    for (const pass of enemiesToPull) {
      const enemy = state.players[pass.enemyId];
      const destination = path[pass.pathIndex + 1];
      const blocked = !destination
        || (destination.x === orkk.position.x && destination.y === orkk.position.y)
        || Object.values(state.players).some((entry) => entry.id !== enemy.id && entry.position.x === destination.x && entry.position.y === destination.y)
        || state.objects.some((entry) => entry.id !== shield.id && entry.position.x === destination.x && entry.position.y === destination.y);
      if (!blocked) {
        enemy.position = { ...destination }; markCharacterMoved(enemy, 'enemy-ability');
        state.log.unshift(`Arm da Wiz pulled ${enemy.name} along the Shield's route to ${cellLabel(destination)}.`);
      } else state.log.unshift(`${enemy.name} could not follow the Shield's exact route into the next Square.`);
    }
    const adjacentEnemies = Object.values(state.players).filter((entry) => entry.id !== playerId && distance(entry.position, orkk.position) === 1);
    adjacentEnemies.forEach((entry) => dealDamage(state, entry, 1));
    state.log.unshift(`After the Shield completed its pull and all collided enemies moved, Arm da Wiz dealt 1 additional damage to ${adjacentEnemies.length} adjacent enem${adjacentEnemies.length === 1 ? 'y' : 'ies'}.`);
  }
  state.objectPushAnimations.push({
    id: `${state.turn}-arm-da-wiz-${state.objectPushAnimations.length}`,
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
  state.armDaWiz = null; state.phase = 'active';
  state.log.unshift(`${orkk.name} recalled and equipped his Shield.`);
  return ok(state);
}

function resolveArkaneArowTarget(state: GameState, playerId: PlayerId, target: Cell): CommandResult {
  const throwState = state.arkaneArow;
  if (state.phase !== 'choosing-arkane-arow-target' || !throwState || throwState.casterId !== playerId) return fail(state, 'ARKANE AROW is not waiting for a target Square.');
  const caster = state.players[playerId];
  if (!caster.shieldEquipped) return fail(state, 'Da Orkk no longer has his Shield equipped.');
  const path = arkaneArowPath(state, caster, target, throwState.range);
  if (path.length === 0) return fail(state, `That Square cannot be reached within Range ${throwState.range}.`);
  const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === target.x && entry.position.y === target.y);
  const obstacle = state.objects.find((entry) => entry.position.x === target.x && entry.position.y === target.y);
  const collision = Boolean(enemy || obstacle);
  const previous = path.length > 1 ? path[path.length - 2] : caster.position;
  const isClear = (cell: Cell) => !Object.values(state.players).some((entry) => entry.position.x === cell.x && entry.position.y === cell.y)
    && !state.objects.some((entry) => entry.position.x === cell.x && entry.position.y === cell.y);
  let shieldLanding = { ...target };
  if (collision) {
    if (isClear(previous)) shieldLanding = { ...previous };
    else {
      const approaches: Cell[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const candidate = { x: target.x + dx, y: target.y + dy };
        if (candidate.x < 1 || candidate.x > BOARD_SIZE || candidate.y < 0 || candidate.y >= BOARD_SIZE || !isClear(candidate)) continue;
        if (arkaneArowPath(state, caster, candidate, throwState.range).length > 0) approaches.push(candidate);
      }
      approaches.sort((a, b) => distance(a, previous) - distance(b, previous));
      if (!approaches[0]) return fail(state, 'The Shield has no clear approach Square on which it can stop after this collision.');
      shieldLanding = approaches[0];
    }
  }
  let pushed = false;
  if (enemy) {
    dealDamage(state, enemy, 1, true);
    state.log.unshift(`ARKANE AROW collided with ${enemy.name} and dealt 1 damage.`);
    if (throwState.level >= 3) {
      const dx = Math.sign(target.x - previous.x); const dy = Math.sign(target.y - previous.y);
      const destination = { x: enemy.position.x + dx, y: enemy.position.y + dy };
      const inBounds = destination.x >= 1 && destination.x <= BOARD_SIZE && destination.y >= 0 && destination.y < BOARD_SIZE;
      const blocked = !inBounds || Object.values(state.players).some((entry) => entry.id !== enemy.id && entry.position.x === destination.x && entry.position.y === destination.y)
        || state.objects.some((entry) => entry.position.x === destination.x && entry.position.y === destination.y);
      if (!blocked) {
        enemy.position = destination; markCharacterMoved(enemy, 'enemy-ability'); pushed = true;
        state.log.unshift(`ARKANE AROW pushed ${enemy.name} to ${cellLabel(destination)}.`);
      } else {
        dealDamage(state, enemy, 1, true);
        state.log.unshift(`${enemy.name} could not be pushed and received 1 additional damage.`);
      }
    }
  } else if (obstacle) state.log.unshift(`ARKANE AROW collided with ${obstacle.name}.`);
  caster.shieldEquipped = false;
  const shieldId = `${playerId}-iron-shield-${state.turn}-${++instanceSequence}`;
  state.objects.push({ id: shieldId, name: "Da Orkk's Iron Shield", kind: 'orkk-shield', ownerId: playerId, hp: 999, maxHp: 999, position: { ...shieldLanding } });
  state.objectPushAnimations.push({ id: `${state.turn}-arkane-arow-${state.objectPushAnimations.length}`, objectId: shieldId, from: { ...caster.position }, to: { ...shieldLanding }, dx: Math.sign(target.x - previous.x), dy: Math.sign(target.y - previous.y), collided: collision });
  state.arkaneArow = null; state.phase = 'active';
  state.log.unshift(collision ? `Da Orkk's Shield Wall stopped at ${cellLabel(shieldLanding)}, adjacent to the collision at ${cellLabel(target)}${enemy && pushed ? ', after pushing the enemy away' : ''}.` : `Da Orkk's Shield Wall now stands at ${cellLabel(shieldLanding)}.`);
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
  if (state.phase !== 'choosing-kyk-target' || !kyk || kyk.casterId !== playerId) return fail(state, 'Kyk is not waiting for an Object target.');
  const object = state.objects.find((entry) => entry.id === objectId);
  if (object?.kind === 'wall-pillar') return fail(state, 'Wall Objects cannot be moved.');
  if (!object || distance(object.position, state.players[playerId].position) !== 1) return fail(state, 'Kyk requires an Object adjacent to Da Orkk.');
  kyk.targetKind = 'object'; kyk.targetId = objectId; state.phase = 'choosing-kyk-direction';
  state.log.unshift('Kyk: select a highlighted legal push direction.');
  return ok(state);
}

function resolveKykDirection(state: GameState, playerId: PlayerId, to: Cell): CommandResult {
  const kyk = state.forceThrow;
  if (state.phase !== 'choosing-kyk-direction' || !kyk || kyk.casterId !== playerId || !kyk.targetId) return fail(state, 'Kyk is not waiting for a push direction.');
  const object = state.objects.find((entry) => entry.id === kyk.targetId);
  if (!object) return fail(state, 'The selected Object no longer exists.');
  const orkk = state.players[playerId];
  if (!kykDirectionAllowed(orkk.position, object.position, to)) return fail(state, 'That direction is not legal for this Object’s position relative to Da Orkk.');
  const dx = Math.sign(to.x - object.position.x); const dy = Math.sign(to.y - object.position.y);
  const start = { ...object.position }; const traveled: Cell[] = [];
  let current = { ...start }; let hitEnemy: PlayerState | null = null; let collided = false;
  for (let step = 0; step < kyk.distance; step++) {
    const next = { x: current.x + dx, y: current.y + dy };
    if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE) { collided = true; break; }
    const enemy = Object.values(state.players).find((entry) => entry.id !== playerId && entry.position.x === next.x && entry.position.y === next.y);
    const blockingObject = state.objects.some((entry) => entry.id !== object.id && entry.position.x === next.x && entry.position.y === next.y);
    const blockedByOrkk = orkk.position.x === next.x && orkk.position.y === next.y;
    if (enemy || blockingObject || blockedByOrkk) { hitEnemy = enemy ?? null; collided = true; break; }
    current = next; traveled.push({ ...current });
  }
  object.position = { ...current };
  if (hitEnemy) {
    const damage = kyk.level >= 3 ? 3 : 1;
    dealDamage(state, hitEnemy, damage, true);
    state.log.unshift(`Kyk's Object collided with ${hitEnemy.name} and dealt ${damage} damage.`);
  }
  const destroysObject = kyk.level >= 3;
  state.objectPushAnimations.push({ id: `${state.turn}-kyk-${state.objectPushAnimations.length}`, objectId: object.id, from: start, to: { ...current }, dx, dy, collided, path: traveled, removeOnComplete: destroysObject });
  if (destroysObject) {
    state.objects = state.objects.filter((entry) => entry.id !== object.id);
    state.log.unshift(`Kyk level 3 destroyed ${object.name}.`);
  }
  state.forceThrow = null; state.phase = 'active';
  state.log.unshift(`Kyk pushed ${object.name} up to ${kyk.distance} Squares.`);
  return ok(state);
}
function selectForceThrowTarget(state: GameState, playerId: PlayerId, targetKind: 'player' | 'object', targetId: string): CommandResult {
  const force = state.forceThrow;
  if (state.phase !== 'choosing-force-throw-target' || !force || force.casterId !== playerId) return fail(state, 'Force Throw is not waiting for a target.');
  if (targetKind === 'player' && force.level < 3) return fail(state, 'Only level 3 Force Throw can target enemy Players.');
  if (targetKind === 'player' && targetId === playerId) return fail(state, 'Force Throw cannot target its caster.');
  if (targetKind === 'object' && state.objects.find((object) => object.id === targetId)?.kind === 'wall-pillar') return fail(state, 'Wall Objects cannot be pushed.');
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
  pushEntity(state, target, dx, dy, force.distance, force.level, playerId);
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
function pushEntity(state: GameState, entity: PushEntity, dx: number, dy: number, movement: number, level: number, casterId: PlayerId, dealCollisionDamage = true): boolean {
  const start = { ...entity.position };
  const finishObjectAnimation = (collided: boolean) => {
    if (entity.kind !== 'object') return;
    const current = getPushEntity(state, entity.kind, entity.id);
    if (current) state.objectPushAnimations.push({ id: `${state.turn}-${state.log.length}-${entity.id}-${state.objectPushAnimations.length}`, objectId: entity.id, from: start, to: { ...current.position }, dx, dy, collided });
  };
  let remaining = movement;
  while (remaining > 0) {
    const current = getPushEntity(state, entity.kind, entity.id); if (!current) return false;
    const next = { x: current.position.x + dx, y: current.position.y + dy };
    if (next.x < 1 || next.x > BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE) { state.log.unshift(`${entityName(state, current)} stopped at the board edge without taking damage.`); finishObjectAnimation(true); return true; }
    const occupant = entityAt(state, next, current);
    if (occupant) {
      if (dealCollisionDamage) { damageCollisionEntity(state, current, level, casterId); damageCollisionEntity(state, occupant, level, casterId); }
      state.log.unshift(`${entityName(state, current)} collided with ${entityName(state, occupant)}.`);
      const transferred = remaining - 1;
      if (transferred > 0) pushEntity(state, occupant, dx, dy, transferred, level, casterId, dealCollisionDamage);
      finishObjectAnimation(true);
      return true;
    }
    if (current.kind === 'player') { state.players[current.id as PlayerId].position = next; markCharacterMoved(state.players[current.id as PlayerId], current.id === casterId ? 'own-card' : 'enemy-ability'); }
    else state.objects.find((object) => object.id === current.id)!.position = next;
    applyElevationDropDamage(state, current, current.position, next);
    remaining -= 1;
  }
  finishObjectAnimation(false);
  return false;
}
function damageCollisionEntity(state: GameState, entity: PushEntity, level: number, casterId: PlayerId) {
  if (entity.kind === 'player' && entity.id !== casterId) dealDamage(state, state.players[entity.id as PlayerId], 1, true);
}
function applyElevationDropDamage(state: GameState, entity: PushEntity, from: Cell, to: Cell) {
  const elevation = (cell: Cell) => state.elevations[cellLabel(cell)] ?? 0;
  if (elevation(from) <= elevation(to)) return;
  if (entity.kind === 'player') dealDamage(state, state.players[entity.id as PlayerId], 1);
  state.log.unshift(`${entityName(state, entity)} moved from High Ground to Low Ground and received 1 damage.`);
}
function entityName(state: GameState, entity: PushEntity) { return entity.kind === 'player' ? state.players[entity.id as PlayerId].name : state.objects.find((object) => object.id === entity.id)?.name ?? 'Object'; }

function moveDanceThrough(state: GameState, player: PlayerState, to: Cell): CommandResult {
  const dance = state.danceThrough;
  if (!dance || state.phase !== 'dance-through') return fail(state, 'Dance Through is not active.');
  if (distance(player.position, to) !== 1) return fail(state, 'Dance Through moves exactly one square at a time.');
  const targetEnemy = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.position.x === to.x && candidate.position.y === to.y);
  if (state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Dance Through cannot move through an Object.');
  if (targetEnemy && dance.stepsRemaining <= 1) return fail(state, 'Not enough Dance Through movement remains to leave the occupied square.');
  const passedEnemy = dance.enemyUnderfoot ? state.players[dance.enemyUnderfoot] : null;
  player.position = to;
  markCharacterMoved(player, 'own-card');
  dance.stepsRemaining -= 1;
  dance.enemyUnderfoot = targetEnemy?.id ?? null;
  state.log.unshift(`${player.name} danced to ${cellLabel(to)} (${dance.stepsRemaining} steps left).`);
  if (passedEnemy && !dance.damagePrevented) {
    dealDamage(state, passedEnemy, 1, true);
    state.log.unshift(`Dance Through dealt 1 damage to ${passedEnemy.name}.`);
    if (passedEnemy.hp === 0) {
      state.phase = 'finished'; state.winner = player.id; state.danceThrough = null;
      state.log.unshift(`${player.name} wins the duel!`);
      return ok(state);
    }
  } else if (passedEnemy) {
    state.log.unshift('Calmness negated 1 Dance Through pass-through damage.');
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
  const targetEnemy = Object.values(state.players).find((candidate) => candidate.id !== player.id && candidate.position.x === to.x && candidate.position.y === to.y);
  if (state.objects.some((object) => object.position.x === to.x && object.position.y === to.y)) return fail(state, 'Double Jump cannot move through an Object.');
  if (targetEnemy && jump.stepsRemaining <= 1) return fail(state, 'Shinobi must end Double Jump on an empty square.');
  const passedEnemy = jump.enemyUnderfoot ? state.players[jump.enemyUnderfoot] : null;
  player.position = to;
  markCharacterMoved(player, 'own-card');
  jump.stepsRemaining -= 1;
  jump.enemyUnderfoot = targetEnemy?.id ?? null;
  state.log.unshift(`${player.name} double-jumped to ${cellLabel(to)} (${jump.stepsRemaining} steps left).`);
  if (passedEnemy) {
    const pinnedStacks = applyPinned(passedEnemy, 1);
    state.log.unshift(`Double Jump passed through ${passedEnemy.name} and applied 1 Pinned stack (${pinnedStacks} total).`);
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
  player.movementRemaining += dashMovement;
  state.log.unshift(`${player.name} begins Dash and adds ${dashMovement} movement (${player.movementRemaining} total).`);
  if (player.movementRemaining === 0) return ok(endTurn(state));
  return ok(state);
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
  state.dashCancellation = null;
  state.phase = 'active';
  state.log.unshift(`${player.name} cancelled Dash before moving.`);
  return ok(state);
}

function endTurn(state: GameState): GameState {
  const current = state.players[state.activePlayerId];
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
  advanceSpellEchoAtTurnEnd(state, current);
  if (current.character === 'orkk' && current.rageStacks > 0) {
    current.rageStacks -= 1;
    state.log.unshift(`${current.name} lost 1 Rage at the end of the turn (${current.rageStacks} remaining).`);
  }
  current.swiftformMoveBonus = 0; current.swiftformCanPassEnemies = false; current.swiftformPinsPassedEnemies = false; current.swiftformLightsaberAtTurnEnd = false; current.swiftformEnemyUnderfoot = null; current.swiftformPinnedEnemyIds = [];
  current.movedThisTurn = false;
  return finalizeTurn(state);
}

function finalizeTurn(state: GameState): GameState {
  const nextId: PlayerId = state.activePlayerId === 'P1' ? 'P2' : 'P1';
  state.activePlayerId = nextId; state.turn += 1; state.phase = 'active'; state.pendingAttack = null; state.dashCancellation = null; state.danceThrough = null; state.doubleJump = null; state.forceThrow = null; state.forcePull = null; state.arkaneArow = null; state.armDaWiz = null; state.mindTricks = null; state.forceDisarm = null; state.flurry = null;
  const next = state.players[nextId];
  next.actionsRemaining = 2; next.perkUsed = false; next.freeMoveUsed = false; next.movementRemaining = 0; next.turnEndPinnedRemoved = false;
  if (BONUS_DRAW_SQUARES.has(cellLabel(next.position))) {
    const drawn = drawCards(next, 1);
    state.log.unshift(`${next.name} started the turn on ${cellLabel(next.position)} and drew ${drawn} additional Card${drawn === 1 ? '' : 's'}.`);
  }
  if (next.character === 'orkk' && !next.shieldEquipped && next.rageStacks === 0) {
    next.rageStacks = 1;
    state.log.unshift(`${next.name} began the turn without his Shield and gained 1 Rage.`);
  }
  state.log.unshift(`Turn ${state.turn}: ${next.name}.`);
  return state;
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
  let drawn = 0;
  for (let index = 0; index < count; index++) {
    if (player.deck.length === 0 && player.discard.length > 0) { player.deck = shuffle(player.discard.splice(0)); }
    const card = player.deck.pop();
    if (!card) break;
    player.hand.push(card);
    if (cardDefinition(card).kind === 'status') card.revealedToOpponent = true;
    if (card.cardId === 'pinned') player.pinnedStacks += 1;
    drawn += 1;
  }
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
  return Math.max(0, player.moveRange + player.swiftformMoveBonus - pinnedCount(player));
}
function canDiscardAtHandLimit(card: Card): boolean {
  return !card.cannotBeDiscarded && (card.kind !== 'status' || card.canDiscardForHandLimit === true);
}
export function applyPinned(player: PlayerState, stacks = 1): number {
  const applied = Math.max(0, Math.floor(stacks));
  for (let index = 0; index < applied; index++) player.hand.push({ instanceId: `${player.id}-status-${++instanceSequence}`, cardId: 'pinned', revealedToOpponent: true });
  player.pinnedStacks += applied;
  return pinnedCount(player);
}
export function pinnedCount(player: PlayerState): number {
  return Math.max(player.pinnedStacks, player.hand.filter((card) => card.cardId === 'pinned').length);
}
function removePinnedAtTurnEnd(state: GameState, player: PlayerState) {
  const pinnedCards = player.hand.filter((card) => card.cardId === 'pinned');
  if (pinnedCards.length > 0) {
    const removed = pinnedCards[Math.floor(Math.random() * pinnedCards.length)];
    removeCard(player, removed.instanceId);
  } else if (player.pinnedStacks > 0) player.pinnedStacks -= 1;
  else return;
  state.log.unshift(`${player.name} removed 1 Pinned Status Card (${pinnedCount(player)} remaining).`);
}
function updateLightsaberAtTurnEnd(state: GameState, player: PlayerState) {
  if (player.id !== 'P1') return;
  if (player.movedThisTurn) {
    if (player.lightsaberMovementProtection) state.log.unshift('A Lightsaber duration stack preserved Lightsaber after movement.');
    else {
      if (player.lightsaberBuff) state.log.unshift('Lightsaber expired because Obi Wan Shinobi moved this turn.');
      player.lightsaberBuff = false;
    }
  } else {
    if (!player.lightsaberBuff) state.log.unshift('Lightsaber empowered Obi Wan Shinobi with +1 ATT and +1 DEF.');
    player.lightsaberBuff = true;
  }
  if (player.swiftformLightsaberAtTurnEnd) {
    player.lightsaberBuff = true;
    state.log.unshift('Swiftform granted Lightsaber status at the end of the turn.');
  }
  player.lightsaberMovementProtection = false;
}
function removeAllBuffs(player: PlayerState) {
  player.lightsaberBuff = false;
  player.lightsaberStacks = 0;
  player.lightsaberMovementProtection = false;
  player.highgroundAdvantageBuff = false;
}
function removeAllDebuffs(player: PlayerState) {
  player.pinnedStacks = 0;
  for (const card of player.hand.filter((entry) => cardDefinition(entry).kind === 'status')) removeCard(player, card.instanceId);
}
function advanceSpellEchoAtTurnEnd(state: GameState, player: PlayerState) {
  const [positionOne, positionTwo, positionThree] = player.spellEcho;
  if (player.perkUsed || !positionOne || (positionOne && positionTwo && positionThree)) return;
  player.spellEcho = [null, positionOne, positionTwo ?? positionThree];
  state.log.unshift(`${player.name}'s Spell Echo advanced upward, leaving position 1 available.`);
}
function discardFromHand(player: PlayerState, instanceId: string) {
  const index = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (index < 0) return;
  const [card] = player.hand.splice(index, 1);
  if (card.cardId === 'pinned') player.pinnedStacks = Math.max(0, player.pinnedStacks - 1);
  card.revealedToOpponent = false;
  player.discard.push(card);
}
export function removeCard(player: PlayerState, instanceId: string): CardInstance | null {
  for (const pile of [player.hand, player.deck]) {
    const index = pile.findIndex((card) => card.instanceId === instanceId);
    if (index < 0) continue;
    const [removed] = pile.splice(index, 1);
    if (removed.cardId === 'pinned' && pile === player.hand) player.pinnedStacks = Math.max(0, player.pinnedStacks - 1);
    return removed;
  }
  return null;
}
function shuffle<T>(items: T[]): T[] { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; }
function ok(state: GameState): CommandResult { return { ok: true, state }; }
function fail(state: GameState, error: string): CommandResult { return { ok: false, state, error }; }
