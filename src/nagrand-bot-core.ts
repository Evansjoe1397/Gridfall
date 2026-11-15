import {
  STARTING_DECKS, cardBaseValue, cardDefinition, effectiveAttackRange, movementPath,
  phaseCardCandidates, simulateGameCommand, type CardInstance, type CardTypeId, type GameCommand,
  type GameState, type GameStateWithQuestPhases, type PlayerId,
} from '../shared/game.ts';
import { NAGRAND_ARENA } from '../shared/arenas.ts';
import { interactionPlayer } from './interaction-player.ts';
import type { MerylinObservation as NagrandObservation } from './merylin-bot-observation.ts';

export type NagrandDecision = { command: GameCommand; explanation: string; evaluated: number };
export type NagrandBotProfile = {
  character: 'merylin' | 'orkk'; name: string; focus: CardTypeId[];
  priorities?: Partial<Record<CardTypeId, number>>;
  resources?: (state: GameState, id: PlayerId) => number;
  position?: (state: GameState, id: PlayerId) => number;
  candidates?: (state: GameState, id: PlayerId) => GameCommand[] | undefined;
  forecastPhases?: string[];
  forecastFinishingMoves?: boolean;
};

/** Shared fair search machinery; each character supplies its own economy and tactics. */
export function createNagrandPlanner(profile: NagrandBotProfile) {
  const cells = Array.from({ length: 64 }, (_, index) => ({ x: index % 8 + 1, y: Math.floor(index / 8) }));
  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  const label = (cell: { x: number; y: number }) => `${String.fromCharCode(64 + cell.x)}${cell.y + 1}`;
  const negative = new Set<CardTypeId>(['pinned', 'headache', 'exhaust', 'burning', 'panic']);
  type LocalState = GameState & {
    combatStackSelections?: Partial<Record<PlayerId, string[]>>;
    openingSetup?: { pendingPlayerIds: PlayerId[]; focusByPlayer: Partial<Record<PlayerId, 'attack' | 'defend'>> };
  };

  function decisionPending(state: GameState, playerId: PlayerId): boolean {
    if (Object.keys(state.players).length !== 2 || state.perkMode || state.series
      || ((state as GameState & { arenaId?: string }).arenaId ?? 'nagrand') !== 'nagrand') return false;
    if (state.phase === 'finished' || state.players[playerId]?.character !== profile.character) return false;
    const local = state as LocalState;
    if (state.phase === 'choosing-combat-stack') return Boolean(state.pendingAttack && [state.pendingAttack.attackerId, state.pendingAttack.defenderId].includes(playerId) && local.combatStackSelections?.[playerId] === undefined);
    if (['choosing-phase-card', 'choosing-phase-three-card', 'choosing-phase-destination'].includes(state.phase)) {
      return Boolean((state as GameStateWithQuestPhases).questPhases?.phaseReward?.pendingPlayerIds.includes(playerId));
    }
    if (state.combatReveal && !state.phase.startsWith('choosing-') && state.pendingAttack?.combatResolutionCommitted) return !state.combatReveal.acknowledged.includes(playerId);
    return interactionPlayer(state) === playerId;
  }

  /** Value in this character's economy, never knowledge of an enemy's hidden Cards. */
  function cardWorth(card: CardInstance): number {
    if (negative.has(card.cardId)) return -2.5;
    const definition = cardDefinition(card);
    const priorities: Partial<Record<CardTypeId, number>> = {
      'carian-stance': 5, 'windwalker-stance': 4.5, 'kamelot-stance': 4, 'spellsinger-stance': 5,
      excalibur: 5, sting: 4.5, moonlight: 4, 'decisive-block': 4.5, tactician: 3.5, redirect: 3.5,
      lightbringer: 5, frostmourne: 5.5, yamato: 4.5, oracle: 4,
    };
    return (profile.priorities ?? priorities)[card.cardId] ?? (definition.kind === 'defend' ? 2 + cardBaseValue(card) * 0.5 : definition.kind === 'attack' ? 2 + definition.value * 0.4 : 2);
  }

  function positionValue(state: GameState, id: PlayerId): number {
    const player = state.players[id]; const enemy = Object.values(state.players).find((entry) => entry.id !== id && entry.hp > 0)!;
    if (!enemy) return 0;
    const d = distance(player.position, enemy.position);
    const canAttack = player.hand.some((card) => cardDefinition(card).kind === 'attack') && (player.actionsRemaining > 0 || (player.spellsingerExtraAttacks ?? 0) > 0);
    const ideal = canAttack ? profile.character === 'merylin' && player.hand.some((card) => card.cardId === 'excalibur') ? 2 : 1 : player.hp < 8 ? effectiveAttackRange(state, enemy) + 2 : 2;
    let value = -Math.abs(d - ideal) * (canAttack ? 1.3 : 0.4);
    const square = label(player.position);
    if ((state.elevations[square] ?? 0) > 0) value += 2.3;
    if (NAGRAND_ARENA.bases[id].includes(square)) value += 0.7;
    if (player.hp < 7 && d <= effectiveAttackRange(state, enemy)) value -= 4;
    if (player.hand.some((card) => card.cardId === 'tactician') && cells.some((cell) => Math.abs(cell.x - player.position.x) + Math.abs(cell.y - player.position.y) === 1
      && (state.objects.some((object) => object.kind === 'wall-pillar' && distance(object.position, cell) === 0) || !(state.elevations[square] > 0) && state.elevations[label(cell)] > 0))) value += 1.5;
    if (player.hand.some((card) => card.cardId === 'redirect') && state.objects.some((object) => distance(player.position, object.position) === 1)) value += 0.8;
    const quest = (state as GameStateWithQuestPhases).questPhases?.currentQuest;
    if (quest?.id === 'provocateur' && state.elevations[square] > 0) value += 2;
    if (quest?.id === 'the-spy' && NAGRAND_ARENA.bases[enemy.id].includes(square)) value += 2;
    if (quest?.id === 'capture-the-flag') {
      const flags = (state as GameStateWithQuestPhases).questPhases?.captureTheFlag?.flags ?? [];
      const carrying = flags.some((flag) => flag.carrierId === id);
      const goal = carrying ? NAGRAND_ARENA.bases[id] : NAGRAND_ARENA.bases[enemy.id];
      const goalDistance = Math.min(...goal.map((entry) => distance(player.position, { x: entry.charCodeAt(0) - 64, y: Number(entry.slice(1)) - 1 })));
      value += (carrying ? 8 : 2) - goalDistance * (carrying ? 1.5 : 0.35);
    }
    return value + (profile.position?.(state, id) ?? 0);
  }

  function evaluate(state: GameState, id: PlayerId): number {
    const player = state.players[id]; const enemy = Object.values(state.players).find((entry) => entry.id !== id)!;
    if (player.hp <= 0 || state.phase === 'finished' && state.winner !== id) return -10000;
    if (enemy.hp <= 0 || state.phase === 'finished' && state.winner === id) return 10000;
    const quests = (state as GameStateWithQuestPhases).questPhases;
    return player.hp * 9 - enemy.hp * 8 - Math.max(0, 7 - player.hp) ** 2
      + player.hand.reduce((total, card) => total + cardWorth(card) * 0.65, 0)
      - Math.max(0, player.hand.length - 5) * 2
      + player.spellEcho.reduce((total, card, index) => total + (card ? cardWorth(card) * (0.65 + index * 0.2) : 0), 0)
      + (player.merylinSummonActive ? 3 : 0) + (player.merylinSummonedDefenseBonus ?? 0)
      + (player.barbarianNextAttackBonus ?? 0) * 1.1 + (player.spellsingerExtraAttacks ?? 0)
      + positionValue(state, id) + Math.min(6, player.movementRemaining) * 0.12
      + (quests?.currentQuest?.progress[id] ?? 0) * 1.4
      + (player.matchStats?.objectsDestroyed ?? 0) * (quests?.currentQuest?.id === 'the-elephant' ? 2 : 0.15)
      + enemy.hand.filter((card) => negative.has(card.cardId)).length * 0.7
      + (profile.resources?.(state, id) ?? 0);
  }

  function command(type: string, playerId: PlayerId, fields: Record<string, unknown> = {}): GameCommand {
    return { type, playerId, ...fields } as GameCommand;
  }

  /** Candidates use ONLY the sanitized observation. The rules engine rejects illegal hypotheses. */
  function candidates(state: GameState, id: PlayerId): GameCommand[] {
    const player = state.players[id]; const phase: string = state.phase;
    const make = (type: string, fields: Record<string, unknown> = {}) => command(type, id, fields);
    const specific = profile.candidates?.(state, id);
    if (specific) return specific;
    const ownCards = [...player.hand, ...player.deck, ...player.discard];
    const reward = (state as GameStateWithQuestPhases).questPhases?.phaseReward;
    if (['choosing-phase-card', 'choosing-phase-three-card', 'choosing-phase-destination'].includes(phase)
      && (reward?.playerProgress?.[id]?.selectedCardId || reward?.pendingPlayerIds[0] === id && reward?.selectedCardId)) {
      return [make('phase-card-destination', { destination: player.hand.length < 5 ? 'hand' : 'shuffle' })];
    }
    const enemies = [...Object.values(state.players).filter((entry) => entry.id !== id && entry.hp > 0).map((entry) => ({ id: entry.id, kind: 'player' })),
      ...state.objects.filter((object) => object.kind === 'spectre-replica' && object.ownerId !== id).map((object) => ({ id: object.id, kind: 'object' }))];
    if (state.combatReveal && !phase.startsWith('choosing-') && state.pendingAttack?.combatResolutionCommitted) return [make('ack-combat')];
    if (phase === 'choosing-focus' || phase === 'choosing-focus-card') return profile.focus.map((cardId) => make('choose-focus-card', { cardId }));
    if (phase === 'choosing-phase-card') return phaseCardCandidates(state, id).map((cardId) => make('phase-card-choice', { cardId }));
    if (phase === 'choosing-phase-destination') return [make('phase-card-destination', { destination: player.hand.length < 5 ? 'hand' : 'shuffle' })];
    if (phase === 'choosing-phase-three-card') return [
      ...ownCards.filter((card) => negative.has(card.cardId)).map((card) => make('phase-three-operation', { cardInstanceId: card.instanceId, operation: 'remove' })),
      ...ownCards.filter((card) => cardWorth(card) >= 4.5).map((card) => make('phase-three-operation', { cardInstanceId: card.instanceId, operation: 'duplicate' })), make('phase-three-finish'),
    ];
    if (phase === 'defending') return [
      ...player.hand.filter((card) => cardDefinition(card).kind === 'defend').map((card) => make('defend', { cardInstanceId: card.instanceId })),
      ...(player.hand.some((card) => card.cardId === 'oracle' && cardBaseValue(card) > 1)
        && player.hand.some((card) => card.cardId !== 'oracle' && cardDefinition(card).kind === 'defend') ? [make('oracle-reveal')] : []), make('pass-defense'),
    ];
    if (phase === 'choosing-combat-stack') return [make('combat-stack-choice', { cardInstanceId: null }), ...player.hand.map((card) => make('combat-stack-choice', { cardInstanceId: card.instanceId }))];
    if (phase === 'choosing-yamato-move') return [make('yamato-move', { to: null }), ...cells.filter((cell) => distance(cell, player.position) === 1).map((to) => make('yamato-move', { to }))];
    if (phase === 'choosing-lightbringer-swap') return [make('lightbringer-swap-decision', { swap: false }), make('lightbringer-swap-decision', { swap: true })];
    if (phase === 'choosing-frostmourne') return [make('frostmourne-decision', { use: player.hp > 4 })];
    if (phase === 'choosing-kamelot-removal') return [
      ...ownCards.filter((card) => negative.has(card.cardId)).map((card) => make('kamelot-remove', { cardInstanceId: card.instanceId })), make('kamelot-remove', { cardInstanceId: null }),
    ];
    if (phase === 'choosing-spellsinger-discard') return player.discard.map((card) => make('spellsinger-discard', { cardInstanceId: card.instanceId }));
    if (phase === 'choosing-sweet-potato') return ['heal', 'cleanse'].map((choice) => make('sweet-potato-choice', { choice }));
    if (phase === 'choosing-blessed-prayer-discard') return [
      ...player.hand.filter((card) => negative.has(card.cardId)).map((card) => make('spectre-status-choice', { cardInstanceId: card.instanceId })),
      make('spectre-status-choice', { cardInstanceId: null }),
    ];
    if (phase === 'choosing-boomerang-target') return enemies.map((target) => make('boomerang-target', { targetId: target.id, targetKind: target.kind === 'player' ? 'player' : 'replica' }));
    if (phase === 'choosing-fireball-target') return enemies.map((target) => make('fireball-target', { targetId: target.id, targetKind: target.kind === 'player' ? 'player' : 'replica' }));
    if (phase === 'choosing-portal-target') return cells.map((to) => make('portal-teleport', { to }));
    if (phase === 'choosing-weaver-story') return [make('weaver-choice', { choice: 'draw' }), ...player.hand.map((card) => make('weaver-choice', { choice: 'discard', cardInstanceId: card.instanceId }))];
    if (phase === 'mana-blast-offer') return state.pendingAttack?.feedSpiritOffered
      ? [make('feed-spirit-decision', { cardInstanceId: null }), ...player.hand.map((card) => make('feed-spirit-decision', { cardInstanceId: card.instanceId }))]
      : [make('mana-blast-refuse'), ...player.hand.map((card) => make('mana-blast-discard', { cardInstanceId: card.instanceId }))];
    if (phase === 'choosing-mockingjay-defense') return [make('mockingjay-defense-choice', { choice: 'draw' }), make('mockingjay-defense-choice', { choice: 'discard' })];
    const discards: Record<string, string> = {
      'choosing-end-discard': 'discard-card', 'choosing-guard-discard': 'discard-card', 'choosing-dash-discard': 'discard-card',
      'choosing-hot-potato-discard': 'discard-card', 'choosing-force-disarm-discard': 'force-disarm-discard',
      'choosing-flurry-enemy-discard': 'flurry-enemy-discard', 'choosing-grimoire-discard': 'grimoire-discard',
      'choosing-mind-tricks-enemy-discard': 'mind-tricks-enemy-discard', 'choosing-shadow-barter-discard': 'shadow-barter-discard',
      'choosing-decay-discard': 'decay-discard', 'choosing-sap-defend': 'sap-defend-reveal',
    };
    if (discards[phase]) return [...player.hand.map((card) => make(discards[phase], { cardInstanceId: card.instanceId })), ...(phase === 'choosing-end-discard' ? [make('end-turn')] : [])];
    const decisions: Record<string, string> = {
      'choosing-exhaust': 'exhaust-decision', 'choosing-vicious-mockery': 'vicious-mockery-decision',
      'choosing-mythril-helmet': state.pendingAttack?.blessingShieldApplied === undefined ? 'blessing-shield-decision' : 'mythril-helmet-decision',
      'choosing-blessing-faith': 'blessing-faith-decision',
    };
    if (decisions[phase]) return [make(decisions[phase], { use: false }), make(decisions[phase], { use: true })];
    if (!['active', 'dashing'].includes(phase)) return [];
    const moves = player.movementRemaining > 0 ? cells.filter((cell) => distance(cell, player.position) > 0 && distance(cell, player.position) <= player.movementRemaining)
      .filter((cell) => movementPath(state, player, cell).length > 0).map((to) => make('move', { to })) : [];
    if (phase === 'dashing') return [...moves, make('end-turn')];
    return [
      ...(!player.freeMoveUsed ? [make('free-move')] : []),
      ...player.hand.flatMap((card): GameCommand[] => {
        const definition = cardDefinition(card);
        if (definition.kind === 'attack') return [...enemies, ...state.objects.filter((object) => object.kind !== 'spectre-replica').map((object) => ({ id: object.id, kind: 'object' }))]
          .map((target) => make('attack', { cardInstanceId: card.instanceId, targetId: target.id, targetKind: target.kind }));
        if (definition.kind === 'perk') return [make('play-perk', { cardInstanceId: card.instanceId, destination: 'direct' }), ...[1, 2, 3].map((echoPosition) => make('play-perk', { cardInstanceId: card.instanceId, destination: 'echo', echoPosition, replaceExisting: true }))];
        if (definition.kind === 'free-action') return [make('play-free-action', { cardInstanceId: card.instanceId })];
        if (negative.has(card.cardId)) return [make('remove-status', { cardInstanceId: card.instanceId })];
        return [];
      }),
      ...player.spellEcho.flatMap((card, index) => card ? [make('use-echo-perk', { position: index + 1 })] : []),
      ...moves, make('guard'), make('dash'), make('end-turn'),
    ];
  }

  function simulate(state: GameState, cmd: GameCommand): GameState | null {
    const result = simulateGameCommand(state, cmd);
    return result.ok ? result.state : null;
  }

  /** Forecast only a hypothesis. Live hidden Cards never enter this function. */
  function resolveForecast(state: GameState, id: PlayerId, depth = 0): GameState {
    let current = state;
    for (let count = 0; count < 16; count++) {
      if (current.combatReveal?.deferredAfterCombatState) return JSON.parse(current.combatReveal.deferredAfterCombatState) as GameState;
      // A Guard draw is provisional: pay its discard and resolve the actual
      // turn end before comparing it with Dash or simply ending the turn.
      if (profile.forecastFinishingMoves && current.activePlayerId === id
        && ['choosing-guard-discard', 'choosing-end-discard', 'choosing-hot-potato-discard'].includes(current.phase)) {
        const player = current.players[id];
        const payments = current.phase === 'choosing-end-discard' && player.hand.length <= 5
          ? [command('end-turn', id)]
          : [...player.hand].sort((a, b) => cardWorth(a) - cardWorth(b))
            .map((card) => command('discard-card', id, { cardInstanceId: card.instanceId }));
        const next = payments.map((cmd) => simulate(current, cmd)).find((result) => result !== null);
        if (!next) break;
        current = next; continue;
      }
      if (current.phase === 'choosing-combat-stack' && current.pendingAttack) {
        const local = current as LocalState;
        const actor = [current.pendingAttack.attackerId, current.pendingAttack.defenderId].find((actorId) => local.combatStackSelections?.[actorId] === undefined);
        if (!actor) break;
        const next = simulate(current, command('combat-stack-choice', actor, { cardInstanceId: null }));
        if (!next) break; current = next; continue;
      }
      // Resolve bounded positional choices so their actual Card effects influence scoring.
      if (['choosing-yamato-move', 'choosing-lightbringer-swap', 'choosing-frostmourne', ...(profile.forecastPhases ?? [])].includes(current.phase as string) && interactionPlayer(current) === id) {
        const choices = candidates(current, id).map((cmd) => simulate(current, cmd)).filter((next): next is GameState => Boolean(next))
          .map((next) => depth < 3 && (profile.forecastPhases ?? []).includes(next.phase) ? resolveForecast(next, id, depth + 1) : next);
        const next = choices.sort((a, b) => evaluate(b, id) - evaluate(a, id))[0];
        if (!next) break; current = next; continue;
      }
      break;
    }
    return current;
  }

  function possibleCards(state: GameState, enemyId: PlayerId, kind: 'attack' | 'defend'): CardTypeId[] {
    const definition = STARTING_DECKS[state.players[enemyId].character as keyof typeof STARTING_DECKS];
    const ids = definition ? [...definition.defaults, ...definition.attackFocus, ...definition.defendFocus] : ['attack-2', 'attack-3', 'defend-1'] as CardTypeId[];
    const available = [...new Set(ids)].filter((cardId) => cardDefinition({ cardId, instanceId: '' }).kind === kind);
    return available.sort((a, b) => cardDefinition({ cardId: a, instanceId: '' }).value - cardDefinition({ cardId: b, instanceId: '' }).value);
  }

  function scoredTransition(observation: NagrandObservation, cmd: GameCommand): { state: GameState; score: number } | null {
    const { state, playerId: id } = observation;
    const simulated = simulate(state, cmd);
    if (!simulated) return null;
    // Never enter a mandatory targeting sequence with no completable legal choice
    // (for example, a diagonal Kyk target already at the board corner).
    if ((profile.forecastPhases ?? []).includes(simulated.phase)) {
      const completed = resolveForecast(simulated, id);
      if ((profile.forecastPhases ?? []).includes(completed.phase) && interactionPlayer(completed) === id) return null;
    }
    let score: number;
    if (cmd.type === 'attack' && simulated.pendingAttack && !simulated.combatReveal) {
      const declared = resolveForecast(simulated, id);
      const defenderId = declared.pendingAttack?.defenderId ?? simulated.pendingAttack.defenderId;
      const defenses = possibleCards(state, defenderId, 'defend');
      const scenarios: (CardTypeId | null)[] = [null];
      if (state.players[defenderId].hand.length) scenarios.push(defenses[Math.floor(defenses.length / 2)] ?? 'defend-1', defenses.at(-1) ?? 'defend-1');
      const scores = scenarios.map((cardId) => {
        const copy = structuredClone(declared);
        if (cardId) copy.players[defenderId].hand.push({ instanceId: 'hypothesis-defense', cardId });
        const result = simulate(copy, cardId ? command('defend', defenderId, { cardInstanceId: 'hypothesis-defense' }) : command('pass-defense', defenderId));
        return evaluate(result ? resolveForecast(result, id) : copy, id);
      });
      score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    } else if (observation.hiddenAttack && ['defend', 'pass-defense', 'oracle-reveal', 'yamato-move'].includes(cmd.type) && state.pendingAttack) {
      const attacks = possibleCards(state, state.pendingAttack.attackerId, 'attack');
      const scenarios = [attacks[0], attacks[Math.floor(attacks.length / 2)], attacks.at(-1)].filter((cardId): cardId is CardTypeId => Boolean(cardId));
      const scores = scenarios.map((cardId) => {
        const copy = structuredClone(state); const pending = copy.pendingAttack!;
        pending.cardId = cardId;
        const attacker = copy.players[pending.attackerId];
        pending.attackValue = cardDefinition({ cardId, instanceId: '' }).value + (attacker.character === 'orkk' ? attacker.rageStacks : 0)
          + (copy.elevations[label(attacker.position)] > 0 && !(copy.elevations[label(copy.players[id].position)] > 0) ? 1 : 0);
        const result = simulate(copy, cmd);
        return evaluate(result ? resolveForecast(result, id) : copy, id);
      });
      score = scores.reduce((sum, value) => sum + value, 0) / Math.max(1, scores.length);
      if (cmd.type === 'oracle-reveal') score -= 0.5; // Information has value, but revealing is not free defense.
    } else score = evaluate(resolveForecast(simulated, id), id);
    // Choices that add Cards to the Deck have value even before the next draw.
    if (cmd.type === 'choose-focus-card' || cmd.type === 'phase-card-choice') score += cardWorth({ instanceId: '', cardId: cmd.cardId }) * 2;
    if (cmd.type === 'phase-three-operation') score += cmd.operation === 'remove' ? 4 : 2;
    if (cmd.type === 'dash') score -= 0.6;
    if (cmd.type === 'move') score -= 0.15;
    return { state: simulated, score };
  }

  /** Receding-horizon beam search: execute only its first command, then observe again. */
  function choose(observation: NagrandObservation): NagrandDecision | null {
    const { state, playerId } = observation;
    if (!decisionPending(state, playerId)) return null;
    let evaluated = 0;
    const choices = candidates(state, playerId).flatMap((cmd) => {
      evaluated++;
      const result = scoredTransition(observation, cmd);
      return result ? [{ ...result, command: cmd }] : [];
    }).sort((a, b) => b.score - a.score);
    if (!choices.length) return null;
    // Search one further decision only while we still control this ordinary turn.
    for (const choice of choices.slice(0, 5)) {
      if (!['active', 'dashing'].includes(choice.state.phase) || choice.state.activePlayerId !== playerId || choice.state.combatReveal) continue;
      const nextObservation = { state: choice.state, playerId, hiddenAttack: false };
      let best = choice.score;
      for (const cmd of candidates(choice.state, playerId)) {
        if (cmd.type === 'move' && choice.command.type === 'move') continue;
        evaluated++;
        const next = scoredTransition(nextObservation, cmd);
        if (next) best = Math.max(best, next.score - 0.2);
      }
      choice.score = best;
    }
    choices.sort((a, b) => b.score - a.score);
    // Do not wander for a neutral score; ending/Guard are evaluated alternatives.
    const best = choices[0];
    return { command: best.command, explanation: `${profile.name} · ${best.command.type.replaceAll('-', ' ')} · tactical score ${best.score.toFixed(1)}`, evaluated };
  }
  return { choose, decisionPending, candidates };
}
