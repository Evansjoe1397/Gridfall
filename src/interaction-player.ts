import type { GameState, PlayerId, GameStateWithNarrative, GameStateWithMockingjay } from '../shared/game.ts';

/** Player who owns the current decision, independent of the viewing client. */
export function interactionPlayer(state: GameState): PlayerId {
  if (state.phase === 'choosing-focus' || state.phase === 'choosing-focus-card') {
    const opening = (state as GameState & { openingSetup?: { pendingPlayerIds: PlayerId[] } }).openingSetup;
    return opening?.pendingPlayerIds[0] ?? state.activePlayerId;
  }
  if (state.lensPerk) return state.lensPerk.casterId;

  if (state.lensSelection) return state.lensSelection.playerId;
  if (state.phase === 'choosing-pyrodash-direction') return state.pyrodash?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-mockingjay-defense') return state.pendingAttack?.defenderId ?? state.activePlayerId;
  if (state.phase === 'choosing-mockingjay-narrative') return (state as GameStateWithMockingjay).mockingjayNarrativeSpend?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-narrative' || state.phase === 'choosing-narrative-target') return (state as GameStateWithNarrative).narrativeChoice?.kazkaId ?? state.activePlayerId;
  if (state.phase === 'choosing-weaver-story') return state.weaverChoice?.targetId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-yamato-move') return (state as GameState & { yamato?: { defenderId: PlayerId } }).yamato?.defenderId ?? state.activePlayerId;
  const spectreStatusChoice = (state as any).spectreStatusChoice as { playerId: PlayerId } | undefined;
  if (state.phase === 'choosing-blessed-prayer-discard' && spectreStatusChoice) return spectreStatusChoice.playerId;
  if (state.phase === 'choosing-spirit-guardian-square') return (state as any).spectreReplicaPlacement?.casterId ?? (state as GameState & { spiritGuardian: { casterId: PlayerId } }).spiritGuardian.casterId;
  if (state.phase === 'choosing-exhaust') {
    const choice = state.combatReveal?.exhaust;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? state.activePlayerId;
  }
  if (state.phase === 'choosing-vicious-mockery') {
    const choice = state.combatReveal?.viciousMockery;
    return choice?.eligible.find((id) => !choice.decided.includes(id)) ?? state.activePlayerId;
  }
  if (state.phase === 'choosing-blessing-light') return state.combatReveal?.blessingLight?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-blessing-might') return state.combatReveal?.blessingMight?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-blessing-faith') return state.combatReveal?.blessingFaith?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-mythril-helmet') return state.combatReveal?.mythrilHelmet?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-mana-barrage') return state.combatReveal?.manaBarrage?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-force-throw-target' || state.phase === 'choosing-force-throw-direction') return state.forceThrow!.casterId;
  if (state.phase === 'choosing-kyk-target' || state.phase === 'choosing-kyk-direction') return state.forceThrow!.casterId;
  if (state.phase === 'choosing-force-pull-target') return state.forcePull!.casterId;
  if (state.phase === 'choosing-spectre-perk-origin') return (state as any).spectrePerkOrigin?.casterId ?? state.activePlayerId;
  if (state.phase === 'choosing-arkane-arow-target') return (state as any).spectreShadow?.casterId ?? state.arkaneArow!.casterId;
  if (state.phase === 'choosing-arm-da-wiz-choice' || state.phase === 'choosing-arm-da-wiz-create-payment' || state.phase === 'choosing-arm-da-wiz-target') return state.armDaWiz!.casterId;
  if (state.phase === 'wreckna-wisdom-offer' || state.phase === 'wreckna-wisdom-discard') return (state as GameState & { wrecknaWisdom?: { playerId: PlayerId } }).wrecknaWisdom?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-wreckna-phylactery' || (state.phase as string) === 'choosing-wreckna-phylactery-replace') return (state as GameState & { wrecknaPhylacteryChoice?: { casterId: PlayerId } }).wrecknaPhylacteryChoice?.casterId ?? state.activePlayerId;
  if (state.phase === 'choosing-immortality-phylactery') return (state as GameState & { immortality?: { playerId: PlayerId } }).immortality?.playerId ?? state.activePlayerId;
  if (state.phase === 'choosing-sap-defend') return (state as GameState & { sap?: { targetId?: PlayerId } }).sap?.targetId ?? state.activePlayerId;
  if (state.phase === 'choosing-test-phylactery-target') return (state as GameState & { testPhylactery?: { casterId: PlayerId } }).testPhylactery?.casterId ?? state.activePlayerId;
  if (state.phase === 'choosing-sacrifice-tomb-square') return (state as GameState & { sacrificeTomb?: { casterId: PlayerId } }).sacrificeTomb?.casterId ?? state.activePlayerId;
  if (state.phase === 'choosing-lichdom-target' || state.phase === 'choosing-lichdom-copy') return (state as GameState & { lichdom?: { casterId: PlayerId } }).lichdom?.casterId ?? state.activePlayerId;
  if ((state.phase as string).startsWith('choosing-dakkoth-')) return (state as GameState & { dakkoth?: { casterId: PlayerId } }).dakkoth?.casterId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-sap-target') return (state as GameState & { sap?: { casterId: PlayerId } }).sap?.casterId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-necronomicon-tomb') return (state as GameState & { necronomicon?: { casterId: PlayerId } }).necronomicon?.casterId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-decay-target') return (state as GameState & { decay?: { casterId: PlayerId } }).decay?.casterId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-decay-discard') return (state as GameState & { decay?: { targetId?: PlayerId } }).decay?.targetId ?? state.activePlayerId;
  if (state.phase === 'choosing-shadow-barter-discard') return (state as GameState & { shadowBarter?: { defenderId: PlayerId } }).shadowBarter?.defenderId ?? state.activePlayerId;
  if (state.phase === 'choosing-shadow-barter-tomb-square') return (state as GameState & { shadowBarter?: { attackerId: PlayerId } }).shadowBarter?.attackerId ?? state.activePlayerId;
  if (state.phase === 'choosing-mind-tricks-discard') return state.mindTricks!.casterId;
  if (state.phase === 'choosing-preparation-teleport' || state.phase === 'choosing-preparation-discard') return state.preparation!.casterId;
  if (state.phase === 'choosing-blink-teleport') return state.pendingAttack!.defenderId;
  if (state.phase === 'choosing-blink-discard') return state.pendingAttack!.defenderId;
  if (state.phase === 'choosing-base-placement') return state.activePlayerId;
  if (state.phase === 'choosing-arcane-missle-target') return state.arcaneMissle!.casterId;
  if (state.phase === 'choosing-fireball-target') return (state as any).fireball.casterId;
  if (state.phase === 'choosing-portal-target') return (state as any).portal.casterId;
  if (state.phase === 'choosing-chain-lightning-target') return state.chainLightning!.casterId;
  if (state.phase === 'choosing-magic-hand-target' || state.phase === 'choosing-magic-hand-direction') return state.magicHand!.casterId;
  if (state.phase === 'choosing-shizzle-destination' || state.phase === 'shizzle-move') return state.shizzle!.casterId;
  if (state.phase === 'choosing-mind-tricks-enemy-discard') return state.mindTricks!.enemyId;
  if (state.phase === 'double-jump') return state.doubleJump!.playerId;
  if (state.phase === 'defending') return state.pendingAttack!.defenderId;
  if (state.phase === 'choosing-force-disarm-discard') return state.forceDisarm!.targetId;
  if (state.phase === 'flurry-offer') return state.flurry!.defenderId;
  if (state.phase === 'choosing-flurry-enemy-discard') return state.flurry!.attackerId;
  if (state.phase === 'mana-blast-offer') return state.pendingAttack!.defenderId;
  if (state.phase === 'choosing-frostmourne') return (state as GameState & { frostmourne?: { playerId: PlayerId } }).frostmourne?.playerId ?? state.activePlayerId;
  if ((state.phase as string) === 'choosing-lightbringer-swap') return state.pendingAttack?.attackerId ?? state.activePlayerId;
  if (state.phase === 'choosing-grimoire-discard') return state.pendingAttack!.defenderId;
  return state.activePlayerId;
}

