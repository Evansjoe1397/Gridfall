import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, type GameState } from '../shared/game.ts';

function begin(level: 2 | 3): GameState {
  const state = createHotseatTestState(true, 'wreckna', 2);
  state.phase = 'active';
  state.players.P1.hand = [{ instanceId: 'copy-source', cardId: 'defend-1' }];
  state.players.P1.deck = [{ instanceId: 'draw-source', cardId: 'attack-2' }];
  state.players.P1.spellEcho = [null, null, null];
  state.players.P1.spellEcho[level - 1] = { instanceId: 'lichdom-perk', cardId: 'lichdom' };
  const activated = applyCommand(state, { type: 'use-echo-perk', playerId: 'P1', position: level });
  assert.equal(activated.ok, true, activated.ok ? '' : activated.error);
  assert.equal(activated.state.phase, 'choosing-lichdom-target');
  return activated.state;
}

for (const level of [2, 3] as const) {
  const started = begin(level);
  const hp = started.players.P1.hp;
  const actionCount = started.players.P1.actionsRemaining;
  const declined = applyCommand(started, { type: 'lichdom-decline-phylactery', playerId: 'P1' });
  assert.equal(declined.ok, true, declined.ok ? '' : declined.error);
  assert.equal(declined.state.players.P1.hp, hp, 'Declining Lichdom does not sacrifice HP.');
  assert.equal(declined.state.players.P1.actionsRemaining, actionCount, 'Declining retains the spent Perk Action.');
  assert.equal(declined.state.objects.some((object) => object.phylacteryOwnerId === 'P1'), false);
  assert.equal(declined.state.players.P1.hand.some((card) => card.instanceId === 'draw-source'), true, 'Lichdom still draws 1 Card.');
  if (level === 3) {
    assert.equal(declined.state.phase, 'choosing-lichdom-copy', 'Level 3 still offers its copy effect.');
    const copied = applyCommand(declined.state, { type: 'lichdom-copy-choice', playerId: 'P1', cardInstanceId: 'copy-source' });
    assert.equal(copied.ok, true, copied.ok ? '' : copied.error);
    assert.equal(copied.state.phase, 'active');
    assert.equal(copied.state.players.P1.hand.some((card) => card.oneTimeCopy && card.cardId === 'defend-1'), true);
  } else assert.equal(declined.state.phase, 'active');
}
assert.equal(applyCommand(createHotseatTestState(true, 'wreckna', 2), { type: 'lichdom-decline-phylactery', playerId: 'P1' }).ok, false, 'The decline command works only during Lichdom Object selection.');

const infused = begin(2);
const infusionHp = infused.players.P1.hp;
infused.objects = [{ id: 'lichdom-box', name: 'Wooden Box', kind: 'wooden-box', hp: 3, maxHp: 3, position: { x: infused.players.P1.position.x + 1, y: infused.players.P1.position.y } }];
const selected = applyCommand(infused, { type: 'lichdom-target', playerId: 'P1', objectId: 'lichdom-box' });
assert.equal(selected.ok, true, selected.ok ? '' : selected.error);
assert.equal(selected.state.players.P1.hp, infusionHp - 1, 'Choosing an Object still pays the Lichdom HP sacrifice.');
const chosen = applyCommand(selected.state, { type: 'wreckna-phylactery-choice', playerId: 'P1', phylacteryType: 'might' });
assert.equal(chosen.ok, true, chosen.ok ? '' : chosen.error);
assert.equal(chosen.state.objects.find((object) => object.id === 'lichdom-box')?.phylacteryType, 'might');
assert.equal(chosen.state.players.P1.hand.some((card) => card.instanceId === 'draw-source'), true, 'The normal infusion path still draws a Card.');

console.log('Lichdom decline checks passed.');
