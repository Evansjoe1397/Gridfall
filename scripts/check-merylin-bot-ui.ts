import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createHotseatTestState } from '../shared/game.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';
import { nagrandDecisionPending } from '../src/nagrand-bot.ts';

const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
function extract(name: string): string {
  const node = ast.statements.find((node): node is ts.FunctionDeclaration => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(node, name);
  return node.getText(ast);
}
const tasks = new Map<number, () => void>(); let timer = 0; let retries = 0;
const sent: unknown[] = []; const dispatched: unknown[] = [];
class FakeWorker {
  onmessage?: (event: unknown) => void;
  onerror?: () => void;
  postMessage(value: unknown) { sent.push(value); }
  terminate() {}
}
const state = createHotseatTestState(true, 'shinobi', 2, process.argv.includes('--orkk') ? 'orkk' : 'merylin');
state.activePlayerId = 'P2'; state.phase = 'active';
state.players.P1.hand = [{ instanceId: 'private-human-card', cardId: 'hello-there' }];
const context: Record<string, any> = {
  gameState: state, mode: 'hotseat', localSeat: null, merylinBotEnabled: true,
  merylinBotWorker: null, merylinBotTimer: undefined, merylinBotRevision: 0,
  merylinBotBusy: false, merylinBotRequestedState: null,
  Worker: FakeWorker, observeMerylinMatch, merylinDecisionPending: nagrandDecisionPending,
  setTimeout: (callback: () => void) => { tasks.set(++timer, callback); return timer; },
  clearTimeout: (id: number) => tasks.delete(id),
  dispatch: (...args: unknown[]) => dispatched.push(args),
  debugRecorder: { event() {} }, console: { error() {} }, notify() {},
  showMerylinRetry: () => retries++, blessingPresentationQueues: new Map(), interactionPlayer: () => 'P2',
};
const code = ['scheduleMerylinBot', 'actingPlayer', 'canLocalAct'].map(extract).join('\n')
  .replace("new URL('./merylin-bot-worker.ts', import.meta.url)", "'worker://merylin'");
runInNewContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText, context);
const flush = () => { const pending = [...tasks.values()]; tasks.clear(); pending.forEach((callback) => callback()); };

assert.equal(context.actingPlayer(), 'P1', 'The human Hand stays selected on bot turns');
assert.equal(context.canLocalAct('P2'), false, 'Human input never controls the bot');
assert.equal(context.canLocalAct('P1'), true);
context.scheduleMerylinBot(); flush();
assert.equal(sent.length, 1);
assert.ok(!JSON.stringify(sent).includes('private-human-card'), 'Worker receives no secret Hand IDs');
const oldRevision = context.merylinBotRevision;
context.gameState = structuredClone(state); // Human submitted another independent choice while the worker was busy.
context.merylinBotWorker.onmessage({ data: { revision: oldRevision, decision: { command: { type: 'end-turn', playerId: 'P2' } } } });
assert.equal(dispatched.length, 0, 'Stale-state responses cannot dispatch');
flush(); assert.equal(sent.length, 2);
context.merylinBotWorker.onmessage({ data: { revision: context.merylinBotRevision, decision: { command: { type: 'end-turn', playerId: 'P2' }, evaluated: 12 } } });
assert.equal(dispatched.length, 1); assert.equal((dispatched[0] as unknown[])[1], true, 'Planner commands use the authorized bot path');
context.scheduleMerylinBot(); flush();
context.merylinBotWorker.onerror(); assert.equal(retries, 1); assert.equal(context.merylinBotBusy, false);
context.merylinBotEnabled = false; context.scheduleMerylinBot(); flush();
assert.equal(sent.length, 3, 'Leaving bot mode does not schedule more work');

assert.match(extract('showHotseatOpponentSelect'), /arena === 'nagrand'/);
assert.match(extract('showHotseatOpponentSelect'), /startHotseatState\(state, true\)/);
assert.match(extract('showHotseatOpponentSelect'), /\['orkk', 'merylin'\]/, 'Both character-specific bots remain selectable');
assert.match(extract('dispatch'), /command\.playerId === 'P2' && !fromBot/);
assert.match(extract('renderCombatReveal'), /merylinBotEnabled \? 'P1'/, 'Private Combat Card UI never switches to bot Hand');
console.log('Merylin bot UI/controller checks passed: Nagrand entry, human-only input/perspective, sanitized Worker messages, stale responses, recovery and leaving bot mode.');
