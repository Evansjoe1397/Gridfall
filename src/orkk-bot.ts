import { cardDefinition, kykDirectionAllowed, type GameCommand, type GameState, type GameStateWithQuestPhases, type PlayerId } from '../shared/game.ts';
import { createNagrandPlanner } from './nagrand-bot-core.ts';

const cells = Array.from({ length: 64 }, (_, i) => ({ x: i % 8 + 1, y: Math.floor(i / 8) }));
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Targets and directions are public; the shared engine validates paths and collisions. */
function orkkChoices(state: GameState, id: PlayerId): GameCommand[] | undefined {
  const make = (type: string, fields: Record<string, unknown> = {}) => ({ type, playerId: id, ...fields }) as GameCommand;
  switch (state.phase) {
    case 'choosing-arkane-arow-target': return cells.map((to) => make('arkane-arow-target', { to }));
    case 'choosing-arm-da-wiz-choice': return ['recall', 'create'].map((choice) => make('arm-da-wiz-choice', { choice }));
    case 'choosing-arm-da-wiz-create-payment': return ['rage', 'hp'].map((payment) => make('arm-da-wiz-create-payment', { payment }));
    case 'choosing-arm-da-wiz-target': return state.objects.filter((o) => o.kind === 'orkk-shield' && o.ownerId === id).map((o) => make('arm-da-wiz-target', { objectId: o.id }));
    case 'choosing-kyk-target': return [...state.objects, ...Object.values(state.players).filter((p) => p.id !== id)]
      .filter((o) => distance(o.position, state.players[id].position) === 1
        && cells.some((to) => distance(to, o.position) === 1 && kykDirectionAllowed(state.players[id].position, o.position, to)))
      .map((o) => make('kyk-target', { objectId: o.id }));
    case 'choosing-kyk-direction': {
      const target = state.objects.find((o) => o.id === state.forceThrow?.targetId) ?? Object.values(state.players).find((p) => p.id === state.forceThrow?.targetId);
      return target ? cells.filter((to) => distance(to, target.position) === 1).map((to) => make('kyk-direction', { to })) : [];
    }
    default: return undefined;
  }
}

const planner = createNagrandPlanner({
  character: 'orkk', name: 'Da Orkk',
  forecastFinishingMoves: true,
  focus: ['shield-bash', 'knee-blast', 'countaspell', 'mana-baryer'],
  priorities: {
    fistbolt: 4.8, 'teef-strike': 4.3, 'chain-punchin': 4.2, 'shield-bash': 4.8, 'knee-blast': 5,
    'da-blokk': 4.5, double: 3.7, 'arcane-shield': 4.2, countaspell: 4.5, 'mana-baryer': 4.5,
    encourage: 5, 'arkane-arow': 4.5, 'arm-da-wiz': 4.2, kyk: 4.8, 'consume-rage': 4.2,
  },
  // Rage is ammunition, not a permanent score to hoard. Its marginal value falls
  // beyond one strong Attack, and its turn-end decay is simulated normally.
  resources(state, id) {
    const p = state.players[id];
    const burning = p.hand.filter((card) => card.cardId === 'burning').length;
    const echoCount = p.spellEcho.filter(Boolean).length;
    const waitingPerk = p.hand.some((card) => Boolean(cardDefinition(card).levelEffects?.length)
      && (card.cardId !== 'arm-da-wiz' || !p.shieldEquipped)
      && (card.cardId !== 'arkane-arow' || p.shieldEquipped));
    const advanced = p.spellEcho.reduce((value, card, index) => value + (card ? index * 3 : 0), 0);
    const canAdvance = state.activePlayerId === id && !p.perkUsed && p.spellEcho[0] && echoCount < 3;
    const advancement = canAdvance ? 3 + (waitingPerk ? 5 : 0) : 0;
    return Math.min(3, p.rageStacks) * 1.6 + Math.max(0, p.rageStacks - 3) * 0.4
      + (p.shieldEquipped ? 2 : 0) + (p.doubleRageUntilEnemyTurnEnd ? 1 : 0)
      - burning * 12 + Math.max(0, echoCount - 1) * 6 + advanced + advancement
      + (!p.spellEcho[0] && echoCount > 0 && echoCount < 3 && waitingPerk ? 5 : 0);
  },
  commandValue(before, _after, command, id) {
    if (command.type !== 'attack' || command.targetKind !== 'object') return 0;
    const target = before.objects.find((object) => object.id === command.targetId);
    if (target?.kind === 'orkk-shield' && target.ownerId === id) return -12;
    // Keep deliberate Box destruction for its Quest; do not farm it for cheap Rage.
    if (target?.kind === 'wooden-box' && (before as GameStateWithQuestPhases).questPhases?.currentQuest?.id !== 'the-elephant') return -2.5;
    return 0;
  },
  position(state, id) {
    const p = state.players[id];
    // Leave the enemy a short approach for melee pressure and Shield retrieval.
    // Stronger collision/recall rewards come from actual simulated damage.
    return state.objects.some((o) => o.kind === 'orkk-shield' && o.ownerId === id && distance(o.position, p.position) <= 3) && !p.shieldEquipped ? 0.5 : 0;
  },
  candidates: orkkChoices,
  forecastPhases: ['choosing-countaspell-rage', 'choosing-arkane-arow-target', 'choosing-arm-da-wiz-choice', 'choosing-arm-da-wiz-create-payment', 'choosing-arm-da-wiz-target', 'choosing-kyk-target', 'choosing-kyk-direction'],
});

export const chooseOrkkCommand = planner.choose;
export const orkkDecisionPending = planner.decisionPending;
export const orkkCandidates = planner.candidates;
