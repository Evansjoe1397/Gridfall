import { cardDefinition } from '../shared/game.ts';
import { createNagrandPlanner } from './nagrand-bot-core.ts';
export type { NagrandDecision as MerylinDecision } from './nagrand-bot-core.ts';

const planner = createNagrandPlanner({
  character: 'merylin', name: 'Merylin',
  focus: ['lightbringer', 'frostmourne', 'yamato', 'oracle'],
  forecastFinishingMoves: true,
  resources(state, id) {
    const player = state.players[id];
    // Beyond the immediate payment, carrying Burning threatens another turn's
    // damage and occupies Hand space. Dash clears that continuing liability.
    const burning = player.hand.filter((card) => card.cardId === 'burning').length;
    const echoCount = player.spellEcho.filter(Boolean).length;
    const waitingPerk = player.hand.some((card) => cardDefinition(card).kind === 'perk');
    const advanced = player.spellEcho.reduce((value, card, index) => value + (card ? index * 3 : 0), 0);
    const openInsertion = !player.spellEcho[0] && echoCount > 0 && echoCount < 3 && waitingPerk ? 6 : 0;
    // Credit a legal upcoming shift while still acting, so development can
    // coexist with attacks/movement rather than forcing an immediate turn end.
    const canAdvance = state.activePlayerId === id && !player.perkUsed && player.spellEcho[0] && echoCount < 3;
    const advancement = canAdvance ? 3 + (waitingPerk ? 6 : 0) : 0;
    const developed = Math.max(0, echoCount - 1) * 7;
    return -burning * 12 + developed + advanced + openInsertion + advancement;
  },
});
export const chooseMerylinCommand = planner.choose;
export const merylinDecisionPending = planner.decisionPending;
export const merylinCandidates = planner.candidates;
