import { CARDS, type CardTypeId, type CharacterId } from '../shared/game.ts';

// Directly generated cards only: exclude quest rewards, copied/transferred cards,
// and non-card effects. John's positive Blessings have their own archive tab.
export const CHARACTER_STATUS_CARD_IDS: Record<CharacterId, readonly CardTypeId[]> = {
  shinobi: ['pinned', 'headache', 'exhaust'], // Movement effects, Hello There / Mind Tricks, Force Disarm.
  orkk: ['headache', 'exhaust'], // Knee Blast / CountaSpell, Teef Strike / Consume Rage.
  magician: ['headache'], // Counterspell.
  'john-christ': ['headache', 'exhaust', 'burning', 'panic'], // Enforce / Mind Blast, Blessed Light, Cleanse / Thorns, Fear the Justice.
  spectre: ['headache', 'panic'], // Consume Replica / Devour, Replicate.
  wreckna: ['headache', 'exhaust'], // Sap / Curse, Enfeeble / Finger of Death.
  merylin: ['headache', 'exhaust'], // Excalibur / Tactician, Frostmourne.
};

export function characterStatusCards(character: CharacterId) {
  return CHARACTER_STATUS_CARD_IDS[character].flatMap((id) => {
    const card = CARDS.find((candidate) => candidate.id === id);
    return card?.kind === 'status' && !card.id.startsWith('blessing-') ? [card] : [];
  });
}
