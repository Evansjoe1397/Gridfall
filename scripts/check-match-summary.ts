import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createInitialState, createBestOfThreeState, applyCommand, type GameState } from '../shared/game.ts';
import { elapsedSummaryDuration, formatSummaryDuration } from '../src/summary-duration.ts';

// Execute the actual summary renderer with small DOM stand-ins; no browser needed.
const source = ts.createSourceFile('main.ts', readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['matchStatsTable', 'seriesMatchResults', 'renderMatchResults'];
const functions = names.map((name) => {
  const node = source.statements.find((statement) => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  assert.ok(node, `Missing ${name}`);
  return node.getText(source);
}).join('\n');
const javascript = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function render(state: GameState): string {
  const classes = new Set(['hidden']);
  const modal = {
    innerHTML: '',
    classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
    querySelectorAll: () => [],
    querySelector: () => ({ addEventListener() {} }),
  };
  runInNewContext(`${javascript}\nrenderMatchResults();`, {
    gameState: state, matchEndPresentation: { phase: 'ready' }, mode: 'hotseat', localSeat: 'P1',
    byId: (id: string) => id === 'matchResultsModal' ? modal : { addEventListener() {} },
    ensureMatchEndPresentation() {}, resetMatchEndPresentation() {}, downloadCombatSummary() {}, dispatch() {},
    playerUiColor: () => '#fff', escapeHtml: (value: string) => value,
    elapsedSummaryDuration, formatSummaryDuration,
  });
  assert.equal(classes.has('hidden'), state.phase !== 'finished');
  return modal.innerHTML;
}

const single = createInitialState();
single.phase = 'finished';
single.winner = 'P1';
single.matchStartedAt = 1000;
single.matchEndedAt = 66000;
const html = render(single);
assert.ok(html.includes('wins'));
assert.ok(html.includes('Match duration: <strong>1m 5s</strong>'));
assert.ok(html.includes('Review battlefield'));
assert.ok(!html.includes('data-series-ready'));
single.winner = null;
assert.ok(render(single).includes('Match results'));
single.phase = 'active';
assert.equal(render(single), '');

let series = createBestOfThreeState('tournament', { P1: ['shinobi', 'magician'], P2: ['orkk', 'spectre'] }, true);
function command(state: GameState, raw: unknown): GameState {
  const result = applyCommand(state, raw);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  return result.state;
}
function win(state: GameState): GameState {
  state.phase = 'active';
  state.activePlayerId = 'P1';
  state.players.P2.hp = 0;
  return command(state, { type: 'free-move', playerId: 'P1' });
}
series = win(series);
assert.ok(render(series).includes('Ready for Match 2'));
series = command(series, { type: 'ready-series-match', playerId: 'P1' });
series = command(series, { type: 'ready-series-match', playerId: 'P2' });
series = win(series);
const tournamentHtml = render(series);
assert.ok(tournamentHtml.includes('Tournament total duration:'));
assert.ok(tournamentHtml.includes('Match 1 ·'));
assert.ok(tournamentHtml.includes('Match 2 ·'));
assert.ok(!tournamentHtml.includes('data-series-ready'));

const draw = createBestOfThreeState('duel', { P1: ['shinobi', 'shinobi'], P2: ['orkk', 'orkk'] }, true);
draw.phase = 'finished';
draw.winner = null;
assert.ok(render(draw).includes('Replay Match 1'));
console.log('Match summary rendering checks passed.');
