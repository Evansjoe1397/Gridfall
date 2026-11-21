import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { applyCommand, createHotseatTestState } from '../shared/game.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';

// Execute the actual production browser-worker bundle under a small message shim.
// This verifies packaging and serialization without launching a browser.
const file = readdirSync(new URL('../dist/assets/', import.meta.url)).find((name) => /^merylin-bot-worker-.*\.js$/.test(name));
assert.ok(file, 'Run npm run build before checking the production bot worker');
const url = new URL(`../dist/assets/${file}`, import.meta.url).href;
const worker = new Worker(`
  const { parentPort } = require('node:worker_threads');
  globalThis.self = globalThis;
  globalThis.postMessage = (data) => parentPort.postMessage(data);
  import(${JSON.stringify(url)}).then(() => {
    parentPort.on('message', (data) => globalThis.onmessage({ data }));
    parentPort.postMessage({ ready: true });
  });
`, { eval: true });
try {
  const orkk = process.argv.includes('--orkk');
  const state = createHotseatTestState(true, 'shinobi', 2, orkk ? 'orkk' : 'merylin');
  state.phase = 'active'; state.activePlayerId = 'P2'; state.objects = []; state.elevations = {};
  state.players.P1.position = { x: 3, y: 3 }; state.players.P1.hp = 2; state.players.P1.hand = [];
  state.players.P2.position = { x: orkk ? 4 : 5, y: 3 }; state.players.P2.hand = [{ instanceId: 'worker-blade', cardId: orkk ? 'fistbolt' : 'excalibur' }];
  state.players.P2.merylinSummonActive = true; state.players.P2.freeMoveUsed = true;
  const result = await new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Production bot worker timed out')), 10000);
    worker.on('error', (error) => { clearTimeout(timeout); reject(error); });
    worker.on('message', (message) => {
      if (message.ready) { worker.postMessage({ revision: 42, observation: observeMerylinMatch(state) }); return; }
      clearTimeout(timeout); resolve(message);
    });
  });
  assert.equal(result.revision, 42); assert.equal(result.error, undefined);
  assert.equal(result.decision.command.type, 'attack');
  assert.ok(applyCommand(state, result.decision.command).ok);
  if (orkk) {
    const counta = createHotseatTestState(true, 'shinobi', 2, 'orkk');
    counta.phase = 'choosing-countaspell-rage'; counta.activePlayerId = 'P1';
    counta.players.P2.rageStacks = 3;
    counta.countaSpell = { playerId: 'P2', attackerId: 'P1', combat: { attackerId: 'P1', defenderId: 'P2', cardId: 'attack-3', cardInstanceId: 'finished-attack', attackValue: 3, returnToHandAfterCombat: false } };
    worker.removeAllListeners('message'); worker.removeAllListeners('error');
    const paid = await new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Production CountaSpell choice timed out')), 10000);
      worker.once('error', (error) => { clearTimeout(timeout); reject(error); });
      worker.once('message', (message) => { clearTimeout(timeout); resolve(message); });
      worker.postMessage({ revision: 43, observation: observeMerylinMatch(counta) });
    });
    assert.equal(paid.revision, 43); assert.equal(paid.error, undefined);
    assert.equal(paid.decision.command.type, 'countaspell-rage');
    assert.ok(applyCommand(counta, paid.decision.command).ok, 'The built Worker resolves the new defender-owned choice legally.');
  }
  console.log(`Production ${orkk ? 'Da Orkk' : 'Merylin'} bot worker check passed: bundle loads, receives observation and returns a legal tactical command.`);
} finally { await worker.terminate(); }
