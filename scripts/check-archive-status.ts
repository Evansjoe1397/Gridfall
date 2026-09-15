import assert from 'node:assert/strict';
import { CharacterIdSchema } from '../shared/game.ts';
import { CHARACTER_STATUS_CARD_IDS, characterStatusCards } from '../src/character-status-cards.ts';

for (const character of CharacterIdSchema.options) {
  const cards = characterStatusCards(character);
  assert.equal(cards.length, CHARACTER_STATUS_CARD_IDS[character].length, `${character}: every mapped card exists and is a Status Card`);
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length);
  assert.ok(cards.every((card) => card.kind === 'status' && !card.id.startsWith('blessing-')));
  assert.ok(cards.every((card) => card.effectText.length > 0));
}
assert.deepEqual(characterStatusCards('shinobi').map((card) => card.id), ['pinned', 'headache', 'exhaust']);
assert.deepEqual(characterStatusCards('john-christ').map((card) => card.id), ['headache', 'exhaust', 'burning', 'panic']);
assert.deepEqual(characterStatusCards('magician').map((card) => card.id), ['headache']);
console.log('Character archive Status Card checks passed for all seven characters.');
