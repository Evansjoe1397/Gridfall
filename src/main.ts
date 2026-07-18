import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Client, type Room } from '@colyseus/sdk';
import { assign, createActor, setup } from 'xstate';
import {
  CARDS,
  applyCommand,
  arkaneArowPath,
  cardDefinition,
  cellLabel,
  BOARD_SIZE,
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
      <div class="lobby-copy"><p class="eyebrow">CHOOSE SESSION</p><h2>Enter Nagrand Arena</h2><p>Da Orkk faces Obi Wan Shinobi on the first 8x8 game map, with both complete 15-card sets available for testing.</p></div>
      <div class="mode-grid">
        <button class="mode-card primary" id="hotseat"><span>LOCAL / INSTANT</span><strong>Hotseat duel</strong><small>Share this keyboard and pass control each turn.</small></button>
        <div class="mode-card online"><span>PRIVATE ROOM</span><strong>Multiplayer</strong><label>Room password<input id="password" maxlength="24" placeholder="optional secret" /></label><div><button id="createRoom">Create room</button><button id="joinRoom">Join by ID</button></div><input id="roomId" maxlength="24" placeholder="ROOM ID" /></div>
      </div>
      <div class="online-waiting hidden" id="onlineWaiting"></div>
    </section>
    <section class="game hidden" id="game">
      <div class="hud">
        <article class="fighter blue" id="p1Stats"></article>
        <div class="turn-core"><span id="turnNumber">TURN 01</span><strong id="turnLabel">AZURE DUMMY</strong><small id="phaseLabel">SELECT AN ACTION</small></div>
        <article class="fighter red" id="p2Stats"></article>
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
    <div class="choice-modal combat-reveal-modal hidden" id="combatRevealModal"></div>
    <div class="card-hover-preview hidden" id="cardHoverPreview"></div>
    <div class="toast" id="toast"></div>
  </main>`;

let gameState = createInitialState();
let mode: 'hotseat' | 'online' = 'hotseat';
let localSeat: PlayerId | null = null;
let room: Room | null = null;
type OnlineLobbyState = { playerCount: number; characters: Partial<Record<PlayerId, 'shinobi' | 'orkk'>>; arena: string; mode: string; started: boolean };
let onlineLobbyState: OnlineLobbyState | null = null;
const selection = createActor(selectionMachine).start();
let selectedTestObjectId: string | null = null;
selection.subscribe(() => renderUI());

const lobby = byId('lobby');
const game = byId('game');
const boardEl = byId('board');
const toast = byId('toast');

document.querySelector('#hotseat')!.addEventListener('click', () => startHotseat());
document.querySelector('#createRoom')!.addEventListener('click', () => connectOnline('create'));
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
  return ((gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction' || gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') && Boolean(gameState.forceThrow)) || (gameState.phase === 'choosing-force-pull-target' && Boolean(gameState.forcePull)) || (gameState.phase === 'choosing-arkane-arow-target' && Boolean(gameState.arkaneArow)) || ((gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-target') && Boolean(gameState.armDaWiz)) || (gameState.phase === 'choosing-mind-tricks-discard' && gameState.mindTricks?.discarded === 0);
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

function startHotseat() {
  mode = 'hotseat';
  localSeat = null;
  gameState = createInitialState();
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  byId('connection').innerHTML = '<span></span> Hotseat match';
  renderAll();
  requestAnimationFrame(resize);
}

async function connectOnline(action: 'create' | 'join') {
  try {
    const endpoint = location.port === '5173' ? `ws://${location.hostname}:2567` : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const client = new Client(endpoint);
    const password = (document.querySelector<HTMLInputElement>('#password')!).value;
    if (action === 'create') {
      room = await client.create('duel', { password });
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
      gameState = state; selection.send({ type: 'CLEAR' });
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

function renderOnlineLobby() {
  if (!room || !localSeat) return;
  const panel = byId('onlineWaiting');
  panel.classList.remove('hidden');
  const state = onlineLobbyState;
  const joined = (state?.playerCount ?? 1) >= 2;
  const otherHasChosen = Boolean(state?.characters.P2);
  const mayChoose = joined && (localSeat === 'P2' || otherHasChosen) && !state?.characters[localSeat];
  const orderMessage = !joined ? 'Share the Room ID and wait for Player 2.'
    : localSeat === 'P2' && !state?.characters.P2 ? 'You joined the room. Choose your Character first.'
      : localSeat === 'P1' && !otherHasChosen ? 'Player 2 is choosing a Character.'
        : state?.characters[localSeat] ? 'Character locked. Waiting for the battle to start.' : 'Choose your Character.';
  panel.innerHTML = `<p class="eyebrow">PRIVATE ROOM · ${escapeHtml(room.roomId)}</p><h2>Character Select</h2>
    <div class="match-rules"><span>ARENA<strong>${escapeHtml(state?.arena ?? 'Nagrand Arena')}</strong></span><span>MODE<strong>${escapeHtml(state?.mode ?? '1 versus 1')}</strong></span><span>PLAYERS<strong>${state?.playerCount ?? 1} / 2</strong></span></div>
    <p>${orderMessage}</p><div class="character-choices">
      <button data-character="orkk" ${mayChoose ? '' : 'disabled'}><strong>Da Orkk</strong><small>Rage · Shield · Melee</small></button>
      <button data-character="shinobi" ${mayChoose ? '' : 'disabled'}><strong>Obi Wan Shinobi</strong><small>Lightsaber · Mobility · Range 2</small></button>
    </div><small>Both Players may choose the same Character.</small>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-character]').forEach((button) => button.addEventListener('click', () => room?.send('choose-character', button.dataset.character)));
}

function actingPlayer(): PlayerId {
  if (mode === 'online') return localSeat ?? 'P1';
  if (gameState.phase === 'choosing-exhaust') {
    const choice = gameState.combatReveal?.exhaust;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? gameState.activePlayerId;
  }
  if (gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-force-pull-target') return gameState.forcePull!.casterId;
  if (gameState.phase === 'choosing-arkane-arow-target') return gameState.arkaneArow!.casterId;
  if (gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-target') return gameState.armDaWiz!.casterId;
  if (gameState.phase === 'choosing-mind-tricks-discard') return gameState.mindTricks!.casterId;
  if (gameState.phase === 'choosing-mind-tricks-enemy-discard') return gameState.mindTricks!.enemyId;
  if (gameState.phase === 'double-jump') return gameState.doubleJump!.playerId;
  if (gameState.phase === 'defending') return gameState.pendingAttack!.defenderId;
  if (gameState.phase === 'choosing-force-disarm-discard') return gameState.forceDisarm!.targetId;
  if (gameState.phase === 'flurry-offer') return gameState.flurry!.defenderId;
  if (gameState.phase === 'choosing-flurry-enemy-discard') return gameState.flurry!.attackerId;
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
  byId('turnNumber').textContent = `TURN ${String(gameState.turn).padStart(2, '0')}`;
  byId('turnLabel').textContent = gameState.phase === 'finished' ? `${gameState.players[gameState.winner!].name} wins` : `${actor.name}'s turn`;
  byId('phaseLabel').textContent = gameState.phase === 'defending' ? 'DEFENCE RESPONSE' : gameState.phase === 'finished' ? 'MATCH COMPLETE' : 'SELECT AN ACTION';
  byId('activeName').textContent = actor.name;
  byId('activePosition').textContent = `POSITION ${cellLabel(actor.position)} · MOVE ${actor.movementRemaining}/${effectiveMoveRange(actor)} · ACTIONS ${actor.actionsRemaining}/2`;
  byId('piles').innerHTML = `<span>DECK <b>${actor.deck.length}</b></span><span>HAND <b>${actor.hand.length}</b></span><span>DISCARD <b>${actor.discard.length}</b></span>`;
  renderFighter('P1', 'p1Stats');
  renderFighter('P2', 'p2Stats');
  renderCharacterTraits();
  renderCharacterStatuses();
  renderOpponentHand();
  renderSpellEchoBars();
  renderHand();
  renderFlurryModal();
  renderArmDaWizModal();
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
  if (((actor.movementRemaining > 0 && gameState.phase === 'active') || gameState.phase === 'dashing' || gameState.phase === 'dance-through' || gameState.phase === 'double-jump') && select.kind === 'none') selection.send({ type: 'SELECT_MOVE' });
  highlightCells();
}

function renderFighter(id: PlayerId, elementId: string) {
  const player = gameState.players[id];
  const hpPercent = player.hp / player.maxHp * 100;
  const orkkIndicators = player.character === 'orkk' ? `<div class="header-statuses"><span title="Rage: +1 Attack Value per stack; consumed on Attack, or lose 1 at turn end.">&#128293; ${player.rageStacks}</span><span title="${player.shieldEquipped ? '+1 Defence Value to Defend Cards.' : 'Shield is unequipped and exists as a Board obstacle.'}">&#128737; ${player.shieldEquipped ? 'EQUIPPED' : 'UNEQUIPPED'}</span></div>` : '';
  byId(elementId).innerHTML = `<div><span>${id === 'P1' ? 'PLAYER 01' : 'PLAYER 02'}</span><strong>${player.name}</strong></div><div class="hp-copy"><b>${player.hp}</b> / ${player.maxHp} HP</div><div class="hp-track"><i style="width:${hpPercent}%"></i></div>${orkkIndicators}`;
}

function renderCharacterTraits() {
  const player = gameState.players.P1;
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
    const icons = `${doubleRageIcon}${pinnedIcon}${handHeadacheIcon}${discardHeadacheIcon}${handExhaustIcon}${storedExhaustIcon}`;
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
  const choosingDiscard = gameState.phase === 'choosing-guard-discard' || gameState.phase === 'choosing-dash-discard' || gameState.phase === 'choosing-end-discard' || gameState.phase === 'choosing-mind-tricks-discard' || gameState.phase === 'choosing-mind-tricks-enemy-discard';
  byId('hand').innerHTML = viewer.hand.map((instance) => {
    const card = cardDefinition(instance);
    const selected = (currentSelection.kind === 'attack' || currentSelection.kind === 'perk') && currentSelection.cardInstanceId === instance.instanceId;
    const playableAction = card.kind === 'attack' ? viewer.actionsRemaining > 0 : card.kind === 'perk' ? viewer.actionsRemaining > 0 && !viewer.perkUsed : card.kind === 'status' ? viewer.actionsRemaining > 0 && card.canRemoveAsAction === true : false;
    const mindTricksReveal = gameState.phase === 'choosing-mind-tricks-discard';
    const unavailableMindTricksReveal = mindTricksReveal && (Boolean(instance.revealedToOpponent) || Boolean(gameState.mindTricks?.revealedInstanceIds.includes(instance.instanceId)));
    const cannotOverstackDiscard = !mindTricksReveal && choosingDiscard && (card.cannotBeDiscarded || (gameState.phase === 'choosing-end-discard' && card.kind === 'status' && card.canDiscardForHandLimit !== true));
    const disabled = !canLocalAct(viewerId) || gameState.phase === 'finished' || Boolean(cannotOverstackDiscard) || unavailableMindTricksReveal || (!choosingDiscard && (!playableAction || gameState.phase !== 'active'));
    const perkCopy = card.levelEffects?.map((effect, index) => `L${index + 1}: ${effect}`).join('\n');
    const rulesCopy = card.effectText ?? perkCopy ?? (card.kind === 'attack' ? `Deal combat damage with ${card.value} Attack Value.` : `Defend with ${card.value} Defence Value.`);
    const interactionCopy = mindTricksReveal ? ' Click to reveal this card and keep it in Hand.' : choosingDiscard ? ' Click to confirm this discard.' : '';
    const typeLabel = card.kind === 'status' ? (card.canRemoveAsAction ? 'STATUS · CLICK TO REMOVE FOR 1 ACTION' : 'STATUS · ACTIVE IN HAND') : card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE';
    const discardLabel = mindTricksReveal ? (unavailableMindTricksReveal ? 'ALREADY REVEALED' : 'SELECT TO REVEAL') : cannotOverstackDiscard ? 'CANNOT BE DISCARDED' : 'SELECT TO DISCARD';
    return `<button class="card ${card.kind} ${selected ? 'selected' : ''}" data-instance="${instance.instanceId}" ${disabled ? 'disabled' : ''}><span>${choosingDiscard ? discardLabel : typeLabel}</span><strong>${card.name.toUpperCase()}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${escapeHtml(rulesCopy + interactionCopy)}</small></button>`;
  }).join('');
  document.querySelectorAll<HTMLButtonElement>('[data-instance]:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
    if (gameState.phase === 'choosing-mind-tricks-discard') dispatch({ type: 'mind-tricks-discard', playerId: viewerId, cardInstanceId: button.dataset.instance! });
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
      const tooltip = perk ? perk.levelEffects?.slice(0, position).map((effect, index) => `Level ${index + 1}: ${effect}`).join(' + ') : `Empty Spell Echo position ${position}`;
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
  const rules = card.effectText ?? card.levelEffects?.map((effect, index) => `L${index + 1}: ${effect}`).join('\n') ?? (card.kind === 'attack' ? `Deal combat damage with ${card.value} Attack Value.` : `Defend with ${card.value} Defence Value.`);
  const preview = byId('cardHoverPreview');
  preview.innerHTML = `<article class="card ${card.kind}"><span>${card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${escapeHtml(rules)}</small></article>`;
  preview.classList.remove('hidden');
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
const dummyGroups = new Map<PlayerId, THREE.Group>();
const objectGroups = new Map<string, THREE.Group>();
const lastObjectVisualCells = new Map<string, string>();
const objectMovementAnimations = new Map<string, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; collided: boolean; dx: number; dy: number; path?: THREE.Vector3[]; removeOnComplete?: boolean; equipPlayerId?: PlayerId }>();
const processedObjectPushAnimations = new Set<string>();
const impactAnimations = new Map<PlayerId, number>();
const damageNumbers: { sprite: THREE.Sprite; startedAt: number; origin: THREE.Vector3 }[] = [];
const lastVisualCells = new Map<PlayerId, string>();
const movementAnimations = new Map<PlayerId, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number }>();
for (let y = 0; y < BOARD_SIZE; y++) for (let x = 1; x <= BOARD_SIZE; x++) createCell({ x, y });
createAxisLabels();
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
  const highGround = ['D4', 'D5', 'E4', 'E5'].includes(label);
  const ownerOne = ['A4', 'A5'].includes(label);
  const ownerTwo = ['H4', 'H5'].includes(label);
  const drawSquare = ['D1', 'E1', 'D8', 'E8'].includes(label);
  const protectedSquare = ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'].includes(label);
  const color = ownerOne ? 0x145f83 : ownerTwo ? 0x7b2834 : drawSquare ? 0x665a25 : highGround ? 0x285046 : protectedSquare ? 0x1d3d38 : (cell.x + cell.y) % 2 ? 0x17322c : 0x122923;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, highGround ? 0.54 : 0.16, 1.72), new THREE.MeshStandardMaterial({ color, emissive: ownerOne ? 0x07374f : ownerTwo ? 0x3d0f18 : drawSquare ? 0x292307 : 0x000000, emissiveIntensity: 0.35, roughness: 0.72, metalness: 0.15 }));
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
  for (let x = 1; x <= BOARD_SIZE; x++) addLabel(String.fromCharCode(64 + x), worldPosition({ x, y: 0 }).x, top);
  for (let y = 0; y < BOARD_SIZE; y++) addLabel(String(y + 1), left, worldPosition({ x: 1, y }).z);
}

function addLabel(text: string, x: number, z: number) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const context = canvas.getContext('2d')!; context.font = '700 68px Arial'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillStyle = '#79ffe1'; context.fillText(text, 64, 68);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, opacity: 0.8 }));
  sprite.position.set(x, 0.12, z); sprite.scale.set(0.7, 0.7, 0.7); scene.add(sprite);
}

function worldPosition(cell: Cell) {
  const highGround = ['D4', 'D5', 'E4', 'E5'].includes(cellLabel(cell));
  return new THREE.Vector3((cell.x - (BOARD_SIZE + 1) / 2) * 1.92, highGround ? 0.54 : 0.08, (cell.y - (BOARD_SIZE - 1) / 2) * 1.92);
}

function syncBoard() {
  (['P1', 'P2'] as PlayerId[]).forEach((id) => {
    const character = gameState.players[id].character;
    let group = dummyGroups.get(id);
    if (!group || group.userData.character !== character) {
      if (group) scene.remove(group);
      const color = id === 'P1' ? 0x169bd3 : 0xff5d68;
      group = character === 'orkk' ? createDaOrkk(color) : character === 'shinobi' ? createObiWanShinobi(color) : createDummy(color);
      group.userData.character = character;
      dummyGroups.set(id, group); scene.add(group); lastVisualCells.delete(id); movementAnimations.delete(id);
    }
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
    const forceCollisionWarning = forceDirectionValid && Object.values(gameState.players).some((player) => player.position.x === cell.x && player.position.y === cell.y);
    const kykObject = gameState.phase === 'choosing-kyk-direction' ? gameState.objects.find((object) => object.id === gameState.forceThrow?.targetId) : null;
    const kykDirectionValid = Boolean(kykObject) && kykDirectionAllowed(gameState.players[gameState.forceThrow!.casterId].position, kykObject!.position, cell);
    const arkane = gameState.arkaneArow;
    const arkaneValid = gameState.phase === 'choosing-arkane-arow-target' && Boolean(arkane) && arkaneArowPath(gameState, gameState.players[arkane!.casterId], cell, arkane!.range).length > 0;
    const boxTeleportValid = Boolean(selectedTestObjectId) && !occupiedByPlayer && !occupiedByObject;
    const valid = (selected.kind === 'move' && (danceValid || regularValid)) || forceDirectionValid || kykDirectionValid || arkaneValid || boxTeleportValid;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(forceCollisionWarning ? 0xff2638 : kykDirectionValid ? 0xffb52e : arkaneValid ? 0xffb52e : boxTeleportValid ? 0x45c8ff : valid ? 0x19d3a2 : 0x000000); material.emissiveIntensity = forceCollisionWarning ? 0.9 : kykDirectionValid ? 0.7 : arkaneValid ? 0.62 : boxTeleportValid ? 0.7 : valid ? 0.38 : 0;
  });
  updateTargetHighlights(performance.now());
}

function updateTargetHighlights(time: number) {
  const selected = selection.getSnapshot().context.selection;
  const attacker = gameState.players[gameState.activePlayerId];
  const canTarget = selected.kind === 'attack' && gameState.phase === 'active' && canLocalAct(attacker.id);
  const pull = gameState.forcePull;
  const canPullTarget = gameState.phase === 'choosing-force-pull-target' && Boolean(pull) && canLocalAct(pull!.casterId);
  const canArmTarget = gameState.phase === 'choosing-arm-da-wiz-target' && Boolean(gameState.armDaWiz) && canLocalAct(gameState.armDaWiz!.casterId);
  const canKykTarget = gameState.phase === 'choosing-kyk-target' && Boolean(gameState.forceThrow) && canLocalAct(gameState.forceThrow!.casterId);
  dummyGroups.forEach((group, playerId) => {
    const target = gameState.players[playerId];
    const attackerHigh = (gameState.elevations[cellLabel(attacker.position)] ?? 0) > 0;
    const targetHigh = (gameState.elevations[cellLabel(target.position)] ?? 0) > 0;
    const protectedFromHigh = attackerHigh && !targetHigh && ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'].includes(cellLabel(target.position)) && distance(attacker.position, target.position) > 1;
    const validAttack = canTarget && playerId !== attacker.id && distance(attacker.position, target.position) <= attacker.attackRange && hasLineOfSight(gameState, attacker.position, target.position) && !protectedFromHigh;
    const pullCaster = pull ? gameState.players[pull.casterId] : null;
    const validPull = canPullTarget && playerId !== pull!.casterId && distance(pullCaster!.position, target.position) <= pull!.targetRange && hasLineOfSight(gameState, pullCaster!.position, target.position);
    const valid = validAttack || validPull;
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
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      child.material.emissive.set(validShield || validKykObject ? 0xffb52e : 0x000000);
      child.material.emissiveIntensity = validShield || validKykObject ? 0.55 : 0;
    });
  });
  renderer.domElement.style.cursor = canTarget || canPullTarget || canArmTarget || canKykTarget ? 'crosshair' : 'default';
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
    if (cellHit) dispatch({ type: 'move', playerId: gameState.phase === 'double-jump' ? gameState.doubleJump!.playerId : gameState.activePlayerId, to: cellHit.object.userData.cell });
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
}
