import { cardBaseValue, cardDefinition, isCardRevealedToOpponents, type CardInstance, type GameState, type PendingAttack, type PlayerId, type PlayerState } from '../shared/game.ts';

export type MerylinObservation = Readonly<{ state: GameState; playerId: PlayerId; hiddenAttack: boolean }>;

/** The ONLY boundary allowed to read the live match. No histories or private selections cross it. */
export function observeMerylinMatch(source: GameState, playerId: PlayerId = 'P2'): MerylinObservation {
  const pendingDefense = source.pendingAttack as PendingAttack & { preCombatDefenseCommand?: { type: string; cardInstanceId?: string }; lightbringerDefenseCommand?: { type: string; cardInstanceId?: string } } | null;
  const privateDefenseCommand = !source.combatReveal && !source.pendingAttack?.combatResolutionCommitted && source.pendingAttack?.defenderId !== playerId
    ? pendingDefense?.lightbringerDefenseCommand ?? pendingDefense?.preCombatDefenseCommand : undefined;
  const privateDefenseId = privateDefenseCommand?.type === 'defend' ? privateDefenseCommand.cardInstanceId : undefined;
  const hiddenAttack = Boolean(source.pendingAttack && source.pendingAttack.attackerId !== playerId
    && ['defending', 'choosing-yamato-move'].includes(source.phase as string)
    && !source.pendingAttack.combatResolutionCommitted && !source.combatReveal
    && !(source.pendingAttack as PendingAttack & { oracleAttackRevealed?: boolean }).oracleAttackRevealed);
  const omitted = new Set(['log', 'damageLog', 'movementUndo', 'perkUndo', 'undo', 'stateJson', 'deferredAfterCombatState',
    'combatSummary', 'lastCombatSummary', 'pendingPerkUseEvent', 'objectPushAnimations', 'spellProjectiles', 'blessingAnimations']);
  function clean(value: unknown, key = ''): unknown {
    if (omitted.has(key)) return undefined;
    if (privateDefenseId && value === privateDefenseId) return 'unrevealed-defense';
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((entry) => clean(entry));
    const record = value as Record<string, unknown>;
    if (typeof record.id === 'string' && record.hand && record.deck && record.position) {
      const player = value as PlayerState;
      const copy = Object.fromEntries(Object.entries(record).filter(([name]) => !['hand', 'deck', 'knownTopCardId', 'knownTopCardIds', 'visualMovement'].includes(name)).map(([name, entry]) => [name, clean(entry, name)]));
      const defenseCommand = source.combatReveal && source.pendingAttack?.defenderId === player.id ? source.pendingAttack.combatStackDefenseCommand : undefined;
      copy.hand = player.id === playerId ? structuredClone(player.hand) : player.hand.map((card, index) =>
        defenseCommand?.type === 'defend' && defenseCommand.cardInstanceId === card.instanceId ? structuredClone(card)
          : isCardRevealedToOpponents(player, card, playerId) || cardDefinition(card).kind === 'status'
          ? { ...card, instanceId: `public-${player.id}-${index}` }
          : { cardId: 'attack-2', instanceId: `unknown-${player.id}-${index}` });
      if (privateDefenseId && player.id === source.pendingAttack?.defenderId) {
        const selectedIndex = player.hand.findIndex((card) => card.instanceId === privateDefenseId);
        if (selectedIndex >= 0) {
          const remaining = (copy.hand as CardInstance[]).filter((_, index) => index !== selectedIndex);
          const known = remaining.filter((card) => !card.instanceId.startsWith('unknown-'));
          const unknown = remaining.filter((card) => card.instanceId.startsWith('unknown-')).map((card, index) => ({ ...card, instanceId: `unknown-${player.id}-${index}` }));
          const cardId = player.wrecknaInsideTombId && !player.necronomiconTombDefenseActive ? 'graveyard' : 'defend-1';
          copy.hand = [...known, ...unknown, { instanceId: 'unrevealed-defense', cardId }];
        }
      }
      // Attacks enter Discard at declaration, before their face is revealed.
      // Hide that in-flight Card too; the otherwise public pile must not expose it.
      if (hiddenAttack && player.id === source.pendingAttack?.attackerId) {
        copy.discard = player.discard.filter((card) => card.instanceId !== source.pendingAttack!.cardInstanceId).map((card) => clean(card));
        copy.removedDeck = player.removedDeck?.filter((card) => card.instanceId !== source.pendingAttack!.cardInstanceId).map((card) => clean(card));
      }
      // Composition of one's own Deck is known; its shuffled order is not.
      copy.deck = player.id === playerId
        ? structuredClone(player.deck).sort((a, b) => a.cardId.localeCompare(b.cardId) || a.instanceId.localeCompare(b.instanceId))
        : player.deck.map((_, index) => ({ cardId: 'attack-2', instanceId: `unknown-deck-${index}` }));
      if (player.id === playerId) {
        const known = player.knownTopCardIds?.length ? player.knownTopCardIds : player.knownTopCardId ? [player.knownTopCardId] : [];
        const deck = copy.deck as CardInstance[];
        const top: CardInstance[] = [];
        for (const id of known) { const index = deck.findIndex((card) => card.cardId === id); if (index >= 0) top.push(deck.splice(index, 1)[0]); }
        deck.push(...top.reverse()); copy.knownTopCardId = known[0] ?? null; copy.knownTopCardIds = [...known];
      } else { copy.knownTopCardId = null; copy.knownTopCardIds = []; }
      return copy;
    }
    if (key === 'combatStackSelections') return record[playerId] === undefined ? {} : { [playerId]: clean(record[playerId]) };
    return Object.fromEntries(Object.entries(record).map(([name, entry]) => [name, clean(entry, name)]).filter(([, entry]) => entry !== undefined));
  }
  const state = clean(source) as GameState;
  state.log = []; state.spellProjectiles = []; state.objectPushAnimations = []; state.blessingAnimations = [];
  state.combatReveal ??= null;
  state.movementUndo = null; state.perkUndo = null;
  if (state.pendingAttack?.defenderId !== playerId && !(state.pendingAttack as PendingAttack & { oracleRevealedThisCombat?: boolean } | null)?.oracleRevealedThisCombat) {
    const pending = state.pendingAttack as PendingAttack & { oracleInstanceId?: string; oracleValueAtCombatStart?: number; oracleRevealedThisCombat?: boolean; oracleAttackRevealed?: boolean } | null;
    if (pending) {
      delete pending.oracleInstanceId; delete pending.oracleValueAtCombatStart;
      delete pending.oracleRevealedThisCombat; delete pending.oracleAttackRevealed;
    }
  }
  if (hiddenAttack) {
    const pending = source.pendingAttack!;
    state.pendingAttack = {
      attackerId: pending.attackerId, defenderId: pending.defenderId, cardId: 'attack-2', cardInstanceId: 'unrevealed-attack',
      attackValue: 2, returnToHandAfterCombat: false,
      attackerPosition: { ...(pending.attackerPosition ?? source.players[pending.attackerId].position) },
      defenderPosition: { ...(pending.defenderPosition ?? source.players[pending.defenderId].position) },
      attackerBody: pending.attackerBody, defenderBody: pending.defenderBody,
      attackerReplicaId: pending.attackerReplicaId, defenderReplicaId: pending.defenderReplicaId, defenderTombId: pending.defenderTombId,
      ...(state.players[playerId].hand.some((card) => card.cardId === 'oracle') ? {
        oracleInstanceId: state.players[playerId].hand.find((card) => card.cardId === 'oracle')!.instanceId,
        oracleValueAtCombatStart: cardBaseValue(state.players[playerId].hand.find((card) => card.cardId === 'oracle')!),
      } : {}),
    } as PendingAttack;
  }
  return { state, playerId, hiddenAttack };
}
