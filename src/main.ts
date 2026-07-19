import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Client, type Room } from '@colyseus/sdk';
import { assign, createActor, setup } from 'xstate';
import { LORDAERON_ARENA } from '../shared/arenas.ts';
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
  effectiveMoveRange,
  hasLineOfSight,
  movementPath,
  kykDirectionAllowed,
  pinnedCount,
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
      <div class="arena-frame"><div id="board"></div><div class="character-trait-panel" id="characterTraitPanel"></div><div class="character-status-panel status-p1" id="statusP1"></div><div class="character-status-panel status-p2" id="statusP2"></div><div class="opponent-hand-panel"><span id="opponentHandLabel">OPPONENT HAND</span><div class="opponent-hand" id="opponentHand"></div></div><div class="spell-echo-bars" id="spellEchoBars"></div><button class="direct-perk hidden" id="directPerkButton">Play Perk Directly · Level 1</button><button class="direct-perk hidden" id="mindTricksFinishButton">Use Mind Tricks without revealing</button><button class="direct-perk finish-dance hidden" id="finishDanceButton">Finish Dance Through</button><div class="prompt" id="prompt"></div></div>
      <div class="command-deck">
        <div class="identity"><span>ACTIVE UNIT</span><strong id="activeName"></strong><small id="activePosition"></small><div class="piles" id="piles"></div><button id="freeMoveButton">Free Move + Draw Card</button><div class="finishers"><div class="finisher-control"><button id="guardButton">Guard</button><div class="finisher-tooltip">A Finishing move to end the turn. Draw one card, discard one card, then immediately end turn.</div></div><div class="finisher-control"><button id="dashButton">Dash</button><div class="finisher-tooltip">A Finishing move to end the turn. Discard one card and move Again. Can't use Actions during this movement.</div></div></div></div>
        <div class="hand" id="hand"></div>
        <div class="turn-actions"><button id="endTurn">END TURN <kbd>SPACE</kbd></button><button class="quiet" id="leaveGame">Leave match</button></div>
      </div>
      <aside class="battle-log"><span>COMBAT FEED</span><div id="log"></div></aside>
    </section>
    <div class="choice-modal hidden" id="flurryModal"></div>
    <div class="choice-modal hidden" id="armDaWizModal"></div>
    <div class="choice-modal hidden" id="manaModal"></div>
    <div class="choice-modal hidden" id="focusModal"></div>
    <div class="choice-modal combat-reveal-modal hidden" id="combatRevealModal"></div>
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

document.querySelector('#hotseat')!.addEventListener('click', () => showFormatSelect('hotseat'));
document.querySelector('#createRoom')!.addEventListener('click', () => showFormatSelect('online'));
document.querySelector('#joinRoom')!.addEventListener('click', () => connectOnline('join'));
document.querySelector('#freeMoveButton')!.addEventListener('click', () => dispatch({ type: 'free-move', playerId: actingPlayer() }));
document.querySelector('#guardButton')!.addEventListener('click', () => dispatch({ type: 'guard', playerId: actingPlayer() }));
document.querySelector('#dashButton')!.addEventListener('click', () => dispatch({ type: 'dash', playerId: actingPlayer() }));
document.querySelector('#directPerkButton')!.addEventListener('click', () => {
  const selected = selection.getSnapshot().context.selection;
  if (selected.kind === 'perk') dispatch({ type: 'play-perk', playerId: actingPlayer(), cardInstanceId: selected.cardInstanceId, destination: 'direct' });
});
document.querySelector('#finishDanceButton')!.addEventListener('click', () => dispatch({ type: 'end-dance', playerId: actingPlayer() }));
document.querySelector('#mindTricksFinishButton')!.addEventListener('click', () => dispatch({ type: 'mind-tricks-finish', playerId: actingPlayer() }));
document.querySelector('#endTurn')!.addEventListener('click', () => dispatch({ type: 'end-turn', playerId: actingPlayer() }));
document.querySelector('#leaveGame')!.addEventListener('click', () => location.reload());
window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && selectedTestObjectId) {
    event.preventDefault(); selectedTestObjectId = null; renderUI(); notify('Wooden Box movement cancelled.'); return;
  }
  if (gameState.combatReveal) {
    if (event.code === 'Space' || event.code === 'Escape') event.preventDefault();
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
});

function isWaitingForResolvedCardTarget() {
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

function showHotseatCharacterSelect(format: GameFormat) {
  const panel = byId('onlineWaiting');
  panel.innerHTML = `<p class="eyebrow">HOTSEAT TEST · ${format === 'ffa' ? 'LORDAERON ARENA' : 'NAGRAND ARENA'}</p><h2>Choose your Character</h2><div class="character-choices"><button data-hotseat-character="shinobi"><strong>Obi Wan Shinobi</strong></button><button data-hotseat-character="orkk"><strong>Da Orkk</strong></button><button data-hotseat-character="magician"><strong>Long Hat Logan</strong></button></div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-character]').forEach((button) => button.addEventListener('click', () => startHotseat(button.dataset.hotseatCharacter as 'shinobi' | 'orkk' | 'magician', format)));
}

function startHotseat(character: 'shinobi' | 'orkk' | 'magician', format: GameFormat) {
  mode = 'hotseat';
  localSeat = null;
  gameState = createHotseatTestState(false, character, format === 'ffa' ? 3 : 2);
  boardVisualKey = '';
  fittedArenaKey = '';
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  byId('connection').innerHTML = '<span></span> Hotseat match';
  renderAll();
  requestAnimationFrame(resize);
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
      gameState = normalizeOnlineState(state);
      boardVisualKey = '';
      fittedArenaKey = '';
      selection.send({ type: 'CLEAR' });
      lobby.classList.add('hidden'); game.classList.remove('hidden'); renderAll(); requestAnimationFrame(resize);
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
    player.attackRange ??= player.character === 'orkk' ? 1 : player.character === 'magician' ? 3 : 2;
    player.movementRemaining ??= 0;
    player.actionsRemaining ??= 2;
    player.swiftformMoveBonus ??= 0;
    player.grimoireMoveBonus ??= 0;
    player.pinnedStacks ??= 0;
    player.hand ??= [];
    player.deck ??= [];
    player.discard ??= [];
    player.spellEcho ??= [null, null, null];
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
      <button data-character="orkk" ${mayChoose ? '' : 'disabled'}><strong>Da Orkk</strong><small>Rage · Shield · Melee</small></button>
      <button data-character="shinobi" ${mayChoose ? '' : 'disabled'}><strong>Obi Wan Shinobi</strong><small>Lightsaber · Mobility · Range 2</small></button>
      <button data-character="magician" ${mayChoose ? '' : 'disabled'}><strong>Long Hat Logan</strong><small>Classic Wizardry · Mana · Range 3</small></button>
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
  byId('phaseLabel').textContent = gameState.phase === 'defending' ? 'DEFENCE RESPONSE' : gameState.phase === 'finished' ? 'MATCH COMPLETE' : 'SELECT AN ACTION';
  byId('activeName').textContent = actor.name;
  byId('activePosition').textContent = `POSITION ${cellLabel(actor.position)} · MOVE ${actor.movementRemaining}/${effectiveMoveRange(actor)} · ACTIONS ${actor.actionsRemaining}/2`;
  byId('piles').innerHTML = `<span>DECK <b>${actor.deck.length}</b></span><span>HAND <b>${actor.hand.length}</b></span><span>DISCARD <b>${actor.discard.length}</b></span>`;
  renderFighter('P1', 'p1Stats');
  renderFighter('P2', 'p2Stats');
  byId('p3Stats').classList.toggle('hidden', !gameState.players.P3);
  if (gameState.players.P3) renderFighter('P3', 'p3Stats');
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
  byId('log').innerHTML = gameState.log.slice(0, 7).map((line) => `<p>${escapeHtml(line)}</p>`).join('');
  const select = selection.getSnapshot().context.selection;
  const prompt = byId('prompt');
  prompt.textContent = gameState.phase === 'defending' ? `${gameState.players[gameState.pendingAttack!.defenderId].name}: defend or take the hit` : gameState.phase === 'flurry-offer' ? `${gameState.players[gameState.flurry!.defenderId].name}: resolve Flurry of Defensive Strikes` : gameState.phase === 'choosing-flurry-enemy-discard' ? `${gameState.players[gameState.flurry!.attackerId].name}: discard ${gameState.flurry!.remainingEnemyDiscards} cards` : gameState.phase === 'choosing-force-disarm-discard' ? `${gameState.players[gameState.forceDisarm!.targetId].name}: choose an Attack card to discard` : gameState.phase === 'choosing-end-discard' ? `Hand limit: discard ${actor.hand.length - 5} more card${actor.hand.length - 5 === 1 ? '' : 's'}` : gameState.phase === 'choosing-dash-discard' ? 'Select a card to discard · Escape to cancel Dash' : gameState.phase.startsWith('choosing-') ? 'Select one card from your hand to discard' : gameState.phase === 'dance-through' ? `Dance Through: ${gameState.danceThrough?.stepsRemaining ?? 0} one-square steps remain` : gameState.phase === 'dashing' ? `Dash: spend ${actor.movementRemaining} movement · Escape to cancel before moving` : select.kind === 'move' ? 'Select an empty highlighted square' : select.kind === 'attack' ? 'Select the enemy dummy · Escape to cancel' : select.kind === 'perk' ? 'Play directly or select your Spell Echo position 1 · Escape to cancel' : '';
  if (gameState.phase === 'double-jump') prompt.textContent = `Double Jump: ${gameState.doubleJump?.stepsRemaining ?? 0} one-square steps remain`;
  if (gameState.phase === 'choosing-end-discard' && actor.hand.length <= 5) prompt.textContent = 'Hand limit satisfied · discard more eligible cards or select End Turn';
  if (gameState.phase === 'choosing-force-throw-target') prompt.textContent = 'Force Throw: select a valid target · Escape to cancel';
  if (gameState.phase === 'choosing-force-throw-direction') prompt.textContent = 'Force Throw: select the linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-force-pull-target') prompt.textContent = 'Force Pull: select an enemy or Object · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-target') prompt.textContent = 'KYK: select an adjacent Object · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-direction') prompt.textContent = 'KYK: select a highlighted legal push direction · Escape to cancel';
  if (gameState.phase === 'choosing-arkane-arow-target') prompt.textContent = `ARKANE AROW: select a highlighted Square within Range ${gameState.arkaneArow!.range} · Escape to cancel`;
  if (gameState.phase === 'choosing-arm-da-wiz-choice') prompt.textContent = 'Arm da Wiz: choose Recall or Create Shield · Escape to cancel';
  if (gameState.phase === 'choosing-arm-da-wiz-target') prompt.textContent = 'Arm da Wiz: select your in-range Shield · Escape to cancel';
  if (gameState.phase === 'choosing-mind-tricks-discard') prompt.textContent = `Mind Tricks: reveal up to ${gameState.mindTricks!.maxDiscards} card${gameState.mindTricks!.maxDiscards === 1 ? '' : 's'} · Escape cancels before the first reveal`;
  if (gameState.phase === 'choosing-mind-tricks-enemy-discard') prompt.textContent = `Mind Tricks: discard ${gameState.mindTricks!.enemyDiscardsRemaining} card${gameState.mindTricks!.enemyDiscardsRemaining === 1 ? '' : 's'}`;
  if (gameState.phase === 'choosing-preparation-teleport') prompt.textContent = 'Preparation: select any empty Square to teleport · Escape to cancel';
  if (gameState.phase === 'choosing-blink-teleport') prompt.textContent = 'Blink: select any empty Square to teleport';
  if (gameState.phase === 'choosing-blink-discard') prompt.textContent = 'Blink: choose one eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-base-placement') prompt.textContent = `${gameState.players[gameState.activePlayerId].name}: choose a Square on a bright red unclaimed base`;
  if (gameState.phase === 'choosing-preparation-discard') prompt.textContent = 'Preparation: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-snowball-discard') prompt.textContent = 'Snowball Effect: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-grimoire-discard') prompt.textContent = `Grimoire Cleanse: discard ${gameState.pendingAttack?.grimoireDiscardsRemaining ?? 0} more Card(s)`;
  if (gameState.phase === 'choosing-arcane-missle-target') prompt.textContent = 'Arcane Missle: select a valid enemy · Escape to cancel';
  if (gameState.phase === 'choosing-fireball-target') prompt.textContent = 'Fireball: select an enemy within Range 3 · Escape to cancel';
  if (gameState.phase === 'choosing-portal-target') prompt.textContent = 'Portal: select any empty Square · Escape to cancel';
  if (gameState.phase === 'choosing-chain-lightning-target') prompt.textContent = 'Chain Lightning: select an enemy in range and line of sight · Escape to cancel';
  if (gameState.phase === 'choosing-magic-hand-target') prompt.textContent = `Magic Hand: select ${gameState.magicHand!.level >= 3 ? 'an Object or enemy' : 'an Object'} in range · Escape to cancel`;
  if (gameState.phase === 'choosing-magic-hand-direction') prompt.textContent = 'Magic Hand: select any linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-shizzle-destination') prompt.textContent = `Shizzle: select an empty Square in a direct line up to ${gameState.shizzle!.stepsRemaining} Squares away · Escape to cancel`;
  if (gameState.phase === 'shizzle-move') prompt.textContent = `Shizzle Consume: ${gameState.shizzle!.stepsRemaining} one-Square moves remain${gameState.shizzle!.started ? '' : ' · Escape to cancel before moving'}`;
  if (selectedTestObjectId) prompt.textContent = 'WOODEN BOX SELECTED · click an empty highlighted Square · Escape to cancel';
  prompt.classList.toggle('visible', Boolean(prompt.textContent));
  byId('directPerkButton').classList.toggle('hidden', select.kind !== 'perk');
  const choosingMindTricks = gameState.phase === 'choosing-mind-tricks-discard';
  byId('mindTricksFinishButton').classList.toggle('hidden', !choosingMindTricks);
  byId('mindTricksFinishButton').textContent = choosingMindTricks && (gameState.mindTricks?.discarded ?? 0) > 0 ? 'Finish Mind Tricks selection' : 'Use Mind Tricks without revealing';
  byId('finishDanceButton').classList.toggle('hidden', gameState.phase !== 'dance-through' || Boolean(gameState.danceThrough?.enemyUnderfoot));
  (byId('freeMoveButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || actor.freeMoveUsed || !canLocalAct(actor.id);
  (byId('guardButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || !canLocalAct(actor.id);
  (byId('dashButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || actor.hand.length === 0 || !canLocalAct(actor.id);
  (byId('endTurn') as HTMLButtonElement).disabled = !['active', 'dashing', 'choosing-end-discard'].includes(gameState.phase) || (gameState.phase === 'choosing-end-discard' && actor.hand.length > 5) || !canLocalAct(actor.id);
  if (((actor.movementRemaining > 0 && gameState.phase === 'active') || gameState.phase === 'dashing' || gameState.phase === 'dance-through' || gameState.phase === 'double-jump' || gameState.phase === 'shizzle-move') && select.kind === 'none') selection.send({ type: 'SELECT_MOVE' });
  highlightCells();
  scheduleLayoutSafetyCheck();
}

function renderFighter(id: PlayerId, elementId: string) {
  const player = gameState.players[id];
  const hpPercent = player.hp / player.maxHp * 100;
  const orkkIndicators = player.character === 'orkk' ? `<div class="header-statuses"><span title="Rage: +1 Attack Value per stack; consumed on Attack, or lose 1 at turn end.">&#128293; ${player.rageStacks}</span><span title="${player.shieldEquipped ? '+1 Defence Value to Defend Cards.' : 'Shield is unequipped and exists as a Board obstacle.'}">&#128737; ${player.shieldEquipped ? 'EQUIPPED' : 'UNEQUIPPED'}</span></div>` : '';
  const mana = player.character === 'magician' ? `<div class="mana-storage" title="Classic Wizardry Mana: ${player.manaPoints}/3">${[1, 2, 3].map((point) => `<i class="${point <= player.manaPoints ? 'filled' : ''}"></i>`).join('')}<small>${player.manaMode === 'consume' ? 'CONSUME' : 'GENERATE'}</small></div>` : '';
  const title = player.character === 'magician' ? ' · THE MAGICIAN' : '';
  byId(elementId).innerHTML = `<div><span>${id === 'P1' ? 'PLAYER 01' : id === 'P2' ? 'PLAYER 02' : 'PLAYER 03'}${title}</span><strong>${player.name}</strong></div><div class="hp-copy"><b>${player.hp}</b> / ${player.maxHp} HP</div><div class="hp-track"><i style="width:${hpPercent}%"></i></div>${mana}${orkkIndicators}`;
}

function renderCharacterTraits() {
  const player = gameState.players.P1;
  if (player.character === 'magician') {
    byId('characterTraitPanel').innerHTML = `<span>LONG HAT LOGAN · TRAIT</span><div class="trait-row"><div class="trait-icon" tabindex="0">✦<span class="trait-tooltip"><b>Classic Wizardry</b>Generate 1 Mana after resolving an Attack or Perk spell, up to 3. At 3 Mana, Logan may Consume it at the start of his turn to enable advanced spell effects.</span></div></div>`;
    return;
  }
  if (player.character === 'orkk') {
    const rage = player.rageStacks > 0 ? `<div class="trait-icon lightsaber-active" tabindex="0">🔥<em>${player.rageStacks}</em><span class="trait-tooltip"><b>Rage</b>Attack Cards gain +1 Attack Value per stack. All stacks are consumed by an Attack Card; otherwise remove 1 at turn end.</span></div>` : '';
    const shield = player.shieldEquipped ? `<div class="trait-icon highground-active" tabindex="0">🛡<span class="trait-tooltip"><b>Iron Shield Equipped</b>Da Orkk's Defend Cards gain +1 Defence Value.</span></div>` : '';
    byId('characterTraitPanel').innerHTML = `<span>DA ORKK · TRAIT / BUFFS</span><div class="trait-row"><div class="trait-icon" tabindex="0">👊<span class="trait-tooltip"><b>Rage</b>Gain 1 Rage whenever Da Orkk takes damage during enemy turns. Remove 1 Rage at the end of Da Orkk's turn.</span></div>${rage}${shield}</div>`;
    return;
  }
  byId('characterTraitPanel').innerHTML = '';
}

function renderCharacterStatuses() {
  (['P1', 'P2'] as PlayerId[]).forEach((playerId) => {
    const player = gameState.players[playerId];
    const panel = byId(playerId === 'P1' ? 'statusP1' : 'statusP2');
    const stacks = pinnedCount(player);
    const headacheInHand = player.hand.filter((card) => card.cardId === 'headache').length;
    const headacheInDiscard = player.discard.filter((card) => card.cardId === 'headache').length;
    const exhaustInHand = player.hand.filter((card) => card.cardId === 'exhaust').length;
    const exhaustStored = player.deck.concat(player.discard).filter((card) => card.cardId === 'exhaust').length;
    const doubleRageIcon = player.doubleRageUntilEnemyTurnEnd ? `<div class="status-icon double-rage-status" tabindex="0">×2<span class="status-tooltip"><strong>Double! · Rage</strong>Da Orkk receives doubled Rage Stacks until the end of the attacking Player's turn.</span></div>` : '';
    const pinnedIcon = stacks > 0 ? `<div class="status-icon pinned-status" tabindex="0">🦵<i></i><b>${stacks}</b><span class="status-tooltip"><strong>Pinned</strong>Movement decreased by 1 per Pinned Card (current: ${stacks}). Remove 1 Pinned Card from Hand at the end of turn.</span></div>` : '';
    const handHeadacheIcon = headacheInHand > 0 ? `<div class="status-icon headache-status in-hand" tabindex="0">🤕${headacheInHand > 1 ? `<b>${headacheInHand}</b>` : ''}<span class="status-tooltip"><strong>Headache · Hand</strong>${headacheInHand} Headache Card${headacheInHand === 1 ? '' : 's'} currently filling this player's Hand. Filled red while active in Hand.</span></div>` : '';
    const discardHeadacheIcon = headacheInDiscard > 0 ? `<div class="status-icon headache-status in-discard" tabindex="0">🤕${headacheInDiscard > 1 ? `<b>${headacheInDiscard}</b>` : ''}<span class="status-tooltip"><strong>Headache · Discard</strong>${headacheInDiscard} Headache Card${headacheInDiscard === 1 ? '' : 's'} currently in this player's Discard. Filled orange while discarded.</span></div>` : '';
    const handExhaustIcon = exhaustInHand > 0 ? `<div class="status-icon exhaust-status in-hand" tabindex="0">🥵${exhaustInHand > 1 ? `<b>${exhaustInHand}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Hand</strong>Cards have -1 Attack and Defend Value per Exhaust. During combat, one may be Removed for a -3 modifier instead.</span></div>` : '';
    const storedExhaustIcon = exhaustStored > 0 ? `<div class="status-icon exhaust-status in-discard" tabindex="0">🥵${exhaustStored > 1 ? `<b>${exhaustStored}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Stored</strong>${exhaustStored} Exhaust Card${exhaustStored === 1 ? '' : 's'} in this player's Deck or Discard.</span></div>` : '';
    const arcaneAttackIcon = player.character === 'magician' && player.arcaneBoltAttackBonus > 0 ? `<div class="status-icon arcane-attack-status" tabindex="0">✦<b>+${player.arcaneBoltAttackBonus}</b><span class="status-tooltip"><strong>Arcane Bolt · Empowered</strong>Attack Cards have +${player.arcaneBoltAttackBonus} ATT until the end of this turn.</span></div>` : '';
    const icons = `${doubleRageIcon}${arcaneAttackIcon}${pinnedIcon}${handHeadacheIcon}${discardHeadacheIcon}${handExhaustIcon}${storedExhaustIcon}`;
    panel.classList.toggle('hidden', !icons);
    panel.innerHTML = icons ? `<span>${player.name.toUpperCase()} · STATUS</span><div class="status-row">${icons}</div>` : '';
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
    if (viewerId !== requiredTarget) {
      byId('hand').innerHTML = `<div class="drone-placeholder">Waiting for ${escapeHtml(gameState.players[requiredTarget].name)} to discard an Attack card.</div>`;
      return;
    }
    const attacks = viewer.hand.filter((instance) => cardDefinition(instance).kind === 'attack');
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
    const playableAction = card.kind === 'attack' ? viewer.actionsRemaining > 0 : card.kind === 'perk' ? viewer.actionsRemaining > 0 && !viewer.perkUsed : card.kind === 'status' ? viewer.actionsRemaining > 0 && card.canRemoveAsAction === true : false;
    const mindTricksReveal = gameState.phase === 'choosing-mind-tricks-discard';
    const unavailableMindTricksReveal = mindTricksReveal && (Boolean(instance.revealedToOpponent) || Boolean(gameState.mindTricks?.revealedInstanceIds.includes(instance.instanceId)));
    const cannotOverstackDiscard = !mindTricksReveal && choosingDiscard && (card.cannotBeDiscarded || (gameState.phase === 'choosing-blink-discard' && instance.cardId === 'pinned') || (gameState.phase === 'choosing-end-discard' && card.kind === 'status' && card.canDiscardForHandLimit !== true));
    const disabled = !canLocalAct(viewerId) || gameState.phase === 'finished' || Boolean(cannotOverstackDiscard) || unavailableMindTricksReveal || (!choosingDiscard && (!playableAction || gameState.phase !== 'active'));
    const interactionCopy = mindTricksReveal ? ' Click to reveal this card and keep it in Hand.' : choosingDiscard ? ' Click to confirm this discard.' : '';
    const typeLabel = card.kind === 'status' ? (card.canRemoveAsAction ? 'STATUS · CLICK TO REMOVE FOR 1 ACTION' : 'STATUS · ACTIVE IN HAND') : card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE';
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
    const canChooseManaBlast = viewerId === defender.id && canLocalAct(defender.id);
    modal.classList.toggle('hidden', !canChooseManaBlast);
    if (!canChooseManaBlast) { modal.innerHTML = ''; return; }
    modal.innerHTML = `<div class="choice-dialog"><span>ATTACK FOLLOW-UP</span><h2>Mana Blast</h2><p>Discard one eligible Card to prevent the attacking Logan from gaining Mana, or refuse to discard.</p><div class="choice-cards">${defender.hand.map((instance) => { const card = cardDefinition(instance); return `<button data-mana-blast-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><strong>${escapeHtml(card.name)}</strong><small>${card.cannotBeDiscarded ? 'Cannot be discarded' : 'Discard this Card · No Mana gained'}</small></button>`; }).join('')}</div><button class="choice-decline" id="manaBlastRefuse">Refuse to discard · Grant Mana</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-mana-blast-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'mana-blast-discard', playerId: defender.id, cardInstanceId: button.dataset.manaBlastDiscard! })));
    modal.querySelector('#manaBlastRefuse')?.addEventListener('click', () => dispatch({ type: 'mana-blast-refuse', playerId: defender.id }));
    return;
  }
  const canChoose = gameState.phase === 'flurry-offer' && flurry && viewerId === flurry.defenderId && canLocalAct(viewerId);
  modal.classList.toggle('hidden', !canChoose);
  if (!canChoose || !flurry) { modal.innerHTML = ''; return; }
  const defender = gameState.players[flurry.defenderId];
  modal.innerHTML = `<div class="choice-dialog"><span>DEFENCE FOLLOW-UP</span><h2>Flurry of Defensive Strikes</h2><p>Discard one card from your Hand to force ${escapeHtml(gameState.players[flurry.attackerId].name)} to discard two cards.</p><div class="choice-cards">${defender.hand.map((instance) => { const card = cardDefinition(instance); return `<button data-flurry-pay="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><strong>${escapeHtml(card.name)}</strong><small>${card.cannotBeDiscarded ? 'Cannot be discarded' : 'Discard this card'}</small></button>`; }).join('')}</div><button class="choice-decline" id="flurryDecline">Do not activate</button></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-flurry-pay]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'flurry-pay', playerId: viewerId, cardInstanceId: button.dataset.flurryPay! })));
  document.querySelector('#flurryDecline')!.addEventListener('click', () => dispatch({ type: 'flurry-decline', playerId: viewerId }));
}

function renderArmDaWizModal() {
  const modal = byId('armDaWizModal');
  const arm = gameState.armDaWiz;
  const visible = gameState.phase === 'choosing-arm-da-wiz-choice' && Boolean(arm) && canLocalAct(arm!.casterId);
  modal.classList.toggle('hidden', !visible);
  if (!visible || !arm) { modal.innerHTML = ''; return; }
  modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Arm da Wiz</h2><p>Recall an Iron Shield within Range ${arm.range}, or create and instantly equip a replacement when the old Shield is destroyed or outside Range.</p><div class="choice-cards"><button id="armWizRecall" ${arm.canRecall ? '' : 'disabled'}><strong>Recall Shield</strong><small>${arm.canRecall ? 'Select an in-range Shield on the Board' : 'No Shield is within recall Range'}</small></button><button id="armWizCreate" ${arm.canCreate ? '' : 'disabled'}><strong>Create Shield</strong><small>${arm.canCreate ? 'Create and equip a new Iron Shield' : 'Your existing Shield can be recalled'}</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
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
  modal.innerHTML = `<div class="choice-dialog"><span>${focus.toUpperCase()} FOCUS · CHOOSE TENTH CARD</span><h2>${escapeHtml(player.name)}</h2><div class="choice-cards">${choices.map((cardId) => { const card = cardDefinition({ instanceId: '', cardId }); const valueLabel = card.kind === 'attack' ? 'ATTACK VALUE' : 'DEFEND VALUE'; return `<button data-focus-card="${cardId}"><strong>${escapeHtml(card.name)}</strong><b>${card.value} ${valueLabel}</b><small>${escapeHtml(card.effectText ?? '')}</small></button>`; }).join('')}</div></div>`;
  modal.querySelectorAll<HTMLButtonElement>('[data-focus-card]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'choose-focus-card', playerId, cardId: button.dataset.focusCard as any })));
}

function renderActionQuestPanel() {
  const state = gameState as GameState & { questPhases?: { actionDamageByPlayer: Partial<Record<PlayerId, number>>; currentQuest: { id: string; announcedRound: number; endsAfterRound: number; progress: Partial<Record<PlayerId, number>> } | null; usedQuestIds: string[] } };
  const questState = state.questPhases;
  const current = questState?.currentQuest;
  const panel = byId('actionQuestPanel');
  if (!current) {
    const nextRound = gameState.turn <= 1 ? 1 : Math.ceil((gameState.turn - 1) / 10) * 10 + 1;
    panel.innerHTML = `<span>ACTION QUEST</span><strong>Next Quest: Round ${nextRound}</strong><small>${questState?.usedQuestIds.length ?? 0} of ${ACTION_QUEST_POOL.length} Quests completed</small>`;
    return;
  }
  const remaining = Math.max(0, current.endsAfterRound - gameState.turn + 1);
  const definition = ACTION_QUEST_POOL.find((quest) => quest.id === current.id);
  const rewardCardId = current.id === 'damage-contest' ? 'fireball' : current.id === 'rabbit-run' ? 'portal' : current.id === 'provocateur' ? 'vicious-mockery' : null;
  const rewardCard = rewardCardId ? cardDefinition({ instanceId: '', cardId: rewardCardId as any }) : null;
  const highest = Math.max(1, ...Object.values(gameState.players).map((player) => current.progress[player.id] ?? 0));
  panel.innerHTML = `<span>ACTION QUEST · ROUND ${current.announcedRound}</span><strong>${escapeHtml(definition?.name ?? current.id)}</strong><small>${escapeHtml(definition?.condition ?? '')}</small>${rewardCard ? `<button class="quest-reward-card ${rewardCard.kind}" data-quest-reward-preview="${rewardCard.id}"><span>REWARD</span><strong>${escapeHtml(rewardCard.name)}</strong><small>${escapeHtml(rewardCard.effectText ?? '')}</small></button>` : `<small>Reward: ${escapeHtml(definition?.reward ?? 'None')}</small>`}<small>${remaining} Round${remaining === 1 ? '' : 's'} remaining</small><div>${Object.values(gameState.players).map((player) => { const score = current.progress[player.id] ?? 0; const color = player.id === 'P1' ? '#45c8ff' : player.id === 'P2' ? '#ff5d68' : '#a06cff'; return `<p><i style="background:${color}"></i><span>${escapeHtml(player.name)}<u><em style="width:${score / highest * 100}%;background:${color}"></em></u></span><b>${score}</b></p>`; }).join('')}</div>`;
  panel.querySelector<HTMLElement>('[data-quest-reward-preview]')?.addEventListener('pointerenter', (event) => showCardPreview((event.currentTarget as HTMLElement).dataset.questRewardPreview!));
  panel.querySelector<HTMLElement>('[data-quest-reward-preview]')?.addEventListener('pointerleave', hideCardPreview);
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
    phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE THREE · DECK REFINEMENT</span><h2>${escapeHtml(player.name)}</h2><p>Choose a Card currently in your Deck, then Duplicate or Remove it.${winner ? ' You may choose the destination of a duplicate.' : ' A duplicate must be shuffled into your Deck.'}</p><div class="choice-cards">${player.deck.map((instance) => { const card = cardDefinition(instance); return `<button class="phase-three-card"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.effectText ?? '')}</small><em data-phase-op="duplicate" data-instance="${instance.instanceId}">Duplicate</em><em data-phase-op="remove" data-instance="${instance.instanceId}">Remove</em></button>`; }).join('')}</div></div>`;
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
  const opponentId: PlayerId = viewerId === 'P1' ? 'P2' : 'P1';
  const selected = selection.getSnapshot().context.selection;
  byId('spellEchoBars').innerHTML = ([viewerId, opponentId] as PlayerId[]).map((ownerId) => {
    const owner = gameState.players[ownerId];
    const slots = owner.spellEcho.map((instance, index) => {
      const position = index + 1;
      const perk = instance ? cardDefinition(instance) : null;
      const canPlace = ownerId === viewerId && selected.kind === 'perk' && position === 1;
      const canUse = ownerId === viewerId && selected.kind !== 'perk' && Boolean(instance) && owner.actionsRemaining > 0 && !owner.perkUsed && gameState.phase === 'active' && canLocalAct(ownerId);
      const tooltip = perk ? [perk.levelEffects?.slice(0, position).map((effect, index) => `Level ${index + 1}: ${effect}`).join('\n'), perk.effectText].filter(Boolean).join('\n') : `Empty Spell Echo position ${position}`;
      return `<button class="echo-slot ${instance ? 'filled' : ''} ${canPlace ? 'can-place' : ''}" title="${escapeHtml(tooltip ?? '')}" data-echo-owner="${ownerId}" data-echo-position="${position}" ${perk ? `data-echo-preview="${perk.id}"` : ''} ${(canPlace || canUse) ? '' : 'disabled'}><b>${position}</b>${perk ? `<span>${escapeHtml(perk.name)}</span><small>LV ${position}</small>` : '<span>EMPTY</span>'}</button>`;
    }).join('');
    return `<section class="spell-echo ${ownerId === 'P1' ? 'blue' : 'red'} ${ownerId === viewerId ? 'own-echo' : 'opponent-echo'}"><label>${owner.name.toUpperCase()}<br>SPELL ECHO</label><div>${slots}</div></section>`;
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
  const opponentId: PlayerId = viewerId === 'P1' ? 'P2' : 'P1';
  const opponent = gameState.players[opponentId];
  const panel = document.querySelector<HTMLElement>('.opponent-hand-panel')!;
  panel.classList.toggle('align-left', opponentId === 'P1');
  panel.classList.toggle('align-right', opponentId === 'P2');
  byId('opponentHandLabel').textContent = `${opponent.name.toUpperCase()} · ${opponent.hand.length} CARD${opponent.hand.length === 1 ? '' : 'S'}`;
  byId('opponentHand').innerHTML = opponent.hand.map((instance) => {
    const card = cardDefinition(instance);
    if (!instance.revealedToOpponent && card.kind !== 'status') return `<div class="opponent-card card-back" title="Unrevealed opponent card"><i></i><b>G</b></div>`;
    return `<div class="opponent-card revealed ${card.kind}" data-preview-card="${card.id}" title="Revealed: ${escapeHtml(card.name)} — value ${card.value}"><span>${card.kind}</span><strong>${escapeHtml(card.name)}</strong><b>${card.value}</b></div>`;
  }).join('');
  document.querySelectorAll<HTMLElement>('[data-preview-card]').forEach((element) => {
    element.addEventListener('mouseenter', () => showCardPreview(element.dataset.previewCard!));
    element.addEventListener('mouseleave', hideCardPreview);
  });
}

function showCardPreview(cardId: string) {
  if (gameState.combatReveal) return;
  const card = CARDS.find((candidate) => candidate.id === cardId);
  if (!card) return;
  const preview = byId('cardHoverPreview');
  preview.innerHTML = `<article class="card ${card.kind}"><span>${card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></article>`;
  preview.classList.remove('hidden');
}

function cardRulesText(card: ReturnType<typeof cardDefinition>): string {
  const levels = card.levelEffects?.map((effect, index) => `Level ${index + 1}: ${effect}`).join('\n');
  const fallback = card.kind === 'attack' ? `Deal combat damage with ${card.value} Attack Value.` : `Defend with ${card.value} Defence Value.`;
  return [levels, card.effectText, card.consumeText].filter(Boolean).join('\n') || fallback;
}

function cardRulesHtml(card: ReturnType<typeof cardDefinition>): string {
  const levels = card.levelEffects?.map((effect, index) => `Level ${index + 1}: ${effect}`).join('\n') ?? '';
  const effect = card.effectText
    ? (/^\s*\*?consume\s*:/i.test(card.effectText) ? `<em class="consume-effect">${escapeHtml(card.effectText.replace(/^\s*\*/, ''))}</em>` : escapeHtml(card.effectText))
    : '';
  const consume = card.consumeText ? `<em class="consume-effect">${escapeHtml(card.consumeText)}</em>` : '';
  if (levels || effect || consume) return [escapeHtml(levels), effect, consume].filter(Boolean).join('\n');
  return escapeHtml(cardRulesText(card));
}

function hideCardPreview() {
  document.getElementById('cardHoverPreview')?.classList.add('hidden');
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
controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
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
const objectMovementAnimations = new Map<string, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; collided: boolean; dx: number; dy: number; path?: THREE.Vector3[]; removeOnComplete?: boolean; equipPlayerId?: PlayerId }>();
const processedObjectPushAnimations = new Set<string>();
const processedSpellProjectiles = new Set<string>();
const spellProjectileAnimations: { mesh: THREE.Mesh; points: THREE.Vector3[]; startedAt: number; duration: number; delay: number }[] = [];
const impactAnimations = new Map<PlayerId, number>();
const damageNumbers: { sprite: THREE.Sprite; startedAt: number; origin: THREE.Vector3 }[] = [];
const lastVisualCells = new Map<PlayerId, string>();
const movementAnimations = new Map<PlayerId, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number }>();
let boardVisualKey = '';
let fittedArenaKey = '';
const visualBoardWidth = () => gameState.boardSize === LORDAERON_ARENA.height ? LORDAERON_ARENA.width : gameState.boardSize;
const visualBoardHeight = () => gameState.boardSize;
const placementState = () => (gameState as GameState & { lordaeronPlacement?: { availableBaseIds: ('P1' | 'P2' | 'P3')[]; claims: Partial<Record<PlayerId, 'P1' | 'P2' | 'P3'>> } }).lordaeronPlacement;
const boardGeometryKey = () => `${visualBoardWidth()}x${visualBoardHeight()}-${JSON.stringify(placementState()?.claims ?? {})}`;
rebuildBoardGeometry(visualBoardWidth(), visualBoardHeight());
dummyGroups.set('P1', createDaOrkk(0x169bd3));
dummyGroups.set('P2', createObiWanShinobi(0xff5d68));
scene.add(dummyGroups.get('P1')!, dummyGroups.get('P2')!);

renderer.domElement.addEventListener('pointerdown', onBoardClick);
renderer.domElement.addEventListener('dblclick', onBoardDoubleClick);
renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('resize', resize);
new ResizeObserver(() => resize()).observe(boardEl);
resize();
const cameraKeys = new Set<string>();
window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.code === 'KeyC') {
    const centeredTarget = worldPosition({ x: 1, y: 0 });
    centeredTarget.y = controls.target.y;
    const offset = centeredTarget.clone().sub(controls.target);
    camera.position.add(offset);
    controls.target.copy(centeredTarget);
    controls.update();
    cameraKeys.clear();
    event.preventDefault();
    return;
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) {
    cameraKeys.add(event.code);
    event.preventDefault();
  }
});
window.addEventListener('keyup', (event) => cameraKeys.delete(event.code));
window.addEventListener('blur', () => cameraKeys.clear());
let previousFrameTime = performance.now();
renderer.setAnimationLoop((time) => {
  const deltaSeconds = Math.min((time - previousFrameTime) / 1000, 0.05);
  previousFrameTime = time;
  updateCameraMovement(deltaSeconds);
  controls.update();
  updateTargetHighlights(time);
  updateCharacterMovement(time);
  updateObjectMovement(time);
  updateSpellProjectiles(time);
  updateCharacterFacing(deltaSeconds);
  dummyGroups.forEach((group, id) => {
    const body = group.children[0];
    const moving = movementAnimations.has(id);
    body.position.y = moving ? Math.abs(Math.sin(time * 0.012)) * 0.08 : Math.sin(time * 0.002 + (id === 'P1' ? 0 : 2)) * 0.035;
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
    const points = event.path.map((cell) => worldPosition(cell).add(new THREE.Vector3(0, 1.25, 0)));
    for (let index = 0; index < event.count; index++) {
      const material = new THREE.MeshStandardMaterial({ color: 0xc34cff, emissive: 0x8a18ff, emissiveIntensity: 3 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), material);
      const light = new THREE.PointLight(0xb14cff, 2.4, 3); mesh.add(light);
      mesh.position.copy(points[0]); scene.add(mesh);
      spellProjectileAnimations.push({ mesh, points, startedAt: performance.now(), duration: Math.max(900, (points.length - 1) * 480), delay: index * 280 });
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
    group.position.lerpVectors(animation.from, animation.to, eased);
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
    if (animation.path && animation.path.length > 0) {
      const route = [animation.from, ...animation.path];
      const scaled = eased * (route.length - 1);
      const segment = Math.min(route.length - 2, Math.floor(scaled));
      group.position.lerpVectors(route[segment], route[segment + 1], scaled - segment);
    } else group.position.lerpVectors(animation.from, animation.to, eased);
    if (animation.collided && progress > 0.72) {
      const bounceProgress = (progress - 0.72) / 0.28;
      const recoil = Math.sin(bounceProgress * Math.PI) * 0.38;
      group.position.x += animation.dx * 1.92 * recoil;
      group.position.z += animation.dy * 1.92 * recoil;
    }
    group.position.y += Math.sin(progress * Math.PI) * 0.85;
    group.rotation.x = Math.sin(progress * Math.PI) * 0.32;
    group.rotation.z = Math.sin(progress * Math.PI * 2) * 0.18;
    if (progress >= 1) {
      group.position.copy(animation.to);
      group.rotation.set(0, 0, 0);
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

function updateCameraMovement(deltaSeconds: number) {
  if (cameraKeys.size === 0) return;
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
  nextTarget.x = THREE.MathUtils.clamp(nextTarget.x, -8.5, 8.5);
  nextTarget.z = THREE.MathUtils.clamp(nextTarget.z, -8.5, 8.5);
  const appliedMovement = nextTarget.sub(controls.target);
  camera.position.add(appliedMovement);
  controls.target.add(appliedMovement);
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

function fitCameraToArena(width: number, height: number) {
  const arenaKey = `${width}x${height}`;
  if (fittedArenaKey === arenaKey) return;
  fittedArenaKey = arenaKey;

  const spanX = Math.max(1, width - 1) * 1.92;
  const spanZ = Math.max(1, height - 1) * 1.92;
  const arenaRadius = Math.hypot(spanX, spanZ) / 2 + 2;
  floor.scale.set(arenaRadius / 12.4, 1, arenaRadius / 12.4);

  const cameraDistance = Math.max(18, Math.max(spanX, spanZ) * 1.65);
  const viewingDirection = new THREE.Vector3(14.5, 18.5, 15.5).normalize();
  controls.target.set(0, 0, 0);
  camera.position.copy(viewingDirection.multiplyScalar(cameraDistance));
  controls.maxDistance = Math.max(42, cameraDistance * 2.1);
  controls.update();
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
      group = character === 'orkk' ? createDaOrkk(color) : character === 'shinobi' ? createObiWanShinobi(color) : character === 'magician' ? createLongHatLogan(color) : createDummy(color);
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
      const travelSquares = Math.max(1, distanceFromWorld(from, target));
      movementAnimations.set(id, { from, to: target.clone(), startedAt: performance.now(), duration: 320 + travelSquares * 150 });
    }
    lastVisualCells.set(id, targetKey);
    const equippedShield = group.getObjectByName('EquippedShield');
    const recallInFlight = gameState.objectPushAnimations.some((event) => event.equipPlayerId === id && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId)));
    if (equippedShield) equippedShield.visible = gameState.players[id].shieldEquipped && !recallInFlight;
    updateSwiftformVisual(group, gameState.players[id].swiftformCanPassEnemies, id === 'P1' ? 0x45c8ff : 0xff5d68);
    group.traverse((child) => { child.userData.playerId = id; });
  });
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
    group.position.copy(from);
    const travelSquares = Math.max(1, distance(event.from, event.to));
    objectMovementAnimations.set(event.objectId, { from, to, startedAt: performance.now(), duration: 440 + (event.path?.length ?? travelSquares) * 190, collided: event.collided, dx: event.dx, dy: event.dy, path: event.path?.map(worldPosition), removeOnComplete: event.removeOnComplete, equipPlayerId: event.equipPlayerId });
    lastObjectVisualCells.set(event.objectId, cellLabel(event.to));
  });
  syncSpellProjectiles();
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

function distanceFromWorld(from: THREE.Vector3, to: THREE.Vector3) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.z - to.z)) / 1.92;
}

function highlightCells() {
  const selected = selection.getSnapshot().context.selection;
  const movementPlayerId = gameState.phase === 'double-jump' ? gameState.doubleJump!.playerId : gameState.activePlayerId;
  const actor = gameState.players[movementPlayerId];
  cellMeshes.forEach((mesh) => {
    const cell = mesh.userData.cell as Cell;
    const occupiedByPlayer = Object.values(gameState.players).some((player) => player.id !== actor.id && player.position.x === cell.x && player.position.y === cell.y);
    const occupiedByObject = gameState.objects.some((object) => object.position.x === cell.x && object.position.y === cell.y);
    const occupiedByEnemy = occupiedByPlayer || occupiedByObject;
    const specialSteps = gameState.phase === 'double-jump' ? (gameState.doubleJump?.stepsRemaining ?? 0) : (gameState.danceThrough?.stepsRemaining ?? 0);
    const danceValid = (gameState.phase === 'dance-through' || gameState.phase === 'double-jump') && distance(actor.position, cell) === 1 && (!occupiedByEnemy || specialSteps > 1);
    const shizzleStepValid = gameState.phase === 'shizzle-move' && distance(actor.position, cell) === 1 && !occupiedByObject && (!occupiedByPlayer || (gameState.shizzle?.stepsRemaining ?? 0) > 1);
    const regularDistance = actor.swiftformCanPassEnemies ? movementPath(gameState, actor, cell).length : distance(actor.position, cell);
    const swiftformPassSquare = occupiedByPlayer && actor.swiftformCanPassEnemies && regularDistance < actor.movementRemaining;
    const regularValid = gameState.phase !== 'dance-through' && gameState.phase !== 'double-jump' && !occupiedByObject && (!occupiedByPlayer || swiftformPassSquare) && regularDistance >= 1 && regularDistance <= actor.movementRemaining;
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
    const kykObject = gameState.phase === 'choosing-kyk-direction' ? gameState.objects.find((object) => object.id === gameState.forceThrow?.targetId) : null;
    const kykDirectionValid = Boolean(kykObject) && kykDirectionAllowed(gameState.players[gameState.forceThrow!.casterId].position, kykObject!.position, cell);
    const arkane = gameState.arkaneArow;
    const arkaneValid = gameState.phase === 'choosing-arkane-arow-target' && Boolean(arkane) && arkaneArowPath(gameState, gameState.players[arkane!.casterId], cell, arkane!.range).length > 0;
    const preparationValid = (gameState.phase === 'choosing-preparation-teleport' || gameState.phase === 'choosing-blink-teleport' || gameState.phase === 'choosing-portal-target') && !occupiedByPlayer && !occupiedByObject;
    const shizzle = gameState.shizzle;
    const shizzleDx = cell.x - actor.position.x; const shizzleDy = cell.y - actor.position.y;
    const shizzleDistance = Math.max(Math.abs(shizzleDx), Math.abs(shizzleDy));
    const shizzleLinear = shizzleDx === 0 || shizzleDy === 0 || Math.abs(shizzleDx) === Math.abs(shizzleDy);
    const shizzlePath = shizzleLinear ? Array.from({ length: shizzleDistance }, (_, index) => ({ x: actor.position.x + Math.sign(shizzleDx) * (index + 1), y: actor.position.y + Math.sign(shizzleDy) * (index + 1) })) : [];
    const shizzleDestinationValid = gameState.phase === 'choosing-shizzle-destination' && shizzleDistance >= 1 && shizzleDistance <= (shizzle?.stepsRemaining ?? 0) && shizzleLinear && !occupiedByPlayer && !occupiedByObject && !shizzlePath.some((pathCell) => gameState.objects.some((object) => object.position.x === pathCell.x && object.position.y === pathCell.y));
    const boxTeleportValid = Boolean(selectedTestObjectId) && !occupiedByPlayer && !occupiedByObject;
    const valid = (selected.kind === 'move' && (danceValid || shizzleStepValid || regularValid)) || forceDirectionValid || magicDirectionValid || kykDirectionValid || arkaneValid || preparationValid || shizzleDestinationValid || boxTeleportValid;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(forceCollisionWarning ? 0xff2638 : kykDirectionValid ? 0xffb52e : arkaneValid ? 0xffb52e : boxTeleportValid ? 0x45c8ff : valid ? 0x19d3a2 : 0x000000); material.emissiveIntensity = forceCollisionWarning ? 0.9 : kykDirectionValid ? 0.7 : arkaneValid ? 0.62 : boxTeleportValid ? 0.7 : valid ? 0.38 : 0;
  });
  updateTargetHighlights(performance.now());
}

function updateTargetHighlights(time: number) {
  const selected = selection.getSnapshot().context.selection;
  const attacker = gameState.players[gameState.activePlayerId];
  const canTarget = selected.kind === 'attack' && gameState.phase === 'active' && canLocalAct(attacker.id);
  const selectedAttack = selected.kind === 'attack' ? attacker.hand.find((card) => card.instanceId === selected.cardInstanceId) : null;
  const arcaneBoltGlobal = selectedAttack?.cardId === 'arcane-bolt' && attacker.manaMode === 'consume';
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
    const validAttack = canTarget && playerId !== attacker.id && (arcaneBoltGlobal || (distance(attacker.position, target.position) <= attacker.attackRange && hasLineOfSight(gameState, attacker.position, target.position))) && !protectedFromHigh;
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
  renderer.domElement.style.cursor = canTarget || canPullTarget || canArmTarget || canKykTarget || canArcaneTarget || canChainTarget || canMagicTarget ? 'crosshair' : 'default';
}

function onBoardClick(event: PointerEvent) {
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
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'preparation-teleport', playerId: gameState.preparation!.casterId, to: cellHit.object.userData.cell });
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
    else if (playerHit) dispatch({ type: 'magic-hand-target', playerId: gameState.magicHand!.casterId, targetKind: 'player', targetId: playerHit });
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
    if (objectHit) dispatch({ type: 'kyk-target', playerId: gameState.forceThrow!.casterId, objectId: objectHit });
  } else if (gameState.phase === 'choosing-kyk-direction') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'kyk-direction', playerId: gameState.forceThrow!.casterId, to: cellHit.object.userData.cell });
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
    if (playerHit) dispatch({ type: 'attack', playerId: gameState.activePlayerId, cardInstanceId: selected.cardInstanceId, targetId: playerHit });
  }
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
  scheduleLayoutSafetyCheck();
}

let layoutSafetyFrame = 0;
function scheduleLayoutSafetyCheck() {
  cancelAnimationFrame(layoutSafetyFrame);
  layoutSafetyFrame = requestAnimationFrame(() => {
    const viewportRatio = innerWidth / Math.max(1, innerHeight);
    game.classList.remove('layout-compact', 'layout-tight', 'layout-stacked');
    if (innerWidth < 1180 || innerHeight < 820 || viewportRatio < 1.25) game.classList.add('layout-compact');
    requestAnimationFrame(() => applyOverlapFallback('layout-tight', () => {
      requestAnimationFrame(() => applyOverlapFallback('layout-stacked'));
    }));
  });
}

function applyOverlapFallback(className: 'layout-tight' | 'layout-stacked', after?: () => void) {
  const overlapCount = countUnsafeOverlaps();
  game.dataset.layoutOverlaps = String(overlapCount);
  if (overlapCount > 0) game.classList.add(className);
  after?.();
}

function countUnsafeOverlaps() {
  const visible = (element: Element): element is HTMLElement => {
    const node = element as HTMLElement;
    const rect = node.getBoundingClientRect();
    return node.offsetParent !== null && rect.width > 1 && rect.height > 1;
  };
  const intersects = (left: HTMLElement, right: HTMLElement) => {
    const a = left.getBoundingClientRect();
    const b = right.getBoundingClientRect();
    const clearance = 3;
    return a.left < b.right + clearance && a.right + clearance > b.left && a.top < b.bottom + clearance && a.bottom + clearance > b.top;
  };
  const countPairs = (elements: HTMLElement[]) => {
    let count = 0;
    for (let left = 0; left < elements.length; left++) for (let right = left + 1; right < elements.length; right++) {
      if (elements[left].contains(elements[right]) || elements[right].contains(elements[left])) continue;
      if (intersects(elements[left], elements[right])) count++;
    }
    return count;
  };

  const hudElements = [...game.querySelectorAll('.hud > :not(.hidden)')].filter(visible);
  const commandElements = [...game.querySelectorAll('.command-deck > :not(.hidden)')].filter(visible);
  const arenaElements = [...game.querySelectorAll([
    '.character-trait-panel:not(.hidden)',
    '.character-status-panel:not(.hidden)',
    '.opponent-hand-panel:not(.hidden)',
    '.spell-echo:not(.hidden)',
    '.action-quest-panel:not(.hidden)',
    '.prompt.visible',
    '.direct-perk:not(.hidden)',
  ].join(','))].filter(visible).filter((element) => element.textContent?.trim() || element.querySelector('button'));
  return countPairs(hudElements) + countPairs(commandElements) + countPairs(arenaElements);
}
