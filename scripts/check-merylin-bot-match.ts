import assert from 'node:assert/strict';
import { applyCommand, createHotseatTestState, simulateGameCommand, STARTING_DECKS, type GameCommand, type GameState, type HotseatCharacterId } from '../shared/game.ts';
import { observeMerylinMatch } from '../src/merylin-bot-observation.ts';
import { chooseMerylinCommand, merylinCandidates, merylinDecisionPending } from '../src/merylin-bot.ts';
import { chooseOrkkCommand, orkkDecisionPending } from '../src/orkk-bot.ts';

const cells = Array.from({ length: 64 }, (_, index) => ({ x: index % 8 + 1, y: Math.floor(index / 8) }));
let humanTurn = -1; let humanMoves = 0;
function humanCommand(state: GameState): GameCommand | null {
  if (humanTurn !== state.turn) { humanTurn = state.turn; humanMoves = 0; }
  const make = (type: string, fields: Record<string, unknown> = {}) => ({ type, playerId: 'P1', ...fields }) as GameCommand;
  if (state.combatReveal?.deferredAfterCombatState && !state.combatReveal.acknowledged.includes('P1')) return make('ack-combat');
  const player = state.players.P1;
  const definition = STARTING_DECKS[player.character as keyof typeof STARTING_DECKS];
  let candidates: GameCommand[] = [];
  if (['choosing-focus', 'choosing-focus-card'].includes(state.phase)) candidates = [...definition.attackFocus, ...definition.defendFocus].map((cardId) => make('choose-focus-card', { cardId }));
  else if (state.phase === 'active' || state.phase === 'dashing') {
    const enemy = state.players.P2;
    candidates = [make('free-move'),
      ...player.hand.map((card) => make('play-perk', { cardInstanceId: card.instanceId, destination: 'echo' })).filter((cmd) => cmd.type === 'play-perk' && player.hand.find((card) => card.instanceId === cmd.cardInstanceId)?.cardId === 'carian-stance'),
      ...player.hand.map((card) => make('attack', { cardInstanceId: card.instanceId, targetId: 'P2' })),
      ...cells.filter((cell) => Math.max(Math.abs(cell.x - player.position.x), Math.abs(cell.y - player.position.y)) === 1)
        .sort((a, b) => Math.max(Math.abs(a.x - enemy.position.x), Math.abs(a.y - enemy.position.y)) - Math.max(Math.abs(b.x - enemy.position.x), Math.abs(b.y - enemy.position.y)))
        .map((to) => make('move', { to })), make('end-turn')];
  } else if (state.phase === 'dance-through') candidates = [make('end-dance')];
  else if (state.phase === 'flurry-offer') candidates = [make('flurry-decline')];
  else if (state.phase === 'choosing-countaspell-rage') candidates = [make('countaspell-rage', { amount: 0 })];
  else if (state.phase === 'choosing-mana-barrage') candidates = [make('mana-barrage-decision', { use: false })];
  else if (state.phase === 'choosing-mana-mode') candidates = [make('mana-choice', { consume: false })];
  else if (state.phase === 'choosing-pyrodash-direction') candidates = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => make('pyrodash-direction', { dx, dy })));
  else if (state.phase === 'shadow-barter-tomb-offer') candidates = cells.map((to) => make('shadow-barter-tomb-square', { to }));
  else if (state.phase === 'choosing-shadow-barter-tomb-square') candidates = cells.map((to) => make('shadow-barter-tomb-square', { to }));
  else if (state.phase === 'choosing-sacrifice-tomb-square') candidates = cells.map((to) => make('sacrifice-tomb-square', { to }));
  else if (state.phase === 'choosing-spirit-guardian-square') candidates = cells.flatMap((to) => [make('spectre-replica-square', { to }), make('spirit-guardian-square', { to })]);
  else if (['choosing-narrative', 'choosing-narrative-target'].includes(state.phase)) candidates = [make('narrative-choice', { effect: 'refuse' })];
  else if (state.phase === 'choosing-mockingjay-narrative') candidates = [make('mockingjay-narrative-choice', { cardInstanceId: null })];
  else candidates = merylinCandidates(state, 'P1');
  if (humanMoves >= 8 && ['active', 'dashing'].includes(state.phase)) candidates.unshift(make('end-turn'));
  for (const cmd of candidates) {
    // Spirit Form can cross occupied Squares for free. The scripted human must
    // not bounce forever across an enemy when no further Attack is available.
    if (cmd.type === 'move' && humanMoves >= 8 && [...Object.values(state.players).filter((p) => p.id !== 'P1'), ...state.objects].some((p) => p.position.x === cmd.to.x && p.position.y === cmd.to.y)) continue;
    if (simulateGameCommand(state, cmd).ok) { if (cmd.type === 'move') humanMoves++; return cmd; }
  }
  return null;
}

const rosters: HotseatCharacterId[] = ['shinobi', 'orkk', 'magician', 'john-christ', 'spectre', 'wreckna', 'merylin', 'fyrebanks', 'kazka'];
const originalRandom = Math.random;
const opponent = process.argv.includes('--orkk') ? 'orkk' : 'merylin';
const pending = opponent === 'orkk' ? orkkDecisionPending : merylinDecisionPending;
const choose = opponent === 'orkk' ? chooseOrkkCommand : chooseMerylinCommand;
try {
  for (const initialSeed of [1657, 4217, 91]) {
  for (const character of rosters) {
    let seed = initialSeed;
    humanTurn = -1;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    let state = createHotseatTestState(false, character, 2, opponent);
    (state as GameState & { simultaneousCombatStack: boolean }).simultaneousCombatStack = true;
    let moves = 0; let botAttacks = 0; let commands = 0;
    const phases = new Set<string>();
    const tail: unknown[] = [];
    for (; commands < 900 && state.phase !== 'finished'; commands++) {
      phases.add(state.phase);
      let cmd: GameCommand | null;
      if (pending(state, 'P2')) {
        const decision = choose(observeMerylinMatch(state));
        assert.ok(decision, `${character}: bot stalled in ${state.phase}`);
        cmd = decision.command;
        if (cmd.type === 'attack') botAttacks++;
        if (cmd.type === 'move') moves++;
      } else cmd = humanCommand(state);
      assert.ok(cmd, `${character}: fixture human stalled in ${state.phase}`);
      tail.push({ phase: state.phase, cmd, actions: state.players.P2.actionsRemaining, hand: state.players.P2.hand.map((c) => c.cardId), position: state.players.P2.position });
      if (tail.length > 12) tail.shift();
      const result = applyCommand(state, cmd);
      assert.ok(result.ok, `${character}: ${cmd.type}: ${result.ok ? '' : result.error}`);
      state = result.state;
    }
    assert.equal(state.phase, 'finished', `${character}: no complete match after ${commands} commands; phase ${state.phase}, round ${state.turn}: ${JSON.stringify(tail)}`);
    assert.ok(botAttacks > 0, `${character}: bot must attack rather than only pass`);
    console.log(JSON.stringify({ character, seed: initialSeed, commands, botAttacks, moves, winner: state.winner, round: state.turn }));
  }
  }
} finally { Math.random = originalRandom; }
console.log(`${opponent} bot full-match checks passed: 27 seeded matches against all nine Hotseat characters.`);
