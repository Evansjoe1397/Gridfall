import { chooseMerylinCommand, merylinDecisionPending } from './merylin-bot.ts';
import { chooseOrkkCommand, orkkDecisionPending } from './orkk-bot.ts';
import type { GameState, PlayerId } from '../shared/game.ts';
import type { MerylinObservation } from './merylin-bot-observation.ts';
export type { NagrandDecision } from './nagrand-bot-core.ts';

export function nagrandDecisionPending(state: GameState, id: PlayerId): boolean {
  return merylinDecisionPending(state, id) || orkkDecisionPending(state, id);
}
export function chooseNagrandCommand(observation: MerylinObservation) {
  return observation.state.players[observation.playerId]?.character === 'orkk'
    ? chooseOrkkCommand(observation) : chooseMerylinCommand(observation);
}
