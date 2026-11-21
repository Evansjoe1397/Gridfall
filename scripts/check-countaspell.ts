import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { applyCommand, cardDefinition, createHotseatTestState, type CardTypeId, type GameCommand, type GameState } from '../shared/game.ts';
import { interactionPlayer } from '../src/interaction-player.ts';
import { chooseOrkkCommand, orkkCandidates, orkkDecisionPending } from '../src/orkk-bot.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';

function setup(stack = true, attack: CardTypeId = 'attack-3'): GameState {
  const state = createHotseatTestState(true, 'shinobi', 2, 'orkk');
  Object.assign(state, { phase: 'active', activePlayerId: 'P1', objects: [], elevations: {}, simultaneousCombatStack: stack });
  for (const p of Object.values(state.players)) { p.hand = []; p.deck = []; p.discard = []; p.spellEcho = [null, null, null]; p.hp = p.maxHp = 30; }
  state.players.P1.position = { x: 2, y: 2 }; state.players.P2.position = { x: 3, y: 2 };
  state.players.P1.hand = [{ instanceId: 'attack', cardId: attack }];
  state.players.P2.hand = [{ instanceId: 'defense', cardId: 'countaspell' }];
  state.players.P2.rageStacks = 3;
  return state;
}
function step(state: GameState, command: GameCommand): GameState {
  const result = applyCommand(state, command); assert.ok(result.ok, `${command.type}: ${result.ok ? '' : result.error}`);
  return JSON.parse(JSON.stringify(result.state));
}
function fight(state: GameState, extra: CardTypeId | null = null): GameState {
  if (extra) state.players.P1.hand.push({ instanceId: 'extra', cardId: extra });
  state = step(state, { type: 'attack', playerId: 'P1', cardInstanceId: 'attack', targetId: 'P2' });
  state = step(state, { type: 'defend', playerId: 'P2', cardInstanceId: 'defense' });
  while (state.phase === 'choosing-combat-stack') {
    const selections = (state as GameState & { combatStackSelections?: Partial<Record<'P1' | 'P2', unknown>> }).combatStackSelections ?? {};
    const playerId = selections.P1 === undefined ? 'P1' : 'P2';
    state = step(state, { type: 'combat-stack-choice', playerId, cardInstanceId: extra && playerId === 'P1' ? 'extra' : null });
  }
  if (extra === 'blessing-shield' && state.phase === 'choosing-mythril-helmet') state = step(state, { type: 'blessing-shield-decision', playerId: 'P1', use: true });
  return state;
}
const ack = (state: GameState) => step(step(state, { type: 'ack-combat', playerId: 'P1' }), { type: 'ack-combat', playerId: 'P2' });
const spend = (amount: number, playerId: 'P1' | 'P2' = 'P2'): GameCommand => ({ type: 'countaspell-rage', playerId, amount });
const headaches = (state: GameState) => state.players.P1.discard.filter((card) => card.cardId === 'headache');

assert.equal(cardDefinition({ instanceId: '', cardId: 'countaspell' }).value, 3);
assert.match(cardDefinition({ instanceId: '', cardId: 'countaspell' }).effectText!, /choose to spend 1 Rage per 1 Headache/);
for (const stack of [false, true]) {
  for (const amount of [0, 1, 2, 3]) {
    let state = fight(setup(stack));
    assert.equal(headaches(state).length, 0); assert.equal(state.players.P2.rageStacks, 3);
    assert.equal(applyCommand(state, spend(amount)).ok, false, 'No spending before acknowledgement.');
    state = step(state, { type: 'ack-combat', playerId: 'P1' });
    assert.equal(applyCommand(state, spend(amount)).ok, false, 'Both participants must acknowledge.');
    state = step(state, { type: 'ack-combat', playerId: 'P2' });
    assert.equal(state.phase, 'choosing-countaspell-rage'); assert.equal(interactionPlayer(state), 'P2');
    assert.equal(applyCommand(state, spend(amount, 'P1')).ok, false);
    for (const invalid of [-1, 0.5, 4, Infinity, NaN]) assert.equal(applyCommand(state, spend(invalid)).ok, false);
    assert.equal(applyCommand(state, { type: 'end-turn', playerId: 'P1' }).ok, false);
    state = step(state, spend(amount));
    assert.equal(state.players.P2.rageStacks, 3 - amount); assert.equal(headaches(state).length, amount);
    assert.ok(headaches(state).every((card) => card.sourcePlayerId === 'P2' && card.revealedToOpponent));
    assert.equal(state.players.P1.hand.filter((card) => card.cardId === 'headache').length, 0);
    assert.equal(state.phase, 'active'); assert.equal(state.activePlayerId, 'P1'); assert.equal(state.countaSpell, undefined);
    assert.equal(applyCommand(state, spend(amount)).ok, false, 'The choice resolves once.');
  }

  let state = ack(fight(setup(stack, 'blessed-might')));
  assert.equal(state.countaSpell, undefined); assert.equal(headaches(state).length, 0); assert.equal(state.players.P2.rageStacks, 3);
  if (stack) {
    state = ack(fight(setup(stack), 'heated-debate'));
    assert.equal(state.countaSpell, undefined); assert.equal(headaches(state).length, 0); assert.equal(state.players.P2.rageStacks, 3);
  }
  state = setup(stack); state.players.P2.rageStacks = 0;
  state = ack(fight(state)); assert.equal(state.phase, 'active'); assert.equal(state.countaSpell, undefined);
  state = setup(stack); state.players.P1.character = 'orkk'; state.players.P1.rageStacks = 2;
  state = ack(fight(state)); assert.equal(state.players.P2.rageStacks, 4, 'Damage Rage gained in this combat is available.');
  state = step(state, spend(4)); assert.equal(state.players.P2.rageStacks, 0); assert.equal(headaches(state).length, 4);
  state = setup(stack); state.players.P2.hp = 1;
  // A strong intrinsic Attack defeats the defender without an extra Combat Card choice.
  state.players.P1.hand = [{ instanceId: 'attack', cardId: 'fistbolt' }]; state.players.P1.rageStacks = 10;
  state.players.P1.character = 'orkk';
  state = ack(fight(state)); assert.equal(state.countaSpell, undefined);

  state = ack(fight(setup(stack, 'attack-3'), 'blessing-shield'));
  assert.equal(state.phase, 'choosing-countaspell-rage', 'Protection does not remove the defender’s payment decision.');
  state = step(state, spend(2)); assert.equal(headaches(state).length, 1, 'Shield still blocks one paid Headache.');
  assert.equal(state.players.P2.rageStacks, 1);

  state = setup(stack); state.players.P1.discard = Array.from({ length: 5 }, (_, i) => ({ instanceId: `old-${i}`, cardId: 'headache' }));
  state = ack(fight(state)); const hp = state.players.P1.hp;
  state = step(state, spend(2)); assert.equal(headaches(state).length, 5); assert.equal(state.players.P1.hp, hp - 2, 'Normal excess-copy Damage remains.');

  state = setup(stack, 'pyrodash'); state.players.P1.character = 'fyrebanks'; state.players.P1.hand.push({ instanceId: 'fuel', cardId: 'burning' });
  state.players.P1.attackRange = 2;
  state.players.P2.position = { x: 4, y: 3 };
  state = ack(fight(state)); assert.equal(state.phase, 'choosing-pyrodash-direction', 'Attack movement choices finish first.');
  state = step(state, { type: 'pyrodash-direction', playerId: 'P1', dx: 1, dy: 0 });
  assert.equal(state.phase, 'choosing-countaspell-rage'); state = step(state, spend(1)); assert.equal(headaches(state).length, 1);
}

const bot = ack(fight(setup()));
assert.equal(orkkDecisionPending(bot, 'P2'), true);
assert.deepEqual(orkkCandidates(observeMerylinMatch(bot).state, 'P2').map((cmd) => cmd.type === 'countaspell-rage' ? cmd.amount : null), [0, 1, 2, 3]);
const decision = chooseOrkkCommand(observeMerylinMatch(bot)); assert.ok(decision); step(bot, decision.command);

// Execute the production renderer with lightweight DOM fakes; no browser automation.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const renderer = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'renderCountaSpellModal')!;
const commands: GameCommand[] = [];
const listeners = new Map<string, () => void>();
let local = false; let hidden = false; let valid = true;
const input = { reportValidity: () => valid, valueAsNumber: 2 };
const modal = { innerHTML: '', classList: { toggle(_name: string, value: boolean) { hidden = value; } }, querySelector(selector: string) {
  return selector === '#countaSpellAmount' ? input : { addEventListener(_event: string, handler: () => void) { listeners.set(selector, handler); } };
} };
const render = runInNewContext(ts.transpileModule(renderer.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nrenderCountaSpellModal;', {
  gameState: bot, byId: () => modal, canLocalAct: () => local, escapeHtml: (value: string) => value, dispatch: (command: GameCommand) => commands.push(command),
});
render(); assert.equal(hidden, true); assert.equal(modal.innerHTML, '', 'The attacking seat has no spending controls.');
local = true; render(); assert.equal(hidden, false); assert.match(modal.innerHTML, /max="3"/);
listeners.get('#countaSpellSpend')!(); assert.equal(commands[0].type, 'countaspell-rage');
assert.equal(commands[0].playerId, 'P2'); assert.equal((commands[0] as Extract<GameCommand, { type: 'countaspell-rage' }>).amount, 2);
valid = false; listeners.get('#countaSpellSpend')!(); assert.equal(commands.length, 1);
listeners.get('#countaSpellSkip')!(); assert.equal((commands[1] as Extract<GameCommand, { type: 'countaspell-rage' }>).amount, 0);
console.log('CountaSpell: paid/zero spending, acknowledgement, validation/ownership, cancellation, zero Rage/defeat, Shield/copy limits, deferred Pyrodash and bot choice passed.');
