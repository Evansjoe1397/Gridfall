import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Client, type Room } from '@colyseus/sdk';
import { assign, createActor, setup } from 'xstate';
import { LORDAERON_ARENA } from '../shared/arenas.ts';
import { CARD_RULES_RU, UI_RU_EXACT } from './i18n.ts';
import {
  CARDS,
  ACTION_QUEST_POOL,
  STARTING_DECKS,
  applyCommand,
  arcaneMisslePath,
  arkaneArowPath,
  cardDefinition,
  cellLabel,
  BOARD_SIZE,
  createHotseatTestState,
  createInitialState,
  distance,
  diagonalMovementBlockedByObject,
  effectiveMoveRange,
  hasLineOfSight,
  isCardRevealedToOpponents,
  movementPath,
  kykDirectionAllowed,
  pinnedCount,
  type CardTypeId,
  type Cell,
  type GameCommand,
  type GameState,
  type PlayerId,
} from '../shared/game.ts';

type Selection = { kind: 'none' } | { kind: 'move' } | { kind: 'attack'; cardInstanceId: string } | { kind: 'perk'; cardInstanceId: string };
const selectionMachine = setup({
  types: {} as {
    context: { selection: Selection };
    events: { type: 'SELECT_MOVE' } | { type: 'SELECT_ATTACK'; cardInstanceId: string } | { type: 'SELECT_PERK'; cardInstanceId: string } | { type: 'CLEAR' };
  },
  actions: {
    selectMove: assign({ selection: () => ({ kind: 'move' as const }) }),
    selectAttack: assign({ selection: ({ event }) => event.type === 'SELECT_ATTACK' ? ({ kind: 'attack' as const, cardInstanceId: event.cardInstanceId }) : ({ kind: 'none' as const }) }),
    selectPerk: assign({ selection: ({ event }) => event.type === 'SELECT_PERK' ? ({ kind: 'perk' as const, cardInstanceId: event.cardInstanceId }) : ({ kind: 'none' as const }) }),
    clear: assign({ selection: () => ({ kind: 'none' as const }) }),
  },
}).createMachine({
  context: { selection: { kind: 'none' } },
  on: {
    SELECT_MOVE: { actions: 'selectMove' },
    SELECT_ATTACK: { actions: 'selectAttack' },
    SELECT_PERK: { actions: 'selectPerk' },
    CLEAR: { actions: 'clear' },
  },
});

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <main class="shell">
    <header class="masthead">
      <div><p class="eyebrow">NAGRAND ARENA · 8x8 TEST BUILD</p><h1>GRIDFALL</h1></div>
      <div class="connection" id="connection"><span></span> Hotseat ready</div>
    </header>
    <section class="lobby" id="lobby">
      <div class="lobby-copy"><p class="eyebrow">CHOOSE SESSION</p><h2>Enter the Arena</h2><p>Test Long Hat Logan locally on the 4x4 Test Board, or enter an online duel in Nagrand Arena.</p></div>
      <div class="mode-grid">
        <button class="mode-card primary" id="hotseat"><span>LOCAL / INSTANT</span><strong>Hotseat duel</strong><small>Share this keyboard and pass control each turn.</small></button>
        <div class="mode-card online"><span>PRIVATE ROOM</span><strong>Multiplayer</strong><label>Room password<input id="password" maxlength="24" placeholder="optional secret" /></label><div><button id="createRoom">Create room</button><button id="joinRoom">Join by ID</button></div><input id="roomId" maxlength="24" placeholder="ROOM ID" /></div>
      </div>
      <div class="online-waiting hidden" id="onlineWaiting"></div>
    </section>
    <section class="game hidden" id="game">
      <div class="hud">
        <article class="fighter blue" id="p1Stats"></article>
        <div class="turn-core"><span id="turnNumber">ROUND 01</span><strong id="turnLabel">AZURE DUMMY</strong><small id="phaseLabel">SELECT AN ACTION</small></div>
        <article class="fighter red" id="p2Stats"></article>
        <article class="fighter violet hidden" id="p3Stats"></article>
      </div>
      <div class="arena-frame"><div id="board"></div><div class="character-trait-panel" id="characterTraitPanel"></div><div class="character-trait-panel trait-p2" id="characterTraitPanelP2"></div><div class="character-status-panel status-p1" id="statusP1"></div><div class="character-status-panel status-p2" id="statusP2"></div><div class="character-status-panel status-p3" id="statusP3"></div><div class="opponent-hand-panels" id="opponentHandPanels"></div><div class="spell-echo-bars" id="spellEchoBars"></div><button class="direct-perk hidden" id="directPerkButton">Play Perk Directly · Level 1</button><button class="direct-perk hidden" id="mindTricksFinishButton">Use Mind Tricks without revealing</button><button class="direct-perk finish-dance hidden" id="finishDanceButton">Cancel Dance Through</button><div class="prompt" id="prompt"></div></div>
      <div class="command-deck">
        <div class="identity"><span id="activeTitle"></span><strong id="activeName"></strong><div class="active-stats" id="activeStats"></div><div class="piles" id="piles"></div><button id="freeMoveButton">Free Move + Draw Card (F)</button><div class="finishers"><div class="finisher-control"><button id="guardButton">Guard (G)</button><div class="finisher-tooltip">A Finishing move to end the turn. Draw one card, discard one card, then immediately end turn.</div></div><div class="finisher-control"><button id="dashButton">Dash (R)</button><div class="finisher-tooltip">A Finishing move to end the turn. Discard one card and move Again. Can't use Actions during this movement.</div></div></div><button class="hints-button" id="hintsButton">HINTS (H)</button></div>
        <div class="hand" id="hand"></div>
        <div class="turn-actions"><button id="endTurn">END TURN <kbd>SPACE</kbd></button><button class="quiet" id="leaveGame">Leave match</button></div>
      </div>
      <aside class="battle-log"><span>COMBAT FEED</span><div id="log"></div></aside>
    </section>
    <div class="turn-announcement hidden" id="turnAnnouncement"><small>TURN BEGINS</small><strong></strong><span class="turn-heal-message"></span></div>
    <div class="choice-modal hidden" id="flurryModal"></div>
    <div class="choice-modal hidden" id="armDaWizModal"></div>
    <div class="choice-modal hidden" id="manaModal"></div>
    <div class="choice-modal hidden" id="focusModal"></div>
    <div class="choice-modal combat-reveal-modal hidden" id="combatRevealModal"></div>
    <div class="match-results-modal hidden" id="matchResultsModal" role="dialog" aria-modal="true" aria-labelledby="matchResultsTitle"></div>
    <div class="hints-modal hidden" id="hintsModal" role="dialog" aria-modal="true" aria-labelledby="hintsTitle"><section class="hints-window"><button class="hints-language" id="hintsLanguage" type="button">RU</button><nav class="hints-tabs" aria-label="Help sections"><button class="active" id="hintsTab" type="button">Hints</button><button id="characterTab" type="button">Character</button><button id="myCardsTab" type="button">My Cards</button></nav><button class="hints-close" id="hintsClose" type="button" aria-label="Close hints">×</button><div class="hints-content" id="hintsContent"></div></section></div>
    <div class="discard-modal hidden" id="discardModal" role="dialog" aria-modal="true" aria-labelledby="discardTitle"><section class="discard-window"><button class="hints-close" id="discardClose" type="button" aria-label="Close Discard Deck">×</button><div id="discardContent"></div></section></div>
    <div class="card-hover-preview hidden" id="cardHoverPreview"></div>
    <div class="toast" id="toast"></div>
  </main>`;

let gameState = createInitialState();
let mode: 'hotseat' | 'online' = 'hotseat';
let localSeat: PlayerId | null = null;
let room: Room | null = null;
type GameFormat = 'duel' | 'ffa';
type OnlineLobbyState = { playerCount: number; requiredPlayerCount: 2 | 3; characters: Partial<Record<PlayerId, 'shinobi' | 'orkk' | 'magician'>>; arena: string; mode: string; started: boolean };
let onlineLobbyState: OnlineLobbyState | null = null;
let roomIdAutoSelected = false;
let hiddenQuestRewardId: string | null = null;
let actionQuestCollapsed = false;
let announcedTurnKey = '';
let turnAnnouncementTimer = 0;
let hintsOpen = false;
let hintsLanguage: 'en' | 'ru' = 'en';
let hintsTab: 'hints' | 'character' | 'cards' | 'damage' = 'hints';
let discardViewerPlayerId: PlayerId | null = null;
const selection = createActor(selectionMachine).start();
let selectedTestObjectId: string | null = null;
selection.subscribe(() => renderUI());

const lobby = byId('lobby');
const game = byId('game');
const actionQuestPanel = document.createElement('aside');
actionQuestPanel.id = 'actionQuestPanel'; actionQuestPanel.className = 'action-quest-panel';
game.querySelector('.arena-frame')?.append(actionQuestPanel);
const phaseRewardModal = document.createElement('div');
phaseRewardModal.id = 'phaseRewardModal'; phaseRewardModal.className = 'choice-modal hidden'; document.body.append(phaseRewardModal);
const boardEl = byId('board');
const toast = byId('toast');
const damageLogTab = document.createElement('button');
damageLogTab.id = 'damageLogTab';
damageLogTab.type = 'button';
damageLogTab.textContent = 'Damage Log';
document.querySelector('.hints-tabs')?.append(damageLogTab);
const interfaceObserver = new MutationObserver(() => {
  if (hintsLanguage === 'ru') applyInterfaceLanguage();
});
interfaceObserver.observe(app, { childList: true, subtree: true, characterData: true });

document.querySelector('#hotseat')!.addEventListener('click', () => showFormatSelect('hotseat'));
document.querySelector('#createRoom')!.addEventListener('click', () => showFormatSelect('online'));
document.querySelector('#joinRoom')!.addEventListener('click', () => connectOnline('join'));
document.querySelector('#freeMoveButton')!.addEventListener('click', () => dispatch({ type: 'free-move', playerId: actingPlayer() }));
document.querySelector('#guardButton')!.addEventListener('click', () => dispatch({ type: 'guard', playerId: actingPlayer() }));
document.querySelector('#dashButton')!.addEventListener('click', () => dispatch({ type: 'dash', playerId: actingPlayer() }));
document.querySelector('#hintsButton')!.addEventListener('click', () => { hintsOpen = true; renderHintsModal(); });
document.querySelector('#hintsClose')!.addEventListener('click', () => { hintsOpen = false; renderHintsModal(); });
document.querySelector('#hintsModal')!.addEventListener('click', (event) => { if (event.target === byId('hintsModal')) { hintsOpen = false; renderHintsModal(); } });
document.querySelector('#hintsLanguage')!.addEventListener('click', () => {
  hintsLanguage = hintsLanguage === 'en' ? 'ru' : 'en';
  document.documentElement.lang = hintsLanguage;
  if (!game.classList.contains('hidden')) renderUI();
  renderHintsModal();
  applyInterfaceLanguage();
});
document.querySelector('#hintsTab')!.addEventListener('click', () => { hintsTab = 'hints'; renderHintsModal(); });
document.querySelector('#characterTab')!.addEventListener('click', () => { hintsTab = 'character'; renderHintsModal(); });
document.querySelector('#myCardsTab')!.addEventListener('click', () => { hintsTab = 'cards'; renderHintsModal(); });
damageLogTab.addEventListener('click', () => { hintsTab = 'damage'; renderHintsModal(); });
document.querySelector('#discardClose')!.addEventListener('click', () => { discardViewerPlayerId = null; renderDiscardModal(); });
document.querySelector('#discardModal')!.addEventListener('click', (event) => { if (event.target === byId('discardModal')) { discardViewerPlayerId = null; renderDiscardModal(); } });
document.querySelector('#directPerkButton')!.addEventListener('click', () => {
  const selected = selection.getSnapshot().context.selection;
  if (selected.kind === 'perk') dispatch({ type: 'play-perk', playerId: actingPlayer(), cardInstanceId: selected.cardInstanceId, destination: 'direct' });
});
document.querySelector('#finishDanceButton')!.addEventListener('click', () => dispatch({ type: 'end-dance', playerId: actingPlayer() }));
document.querySelector('#mindTricksFinishButton')!.addEventListener('click', () => dispatch({ type: 'mind-tricks-finish', playerId: actingPlayer() }));
document.querySelector('#endTurn')!.addEventListener('click', () => dispatch({ type: 'end-turn', playerId: actingPlayer() }));
document.querySelector('#leaveGame')!.addEventListener('click', () => location.reload());
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
  if (event.code === 'Escape' && hintsOpen) {
    event.preventDefault(); hintsOpen = false; renderHintsModal(); return;
  }
  if (event.code === 'Escape' && discardViewerPlayerId) {
    event.preventDefault(); discardViewerPlayerId = null; renderDiscardModal(); return;
  }
  if (event.code === 'Escape' && selectedTestObjectId) {
    event.preventDefault(); selectedTestObjectId = null; renderUI(); notify('Wooden Box movement cancelled.'); return;
  }
  if (gameState.combatReveal) {
    if (event.code === 'Space' || event.code === 'Escape') event.preventDefault();
    return;
  }
  if (event.code === 'Escape' && gameState.phase === 'dance-through') {
    event.preventDefault();
    dispatch({ type: 'end-dance', playerId: gameState.activePlayerId });
    return;
  }
  if (event.code === 'Escape' && isWaitingForResolvedCardTarget()) {
    event.preventDefault();
    dispatch({ type: 'cancel-targeting', playerId: actingPlayer() });
    return;
  }
  if (event.code === 'Escape' && isWaitingForSelectedCardTarget()) {
    event.preventDefault();
    selection.send({ type: 'CLEAR' });
    notify('Card use cancelled.');
    return;
  }
  if (event.code === 'Escape' && ['choosing-dash-discard', 'dashing'].includes(gameState.phase)) {
    event.preventDefault();
    dispatch({ type: 'cancel-dash', playerId: actingPlayer() });
    return;
  }
  if (event.code === 'Space' && !game.classList.contains('hidden')) {
    event.preventDefault();
    dispatch({ type: 'end-turn', playerId: actingPlayer() });
  }
  if (event.code === 'KeyF' && !game.classList.contains('hidden')) {
    const freeMoveButton = byId('freeMoveButton') as HTMLButtonElement;
    if (!freeMoveButton.disabled) {
      event.preventDefault();
      freeMoveButton.click();
    }
  }
  if (event.code === 'KeyG' && !game.classList.contains('hidden')) {
    const guardButton = byId('guardButton') as HTMLButtonElement;
    if (!guardButton.disabled) { event.preventDefault(); guardButton.click(); }
  }
  if (event.code === 'KeyR' && !game.classList.contains('hidden')) {
    const dashButton = byId('dashButton') as HTMLButtonElement;
    if (!dashButton.disabled) { event.preventDefault(); dashButton.click(); }
  }
  if (event.code === 'KeyH' && !game.classList.contains('hidden')) {
    event.preventDefault();
    hintsOpen = !hintsOpen;
    renderHintsModal();
  }
});

function isWaitingForResolvedCardTarget() {
  if (gameState.phase === 'choosing-boomerang-target' && Boolean(gameState.boomerang)) return true;
  if (gameState.phase === 'choosing-fireball-target' && Boolean((gameState as any).fireball)) return true;
  if (gameState.phase === 'choosing-portal-target' && Boolean((gameState as any).portal)) return true;
  return ((gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction' || gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') && Boolean(gameState.forceThrow)) || ((gameState.phase === 'choosing-magic-hand-target' || gameState.phase === 'choosing-magic-hand-direction') && Boolean(gameState.magicHand)) || ((gameState.phase === 'choosing-shizzle-destination' || (gameState.phase === 'shizzle-move' && gameState.shizzle?.started === false)) && Boolean(gameState.shizzle)) || (gameState.phase === 'choosing-force-pull-target' && Boolean(gameState.forcePull)) || (gameState.phase === 'choosing-arkane-arow-target' && Boolean(gameState.arkaneArow)) || ((gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-target') && Boolean(gameState.armDaWiz)) || (gameState.phase === 'choosing-preparation-teleport' && Boolean(gameState.preparation)) || (gameState.phase === 'choosing-arcane-missle-target' && Boolean(gameState.arcaneMissle)) || (gameState.phase === 'choosing-chain-lightning-target' && Boolean(gameState.chainLightning)) || (gameState.phase === 'choosing-mind-tricks-discard' && gameState.mindTricks?.discarded === 0);
}

function isWaitingForSelectedCardTarget() {
  const selected = selection.getSnapshot().context.selection;
  return selected.kind === 'attack' || selected.kind === 'perk';
}

let expirationRequestFor = 0;
window.setInterval(() => {
  const reveal = gameState.combatReveal;
  if (!reveal) { expirationRequestFor = 0; return; }
  renderCombatReveal();
  if (hintsOpen) renderHintsModal();
  if (Date.now() < reveal.expiresAt || expirationRequestFor === reveal.expiresAt) return;
  expirationRequestFor = reveal.expiresAt;
  const playerId = mode === 'online' ? localSeat : 'P1';
  if (playerId) dispatch({ type: 'ack-combat', playerId });
}, 250);

function showFormatSelect(flow: 'hotseat' | 'online') {
  const panel = byId('onlineWaiting');
  panel.classList.remove('hidden');
  document.querySelector('.mode-grid')?.classList.add('hidden');
  panel.innerHTML = `<p class="eyebrow">${flow === 'hotseat' ? 'HOTSEAT TEST' : 'PRIVATE MULTIPLAYER ROOM'}</p><h2>Choose Game Format</h2><div class="character-choices"><button data-format="duel"><strong>1 versus 1</strong><small>Nagrand Arena · 2 Players</small></button><button data-format="ffa"><strong>Free For All</strong><small>Lordaeron Arena · 3 Players</small></button></div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((button) => button.addEventListener('click', () => {
    const format = button.dataset.format as GameFormat;
    if (flow === 'online') void connectOnline('create', format);
    else showHotseatCharacterSelect(format);
  }));
}

type SelectableCharacter = 'shinobi' | 'orkk' | 'magician' | 'john-christ';
type HotseatOpponent = SelectableCharacter | 'dummy';
const CHARACTER_SELECT_INFO: Record<SelectableCharacter, { name: string; hp: number; movement: number; attackRange: number; trait: string; traitIcon: string; traitDescription: string }> = {
  shinobi: { name: 'Obi Wan Shinobi', hp: 20, movement: 2, attackRange: 1, trait: 'Lightsaber', traitIcon: '⚡⚔', traitDescription: "If Shinobi did not move during his turn, gain +1 ATT, +1 DEF, and +1 MOV until the end of his next turn. Movement caused by Shinobi's own Attack or Defence does not prevent this trait." },
  orkk: { name: 'Da Orkk', hp: 26, movement: 3, attackRange: 1, trait: 'Rage', traitIcon: '👊', traitDescription: "Gain 1 Rage when Da Orkk takes damage from a card or action, at most once per overall effect. Attack Cards gain the full bonus from all Rage, then remove 1 Rage after combat. Remove another 1 Rage at turn end." },
  magician: { name: 'Long Hat Logan', hp: 18, movement: 3, attackRange: 2, trait: 'Classic Wizardry', traitIcon: '✦', traitDescription: 'Generate 1 Mana after resolving an Attack or Perk spell, up to 3. At 3 Mana, Logan may Consume it at the start of his turn to enable advanced spell effects.' },
  'john-christ': { name: 'John Christ', hp: 14, movement: 3, attackRange: 3, trait: 'Possessed', traitIcon: '✝', traitDescription: 'After receiving Damage, enter Spirit Form: +2 ATT, movement Range 1, melee Attack Range 1, and movement through enemies. Leave Spirit Form after using an Attack Card or at turn end, restoring Attack Range 3. Blessing Cards create Stoic Shell.' },
};
function characterSelectButton(character: SelectableCharacter, dataAttribute: 'data-hotseat-character' | 'data-character', disabled = false): string {
  const info = CHARACTER_SELECT_INFO[character];
  return `<button ${dataAttribute}="${character}" ${disabled ? 'disabled' : ''}><strong>${info.name}</strong><span class="character-core-stats"><small><b>${info.hp}</b> MAX HP</small><small><b>${info.movement}</b> MOV</small><small><b>${info.attackRange}</b> ATT RANGE</small><small class="character-trait-stat"><span class="character-select-trait-icon" tabindex="0" aria-label="${info.trait}: ${info.traitDescription}">${info.traitIcon}<span class="character-select-trait-tooltip"><b>${info.trait}</b>${info.traitDescription}</span></span>${info.trait}</small></span></button>`;
}

function dummySelectButton(): string {
  return `<button data-hotseat-opponent="dummy"><strong>Test Dummy</strong><span class="character-core-stats"><small><b>20</b> MAX HP</small><small><b>2</b> MOV</small><small><b>2</b> ATT RANGE</small><small class="character-trait-stat">TRAINING OPPONENT</small></span></button>`;
}

function showHotseatCharacterSelect(format: GameFormat) {
  const panel = byId('onlineWaiting');
  panel.innerHTML = `<p class="eyebrow">HOTSEAT TEST · ${format === 'ffa' ? 'LORDAERON ARENA' : 'NAGRAND ARENA'}</p><h2>Choose your Character</h2><p>${format === 'duel' ? 'Step 1 of 2 · Choose Player 1.' : 'Choose Player 1 for the three-player test.'}</p><div class="character-choices">${characterSelectButton('shinobi', 'data-hotseat-character')}${characterSelectButton('orkk', 'data-hotseat-character')}${characterSelectButton('magician', 'data-hotseat-character')}${format === 'duel' ? characterSelectButton('john-christ', 'data-hotseat-character') : ''}</div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-character]').forEach((button) => button.addEventListener('click', () => {
    const character = button.dataset.hotseatCharacter as SelectableCharacter;
    if (format === 'duel') showHotseatOpponentSelect(character);
    else startHotseat(character, format);
  }));
}

function showHotseatOpponentSelect(playerCharacter: SelectableCharacter) {
  const panel = byId('onlineWaiting');
  const playerName = CHARACTER_SELECT_INFO[playerCharacter].name;
  panel.innerHTML = `<p class="eyebrow">HOTSEAT DUEL · NAGRAND ARENA</p><h2>Choose the Enemy</h2><p>Step 2 of 2 · ${playerName} will fight a training Dummy or a character controlled by Player 2.</p><div class="character-choices">${dummySelectButton()}${characterSelectButton('shinobi', 'data-hotseat-character')}${characterSelectButton('orkk', 'data-hotseat-character')}${characterSelectButton('magician', 'data-hotseat-character')}${characterSelectButton('john-christ', 'data-hotseat-character')}</div><button class="lobby-back-button" id="backToPlayerCharacter" type="button">Back to Player 1</button>`;
  panel.querySelector<HTMLButtonElement>('[data-hotseat-opponent="dummy"]')!.addEventListener('click', () => startHotseat(playerCharacter, 'duel', 'dummy'));
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-character]').forEach((button) => button.addEventListener('click', () => startHotseat(playerCharacter, 'duel', button.dataset.hotseatCharacter as SelectableCharacter)));
  panel.querySelector<HTMLButtonElement>('#backToPlayerCharacter')!.addEventListener('click', () => showHotseatCharacterSelect('duel'));
}

function startHotseat(character: SelectableCharacter, format: GameFormat, opponentCharacter: HotseatOpponent = 'dummy') {
  mode = 'hotseat';
  localSeat = null;
  gameState = createHotseatTestState(false, character, format === 'ffa' ? 3 : 2, opponentCharacter);
  boardVisualKey = '';
  fittedArenaKey = '';
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  byId('connection').innerHTML = '<span></span> Hotseat match';
  renderAll();
  requestAnimationFrame(() => {
    resize();
    fitCameraToArena(visualBoardWidth(), visualBoardHeight(), true);
  });
}

async function connectOnline(action: 'create' | 'join', format: GameFormat = 'duel') {
  try {
    roomIdAutoSelected = false;
    const endpoint = location.port === '5173' ? `ws://${location.hostname}:2567` : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const client = new Client(endpoint);
    const password = (document.querySelector<HTMLInputElement>('#password')!).value;
    if (action === 'create') {
      room = await client.create('duel', { password, format });
      (document.querySelector<HTMLInputElement>('#roomId')!).value = room.roomId;
    } else {
      const roomId = (document.querySelector<HTMLInputElement>('#roomId')!).value.trim();
      if (!roomId) return notify('Enter a room ID first.');
      room = await client.joinById(roomId, { password });
    }
    mode = 'online';
    room.onMessage('seat', (seat: PlayerId) => { localSeat = seat; renderAll(); });
    room.onMessage('lobby-state', (state: OnlineLobbyState) => { onlineLobbyState = state; renderOnlineLobby(); });
    room.onMessage('state', (state: GameState) => {
      const enteringBattle = game.classList.contains('hidden');
      const arenaChanged = gameState.boardSize !== state.boardSize;
      const shouldFitCamera = enteringBattle || arenaChanged;
      gameState = normalizeOnlineState(state);
      if (enteringBattle || arenaChanged) {
        boardVisualKey = '';
        fittedArenaKey = '';
      }
      selection.send({ type: 'CLEAR' });
      lobby.classList.add('hidden'); game.classList.remove('hidden'); renderAll();
      requestAnimationFrame(() => {
        resize();
        if (shouldFitCamera) fitCameraToArena(visualBoardWidth(), visualBoardHeight(), true);
      });
    });
    room.onMessage('error', (message: string) => notify(message));
    room.onMessage('notice', (message: string) => notify(message));
    room.send('ready');
    document.querySelector('.mode-grid')?.classList.add('hidden');
    byId('connection').innerHTML = `<span></span> Room ${room.roomId}`;
    renderOnlineLobby();
  } catch (error) {
    notify(error instanceof Error ? error.message : 'Could not connect to the room.');
  }
}

function normalizeOnlineState(state: GameState): GameState {
  state.objects ??= [];
  state.elevations ??= {};
  state.objectPushAnimations ??= [];
  state.spellProjectiles ??= [];
  state.log ??= [];
  Object.values(state.players).forEach((player) => {
    player.moveRange ??= player.character === 'orkk' ? 3 : 2;
    player.attackRange ??= player.character === 'john-christ' ? 3 : player.character === 'magician' ? 2 : 1;
    player.movementRemaining ??= 0;
    player.actionsRemaining ??= 2;
    player.swiftformMoveBonus ??= 0;
    player.grimoireMoveBonus ??= 0;
    player.pinnedStacks ??= 0;
    player.hand ??= [];
    player.deck ??= [];
    player.discard ??= [];
    player.spellEcho ??= [null, null, null];
    player.spiritForm ??= false;
    player.spiritEnemyUnderfoot ??= null;
    player.stoicShell ??= false;
    player.queuedBlessingCardIds ??= [];
    player.stoicShellHealedTurn ??= null;
    player.stoicShellHealEventId ??= null;
  });
  return state;
}

function renderOnlineLobby() {
  if (!room || !localSeat) return;
  const roomId = room.roomId;
  const panel = byId('onlineWaiting');
  panel.classList.remove('hidden');
  const state = onlineLobbyState;
  const requiredPlayerCount = state?.requiredPlayerCount ?? 2;
  const joined = (state?.playerCount ?? 1) >= requiredPlayerCount;
  const joiningPlayersChosen = Boolean(state?.characters.P2) && (requiredPlayerCount < 3 || Boolean(state?.characters.P3));
  const mayChoose = joined && (localSeat !== 'P1' || joiningPlayersChosen) && !state?.characters[localSeat];
  const missingPlayers = Math.max(0, requiredPlayerCount - (state?.playerCount ?? 1));
  const orderMessage = !joined ? `Share the Room ID and wait for ${missingPlayers} more Player${missingPlayers === 1 ? '' : 's'}.`
    : localSeat === 'P2' && !state?.characters.P2 ? 'You joined the room. Choose your Character first.'
      : localSeat === 'P1' && !joiningPlayersChosen ? 'The joining Player(s) are choosing Characters.'
        : state?.characters[localSeat] ? 'Character locked. Waiting for the battle to start.' : 'Choose your Character.';
  panel.innerHTML = `<p class="eyebrow">PRIVATE ROOM</p><div class="room-id-copy"><label for="displayedRoomId">ROOM ID · CTRL+C TO COPY</label><input id="displayedRoomId" value="${escapeHtml(roomId)}" readonly spellcheck="false" aria-label="Multiplayer Room ID"><button id="copyRoomId" type="button">COPY</button></div><h2>Character Select</h2>
    <div class="match-rules"><span>ARENA<strong>${escapeHtml(state?.arena ?? 'Nagrand Arena')}</strong></span><span>MODE<strong>${escapeHtml(state?.mode ?? '1 versus 1')}</strong></span><span>PLAYERS<strong>${state?.playerCount ?? 1} / ${requiredPlayerCount}</strong></span></div>
    <p>${orderMessage}</p><div class="character-choices">
      ${characterSelectButton('orkk', 'data-character', !mayChoose)}
      ${characterSelectButton('shinobi', 'data-character', !mayChoose)}
      ${characterSelectButton('magician', 'data-character', !mayChoose)}
    </div><small>Players may choose the same Character.</small>`;
  const roomIdField = panel.querySelector<HTMLInputElement>('#displayedRoomId')!;
  roomIdField.addEventListener('click', () => roomIdField.select());
  roomIdField.addEventListener('focus', () => roomIdField.select());
  panel.querySelector<HTMLButtonElement>('#copyRoomId')!.addEventListener('click', async () => {
    roomIdField.focus();
    roomIdField.select();
    try {
      await navigator.clipboard.writeText(roomId);
      notify('Room ID copied to clipboard.');
    } catch {
      notify('Room ID selected. Press Ctrl+C to copy.');
    }
  });
  if (localSeat === 'P1' && !roomIdAutoSelected) {
    roomIdAutoSelected = true;
    requestAnimationFrame(() => { roomIdField.focus(); roomIdField.select(); });
  }
  panel.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((button) => button.addEventListener('click', () => room?.send('choose-character', button.dataset.character)));
}

function actingPlayer(): PlayerId {
  if (mode === 'online') return localSeat ?? 'P1';
  if (gameState.phase === 'choosing-exhaust') {
    const choice = gameState.combatReveal?.exhaust;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? gameState.activePlayerId;
  }
  if (gameState.phase === 'choosing-vicious-mockery') {
    const choice = gameState.combatReveal?.viciousMockery;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? gameState.activePlayerId;
  }
  if (gameState.phase === 'choosing-blessing-light') return gameState.combatReveal?.blessingLight?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-mythril-helmet') return gameState.combatReveal?.mythrilHelmet?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-force-pull-target') return gameState.forcePull!.casterId;
  if (gameState.phase === 'choosing-arkane-arow-target') return gameState.arkaneArow!.casterId;
  if (gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-target') return gameState.armDaWiz!.casterId;
  if (gameState.phase === 'choosing-mind-tricks-discard') return gameState.mindTricks!.casterId;
  if (gameState.phase === 'choosing-preparation-teleport' || gameState.phase === 'choosing-preparation-discard') return gameState.preparation!.casterId;
  if (gameState.phase === 'choosing-blink-teleport') return gameState.pendingAttack!.defenderId;
  if (gameState.phase === 'choosing-blink-discard') return gameState.pendingAttack!.defenderId;
  if (gameState.phase === 'choosing-base-placement') return gameState.activePlayerId;
  if (gameState.phase === 'choosing-arcane-missle-target') return gameState.arcaneMissle!.casterId;
  if (gameState.phase === 'choosing-fireball-target') return (gameState as any).fireball.casterId;
  if (gameState.phase === 'choosing-portal-target') return (gameState as any).portal.casterId;
  if (gameState.phase === 'choosing-chain-lightning-target') return gameState.chainLightning!.casterId;
  if (gameState.phase === 'choosing-magic-hand-target' || gameState.phase === 'choosing-magic-hand-direction') return gameState.magicHand!.casterId;
  if (gameState.phase === 'choosing-shizzle-destination' || gameState.phase === 'shizzle-move') return gameState.shizzle!.casterId;
  if (gameState.phase === 'choosing-mind-tricks-enemy-discard') return gameState.mindTricks!.enemyId;
  if (gameState.phase === 'double-jump') return gameState.doubleJump!.playerId;
  if (gameState.phase === 'defending') return gameState.pendingAttack!.defenderId;
  if (gameState.phase === 'choosing-force-disarm-discard') return gameState.forceDisarm!.targetId;
  if (gameState.phase === 'flurry-offer') return gameState.flurry!.defenderId;
  if (gameState.phase === 'choosing-flurry-enemy-discard') return gameState.flurry!.attackerId;
  if (gameState.phase === 'mana-blast-offer') return gameState.pendingAttack!.defenderId;
  if (gameState.phase === 'choosing-grimoire-discard') return gameState.pendingAttack!.defenderId;
  return gameState.activePlayerId;
}

function hudSeatPlayerIds(): PlayerId[] {
  const playerIds = (Object.keys(gameState.players) as PlayerId[]).filter((id) => Boolean(gameState.players[id]));
  // A local two-player test keeps physical seats stable while control passes
  // between players: P1 remains left and P2 remains right.
  if (mode === 'hotseat' && playerIds.length === 2) {
    return (['P1', 'P2'] as PlayerId[]).filter((id) => Boolean(gameState.players[id]));
  }
  const perspectivePlayerId = actingPlayer();
  return [perspectivePlayerId, ...playerIds.filter((id) => id !== perspectivePlayerId)];
}

function dispatch(command: GameCommand) {
  if (mode === 'online') {
    if (!room || !localSeat) return notify('Waiting for your seat assignment.');
    room.send('command', command);
    return;
  }
  const result = applyCommand(gameState, command);
  if (!result.ok) return notify(result.error);
  gameState = result.state;
  selection.send({ type: 'CLEAR' });
  renderAll();
}

function renderAll() {
  syncBoard();
  renderUI();
}

function renderUI() {
  if (game.classList.contains('hidden')) return;
  const actor = gameState.players[gameState.activePlayerId];
  byId('turnNumber').textContent = `ROUND ${String(gameState.turn).padStart(2, '0')}`;
  byId('turnLabel').textContent = gameState.phase === 'finished' ? `${gameState.players[gameState.winner!].name} wins` : `${actor.name}'s turn`;
  const activeColor = playerUiColor(actor.id);
  byId('turnLabel').style.color = activeColor;
  byId('turnLabel').style.textShadow = `0 0 12px ${activeColor}`;
  byId('phaseLabel').textContent = gameState.phase === 'defending' ? 'DEFENCE RESPONSE' : gameState.phase === 'finished' ? 'MATCH COMPLETE' : 'SELECT AN ACTION';
  showTurnAnnouncement(actor);
  byId('activeTitle').textContent = actor.character === 'magician' ? 'THE MAGICIAN' : actor.character === 'orkk' ? 'WIZARD OF STRENGTH' : actor.character === 'shinobi' ? 'LIGHTSABER WIZARD' : actor.character === 'john-christ' ? 'UNDUYING WIZARD' : 'TRAINING DUMMY';
  byId('activeName').textContent = actor.name;
  byId('activeStats').innerHTML = `<span>MOV <b>${actor.movementRemaining}/${effectiveMoveRange(actor)}</b></span><span>ACTIONS <b>${actor.actionsRemaining}/2</b></span><span>ATT. RANGE <b>${actor.attackRange}</b></span>`;
  const knownTopCard = actor.knownTopCardId ? cardDefinition({ instanceId: '', cardId: actor.knownTopCardId }) : null;
  byId('piles').innerHTML = `${knownTopCard ? `<button class="pile-button pile-clickable known-deck" id="knownDeckButton" data-known-top-card="${knownTopCard.id}" title="Known top Card: ${escapeHtml(knownTopCard.name)}">DECK <b>${actor.deck.length}</b></button>` : `<span>DECK <b>${actor.deck.length}</b></span>`}<span>HAND <b>${actor.hand.length}</b></span>${actor.discard.length > 0 ? `<button class="pile-button pile-clickable" id="discardPileButton" title="Open Discard pile">DISCARD <b>${actor.discard.length}</b></button>` : `<span>DISCARD <b>0</b></span>`}`;
  byId('discardPileButton')?.addEventListener('click', () => { discardViewerPlayerId = actor.id; renderDiscardModal(); });
  byId('knownDeckButton')?.addEventListener('pointerenter', (event) => showCardPreview((event.currentTarget as HTMLElement).dataset.knownTopCard!, event));
  byId('knownDeckButton')?.addEventListener('pointermove', positionCardPreview);
  byId('knownDeckButton')?.addEventListener('pointerleave', hideCardPreview);
  const hudPlayerIds = hudSeatPlayerIds();
  renderFighter(hudPlayerIds[0], 'p1Stats', 'left');
  renderFighter(hudPlayerIds[1], 'p2Stats', 'right');
  byId('p3Stats').classList.toggle('hidden', !hudPlayerIds[2]);
  if (hudPlayerIds[2]) renderFighter(hudPlayerIds[2], 'p3Stats', 'right');
  renderCharacterTraits();
  renderCharacterStatuses();
  renderOpponentHand();
  renderSpellEchoBars();
  renderHand();
  renderFlurryModal();
  renderArmDaWizModal();
  renderManaModal();
  renderFocusModal();
  renderActionQuestPanel();
  renderPhaseRewardModal();
  renderCombatReveal();
  renderMatchResults();
  renderDiscardModal();
  byId('log').innerHTML = gameState.log.slice(0, 7).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const select = selection.getSnapshot().context.selection;
  const prompt = byId('prompt');
  prompt.textContent = gameState.phase === 'defending' ? `${gameState.players[gameState.pendingAttack!.defenderId].name}: defend or take the hit` : gameState.phase === 'flurry-offer' ? `${gameState.players[gameState.flurry!.defenderId].name}: resolve Flurry` : gameState.phase === 'choosing-flurry-enemy-discard' ? `${gameState.players[gameState.flurry!.attackerId].name}: discard ${gameState.flurry!.remainingEnemyDiscards} card${gameState.flurry!.remainingEnemyDiscards === 1 ? '' : 's'}` : gameState.phase === 'choosing-force-disarm-discard' ? `${gameState.players[gameState.forceDisarm!.targetId].name}: choose a ${(gameState.forceDisarm!.cardKind ?? 'attack') === 'attack' ? 'Attack' : 'Defend'} Card to discard` : gameState.phase === 'choosing-end-discard' ? `Hand limit: discard ${actor.hand.length - 5} more card${actor.hand.length - 5 === 1 ? '' : 's'}` : gameState.phase === 'choosing-dash-discard' ? 'Select a card to discard · Escape to cancel Dash' : gameState.phase.startsWith('choosing-') ? 'Select one card from your hand to discard' : gameState.phase === 'dance-through' ? `Dance Through: ${gameState.danceThrough?.stepsRemaining ?? 0} one-square steps remain · Escape or Cancel button to stop on an empty Square` : gameState.phase === 'dashing' ? `Dash: spend ${actor.movementRemaining} movement · Escape to cancel before moving` : select.kind === 'move' ? 'Select an empty highlighted square' : select.kind === 'attack' ? 'Select the enemy dummy · Escape to cancel' : select.kind === 'perk' ? 'Play directly or select your Spell Echo position 1 · Escape to cancel' : '';
  if (gameState.phase === 'double-jump') prompt.textContent = `Double Jump: ${gameState.doubleJump?.stepsRemaining ?? 0} one-square steps remain`;
  if (gameState.phase === 'choosing-end-discard' && actor.hand.length <= 5) prompt.textContent = 'Hand limit satisfied · discard more eligible cards or select End Turn';
  if (gameState.phase === 'choosing-force-throw-target') prompt.textContent = 'Force Throw: select a valid target · Escape to cancel';
  if (gameState.phase === 'choosing-force-throw-direction') prompt.textContent = 'Force Throw: select the linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-force-pull-target') prompt.textContent = 'Force Pull: select an enemy or Object · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-target') prompt.textContent = 'KYK: select an adjacent Object or enemy · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-direction') prompt.textContent = 'KYK: select a highlighted legal push direction · Escape to cancel';
  if (gameState.phase === 'choosing-arkane-arow-target') prompt.textContent = `ARKANE AROW: select a highlighted Square within Range ${gameState.arkaneArow!.range} · Escape to cancel`;
  if (gameState.phase === 'choosing-arm-da-wiz-choice') prompt.textContent = 'Arm da Wiz: choose Recall or Create Shield · Escape to cancel';
  if (gameState.phase === 'choosing-arm-da-wiz-target') prompt.textContent = 'Arm da Wiz: select your Shield anywhere on the Board · Escape to cancel';
  if (gameState.phase === 'choosing-mind-tricks-discard') prompt.textContent = `Mind Tricks: reveal up to ${gameState.mindTricks!.maxDiscards} card${gameState.mindTricks!.maxDiscards === 1 ? '' : 's'} · Escape cancels before the first reveal`;
  if (gameState.phase === 'choosing-mind-tricks-enemy-discard') prompt.textContent = `Mind Tricks: discard ${gameState.mindTricks!.enemyDiscardsRemaining} card${gameState.mindTricks!.enemyDiscardsRemaining === 1 ? '' : 's'}`;
  if (gameState.phase === 'choosing-preparation-teleport') prompt.textContent = 'Preparation: select a visible Object to swap places with · Escape to cancel';
  if (gameState.phase === 'choosing-blink-teleport') prompt.textContent = 'Blink: select a visible empty Square to teleport';
  if (gameState.phase === 'choosing-blink-discard') prompt.textContent = 'Blink: choose one eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-base-placement') prompt.textContent = `${gameState.players[gameState.activePlayerId].name}: choose a Square on a bright red unclaimed base`;
  if (gameState.phase === 'choosing-preparation-discard') prompt.textContent = 'Preparation: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-snowball-discard') prompt.textContent = 'Snowball Effect: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-grimoire-discard') prompt.textContent = `Grimoire Cleanse: discard ${gameState.pendingAttack?.grimoireDiscardsRemaining ?? 0} more Card(s)`;
  if (gameState.phase === 'choosing-arcane-missle-target') prompt.textContent = 'Arcane Missile: select a valid enemy · Escape to cancel';
  if (gameState.phase === 'choosing-fireball-target') prompt.textContent = 'Fireball: select an enemy within Range 3 · Escape to cancel';
  if (gameState.phase === 'choosing-boomerang-target') prompt.textContent = 'Boomerang: select an enemy within Range 5 · obstacles are ignored · Escape to cancel';
  if (gameState.phase === 'choosing-portal-target') prompt.textContent = 'Portal: select a visible empty Square · Escape to cancel';
  if (gameState.phase === 'choosing-chain-lightning-target') prompt.textContent = 'Chain Lightning: select an enemy in range and line of sight · Escape to cancel';
  if (gameState.phase === 'choosing-magic-hand-target') prompt.textContent = 'Magic Hand: select any visible Object · Escape to cancel';
  if (gameState.phase === 'choosing-magic-hand-direction') prompt.textContent = 'Magic Hand: select any linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-shizzle-destination') prompt.textContent = `Shizzle: select an empty Square in a direct line up to ${gameState.shizzle!.stepsRemaining} Squares away · Escape to cancel`;
  if (gameState.phase === 'shizzle-move') prompt.textContent = `Shizzle Consume: ${gameState.shizzle!.stepsRemaining} one-Square moves remain${gameState.shizzle!.started ? '' : ' · Escape to cancel before moving'}`;
  if (selectedTestObjectId) prompt.textContent = 'WOODEN BOX SELECTED · click an empty highlighted Square · Escape to cancel';
  prompt.classList.toggle('visible', Boolean(prompt.textContent));
  byId('directPerkButton').classList.toggle('hidden', select.kind !== 'perk');
  const choosingMindTricks = gameState.phase === 'choosing-mind-tricks-discard';
  byId('mindTricksFinishButton').classList.toggle('hidden', !choosingMindTricks);
  byId('mindTricksFinishButton').textContent = choosingMindTricks && (gameState.mindTricks?.discarded ?? 0) > 0 ? 'Finish Mind Tricks selection' : 'Use Mind Tricks without revealing';
  const cancelDanceButton = byId('finishDanceButton') as HTMLButtonElement;
  cancelDanceButton.classList.toggle('hidden', gameState.phase !== 'dance-through');
  cancelDanceButton.disabled = Boolean(gameState.danceThrough?.enemyUnderfoot) || !canLocalAct(gameState.activePlayerId);
  cancelDanceButton.title = gameState.danceThrough?.enemyUnderfoot ? 'Shinobi must leave the enemy-occupied Square before cancelling.' : 'End Dance Through movement early.';
  (byId('freeMoveButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || actor.freeMoveUsed || !canLocalAct(actor.id);
  (byId('guardButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || !canLocalAct(actor.id);
  const canPayForDash = actor.hand.some((card) => card.cardId === 'burning' || !cardDefinition(card).cannotBeDiscarded);
  (byId('dashButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || !canPayForDash || !canLocalAct(actor.id);
  (byId('endTurn') as HTMLButtonElement).disabled = !['active', 'dashing', 'choosing-end-discard'].includes(gameState.phase) || Boolean(actor.spiritEnemyUnderfoot) || (gameState.phase === 'choosing-end-discard' && actor.hand.length > 5) || !canLocalAct(actor.id);
  if (((actor.movementRemaining > 0 && gameState.phase === 'active') || gameState.phase === 'dashing' || gameState.phase === 'dance-through' || gameState.phase === 'double-jump' || gameState.phase === 'shizzle-move') && select.kind === 'none') selection.send({ type: 'SELECT_MOVE' });
  highlightCells();
  applyInterfaceLanguage();
}

function renderMatchResults() {
  const modal = byId('matchResultsModal');
  if (gameState.phase !== 'finished') {
    modal.classList.add('hidden');
    modal.innerHTML = '';
    return;
  }
  const winner = gameState.winner ? gameState.players[gameState.winner] : null;
  const rows = (Object.keys(gameState.players) as PlayerId[]).map((playerId) => {
    const player = gameState.players[playerId];
    const stats = player.matchStats ?? { squaresMoved: 0, attackDamage: 0, perkDamage: 0, defensiveRetaliationDamage: 0, totalDamage: 0, hitPointsHealed: 0, combatDamageBlocked: 0 };
    const totalDamage = stats.attackDamage + stats.perkDamage + (stats.defensiveRetaliationDamage ?? 0);
    return `<tr style="--player-color:${playerUiColor(playerId)}"><th><i></i>${escapeHtml(player.name)}</th><td>${stats.squaresMoved}</td><td>${stats.attackDamage}</td><td>${stats.perkDamage}</td><td>${totalDamage}</td><td>${stats.hitPointsHealed}</td><td>${stats.combatDamageBlocked}</td></tr>`;
  }).join('');
  modal.innerHTML = `<section class="match-results-window"><p>MATCH COMPLETE</p><h2 id="matchResultsTitle">${winner ? `${escapeHtml(winner.name)} wins` : 'Match results'}</h2><div class="match-results-scroll"><table><thead><tr><th>Character</th><th>Squares<br>Moved</th><th>Attack<br>Damage</th><th>Perk<br>Damage</th><th>Total<br>Damage</th><th>HP<br>Healed</th><th>Combat Damage<br>Blocked</th></tr></thead><tbody>${rows}</tbody></table></div><button type="button" id="closeMatchResults">Review battlefield</button></section>`;
  modal.classList.remove('hidden');
  byId('closeMatchResults').addEventListener('click', () => modal.classList.add('hidden'));
}

function renderHintsModal() {
  const modal = byId('hintsModal');
  byId('hintsButton').textContent = hintsLanguage === 'ru' ? 'ПОДСКАЗКИ (H)' : 'HINTS (H)';
  modal.classList.toggle('hidden', !hintsOpen);
  if (!hintsOpen) return;
  const ru = hintsLanguage === 'ru';
  byId('hintsLanguage').textContent = ru ? 'EN' : 'RU';
  byId('hintsLanguage').title = ru ? 'Switch to English' : 'Переключить на русский';
  byId('hintsTab').textContent = ru ? 'Подсказки' : 'Hints';
  byId('characterTab').textContent = ru ? 'Персонаж' : 'Character';
  byId('myCardsTab').textContent = ru ? 'Мои карты' : 'My Cards';
  byId('hintsTab').classList.toggle('active', hintsTab === 'hints');
  byId('characterTab').classList.toggle('active', hintsTab === 'character');
  byId('myCardsTab').classList.toggle('active', hintsTab === 'cards');
  byId('damageLogTab').textContent = ru ? 'Журнал урона' : 'Damage Log';
  byId('damageLogTab').classList.toggle('active', hintsTab === 'damage');
  byId('hintsClose').setAttribute('aria-label', ru ? 'Закрыть подсказки' : 'Close hints');
  const content = byId('hintsContent');
  content.innerHTML = hintsTab === 'hints' ? hintsRulesHtml(ru) : hintsTab === 'character' ? characterTraitHtml(ru) : hintsTab === 'cards' ? cardAdviceHtml(ru) : damageLogHtml(ru);
  if (hintsTab === 'damage') {
    const intro = content.querySelector<HTMLElement>('.damage-log-intro');
    if (intro) intro.textContent = ru ? 'Все отдельные случаи урона и восстановления HP в этом матче. Потеря HP не считается уроном.' : 'Every separate instance of damage and restored HP in this match. Effects that explicitly lose HP are not damage.';
  }
  content.querySelectorAll<HTMLElement>('[data-advice-card]').forEach((element) => {
    element.addEventListener('pointerenter', (event) => showCardPreview(element.dataset.adviceCard!, event));
    element.addEventListener('pointermove', positionCardPreview);
    element.addEventListener('pointerleave', hideCardPreview);
  });
  applyInterfaceLanguage();
}

function characterTraitHtml(ru: boolean) {
  const player = gameState.players[actingPlayer()];
  if (!(player.character in CHARACTER_SELECT_INFO)) {
    return `<h2 id="hintsTitle">${escapeHtml(player.name)} · ${ru ? 'Персонаж' : 'Character'}</h2><p class="empty-advice">${ru ? 'У этого тестового персонажа нет особенности персонажа.' : 'This test character has no Character Trait.'}</p>`;
  }
  const character = player.character as SelectableCharacter;
  const info = CHARACTER_SELECT_INFO[character];
  const copy = {
    shinobi: {
      trait: 'Lightsaber',
      description: ru
        ? 'Если Оби Ван Шиноби завершает свой ход, не перемещаясь, Lightsaber активируется и до конца его следующего хода даёт +1 к значениям ATT и DEF карт, а также +1 MOV. Перемещение от собственных карт Атаки или Защиты не мешает активации; обычное или вызванное врагом перемещение мешает. Некоторые эффекты могут активировать или продлить Lightsaber отдельно.'
        : 'If Obi Wan Shinobi ends his turn without moving, Lightsaber activates until the end of his next turn, adding +1 to Attack and Defend Card Values and +1 MOV. Movement from his own Attack or Defend Cards does not prevent activation; normal movement or enemy-forced movement does. Some Card effects can activate or extend Lightsaber separately.',
      detail: ru
        ? '-MOV Stacks: карты статуса Pinned, создаваемые Атаками и Перками Оби Вана. Каждая карта Pinned в Руке уменьшает MOV персонажа на 1. Одна из этих карт удаляется в конце следующего последовательного хода этого персонажа; новая карта Pinned не может быть удалена в тот же ход, в котором она была получена.'
        : "-MOV Stacks: Pinned Status Cards generated by Obi Wan's Attacks and Perks. Each Pinned Card decreases a character's MOV stat by 1 while it is in Hand. One of these Cards is removed at the end of that character's next consecutive turn; newly gained Pinned cannot be removed during the same turn it was gained.",
      status: ru
        ? `Сейчас: ${player.lightsaberBuff ? 'активен' : 'неактивен'}${player.lightsaberStacks ? ` · продление: ${player.lightsaberStacks}` : ''}.`
        : `Current state: ${player.lightsaberBuff ? 'active' : 'inactive'}${player.lightsaberStacks ? ` · duration stacks: ${player.lightsaberStacks}` : ''}.`,
    },
    orkk: {
      trait: 'Rage',
      description: ru
        ? 'Да Оркк получает 1 Rage, когда получает урон от карты или Действия, не более одного раза за общий эффект; отдельный последующий эффект может дать Rage снова. При Атаке все накопленные стаки добавляются к ATT, затем все добавленные к карте стаки Rage удаляются. В конце хода также снимается 1 стак. Если Оркк начинает ход без Щита и без Rage, он получает 1 Rage.'
        : 'Da Orkk gains 1 Rage when damaged by a Card or Action, at most once per overall effect; a separate later effect may grant Rage again. Every stored stack adds +1 ATT to an Attack, then every Rage Stack applied to that Attack is consumed. One Rage Stack is also removed at turn end. If Orkk starts his turn with no Shield and no Rage, he gains 1 Rage.',
      detail: ru
        ? 'Shield: метаемый Объект, который Да Оркк может экипировать. Щит наносит урон при броске или притягивании, если проходит через клетку, занятую врагом. В начале своего хода Да Оркк получает стак Rage, если Щит не экипирован и у него нет Rage; экипированный Щит вместо этого даёт +1 к значению DEF его карт Защиты.'
        : 'Shield: A throwable Object that can be equipped by Da Orkk. The Shield deals damage when thrown or pulled through a Square occupied by an enemy. At the beginning of his turn, Da Orkk gains 1 Rage if the Shield is not equipped and he has no Rage; while equipped, the Shield instead adds +1 to the Defend Value of his Cards.',
      status: ru
        ? `Сейчас: ${player.rageStacks} Rage · Щит ${player.shieldEquipped ? 'экипирован (+1 DEF картам Защиты)' : 'снят и находится на поле как Стенной Объект'}.`
        : `Current state: ${player.rageStacks} Rage · Shield ${player.shieldEquipped ? 'equipped (+1 to Defend Card Values)' : 'unequipped on the Board as a Wall Object'}.`,
    },
    magician: {
      trait: 'Classic Wizardry',
      description: ru
        ? 'После разрешения своей карты Атаки или Перка-заклинания Лонг Хэт Логан создаёт 1 Mana, максимум 3, пока действует режим Generate. Если ход начинается с 3 Mana, он выбирает: сохранить Mana и продолжить Generate либо потратить все 3, включив Consume на этот ход. Consume активирует указанные на картах усиленные эффекты, но обычное разрешение заклинаний в этот ход Mana не создаёт.'
        : 'After resolving his own Attack Card or Perk spell, Long Hat Logan generates 1 Mana, up to 3, while in Generate mode. If he starts a turn with 3 Mana, he may keep it and continue Generating or spend all 3 to enter Consume for that turn. Consume enables the advanced effects printed on his Cards, but normal spell resolution does not generate Mana that turn.',
      detail: '',
      status: ru
        ? `Сейчас: ${player.manaPoints}/3 Mana · режим ${player.manaMode === 'consume' ? 'Consume' : 'Generate'}.`
        : `Current state: ${player.manaPoints}/3 Mana · ${player.manaMode === 'consume' ? 'Consume' : 'Generate'} mode.`,
    },
    'john-christ': {
      trait: 'Possessed',
      description: ru
        ? 'После получения любого урона John Christ входит в Spirit Form. В этой форме все его карты Атаки получают +2 ATT, дальность Атаки становится ближней (1 клетка), дальность движения становится 1, и он может проходить через клетки с врагами. Каждая занятая врагом клетка возвращает потраченный на вход 1 MOV. Он не может завершить движение или ход на одной клетке с врагом. После выхода из Spirit Form дальность Атаки снова становится 3.'
        : 'After receiving any Damage, John Christ enters Spirit Form. In this form, all of his Attack Cards gain +2 ATT, his Attack Range becomes melee Range 1, his movement Range becomes 1, and he may move through enemy-occupied Squares. Each enemy-occupied Square refunds the 1 MOV spent to enter it. He cannot finish movement or end his turn on the same Square as an enemy. Leaving Spirit Form restores Attack Range 3.',
      detail: ru
        ? 'Spirit Form запрещает использовать карты, в названии которых есть “Bless”. Форма заканчивается после использования карты Атаки или в конце хода. Blessing, добавленная в Руку в ход John, немедленно создаёт Stoic Shell. Отложенные Blessing добавляются в начале его хода только если у него не было Stoic Shell. Если ход начался со Stoic Shell, John восстанавливает 1 HP и удаляет Shell; любой полученный урон удаляет Shell.'
        : 'Spirit Form prevents Cards containing “Bless” in their name from being used. The form ends after using an Attack Card or at turn end. A Blessing added to John’s Hand during his turn immediately creates Stoic Shell. Queued Blessings enter his Hand at turn start only if he did not begin with Stoic Shell. Beginning with Stoic Shell restores 1 HP and removes it; any Damage removes the Shell.',
      status: ru
        ? `Сейчас: ${player.spiritForm ? 'Spirit Form активна' : 'обычная форма'} · Stoic Shell ${player.stoicShell ? 'активна' : 'неактивна'} · отложено Blessing: ${player.queuedBlessingCardIds.length}.`
        : `Current state: ${player.spiritForm ? 'Spirit Form active' : 'normal form'} · Stoic Shell ${player.stoicShell ? 'active' : 'inactive'} · queued Blessings: ${player.queuedBlessingCardIds.length}.`,
    },
  }[character];
  return `<h2 id="hintsTitle">${escapeHtml(info.name)} · ${ru ? 'Персонаж' : 'Character'}</h2><article class="character-hint-card" style="--character-color:${playerUiColor(player.id)}"><header><span>${escapeHtml(info.traitIcon)}</span><div><small>${ru ? 'ОСОБЕННОСТЬ ПЕРСОНАЖА' : 'CHARACTER TRAIT'}</small><h3>${escapeHtml(copy.trait)}</h3></div></header><p>${escapeHtml(copy.description)}</p>${copy.detail ? `<p class="character-hint-detail">${escapeHtml(copy.detail)}</p>` : ''}<strong>${escapeHtml(copy.status)}</strong><footer><span>HP <b>${player.maxHp}</b></span><span>MOV <b>${player.moveRange}</b></span><span>${ru ? 'ДАЛЬНОСТЬ АТАКИ' : 'ATTACK RANGE'} <b>${player.attackRange}</b></span></footer></article>`;
}

function damageLogHtml(ru: boolean) {
  type DamageEntry = { eventType?: 'damage' | 'healing'; turn: number; targetId: PlayerId; sourceId: PlayerId; sourceKind: 'attack' | 'perk' | 'defense' | 'other'; amount: number; hpAfter: number; collision: boolean };
  const entries = ((gameState as GameState & { damageLog?: DamageEntry[] }).damageLog ?? []);
  const sections = (Object.keys(gameState.players) as PlayerId[]).map((playerId) => {
    const player = gameState.players[playerId];
    const received = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.targetId === playerId).reverse();
    const total = received.reduce((sum, { entry }) => entry.eventType === 'healing' ? sum : sum + entry.amount, 0);
    const rows = received.map(({ entry, index }) => {
      const source = gameState.players[entry.sourceId];
      if (entry.eventType === 'healing') return `<li class="healing-entry"><b>+${entry.amount}</b><span>${ru ? `Ход ${entry.turn}` : `Turn ${entry.turn}`} · ${escapeHtml(source?.name ?? entry.sourceId)} · ${ru ? 'исцеление' : 'Healing'}</span><small>${ru ? 'HP после исцеления' : 'HP after healing'}: ${entry.hpAfter}</small><i>#${index + 1}</i></li>`;
      const kind = entry.sourceKind === 'defense' ? (ru ? 'эффект защиты' : 'Defence effect') : entry.sourceKind === 'attack' ? (ru ? 'атака' : 'Attack') : entry.sourceKind === 'perk' ? (ru ? 'перк' : 'Perk') : (ru ? 'другой эффект' : 'Other effect');
      return `<li><b>${entry.amount}</b><span>${ru ? `Ход ${entry.turn}` : `Turn ${entry.turn}`} · ${escapeHtml(source?.name ?? entry.sourceId)} · ${kind}${entry.collision ? ` · ${ru ? 'столкновение' : 'collision'}` : ''}</span><small>${ru ? 'HP после урона' : 'HP after damage'}: ${entry.hpAfter}</small><i>#${index + 1}</i></li>`;
    }).join('');
    return `<article class="damage-log-player" style="--player-color:${playerUiColor(playerId)}"><header><span></span><div><h3>${escapeHtml(player.name)}</h3><p>${ru ? `Всего получено урона: ${total}` : `Total damage received: ${total}`}</p></div></header>${rows ? `<ol>${rows}</ol>` : `<div class="damage-log-empty">${ru ? 'Этот персонаж ещё не получал урон.' : 'This character has not received any damage yet.'}</div>`}</article>`;
  }).join('');
  return `<h2 id="hintsTitle">${ru ? 'Журнал урона' : 'Damage Log'}</h2><p class="damage-log-intro">${ru ? 'Каждая отдельная запись урона, полученного персонажами в этом матче. Потеря HP не считается уроном.' : 'Every separate instance of damage received by a character in this match. Effects that explicitly lose HP are not damage.'}</p><div class="damage-log-grid">${sections}</div>`;
}

function renderDiscardModal() {
  const modal = byId('discardModal');
  const player = discardViewerPlayerId ? gameState.players[discardViewerPlayerId] : null;
  modal.classList.toggle('hidden', !player);
  if (!player) return;
  const cards = [...player.discard].reverse();
  byId('discardContent').innerHTML = `<span class="discard-eyebrow">PUBLIC CARD INFORMATION</span><h2 id="discardTitle">${escapeHtml(player.name)} · Discard Deck</h2><p>${cards.length} Card${cards.length === 1 ? '' : 's'} · newest discarded Card shown first</p>${cards.length === 0 ? '<div class="discard-empty">This Discard Deck is empty.</div>' : `<div class="discard-card-grid">${cards.map((instance, index) => { const card = cardDefinition(instance); return `<article class="card ${card.kind}"><span>${index === 0 ? 'TOP OF DISCARD · ' : ''}${card.kind.toUpperCase()}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></article>`; }).join('')}</div>`}`;
}

function hintsRulesHtml(ru: boolean) {
  if (ru) return `<h2 id="hintsTitle">Правила хода</h2><div class="rules-grid">
    <article><h3>Доступные действия</h3><p><b>Свободное движение + карта:</b> возьмите карту и получите очки движения. Можно двигаться до и после других действий.</p><p><b>Атака:</b> выберите карту Атаки и допустимую цель. Обычно доступно до двух Действий за ход.</p><p><b>Перк:</b> разыграйте один Перк напрямую на 1-м уровне или поместите его в Spell Echo. За ход можно использовать только один Перк.</p><p><b>Защита:</b> когда вас атакуют, сыграйте карту Защиты или примите удар.</p><p><b>Завершающие приёмы:</b> Guard — взять и сбросить карту; Dash — сбросить карту и снова двигаться. Оба немедленно завершают ход.</p></article>
    <article><h3>Правила боя</h3><p>Сравните итоговую Силу Атаки и Защиты после всех бонусов и штрафов. Если Атака выше, цель получает урон, равный разнице. При равенстве или меньшей Атаке боевой урон не наносится.</p><p>Эффекты карт срабатывают в указанное время: до боя, во время сравнения или после боя. Эффект, отменяющий карту Атаки, не отменяет внешние бонусы к её Силе.</p><h3>Статусные карты</h3><p>Статусные карты занимают место в Руке и действуют, пока находятся там. Их оранжевая рамка отличает их от обычных карт. Правила конкретного Статуса определяют, можно ли его сбросить или удалить. При лимите Руки в 5 карт несбрасываемые Статусы нельзя выбрать для обычного сброса.</p></article></div>`;
  return `<h2 id="hintsTitle">Turn Rules</h2><div class="rules-grid">
    <article><h3>Available Player Actions</h3><p><b>Free Move + Draw Card:</b> draw a Card and gain movement. Movement may be split before and after other Actions.</p><p><b>Action: Attack:</b> select an Attack Card and a valid target. A Player normally has up to two Actions per turn.</p><p><b>Action: Perk:</b> play one Perk directly at Level 1 or place it in Spell Echo. Only one Perk may be used each turn.</p><p><b>Action: Defend:</b> when attacked, play a Defend Card or take the hit.</p><p><b>Finishing Moves:</b> Guard draws and discards a Card; Dash discards a Card and grants another movement. Either immediately ends the turn when resolved.</p></article>
    <article><h3>Combat Rules</h3><p>Compare the final Attack and Defend Values after all bonuses and penalties. If Attack is higher, the target takes damage equal to the difference. Equal or lower Attack deals no combat damage.</p><p>Card effects resolve at their stated timing: before combat, during comparison, or after combat. Cancelling an Attack Card's effect does not cancel external improvements to its Attack Value.</p><h3>Status Cards</h3><p>Status Cards occupy Hand space and apply their effects while held. Their orange highlight distinguishes them from regular Cards. Each Status specifies whether it may be discarded or Removed. At the five-Card end-of-turn Hand limit, non-discardable Status Cards cannot be chosen for a normal discard.</p></article></div>`;
}

function cardAdviceHtml(ru: boolean) {
  const player = gameState.players[actingPlayer()];
  const cards = player.hand.map((instance) => cardDefinition(instance));
  const generatedStatuses = (Object.keys(STATUS_CARD_GENERATORS) as StatusCardId[])
    .filter((statusId) => !cards.some((card) => card.id === statusId) && statusGeneratorsInHand(statusId, cards).length > 0)
    .map((statusId) => CARDS.find((card) => card.id === statusId)!);
  const adviceCards = [...cards, ...generatedStatuses];
  const heading = ru ? `Советы для ${escapeHtml(player.name)}` : `${escapeHtml(player.name)} · Hand Advice`;
  if (cards.length === 0) return `<h2 id="hintsTitle">${heading}</h2><p class="empty-advice">${ru ? 'В Руке нет карт. Используйте свободное движение, чтобы взять карту.' : 'Your Hand is empty. Use Free Move to draw a Card.'}</p>`;
  return `<h2 id="hintsTitle">${heading}</h2><p class="ai-advice-label">${ru ? 'ТАКТИЧЕСКАЯ AI-ПОДСКАЗКА · ОБНОВЛЯЕТСЯ ВМЕСТЕ С РУКОЙ' : 'TACTICAL AI SUGGESTION · UPDATES WITH YOUR HAND'}</p><div class="advice-list">${adviceCards.map((card) => `<article class="advice-card ${card.kind}" data-advice-card="${card.id}"><header><strong>${escapeHtml(card.name)}</strong><span>${card.value} ${ru ? card.kind === 'attack' ? 'АТК' : card.kind === 'defend' ? 'ЗАЩ' : card.kind === 'perk' ? 'ПЕРК' : 'СТАТУС' : card.kind.toUpperCase()}</span></header><p>${cardTacticalAdvice(card, player, ru)}${statusGeneratorAdvice(card.id, cards, ru)}</p></article>`).join('')}</div>`;
}

type StatusCardId = 'pinned' | 'headache' | 'exhaust' | 'burning';
const STATUS_CARD_GENERATORS: Record<StatusCardId, readonly CardTypeId[]> = {
  pinned: ['light-the-saber', 'dance-through', 'cut-them-legs', 'block', 'double-jump', 'force-pull', 'swiftform'],
  headache: ['counterspell', 'hello-there', 'mind-tricks', 'knee-blast', 'countaspell'],
  exhaust: ['mana-barrage', 'force-disarm', 'consume-rage', 'teef-strike'],
  burning: ['fireball'],
};
function statusGeneratorsInHand(statusId: StatusCardId, cards: readonly (typeof CARDS)[number][]) {
  const generatorIds = STATUS_CARD_GENERATORS[statusId];
  return cards.filter((card, index) => generatorIds.includes(card.id) && cards.findIndex((candidate) => candidate.id === card.id) === index);
}
function statusGeneratorAdvice(cardId: CardTypeId, cards: readonly (typeof CARDS)[number][], ru: boolean): string {
  if (!(cardId in STATUS_CARD_GENERATORS)) return '';
  const generators = statusGeneratorsInHand(cardId as StatusCardId, cards);
  if (generators.length === 0) return '';
  const names = generators.map((card) => escapeHtml(card.name)).join(', ');
  return ru ? ` Карты в вашей Руке, которые могут создать этот Статус: <b>${names}</b>.` : ` Cards in your Hand that can generate this Status: <b>${names}</b>.`;
}

function cardTacticalAdvice(card: (typeof CARDS)[number], player: GameState['players'][PlayerId], ru: boolean) {
  const specific = CARD_TACTICAL_ADVICE[card.id]?.[ru ? 'ru' : 'en'];
  const availability = card.kind === 'perk' && player.perkUsed
    ? (ru ? ' Перк в этом ходу уже использован — сохраните карту на следующий ход.' : ' You have already used a Perk this turn, so hold it for the next turn.')
    : card.kind === 'attack' && player.actionsRemaining === 0
      ? (ru ? ' Сейчас Действий не осталось — сохраните карту, если её не требуется сбросить.' : ' You have no Actions remaining, so preserve it unless another effect requires a discard.')
      : '';
  if (specific) return `${specific}${availability}`;
  if (ru) {
    if (card.kind === 'status') return card.canRemoveAsAction ? 'Эта карта занимает место и влияет на вас. Удалите её Действием, когда темп хода позволяет.' : 'Учитывайте этот Статус при планировании хода и проверьте на карте, можно ли его сбросить.';
    if (card.kind === 'defend') return `Сохраните для ответа на сильную Атаку. Базовая Защита: ${card.value}; внешние бонусы и штрафы изменят итог.`;
    if (card.kind === 'perk') return player.perkUsed ? 'Перк в этом ходу уже использован. Сохраните карту или подготовьте её для будущего Spell Echo.' : 'Разыграйте напрямую ради эффекта 1-го уровня или поместите в Spell Echo, чтобы усилить будущие уровни.';
    return player.actionsRemaining > 0 ? `Используйте против цели в радиусе атаки. Базовая Атака: ${card.value}; сначала оцените Защиту и Статусы противника.` : 'Действий не осталось — сохраните эту Атаку на следующий ход или сбросьте только при необходимости.';
  }
  if (card.kind === 'status') return card.canRemoveAsAction ? 'This Card occupies Hand space and affects you. Remove it with an Action when tempo allows.' : 'Plan around this Status and check its text before choosing it for any discard.';
  if (card.kind === 'defend') return `Hold this for a strong incoming Attack. Its base Defend Value is ${card.value}; external bonuses and penalties change the final result.`;
  if (card.kind === 'perk') return player.perkUsed ? 'You already used a Perk this turn. Keep this Card or prepare it for a future Spell Echo cycle.' : 'Play it directly for its Level 1 effect, or place it in Spell Echo to build toward stronger levels.';
  return player.actionsRemaining > 0 ? `Use it on a target within Attack Range. Its base Attack Value is ${card.value}; inspect the enemy's Defences and Statuses first.` : 'You have no Actions remaining. Preserve this Attack for the next turn unless another effect requires a discard.';
}

const CARD_TACTICAL_ADVICE: Partial<Record<(typeof CARDS)[number]['id'], { en: string; ru: string }>> = {
  'echo-pulse': { en: 'A flexible Spell Echo engine. Use it early for a Card, mature it to Level 2 when an extra Action creates a combo turn, or hold Level 3 for emergency healing.', ru: 'Гибкий двигатель Spell Echo. Используйте рано ради карты, поднимите до 2-го уровня для дополнительного Действия в комбо-ходе или сохраните 3-й уровень для срочного лечения.' },
  fireball: { en: 'Deal 2 direct Damage and add Burning to the target’s Hand. Burning deals 1 Damage at each turn start and can only be Removed by performing Dash, which then moves the target randomly.', ru: 'Нанесите 2 прямого урона и добавьте Горение в Руку цели. Горение наносит 1 урон в начале каждого хода и снимается только через Dash, после чего цель движется случайным образом.' },
  portal: { en: 'A one-use global reposition. Escape danger, claim High Ground or a draw Square, or set up the Range and line of sight for your next card.', ru: 'Одноразовое глобальное перемещение. Уходите из опасности, занимайте Высоту или клетку добора либо готовьте дальность и линию видимости для следующей карты.' },
  'vicious-mockery': { en: 'Keep this hidden until +2 changes a combat result. It can turn a narrow Attack into damage or make a crucial Defence hold, but is Removed once committed.', ru: 'Скрывайте карту, пока +2 не изменит исход боя. Она превращает близкую Атаку в урон или спасает ключевую Защиту, но после применения Удаляется.' },
  preparation: { en: 'A card-draw engine in Spell Echo: every use improves hand quality, while higher levels add Mana and filtering. During Consume, swap Logan with any visible movable Object, including Da Orkk’s unequipped Shield.', ru: 'Двигатель добора в Spell Echo: каждое применение улучшает Руку, а высокие уровни дают Ману и фильтрацию. При Consume поменяйте Логана местами с любым видимым перемещаемым объектом, включая снятый Щит Да Оркка.' },
  'arcane-missle': { en: 'Direct damage for targets that normal Attacks cannot conveniently reach. Level 2 routes around pillars, Level 3 reaches globally, and Consume turns it into a strong 3-damage finisher.', ru: 'Прямой урон по целям, которых неудобно доставать обычной Атакой. Уровень 2 обходит колонны, уровень 3 действует глобально, а Consume превращает заклинание в сильный добивающий удар на 3 урона.' },
  'chain-lightning': { en: 'Best when enemies and destructible Objects are clustered. Higher levels extend and repeat bounces; Consume is strongest in a crowded area where repeated hits can revisit targets.', ru: 'Лучше всего работает в скоплении врагов и разрушаемых Объектов. Высокие уровни удлиняют и повторяют скачки; Consume особенно силён в толпе, где молния может повторно поражать цели.' },
  'magic-hand': { en: 'Global line-of-sight Object control. Move a visible box to block a lane, open a path, or line it up with an enemy; Level 3 turns the collision into 2 Damage. Consume pushes the Object until an obstruction stops it.', ru: 'Глобальный контроль видимых Объектов по линии видимости. Перемещайте ящик, чтобы перекрыть путь, открыть проход или направить его во врага; уровень 3 превращает столкновение в 2 урона. Consume толкает Объект до препятствия.' },
  shizzle: { en: 'Logan’s escape and reposition tool. Dash through enemies and ordinary Objects such as wooden boxes, but Wall Objects—including pillars and Da Orkk’s Shield—block the route. Finish on an empty Square. Higher levels add pass-through damage and distance; Consume allows turns between one-Square steps.', ru: 'Инструмент побега и смены позиции Логана. Проходите сквозь врагов и обычные Объекты, например деревянные ящики, но Стенные Объекты — колонны и Щит Да Оркка — блокируют путь. Заканчивайте на пустой клетке. Высокие уровни дают урон и дальность; Consume позволяет менять направление между шагами.' },
  'arcane-bolt': { en: 'Lead a multi-Attack turn with this card: its +1 ATT improves later Attacks until turn end. Consume also immediately grants 1 MOV for repositioning.', ru: 'Начинайте этой картой ход с несколькими Атаками: +1 ATT усилит последующие Атаки до конца хода. Consume также немедленно даёт 1 MOV для смены позиции.' },
  'snowball-effect': { en: 'A repeatable low-value Attack that returns to Hand. Use it when you can spend multiple Actions or need a reliable future Attack; Consume also cycles one unwanted Card after combat.', ru: 'Повторяемая Атака малого значения, возвращающаяся в Руку. Используйте при нескольких Действиях или чтобы сохранить Атаку на будущее; Consume после боя также заменяет одну ненужную карту.' },
  'mana-blast': { en: 'Pressure the enemy’s Hand: they either discard or let Logan gain Mana. It is strongest when their Hand contains valuable Cards; Consume raises ATT and threatens 3 MP if they can legally refuse a discard.', ru: 'Давите на Руку врага: он либо сбрасывает карту, либо даёт Логану Ману. Особенно полезно против ценных карт; Consume повышает ATT и угрожает 3 MP при законном отказе от сброса.' },
  'mana-barrage': { en: 'Convert stored Mana into post-combat damage. Consume sets the Card Value to 6 and adds Exhaust to the target’s Hand if the printed effect is not cancelled.', ru: 'Превращайте накопленную Ману в урон после боя. Consume устанавливает значение карты на 6 и добавляет Exhaust в Руку цели, если эффект карты не отменён.' },
  'grimoire-cleanse': { en: 'Win combat to force the target to discard up to two eligible Cards. With Consume, each Card they actually discard immediately grants Logan +1 MOV.', ru: 'Победите в бою, чтобы заставить цель сбросить до двух допустимых карт. При Consume каждая фактически сброшенная карта немедленно даёт Логану +1 MOV.' },
  spellblock: { en: 'Use against an Attack with a dangerous printed effect. It cancels that effect before combat and converts blocked Attack Value into Mana, combining protection with resource generation.', ru: 'Используйте против Атаки с опасным собственным эффектом. Карта отменяет его до боя и превращает заблокированное значение Атаки в Ману, совмещая защиту и генерацию ресурса.' },
  'mana-shield': { en: 'A Mana-dependent Defence that first generates 1 MP, then uses total stored Mana as DEF. Best when a small amount of Mana is enough to stop damage without emptying resources needed for a later Consume turn.', ru: 'Защита, зависящая от Маны: сначала даёт 1 MP, затем использует весь запас как DEF. Лучше всего, когда малого количества Маны достаточно для блока без потери ресурса на будущий Consume-ход.' },
  'arcane-barrier': { en: "Best against an adjacent attacker when the Square directly behind them is open. Arcane Barrier pushes them away after combat, or deals 1 Damage if that push is blocked.", ru: 'Лучше всего использовать против соседнего атакующего, когда клетка прямо за ним свободна. После боя Arcane Barrier отталкивает его, а если путь заблокирован — наносит 1 урон.' },
  counterspell: { en: 'A high-value Defence and retaliation tool. Save it for 2–3 stored MP so the attacker takes meaningful damage, while the Headache placed on top disrupts their next draw.', ru: 'Сильная Защита и ответный удар. Сохраняйте при 2–3 MP, чтобы нанести заметный урон атакующему, а Headache сверху его Колоды испортит следующий добор.' },
  blink: { en: 'Logan’s emergency Defence: it blocks all combat damage. With Mana, it also teleports him to safety; without Mana, expect to sacrifice a chosen Hand Card or a non-Status Card from Deck.', ru: 'Экстренная Защита Логана: блокирует весь боевой урон. При наличии Маны также телепортирует в безопасность; без Маны придётся пожертвовать выбранной картой Руки или не-Статусной картой Колоды.' },
  'light-the-saber': { en: 'An efficient setup Attack. Apply Pinned early to reduce enemy mobility and prepare Calmness, Double Jump, or Hello There for stronger follow-up value.', ru: 'Эффективная подготовительная Атака. Наложите Pinned заранее, чтобы снизить мобильность врага и усилить последующие Calmness, Double Jump или Hello There.' },
  'dance-through': { en: 'Attack and reposition in one Action. After combat, weave through enemies to escape, cross a blocked lane, or apply Pinned, but reserve the final step for an empty Square.', ru: 'Атака и смена позиции за одно Действие. После боя проходите сквозь врагов для побега, пересечения занятого пути или наложения Pinned, но оставьте последний шаг для пустой клетки.' },
  'force-disarm': { en: 'Use when the enemy is holding revealed or suspected Attack Cards. It removes their offensive option; if none exists, revealing the Hand provides information and Exhaust weakens future combat.', ru: 'Используйте, когда у врага есть открытые или предполагаемые Карты Атаки. Карта убирает наступательную угрозу; если Атак нет, раскрытие Руки даёт информацию, а Exhaust ослабляет будущие бои.' },
  'cut-them-legs': { en: 'A strong repeatable Attack. Aim for a favourable combat so it returns to Hand, applies Pinned, and can be played again if another Action remains.', ru: 'Сильная повторяемая Атака. Добивайтесь победы в бою, чтобы карта вернулась в Руку, наложила Pinned и могла быть сыграна снова при наличии Действия.' },
  'hello-there': { en: 'Shinobi’s Pinned payoff. Stack Pinned first, then use this even against a strong Defence: its bonus damage applies after combat, and Headache further clogs the enemy Hand.', ru: 'Главная реализация Pinned у Шиноби. Сначала накопите Pinned, затем используйте даже против сильной Защиты: дополнительный урон наносится после боя, а Headache засоряет Руку врага.' },
  block: { en: 'Choose this against Attacks whose effects matter more than raw damage. It cancels the printed Attack effect before combat and Pins the attacker for later Shinobi combinations.', ru: 'Выбирайте против Атак, чьи эффекты опаснее чистого урона. Карта отменяет собственный эффект Атаки до боя и накладывает Pinned для будущих комбинаций Шиноби.' },
  'flurry-defensive-strikes': { en: 'Use against an adjacent attacker to deal 1 Damage before combat. If you can spare 1 HP, lose it to force the attacker to discard 1 Card.', ru: 'Используйте против атакующего на соседней клетке, чтобы нанести 1 урон до боя. Если можете пожертвовать 1 HP, потеряйте его, чтобы атакующий сбросил 1 карту.' },
  calmness: { en: 'A hard counter to a Pinned attacker: it negates all damage regardless of combat value. The cleanse removes Shinobi’s positive effects too, so spend valuable buffs first when possible.', ru: 'Жёсткий ответ на атакующего с Pinned: отменяет весь урон независимо от значений боя. Очищение снимает и положительные эффекты Шиноби, поэтому по возможности сначала используйте ценные усиления.' },
  'not-a-shinobi': { en: 'A sturdy Defence that cleanses negative effects after combat. Hold it when Status Cards are restricting movement or combat, especially before an important positioning turn.', ru: 'Надёжная Защита, снимающая негативные эффекты после боя. Сохраняйте, когда Статусные карты мешают движению или бою, особенно перед важным позиционным ходом.' },
  'double-jump': { en: 'Excellent against a heavily Pinned attacker because each stack adds DEF. The two post-combat steps can disengage or pass through enemies to add more Pinned, ending on an empty Square.', ru: 'Особенно силён против атакующего с множеством Pinned: каждый стек даёт DEF. Два шага после боя позволяют выйти из боя или пройти сквозь врагов, добавляя Pinned, с завершением на пустой клетке.' },
  'higround-advantage': { en: 'Shinobi’s Reserve and long-term Spell Echo engine. Level 1 replaces itself, Level 2 maintains Lightsaber, and Level 3 enables a valuable Attack to return to Hand for a combo turn.', ru: 'Резерв Шиноби и долгосрочный двигатель Spell Echo. Уровень 1 заменяет себя картой, уровень 2 поддерживает Lightsaber, а уровень 3 возвращает ценную Атаку в Руку для комбо-хода.' },
  'force-throw': { en: 'Use Objects as projectiles to damage enemies while changing the board. At Level 3, a pushed enemy takes 1 Damage when colliding with anything; if two enemy Players collide, both take 1 Damage.', ru: 'Используйте Объекты как снаряды, нанося урон и меняя поле. На 3-м уровне толкаемый враг получает 1 урон при столкновении с чем угодно; если сталкиваются два вражеских Игрока, оба получают 1 урон.' },
  'force-pull': { en: 'Pull an enemy into Attack Range, off a protected position, or toward a hazardous cluster; pull an Object to reshape cover. Level 3 also prepares Pinned synergies.', ru: 'Подтягивайте врага в Радиус Атаки, с защищённой позиции или к опасному скоплению; Объектом меняйте укрытия. Уровень 3 также готовит комбинации с Pinned.' },
  swiftform: { en: 'A mobility turn enabler. Use it before normal movement to gain distance and pass through enemies without ending on them. Level 3 Pins each crossed enemy once and restores Lightsaber at turn end.', ru: 'Основа мобильного хода. Используйте до обычного движения, чтобы увеличить дальность и проходить сквозь врагов, не заканчивая на них. Уровень 3 один раз накладывает Pinned на каждого пересечённого врага и возвращает Lightsaber.' },
  'mind-tricks': { en: 'Trade information for Hand disruption without losing the revealed Cards. Higher levels pressure every enemy more heavily; Level 3 also plants future draw disruption with Headache.', ru: 'Обменивайте информацию на разрушение Рук, не теряя показанные карты. Высокие уровни сильнее давят на всех врагов; уровень 3 также портит будущий добор картой Headache.' },
  'arkane-arow': { en: 'Throw the equipped Shield to create a wall exactly where it best blocks movement or line of sight. Level 2 raises collision Damage to 2 and Range to 4; Level 3 also pushes and punishes a blocked push.', ru: 'Бросайте экипированный Щит, создавая стену там, где она лучше всего перекрывает движение или линию видимости. Уровень 2 повышает урон столкновения до 2 и дальность до 4; уровень 3 также толкает и наказывает за невозможный толчок.' },
  'arm-da-wiz': { en: 'Recall an unequipped Shield from anywhere on the Board or create a new one. A recall pulls crossed enemies 1 Square toward Orkk; Level 2 damages them, and Level 3 then damages enemies adjacent after equipping.', ru: 'Верните снятый Щит из любой точки поля или создайте новый. Возврат притягивает пересечённых врагов на 1 клетку к Оркку; уровень 2 наносит им урон, а уровень 3 затем ранит соседних врагов после экипировки.' },
  encourage: { en: 'Da Orkk’s card-advantage engine. Keep it cycling in Spell Echo: draw now, add Rage at Level 2, and recover a useful random discard at Level 3.', ru: 'Двигатель преимущества по картам Да Оркка. Прокручивайте в Spell Echo: добор сейчас, Rage на 2-м уровне и возврат случайной полезной карты из Discard на 3-м.' },
  kyk: { en: 'Turn a nearby Object into a long-range projectile. Choose a line that ends in an enemy collision; Level 3 deals heavy damage but permanently destroys the projectile, so spend disposable Objects.', ru: 'Превращайте соседний Объект в дальний снаряд. Выбирайте линию, заканчивающуюся столкновением с врагом; уровень 3 наносит большой урон, но уничтожает снаряд, поэтому используйте расходные Объекты.' },
  'consume-rage': { en: 'Convert 2 Rage into healing instead of spending it on an Attack. Level 1 heals 1 HP and Levels 2–3 heal 2 HP. Level 3 also adds Exhaust to every adjacent enemy and removes all negative Status Cards from Da Orkk.', ru: 'Превращайте 2 Rage в лечение вместо расхода на Атаку. Уровень 1 лечит 1 HP, а уровни 2–3 лечат 2 HP. Уровень 3 также добавляет Exhaust каждому соседнему врагу и удаляет все отрицательные карты статуса Да Оркка.' },
  fistbolt: { en: 'A dependable opener when Orkk has no Rage: it creates 1 stack before comparison and immediately converts it into +1 ATT for this Attack.', ru: 'Надёжное начало при отсутствии Rage: карта создаёт 1 стек до сравнения и сразу превращает его в +1 ATT для этой Атаки.' },
  'chain-punchin': { en: 'A utility Attack for changing Shield state. Attack while unequipped to gain an extra Action and continue a combo; while equipped, use it when you deliberately want the Shield dropped as an obstacle.', ru: 'Утилитарная Атака для смены состояния Щита. Без Щита получайте дополнительное Действие и продолжайте комбинацию; со Щитом используйте, когда хотите намеренно сбросить его как препятствие.' },
  'teef-strike': { en: 'Use early to seed Exhaust into the enemy Hand. The ongoing -1 ATT/DEF makes every later combat easier even if this low-value Attack does little direct damage.', ru: 'Используйте рано, чтобы добавить Exhaust в Руку врага. Постоянный штраф -1 ATT/DEF облегчит все будущие бои, даже если эта слабая Атака нанесёт мало прямого урона.' },
  'shield-bash': { en: 'If the Shield is unequipped, recall and equip it; every enemy crossed takes 3 Damage and is pulled 1 Square toward Orkk by the general Shield recall rule. If it was already equipped when combat began, gain 1 Rage after all combat effects resolve.', ru: 'Если Щит снят, верните и экипируйте его; каждый пересечённый враг получает 3 урона и притягивается на 1 клетку к Оркку по общему правилу возврата Щита. Если Щит был экипирован в начале боя, получите 1 Rage после разрешения всех эффектов боя.' },
  'knee-blast': { en: 'A strong Attack that converts Rage into displacement. Line up the target with an Object, Player, wall, or board edge so an interrupted push also adds Headache to their Hand.', ru: 'Сильная Атака, превращающая Rage в перемещение. Выстройте цель напротив Объекта, Игрока, стены или края поля, чтобы прерванный толчок также добавил Headache в её Руку.' },
  'da-blokk': { en: 'Use against an Attack with a dangerous printed effect. If damage still breaks through, the 2 Rage gained fuels a powerful counterattack on Orkk’s next turn.', ru: 'Используйте против Атаки с опасным собственным эффектом. Если урон всё же пройдёт, полученные 2 Rage подготовят мощную контратаку в следующий ход Оркка.' },
  double: { en: 'Best early in an enemy turn when several damage instances may follow. It doubles Rage gained for the rest of that turn, setting up a large Rage-powered Attack.', ru: 'Лучше использовать в начале хода врага, когда ожидается несколько случаев урона. Карта удваивает получаемый Rage до конца хода и готовит мощную Rage-Атаку.' },
  'arcane-shield': { en: 'Use while equipped to turn the Shield into an adjacent obstacle after combat. While unequipped, it instead gives Rage, so choose it when offence matters more than restoring the DEF bonus.', ru: 'Со Щитом превращает его после боя в соседнее препятствие. Без Щита вместо этого даёт Rage, поэтому выбирайте карту, когда нападение важнее восстановления бонуса DEF.' },
  countaspell: { en: 'A high Defence that weaponizes stored Rage without consuming it. Save it for an enemy with a vulnerable Deck, then load their Discard with Headaches before a later shuffle effect.', ru: 'Высокая Защита, использующая накопленный Rage без расхода. Сохраняйте против врага с уязвимой Колодой, затем наполняйте его Discard картами Headache перед будущим замешиванием.' },
  'mana-baryer': { en: 'With the Shield equipped, Mana Baryer has exactly 5 base DEF—the normal equipped-Shield +1 is not added again. Without the Shield, recall it through enemies for 2 Damage; the general Shield recall rule also pulls each crossed enemy 1 Square toward Orkk.', ru: 'С экипированным Щитом Mana Baryer имеет ровно 5 базовой DEF — обычный бонус +1 за Щит повторно не добавляется. Без Щита верните его через врагов, нанося 2 урона; общее правило возврата Щита также притягивает каждого пересечённого врага на 1 клетку к Оркку.' },
  pinned: { en: 'This restricts movement and cannot be discarded for Hand overstacking. Plan a low-movement turn, use an allowed Finishing Move discard, or wait for the automatic end-turn removal.', ru: 'Ограничивает движение и не может быть сброшена при переполнении Руки. Планируйте ход с малым движением, используйте разрешённый сброс Завершающего приёма или дождитесь автоматического удаления в конце хода.' },
  headache: { en: 'Dead Hand weight that cannot be discarded. Spend an Action to Remove it before the five-Card limit becomes dangerous.', ru: 'Мёртвый груз в Руке, который нельзя Сбросить. Потратьте Действие на Удаление до того, как лимит в пять карт станет опасным.' },
  exhaust: { en: 'While held, every Attack and Defence loses 1 Value. Discard it normally when possible, or attach and Remove it during combat for the larger one-time -3 penalty when that combat is expendable.', ru: 'Пока карта в Руке, каждая Атака и Защита теряет 1. Сбросьте её обычным способом или прикрепите и Удалите в менее важном бою ради одноразового штрафа -3.' },
};

function renderFighter(id: PlayerId, elementId: string, side: 'left' | 'right') {
  const player = gameState.players[id];
  const element = byId(elementId);
  element.className = `fighter ${side}${elementId === 'p3Stats' ? ' violet' : ''}`;
  element.style.setProperty('--fighter-color', playerUiColor(id));
  const hpPercent = player.hp / player.maxHp * 100;
  const orkkIndicators = player.character === 'orkk' ? `<div class="header-statuses"><span title="${player.shieldEquipped ? '+1 Defence Value to Defend Cards.' : 'Shield is unequipped and exists as a Board obstacle.'}">&#128737; ${player.shieldEquipped ? 'EQUIPPED' : 'UNEQUIPPED'}</span></div>` : '';
  const mana = player.character === 'magician' ? `<div class="mana-storage" title="Classic Wizardry Mana: ${player.manaPoints}/3">${[1, 2, 3].map((point) => `<i class="${point <= player.manaPoints ? 'filled' : ''}"></i>`).join('')}<small>${player.manaMode === 'consume' ? 'CONSUME' : 'GENERATE'}</small></div>` : '';
  const title = player.character === 'magician' ? ' · THE MAGICIAN' : '';
  element.innerHTML = `<div><span>${id === 'P1' ? 'PLAYER 01' : id === 'P2' ? 'PLAYER 02' : 'PLAYER 03'}${title}</span><strong>${player.name}</strong></div><div class="hp-copy"><b>${player.hp}</b> / ${player.maxHp} HP</div><div class="hp-track"><i style="width:${hpPercent}%"></i></div>${mana}${orkkIndicators}`;
}

function playerUiColor(playerId: PlayerId) {
  return playerId === 'P1' ? '#45c8ff' : playerId === 'P2' ? '#ff5d68' : '#a06cff';
}

function showTurnAnnouncement(player: GameState['players'][PlayerId]) {
  if (gameState.phase === 'finished' || ['choosing-focus', 'choosing-focus-card', 'choosing-base-placement'].includes(gameState.phase)) return;
  const turnKey = `${gameState.turn}:${player.id}`;
  if (announcedTurnKey === turnKey) return;
  announcedTurnKey = turnKey;
  const announcement = byId('turnAnnouncement');
  const color = playerUiColor(player.id);
  announcement.style.setProperty('--turn-color', color);
  announcement.querySelector('strong')!.textContent = `${player.name}'s turn`;
  const healMessage = announcement.querySelector<HTMLElement>('.turn-heal-message')!;
  const stoicShellHealed = player.character === 'john-christ' && player.stoicShellHealedTurn === gameState.turn;
  healMessage.textContent = stoicShellHealed ? "Stoic Shell has restored John's 1 HP" : '';
  healMessage.classList.toggle('visible', stoicShellHealed);
  announcement.classList.remove('hidden', 'visible');
  void announcement.offsetWidth;
  announcement.classList.add('visible');
  window.clearTimeout(turnAnnouncementTimer);
  turnAnnouncementTimer = window.setTimeout(() => announcement.classList.add('hidden'), 2200);
}

function renderCharacterTraits() {
  const player = gameState.players.P1;
  const playerTwo = gameState.players.P2;
  if (playerTwo.character === 'shinobi') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon lightsaber-trait" tabindex="0">⚡⚔<span class="trait-tooltip"><b>Lightsaber</b>If Shinobi did not move during his turn, gain +1 ATT, +1 DEF, and +1 MOV until the end of his next turn. Movement caused by Shinobi's own Attack or Defence does not prevent this trait.</span></div></div>`;
  else if (playerTwo.character === 'magician') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">✦<span class="trait-tooltip"><b>Classic Wizardry</b>Generate 1 Mana after resolving an Attack or Perk spell, up to 3. At 3 Mana, Logan may Consume it at the start of his turn to enable advanced spell effects.</span></div></div>`;
  else if (playerTwo.character === 'orkk') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">👊<span class="trait-tooltip"><b>Rage</b>Gain 1 Rage per damaging card or action. Apply all Rage to an Attack Card, then remove 1 after combat. Remove 1 more at turn end.</span></div></div>`;
  else if (playerTwo.character === 'john-christ') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon holy-spirit-trait" tabindex="0">✝<span class="trait-tooltip"><b>Possessed</b>Damage triggers Spirit Form: +2 ATT, MOV 1, and movement through enemies. Attacking or ending the turn exits the form.</span></div></div>`;
  else byId('characterTraitPanelP2').innerHTML = '';
  if (player.character === 'shinobi') {
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon lightsaber-trait" tabindex="0">⚡⚔<span class="trait-tooltip"><b>Lightsaber</b>If Shinobi did not move during his turn, gain +1 ATT, +1 DEF, and +1 MOV until the end of his next turn. Movement caused by Shinobi's own Attack or Defence does not prevent this trait.</span></div></div>`;
    return;
  }
  if (player.character === 'magician') {
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">✦<span class="trait-tooltip"><b>Classic Wizardry</b>Generate 1 Mana after resolving an Attack or Perk spell, up to 3. At 3 Mana, Logan may Consume it at the start of his turn to enable advanced spell effects.</span></div></div>`;
    return;
  }
  if (player.character === 'orkk') {
    const shield = player.shieldEquipped ? `<div class="trait-icon highground-active" tabindex="0">🛡<span class="trait-tooltip"><b>Iron Shield Equipped</b>Da Orkk's Defend Cards gain +1 Defence Value.</span></div>` : '';
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">👊<span class="trait-tooltip"><b>Rage</b>Gain 1 Rage per damaging card or action. Apply all Rage to an Attack Card, then remove 1 after combat. Remove 1 more at turn end.</span></div>${shield}</div>`;
    return;
  }
  if (player.character === 'john-christ') {
    const shell = player.stoicShell ? `<div class="trait-icon highground-active" tabindex="0">◉<span class="trait-tooltip"><b>Stoic Shell</b>The next HP Damage removes this Status. If it remains at the beginning of John's next turn, restore 1 HP and remove it.</span></div>` : '';
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon holy-spirit-trait" tabindex="0">✝<span class="trait-tooltip"><b>Possessed</b>Damage triggers Spirit Form: +2 ATT, MOV 1, and movement through enemies. Attacking or ending the turn exits the form.</span></div>${shell}</div>`;
    return;
  }
  byId('characterTraitPanel').innerHTML = '';
}

function playerStatusIcons(player: GameState['players'][PlayerId]) {
    const stacks = pinnedCount(player);
    const headacheInHand = player.hand.filter((card) => card.cardId === 'headache').length;
    const headacheInDiscard = player.discard.filter((card) => card.cardId === 'headache').length;
    const exhaustInHand = player.hand.filter((card) => card.cardId === 'exhaust').length;
    const exhaustStored = player.deck.concat(player.discard).filter((card) => card.cardId === 'exhaust').length;
    const burning = player.hand.filter((card) => card.cardId === 'burning').length;
    const rageIcon = player.character === 'orkk' && player.rageStacks > 0 ? `<div class="status-icon rage-status" tabindex="0">🔥<b>${player.rageStacks}</b><span class="status-tooltip"><strong>Rage Stacks</strong>Attack Cards gain +1 Attack Value from every stack, then consume every Rage Stack applied to that Attack. Remove 1 stack at turn end.</span></div>` : '';
    const doubleRageIcon = player.doubleRageUntilEnemyTurnEnd ? `<div class="status-icon double-rage-status" tabindex="0">×2<span class="status-tooltip"><strong>Double! · Rage</strong>Da Orkk receives doubled Rage Stacks until the end of the attacking Player's turn.</span></div>` : '';
    const pinnedIcon = stacks > 0 ? `<div class="status-icon pinned-status" tabindex="0">🦵<i></i><b>${stacks}</b><span class="status-tooltip"><strong>Pinned</strong>Movement decreased by 1 per Pinned Card (current: ${stacks}). Remove 1 Pinned Card from Hand at the end of turn.</span></div>` : '';
    const handHeadacheIcon = headacheInHand > 0 ? `<div class="status-icon headache-status in-hand" tabindex="0">🤕${headacheInHand > 1 ? `<b>${headacheInHand}</b>` : ''}<span class="status-tooltip"><strong>Headache · Hand</strong>${headacheInHand} Headache Card${headacheInHand === 1 ? '' : 's'} currently filling this player's Hand. Filled red while active in Hand.</span></div>` : '';
    const discardHeadacheIcon = headacheInDiscard > 0 ? `<div class="status-icon headache-status in-discard" tabindex="0">🤕${headacheInDiscard > 1 ? `<b>${headacheInDiscard}</b>` : ''}<span class="status-tooltip"><strong>Headache · Discard</strong>${headacheInDiscard} Headache Card${headacheInDiscard === 1 ? '' : 's'} currently in this player's Discard. Filled orange while discarded.</span></div>` : '';
    const handExhaustIcon = exhaustInHand > 0 ? `<div class="status-icon exhaust-status in-hand" tabindex="0">🥵${exhaustInHand > 1 ? `<b>${exhaustInHand}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Hand</strong>Cards have -1 Attack and Defend Value per Exhaust. During combat, one may be Removed for a -3 modifier instead.</span></div>` : '';
    const storedExhaustIcon = exhaustStored > 0 ? `<div class="status-icon exhaust-status in-discard" tabindex="0">🥵${exhaustStored > 1 ? `<b>${exhaustStored}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Stored</strong>${exhaustStored} Exhaust Card${exhaustStored === 1 ? '' : 's'} in this player's Deck or Discard.</span></div>` : '';
    const arcaneAttackIcon = player.character === 'magician' && player.arcaneBoltAttackBonus > 0 ? `<div class="status-icon arcane-attack-status" tabindex="0">✦<b>+${player.arcaneBoltAttackBonus}</b><span class="status-tooltip"><strong>Arcane Bolt · Empowered</strong>Attack Cards have +${player.arcaneBoltAttackBonus} ATT until the end of this turn.</span></div>` : '';
    const movementBonus = (player.grimoireMoveBonus ?? 0) + (player.swiftformMoveBonus ?? 0);
    const movementIcon = movementBonus > 0 ? `<div class="status-icon movement-bonus-status" tabindex="0">➜<b>+${movementBonus}</b><span class="status-tooltip"><strong>Movement empowered</strong>This character has +${movementBonus} MOV until the end of this turn.</span></div>` : '';
    const passThroughIcon = player.swiftformCanPassEnemies ? `<div class="status-icon pass-through-status" tabindex="0">⇢<span class="status-tooltip"><strong>Swiftform</strong>This character can move through enemies this turn, but cannot finish movement on an occupied Square.</span></div>` : '';
    const lightsaberIcon = player.character === 'shinobi' && player.lightsaberBuff ? `<div class="status-icon lightsaber-active" tabindex="0">⚡<span class="status-tooltip"><strong>Lightsaber empowered</strong>+1 ATT / DEF / MOV. Duration stacks: ${player.lightsaberStacks}.</span></div>` : '';
    const highgroundIcon = player.highgroundAdvantageBuff ? `<div class="status-icon highground-active" tabindex="0">▲<span class="status-tooltip"><strong>Highground Advantage</strong>The next Attack Card returns to this player's Hand.</span></div>` : '';
    const flagState = (gameState as GameState & { questPhases?: { captureTheFlag?: { carrierIds?: PlayerId[]; carrierId?: PlayerId | null } | null } }).questPhases?.captureTheFlag;
    const flagCarrier = Boolean(flagState && (flagState.carrierIds?.includes(player.id) || flagState.carrierId === player.id));
    const flagIcon = flagCarrier ? `<div class="status-icon flag-carrier-status" tabindex="0">⚑<span class="status-tooltip"><strong>Captured Flag</strong>Carry the Flag to your Base and end your turn there to complete Capture the Flag.</span></div>` : '';
    const burningIcon = burning > 0 ? `<div class="status-icon burning-status" tabindex="0">🔥${burning > 1 ? `<b>${burning}</b>` : ''}<span class="status-tooltip"><strong>Burning</strong>Receive 1 Damage per Burning Card at the beginning of the turn. Only Dash Removes Burning; its movement is then spent randomly through legal empty Squares.</span></div>` : '';
    const spiritIcon = player.spiritForm ? `<div class="status-icon holy-spirit-trait" tabindex="0">✝<span class="status-tooltip"><strong>Spirit Form</strong>+2 to Attack Cards, MOV 1, and may pass through enemies. Attack or end the turn to exit.</span></div>` : '';
    const shellIcon = player.stoicShell ? `<div class="status-icon highground-active" tabindex="0">◉<span class="status-tooltip"><strong>Stoic Shell</strong>Removed by HP Damage; otherwise restores 1 HP at the beginning of John's next turn.</span></div>` : '';
    return `${flagIcon}${spiritIcon}${shellIcon}${rageIcon}${doubleRageIcon}${lightsaberIcon}${highgroundIcon}${arcaneAttackIcon}${movementIcon}${passThroughIcon}${burningIcon}${pinnedIcon}${handHeadacheIcon}${discardHeadacheIcon}${handExhaustIcon}${storedExhaustIcon}`;
}

function renderCharacterStatuses() {
  const playerIds = hudSeatPlayerIds();
  (['P1', 'P2', 'P3'] as PlayerId[]).forEach((slotId, index) => {
    const panel = byId(`status${slotId}`);
    const player = gameState.players[playerIds[index]];
    const icons = player ? playerStatusIcons(player) : '';
    panel.classList.toggle('hidden', !icons);
    panel.innerHTML = icons ? `<div class="status-row" aria-label="${escapeHtml(player.name)} statuses">${icons}</div>` : '';
  });
}

function renderHand() {
  const viewerId = actingPlayer();
  const viewer = gameState.players[viewerId];
  const handElement = byId('hand');
  handElement.classList.toggle('hand-overflow', viewer.hand.length > 5);
  handElement.style.setProperty('--hand-count', String(Math.max(1, viewer.hand.length)));
  const currentSelection = selection.getSnapshot().context.selection;
  if (gameState.phase === 'defending') {
    const defenses = viewer.hand.filter((instance) => cardDefinition(instance).kind === 'defend');
    byId('hand').innerHTML = `${defenses.map((instance) => { const card = cardDefinition(instance); return `<button class="card defend" data-defend="${instance.instanceId}" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>REACTION · DISCARD ON USE</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> DEFEND VALUE</div><small>${escapeHtml(card.effectText ?? `Reduce incoming combat value by ${card.value}.`)}</small></button>`; }).join('')}<button class="decline" id="passDefense" ${!canLocalAct(viewerId) ? 'disabled' : ''}>TAKE THE HIT</button>`;
    document.querySelectorAll<HTMLButtonElement>('[data-defend]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'defend', playerId: viewerId, cardInstanceId: button.dataset.defend! })));
    document.querySelector('#passDefense')?.addEventListener('click', () => dispatch({ type: 'pass-defense', playerId: viewerId }));
    return;
  }
  if (gameState.phase === 'choosing-force-disarm-discard') {
    const requiredTarget = gameState.forceDisarm!.targetId;
    const requiredKind = gameState.forceDisarm!.cardKind ?? 'attack';
    if (viewerId !== requiredTarget) {
      byId('hand').innerHTML = `<div class="drone-placeholder">Waiting for ${escapeHtml(gameState.players[requiredTarget].name)} to discard an Attack card.</div>`;
      return;
    }
    const attacks = viewer.hand.filter((instance) => cardDefinition(instance).kind === requiredKind);
    byId('hand').innerHTML = attacks.map((instance) => {
      const card = cardDefinition(instance);
      return `<button class="card attack" data-force-disarm="${instance.instanceId}" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>FORCE DISARM · SELECT TO DISCARD</span><strong>${card.name.toUpperCase()}</strong><div><b>${card.value}</b> ATTACK VALUE</div><small>${escapeHtml(card.effectText ?? 'Click to discard this Attack card.')}</small></button>`;
    }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-force-disarm]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'force-disarm-discard', playerId: viewerId, cardInstanceId: button.dataset.forceDisarm! })));
    return;
  }
  if (gameState.phase === 'choosing-grimoire-discard') {
    const pending = gameState.pendingAttack!;
    if (viewerId !== pending.defenderId) { handElement.innerHTML = `<div class="drone-placeholder">Waiting for the target to discard for Grimoire Cleanse.</div>`; return; }
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${card.kind}" data-grimoire-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'GRIMOIRE CLEANSE · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-grimoire-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'grimoire-discard', playerId: viewerId, cardInstanceId: button.dataset.grimoireDiscard! })));
    return;
  }
  if (gameState.phase === 'choosing-flurry-enemy-discard') {
    const requiredPlayer = gameState.flurry!.attackerId;
    if (viewerId !== requiredPlayer) {
      byId('hand').innerHTML = `<div class="drone-placeholder">Waiting for ${escapeHtml(gameState.players[requiredPlayer].name)} to discard cards.</div>`;
      return;
    }
    byId('hand').innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${card.kind}" data-flurry-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'FLURRY · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${escapeHtml(card.effectText ?? 'Click to discard this card.')}</small></button>`; }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-flurry-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'flurry-enemy-discard', playerId: viewerId, cardInstanceId: button.dataset.flurryDiscard! })));
    return;
  }
  const choosingDiscard = gameState.phase === 'choosing-guard-discard' || gameState.phase === 'choosing-dash-discard' || gameState.phase === 'choosing-end-discard' || gameState.phase === 'choosing-preparation-discard' || gameState.phase === 'choosing-blink-discard' || gameState.phase === 'choosing-snowball-discard' || gameState.phase === 'choosing-mind-tricks-discard' || gameState.phase === 'choosing-mind-tricks-enemy-discard';
  byId('hand').innerHTML = viewer.hand.map((instance) => {
    const card = cardDefinition(instance);
    const selected = (currentSelection.kind === 'attack' || currentSelection.kind === 'perk') && currentSelection.cardInstanceId === instance.instanceId;
    const playableAction = card.kind === 'attack' ? viewer.actionsRemaining > 0 : card.kind === 'perk' ? viewer.actionsRemaining > 0 && !viewer.perkUsed : card.kind === 'free-action' ? true : card.kind === 'status' ? viewer.actionsRemaining > 0 && card.canRemoveAsAction === true : false;
    const mindTricksReveal = gameState.phase === 'choosing-mind-tricks-discard';
    const unavailableMindTricksReveal = mindTricksReveal && (Boolean(instance.revealedToOpponent) || Boolean(gameState.mindTricks?.revealedInstanceIds.includes(instance.instanceId)));
    const cannotOverstackDiscard = !mindTricksReveal && choosingDiscard && (card.cannotBeDiscarded || (gameState.phase === 'choosing-blink-discard' && instance.cardId === 'pinned') || (gameState.phase === 'choosing-end-discard' && card.kind === 'status' && card.canDiscardForHandLimit !== true));
    const spiritBlocked = viewer.character === 'john-christ' && viewer.spiritForm && /bless/i.test(card.name);
    const disabled = !canLocalAct(viewerId) || gameState.phase === 'finished' || Boolean(cannotOverstackDiscard) || unavailableMindTricksReveal || spiritBlocked || (!choosingDiscard && (!playableAction || gameState.phase !== 'active'));
    const interactionCopy = mindTricksReveal ? ' Click to reveal this card and keep it in Hand.' : choosingDiscard ? ' Click to confirm this discard.' : '';
    const typeLabel = card.kind === 'status' ? (card.canRemoveAsAction ? 'STATUS · CLICK TO REMOVE FOR 1 ACTION' : 'STATUS · ACTIVE IN HAND') : card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : card.kind === 'free-action' ? 'FREE ACTION · CLICK TO TARGET' : 'REACTION · DISCARD ON USE';
    const discardLabel = mindTricksReveal ? (unavailableMindTricksReveal ? 'ALREADY REVEALED' : 'SELECT TO REVEAL') : cannotOverstackDiscard ? 'CANNOT BE DISCARDED' : 'SELECT TO DISCARD';
    return `<button class="card ${card.kind} ${selected ? 'selected' : ''}" data-instance="${instance.instanceId}" ${disabled ? 'disabled' : ''}><span>${choosingDiscard ? discardLabel : typeLabel}</span><strong>${card.name.toUpperCase()}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}${interactionCopy ? `<span class="card-interaction">${escapeHtml(interactionCopy)}</span>` : ''}</small></button>`;
  }).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-instance]:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
    if (gameState.phase === 'choosing-preparation-discard') dispatch({ type: 'preparation-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else if (gameState.phase === 'choosing-blink-discard') dispatch({ type: 'blink-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else if (gameState.phase === 'choosing-snowball-discard') dispatch({ type: 'snowball-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else if (gameState.phase === 'choosing-mind-tricks-discard') dispatch({ type: 'mind-tricks-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else if (gameState.phase === 'choosing-mind-tricks-enemy-discard') dispatch({ type: 'mind-tricks-enemy-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else if (choosingDiscard) dispatch({ type: 'discard-card', playerId: viewerId, cardInstanceId: button.dataset.instance! });
    else {
      const instance = viewer.hand.find((card) => card.instanceId === button.dataset.instance)!;
      const definition = cardDefinition(instance);
      if (definition.kind === 'status' && definition.canRemoveAsAction) dispatch({ type: 'remove-status', playerId: viewerId, cardInstanceId: instance.instanceId });
      else if (definition.kind === 'free-action') dispatch({ type: 'play-free-action', playerId: viewerId, cardInstanceId: instance.instanceId });
      else selection.send(definition.kind === 'perk' ? { type: 'SELECT_PERK', cardInstanceId: instance.instanceId } : { type: 'SELECT_ATTACK', cardInstanceId: instance.instanceId });
    }
  }));
}

function renderFlurryModal() {
  const modal = byId('flurryModal');
  const flurry = gameState.flurry;
  const viewerId = actingPlayer();
  if (gameState.phase === 'mana-blast-offer' && gameState.pendingAttack) {
    const defender = gameState.players[gameState.pendingAttack.defenderId];
    const attacker = gameState.players[gameState.pendingAttack.attackerId];
    const refusedMana = attacker.manaMode === 'consume' ? 3 : 1;
    const canChooseManaBlast = viewerId === defender.id && canLocalAct(defender.id);
    modal.classList.toggle('hidden', !canChooseManaBlast);
    if (!canChooseManaBlast) { modal.innerHTML = ''; return; }
    modal.innerHTML = `<div class="choice-dialog"><span>ATTACK FOLLOW-UP</span><h2>Mana Blast</h2><p>Discard one eligible Card to prevent the attacking Logan from gaining Mana, or refuse to discard.</p><div class="choice-cards">${defender.hand.map((instance) => { const card = cardDefinition(instance); return `<button data-mana-blast-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><strong>${escapeHtml(card.name)}</strong><small>${card.cannotBeDiscarded ? 'Cannot be discarded' : 'Discard this Card · No Mana gained'}</small></button>`; }).join('')}</div><button class="choice-decline" id="manaBlastRefuse">Refuse to discard · Grant ${refusedMana} Mana Point${refusedMana === 1 ? '' : 's'} to ${escapeHtml(attacker.name)}</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-mana-blast-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'mana-blast-discard', playerId: defender.id, cardInstanceId: button.dataset.manaBlastDiscard! })));
    modal.querySelector('#manaBlastRefuse')?.addEventListener('click', () => dispatch({ type: 'mana-blast-refuse', playerId: defender.id }));
    return;
  }
  const canChoose = gameState.phase === 'flurry-offer' && flurry && viewerId === flurry.defenderId && canLocalAct(viewerId);
  modal.classList.toggle('hidden', !canChoose);
  if (!canChoose || !flurry) { modal.innerHTML = ''; return; }
  modal.innerHTML = `<div class="choice-dialog"><span>DEFENCE FOLLOW-UP</span><h2>Flurry</h2><p>Lose 1 HP to force ${escapeHtml(gameState.players[flurry.attackerId].name)} to discard 2 Cards.</p><div class="choice-cards"><button id="flurryPayHp"><strong>Lose 1 HP</strong><small>Force the Attacker to discard 2 Cards</small></button></div><button class="choice-decline" id="flurryDecline">Do not activate</button></div>`;
  document.querySelector('#flurryPayHp')?.addEventListener('click', () => dispatch({ type: 'flurry-pay', playerId: viewerId, cardInstanceId: '' }));
  document.querySelector('#flurryDecline')!.addEventListener('click', () => dispatch({ type: 'flurry-decline', playerId: viewerId }));
}

function renderArmDaWizModal() {
  const modal = byId('armDaWizModal');
  const arm = gameState.armDaWiz;
  const visible = (gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-target') && Boolean(arm) && canLocalAct(arm!.casterId);
  modal.classList.toggle('hidden', !visible);
  if (!visible || !arm) { modal.innerHTML = ''; return; }
  if (gameState.phase === 'choosing-arm-da-wiz-target') {
    const shields = gameState.objects.filter((object) => object.kind === 'orkk-shield' && object.ownerId === arm.casterId);
    modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Recall a Shield</h2><p>Select an Iron Shield to recall and equip. Invalid or obstructed Shields remain unavailable to the rules engine.</p><div class="choice-cards">${shields.map((shield) => `<button data-arm-shield="${escapeHtml(shield.id)}"><strong>Iron Shield · ${cellLabel(shield.position)}</strong><small>Recall toward ${escapeHtml(gameState.players[arm.casterId].name)}</small></button>`).join('')}</div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
    modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Recall a Shield</h2><p>Select an Iron Shield anywhere on the Board to recall and equip. Enemy-occupied Squares do not block its route.</p><div class="choice-cards">${shields.map((shield) => `<button data-arm-shield="${escapeHtml(shield.id)}"><strong>Iron Shield · ${cellLabel(shield.position)}</strong><small>Recall toward ${escapeHtml(gameState.players[arm.casterId].name)}</small></button>`).join('')}</div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-arm-shield]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-target', playerId: arm.casterId, objectId: button.dataset.armShield! })));
    modal.querySelector<HTMLButtonElement>('#armWizCancel')!.addEventListener('click', () => dispatch({ type: 'cancel-targeting', playerId: arm.casterId }));
    return;
  }
  modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Arm da Wiz</h2><p>Recall an Iron Shield within Range ${arm.range}, or create and instantly equip a replacement when the old Shield is destroyed or outside Range.</p><div class="choice-cards"><button id="armWizRecall" ${arm.canRecall ? '' : 'disabled'}><strong>Recall Shield</strong><small>${arm.canRecall ? 'Select an in-range Shield on the Board' : 'No Shield is within recall Range'}</small></button><button id="armWizCreate" ${arm.canCreate ? '' : 'disabled'}><strong>Create Shield</strong><small>${arm.canCreate ? 'Create and equip a new Iron Shield' : 'Your existing Shield can be recalled'}</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
  modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Arm da Wiz</h2><p>Recall an Iron Shield from anywhere on the Board, or create and instantly equip a new one.</p><div class="choice-cards"><button id="armWizRecall" ${arm.canRecall ? '' : 'disabled'}><strong>Recall Shield</strong><small>${arm.canRecall ? 'Select any reachable Shield on the Board' : 'No Shield has a valid recall path'}</small></button><button id="armWizCreate"><strong>Create Shield</strong><small>Create and equip a new Iron Shield</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
  document.querySelector('#armWizRecall')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-choice', playerId: arm.casterId, choice: 'recall' }));
  document.querySelector('#armWizCreate')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-choice', playerId: arm.casterId, choice: 'create' }));
  document.querySelector('#armWizCancel')?.addEventListener('click', () => dispatch({ type: 'cancel-targeting', playerId: arm.casterId }));
}

function renderManaModal() {
  const modal = byId('manaModal');
  const playerId = gameState.pendingManaChoice;
  if (gameState.phase !== 'choosing-mana-mode' || !playerId || !canLocalAct(playerId)) { modal.classList.add('hidden'); modal.innerHTML = ''; return; }
  const player = gameState.players[playerId];
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="choice-panel mana-choice-panel"><span>CLASSIC WIZARDRY · START OF TURN</span><strong>${player.name} has 3 Mana</strong><p>Consume all 3 Mana to enable advanced Attack and Perk spell effects this turn? Normal spell resolution will not generate Mana while Consume is active.</p><div><button id="consumeMana">Consume · Advanced Spells</button><button id="generateMana">Reject · Keep Generating</button></div></div>`;
  document.querySelector('#consumeMana')?.addEventListener('click', () => dispatch({ type: 'mana-choice', playerId, consume: true }));
  document.querySelector('#generateMana')?.addEventListener('click', () => dispatch({ type: 'mana-choice', playerId, consume: false }));
}

function renderFocusModal() {
  const modal = byId('focusModal');
  const setupState = gameState as GameState & { openingSetup?: { pendingPlayerIds: PlayerId[]; focusByPlayer: Partial<Record<PlayerId, 'attack' | 'defend'>> } };
  const opening = setupState.openingSetup;
  const playerId = opening?.pendingPlayerIds[0];
  const visible = Boolean(playerId) && (gameState.phase === 'choosing-focus' || gameState.phase === 'choosing-focus-card') && canLocalAct(playerId!);
  modal.classList.toggle('hidden', !visible);
  if (!visible || !playerId) { modal.innerHTML = ''; return; }
  const player = gameState.players[playerId];
  if (gameState.phase === 'choosing-focus') {
    modal.innerHTML = `<div class="choice-dialog"><span>STARTING DECK · CHOOSE FOCUS</span><h2>${escapeHtml(player.name)}</h2><p>Your Focus determines which two sidelined Cards are offered as the handpicked tenth Card.</p><div class="choice-cards"><button data-focus="attack"><strong>Attack Focus</strong><small>Choose between two sidelined Attack Cards</small></button><button data-focus="defend"><strong>Defend Focus</strong><small>Choose between two sidelined Defend Cards</small></button></div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'choose-focus', playerId, focus: button.dataset.focus as 'attack' | 'defend' })));
    return;
  }
  const focus = opening.focusByPlayer[playerId]!;
  const definition = STARTING_DECKS[player.character as 'shinobi' | 'orkk' | 'magician'];
  const choices = focus === 'attack' ? definition.attackFocus : definition.defendFocus;
  modal.innerHTML = `<div class="choice-dialog"><span>${focus.toUpperCase()} FOCUS · CHOOSE TENTH CARD</span><h2>${escapeHtml(player.name)}</h2><div class="choice-cards">${choices.map((cardId) => { const card = cardDefinition({ instanceId: '', cardId }); const valueLabel = card.kind === 'attack' ? 'ATTACK VALUE' : 'DEFEND VALUE'; return `<button data-focus-card="${cardId}"><strong>${escapeHtml(card.name)}</strong><b>${card.value} ${valueLabel}</b><small>${escapeHtml(card.effectText ?? '')}</small></button>`; }).join('')}</div><button class="focus-back-button" id="backToFocusChoice" type="button">Back</button></div>`;
  modal.querySelectorAll<HTMLButtonElement>('[data-focus-card]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'choose-focus-card', playerId, cardId: button.dataset.focusCard as any })));
  modal.querySelector<HTMLButtonElement>('#backToFocusChoice')!.addEventListener('click', () => dispatch({ type: 'back-focus-choice', playerId }));
}

function renderActionQuestPanel() {
  const state = gameState as GameState & { questPhases?: { actionDamageByPlayer: Partial<Record<PlayerId, number>>; currentQuest: { id: string; announcedRound: number; endsAfterRound: number; progress: Partial<Record<PlayerId, number>> } | null; usedQuestIds: string[] } };
  const questState = state.questPhases;
  const current = questState?.currentQuest;
  const panel = byId('actionQuestPanel');
  panel.classList.toggle('collapsed', actionQuestCollapsed);
  if (actionQuestCollapsed) {
    panel.innerHTML = `<button class="action-quest-collapse" id="actionQuestCollapse" type="button" aria-label="Show Action Quest" title="Show Action Quest">QUEST +</button>`;
    panel.querySelector<HTMLButtonElement>('#actionQuestCollapse')?.addEventListener('click', () => {
      actionQuestCollapsed = false;
      renderActionQuestPanel();
    });
    return;
  }
  const collapseButton = `<button class="action-quest-collapse" id="actionQuestCollapse" type="button" aria-label="Hide Action Quest" title="Hide Action Quest">−</button>`;
  if (!current) {
    const nextRound = gameState.turn <= 1 ? 1 : Math.ceil((gameState.turn - 1) / 10) * 10 + 1;
    panel.innerHTML = `${collapseButton}<span>ACTION QUEST</span><strong>Next Quest: Round ${nextRound}</strong><small>${questState?.usedQuestIds.length ?? 0} of ${ACTION_QUEST_POOL.length} Quests completed</small>`;
    panel.querySelector<HTMLButtonElement>('#actionQuestCollapse')?.addEventListener('click', () => {
      actionQuestCollapsed = true;
      renderActionQuestPanel();
    });
    return;
  }
  const remaining = Math.max(0, current.endsAfterRound - gameState.turn + 1);
  const definition = ACTION_QUEST_POOL.find((quest) => quest.id === current.id);
  const condition = actionQuestConditionWithEndRound(current.id, definition?.condition ?? '', current.endsAfterRound);
  const rewardCardId = current.id === 'damage-contest' ? 'fireball' : current.id === 'rabbit-run' ? 'portal' : current.id === 'provocateur' ? 'vicious-mockery' : current.id === 'capture-the-flag' ? 'banner' : current.id === 'tank-junior' ? 'mythril-helmet' : current.id === 'the-elephant' ? 'boomerang' : current.id === 'the-gambler' ? 'monarch-flush' : null;
  const rewardCard = rewardCardId ? cardDefinition({ instanceId: '', cardId: rewardCardId as any }) : null;
  const rewardHidden = hiddenQuestRewardId === current.id;
  const highest = Math.max(1, ...Object.values(gameState.players).map((player) => current.progress[player.id] ?? 0));
  const rewardMarkup = rewardCard
    ? rewardHidden
      ? `<button class="quest-reward-toggle" id="questRewardToggle">SHOW REWARD</button>`
      : `<div class="quest-reward-card ${rewardCard.kind}" data-quest-reward-preview="${rewardCard.id}" tabindex="0"><span>REWARD</span><strong>${escapeHtml(rewardCard.name)}</strong><small>${escapeHtml(rewardCard.effectText ?? '')}</small><button class="quest-reward-hide" id="questRewardHide" type="button">HIDE</button></div>`
    : `<small>Reward: ${escapeHtml(definition?.reward ?? 'None')}</small>`;
  panel.innerHTML = `${collapseButton}<span>ACTION QUEST · ROUND ${gameState.turn}</span><strong>${escapeHtml(definition?.name ?? current.id)}</strong><small>${escapeHtml(condition)}</small>${rewardMarkup}<small>${remaining} Round${remaining === 1 ? '' : 's'} remaining</small><div>${Object.values(gameState.players).map((player) => { const score = current.progress[player.id] ?? 0; const color = player.id === 'P1' ? '#45c8ff' : player.id === 'P2' ? '#ff5d68' : '#a06cff'; return `<p><i style="background:${color}"></i><span>${escapeHtml(player.name)}<u><em style="width:${score / highest * 100}%;background:${color}"></em></u></span><b>${score}</b></p>`; }).join('')}</div>`;
  panel.querySelector<HTMLButtonElement>('#actionQuestCollapse')?.addEventListener('click', () => {
    actionQuestCollapsed = true;
    hideCardPreview();
    renderActionQuestPanel();
  });
  panel.querySelector<HTMLButtonElement>('#questRewardToggle, #questRewardHide')?.addEventListener('click', () => {
    hiddenQuestRewardId = rewardHidden ? null : current.id;
    hideCardPreview();
    renderActionQuestPanel();
  });
  panel.querySelector<HTMLElement>('[data-quest-reward-preview]')?.addEventListener('pointerenter', (event) => showCardPreview((event.currentTarget as HTMLElement).dataset.questRewardPreview!));
  panel.querySelector<HTMLElement>('[data-quest-reward-preview]')?.addEventListener('pointerleave', hideCardPreview);
}

function actionQuestConditionWithEndRound(questId: string, fallback: string, endRound: number) {
  if (questId === 'damage-contest') return `Deal the most Damage until Round ${endRound}.`;
  if (questId === 'tank-junior') return `Block the most combat Damage until Round ${endRound}. Defend Value and damage prevented by Defend Card effects both count.`;
  if (questId === 'rabbit-run') return `Move the greatest distance until Round ${endRound}. Teleports count as 1.`;
  if (questId === 'provocateur') return `Spend the most Rounds starting and ending the same turn on High Ground until Round ${endRound}.`;
  if (questId === 'capture-the-flag') return 'First to capture the shared Flag beside High Ground and end a turn carrying it on their Base.';
  if (questId === 'the-elephant') return `Destroy the most Objects until Round ${endRound}.`;
  if (questId === 'the-gambler') return `Add the most Cards to your Discard Deck until Round ${endRound}. Removed Cards do not count.`;
  const withoutRelativeDuration = fallback.replace(/(?:in|during) the next \d+ Rounds?/i, `until Round ${endRound}`);
  return withoutRelativeDuration === fallback ? `${fallback.replace(/\s*\.\s*$/, '')}. Until Round ${endRound}.` : withoutRelativeDuration;
}

function renderPhaseRewardModal() {
  const extended = gameState as GameState & { questPhases?: { lastQuestWinners: PlayerId[]; progression: Partial<Record<PlayerId, { initialFocus: 'attack' | 'defend' }>>; phaseReward: { phase: 1 | 2 | 3; pendingPlayerIds: PlayerId[]; selectedCardId?: any } | null } };
  const reward = extended.questPhases?.phaseReward;
  const playerId = reward?.pendingPlayerIds[0];
  const visible = Boolean(reward && playerId && ['choosing-phase-card', 'choosing-phase-three-card', 'choosing-phase-destination'].includes(gameState.phase) && canLocalAct(playerId!));
  phaseRewardModal.classList.toggle('hidden', !visible);
  if (!visible || !reward || !playerId) { phaseRewardModal.innerHTML = ''; return; }
  const player = gameState.players[playerId];
  const winner = extended.questPhases!.lastQuestWinners.includes(playerId);
  if (gameState.phase === 'choosing-phase-destination') {
    phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE ${reward.phase} · ADDING RULES</span><h2>Choose Card destination</h2><p>As an Action Quest Winner, ${escapeHtml(player.name)} may choose where the new Card is added.</p><div class="choice-cards"><button data-phase-destination="hand"><strong>Hand</strong></button><button data-phase-destination="top"><strong>Top of Deck</strong></button><button data-phase-destination="shuffle"><strong>Shuffle into Deck</strong></button></div></div>`;
    phaseRewardModal.querySelectorAll<HTMLButtonElement>('[data-phase-destination]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'phase-card-destination', playerId, destination: button.dataset.phaseDestination as any })));
    return;
  }
  if (reward.phase === 3) {
    const phaseThreeCards = ([['HAND', player.hand], ['DECK', player.deck], ['DISCARD', player.discard]] as const).flatMap(([pile, cards]) => cards.map((instance) => ({ pile, instance })));
    phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE THREE · CARD REFINEMENT</span><h2>${escapeHtml(player.name)}</h2><p>Choose any Card in your Hand, Deck, or Discard, then Duplicate or Remove it.${winner ? ' You may choose the destination of a duplicate.' : ' A duplicate must be shuffled into your Deck.'}</p><div class="choice-cards">${phaseThreeCards.map(({ pile, instance }) => { const card = cardDefinition(instance); return `<button class="phase-three-card"><span>${pile}</span><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.effectText ?? '')}</small><em data-phase-op="duplicate" data-instance="${instance.instanceId}">Duplicate</em><em data-phase-op="remove" data-instance="${instance.instanceId}">Remove</em></button>`; }).join('')}</div></div>`;
    phaseRewardModal.querySelectorAll<HTMLElement>('[data-phase-op]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); dispatch({ type: 'phase-three-operation', playerId, cardInstanceId: button.dataset.instance!, operation: button.dataset.phaseOp as any }); }));
    return;
  }
  const definition = STARTING_DECKS[player.character as 'shinobi' | 'orkk' | 'magician'];
  const initialFocus = extended.questPhases!.progression[playerId]?.initialFocus ?? 'attack';
  const choices = reward.phase === 1 ? (initialFocus === 'attack' ? definition.defendFocus : definition.attackFocus) : definition.perkPhase;
  phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE ${reward.phase} REWARD</span><h2>${escapeHtml(player.name)}</h2><p>${winner ? 'You won the previous Action Quest and may choose this Card’s destination.' : 'This Card will be shuffled into your Deck.'}</p><div class="choice-cards">${choices.map((cardId) => { const card = cardDefinition({ instanceId: '', cardId }); return `<button data-phase-card="${cardId}"><strong>${escapeHtml(card.name)}</strong><b>${card.value} ${card.kind === 'attack' ? 'ATTACK' : card.kind === 'defend' ? 'DEFEND' : 'PERK'} VALUE</b><small>${escapeHtml(card.effectText ?? card.levelEffects?.join(' · ') ?? '')}</small></button>`; }).join('')}</div></div>`;
  phaseRewardModal.querySelectorAll<HTMLButtonElement>('[data-phase-card]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'phase-card-choice', playerId, cardId: button.dataset.phaseCard as any })));
}

function renderCombatReveal() {
  const modal = byId('combatRevealModal');
  const reveal = gameState.combatReveal;
  modal.classList.toggle('hidden', !reveal);
  if (!reveal) { modal.innerHTML = ''; return; }
  const attack = cardDefinition({ instanceId: '', cardId: reveal.attackCardId });
  const defend = reveal.defendCardId ? cardDefinition({ instanceId: '', cardId: reveal.defendCardId }) : null;
  const seconds = Math.max(0, Math.ceil((reveal.expiresAt - Date.now()) / 1000));
  const modifier = (base: number, total: number) => total === base ? `${total}` : `${base} ${total > base ? '+' : '−'} ${Math.abs(total - base)} = ${total}`;
  const viewer = mode === 'online' ? localSeat : null;
  const acknowledged = viewer ? reveal.acknowledged.includes(viewer) : false;
  const defendCard = defend ? `<article class="combat-card defend"><label>DEFEND VALUE <strong>${modifier(reveal.defendBase, reveal.defendTotal)}</strong></label><div><span>DEFENCE</span><h3>${escapeHtml(defend.name)}</h3><b>${reveal.defendTotal}</b><small>${escapeHtml(defend.effectText ?? '')}</small></div></article>` : `<article class="combat-card defend"><label>NO DEFENCE</label><div><span>DEFENCE</span><h3>Take the hit</h3><b>0</b><small>No Defend Card was played.</small></div></article>`;
  if (reveal.viciousMockery) {
    const decisionPlayer = actingPlayer();
    const mayDecide = reveal.viciousMockery.eligible.includes(decisionPlayer) && !reveal.viciousMockery.decided.includes(decisionPlayer) && canLocalAct(decisionPlayer);
    const side = gameState.pendingAttack?.attackerId === decisionPlayer ? 'ATT' : 'DEF';
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>SPECIAL COMBAT CARD</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: use Vicious Mockery?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Vicious Mockery from the game to give the played Card +2 ${side}, or keep it for another combat.</div><div class="combat-choice-buttons"><button id="useViciousMockery" ${mayDecide ? '' : 'disabled'}>USE · +2 ${side}</button><button id="keepViciousMockery" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    document.querySelector('#useViciousMockery:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'vicious-mockery-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepViciousMockery:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'vicious-mockery-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  if (reveal.blessingLight) {
    const decisionPlayer = reveal.blessingLight.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>BLESSING · COMBAT MODIFIER</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply Blessing: Light?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Blessing: Light to decrease the enemy's played Defend Card Value by 1, or keep it for another combat.</div><div class="combat-choice-buttons"><button id="useBlessingLight" ${mayDecide ? '' : 'disabled'}>USE · -1 ENEMY DEF</button><button id="keepBlessingLight" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    document.querySelector('#useBlessingLight:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-light-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepBlessingLight:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-light-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  if (reveal.mythrilHelmet) {
    const decisionPlayer = reveal.mythrilHelmet.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>REWARD · COMBAT DEFENCE</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply Mythril Helmet?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Mythril Helmet from the Deck to negate all Damage in this combat, or keep it for later.</div><div class="combat-choice-buttons"><button id="useMythrilHelmet" ${mayDecide ? '' : 'disabled'}>USE · NEGATE ALL DAMAGE</button><button id="keepMythrilHelmet" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    document.querySelector('#useMythrilHelmet:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'mythril-helmet-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepMythrilHelmet:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'mythril-helmet-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  if (reveal.exhaust) {
    const decisionPlayer = actingPlayer();
    const mayDecide = reveal.exhaust.eligible.includes(decisionPlayer) && !reveal.exhaust.decided.includes(decisionPlayer) && canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>COMBAT MODIFIER</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: attach Exhaust?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove one Exhaust from Hand and apply -3 Value to your played card, or keep its normal -1 penalty.</div><div class="combat-choice-buttons"><button id="attachExhaust" ${mayDecide ? '' : 'disabled'}>ATTACH EXHAUST · -3 VALUE</button><button id="keepExhaust" ${mayDecide ? '' : 'disabled'}>KEEP EXHAUST · -1 VALUE</button></div></div>`;
    document.querySelector('#attachExhaust:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'exhaust-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepExhaust:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'exhaust-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  modal.innerHTML = `<div class="combat-reveal-dialog"><span>COMBAT RESOLUTION</span><h2>Attack vs Defence</h2><div class="combat-countdown"><b>${seconds}</b> seconds</div><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">${mode === 'online' ? `${reveal.acknowledged.length}/2 players confirmed` : 'Confirm to continue immediately'}</div><button id="combatRevealOk" ${acknowledged ? 'disabled' : ''}>${acknowledged ? 'WAITING FOR OPPONENT' : 'OK'}</button></div>`;
  document.querySelector('#combatRevealOk:not(:disabled)')?.addEventListener('click', acknowledgeCombatReveal);
}

function acknowledgeCombatReveal() {
  if (!gameState.combatReveal) return;
  if (mode === 'online') {
    if (localSeat) dispatch({ type: 'ack-combat', playerId: localSeat });
    return;
  }
  const first = applyCommand(gameState, { type: 'ack-combat', playerId: 'P1' });
  if (!first.ok) return notify(first.error);
  const second = applyCommand(first.state, { type: 'ack-combat', playerId: 'P2' });
  if (!second.ok) return notify(second.error);
  gameState = second.state;
  renderAll();
}

function renderSpellEchoBars() {
  hideCardPreview();
  const viewerId = actingPlayer();
  const playerIds = (Object.keys(gameState.players) as PlayerId[]).filter((id) => Boolean(gameState.players[id]));
  const opponentIds = playerIds.filter((id) => id !== viewerId);
  const selected = selection.getSnapshot().context.selection;
  const fixedHotseatDuel = mode === 'hotseat' && playerIds.length === 2;
  const echoOwners = fixedHotseatDuel ? playerIds : [viewerId, ...opponentIds];
  byId('spellEchoBars').classList.toggle('three-player', playerIds.length === 3);
  byId('spellEchoBars').innerHTML = echoOwners.map((ownerId) => {
    const owner = gameState.players[ownerId];
    const slots = owner.spellEcho.map((instance, index) => {
      const position = index + 1;
      const perk = instance ? cardDefinition(instance) : null;
      const canPlace = ownerId === viewerId && selected.kind === 'perk' && position === 1;
      const canUse = ownerId === viewerId && selected.kind !== 'perk' && Boolean(instance) && owner.actionsRemaining > 0 && !owner.perkUsed && gameState.phase === 'active' && canLocalAct(ownerId);
      const tooltip = perk ? [perk.levelEffects?.slice(0, position).map((effect, index) => `Level ${index + 1}: ${effect}`).join('\n'), perk.effectText].filter(Boolean).join('\n') : `Empty Spell Echo position ${position}`;
      return `<button class="echo-slot ${instance ? 'filled' : ''} ${canPlace ? 'can-place' : ''}" title="${escapeHtml(tooltip ?? '')}" data-echo-owner="${ownerId}" data-echo-position="${position}" ${perk ? `data-echo-preview="${perk.id}"` : ''} ${(canPlace || canUse) ? '' : 'disabled'}><b>${position}</b>${perk ? `<span>${escapeHtml(perk.name)}</span><small>LV ${position}</small>` : '<span>EMPTY</span>'}</button>`;
    }).join('');
    const leftEcho = fixedHotseatDuel ? ownerId === 'P1' : ownerId === viewerId;
    const seatClass = leftEcho ? 'own-echo' : `opponent-echo seat-${ownerId.toLowerCase()}`;
    const colorClass = ownerId === 'P1' ? 'blue' : ownerId === 'P2' ? 'red' : 'violet';
    return `<section class="spell-echo ${colorClass} ${seatClass}"><label>${owner.name.toUpperCase()}<br>SPELL ECHO</label><div>${slots}</div></section>`;
  }).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-echo-owner]:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
    const ownerId = button.dataset.echoOwner as PlayerId;
    const position = Number(button.dataset.echoPosition);
    const current = selection.getSnapshot().context.selection;
    if (current.kind === 'perk' && position === 1) {
      const occupied = Boolean(gameState.players[ownerId].spellEcho[0]);
      const replaceExisting = !occupied || window.confirm('Spell Echo position 1 is occupied. Discard the old Perk and replace it?');
      if (replaceExisting) dispatch({ type: 'play-perk', playerId: ownerId, cardInstanceId: current.cardInstanceId, destination: 'echo', replaceExisting });
    } else dispatch({ type: 'use-echo-perk', playerId: ownerId, position });
  }));
  document.querySelectorAll<HTMLElement>('[data-echo-preview]').forEach((slot) => {
    slot.addEventListener('pointerenter', () => showCardPreview(slot.dataset.echoPreview!));
    slot.addEventListener('pointerleave', hideCardPreview);
  });
}

function renderOpponentHand() {
  hideCardPreview();
  const viewerId = actingPlayer();
  const playerIds = (Object.keys(gameState.players) as PlayerId[]).filter((id) => Boolean(gameState.players[id]));
  const opponentIds = playerIds.filter((id) => id !== viewerId);
  const container = byId('opponentHandPanels');
  container.classList.toggle('three-player', playerIds.length === 3);
  container.innerHTML = opponentIds.map((opponentId, index) => {
    const opponent = gameState.players[opponentId];
    const ownerColor = playerUiColor(opponentId);
    const cards = opponent.hand.map((instance) => {
      const card = cardDefinition(instance);
      if (!isCardRevealedToOpponents(opponent, instance) && card.kind !== 'status') return `<div class="opponent-card card-back" title="Unrevealed opponent card"><i></i><b>G</b></div>`;
      return `<div class="opponent-card revealed ${card.kind}" data-preview-card="${card.id}" title="Revealed: ${escapeHtml(card.name)} — value ${card.value}"><span>${card.kind}</span><strong>${escapeHtml(card.name)}</strong><b>${card.value}</b></div>`;
    }).join('');
    return `<section class="opponent-hand-panel seat-${opponentId.toLowerCase()} opponent-row-${index + 1}" style="--owner-color:${ownerColor}"><span><strong class="opponent-owner-name">${escapeHtml(opponent.name.toUpperCase())}</strong><span> · ${opponent.hand.length} CARD${opponent.hand.length === 1 ? '' : 'S'}</span></span><div class="opponent-hand">${cards}</div></section>`;
  }).join('');
  document.querySelectorAll<HTMLElement>('[data-preview-card]').forEach((element) => {
    element.addEventListener('mouseenter', () => showCardPreview(element.dataset.previewCard!));
    element.addEventListener('mouseleave', hideCardPreview);
  });
}

function showCardPreview(cardId: string, pointer?: PointerEvent) {
  if (gameState.combatReveal) return;
  const card = CARDS.find((candidate) => candidate.id === cardId);
  if (!card) return;
  const preview = byId('cardHoverPreview');
  preview.innerHTML = `<article class="card ${card.kind}"><span>${card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></article>`;
  preview.classList.remove('hidden');
  preview.classList.toggle('cursor-preview', Boolean(pointer));
  if (pointer) positionCardPreview(pointer);
}

function positionCardPreview(pointer: PointerEvent) {
  const preview = byId('cardHoverPreview');
  if (!preview.classList.contains('cursor-preview')) return;
  const halfWidth = Math.min(120, (window.innerWidth - 32) / 2);
  preview.style.left = `${Math.max(halfWidth + 16, Math.min(window.innerWidth - halfWidth - 16, pointer.clientX))}px`;
  preview.style.top = `${Math.max(306, pointer.clientY - 14)}px`;
}

function cardRulesText(card: ReturnType<typeof cardDefinition>): string {
  const translation = hintsLanguage === 'ru' ? CARD_RULES_RU[card.id] : undefined;
  const levelEffects = translation?.levelEffects ?? card.levelEffects;
  const levels = levelEffects?.map((effect, index) => `${hintsLanguage === 'ru' ? 'Уровень' : 'Level'} ${index + 1}: ${effect}`).join('\n');
  const fallback = card.kind === 'attack'
    ? hintsLanguage === 'ru' ? `Нанесите боевой урон со значением Атаки ${card.value}.` : `Deal combat damage with ${card.value} Attack Value.`
    : hintsLanguage === 'ru' ? `Защищайтесь со значением Защиты ${card.value}.` : `Defend with ${card.value} Defence Value.`;
  return [levels, translation?.effectText ?? card.effectText, translation?.consumeText ?? card.consumeText].filter(Boolean).join('\n') || fallback;
}

function cardRulesHtml(card: ReturnType<typeof cardDefinition>): string {
  const translation = hintsLanguage === 'ru' ? CARD_RULES_RU[card.id] : undefined;
  const levelEffects = translation?.levelEffects ?? card.levelEffects;
  const effectText = translation?.effectText ?? card.effectText;
  const consumeText = translation?.consumeText ?? card.consumeText;
  const levels = levelEffects?.map((effect, index) => `${hintsLanguage === 'ru' ? 'Уровень' : 'Level'} ${index + 1}: ${effect}`).join('\n') ?? '';
  const effect = effectText
    ? (/^\s*\*?consume\s*:/i.test(effectText) ? `<em class="consume-effect">${escapeHtml(effectText.replace(/^\s*\*/, ''))}</em>` : escapeHtml(effectText))
    : '';
  const consume = consumeText ? `<em class="consume-effect">${escapeHtml(consumeText)}</em>` : '';
  if (levels || effect || consume) return [escapeHtml(levels), effect, consume].filter(Boolean).join('\n');
  return escapeHtml(cardRulesText(card));
}

const originalInterfaceText = new WeakMap<Text, string>();
const originalInterfaceAttributes = new WeakMap<Element, Map<string, string>>();
const cardRulePhraseTranslations = new Map<string, string>();
for (const card of CARDS) {
  const translated = CARD_RULES_RU[card.id];
  if (card.effectText && translated?.effectText) cardRulePhraseTranslations.set(card.effectText, translated.effectText);
  if (card.consumeText && translated?.consumeText) cardRulePhraseTranslations.set(card.consumeText, translated.consumeText);
  card.levelEffects?.forEach((effect, index) => {
    const translatedEffect = translated?.levelEffects?.[index];
    if (translatedEffect) {
      cardRulePhraseTranslations.set(effect, translatedEffect);
      cardRulePhraseTranslations.set(`Level ${index + 1}: ${effect}`, `Уровень ${index + 1}: ${translatedEffect}`);
    }
  });
}

function translateInterfaceValue(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  if (!core) return value;
  const exact = UI_RU_EXACT[core] ?? cardRulePhraseTranslations.get(core);
  if (exact) return `${leading}${exact}${trailing}`;
  let translated = core
    .replace(/^ROUND (\d+)$/i, 'РАУНД $1')
    .replace(/^(.+)'s turn$/i, 'Ход: $1')
    .replace(/^(.+) wins$/i, '$1 побеждает')
    .replace(/^Level (\d+): /gim, 'Уровень $1: ')
    .replace(/\bAttack Value\b/gi, 'значение Атаки')
    .replace(/\bDefend Value\b/gi, 'значение Защиты')
    .replace(/\bDamage\b/g, 'Урон')
    .replace(/\bRange\b/g, 'Радиус')
    .replace(/\bSquare(s)?\b/g, 'клетк$1')
    .replace(/\bCard(s)?\b/g, 'карт$1')
    .replace(/\bAction(s)?\b/g, 'Действи$1')
    .replace(/\bPlayer(s)?\b/g, 'Игрок$1')
    .replace(/\bTurn\b/g, 'Ход')
    .replace(/\bRound(s)?\b/g, 'Раунд$1')
    .replace(/\bHand\b/g, 'Рука')
    .replace(/\bDeck\b/g, 'Колода')
    .replace(/\bDiscard\b/g, 'Сброс')
    .replace(/\bShow\b/g, 'Показать')
    .replace(/\bHide\b/g, 'Скрыть')
    .replace(/\bCancel\b/g, 'Отменить')
    .replace(/\bSelect\b/g, 'Выберите')
    .replace(/\bWaiting for\b/g, 'Ожидание:')
    .replace(/\bempty\b/gi, 'пустая')
    .replace(/\benemy\b/gi, 'враг')
    .replace(/\bObject\b/g, 'Объект');
  return `${leading}${translated}${trailing}`;
}

function applyInterfaceLanguage(root: ParentNode = app) {
  const russian = hintsLanguage === 'ru';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (russian) {
      if (!originalInterfaceText.has(node)) originalInterfaceText.set(node, node.data);
      const translated = translateInterfaceValue(originalInterfaceText.get(node)!);
      if (node.data !== translated) node.data = translated;
    } else {
      const original = originalInterfaceText.get(node);
      if (original !== undefined && node.data !== original) node.data = original;
    }
    node = walker.nextNode() as Text | null;
  }
  root.querySelectorAll<HTMLElement>('[placeholder], [title], [aria-label]').forEach((element) => {
    let originals = originalInterfaceAttributes.get(element);
    if (!originals) { originals = new Map(); originalInterfaceAttributes.set(element, originals); }
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const current = element.getAttribute(attribute);
      if (current === null) continue;
      if (!originals.has(attribute)) originals.set(attribute, current);
      const original = originals.get(attribute)!;
      element.setAttribute(attribute, russian ? translateInterfaceValue(original) : original);
    }
  });
}

function hideCardPreview() {
  const preview = document.getElementById('cardHoverPreview');
  preview?.classList.add('hidden');
  preview?.classList.remove('cursor-preview');
  if (preview) { preview.style.left = ''; preview.style.top = ''; }
}

function canLocalAct(playerId: PlayerId) {
  return mode === 'hotseat' || localSeat === playerId;
}

function notify(message: string) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.setTimeout(() => toast.classList.remove('visible'), 2600);
}

function byId(id: string) { return document.getElementById(id)!; }
function escapeHtml(value: string) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }

// Three.js board -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07100e);
scene.fog = new THREE.Fog(0x07100e, 72, 120);
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(14.5, 18.5, 15.5);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
boardEl.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 7;
controls.maxDistance = 58;
controls.minPolarAngle = 0.38;
controls.maxPolarAngle = Math.PI / 2.15;
controls.mouseButtons.LEFT = null;
controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
controls.mouseButtons.RIGHT = null;
controls.target.set(0, 0, 0);
controls.update();
scene.add(new THREE.HemisphereLight(0xbde8dc, 0x07100e, 1.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
keyLight.position.set(4, 9, 5); keyLight.castShadow = true; scene.add(keyLight);
const floor = new THREE.Mesh(new THREE.CylinderGeometry(12.4, 12.8, 0.42, 8), new THREE.MeshStandardMaterial({ color: 0x0d1b18, roughness: 0.7, metalness: 0.35 }));
floor.position.y = -0.33; floor.receiveShadow = true; scene.add(floor);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const cellMeshes: THREE.Mesh[] = [];
const axisLabels: THREE.Sprite[] = [];
const dummyGroups = new Map<PlayerId, THREE.Group>();
const objectGroups = new Map<string, THREE.Group>();
const lastObjectVisualCells = new Map<string, string>();
const objectMovementAnimations = new Map<string, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; collided: boolean; dx: number; dy: number; path?: THREE.Vector3[]; removeOnComplete?: boolean; equipPlayerId?: PlayerId; parachute?: boolean }>();
const processedObjectPushAnimations = new Set<string>();
const processedSpellProjectiles = new Set<string>();
const spellProjectileAnimations: { mesh: THREE.Mesh; points: THREE.Vector3[]; startedAt: number; duration: number; delay: number; boomerang?: boolean }[] = [];
const processedStoicShellHeals = new Set<string>();
const stoicShellHealAnimations: { group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh; light: THREE.PointLight; startedAt: number }[] = [];
const impactAnimations = new Map<PlayerId, number>();
const damageNumbers: { sprite: THREE.Sprite; startedAt: number; origin: THREE.Vector3 }[] = [];
const lastVisualCells = new Map<PlayerId, string>();
const movementAnimations = new Map<PlayerId, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; path?: THREE.Vector3[] }>();
const questFlagModels = new Map<string, THREE.Group>();
let questFlagVisualKey = '';
let boardVisualKey = '';
let fittedArenaKey = '';
let cameraGrab: { pointerId: number; pivot: THREE.Vector3; lastX: number; lastY: number; focusDistance: number } | null = null;
const visualBoardWidth = () => gameState.boardSize === LORDAERON_ARENA.height ? LORDAERON_ARENA.width : gameState.boardSize;
const visualBoardHeight = () => gameState.boardSize;
const placementState = () => (gameState as GameState & { lordaeronPlacement?: { availableBaseIds: ('P1' | 'P2' | 'P3')[]; claims: Partial<Record<PlayerId, 'P1' | 'P2' | 'P3'>> } }).lordaeronPlacement;
const boardGeometryKey = () => `${visualBoardWidth()}x${visualBoardHeight()}-${JSON.stringify(placementState()?.claims ?? {})}`;
rebuildBoardGeometry(visualBoardWidth(), visualBoardHeight());
dummyGroups.set('P1', createDaOrkk(0x169bd3));
dummyGroups.set('P2', createObiWanShinobi(0xff5d68));
scene.add(dummyGroups.get('P1')!, dummyGroups.get('P2')!);

renderer.domElement.addEventListener('pointerdown', onCameraRotateStart, { capture: true });
renderer.domElement.addEventListener('pointermove', onCameraGrabMove);
renderer.domElement.addEventListener('pointerup', finishCameraGrab);
renderer.domElement.addEventListener('pointercancel', finishCameraGrab);
renderer.domElement.addEventListener('lostpointercapture', finishCameraGrab);
renderer.domElement.addEventListener('pointerdown', onBoardClick);
renderer.domElement.addEventListener('dblclick', onBoardDoubleClick);
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', resize);
new ResizeObserver(() => resize()).observe(boardEl);
resize();
const cameraKeys = new Set<string>();
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'Home') {
    fitCameraToArena(visualBoardWidth(), visualBoardHeight(), true);
    cameraKeys.clear();
    notify('Camera angle and zoom reset to the arena.');
    event.preventDefault();
    return;
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'].includes(event.code)) {
    cameraKeys.add(event.code);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => cameraKeys.delete(event.code));
window.addEventListener('blur', () => {
  cameraKeys.clear();
  if (cameraGrab) {
    const pointerId = cameraGrab.pointerId;
    cameraGrab = null;
    if (renderer.domElement.hasPointerCapture(pointerId)) renderer.domElement.releasePointerCapture(pointerId);
    renderer.domElement.style.cursor = 'grab';
  }
});
let previousFrameTime = performance.now();
renderer.setAnimationLoop((time) => {
  const deltaSeconds = Math.min((time - previousFrameTime) / 1000, 0.05);
  previousFrameTime = time;
  updateCameraMovement(deltaSeconds);
  if (!cameraGrab) controls.update();
  updateTargetHighlights(time);
  updateCharacterMovement(time);
  updateObjectMovement(time);
  updateSpellProjectiles(time);
  updateStoicShellHealAnimations(time);
  updateCharacterFacing(deltaSeconds);
  dummyGroups.forEach((group, id) => {
    const body = group.children[0];
    const moving = movementAnimations.has(id);
    body.position.y = moving ? Math.abs(Math.sin(time * 0.012)) * 0.08 : Math.sin(time * 0.002 + (id === 'P1' ? 0 : 2)) * 0.035;
    const shellAura = group.getObjectByName('StoicShellAura');
    if (shellAura?.visible) {
      const pulse = 1 + Math.sin(time * 0.0045) * 0.055;
      shellAura.scale.set(pulse, pulse * 1.02, pulse);
      shellAura.rotation.y = time * 0.00045;
      const light = shellAura.getObjectByName('StoicShellAuraLight') as THREE.PointLight | undefined;
      if (light) light.intensity = 2.8 + Math.sin(time * 0.006) * 0.7;
    }
  });
  updateDamageVisuals(time);
  renderer.render(scene, camera);
});

function spawnDamageVisual(playerId: PlayerId, amount: number, collision: boolean) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.font = "900 76px 'Barlow Condensed', Arial"; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.lineWidth = 12; context.strokeStyle = 'rgba(35,0,0,.95)'; context.strokeText(`-${amount}`, 128, 66);
  context.fillStyle = '#ff635f'; context.fillText(`-${amount}`, 128, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  const origin = (dummyGroups.get(playerId)?.position ?? worldPosition(gameState.players[playerId].position)).clone(); origin.y += 2.25;
  sprite.position.copy(origin); sprite.scale.set(1.25, 0.63, 1); sprite.renderOrder = 100; scene.add(sprite);
  damageNumbers.push({ sprite, startedAt: performance.now(), origin });
  if (collision) impactAnimations.set(playerId, performance.now());
}

function spawnTeleportSquareVisual(cell: Cell) {
  const material = new THREE.MeshBasicMaterial({ color: 0x77e8ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.92, 48), material);
  ring.position.copy(worldPosition(cell)); ring.position.y += 0.1; ring.rotation.x = -Math.PI / 2; ring.renderOrder = 90;
  scene.add(ring);
  const startedAt = performance.now();
  const animateTeleport = () => {
    const progress = (performance.now() - startedAt) / 720;
    if (progress >= 1) {
      scene.remove(ring); ring.geometry.dispose(); material.dispose(); return;
    }
    const pulse = 0.75 + Math.sin(progress * Math.PI) * 0.7;
    ring.scale.setScalar(pulse);
    material.opacity = 0.9 * (1 - progress);
    requestAnimationFrame(animateTeleport);
  };
  requestAnimationFrame(animateTeleport);
}

function updateDamageVisuals(time: number) {
  impactAnimations.forEach((startedAt, playerId) => {
    const body = dummyGroups.get(playerId)?.children[0]; if (!body) return;
    const progress = (time - startedAt) / 520;
    if (progress >= 1) { body.position.x = 0; body.rotation.y = 0; impactAnimations.delete(playerId); return; }
    const strength = (1 - progress) * 0.13;
    body.position.x = Math.sin(progress * Math.PI * 10) * strength;
    body.rotation.y = Math.sin(progress * Math.PI * 8) * strength * 1.8;
  });
  for (let index = damageNumbers.length - 1; index >= 0; index--) {
    const entry = damageNumbers[index]; const progress = (time - entry.startedAt) / 1100;
    if (progress >= 1) {
      scene.remove(entry.sprite); (entry.sprite.material.map as THREE.Texture | null)?.dispose(); entry.sprite.material.dispose(); damageNumbers.splice(index, 1); continue;
    }
    entry.sprite.position.copy(entry.origin); entry.sprite.position.y += progress * 1.15;
    entry.sprite.position.x += Math.sin(progress * Math.PI) * 0.18;
    entry.sprite.material.opacity = 1 - Math.max(0, (progress - 0.55) / 0.45);
  }
}

function syncSpellProjectiles() {
  for (const event of gameState.spellProjectiles ?? []) {
    if (processedSpellProjectiles.has(event.id)) continue;
    processedSpellProjectiles.add(event.id);
    let points = event.path.map((cell) => worldPosition(cell).add(new THREE.Vector3(0, 1.25, 0)));
    if (event.style === 'boomerang') {
      const from = worldPosition(event.from).add(new THREE.Vector3(0, 1.15, 0));
      const to = worldPosition(event.to).add(new THREE.Vector3(0, 1.15, 0));
      const direction = to.clone().sub(from);
      const perpendicular = new THREE.Vector3(-direction.z, 0, direction.x).normalize().multiplyScalar(Math.max(1.6, direction.length() * 0.45));
      points = Array.from({ length: 21 }, (_, step) => {
        const t = step / 20;
        return from.clone().lerp(to, t).add(perpendicular.clone().multiplyScalar(Math.sin(Math.PI * t))).add(new THREE.Vector3(0, Math.sin(Math.PI * t) * 0.45, 0));
      });
    }
    for (let index = 0; index < event.count; index++) {
      const boomerang = event.style === 'boomerang';
      const material = new THREE.MeshStandardMaterial({ color: boomerang ? 0xd8a24b : 0xc34cff, emissive: boomerang ? 0xffc45c : 0x8a18ff, emissiveIntensity: 3, metalness: boomerang ? 0.75 : 0, roughness: 0.25 });
      const mesh = new THREE.Mesh(boomerang ? new THREE.TorusGeometry(0.22, 0.055, 10, 24, Math.PI * 1.45) : new THREE.SphereGeometry(0.12, 16, 12), material);
      const light = new THREE.PointLight(boomerang ? 0xffb84f : 0xb14cff, 2.4, 3); mesh.add(light);
      mesh.position.copy(points[0]); scene.add(mesh);
      spellProjectileAnimations.push({ mesh, points, startedAt: performance.now(), duration: boomerang ? 1050 : Math.max(900, (points.length - 1) * 480), delay: index * 280, boomerang });
    }
  }
}

function updateSpellProjectiles(time: number) {
  for (let index = spellProjectileAnimations.length - 1; index >= 0; index--) {
    const animation = spellProjectileAnimations[index];
    const elapsed = time - animation.startedAt - animation.delay;
    animation.mesh.visible = elapsed >= 0;
    if (elapsed < 0) continue;
    const progress = Math.min(1, elapsed / animation.duration);
    const segmentFloat = progress * Math.max(1, animation.points.length - 1);
    const segment = Math.min(animation.points.length - 2, Math.floor(segmentFloat));
    const local = segmentFloat - segment;
    animation.mesh.position.lerpVectors(animation.points[segment], animation.points[segment + 1], local);
    animation.mesh.position.y += Math.sin(progress * Math.PI * 8) * 0.08;
    if (animation.boomerang) {
      animation.mesh.rotation.y = progress * Math.PI * 12;
      animation.mesh.rotation.x = Math.PI / 2 + Math.sin(progress * Math.PI * 2) * 0.18;
    }
    if (progress >= 1) {
      scene.remove(animation.mesh); animation.mesh.geometry.dispose(); (animation.mesh.material as THREE.Material).dispose();
      spellProjectileAnimations.splice(index, 1);
    }
  }
}

function updateCharacterMovement(time: number) {
  movementAnimations.forEach((animation, playerId) => {
    const group = dummyGroups.get(playerId);
    if (!group) return;
    const progress = Math.min(1, (time - animation.startedAt) / animation.duration);
    const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    moveAlongAnimationRoute(group.position, animation.from, animation.to, animation.path, eased);
    group.position.y += Math.sin(progress * Math.PI) * 0.1;
    const body = group.children[0];
    body.rotation.z = Math.sin(progress * Math.PI) * 0.055;
    if (progress >= 1) {
      group.position.copy(animation.to);
      body.rotation.z = 0;
      movementAnimations.delete(playerId);
    }
  });
}

function updateCharacterFacing(deltaSeconds: number) {
  dummyGroups.forEach((group, playerId) => {
    if (group.userData.facingSide !== 'negative-z') return;
    let nearestEnemy: THREE.Group | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    dummyGroups.forEach((candidate, candidateId) => {
      if (candidateId === playerId) return;
      const candidateDistance = group.position.distanceToSquared(candidate.position);
      if (candidateDistance < nearestDistance) {
        nearestDistance = candidateDistance;
        nearestEnemy = candidate;
      }
    });
    if (!nearestEnemy) return;
    const dx = nearestEnemy.position.x - group.position.x;
    const dz = nearestEnemy.position.z - group.position.z;
    if (Math.abs(dx) + Math.abs(dz) < 0.001) return;
    // Da Orkk's tusks/face point down local -Z, so turn that side toward the enemy.
    const desiredRotation = Math.atan2(dx, dz) + Math.PI;
    const angleDelta = Math.atan2(Math.sin(desiredRotation - group.rotation.y), Math.cos(desiredRotation - group.rotation.y));
    group.rotation.y += angleDelta * Math.min(1, deltaSeconds * 10);
  });
}

function updateObjectMovement(time: number) {
  objectMovementAnimations.forEach((animation, objectId) => {
    const group = objectGroups.get(objectId);
    if (!group) { objectMovementAnimations.delete(objectId); return; }
    const progress = Math.min(1, (time - animation.startedAt) / animation.duration);
    const travelProgress = animation.collided ? Math.min(1, progress / 0.72) : progress;
    const eased = 1 - Math.pow(1 - travelProgress, 3);
    if (animation.parachute) group.position.lerpVectors(animation.from, animation.to, 1 - Math.pow(1 - progress, 2));
    else moveAlongAnimationRoute(group.position, animation.from, animation.to, animation.path, eased);
    if (animation.collided && progress > 0.72) {
      const bounceProgress = (progress - 0.72) / 0.28;
      const recoil = Math.sin(bounceProgress * Math.PI) * 0.38;
      group.position.x += animation.dx * 1.92 * recoil;
      group.position.z += animation.dy * 1.92 * recoil;
    }
    if (!animation.parachute) {
      group.position.y += Math.sin(progress * Math.PI) * 0.85;
      group.rotation.x = Math.sin(progress * Math.PI) * 0.32;
      group.rotation.z = Math.sin(progress * Math.PI * 2) * 0.18;
    } else group.rotation.y += 0.012;
    if (progress >= 1) {
      group.position.copy(animation.to);
      group.rotation.set(0, 0, 0);
      const parachute = group.getObjectByName('RespawnParachute');
      if (parachute) group.remove(parachute);
      objectMovementAnimations.delete(objectId);
      if (animation.removeOnComplete) {
        scene.remove(group); objectGroups.delete(objectId); lastObjectVisualCells.delete(objectId);
        if (animation.equipPlayerId) {
          const equipped = dummyGroups.get(animation.equipPlayerId)?.getObjectByName('EquippedShield');
          if (equipped) equipped.visible = true;
        }
      }
    }
  });
}

function moveAlongAnimationRoute(position: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, path: THREE.Vector3[] | undefined, progress: number) {
  const validPoint = (point: THREE.Vector3 | undefined): point is THREE.Vector3 => Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y) && Number.isFinite(point!.z);
  const route = [from, ...(path ?? []).filter(validPoint)];
  if (!validPoint(route[route.length - 1]) || !route[route.length - 1].equals(to)) route.push(to);
  const safeProgress = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 1;
  if (route.length < 2 || !validPoint(route[0]) || !validPoint(route[1])) {
    position.copy(validPoint(to) ? to : from);
    return;
  }
  const scaled = safeProgress * (route.length - 1);
  const segment = Math.min(route.length - 2, Math.max(0, Math.floor(scaled)));
  position.lerpVectors(route[segment], route[segment + 1], THREE.MathUtils.clamp(scaled - segment, 0, 1));
}

function updateCameraMovement(deltaSeconds: number) {
  if (cameraKeys.size === 0) return;
  const rotationDirection = (cameraKeys.has('KeyQ') ? 1 : 0) - (cameraKeys.has('KeyE') ? 1 : 0);
  if (rotationDirection !== 0) {
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotationDirection * 1.65 * deltaSeconds);
    rotateCameraPoseAroundPivot(yaw, controls.target);
    levelCameraHorizon();
    camera.updateMatrixWorld(true);
  }
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 0.001) forward.set(0, 0, -1);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const movement = new THREE.Vector3();
  if (cameraKeys.has('KeyW')) movement.add(forward);
  if (cameraKeys.has('KeyS')) movement.sub(forward);
  if (cameraKeys.has('KeyD')) movement.add(right);
  if (cameraKeys.has('KeyA')) movement.sub(right);
  if (movement.lengthSq() === 0) return;
  movement.normalize().multiplyScalar(5 * deltaSeconds);
  const nextTarget = controls.target.clone().add(movement);
  const movementRadius = cameraMovementRadius();
  const boardCenter = boardCenterWorld();
  nextTarget.x = THREE.MathUtils.clamp(nextTarget.x, boardCenter.x - movementRadius, boardCenter.x + movementRadius);
  nextTarget.z = THREE.MathUtils.clamp(nextTarget.z, boardCenter.z - movementRadius, boardCenter.z + movementRadius);
  const appliedMovement = nextTarget.sub(controls.target);
  camera.position.add(appliedMovement);
  controls.target.add(appliedMovement);
}

function cameraMovementRadius() {
  const halfWidth = Math.max(1, visualBoardWidth() - 1) * 0.96;
  const halfHeight = Math.max(1, visualBoardHeight() - 1) * 0.96;
  const boardRadius = Math.max(halfWidth, halfHeight);
  return boardRadius * 4 + 8;
}

function boardCenterWorld(width = visualBoardWidth(), height = visualBoardHeight()) {
  const first = worldPosition({ x: 1, y: 0 });
  const last = worldPosition({ x: width, y: height - 1 });
  return first.add(last).multiplyScalar(.5).setY(.12);
}

function createCell(cell: Cell) {
  const label = cellLabel(cell);
  const nagrand = gameState.boardSize === BOARD_SIZE;
  const lordaeron = gameState.boardSize === LORDAERON_ARENA.height;
  const highGround = (gameState.elevations[label] ?? 0) > 0;
  const ownerOne = nagrand ? ['A4', 'A5'].includes(label) : lordaeron && LORDAERON_ARENA.bases.P1.includes(label);
  const ownerTwo = nagrand ? ['H4', 'H5'].includes(label) : lordaeron && LORDAERON_ARENA.bases.P2.includes(label);
  const ownerThree = lordaeron && LORDAERON_ARENA.bases.P3.includes(label);
  const baseId = (['P1', 'P2', 'P3'] as const).find((id) => LORDAERON_ARENA.bases[id].includes(label));
  const placement = placementState();
  const claimant = placement && baseId ? (Object.entries(placement.claims).find(([, claimedBase]) => claimedBase === baseId)?.[0] as PlayerId | undefined) : undefined;
  const unclaimedPlacementBase = gameState.phase === 'choosing-base-placement' && Boolean(baseId) && placement?.availableBaseIds.includes(baseId!);
  const drawSquare = nagrand ? ['D1', 'E1', 'D8', 'E8'].includes(label) : lordaeron && LORDAERON_ARENA.drawSquares.includes(label);
  const protectedSquare = nagrand ? ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'].includes(label) : lordaeron && LORDAERON_ARENA.highgroundProtected.includes(label);
  const claimedColor = claimant === 'P1' ? 0x145f83 : claimant === 'P2' ? 0x7b2834 : claimant === 'P3' ? 0x66508f : null;
  const color = unclaimedPlacementBase ? 0xc21f35 : claimedColor ?? (ownerOne ? 0x145f83 : ownerTwo ? 0x7b2834 : ownerThree ? 0x66508f : drawSquare ? 0x665a25 : highGround ? 0x285046 : protectedSquare ? 0x1d3d38 : (cell.x + cell.y) % 2 ? 0x17322c : 0x122923);
  const emissive = unclaimedPlacementBase ? 0xff1638 : claimant === 'P1' ? 0x07374f : claimant === 'P2' ? 0x3d0f18 : claimant === 'P3' ? 0x291a45 : ownerOne ? 0x07374f : ownerTwo ? 0x3d0f18 : ownerThree ? 0x291a45 : drawSquare ? 0x292307 : 0x000000;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, highGround ? 0.54 : 0.16, 1.72), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: unclaimedPlacementBase ? 0.85 : 0.35, roughness: 0.72, metalness: 0.15 }));
  mesh.position.copy(worldPosition(cell)); mesh.position.y = highGround ? 0.19 : 0;
  mesh.receiveShadow = true;
  mesh.userData.cell = cell;
  scene.add(mesh); cellMeshes.push(mesh);
}

function createDummy(color: number) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const material = new THREE.MeshStandardMaterial({ color: 0xcbd0c9, roughness: 0.48, metalness: 0.18 });
  const accent = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.35 });
  const add = (geometry: THREE.BufferGeometry, mat: THREE.Material, position: [number, number, number], parent = body) => { const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh; };
  add(new THREE.SphereGeometry(0.28, 20, 16), material, [0, 1.72, 0]);
  add(new THREE.CapsuleGeometry(0.29, 0.68, 8, 16), material, [0, 1.07, 0]);
  add(new THREE.TorusGeometry(0.31, 0.055, 10, 28), accent, [0, 1.34, 0]).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const arm = add(new THREE.CapsuleGeometry(0.095, 0.58, 5, 10), material, [side * 0.42, 1.12, 0]); arm.rotation.z = side * -0.18;
    const leg = add(new THREE.CapsuleGeometry(0.12, 0.68, 5, 10), material, [side * 0.16, 0.43, 0]); leg.rotation.z = side * 0.04;
  }
  const base = add(new THREE.CylinderGeometry(0.52, 0.62, 0.12, 32), accent, [0, 0.12, 0], root);
  base.userData.player = true;
  const targetRing = new THREE.Mesh(
    new THREE.RingGeometry(0.72, 0.88, 48),
    new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
  );
  targetRing.name = 'TargetRing';
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.035;
  targetRing.visible = false;
  root.add(targetRing);
  root.userData.player = true;
  return root;
}

function createWoodenBox() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a542d, roughness: 0.88 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x4b2b18, roughness: 0.94 });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.05, 1.12), wood);
  crate.position.y = 0.61; crate.castShadow = true; crate.receiveShadow = true; root.add(crate);
  for (const side of [-1, 1]) {
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.1), darkWood);
    horizontal.position.set(0, 0.61, side * 0.57); horizontal.castShadow = true; root.add(horizontal);
    const diagonal = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.1, 0.11), darkWood);
    diagonal.position.set(0, 0.61, side * 0.585); diagonal.rotation.z = 0.68 * side; diagonal.castShadow = true; root.add(diagonal);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 1.2), darkWood);
  top.position.y = 1.17; top.castShadow = true; root.add(top);
  return root;
}

function createWoodenPillar() {
  const root = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x68401f, roughness: 0.86 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x352012, roughness: 0.92 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 2.8, 12), wood);
  column.position.y = 1.45; column.castShadow = true; column.receiveShadow = true; root.add(column);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.28, 12), dark);
  base.position.y = 0.14; base.castShadow = true; root.add(base);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.48, 0.34, 12), dark);
  cap.position.y = 2.92; cap.castShadow = true; root.add(cap);
  return root;
}

function createOrkkShieldObject() {
  const root = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x555b5b, roughness: 0.34, metalness: 0.88 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x202525, roughness: 0.48, metalness: 0.8 });
  const shield = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.75, 0.2), iron);
  shield.position.y = 0.96; shield.castShadow = true; root.add(shield);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), dark);
  boss.scale.z = 0.42; boss.position.set(0, 0.98, -0.14); boss.castShadow = true; root.add(boss);
  for (const x of [-0.52, 0, 0.52]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 10), iron);
    spike.rotation.x = -Math.PI / 2; spike.position.set(x, 1.05, -0.35); spike.castShadow = true; root.add(spike);
  }
  return root;
}

function createDaOrkk(playerColor = 0xff5d68) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  root.userData.facingSide = 'negative-z';
  const skin = new THREE.MeshStandardMaterial({ color: 0x477f3b, roughness: 0.75 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x51595a, roughness: 0.35, metalness: 0.86 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x70431f, roughness: 0.9 });
  const tusk = new THREE.MeshStandardMaterial({ color: 0xe2d5ac, roughness: 0.72 });
  const accent = new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.55 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh; };
  add(new THREE.CapsuleGeometry(0.42, 0.75, 8, 18), skin, [0, 1.05, 0]);
  add(new THREE.SphereGeometry(0.34, 20, 16), skin, [0, 1.74, 0]);
  for (const side of [-1, 1]) { const tuskMesh = add(new THREE.ConeGeometry(0.055, 0.28, 10), tusk, [side * 0.19, 1.63, -0.27]); tuskMesh.rotation.x = Math.PI; }
  for (const side of [-1, 1]) { const leg = add(new THREE.CapsuleGeometry(0.15, 0.58, 6, 12), skin, [side * 0.2, 0.38, 0]); leg.rotation.z = side * 0.08; }
  const club = add(new THREE.CylinderGeometry(0.13, 0.19, 1.45, 10), wood, [0.58, 1.15, 0]); club.rotation.z = -0.38;
  const clubHead = add(new THREE.CylinderGeometry(0.25, 0.34, 0.62, 9), wood, [0.81, 1.8, 0]); clubHead.rotation.z = -0.38;
  const equippedShield = createOrkkShieldObject(); equippedShield.name = 'EquippedShield'; equippedShield.scale.setScalar(0.82); equippedShield.position.set(-0.65, 0.12, -0.05); equippedShield.rotation.y = -0.25; body.add(equippedShield);
  add(new THREE.CylinderGeometry(0.58, 0.68, 0.12, 32), accent, [0, 0.1, 0], root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  return root;
}

function createLongHatLogan(playerColor = 0x169bd3) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  root.userData.facingSide = 'negative-z';
  const robe = new THREE.MeshStandardMaterial({ color: 0x182354, roughness: 0.72, metalness: 0.16 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8f79c7, roughness: 0.58 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc79a78, roughness: 0.74 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a321d, roughness: 0.9 });
  const sapphire = new THREE.MeshStandardMaterial({ color: 0x42baff, emissive: 0x087edb, emissiveIntensity: 3.5, roughness: 0.12 });
  const star = new THREE.MeshStandardMaterial({ color: 0xffe99a, emissive: 0xd7a93c, emissiveIntensity: 1.7 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh; };
  add(new THREE.ConeGeometry(0.48, 1.18, 22), robe, [0, 0.68, 0]);
  add(new THREE.SphereGeometry(0.25, 22, 16), skin, [0, 1.57, 0]);
  add(new THREE.CylinderGeometry(0.48, 0.48, 0.08, 28), trim, [0, 1.83, 0]);
  const hat = add(new THREE.ConeGeometry(0.34, 1.42, 24), robe, [0.08, 2.5, 0]); hat.rotation.z = -0.13;
  for (const [x, y, z] of [[-0.23, 0.75, -0.42], [0.17, 1.03, -0.38], [-0.1, 1.28, -0.31], [0.08, 2.35, -0.25], [-0.12, 2.67, -0.18]] as [number, number, number][]) add(new THREE.OctahedronGeometry(0.055, 0), star, [x, y, z]);
  const arm = add(new THREE.CapsuleGeometry(0.08, 0.48, 6, 10), robe, [0.38, 1.15, 0]); arm.rotation.z = 0.48;
  const wand = add(new THREE.CylinderGeometry(0.035, 0.045, 0.86, 12), wood, [0.62, 1.43, -0.03]); wand.rotation.z = -0.42;
  add(new THREE.OctahedronGeometry(0.11, 1), sapphire, [0.8, 1.82, -0.03]);
  add(new THREE.CylinderGeometry(0.56, 0.65, 0.12, 32), new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.65 }), [0, 0.1, 0], root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  return root;
}

function createJohnChrist(playerColor = 0x169bd3) {
  const root = new THREE.Group(); const body = new THREE.Group(); body.name = 'JohnBody'; root.add(body);
  root.userData.facingSide = 'negative-z';
  const white = new THREE.MeshStandardMaterial({ color: 0xf2eee0, roughness: 0.68 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6aa36, roughness: 0.3, metalness: 0.58 });
  const red = new THREE.MeshStandardMaterial({ color: 0x8f1831, roughness: 0.72 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc99b7d, roughness: 0.74 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  add(new THREE.ConeGeometry(0.5, 1.25, 24), white, [0, 0.72, 0]);
  const bulk = new THREE.Group(); bulk.name = 'SpiritBulk'; body.add(bulk);
  add(new THREE.CapsuleGeometry(0.31, 0.48, 7, 16), white, [0, 1.22, 0], bulk);
  for (const side of [-1, 1]) {
    const shoulder = add(new THREE.SphereGeometry(0.19, 16, 12), red, [side * 0.36, 1.34, 0], bulk); shoulder.scale.set(1.3, 0.75, 1);
    const arm = add(new THREE.CapsuleGeometry(0.085, 0.5, 5, 10), white, [side * 0.4, 1.04, 0]);
    arm.name = side < 0 ? 'JohnArmLeft' : 'JohnArmRight';
    arm.rotation.z = side < 0 ? 0.16 : -0.4;
  }
  add(new THREE.SphereGeometry(0.25, 20, 16), skin, [0, 1.73, 0]);
  add(new THREE.CylinderGeometry(0.32, 0.39, 0.09, 24), gold, [0, 1.94, 0]);
  const mitre = add(new THREE.ConeGeometry(0.28, 0.65, 4), white, [0, 2.25, 0]); mitre.rotation.y = Math.PI / 4;
  add(new THREE.BoxGeometry(0.055, 0.34, 0.055), gold, [0, 2.7, 0]);
  add(new THREE.BoxGeometry(0.23, 0.055, 0.055), gold, [0, 2.72, 0]);
  const staff = add(new THREE.CylinderGeometry(0.035, 0.045, 1.65, 12), gold, [0.57, 1.08, 0]); staff.rotation.z = -0.08;
  add(new THREE.SphereGeometry(0.11, 14, 10), gold, [0.64, 1.91, 0]);
  add(new THREE.CylinderGeometry(0.56, 0.65, 0.12, 32), new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.65 }), [0, 0.1, 0], root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  return root;
}

function syncStoicShellHealAnimations() {
  for (const player of Object.values(gameState.players)) {
    if (player.character !== 'john-christ' || player.stoicShellHealedTurn !== gameState.turn) continue;
    const eventId = player.stoicShellHealEventId;
    if (!eventId) continue;
    if (processedStoicShellHeals.has(eventId)) continue;
    processedStoicShellHeals.add(eventId);
    const group = new THREE.Group();
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.72, 3.8, 32, 1, true), beamMaterial);
    beam.position.y = 1.9;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc4d, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.68, 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    const light = new THREE.PointLight(0xffdf58, 7, 5); light.position.y = 1.1;
    group.add(beam, ring, light); group.position.copy(worldPosition(player.position)); scene.add(group);
    stoicShellHealAnimations.push({ group, beam, ring, light, startedAt: performance.now() });
  }
}

function updateStoicShellHealAnimations(time: number) {
  for (let index = stoicShellHealAnimations.length - 1; index >= 0; index--) {
    const animation = stoicShellHealAnimations[index];
    const progress = Math.min(1, (time - animation.startedAt) / 1700);
    const pulse = 0.72 + Math.sin(progress * Math.PI * 5) * 0.12;
    animation.beam.scale.set(pulse, 1, pulse);
    animation.ring.scale.setScalar(0.7 + progress * 1.8);
    (animation.beam.material as THREE.MeshBasicMaterial).opacity = 0.62 * (1 - progress);
    (animation.ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - progress);
    animation.light.intensity = 7 * (1 - progress);
    if (progress < 1) continue;
    scene.remove(animation.group);
    animation.beam.geometry.dispose(); (animation.beam.material as THREE.Material).dispose();
    animation.ring.geometry.dispose(); (animation.ring.material as THREE.Material).dispose();
    stoicShellHealAnimations.splice(index, 1);
  }
}

function createObiWanShinobi(playerColor = 0x169bd3) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const robe = new THREE.MeshStandardMaterial({ color: 0xb8aa8c, roughness: 0.82 });
  const underRobe = new THREE.MeshStandardMaterial({ color: 0x514a40, roughness: 0.88 });
  const cloak = new THREE.MeshStandardMaterial({ color: 0x292d2d, roughness: 0.92, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc69b7d, roughness: 0.72 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x9da4a3, roughness: 0.95 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x343c42, roughness: 0.28, metalness: 0.82 });
  const saberBlue = new THREE.MeshStandardMaterial({ color: 0xa9e8ff, emissive: 0x179cff, emissiveIntensity: 4.5, roughness: 0.08 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // Layered robe and cloak silhouette.
  add(new THREE.ConeGeometry(0.43, 0.92, 20), robe, [0, 0.62, 0]);
  add(new THREE.CapsuleGeometry(0.27, 0.46, 7, 16), underRobe, [0, 1.12, 0]);
  const sash = add(new THREE.TorusGeometry(0.3, 0.055, 8, 24), robe, [0, 0.91, 0]);
  sash.rotation.x = Math.PI / 2;
  const cape = add(new THREE.ConeGeometry(0.48, 1.18, 20, 1, true, 0, Math.PI * 1.25), cloak, [0, 0.84, 0.18]);
  cape.rotation.y = Math.PI * 0.38;

  // Face, grey hair, beard, and a deep hood surrounding the head.
  add(new THREE.SphereGeometry(0.255, 24, 18), skin, [0, 1.68, 0]);
  const hairCap = add(new THREE.SphereGeometry(0.265, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), hair, [0, 1.73, 0]);
  hairCap.rotation.x = -0.06;
  const beard = add(new THREE.ConeGeometry(0.2, 0.28, 18), hair, [0, 1.53, -0.035]);
  beard.rotation.x = Math.PI;
  const hood = add(new THREE.TorusGeometry(0.34, 0.105, 12, 30, Math.PI * 1.5), cloak, [0, 1.7, 0.02]);
  hood.rotation.z = Math.PI * 0.75;

  // Robed arms; the right hand carries an angled lightsaber.
  const leftArm = add(new THREE.CapsuleGeometry(0.095, 0.57, 6, 12), robe, [-0.4, 1.12, 0]);
  leftArm.rotation.z = -0.28;
  const saberArm = add(new THREE.CapsuleGeometry(0.095, 0.55, 6, 12), robe, [0.38, 1.18, -0.01]);
  saberArm.rotation.z = 0.58;
  add(new THREE.SphereGeometry(0.11, 14, 10), skin, [0.55, 0.96, -0.01]);
  const hilt = add(new THREE.CylinderGeometry(0.055, 0.065, 0.38, 16), metal, [0.64, 1.15, -0.01]);
  hilt.rotation.z = -0.52;
  const blade = add(new THREE.CylinderGeometry(0.035, 0.047, 1.38, 18), saberBlue, [0.99, 1.85, -0.01]);
  blade.rotation.z = -0.52;
  const bladeGlow = new THREE.PointLight(0x229dff, 2.8, 3.2);
  bladeGlow.position.set(0.9, 1.65, 0);
  body.add(bladeGlow);

  for (const side of [-1, 1]) {
    const leg = add(new THREE.CapsuleGeometry(0.11, 0.52, 5, 10), underRobe, [side * 0.15, 0.32, 0]);
    leg.rotation.z = side * 0.05;
  }
  const baseMaterial = new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.65, roughness: 0.3, metalness: 0.25 });
  add(new THREE.CylinderGeometry(0.56, 0.65, 0.12, 32), baseMaterial, [0, 0.1, 0], root);
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  targetRing.name = 'TargetRing';
  targetRing.rotation.x = -Math.PI / 2;
  targetRing.position.y = 0.035;
  targetRing.visible = false;
  root.add(targetRing);
  root.userData.player = true;
  return root;
}

function createAxisLabels() {
  const top = worldPosition({ x: 1, y: 0 }).z - 1.2;
  const left = worldPosition({ x: 1, y: 0 }).x - 1.2;
  for (let x = 1; x <= visualBoardWidth(); x++) addLabel(String.fromCharCode(64 + x), worldPosition({ x, y: 0 }).x, top);
  for (let y = 0; y < visualBoardHeight(); y++) addLabel(String(y + 1), left, worldPosition({ x: 1, y }).z);
}

function addLabel(text: string, x: number, z: number) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d')!; context.font = '700 68px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#79ffe1'; context.fillText(text, 64, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.8 }));
  sprite.position.set(x, 0.12, z); sprite.scale.set(0.7, 0.7, 0.7); scene.add(sprite); axisLabels.push(sprite);
}

function rebuildBoardGeometry(width: number, height: number) {
  cellMeshes.splice(0).forEach((mesh) => { scene.remove(mesh); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); });
  axisLabels.splice(0).forEach((label) => { scene.remove(label); label.material.map?.dispose(); label.material.dispose(); });
  boardVisualKey = boardGeometryKey();
  for (let y = 0; y < height; y++) for (let x = 1; x <= width; x++) createCell({ x, y });
  createAxisLabels();
  fitCameraToArena(width, height);
}

function fitCameraToArena(width: number, height: number, force = false) {
  const arenaKey = `${width}x${height}`;
  if (!force && fittedArenaKey === arenaKey) return;
  fittedArenaKey = arenaKey;

  const spanX = Math.max(1, width - 1) * 1.92;
  const spanZ = Math.max(1, height - 1) * 1.92;
  const arenaRadius = Math.hypot(spanX, spanZ) / 2 + 2;
  floor.scale.set(arenaRadius / 12.4, 1, arenaRadius / 12.4);

  const viewingDirection = new THREE.Vector3(1, 1.28, 1).normalize();
  const center = boardCenterWorld(width, height);
  const cameraDistance = fittedCameraDistance(center, viewingDirection, spanX, spanZ);
  controls.target.copy(center);
  camera.position.copy(center).add(viewingDirection.multiplyScalar(cameraDistance));
  controls.maxDistance = Math.max(42, cameraDistance * 2.1);
  controls.update();
}

function fittedCameraDistance(center: THREE.Vector3, viewingDirection: THREE.Vector3, spanX: number, spanZ: number) {
  const margin = 1.25;
  const corners = [
    new THREE.Vector3(center.x - spanX / 2 - margin, 0, center.z - spanZ / 2 - margin),
    new THREE.Vector3(center.x + spanX / 2 + margin, 0, center.z - spanZ / 2 - margin),
    new THREE.Vector3(center.x - spanX / 2 - margin, 0, center.z + spanZ / 2 + margin),
    new THREE.Vector3(center.x + spanX / 2 + margin, 0, center.z + spanZ / 2 + margin),
  ];
  let near = 12;
  let far = 80;
  for (let iteration = 0; iteration < 24; iteration++) {
    const distance = (near + far) / 2;
    camera.position.copy(center).addScaledVector(viewingDirection, distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    const fits = corners.every((corner) => {
      const projected = corner.clone().project(camera);
      return Math.abs(projected.x) <= .9 && Math.abs(projected.y) <= .86;
    });
    if (fits) far = distance;
    else near = distance;
  }
  return far;
}

function worldPosition(cell: Cell) {
  const highGround = (gameState.elevations[cellLabel(cell)] ?? 0) > 0;
  return new THREE.Vector3((cell.x - (visualBoardWidth() + 1) / 2) * 1.92, highGround ? 0.54 : 0.08, (cell.y - (visualBoardHeight() - 1) / 2) * 1.92);
}

function syncBoard() {
  if (boardVisualKey !== boardGeometryKey()) rebuildBoardGeometry(visualBoardWidth(), visualBoardHeight());
  (Object.keys(gameState.players) as PlayerId[]).forEach((id) => {
    const character = gameState.players[id].character;
    let group = dummyGroups.get(id);
    if (!group || group.userData.character !== character) {
      if (group) scene.remove(group);
      const color = id === 'P1' ? 0x169bd3 : id === 'P2' ? 0xff5d68 : 0xa06cff;
      group = character === 'orkk' ? createDaOrkk(color) : character === 'shinobi' ? createObiWanShinobi(color) : character === 'magician' ? createLongHatLogan(color) : character === 'john-christ' ? createJohnChrist(color) : createDummy(color);
      group.userData.character = character;
      dummyGroups.set(id, group); scene.add(group); lastVisualCells.delete(id); movementAnimations.delete(id);
    }
    group.visible = gameState.phase !== 'choosing-base-placement' || Boolean(placementState()?.claims[id]);
    if (!group) return;
    const cell = gameState.players[id].position;
    const target = worldPosition(cell);
    const targetKey = cellLabel(cell);
    const previousKey = lastVisualCells.get(id);
    if (!previousKey) {
      group.position.copy(target);
    } else if (previousKey !== targetKey) {
      const from = group.position.clone();
      from.y = target.y;
      const previousCell = { x: previousKey.charCodeAt(0) - 64, y: Number(previousKey.slice(1)) - 1 };
      const recordedMovement = gameState.players[id].visualMovement;
      const recordedPathMatches = recordedMovement
        && cellLabel(recordedMovement.from) === previousKey
        && recordedMovement.path.length > 0
        && cellLabel(recordedMovement.path[recordedMovement.path.length - 1]) === targetKey;
      const shouldFollowWalkingPath = id === gameState.activePlayerId && (gameState.phase === 'active' || gameState.phase === 'dashing');
      const walkingPath = recordedPathMatches ? recordedMovement.path : shouldFollowWalkingPath ? movementPath(gameState, { ...gameState.players[id], position: previousCell }, cell) : [];
      const visualPath = walkingPath.map(worldPosition);
      const travelSquares = Math.max(1, visualPath.length || distanceFromWorld(from, target));
      movementAnimations.set(id, { from, to: target.clone(), startedAt: performance.now(), duration: 320 + travelSquares * 150, path: visualPath.length > 0 ? visualPath : undefined });
    }
    lastVisualCells.set(id, targetKey);
    const equippedShield = group.getObjectByName('EquippedShield');
    const recallInFlight = gameState.objectPushAnimations.some((event) => event.equipPlayerId === id && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId)));
    if (equippedShield) equippedShield.visible = gameState.players[id].shieldEquipped && !recallInFlight;
    updateSwiftformVisual(group, gameState.players[id].swiftformCanPassEnemies, id === 'P1' ? 0x45c8ff : 0xff5d68);
    updateSpiritFormVisual(group, gameState.players[id].spiritForm);
    updateStoicShellAura(group, gameState.players[id].stoicShell);
    group.traverse((child) => { child.userData.playerId = id; });
  });
  syncCaptureTheFlagVisual();
  const currentObjectIds = new Set(gameState.objects.map((object) => object.id));
  const animatedRemovalIds = new Set(gameState.objectPushAnimations.filter((event) => event.removeOnComplete && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId))).map((event) => event.objectId));
  objectGroups.forEach((group, id) => { if (!currentObjectIds.has(id) && !animatedRemovalIds.has(id)) { scene.remove(group); objectGroups.delete(id); lastObjectVisualCells.delete(id); objectMovementAnimations.delete(id); } });
  gameState.objects.forEach((object) => {
    let group = objectGroups.get(object.id);
    if (!group) { group = object.kind === 'orkk-shield' ? createOrkkShieldObject() : object.kind === 'wall-pillar' ? createWoodenPillar() : createWoodenBox(); objectGroups.set(object.id, group); scene.add(group); }
    const target = worldPosition(object.position);
    const targetKey = cellLabel(object.position);
    const previousKey = lastObjectVisualCells.get(object.id);
    if (!previousKey) group.position.copy(target);
    else if (previousKey !== targetKey) {
      const from = group.position.clone(); from.y = target.y;
      const travelSquares = Math.max(1, distanceFromWorld(from, target));
      objectMovementAnimations.set(object.id, { from, to: target.clone(), startedAt: performance.now(), duration: 380 + travelSquares * 180, collided: false, dx: 0, dy: 0 });
    }
    lastObjectVisualCells.set(object.id, targetKey);
    group.traverse((child) => { child.userData.objectId = object.id; });
  });
  gameState.objectPushAnimations.forEach((event) => {
    if (processedObjectPushAnimations.has(event.id)) return;
    if (event.damage) {
      processedObjectPushAnimations.add(event.id);
      spawnDamageVisual(event.damage.playerId, event.damage.amount, event.damage.collision);
      return;
    }
    if (event.teleport) {
      processedObjectPushAnimations.add(event.id);
      spawnTeleportSquareVisual(event.from);
      spawnTeleportSquareVisual(event.to);
      const group = objectGroups.get(event.objectId);
      if (group) group.position.copy(worldPosition(event.to));
      objectMovementAnimations.delete(event.objectId);
      lastObjectVisualCells.set(event.objectId, cellLabel(event.to));
      return;
    }
    let group = objectGroups.get(event.objectId);
    if (!group && event.removeOnComplete) { group = createOrkkShieldObject(); objectGroups.set(event.objectId, group); scene.add(group); }
    if (!group) return;
    processedObjectPushAnimations.add(event.id);
    const from = worldPosition(event.from); const to = worldPosition(event.to);
    if (event.parachute) {
      from.y += 12;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2d28b, roughness: .82, side: THREE.DoubleSide }));
      canopy.name = 'RespawnParachute'; canopy.position.y = 2.2; canopy.scale.y = .55; group.add(canopy);
    }
    group.position.copy(from);
    const travelSquares = Math.max(1, distance(event.from, event.to));
    objectMovementAnimations.set(event.objectId, { from, to, startedAt: performance.now(), duration: event.parachute ? 2600 : 440 + (event.path?.length ?? travelSquares) * 190, collided: event.collided, dx: event.dx, dy: event.dy, path: event.path?.map(worldPosition), removeOnComplete: event.removeOnComplete, equipPlayerId: event.equipPlayerId, parachute: event.parachute });
    lastObjectVisualCells.set(event.objectId, cellLabel(event.to));
  });
  syncSpellProjectiles();
  syncStoicShellHealAnimations();
}

function createQuestFlag(color: number) {
  const root = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, 1.65, 10), new THREE.MeshStandardMaterial({ color: 0x8b6a3f, roughness: .55, metalness: .35 }));
  pole.position.y = .82; pole.castShadow = true; root.add(pole);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(.72, .48, .035), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .35, roughness: .68, side: THREE.DoubleSide }));
  cloth.position.set(.36, 1.36, 0); cloth.castShadow = true; root.add(cloth);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x8a5b00, emissiveIntensity: .7 }));
  finial.position.y = 1.68; finial.castShadow = true; root.add(finial);
  return root;
}

function syncCaptureTheFlagVisual() {
  const flag = (gameState as GameState & { questPhases?: { captureTheFlag?: { anchor: { x: number; y: number }; carrierIds?: PlayerId[]; carrierId?: PlayerId | null } | null } }).questPhases?.captureTheFlag;
  const carrierIds = flag ? (flag.carrierIds ?? (flag.carrierId ? [flag.carrierId] : [])) : [];
  const key = flag ? `${flag.anchor.x},${flag.anchor.y}:${carrierIds.join(',')}` : 'none';
  if (key !== questFlagVisualKey) {
    questFlagModels.forEach((model) => model.removeFromParent());
    questFlagModels.clear();
    if (flag) {
      questFlagModels.set('ground', createQuestFlag(0xffd166));
      for (const carrierId of carrierIds) {
        const color = carrierId === 'P1' ? 0x45c8ff : carrierId === 'P2' ? 0xff5d68 : 0xa06cff;
        questFlagModels.set(carrierId, createQuestFlag(color));
      }
    }
    questFlagVisualKey = key;
  }
  if (!flag) return;
  const groundFlag = questFlagModels.get('ground');
  if (groundFlag) {
    if (groundFlag.parent !== scene) scene.add(groundFlag);
    groundFlag.position.set((flag.anchor.x - (visualBoardWidth() + 1) / 2) * 1.92, .08, (flag.anchor.y - (visualBoardHeight() - 1) / 2) * 1.92);
  }
  for (const carrierId of carrierIds) {
    const model = questFlagModels.get(carrierId);
    const carrier = dummyGroups.get(carrierId);
    if (!model || !carrier) continue;
    if (model.parent !== carrier) carrier.add(model);
    model.position.set(0, .72, .55);
    model.rotation.set(0, Math.PI, 0);
    model.scale.setScalar(.72);
  }
}

function updateSwiftformVisual(group: THREE.Group, active: boolean, playerColor: number) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (!material.userData.swiftformOriginal) {
        material.userData.swiftformOriginal = {
          transparent: material.transparent,
          opacity: material.opacity,
          depthWrite: material.depthWrite,
          emissive: material.emissive.getHex(),
          emissiveIntensity: material.emissiveIntensity,
        };
      }
      const original = material.userData.swiftformOriginal as { transparent: boolean; opacity: number; depthWrite: boolean; emissive: number; emissiveIntensity: number };
      if (active) {
        material.transparent = true;
        material.opacity = 0.72;
        material.depthWrite = false;
        material.emissive.setHex(playerColor);
        material.emissiveIntensity = 1.15;
      } else {
        material.transparent = original.transparent;
        material.opacity = original.opacity;
        material.depthWrite = original.depthWrite;
        material.emissive.setHex(original.emissive);
        material.emissiveIntensity = original.emissiveIntensity;
      }
      material.needsUpdate = true;
    }
  });
  let glow = group.getObjectByName('SwiftformGlow') as THREE.PointLight | undefined;
  if (!glow) {
    glow = new THREE.PointLight(playerColor, 0, 4.5);
    glow.name = 'SwiftformGlow';
    glow.position.set(0, 1.05, 0);
    group.add(glow);
  }
  glow.color.setHex(playerColor);
  glow.intensity = active ? 4.2 : 0;
}

function updateSpiritFormVisual(group: THREE.Group, active: boolean) {
  const body = group.getObjectByName('JohnBody');
  if (!body) return;
  body.scale.setScalar(active ? 1.13 : 1);
  const bulk = group.getObjectByName('SpiritBulk');
  if (bulk) bulk.scale.set(active ? 1.2 : 1, active ? 1.08 : 1, active ? 1.16 : 1);
  const leftArm = group.getObjectByName('JohnArmLeft');
  const rightArm = group.getObjectByName('JohnArmRight');
  if (leftArm) {
    leftArm.rotation.z = active ? Math.PI / 2 : 0.16;
    leftArm.position.set(-0.57, active ? 1.34 : 1.04, 0);
  }
  if (rightArm) {
    rightArm.rotation.z = active ? -Math.PI / 2 : -0.4;
    rightArm.position.set(0.57, active ? 1.34 : 1.04, 0);
  }
  body.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      if (!material.userData.spiritOriginal) material.userData.spiritOriginal = { transparent: material.transparent, opacity: material.opacity, depthWrite: material.depthWrite, emissive: material.emissive.getHex(), emissiveIntensity: material.emissiveIntensity };
      const original = material.userData.spiritOriginal as { transparent: boolean; opacity: number; depthWrite: boolean; emissive: number; emissiveIntensity: number };
      material.transparent = active || original.transparent; material.opacity = active ? 0.7 : original.opacity; material.depthWrite = active ? false : original.depthWrite;
      material.emissive.setHex(active ? 0xffd84d : original.emissive); material.emissiveIntensity = active ? 1.25 : original.emissiveIntensity; material.needsUpdate = true;
    });
  });
  let glow = group.getObjectByName('SpiritFormGlow') as THREE.PointLight | undefined;
  if (!glow) { glow = new THREE.PointLight(0xffd84d, 0, 5); glow.name = 'SpiritFormGlow'; glow.position.set(0, 1.25, 0); group.add(glow); }
  glow.intensity = active ? 4.8 : 0;
}

function updateStoicShellAura(group: THREE.Group, active: boolean) {
  if (!group.getObjectByName('JohnBody')) return;
  let aura = group.getObjectByName('StoicShellAura') as THREE.Group | undefined;
  if (!aura) {
    aura = new THREE.Group();
    aura.name = 'StoicShellAura';
    aura.position.y = 1.12;
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 32, 24),
      new THREE.MeshBasicMaterial({ color: 0x9c4dff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    shield.scale.y = 1.35;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xc28aff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending });
    const equator = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.022, 10, 48), ringMaterial);
    equator.rotation.x = Math.PI / 2;
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(0.79, 0.022, 10, 48), ringMaterial.clone());
    meridian.rotation.y = Math.PI / 2;
    const light = new THREE.PointLight(0x9c4dff, 3, 4);
    light.name = 'StoicShellAuraLight';
    aura.add(shield, equator, meridian, light);
    group.add(aura);
  }
  aura.visible = active;
  if (!active) aura.scale.setScalar(1);
}

function distanceFromWorld(from: THREE.Vector3, to: THREE.Vector3) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.z - to.z)) / 1.92;
}

function highlightCells() {
  const selected = selection.getSnapshot().context.selection;
  const movementPlayerId = gameState.phase === 'double-jump' ? gameState.doubleJump!.playerId : gameState.activePlayerId;
  const actor = gameState.players[movementPlayerId];
  const activePlayer = gameState.players[gameState.activePlayerId];
  const selectedCard = (selected.kind === 'attack' || selected.kind === 'perk') ? activePlayer.hand.find((card) => card.instanceId === selected.cardInstanceId) : null;
  cellMeshes.forEach((mesh) => {
    const cell = mesh.userData.cell as Cell;
    const playerOnCell = Object.values(gameState.players).find((player) => player.position.x === cell.x && player.position.y === cell.y);
    const objectOnCell = gameState.objects.find((object) => object.position.x === cell.x && object.position.y === cell.y);
    const occupiedByPlayer = Boolean(playerOnCell && playerOnCell.id !== actor.id);
    const occupiedByObject = Boolean(objectOnCell);
    const occupiedByEnemy = occupiedByPlayer || occupiedByObject;
    const specialSteps = gameState.phase === 'double-jump' ? (gameState.doubleJump?.stepsRemaining ?? 0) : (gameState.danceThrough?.stepsRemaining ?? 0);
    const diagonalBlocked = diagonalMovementBlockedByObject(gameState, actor.position, cell);
    const danceValid = (gameState.phase === 'dance-through' || gameState.phase === 'double-jump') && distance(actor.position, cell) === 1 && !diagonalBlocked && (!occupiedByEnemy || specialSteps > 1);
    const shizzleWallBlocked = objectOnCell?.kind === 'wall-pillar' || objectOnCell?.kind === 'orkk-shield';
    const shizzleStepValid = gameState.phase === 'shizzle-move' && distance(actor.position, cell) === 1 && !diagonalBlocked && !shizzleWallBlocked && (!occupiedByObject || (gameState.shizzle?.stepsRemaining ?? 0) > 1) && (!occupiedByPlayer || (gameState.shizzle?.stepsRemaining ?? 0) > 1);
    const regularPath = movementPath(gameState, actor, cell);
    const regularDistance = regularPath.length;
    const spiritRefunds = actor.spiritForm ? regularPath.filter((step) => Object.values(gameState.players).some((candidate) => candidate.id !== actor.id && candidate.position.x === step.x && candidate.position.y === step.y)).length : 0;
    const spiritMovementCost = regularDistance - spiritRefunds;
    const swiftformPassSquare = occupiedByPlayer && actor.swiftformCanPassEnemies && regularDistance < actor.movementRemaining;
    const spiritPassSquare = occupiedByPlayer && actor.spiritForm && spiritMovementCost <= actor.movementRemaining;
    const regularValid = gameState.phase !== 'dance-through' && gameState.phase !== 'double-jump' && !occupiedByObject && (!occupiedByPlayer || swiftformPassSquare || spiritPassSquare) && regularDistance >= 1 && (actor.spiritForm ? spiritMovementCost : regularDistance) <= actor.movementRemaining;
    const force = gameState.forceThrow;
    const forceTarget = force?.targetKind === 'player' ? gameState.players[force.targetId as PlayerId] : gameState.objects.find((object) => object.id === force?.targetId);
    const forceDx = forceTarget ? cell.x - forceTarget.position.x : 0; const forceDy = forceTarget ? cell.y - forceTarget.position.y : 0;
    const awayX = forceTarget ? forceTarget.position.x - gameState.players[force!.casterId].position.x : 0; const awayY = forceTarget ? forceTarget.position.y - gameState.players[force!.casterId].position.y : 0;
    const forceDirectionDistance = Math.max(Math.abs(forceDx), Math.abs(forceDy));
    const forceDirectionLinear = forceDx === 0 || forceDy === 0 || Math.abs(forceDx) === Math.abs(forceDy);
    const forceDirectionValid = gameState.phase === 'choosing-force-throw-direction' && forceDirectionDistance >= 1 && forceDirectionDistance <= (force?.distance ?? 0) && forceDirectionLinear && forceDx * awayX + forceDy * awayY >= 0;
    const magic = gameState.magicHand;
    const magicTarget = magic?.targetKind === 'player' ? gameState.players[magic.targetId as PlayerId] : gameState.objects.find((object) => object.id === magic?.targetId);
    const magicDx = magicTarget ? cell.x - magicTarget.position.x : 0; const magicDy = magicTarget ? cell.y - magicTarget.position.y : 0;
    const magicLinear = magicDx === 0 || magicDy === 0 || Math.abs(magicDx) === Math.abs(magicDy);
    const magicDirectionValid = gameState.phase === 'choosing-magic-hand-direction' && Math.max(Math.abs(magicDx), Math.abs(magicDy)) >= 1 && magicLinear;
    const forceCollisionWarning = forceDirectionValid && Object.values(gameState.players).some((player) => player.position.x === cell.x && player.position.y === cell.y);
    const kykTarget = gameState.phase === 'choosing-kyk-direction' && gameState.forceThrow?.targetKind && gameState.forceThrow.targetId
      ? (gameState.forceThrow.targetKind === 'object' ? gameState.objects.find((object) => object.id === gameState.forceThrow!.targetId) : gameState.players[gameState.forceThrow.targetId as PlayerId])
      : null;
    const kykDirectionValid = Boolean(kykTarget) && kykDirectionAllowed(gameState.players[gameState.forceThrow!.casterId].position, kykTarget!.position, cell);
    const arkane = gameState.arkaneArow;
    const arkaneValid = gameState.phase === 'choosing-arkane-arow-target' && Boolean(arkane) && arkaneArowPath(gameState, gameState.players[arkane!.casterId], cell, arkane!.range).length > 0;
    const teleportCaster = gameState.phase === 'choosing-preparation-teleport' ? gameState.players[gameState.preparation!.casterId]
      : gameState.phase === 'choosing-blink-teleport' ? gameState.players[gameState.pendingAttack!.defenderId]
      : gameState.phase === 'choosing-portal-target' ? gameState.players[(gameState as any).portal.casterId as PlayerId]
      : null;
    const preparationValid = gameState.phase === 'choosing-preparation-teleport' && Boolean(teleportCaster) && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && hasLineOfSight(gameState, teleportCaster!.position, cell);
    const shizzle = gameState.shizzle;
    const shizzleDx = cell.x - actor.position.x; const shizzleDy = cell.y - actor.position.y;
    const shizzleDistance = Math.max(Math.abs(shizzleDx), Math.abs(shizzleDy));
    const shizzleLinear = shizzleDx === 0 || shizzleDy === 0 || Math.abs(shizzleDx) === Math.abs(shizzleDy);
    const shizzlePath = shizzleLinear ? Array.from({ length: shizzleDistance }, (_, index) => ({ x: actor.position.x + Math.sign(shizzleDx) * (index + 1), y: actor.position.y + Math.sign(shizzleDy) * (index + 1) })) : [];
    const shizzleDiagonalBlocked = shizzlePath.some((pathCell, index) => diagonalMovementBlockedByObject(gameState, index === 0 ? actor.position : shizzlePath[index - 1], pathCell));
    const shizzleDestinationValid = gameState.phase === 'choosing-shizzle-destination' && shizzleDistance >= 1 && shizzleDistance <= (shizzle?.stepsRemaining ?? 0) && shizzleLinear && !shizzleDiagonalBlocked && !occupiedByPlayer && !occupiedByObject && !shizzlePath.some((pathCell) => gameState.objects.some((object) => (object.kind === 'wall-pillar' || object.kind === 'orkk-shield') && object.position.x === pathCell.x && object.position.y === pathCell.y));
    const boxTeleportValid = Boolean(selectedTestObjectId) && !occupiedByPlayer && !occupiedByObject;
    const activeHigh = (gameState.elevations[cellLabel(activePlayer.position)] ?? 0) > 0;
    const targetHigh = (gameState.elevations[cellLabel(cell)] ?? 0) > 0;
    const protectedLabels = gameState.boardSize === LORDAERON_ARENA.height ? LORDAERON_ARENA.highgroundProtected : ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'];
    const protectedFromHigh = activeHigh && !targetHigh && protectedLabels.includes(cellLabel(cell)) && distance(activePlayer.position, cell) > 1;
    const attackableObject = Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && objectOnCell!.kind !== 'orkk-shield';
    const attackTargetValid = selected.kind === 'attack' && gameState.phase === 'active' && ((Boolean(playerOnCell) && playerOnCell!.id !== activePlayer.id) || attackableObject)
      && distance(activePlayer.position, cell) <= activePlayer.attackRange && hasLineOfSight(gameState, activePlayer.position, cell) && !protectedFromHigh;
    const selectedPerkTargetValid = selected.kind === 'perk' && gameState.phase === 'active' && (
      (selectedCard?.cardId === 'force-throw' && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && distance(activePlayer.position, cell) <= 4)
      || (selectedCard?.cardId === 'force-pull' && ((Boolean(playerOnCell) && playerOnCell!.id !== activePlayer.id && hasLineOfSight(gameState, activePlayer.position, cell)) || (Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar')) && distance(activePlayer.position, cell) <= 4)
      || (selectedCard?.cardId === 'arkane-arow' && arkaneArowPath(gameState, activePlayer, cell, 3).length > 0)
      || (selectedCard?.cardId === 'kyk' && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && distance(activePlayer.position, cell) === 1)
    );
    const forceTargetValid = gameState.phase === 'choosing-force-throw-target' && Boolean(force) && distance(gameState.players[force!.casterId].position, cell) <= force!.targetRange
      && ((Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar') || (force!.level >= 3 && Boolean(playerOnCell) && playerOnCell!.id !== force!.casterId && hasLineOfSight(gameState, gameState.players[force!.casterId].position, cell)));
    const pullTargetValid = gameState.phase === 'choosing-force-pull-target' && Boolean(gameState.forcePull) && distance(gameState.players[gameState.forcePull!.casterId].position, cell) <= gameState.forcePull!.targetRange
      && ((Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar') || (Boolean(playerOnCell) && playerOnCell!.id !== gameState.forcePull!.casterId && hasLineOfSight(gameState, gameState.players[gameState.forcePull!.casterId].position, cell)));
    const magicTargetValid = gameState.phase === 'choosing-magic-hand-target' && Boolean(magic)
      && hasLineOfSight(gameState, gameState.players[magic!.casterId].position, cell) && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar';
    const arcaneTargetValid = gameState.phase === 'choosing-arcane-missle-target' && Boolean(gameState.arcaneMissle) && Boolean(playerOnCell) && playerOnCell!.id !== gameState.arcaneMissle!.casterId
      && Boolean(arcaneMisslePath(gameState, gameState.players[gameState.arcaneMissle!.casterId], playerOnCell!, gameState.arcaneMissle!.level));
    const chainTargetValid = gameState.phase === 'choosing-chain-lightning-target' && Boolean(gameState.chainLightning) && Boolean(playerOnCell) && playerOnCell!.id !== gameState.chainLightning!.casterId
      && distance(gameState.players[gameState.chainLightning!.casterId].position, cell) <= gameState.players[gameState.chainLightning!.casterId].attackRange && hasLineOfSight(gameState, gameState.players[gameState.chainLightning!.casterId].position, cell);
    const fireball = (gameState as any).fireball as { casterId: PlayerId } | undefined;
    const fireballTargetValid = gameState.phase === 'choosing-fireball-target' && Boolean(fireball) && Boolean(playerOnCell) && playerOnCell!.id !== fireball!.casterId
      && distance(gameState.players[fireball!.casterId].position, cell) <= 3 && hasLineOfSight(gameState, gameState.players[fireball!.casterId].position, cell);
    const armTargetValid = gameState.phase === 'choosing-arm-da-wiz-target' && Boolean(gameState.armDaWiz) && objectOnCell?.kind === 'orkk-shield' && objectOnCell.ownerId === gameState.armDaWiz!.casterId;
    const kykTargetValid = gameState.phase === 'choosing-kyk-target' && Boolean(force) && ((Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar') || (Boolean(playerOnCell) && playerOnCell!.id !== force!.casterId)) && distance(gameState.players[force!.casterId].position, cell) === 1;
    const targetSquareValid = attackTargetValid || selectedPerkTargetValid || forceTargetValid || pullTargetValid || magicTargetValid || arcaneTargetValid || chainTargetValid || fireballTargetValid || armTargetValid || kykTargetValid;
    const valid = (selected.kind === 'move' && (danceValid || shizzleStepValid || regularValid)) || forceDirectionValid || magicDirectionValid || kykDirectionValid || arkaneValid || preparationValid || shizzleDestinationValid || boxTeleportValid || targetSquareValid;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(forceCollisionWarning ? 0xff2638 : targetSquareValid ? 0xffb52e : kykDirectionValid ? 0xffb52e : arkaneValid ? 0xffb52e : boxTeleportValid ? 0x45c8ff : valid ? 0x19d3a2 : 0x000000); material.emissiveIntensity = forceCollisionWarning ? 0.9 : targetSquareValid ? 0.68 : kykDirectionValid ? 0.7 : arkaneValid ? 0.62 : boxTeleportValid ? 0.7 : valid ? 0.38 : 0;
  });
  updateTargetHighlights(performance.now());
}

function updateTargetHighlights(time: number) {
  const selected = selection.getSnapshot().context.selection;
  const attacker = gameState.players[gameState.activePlayerId];
  const canTarget = selected.kind === 'attack' && gameState.phase === 'active' && canLocalAct(attacker.id);
  const selectedAttack = selected.kind === 'attack' ? attacker.hand.find((card) => card.instanceId === selected.cardInstanceId) : null;
  const pull = gameState.forcePull;
  const canPullTarget = gameState.phase === 'choosing-force-pull-target' && Boolean(pull) && canLocalAct(pull!.casterId);
  const canArmTarget = gameState.phase === 'choosing-arm-da-wiz-target' && Boolean(gameState.armDaWiz) && canLocalAct(gameState.armDaWiz!.casterId);
  const canKykTarget = gameState.phase === 'choosing-kyk-target' && Boolean(gameState.forceThrow) && canLocalAct(gameState.forceThrow!.casterId);
  const arcane = gameState.arcaneMissle;
  const canArcaneTarget = gameState.phase === 'choosing-arcane-missle-target' && Boolean(arcane) && canLocalAct(arcane!.casterId);
  const chain = gameState.chainLightning;
  const canChainTarget = gameState.phase === 'choosing-chain-lightning-target' && Boolean(chain) && canLocalAct(chain!.casterId);
  const magic = gameState.magicHand;
  const canMagicTarget = gameState.phase === 'choosing-magic-hand-target' && Boolean(magic) && canLocalAct(magic!.casterId);
  dummyGroups.forEach((group, playerId) => {
    const target = gameState.players[playerId];
    const attackerHigh = (gameState.elevations[cellLabel(attacker.position)] ?? 0) > 0;
    const targetHigh = (gameState.elevations[cellLabel(target.position)] ?? 0) > 0;
    const protectedLabels = gameState.boardSize === LORDAERON_ARENA.height ? LORDAERON_ARENA.highgroundProtected : ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'];
    const protectedFromHigh = attackerHigh && !targetHigh && protectedLabels.includes(cellLabel(target.position)) && distance(attacker.position, target.position) > 1;
    const validAttack = canTarget && playerId !== attacker.id && distance(attacker.position, target.position) <= attacker.attackRange && hasLineOfSight(gameState, attacker.position, target.position) && !protectedFromHigh;
    const pullCaster = pull ? gameState.players[pull.casterId] : null;
    const validPull = canPullTarget && playerId !== pull!.casterId && distance(pullCaster!.position, target.position) <= pull!.targetRange && hasLineOfSight(gameState, pullCaster!.position, target.position);
    const validArcane = canArcaneTarget && playerId !== arcane!.casterId && Boolean(arcaneMisslePath(gameState, gameState.players[arcane!.casterId], target, arcane!.level));
    const chainCaster = chain ? gameState.players[chain.casterId] : null;
    const validChain = canChainTarget && playerId !== chain!.casterId && distance(chainCaster!.position, target.position) <= chainCaster!.attackRange && hasLineOfSight(gameState, chainCaster!.position, target.position);
    const magicCaster = magic ? gameState.players[magic.casterId] : null;
    const validMagic = canMagicTarget && magic!.level >= 3 && playerId !== magic!.casterId && distance(magicCaster!.position, target.position) <= magicCaster!.attackRange && hasLineOfSight(gameState, magicCaster!.position, target.position);
    const valid = validAttack || validPull || validArcane || validChain || validMagic;
    const ring = group.getObjectByName('TargetRing') as THREE.Mesh | undefined;
    if (!ring) return;
    ring.visible = valid;
    if (valid) {
      const pulse = 1 + Math.sin(time * 0.006) * 0.08;
      ring.scale.setScalar(pulse);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.68 + Math.sin(time * 0.006) * 0.22;
    }
  });
  objectGroups.forEach((group, objectId) => {
    const object = gameState.objects.find((entry) => entry.id === objectId);
    const validShield = canArmTarget && object?.kind === 'orkk-shield' && object.ownerId === gameState.armDaWiz!.casterId;
    const validKykObject = canKykTarget && Boolean(object) && object!.kind !== 'wall-pillar' && distance(object!.position, gameState.players[gameState.forceThrow!.casterId].position) === 1;
    const validMagicObject = canMagicTarget && Boolean(object) && object!.kind !== 'wall-pillar' && distance(object!.position, gameState.players[magic!.casterId].position) <= gameState.players[magic!.casterId].attackRange && hasLineOfSight(gameState, gameState.players[magic!.casterId].position, object!.position);
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      child.material.emissive.set(validShield || validKykObject || validMagicObject ? 0xffb52e : 0x000000);
      child.material.emissiveIntensity = validShield || validKykObject || validMagicObject ? 0.55 : 0;
    });
  });
  renderer.domElement.style.cursor = cameraGrab ? 'grabbing' : canTarget || canPullTarget || canArmTarget || canKykTarget || canArcaneTarget || canChainTarget || canMagicTarget ? 'crosshair' : 'grab';
}

function onBoardClick(event: PointerEvent) {
  if (event.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const selected = selection.getSnapshot().context.selection;
  if (selectedTestObjectId) {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) {
      const objectId = selectedTestObjectId; selectedTestObjectId = null;
      dispatch({ type: 'debug-teleport-object', playerId: gameState.activePlayerId, objectId, to: cellHit.object.userData.cell });
    }
  } else if (gameState.phase === 'choosing-base-placement') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'place-character', playerId: gameState.activePlayerId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-preparation-teleport') {
    const objectId = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectId) dispatch({ type: 'preparation-teleport', playerId: gameState.preparation!.casterId, objectId });
  } else if (gameState.phase === 'choosing-blink-teleport') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'blink-teleport', playerId: gameState.pendingAttack!.defenderId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-arcane-missle-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (playerHit) dispatch({ type: 'arcane-missle-target', playerId: gameState.arcaneMissle!.casterId, targetId: playerHit });
  } else if (gameState.phase === 'choosing-fireball-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (playerHit) dispatch({ type: 'fireball-target', playerId: (gameState as any).fireball.casterId, targetId: playerHit });
  } else if (gameState.phase === 'choosing-portal-target') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'portal-teleport', playerId: (gameState as any).portal.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-chain-lightning-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (playerHit) dispatch({ type: 'chain-lightning-target', playerId: gameState.chainLightning!.casterId, targetId: playerHit });
  } else if (gameState.phase === 'choosing-magic-hand-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'magic-hand-target', playerId: gameState.magicHand!.casterId, targetKind: 'object', targetId: objectHit });
  } else if (gameState.phase === 'choosing-magic-hand-direction') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'magic-hand-direction', playerId: gameState.magicHand!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-shizzle-destination') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'shizzle-destination', playerId: gameState.shizzle!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-force-throw-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'force-throw-target', playerId: gameState.forceThrow!.casterId, targetKind: 'object', targetId: objectHit });
    else if (playerHit) dispatch({ type: 'force-throw-target', playerId: gameState.forceThrow!.casterId, targetKind: 'player', targetId: playerHit });
  } else if (gameState.phase === 'choosing-force-pull-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'force-pull-target', playerId: gameState.forcePull!.casterId, targetKind: 'object', targetId: objectHit });
    else if (playerHit) dispatch({ type: 'force-pull-target', playerId: gameState.forcePull!.casterId, targetKind: 'player', targetId: playerHit });
  } else if (gameState.phase === 'choosing-force-throw-direction') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'force-throw-direction', playerId: gameState.forceThrow!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-arkane-arow-target') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'arkane-arow-target', playerId: gameState.arkaneArow!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-arm-da-wiz-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'arm-da-wiz-target', playerId: gameState.armDaWiz!.casterId, objectId: objectHit });
  } else if (gameState.phase === 'choosing-kyk-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (objectHit || playerHit) dispatch({ type: 'kyk-target', playerId: gameState.forceThrow!.casterId, objectId: objectHit ?? playerHit! });
  } else if (gameState.phase === 'choosing-kyk-direction') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'kyk-direction', playerId: gameState.forceThrow!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-boomerang-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (playerHit) dispatch({ type: 'boomerang-target', playerId: gameState.boomerang!.casterId, targetId: playerHit });
  } else if (selected.kind === 'perk') {
    const casterId = gameState.activePlayerId;
    const selectedInstance = gameState.players[casterId].hand.find((card) => card.instanceId === selected.cardInstanceId);
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (selectedInstance?.cardId === 'force-throw' && objectHit) {
      dispatch({ type: 'play-perk', playerId: casterId, cardInstanceId: selected.cardInstanceId, destination: 'direct' });
      dispatch({ type: 'force-throw-target', playerId: casterId, targetKind: 'object', targetId: objectHit });
    } else if (selectedInstance?.cardId === 'force-pull' && (objectHit || playerHit)) {
      dispatch({ type: 'play-perk', playerId: casterId, cardInstanceId: selected.cardInstanceId, destination: 'direct' });
      dispatch({ type: 'force-pull-target', playerId: casterId, targetKind: objectHit ? 'object' : 'player', targetId: objectHit ?? playerHit! });
    } else if (selectedInstance?.cardId === 'arkane-arow') {
      const cellHit = hits.find((hit) => hit.object.userData.cell);
      if (cellHit) {
        dispatch({ type: 'play-perk', playerId: casterId, cardInstanceId: selected.cardInstanceId, destination: 'direct' });
        dispatch({ type: 'arkane-arow-target', playerId: casterId, to: cellHit.object.userData.cell });
      }
    } else if (selectedInstance?.cardId === 'kyk' && objectHit) {
      dispatch({ type: 'play-perk', playerId: casterId, cardInstanceId: selected.cardInstanceId, destination: 'direct' });
      dispatch({ type: 'kyk-target', playerId: casterId, objectId: objectHit });
    }
  } else if (selected.kind === 'move') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'move', playerId: gameState.phase === 'double-jump' ? gameState.doubleJump!.playerId : gameState.phase === 'shizzle-move' ? gameState.shizzle!.casterId : gameState.activePlayerId, to: cellHit.object.userData.cell });
  } else if (selected.kind === 'attack') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (playerHit) dispatch({ type: 'attack', playerId: gameState.activePlayerId, cardInstanceId: selected.cardInstanceId, targetId: playerHit, targetKind: 'player' });
    else if (objectHit) {
      const object = gameState.objects.find((entry) => entry.id === objectHit);
      if (object && object.kind !== 'wall-pillar' && object.kind !== 'orkk-shield' && window.confirm(`Attack ${object.name} at ${cellLabel(object.position)}? If the resolved Attack Value is above 0, it will be destroyed.`)) dispatch({ type: 'attack', playerId: gameState.activePlayerId, cardInstanceId: selected.cardInstanceId, targetId: objectHit, targetKind: 'object' });
    }
  }
}

function onCameraRotateStart(event: PointerEvent) {
  if (event.button !== 2) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const surfaceHit = raycaster.intersectObjects(cellMeshes, false)[0];
  const pivot = surfaceHit?.point.clone() ?? raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
  if (!pivot) return;

  const center = boardCenterWorld();
  const halfWidth = Math.max(1, visualBoardWidth() - 1) * .96 + 2;
  const halfHeight = Math.max(1, visualBoardHeight() - 1) * .96 + 2;
  pivot.x = THREE.MathUtils.clamp(pivot.x, center.x - halfWidth, center.x + halfWidth);
  pivot.z = THREE.MathUtils.clamp(pivot.z, center.z - halfHeight, center.z + halfHeight);
  cameraGrab = {
    pointerId: event.pointerId,
    pivot,
    lastX: event.clientX,
    lastY: event.clientY,
    focusDistance: THREE.MathUtils.clamp(camera.position.distanceTo(controls.target), controls.minDistance, controls.maxDistance),
  };
  renderer.domElement.setPointerCapture(event.pointerId);
  renderer.domElement.style.cursor = 'grabbing';
  event.preventDefault();
}

function onCameraGrabMove(event: PointerEvent) {
  if (!cameraGrab || cameraGrab.pointerId !== event.pointerId) return;
  const dx = event.clientX - cameraGrab.lastX;
  cameraGrab.lastX = event.clientX;
  cameraGrab.lastY = event.clientY;
  if (dx === 0) return;

  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -dx * .005);
  rotateCameraPoseAroundPivot(yaw, cameraGrab.pivot);
  levelCameraHorizon();
  camera.updateMatrixWorld(true);
  event.preventDefault();
}

function rotateCameraPoseAroundPivot(rotation: THREE.Quaternion, pivot: THREE.Vector3) {
  camera.position.sub(pivot).applyQuaternion(rotation).add(pivot);
  camera.quaternion.premultiply(rotation).normalize();
}

function levelCameraHorizon() {
  const forward = camera.getWorldDirection(new THREE.Vector3());
  camera.up.set(0, 1, 0);
  camera.lookAt(camera.position.clone().add(forward));
}

function finishCameraGrab(event: PointerEvent) {
  if (!cameraGrab || cameraGrab.pointerId !== event.pointerId) return;
  const direction = camera.getWorldDirection(new THREE.Vector3());
  controls.target.copy(camera.position).addScaledVector(direction, cameraGrab.focusDistance);
  cameraGrab = null;
  levelCameraHorizon();
  controls.update();
  if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  renderer.domElement.style.cursor = 'grab';
}

function onBoardDoubleClick(event: MouseEvent) {
  if (gameState.phase !== 'active') return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(scene.children, true);
  const objectId = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
  const object = gameState.objects.find((entry) => entry.id === objectId && entry.name === 'Wooden Box');
  if (!object) return;
  selectedTestObjectId = object.id; selection.send({ type: 'CLEAR' }); renderUI();
  notify('Wooden Box selected. Click an empty Square to teleport it.');
}

function resize() {
  const width = boardEl.clientWidth; const height = boardEl.clientHeight;
  if (width < 1 || height < 1) return;
  renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
  fitCameraToArena(visualBoardWidth(), visualBoardHeight());
}
