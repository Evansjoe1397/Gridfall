import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { activeWrecknaPhylactery, createHotseatTestState, pinnedCount, spiritGuardianEnemyPenalty } from '../shared/game.ts';

// Execute the production status composer and health-bar renderer with lightweight UI fakes.
// This catches an icon being constructed but omitted from the returned/inserted markup.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('main.ts', source, ts.ScriptTarget.Latest, true);
const names = ['playerStatusIcons', 'renderFighter'];
const functions = parsed.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(functions.length, names.length);
const code = ts.transpileModule(functions.map((node) => node.getText(parsed)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const gameState = createHotseatTestState(true, 'magician', 2, 'merylin');
for (const player of Object.values(gameState.players)) { player.hand = []; player.deck = []; player.discard = []; }
const element = { className: '', innerHTML: '', style: { setProperty() {} }, querySelector() { return null; } };
const render = runInNewContext(code + '\n({ playerStatusIcons, renderFighter });', {
  gameState, pinnedCount, activeWrecknaPhylactery, spiritGuardianEnemyPenalty,
  displayedStoicShell: (_id: string, shell: boolean) => shell,
  gameIcon: (name: string) => '<img class="game-icon" data-icon="' + name + '">',
  byId: () => element, playerUiColor: () => '#5e54ff', combatImpactUiDeferred: () => false,
  playerAbilityIcon: () => '', escapeHtml: (value: string) => value,
}) as { playerStatusIcons: (player: typeof gameState.players.P1) => string; renderFighter: (id: 'P1' | 'P2', elementId: string, side: string) => void };

// MS fix.jsonl: events 324/332/390, Mana Shield DEF 3 against ATT 2 => +1 reserve.
const logan = gameState.players.P1;
logan.hp = 14; logan.manaPoints = 2; logan.manaShieldUnusedBlock = 1;
const icons = render.playerStatusIcons(logan);
assert.match(icons, /mana-shield-reserve-status/);
assert.match(icons, /data-icon="mana-shield-reserve"/);
assert.match(icons, /<b>\+1<\/b>/);
assert.match(icons, /\+1 DEF on your next Defend Card/);
assert.match(icons, /total DEF minus the attacker.s total ATT/);
assert.match(icons, /consumed when you play a Defend Card/);
render.renderFighter('P1', 'p1Stats', 'left');
assert.match(element.innerHTML, /hud-status-strip[^]*mana-shield-reserve-status/);

logan.hand.push({ instanceId: 'headache', cardId: 'headache' });
logan.manaShieldUnusedBlock = 4;
assert.match(render.playerStatusIcons(logan), /<b>\+4<\/b>/);
assert.match(render.playerStatusIcons(logan), /headache-status/);
logan.manaShieldUnusedBlock = 0;
render.renderFighter('P1', 'p1Stats', 'left');
assert.doesNotMatch(element.innerHTML, /mana-shield-reserve-status/);
assert.match(element.innerHTML, /headache-status/);
logan.manaShieldUnusedBlock = 1; logan.hp = 0;
assert.doesNotMatch(render.playerStatusIcons(logan), /mana-shield-reserve-status/);
const other = gameState.players.P2;
other.manaShieldUnusedBlock = 2;
render.renderFighter('P2', 'p2Stats', 'right');
assert.match(element.innerHTML, /mana-shield-reserve-status[^]*<b>\+2<\/b>/);
console.log('Mana Shield status checks passed: recorded +1 reserve, actual status/HUD output, tooltip, updates, other icons, consumption, defeat and either seat.');
