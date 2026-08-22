import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Client, type Room } from '@colyseus/sdk';
import { assign, createActor, setup } from 'xstate';
import { LORDAERON_ARENA, NAGRAND_ARENA, THE_TRENCH_ARENA, type ArenaDefinition, type ArenaId } from '../shared/arenas.ts';
import { CARD_RULES_RU, UI_RU_EXACT } from './i18n.ts';
import {
  CARDS,
  ACTION_QUEST_POOL,
  STARTING_DECKS,
  activeWrecknaPhylactery,
  attackCardTargetInRange,
  applicableCombatCardInstanceIds,
  applyCommand,
  armDaWizPath,
  arcaneMisslePath,
  mindBlastCanTarget,
  arkaneArowPath,
  cardBaseValue,
  cardDefinition,
  canAttackTargetSquare,
  cellLabel,
  BOARD_SIZE,
  createHotseatTestState,
  createTrenchTestState,
  createInitialState,
  distance,
  diagonalMovementBlockedByObject,
  effectiveMoveRange,
  effectiveAttackRange,
  hasLineOfSight,
  hasReplicaPlacementLineOfSight,
  isNegativeStatusCard,
  isForbiddenSlideAscent,
  isSpectreShadowTrailCell,
  isCardRevealedToOpponents,
  movementPath,
  movementCost,
  orkkActionEventForCommand,
  phaseCardCandidates,
  kykDirectionAllowed,
  pinnedCount,
  shieldRecallEnemyCount,
  spectreReplica,
  spectreReplicas,
  spiritGuardianEnemyPenalty,
  sweetPotatoStatusCount,
  wizardActionEventForCommand,
  wrecknaPerkTargetInRange,
  type CardTypeId,
  type Cell,
  type GameCommand,
  type GameState,
  type OrkkActionEvent,
  type WizardActionEvent,
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
        <button class="mode-card primary character-archive-card" id="openCharacterBrowser"><span>CHARACTER ARCHIVE</span><strong>Characters</strong><small>Browse every fighter, inspect their model, and read their Perks.</small></button>
      </div>
      <section class="character-browser hidden" aria-labelledby="characterBrowserTitle">
        <header class="character-browser-heading">
          <div><p class="eyebrow">GAME GUIDE</p><h2 id="characterBrowserTitle">Character Archive</h2></div>
          <p>Select a fighter, drag their model to rotate it, and browse every character Perk.</p>
        </header>
        <nav class="character-browser-tabs" id="characterBrowserTabs" aria-label="Available characters"></nav>
        <div class="character-browser-layout">
          <div class="character-preview-stage" id="characterPreviewStage">
            <div class="character-preview-canvas" id="characterPreviewCanvas" aria-label="Rotatable character model"></div>
            <span class="character-preview-hint">DRAG TO ROTATE · SCROLL TO ZOOM</span>
          </div>
          <article class="character-browser-profile" id="characterBrowserProfile"></article>
          <section class="perk-browser" aria-labelledby="perkBrowserTitle">
            <header><div><p class="eyebrow">CHARACTER LOADOUT</p><h3 id="perkBrowserTitle">Character Cards</h3></div><div class="perk-browser-controls"><button id="previousPerk" type="button" aria-label="Previous Card">←</button><span id="perkPosition"></span><button id="nextPerk" type="button" aria-label="Next Card">→</button></div></header>
            <nav class="character-card-categories" id="characterCardCategories" aria-label="Card categories"><button type="button" data-browser-card-kind="attack">Attack</button><button type="button" data-browser-card-kind="defend">Block</button><button type="button" data-browser-card-kind="perk">Perks</button></nav>
            <div class="perk-browser-track" id="perkBrowserTrack" tabindex="0"></div>
          </section>
        </div>
        <button class="lobby-back-button character-browser-back" id="closeCharacterBrowser" type="button">Back to Main Menu</button>
      </section>
      <div class="online-waiting hidden" id="onlineWaiting"></div>
    </section>
    <section class="game hidden" id="game">
      <div class="hud">
        <article class="fighter blue" id="p1Stats"></article>
        <div class="turn-core"><span id="turnNumber">ROUND 01</span><button class="activate-consume hidden" id="activateConsumeButton" type="button">Activate Consume</button><strong id="turnLabel">AZURE DUMMY</strong><small id="phaseLabel">SELECT AN ACTION</small></div>
        <article class="fighter red" id="p2Stats"></article>
        <article class="fighter violet hidden" id="p3Stats"></article>
      </div>
      <div class="arena-frame"><div id="board"></div><div class="character-trait-panel" id="characterTraitPanel"></div><div class="character-trait-panel trait-p2" id="characterTraitPanelP2"></div><div class="character-status-panel status-p1" id="statusP1"></div><div class="character-status-panel status-p2" id="statusP2"></div><div class="character-status-panel status-p3" id="statusP3"></div><div class="opponent-hand-panels" id="opponentHandPanels"></div><div class="spell-echo-bars" id="spellEchoBars"></div><button class="direct-perk hidden" id="directPerkButton">Play Perk Directly · Level 1</button><button class="direct-perk hidden" id="mindTricksFinishButton">Use Mind Tricks without revealing</button><button class="direct-perk finish-dance hidden" id="finishDanceButton">Cancel Dance Through</button><button class="cancel-movement hidden" id="cancelMovementButton">Cancel movement (C)</button><div class="prompt" id="prompt"></div></div>
      <div class="command-deck">
        <div class="identity"><span id="activeTitle"></span><strong id="activeName"></strong><div class="active-stats" id="activeStats"></div><div class="piles" id="piles"></div><button id="freeMoveButton">Free Move + Draw Card (F)</button><div class="finishers"><div class="finisher-control"><button id="guardButton">Guard (G)</button><div class="finisher-tooltip">A Finishing move to end the turn. Draw one card, discard one card, then immediately end turn.</div></div><div class="finisher-control"><button id="dashButton">Dash (R)</button><div class="finisher-tooltip">A Finishing move to end the turn. Discard one non-Blessing Card and move again. Can't use Actions during this movement.</div></div></div><button class="hints-button" id="hintsButton">HINTS (H)</button></div>
        <div class="hand" id="hand"></div>
        <div class="turn-actions"><button id="endTurn">END TURN <kbd>SPACE</kbd></button><button class="quiet" id="leaveGame">Leave match</button></div>
      </div>
      <aside class="battle-log"><span>COMBAT FEED</span><div id="log"></div></aside>
    </section>
    <div class="turn-announcement hidden" id="turnAnnouncement"><small>TURN BEGINS</small><strong></strong><span class="turn-heal-message"></span></div>
    <div class="choice-modal hidden" id="flurryModal"></div>
    <div class="choice-modal hidden" id="armDaWizModal"></div>
    <div class="choice-modal mana-choice-modal hidden" id="manaModal"></div>
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
type OnlineLobbyState = { playerCount: number; requiredPlayerCount: 2 | 3; characters: Partial<Record<PlayerId, OnlineCharacter>>; arena: string; mode: string; started: boolean };
let onlineLobbyState: OnlineLobbyState | null = null;
let roomIdAutoSelected = false;
let combatStackSelectionKey = '';
let selectedCombatCardIds = new Set<string>();
let combatStackSubmittedPlayerIds: PlayerId[] = [];
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
let selectedSpectreAttackOrigin: 'spectre' | 'replica' = 'spectre';
type WizardPowerVisualIntent =
  | { kind: 'cast'; playerId: PlayerId; target: THREE.Vector3; hold: boolean; targetKind?: 'player' | 'object'; targetId?: string }
  | { kind: 'resolve'; playerId: PlayerId }
  | { kind: 'cancel'; playerId: PlayerId };
let pendingOnlineWizardPowerVisualIntent: WizardPowerVisualIntent | null = null;
type OrkkVisualIntent = { playerId: PlayerId; animation: 'Encourage' | 'ShieldThrow'; target?: THREE.Vector3 };
let pendingOnlineOrkkVisualIntent: OrkkVisualIntent | null = null;
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
document.querySelector('#openCharacterBrowser')!.addEventListener('click', () => {
  document.querySelector('.lobby-copy')?.classList.add('hidden');
  document.querySelector('.mode-grid')?.classList.add('hidden');
  const browser = document.querySelector('.character-browser');
  browser?.classList.remove('hidden');
  browser?.scrollIntoView({ block: 'start' });
});
document.querySelector('#closeCharacterBrowser')!.addEventListener('click', () => {
  document.querySelector('.character-browser')?.classList.add('hidden');
  document.querySelector('.lobby-copy')?.classList.remove('hidden');
  document.querySelector('.mode-grid')?.classList.remove('hidden');
  lobby.scrollIntoView({ block: 'start' });
});
document.querySelector('#freeMoveButton')!.addEventListener('click', () => dispatch({ type: 'free-move', playerId: actingPlayer() }));
document.querySelector('#activateConsumeButton')!.addEventListener('click', () => {
  const playerId = gameState.pendingManaChoice;
  if (!playerId) return;
  gameState.phase = 'choosing-mana-mode';
  renderUI();
});
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
document.querySelector('#finishDanceButton')!.addEventListener('click', () => {
  if ((gameState.phase as string) === 'choosing-yamato-move') dispatch({ type: 'yamato-move', playerId: actingPlayer(), to: null });
  else dispatch({ type: 'end-dance', playerId: actingPlayer() });
});
document.querySelector('#cancelMovementButton')!.addEventListener('click', () => dispatch({ type: 'cancel-movement', playerId: actingPlayer() }));
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
  const spectrePerkOrigin = (gameState as any).spectrePerkOrigin as { casterId: PlayerId; perkId: 'shadow-dagger' | 'relocate' | 'devour'; origin: 'spectre' | 'replica'; replicaId: string | null } | undefined;
  if (gameState.phase === 'choosing-spectre-perk-origin' && spectrePerkOrigin && canLocalAct(spectrePerkOrigin.casterId)) {
    if (event.code === 'Tab') {
      event.preventDefault();
      const replicas = spectreReplicas(gameState, spectrePerkOrigin.casterId);
      const options: { origin: 'spectre' | 'replica'; replicaId: string | null }[] = [
        ...(spectrePerkOrigin.perkId === 'shadow-dagger' ? [{ origin: 'spectre' as const, replicaId: null }] : []),
        ...replicas.map((replica) => ({ origin: 'replica' as const, replicaId: replica.id })),
      ];
      const currentIndex = options.findIndex((option) => option.origin === spectrePerkOrigin.origin && option.replicaId === spectrePerkOrigin.replicaId);
      const next = options[(currentIndex + 1) % options.length];
      if (next) dispatch({ type: 'spectre-perk-origin-select', playerId: spectrePerkOrigin.casterId, origin: next.origin, replicaId: next.replicaId });
      return;
    }
    if (event.code === 'Enter') {
      event.preventDefault();
      dispatch({ type: 'spectre-perk-origin-confirm', playerId: spectrePerkOrigin.casterId });
      return;
    }
  }
  if (event.code === 'Escape' && gameState.phase === 'dance-through') {
    event.preventDefault();
    dispatch({ type: 'end-dance', playerId: gameState.activePlayerId });
    return;
  }
  if (event.code === 'Escape' && gameState.phase === 'mana-blast-offer' && gameState.pendingAttack?.feedSpiritOffered) {
    event.preventDefault();
    dispatch({ type: 'feed-spirit-decision', playerId: gameState.pendingAttack.defenderId, cardInstanceId: null });
    return;
  }
  const spectreStatusChoice = (gameState as any).spectreStatusChoice as { playerId: PlayerId; mode: 'relocate' | 'anguish' } | undefined;
  if (event.code === 'Escape' && gameState.phase === 'choosing-blessed-prayer-discard' && spectreStatusChoice?.mode === 'anguish') {
    event.preventDefault();
    dispatch({ type: 'spectre-status-choice', playerId: spectreStatusChoice.playerId, cardInstanceId: null });
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
  if (event.code === 'KeyC' && !game.classList.contains('hidden')) {
    const cancelMovementButton = byId('cancelMovementButton') as HTMLButtonElement;
    if (!cancelMovementButton.classList.contains('hidden') && !cancelMovementButton.disabled) { event.preventDefault(); cancelMovementButton.click(); }
  }
});

function isWaitingForResolvedCardTarget() {
  if (gameState.phase === 'choosing-soul-strike-discard') return true;
  if (gameState.phase === 'choosing-spectre-perk-origin' && Boolean((gameState as any).spectrePerkOrigin)) return true;
  if (gameState.phase === 'choosing-spirit-guardian-square' && (Boolean((gameState as GameState & { spiritGuardian?: unknown }).spiritGuardian) || Boolean((gameState as any).spectreReplicaPlacement))) return true;
  if (gameState.phase === 'choosing-arkane-arow-target' && Boolean((gameState as any).spectreShadow)) return true;
  if (gameState.phase === 'choosing-boomerang-target' && Boolean(gameState.boomerang)) return true;
  if (gameState.phase === 'choosing-fireball-target' && Boolean((gameState as any).fireball)) return true;
  if (gameState.phase === 'choosing-portal-target' && Boolean((gameState as any).portal)) return true;
  if (gameState.phase === 'wreckna-wisdom-offer' || gameState.phase === 'choosing-shadow-barter-discard' || gameState.phase === 'shadow-barter-tomb-offer' || gameState.phase === 'choosing-shadow-barter-tomb-square' || gameState.phase === 'choosing-test-phylactery-target' || gameState.phase === 'choosing-lichdom-target' || gameState.phase === 'choosing-wreckna-phylactery' || gameState.phase === 'choosing-immortality-phylactery' || (gameState.phase as string).startsWith('choosing-dakkoth-') || (gameState.phase as string) === 'choosing-sap-target' || (gameState.phase as string).startsWith('choosing-necronomicon-') || (gameState.phase as string).startsWith('choosing-decay-')) return true;
  return ((gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction' || gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') && Boolean(gameState.forceThrow)) || ((gameState.phase === 'choosing-magic-hand-target' || gameState.phase === 'choosing-magic-hand-direction') && Boolean(gameState.magicHand)) || ((gameState.phase === 'choosing-shizzle-destination' || (gameState.phase === 'shizzle-move' && gameState.shizzle?.started === false)) && Boolean(gameState.shizzle)) || (gameState.phase === 'choosing-force-pull-target' && Boolean(gameState.forcePull)) || (gameState.phase === 'choosing-arkane-arow-target' && Boolean(gameState.arkaneArow)) || ((gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-create-payment' || gameState.phase === 'choosing-arm-da-wiz-target') && Boolean(gameState.armDaWiz)) || (gameState.phase === 'choosing-preparation-teleport' && Boolean(gameState.preparation)) || (gameState.phase === 'choosing-arcane-missle-target' && Boolean(gameState.arcaneMissle)) || (gameState.phase === 'choosing-chain-lightning-target' && Boolean(gameState.chainLightning)) || (gameState.phase === 'choosing-mind-tricks-discard' && gameState.mindTricks?.discarded === 0);
}

function isWaitingForSelectedCardTarget() {
  const selected = selection.getSnapshot().context.selection;
  return selected.kind === 'attack' || selected.kind === 'perk';
}

let expirationRequestFor = 0;
let combatAckRequestFor = 0;
function submitOnlineCombatAcknowledgement(revealExpiresAt: number) {
  if (!localSeat || combatAckRequestFor === revealExpiresAt) return;
  combatAckRequestFor = revealExpiresAt;
  dispatch({ type: 'ack-combat', playerId: localSeat, combatExpiresAt: revealExpiresAt });
}
window.setInterval(() => {
  const reveal = gameState.combatReveal;
  if (!reveal) { expirationRequestFor = 0; combatAckRequestFor = 0; return; }
  const countdown = document.querySelector<HTMLElement>('#combatRevealModal .combat-countdown b');
  if (countdown) countdown.textContent = String(Math.max(0, Math.ceil((reveal.expiresAt - Date.now()) / 1000)));
  if (Date.now() < reveal.expiresAt || expirationRequestFor === reveal.expiresAt) return;
  expirationRequestFor = reveal.expiresAt;
  if (mode === 'online') submitOnlineCombatAcknowledgement(reveal.expiresAt);
  else acknowledgeCombatReveal();
}, 250);

function showFormatSelect(flow: 'hotseat' | 'online') {
  const panel = byId('onlineWaiting');
  panel.classList.remove('hidden');
  document.querySelector('.mode-grid')?.classList.add('hidden');
  panel.innerHTML = `<p class="eyebrow">${flow === 'hotseat' ? 'HOTSEAT TEST' : 'PRIVATE MULTIPLAYER ROOM'}</p><h2>Choose Game Format</h2><div class="character-choices"><button data-format="duel"><strong>1 versus 1</strong><small>Nagrand Arena · 2 Players</small></button><button data-format="ffa"><strong>Free For All</strong><small>Lordaeron Arena · 3 Players</small></button></div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((button) => button.addEventListener('click', () => {
    const format = button.dataset.format as GameFormat;
    if (flow === 'online' && format === 'duel') showOnlineArenaSelect();
    else if (flow === 'online') void connectOnline('create', format);
    else if (format === 'duel') showHotseatArenaSelect();
    else showHotseatCharacterSelect(format, 'nagrand');
  }));
}

type OnlineCharacter = 'shinobi' | 'orkk' | 'magician' | 'john-christ' | 'spectre' | 'wreckna' | 'merylin';
type SelectableCharacter = OnlineCharacter;
type HotseatCharacter = SelectableCharacter;
type HotseatOpponent = HotseatCharacter | 'dummy';
type HotseatArena = 'nagrand' | 'trench';
const CHARACTER_SELECT_INFO: Record<HotseatCharacter, { name: string; hp: number; movement: number; attackRange: number; trait: string; traitIcon: string; traitDescription: string }> = {
  shinobi: { name: 'Obi Wan Shinobi', hp: 20, movement: 2, attackRange: 1, trait: 'Lightsaber', traitIcon: '⚡⚔', traitDescription: "If Shinobi did not move during his turn, gain +1 ATT, +1 DEF, and +1 MOV until the end of his next turn. Movement caused by Shinobi's own Attack or Defence does not prevent this trait." },
  orkk: { name: 'Da Orkk', hp: 24, movement: 3, attackRange: 1, trait: 'Rage', traitIcon: '👊', traitDescription: "Gain 1 Rage when Da Orkk takes damage from a card or action, at most once per overall effect. Attack Cards gain the full bonus from all Rage and consume the applied stacks after combat, except when attacking an Object. Remove 1 Rage at turn end." },
  magician: { name: 'Long Hat Logan', hp: 18, movement: 3, attackRange: 2, trait: 'Classic Wizardry', traitIcon: '✦', traitDescription: 'Generate 1 Mana after resolving an Attack or Perk spell, up to 3. At 3 Mana, Logan may Consume it at the start of his turn to enable advanced spell effects.' },
  'john-christ': { name: 'John Christ', hp: 14, movement: 3, attackRange: 3, trait: 'Possessed', traitIcon: '✝', traitDescription: 'After receiving Damage, enter Spirit Form: +2 ATT, movement Range 1, melee Attack Range 1, and movement through enemies and Objects. Leave Spirit Form after using an Attack Card or at turn end, restoring Attack Range 3. Blessing Cards create Stoic Shell.' },
  spectre: { name: 'Spectre', hp: 17, movement: 3, attackRange: 1, trait: 'Replica', traitIcon: '◈', traitDescription: 'Create immobile replicas. Spectre and her replicas share Hand, Actions, HP, modifiers, and combat; any body may originate melee Attacks, while positional effects use the body involved.' },
  wreckna: { name: 'Wreckna', hp: 16, movement: 2, attackRange: 2, trait: 'Phylactery · Entombed', traitIcon: '☠', traitDescription: 'Infuse Objects with Wreckna’s undead Soul to empower Attack, Defend, or Perk Cards. While any Phylactery exists, Damage cannot reduce Wreckna below 1 HP, but the attacker still receives full post-match Damage credit. Spend 2 MOV to enter a Tomb; restore 1 HP when beginning a turn inside it.' },
  merylin: { name: 'Merylin Pendragon', hp: 22, movement: 2, attackRange: 1, trait: 'Swordcraft', traitIcon: '⚔', traitDescription: 'Summon swords from other realms through Card and Perk effects. Summon enables one Attack Card and is consumed when that Attack is used.' },
};
const CHARACTER_BROWSER_ORDER: SelectableCharacter[] = ['shinobi', 'orkk', 'magician', 'john-christ', 'spectre', 'wreckna', 'merylin'];
const CHARACTER_BROWSER_TITLES: Record<SelectableCharacter, string> = {
  shinobi: 'Lightsaber Wizard', orkk: 'Wizard of Strength', magician: 'The Magician',
  'john-christ': 'Unduying Wizard', spectre: 'The Living Shadow', wreckna: 'The Lich', merylin: 'Knightress Wizard',
};
function characterSelectButton(character: HotseatCharacter, dataAttribute: 'data-hotseat-character' | 'data-character', disabled = false): string {
  const info = CHARACTER_SELECT_INFO[character];
  const trait = info.trait ? `<small class="character-trait-stat"><span class="character-select-trait-icon" tabindex="0" aria-label="${info.trait}: ${info.traitDescription}">${info.traitIcon}<span class="character-select-trait-tooltip"><b>${info.trait}</b>${info.traitDescription}</span></span>${info.trait}</small>` : '<small class="character-trait-stat">TRAIT COMING LATER</small>';
  return `<button ${dataAttribute}="${character}" ${disabled ? 'disabled' : ''}><strong>${info.name}</strong><span class="character-core-stats"><small><b>${info.hp}</b> MAX HP</small><small><b>${info.movement}</b> MOV</small><small><b>${info.attackRange}</b> ${character === 'merylin' ? 'MELEE' : 'ATT RANGE'}</small>${trait}</span></button>`;
}

function dummySelectButton(): string {
  return `<button data-hotseat-opponent="dummy"><strong>Test Dummy</strong><span class="character-core-stats"><small><b>20</b> MAX HP</small><small><b>2</b> MOV</small><small><b>2</b> ATT RANGE</small><small class="character-trait-stat">TRAINING OPPONENT</small></span></button>`;
}

function showHotseatArenaSelect() {
  const panel = byId('onlineWaiting');
  panel.innerHTML = `<p class="eyebrow">HOTSEAT TEST · 1 VERSUS 1</p><h2>Choose Arena</h2><div class="character-choices"><button data-hotseat-arena="nagrand"><strong>Nagrand Arena</strong><small>8 × 8 · Central High Ground</small></button><button data-hotseat-arena="trench"><strong>The Trench</strong><small>8 × 8 · High Ground lanes and Slide Squares</small></button></div><button class="lobby-back-button" id="backToFormat" type="button">Back to Game Format</button>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-arena]').forEach((button) => button.addEventListener('click', () => showHotseatCharacterSelect('duel', button.dataset.hotseatArena as HotseatArena)));
  panel.querySelector<HTMLButtonElement>('#backToFormat')!.addEventListener('click', () => showFormatSelect('hotseat'));
}

function showOnlineArenaSelect() {
  const panel = byId('onlineWaiting');
  panel.innerHTML = `<p class="eyebrow">PRIVATE MULTIPLAYER ROOM · 1 VERSUS 1</p><h2>Choose Arena</h2><div class="character-choices"><button data-online-arena="nagrand"><strong>Nagrand Arena</strong><small>8 × 8 · Central High Ground</small></button><button data-online-arena="trench"><strong>The Trench</strong><small>8 × 8 · High Ground lanes and Slide Squares</small></button></div><button class="lobby-back-button" id="backToOnlineFormat" type="button">Back to Game Format</button>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-online-arena]').forEach((button) => button.addEventListener('click', () => void connectOnline('create', 'duel', button.dataset.onlineArena as HotseatArena)));
  panel.querySelector<HTMLButtonElement>('#backToOnlineFormat')!.addEventListener('click', () => showFormatSelect('online'));
}

function showHotseatCharacterSelect(format: GameFormat, arena: HotseatArena = 'nagrand') {
  const panel = byId('onlineWaiting');
  const arenaName = format === 'ffa' ? 'LORDAERON ARENA' : arena === 'trench' ? 'THE TRENCH' : 'NAGRAND ARENA';
  panel.innerHTML = `<p class="eyebrow">HOTSEAT TEST · ${arenaName}</p><h2>Choose your Character</h2><p>${format === 'duel' ? 'Step 1 of 2 · Choose Player 1.' : 'Choose Player 1 for the three-player test.'}</p><div class="character-choices">${characterSelectButton('shinobi', 'data-hotseat-character')}${characterSelectButton('orkk', 'data-hotseat-character')}${characterSelectButton('magician', 'data-hotseat-character')}${characterSelectButton('spectre', 'data-hotseat-character')}${characterSelectButton('wreckna', 'data-hotseat-character')}${characterSelectButton('merylin', 'data-hotseat-character')}${format === 'duel' ? characterSelectButton('john-christ', 'data-hotseat-character') : ''}</div>`;
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-character]').forEach((button) => button.addEventListener('click', () => {
    const character = button.dataset.hotseatCharacter as HotseatCharacter;
    if (format === 'duel') showHotseatOpponentSelect(character, arena);
    else startHotseat(character, format, 'dummy', arena);
  }));
}

function showHotseatOpponentSelect(playerCharacter: HotseatCharacter, arena: HotseatArena) {
  const panel = byId('onlineWaiting');
  const playerName = CHARACTER_SELECT_INFO[playerCharacter].name;
  const arenaName = arena === 'trench' ? 'THE TRENCH' : 'NAGRAND ARENA';
  panel.innerHTML = `<p class="eyebrow">HOTSEAT DUEL · ${arenaName}</p><h2>Choose the Enemy</h2><p>Step 2 of 2 · ${playerName} will fight a training Dummy or a character controlled by Player 2.</p><div class="character-choices">${dummySelectButton()}${characterSelectButton('shinobi', 'data-hotseat-character')}${characterSelectButton('orkk', 'data-hotseat-character')}${characterSelectButton('magician', 'data-hotseat-character')}${characterSelectButton('john-christ', 'data-hotseat-character')}${characterSelectButton('spectre', 'data-hotseat-character')}${characterSelectButton('wreckna', 'data-hotseat-character')}${characterSelectButton('merylin', 'data-hotseat-character')}</div><button class="lobby-back-button" id="backToPlayerCharacter" type="button">Back to Player 1</button>`;
  panel.querySelector<HTMLButtonElement>('[data-hotseat-opponent="dummy"]')!.addEventListener('click', () => startHotseat(playerCharacter, 'duel', 'dummy', arena));
  panel.querySelectorAll<HTMLButtonElement>('[data-hotseat-character]').forEach((button) => button.addEventListener('click', () => startHotseat(playerCharacter, 'duel', button.dataset.hotseatCharacter as HotseatCharacter, arena)));
  panel.querySelector<HTMLButtonElement>('#backToPlayerCharacter')!.addEventListener('click', () => showHotseatCharacterSelect('duel', arena));
}

function startHotseat(character: HotseatCharacter, format: GameFormat, opponentCharacter: HotseatOpponent = 'dummy', arena: HotseatArena = 'nagrand') {
  mode = 'hotseat';
  localSeat = null;
  gameState = format === 'duel' && arena === 'trench'
    ? createTrenchTestState(false, character, opponentCharacter)
    : createHotseatTestState(false, character, format === 'ffa' ? 3 : 2, opponentCharacter);
  (gameState as GameState & { simultaneousCombatStack?: boolean }).simultaneousCombatStack = true;
  const arenaTitle = format === 'ffa' ? 'LORDAERON ARENA · 8x11 TEST BUILD' : arena === 'trench' ? 'THE TRENCH · 8x8 TEST BUILD' : 'NAGRAND ARENA · 8x8 TEST BUILD';
  const mastheadArena = document.querySelector<HTMLElement>('.masthead .eyebrow');
  if (mastheadArena) mastheadArena.textContent = arenaTitle;
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

async function connectOnline(action: 'create' | 'join', format: GameFormat = 'duel', arena: HotseatArena = 'nagrand') {
  try {
    roomIdAutoSelected = false;
    const endpoint = location.port === '5173' ? `ws://${location.hostname}:2567` : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    const client = new Client(endpoint);
    const password = (document.querySelector<HTMLInputElement>('#password')!).value;
    if (action === 'create') {
      room = await client.create('duel', { password, format, arena });
      (document.querySelector<HTMLInputElement>('#roomId')!).value = room.roomId;
    } else {
      const roomId = (document.querySelector<HTMLInputElement>('#roomId')!).value.trim();
      if (!roomId) return notify('Enter a room ID first.');
      room = await client.joinById(roomId, { password });
    }
    mode = 'online';
    room.onMessage('seat', (seat: PlayerId) => { localSeat = seat; renderAll(); });
    room.onMessage('lobby-state', (state: OnlineLobbyState) => { onlineLobbyState = state; renderOnlineLobby(); });
    room.onMessage('combat-stack-status', (state: { submittedPlayerIds: PlayerId[] }) => { combatStackSubmittedPlayerIds = state.submittedPlayerIds; renderCombatReveal(); });
    room.onMessage('orkk-action', (event: OrkkActionEvent) => {
      pendingOnlineOrkkVisualIntent = orkkVisualIntentForAction(event);
    });
    room.onMessage('wizard-action', (event: WizardActionEvent) => {
      pendingOnlineWizardPowerVisualIntent = wizardPowerVisualIntentForAction(event);
    });
    room.onMessage('state', (state: GameState) => {
      const enteringBattle = game.classList.contains('hidden');
      const arenaChanged = gameState.boardSize !== state.boardSize;
      const shouldFitCamera = enteringBattle || arenaChanged;
      gameState = normalizeOnlineState(state);
      if (gameState.phase !== 'choosing-combat-stack') { combatStackSelectionKey = ''; selectedCombatCardIds.clear(); combatStackSubmittedPlayerIds = []; }
      const onlineArena = (gameState as GameState & { arenaId?: ArenaId }).arenaId === 'trench' ? THE_TRENCH_ARENA : gameState.boardSize === LORDAERON_ARENA.height ? LORDAERON_ARENA : NAGRAND_ARENA;
      const mastheadArena = document.querySelector<HTMLElement>('.masthead .eyebrow');
      if (mastheadArena) mastheadArena.textContent = `${onlineArena.name.toUpperCase()} · ${onlineArena.width}x${onlineArena.height} ONLINE BUILD`;
      if (enteringBattle || arenaChanged) {
        boardVisualKey = '';
        fittedArenaKey = '';
      }
      selection.send({ type: 'CLEAR' });
      const powerVisualIntent = pendingOnlineWizardPowerVisualIntent;
      pendingOnlineWizardPowerVisualIntent = null;
      const orkkVisualIntent = pendingOnlineOrkkVisualIntent;
      pendingOnlineOrkkVisualIntent = null;
      if (orkkVisualIntent) applyOrkkVisualIntent(orkkVisualIntent);
      lobby.classList.add('hidden'); game.classList.remove('hidden'); renderAll();
      if (powerVisualIntent) applyWizardPowerVisualIntent(powerVisualIntent);
      requestAnimationFrame(() => {
        resize();
        if (shouldFitCamera) fitCameraToArena(visualBoardWidth(), visualBoardHeight(), true);
      });
    });
    room.onMessage('error', (message: string) => { pendingOnlineWizardPowerVisualIntent = null; pendingOnlineOrkkVisualIntent = null; notify(message); });
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
    player.movementAnnulledByBlessedSwiftness ??= false;
    player.pinnedStacks ??= 0;
    player.hand ??= [];
    player.deck ??= [];
    player.discard ??= [];
    player.spellEcho ??= [null, null, null];
    player.manaConsumeEventId ??= null;
    player.spiritForm ??= false;
    player.spiritEnemyUnderfoot ??= null;
    player.stoicShell ??= false;
    player.stoicShellStacks ??= 0;
    player.spiritObjectUnderfoot ??= null;
    player.spiritSiphonedEnemyIds ??= [];
    player.spiritSiphonedMovement ??= 0;
    player.johnCumulativeMovementRemaining ??= player.spiritForm ? 0 : player.movementRemaining;
    player.spiritMovementDepleted ??= false;
    player.spiritMovementSpentThisTurn ??= false;
    player.queuedBlessingCardIds ??= [];
    player.stoicShellHealedTurn ??= null;
    player.stoicShellHealEventId ??= null;
    player.stoicShellHealAmount ??= 0;
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
      ${characterSelectButton('john-christ', 'data-character', !mayChoose)}
      ${characterSelectButton('spectre', 'data-character', !mayChoose)}
      ${characterSelectButton('wreckna', 'data-character', !mayChoose)}
      ${characterSelectButton('merylin', 'data-character', !mayChoose)}
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
  if ((gameState.phase as string) === 'choosing-yamato-move') return (gameState as GameState & { yamato?: { defenderId: PlayerId } }).yamato?.defenderId ?? gameState.activePlayerId;
  const spectreStatusChoice = (gameState as any).spectreStatusChoice as { playerId: PlayerId } | undefined;
  if (gameState.phase === 'choosing-blessed-prayer-discard' && spectreStatusChoice) return spectreStatusChoice.playerId;
  if (gameState.phase === 'choosing-spirit-guardian-square') return (gameState as any).spectreReplicaPlacement?.casterId ?? (gameState as GameState & { spiritGuardian: { casterId: PlayerId } }).spiritGuardian.casterId;
  if (gameState.phase === 'choosing-exhaust') {
    const choice = gameState.combatReveal?.exhaust;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? gameState.activePlayerId;
  }
  if (gameState.phase === 'choosing-vicious-mockery') {
    const choice = gameState.combatReveal?.viciousMockery;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? gameState.activePlayerId;
  }
  if (gameState.phase === 'choosing-blessing-light') return gameState.combatReveal?.blessingLight?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-blessing-might') return gameState.combatReveal?.blessingMight?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-blessing-faith') return gameState.combatReveal?.blessingFaith?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-mythril-helmet') return gameState.combatReveal?.mythrilHelmet?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-mana-barrage') return gameState.combatReveal?.manaBarrage?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-force-throw-target' || gameState.phase === 'choosing-force-throw-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-kyk-target' || gameState.phase === 'choosing-kyk-direction') return gameState.forceThrow!.casterId;
  if (gameState.phase === 'choosing-force-pull-target') return gameState.forcePull!.casterId;
  if (gameState.phase === 'choosing-spectre-perk-origin') return (gameState as any).spectrePerkOrigin?.casterId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-arkane-arow-target') return (gameState as any).spectreShadow?.casterId ?? gameState.arkaneArow!.casterId;
  if (gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-create-payment' || gameState.phase === 'choosing-arm-da-wiz-target') return gameState.armDaWiz!.casterId;
  if (gameState.phase === 'wreckna-wisdom-offer' || gameState.phase === 'wreckna-wisdom-discard') return (gameState as GameState & { wrecknaWisdom?: { playerId: PlayerId } }).wrecknaWisdom?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-wreckna-phylactery') return (gameState as GameState & { wrecknaPhylacteryChoice?: { casterId: PlayerId } }).wrecknaPhylacteryChoice?.casterId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-immortality-phylactery') return (gameState as GameState & { immortality?: { playerId: PlayerId } }).immortality?.playerId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-test-phylactery-target') return (gameState as GameState & { testPhylactery?: { casterId: PlayerId } }).testPhylactery?.casterId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-lichdom-target' || gameState.phase === 'choosing-lichdom-copy') return (gameState as GameState & { lichdom?: { casterId: PlayerId } }).lichdom?.casterId ?? gameState.activePlayerId;
  if ((gameState.phase as string).startsWith('choosing-dakkoth-')) return (gameState as GameState & { dakkoth?: { casterId: PlayerId } }).dakkoth?.casterId ?? gameState.activePlayerId;
  if ((gameState.phase as string) === 'choosing-sap-target') return (gameState as GameState & { sap?: { casterId: PlayerId } }).sap?.casterId ?? gameState.activePlayerId;
  if ((gameState.phase as string) === 'choosing-necronomicon-tomb') return (gameState as GameState & { necronomicon?: { casterId: PlayerId } }).necronomicon?.casterId ?? gameState.activePlayerId;
  if ((gameState.phase as string) === 'choosing-necronomicon-discard') return (gameState as GameState & { necronomicon?: { discardQueue: { playerId: PlayerId }[] } }).necronomicon?.discardQueue[0]?.playerId ?? gameState.activePlayerId;
  if ((gameState.phase as string) === 'choosing-decay-target') return (gameState as GameState & { decay?: { casterId: PlayerId } }).decay?.casterId ?? gameState.activePlayerId;
  if ((gameState.phase as string) === 'choosing-decay-discard') return (gameState as GameState & { decay?: { targetId?: PlayerId } }).decay?.targetId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-shadow-barter-discard') return (gameState as GameState & { shadowBarter?: { defenderId: PlayerId } }).shadowBarter?.defenderId ?? gameState.activePlayerId;
  if (gameState.phase === 'choosing-soul-strike-discard') return (gameState as GameState & { soulStrikeDiscard?: { defenderId: PlayerId } }).soulStrikeDiscard?.defenderId ?? gameState.activePlayerId;
  if (gameState.phase === 'shadow-barter-tomb-offer' || gameState.phase === 'choosing-shadow-barter-tomb-square') return (gameState as GameState & { shadowBarter?: { attackerId: PlayerId } }).shadowBarter?.attackerId ?? gameState.activePlayerId;
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
  if (gameState.phase === 'choosing-frostmourne') return (gameState as GameState & { frostmourne?: { playerId: PlayerId } }).frostmourne?.playerId ?? gameState.activePlayerId;
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

function wizardPowerVisualIntentForCommand(state: GameState, command: GameCommand): WizardPowerVisualIntent | null {
  const event = wizardActionEventForCommand(state, command);
  return event ? wizardPowerVisualIntentForAction(event) : null;
}

function wizardPowerVisualIntentForAction(event: WizardActionEvent): WizardPowerVisualIntent {
  if (event.action === 'spell-resolved') return { kind: 'resolve', playerId: event.playerId };
  if (event.action === 'targeting-cancelled') return { kind: 'cancel', playerId: event.playerId };
  return { kind: 'cast', playerId: event.playerId, target: worldPosition(event.target), hold: event.hold, targetKind: event.targetKind, targetId: event.targetId };
}

function orkkVisualIntentForCommand(state: GameState, command: GameCommand): OrkkVisualIntent | null {
  const event = orkkActionEventForCommand(state, command);
  return event ? orkkVisualIntentForAction(event) : null;
}

function orkkVisualIntentForAction(event: OrkkActionEvent): OrkkVisualIntent {
  return event.action === 'shield-thrown'
    ? { playerId: event.playerId, animation: 'ShieldThrow', target: worldPosition(event.target) }
    : { playerId: event.playerId, animation: 'Encourage' };
}

function dispatch(command: GameCommand) {
  const powerVisualIntent = wizardPowerVisualIntentForCommand(gameState, command);
  const orkkVisualIntent = orkkVisualIntentForCommand(gameState, command);
  if (mode === 'online') {
    if (!room || !localSeat) return notify('Waiting for your seat assignment.');
    room.send('command', command);
    return;
  }
  const result = applyCommand(gameState, command);
  if (!result.ok) return notify(result.error);
  gameState = result.state;
  selection.send({ type: 'CLEAR' });
  if (orkkVisualIntent) applyOrkkVisualIntent(orkkVisualIntent);
  renderAll();
  if (powerVisualIntent) applyWizardPowerVisualIntent(powerVisualIntent);
}

function renderAll() {
  syncBoard();
  renderUI();
}

function renderUI() {
  if (game.classList.contains('hidden')) return;
  const actor = gameState.players[gameState.activePlayerId];
  byId('turnNumber').textContent = `ROUND ${String(gameState.turn).padStart(2, '0')}`;
  const consumeButton = byId('activateConsumeButton') as HTMLButtonElement;
  const pendingConsumePlayer = gameState.pendingManaChoice ? gameState.players[gameState.pendingManaChoice] : null;
  const mayRestoreConsume = gameState.phase === 'active' && Boolean(pendingConsumePlayer) && pendingConsumePlayer!.actionsRemaining === 2 && !pendingConsumePlayer!.freeMoveUsed && canLocalAct(pendingConsumePlayer!.id);
  consumeButton.classList.toggle('hidden', !mayRestoreConsume);
  byId('turnLabel').textContent = gameState.phase === 'finished' ? `${gameState.players[gameState.winner!].name} wins` : `${actor.name}'s turn`;
  const activeColor = playerUiColor(actor.id);
  byId('turnLabel').style.color = activeColor;
  byId('turnLabel').style.textShadow = `0 0 12px ${activeColor}`;
  byId('phaseLabel').textContent = gameState.phase === 'defending' ? 'DEFENCE RESPONSE' : gameState.phase === 'finished' ? 'MATCH COMPLETE' : 'SELECT AN ACTION';
  showTurnAnnouncement(actor);
  byId('activeTitle').textContent = actor.character === 'magician' ? 'THE MAGICIAN' : actor.character === 'orkk' ? 'WIZARD OF STRENGTH' : actor.character === 'shinobi' ? 'LIGHTSABER WIZARD' : actor.character === 'john-christ' ? 'UNDUYING WIZARD' : actor.character === 'spectre' ? 'THE LIVING SHADOW' : actor.character === 'wreckna' ? 'THE LICH' : actor.character === 'merylin' ? 'KNIGHTRESS WIZARD' : 'TRAINING DUMMY';
  byId('activeName').textContent = actor.name;
  byId('activeStats').innerHTML = `<span>MOV <b>${actor.movementRemaining}/${effectiveMoveRange(actor)}</b></span><span>ACTIONS <b>${actor.actionsRemaining}/2</b></span><span>ATT. RANGE <b>${effectiveAttackRange(gameState, actor)}</b></span>`;
  const privatelyKnownTopIds = (actor.knownTopCardIds ?? []).filter((cardId, index) => actor.deck.at(-1 - index)?.cardId === cardId);
  const knownTopIds = privatelyKnownTopIds.length > 0 ? privatelyKnownTopIds : actor.knownTopCardId ? [actor.knownTopCardId] : [];
  const knownDeckMarkup = knownTopIds.length > 0 ? `<span>DECK <b>${actor.deck.length}</b></span>${knownTopIds.map((cardId, index) => { const card = cardDefinition({ instanceId: '', cardId }); return `<button class="pile-button pile-clickable known-deck" data-known-top-card="${card.id}" title="Known Deck Card ${index + 1}: ${escapeHtml(card.name)}">TOP ${index + 1}</button>`; }).join('')}` : `<span>DECK <b>${actor.deck.length}</b></span>`;
  byId('piles').innerHTML = `${knownDeckMarkup}<span>HAND <b>${actor.hand.length}</b></span>${actor.discard.length > 0 ? `<button class="pile-button pile-clickable" id="discardPileButton" title="Open Discard pile">DISCARD <b>${actor.discard.length}</b></button>` : `<span>DISCARD <b>0</b></span>`}`;
  byId('discardPileButton')?.addEventListener('click', () => { discardViewerPlayerId = actor.id; renderDiscardModal(); });
  document.querySelectorAll<HTMLElement>('[data-known-top-card]').forEach((button) => {
    button.addEventListener('pointerenter', (event) => showCardPreview((event.currentTarget as HTMLElement).dataset.knownTopCard!, event));
    button.addEventListener('pointermove', positionCardPreview);
    button.addEventListener('pointerleave', hideCardPreview);
  });
  const hudPlayerIds = hudSeatPlayerIds();
  renderFighter(hudPlayerIds[0], 'p1Stats', 'left');
  renderFighter(hudPlayerIds[1], 'p2Stats', 'right');
  byId('p3Stats').classList.toggle('hidden', !hudPlayerIds[2]);
  if (hudPlayerIds[2]) renderFighter(hudPlayerIds[2], 'p3Stats', 'right');
  renderCharacterTraits();
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
  prompt.textContent = gameState.phase === 'defending' ? `${gameState.players[gameState.pendingAttack!.defenderId].name}: defend or take the hit` : gameState.phase === 'flurry-offer' ? `${gameState.players[gameState.flurry!.defenderId].name}: resolve Flurry` : gameState.phase === 'choosing-flurry-enemy-discard' ? `${gameState.players[gameState.flurry!.attackerId].name}: discard ${gameState.flurry!.remainingEnemyDiscards} card${gameState.flurry!.remainingEnemyDiscards === 1 ? '' : 's'}` : gameState.phase === 'choosing-force-disarm-discard' ? `${gameState.players[gameState.forceDisarm!.targetId].name}: choose ${'mindBlastLevel' in gameState.forceDisarm! ? '1 Card' : `a ${(gameState.forceDisarm!.cardKind ?? 'attack') === 'attack' ? 'Attack' : 'Defend'} Card`} to discard` : gameState.phase === 'choosing-end-discard' ? `Hand limit: discard ${actor.hand.length - 5} more card${actor.hand.length - 5 === 1 ? '' : 's'}` : gameState.phase === 'choosing-dash-discard' ? 'Select a card to discard · Escape to cancel Dash' : gameState.phase.startsWith('choosing-') ? 'Select one card from your hand to discard' : gameState.phase === 'dance-through' ? `Dance Through: ${gameState.danceThrough?.stepsRemaining ?? 0} one-square steps remain · pass through enemies, Objects, and Walls · finish unoccupied` : gameState.phase === 'dashing' ? `Dash: spend ${actor.movementRemaining} movement · Escape to cancel before moving` : select.kind === 'move' ? 'Select an empty highlighted square' : select.kind === 'attack' ? 'Select the enemy dummy · Escape to cancel' : select.kind === 'perk' ? 'Play directly or select your Spell Echo position 1 · Escape to cancel' : '';
  const spectreStatusChoice = (gameState as any).spectreStatusChoice as { mode: 'relocate' | 'anguish' } | undefined;
  if (gameState.phase === 'choosing-blessed-prayer-discard' && spectreStatusChoice?.mode === 'anguish') prompt.textContent = 'ANGUISH: choose a negative Status Card to transfer · Escape to decline';
  const spectrePerkOrigin = (gameState as any).spectrePerkOrigin as { perkId: 'shadow-dagger' | 'relocate' | 'devour'; origin: 'spectre' | 'replica'; replicaId: string | null } | undefined;
  if (gameState.phase === 'choosing-spectre-perk-origin' && spectrePerkOrigin) {
    const selectedReplica = gameState.objects.find((object) => object.id === spectrePerkOrigin.replicaId);
    const selectedBody = spectrePerkOrigin.origin === 'replica' ? `REPLICA${selectedReplica ? ` AT ${cellLabel(selectedReplica.position)}` : ''}` : 'SPECTRE';
    const choiceLabel = spectrePerkOrigin.perkId === 'devour' ? 'DEVOUR TARGET' : spectrePerkOrigin.perkId === 'relocate' ? 'RELOCATE TARGET' : 'SHADOW DAGGER ORIGIN';
    prompt.textContent = `${choiceLabel}: ${selectedBody} · Tab or click to switch · Enter to confirm${spectrePerkOrigin.perkId === 'devour' ? '' : ' · Escape to cancel'}`;
  }
  if (select.kind === 'attack' && actor.character === 'spectre') prompt.textContent = `Preferred attack origin: ${selectedSpectreAttackOrigin === 'replica' ? 'Replica' : 'Spectre'} · targets available to either body are highlighted`;
  if (gameState.phase === 'double-jump') prompt.textContent = `Double Jump: ${gameState.doubleJump?.stepsRemaining ?? 0} one-square steps remain`;
  if (gameState.phase === 'wreckna-wisdom-discard') prompt.textContent = 'Phylactery of Wisdom: select 1 Card from Hand to discard before choosing a Defend Card';
  if (gameState.phase === 'choosing-end-discard' && actor.hand.length <= 5) prompt.textContent = 'Hand limit satisfied · discard more eligible cards or select End Turn';
  if (gameState.phase === 'choosing-force-throw-target') prompt.textContent = 'Force Throw: select a valid target · Escape to cancel';
  if (gameState.phase === 'choosing-force-throw-direction') prompt.textContent = 'Force Throw: select the linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-force-pull-target') prompt.textContent = 'Force Pull: select an enemy or Object · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-target') prompt.textContent = 'KYK: select an adjacent Object or enemy · Escape to cancel';
  if (gameState.phase === 'choosing-kyk-direction') prompt.textContent = 'KYK: select a highlighted legal push direction · Escape to cancel';
  if (gameState.phase === 'choosing-arkane-arow-target') {
    const shadow = (gameState as any).spectreShadow as { casterId: PlayerId; origin?: 'spectre' | 'replica' } | undefined;
    prompt.textContent = shadow
      ? `SHADOW DAGGER FROM ${shadow.origin === 'replica' ? 'REPLICA' : 'SPECTRE'}: select a highlighted horizontal, vertical, or diagonal direction · Escape to cancel`
      : `ARKANE AROW: select a highlighted Square within Range ${gameState.arkaneArow!.range} · Escape to cancel`;
  }
  if (gameState.phase === 'choosing-arm-da-wiz-choice') prompt.textContent = 'Arm da Wiz: choose Recall or Create Shield · Escape to cancel';
  if (gameState.phase === 'choosing-arm-da-wiz-create-payment') prompt.textContent = 'Arm da Wiz: spend 1 HP or 1 Rage Stack to create Shield · Escape to cancel';
  if (gameState.phase === 'choosing-arm-da-wiz-target') prompt.textContent = 'Arm da Wiz: select your Shield anywhere on the Board · Escape to cancel';
  if (gameState.phase === 'choosing-test-phylactery-target') {
    const sacrifice = Boolean((gameState as GameState & { testPhylactery?: { sacrificeEnemyId?: PlayerId } | null }).testPhylactery?.sacrificeEnemyId);
    prompt.textContent = sacrifice ? `Sacrifice: select a non-Column Object within Range ${effectiveAttackRange(gameState, actor)}` : 'Test Phylactery: select any Object except a Column · Escape to cancel';
  }
  if (gameState.phase === 'choosing-immortality-phylactery') prompt.textContent = 'Immortality: choose an active Phylactery to sacrifice and teleport onto';
  if (gameState.phase === 'choosing-lichdom-target') prompt.textContent = `Lichdom: select an Object within Range ${effectiveAttackRange(gameState, actor)} except a Column · Escape to cancel`;
  if (gameState.phase === 'choosing-lichdom-copy') prompt.textContent = 'Lichdom: choose a Card in Hand to create a one-time copy';
  if ((gameState.phase as string) === 'choosing-dakkoth-tomb-square') prompt.textContent = `Dakkoth: create a Tomb within Range ${effectiveAttackRange(gameState, actor)}`;
  if ((gameState.phase as string) === 'choosing-dakkoth-tomb-sacrifice') prompt.textContent = `Dakkoth: select one of your Tombs within Range ${effectiveAttackRange(gameState, actor)} to sacrifice`;
  if ((gameState.phase as string) === 'choosing-dakkoth-phylactery-target') prompt.textContent = `Dakkoth: select another Object within Range ${effectiveAttackRange(gameState, actor)} except a Column`;
  if ((gameState.phase as string) === 'choosing-sap-target') prompt.textContent = `Sap: select an enemy within Range ${effectiveAttackRange(gameState, actor)} · Escape to cancel`;
  if ((gameState.phase as string) === 'choosing-necronomicon-tomb') prompt.textContent = `Necronomicon: select a Tomb within Range ${effectiveAttackRange(gameState, actor)} · Escape to cancel`;
  if ((gameState.phase as string) === 'choosing-necronomicon-discard') {
    const pending = (gameState as GameState & { necronomicon?: { discardQueue: { playerId: PlayerId; remaining: number }[] } }).necronomicon?.discardQueue[0];
    if (pending) prompt.textContent = `${gameState.players[pending.playerId].name}: discard ${pending.remaining} Card${pending.remaining === 1 ? '' : 's'} for Necronomicon`;
  }
  if ((gameState.phase as string) === 'choosing-decay-target') prompt.textContent = `Decay: select an enemy within Range ${effectiveAttackRange(gameState, actor)} · Escape to cancel`;
  if ((gameState.phase as string) === 'choosing-decay-discard') {
    const decay = (gameState as GameState & { decay?: { targetId?: PlayerId; remaining: number } }).decay;
    if (decay?.targetId) prompt.textContent = `${gameState.players[decay.targetId].name}: discard ${decay.remaining} Card${decay.remaining === 1 ? '' : 's'} for Decay`;
  }
  if (gameState.phase === 'choosing-mind-tricks-discard') prompt.textContent = `Mind Tricks: reveal up to ${gameState.mindTricks!.maxDiscards} card${gameState.mindTricks!.maxDiscards === 1 ? '' : 's'} · Escape cancels before the first reveal`;
  if (gameState.phase === 'choosing-mind-tricks-enemy-discard') prompt.textContent = `Mind Tricks: discard ${gameState.mindTricks!.enemyDiscardsRemaining} card${gameState.mindTricks!.enemyDiscardsRemaining === 1 ? '' : 's'}`;
  if (gameState.phase === 'choosing-preparation-teleport') prompt.textContent = 'Preparation: select a visible Object to swap places with · Escape to cancel';
  if (gameState.phase === 'choosing-blink-teleport') prompt.textContent = 'Blink: select a visible empty Square to teleport';
  if (gameState.phase === 'choosing-blink-discard') prompt.textContent = 'Blink: choose one eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-base-placement') prompt.textContent = `${gameState.players[gameState.activePlayerId].name}: choose a Square on a bright red unclaimed base`;
  if (gameState.phase === 'choosing-preparation-discard') prompt.textContent = 'Preparation: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-snowball-discard') prompt.textContent = 'Snowball Effect: select any eligible Card from your Hand to discard';
  if (gameState.phase === 'choosing-grimoire-discard') prompt.textContent = `Grimoire Cleanse: discard ${gameState.pendingAttack?.grimoireDiscardsRemaining ?? 0} more Card(s)`;
  if (gameState.phase === 'choosing-shadow-barter-discard') prompt.textContent = 'Shadow Barter: the target must discard 1 Card';
  if (gameState.phase === 'choosing-soul-strike-discard') prompt.textContent = 'Soul Strike: the target must discard 1 Card revealed to Spectre';
  if (gameState.phase === 'shadow-barter-tomb-offer') prompt.textContent = 'Shadow Barter: choose whether to create a Tomb';
  if (gameState.phase === 'choosing-shadow-barter-tomb-square') prompt.textContent = 'Shadow Barter: select an empty Square within Range 1';
  if (gameState.phase === 'choosing-arcane-missle-target') prompt.textContent = 'Arcane Missile: select a valid enemy · Escape to cancel';
  if (gameState.phase === 'choosing-fireball-target') prompt.textContent = 'Fireball: select an enemy within Range 3 · Escape to cancel';
  if (gameState.phase === 'choosing-boomerang-target') prompt.textContent = 'Boomerang: select an enemy within Range 3 · Range 1 automatically uses an Action for 2 Damage · Range 2-3 is a Free Action for 1 Damage · Escape to cancel';
  if (gameState.phase === 'choosing-portal-target') prompt.textContent = 'Portal: select a visible empty Square · Escape to cancel';
  if (gameState.phase === 'choosing-spirit-guardian-square') prompt.textContent = 'Spirit Guardian: select an empty highlighted Square within Range · Escape to cancel';
  if (gameState.phase === 'choosing-chain-lightning-target') prompt.textContent = 'Chain Lightning: select an enemy in range and line of sight · Escape to cancel';
  if (gameState.phase === 'choosing-magic-hand-target') prompt.textContent = 'Magic Hand: select any visible Object · Escape to cancel';
  if (gameState.phase === 'choosing-magic-hand-direction') prompt.textContent = 'Magic Hand: select any linear push direction · Escape to cancel';
  if (gameState.phase === 'choosing-shizzle-destination') prompt.textContent = `Shizzle: select an empty Square in a direct line up to ${gameState.shizzle!.stepsRemaining} Squares away · Escape to cancel`;
  if (gameState.phase === 'shizzle-move') prompt.textContent = `Shizzle Consume: ${gameState.shizzle!.stepsRemaining} one-Square moves remain${gameState.shizzle!.started ? '' : ' · Escape to cancel before moving'}`;
  if (selectedTestObjectId) prompt.textContent = 'WOODEN BOX SELECTED · click an empty highlighted Square · Escape to cancel';
  if ((gameState.phase as string) === 'choosing-yamato-move') prompt.textContent = 'Yamato: select an empty adjacent Square, or choose Stay in Place';
  prompt.classList.toggle('visible', Boolean(prompt.textContent));
  byId('directPerkButton').classList.toggle('hidden', select.kind !== 'perk');
  const choosingMindTricks = gameState.phase === 'choosing-mind-tricks-discard';
  byId('mindTricksFinishButton').classList.toggle('hidden', !choosingMindTricks);
  byId('mindTricksFinishButton').textContent = choosingMindTricks && (gameState.mindTricks?.discarded ?? 0) > 0 ? 'Finish Mind Tricks selection' : 'Use Mind Tricks without revealing';
  const cancelDanceButton = byId('finishDanceButton') as HTMLButtonElement;
  const choosingYamatoMove = (gameState.phase as string) === 'choosing-yamato-move';
  cancelDanceButton.classList.toggle('hidden', gameState.phase !== 'dance-through' && !choosingYamatoMove);
  cancelDanceButton.textContent = choosingYamatoMove ? 'Stay in Place' : 'Cancel Dance Through';
  const danceOccupied = Boolean(gameState.danceThrough?.enemyUnderfoot || (gameState.danceThrough as typeof gameState.danceThrough & { objectUnderfoot?: string | null } | null)?.objectUnderfoot);
  cancelDanceButton.disabled = (!choosingYamatoMove && danceOccupied) || !canLocalAct(actingPlayer());
  cancelDanceButton.title = choosingYamatoMove ? 'Resolve Yamato without moving.' : danceOccupied ? 'Shinobi must leave the occupied Square before cancelling.' : 'End Dance Through movement early.';
  const cancelMovementButton = byId('cancelMovementButton') as HTMLButtonElement;
  const movementUndo = gameState.movementUndo;
  const canCancelMovement = Boolean(movementUndo && movementUndo.playerId === actor.id && movementUndo.actionsRemaining === actor.actionsRemaining && movementUndo.perkUsed === actor.perkUsed && ['active', 'dashing'].includes(gameState.phase) && canLocalAct(actor.id));
  cancelMovementButton.classList.toggle('hidden', !canCancelMovement);
  cancelMovementButton.disabled = !canCancelMovement;
  (byId('freeMoveButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || actor.freeMoveUsed || !canLocalAct(actor.id);
  (byId('guardButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || !canLocalAct(actor.id);
  const canPayForDash = actor.hand.some((card) => card.cardId === 'burning' || (!cardDefinition(card).cannotBeDiscarded && !cardDefinition(card).name.startsWith('Blessing:')));
  (byId('dashButton') as HTMLButtonElement).disabled = gameState.phase !== 'active' || !actor.freeMoveUsed || !canPayForDash || !canLocalAct(actor.id);
  const shadow = (gameState as GameState & { spectreShadow?: { casterId: PlayerId; trail: Cell[] } | null }).spectreShadow;
  const spectreInsideShadowTransit = actor.character === 'spectre' && shadow?.casterId === actor.id && isSpectreShadowTrailCell(gameState, actor, actor.position) && (
    Object.values(gameState.players).some((candidate) => candidate.id !== actor.id && candidate.hp > 0 && candidate.position.x === actor.position.x && candidate.position.y === actor.position.y)
    || gameState.objects.some((object) => object.kind !== 'wooden-box' && object.position.x === actor.position.x && object.position.y === actor.position.y)
  );
  const hasFreeShadowExit = Boolean(spectreInsideShadowTransit && shadow?.trail.some((cell) => {
    const path = movementPath(gameState, actor, cell);
    return path.length > 0 && movementCost(gameState, actor, path) === 0;
  }));
  if (spectreInsideShadowTransit) {
    prompt.textContent = hasFreeShadowExit ? 'Shadow Trail: leave the occupied Square for 0 MOV before ending the turn' : 'Shadow Trail: leave the occupied Square before ending the turn';
    prompt.classList.add('visible');
  }
  (byId('endTurn') as HTMLButtonElement).disabled = !['active', 'dashing', 'choosing-end-discard'].includes(gameState.phase) || Boolean(actor.spiritEnemyUnderfoot) || spectreInsideShadowTransit || (gameState.phase === 'choosing-end-discard' && actor.hand.length > 5) || !canLocalAct(actor.id);
  const currentTomb = actor.wrecknaInsideTombId ? gameState.objects.find((object) => object.id === actor.wrecknaInsideTombId && object.kind === 'tomb') : null;
  const hasFreeAdjacentTombMove = Boolean(currentTomb && gameState.objects.some((object) => object.kind === 'tomb' && object.id !== currentTomb.id && distance(object.position, currentTomb.position) === 1));
  if (((gameState.phase === 'active' && (actor.movementRemaining > 0 || hasFreeAdjacentTombMove || hasFreeShadowExit)) || gameState.phase === 'dashing' || gameState.phase === 'dance-through' || gameState.phase === 'double-jump' || gameState.phase === 'shizzle-move') && select.kind === 'none') selection.send({ type: 'SELECT_MOVE' });
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
    const stats = player.matchStats ?? { squaresMoved: 0, attackDamage: 0, perkDamage: 0, defensiveRetaliationDamage: 0, totalDamage: 0, hitPointsHealed: 0, combatDamageBlocked: 0, objectsDestroyed: 0 };
    const totalDamage = stats.attackDamage + stats.perkDamage + (stats.defensiveRetaliationDamage ?? 0);
    return `<tr style="--player-color:${playerUiColor(playerId)}"><th><i></i>${escapeHtml(player.name)}</th><td>${stats.squaresMoved}</td><td>${stats.attackDamage}</td><td>${stats.perkDamage}</td><td>${stats.defensiveRetaliationDamage ?? 0}</td><td>${totalDamage}</td><td>${stats.objectsDestroyed ?? 0}</td><td>${stats.hitPointsHealed}</td><td>${stats.combatDamageBlocked}</td></tr>`;
  }).join('');
  modal.innerHTML = `<section class="match-results-window"><p>MATCH COMPLETE</p><h2 id="matchResultsTitle">${winner ? `${escapeHtml(winner.name)} wins` : 'Match results'}</h2><div class="match-results-scroll"><table><thead><tr><th>Character</th><th>Squares<br>Moved</th><th>Attack<br>Damage</th><th>Perk<br>Damage</th><th>Retaliation<br>Damage</th><th>Total<br>Damage</th><th>Objects<br>Destroyed</th><th>HP<br>Healed</th><th>Combat Damage<br>Blocked</th></tr></thead><tbody>${rows}</tbody></table></div><button type="button" id="closeMatchResults">Review battlefield</button></section>`;
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
  const character = player.character as HotseatCharacter;
  const info = CHARACTER_SELECT_INFO[character];
  if (!info.trait) return `<h2 id="hintsTitle">${escapeHtml(player.name)} · ${ru ? 'Персонаж' : 'Character'}</h2><p class="empty-advice">${ru ? 'Черты и карты этого персонажа будут добавлены позже.' : 'Traits and Cards for this character will be added later.'}</p>`;
  if (character === 'merylin') return `<h2 id="hintsTitle">${escapeHtml(info.name)} · ${ru ? 'Персонаж' : 'Character'}</h2><article class="character-hint-card" style="--character-color:${playerUiColor(player.id)}"><header><span>${escapeHtml(info.traitIcon)}</span><div><small>${ru ? 'ОСОБЕННОСТЬ ПЕРСОНАЖА' : 'CHARACTER TRAIT'}</small><h3>Swordcraft</h3></div></header><p>${escapeHtml(info.traitDescription)}</p><p class="character-hint-detail">Attack Cards require an active Summon. Using an Attack consumes the current Summon. If that Attack grants Summon, the new Summon is applied after the spent one and can enable another Attack during the same turn.</p><strong>Current state: ${player.merylinSummonActive ? 'Summon active · Attack enabled' : 'no Summon · Attacks disabled'}.</strong><footer><span>HP <b>${player.maxHp}</b></span><span>MOV <b>${player.moveRange}</b></span><span>ATTACK RANGE <b>MELEE</b></span></footer></article>`;
  const traitCharacter = character as Exclude<SelectableCharacter, 'merylin'>;
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
        : 'Da Orkk gains 1 Rage when damaged by a Card or Action, at most once per overall effect; a separate later effect may grant Rage again. Every stored stack adds +1 ATT to an Attack, then every Rage Stack applied to that Attack is consumed unless the target was an Object. One Rage Stack is also removed at turn end. If Orkk starts his turn with no Shield and no Rage, he gains 1 Rage.',
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
    spectre: {
      trait: 'Replica',
      description: ru
        ? 'Spectre создаёт одну неподвижную Реплику. Spectre и Реплика используют общие HP, Руку, Колоду, Сброс, Действия, модификаторы и ограничения хода. Любое тело может быть источником ближней Атаки, а урон по Реплике снимает HP Spectre.'
        : 'Spectre creates one immobile Replica. Spectre and the Replica share HP, Hand, Deck, Discard, Actions, modifiers, and turn limits. Either body may originate a melee Attack, and Damage dealt through combat against the Replica reduces Spectre’s HP.',
      detail: ru
        ? 'Позиционные правила используют участвующее тело: дальность, линия видимости и Высота берутся от атакующего тела; бонус Базы и эффекты вокруг защищающегося — от атакованного тела. Реплика блокирует движение и линию видимости, считается Объектом и может быть перемещена толчком или притягиванием.'
        : 'Positional rules use the involved body: Range, line of sight, and High Ground come from the attacking body; Base DEF and centered defensive effects come from the attacked body. The Replica blocks movement and line of sight, counts as an Object, and can be pushed or pulled.',
      status: ru
        ? `Сейчас: ${gameState.objects.some((object) => object.kind === 'spectre-replica' && object.ownerId === player.id) ? 'Реплика находится на поле' : 'Реплики нет'}.`
        : `Current state: ${gameState.objects.some((object) => object.kind === 'spectre-replica' && object.ownerId === player.id) ? 'Replica on the Board' : 'no Replica'}.`,
    },
    wreckna: {
      trait: 'Phylactery · Entombed',
      description: ru ? 'Наполняйте Объекты бессмертной душой Врекны и усиливайте карты в зависимости от типа Филактерии. Пока существует хотя бы одна Филактерия, урон не может снизить HP Врекны ниже 1, но атакующий получает полную статистику урона.' : 'Infuse Objects with Wreckna’s undead Soul and increase Card power depending on the Phylactery type. While at least one Phylactery exists, Damage cannot reduce Wreckna below 1 HP, but the attacker receives full post-match Damage credit.',
      detail: ru ? 'Entombed: потратьте 2 MOV, чтобы войти в Гробницу. Восстановите 1 HP, если начинаете ход внутри Гробницы.' : 'Entombed: Spend 2 MOV to enter a Tomb. Restore 1 Hit Point when beginning a turn inside a Tomb.',
      status: player.wrecknaInsideTombId ? (ru ? 'Текущий статус: внутри Гробницы.' : 'Current state: inside a Tomb.') : (ru ? 'Текущий статус: левитирует на поле.' : 'Current state: levitating on the Board.'),
    },
    'john-christ': {
      trait: 'Possessed',
      description: ru
        ? 'После получения любого урона John Christ входит в Spirit Form. В этой форме все его карты Атаки получают +2 ATT, дальность Атаки становится ближней (1 клетка), а Form получает 1 MOV независимо от отрицательных эффектов движения. Он может проходить через клетки с врагами. Каждая занятая врагом клетка возвращает потраченный на вход 1 MOV и один раз за ход отнимает 1 MOV у пересечённого врага до конца его хода. Он не может завершить движение или ход на одной клетке с врагом. После выхода из Spirit Form дальность Атаки снова становится 3.'
        : 'After receiving any Damage, John Christ enters Spirit Form. In this form, all of his Attack Cards gain +2 ATT, his Attack Range becomes melee Range 1, and the Form receives 1 MOV regardless of negative movement effects. He may move through enemy-occupied Squares. Each enemy-occupied Square refunds the 1 MOV spent to enter it and siphons 1 MOV from that enemy until the end of their turn, once per enemy per John turn. He cannot finish movement or end his turn on the same Square as an enemy. Leaving Spirit Form restores Attack Range 3.',
      detail: ru
        ? 'Spirit Form запрещает использовать карты, в названии которых есть “Bless”. Негативные модификаторы MOV применяются к общему запасу John и не уменьшают собственный 1 MOV формы. Исключение: если John в одном ходу вошёл в Form, потратил её MOV, вышел, затем потратил весь оставшийся общий MOV и вошёл снова, повторный вход даёт 0 MOV. Если общий MOV ещё остался, повторный вход даёт 1 MOV. Полностью потраченный MOV формы уменьшает общий запас на 1 при выходе; возвраты за занятые клетки его не увеличивают. Форма проходит сквозь врагов, Объекты, Щиты и Стены. Blessing создаёт Stoic Shell; урон снимает все Stacks.'
        : 'Spirit Form prevents Cards containing “Bless” in their name from being used. Negative MOV modifiers affect John’s cumulative pool and never reduce the Form’s own 1 MOV. Exception: if John enters the Form, spends its MOV, exits, spends all remaining cumulative MOV, and enters again during the same turn, that second entry has 0 MOV. If cumulative MOV remains, re-entry still grants 1 MOV. Fully spending the Form’s MOV subtracts 1 from the cumulative pool on exit; occupied-Square refunds do not increase it. The Form crosses enemies, Objects, Shields, and Walls. Blessings create Stoic Shell; Damage removes all Stacks.',
      status: ru
        ? `Сейчас: ${player.spiritForm ? 'Spirit Form активна' : 'обычная форма'} · Stoic Shell ${player.stoicShell ? 'активна' : 'неактивна'} · отложено Blessing: ${player.queuedBlessingCardIds.length}.`
        : `Current state: ${player.spiritForm ? 'Spirit Form active' : 'normal form'} · Stoic Shell ${player.stoicShell ? 'active' : 'inactive'} · queued Blessings: ${player.queuedBlessingCardIds.length}.`,
    },
  }[traitCharacter];
  return `<h2 id="hintsTitle">${escapeHtml(info.name)} · ${ru ? 'Персонаж' : 'Character'}</h2><article class="character-hint-card" style="--character-color:${playerUiColor(player.id)}"><header><span>${escapeHtml(info.traitIcon)}</span><div><small>${ru ? 'ОСОБЕННОСТЬ ПЕРСОНАЖА' : 'CHARACTER TRAIT'}</small><h3>${escapeHtml(copy.trait)}</h3></div></header><p>${escapeHtml(copy.description)}</p>${copy.detail ? `<p class="character-hint-detail">${escapeHtml(copy.detail)}</p>` : ''}<strong>${escapeHtml(copy.status)}</strong><footer><span>HP <b>${player.maxHp}</b></span><span>MOV <b>${player.moveRange}</b></span><span>${ru ? 'ДАЛЬНОСТЬ АТАКИ' : 'ATTACK RANGE'} <b>${player.attackRange}</b></span></footer></article>`;
}

function damageLogHtml(ru: boolean) {
  type DamageEntry = { eventType?: 'damage' | 'healing'; turn: number; targetId: PlayerId; sourceId: PlayerId; sourceKind: 'attack' | 'perk' | 'defense' | 'other'; amount: number; hpAfter: number; collision: boolean };
  const entries = ((gameState as GameState & { damageLog?: DamageEntry[] }).damageLog ?? []);
  const combatRows = gameState.log.map((line, index) => `<li><i>#${gameState.log.length - index}</i><span>${escapeHtml(line)}</span></li>`).join('');
  const combatLog = `<section class="damage-log-combat"><header><div><h3>${ru ? 'Журнал боя' : 'Combat Log'}</h3><p>${ru ? `Все записи: ${gameState.log.length}` : `All entries: ${gameState.log.length}`}</p></div></header>${combatRows ? `<ol>${combatRows}</ol>` : `<div class="damage-log-empty">${ru ? 'Записей боя пока нет.' : 'There are no combat entries yet.'}</div>`}</section>`;
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
  return `<h2 id="hintsTitle">${ru ? 'Журнал урона' : 'Damage Log'}</h2><p class="damage-log-intro">${ru ? 'Каждая отдельная запись урона, полученного персонажами в этом матче. Потеря HP не считается уроном.' : 'Every separate instance of damage received by a character in this match. Effects that explicitly lose HP are not damage.'}</p><div class="damage-log-grid">${sections}</div>${combatLog}`;
}

function renderDiscardModal() {
  const modal = byId('discardModal');
  const player = discardViewerPlayerId ? gameState.players[discardViewerPlayerId] : null;
  modal.classList.toggle('hidden', !player);
  if (!player) return;
  const cards = [...player.discard].reverse();
  byId('discardContent').innerHTML = `<span class="discard-eyebrow">PUBLIC CARD INFORMATION</span><h2 id="discardTitle">${escapeHtml(player.name)} · Discard Deck</h2><p>${cards.length} Card${cards.length === 1 ? '' : 's'} · newest discarded Card shown first</p>${cards.length === 0 ? '<div class="discard-empty">This Discard Deck is empty.</div>' : `<div class="discard-card-grid">${cards.map((instance, index) => { const card = cardDefinition(instance); return `<article class="card ${cardVisualClass(card)}"><span>${index === 0 ? 'TOP OF DISCARD · ' : ''}${card.kind.toUpperCase()}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></article>`; }).join('')}</div>`}`;
}

function hintsRulesHtml(ru: boolean) {
  if (ru) return `<h2 id="hintsTitle">Правила хода</h2><div class="rules-grid">
    <article><h3>Доступные действия</h3><p><b>Свободное движение + карта:</b> возьмите карту и получите очки движения. Можно двигаться до и после других действий.</p><p><b>Атака:</b> выберите карту Атаки и допустимую цель. Обычно доступно до двух Действий за ход.</p><p><b>Перк:</b> разыграйте один Перк напрямую на 1-м уровне или поместите его в Spell Echo. За ход можно использовать только один Перк.</p><p><b>Защита:</b> когда вас атакуют, сыграйте карту Защиты или примите удар.</p><p><b>Завершающие приёмы:</b> Guard — взять и сбросить карту; Dash — сбросить карту, не являющуюся Blessing, и снова двигаться. Оба немедленно завершают ход.</p></article>
    <article><h3>Правила боя</h3><p>Сравните итоговую Силу Атаки и Защиты после всех бонусов и штрафов. Если Атака выше, цель получает урон, равный разнице. При равенстве или меньшей Атаке боевой урон не наносится.</p><p>Эффекты карт срабатывают в указанное время: до боя, во время сравнения или после боя. Эффект, отменяющий карту Атаки, не отменяет внешние бонусы к её Силе.</p><h3>Статусные карты</h3><p>Статусные карты занимают место в Руке и действуют, пока находятся там. Их оранжевая рамка отличает их от обычных карт. Правила конкретного Статуса определяют, можно ли его сбросить или удалить. При лимите Руки в 5 карт несбрасываемые Статусы нельзя выбрать для обычного сброса.</p></article></div>`;
  return `<h2 id="hintsTitle">Turn Rules</h2><div class="rules-grid">
    <article><h3>Available Player Actions</h3><p><b>Free Move + Draw Card:</b> draw a Card and gain movement. Movement may be split before and after other Actions.</p><p><b>Action: Attack:</b> select an Attack Card and a valid target. A Player normally has up to two Actions per turn.</p><p><b>Action: Perk:</b> play one Perk directly at Level 1 or place it in Spell Echo. Only one Perk may be used each turn.</p><p><b>Action: Defend:</b> when attacked, play a Defend Card or take the hit.</p><p><b>Finishing Moves:</b> Guard draws and discards a Card; Dash discards one non-Blessing Card and grants another movement. Either immediately ends the turn when resolved.</p></article>
    <article><h3>Combat Stack</h3><ol><li><b>Before combat:</b> resolve the Defender's pre-combat Card effect first, then the Attacker's pre-combat Card effect.</li><li><b>Reveal:</b> reveal the selected Attack and Defend Cards. The combat screen lists every pre-combat Value change, Damage instance, and cancelled effect.</li><li><b>Combat Cards:</b> a Combat Card is any separate Card from Hand that can optionally be applied after the Attack and Defend Cards have been selected and played. Each Player privately selects no more than one applicable Combat Card, or selects “Use no Combat Cards.” Neither Player's selection or effect is shown until both have submitted.</li><li><b>Combat Card reveal:</b> reveal both selections together, apply their effects, update Attack and Defend Values, and list every newly applied effect.</li><li><b>Result and confirmation:</b> compare the final Values. Attack above Defend deals the difference as combat Damage; a tie or lower Attack deals none. After both Players confirm and close the combat screen, resolve and animate the Attacker's post-combat effects first, followed by the Defender's post-combat effects.</li></ol><p>Cancelling a played Card's effect does not cancel external modifiers unless their own rules say so. Choices intrinsic to the already played Attack or Defend Card are combat effects, but are not additional Combat Cards from Hand.</p><h3>Status Cards</h3><p>Status Cards occupy Hand space and apply their effects while held. Their orange highlight distinguishes them from regular Cards. Each Status specifies whether it may be discarded or Removed. At the five-Card end-of-turn Hand limit, non-discardable Status Cards cannot be chosen for a normal discard. By default, a Blessing is Removed from its holder's Deck whenever that holder uses or discards it, unless the Blessing explicitly states otherwise.</p></article></div>`;
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
  return `<h2 id="hintsTitle">${heading}</h2><p class="ai-advice-label">${ru ? 'ТАКТИЧЕСКАЯ AI-ПОДСКАЗКА · ОБНОВЛЯЕТСЯ ВМЕСТЕ С РУКОЙ' : 'TACTICAL AI SUGGESTION · UPDATES WITH YOUR HAND'}</p><div class="advice-list">${adviceCards.map((card) => `<article class="advice-card ${cardVisualClass(card)}" data-advice-card="${card.id}"><header><strong>${escapeHtml(card.name)}</strong><span>${card.value} ${ru ? card.kind === 'attack' ? 'АТК' : card.kind === 'defend' ? 'ЗАЩ' : card.kind === 'perk' ? 'ПЕРК' : 'СТАТУС' : card.kind.toUpperCase()}</span></header><p>${cardTacticalAdvice(card, player, ru)}${statusGeneratorAdvice(card.id, cards, ru)}</p></article>`).join('')}</div>`;
}

type StatusCardId = 'pinned' | 'headache' | 'exhaust' | 'burning' | 'panic' | 'blessing-light' | 'blessing-prayer' | 'blessing-might' | 'blessing-shield' | 'blessing-swiftness' | 'blessing-faith';
const STATUS_CARD_GENERATORS: Record<StatusCardId, readonly CardTypeId[]> = {
  pinned: ['light-the-saber', 'dance-through', 'cut-them-legs', 'block', 'double-jump', 'force-pull', 'swiftform'],
  headache: ['counterspell', 'hello-there', 'mind-tricks', 'knee-blast', 'countaspell', 'enforce', 'mind-blast'],
  exhaust: ['force-disarm', 'consume-rage', 'teef-strike', 'blessed-light'],
  burning: ['fireball', 'cleanse', 'thorns'],
  panic: ['enforce', 'fear-the-justice'],
  'blessing-light': ['blessed-light'],
  'blessing-prayer': ['blessed-prayer'],
  'blessing-might': ['blessed-might'],
  'blessing-shield': ['blessed-block'],
  'blessing-swiftness': ['blessed-swiftness'],
  'blessing-faith': ['inner-peace'],
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
  fireball: { en: 'Deal 2 direct Damage and add Burning to the target’s Hand. Burning deals 1 Damage at turn end if still held; Dash deals that Damage first, then Removes it and moves the target randomly.', ru: 'Нанесите 2 прямого урона и добавьте Горение в Руку цели. Burning наносит 1 урон в конце хода, если остаётся в Руке; Dash сначала наносит этот урон, затем удаляет карту и перемещает цель случайно.' },
  portal: { en: 'A one-use Free Action reposition. Escape danger, claim High Ground or a draw Square, or set up the Range and line of sight for your next card without spending an Action. Portal is Removed when used or Discarded.', ru: 'Одноразовое глобальное перемещение Свободным Действием. Уходите из опасности, занимайте Высоту или клетку добора либо готовьте дальность и линию видимости для следующей карты, не тратя Действие. Portal удаляется из игры после применения или сброса.' },
  'vicious-mockery': { en: 'Keep this hidden until +2 changes a combat result. It can turn a narrow Attack into damage or make a crucial Defence hold, but is Removed once committed.', ru: 'Скрывайте карту, пока +2 не изменит исход боя. Она превращает близкую Атаку в урон или спасает ключевую Защиту, но после применения Удаляется.' },
  preparation: { en: 'A card-draw engine in Spell Echo: every use improves hand quality, while higher levels add Mana and filtering. During Consume, swap Logan with any visible movable Object, including Da Orkk’s unequipped Shield.', ru: 'Двигатель добора в Spell Echo: каждое применение улучшает Руку, а высокие уровни дают Ману и фильтрацию. При Consume поменяйте Логана местами с любым видимым перемещаемым объектом, включая снятый Щит Да Оркка.' },
  'arcane-missle': { en: 'Direct damage for targets that normal Attacks cannot conveniently reach. Level 2 routes around pillars, Level 3 reaches globally, and Consume turns it into a strong 3-damage finisher.', ru: 'Прямой урон по целям, которых неудобно доставать обычной Атакой. Уровень 2 обходит колонны, уровень 3 действует глобально, а Consume превращает заклинание в сильный добивающий удар на 3 урона.' },
  'chain-lightning': { en: 'Best when enemies and destructible Objects are clustered. Higher levels extend and repeat bounces; Consume is strongest in a crowded area where repeated hits can revisit targets.', ru: 'Лучше всего работает в скоплении врагов и разрушаемых Объектов. Высокие уровни удлиняют и повторяют скачки; Consume особенно силён в толпе, где молния может повторно поражать цели.' },
  'magic-hand': { en: 'Throw an Object 3 Squares within Range 5. Level 2 targets globally; Level 3 may target enemies and pushes until the board edge or a collision. Remaining momentum transfers through collisions without dealing Damage. Consume refunds 1 Action.', ru: 'Бросьте Объект на 3 клетки в радиусе 5. Уровень 2 даёт глобальную дальность; уровень 3 позволяет выбирать врагов и толкает до края поля или столкновения. Оставшийся импульс передаётся дальше без урона. Consume возвращает 1 Действие.' },
  shizzle: { en: 'Logan’s escape and reposition tool. Dash up to 2 Squares, increasing to 3 at Level 3. Pass through all characters and board Objects, including Columns, Shields, and Tombs. Finish on an empty Square. Level 2 adds pass-through damage; Consume allows turns between one-Square steps.', ru: 'Инструмент побега и смены позиции Логана. Совершите рывок до 2 клеток или до 3 клеток на уровне 3. Проходите сквозь всех персонажей и любые игровые Объекты, включая Колонны, Щиты и Гробницы. Заканчивайте на пустой клетке. Уровень 2 добавляет урон при прохождении; Consume позволяет менять направление между шагами.' },
  'arcane-bolt': { en: 'Lead a multi-Attack turn with this card: its +1 ATT improves later Attacks until turn end. Consume upgrades that persistent bonus to +2 ATT instead.', ru: 'Начинайте этой картой ход с несколькими Атаками: +1 ATT усилит последующие Атаки до конца хода. Consume вместо этого повышает постоянный бонус до +2 ATT.' },
  'snowball-effect': { en: 'A repeatable low-value Attack that returns to Hand. Use it when you can spend multiple Actions or need a reliable future Attack; Consume also cycles one unwanted Card after combat.', ru: 'Повторяемая Атака малого значения, возвращающаяся в Руку. Используйте при нескольких Действиях или чтобы сохранить Атаку на будущее; Consume после боя также заменяет одну ненужную карту.' },
  'mana-blast': { en: 'Pressure the enemy’s Hand: they either discard or let Logan gain Mana. It is strongest when their Hand contains valuable Cards; Consume raises ATT and threatens 3 MP if they can legally refuse a discard.', ru: 'Давите на Руку врага: он либо сбрасывает карту, либо даёт Логану Ману. Особенно полезно против ценных карт; Consume повышает ATT и угрожает 3 MP при законном отказе от сброса.' },
  'mana-barrage': { en: 'During normal combat, decide whether to spend exactly 1 stored Mana for 1 Damage. Consume replaces that choice with 2 guaranteed Damage after combat.', ru: 'В обычном бою решите, потратить ли ровно 1 сохранённую Mana ради 1 урона. Consume заменяет этот выбор гарантированными 2 единицами урона после боя.' },
  'grimoire-cleanse': { en: 'Win combat to force the target to discard up to two eligible Cards. With Consume, each Card they actually discard immediately grants Logan +1 MOV.', ru: 'Победите в бою, чтобы заставить цель сбросить до двух допустимых карт. При Consume каждая фактически сброшенная карта немедленно даёт Логану +1 MOV.' },
  spellblock: { en: 'Use against an Attack with a dangerous printed effect. It cancels that effect before combat and converts blocked Attack Value into Mana, combining protection with resource generation.', ru: 'Используйте против Атаки с опасным собственным эффектом. Карта отменяет его до боя и превращает заблокированное значение Атаки в Ману, совмещая защиту и генерацию ресурса.' },
  'mana-shield': { en: 'A Mana-dependent Defence that first generates 1 MP, then uses total stored Mana as DEF. Best when a small amount of Mana is enough to stop damage without emptying resources needed for a later Consume turn.', ru: 'Защита, зависящая от Маны: сначала даёт 1 MP, затем использует весь запас как DEF. Лучше всего, когда малого количества Маны достаточно для блока без потери ресурса на будущий Consume-ход.' },
  'arcane-barrier': { en: "Best against an adjacent attacker when the Square directly behind them is open. Arcane Barrier pushes them away after combat, or deals 1 Damage if that push is blocked.", ru: 'Лучше всего использовать против соседнего атакующего, когда клетка прямо за ним свободна. После боя Arcane Barrier отталкивает его, а если путь заблокирован — наносит 1 урон.' },
  counterspell: { en: 'A high-value Defence and retaliation tool. Keep at least 1 stored MP to deal 1 Damage to the attacker; Counterspell also places Headache on top of their Deck to disrupt the next draw.', ru: 'Сильная Защита и ответный удар. Сохраните хотя бы 1 MP, чтобы нанести атакующему 1 урон; Counterspell также кладёт Headache сверху его Колоды и портит следующий добор.' },
  blink: { en: 'Logan’s emergency Defence: it blocks all combat damage. With Mana, it also teleports him to safety; without Mana, expect to sacrifice a chosen Hand Card or a non-Status Card from Deck.', ru: 'Экстренная Защита Логана: блокирует весь боевой урон. При наличии Маны также телепортирует в безопасность; без Маны придётся пожертвовать выбранной картой Руки или не-Статусной картой Колоды.' },
  'blessed-light': { en: 'A setup Attack that plants Exhaust in the target’s Deck—on top if their Deck is empty—so a later draw can impose -1 ATT and DEF while Exhaust remains in Hand. It immediately creates revealed Blessing: Light and Stoic Shell; save that Blessing to reduce an enemy Defend Card by 1 in a later combat. Because its name contains “Blessed,” John cannot use this card in Spirit Form.', ru: 'Подготовительная Атака: замешивает Exhaust в Колоду цели, а при пустой Колоде кладёт его сверху. Exhaust даёт -1 ATT и DEF, пока находится в Руке. Карта сразу создаёт открытую Blessing: Light и Stoic Shell; сохраните Blessing, чтобы позже уменьшить DEF врага на 1. Из-за слова “Blessed” карта недоступна в Spirit Form.' },
  cleanse: { en: 'Use early to place Burning in the target’s Hand after combat. It deals 1 Damage at their turn end if still held; Dash deals that Damage before Removing Burning and spending movement randomly. The Status applies even if Cleanse loses combat, unless the Attack effect is cancelled.', ru: 'Используйте рано, чтобы после боя добавить Burning в Руку цели. В конце её хода карта наносит 1 урон, если остаётся в Руке; Dash наносит урон до удаления Burning и случайной траты движения. Статус применяется даже при проигранном бою, если эффект Атаки не отменён.' },
  repent: { en: 'A deliberate Spirit Form trigger and area punish: after combat John takes 1 Damage while every adjacent enemy takes 2 and erupts in Holy Fire. Use it while healthy and surrounded; successful self-Damage activates Spirit Form for a later non-Bless Attack.', ru: 'Осознанный вход в Spirit Form и наказание группы: после боя Джон получает 1 урон, а каждый соседний враг получает 2 урона и вспыхивает Святым Огнём. Используйте при достаточном HP и в окружении; прошедший самоурон включает Spirit Form для следующей Атаки без “Bless”.' },
  enforce: { en: 'A control Attack that applies both Panic and Headache after combat unless its debuffs are prevented. Panic greys out Attack and Perk Cards until Free Move Removes it and spends the target’s current movement randomly; Headache then remains dead Hand weight that costs an Action to Remove.', ru: 'Контрольная Атака, накладывающая после боя Panic и Headache, если дебаффы не предотвращены. Panic блокирует Атаки и Перки до Free Move и случайно тратит текущее движение цели; Headache остаётся мёртвым грузом в Руке и требует Действия для удаления.' },
  'blessed-might': { en: 'A high-value Attack that cancels the enemy Defend Card’s printed effect unless they use an effect-blocking Defence. After combat it creates revealed Blessing: Might and Stoic Shell; use that Blessing in a different combat for +2 ATT. Neither card can be used while John is in Spirit Form.', ru: 'Сильная Атака, отменяющая печатный эффект карты Защиты врага, если тот не применил Защиту, блокирующую эффект Атаки. После боя создаёт открытую Blessing: Might и Stoic Shell; используйте Blessing в другом бою ради +2 ATT. Обе карты недоступны в Spirit Form.' },
  'blessed-block': { en: 'Use against a low-value Attack with a dangerous printed effect: Blessed Block cancels that effect before combat. Blessing: Shield is queued for the beginning of John’s next eligible turn—not this combat—so the opponent gets a turn to break the resulting Stoic Shell with Damage.', ru: 'Используйте против слабой Атаки с опасным печатным эффектом: Blessed Block отменяет его до боя. Blessing: Shield ставится в очередь до начала следующего подходящего хода Джона и недоступна в этом бою; у врага будет ход, чтобы уроном снять появившийся Stoic Shell.' },
  'feed-the-spirit': { en: 'Best when the incoming combat Damage will make John enter Spirit Form without killing him: after combat that transition restores 2 HP. If any Blessing remains in Hand, you may Remove one for +1 HP; spend a low-impact Blessing: Faith or an expiring Prayer before a stronger combat Blessing.', ru: 'Лучше всего, когда входящий урон введёт Джона в Spirit Form, но не убьёт: после боя этот переход восстановит 2 HP. При наличии Blessing можно удалить одну ради ещё +1 HP; жертвуйте малополезной Faith или истекающей Prayer раньше сильной боевой Blessing.' },
  thorns: { en: 'Retaliates for 1 Damage before combat, potentially defeating a fragile attacker before values resolve. If combat Damage then makes John enter Spirit Form, Thorns adds Burning after combat; it deals 1 at that attacker’s turn end, or immediately before movement if they Remove it with Dash.', ru: 'Наносит атакующему 1 урон до боя и может добить его ещё до сравнения значений. Если боевой урон затем введёт Джона в Spirit Form, Thorns добавит Burning после боя; карта нанесёт 1 урон в конце хода атакующего либо непосредственно перед движением при удалении через Dash.' },
  'blessed-swiftness': { en: 'A tempo Defence: immediately erase all of the attacker’s unspent MOV to stop their post-combat reposition. Blessing: Swiftness is queued for John’s next eligible turn and grants +1 MOV while held; if Hand size is 6 or more, it is automatically Removed only when that turn begins ending.', ru: 'Темповая Защита: сразу аннулирует весь неизрасходованный MOV атакующего и мешает сменить позицию после боя. Blessing: Swiftness ставится в очередь на следующий подходящий ход Джона и даёт +1 MOV в Руке; при 6+ картах она автоматически удаляется только в начале завершения хода.' },
  resurrection: { en: 'Emergency Defence when at least one of John’s two Base Squares is empty. A legal teleport negates all combat and card-effect Damage, returns John to Base, and draws 1 Card. If both Base Squares are occupied, he still draws but receives Damage normally, so inspect the Base before committing a 0 DEF card.', ru: 'Экстренная Защита, если хотя бы одна из двух клеток Базы Джона свободна. Успешный телепорт отменяет весь боевой урон и урон эффектов, возвращает на Базу и даёт 1 карту. Если обе клетки заняты, добор остаётся, но урон не отменяется — проверяйте Базу перед выбором DEF 0.' },
  'blessed-prayer': { en: 'John’s Spell Echo engine. Level 1 immediately creates revealed Blessing: Prayer and Stoic Shell; Level 2 adds 1 MOV for this turn, and Level 3 retrieves a chosen Card from Discard. Avoid casting it in Spirit Form, and plan Prayer’s Free Action draw before its mandatory end-turn removal.', ru: 'Двигатель Spell Echo Джона. Уровень 1 сразу создаёт открытую Blessing: Prayer и Stoic Shell; уровень 2 даёт 1 MOV на этот ход, уровень 3 возвращает выбранную карту из Discard. Нельзя применять в Spirit Form; используйте Свободное Действие Prayer до её обязательного удаления в конце хода.' },
  'fear-the-justice': { en: 'Enter Spirit Form on demand without losing HP. At Level 2 every adjacent enemy receives Panic, disabling Attack and Perk Cards until Free Move Removes it while spending movement randomly; Level 3 also makes each affected enemy discard a Defend Card. Surround multiple enemies before using the higher levels.', ru: 'Позволяет войти в Spirit Form без потери HP. На уровне 2 каждый соседний враг получает Panic, блокирующий Атаки и Перки до Free Move со случайной тратой движения; уровень 3 также заставляет каждого затронутого врага сбросить карту Защиты. Перед высоким уровнем окружите несколько целей.' },
  'inner-peace': { en: 'A safe cleanse: leave Spirit Form so Bless cards become usable, then Remove a chosen negative Status from Hand. Level 2 Removes one additional random negative Status, preferring Hand, then Deck, then Discard; Level 3 creates revealed Blessing: Faith and Stoic Shell. Blessings and other positive Status Cards are never removed by this Perk.', ru: 'Безопасное очищение: выйдите из Spirit Form, снова открыв карты Bless, затем удалите выбранный отрицательный Статус из Руки. Уровень 2 случайно удаляет ещё один отрицательный Статус с приоритетом Рука → Колода → Discard; уровень 3 создаёт открытую Blessing: Faith и Stoic Shell. Этот Перк никогда не удаляет Blessing и другие положительные Статусы.' },
  'mind-blast': { en: 'Ranged Hand and draw disruption. Level 1 forces one discard, Level 2 adds 1 direct Damage, and Level 3 places 2 Headache Cards on top of the target’s Deck, burdening their next two draws with Status Cards that cost an Action to Remove. Use Level 3 just before their turn for the strongest draw denial.', ru: 'Дальнее разрушение Руки и добора. Уровень 1 заставляет сбросить карту, уровень 2 наносит 1 прямой урон, уровень 3 кладёт 2 карты Headache сверху Колоды цели, занимая два следующих добора Статусами, удаление которых требует Действия. Применяйте уровень 3 непосредственно перед ходом цели.' },
  'spirit-guardian': { en: 'Create a positional anchor within John’s Range; it remains through John’s Attack Card use and expires at the beginning of his next turn. While adjacent, gain +1 DEF and block the first 1 Perk Damage in each Action. Adjacency is checked when Damage resolves: if that same Perk pushes John away before collision Damage, nothing is blocked. Level 2 makes the Guardian an invincible Heavy Wall moved only 1 Square per push/pull; Level 3 gives adjacent enemies -1 Attack and Defend Value.', ru: 'Создайте позиционный якорь в Дальности Джона; использование Джоном карты Атаки не удаляет его, и Страж исчезает в начале следующего хода Джона. Пока Джон рядом, он получает +1 DEF и блокирует первую 1 единицу урона Перка в каждом Действии. Соседство проверяется в момент урона: если тот же Перк сначала вытолкнул Джона из зоны, урон столкновения не блокируется. Уровень 2 делает Стража неуязвимой Тяжёлой Стеной с перемещением лишь на 1 клетку за толчок/притягивание; уровень 3 даёт соседним врагам -1 к Атаке и Защите.' },
  'blessing-light': { en: 'A revealed combat Status. Apply it only when -1 to the enemy Defend Value changes the outcome. It grants Stoic Shell when created, but cannot be activated while John is in Spirit Form.', ru: 'Открытый боевой Статус. Применяйте, только когда -1 DEF врага меняет исход. При создании даёт Stoic Shell, но недоступна в Spirit Form.' },
  'blessing-prayer': { en: 'Convert 1 MOV into 1 drawn Card as a Free Action, then Remove this revealed Blessing. Use it after movement positioning is secure; otherwise it disappears at turn end. Creating it grants Stoic Shell, and Spirit Form prevents using it.', ru: 'Превратите 1 MOV в добор 1 карты Свободным Действием, затем удалите открытую Blessing. Используйте после завершения позиционирования, иначе она исчезнет в конце хода. Создание даёт Stoic Shell; в Spirit Form карта недоступна.' },
  'blessing-might': { en: 'A revealed combat finisher that adds +2 to John’s played Attack Card. Hold it for a combat where the bonus creates Damage or defeats the target. It cannot be applied during Spirit Form despite that form’s own +2 ATT.', ru: 'Открытый боевой финишер, добавляющий +2 к сыгранной Атаке Джона. Берегите для боя, где бонус создаст урон или добьёт цель. Карта не работает в Spirit Form, несмотря на собственные +2 ATT формы.' },
  'blessing-shield': { en: 'Apply after reveal for two independent protections during the rest of combat: absorb 1 Damage from an enemy Attack/Defend Card effect and automatically block the first negative Status application. Pre-combat Status effects have already resolved and are unaffected. A Shield generated by Blessed Block arrives next turn; Spirit Form prevents its use.', ru: 'Примените после раскрытия ради двух независимых защит до конца боя: поглотите 1 урон от эффекта вражеской Атаки/Защиты и автоматически заблокируйте первое наложение негативного Статуса. Предбоевые Статусы уже разрешены и не блокируются. Shield от Blessed Block приходит в следующий ход; Spirit Form не позволяет его использовать.' },
  'blessing-swiftness': { en: 'A revealed passive Status granting +1 MOV while in Hand. Keep Hand size at 5 or fewer when ending the turn if you want to retain it; at 6 or more it is Removed at the beginning of the end-turn process. Its creation also grants Stoic Shell.', ru: 'Открытый пассивный Статус, дающий +1 MOV в Руке. Завершайте ход с 5 или менее картами, если хотите сохранить его; при 6+ он удаляется в самом начале процесса окончания хода. Создание также даёт Stoic Shell.' },
  'blessing-faith': { en: 'A revealed one-combat sanctuary. Apply it to negate every Damage instance dealt to both attacker and defender, including combat-value and card-effect Damage. If unused, it expires at the beginning of your next turn, so use it in the current enemy turn when meaningful.', ru: 'Открытое убежище на один бой. Примените, чтобы отменить весь урон обеим сторонам — и от разницы боевых значений, и от эффектов карт. Если не использовать, карта исчезнет в начале вашего следующего хода, поэтому применяйте её во время текущего хода врага, когда это выгодно.' },
  'light-the-saber': { en: 'An efficient setup Attack. Apply Pinned early to reduce enemy mobility and prepare Calmness, Double Jump, or Hello There for stronger follow-up value.', ru: 'Эффективная подготовительная Атака. Наложите Pinned заранее, чтобы снизить мобильность врага и усилить последующие Calmness, Double Jump или Hello There.' },
  'dance-through': { en: 'Attack and reposition in one Action. After combat, weave through enemies, Objects, and Wall Objects to cross blocked lanes or apply Pinned, but reserve the final step for an unoccupied Square.', ru: 'Атака и смена позиции за одно Действие. После боя проходите сквозь врагов, Объекты и Объекты-Стены, но оставьте последний шаг для незанятой клетки.' },
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
  'mind-tricks': { en: 'Trade information for Hand disruption without losing the revealed Cards. Level 2 also plants future draw disruption with Headache; Level 3 lets you reveal and force the discard of up to two Cards.', ru: 'Обменивайте информацию на разрушение Рук, не теряя показанные карты. Уровень 2 также портит будущий добор картой Headache; уровень 3 позволяет раскрыть и заставить сбросить до двух карт.' },
  'arkane-arow': { en: 'Throw the equipped Shield within Range 3 to create a destructible Heavy wall exactly where it best blocks movement or line of sight. Level 2 raises collision Damage to 2; Level 3 also pushes and punishes a blocked push.', ru: 'Бросайте экипированный Щит в пределах дальности 3, создавая разрушаемую Тяжёлую стену там, где она лучше всего перекрывает движение или линию видимости. Уровень 2 повышает урон столкновения до 2; уровень 3 также толкает и наказывает за невозможный толчок.' },
  'arm-da-wiz': { en: 'Recall a chosen unequipped Shield from anywhere on the Board or create a new one without removing existing Shields. A recall pulls crossed enemies 1 Square toward Orkk; Level 2 damages them, and Level 3 then damages enemies adjacent after equipping.', ru: 'Верните выбранный снятый Щит из любой точки поля или создайте новый, не удаляя прежние. Возврат притягивает пересечённых врагов на 1 клетку к Оркку; уровень 2 наносит им урон, а уровень 3 затем ранит соседних врагов после экипировки.' },
  encourage: { en: 'Da Orkk’s card-advantage engine. Keep it cycling in Spell Echo: draw now, add Rage at Level 2, and recover a useful random discard at Level 3.', ru: 'Двигатель преимущества по картам Да Оркка. Прокручивайте в Spell Echo: добор сейчас, Rage на 2-м уровне и возврат случайной полезной карты из Discard на 3-м.' },
  kyk: { en: 'Turn a nearby Object into a long-range projectile. Choose a line that ends in an enemy collision; Level 3 deals heavy damage but permanently destroys the projectile, so spend disposable Objects.', ru: 'Превращайте соседний Объект в дальний снаряд. Выбирайте линию, заканчивающуюся столкновением с врагом; уровень 3 наносит большой урон, но уничтожает снаряд, поэтому используйте расходные Объекты.' },
  'consume-rage': { en: 'Convert Rage into healing instead of spending it on an Attack. Level 1 converts 1 Rage into 1 HP; Levels 2–3 may convert a second Rage into a second HP. Level 3 also adds Exhaust to every adjacent enemy and removes all negative Status Cards from Da Orkk.', ru: 'Превращайте Rage в лечение вместо расхода на Атаку. Уровень 1 превращает 1 Rage в 1 HP; уровни 2–3 могут превратить второй Rage во второй HP. Уровень 3 также добавляет Exhaust каждому соседнему врагу и удаляет все отрицательные карты статуса Да Оркка.' },
  fistbolt: { en: 'A dependable opener when Orkk has no Rage: it creates 1 stack before comparison and immediately converts it into +1 ATT for this Attack.', ru: 'Надёжное начало при отсутствии Rage: карта создаёт 1 стек до сравнения и сразу превращает его в +1 ATT для этой Атаки.' },
  'chain-punchin': { en: 'A utility Attack for changing Shield state. Attack while unequipped to gain an extra Action and continue a combo; while equipped, use it when you deliberately want the Shield dropped as an obstacle.', ru: 'Утилитарная Атака для смены состояния Щита. Без Щита получайте дополнительное Действие и продолжайте комбинацию; со Щитом используйте, когда хотите намеренно сбросить его как препятствие.' },
  'teef-strike': { en: 'Use early to seed Exhaust into the enemy Hand. The ongoing -1 ATT/DEF makes every later combat easier even if this low-value Attack does little direct damage.', ru: 'Используйте рано, чтобы добавить Exhaust в Руку врага. Постоянный штраф -1 ATT/DEF облегчит все будущие бои, даже если эта слабая Атака нанесёт мало прямого урона.' },
  'shield-bash': { en: 'If the Shield is unequipped, recall the one whose optimal route crosses the most enemies, using the nearest only to break a tie. Every enemy crossed takes 2 Damage and is pulled 1 Square toward Orkk. If it was already equipped when combat began, gain 1 Rage after all combat effects resolve.', ru: 'Если Щит снят, верните тот, чей оптимальный маршрут задевает больше врагов, а ближайший выбирайте только при равенстве. Каждый пересечённый враг получает 2 урона и притягивается на 1 клетку к Оркку. Если Щит был экипирован в начале боя, получите 1 Rage после разрешения всех эффектов боя.' },
  'knee-blast': { en: 'A strong Attack that converts Rage into displacement. Line up the target with an Object, Player, wall, or board edge so an interrupted push also adds Headache to their Hand.', ru: 'Сильная Атака, превращающая Rage в перемещение. Выстройте цель напротив Объекта, Игрока, стены или края поля, чтобы прерванный толчок также добавил Headache в её Руку.' },
  'da-blokk': { en: 'Use against an Attack with a dangerous printed effect. If damage still breaks through, the 2 Rage gained fuels a powerful counterattack on Orkk’s next turn.', ru: 'Используйте против Атаки с опасным собственным эффектом. Если урон всё же пройдёт, полученные 2 Rage подготовят мощную контратаку в следующий ход Оркка.' },
  double: { en: 'Best early in an enemy turn when several damage instances may follow. It doubles Rage gained for the rest of that turn, setting up a large Rage-powered Attack.', ru: 'Лучше использовать в начале хода врага, когда ожидается несколько случаев урона. Карта удваивает получаемый Rage до конца хода и готовит мощную Rage-Атаку.' },
  'arcane-shield': { en: 'When the Shield is unequipped, recall the one whose optimal route crosses the most enemies, using the nearest only to break a tie. Every recall uses the fewest steps and then the fewest diagonal steps; each crossed enemy takes 2 additional Damage.', ru: 'Если Щит не экипирован, верните тот, чей оптимальный маршрут задевает больше врагов, а ближайший выбирайте только при равенстве. Любой возврат использует минимум ходов, затем минимум диагоналей; каждый задетый враг получает 2 дополнительного урона.' },
  countaspell: { en: 'A high Defence that weaponizes stored Rage without consuming it. Save it for an enemy with a vulnerable Deck, then load their Discard with Headaches before a later shuffle effect.', ru: 'Высокая Защита, использующая накопленный Rage без расхода. Сохраняйте против врага с уязвимой Колодой, затем наполняйте его Discard картами Headache перед будущим замешиванием.' },
  'mana-baryer': { en: 'With the Shield equipped, Mana Baryer has exactly 5 base DEF—the normal equipped-Shield +1 is not added again. Without it, recall the Shield whose optimal route crosses the most enemies, using the nearest only to break a tie. Crossed enemies take 2 Damage and are pulled 1 Square toward Orkk.', ru: 'С экипированным Щитом Mana Baryer имеет ровно 5 базовой DEF — обычный бонус +1 за Щит повторно не добавляется. Без него верните Щит, чей оптимальный маршрут задевает больше врагов, а ближайший выбирайте только при равенстве. Задетые враги получают 2 урона и притягиваются на 1 клетку к Оркку.' },
  pinned: { en: 'This restricts movement and cannot be discarded for Hand overstacking. Plan a low-movement turn, use an allowed Finishing Move discard, or wait for the automatic end-turn removal.', ru: 'Ограничивает движение и не может быть сброшена при переполнении Руки. Планируйте ход с малым движением, используйте разрешённый сброс Завершающего приёма или дождитесь автоматического удаления в конце хода.' },
  headache: { en: 'Dead Hand weight that cannot be discarded. Spend an Action to Remove it before the five-Card limit becomes dangerous.', ru: 'Мёртвый груз в Руке, который нельзя Сбросить. Потратьте Действие на Удаление до того, как лимит в пять карт станет опасным.' },
  exhaust: { en: 'While held, every Attack and Defence loses 1 Value. Discard it normally when possible, or attach and Remove it during combat for the larger one-time -3 penalty when that combat is expendable.', ru: 'Пока карта в Руке, каждая Атака и Защита теряет 1. Сбросьте её обычным способом или прикрепите и Удалите в менее важном бою ради одноразового штрафа -3.' },
  burning: { en: 'Burning deals 1 Damage at turn end only if it remains in Hand. Discarding it through another effect avoids that Damage; Dash instead deals the Damage first, then Removes every Burning Card and spends movement randomly.', ru: 'Burning наносит 1 урон в конце хода, только если остаётся в Руке. Сброс другим эффектом предотвращает этот урон; Dash сначала наносит урон, затем удаляет все карты Burning и случайно тратит движение.' },
  panic: { en: 'Panic disables all Attack and Perk Cards in Hand. Free Move Removes it and spends all movement available at that moment randomly; movement gained later in the turn remains usable, so sequence bonuses after clearing Panic when possible.', ru: 'Panic блокирует все карты Атаки и Перка в Руке. Free Move удаляет его и случайно тратит всё движение, доступное в этот момент; MOV, полученный позже в том же ходу, можно использовать, поэтому по возможности активируйте бонусы движения после очищения.' },
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
  const statusIcons = playerStatusIcons(player);
  element.innerHTML = `<div><span>${id === 'P1' ? 'PLAYER 01' : id === 'P2' ? 'PLAYER 02' : 'PLAYER 03'}${title}</span><strong>${player.name}</strong></div><div class="hp-copy"><b>${player.hp}</b> / ${player.maxHp} HP</div><div class="hp-track"><i style="width:${hpPercent}%"></i></div>${statusIcons ? `<div class="hud-status-strip" aria-label="${escapeHtml(player.name)} statuses">${statusIcons}</div>` : ''}${mana}${orkkIndicators}`;
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
  healMessage.textContent = stoicShellHealed ? `Stoic Shell has restored John's ${player.stoicShellHealAmount} HP` : '';
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
  else if (playerTwo.character === 'orkk') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">👊<span class="trait-tooltip"><b>Rage</b>Gain 1 Rage per damaging card or action. Apply all Rage to an Attack Card and consume it after combat, except against Objects. Remove 1 Rage at turn end.</span></div></div>`;
  else if (playerTwo.character === 'john-christ') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon holy-spirit-trait" tabindex="0">✝<span class="trait-tooltip"><b>Possessed</b>Damage triggers Spirit Form: +2 ATT, MOV 1, and movement through enemies and Objects with MOV refunds. Attacking or ending the turn exits the form.</span></div></div>`;
  else if (playerTwo.character === 'wreckna') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">☠<span class="trait-tooltip"><b>Phylactery</b>While any Phylactery exists, Damage cannot reduce Wreckna below 1 HP. Attackers still receive full post-match Damage credit.</span></div><div class="trait-icon" tabindex="0">▰<span class="trait-tooltip"><b>Entombed</b>Spend 2 MOV to enter a Tomb. Restore 1 HP when beginning a turn inside it.</span></div></div>`;
  else if (playerTwo.character === 'spectre') byId('characterTraitPanelP2').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">◈<span class="trait-tooltip"><b>Replica</b>One immobile replica shares Spectre's Hand, Actions, HP, and combat. Either body can originate melee Attacks; positional rules use the involved body.</span></div></div>`;
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
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">👊<span class="trait-tooltip"><b>Rage</b>Gain 1 Rage per damaging card or action. Apply all Rage to an Attack Card and consume it after combat, except against Objects. Remove 1 Rage at turn end.</span></div>${shield}</div>`;
    return;
  }
  if (player.character === 'john-christ') {
    const shell = player.stoicShell ? `<div class="trait-icon highground-active" tabindex="0">${player.stoicShellStacks}<span class="trait-tooltip"><b>Stoic Shell · ${player.stoicShellStacks} Stack${player.stoicShellStacks === 1 ? '' : 's'}</b>Below maximum HP, gain 1 Stack at turn start and restore 1 HP per Stack. No Stack is gained at maximum HP. HP Damage removes every Stack.</span></div>` : '';
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon holy-spirit-trait" tabindex="0">✝<span class="trait-tooltip"><b>Possessed</b>Damage triggers Spirit Form: +2 ATT, MOV 1, and movement through enemies and Objects with MOV refunds. Attacking or ending the turn exits the form.</span></div>${shell}</div>`;
    return;
  }
  if (player.character === 'spectre') {
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">◈<span class="trait-tooltip"><b>Replica</b>One immobile replica shares Spectre's Hand, Actions, HP, and combat. Either body can originate melee Attacks; positional rules use the involved body.</span></div></div>`;
    return;
  }
  if (player.character === 'wreckna') {
    byId('characterTraitPanel').innerHTML = `<div class="trait-row"><div class="trait-icon" tabindex="0">☠<span class="trait-tooltip"><b>Phylactery</b>While any Phylactery exists, Damage cannot reduce Wreckna below 1 HP. Attackers still receive full post-match Damage credit.</span></div><div class="trait-icon" tabindex="0">▰<span class="trait-tooltip"><b>Entombed</b>Spend 2 MOV to enter a Tomb. Restore 1 HP when beginning a turn inside it.</span></div></div>`;
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
    const panic = player.hand.filter((card) => card.cardId === 'panic').length;
    const boomerangAway = player.deck.concat(player.discard).some((card) => card.cardId === 'boomerang');
    const phylacteryIcons = player.character === 'wreckna' ? ([
      ['might', 'M', 'Phylactery of Might', 'Spend 1 MOV during Combat Stack selection for +1 Attack Value instead of using a Combat Card.'],
      ['wisdom', 'W', 'Phylactery of Wisdom', 'Before choosing a Defend Card, draw 1 Card and then discard 1 Card.'],
      ['ritual', 'R', 'Phylactery of Ritual', 'Creating a Phylactery ignores its HP or Tomb sacrifice.'],
    ] as const).map(([type, icon, name, description]) => `<div class="status-icon phylactery-status ${activeWrecknaPhylactery(gameState, player.id, type) ? 'active' : 'inactive'}" tabindex="0">${icon}<span class="status-tooltip"><strong>${name} · ${activeWrecknaPhylactery(gameState, player.id, type) ? 'ACTIVE' : 'INACTIVE'}</strong>${description}</span></div>`).join('') : '';
    const rageIcon = player.character === 'orkk' && player.rageStacks > 0 ? `<div class="status-icon rage-status" tabindex="0">🔥<b>${player.rageStacks}</b><span class="status-tooltip"><strong>Rage Stacks</strong>Attack Cards gain +1 Attack Value from every stack, then consume every applied stack unless the target was an Object. Remove 1 stack at turn end.</span></div>` : '';
    const doubleRageIcon = player.doubleRageUntilEnemyTurnEnd ? `<div class="status-icon double-rage-status" tabindex="0">×2<span class="status-tooltip"><strong>Double! · Rage</strong>Da Orkk receives doubled Rage Stacks until the end of the attacking Player's turn.</span></div>` : '';
    const pinnedIcon = stacks > 0 ? `<div class="status-icon pinned-status" tabindex="0">🦵<i></i><b>${stacks}</b><span class="status-tooltip"><strong>Pinned</strong>Movement decreased by 1 per Pinned Card (current: ${stacks}). Remove 1 Pinned Card from Hand at the end of turn.</span></div>` : '';
    const handHeadacheIcon = headacheInHand > 0 ? `<div class="status-icon headache-status in-hand" tabindex="0">🤕${headacheInHand > 1 ? `<b>${headacheInHand}</b>` : ''}<span class="status-tooltip"><strong>Headache · Hand</strong>${headacheInHand} Headache Card${headacheInHand === 1 ? '' : 's'} currently filling this player's Hand. Filled red while active in Hand.</span></div>` : '';
    const discardHeadacheIcon = headacheInDiscard > 0 ? `<div class="status-icon headache-status in-discard" tabindex="0">🤕${headacheInDiscard > 1 ? `<b>${headacheInDiscard}</b>` : ''}<span class="status-tooltip"><strong>Headache · Discard</strong>${headacheInDiscard} Headache Card${headacheInDiscard === 1 ? '' : 's'} currently in this player's Discard. Filled orange while discarded.</span></div>` : '';
    const handExhaustIcon = exhaustInHand > 0 ? `<div class="status-icon exhaust-status in-hand" tabindex="0">🥵${exhaustInHand > 1 ? `<b>${exhaustInHand}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Hand</strong>Cards have -1 Attack and Defend Value per Exhaust. During combat, one may be Removed for a -3 modifier instead.</span></div>` : '';
    const storedExhaustIcon = exhaustStored > 0 ? `<div class="status-icon exhaust-status in-discard" tabindex="0">🥵${exhaustStored > 1 ? `<b>${exhaustStored}</b>` : ''}<span class="status-tooltip"><strong>Exhaust · Stored</strong>${exhaustStored} Exhaust Card${exhaustStored === 1 ? '' : 's'} in this player's Deck or Discard.</span></div>` : '';
    const arcaneAttackIcon = player.character === 'magician' && player.arcaneBoltAttackBonus > 0 ? `<div class="status-icon arcane-attack-status" tabindex="0">✦<b>+${player.arcaneBoltAttackBonus}</b><span class="status-tooltip"><strong>Arcane Bolt · Empowered</strong>Attack Cards have +${player.arcaneBoltAttackBonus} ATT until the end of this turn.</span></div>` : '';
    const spectreTemporaryAttack = player.character === 'spectre' ? player.spectreAttackBonus ?? 0 : 0;
    const spectreAccumulateActive = player.character === 'spectre' ? player.spectreAccumulateActive ?? 0 : 0;
    const spectreAccumulateStored = player.character === 'spectre' ? player.spectreAccumulateStored ?? 0 : 0;
    const spectreTemporaryAttackIcon = spectreTemporaryAttack > 0 ? `<div class="status-icon spectre-attack-status" tabindex="0">ATT<b>+${spectreTemporaryAttack}</b><span class="status-tooltip"><strong>Spectre · Temporary ATT</strong>Relocate, Consume Replica, and Haunt currently grant +${spectreTemporaryAttack} ATT to Attacks from either body. The combined bonus expires at the end of Spectre's turn.</span></div>` : '';
    const spectreAccumulateActiveIcon = spectreAccumulateActive > 0 ? `<div class="status-icon spectre-accumulate-status active" tabindex="0">Σ<b>+${spectreAccumulateActive}</b><span class="status-tooltip"><strong>Accumulate · Active</strong>Every Attack from Spectre or the replica gains +${spectreAccumulateActive} ATT during this turn. The bonus expires at turn end.</span></div>` : '';
    const spectreAccumulateStoredIcon = spectreAccumulateStored > 0 ? `<div class="status-icon spectre-accumulate-status stored" tabindex="0">Σ→<b>+${spectreAccumulateStored}</b><span class="status-tooltip"><strong>Accumulate · Stored</strong>+${spectreAccumulateStored} ATT is stored for every Attack during Spectre's next turn. Multiple Accumulate uses stack before activation.</span></div>` : '';
    const movementBonus = (player.grimoireMoveBonus ?? 0) + (player.swiftformMoveBonus ?? 0);
    const annulledMovementIcon = player.movementAnnulledByBlessedSwiftness ? `<div class="status-icon movement-annulled-status" tabindex="0">MOV<span class="status-tooltip"><strong>MOV Annulled · Blessed Swiftness</strong>This Player's unspent movement was reduced to 0 by Blessed Swiftness. The marker expires when their end-turn process begins.</span></div>` : '';
    const movementIcon = movementBonus > 0 ? `<div class="status-icon movement-bonus-status" tabindex="0">➜<b>+${movementBonus}</b><span class="status-tooltip"><strong>Movement empowered</strong>This character has +${movementBonus} MOV until the end of this turn.</span></div>` : '';
    const hexBonus = (player.hexMovementBonus ?? 0) + (player.decayMovementBonus ?? 0);
    const hexPenalty = player.hexMovementPenalty ?? 0;
    const shadowMoveBonus = player.spectreShadowMoveBonus ?? 0;
    const shadowMovePenalty = player.spectreShadowMovePenalty ?? 0;
    const shadowMoveBonusIcon = shadowMoveBonus > 0 ? `<div class="status-icon movement-bonus-status" tabindex="0">DAG<b>+${shadowMoveBonus}</b><span class="status-tooltip"><strong>Shadow Dagger · Stolen Movement</strong>Spectre stole ${shadowMoveBonus} MOV from enemies hit by Shadow Dagger. Both maximum and unspent MOV increased until the end of this turn.</span></div>` : '';
    const shadowMovePenaltyIcon = shadowMovePenalty > 0 ? `<div class="status-icon movement-annulled-status" tabindex="0">DAG<b>-${shadowMovePenalty}</b><span class="status-tooltip"><strong>Shadow Dagger · Movement Stolen</strong>Maximum and unspent MOV are reduced by ${shadowMovePenalty} until the end of Spectre's turn.</span></div>` : '';
    const brainFreezeIcon = player.brainFreezeCombatBlocked ? `<div class="status-icon movement-annulled-status" tabindex="0">🧊<span class="status-tooltip"><strong>Brain Freeze</strong>This character cannot use Combat Cards or Combat Effects for the rest of this turn.</span></div>` : '';
    const dakkothRangeIcon = (player.dakkothRangeBonus ?? 0) > 0 ? `<div class="status-icon highground-active" tabindex="0">RNG<b>+${player.dakkothRangeBonus}</b><span class="status-tooltip"><strong>Dakkoth · Extended Range</strong>Attack Range is increased by ${player.dakkothRangeBonus} until the end of this turn.</span></div>` : '';
    const necronomiconIcon = (player.necronomiconAttackBonus ?? 0) > 0 ? `<div class="status-icon highground-active" tabindex="0">ATT<b>+${player.necronomiconAttackBonus}</b><span class="status-tooltip"><strong>Necronomicon · Next Attack</strong>The next Attack Card gains +${player.necronomiconAttackBonus} Attack Value. This lasts until used; another Necronomicon may improve but never stack the bonus.</span></div>` : '';
    const summonIcon = player.character === 'merylin' && player.merylinSummonActive ? `<div class="status-icon merylin-summon-status" tabindex="0">⚔<span class="status-tooltip"><strong>Summon · Attack Ready</strong>Swordcraft has summoned a sword from another realm. Merylin may use one Attack Card; doing so consumes this Summon. An Attack that grants Summon applies a fresh charge after consuming this one.</span></div>` : '';
    const carianStanceIcon = player.character === 'merylin' && player.merylinSummonActive && (player.merylinSummonedDefenseBonus ?? 0) > 0 ? `<div class="status-icon merylin-summon-status" tabindex="0">DEF<b>+${player.merylinSummonedDefenseBonus}</b><span class="status-tooltip"><strong>Carian Stance · Summoned Guard</strong>Defend Cards gain +${player.merylinSummonedDefenseBonus} DEF while Summon remains active. Using an Attack consumes Summon and removes this bonus.</span></div>` : '';
    const windwalkerIcon = player.character === 'merylin' && (player.windwalkerMoveBonus ?? 0) > 0 ? `<div class="status-icon movement-bonus-status" tabindex="0">MOV<b>+${player.windwalkerMoveBonus}</b><span class="status-tooltip"><strong>Windwalker Stance · +${player.windwalkerMoveBonus} MOV</strong>This movement bonus lasts until turn end.${player.windwalkerUnrestrictedMovement ? ' Merylin may cross characters, Objects, Wall Objects, High Ground, Slides, Trenches, and other restricted Squares, but must end movement on an empty Square.' : ''}</span></div>` : '';
    const barbarianAttackIcon = player.character === 'merylin' && (player.barbarianNextAttackBonus ?? 0) > 0 ? `<div class="status-icon highground-active" tabindex="0">ATT<b>+${player.barbarianNextAttackBonus}</b><span class="status-tooltip"><strong>Barbarian Stance · Next Attack</strong>The next Attack Card gains +${player.barbarianNextAttackBonus} ATT. This does not expire, repeated uses keep only the higher bonus, and using any Attack consumes it regardless of the combat result.</span></div>` : '';
    const barbarianMovementIcon = player.character === 'merylin' && player.barbarianIgnoreNegativeMovement ? `<div class="status-icon movement-bonus-status" tabindex="0">MOV<span class="status-tooltip"><strong>Barbarian Stance · Unstoppable</strong>Negative effects cannot reduce or annul Merylin's MOV until the end of this turn.</span></div>` : '';
    const kamelotBonusIcon = player.character === 'merylin' && player.kamelotDoubleSquareBonuses ? `<div class="status-icon highground-active" tabindex="0">SQ<b>×2</b><span class="status-tooltip"><strong>Kamelot Stance · Square Bonuses ×2</strong>Numeric bonuses from special Squares are doubled. This includes draw, owned Base DEF, and High Ground ATT bonuses, but not automatic Slide movement. The effect is consumed after Merylin uses an Attack.</span></div>` : '';
    const kamelotSuppressionIcon = player.kamelotSuppressedZone ? `<div class="status-icon movement-annulled-status" tabindex="0">SQ<span class="status-tooltip"><strong>Kamelot Stance · ${escapeHtml(player.kamelotSuppressedZone.zoneType)} Zone Disabled</strong>This character receives no bonus from the affected connected special-Square zone until the beginning of their turn. A draw-Square bonus is suppressed before this effect expires.</span></div>` : '';
    const spellsingerPerkIcon = player.character === 'merylin' && (player.spellsingerExtraPerkUses ?? 0) > 0 ? `<div class="status-icon highground-active" tabindex="0">PERK<b>+1</b><span class="status-tooltip"><strong>Spellsinger Stance · Extra Perk</strong>Merylin may use one additional Perk during this turn. The allowance expires at turn end.</span></div>` : '';
    const spellsingerAttackIcon = player.character === 'merylin' && (player.spellsingerExtraAttacks ?? 0) > 0 ? `<div class="status-icon highground-active" tabindex="0">ATT<b>+1</b><span class="status-tooltip"><strong>Spellsinger Stance · Extra Attack</strong>After normal Actions are exhausted, Merylin may use one additional Attack during this turn. The allowance expires at turn end.</span></div>` : '';
    const hexBonusIcon = hexBonus > 0 ? `<div class="status-icon movement-bonus-status" tabindex="0">MOV<b>+${hexBonus}</b><span class="status-tooltip"><strong>Stolen Movement</strong>Wreckna has +${hexBonus} maximum MOV stolen by Hex, Drain Strength, or Decay. Decay's gain expires at Wreckna's turn end; other matching gains expire with their target. Stolen MOV is immediately usable for Phylactery of Might.</span></div>` : '';
    const hexPenaltyIcon = hexPenalty > 0 ? `<div class="status-icon movement-annulled-status" tabindex="0">MOV<b>-${hexPenalty}</b><span class="status-tooltip"><strong>Movement Stolen</strong>Hex, Drain Strength, or Decay reduced maximum MOV by ${hexPenalty}. The penalty expires at the end of this character's next turn.</span></div>` : '';
    const passThroughIcon = player.swiftformCanPassEnemies ? `<div class="status-icon pass-through-status" tabindex="0">⇢<span class="status-tooltip"><strong>Swiftform</strong>This character can move through enemies this turn, but cannot finish movement on an occupied Square.</span></div>` : '';
    const lightsaberIcon = player.character === 'shinobi' && player.lightsaberBuff ? `<div class="status-icon lightsaber-active" tabindex="0">⚡<span class="status-tooltip"><strong>Lightsaber empowered</strong>+1 ATT / DEF / MOV. Duration stacks: ${player.lightsaberStacks}.</span></div>` : '';
    const highgroundIcon = player.highgroundAdvantageBuff ? `<div class="status-icon highground-active" tabindex="0">▲<span class="status-tooltip"><strong>Highground Advantage</strong>The next Attack Card returns to this player's Hand.</span></div>` : '';
    const flagState = (gameState as GameState & { questPhases?: { captureTheFlag?: { flags: { carrierId: PlayerId | null; status: string }[] } | null } }).questPhases?.captureTheFlag;
    const flagCarrier = Boolean(flagState?.flags.some((flag) => flag.status === 'carried' && flag.carrierId === player.id));
    const flagIcon = flagCarrier ? `<div class="status-icon flag-carrier-status" tabindex="0">⚑<span class="status-tooltip"><strong>Carried Flag</strong>Carry an enemy Flag to either Square of your Base and end your turn there to complete Capture the Flag.</span></div>` : '';
    const burningIcon = burning > 0 ? `<div class="status-icon burning-status" tabindex="0">🔥${burning > 1 ? `<b>${burning}</b>` : ''}<span class="status-tooltip"><strong>Burning</strong>Receive 1 Damage per Burning Card at the beginning of the turn. Only Dash Removes Burning; its movement is then spent randomly through legal empty Squares.</span></div>` : '';
    const panicIcon = panic > 0 ? `<div class="status-icon panic-status" tabindex="0">⚠${panic > 1 ? `<b>${panic}</b>` : ''}<span class="status-tooltip"><strong>Panic</strong>Attack and Perk Cards cannot be used. Free Move Removes Panic and spends all currently available movement randomly.</span></div>` : '';
    const spiritIcon = player.spiritForm ? `<div class="status-icon holy-spirit-trait" tabindex="0">✝<span class="status-tooltip"><strong>Spirit Form</strong>+2 to Attack Cards and 1 MOV immune to negative movement Status effects. May pass through enemies, Objects, Shields, and Wall Objects. Regain 1 MOV on every occupied Square and siphon 1 MOV from each crossed enemy once per turn. Attack or end the turn to exit.</span></div>` : '';
    const shellIcon = player.stoicShell ? `<div class="status-icon highground-active" tabindex="0">${player.stoicShellStacks}<span class="status-tooltip"><strong>Stoic Shell · ${player.stoicShellStacks} Stack${player.stoicShellStacks === 1 ? '' : 's'}</strong>Below maximum HP, gain 1 Stack at turn start and restore 1 HP per Stack. At maximum HP, existing Stacks remain but do not increase. HP Damage removes all Stacks.</span></div>` : '';
    const spiritSiphonIcon = player.spiritSiphonedMovement > 0 ? `<div class="status-icon movement-annulled-status" tabindex="0">-${player.spiritSiphonedMovement} MOV<span class="status-tooltip"><strong>Spirit Movement Siphoned</strong>John Christ's Spirit Form crossed this character. Their MOV is reduced by ${player.spiritSiphonedMovement} until their end-turn process begins.</span></div>` : '';
    const guardianPenaltyIcon = spiritGuardianEnemyPenalty(gameState, player) ? `<div class="status-icon guardian-penalty-status" tabindex="0">-1<span class="status-tooltip"><strong>Spirit Guardian's Judgment</strong>While adjacent to an enemy level 3 Spirit Guardian, this Player's Attack and Defend Cards have -1 Value.</span></div>` : '';
    const boomerangPenaltyIcon = boomerangAway ? `<div class="status-icon boomerang-penalty-status" tabindex="0">↪<b>-1</b><span class="status-tooltip"><strong>Boomerang Away · -1 MOV</strong>Boomerang is outside this Player's Hand, decreasing MOV by 1. Drawing it removes this penalty; a Boomerang Removed from the game causes no penalty.</span></div>` : '';
    return `${phylacteryIcons}${summonIcon}${carianStanceIcon}${windwalkerIcon}${barbarianAttackIcon}${barbarianMovementIcon}${kamelotBonusIcon}${kamelotSuppressionIcon}${spellsingerPerkIcon}${spellsingerAttackIcon}${dakkothRangeIcon}${necronomiconIcon}${flagIcon}${spiritIcon}${spiritSiphonIcon}${hexBonusIcon}${hexPenaltyIcon}${brainFreezeIcon}${shadowMoveBonusIcon}${shadowMovePenaltyIcon}${shellIcon}${guardianPenaltyIcon}${rageIcon}${doubleRageIcon}${lightsaberIcon}${highgroundIcon}${arcaneAttackIcon}${spectreTemporaryAttackIcon}${spectreAccumulateActiveIcon}${spectreAccumulateStoredIcon}${movementIcon}${annulledMovementIcon}${boomerangPenaltyIcon}${passThroughIcon}${panicIcon}${burningIcon}${pinnedIcon}${handHeadacheIcon}${discardHeadacheIcon}${handExhaustIcon}${storedExhaustIcon}`;
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
    const oraclePending = gameState.pendingAttack as typeof gameState.pendingAttack & { oracleInstanceId?: string; oracleValueAtCombatStart?: number; oracleRevealedThisCombat?: boolean };
    const oracle = oraclePending?.oracleInstanceId ? viewer.hand.find((card) => card.instanceId === oraclePending.oracleInstanceId) : undefined;
    const oracleForced = oraclePending?.oracleValueAtCombatStart === 1;
    const oracleRevealed = Boolean(oraclePending?.oracleRevealedThisCombat);
    const attack = gameState.pendingAttack ? cardDefinition({ instanceId: '', cardId: gameState.pendingAttack.cardId }) : null;
    const oracleControl = oracle && !oracleForced
      ? oracleRevealed && attack
        ? `<article class="card attack oracle-revealed-card"><span>ORACLE · ATTACK REVEALED</span><strong>${escapeHtml(attack.name.toUpperCase())}</strong><div><b>${gameState.pendingAttack!.attackValue}</b> ATTACK VALUE</div><small>${escapeHtml(attack.effectText ?? '')}</small></article>`
        : `<button class="card attack" id="oracleReveal" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>ORACLE · WHILE IN HAND</span><strong>REVEAL ATTACK CARD</strong><div><b>${cardBaseValue(oracle)} → ${Math.max(1, cardBaseValue(oracle) - 1)}</b> ORACLE VALUE</div><small>Reveal the played Attack Card. Oracle cannot Defend this combat.</small></button>`
      : '';
    byId('hand').innerHTML = `${oracleControl}${defenses.map((instance) => { const card = cardDefinition(instance); const unavailable = !canLocalAct(viewerId) || (oracleForced && instance.instanceId !== oraclePending?.oracleInstanceId) || (oracleRevealed && instance.instanceId === oraclePending?.oracleInstanceId); const value = cardBaseValue(instance); const rules = (card.effectText ?? `Reduce incoming combat value by ${value}.`).replace('reveal 4 Cards', `reveal ${value} Cards`); return `<button class="card defend" data-defend="${instance.instanceId}" ${unavailable ? 'disabled' : ''}><span>${unavailable ? 'UNAVAILABLE THIS COMBAT' : 'REACTION · DISCARD ON USE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${value}</b> DEFEND VALUE</div><small>${escapeHtml(rules)}</small></button>`; }).join('')}<button class="decline" id="passDefense" ${!canLocalAct(viewerId) || oracleForced ? 'disabled' : ''}>${oracleForced ? 'ORACLE MUST DEFEND' : 'TAKE THE HIT'}</button>`;
    document.querySelector('#oracleReveal')?.addEventListener('click', () => dispatch({ type: 'oracle-reveal', playerId: viewerId }));
    document.querySelectorAll<HTMLButtonElement>('[data-defend]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'defend', playerId: viewerId, cardInstanceId: button.dataset.defend! })));
    document.querySelector('#passDefense')?.addEventListener('click', () => dispatch({ type: 'pass-defense', playerId: viewerId }));
    return;
  }
  if ((gameState.phase as string) === 'choosing-decay-discard') {
    const decay = (gameState as GameState & { decay?: { targetId?: PlayerId; remaining: number } }).decay;
    if (!decay?.targetId || viewerId !== decay.targetId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for the target to discard for Decay.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-decay-discard="${instance.instanceId}" ${card.cannotBeDiscarded || !canLocalAct(viewerId) ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : `DECAY · DISCARD ${decay.remaining} MORE`}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    handElement.querySelectorAll<HTMLButtonElement>('[data-decay-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'decay-discard', playerId: viewerId, cardInstanceId: button.dataset.decayDiscard! })));
    return;
  }
  if (gameState.phase === 'wreckna-wisdom-discard') {
    const wisdom = (gameState as GameState & { wrecknaWisdom?: { playerId: PlayerId } | null }).wrecknaWisdom;
    if (!wisdom || viewerId !== wisdom.playerId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for Wreckna to discard for Phylactery of Wisdom.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => {
      const card = cardDefinition(instance);
      return `<button class="card ${cardVisualClass(card)}" data-wisdom-hand-discard="${instance.instanceId}" ${card.cannotBeDiscarded || !canLocalAct(viewerId) ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'PHYLACTERY OF WISDOM · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`;
    }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-wisdom-hand-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'wreckna-wisdom-discard', playerId: viewerId, cardInstanceId: button.dataset.wisdomHandDiscard! })));
    return;
  }
  if (gameState.phase === 'choosing-lichdom-copy') {
    const lichdom = (gameState as GameState & { lichdom?: { casterId: PlayerId } | null }).lichdom;
    if (!lichdom || viewerId !== lichdom.casterId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for Wreckna to choose a Card for Lichdom.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-lichdom-copy="${instance.instanceId}" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>LICHDOM · CREATE ONE-TIME COPY</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    handElement.querySelectorAll<HTMLButtonElement>('[data-lichdom-copy]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'lichdom-copy-choice', playerId: viewerId, cardInstanceId: button.dataset.lichdomCopy! })));
    return;
  }
  if (gameState.phase === 'choosing-shadow-barter-discard') {
    const shadowBarter = (gameState as GameState & { shadowBarter?: { defenderId: PlayerId } | null }).shadowBarter;
    if (!shadowBarter || viewerId !== shadowBarter.defenderId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for the target to discard for Shadow Barter.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-shadow-barter-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'SHADOW BARTER · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-shadow-barter-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'shadow-barter-discard', playerId: viewerId, cardInstanceId: button.dataset.shadowBarterDiscard! })));
    return;
  }
  if (gameState.phase === 'choosing-soul-strike-discard') {
    const pending = (gameState as GameState & { soulStrikeDiscard?: { attackerId: PlayerId; defenderId: PlayerId } | null }).soulStrikeDiscard;
    if (!pending || viewerId !== pending.defenderId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for the target to discard for Soul Strike.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => {
      const card = cardDefinition(instance);
      const eligible = isCardRevealedToOpponents(viewer, instance, pending.attackerId) && !card.cannotBeDiscarded;
      return `<button class="card ${cardVisualClass(card)}" data-soul-strike-discard="${instance.instanceId}" ${eligible ? '' : 'disabled'}><span>${eligible ? 'SOUL STRIKE · SELECT TO DISCARD' : 'NOT REVEALED TO SPECTRE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`;
    }).join('');
    handElement.querySelectorAll<HTMLButtonElement>('[data-soul-strike-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'soul-strike-discard', playerId: viewerId, cardInstanceId: button.dataset.soulStrikeDiscard! })));
    return;
  }
  if ((gameState.phase as string) === 'choosing-necronomicon-discard') {
    const pending = (gameState as GameState & { necronomicon?: { discardQueue: { playerId: PlayerId; remaining: number }[] } }).necronomicon?.discardQueue[0];
    if (!pending || viewerId !== pending.playerId) { handElement.innerHTML = '<div class="drone-placeholder">Waiting for an enemy to discard for Necronomicon.</div>'; return; }
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-necronomicon-discard="${instance.instanceId}" ${card.cannotBeDiscarded || !canLocalAct(viewerId) ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : `NECRONOMICON · DISCARD ${pending.remaining} MORE`}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    handElement.querySelectorAll<HTMLButtonElement>('[data-necronomicon-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'necronomicon-discard', playerId: viewerId, cardInstanceId: button.dataset.necronomiconDiscard! })));
    return;
  }
  if (gameState.phase === 'choosing-force-disarm-discard') {
    const requiredTarget = gameState.forceDisarm!.targetId;
    const requiredKind = gameState.forceDisarm!.cardKind ?? 'attack';
    const mindBlast = 'mindBlastLevel' in gameState.forceDisarm!;
    if (viewerId !== requiredTarget) {
      byId('hand').innerHTML = `<div class="drone-placeholder">Waiting for ${escapeHtml(gameState.players[requiredTarget].name)} to discard a ${requiredKind === 'defend' ? 'Defend' : 'Attack'} card.</div>`;
      return;
    }
    if (mindBlast) {
      const eligible = viewer.hand.filter((instance) => !cardDefinition(instance).cannotBeDiscarded);
      byId('hand').innerHTML = eligible.map((instance) => {
        const card = cardDefinition(instance);
        return `<button class="card ${cardVisualClass(card)}" data-force-disarm="${instance.instanceId}" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>MIND BLAST &middot; SELECT TO DISCARD</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`;
      }).join('');
      document.querySelectorAll<HTMLButtonElement>('[data-force-disarm]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'force-disarm-discard', playerId: viewerId, cardInstanceId: button.dataset.forceDisarm! })));
      return;
    }
    if ((gameState.forceDisarm as unknown as { source?: string }).source === 'drain-strength') {
      const defenses = viewer.hand.filter((instance) => !cardDefinition(instance).cannotBeDiscarded && cardDefinition(instance).kind === 'defend');
      byId('hand').innerHTML = defenses.map((instance) => {
        const card = cardDefinition(instance);
        return `<button class="card ${cardVisualClass(card)}" data-force-disarm="${instance.instanceId}" ${!canLocalAct(viewerId) ? 'disabled' : ''}><span>DRAIN STRENGTH &middot; SELECT TO DISCARD</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> DEFEND VALUE</div><small>${cardRulesHtml(card)}</small></button>`;
      }).join('');
      document.querySelectorAll<HTMLButtonElement>('[data-force-disarm]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'force-disarm-discard', playerId: viewerId, cardInstanceId: button.dataset.forceDisarm! })));
      return;
    }
    const attacks = viewer.hand.filter((instance) => !cardDefinition(instance).cannotBeDiscarded && (mindBlast || cardDefinition(instance).kind === requiredKind));
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
    handElement.innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-grimoire-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'GRIMOIRE CLEANSE · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></button>`; }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-grimoire-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'grimoire-discard', playerId: viewerId, cardInstanceId: button.dataset.grimoireDiscard! })));
    return;
  }
  if (gameState.phase === 'choosing-flurry-enemy-discard') {
    const requiredPlayer = gameState.flurry!.attackerId;
    if (viewerId !== requiredPlayer) {
      byId('hand').innerHTML = `<div class="drone-placeholder">Waiting for ${escapeHtml(gameState.players[requiredPlayer].name)} to discard cards.</div>`;
      return;
    }
    byId('hand').innerHTML = viewer.hand.map((instance) => { const card = cardDefinition(instance); return `<button class="card ${cardVisualClass(card)}" data-flurry-discard="${instance.instanceId}" ${card.cannotBeDiscarded ? 'disabled' : ''}><span>${card.cannotBeDiscarded ? 'CANNOT BE DISCARDED' : 'FLURRY · SELECT TO DISCARD'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${escapeHtml(card.effectText ?? 'Click to discard this card.')}</small></button>`; }).join('');
    document.querySelectorAll<HTMLButtonElement>('[data-flurry-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'flurry-enemy-discard', playerId: viewerId, cardInstanceId: button.dataset.flurryDiscard! })));
    return;
  }
  const choosingDiscard = (gameState.phase as string) === 'choosing-hot-potato-discard' || gameState.phase === 'choosing-guard-discard' || gameState.phase === 'choosing-dash-discard' || gameState.phase === 'choosing-end-discard' || gameState.phase === 'choosing-preparation-discard' || gameState.phase === 'choosing-blink-discard' || gameState.phase === 'choosing-snowball-discard' || gameState.phase === 'choosing-mind-tricks-discard' || gameState.phase === 'choosing-mind-tricks-enemy-discard';
  byId('hand').innerHTML = viewer.hand.map((instance) => {
    const card = cardDefinition(instance);
    const panicked = viewer.hand.some((entry) => entry.cardId === 'panic');
    const entombedWreckna = viewer.character === 'wreckna' && Boolean(viewer.wrecknaInsideTombId && gameState.objects.some((object) => object.id === viewer.wrecknaInsideTombId && object.kind === 'tomb'));
    const selected = (currentSelection.kind === 'attack' || currentSelection.kind === 'perk') && currentSelection.cardInstanceId === instance.instanceId;
    const rewardAction = instance.cardId === 'fireball' || instance.cardId === 'sweet-potato';
    const playableAction = instance.cardId === 'blessing-prayer' ? viewer.movementRemaining > 0 : rewardAction ? viewer.actionsRemaining > 0 : card.kind === 'attack' ? (viewer.actionsRemaining > 0 || (viewer.spellsingerExtraAttacks ?? 0) > 0) && !panicked && !entombedWreckna && (viewer.character !== 'merylin' || Boolean(viewer.merylinSummonActive)) : card.kind === 'perk' ? viewer.actionsRemaining > 0 && (!viewer.perkUsed || (viewer.spellsingerExtraPerkUses ?? 0) > 0) && !panicked : card.kind === 'free-action' ? true : card.kind === 'status' ? viewer.actionsRemaining > 0 && card.canRemoveAsAction === true : false;
    const mindTricksReveal = gameState.phase === 'choosing-mind-tricks-discard';
    const unavailableMindTricksReveal = mindTricksReveal && (Boolean(instance.revealedToOpponent) || Boolean(gameState.mindTricks?.revealedInstanceIds.includes(instance.instanceId)));
    const cannotOverstackDiscard = !mindTricksReveal && choosingDiscard && (card.cannotBeDiscarded || (gameState.phase === 'choosing-dash-discard' && card.name.startsWith('Blessing:')) || (gameState.phase === 'choosing-blink-discard' && instance.cardId === 'pinned') || (gameState.phase === 'choosing-end-discard' && card.kind === 'status' && card.canDiscardForHandLimit !== true));
    const spiritBlocked = !choosingDiscard && viewer.character === 'john-christ' && viewer.spiritForm && /bless/i.test(card.name);
    const disabled = !canLocalAct(viewerId) || gameState.phase === 'finished' || Boolean(cannotOverstackDiscard) || unavailableMindTricksReveal || spiritBlocked || (!choosingDiscard && (!playableAction || gameState.phase !== 'active'));
    const interactionCopy = instance.oneTimeCopy ? ' One-time Lichdom copy: Removed when used or discarded.' : mindTricksReveal ? ' Click to reveal this card and keep it in Hand.' : choosingDiscard ? ' Click to confirm this discard.' : '';
    const typeLabel = instance.oneTimeCopy ? 'ONE-TIME COPY · REMOVE ON USE OR DISCARD' : instance.cardId === 'blessing-prayer' ? 'BLESSING · FREE ACTION · LOSE 1 MOV' : rewardAction ? 'ACTION · REWARD CARD · REMOVE ON USE' : card.kind === 'status' ? (card.canRemoveAsAction ? 'STATUS · CLICK TO REMOVE FOR 1 ACTION' : 'STATUS · ACTIVE IN HAND') : card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : card.kind === 'free-action' ? 'FREE ACTION · CLICK TO TARGET' : 'REACTION · DISCARD ON USE';
    const discardLabel = mindTricksReveal ? (unavailableMindTricksReveal ? 'ALREADY REVEALED' : 'SELECT TO REVEAL') : cannotOverstackDiscard ? 'CANNOT BE DISCARDED' : 'SELECT TO DISCARD';
    return `<button class="card ${cardVisualClass(card)} ${selected ? 'selected' : ''}" data-instance="${instance.instanceId}" ${disabled ? 'disabled' : ''}><span>${choosingDiscard ? discardLabel : typeLabel}</span><strong>${card.name.toUpperCase()}</strong><div><b>${cardBaseValue(instance)}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card).replace('reveal 4 Cards', `reveal ${cardBaseValue(instance)} Cards`)}${interactionCopy ? `<span class="card-interaction">${escapeHtml(interactionCopy)}</span>` : ''}</small></button>`;
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
      if (instance.cardId === 'blessing-prayer') dispatch({ type: 'play-free-action', playerId: viewerId, cardInstanceId: instance.instanceId });
      else if (definition.kind === 'status' && definition.canRemoveAsAction) dispatch({ type: 'remove-status', playerId: viewerId, cardInstanceId: instance.instanceId });
      else if (definition.kind === 'free-action') dispatch({ type: 'play-free-action', playerId: viewerId, cardInstanceId: instance.instanceId });
      else {
        if (definition.kind === 'attack') selectedSpectreAttackOrigin = 'spectre';
        selection.send(definition.kind === 'perk' ? { type: 'SELECT_PERK', cardInstanceId: instance.instanceId } : { type: 'SELECT_ATTACK', cardInstanceId: instance.instanceId });
      }
    }
  }));
}

function renderFlurryModal() {
  const modal = byId('flurryModal');
  const flurry = gameState.flurry;
  const viewerId = actingPlayer();
  const frostmourne = (gameState as GameState & { frostmourne?: { playerId: PlayerId } | null }).frostmourne;
  if (gameState.phase === 'choosing-frostmourne' && frostmourne) {
    const player = gameState.players[frostmourne.playerId];
    const visible = viewerId === player.id && canLocalAct(player.id);
    modal.classList.toggle('hidden', !visible);
    if (!visible) { modal.innerHTML = ''; return; }
    modal.innerHTML = `<div class="choice-dialog"><span>FROSTMOURNE · AFTER COMBAT</span><h2>Feed the Blade?</h2><p>Sacrifice 1 Hit Point to put Frostmourne on top of your Deck and gain 1 Action.</p><div class="choice-cards"><button id="frostmourneUse"><strong>Sacrifice 1 HP</strong><small>Frostmourne to top of Deck · Gain 1 Action</small></button></div><button class="choice-decline" id="frostmourneDecline">Leave Frostmourne in Discard</button></div>`;
    modal.querySelector('#frostmourneUse')?.addEventListener('click', () => dispatch({ type: 'frostmourne-decision', playerId: player.id, use: true }));
    modal.querySelector('#frostmourneDecline')?.addEventListener('click', () => dispatch({ type: 'frostmourne-decision', playerId: player.id, use: false }));
    return;
  }
  const innerPeace = (gameState as GameState & { innerPeace?: { playerId: PlayerId; level: number } | null }).innerPeace;
  const spectreChoice = (gameState as any).spectreStatusChoice as { playerId: PlayerId; mode: 'relocate' | 'anguish' } | undefined;
  if (gameState.phase === 'choosing-blessed-prayer-discard' && spectreChoice) {
    const player = gameState.players[spectreChoice.playerId];
    const visible = viewerId === player.id && canLocalAct(player.id);
    modal.classList.toggle('hidden', !visible);
    if (!visible) { modal.innerHTML = ''; return; }
    const statuses = player.hand.filter(isNegativeStatusCard);
    const title = spectreChoice.mode === 'relocate' ? 'Relocate' : 'Anguish';
    const verb = spectreChoice.mode === 'relocate' ? 'Remove from Hand' : 'Transfer to attacker';
    modal.innerHTML = `<div class="choice-dialog"><span>SPECTRE · ${spectreChoice.mode.toUpperCase()}</span><h2>${title}</h2><p>Choose one negative Status Card from Spectre's shared Hand.</p><div class="choice-cards">${statuses.map((instance) => `<button data-spectre-status="${instance.instanceId}"><strong>${escapeHtml(cardDefinition(instance).name)}</strong><small>${verb}</small></button>`).join('')}</div>${spectreChoice.mode === 'anguish' ? '<button class="choice-decline" id="spectreStatusDecline">Continue without transferring · Esc</button>' : ''}</div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-spectre-status]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'spectre-status-choice', playerId: player.id, cardInstanceId: button.dataset.spectreStatus! })));
    modal.querySelector('#spectreStatusDecline')?.addEventListener('click', () => dispatch({ type: 'spectre-status-choice', playerId: player.id, cardInstanceId: null }));
    return;
  }
  if (gameState.phase === 'choosing-blessed-prayer-discard' && innerPeace) {
    const player = gameState.players[innerPeace.playerId];
    const visible = viewerId === player.id && canLocalAct(player.id);
    modal.classList.toggle('hidden', !visible);
    if (!visible) { modal.innerHTML = ''; return; }
    const statuses = player.hand.filter(isNegativeStatusCard);
    modal.innerHTML = `<div class="choice-dialog"><span>INNER PEACE · LEVEL 1</span><h2>Remove a Negative Status</h2><p>Choose one negative Status Card from Hand to Remove. Blessings and positive Status Cards are protected.</p><div class="choice-cards">${statuses.map((instance) => `<button data-inner-peace-status="${instance.instanceId}"><strong>${escapeHtml(cardDefinition(instance).name)}</strong><small>Remove from Hand</small></button>`).join('')}</div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-inner-peace-status]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'inner-peace-status-choice', playerId: player.id, cardInstanceId: button.dataset.innerPeaceStatus! })));
    return;
  }
  if (gameState.phase === 'mana-blast-offer' && gameState.pendingAttack?.feedSpiritOffered) {
    const john = gameState.players[gameState.pendingAttack.defenderId];
    const visible = viewerId === john.id && canLocalAct(john.id);
    modal.classList.toggle('hidden', !visible);
    if (!visible) { modal.innerHTML = ''; return; }
    const blessings = john.hand.filter((instance) => cardDefinition(instance).name.startsWith('Blessing:'));
    modal.innerHTML = `<div class="choice-dialog"><span>DEFENCE FOLLOW-UP</span><h2>Feed the Spirit</h2><p>You may Remove one Blessing Card to restore 1 additional Hit Point.</p><div class="choice-cards">${blessings.map((instance) => `<button data-feed-blessing="${instance.instanceId}"><strong>${escapeHtml(cardDefinition(instance).name)}</strong><small>Remove · Restore +1 HP</small></button>`).join('')}</div><button class="choice-decline" id="feedSpiritDecline">Do not remove · Esc</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-feed-blessing]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'feed-spirit-decision', playerId: john.id, cardInstanceId: button.dataset.feedBlessing! })));
    modal.querySelector('#feedSpiritDecline')?.addEventListener('click', () => dispatch({ type: 'feed-spirit-decision', playerId: john.id, cardInstanceId: null }));
    return;
  }
  if (gameState.phase === 'choosing-blessed-prayer-discard') {
    const player = gameState.players[gameState.activePlayerId];
    const visible = viewerId === player.id && canLocalAct(player.id);
    modal.classList.toggle('hidden', !visible);
    if (!visible) { modal.innerHTML = ''; return; }
    modal.innerHTML = `<div class="choice-dialog"><span>BLESSED PRAYER · LEVEL 3</span><h2>Choose a Card from Discard</h2><p>Move the selected Card from your Discard into your Hand.</p><div class="choice-cards">${[...player.discard].reverse().map((instance) => { const card = cardDefinition(instance); return `<button data-prayer-discard="${instance.instanceId}"><strong>${escapeHtml(card.name)}</strong><small>${escapeHtml(card.effectText ?? card.levelEffects?.join(' · ') ?? `${card.kind} ${card.value}`)}</small></button>`; }).join('')}</div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-prayer-discard]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'blessed-prayer-discard', playerId: player.id, cardInstanceId: button.dataset.prayerDiscard! })));
    return;
  }
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
  const immortality = (gameState as GameState & { immortality?: { playerId: PlayerId; objectIds: string[] } | null }).immortality;
  if (gameState.phase === 'choosing-immortality-phylactery' && immortality && canLocalAct(immortality.playerId)) {
    const choices = immortality.objectIds.map((objectId) => gameState.objects.find((object) => object.id === objectId)).filter((object): object is NonNullable<typeof object> => Boolean(object?.phylacteryType));
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="choice-dialog"><span>AFTER COMBAT</span><h2>Immortality</h2><p>Choose an active Phylactery to sacrifice. Wreckna will teleport onto its Square.</p><div class="choice-cards">${choices.map((object) => `<button data-immortality-phylactery="${object.id}"><strong>Of ${object.phylacteryType![0].toUpperCase()}${object.phylacteryType!.slice(1)}</strong><small>Sacrifice ${escapeHtml(object.name)} at ${cellLabel(object.position)} and teleport there</small></button>`).join('')}</div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-immortality-phylactery]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'immortality-phylactery-choice', playerId: immortality.playerId, objectId: button.dataset.immortalityPhylactery! })));
    return;
  }
  const shadowBarter = (gameState as GameState & { shadowBarter?: { attackerId: PlayerId } | null }).shadowBarter;
  if (gameState.phase === 'shadow-barter-tomb-offer' && shadowBarter && canLocalAct(shadowBarter.attackerId)) {
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="choice-dialog"><span>AFTER COMBAT</span><h2>Shadow Barter</h2><p>You may create a Tomb on an empty Square within Range 1.</p><div class="choice-cards"><button id="shadowBarterCreateTomb"><strong>Create Tomb</strong><small>Select an adjacent empty Square</small></button></div><button class="choice-decline" id="shadowBarterDeclineTomb">Do not create</button></div>`;
    modal.querySelector('#shadowBarterCreateTomb')?.addEventListener('click', () => dispatch({ type: 'shadow-barter-tomb-choice', playerId: shadowBarter.attackerId, use: true }));
    modal.querySelector('#shadowBarterDeclineTomb')?.addEventListener('click', () => dispatch({ type: 'shadow-barter-tomb-choice', playerId: shadowBarter.attackerId, use: false }));
    return;
  }
  const wrecknaState = gameState as GameState & { wrecknaWisdom?: { playerId: PlayerId } | null; wrecknaPhylacteryChoice?: { casterId: PlayerId; availableTypes: ('might' | 'wisdom' | 'ritual')[] } | null };
  if (gameState.phase === 'wreckna-wisdom-offer' && wrecknaState.wrecknaWisdom && canLocalAct(wrecknaState.wrecknaWisdom.playerId)) {
    const player = gameState.players[wrecknaState.wrecknaWisdom.playerId];
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="choice-dialog"><span>PHYLACTERY POWER</span><h2>Of Wisdom</h2><p>Draw 1 Card, then discard 1 Card before choosing a Defend Card.</p><div class="choice-cards"><button id="useWrecknaWisdom"><strong>Use Of Wisdom</strong><small>Draw 1, then discard 1</small></button></div><button class="choice-decline" id="declineWrecknaWisdom">Continue without using</button></div>`;
    modal.querySelector('#useWrecknaWisdom')?.addEventListener('click', () => dispatch({ type: 'wreckna-wisdom-choice', playerId: player.id, use: true }));
    modal.querySelector('#declineWrecknaWisdom')?.addEventListener('click', () => dispatch({ type: 'wreckna-wisdom-choice', playerId: player.id, use: false }));
    return;
  }
  if (gameState.phase === 'choosing-wreckna-phylactery' && wrecknaState.wrecknaPhylacteryChoice && canLocalAct(wrecknaState.wrecknaPhylacteryChoice.casterId)) {
    const choice = wrecknaState.wrecknaPhylacteryChoice;
    const copy = { might: ['Of Might', 'Spend 1 MOV for +1 Attack Value as a Combat Power.'], wisdom: ['Of Wisdom', 'Draw 1 Card and discard 1 before choosing a Defend Card.'], ritual: ['Of Ritual', 'Ignore HP or Tomb sacrifices when creating future Phylacteries.'] } as const;
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="choice-dialog"><span>INFUSE OBJECT</span><h2>Choose Phylactery Type</h2><p>Only currently inactive types are available. Wreckna can maintain no more than 2 active Phylacteries.</p><div class="choice-cards">${choice.availableTypes.map((type) => `<button data-phylactery-type="${type}"><strong>${copy[type][0]}</strong><small>${copy[type][1]}</small></button>`).join('')}</div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-phylactery-type]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'wreckna-phylactery-choice', playerId: choice.casterId, phylacteryType: button.dataset.phylacteryType as 'might' | 'wisdom' | 'ritual' })));
    return;
  }
  const arm = gameState.armDaWiz;
  const visible = (gameState.phase === 'choosing-arm-da-wiz-choice' || gameState.phase === 'choosing-arm-da-wiz-create-payment' || gameState.phase === 'choosing-arm-da-wiz-target') && Boolean(arm) && canLocalAct(arm!.casterId);
  modal.classList.toggle('hidden', !visible);
  if (!visible || !arm) { modal.innerHTML = ''; return; }
  if (gameState.phase === 'choosing-arm-da-wiz-create-payment') {
    const player = gameState.players[arm.casterId];
    modal.innerHTML = `<div class="choice-dialog"><span>SHIELD CREATION</span><h2>Choose Payment</h2><p>Spend 1 HP or 1 Rage Stack to create and instantly equip a new Iron Shield.</p><div class="choice-cards"><button id="armWizPayHp" ${player.hp < 1 ? 'disabled' : ''}><strong>Use 1 HP</strong><small>${player.hp} HP available</small></button><button id="armWizPayRage" ${player.rageStacks < 1 ? 'disabled' : ''}><strong>Use 1 Rage Stack</strong><small>${player.rageStacks} Rage Stack${player.rageStacks === 1 ? '' : 's'} available</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
    modal.querySelector<HTMLButtonElement>('#armWizPayHp')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-create-payment', playerId: arm.casterId, payment: 'hp' }));
    modal.querySelector<HTMLButtonElement>('#armWizPayRage')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-create-payment', playerId: arm.casterId, payment: 'rage' }));
    modal.querySelector<HTMLButtonElement>('#armWizCancel')!.addEventListener('click', () => dispatch({ type: 'cancel-targeting', playerId: arm.casterId }));
    return;
  }
  if (gameState.phase === 'choosing-arm-da-wiz-target') {
    const shields = gameState.objects.filter((object) => object.kind === 'orkk-shield' && object.ownerId === arm.casterId);
    modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Recall a Shield</h2><p>Select an Iron Shield anywhere on the Board to recall and equip. Enemy-occupied Squares do not block its route.</p><div class="choice-cards">${shields.map((shield) => {
      const path = armDaWizPath(gameState, shield, gameState.players[arm.casterId].position, arm.range);
      const enemiesCrossed = shieldRecallEnemyCount(gameState, arm.casterId, path);
      return `<button data-arm-shield="${escapeHtml(shield.id)}"><strong>Iron Shield · ${cellLabel(shield.position)}</strong><small>Recall toward ${escapeHtml(gameState.players[arm.casterId].name)} (cross ${enemiesCrossed} enemies)</small></button>`;
    }).join('')}</div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-arm-shield]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-target', playerId: arm.casterId, objectId: button.dataset.armShield! })));
    modal.querySelector<HTMLButtonElement>('#armWizCancel')!.addEventListener('click', () => dispatch({ type: 'cancel-targeting', playerId: arm.casterId }));
    return;
  }
  modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Arm da Wiz</h2><p>Recall an Iron Shield within Range ${arm.range}, or create and instantly equip a replacement when the old Shield is destroyed or outside Range.</p><div class="choice-cards"><button id="armWizRecall" ${arm.canRecall ? '' : 'disabled'}><strong>Recall Shield</strong><small>${arm.canRecall ? 'Select an in-range Shield on the Board' : 'No Shield is within recall Range'}</small></button><button id="armWizCreate" ${arm.canCreate ? '' : 'disabled'}><strong>Create Shield</strong><small>${arm.canCreate ? 'Create and equip a new Iron Shield' : 'Your existing Shield can be recalled'}</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
  modal.innerHTML = `<div class="choice-dialog"><span>PERK TARGETING</span><h2>Arm da Wiz</h2><p>Recall an Iron Shield from anywhere on the Board, or create and instantly equip a new one without removing existing Shields.</p><div class="choice-cards"><button id="armWizRecall" ${arm.canRecall ? '' : 'disabled'}><strong>Recall Shield</strong><small>${arm.canRecall ? 'Select any reachable Shield on the Board' : 'No Shield has a valid recall path'}</small></button><button id="armWizCreate"><strong>Create Shield</strong><small>Create and equip a new Iron Shield; keep existing Shields</small></button></div><button class="choice-decline" id="armWizCancel">Cancel Perk</button></div>`;
  document.querySelector('#armWizRecall')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-choice', playerId: arm.casterId, choice: 'recall' }));
  document.querySelector('#armWizCreate')?.addEventListener('click', () => dispatch({ type: 'arm-da-wiz-choice', playerId: arm.casterId, choice: 'create' }));
  document.querySelector('#armWizCancel')?.addEventListener('click', () => dispatch({ type: 'cancel-targeting', playerId: arm.casterId }));
}

function renderManaModal() {
  const modal = byId('manaModal');
  const sweet = (gameState as GameState & { sweetPotato?: { casterId: PlayerId } | null }).sweetPotato;
  if ((gameState.phase as string) === 'choosing-sweet-potato' && sweet && canLocalAct(sweet.casterId)) {
    const player = gameState.players[sweet.casterId];
    const statusCount = sweetPotatoStatusCount(player);
    modal.classList.remove('hidden');
    modal.innerHTML = `<div class="choice-panel mana-choice-panel"><span>SWEET POTATO · ACTION</span><strong>Choose an effect</strong><p>Restore 2 Hit Points, or Remove all ${statusCount} negative Status Card${statusCount === 1 ? '' : 's'} currently in ${escapeHtml(player.name)}'s Deck.</p><div><button id="sweetPotatoHeal">Heal 2 Hit Points</button><button id="sweetPotatoCleanse">Remove ${statusCount} Status Card${statusCount === 1 ? '' : 's'}</button></div><button class="minimize-mana-choice" id="sweetPotatoCancel">Cancel · Return Card to Hand</button></div>`;
    document.querySelector('#sweetPotatoHeal')?.addEventListener('click', () => dispatch({ type: 'sweet-potato-choice', playerId: sweet.casterId, choice: 'heal' }));
    document.querySelector('#sweetPotatoCleanse')?.addEventListener('click', () => dispatch({ type: 'sweet-potato-choice', playerId: sweet.casterId, choice: 'cleanse' }));
    document.querySelector('#sweetPotatoCancel')?.addEventListener('click', () => dispatch({ type: 'sweet-potato-choice', playerId: sweet.casterId, choice: 'cancel' }));
    return;
  }
  const playerId = gameState.pendingManaChoice;
  if (gameState.phase !== 'choosing-mana-mode' || !playerId || !canLocalAct(playerId)) { modal.classList.add('hidden'); modal.innerHTML = ''; return; }
  const player = gameState.players[playerId];
  modal.classList.remove('hidden');
  modal.innerHTML = `<div class="choice-panel mana-choice-panel"><span>CLASSIC WIZARDRY · START OF TURN</span><strong>${player.name} has 3 Mana</strong><p>Consume all 3 Mana to enable advanced Attack and Perk spell effects this turn? Normal spell resolution will not generate Mana while Consume is active.</p><div><button id="consumeMana">Consume · Advanced Spells</button><button id="generateMana">Reject · Keep Generating</button></div><button class="minimize-mana-choice" id="minimizeManaChoice">Minimize · Review Hand and Battlefield</button></div>`;
  document.querySelector('#consumeMana')?.addEventListener('click', () => dispatch({ type: 'mana-choice', playerId, consume: true }));
  document.querySelector('#generateMana')?.addEventListener('click', () => dispatch({ type: 'mana-choice', playerId, consume: false }));
  document.querySelector('#minimizeManaChoice')?.addEventListener('click', () => dispatch({ type: 'minimize-mana-choice', playerId }));
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
  const focusCardHtml = (cardId: CardTypeId, attribute: 'data-opening-focus-card' | 'data-focus-card') => {
    const card = cardDefinition({ instanceId: '', cardId });
    const typeLabel = card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : 'REACTION · DISCARD ON USE';
    const valueLabel = card.kind === 'attack' ? 'ATTACK VALUE' : 'DEFEND VALUE';
    return `<button type="button" class="card ${cardVisualClass(card)} focus-selection-card" ${attribute}="${cardId}"><span>${typeLabel}</span><strong>${escapeHtml(card.name)}</strong><div><b>${card.value}</b> ${valueLabel}</div><small>${cardRulesHtml(card)}</small></button>`;
  };
  if (gameState.phase === 'choosing-focus') {
    const definition = STARTING_DECKS[player.character as keyof typeof STARTING_DECKS];
    modal.innerHTML = `<div class="choice-dialog focus-choice-dialog"><span>STARTING DECK · CHOOSE FOCUS CARD</span><h2>${escapeHtml(player.name)}</h2><p>Choose one of all four available Focus Cards. Its type becomes your initial Focus.</p><div class="focus-choice-groups"><section class="focus-choice-group attack-focus-group"><h3>Attack Focus</h3><div class="focus-card-pair">${definition.attackFocus.map((cardId) => focusCardHtml(cardId, 'data-opening-focus-card')).join('')}</div></section><section class="focus-choice-group defend-focus-group"><h3>Defend Focus</h3><div class="focus-card-pair">${definition.defendFocus.map((cardId) => focusCardHtml(cardId, 'data-opening-focus-card')).join('')}</div></section></div></div>`;
    modal.querySelectorAll<HTMLButtonElement>('[data-opening-focus-card]').forEach((button) => button.addEventListener('click', () => dispatch({ type: 'choose-focus-card', playerId, cardId: button.dataset.openingFocusCard as any })));
    return;
  }
  const focus = opening.focusByPlayer[playerId]!;
  const definition = STARTING_DECKS[player.character as keyof typeof STARTING_DECKS];
  const choices = focus === 'attack' ? definition.attackFocus : definition.defendFocus;
  modal.innerHTML = `<div class="choice-dialog focus-choice-dialog focus-choice-dialog-single"><span>${focus.toUpperCase()} FOCUS · CHOOSE TENTH CARD</span><h2>${escapeHtml(player.name)}</h2><section class="focus-choice-group ${focus}-focus-group"><h3>${focus === 'attack' ? 'Attack' : 'Defend'} Focus</h3><div class="focus-card-pair">${choices.map((cardId) => focusCardHtml(cardId, 'data-focus-card')).join('')}</div></section><button class="focus-back-button" id="backToFocusChoice" type="button">Back</button></div>`;
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
  const rewardCardId = current.id === 'damage-contest' ? 'fireball' : current.id === 'rabbit-run' ? 'portal' : current.id === 'provocateur' ? 'vicious-mockery' : current.id === 'capture-the-flag' ? 'banner' : current.id === 'tank-junior' ? 'mythril-helmet' : current.id === 'the-elephant' ? 'boomerang' : current.id === 'the-gambler' ? 'monarch-flush' : current.id === 'hot-potato' ? 'sweet-potato' : null;
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
  if (questId === 'capture-the-flag') return `Each player's Flag begins between their two painted Base Squares. Occupy either enemy Base Square to grab its Flag, then end a turn on either Square of your own Base while carrying it. A defeated carrier drops the Flag on their death Square, where another character can grab it. Each Flag can leave its Base only once. Complete this Quest by Round ${endRound}.`;
  if (questId === 'the-elephant') return `Destroy the most Objects until Round ${endRound}.`;
  if (questId === 'the-gambler') return `Add the most Cards to your Discard Deck until Round ${endRound}. Removed Cards do not count.`;
  const withoutRelativeDuration = fallback.replace(/(?:in|during) the next \d+ Rounds?/i, `until Round ${endRound}`);
  return withoutRelativeDuration === fallback ? `${fallback.replace(/\s*\.\s*$/, '')}. Until Round ${endRound}.` : withoutRelativeDuration;
}

function renderPhaseRewardModal() {
  const extended = gameState as GameState & { questPhases?: { lastQuestWinners: PlayerId[]; progression: Partial<Record<PlayerId, { initialFocus: 'attack' | 'defend' }>>; phaseReward: { phase: 1 | 2 | 3; pendingPlayerIds: PlayerId[]; selectedCardId?: any; phaseThreeDuplicated?: boolean; phaseThreeRemoved?: boolean } | null } };
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
    const duplicated = Boolean(reward.phaseThreeDuplicated);
    const removed = Boolean(reward.phaseThreeRemoved);
    const phaseThreeCards = ([['HAND', player.hand], ['DECK', player.deck], ['DISCARD', player.discard]] as const).flatMap(([pile, cards]) => cards.map((instance) => ({ pile, instance })));
    phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE THREE · CARD REFINEMENT</span><h2>${escapeHtml(player.name)}</h2><p>Duplicate up to 1 Card and Remove up to 1 Card from your Hand, Deck, or Discard. Each action can be used once.${winner ? ' You may choose the destination of a duplicate.' : ' A duplicate is shuffled into your Deck.'} Hover a Card for its complete rules.</p><div class="phase-three-progress"><span class="${duplicated ? 'used' : ''}">Duplicate: ${duplicated ? 'used' : 'available'}</span><span class="${removed ? 'used' : ''}">Remove: ${removed ? 'used' : 'available'}</span></div><div class="choice-cards phase-three-grid">${phaseThreeCards.map(({ pile, instance }) => { const card = cardDefinition(instance); const valueLabel = card.kind === 'attack' ? 'ATTACK VALUE' : card.kind === 'defend' ? 'DEFEND VALUE' : card.kind === 'perk' ? 'PERK VALUE' : 'STATUS VALUE'; return `<article class="phase-three-card" data-phase-preview="${card.id}"><span>${pile}</span><strong>${escapeHtml(card.name)}</strong><b>${card.value} ${valueLabel}</b><div class="phase-three-actions"><button type="button" class="phase-duplicate" data-phase-op="duplicate" data-instance="${instance.instanceId}" ${duplicated ? 'disabled' : ''}>Duplicate</button><button type="button" class="phase-remove" data-phase-op="remove" data-instance="${instance.instanceId}" ${removed ? 'disabled' : ''}>Remove</button></div></article>`; }).join('')}</div><button type="button" class="choice-decline" id="finishPhaseThree">${duplicated || removed ? 'Cancel remaining action' : 'Cancel · use neither action'}</button></div>`;
    phaseRewardModal.querySelectorAll<HTMLElement>('[data-phase-op]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); dispatch({ type: 'phase-three-operation', playerId, cardInstanceId: button.dataset.instance!, operation: button.dataset.phaseOp as any }); }));
    byId('finishPhaseThree').addEventListener('click', () => dispatch({ type: 'phase-three-finish', playerId }));
    phaseRewardModal.querySelectorAll<HTMLElement>('[data-phase-preview]').forEach((card) => {
      card.addEventListener('pointerenter', (event) => showCardPreview(card.dataset.phasePreview!, event));
      card.addEventListener('pointermove', positionCardPreview);
      card.addEventListener('pointerleave', hideCardPreview);
    });
    return;
  }
  const choices = phaseCardCandidates(gameState, playerId);
  phaseRewardModal.innerHTML = `<div class="choice-dialog"><span>PHASE ${reward.phase} REWARD</span><h2>${escapeHtml(player.name)}</h2><p>${winner ? 'Choose one Card. Because you won the previous Action Quest, you will choose its destination next.' : 'Choose one Card to shuffle into your Deck.'}</p><div class="choice-cards">${choices.map((cardId) => { const card = cardDefinition({ instanceId: '', cardId }); return `<button data-phase-card="${cardId}"><strong>${escapeHtml(card.name)}</strong><b>${card.value} ${card.kind === 'attack' ? 'ATTACK' : card.kind === 'defend' ? 'DEFEND' : 'PERK'} VALUE</b><small>${escapeHtml(card.effectText ?? card.levelEffects?.join(' · ') ?? '')}</small></button>`; }).join('')}</div></div>`;
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
  const acknowledged = viewer ? reveal.acknowledged.includes(viewer) || combatAckRequestFor === reveal.expiresAt : false;
  const modifierLines = (items: typeof reveal.attackModifiers) => items?.length
    ? items.map((item) => `<li class="${item.value < 0 ? 'penalty' : 'bonus'}"><b>${item.value > 0 ? '+' : '−'}${Math.abs(item.value)}</b> from ${escapeHtml(item.source)}</li>`).join('')
    : '<li class="neutral">No bonus values applied</li>';
  const defendCard = defend ? `<article class="combat-card defend"><label>DEFEND VALUE <strong>${modifier(reveal.defendBase, reveal.defendTotal)}</strong></label><div><span>DEFENCE</span><h3>${escapeHtml(defend.name)}</h3><b>${reveal.defendTotal}</b><small>${escapeHtml((defend.effectText ?? '').replace('reveal 4 Cards', `reveal ${reveal.defendBase} Cards`))}</small></div></article>` : `<article class="combat-card defend"><label>NO DEFENCE</label><div><span>DEFENCE</span><h3>Take the hit</h3><b>0</b><small>No Defend Card was played.</small></div></article>`;
  if (gameState.phase === 'choosing-combat-stack' && gameState.pendingAttack && (localSeat || mode === 'hotseat')) {
    const pending = gameState.pendingAttack;
    const combatants = [pending.attackerId, pending.defenderId];
    const localCombatSelections = (gameState as GameState & { combatStackSelections?: Partial<Record<PlayerId, string[]>> }).combatStackSelections ?? {};
    const submittedIds = [...new Set([...(mode === 'online' ? combatStackSubmittedPlayerIds : []), ...combatants.filter((id) => localCombatSelections[id] !== undefined)])];
    const combatSeat = localSeat ?? combatants.find((id) => localCombatSelections[id] === undefined);
    if (!combatSeat) return;
    const key = `${pending.cardInstanceId}:${pending.defenderId}`;
    if (combatStackSelectionKey !== key) { combatStackSelectionKey = key; selectedCombatCardIds.clear(); combatStackSubmittedPlayerIds = []; }
    if (mode === 'hotseat') combatStackSubmittedPlayerIds = submittedIds;
    const player = gameState.players[combatSeat];
    const attacker = combatSeat === pending.attackerId;
    const applicableIds = new Set(applicableCombatCardInstanceIds(gameState, combatSeat));
    const applicable = player.hand.filter((instance) => applicableIds.has(instance.instanceId));
    const mightAvailable = combatSeat === pending.attackerId && player.character === 'wreckna' && player.movementRemaining > 0 && Boolean(activeWrecknaPhylactery(gameState, player.id, 'might'));
    if (applicable.length === 0 && localCombatSelections[combatSeat] !== undefined) { modal.classList.add('hidden'); modal.innerHTML = ''; return; }
    const submitted = submittedIds.includes(combatSeat);
    const opponentId = combatSeat === pending.attackerId ? pending.defenderId : pending.attackerId;
    const heldExhaust = player.hand.filter((card) => card.cardId === 'exhaust').length;
    const heldBanner = player.hand.some((card) => card.cardId === 'banner');
    const unchangedEffects = [
      heldExhaust ? `${heldExhaust} held Exhaust: -${heldExhaust} ${attacker ? 'ATT' : 'DEF'} already included` : '',
      heldBanner ? `held Banner: no bonus unless selected as the Combat Card` : '',
    ].filter(Boolean).join(' · ') || 'No held Combat Card modifier changes the current value';
    const preCombatEffects = [
      pending.blessedBlockResolved ? 'Defender pre-combat: the Attack Card effect was cancelled by Blessed Block.' : '',
      pending.blessedSwiftnessResolved ? 'Defender pre-combat: Blessed Swiftness annulled the Attacker’s unspent MOV.' : '',
      pending.manaShieldManaGenerated ? 'Defender pre-combat: Mana Shield generated 1 Mana.' : '',
      ...(pending.attackModifiers ?? []).filter((entry) => entry.source.includes('pre-combat')).map((entry) => `Attacker pre-combat: ${entry.source} changed ATT by ${entry.value > 0 ? '+' : ''}${entry.value}.`),
    ].filter(Boolean);
    const optionResult = (instance: (typeof player.hand)[number]) => {
      const definition = cardDefinition(instance);
      const ownValue = attacker ? reveal.attackTotal : reveal.defendTotal;
      if (instance.cardId === 'vicious-mockery') return `${attacker ? 'ATT' : 'DEF'} ${ownValue} → ${ownValue + 2}`;
      if (instance.cardId === 'exhaust') return `${attacker ? 'ATT' : 'DEF'} ${ownValue} → ${ownValue - 2} · attached Exhaust replaces its held -1 with -3`;
      if (instance.cardId === 'blessing-might') return `ATT ${reveal.attackTotal} → ${reveal.attackTotal + 2}`;
      if (instance.cardId === 'blessing-light') return `Enemy DEF ${reveal.defendTotal} → ${reveal.defendTotal - 1}`;
      if (instance.cardId === 'banner') return `${attacker ? 'ATT' : 'DEF'} ${ownValue} → ${ownValue + 1}`;
      return `ATT ${reveal.attackTotal} · DEF ${reveal.defendTotal} · ${definition.effectText ?? 'apply this Combat Card effect'}`;
    };
    const cardButtons = applicable.map((instance) => {
      const card = cardDefinition(instance);
      const shortEffect: Partial<Record<CardTypeId, string>> = { exhaust: 'Attach for -3 to your played Card.', 'vicious-mockery': '+2 to your played Card.', banner: '+1 to your played Card.', 'mythril-helmet': 'Negate all Damage.', 'blessing-light': '-1 to enemy Defend.', 'blessing-might': '+2 to your Attack.', 'blessing-shield': 'Block 1 effect Damage and 1 Status.', 'blessing-faith': 'Negate all Damage to both sides.' };
      return `<button class="combat-stack-card" data-combat-stack-card="${instance.instanceId}" data-combat-preview="${card.id}" ${submitted ? 'disabled' : ''}><strong>USE ${escapeHtml(card.name)}</strong><small>${escapeHtml(shortEffect[card.id] ?? 'Apply this Combat Card.')}</small><span>${escapeHtml(optionResult(instance))}</span></button>`;
    }).join('');
    const mightButton = mightAvailable ? `<button class="combat-stack-card" id="usePhylacteryMight" ${submitted ? 'disabled' : ''}><strong>USE PHYLACTERY OF MIGHT</strong><small>Combat Power · Spend 1 MOV instead of using a Combat Card.</small><span>ATT ${reveal.attackTotal} → ${reveal.attackTotal + 1}</span></button>` : '';
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>COMBAT STACK · PRIVATE SELECTION</span><h2>Attack and Defence Revealed</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-modifier-breakdown"><section><h4>PRE-COMBAT STACK</h4><ul>${preCombatEffects.length ? preCombatEffects.map((line) => `<li>${escapeHtml(line)}</li>`).join('') : '<li class="neutral">No pre-combat effects changed this combat.</li>'}</ul></section></div><div class="combat-stack-private"><h3>Choose exactly one Combat Power or Combat Card, or use none</h3>${mightButton}${cardButtons}<button class="combat-stack-card combat-stack-none" id="refuseCombatStack" ${submitted ? 'disabled' : ''}><strong>DO NOT USE ANYTHING</strong><small>Keep every Combat Card in Hand. ${escapeHtml(unchangedEffects)}.</small><span>ATT ${reveal.attackTotal} · DEF ${reveal.defendTotal}</span></button></div><div class="combat-ack-status">${submitted ? 'Your selection is locked.' : 'Your choice remains hidden until both Players submit.'} · ${escapeHtml(gameState.players[opponentId].name)}: ${combatStackSubmittedPlayerIds.includes(opponentId) ? 'SUBMITTED' : 'CHOOSING'}</div></div>`;
    modal.querySelector<HTMLButtonElement>('#usePhylacteryMight:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'wreckna-might-choice', playerId: combatSeat, use: true }));
    modal.querySelectorAll<HTMLButtonElement>('[data-combat-stack-card]:not(:disabled)').forEach((button) => button.addEventListener('click', () => {
      if (mode === 'online') room?.send('command', { type: 'combat-stack-submit', cardInstanceIds: [button.dataset.combatStackCard!] });
      else dispatch({ type: 'combat-stack-choice', playerId: combatSeat, cardInstanceId: button.dataset.combatStackCard! });
    }));
    modal.querySelectorAll<HTMLElement>('[data-combat-preview]').forEach((button) => {
      button.addEventListener('pointerenter', (event) => showCardPreview(button.dataset.combatPreview!, event));
      button.addEventListener('pointermove', positionCardPreview);
      button.addEventListener('pointerleave', hideCardPreview);
    });
    modal.querySelector<HTMLButtonElement>('#refuseCombatStack:not(:disabled)')?.addEventListener('click', () => {
      if (mode === 'online') room?.send('command', { type: 'combat-stack-submit', cardInstanceIds: [] });
      else dispatch({ type: 'combat-stack-choice', playerId: combatSeat, cardInstanceId: null });
    });
    return;
  }
  if (reveal.manaBarrage) {
    const decisionPlayer = reveal.manaBarrage.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>MANA BARRAGE · COMBAT EFFECT</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply 1 Mana Point?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Spend exactly 1 stored Mana Point to deal 1 Damage to the target during combat, or keep the Mana.</div><div class="combat-choice-buttons"><button id="useManaBarrage" ${mayDecide ? '' : 'disabled'}>SPEND 1 MANA · DEAL 1 DAMAGE</button><button id="keepManaBarrage" ${mayDecide ? '' : 'disabled'}>KEEP MANA</button></div></div>`;
    document.querySelector('#useManaBarrage:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'mana-barrage-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepManaBarrage:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'mana-barrage-decision', playerId: decisionPlayer, use: false }));
    return;
  }
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
  if (reveal.blessingMight) {
    const decisionPlayer = reveal.blessingMight.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>BLESSING · COMBAT MODIFIER</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply Blessing: Might?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Blessing: Might to increase the played Attack Card by +2 ATT, or keep it for another combat. It cannot be used during Spirit Form.</div><div class="combat-choice-buttons"><button id="useBlessingMight" ${mayDecide ? '' : 'disabled'}>USE · +2 ATT</button><button id="keepBlessingMight" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    document.querySelector('#useBlessingMight:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-might-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepBlessingMight:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-might-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  if (reveal.blessingFaith) {
    const decisionPlayer = reveal.blessingFaith.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>BLESSING · COMBAT SANCTUARY</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply Blessing: Faith?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Blessing: Faith to negate all combat-value and Card-effect Damage dealt to both attacker and defender in this combat.</div><div class="combat-choice-buttons"><button id="useBlessingFaith" ${mayDecide ? '' : 'disabled'}>USE · NEGATE ALL DAMAGE</button><button id="keepBlessingFaith" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    document.querySelector('#useBlessingFaith:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-faith-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepBlessingFaith:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-faith-decision', playerId: decisionPlayer, use: false }));
    return;
  }
  if (reveal.mythrilHelmet && gameState.pendingAttack?.blessingShieldApplied === undefined) {
    const decisionPlayer = reveal.mythrilHelmet.playerId;
    const mayDecide = canLocalAct(decisionPlayer);
    modal.innerHTML = `<div class="combat-reveal-dialog"><span>BLESSING · COMBAT DEFENCE</span><h2>${escapeHtml(gameState.players[decisionPlayer].name)}: apply Blessing: Shield?</h2><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div><div class="combat-ack-status">Remove Blessing: Shield to absorb 1 Damage caused by this Attack Card's effects. Ordinary combat Damage is unaffected.</div><div class="combat-choice-buttons"><button id="useBlessingShield" ${mayDecide ? '' : 'disabled'}>USE · ABSORB 1 EFFECT DAMAGE</button><button id="keepBlessingShield" ${mayDecide ? '' : 'disabled'}>KEEP CARD</button></div></div>`;
    modal.innerHTML = modal.innerHTML.replace("this Attack Card's effects", 'an enemy Attack or Defend Card');
    modal.innerHTML = modal.innerHTML.replace('Remove Blessing: Shield to absorb 1 Damage caused by an enemy Attack or Defend Card. Ordinary combat Damage is unaffected.', 'Apply Blessing: Shield to absorb 1 Damage from enemy Attack/Defend Card effects and automatically block the first negative Status applied to you during the rest of this combat. Ordinary combat Damage and pre-combat Statuses are unaffected.').replace('USE В· ABSORB 1 EFFECT DAMAGE', 'USE В· SHIELD THIS COMBAT');
    document.querySelector('#useBlessingShield:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-shield-decision', playerId: decisionPlayer, use: true }));
    document.querySelector('#keepBlessingShield:not(:disabled)')?.addEventListener('click', () => dispatch({ type: 'blessing-shield-decision', playerId: decisionPlayer, use: false }));
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
  const combatPlayers = gameState.pendingAttack ? [gameState.pendingAttack.attackerId, gameState.pendingAttack.defenderId] : (Object.keys(gameState.players) as PlayerId[]).slice(0, 2);
  const confirmationStatus = mode === 'online'
    ? combatPlayers.map((id) => `${escapeHtml(gameState.players[id].name)}: ${reveal.acknowledged.includes(id) ? 'READY' : 'WAITING'}`).join(' · ')
    : 'Confirm to continue immediately';
  const readyLabel = viewer ? `${escapeHtml(gameState.players[viewer].name)}: READY` : 'OK';
  const combatWinner = reveal.combatWinnerId ? gameState.players[reveal.combatWinnerId] : null;
  const combatDamage = reveal.combatDamage ?? Math.max(0, reveal.attackTotal - reveal.defendTotal);
  const forfeitReason = (reveal as typeof reveal & { forfeitReason?: string }).forfeitReason;
  const resultSummary = forfeitReason
    ? `<div class="combat-result-summary"><strong>${escapeHtml(forfeitReason)}</strong><span>Both Cards are discarded. Only Yamato's Summon resolves.</span></div>`
    : combatWinner
      ? `<div class="combat-result-summary"><strong>${escapeHtml(combatWinner.name)} WON THE COMBAT</strong><span>${combatDamage} COMBAT DAMAGE WILL BE DEALT</span></div>`
      : '';
  const breakdown = `<div class="combat-modifier-breakdown"><section><h4>ATTACK VALUE SOURCES</h4><ul>${modifierLines(reveal.attackModifiers)}</ul></section><section><h4>DEFEND VALUE SOURCES</h4><ul>${modifierLines(reveal.defendModifiers)}</ul></section></div>`;
  const appliedCombatCards = reveal.combatStackApplied
    ? `<div class="combat-modifier-breakdown combat-stack-reveal">${combatPlayers.map((id) => `<section><h4>${escapeHtml(gameState.players[id].name)} · COMBAT CARDS</h4><ul>${(reveal.combatStackApplied?.[id] ?? []).length ? reveal.combatStackApplied![id]!.map((cardId) => `<li class="bonus"><b>APPLIED</b> ${escapeHtml(cardDefinition({ instanceId: '', cardId }).name)}</li>`).join('') : '<li class="neutral">No Combat Cards applied</li>'}</ul></section>`).join('')}</div>`
    : '';
  modal.innerHTML = `<div class="combat-reveal-dialog"><span>COMBAT RESOLUTION</span><h2>Attack vs Defence</h2>${resultSummary}<div class="combat-countdown"><b>${seconds}</b> seconds</div><div class="combat-reveal-cards"><article class="combat-card attack"><label>ATTACK VALUE <strong>${modifier(reveal.attackBase, reveal.attackTotal)}</strong></label><div><span>ATTACK</span><h3>${escapeHtml(attack.name)}</h3><b>${reveal.attackTotal}</b><small>${escapeHtml(attack.effectText ?? '')}</small></div></article>${defendCard}</div>${appliedCombatCards}${breakdown}<div class="combat-ack-status">${confirmationStatus}</div><button id="combatRevealOk" ${acknowledged ? 'disabled' : ''}>${acknowledged ? 'WAITING FOR OPPONENT' : readyLabel}</button></div>`;
  document.querySelector('#combatRevealOk:not(:disabled)')?.addEventListener('click', acknowledgeCombatReveal);
}

function acknowledgeCombatReveal() {
  if (!gameState.combatReveal) return;
  if (mode === 'online') {
    submitOnlineCombatAcknowledgement(gameState.combatReveal.expiresAt);
    return;
  }
  const combatPlayers = gameState.pendingAttack ? [gameState.pendingAttack.attackerId, gameState.pendingAttack.defenderId] : (Object.keys(gameState.players) as PlayerId[]).slice(0, 2);
  const combatExpiresAt = gameState.combatReveal.expiresAt;
  const first = applyCommand(gameState, { type: 'ack-combat', playerId: combatPlayers[0], combatExpiresAt });
  if (!first.ok) return notify(first.error);
  const second = applyCommand(first.state, { type: 'ack-combat', playerId: combatPlayers[1], combatExpiresAt });
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
      const canUse = ownerId === viewerId && selected.kind !== 'perk' && Boolean(instance) && owner.actionsRemaining > 0 && (!owner.perkUsed || (owner.spellsingerExtraPerkUses ?? 0) > 0) && gameState.phase === 'active' && canLocalAct(ownerId);
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
      if (!isCardRevealedToOpponents(opponent, instance, viewerId) && card.kind !== 'status') return `<div class="opponent-card card-back" title="Unrevealed opponent card"><i></i><b>G</b></div>`;
      return `<div class="opponent-card revealed ${cardVisualClass(card)}" data-preview-card="${card.id}" title="Revealed: ${escapeHtml(card.name)} — value ${card.value}"><span>${card.kind}</span><strong>${escapeHtml(card.name)}</strong><b>${card.value}</b></div>`;
    }).join('');
    return `<section class="opponent-hand-panel seat-${opponentId.toLowerCase()} opponent-row-${index + 1}" style="--owner-color:${ownerColor}"><span><strong class="opponent-owner-name">${escapeHtml(opponent.name.toUpperCase())}</strong><span> · ${opponent.hand.length} CARD${opponent.hand.length === 1 ? '' : 'S'}</span></span><div class="opponent-hand">${cards}</div></section>`;
  }).join('');
  document.querySelectorAll<HTMLElement>('[data-preview-card]').forEach((element) => {
    element.addEventListener('mouseenter', () => showCardPreview(element.dataset.previewCard!));
    element.addEventListener('mouseleave', hideCardPreview);
  });
}

function showCardPreview(cardId: string, pointer?: PointerEvent) {
  const card = CARDS.find((candidate) => candidate.id === cardId);
  if (!card) return;
  const preview = byId('cardHoverPreview');
  preview.innerHTML = `<article class="card ${cardVisualClass(card)}"><span>${card.kind === 'attack' ? 'ACTION · DISCARD ON USE' : card.kind === 'perk' ? 'ACTION: PERK · ONCE PER TURN' : 'REACTION · DISCARD ON USE'}</span><strong>${escapeHtml(card.name.toUpperCase())}</strong><div><b>${card.value}</b> ${card.kind.toUpperCase()} VALUE</div><small>${cardRulesHtml(card)}</small></article>`;
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

function cardVisualClass(card: ReturnType<typeof cardDefinition>): string {
  return `${card.kind}${card.kind === 'status' && card.name.startsWith('Blessing:') ? ' blessing-status' : ''}${card.id === 'panic' ? ' panic-card' : ''}`;
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
let daOrkhAsset: Awaited<ReturnType<GLTFLoader['loadAsync']>> | null = null;
let daOrkhAssetPromise: ReturnType<GLTFLoader['loadAsync']> | null = null;
let spectreAssetPromise: ReturnType<GLTFLoader['loadAsync']> | null = null;
let orkkRageGlowTexture: THREE.CanvasTexture | null = null;
const cellMeshes: THREE.Mesh[] = [];
const axisLabels: THREE.Sprite[] = [];
const dummyGroups = new Map<PlayerId, THREE.Group>();
const objectGroups = new Map<string, THREE.Group>();
const spectreShadowTrailGroup = new THREE.Group();
spectreShadowTrailGroup.name = 'SpectreShadowTrail';
scene.add(spectreShadowTrailGroup);
const lastObjectVisualCells = new Map<string, string>();
type PendingDamageVisual = { playerId: PlayerId; amount: number; collision: boolean; triggerRouteProgress?: number; triggered?: boolean };
const objectMovementAnimations = new Map<string, { animationId?: string; from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; delay?: number; collided: boolean; dx: number; dy: number; path?: THREE.Vector3[]; collisionAt?: THREE.Vector3; collisionTargetKind?: 'player' | 'object'; collisionTargetId?: string; collisionVisibleCenter?: THREE.Vector3; impactDamage?: PendingDamageVisual[]; impactTriggered?: boolean; preserveQuaternion?: THREE.Quaternion; targetQuaternion?: THREE.Quaternion; removeOnComplete?: boolean; destroy?: boolean; baseScale?: THREE.Vector3; equipPlayerId?: PlayerId; parachute?: boolean; releaseSource?: THREE.Object3D; released?: boolean; releaseQuaternion?: THREE.Quaternion; idleQuaternion?: THREE.Quaternion; flightTo?: THREE.Vector3; visibleCenterLocal?: THREE.Vector3; visibleCenterFrom?: THREE.Vector3; visibleCenterTo?: THREE.Vector3; dropDistance?: number; landingShakeDuration?: number; collisionBounceDuration?: number }>();
const pendingDamageVisuals = new Map<string, PendingDamageVisual[]>();
const objectImpactAnimations = new Map<string, { startedAt: number; origin: THREE.Vector3; quaternion: THREE.Quaternion }>();
const processedObjectPushAnimations = new Set<string>();
const processedSpellProjectiles = new Set<string>();
const spellProjectileAnimations: { animationId: string; mesh: THREE.Mesh; points: THREE.Vector3[]; startedAt: number; duration: number; delay: number; casterId: PlayerId; boomerang?: boolean }[] = [];
const moonwaveAnimations: { mesh: THREE.Mesh; points: THREE.Vector3[]; startedAt: number; duration: number; startScale: number; endScale: number }[] = [];
const holyFireAnimations: { group: THREE.Group; flames: THREE.Mesh[]; startedAt: number }[] = [];
const processedStoicShellHeals = new Set<string>();
const stoicShellHealAnimations: { group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh; crown: THREE.Mesh; light: THREE.PointLight; startedAt: number }[] = [];
const processedManaConsumeEvents = new Set<string>();
const manaConsumeAnimations: { parent: THREE.Group; group: THREE.Group; beam: THREE.Mesh; ring: THREE.Mesh; light: THREE.PointLight; startedAt: number }[] = [];
const impactAnimations = new Map<PlayerId, number>();
const damageNumbers: { sprite: THREE.Sprite; startedAt: number; origin: THREE.Vector3 }[] = [];
const lastVisualCells = new Map<PlayerId, string>();
const movementAnimations = new Map<PlayerId, { from: THREE.Vector3; to: THREE.Vector3; startedAt: number; duration: number; path?: THREE.Vector3[]; travelSquares?: number; forced?: boolean; verticalOnly?: boolean }>();
type TriggeredCharacterMovement = { playerId: PlayerId; from: THREE.Vector3; to: THREE.Vector3; duration: number; path?: THREE.Vector3[]; travelSquares?: number; forced?: boolean; triggerRouteProgress?: number };
const impactTriggeredCharacterMovements = new Map<string, TriggeredCharacterMovement[]>();
const characterMovementDirection = new THREE.Vector3();
const wizardLiftedTargets = new Map<PlayerId, { kind: 'player' | 'object'; id: string; baseY: number }>();
const questFlagModels = new Map<string, THREE.Group>();
let questFlagVisualKey = '';
let hotPotatoModel: THREE.Group | null = null;
let boardVisualKey = '';
let fittedArenaKey = '';
let cameraGrab: { pointerId: number; pivot: THREE.Vector3; lastX: number; lastY: number; focusDistance: number } | null = null;
const visualArena = (): ArenaDefinition => {
  const arenaId = (gameState as GameState & { arenaId?: ArenaId }).arenaId;
  if (arenaId === 'trench') return THE_TRENCH_ARENA;
  if (arenaId === 'lordaeron' || gameState.boardSize === LORDAERON_ARENA.height) return LORDAERON_ARENA;
  return NAGRAND_ARENA;
};
const visualBoardWidth = () => visualArena().width;
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
  updateWizardLiftedTargets(time);
  updateObjectMovement(time);
  updateObjectImpactAnimations(time);
  updateSpellProjectiles(time);
  updateStoicShellHealAnimations(time);
  updateManaConsumeAnimations(time);
  updateCharacterFacing(deltaSeconds);
  dummyGroups.forEach((group, id) => {
    const body = group.children[0];
    const moving = movementAnimations.has(id);
    updateWizardAnimation(group, moving, deltaSeconds);
    const forcedMovement = movementAnimations.get(id)?.forced === true;
    if (group.userData.character === 'orkk' && !forcedMovement) updateOrkkAnimation(group, id, moving, deltaSeconds);
    if (group.userData.character === 'spectre') updateSpectreAnimation(group, id, deltaSeconds);
    if (group.userData.character === 'merylin') syncMerylinSummonVisual(group, Boolean(gameState.players[id].merylinSummonActive), time);
    animateFearSigil(group, time);
    const usesImportedAnimation = group.userData.character === 'magician' || Boolean(group.userData.orkkAnimation) || Boolean(group.userData.spectreAnimation);
    body.position.y = usesImportedAnimation ? 0 : group.userData.character === 'wreckna' ? 0.2 + Math.sin(time * 0.0022 + (id === 'P1' ? 0 : 2)) * 0.075 : moving ? Math.abs(Math.sin(time * 0.012)) * 0.08 : Math.sin(time * 0.002 + (id === 'P1' ? 0 : 2)) * 0.035;
    const lichAura = group.getObjectByName('WrecknaLevitationAura');
    if (lichAura) { lichAura.rotation.z = time * 0.0007; lichAura.scale.setScalar(1 + Math.sin(time * 0.004) * 0.08); }
    if (group.userData.character === 'wreckna') {
      const pulse = 1 + Math.sin(time * 0.006) * 0.18;
      const mightLight = group.getObjectByName('WrecknaMightLight') as THREE.PointLight | undefined;
      if (mightLight?.visible) mightLight.intensity = 3.8 * pulse;
      const mantle = group.getObjectByName('WrecknaRitualMantle');
      if (mantle?.visible) { mantle.rotation.y = Math.sin(time * 0.0018) * 0.035; const mantleLight = mantle.getObjectByName('WrecknaMantleLight') as THREE.PointLight | undefined; if (mantleLight) mantleLight.intensity = 3.2 * pulse; }
      const wisdomCrownLight = group.getObjectByName('WrecknaWisdomCrownLight') as THREE.PointLight | undefined;
      if (wisdomCrownLight?.visible) wisdomCrownLight.intensity = 3.4 * pulse;
      const crownBand = group.getObjectByName('WrecknaCrownBand') as THREE.Mesh | undefined;
      const crownMaterial = crownBand?.material as THREE.MeshStandardMaterial | undefined;
      if (crownMaterial && crownMaterial.emissiveIntensity > 1) crownMaterial.emissiveIntensity = 3.8 * pulse;
      for (const eyeName of ['WrecknaEyeLeft', 'WrecknaEyeRight']) { const eye = group.getObjectByName(eyeName) as THREE.Mesh | undefined; const material = eye?.material as THREE.MeshStandardMaterial | undefined; if (material?.emissiveIntensity && material.emissiveIntensity > 1) material.emissiveIntensity = 5.2 * pulse; }
    }
    const shellAura = group.getObjectByName('StoicShellAura');
    if (shellAura?.visible) {
      const pulse = 1 + Math.sin(time * 0.0045) * 0.055;
      shellAura.scale.set(pulse, pulse * 1.02, pulse);
      shellAura.rotation.y = time * 0.00045;
      const light = shellAura.getObjectByName('StoicShellAuraLight') as THREE.PointLight | undefined;
      if (light) light.intensity = 2.8 + Math.sin(time * 0.006) * 0.7;
    }
    updateManaOrbAnimation(group, time);
    if (group.userData.character === 'orkk') updateOrkkRageCoreAnimation(group, time);
    animateFearSigil(group, time);
  });
  objectGroups.forEach((group, objectId) => {
    if (group.userData.spectreReplica) updateSpectreAnimation(group, undefined, deltaSeconds);
    const aura = group.getObjectByName('PhylacteryAura');
    if (aura) { aura.rotation.z = time * 0.0008; aura.scale.setScalar(1 + Math.sin(time * 0.004) * 0.08); }
    if (group.userData.spectreReplica && !objectMovementAnimations.has(objectId)) {
      const body = group.children[0];
      if (group.userData.spectreAnimation) {
        if (body) body.position.y = 0;
        group.scale.setScalar(1);
      } else {
        if (body) body.position.y = Math.sin(time * 0.0035) * 0.08;
        const pulse = 0.96 + Math.sin(time * 0.006) * 0.045;
        group.scale.set(pulse, 1 + Math.sin(time * 0.005) * 0.035, pulse);
      }
    }
  });
  spectreShadowTrailGroup.children.forEach((child, index) => {
    const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
    material.opacity = 0.34 + Math.sin(time * 0.005 - index * 0.55) * 0.13;
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

function spawnHealingVisual(playerId: PlayerId, amount: number) {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const context = canvas.getContext('2d')!;
  context.font = "900 76px 'Barlow Condensed', Arial"; context.textAlign = 'center'; context.textBaseline = 'middle';
  context.lineWidth = 12; context.strokeStyle = 'rgba(0,35,12,.95)'; context.strokeText(`+${amount}`, 128, 66);
  context.fillStyle = '#62f58b'; context.fillText(`+${amount}`, 128, 66);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthTest: false }));
  const origin = (dummyGroups.get(playerId)?.position ?? worldPosition(gameState.players[playerId].position)).clone(); origin.y += 2.25;
  sprite.position.copy(origin); sprite.scale.set(1.25, 0.63, 1); sprite.renderOrder = 100; scene.add(sprite);
  damageNumbers.push({ sprite, startedAt: performance.now(), origin });
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
    if (event.style === 'moonwave') {
      const points = event.path.map((cell) => {
        const point = worldPosition(cell);
        point.y += 0.16;
        return point;
      });
      if (points.length > 0) {
        const material = new THREE.MeshBasicMaterial({ color: 0x42ff8a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
        const wave = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.08, 12, 44), material);
        wave.position.copy(points[0]); wave.rotation.x = Math.PI / 2; scene.add(wave);
        moonwaveAnimations.push({ mesh: wave, points, startedAt: performance.now(), duration: points.length > 1 ? 920 : 620, startScale: 0.45, endScale: 1.35 });
      }
      continue;
    }
    if (event.style === 'holy-fire') {
      const group = new THREE.Group();
      group.position.copy(worldPosition(event.to)); group.position.y += 0.08;
      const flames: THREE.Mesh[] = [];
      for (let index = 0; index < 9; index++) {
        const angle = index / 9 * Math.PI * 2;
        const radius = index % 3 === 0 ? 0.16 : 0.48;
        const material = new THREE.MeshStandardMaterial({ color: index % 2 ? 0xffd84d : 0xfff3a0, emissive: index % 2 ? 0xff7a00 : 0xffd83d, emissiveIntensity: 4, transparent: true, opacity: .9 });
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.16 + (index % 3) * 0.035, 0.9 + (index % 4) * 0.17, 8), material);
        flame.position.set(Math.cos(angle) * radius, flame.geometry.parameters.height / 2, Math.sin(angle) * radius);
        flame.rotation.z = Math.sin(angle) * .12; flame.rotation.x = Math.cos(angle) * .12;
        group.add(flame); flames.push(flame);
      }
      const light = new THREE.PointLight(0xffc33d, 5, 5); light.position.y = 1; group.add(light);
      scene.add(group); holyFireAnimations.push({ group, flames, startedAt: performance.now() });
      continue;
    }
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
      spellProjectileAnimations.push({ animationId: event.id, mesh, points, startedAt: performance.now(), duration: boomerang ? 1050 : Math.max(900, (points.length - 1) * 480), delay: index * 280, casterId: event.casterId, boomerang });
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
    const queuedDamage = pendingDamageVisuals.get(animation.animationId) ?? [];
    const readyDamage = queuedDamage.filter((damage) => (damage.triggerRouteProgress ?? 1) <= progress);
    readyDamage.forEach((damage) => spawnDamageVisual(damage.playerId, damage.amount, damage.collision));
    const waitingDamage = queuedDamage.filter((damage) => !readyDamage.includes(damage));
    if (waitingDamage.length > 0) pendingDamageVisuals.set(animation.animationId, waitingDamage);
    else if (queuedDamage.length > 0) pendingDamageVisuals.delete(animation.animationId);
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
  for (let index = moonwaveAnimations.length - 1; index >= 0; index--) {
    const animation = moonwaveAnimations[index];
    const progress = Math.min(1, (time - animation.startedAt) / animation.duration);
    const easedProgress = THREE.MathUtils.smoothstep(progress, 0, 1);
    if (animation.points.length > 1) animation.mesh.position.lerpVectors(animation.points[0], animation.points[animation.points.length - 1], easedProgress);
    const expansion = THREE.MathUtils.lerp(animation.startScale, animation.endScale, easedProgress);
    animation.mesh.scale.set(expansion, expansion, Math.max(0.35, expansion * 0.55));
    animation.mesh.rotation.z = progress * 0.45;
    (animation.mesh.material as THREE.MeshBasicMaterial).opacity = progress < 0.72 ? 0.9 : 0.9 * (1 - (progress - 0.72) / 0.28);
    if (progress >= 1) {
      scene.remove(animation.mesh); animation.mesh.geometry.dispose(); (animation.mesh.material as THREE.Material).dispose();
      moonwaveAnimations.splice(index, 1);
    }
  }
  for (let index = holyFireAnimations.length - 1; index >= 0; index--) {
    const animation = holyFireAnimations[index];
    const progress = Math.min(1, (time - animation.startedAt) / 2000);
    animation.flames.forEach((flame, flameIndex) => {
      const pulse = .72 + Math.sin(time * .012 + flameIndex * 1.7) * .24;
      flame.scale.set(pulse, .75 + Math.sin(time * .016 + flameIndex) * .3, pulse);
      (flame.material as THREE.MeshStandardMaterial).opacity = progress > .72 ? Math.max(0, (1 - progress) / .28) : .9;
    });
    if (progress >= 1) {
      scene.remove(animation.group);
      animation.flames.forEach((flame) => { flame.geometry.dispose(); (flame.material as THREE.Material).dispose(); });
      holyFireAnimations.splice(index, 1);
    }
  }
}

function updateCharacterMovement(time: number) {
  movementAnimations.forEach((animation, playerId) => {
    const group = dummyGroups.get(playerId);
    if (!group) return;
    const progress = Math.min(1, (time - animation.startedAt) / animation.duration);
    const eased = animation.verticalOnly ? progress * progress : progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    const hasMovementDirection = moveAlongAnimationRoute(group.position, animation.from, animation.to, animation.path, eased, characterMovementDirection);
    if (!animation.verticalOnly && !animation.forced && group.userData.facingSide && hasMovementDirection) {
      const { x: dx, z: dz } = characterMovementDirection;
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        group.rotation.y = characterFacingRotation(group, dx, dz);
      }
    }
    if (!animation.verticalOnly && group.userData.character !== 'magician' && !group.userData.orkkAnimation && !group.userData.spectreAnimation) group.position.y += Math.sin(progress * Math.PI) * 0.1;
    const body = group.children[0];
    if (!animation.verticalOnly && !group.userData.orkkAnimation && !group.userData.spectreAnimation) body.rotation.z = Math.sin(progress * Math.PI) * 0.055;
    if (progress >= 1) {
      group.position.copy(animation.to);
      body.rotation.z = 0;
      movementAnimations.delete(playerId);
    }
  });
}

function startImpactTriggeredCharacterMovement(animationId: string, startedAt: number, routeProgress = 1) {
  const queued = impactTriggeredCharacterMovements.get(animationId);
  if (!queued) return;
  const ready = queued.filter((movement) => (movement.triggerRouteProgress ?? 1) <= routeProgress);
  ready.forEach((movement) => movementAnimations.set(movement.playerId, { ...movement, startedAt }));
  const pending = queued.filter((movement) => !ready.includes(movement));
  if (pending.length > 0) impactTriggeredCharacterMovements.set(animationId, pending);
  else impactTriggeredCharacterMovements.delete(animationId);
}

function wizardTargetGroup(kind: 'player' | 'object', id: string) {
  return kind === 'player' ? dummyGroups.get(id as PlayerId) : objectGroups.get(id);
}

function liftWizardPowerTarget(playerId: PlayerId, kind: 'player' | 'object', id: string) {
  const target = wizardTargetGroup(kind, id);
  if (!target) return;
  wizardLiftedTargets.set(playerId, { kind, id, baseY: target.position.y });
}

function releaseWizardPowerTarget(playerId: PlayerId) {
  const lifted = wizardLiftedTargets.get(playerId);
  if (!lifted) return;
  const target = wizardTargetGroup(lifted.kind, lifted.id);
  if (target) target.position.y = lifted.baseY;
  wizardLiftedTargets.delete(playerId);
}

function updateWizardLiftedTargets(time: number) {
  wizardLiftedTargets.forEach((lifted, playerId) => {
    const target = wizardTargetGroup(lifted.kind, lifted.id);
    if (!target) {
      wizardLiftedTargets.delete(playerId);
      return;
    }
    target.position.y = lifted.baseY + 0.3 + Math.sin(time * 0.004) * 0.035;
  });
}

function updateCharacterFacing(deltaSeconds: number) {
  dummyGroups.forEach((group, playerId) => {
    if (!group.userData.facingSide) return;
    if (movementAnimations.has(playerId)) return;
    const orkkAnimation = group.userData.orkkAnimation as OrkkAnimationState | undefined;
    if (orkkAnimation?.oneShotUntil && performance.now() < orkkAnimation.oneShotUntil) return;
    const spectreAnimation = group.userData.spectreAnimation as SpectreAnimationState | undefined;
    if (spectreAnimation?.oneShot) return;
    const shieldStillFlying = [...objectMovementAnimations.keys()].some((objectId) => {
      const object = objectGroups.get(objectId);
      const animation = objectMovementAnimations.get(objectId);
      return (object?.userData.ownerId === playerId || animation?.equipPlayerId === playerId)
        && Boolean(animation?.releaseSource || animation?.equipPlayerId);
    });
    if (shieldStillFlying) return;
    let nearestEnemy: THREE.Group | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    dummyGroups.forEach((candidate, candidateId) => {
      if (candidateId === playerId || gameState.players[candidateId]?.hp <= 0) return;
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
    const desiredRotation = characterFacingRotation(group, dx, dz);
    const angleDelta = Math.atan2(Math.sin(desiredRotation - group.rotation.y), Math.cos(desiredRotation - group.rotation.y));
    group.rotation.y += angleDelta * Math.min(1, deltaSeconds * 10);
  });
}

function updateObjectMovement(time: number) {
  objectMovementAnimations.forEach((animation, objectId) => {
    const group = objectGroups.get(objectId);
    if (!group) { objectMovementAnimations.delete(objectId); return; }
    const elapsed = time - animation.startedAt - (animation.delay ?? 0);
    if (elapsed < 0) { group.visible = !animation.releaseSource; return; }
    if (!animation.released && animation.releaseSource) {
      animation.releaseSource.updateWorldMatrix(true, false);
      animation.releaseSource.getWorldPosition(animation.from);
      animation.releaseQuaternion = animation.releaseSource.getWorldQuaternion(new THREE.Quaternion());
      animation.releaseSource.getWorldScale(group.scale);
      animation.baseScale = group.scale.clone();
      // Keep the visible shield centered on the destination cell. Its root is a
      // hand socket, so using the cell center for the root makes the mesh stop short.
      group.position.set(0, 0, 0);
      group.quaternion.copy(animation.releaseQuaternion);
      group.updateWorldMatrix(true, true);
      const flightBounds = new THREE.Box3().setFromObject(group);
      const flightCenterOffset = flightBounds.getCenter(new THREE.Vector3());
      animation.visibleCenterLocal = flightCenterOffset.clone().applyQuaternion(animation.releaseQuaternion.clone().invert());
      animation.visibleCenterFrom = animation.from.clone().add(flightCenterOffset);
      animation.visibleCenterTo = new THREE.Vector3(animation.to.x, animation.visibleCenterFrom.y, animation.to.z);
      if (animation.idleQuaternion) {
        // Measure only the final vertical clearance, then restore the exact
        // release pose. The measured value is later applied as an independent
        // translation and never participates in the rotation calculation.
        group.position.set(0, 0, 0);
        group.quaternion.copy(animation.idleQuaternion);
        group.updateWorldMatrix(true, true);
        const idleBoundsAtZero = new THREE.Box3().setFromObject(group);
        const finalCenterOffsetY = animation.visibleCenterLocal.clone().applyQuaternion(animation.idleQuaternion).y;
        const undroppedFinalRootY = animation.visibleCenterFrom.y - finalCenterOffsetY;
        const groundedFinalRootY = animation.to.y - idleBoundsAtZero.min.y + 0.025;
        animation.dropDistance = Math.max(0, undroppedFinalRootY - groundedFinalRootY);
        if (animation.collided && animation.collisionAt) {
          const impactDirection = animation.collisionAt.clone().sub(animation.visibleCenterFrom);
          impactDirection.y = 0;
          if (impactDirection.lengthSq() > 0.0001) impactDirection.normalize();
          const impactCenter = animation.collisionAt.clone();
          impactCenter.y = animation.visibleCenterFrom.y;
          if (animation.collisionTargetKind === 'object' && animation.collisionTargetId) {
            const targetGroup = objectGroups.get(animation.collisionTargetId);
            if (targetGroup && impactDirection.lengthSq() > 0.0001) {
              targetGroup.updateWorldMatrix(true, true);
              const targetBounds = new THREE.Box3().setFromObject(targetGroup);
              const rayOrigin = animation.visibleCenterFrom.clone();
              rayOrigin.y = targetBounds.getCenter(new THREE.Vector3()).y;
              const surfaceHit = new THREE.Ray(rayOrigin, impactDirection).intersectBox(targetBounds, new THREE.Vector3());
              if (surfaceHit) {
                const idleSize = idleBoundsAtZero.getSize(new THREE.Vector3());
                const shieldRadius = Math.abs(impactDirection.x) * idleSize.x * 0.5 + Math.abs(impactDirection.z) * idleSize.z * 0.5;
                impactCenter.x = surfaceHit.x - impactDirection.x * (shieldRadius + 0.025);
                impactCenter.z = surfaceHit.z - impactDirection.z * (shieldRadius + 0.025);
              }
            }
          }
          animation.collisionVisibleCenter = impactCenter;
        }
        group.position.set(0, 0, 0);
        group.quaternion.copy(animation.releaseQuaternion);
        group.updateWorldMatrix(true, true);
      }
      animation.flightTo = new THREE.Vector3(animation.to.x - flightCenterOffset.x, animation.from.y, animation.to.z - flightCenterOffset.z);
      group.position.copy(animation.from);
      group.quaternion.copy(animation.releaseQuaternion);
      group.visible = true;
      animation.released = true;
      const ownerId = group.userData.ownerId as PlayerId | undefined;
      const equipped = ownerId ? dummyGroups.get(ownerId)?.getObjectByName('EquippedShield') : undefined;
      if (equipped) equipped.visible = false;
    }
    const isReleasedShield = Boolean(animation.releaseQuaternion && animation.flightTo);
    const flightProgress = Math.min(1, elapsed / animation.duration);
    if (isReleasedShield && animation.collided && flightProgress >= 1 && !animation.impactTriggered) {
      animation.impactTriggered = true;
      if (animation.animationId) startImpactTriggeredCharacterMovement(animation.animationId, time);
      animation.impactDamage?.forEach((damage) => {
        damage.triggered = true;
        spawnDamageVisual(damage.playerId, damage.amount, damage.collision);
      });
      if (animation.collisionTargetKind === 'object' && animation.collisionTargetId) {
        const targetObject = gameState.objects.find((object) => object.id === animation.collisionTargetId);
        const targetGroup = objectGroups.get(animation.collisionTargetId);
        if (targetObject?.kind === 'wooden-box' && targetGroup) {
          objectImpactAnimations.set(animation.collisionTargetId, {
            startedAt: time,
            origin: targetGroup.position.clone(),
            quaternion: targetGroup.quaternion.clone(),
          });
        }
      }
    }
    const progress = isReleasedShield ? flightProgress : Math.min(1, elapsed / animation.duration);
    const travelProgress = animation.collided ? Math.min(1, progress / 0.72) : progress;
    const eased = 1 - Math.pow(1 - travelProgress, 3);
    if (animation.preserveQuaternion && animation.impactDamage) {
      animation.impactDamage.forEach((damage) => {
        if (damage.triggered || damage.triggerRouteProgress === undefined || eased < damage.triggerRouteProgress) return;
        damage.triggered = true;
        spawnDamageVisual(damage.playerId, damage.amount, damage.collision);
      });
    }
    if (animation.preserveQuaternion && animation.animationId) startImpactTriggeredCharacterMovement(animation.animationId, time, eased);
    if (animation.parachute) group.position.lerpVectors(animation.from, animation.to, 1 - Math.pow(1 - progress, 2));
    else if (isReleasedShield) {
      if (animation.idleQuaternion && animation.visibleCenterLocal && animation.visibleCenterFrom && animation.visibleCenterTo) {
        group.quaternion.copy(animation.releaseQuaternion!).slerp(animation.idleQuaternion, flightProgress);
        const flightEaseOut = 1 - Math.pow(1 - flightProgress, 3);
        const flightDestination = animation.collided && animation.collisionVisibleCenter
          ? animation.collisionVisibleCenter
          : animation.visibleCenterTo;
        const desiredCenter = animation.visibleCenterFrom.clone().lerp(flightDestination, flightEaseOut);
        const rotatedCenterOffset = animation.visibleCenterLocal.clone().applyQuaternion(group.quaternion);
        group.position.copy(desiredCenter.sub(rotatedCenterOffset));
        group.position.y -= (animation.dropDistance ?? 0) * flightEaseOut;
      } else {
        const flightEaseOut = 1 - Math.pow(1 - flightProgress, 3);
        group.position.lerpVectors(animation.from, animation.flightTo!, flightEaseOut);
        group.quaternion.copy(animation.releaseQuaternion!);
      }
    }
    else moveAlongAnimationRoute(group.position, animation.from, animation.to, animation.path, eased);
    if (!animation.releaseQuaternion && animation.collided && progress > 0.72) {
      const bounceProgress = (progress - 0.72) / 0.28;
      const recoil = Math.sin(bounceProgress * Math.PI) * 0.38;
      group.position.x += animation.dx * 1.92 * recoil;
      group.position.z += animation.dy * 1.92 * recoil;
    }
    if (!animation.parachute && !animation.releaseQuaternion && !animation.preserveQuaternion) {
      group.position.y += Math.sin(progress * Math.PI) * 0.85;
      group.rotation.x = Math.sin(progress * Math.PI) * 0.32;
      group.rotation.z = Math.sin(progress * Math.PI * 2) * 0.18;
    } else if (animation.preserveQuaternion) {
      group.quaternion.copy(animation.preserveQuaternion);
      if (animation.targetQuaternion) group.quaternion.slerp(animation.targetQuaternion, eased);
      group.position.y += Math.sin(progress * Math.PI) * 0.28;
    } else if (animation.parachute) group.rotation.y += 0.012;
    if (animation.destroy) {
      const collapse = Math.max(.04, 1 - Math.pow(progress, 1.35));
      group.scale.copy(animation.baseScale ?? new THREE.Vector3(1, 1, 1)).multiplyScalar(collapse);
      group.rotation.y = progress * Math.PI * 3;
      group.children.filter((child) => child.name === 'TombDebris').forEach((debris) => {
        const velocity = debris.userData.velocity as THREE.Vector3;
        const origin = debris.userData.origin as THREE.Vector3;
        debris.position.copy(origin).addScaledVector(velocity, progress);
        debris.position.y += Math.sin(progress * Math.PI) * Number(debris.userData.arc ?? 0.8);
        debris.rotation.x += 0.16; debris.rotation.z += 0.12;
      });
    }
    const collisionBounceDuration = isReleasedShield && animation.collided ? (animation.collisionBounceDuration ?? 230) : 0;
    const collisionBounceElapsed = elapsed - animation.duration;
    const collisionBounceProgress = collisionBounceDuration > 0 ? THREE.MathUtils.clamp(collisionBounceElapsed / collisionBounceDuration, 0, 1) : 1;
    if (isReleasedShield && animation.collided && flightProgress >= 1 && collisionBounceProgress < 1 && animation.visibleCenterLocal && animation.visibleCenterTo) {
      group.quaternion.copy(animation.idleQuaternion ?? animation.releaseQuaternion!);
      const bounceEaseOut = 1 - Math.pow(1 - collisionBounceProgress, 3);
      const impactCenter = (animation.collisionVisibleCenter ?? animation.visibleCenterTo).clone();
      impactCenter.y -= animation.dropDistance ?? 0;
      const landingCenter = animation.visibleCenterTo.clone();
      landingCenter.y -= animation.dropDistance ?? 0;
      const desiredCenter = impactCenter.clone().lerp(landingCenter, bounceEaseOut);
      group.position.copy(desiredCenter.sub(animation.visibleCenterLocal.clone().applyQuaternion(group.quaternion)));
    }
    const landingShakeDuration = isReleasedShield && !animation.collided ? (animation.landingShakeDuration ?? 320) : 0;
    const landingShakeElapsed = elapsed - animation.duration;
    const landingShakeProgress = landingShakeDuration > 0 ? THREE.MathUtils.clamp(landingShakeElapsed / landingShakeDuration, 0, 1) : 1;
    const completed = progress >= 1 && landingShakeProgress >= 1 && collisionBounceProgress >= 1;
    if (isReleasedShield && !animation.collided && progress >= 1 && landingShakeProgress < 1) {
      const decay = 1 - landingShakeProgress;
      const shakeAngle = Math.sin(landingShakeProgress * Math.PI * 8) * 0.055 * decay;
      group.quaternion.copy(animation.idleQuaternion ?? animation.releaseQuaternion!).multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), shakeAngle),
      );
      if (animation.visibleCenterTo && animation.visibleCenterLocal) {
        group.position.copy(animation.visibleCenterTo).sub(animation.visibleCenterLocal.clone().applyQuaternion(group.quaternion));
        group.position.y -= animation.dropDistance ?? 0;
      }
      const amplitude = 0.09 * decay;
      group.position.x += Math.sin(landingShakeProgress * Math.PI * 8) * amplitude;
      group.position.z += Math.sin(landingShakeProgress * Math.PI * 10 + Math.PI / 3) * amplitude * 0.7;
    }
    if (completed) {
      animation.impactDamage?.forEach((damage) => {
        if (damage.triggered) return;
        damage.triggered = true;
        spawnDamageVisual(damage.playerId, damage.amount, damage.collision);
      });
      if (isReleasedShield && animation.visibleCenterTo && animation.visibleCenterLocal) {
        group.quaternion.copy(animation.idleQuaternion ?? animation.releaseQuaternion!);
        group.position.copy(animation.visibleCenterTo).sub(animation.visibleCenterLocal.clone().applyQuaternion(group.quaternion));
        group.position.y -= animation.dropDistance ?? 0;
      } else group.position.copy(animation.flightTo ?? animation.to);
      group.visible = true;
      if (!animation.releaseQuaternion && !animation.preserveQuaternion) group.rotation.set(0, 0, 0);
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

function moveAlongAnimationRoute(position: THREE.Vector3, from: THREE.Vector3, to: THREE.Vector3, path: THREE.Vector3[] | undefined, progress: number, direction?: THREE.Vector3) {
  const validPoint = (point: THREE.Vector3 | undefined): point is THREE.Vector3 => Boolean(point) && Number.isFinite(point!.x) && Number.isFinite(point!.y) && Number.isFinite(point!.z);
  const route = [from, ...(path ?? []).filter(validPoint)];
  if (!validPoint(route[route.length - 1]) || !route[route.length - 1].equals(to)) route.push(to);
  const safeProgress = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 1;
  if (route.length < 2 || !validPoint(route[0]) || !validPoint(route[1])) {
    position.copy(validPoint(to) ? to : from);
    return false;
  }
  const scaled = safeProgress * (route.length - 1);
  const segment = Math.min(route.length - 2, Math.max(0, Math.floor(scaled)));
  position.lerpVectors(route[segment], route[segment + 1], THREE.MathUtils.clamp(scaled - segment, 0, 1));
  direction?.subVectors(route[segment + 1], route[segment]);
  return true;
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

function createSlideRamp(cell: Cell, color: number): THREE.Group {
  const root = new THREE.Group();
  const arena = visualArena();
  const cardinalDirections = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
  const diagonalDirections = [{ x: 1, y: 1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: -1, y: -1 }];
  const highAt = (dx: number, dy: number) => arena.highground.includes(cellLabel({ x: cell.x + dx, y: cell.y + dy }));
  const rise = cardinalDirections.find((direction) => highAt(direction.x, direction.y));
  if (!rise) return root;
  const diagonal = diagonalDirections.find((direction) => highAt(direction.x, direction.y) && (direction.x === rise.x || direction.y === rise.y));
  const lateral = { x: -rise.y, y: rise.x };
  const segments = 8;
  const lowEdge = -.86;
  const highEdge = .96; // Bridges the narrow grid seam to the orthogonal High Ground Square.
  const halfWidth = .86;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let row = 0; row <= segments; row++) {
    const progress = row / segments;
    const along = THREE.MathUtils.lerp(lowEdge, highEdge, progress);
    const height = THREE.MathUtils.smoothstep(progress, 0, 1) * .375 + .085;
    for (let column = 0; column <= segments; column++) {
      const across = THREE.MathUtils.lerp(-halfWidth, halfWidth, column / segments);
      positions.push(lateral.x * across + rise.x * along, height, lateral.y * across + rise.y * along);
    }
  }
  for (let row = 0; row < segments; row++) for (let column = 0; column < segments; column++) {
    const a = row * (segments + 1) + column;
    const b = a + 1;
    const c = a + segments + 1;
    const d = c + 1;
    indices.push(a, c, b, b, c, d);
  }
  const rampGeometry = new THREE.BufferGeometry();
  rampGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  rampGeometry.setIndex(indices);
  rampGeometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ color, emissive: 0x123f42, emissiveIntensity: .28, roughness: .68, metalness: .1, side: THREE.DoubleSide });
  const ramp = new THREE.Mesh(rampGeometry, material);
  ramp.receiveShadow = true;
  root.add(ramp);

  if (diagonal) {
    const shoulderWidth = 1.72 * .35;
    const dx = diagonal.x;
    const dz = diagonal.y;
    const center: [number, number, number] = [dx * .12, .205, dz * .12];
    const nearX: [number, number, number] = [dx * .86, .405, dz * (.86 - shoulderWidth)];
    const nearZ: [number, number, number] = [dx * (.86 - shoulderWidth), .405, dz * .86];
    const corner: [number, number, number] = [dx * 1.06, .466, dz * 1.06];
    const farX: [number, number, number] = [dx * (1.06 + shoulderWidth), .466, dz * 1.06];
    const farZ: [number, number, number] = [dx * 1.06, .466, dz * (1.06 + shoulderWidth)];
    const shoulderGeometry = new THREE.BufferGeometry();
    shoulderGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      ...center, ...nearX, ...nearZ,
      ...nearX, ...farX, ...corner,
      ...nearX, ...corner, ...nearZ,
      ...nearZ, ...corner, ...farZ,
    ], 3));
    shoulderGeometry.computeVertexNormals();
    const shoulderMaterial = material.clone();
    shoulderMaterial.color.copy(new THREE.Color(color).lerp(new THREE.Color(0x4fb5a2), .3));
    shoulderMaterial.emissive.setHex(0x174f4d);
    shoulderMaterial.emissiveIntensity = .42;
    const shoulder = new THREE.Mesh(shoulderGeometry, shoulderMaterial);
    shoulder.receiveShadow = true;
    root.add(shoulder);
    const outlineGeometry = new THREE.BufferGeometry().setFromPoints([nearX, farX, corner, farZ, nearZ].map(([x, y, z]) => new THREE.Vector3(x, y + .006, z)));
    const outline = new THREE.Line(outlineGeometry, new THREE.LineBasicMaterial({ color: 0x67e8d1, transparent: true, opacity: .78 }));
    root.add(outline);
  }
  return root;
}

function createCell(cell: Cell) {
  const label = cellLabel(cell);
  const arena = visualArena();
  const lordaeron = arena.id === 'lordaeron';
  const highGround = (gameState.elevations[label] ?? 0) > 0;
  const ownerOne = arena.bases.P1.includes(label);
  const ownerTwo = arena.bases.P2.includes(label);
  const ownerThree = arena.bases.P3.includes(label);
  const baseId = (['P1', 'P2', 'P3'] as const).find((id) => LORDAERON_ARENA.bases[id].includes(label));
  const placement = placementState();
  const claimant = placement && baseId ? (Object.entries(placement.claims).find(([, claimedBase]) => claimedBase === baseId)?.[0] as PlayerId | undefined) : undefined;
  const unclaimedPlacementBase = gameState.phase === 'choosing-base-placement' && Boolean(baseId) && placement?.availableBaseIds.includes(baseId!);
  const drawSquare = arena.drawSquares.includes(label);
  const protectedSquare = arena.highgroundProtected.includes(label);
  const slideSquare = arena.slideSquares?.includes(label) ?? false;
  const trenchSquare = arena.trenchSquares?.includes(label) ?? false;
  const claimedColor = claimant === 'P1' ? 0x145f83 : claimant === 'P2' ? 0x7b2834 : claimant === 'P3' ? 0x66508f : null;
  const color = unclaimedPlacementBase ? 0xc21f35 : claimedColor ?? (ownerOne ? 0x145f83 : ownerTwo ? 0x7b2834 : ownerThree ? 0x66508f : drawSquare ? 0x665a25 : highGround ? 0x285046 : trenchSquare ? 0xb1845c : protectedSquare ? 0x1d3d38 : (cell.x + cell.y) % 2 ? 0x17322c : 0x122923);
  const emissive = unclaimedPlacementBase ? 0xff1638 : claimant === 'P1' ? 0x07374f : claimant === 'P2' ? 0x3d0f18 : claimant === 'P3' ? 0x291a45 : ownerOne ? 0x07374f : ownerTwo ? 0x3d0f18 : ownerThree ? 0x291a45 : drawSquare ? 0x292307 : 0x000000;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.72, highGround ? 0.54 : 0.16, 1.72), new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: unclaimedPlacementBase ? 0.85 : 0.35, roughness: 0.72, metalness: 0.15 }));
  mesh.position.copy(worldPosition(cell)); mesh.position.y = highGround ? 0.19 : 0;
  mesh.receiveShadow = true;
  mesh.userData.cell = cell;
  scene.add(mesh); cellMeshes.push(mesh);
  if (slideSquare) {
    const ramp = createSlideRamp(cell, color);
    ramp.userData.cell = cell;
    mesh.add(ramp);
  }
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

function createSpiritGuardian(level: number) {
  const root = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffdc78, emissive: 0xd99a24, emissiveIntensity: 1.8, transparent: true, opacity: 0.82, roughness: 0.28, metalness: 0.32 });
  const lightGold = new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffc84a, emissiveIntensity: 1.35, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number]) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; root.add(mesh); return mesh; };
  add(new THREE.CapsuleGeometry(0.34, 0.78, 8, 16), gold, [0, 1.15, 0]);
  add(new THREE.SphereGeometry(0.27, 18, 14), lightGold, [0, 1.82, 0]);
  const cloak = add(new THREE.ConeGeometry(0.58, 1.5, 18, 1, true), lightGold, [0, 0.92, 0.2]); cloak.rotation.x = -0.08;
  for (const side of [-1, 1]) {
    const wing = add(new THREE.ConeGeometry(0.34, 1.5, 5), lightGold, [side * 0.52, 1.46, 0.28]);
    wing.rotation.z = side * -0.72; wing.rotation.x = 0.18; wing.scale.z = 0.32;
  }
  const spear = add(new THREE.CylinderGeometry(0.035, 0.045, 2.7, 10), gold, [0.62, 1.23, -0.04]); spear.rotation.z = -0.08;
  const spearTip = add(new THREE.ConeGeometry(0.11, 0.38, 10), lightGold, [0.73, 2.58, -0.04]); spearTip.rotation.z = -0.08;
  const shield = add(new THREE.CylinderGeometry(0.46, 0.46, 0.12, 28), gold, [-0.46, 1.18, -0.22]); shield.rotation.x = Math.PI / 2;
  add(new THREE.SphereGeometry(0.13, 14, 10), lightGold, [-0.46, 1.18, -0.3]);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 10, 40), lightGold); halo.position.set(0, 2.18, 0); halo.rotation.x = Math.PI / 2; root.add(halo);
  const glow = new THREE.PointLight(0xffc74f, level >= 2 ? 4.5 : 3, 5); glow.position.set(0, 1.4, 0); root.add(glow);
  root.scale.setScalar(level >= 2 ? 1.13 : 0.75);
  return root;
}

function createProceduralOrkkShieldObject() {
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
  root.userData.facingSide = 'positive-z';
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
  add(new THREE.CylinderGeometry(0.58, 0.68, 0.12, 32), accent, [0, 0.1, 0]);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  attachDaOrkhModel(root, body);
  return root;
}

type OrkkAnimationName = 'IdleWithShield' | 'IdleNoShield' | 'CasualWalk' | 'Walking' | 'Running' | 'Encourage' | 'ShieldThrow' | 'BoxAttack';
const ORKK_BASE_ATTACK_FPS = 24;
const ORKK_BASE_ATTACK_END_FRAME = 45;
const ORKK_BASE_ATTACK_IMPACT_FRAME = 23;
const ORKK_BASE_ATTACK_TIME_SCALE = 1.4;
type OrkkAnimationState = {
  mixer: THREE.AnimationMixer;
  actions: Record<OrkkAnimationName, THREE.AnimationAction>;
  current: OrkkAnimationName;
  oneShotUntil?: number;
  shieldThrowReleaseMs: number;
  shieldIdleSocketLocalQuaternion: THREE.Quaternion;
};

async function attachDaOrkhModel(root: THREE.Group, body: THREE.Group) {
  try {
    const asset = await loadDaOrkhAsset();
    if (body.parent !== root) return;
    const model = cloneSkeleton(asset.scene) as THREE.Group;
    model.name = 'DaOrkhImportedModel';
    model.scale.setScalar(1.6);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.material = Array.isArray(child.material) ? child.material.map((material) => material.clone()) : child.material.clone();
    });
    disposeTemporaryCharacterBody(body);
    body.add(model);
    installOrkkRageCoreGlow(root, model);
    const clips = Object.fromEntries(asset.animations.map((clip) => [clip.name, clip]));
    const required = ['DaOrkh_Idle_With_Shield', 'DaOrkh_Idle_No_Shield', 'DaOrkh_Casual_Walk', 'DaOrkh_Walking', 'DaOrkh_Running', 'DaOrkh_Skill_01', 'DaOrkh_Shield_Throw', 'DaOrkh_Base_UUID'];
    if (required.some((name) => !clips[name])) throw new Error(`Da Orkk GLB is missing: ${required.filter((name) => !clips[name]).join(', ')}`);
    // One board square needs only the first step cycle, not the full multi-step source clip.
    const casualWalkOneSquare = THREE.AnimationUtils.subclip(clips.DaOrkh_Casual_Walk, 'DaOrkh_Casual_Walk_One_Square', 0, 33, 24);
    const baseAttack = THREE.AnimationUtils.subclip(
      clips.DaOrkh_Base_UUID,
      'DaOrkh_Base_UUID_45_Frames',
      0,
      ORKK_BASE_ATTACK_END_FRAME,
      ORKK_BASE_ATTACK_FPS,
    );
    const mixer = new THREE.AnimationMixer(model);
    const actions = {
      IdleWithShield: mixer.clipAction(clips.DaOrkh_Idle_With_Shield),
      IdleNoShield: mixer.clipAction(clips.DaOrkh_Idle_No_Shield),
      CasualWalk: mixer.clipAction(casualWalkOneSquare),
      Walking: mixer.clipAction(clips.DaOrkh_Walking),
      Running: mixer.clipAction(clips.DaOrkh_Running),
      Encourage: mixer.clipAction(clips.DaOrkh_Skill_01),
      ShieldThrow: mixer.clipAction(clips.DaOrkh_Shield_Throw),
      BoxAttack: mixer.clipAction(baseAttack),
    };
    actions.Encourage.setLoop(THREE.LoopOnce, 1); actions.Encourage.clampWhenFinished = true;
    actions.ShieldThrow.setLoop(THREE.LoopOnce, 1); actions.ShieldThrow.clampWhenFinished = true;
    actions.BoxAttack.setLoop(THREE.LoopOnce, 1); actions.BoxAttack.clampWhenFinished = true;
    actions.BoxAttack.timeScale = ORKK_BASE_ATTACK_TIME_SCALE;
    const playerId = root.userData.playerId as PlayerId | undefined;
    const shieldEquipped = playerId ? gameState.players[playerId]?.shieldEquipped !== false : true;
    const initial = shieldEquipped ? 'IdleWithShield' : 'IdleNoShield';
    actions[initial].play();
    mixer.update(0);
    const equippedShield = model.getObjectByName('Ironbound_Obelisk');
    if (equippedShield) { equippedShield.name = 'EquippedShield'; equippedShield.visible = shieldEquipped; }
    root.updateWorldMatrix(true, true);
    const releaseSocket = model.getObjectByName('Shield_Release_Socket');
    const rootWorldQuaternion = root.getWorldQuaternion(new THREE.Quaternion());
    const shieldIdleSocketLocalQuaternion = releaseSocket
      ? rootWorldQuaternion.invert().multiply(releaseSocket.getWorldQuaternion(new THREE.Quaternion()))
      : new THREE.Quaternion();
    const yawFreeIdleEuler = new THREE.Euler().setFromQuaternion(shieldIdleSocketLocalQuaternion, 'YXZ');
    yawFreeIdleEuler.y = 0;
    shieldIdleSocketLocalQuaternion.setFromEuler(yawFreeIdleEuler);
    root.userData.orkkAnimation = { mixer, actions, current: initial, shieldThrowReleaseMs: clips.DaOrkh_Shield_Throw.duration * 1000, shieldIdleSocketLocalQuaternion } satisfies OrkkAnimationState;
    objectGroups.forEach((shieldGroup, objectId) => {
      if (shieldGroup.userData.ownerId === playerId && !objectMovementAnimations.has(objectId)) settleOrkkShieldAtRest(shieldGroup);
    });
    root.traverse((child) => { if (playerId) child.userData.playerId = playerId; });
    const pendingAnimation = root.userData.pendingOrkkAnimation as 'Encourage' | 'ShieldThrow' | 'BoxAttack' | undefined;
    if (pendingAnimation) { delete root.userData.pendingOrkkAnimation; playOrkkOneShot(playerId!, pendingAnimation); }
  } catch (error) {
    console.error('Failed to load Da Orkk model; keeping procedural fallback.', error);
  }
}

function playOrkkAnimation(group: THREE.Group, name: OrkkAnimationName, fade = 0.12) {
  const state = group.userData.orkkAnimation as OrkkAnimationState | undefined;
  if (!state || state.current === name) return;
  state.actions[state.current].fadeOut(fade);
  state.actions[name].reset().fadeIn(fade).play();
  state.current = name;
}

function playOrkkOneShot(playerId: PlayerId, name: 'Encourage' | 'ShieldThrow' | 'BoxAttack') {
  const group = dummyGroups.get(playerId);
  const state = group?.userData.orkkAnimation as OrkkAnimationState | undefined;
  if (!group) return;
  if (!state) { group.userData.pendingOrkkAnimation = name; return; }
  const action = state.actions[name];
  if (state.current === name) {
    action.stop();
    action.reset().fadeIn(0.08).play();
  } else {
    playOrkkAnimation(group, name, 0.08);
  }
  action.paused = false;
  action.enabled = true;
  const effectiveTimeScale = Math.max(Math.abs(action.getEffectiveTimeScale()), Math.abs(action.timeScale), 0.001);
  state.oneShotUntil = performance.now() + action.getClip().duration * 1000 / effectiveTimeScale;
}

function applyOrkkVisualIntent(intent: OrkkVisualIntent) {
  const group = dummyGroups.get(intent.playerId);
  if (!group) return;
  if (intent.target) {
    const dx = intent.target.x - group.position.x;
    const dz = intent.target.z - group.position.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.0001) group.rotation.y = characterFacingRotation(group, dx, dz);
  }
  playOrkkOneShot(intent.playerId, intent.animation);
}

function updateOrkkAnimation(group: THREE.Group, playerId: PlayerId, moving: boolean, deltaSeconds: number) {
  const state = group.userData.orkkAnimation as OrkkAnimationState | undefined;
  if (!state) return;
  state.mixer.update(deltaSeconds);
  if (state.oneShotUntil && Number.isFinite(state.oneShotUntil) && performance.now() < state.oneShotUntil) return;
  state.oneShotUntil = undefined;
  if (moving) {
    const movement = movementAnimations.get(playerId);
    const squares = movement?.path?.length ?? 1;
    const movementName = squares >= 3 ? 'Running' : squares === 2 ? 'Walking' : 'CasualWalk';
    if (movement) state.actions[movementName].timeScale = state.actions[movementName].getClip().duration / (movement.duration / 1000);
    playOrkkAnimation(group, movementName);
  } else {
    const equippedShield = group.getObjectByName('EquippedShield');
    const visiblyEquipped = gameState.players[playerId].shieldEquipped && equippedShield?.visible !== false;
    playOrkkAnimation(group, visiblyEquipped ? 'IdleWithShield' : 'IdleNoShield');
  }
}

function createLongHatLogan(playerColor = 0x169bd3) {
  const root = new THREE.Group(); const body = new THREE.Group(); body.name = 'LongHatLoganBody'; root.add(body);
  root.userData.facingSide = 'positive-z';
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
  root.userData.player = true;
  const manaAura = new THREE.Group(); manaAura.name = 'ManaOrbAura'; root.add(manaAura);
  for (let index = 0; index < 3; index++) {
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), new THREE.MeshStandardMaterial({ color: 0x69d4ff, emissive: 0x168fe8, emissiveIntensity: 4.2, roughness: 0.08, transparent: true, opacity: 0.96 }));
    orb.name = `ManaOrb${index + 1}`; orb.visible = false; orb.userData.orbIndex = index; randomizeManaOrbit(orb); manaAura.add(orb);
  }
  attachLongHatLoganModel(root, body);
  return root;
}

function loadDaOrkhAsset() {
  return daOrkhAssetPromise ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/da-orkh-optimized.glb?v=20260814-2`).then((asset) => {
    daOrkhAsset = asset;
    asset.scene.updateWorldMatrix(true, true);
    return asset;
  });
}

function getOrkkRageGlowTexture() {
  if (orkkRageGlowTexture) return orkkRageGlowTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create Da Orkk Rage glow texture.');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 245, 224, 1)');
  gradient.addColorStop(0.14, 'rgba(255, 92, 42, 0.95)');
  gradient.addColorStop(0.42, 'rgba(255, 16, 4, 0.48)');
  gradient.addColorStop(1, 'rgba(160, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  orkkRageGlowTexture = new THREE.CanvasTexture(canvas);
  orkkRageGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return orkkRageGlowTexture;
}

function installOrkkRageCoreGlow(root: THREE.Group, model: THREE.Group) {
  const socket = model.getObjectByName('Scepter_Core_Socket');
  if (!socket || socket.getObjectByName('OrkkRageCoreEffect')) return;
  root.updateWorldMatrix(true, true);
  const socketWorldScale = socket.getWorldScale(new THREE.Vector3());
  const effect = new THREE.Group();
  effect.name = 'OrkkRageCoreEffect';
  effect.userData.strength = 0;
  effect.userData.inverseWorldScale = new THREE.Vector3(
    1 / Math.max(socketWorldScale.x, 0.0001),
    1 / Math.max(socketWorldScale.y, 0.0001),
    1 / Math.max(socketWorldScale.z, 0.0001),
  );

  const shellMaterial = new THREE.MeshBasicMaterial({
    color: 0xff1804,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), shellMaterial);
  shell.name = 'OrkkRageCoreShell';
  shell.renderOrder = 7;
  const inverseScale = effect.userData.inverseWorldScale as THREE.Vector3;
  shell.userData.baseScale = new THREE.Vector3(0.38 * inverseScale.x, 0.32 * inverseScale.y, 0.32 * inverseScale.z);
  shell.scale.copy(shell.userData.baseScale as THREE.Vector3);
  effect.add(shell);

  const auraMaterial = new THREE.SpriteMaterial({
    map: getOrkkRageGlowTexture(),
    color: 0xff2408,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const glow = new THREE.Sprite(auraMaterial);
  glow.name = 'OrkkRageCoreGlow';
  glow.renderOrder = 8;
  glow.userData.baseScale = new THREE.Vector3(
    0.52 * inverseScale.x,
    0.52 * inverseScale.y,
    1,
  );
  glow.scale.copy(glow.userData.baseScale as THREE.Vector3);
  effect.add(glow);

  for (let index = 0; index < 7; index++) {
    const particle = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getOrkkRageGlowTexture(),
      color: index % 2 === 0 ? 0xff2a06 : 0xff6a12,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }));
    particle.name = `OrkkRageCoreParticle${index + 1}`;
    particle.renderOrder = 9;
    particle.userData.phase = index / 7;
    particle.userData.speed = 0.72 + (index % 3) * 0.16;
    particle.userData.worldSize = 0.075 + (index % 3) * 0.018;
    effect.add(particle);
  }

  effect.visible = false;
  const light = new THREE.PointLight(0xff2408, 0, 2.2, 2);
  light.name = 'OrkkRageCoreLight';
  effect.add(light);
  socket.add(effect);
  const playerId = root.userData.playerId as PlayerId | undefined;
  updateOrkkRageCoreGlow(root, playerId ? gameState.players[playerId]?.rageStacks ?? 0 : 0);
}

function updateOrkkRageCoreGlow(root: THREE.Group, rageStacks: number) {
  const cappedRage = THREE.MathUtils.clamp(rageStacks, 0, 8);
  const strength = cappedRage / 8;
  const effect = root.getObjectByName('OrkkRageCoreEffect') as THREE.Group | undefined;
  const glow = root.getObjectByName('OrkkRageCoreGlow') as THREE.Sprite | undefined;
  const shell = root.getObjectByName('OrkkRageCoreShell') as THREE.Mesh | undefined;
  const light = root.getObjectByName('OrkkRageCoreLight') as THREE.PointLight | undefined;
  if (effect) {
    effect.visible = cappedRage > 0;
    effect.userData.strength = strength;
  }
  if (glow) {
    const material = glow.material as THREE.SpriteMaterial;
    material.opacity = cappedRage > 0 ? 0.08 + strength * 0.3 : 0;
  }
  if (shell) (shell.material as THREE.MeshBasicMaterial).opacity = cappedRage > 0 ? 0.2 + strength * 0.62 : 0;
  if (light) light.intensity = cappedRage > 0 ? 0.7 + strength * 5.3 : 0;
}

function updateOrkkRageCoreAnimation(root: THREE.Group, time: number) {
  const effect = root.getObjectByName('OrkkRageCoreEffect') as THREE.Group | undefined;
  if (!effect?.visible) return;
  const strength = effect.userData.strength as number;
  const inverseScale = effect.userData.inverseWorldScale as THREE.Vector3;
  const pulse = 1 + Math.sin(time * 0.009) * (0.035 + strength * 0.055);
  const shell = effect.getObjectByName('OrkkRageCoreShell') as THREE.Mesh | undefined;
  const glow = effect.getObjectByName('OrkkRageCoreGlow') as THREE.Sprite | undefined;
  if (shell) shell.scale.copy(shell.userData.baseScale as THREE.Vector3).multiplyScalar((0.82 + strength * 0.22) * pulse);
  if (glow) glow.scale.copy(glow.userData.baseScale as THREE.Vector3).multiplyScalar((0.72 + strength * 0.4) * pulse);
  effect.children.forEach((child) => {
    if (!(child instanceof THREE.Sprite) || child === glow) return;
    const phase = child.userData.phase as number;
    const speed = child.userData.speed as number;
    const cycle = (time * 0.00055 * speed + phase) % 1;
    const angle = phase * Math.PI * 2 + time * 0.0012 * speed;
    const radius = 0.11 + Math.sin(cycle * Math.PI) * 0.055;
    child.position.set(
      Math.cos(angle) * radius * inverseScale.x,
      (cycle - 0.42) * 0.22 * inverseScale.y,
      Math.sin(angle) * radius * inverseScale.z,
    );
    const worldSize = (child.userData.worldSize as number) * (0.55 + strength * 0.75) * Math.sin(cycle * Math.PI);
    child.scale.set(worldSize * inverseScale.x, worldSize * inverseScale.y, 1);
    (child.material as THREE.SpriteMaterial).opacity = (0.16 + strength * 0.6) * Math.sin(cycle * Math.PI);
  });
}

function updateObjectImpactAnimations(time: number) {
  objectImpactAnimations.forEach((animation, objectId) => {
    const group = objectGroups.get(objectId);
    if (!group) { objectImpactAnimations.delete(objectId); return; }
    const progress = (time - animation.startedAt) / 300;
    if (progress >= 1) {
      group.position.copy(animation.origin);
      group.quaternion.copy(animation.quaternion);
      objectImpactAnimations.delete(objectId);
      return;
    }
    const decay = 1 - progress;
    group.position.copy(animation.origin);
    group.position.x += Math.sin(progress * Math.PI * 10) * 0.065 * decay;
    group.position.z += Math.sin(progress * Math.PI * 12 + Math.PI / 3) * 0.045 * decay;
    group.quaternion.copy(animation.quaternion).multiply(
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(progress * Math.PI * 8) * 0.035 * decay),
    );
  });
}

function characterFacingRotation(group: THREE.Group, dx: number, dz: number) {
  return Math.atan2(dx, dz) + (group.userData.facingSide === 'negative-z' ? Math.PI : 0);
}

function installImportedShield(root: THREE.Group, asset: Awaited<ReturnType<GLTFLoader['loadAsync']>>) {
  if (root.userData.importedOrkkShield) return;
  const source = asset.scene.getObjectByName('Ironbound_Obelisk');
  const socket = asset.scene.getObjectByName('Shield_Release_Socket');
  if (!(source instanceof THREE.Mesh) || !socket) return;
  root.clear();
  const mesh = new THREE.Mesh(source.geometry, Array.isArray(source.material) ? source.material.map((material) => material.clone()) : source.material.clone());
  mesh.name = 'Ironbound_Obelisk_Mesh';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  source.updateWorldMatrix(true, false);
  socket.updateWorldMatrix(true, false);
  socket.matrixWorld.clone().invert().multiply(source.matrixWorld).decompose(mesh.position, mesh.quaternion, mesh.scale);
  root.add(mesh);
  socket.getWorldScale(root.scale);
  root.scale.multiplyScalar(1.6);
  root.userData.importedOrkkShield = true;
  settleOrkkShieldAtRest(root);
}

function settleOrkkShieldAtRest(root: THREE.Group, ownerId?: PlayerId, target?: THREE.Vector3) {
  if (ownerId) root.userData.ownerId = ownerId;
  if (target) root.userData.restingTarget = target.clone();
  const restingTarget = root.userData.restingTarget as THREE.Vector3 | undefined;
  const shieldOwnerId = root.userData.ownerId as PlayerId | undefined;
  const owner = shieldOwnerId ? dummyGroups.get(shieldOwnerId) : undefined;
  const state = owner?.userData.orkkAnimation as OrkkAnimationState | undefined;
  if (!restingTarget || !owner || !state) return;
  owner.updateWorldMatrix(true, true);
  const idleWorldQuaternion = owner.getWorldQuaternion(new THREE.Quaternion()).multiply(state.shieldIdleSocketLocalQuaternion);
  root.position.copy(restingTarget);
  root.quaternion.copy(idleWorldQuaternion);
  root.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(root);
  const visibleCenter = bounds.getCenter(new THREE.Vector3());
  if (Number.isFinite(visibleCenter.x) && Number.isFinite(visibleCenter.z)) {
    root.position.x += restingTarget.x - visibleCenter.x;
    root.position.z += restingTarget.z - visibleCenter.z;
  }
  if (Number.isFinite(bounds.min.y)) root.position.y += restingTarget.y - bounds.min.y + 0.025;
}

function createOrkkShieldObject() {
  const root = createProceduralOrkkShieldObject();
  const install = (asset: Awaited<ReturnType<GLTFLoader['loadAsync']>>) => installImportedShield(root, asset);
  if (daOrkhAsset) install(daOrkhAsset);
  else loadDaOrkhAsset().then(install).catch((error) => console.error('Failed to load Da Orkk shield model.', error));
  return root;
}

type WizardAnimationName = 'Idle' | 'Walk' | 'Power';
const WIZARD_ORB_ORBIT_SCALE = 0.72;
type WizardPowerRuntime = {
  phase: 'playing' | 'holding' | 'resolving';
  holdAtEnd: boolean;
  liftStarted?: boolean;
  targetKind?: 'player' | 'object';
  targetId?: string;
  resolvedAt?: number;
};
type WizardOrbitalState = {
  controller: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  elapsed: number;
};
type WizardAnimationState = {
  mixer: THREE.AnimationMixer;
  actions: Record<WizardAnimationName, THREE.AnimationAction>;
  current: WizardAnimationName;
  orbital?: WizardOrbitalState;
  power?: WizardPowerRuntime;
};

let longHatLoganAsset: ReturnType<GLTFLoader['loadAsync']> | null = null;

function loadLongHatLoganAsset() {
  return longHatLoganAsset ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/long-hat-logan.glb?v=20260811-4`);
}

function disposeTemporaryCharacterBody(body: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  body.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    geometries.add(child.geometry);
    const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
    childMaterials.forEach((material) => materials.add(material));
  });
  body.clear();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

async function attachLongHatLoganModel(root: THREE.Group, body: THREE.Group) {
  try {
    const asset = await loadLongHatLoganAsset();
    if (body.parent !== root) return;
    const model = cloneSkeleton(asset.scene) as THREE.Group;
    model.name = 'LongHatLoganImportedModel';
    model.scale.setScalar(1.1);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = true;
      // Logan's thin, double-sided skinned surfaces self-shadow as dense bands
      // in Three.js. Keep his cast silhouette without rendering that shadow acne.
      child.receiveShadow = false;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone();
    });
    disposeTemporaryCharacterBody(body);
    body.add(model);
    root.getObjectByName('ManaOrbAura')?.removeFromParent();

    // The GLB embeds an orb-controller track in each body clip. Excluding it
    // gives the orbs one continuous timeline, independent of Idle/Walk/Power.
    const clips = Object.fromEntries(asset.animations.map((clip) => [clip.name, new THREE.AnimationClip(
      clip.name,
      clip.duration,
      clip.tracks.filter((track) => !track.name.startsWith('Wizard_Orbital_Controller.')),
    )])) as Partial<Record<WizardAnimationName, THREE.AnimationClip>>;
    if (!clips.Idle || !clips.Walk || !clips.Power) throw new Error('Wizard GLB must contain Idle, Walk, and Power clips.');
    const mixer = new THREE.AnimationMixer(model);
    const actions = {
      Idle: mixer.clipAction(clips.Idle),
      Walk: mixer.clipAction(clips.Walk),
      Power: mixer.clipAction(clips.Power),
    };
    actions.Walk.timeScale = 1.8;
    actions.Power.setLoop(THREE.LoopOnce, 1);
    actions.Power.clampWhenFinished = true;
    actions.Idle.play();
    const orbitalController = model.getObjectByName('Wizard_Orbital_Controller');
    root.userData.wizardAnimation = {
      mixer,
      actions,
      current: 'Idle',
      orbital: orbitalController && {
        controller: orbitalController,
        basePosition: orbitalController.position.clone(),
        baseRotation: orbitalController.rotation.clone(),
        elapsed: 0,
      },
    } satisfies WizardAnimationState;
    model.getObjectByName('Wizard_Native_LeftHand')!.visible = true;
    model.getObjectByName('Wizard_Power_LeftHand_Controller')!.visible = false;

    for (let index = 1; index <= 3; index++) {
      const orbRoot = model.getObjectByName(`Wizard_Orb_0${index}_Root`)!;
      orbRoot.position.x *= WIZARD_ORB_ORBIT_SCALE;
      orbRoot.position.z *= WIZARD_ORB_ORBIT_SCALE;
      orbRoot.visible = false;
    }
    const playerId = root.userData.playerId as PlayerId | undefined;
    if (playerId && gameState.players[playerId]) syncManaOrbVisual(root, gameState.players[playerId]);
    root.traverse((child) => { if (playerId) child.userData.playerId = playerId; });
    const pendingPowerIntent = root.userData.pendingWizardPowerVisualIntent as WizardPowerVisualIntent | undefined;
    if (pendingPowerIntent) {
      delete root.userData.pendingWizardPowerVisualIntent;
      applyWizardPowerVisualIntent(pendingPowerIntent);
    }
  } catch (error) {
    console.error('Failed to load Long Hat Logan model; keeping procedural fallback.', error);
  }
}

function setWizardPowerHand(group: THREE.Group, powerVisible: boolean) {
  const nativeHand = group.getObjectByName('Wizard_Native_LeftHand');
  const powerHand = group.getObjectByName('Wizard_Power_LeftHand_Controller');
  if (nativeHand) nativeHand.visible = !powerVisible;
  if (powerHand) powerHand.visible = powerVisible;
}

function finishWizardPowerAnimation(group: THREE.Group, state: WizardAnimationState) {
  const playerId = group.userData.playerId as PlayerId | undefined;
  if (playerId) releaseWizardPowerTarget(playerId);
  state.actions.Power.paused = false;
  state.actions.Power.fadeOut(0.14);
  state.actions.Idle.reset().fadeIn(0.14).play();
  setWizardPowerHand(group, false);
  state.current = 'Idle';
  state.power = undefined;
}

function wizardPowerEffectFinished(power: WizardPowerRuntime, playerId: PlayerId) {
  if (!power.resolvedAt || performance.now() - power.resolvedAt < 120) return false;
  if (spellProjectileAnimations.some((animation) => animation.casterId === playerId)) return false;
  if (movementAnimations.has(playerId)) return false;
  if (power.targetKind === 'object' && power.targetId && objectMovementAnimations.has(power.targetId)) return false;
  if (power.targetKind === 'player' && power.targetId && movementAnimations.has(power.targetId as PlayerId)) return false;
  return true;
}

function applyWizardPowerVisualIntent(intent: WizardPowerVisualIntent) {
  const group = dummyGroups.get(intent.playerId);
  if (!group) return;
  const state = group.userData.wizardAnimation as WizardAnimationState | undefined;
  if (intent.kind === 'cancel') {
    delete group.userData.pendingWizardPowerVisualIntent;
    releaseWizardPowerTarget(intent.playerId);
    setWizardPowerHand(group, false);
    if (state?.power) finishWizardPowerAnimation(group, state);
    return;
  }
  if (intent.kind === 'resolve') {
    releaseWizardPowerTarget(intent.playerId);
    if (state?.power) {
      state.power.phase = 'resolving';
      state.power.resolvedAt = performance.now();
    }
    return;
  }
  const dx = intent.target.x - group.position.x;
  const dz = intent.target.z - group.position.z;
  if (Math.abs(dx) + Math.abs(dz) > 0.0001) group.rotation.y = Math.atan2(dx, dz);
  if (!state) {
    group.userData.pendingWizardPowerVisualIntent = intent;
    return;
  }
  if (state.power) finishWizardPowerAnimation(group, state);
  state.actions[state.current].fadeOut(0.14);
  state.actions.Power.paused = false;
  state.actions.Power.reset().fadeIn(0.14).play();
  setWizardPowerHand(group, true);
  state.current = 'Power';
  state.power = {
    phase: intent.hold ? 'playing' : 'resolving',
    holdAtEnd: intent.hold,
    targetKind: intent.targetKind,
    targetId: intent.targetId,
    resolvedAt: intent.hold ? undefined : performance.now(),
  };
}

function updateWizardAnimation(group: THREE.Group, moving: boolean, deltaSeconds: number) {
  const state = group.userData.wizardAnimation as WizardAnimationState | undefined;
  if (!state) return;
  if (state.power) {
    if (state.power.targetKind && state.power.targetId) {
      const target = wizardTargetGroup(state.power.targetKind, state.power.targetId);
      if (target) {
        const dx = target.position.x - group.position.x;
        const dz = target.position.z - group.position.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.0001) group.rotation.y = Math.atan2(dx, dz);
      }
    }
    state.mixer.update(deltaSeconds);
    updateWizardOrbitalAnimation(state, deltaSeconds);
    const powerDuration = state.actions.Power.getClip().duration;
    if (state.power.holdAtEnd && !state.power.liftStarted && state.actions.Power.time >= powerDuration * 0.9) {
      const playerId = group.userData.playerId as PlayerId | undefined;
      if (playerId && state.power.targetKind && state.power.targetId) {
        liftWizardPowerTarget(playerId, state.power.targetKind, state.power.targetId);
        state.power.liftStarted = true;
      }
    }
    const reachedFinalFrame = state.actions.Power.time >= powerDuration - 1 / 60;
    const playerId = group.userData.playerId as PlayerId | undefined;
    if (reachedFinalFrame) {
      if (state.power.phase === 'playing' && state.power.holdAtEnd) state.power.phase = 'holding';
      else if (state.power.phase === 'playing' || (state.power.phase === 'resolving' && playerId && wizardPowerEffectFinished(state.power, playerId))) finishWizardPowerAnimation(group, state);
    }
    return;
  }
  const next: WizardAnimationName = moving ? 'Walk' : 'Idle';
  if (state.current !== next) {
    state.actions[state.current].fadeOut(0.14);
    state.actions[next].reset().fadeIn(0.14).play();
    state.current = next;
  }
  state.mixer.update(deltaSeconds);
  updateWizardOrbitalAnimation(state, deltaSeconds);
}

function updateWizardOrbitalAnimation(state: WizardAnimationState, deltaSeconds: number) {
  const orbital = state.orbital;
  if (!orbital) return;
  orbital.elapsed += deltaSeconds;
  const { controller, basePosition, baseRotation, elapsed } = orbital;
  controller.position.set(basePosition.x, basePosition.y + Math.sin(elapsed * 1.35) * 0.035, basePosition.z);
  controller.rotation.set(
    baseRotation.x + Math.sin(elapsed * 0.85) * 0.045,
    baseRotation.y + elapsed * 0.72,
    baseRotation.z + Math.cos(elapsed * 1.1) * 0.035,
  );
}

function loadSpectreAsset() {
  return spectreAssetPromise ??= new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/spectre-optimized.glb?v=20260818-2`);
}

type SpectreAnimationName = 'Idle' | 'Walk' | 'Run' | 'Fear' | 'Arise';
type SpectreAnimationState = {
  mixer: THREE.AnimationMixer;
  actions: Record<SpectreAnimationName, THREE.AnimationAction>;
  current: SpectreAnimationName;
  oneShot?: 'Fear' | 'Arise';
  idlePauseUntil?: number;
};

function playSpectreAnimation(group: THREE.Group, name: SpectreAnimationName, fade = 0.12) {
  const state = group.userData.spectreAnimation as SpectreAnimationState | undefined;
  if (!state) return;
  const previous = state.actions[state.current];
  const next = state.actions[name];
  if (state.current !== name) previous.fadeOut(fade);
  next.reset().fadeIn(fade).play();
  state.current = name;
  state.oneShot = name === 'Fear' || name === 'Arise' ? name : undefined;
  state.idlePauseUntil = undefined;
}

function updateSpectreAnimation(group: THREE.Group, playerId: PlayerId | undefined, deltaSeconds: number) {
  const state = group.userData.spectreAnimation as SpectreAnimationState | undefined;
  if (!state) return;
  state.mixer.update(deltaSeconds);
  const currentAction = state.actions[state.current];
  if (state.oneShot) {
    if (currentAction.paused) playSpectreAnimation(group, 'Idle', 0.12);
    return;
  }
  const movement = playerId ? movementAnimations.get(playerId) : undefined;
  const locomoting = Boolean(movement && !movement.verticalOnly && !movement.forced);
  if (locomoting && movement) {
    const travelSquares = movement.travelSquares ?? movement.path?.length ?? 1;
    const movementName: SpectreAnimationName = travelSquares >= 3 ? 'Run' : 'Walk';
    state.actions[movementName].timeScale = state.actions[movementName].getClip().duration / (movement.duration / 1000);
    if (state.current !== movementName) playSpectreAnimation(group, movementName);
    return;
  }
  if (state.current === 'Walk' || state.current === 'Run') {
    playSpectreAnimation(group, 'Idle');
    return;
  }
  if (state.current !== 'Idle' || !currentAction.paused) return;
  state.idlePauseUntil ??= performance.now() + 2000;
  if (performance.now() >= state.idlePauseUntil) playSpectreAnimation(group, 'Idle', 0);
}

async function attachSpectreModel(root: THREE.Group, body: THREE.Group, replica: boolean) {
  try {
    const asset = await loadSpectreAsset();
    if (body.parent !== root) return;
    const model = cloneSkeleton(asset.scene) as THREE.Group;
    model.name = 'SpectreImportedModel';
    model.position.y = 0;
    model.rotation.y = Math.PI;
    model.scale.setScalar(1.18);
    model.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = !replica;
      // Spectre's closely layered skinned mesh produces the same striped
      // self-shadow artifact as Logan. Replicas share this imported mesh.
      child.receiveShadow = false;
      child.material = Array.isArray(child.material)
        ? child.material.map((material) => material.clone())
        : child.material.clone();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (!replica) return;
        material.transparent = true;
        material.opacity = 0.58;
        material.depthWrite = false;
        if (material instanceof THREE.MeshStandardMaterial) {
          material.color.multiply(new THREE.Color(0x9b7cff));
          material.emissive.set(0x47288f);
          material.emissiveIntensity = Math.max(material.emissiveIntensity, 0.65);
        }
        material.needsUpdate = true;
      });
    });
    const persistentEffects = body.children.filter((child) => child instanceof THREE.PointLight);
    persistentEffects.forEach((child) => child.removeFromParent());
    disposeTemporaryCharacterBody(body);
    persistentEffects.forEach((child) => body.add(child));
    body.add(model);
    const clips = Object.fromEntries(asset.animations.map((clip) => [clip.name, clip]));
    const required = ['Alert', 'Arise', 'Casual_Walk', 'RunFast', 'Skill_01'];
    if (required.some((name) => !clips[name])) throw new Error(`Spectre GLB is missing: ${required.filter((name) => !clips[name]).join(', ')}`);
    const mixer = new THREE.AnimationMixer(model);
    const actions: Record<SpectreAnimationName, THREE.AnimationAction> = {
      Idle: mixer.clipAction(clips.Alert),
      Walk: mixer.clipAction(clips.Casual_Walk),
      Run: mixer.clipAction(clips.RunFast),
      Fear: mixer.clipAction(clips.Skill_01),
      Arise: mixer.clipAction(clips.Arise),
    };
    actions.Idle.setLoop(THREE.LoopOnce, 1); actions.Idle.clampWhenFinished = true;
    actions.Fear.setLoop(THREE.LoopOnce, 1); actions.Fear.clampWhenFinished = true;
    actions.Arise.setLoop(THREE.LoopOnce, 1); actions.Arise.clampWhenFinished = true;
    root.userData.spectreAnimation = { mixer, actions, current: replica ? 'Arise' : 'Idle' } satisfies SpectreAnimationState;
    const pending = root.userData.pendingSpectreAnimation as 'Fear' | undefined;
    delete root.userData.pendingSpectreAnimation;
    playSpectreAnimation(root, pending ?? (replica ? 'Arise' : 'Idle'), 0);
    mixer.update(0);
  } catch (error) {
    console.error('Failed to load Spectre model; keeping procedural fallback.', error);
  }
}

function createSpectre(_playerColor = 0x169bd3, replica = false) {
  const root = new THREE.Group();
  root.scale.setScalar(1.15);
  const body = new THREE.Group(); body.name = replica ? 'SpectreReplicaBody' : 'SpectreBody'; root.add(body);
  root.userData.facingSide = 'negative-z';
  root.userData.spectreReplica = replica;
  const shadow = new THREE.MeshStandardMaterial({ color: replica ? 0x211840 : 0x171525, emissive: replica ? 0x6d42d8 : 0x24184a, emissiveIntensity: replica ? 1.65 : 0.72, roughness: 0.74, transparent: replica, opacity: replica ? 0.58 : 1, depthWrite: !replica });
  const armor = new THREE.MeshStandardMaterial({ color: replica ? 0x49327d : 0x3a3552, emissive: replica ? 0x8a59ff : 0x261d43, emissiveIntensity: replica ? 1.8 : 0.52, metalness: 0.58, roughness: 0.36, transparent: replica, opacity: replica ? 0.62 : 1, depthWrite: !replica });
  const glow = new THREE.MeshBasicMaterial({ color: replica ? 0xbc8cff : 0x8d69ff, transparent: true, opacity: replica ? 0.8 : 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = !replica; parent.add(mesh); return mesh;
  };
  const cloak = add(new THREE.ConeGeometry(0.48, 1.35, 18, 1, true), shadow, [0, 0.82, 0]); cloak.rotation.y = Math.PI;
  add(new THREE.CapsuleGeometry(0.25, 0.54, 7, 14), armor, [0, 1.39, 0]);
  const hood = add(new THREE.SphereGeometry(0.34, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.72), shadow, [0, 1.91, 0]); hood.rotation.x = 0.12;
  const mask = add(new THREE.BoxGeometry(0.25, 0.31, 0.055), armor, [0, 1.88, -0.292]); mask.rotation.x = -0.08;
  for (const side of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.035, 10, 8), glow, [side * 0.072, 1.93, -0.333]); eye.scale.z = 0.35;
    const shoulder = add(new THREE.SphereGeometry(0.18, 12, 9), armor, [side * 0.35, 1.52, 0]); shoulder.scale.set(1.25, 0.7, 1);
    const arm = add(new THREE.CapsuleGeometry(0.07, 0.46, 5, 9), shadow, [side * 0.4, 1.18, -0.02]); arm.rotation.z = side * 0.18;
    const dagger = add(new THREE.ConeGeometry(0.055, 0.55, 5), glow, [side * 0.49, 0.83, -0.08]); dagger.rotation.z = side * -0.18;
  }
  const light = new THREE.PointLight(replica ? 0xa474ff : 0x7450e8, replica ? 3.8 : 2.2, 4); light.position.set(0, 1.25, -0.15); body.add(light);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: replica ? 0xc79cff : 0x9b77ff, transparent: true, opacity: 0.92, side: THREE.DoubleSide }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring);
  root.userData.player = !replica;
  attachSpectreModel(root, body, replica);
  return root;
}

function createMerylin(playerColor = 0x169bd3) {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.name = 'MerylinBody'; root.add(body);
  root.userData.facingSide = 'negative-z';
  const purple = new THREE.MeshStandardMaterial({ color: 0x55207d, roughness: 0.68 });
  const purpleDark = new THREE.MeshStandardMaterial({ color: 0x261039, roughness: 0.78 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a184, roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x4a241d, roughness: 0.8 });
  const plate = new THREE.MeshStandardMaterial({ color: 0x98a4b7, metalness: 0.82, roughness: 0.27 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c84b, emissive: 0x5c3405, emissiveIntensity: 0.35, roughness: 0.38 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  add(new THREE.ConeGeometry(0.54, 1.28, 28), purple, [0, 0.73, 0]);
  const torso = add(new THREE.CapsuleGeometry(0.25, 0.46, 7, 16), purple, [0, 1.35, 0]); torso.scale.set(1, 1, 0.82);
  // Skin-toned inset forms the open neckline without adding a separate garment layer.
  const neckline = add(new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), skin, [0, 1.57, -0.205]); neckline.scale.set(0.72, 0.75, 0.26); neckline.rotation.x = 0.16;
  const starPositions: Array<[number, number, number]> = [[-0.22, 0.42, -0.45], [0.24, 0.62, -0.43], [-0.34, 0.82, -0.36], [0.12, 0.98, -0.37], [0.3, 1.18, -0.24], [-0.18, 1.3, -0.25]];
  for (const [x, y, z] of starPositions) {
    const star = add(new THREE.OctahedronGeometry(0.045, 0), gold, [x, y, z]); star.scale.set(1, 1.35, 0.32); star.rotation.z = x * 2.1;
  }
  const leftShoulder = add(new THREE.SphereGeometry(0.22, 16, 10), plate, [-0.36, 1.5, 0]); leftShoulder.scale.set(1.3, 0.72, 1.05);
  const leftArm = add(new THREE.CapsuleGeometry(0.08, 0.5, 5, 10), purpleDark, [-0.42, 1.16, 0]); leftArm.rotation.z = 0.15;
  const leftGauntlet = add(new THREE.CapsuleGeometry(0.105, 0.3, 5, 10), plate, [-0.47, 0.88, -0.02]); leftGauntlet.rotation.z = 0.15;
  const shield = new THREE.Group(); shield.name = 'MerylinSteelShield'; shield.position.set(-0.55, 1.12, -0.25); shield.rotation.set(-0.08, -0.18, 0.08); body.add(shield);
  const shieldFace = add(new THREE.CylinderGeometry(0.31, 0.31, 0.065, 28), plate, [0, 0, 0], shield); shieldFace.rotation.x = Math.PI / 2; shieldFace.scale.set(0.82, 1, 1.12);
  const shieldRim = add(new THREE.TorusGeometry(0.31, 0.025, 8, 28), plate, [0, 0, -0.04], shield); shieldRim.scale.set(0.82, 1.12, 1);
  const shieldBoss = add(new THREE.SphereGeometry(0.095, 14, 9), plate, [0, 0, -0.075], shield); shieldBoss.scale.set(1, 1, 0.48);
  const shieldBand = add(new THREE.BoxGeometry(0.035, 0.53, 0.035), gold, [0, 0, -0.082], shield); shieldBand.rotation.z = 0.03;
  const rightArm = add(new THREE.CapsuleGeometry(0.075, 0.55, 5, 10), purpleDark, [0.39, 1.16, 0]); rightArm.rotation.z = -0.18;
  add(new THREE.SphereGeometry(0.105, 12, 9), skin, [0.45, 0.85, -0.02]);
  const head = add(new THREE.SphereGeometry(0.25, 20, 15), skin, [0, 1.91, 0]); head.scale.set(0.9, 1.05, 0.88);
  add(new THREE.SphereGeometry(0.28, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, [0, 2.01, 0.03]);
  const hairMass = add(new THREE.ConeGeometry(0.34, 1.12, 18, 1, true), hair, [0, 1.48, 0.18]); hairMass.rotation.y = Math.PI;
  add(new THREE.CylinderGeometry(0.48, 0.48, 0.07, 28), purpleDark, [0, 2.18, 0]);
  const hat = add(new THREE.ConeGeometry(0.31, 0.9, 22), purple, [0.06, 2.62, 0]); hat.rotation.z = -0.12;
  const hatBand = add(new THREE.TorusGeometry(0.245, 0.035, 8, 24), gold, [0, 2.28, 0]); hatBand.rotation.x = Math.PI / 2;
  const summon = new THREE.Group(); summon.name = 'MerylinSummonForm'; summon.visible = false; body.add(summon);
  const sword = new THREE.Group(); sword.name = 'MerylinSummonedSword'; sword.position.set(0.55, 1.08, -0.08); sword.rotation.z = -0.12; summon.add(sword);
  const bladeColors = [0xb9132f, 0x17131d, 0x8d96a1, 0xe1ad35];
  const bladeGeometries: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(0.085, 1.18, 0.045),
    new THREE.BoxGeometry(0.12, 0.78, 0.055),
    new THREE.ConeGeometry(0.035, 1.12, 8),
    new THREE.CylinderGeometry(0.035, 0.1, 1.02, 7),
  ];
  bladeGeometries.forEach((geometry, index) => {
    const material = new THREE.MeshBasicMaterial({ color: bladeColors[0], transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false });
    const blade = new THREE.Mesh(geometry, material); blade.name = `MerylinSwordShape${index}`; blade.position.y = 0.62; blade.visible = index === 0; sword.add(blade);
  });
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.055, 0.07), new THREE.MeshBasicMaterial({ color: 0xe2b84d, transparent: true, opacity: 0.62 })); guard.position.y = 0.04; sword.add(guard);
  const windHair = new THREE.Group(); windHair.name = 'MerylinWindHair'; summon.add(windHair);
  for (let index = 0; index < 7; index++) {
    const strand = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.68 + index * 0.035, 4, 7), hair.clone());
    strand.position.set((index - 3) * 0.075, 1.58 - Math.abs(index - 3) * 0.03, 0.22); strand.rotation.z = -0.72 - index * 0.035; strand.userData.windOffset = index * 0.7; windHair.add(strand);
  }
  const summonLight = new THREE.PointLight(0xe8b743, 2.6, 3.2); summonLight.name = 'MerylinSummonLight'; summonLight.position.set(0.42, 1.25, -0.1); summon.add(summonLight);
  add(new THREE.CylinderGeometry(0.56, 0.65, 0.12, 32), new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.65 }), [0, 0.1, 0], root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0xc889ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  return root;
}

function syncMerylinSummonVisual(group: THREE.Group, active: boolean, time: number) {
  if (group.userData.character !== 'merylin') return;
  const summon = group.getObjectByName('MerylinSummonForm');
  if (!summon) return;
  summon.visible = active;
  const sword = summon.getObjectByName('MerylinSummonedSword');
  if (!active) {
    if (sword) sword.userData.morphInitialized = false;
    return;
  }
  if (sword) {
    const palette = [0xb9132f, 0x17131d, 0x8d96a1, 0xe1ad35];
    const cycle = Math.floor(time / 1400);
    if (!sword.userData.morphInitialized) {
      sword.userData.morphInitialized = true;
      sword.userData.currentShape = Math.floor(Math.random() * 4);
      sword.userData.currentColor = palette[Math.floor(Math.random() * palette.length)];
      sword.userData.lastMorphCycle = cycle;
      sword.userData.morphing = false;
    } else if (sword.userData.lastMorphCycle !== cycle) {
      const currentShape = sword.userData.currentShape as number;
      let nextShape = Math.floor(Math.random() * 3);
      if (nextShape >= currentShape) nextShape += 1;
      sword.userData.nextShape = nextShape;
      sword.userData.nextColor = palette[Math.floor(Math.random() * palette.length)];
      sword.userData.morphStartedAt = time;
      sword.userData.lastMorphCycle = cycle;
      sword.userData.morphing = true;
    }
    const morphProgress = sword.userData.morphing ? THREE.MathUtils.smoothstep((time - sword.userData.morphStartedAt) / 720, 0, 1) : 0;
    const currentShape = sword.userData.currentShape as number;
    const nextShape = sword.userData.nextShape as number | undefined;
    for (let index = 0; index < 4; index++) {
      const blade = summon.getObjectByName(`MerylinSwordShape${index}`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
      if (!blade) continue;
      const isCurrent = index === currentShape;
      const isNext = sword.userData.morphing && index === nextShape;
      blade.visible = isCurrent || Boolean(isNext);
      if (isCurrent) {
        blade.material.color.setHex(sword.userData.currentColor);
        blade.material.opacity = 0.58 * (1 - morphProgress);
        blade.scale.set(1 + morphProgress * 0.16, 1 - morphProgress * 0.12, 1);
      } else if (isNext) {
        blade.material.color.setHex(sword.userData.nextColor);
        blade.material.opacity = 0.58 * morphProgress;
        blade.scale.set(1.16 - morphProgress * 0.16, 0.82 + morphProgress * 0.18, 1);
      } else blade.scale.set(1, 1, 1);
    }
    if (sword.userData.morphing && morphProgress >= 1) {
      sword.userData.currentShape = sword.userData.nextShape;
      sword.userData.currentColor = sword.userData.nextColor;
      sword.userData.morphing = false;
    }
  }
  if (sword) { sword.scale.setScalar(0.96 + Math.sin(time * 0.006) * 0.06); sword.rotation.y = Math.sin(time * 0.0025) * 0.14; }
  const windHair = summon.getObjectByName('MerylinWindHair');
  windHair?.children.forEach((strand) => { strand.rotation.y = Math.sin(time * 0.004 + strand.userData.windOffset) * 0.22; strand.rotation.z = -0.72 + Math.sin(time * 0.0032 + strand.userData.windOffset) * 0.16; });
}

function createWreckna(playerColor = 0x169bd3) {
  const root = new THREE.Group();
  const body = new THREE.Group(); body.name = 'WrecknaBody'; root.add(body);
  root.userData.facingSide = 'negative-z';
  const bone = new THREE.MeshStandardMaterial({ color: 0xd7decc, roughness: 0.78 });
  const boneDark = new THREE.MeshStandardMaterial({ color: 0x718077, roughness: 0.82 });
  const armor = new THREE.MeshStandardMaterial({ color: 0x172836, roughness: 0.42, metalness: 0.72 });
  const crown = new THREE.MeshStandardMaterial({ color: 0x607887, emissive: 0x173b52, emissiveIntensity: 0.55, roughness: 0.3, metalness: 0.86 });
  const frost = new THREE.MeshStandardMaterial({ color: 0x6d93a3, emissive: 0x17445d, emissiveIntensity: 0.45, roughness: 0.2 });
  const robe = new THREE.MeshStandardMaterial({ color: 0x151329, emissive: 0x171342, emissiveIntensity: 0.35, roughness: 0.88 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: [number, number, number], parent = body) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh;
  };
  const spectralTail = add(new THREE.ConeGeometry(0.48, 1.18, 18, 1, true), robe, [0, 0.83, 0]);
  spectralTail.rotation.y = Math.PI;
  add(new THREE.CapsuleGeometry(0.27, 0.62, 6, 14), armor, [0, 1.42, 0]);
  for (const side of [-1, 1]) {
    const shoulder = add(new THREE.ConeGeometry(0.25, 0.62, 5), armor, [side * 0.43, 1.58, 0]);
    shoulder.rotation.z = side * -Math.PI / 2; shoulder.rotation.y = Math.PI / 2;
    const upperArm = add(new THREE.CapsuleGeometry(0.07, 0.43, 5, 9), side > 0 ? boneDark.clone() : boneDark, [side * 0.49, 1.2, 0]);
    upperArm.name = side > 0 ? 'WrecknaRightArm' : 'WrecknaLeftArm';
    upperArm.rotation.z = side * 0.24;
    const hand = add(new THREE.SphereGeometry(0.105, 12, 9), side > 0 ? bone.clone() : bone, [side * 0.56, 0.91, -0.02]);
    hand.name = side > 0 ? 'WrecknaRightHand' : 'WrecknaLeftHand';
  }
  const mightLight = new THREE.PointLight(0xff2638, 3.8, 2.5); mightLight.name = 'WrecknaMightLight'; mightLight.position.set(0.55, 1.13, -0.04); mightLight.visible = false; body.add(mightLight);
  const skull = add(new THREE.SphereGeometry(0.25, 20, 15), bone, [0, 1.98, 0]); skull.scale.set(0.82, 1, 0.78);
  const jaw = add(new THREE.BoxGeometry(0.27, 0.16, 0.2), boneDark, [0, 1.79, -0.035]); jaw.rotation.x = -0.08;
  for (const side of [-1, 1]) {
    const eye = add(new THREE.SphereGeometry(0.052, 12, 8), frost, [side * 0.085, 2.01, -0.205]); eye.name = side < 0 ? 'WrecknaEyeLeft' : 'WrecknaEyeRight'; eye.scale.z = 0.55;
    const cheek = add(new THREE.ConeGeometry(0.045, 0.22, 6), boneDark, [side * 0.14, 1.87, -0.16]); cheek.rotation.z = side * 0.24;
  }
  const crownBand = add(new THREE.CylinderGeometry(0.24, 0.27, 0.12, 10), crown, [0, 2.19, 0]);
  crownBand.name = 'WrecknaCrownBand';
  crownBand.rotation.y = Math.PI / 10;
  for (let index = 0; index < 7; index++) {
    const angle = index / 7 * Math.PI * 2;
    const spike = add(new THREE.ConeGeometry(0.045, 0.43, 5), crown, [Math.sin(angle) * 0.21, 2.4, Math.cos(angle) * 0.21]);
    spike.name = `WrecknaCrownSpike${index + 1}`;
    spike.rotation.z = Math.sin(angle) * 0.18; spike.rotation.x = -Math.cos(angle) * 0.18;
  }
  const wisdomCrownLight = new THREE.PointLight(0x26bfff, 3.4, 2.8); wisdomCrownLight.name = 'WrecknaWisdomCrownLight'; wisdomCrownLight.position.set(0, 2.35, 0); wisdomCrownLight.visible = false; body.add(wisdomCrownLight);
  const mantle = new THREE.Group(); mantle.name = 'WrecknaRitualMantle'; mantle.visible = false; body.add(mantle);
  const mantleGold = new THREE.MeshStandardMaterial({ color: 0xe0b94b, emissive: 0xb66a12, emissiveIntensity: 2.1, roughness: 0.3, metalness: 0.72 });
  const collar = add(new THREE.TorusGeometry(0.39, 0.09, 8, 24, Math.PI), mantleGold, [0, 1.62, 0.08], mantle); collar.rotation.x = Math.PI / 2; collar.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const mantlePlate = add(new THREE.ConeGeometry(0.23, 0.78, 5), mantleGold, [side * 0.39, 1.5, 0.12], mantle);
    mantlePlate.rotation.z = side * -0.48; mantlePlate.rotation.x = -0.2;
  }
  const cape = add(new THREE.ConeGeometry(0.48, 1.16, 10, 1, true, 0, Math.PI), mantleGold, [0, 1.03, 0.2], mantle); cape.rotation.y = Math.PI / 2;
  const mantleLight = new THREE.PointLight(0xffc94d, 3.2, 4); mantleLight.name = 'WrecknaMantleLight'; mantleLight.position.set(0, 1.5, 0.18); mantle.add(mantleLight);
  const aura = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 42), new THREE.MeshBasicMaterial({ color: 0x65ccff, transparent: true, opacity: 0.58 }));
  aura.name = 'WrecknaLevitationAura'; aura.rotation.x = Math.PI / 2; aura.position.y = 0.31; body.add(aura);
  const light = new THREE.PointLight(0x4fc8ff, 2.4, 4); light.position.set(0, 1.55, -0.2); body.add(light);
  add(new THREE.CylinderGeometry(0.56, 0.65, 0.12, 32), new THREE.MeshStandardMaterial({ color: playerColor, emissive: playerColor, emissiveIntensity: 0.65 }), [0, 0.1, 0], root);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.88, 48), new THREE.MeshBasicMaterial({ color: 0x72dcff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.name = 'TargetRing'; ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; ring.visible = false; root.add(ring); root.userData.player = true;
  return root;
}

function syncWrecknaPhylacteryVisuals(group: THREE.Group, playerId: PlayerId) {
  if (group.userData.character !== 'wreckna') return;
  const might = Boolean(activeWrecknaPhylactery(gameState, playerId, 'might'));
  const wisdom = Boolean(activeWrecknaPhylactery(gameState, playerId, 'wisdom'));
  const ritual = Boolean(activeWrecknaPhylactery(gameState, playerId, 'ritual'));
  for (const name of ['WrecknaRightArm', 'WrecknaRightHand']) {
    const mesh = group.getObjectByName(name) as THREE.Mesh | undefined;
    const material = mesh?.material as THREE.MeshStandardMaterial | undefined;
    if (!material) continue;
    material.color.setHex(might ? 0xd92c36 : name.endsWith('Hand') ? 0xd7decc : 0x718077);
    material.emissive.setHex(might ? 0xff1828 : 0x000000);
    material.emissiveIntensity = might ? 2.8 : 0;
  }
  const mightLight = group.getObjectByName('WrecknaMightLight') as THREE.PointLight | undefined;
  if (mightLight) mightLight.visible = might;
  for (const name of ['WrecknaEyeLeft', 'WrecknaEyeRight']) {
    const eye = group.getObjectByName(name) as THREE.Mesh | undefined;
    const material = eye?.material as THREE.MeshStandardMaterial | undefined;
    if (!material) continue;
    material.color.setHex(wisdom ? 0xaeeeff : 0x6d93a3);
    material.emissive.setHex(wisdom ? 0x26bfff : 0x17445d);
    material.emissiveIntensity = wisdom ? 5.2 : 0.45;
    eye!.scale.setScalar(wisdom ? 1.18 : 1);
    eye!.scale.z *= 0.55;
  }
  const crownBand = group.getObjectByName('WrecknaCrownBand') as THREE.Mesh | undefined;
  const crownMaterial = crownBand?.material as THREE.MeshStandardMaterial | undefined;
  if (crownMaterial) {
    crownMaterial.color.setHex(wisdom ? 0x8adfff : 0x607887);
    crownMaterial.emissive.setHex(wisdom ? 0x26bfff : 0x173b52);
    crownMaterial.emissiveIntensity = wisdom ? 3.8 : 0.55;
  }
  const wisdomCrownLight = group.getObjectByName('WrecknaWisdomCrownLight') as THREE.PointLight | undefined;
  if (wisdomCrownLight) wisdomCrownLight.visible = wisdom;
  const mantle = group.getObjectByName('WrecknaRitualMantle');
  if (mantle) mantle.visible = ritual;
}

function createWrecknaTomb() {
  const root = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.94 });
  const darkStone = new THREE.MeshStandardMaterial({ color: 0x303840, roughness: 0.98 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xc5cbbd, roughness: 0.86 });
  const coffin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.05, 0.48), stone); coffin.position.y = 1.13; coffin.castShadow = true; coffin.receiveShadow = true; root.add(coffin);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.98, 1.78, 0.14), darkStone); lid.position.set(0, 1.12, -0.29); lid.castShadow = true; root.add(lid);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.42, 5), stone); crown.position.y = 2.34; crown.rotation.y = Math.PI; crown.castShadow = true; root.add(crown);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), bone); skull.position.set(0, 1.45, -0.39); skull.scale.set(0.85, 1, 0.62); skull.castShadow = true; root.add(skull);
  for (const side of [-1, 1]) { const boneBar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.72, 7), bone); boneBar.position.set(0, 0.92, -0.39); boneBar.rotation.z = side * 0.78; root.add(boneBar); }
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.2, 0.74), darkStone); base.position.y = 0.11; base.castShadow = true; root.add(base);
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

function randomizeManaOrbit(orb: THREE.Object3D) {
  orb.userData.orbitRadiusX = 0.62 + Math.random() * 0.34;
  orb.userData.orbitRadiusZ = 0.58 + Math.random() * 0.38;
  orb.userData.orbitSpeed = (0.00072 + Math.random() * 0.00105) * (Math.random() < 0.5 ? -1 : 1);
  orb.userData.orbitPhase = Math.random() * Math.PI * 2;
  orb.userData.orbitHeight = 0.86 + Math.random() * 0.48;
  orb.userData.orbitVerticalAmplitude = 0.10 + Math.random() * 0.23;
  orb.userData.orbitVerticalFrequency = 1.25 + Math.random() * 1.8;
  orb.userData.orbitWobble = 0.025 + Math.random() * 0.08;
  orb.userData.orbitWobbleSpeed = 0.0011 + Math.random() * 0.0025;
  orb.userData.orbitWobblePhase = Math.random() * Math.PI * 2;
}

function syncManaOrbVisual(group: THREE.Group, player: GameState['players'][PlayerId]) {
  const importedOrbs = [1, 2, 3].map((index) => group.getObjectByName(`Wizard_Orb_0${index}_Root`));
  if (importedOrbs.every((orb): orb is THREE.Object3D => Boolean(orb))) {
    const visibleCount = player.character === 'magician' ? player.manaPoints : 0;
    importedOrbs.forEach((orb, index) => { orb.visible = index < visibleCount; });
    return;
  }
  const aura = group.getObjectByName('ManaOrbAura') as THREE.Group | undefined;
  if (!aura) return;
  const consumeOrbs = player.character === 'magician' && player.manaMode === 'consume' && player.id === gameState.activePlayerId;
  const visibleCount = player.character === 'magician' ? player.manaPoints : 0;
  const previousCount = Number(aura.userData.visibleCount ?? 0);
  const countChanged = previousCount !== visibleCount;
  aura.children.forEach((child, index) => {
    child.visible = index < visibleCount;
    const material = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
    material.color.setHex(consumeOrbs ? 0xb66cff : 0x69d4ff);
    material.emissive.setHex(consumeOrbs ? 0x7a24da : 0x168fe8);
    if (countChanged && index < visibleCount) {
      randomizeManaOrbit(child);
      child.userData.spawnedAt = performance.now();
    }
  });
  aura.userData.visibleCount = visibleCount;
}

function updateManaOrbAnimation(group: THREE.Group, time: number) {
  const aura = group.getObjectByName('ManaOrbAura') as THREE.Group | undefined;
  if (!aura) return;
  aura.children.forEach((child, index) => {
    if (!child.visible) return;
    const speed = Number(child.userData.orbitSpeed ?? 0.00125);
    const phase = Number(child.userData.orbitPhase ?? index * Math.PI * 2 / 3);
    const angle = time * speed + phase;
    const wobble = Math.sin(time * Number(child.userData.orbitWobbleSpeed ?? 0.002) + Number(child.userData.orbitWobblePhase ?? 0)) * Number(child.userData.orbitWobble ?? 0.05);
    const radiusX = Number(child.userData.orbitRadiusX ?? 0.78) + wobble;
    const radiusZ = Number(child.userData.orbitRadiusZ ?? 0.78) - wobble * 0.7;
    const height = Number(child.userData.orbitHeight ?? 1.05)
      + Math.sin(angle * Number(child.userData.orbitVerticalFrequency ?? 2) + phase * 0.6) * Number(child.userData.orbitVerticalAmplitude ?? 0.18);
    child.position.set(Math.cos(angle) * radiusX, height, Math.sin(angle) * radiusZ);
    const spawnProgress = Math.min(1, (time - Number(child.userData.spawnedAt ?? 0)) / 420);
    const scale = Math.max(0.01, spawnProgress) * (1 + Math.sin(time * 0.006 + index) * 0.08);
    child.scale.setScalar(scale);
  });
}

function syncManaConsumeAnimation(playerId: PlayerId, group: THREE.Group) {
  const eventId = gameState.players[playerId].manaConsumeEventId;
  if (!eventId || processedManaConsumeEvents.has(eventId)) return;
  processedManaConsumeEvents.add(eventId);
  const effect = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.64, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xb978ff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.position.y = 4.1;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.8, 48), new THREE.MeshBasicMaterial({ color: 0xc184ff, transparent: true, opacity: 0.94, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1;
  const light = new THREE.PointLight(0xa84dff, 9, 7); light.position.y = 1.7;
  effect.add(beam, ring, light); group.add(effect);
  manaConsumeAnimations.push({ parent: group, group: effect, beam, ring, light, startedAt: performance.now() });
}

function updateManaConsumeAnimations(time: number) {
  for (let index = manaConsumeAnimations.length - 1; index >= 0; index--) {
    const animation = manaConsumeAnimations[index];
    const progress = Math.min(1, (time - animation.startedAt) / 1900);
    animation.beam.scale.set(0.8 + Math.sin(progress * Math.PI * 8) * 0.12, 1, 0.8 + Math.sin(progress * Math.PI * 8) * 0.12);
    animation.ring.scale.setScalar(0.5 + progress * 2.2);
    (animation.beam.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - progress);
    (animation.ring.material as THREE.MeshBasicMaterial).opacity = 0.94 * (1 - progress);
    animation.light.intensity = 9 * (1 - progress);
    if (progress < 1) continue;
    animation.parent.remove(animation.group);
    animation.beam.geometry.dispose(); (animation.beam.material as THREE.Material).dispose();
    animation.ring.geometry.dispose(); (animation.ring.material as THREE.Material).dispose();
    manaConsumeAnimations.splice(index, 1);
  }
}

function syncStoicShellHealAnimations() {
  for (const player of Object.values(gameState.players)) {
    if (player.character !== 'john-christ' || player.stoicShellHealedTurn !== gameState.turn) continue;
    const eventId = player.stoicShellHealEventId;
    if (!eventId) continue;
    if (processedStoicShellHeals.has(eventId)) continue;
    processedStoicShellHeals.add(eventId);
    const group = new THREE.Group();
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.82, 6.4, 32, 1, true), beamMaterial);
    beam.position.y = 3.2;
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffdc4d, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.68, 48), ringMaterial);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.08;
    const crownMaterial = new THREE.MeshBasicMaterial({ color: 0xffffc7, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    const crown = new THREE.Mesh(new THREE.RingGeometry(0.34, 1.05, 64), crownMaterial);
    crown.rotation.x = -Math.PI / 2; crown.position.y = 6.18;
    const light = new THREE.PointLight(0xffe77d, 10, 7); light.position.y = 2.2;
    group.add(beam, ring, crown, light); group.position.copy(worldPosition(player.position)); scene.add(group);
    stoicShellHealAnimations.push({ group, beam, ring, crown, light, startedAt: performance.now() });
  }
}

function updateStoicShellHealAnimations(time: number) {
  for (let index = stoicShellHealAnimations.length - 1; index >= 0; index--) {
    const animation = stoicShellHealAnimations[index];
    const progress = Math.min(1, (time - animation.startedAt) / 2100);
    const pulse = 0.76 + Math.sin(progress * Math.PI * 6) * 0.14;
    animation.beam.scale.set(pulse, 1, pulse);
    animation.ring.scale.setScalar(0.7 + progress * 1.8);
    animation.crown.rotation.z = progress * Math.PI * 1.5;
    animation.crown.scale.setScalar(0.86 + Math.sin(progress * Math.PI) * 0.35);
    (animation.beam.material as THREE.MeshBasicMaterial).opacity = 0.72 * (1 - progress);
    (animation.ring.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - progress);
    (animation.crown.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - progress);
    animation.light.intensity = 10 * (1 - progress);
    if (progress < 1) continue;
    scene.remove(animation.group);
    animation.beam.geometry.dispose(); (animation.beam.material as THREE.Material).dispose();
    animation.ring.geometry.dispose(); (animation.ring.material as THREE.Material).dispose();
    animation.crown.geometry.dispose(); (animation.crown.material as THREE.Material).dispose();
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
  const slide = visualArena().slideSquares?.includes(cellLabel(cell)) ?? false;
  return new THREE.Vector3((cell.x - (visualBoardWidth() + 1) / 2) * 1.92, highGround ? 0.54 : slide ? 0.26 : 0.08, (cell.y - (visualBoardHeight() - 1) / 2) * 1.92);
}

function syncSpectreShadowTrail() {
  for (const child of [...spectreShadowTrailGroup.children]) {
    spectreShadowTrailGroup.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
  }
  const shadow = (gameState as GameState & { spectreShadow?: { casterId: PlayerId; trail: Cell[] } | null }).spectreShadow;
  if (!shadow?.trail.length) return;
  const color = shadow.casterId === 'P2' ? 0xff4d79 : shadow.casterId === 'P3' ? 0xa66cff : 0x4d52ff;
  shadow.trail.forEach((cell, index) => {
    const ribbon = new THREE.Mesh(
      new THREE.PlaneGeometry(1.58, 1.58),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }),
    );
    ribbon.rotation.x = -Math.PI / 2;
    ribbon.rotation.z = index * 0.14;
    ribbon.position.copy(worldPosition(cell));
    ribbon.position.y += 0.09;
    ribbon.renderOrder = 3;
    spectreShadowTrailGroup.add(ribbon);
  });
}

function faceCharacterTowardNearestOpponent(group: THREE.Group, playerId: PlayerId) {
  let nearestPosition: THREE.Vector3 | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  (Object.keys(gameState.players) as PlayerId[]).forEach((candidateId) => {
    if (candidateId === playerId) return;
    const candidatePosition = worldPosition(gameState.players[candidateId].position);
    const distance = group.position.distanceToSquared(candidatePosition);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPosition = candidatePosition;
    }
  });
  if (!nearestPosition) return;
  const dx = nearestPosition.x - group.position.x;
  const dz = nearestPosition.z - group.position.z;
  if (Math.abs(dx) + Math.abs(dz) > 0.0001) group.rotation.y = characterFacingRotation(group, dx, dz);
}

function syncBoard() {
  if (boardVisualKey !== boardGeometryKey()) rebuildBoardGeometry(visualBoardWidth(), visualBoardHeight());
  syncSpectreShadowTrail();
  (Object.keys(gameState.players) as PlayerId[]).forEach((id) => {
    const character = gameState.players[id].character;
    let group = dummyGroups.get(id);
    if (!group || group.userData.character !== character) {
      if (group) scene.remove(group);
      const color = id === 'P1' ? 0x169bd3 : id === 'P2' ? 0xff5d68 : 0xa06cff;
      group = character === 'orkk' ? createDaOrkk(color) : character === 'shinobi' ? createObiWanShinobi(color) : character === 'magician' ? createLongHatLogan(color) : character === 'john-christ' ? createJohnChrist(color) : character === 'spectre' ? createSpectre(color) : character === 'wreckna' ? createWreckna(color) : character === 'merylin' ? createMerylin(color) : createDummy(color);
      group.userData.character = character;
      dummyGroups.set(id, group); scene.add(group); lastVisualCells.delete(id); movementAnimations.delete(id);
    }
    const entombed = character === 'wreckna' && Boolean(gameState.players[id].wrecknaInsideTombId && gameState.objects.some((object) => object.id === gameState.players[id].wrecknaInsideTombId && object.kind === 'tomb'));
    group.visible = !entombed && (gameState.phase !== 'choosing-base-placement' || Boolean(placementState()?.claims[id]));
    if (!group) return;
    const cell = gameState.players[id].position;
    const target = worldPosition(cell);
    if (gameState.players[id].spectreOnBoxId) target.y += 1.22;
    const targetKey = cellLabel(cell);
    const previousKey = lastVisualCells.get(id);
    if (!previousKey) {
      group.position.copy(target);
      faceCharacterTowardNearestOpponent(group, id);
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
      const movement = { playerId: id, from, to: target.clone(), duration: 320 + travelSquares * 150, path: visualPath.length > 0 ? visualPath : undefined, travelSquares, forced: gameState.players[id].visualMovementCause === 'enemy-ability' };
      if (recordedMovement?.triggerAnimationId) {
        const queued = impactTriggeredCharacterMovements.get(recordedMovement.triggerAnimationId) ?? [];
        queued.push({ ...movement, triggerRouteProgress: recordedMovement.triggerRouteProgress });
        impactTriggeredCharacterMovements.set(recordedMovement.triggerAnimationId, queued);
      }
      else movementAnimations.set(id, { ...movement, startedAt: performance.now() });
      delete gameState.players[id].visualMovementCause;
    } else if (!movementAnimations.has(id) && Math.abs(group.position.y - target.y) > 0.001) {
      movementAnimations.set(id, { from: group.position.clone(), to: target.clone(), startedAt: performance.now(), duration: 280, verticalOnly: true });
    }
    lastVisualCells.set(id, targetKey);
    const equippedShield = group.getObjectByName('EquippedShield');
    const recallInFlight = gameState.objectPushAnimations.some((event) => event.equipPlayerId === id && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId)));
    const throwInFlight = gameState.objectPushAnimations.some((event) => event.id.includes('-arkane-arow-')
      && gameState.objects.some((object) => object.id === event.objectId && object.ownerId === id)
      && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId)));
    if (equippedShield) equippedShield.visible = (gameState.players[id].shieldEquipped && !recallInFlight) || throwInFlight;
    updateSwiftformVisual(group, gameState.players[id].swiftformCanPassEnemies, id === 'P1' ? 0x45c8ff : 0xff5d68);
    updateSpiritFormVisual(group, gameState.players[id].spiritForm);
    updateStoicShellAura(group, gameState.players[id].stoicShell);
    syncFearSigilVisual(group, (gameState.players[id].panicAnimationSourceIds?.length ?? 0) > 0);
    updateOrkkRageCoreGlow(group, gameState.players[id].rageStacks);
    syncManaOrbVisual(group, gameState.players[id]);
    syncWrecknaPhylacteryVisuals(group, id);
    syncManaConsumeAnimation(id, group);
    group.traverse((child) => { child.userData.playerId = id; });
  });
  syncCaptureTheFlagVisual();
  syncHotPotatoVisual();
  const currentObjectIds = new Set(gameState.objects.map((object) => object.id));
  const animatedRemovalIds = new Set(gameState.objectPushAnimations.filter((event) => event.removeOnComplete && (!processedObjectPushAnimations.has(event.id) || objectMovementAnimations.has(event.objectId))).map((event) => event.objectId));
  objectGroups.forEach((group, id) => { if (!currentObjectIds.has(id) && !animatedRemovalIds.has(id)) { scene.remove(group); objectGroups.delete(id); lastObjectVisualCells.delete(id); objectMovementAnimations.delete(id); } });
  gameState.objects.forEach((object) => {
    let group = objectGroups.get(object.id);
    if (!group) { group = object.kind === 'spirit-guardian' ? createSpiritGuardian(object.guardianLevel ?? 1) : object.kind === 'spectre-replica' ? createSpectre(object.ownerId === 'P2' ? 0xff5d68 : object.ownerId === 'P3' ? 0xa06cff : 0x169bd3, true) : object.kind === 'orkk-shield' ? createOrkkShieldObject() : object.kind === 'wall-pillar' ? createWoodenPillar() : object.kind === 'tomb' ? createWrecknaTomb() : createWoodenBox(); group.userData.objectKind = object.kind; objectGroups.set(object.id, group); scene.add(group); }
    if (object.kind === 'orkk-shield') group.userData.ownerId = object.ownerId;
    if (object.kind === 'spectre-replica') {
      group.userData.ownerId = object.ownerId;
      const owner = object.ownerId ? dummyGroups.get(object.ownerId) : undefined;
      if (!lastObjectVisualCells.has(object.id) && owner) group.rotation.y = owner.rotation.y;
    }
    let phylacteryAura = group.getObjectByName('PhylacteryAura') as THREE.Mesh | undefined;
    if (object.phylacteryType && !phylacteryAura) {
      const colors = { might: 0xff5d68, wisdom: 0x65cfff, ritual: 0xb178ff };
      phylacteryAura = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.035, 8, 40), new THREE.MeshBasicMaterial({ color: colors[object.phylacteryType], transparent: true, opacity: 0.82 }));
      phylacteryAura.name = 'PhylacteryAura'; phylacteryAura.rotation.x = Math.PI / 2; phylacteryAura.position.y = 0.18; group.add(phylacteryAura);
    } else if (!object.phylacteryType && phylacteryAura) group.remove(phylacteryAura);
    const target = worldPosition(object.position);
    if (object.kind === 'spectre-replica' && object.spectreOnBoxId) target.y += 1.22;
    const targetKey = cellLabel(object.position);
    const previousKey = lastObjectVisualCells.get(object.id);
    if (!previousKey) {
      if (object.kind === 'orkk-shield') settleOrkkShieldAtRest(group, object.ownerId, target);
      else group.position.copy(target);
    }
    else if (previousKey !== targetKey) {
      const from = group.position.clone(); from.y = target.y;
      const travelSquares = Math.max(1, distanceFromWorld(from, target));
      objectMovementAnimations.set(object.id, { from, to: target.clone(), startedAt: performance.now(), duration: 380 + travelSquares * 180, collided: false, dx: 0, dy: 0 });
    }
    else if (!objectMovementAnimations.has(object.id)) group.position.y = target.y;
    lastObjectVisualCells.set(object.id, targetKey);
    group.traverse((child) => { child.userData.objectId = object.id; });
  });
  gameState.objectPushAnimations.forEach((event) => {
    if (processedObjectPushAnimations.has(event.id)) return;
    if (event.healing) {
      processedObjectPushAnimations.add(event.id);
      spawnHealingVisual(event.healing.playerId, event.healing.amount);
      return;
    }
    if (event.damage) {
      processedObjectPushAnimations.add(event.id);
      const pendingDamage = { playerId: event.damage.playerId, amount: event.damage.amount, collision: event.damage.collision, triggerRouteProgress: event.damage.triggerRouteProgress };
      if (event.damage.triggerAnimationId) {
        pendingDamageVisuals.set(event.damage.triggerAnimationId, [...(pendingDamageVisuals.get(event.damage.triggerAnimationId) ?? []), pendingDamage]);
      } else spawnDamageVisual(event.damage.playerId, event.damage.amount, event.damage.collision);
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
    const reconstructedRecallShield = !group && event.removeOnComplete && event.equipPlayerId;
    if (reconstructedRecallShield) { group = createOrkkShieldObject(); objectGroups.set(event.objectId, group); scene.add(group); }
    if (!group) return;
    if (event.destroy && group.userData.objectKind === 'tomb' && !group.userData.debrisPrepared) {
      group.userData.debrisPrepared = true;
      const stone = new THREE.MeshStandardMaterial({ color: 0x59636b, roughness: 0.96 });
      const bone = new THREE.MeshStandardMaterial({ color: 0xc5cbbd, roughness: 0.88 });
      for (let index = 0; index < 14; index++) {
        const debris = new THREE.Mesh(index % 4 === 0 ? new THREE.CylinderGeometry(0.025, 0.04, 0.34, 6) : new THREE.BoxGeometry(0.12 + Math.random() * 0.2, 0.1 + Math.random() * 0.18, 0.1 + Math.random() * 0.2), index % 4 === 0 ? bone : stone);
        debris.name = 'TombDebris'; debris.position.set((Math.random() - 0.5) * 0.7, 0.3 + Math.random() * 1.7, (Math.random() - 0.5) * 0.35); debris.userData.origin = debris.position.clone(); debris.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 2.4, -0.25 - Math.random() * 0.55, (Math.random() - 0.5) * 2.4); debris.userData.arc = 0.45 + Math.random() * 0.8; debris.castShadow = true; group.add(debris);
      }
    }
    processedObjectPushAnimations.add(event.id);
    const logicalFrom = worldPosition(event.from); const logicalTo = worldPosition(event.to);
    if (event.attackAnimationPlayerId && !event.destroy) {
      const attacker = dummyGroups.get(event.attackAnimationPlayerId);
      if (attacker) {
        const dx = logicalFrom.x - attacker.position.x;
        const dz = logicalFrom.z - attacker.position.z;
        if (Math.abs(dx) + Math.abs(dz) > 0.0001) attacker.rotation.y = characterFacingRotation(attacker, dx, dz);
      }
      playOrkkOneShot(event.attackAnimationPlayerId, 'BoxAttack');
      return;
    }
    const isOrkkRecall = (event.id.includes('-arm-da-wiz-') || event.id.includes('-arcane-shield-') || event.id.includes('-shield-bash-') || event.id.includes('-mana-baryer-')) && Boolean(event.removeOnComplete && event.equipPlayerId);
    const recallOrkkGroup = isOrkkRecall && event.equipPlayerId ? dummyGroups.get(event.equipPlayerId) : undefined;
    if (recallOrkkGroup) {
      const approachCell = event.path && event.path.length > 1 ? event.path[event.path.length - 2] : event.from;
      const approach = worldPosition(approachCell);
      const dx = approach.x - recallOrkkGroup.position.x;
      const dz = approach.z - recallOrkkGroup.position.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) recallOrkkGroup.rotation.y = characterFacingRotation(recallOrkkGroup, dx, dz);
      recallOrkkGroup.updateWorldMatrix(true, true);
    }
    // A thrown Shield's root is offset from its logical cell so that the visible
    // mesh rests on the floor. Preserve that offset during Recall; snapping the
    // root back to the cell center can put the mesh beside or below the Board.
    const from = isOrkkRecall && !reconstructedRecallShield ? group.position.clone() : logicalFrom.clone();
    const recallRootOffset = from.clone().sub(logicalFrom);
    let to = isOrkkRecall ? logicalTo.clone().add(recallRootOffset) : logicalTo.clone();
    const recallSocket = isOrkkRecall && event.equipPlayerId
      ? recallOrkkGroup?.getObjectByName('Shield_Release_Socket')
      : undefined;
    let recallTargetQuaternion: THREE.Quaternion | undefined;
    if (recallSocket) {
      recallSocket.updateWorldMatrix(true, false);
      to = recallSocket.getWorldPosition(new THREE.Vector3());
      recallTargetQuaternion = recallSocket.getWorldQuaternion(new THREE.Quaternion());
    }
    if (event.parachute) {
      from.y += 12;
      const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.05, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf2d28b, roughness: .82, side: THREE.DoubleSide }));
      canopy.name = 'RespawnParachute'; canopy.position.y = 2.2; canopy.scale.y = .55; group.add(canopy);
    }
    group.position.copy(from);
    group.visible = true;
    if (isOrkkRecall && event.equipPlayerId) group.userData.ownerId = event.equipPlayerId;
    const visualDestination = event.collided && event.collisionAt ? event.collisionAt : event.to;
    const travelSquares = Math.max(1, distance(event.from, visualDestination));
    const ownerId = (group.userData.ownerId ?? event.equipPlayerId) as PlayerId | undefined;
    const orkkState = ownerId ? dummyGroups.get(ownerId)?.userData.orkkAnimation as OrkkAnimationState | undefined : undefined;
    const orkkGroup = ownerId ? dummyGroups.get(ownerId) : undefined;
    const shieldThrow = event.id.includes('-arkane-arow-') ? orkkGroup?.getObjectByName('Shield_Release_Socket') : undefined;
    const idleWorldQuaternion = shieldThrow && orkkState && orkkGroup
      ? orkkGroup.getWorldQuaternion(new THREE.Quaternion()).multiply(orkkState.shieldIdleSocketLocalQuaternion)
      : undefined;
    const boxAttacker = event.attackAnimationPlayerId ? dummyGroups.get(event.attackAnimationPlayerId) : undefined;
    let boxAttackDelay = 0;
    if (boxAttacker && event.destroy && event.attackAnimationPlayerId) {
      const dx = logicalFrom.x - boxAttacker.position.x;
      const dz = logicalFrom.z - boxAttacker.position.z;
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) boxAttacker.rotation.y = characterFacingRotation(boxAttacker, dx, dz);
      playOrkkOneShot(event.attackAnimationPlayerId, 'BoxAttack');
      // Base UUID keeps playing after impact. Only the Box destruction visual
      // begins at source frame 23 (the clip is authored at 24 fps).
      boxAttackDelay = (ORKK_BASE_ATTACK_IMPACT_FRAME / ORKK_BASE_ATTACK_FPS) * 1000 / ORKK_BASE_ATTACK_TIME_SCALE;
    }
    const duration = shieldThrow ? 110 + travelSquares * 72 : isOrkkRecall ? 210 + travelSquares * 115 : event.destroy ? 560 : event.parachute ? 2600 : 440 + (event.path?.length ?? travelSquares) * 190;
    const impactDamage = pendingDamageVisuals.get(event.id);
    pendingDamageVisuals.delete(event.id);
    const visualPath = event.path?.map((cell) => {
      if (isOrkkRecall && cell.x === event.to.x && cell.y === event.to.y) return to.clone();
      const point = worldPosition(cell);
      return isOrkkRecall ? point.add(recallRootOffset) : point;
    });
    objectMovementAnimations.set(event.objectId, { animationId: event.id, from, to, startedAt: performance.now(), delay: shieldThrow ? (orkkState?.shieldThrowReleaseMs ?? 1000) + 16 : isOrkkRecall ? 180 : boxAttackDelay, duration, collided: event.collided, dx: event.dx, dy: event.dy, path: visualPath, collisionAt: event.collisionAt ? worldPosition(event.collisionAt) : undefined, collisionTargetKind: event.collisionTargetKind, collisionTargetId: event.collisionTargetId, impactDamage, preserveQuaternion: isOrkkRecall ? group.quaternion.clone() : undefined, targetQuaternion: recallTargetQuaternion, removeOnComplete: event.removeOnComplete, destroy: event.destroy, baseScale: group.scale.clone(), equipPlayerId: event.equipPlayerId, parachute: event.parachute, releaseSource: shieldThrow, idleQuaternion: idleWorldQuaternion, landingShakeDuration: shieldThrow && !event.collided ? 320 : 0, collisionBounceDuration: shieldThrow && event.collided ? 230 : 0 });
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

function createHotPotatoModel() {
  const root = new THREE.Group();
  const potato = new THREE.Mesh(new THREE.SphereGeometry(.38, 18, 12), new THREE.MeshStandardMaterial({ color: 0x9a5528, roughness: .94 }));
  potato.scale.set(1.25, .82, .92); potato.position.y = .4; potato.rotation.z = -.2; potato.castShadow = true; root.add(potato);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x4d2818, roughness: 1 });
  for (const [x, y, z] of [[-.18, .53, .29], [.13, .33, .35], [.24, .55, .18]] as [number, number, number][]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), eyeMaterial); eye.position.set(x, y, z); root.add(eye);
  }
  return root;
}

function syncHotPotatoVisual() {
  const potato = (gameState as GameState & { questPhases?: { hotPotato?: { anchor: { x: number; y: number }; carrierId: PlayerId | null } | null } }).questPhases?.hotPotato;
  if (!potato || potato.carrierId) { hotPotatoModel?.removeFromParent(); return; }
  hotPotatoModel ??= createHotPotatoModel();
  if (hotPotatoModel.parent !== scene) scene.add(hotPotatoModel);
  hotPotatoModel.position.set((potato.anchor.x - (visualBoardWidth() + 1) / 2) * 1.92, .08, (potato.anchor.y - (visualBoardHeight() - 1) / 2) * 1.92);
  hotPotatoModel.rotation.y = performance.now() * .001;
}

function syncCaptureTheFlagVisual() {
  type VisualFlag = { id: string; ownerId: PlayerId; homeAnchor: { x: number; y: number }; status: 'home' | 'carried' | 'dropped' | 'captured'; carrierId: PlayerId | null; droppedAt: Cell | null };
  const capture = (gameState as GameState & { questPhases?: { captureTheFlag?: { flags: VisualFlag[] } | null } }).questPhases?.captureTheFlag;
  const flags = capture?.flags ?? [];
  const key = flags.length > 0 ? flags.map((flag) => `${flag.id}:${flag.status}:${flag.carrierId ?? ''}:${flag.droppedAt ? cellLabel(flag.droppedAt) : ''}`).join('|') : 'none';
  if (key !== questFlagVisualKey) {
    questFlagModels.forEach((model) => model.removeFromParent());
    questFlagModels.clear();
    for (const flag of flags) {
      const color = flag.ownerId === 'P1' ? 0x45c8ff : flag.ownerId === 'P2' ? 0xff5d68 : 0xa06cff;
      questFlagModels.set(flag.id, createQuestFlag(color));
    }
    questFlagVisualKey = key;
  }
  const carrierCounts = new Map<PlayerId, number>();
  for (const flag of flags) {
    const model = questFlagModels.get(flag.id);
    if (!model || flag.status === 'captured') { model?.removeFromParent(); continue; }
    if (flag.status === 'carried' && flag.carrierId) {
      const carrier = dummyGroups.get(flag.carrierId);
      if (!carrier) continue;
      const index = carrierCounts.get(flag.carrierId) ?? 0;
      carrierCounts.set(flag.carrierId, index + 1);
      if (model.parent !== carrier) carrier.add(model);
      model.position.set(index ? -.42 : .42, .72, .55);
      model.rotation.set(0, Math.PI, 0);
      model.scale.setScalar(.72);
      continue;
    }
    const location = flag.status === 'dropped' && flag.droppedAt ? flag.droppedAt : flag.homeAnchor;
    if (model.parent !== scene) scene.add(model);
    model.position.set((location.x - (visualBoardWidth() + 1) / 2) * 1.92, .08, (location.y - (visualBoardHeight() - 1) / 2) * 1.92);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(1);
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

function syncFearSigilVisual(group: THREE.Group, active: boolean) {
  let sigil = group.getObjectByName('SpectreFearSigil') as THREE.Group | undefined;
  if (!sigil) {
    sigil = new THREE.Group();
    sigil.name = 'SpectreFearSigil';
    const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x8c72ff, transparent: true, opacity: 0.82, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.035, 10, 64), glowMaterial);
    outerRing.name = 'FearSigilOuterRing';
    outerRing.rotation.x = Math.PI / 2;
    const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.018, 8, 48), glowMaterial.clone());
    innerRing.name = 'FearSigilInnerRing';
    innerRing.rotation.x = Math.PI / 2;
    sigil.add(outerRing, innerRing);
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const rune = new THREE.Mesh(index % 3 === 0 ? new THREE.TetrahedronGeometry(0.075, 0) : new THREE.BoxGeometry(0.12, 0.025, 0.045), glowMaterial.clone());
      rune.name = `FearRune${index}`;
      rune.position.set(Math.cos(angle) * 0.72, 0, Math.sin(angle) * 0.72);
      rune.rotation.y = -angle;
      sigil.add(rune);
    }
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), new THREE.MeshBasicMaterial({ color: 0xd9d0ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    core.name = 'FearSigilCore';
    core.scale.set(0.82, 0.42, 1);
    const light = new THREE.PointLight(0x765cff, 2.8, 3.6);
    light.name = 'FearSigilLight';
    sigil.add(core, light);
    group.add(sigil);
  }
  const character = group.userData.character as string | undefined;
  sigil.position.y = character === 'orkk' ? 3.35 : character === 'magician' ? 3.15 : character === 'wreckna' ? 2.9 : 2.7;
  sigil.visible = active;
}

function animateFearSigil(group: THREE.Group, time: number) {
  const sigil = group.getObjectByName('SpectreFearSigil') as THREE.Group | undefined;
  if (!sigil?.visible) return;
  sigil.rotation.y = time * 0.0011;
  const pulse = 1 + Math.sin(time * 0.006) * 0.09;
  sigil.scale.setScalar(pulse);
  const innerRing = sigil.getObjectByName('FearSigilInnerRing');
  if (innerRing) innerRing.rotation.z = -time * 0.0017;
  const light = sigil.getObjectByName('FearSigilLight') as THREE.PointLight | undefined;
  if (light) light.intensity = 2.5 + Math.sin(time * 0.009) * 0.8;
}

function distanceFromWorld(from: THREE.Vector3, to: THREE.Vector3) {
  return Math.max(Math.abs(from.x - to.x), Math.abs(from.z - to.z)) / 1.92;
}

function spectreAttackOriginForTarget(attacker: GameState['players'][PlayerId], target: Cell): 'spectre' | 'replica' | null {
  if (attacker.character !== 'spectre') return null;
  const candidates: Array<{ origin: 'spectre' | 'replica'; position: Cell; range: number }> = [
    { origin: 'spectre', position: attacker.position, range: effectiveAttackRange(gameState, attacker) },
    ...spectreReplicas(gameState, attacker.id).map((replica) => ({ origin: 'replica' as const, position: replica.position, range: 1 })),
  ];
  return candidates.find(({ position, range }) => distance(position, target) <= range && hasLineOfSight(gameState, position, target) && canAttackTargetSquare(gameState, position, target))?.origin ?? null;
}

function highlightCells() {
  const selected = selection.getSnapshot().context.selection;
  const movementPlayerId = gameState.phase === 'double-jump' ? gameState.doubleJump!.playerId
    : (gameState.phase as string) === 'choosing-yamato-move' ? (gameState as GameState & { yamato?: { defenderId: PlayerId } }).yamato?.defenderId ?? gameState.activePlayerId
    : gameState.activePlayerId;
  const actor = gameState.players[movementPlayerId];
  const activePlayer = gameState.players[gameState.activePlayerId];
  const selectedCard = (selected.kind === 'attack' || selected.kind === 'perk') ? activePlayer.hand.find((card) => card.instanceId === selected.cardInstanceId) : null;
  cellMeshes.forEach((mesh) => {
    const cell = mesh.userData.cell as Cell;
    const playerOnCell = Object.values(gameState.players).find((player) => player.position.x === cell.x && player.position.y === cell.y);
    const objectOnCell = gameState.objects.find((object) => object.position.x === cell.x && object.position.y === cell.y);
    const movableObjectOnCell = Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar';
    const occupiedByPlayer = Boolean(playerOnCell && playerOnCell.id !== actor.id);
    const occupiedByObject = Boolean(objectOnCell);
    const occupiedByEnemy = occupiedByPlayer || occupiedByObject;
    const specialSteps = gameState.phase === 'double-jump' ? (gameState.doubleJump?.stepsRemaining ?? 0) : (gameState.danceThrough?.stepsRemaining ?? 0);
    const diagonalBlocked = diagonalMovementBlockedByObject(gameState, actor.position, cell);
    const forbiddenSlideAscent = isForbiddenSlideAscent(gameState, actor.position, cell);
    const yamatoMoveValid = (gameState.phase as string) === 'choosing-yamato-move' && distance(actor.position, cell) === 1 && !occupiedByEnemy && !diagonalBlocked && !forbiddenSlideAscent;
    const danceValid = gameState.phase === 'dance-through' && distance(actor.position, cell) === 1 && !forbiddenSlideAscent && (!occupiedByEnemy || specialSteps > 1);
    const doubleJumpValid = gameState.phase === 'double-jump' && distance(actor.position, cell) === 1 && !diagonalBlocked && !forbiddenSlideAscent && (!occupiedByEnemy || specialSteps > 1);
    const shizzleStepValid = gameState.phase === 'shizzle-move' && distance(actor.position, cell) === 1 && !forbiddenSlideAscent && (!occupiedByObject || (gameState.shizzle?.stepsRemaining ?? 0) > 1) && (!occupiedByPlayer || (gameState.shizzle?.stepsRemaining ?? 0) > 1);
    const regularPath = movementPath(gameState, actor, cell);
    const regularDistance = movementCost(gameState, actor, regularPath);
    const swiftformPassSquare = occupiedByPlayer && actor.swiftformCanPassEnemies && regularDistance < actor.movementRemaining;
    const spiritPassSquare = (occupiedByPlayer || occupiedByObject) && actor.spiritForm && regularDistance <= actor.movementRemaining;
    const shadowBoxDestination = actor.character === 'spectre' && objectOnCell?.kind === 'wooden-box' && regularPath.length > 0 && isSpectreShadowTrailCell(gameState, actor, cell);
    const shadowTransitDestination = actor.character === 'spectre' && isSpectreShadowTrailCell(gameState, actor, cell) && (occupiedByPlayer || Boolean(objectOnCell && objectOnCell.kind !== 'wooden-box'));
    const currentWrecknaTomb = actor.wrecknaInsideTombId ? gameState.objects.find((object) => object.id === actor.wrecknaInsideTombId && object.kind === 'tomb') : null;
    const freeTombTransfer = actor.character === 'wreckna' && Boolean(currentWrecknaTomb) && objectOnCell?.kind === 'tomb' && objectOnCell.id !== currentWrecknaTomb!.id && distance(currentWrecknaTomb!.position, cell) === 1;
    const wrecknaTombEntry = actor.character === 'wreckna' && objectOnCell?.kind === 'tomb' && distance(actor.position, cell) === 1 && (actor.movementRemaining >= 2 || freeTombTransfer);
    const regularValid = gameState.phase !== 'dance-through' && gameState.phase !== 'double-jump' && (!occupiedByObject || spiritPassSquare || wrecknaTombEntry || shadowBoxDestination || shadowTransitDestination) && (!occupiedByPlayer || swiftformPassSquare || spiritPassSquare || shadowTransitDestination) && (freeTombTransfer || (regularPath.length >= 1 && (wrecknaTombEntry ? actor.movementRemaining >= 2 : regularDistance <= actor.movementRemaining)));
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
    const shadow = (gameState as any).spectreShadow as { casterId: PlayerId; originPosition?: Cell } | undefined;
    const shadowOrigin = shadow ? shadow.originPosition ?? gameState.players[shadow.casterId].position : null;
    const shadowDx = shadowOrigin ? cell.x - shadowOrigin.x : 0; const shadowDy = shadowOrigin ? cell.y - shadowOrigin.y : 0;
    const shadowDirectionValid = gameState.phase === 'choosing-arkane-arow-target' && Boolean(shadowOrigin) && (shadowDx !== 0 || shadowDy !== 0)
      && (shadowDx === 0 || shadowDy === 0 || Math.abs(shadowDx) === Math.abs(shadowDy));
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
    const shizzleClimbsSlide = shizzlePath.some((pathCell, index) => isForbiddenSlideAscent(gameState, index === 0 ? actor.position : shizzlePath[index - 1], pathCell));
    const shizzleDestinationValid = gameState.phase === 'choosing-shizzle-destination' && shizzleDistance >= 1 && shizzleDistance <= (shizzle?.stepsRemaining ?? 0) && shizzleLinear && !shizzleClimbsSlide && !occupiedByPlayer && !occupiedByObject;
    const boxTeleportValid = Boolean(selectedTestObjectId) && !occupiedByPlayer && !occupiedByObject;
    const guardianPending = (gameState as GameState & { spiritGuardian?: { casterId: PlayerId; level: number } | null }).spiritGuardian;
    const spectrePlacement = (gameState as any).spectreReplicaPlacement as { casterId: PlayerId; range: number; origin?: Cell } | undefined;
    const replacingOwnReplica = Boolean(spectrePlacement) && objectOnCell?.kind === 'spectre-replica' && objectOnCell.ownerId === spectrePlacement!.casterId;
    const guardianPlacementValid = gameState.phase === 'choosing-spirit-guardian-square' && !occupiedByPlayer && (!occupiedByObject || replacingOwnReplica) && (
      Boolean(guardianPending) && distance(gameState.players[guardianPending!.casterId].position, cell) <= effectiveAttackRange(gameState, gameState.players[guardianPending!.casterId])
      || Boolean(spectrePlacement) && distance(spectrePlacement!.origin ?? gameState.players[spectrePlacement!.casterId].position, cell) <= spectrePlacement!.range && hasReplicaPlacementLineOfSight(gameState, spectrePlacement!.origin ?? gameState.players[spectrePlacement!.casterId].position, cell, Boolean(gameState.players[spectrePlacement!.casterId].spectreOnBoxId) && !spectrePlacement!.origin)
    );
    const shadowBarter = (gameState as GameState & { shadowBarter?: { attackerId: PlayerId } | null }).shadowBarter;
    const shadowBarterTombValid = gameState.phase === 'choosing-shadow-barter-tomb-square' && Boolean(shadowBarter) && !occupiedByPlayer && !occupiedByObject
      && distance(gameState.players[shadowBarter!.attackerId].position, cell) === 1;
    const dakkoth = (gameState as GameState & { dakkoth?: { casterId: PlayerId } | null }).dakkoth;
    const dakkothCaster = dakkoth ? gameState.players[dakkoth.casterId] : null;
    const dakkothTombSquareValid = (gameState.phase as string) === 'choosing-dakkoth-tomb-square' && Boolean(dakkothCaster) && !occupiedByPlayer && !occupiedByObject
      && distance(dakkothCaster!.position, cell) <= effectiveAttackRange(gameState, dakkothCaster!);
    const attackableObject = Boolean(objectOnCell) && (selectedCard?.cardId === 'moonlight' || (objectOnCell!.kind !== 'wall-pillar' && objectOnCell!.kind !== 'orkk-shield'));
    const playerOnCellIsEntombed = Boolean(playerOnCell?.wrecknaInsideTombId && gameState.objects.some((object) => object.id === playerOnCell.wrecknaInsideTombId && object.kind === 'tomb'));
    const attackTargetReachable = activePlayer.character === 'spectre'
      ? Boolean(spectreAttackOriginForTarget(activePlayer, cell))
      : Boolean(selectedCard && attackCardTargetInRange(gameState, activePlayer, selectedCard.cardId, cell) && hasLineOfSight(gameState, activePlayer.position, cell) && canAttackTargetSquare(gameState, activePlayer.position, cell));
    const attackTargetValid = selected.kind === 'attack' && gameState.phase === 'active' && ((Boolean(playerOnCell) && playerOnCell!.id !== activePlayer.id && !playerOnCellIsEntombed) || (attackableObject && !(objectOnCell!.kind === 'spectre-replica' && objectOnCell!.ownerId === activePlayer.id)))
      && attackTargetReachable;
    const selectedPerkTargetValid = selected.kind === 'perk' && gameState.phase === 'active' && (
      (selectedCard?.cardId === 'force-throw' && movableObjectOnCell && distance(activePlayer.position, cell) <= 4)
      || (selectedCard?.cardId === 'force-pull' && ((Boolean(playerOnCell) && playerOnCell!.id !== activePlayer.id && hasLineOfSight(gameState, activePlayer.position, cell)) || movableObjectOnCell) && distance(activePlayer.position, cell) <= 3)
      || (selectedCard?.cardId === 'arkane-arow' && arkaneArowPath(gameState, activePlayer, cell, 3).length > 0)
      || (selectedCard?.cardId === 'kyk' && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && distance(activePlayer.position, cell) === 1)
    );
    const forceTargetValid = gameState.phase === 'choosing-force-throw-target' && Boolean(force) && distance(gameState.players[force!.casterId].position, cell) <= force!.targetRange
      && (movableObjectOnCell || (force!.level >= 3 && Boolean(playerOnCell) && playerOnCell!.id !== force!.casterId && hasLineOfSight(gameState, gameState.players[force!.casterId].position, cell)));
    const pullTargetValid = gameState.phase === 'choosing-force-pull-target' && Boolean(gameState.forcePull) && distance(gameState.players[gameState.forcePull!.casterId].position, cell) <= gameState.forcePull!.targetRange
      && (movableObjectOnCell || (Boolean(playerOnCell) && playerOnCell!.id !== gameState.forcePull!.casterId && hasLineOfSight(gameState, gameState.players[gameState.forcePull!.casterId].position, cell)));
    const magicTargetValid = gameState.phase === 'choosing-magic-hand-target' && Boolean(magic)
      && (magic!.level >= 2 || distance(gameState.players[magic!.casterId].position, cell) <= 5)
      && (movableObjectOnCell || (magic!.level >= 3 && Boolean(playerOnCell) && playerOnCell!.id !== magic!.casterId));
    const mindBlast = (gameState as typeof gameState & { mindBlast?: { casterId: PlayerId; level: number } | null }).mindBlast;
    const arcaneTargetValid = gameState.phase === 'choosing-arcane-missle-target' && Boolean(gameState.arcaneMissle) && Boolean(playerOnCell) && playerOnCell!.id !== gameState.arcaneMissle!.casterId
      && (mindBlast ? mindBlastCanTarget(gameState, gameState.players[mindBlast.casterId], playerOnCell!) : Boolean(arcaneMisslePath(gameState, gameState.players[gameState.arcaneMissle!.casterId], playerOnCell!, gameState.arcaneMissle!.level)));
    const chainTargetValid = gameState.phase === 'choosing-chain-lightning-target' && Boolean(gameState.chainLightning) && Boolean(playerOnCell) && playerOnCell!.id !== gameState.chainLightning!.casterId
      && distance(gameState.players[gameState.chainLightning!.casterId].position, cell) <= effectiveAttackRange(gameState, gameState.players[gameState.chainLightning!.casterId]) && hasLineOfSight(gameState, gameState.players[gameState.chainLightning!.casterId].position, cell);
    const fireball = (gameState as any).fireball as { casterId: PlayerId } | undefined;
    const fireballTargetValid = gameState.phase === 'choosing-fireball-target' && Boolean(fireball) && Boolean(playerOnCell) && playerOnCell!.id !== fireball!.casterId
      && distance(gameState.players[fireball!.casterId].position, cell) <= 3 && hasLineOfSight(gameState, gameState.players[fireball!.casterId].position, cell);
    const armTargetValid = gameState.phase === 'choosing-arm-da-wiz-target' && Boolean(gameState.armDaWiz) && objectOnCell?.kind === 'orkk-shield' && objectOnCell.ownerId === gameState.armDaWiz!.casterId;
    const testPhylacteryPending = (gameState as GameState & { testPhylactery?: { casterId: PlayerId; sacrificeEnemyId?: PlayerId } | null }).testPhylactery;
    const testPhylacteryCaster = testPhylacteryPending ? gameState.players[testPhylacteryPending.casterId] : null;
    const testPhylacteryTargetValid = gameState.phase === 'choosing-test-phylactery-target' && Boolean(testPhylacteryCaster) && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && objectOnCell!.kind !== 'spirit-guardian'
      && wrecknaPerkTargetInRange(gameState, testPhylacteryCaster!, cell);
    const lichdom = (gameState as GameState & { lichdom?: { casterId: PlayerId } | null }).lichdom;
    const lichdomCaster = lichdom ? gameState.players[lichdom.casterId] : null;
    const lichdomTargetValid = gameState.phase === 'choosing-lichdom-target' && Boolean(lichdomCaster) && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && objectOnCell!.kind !== 'spirit-guardian' && wrecknaPerkTargetInRange(gameState, lichdomCaster!, cell);
    const dakkothTombSacrificeValid = (gameState.phase as string) === 'choosing-dakkoth-tomb-sacrifice' && Boolean(dakkothCaster) && objectOnCell?.kind === 'tomb' && objectOnCell.ownerId === dakkoth?.casterId && wrecknaPerkTargetInRange(gameState, dakkothCaster!, cell);
    const dakkothPhylacteryTargetValid = (gameState.phase as string) === 'choosing-dakkoth-phylactery-target' && Boolean(dakkothCaster) && Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar' && objectOnCell!.kind !== 'spirit-guardian' && wrecknaPerkTargetInRange(gameState, dakkothCaster!, cell);
    const necronomicon = (gameState as GameState & { necronomicon?: { casterId: PlayerId } | null }).necronomicon;
    const necronomiconCaster = necronomicon ? gameState.players[necronomicon.casterId] : null;
    const necronomiconTombTargetValid = (gameState.phase as string) === 'choosing-necronomicon-tomb' && Boolean(necronomiconCaster) && objectOnCell?.kind === 'tomb' && !objectOnCell.phylacteryType && wrecknaPerkTargetInRange(gameState, necronomiconCaster!, cell);
    const sap = (gameState as GameState & { sap?: { casterId: PlayerId } | null }).sap;
    const sapCaster = sap ? gameState.players[sap.casterId] : null;
    const sapTargetValid = (gameState.phase as string) === 'choosing-sap-target' && Boolean(sapCaster) && Boolean(playerOnCell) && playerOnCell!.id !== sap!.casterId
      && canLocalAct(sap!.casterId) && wrecknaPerkTargetInRange(gameState, sapCaster!, cell);
    const decay = (gameState as GameState & { decay?: { casterId: PlayerId } | null }).decay;
    const decayCaster = decay ? gameState.players[decay.casterId] : null;
    const decayTargetValid = (gameState.phase as string) === 'choosing-decay-target' && Boolean(decayCaster) && Boolean(playerOnCell) && playerOnCell!.id !== decay!.casterId
      && canLocalAct(decay!.casterId) && wrecknaPerkTargetInRange(gameState, decayCaster!, cell);
    const kykTargetValid = gameState.phase === 'choosing-kyk-target' && Boolean(force) && ((Boolean(objectOnCell) && objectOnCell!.kind !== 'wall-pillar') || (Boolean(playerOnCell) && playerOnCell!.id !== force!.casterId)) && distance(gameState.players[force!.casterId].position, cell) === 1;
    const targetSquareValid = attackTargetValid || selectedPerkTargetValid || forceTargetValid || pullTargetValid || magicTargetValid || arcaneTargetValid || chainTargetValid || fireballTargetValid || armTargetValid || testPhylacteryTargetValid || lichdomTargetValid || dakkothTombSacrificeValid || dakkothPhylacteryTargetValid || necronomiconTombTargetValid || sapTargetValid || decayTargetValid || kykTargetValid;
    const valid = yamatoMoveValid || (selected.kind === 'move' && (danceValid || doubleJumpValid || shizzleStepValid || regularValid)) || forceDirectionValid || magicDirectionValid || kykDirectionValid || arkaneValid || shadowDirectionValid || preparationValid || shizzleDestinationValid || boxTeleportValid || guardianPlacementValid || shadowBarterTombValid || dakkothTombSquareValid || targetSquareValid;
    const material = mesh.material as THREE.MeshStandardMaterial;
    material.emissive.set(forceCollisionWarning ? 0xff2638 : guardianPlacementValid || shadowBarterTombValid || dakkothTombSquareValid ? 0xffd45a : targetSquareValid ? 0xffb52e : kykDirectionValid ? 0xffb52e : arkaneValid || shadowDirectionValid ? 0xffb52e : boxTeleportValid ? 0x45c8ff : valid ? 0x19d3a2 : 0x000000); material.emissiveIntensity = forceCollisionWarning ? 0.9 : guardianPlacementValid || shadowBarterTombValid || dakkothTombSquareValid ? 0.72 : targetSquareValid ? 0.68 : kykDirectionValid ? 0.7 : arkaneValid || shadowDirectionValid ? 0.62 : boxTeleportValid ? 0.7 : valid ? 0.38 : 0;
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
  const testPhylactery = (gameState as GameState & { testPhylactery?: { casterId: PlayerId } | null }).testPhylactery;
  const canTestPhylacteryTarget = gameState.phase === 'choosing-test-phylactery-target' && Boolean(testPhylactery) && canLocalAct(testPhylactery!.casterId);
  const wrecknaObjectTargeting = (() => {
    const extended = gameState as GameState & {
      lichdom?: { casterId: PlayerId } | null;
      dakkoth?: { casterId: PlayerId } | null;
      necronomicon?: { casterId: PlayerId } | null;
    };
    if (gameState.phase === 'choosing-lichdom-target') return extended.lichdom ?? null;
    if ((gameState.phase as string).startsWith('choosing-dakkoth-') && (gameState.phase as string) !== 'choosing-dakkoth-tomb-square') return extended.dakkoth ?? null;
    if ((gameState.phase as string) === 'choosing-necronomicon-tomb') return extended.necronomicon ?? null;
    return null;
  })();
  const canKykTarget = gameState.phase === 'choosing-kyk-target' && Boolean(gameState.forceThrow) && canLocalAct(gameState.forceThrow!.casterId);
  const arcane = gameState.arcaneMissle;
  const mindBlast = (gameState as typeof gameState & { mindBlast?: { casterId: PlayerId; level: number } | null }).mindBlast;
  const canArcaneTarget = gameState.phase === 'choosing-arcane-missle-target' && Boolean(arcane) && canLocalAct(arcane!.casterId);
  const chain = gameState.chainLightning;
  const canChainTarget = gameState.phase === 'choosing-chain-lightning-target' && Boolean(chain) && canLocalAct(chain!.casterId);
  const magic = gameState.magicHand;
  const canMagicTarget = gameState.phase === 'choosing-magic-hand-target' && Boolean(magic) && canLocalAct(magic!.casterId);
  const shadow = (gameState as any).spectreShadow as { casterId: PlayerId } | undefined;
  const canShadowDirection = gameState.phase === 'choosing-arkane-arow-target' && Boolean(shadow) && canLocalAct(shadow!.casterId);
  const spectreOriginChoice = (gameState as any).spectrePerkOrigin as { casterId: PlayerId; perkId: 'shadow-dagger' | 'relocate' | 'devour'; origin: 'spectre' | 'replica'; replicaId: string | null } | undefined;
  const canSpectreOriginChoice = gameState.phase === 'choosing-spectre-perk-origin' && Boolean(spectreOriginChoice) && canLocalAct(spectreOriginChoice!.casterId);
  const sap = (gameState as GameState & { sap?: { casterId: PlayerId } | null }).sap;
  const canSapTarget = (gameState.phase as string) === 'choosing-sap-target' && Boolean(sap) && canLocalAct(sap!.casterId);
  const decay = (gameState as GameState & { decay?: { casterId: PlayerId } | null }).decay;
  const canDecayTarget = (gameState.phase as string) === 'choosing-decay-target' && Boolean(decay) && canLocalAct(decay!.casterId);
  dummyGroups.forEach((group, playerId) => {
    const target = gameState.players[playerId];
    const targetIsEntombed = Boolean(target.wrecknaInsideTombId && gameState.objects.some((object) => object.id === target.wrecknaInsideTombId && object.kind === 'tomb'));
    const attackTargetReachable = attacker.character === 'spectre'
      ? Boolean(spectreAttackOriginForTarget(attacker, target.position))
      : Boolean(selectedAttack) && attackCardTargetInRange(gameState, attacker, selectedAttack!.cardId, target.position) && hasLineOfSight(gameState, attacker.position, target.position) && canAttackTargetSquare(gameState, attacker.position, target.position);
    const validAttack = canTarget && playerId !== attacker.id && !targetIsEntombed && attackTargetReachable;
    const pullCaster = pull ? gameState.players[pull.casterId] : null;
    const validPull = canPullTarget && playerId !== pull!.casterId && distance(pullCaster!.position, target.position) <= pull!.targetRange && hasLineOfSight(gameState, pullCaster!.position, target.position);
    const validArcane = canArcaneTarget && playerId !== arcane!.casterId && (mindBlast ? mindBlastCanTarget(gameState, gameState.players[mindBlast.casterId], target) : Boolean(arcaneMisslePath(gameState, gameState.players[arcane!.casterId], target, arcane!.level)));
    const chainCaster = chain ? gameState.players[chain.casterId] : null;
    const validChain = canChainTarget && playerId !== chain!.casterId && distance(chainCaster!.position, target.position) <= effectiveAttackRange(gameState, chainCaster!) && hasLineOfSight(gameState, chainCaster!.position, target.position);
    const magicCaster = magic ? gameState.players[magic.casterId] : null;
    const validMagic = canMagicTarget && magic!.level >= 3 && playerId !== magic!.casterId && distance(magicCaster!.position, target.position) <= magicCaster!.attackRange && hasLineOfSight(gameState, magicCaster!.position, target.position);
    const sapCaster = sap ? gameState.players[sap.casterId] : null;
    const validSap = canSapTarget && playerId !== sap!.casterId && wrecknaPerkTargetInRange(gameState, sapCaster!, target.position);
    const decayCaster = decay ? gameState.players[decay.casterId] : null;
    const validDecay = canDecayTarget && playerId !== decay!.casterId && wrecknaPerkTargetInRange(gameState, decayCaster!, target.position);
    const validSpectreOrigin = canSpectreOriginChoice && spectreOriginChoice!.perkId === 'shadow-dagger' && playerId === spectreOriginChoice!.casterId;
    const valid = validAttack || validPull || validArcane || validChain || validMagic || validSap || validDecay || validSpectreOrigin;
    const ring = group.getObjectByName('TargetRing') as THREE.Mesh | undefined;
    if (!ring) return;
    ring.visible = valid;
    if (valid) {
      const pulse = 1 + Math.sin(time * 0.006) * 0.08;
      ring.scale.setScalar(pulse);
      const selectedSpectreOrigin = validSpectreOrigin && spectreOriginChoice!.origin === 'spectre';
      (ring.material as THREE.MeshBasicMaterial).opacity = validSpectreOrigin ? (selectedSpectreOrigin ? 0.96 : 0.34) : 0.68 + Math.sin(time * 0.006) * 0.22;
    }
  });
  objectGroups.forEach((group, objectId) => {
    const object = gameState.objects.find((entry) => entry.id === objectId);
    const attackObjectReachable = object && (attacker.character === 'spectre'
      ? Boolean(spectreAttackOriginForTarget(attacker, object.position))
      : Boolean(selectedAttack) && attackCardTargetInRange(gameState, attacker, selectedAttack!.cardId, object.position) && hasLineOfSight(gameState, attacker.position, object.position) && canAttackTargetSquare(gameState, attacker.position, object.position));
    const validAttackObject = canTarget && Boolean(object) && (selectedAttack?.cardId === 'moonlight' || (object!.kind !== 'wall-pillar' && object!.kind !== 'orkk-shield'))
      && !(object!.kind === 'spectre-replica' && object!.ownerId === attacker.id) && Boolean(attackObjectReachable);
    const validShield = canArmTarget && object?.kind === 'orkk-shield' && object.ownerId === gameState.armDaWiz!.casterId;
    const testPhylacteryCaster = testPhylactery ? gameState.players[testPhylactery.casterId] : null;
    const validTestPhylacteryObject = canTestPhylacteryTarget && Boolean(testPhylacteryCaster) && Boolean(object) && object!.kind !== 'wall-pillar' && object!.kind !== 'spirit-guardian' && wrecknaPerkTargetInRange(gameState, testPhylacteryCaster!, object!.position);
    const wrecknaObjectCaster = wrecknaObjectTargeting ? gameState.players[wrecknaObjectTargeting.casterId] : null;
    const validWrecknaObject = Boolean(object && wrecknaObjectCaster && canLocalAct(wrecknaObjectCaster.id) && wrecknaPerkTargetInRange(gameState, wrecknaObjectCaster, object.position) && (
      (gameState.phase === 'choosing-lichdom-target' && object.kind !== 'wall-pillar' && object.kind !== 'spirit-guardian')
      || ((gameState.phase as string) === 'choosing-dakkoth-tomb-sacrifice' && object.kind === 'tomb' && object.ownerId === wrecknaObjectCaster.id)
      || ((gameState.phase as string) === 'choosing-dakkoth-phylactery-target' && object.kind !== 'wall-pillar' && object.kind !== 'spirit-guardian')
      || ((gameState.phase as string) === 'choosing-necronomicon-tomb' && object.kind === 'tomb' && !object.phylacteryType)
    ));
    const validKykObject = canKykTarget && Boolean(object) && object!.kind !== 'wall-pillar' && distance(object!.position, gameState.players[gameState.forceThrow!.casterId].position) === 1;
    const validMagicObject = canMagicTarget && Boolean(object) && object!.kind !== 'wall-pillar' && distance(object!.position, gameState.players[magic!.casterId].position) <= gameState.players[magic!.casterId].attackRange && hasLineOfSight(gameState, gameState.players[magic!.casterId].position, object!.position);
    const validSpectreOriginObject = canSpectreOriginChoice && object?.kind === 'spectre-replica' && object.ownerId === spectreOriginChoice!.casterId;
    const selectedSpectreOriginObject = validSpectreOriginObject && spectreOriginChoice!.origin === 'replica' && spectreOriginChoice!.replicaId === objectId;
    const originRing = group.getObjectByName('TargetRing') as THREE.Mesh | undefined;
    if (originRing) {
      originRing.visible = validSpectreOriginObject;
      if (validSpectreOriginObject) {
        (originRing.material as THREE.MeshBasicMaterial).opacity = selectedSpectreOriginObject ? 0.96 : 0.34;
        originRing.scale.setScalar(selectedSpectreOriginObject ? 1 + Math.sin(time * 0.006) * 0.08 : 1);
      }
    }
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
      child.material.emissive.set(validSpectreOriginObject ? 0x8b5cff : validAttackObject || validShield || validTestPhylacteryObject || validWrecknaObject || validKykObject || validMagicObject ? 0xffb52e : 0x000000);
      child.material.emissiveIntensity = validSpectreOriginObject ? (selectedSpectreOriginObject ? 0.8 : 0.25) : validAttackObject || validShield || validTestPhylacteryObject || validWrecknaObject || validKykObject || validMagicObject ? 0.55 : 0;
    });
  });
  renderer.domElement.style.cursor = cameraGrab ? 'grabbing' : canTarget || canPullTarget || canArmTarget || canTestPhylacteryTarget || canKykTarget || canArcaneTarget || canChainTarget || canMagicTarget || canShadowDirection || canSpectreOriginChoice || canSapTarget || canDecayTarget ? 'crosshair' : 'grab';
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
  } else if (gameState.phase === 'choosing-spectre-perk-origin') {
    const pending = (gameState as any).spectrePerkOrigin as { casterId: PlayerId; perkId: 'shadow-dagger' | 'relocate' | 'devour' } | undefined;
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const object = gameState.objects.find((entry) => entry.id === objectHit);
    if (pending?.perkId === 'shadow-dagger' && playerHit === pending.casterId) dispatch({ type: 'spectre-perk-origin-select', playerId: pending.casterId, origin: 'spectre', replicaId: null });
    else if (pending && object?.kind === 'spectre-replica' && object.ownerId === pending.casterId) dispatch({ type: 'spectre-perk-origin-select', playerId: pending.casterId, origin: 'replica', replicaId: object.id });
  } else if ((gameState.phase as string) === 'choosing-yamato-move') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    const yamato = (gameState as GameState & { yamato?: { defenderId: PlayerId } }).yamato;
    if (cellHit && yamato) dispatch({ type: 'yamato-move', playerId: yamato.defenderId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-base-placement') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'place-character', playerId: gameState.activePlayerId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-spirit-guardian-square') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    const spectrePlacement = (gameState as any).spectreReplicaPlacement as { casterId: PlayerId } | undefined;
    const guardian = (gameState as GameState & { spiritGuardian?: { casterId: PlayerId } }).spiritGuardian;
    if (cellHit && spectrePlacement) dispatch({ type: 'spectre-replica-square', playerId: spectrePlacement.casterId, to: cellHit.object.userData.cell });
    else if (cellHit && guardian) dispatch({ type: 'spirit-guardian-square', playerId: guardian.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-shadow-barter-tomb-square') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    const shadowBarter = (gameState as GameState & { shadowBarter?: { attackerId: PlayerId } | null }).shadowBarter;
    if (cellHit && shadowBarter) dispatch({ type: 'shadow-barter-tomb-square', playerId: shadowBarter.attackerId, to: cellHit.object.userData.cell });
  } else if ((gameState.phase as string) === 'choosing-dakkoth-tomb-square') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    const dakkoth = (gameState as GameState & { dakkoth?: { casterId: PlayerId } | null }).dakkoth;
    if (cellHit && dakkoth) dispatch({ type: 'dakkoth-tomb-square', playerId: dakkoth.casterId, to: cellHit.object.userData.cell });
  } else if ((gameState.phase as string) === 'choosing-dakkoth-tomb-sacrifice') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const dakkoth = (gameState as GameState & { dakkoth?: { casterId: PlayerId } | null }).dakkoth;
    if (objectHit && dakkoth) dispatch({ type: 'dakkoth-tomb-sacrifice', playerId: dakkoth.casterId, objectId: objectHit });
  } else if ((gameState.phase as string) === 'choosing-dakkoth-phylactery-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const dakkoth = (gameState as GameState & { dakkoth?: { casterId: PlayerId } | null }).dakkoth;
    if (objectHit && dakkoth) dispatch({ type: 'dakkoth-phylactery-target', playerId: dakkoth.casterId, objectId: objectHit });
  } else if ((gameState.phase as string) === 'choosing-necronomicon-tomb') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const necronomicon = (gameState as GameState & { necronomicon?: { casterId: PlayerId } | null }).necronomicon;
    if (objectHit && necronomicon) dispatch({ type: 'necronomicon-tomb-target', playerId: necronomicon.casterId, objectId: objectHit });
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
  } else if ((gameState.phase as string) === 'choosing-sap-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const sap = (gameState as GameState & { sap?: { casterId: PlayerId } | null }).sap;
    if (playerHit && sap && playerHit !== sap.casterId) dispatch({ type: 'sap-target', playerId: sap.casterId, targetId: playerHit });
  } else if ((gameState.phase as string) === 'choosing-decay-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const decay = (gameState as GameState & { decay?: { casterId: PlayerId } | null }).decay;
    if (playerHit && decay && playerHit !== decay.casterId) dispatch({ type: 'decay-target', playerId: decay.casterId, targetId: playerHit });
  } else if (gameState.phase === 'choosing-magic-hand-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'magic-hand-target', playerId: gameState.magicHand!.casterId, targetKind: 'object', targetId: objectHit });
    else if (playerHit && playerHit !== gameState.magicHand!.casterId) dispatch({ type: 'magic-hand-target', playerId: gameState.magicHand!.casterId, targetKind: 'player', targetId: playerHit });
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
    const shadow = (gameState as any).spectreShadow as { casterId: PlayerId } | undefined;
    if (cellHit && shadow) dispatch({ type: 'spectre-shadow-direction', playerId: shadow.casterId, to: cellHit.object.userData.cell });
    else if (cellHit) dispatch({ type: 'arkane-arow-target', playerId: gameState.arkaneArow!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-arm-da-wiz-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    if (objectHit) dispatch({ type: 'arm-da-wiz-target', playerId: gameState.armDaWiz!.casterId, objectId: objectHit });
  } else if (gameState.phase === 'choosing-test-phylactery-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const pending = (gameState as GameState & { testPhylactery?: { casterId: PlayerId } | null }).testPhylactery;
    if (objectHit && pending) dispatch({ type: 'test-phylactery-target', playerId: pending.casterId, objectId: objectHit });
  } else if (gameState.phase === 'choosing-lichdom-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const pending = (gameState as GameState & { lichdom?: { casterId: PlayerId } | null }).lichdom;
    if (objectHit && pending) dispatch({ type: 'lichdom-target', playerId: pending.casterId, objectId: objectHit });
  } else if (gameState.phase === 'choosing-kyk-target') {
    const objectHit = hits.find((hit) => hit.object.userData.objectId)?.object.userData.objectId as string | undefined;
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (objectHit || playerHit) dispatch({ type: 'kyk-target', playerId: gameState.forceThrow!.casterId, objectId: objectHit ?? playerHit! });
  } else if (gameState.phase === 'choosing-kyk-direction') {
    const cellHit = hits.find((hit) => hit.object.userData.cell);
    if (cellHit) dispatch({ type: 'kyk-direction', playerId: gameState.forceThrow!.casterId, to: cellHit.object.userData.cell });
  } else if (gameState.phase === 'choosing-boomerang-target') {
    const playerHit = hits.find((hit) => hit.object.userData.playerId)?.object.userData.playerId as PlayerId | undefined;
    if (playerHit) {
      const casterId = gameState.boomerang!.casterId;
      const caster = gameState.players[casterId];
      const target = gameState.players[playerHit];
      const meleeUse = playerHit !== casterId && Boolean(target) && distance(caster.position, target.position) === 1;
      if (!meleeUse || window.confirm('Are you sure? Using Boomerang at melee Range spends 1 Action, deals 2 Damage, and Removes the Card.')) {
        dispatch({ type: 'boomerang-target', playerId: casterId, targetId: playerHit });
      }
    }
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
    const attacker = gameState.players[gameState.activePlayerId];
    const selectedAttackCard = attacker.hand.find((card) => card.instanceId === selected.cardInstanceId);
    const hitObject = gameState.objects.find((entry) => entry.id === objectHit);
    const entombedPlayer = playerHit ? gameState.players[playerHit] : undefined;
    const occupiedTomb = entombedPlayer?.wrecknaInsideTombId
      ? gameState.objects.find((object) => object.id === entombedPlayer.wrecknaInsideTombId && object.kind === 'tomb')
      : undefined;
    if (playerHit === attacker.id && attacker.character === 'spectre') {
      selectedSpectreAttackOrigin = 'spectre';
      notify('Attack origin: Spectre. Now select an enemy body.');
      renderUI();
    } else if (hitObject?.kind === 'spectre-replica' && hitObject.ownerId === attacker.id && attacker.character === 'spectre') {
      selectedSpectreAttackOrigin = 'replica';
      notify('Attack origin: Replica. Now select an enemy body.');
      renderUI();
    } else if (occupiedTomb) {
      if (attacker.character === 'spectre') {
        const origin = spectreAttackOriginForTarget(attacker, occupiedTomb.position);
        if (origin) { selectedSpectreAttackOrigin = origin; dispatch({ type: 'spectre-attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, origin, targetId: occupiedTomb.id, targetKind: 'object' }); }
      } else dispatch({ type: 'attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, targetId: occupiedTomb.id, targetKind: 'object' });
    } else if (playerHit && attacker.character === 'spectre') {
      const origin = spectreAttackOriginForTarget(attacker, gameState.players[playerHit].position);
      if (origin) { selectedSpectreAttackOrigin = origin; dispatch({ type: 'spectre-attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, origin, targetId: playerHit, targetKind: 'player' }); }
    }
    else if (hitObject?.kind === 'spectre-replica' && hitObject.ownerId !== attacker.id) {
      const origin = attacker.character === 'spectre' ? spectreAttackOriginForTarget(attacker, hitObject.position) : 'spectre';
      if (origin) { if (attacker.character === 'spectre') selectedSpectreAttackOrigin = origin; dispatch({ type: 'spectre-attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, origin, targetId: hitObject.id, targetKind: 'replica' }); }
    }
    else if (playerHit) {
      const swapBeforeCombat = selectedAttackCard?.cardId === 'lightbringer'
        && window.confirm(`Lightbringer: swap places with ${gameState.players[playerHit].name} before combat?\n\nOK: swap places.\nCancel: attack without swapping.`);
      dispatch({ type: 'attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, targetId: playerHit, targetKind: 'player', swapBeforeCombat });
    }
    else if (objectHit) {
      const object = hitObject;
      const moonlightCanTargetWall = selectedAttackCard?.cardId === 'moonlight';
      const normallyAttackable = object?.kind !== 'wall-pillar' && object?.kind !== 'orkk-shield';
      const confirmation = moonlightCanTargetWall && object && (object.kind === 'wall-pillar' || object.kind === 'orkk-shield')
        ? `Attack ${object.name} at ${cellLabel(object.position)} with Moonlight? The Wall Object survives the direct hit and the moonwave forms behind it.`
        : object ? `Attack ${object.name} at ${cellLabel(object.position)}? A destructible Object is destroyed by the Attack Card.` : '';
      if (object && (normallyAttackable || moonlightCanTargetWall) && window.confirm(confirmation)) {
        if (attacker.character === 'spectre') {
          const origin = spectreAttackOriginForTarget(attacker, object.position);
          if (origin) { selectedSpectreAttackOrigin = origin; dispatch({ type: 'spectre-attack', playerId: attacker.id, cardInstanceId: selected.cardInstanceId, origin, targetId: objectHit, targetKind: 'object' }); }
        }
        else dispatch({ type: 'attack', playerId: gameState.activePlayerId, cardInstanceId: selected.cardInstanceId, targetId: objectHit, targetKind: 'object' });
      }
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

let browserCharacter: SelectableCharacter = CHARACTER_BROWSER_ORDER[0];
let browserPerkIndex = 0;
let browserCardKind: 'attack' | 'defend' | 'perk' = 'attack';
let characterPreviewRenderer: THREE.WebGLRenderer | null = null;
let characterPreviewScene: THREE.Scene | null = null;
let characterPreviewCamera: THREE.PerspectiveCamera | null = null;
let characterPreviewControls: OrbitControls | null = null;
let characterPreviewModel: THREE.Group | null = null;
const characterPreviewModels = new Map<SelectableCharacter, THREE.Group>();

function initializeCharacterBrowser() {
  const tabs = byId('characterBrowserTabs');
  tabs.innerHTML = CHARACTER_BROWSER_ORDER.map((character) => `<button type="button" data-browser-character="${character}">${escapeHtml(CHARACTER_SELECT_INFO[character].name)}</button>`).join('');
  tabs.querySelectorAll<HTMLButtonElement>('[data-browser-character]').forEach((button) => button.addEventListener('click', () => selectBrowserCharacter(button.dataset.browserCharacter as SelectableCharacter)));
  byId('characterCardCategories').querySelectorAll<HTMLButtonElement>('[data-browser-card-kind]').forEach((button) => button.addEventListener('click', () => {
    browserCardKind = button.dataset.browserCardKind as typeof browserCardKind;
    browserPerkIndex = 0;
    renderCharacterBrowserCards();
  }));
  byId('previousPerk').addEventListener('click', () => showBrowserPerk(browserPerkIndex - 1));
  byId('nextPerk').addEventListener('click', () => showBrowserPerk(browserPerkIndex + 1));
  const perkTrack = byId('perkBrowserTrack');
  perkTrack.addEventListener('scroll', () => {
    const cards = perkTrack.querySelectorAll<HTMLElement>('.character-perk-card');
    if (!cards.length) return;
    const firstOffset = cards[0].offsetLeft;
    const nearest = [...cards].reduce((best, card, index) => Math.abs(card.offsetLeft - firstOffset - perkTrack.scrollLeft) < Math.abs(cards[best].offsetLeft - firstOffset - perkTrack.scrollLeft) ? index : best, 0);
    if (nearest !== browserPerkIndex) { browserPerkIndex = nearest; updatePerkBrowserControls(); }
  }, { passive: true });
  perkTrack.addEventListener('wheel', (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || perkTrack.scrollWidth <= perkTrack.clientWidth) return;
    event.preventDefault();
    perkTrack.scrollLeft += event.deltaY;
  }, { passive: false });
  setupCharacterPreview();
  selectBrowserCharacter(browserCharacter);
}

function selectBrowserCharacter(character: SelectableCharacter) {
  browserCharacter = character;
  browserPerkIndex = 0;
  browserCardKind = 'attack';
  document.querySelectorAll<HTMLButtonElement>('[data-browser-character]').forEach((button) => {
    const active = button.dataset.browserCharacter === character;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'true' : 'false');
  });
  renderCharacterBrowserProfile();
  renderCharacterBrowserCards();
  showCharacterPreviewModel(character);
}

function renderCharacterBrowserProfile() {
  const info = CHARACTER_SELECT_INFO[browserCharacter];
  byId('characterBrowserProfile').innerHTML = `<span>${escapeHtml(CHARACTER_BROWSER_TITLES[browserCharacter])}</span><h3>${escapeHtml(info.name)}</h3><small>Playable character</small><div class="character-browser-stats"><span><b>${info.hp}</b>MAX HP</span><span><b>${info.movement}</b>MOV</span><span><b>${info.attackRange}</b>ATT RANGE</span></div><section class="character-browser-trait"><header><span>${escapeHtml(info.traitIcon)}</span><div><small>CHARACTER TRAIT</small><strong>${escapeHtml(info.trait)}</strong></div></header><p>${escapeHtml(info.traitDescription)}</p></section>`;
}

function characterBrowserCards(character: SelectableCharacter, kind: typeof browserCardKind) {
  const definition = STARTING_DECKS[character];
  const ids = [...definition.defaults, ...definition.attackFocus, ...definition.defendFocus, ...definition.perkPhase];
  const available = new Set<CardTypeId>(ids);
  return CARDS.filter((card) => available.has(card.id) && card.kind === kind);
}

function renderCharacterBrowserCards() {
  const cards = characterBrowserCards(browserCharacter, browserCardKind);
  byId('characterCardCategories').querySelectorAll<HTMLButtonElement>('[data-browser-card-kind]').forEach((button) => button.classList.toggle('active', button.dataset.browserCardKind === browserCardKind));
  byId('perkBrowserTrack').innerHTML = cards.map((card, index) => {
    const levels = 'levelEffects' in card && card.levelEffects ? card.levelEffects : [];
    const effectText = 'effectText' in card && card.effectText ? card.effectText : '';
    const levelCopy = levels.length ? levels.map((description, level) => `<p><b>LV ${level + 1}</b><span>${escapeHtml(description)}</span></p>`).join('') : '<p class="character-perk-empty">This Perk has a single direct effect.</p>';
    const typeCopy = card.kind === 'attack' ? 'ACTION · ATTACK CARD' : card.kind === 'defend' ? 'REACTION · BLOCK CARD' : 'ACTION: PERK · ONCE PER TURN';
    const valueCopy = card.kind === 'attack' ? 'ATTACK VALUE' : card.kind === 'defend' ? 'BLOCK VALUE' : 'PERK VALUE';
    const rules = card.kind === 'perk' ? `<div class="character-perk-levels">${levelCopy}</div>${effectText ? `<p class="character-perk-extra">${escapeHtml(effectText)}</p>` : ''}` : `<p class="character-perk-extra character-card-description">${escapeHtml(effectText || 'No additional effect.')}</p>`;
    return `<article class="character-perk-card ${card.kind}" data-browser-perk="${index}"><span>${typeCopy}</span><h4>${escapeHtml(card.name)}</h4><small>${card.value} ${valueCopy}</small>${rules}</article>`;
  }).join('');
  byId('perkBrowserTrack').scrollLeft = 0;
  updatePerkBrowserControls();
}

function showBrowserPerk(index: number) {
  const track = byId('perkBrowserTrack');
  const cards = track.querySelectorAll<HTMLElement>('.character-perk-card');
  if (!cards.length) return;
  browserPerkIndex = THREE.MathUtils.clamp(index, 0, cards.length - 1);
  cards[browserPerkIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
  updatePerkBrowserControls();
}

function updatePerkBrowserControls() {
  const count = characterBrowserCards(browserCharacter, browserCardKind).length;
  (byId('previousPerk') as HTMLButtonElement).disabled = browserPerkIndex <= 0;
  (byId('nextPerk') as HTMLButtonElement).disabled = browserPerkIndex >= count - 1;
  byId('perkPosition').textContent = `${browserPerkIndex + 1} / ${count}`;
}

function setupCharacterPreview() {
  const host = byId('characterPreviewCanvas');
  characterPreviewScene = new THREE.Scene();
  characterPreviewCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 50);
  characterPreviewCamera.position.set(0, 1.55, 5.4);
  characterPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  characterPreviewRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  characterPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  characterPreviewRenderer.toneMapping = THREE.ACESFilmicToneMapping;
  characterPreviewRenderer.toneMappingExposure = 1.08;
  characterPreviewRenderer.shadowMap.enabled = true;
  characterPreviewRenderer.shadowMap.type = THREE.PCFShadowMap;
  host.appendChild(characterPreviewRenderer.domElement);
  characterPreviewControls = new OrbitControls(characterPreviewCamera, characterPreviewRenderer.domElement);
  characterPreviewControls.enableDamping = true;
  characterPreviewControls.dampingFactor = 0.075;
  characterPreviewControls.enablePan = false;
  characterPreviewControls.minDistance = 3.2;
  characterPreviewControls.maxDistance = 7.2;
  characterPreviewControls.minPolarAngle = Math.PI * .28;
  characterPreviewControls.maxPolarAngle = Math.PI * .58;
  characterPreviewControls.target.set(0, 1.35, 0);
  characterPreviewControls.update();
  characterPreviewScene.add(new THREE.HemisphereLight(0xcfffee, 0x07100e, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 4.2); key.position.set(3.5, 5, 4); key.castShadow = true; characterPreviewScene.add(key);
  const rim = new THREE.DirectionalLight(0x50e5c2, 3.1); rim.position.set(-4, 2.8, -3); characterPreviewScene.add(rim);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.32, .2, 48), new THREE.MeshStandardMaterial({ color: 0x10251f, metalness: .64, roughness: .34 }));
  pedestal.position.y = -.11; pedestal.receiveShadow = true; characterPreviewScene.add(pedestal);
  const glowRing = new THREE.Mesh(new THREE.RingGeometry(.8, 1.02, 64), new THREE.MeshBasicMaterial({ color: 0x72f6d7, transparent: true, opacity: .38, side: THREE.DoubleSide }));
  glowRing.rotation.x = -Math.PI / 2; glowRing.position.y = .002; characterPreviewScene.add(glowRing);
  const resizePreview = () => {
    if (!characterPreviewRenderer || !characterPreviewCamera) return;
    const width = host.clientWidth; const height = host.clientHeight;
    if (width < 1 || height < 1) return;
    characterPreviewRenderer.setSize(width, height, false); characterPreviewCamera.aspect = width / height; characterPreviewCamera.updateProjectionMatrix();
  };
  new ResizeObserver(resizePreview).observe(host);
  resizePreview();
  let previousTime = performance.now();
  characterPreviewRenderer.setAnimationLoop((time) => {
    if (!characterPreviewRenderer || !characterPreviewScene || !characterPreviewCamera || !characterPreviewControls || document.querySelector('.character-browser')?.classList.contains('hidden')) { previousTime = time; return; }
    const delta = Math.min((time - previousTime) / 1000, .05); previousTime = time;
    characterPreviewControls.update();
    const orkkState = characterPreviewModel?.userData.orkkAnimation as OrkkAnimationState | undefined;
    const wizardState = characterPreviewModel?.userData.wizardAnimation as WizardAnimationState | undefined;
    orkkState?.mixer.update(delta); wizardState?.mixer.update(delta);
    if (characterPreviewModel?.userData.spectreAnimation) updateSpectreAnimation(characterPreviewModel, undefined, delta);
    characterPreviewRenderer.render(characterPreviewScene, characterPreviewCamera);
  });
}

function showCharacterPreviewModel(character: SelectableCharacter) {
  if (!characterPreviewScene) return;
  if (characterPreviewModel) characterPreviewScene.remove(characterPreviewModel);
  let model = characterPreviewModels.get(character);
  if (!model) {
    model = character === 'shinobi' ? createObiWanShinobi(0x45c8ff)
      : character === 'orkk' ? createDaOrkk(0xff5d68)
        : character === 'magician' ? createLongHatLogan(0x9b7cff)
          : character === 'john-christ' ? createJohnChrist(0xffd166)
            : character === 'spectre' ? createSpectre(0xa06cff)
              : character === 'wreckna' ? createWreckna(0x72d8ff)
                : createMerylin(0xb069ff);
    model.userData.character = character;
    model.traverse((child) => { if (child.name === 'TargetRing') child.visible = false; });
    characterPreviewModels.set(character, model);
  }
  characterPreviewModel = model;
  model.position.set(0, 0, 0);
  // The board camera views these roots from the opposite side; invert that
  // game-facing convention so an archive preview starts face-forward.
  model.rotation.set(0, model.userData.facingSide === 'positive-z' ? 0 : Math.PI, 0);
  characterPreviewScene.add(model);
  characterPreviewCamera?.position.set(0, 1.55, character === 'magician' ? 6.1 : 5.4);
  characterPreviewControls?.target.set(0, character === 'magician' ? 1.55 : 1.35, 0);
  characterPreviewControls?.update();
}

initializeCharacterBrowser();
