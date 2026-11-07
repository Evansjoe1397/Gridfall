import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS, cardDefinition } from '../shared/game.ts';
import { cardNameHtml, cardTextHtml } from '../src/card-typography.ts';
import { CARD_REFERENCES } from '../src/card-references.ts';

const italic = (text: string) => `<em class="narrative-card-name">${text}</em>`;
for (const card of CARDS.filter((card) => card.narrative)) {
  assert.equal(cardNameHtml(card), italic(card.name));
  assert.equal(cardNameHtml(card, true), italic(card.name.toUpperCase()));
  const bare = card.name.replace(/^\((.*)\)$/, '$1');
  for (const name of [card.name, bare, bare.toUpperCase(), bare.toLowerCase()]) {
    assert.equal(cardTextHtml(`Create ${name}.`), `Create ${italic(name)}.`);
  }
}
assert.equal(cardTextHtml('Create (Heated Debate), then discard Heated Debate.'), `Create ${italic('(Heated Debate)')}, then discard ${italic('Heated Debate')}.`);
assert.equal(cardTextHtml("Heated Debate's effects"), `${italic('Heated Debate')}&#39;s effects`);
assert.equal(cardTextHtml('Escalations or preEscalation or EscalationExtra'), 'Escalations or preEscalation or EscalationExtra');
for (const id of ['mockingjay', 'qombucha'] as const) {
  const card = cardDefinition({ instanceId: '', cardId: id });
  assert.equal(cardNameHtml(card), card.name, 'Non-Narrative Cards retain regular names.');
}
const qombucha = cardDefinition({ instanceId: '', cardId: 'qombucha' });
assert.ok(cardTextHtml(qombucha.effectText!).includes(italic('(Heated Debate)')), 'Real Card descriptions format embedded Narrative names.');
assert.equal(cardTextHtml('<script>Heated Debate</script> & "Once upon a time"'), `&lt;script&gt;${italic('Heated Debate')}&lt;/script&gt; &amp; &quot;${italic('Once upon a time')}&quot;`);
assert.equal(cardNameHtml({ name: '<img>', narrative: true }), italic('&lt;img&gt;'));
// Real rules must resolve complete references, with longer names taking priority.
const referenceIds = (text: string) => [...cardTextHtml(text).matchAll(/data-card-reference="([^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(referenceIds('After combat, add 1 -MOV stack and activate Lightsaber status.'), ['lightsaber']);
assert.deepEqual(referenceIds('Add a Headache Status Card. Exhaust, Burning and Panic!'), ['headache', 'exhaust', 'burning', 'panic']);
for (const card of CARDS.filter((card) => card.id.startsWith('blessing-'))) {
  assert.deepEqual(referenceIds(`Create ${card.name}.`), [card.id]);
}
assert.deepEqual(referenceIds('Phylactery of Might, Phylactery of Wisdom and Phylactery of Ritual.'), ['phylactery-might', 'phylactery-wisdom', 'phylactery-ritual']);
assert.deepEqual(referenceIds('Gain Summon, Overpower and Rage.'), ['summon', 'overpower', 'rage']);
assert.deepEqual(referenceIds('Summon Lens. Summon.'), ['summon']);
assert.deepEqual(referenceIds('Exhausted, Enrage, Summoner, Headaches and prePanic'), []);
assert.deepEqual(referenceIds('Spirit Form! Blessings and Phylacteries.'), ['spirit-form', 'blessing', 'phylactery']);
const spirit = CARD_REFERENCES.find((reference) => reference.id === 'spirit-form')!;
assert.ok(referenceIds(spirit.description!).includes('judgement'), 'Spirit Form explains and links the Judgement granted on entry.');
assert.ok(cardTextHtml('<script>Headache</script>').startsWith('&lt;script&gt;'));
assert.equal(CARD_REFERENCES.length, new Set(CARD_REFERENCES.map((reference) => reference.id)).size);
for (const reference of CARD_REFERENCES) {
  if (reference.cardId) assert.ok(CARDS.some((card) => card.id === reference.cardId));
}
// The app loads upright fonts and disables synthesis globally. The class must permit italic synthesis.
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rule = css.match(/\.narrative-card-name\s*\{([^}]+)\}/)![1];
assert.match(rule, /font-style:\s*italic\s*;/);
assert.match(rule, /font-synthesis:\s*style\s*;/);
console.log('Card typography checks passed: Narrative titles, bare/parenthesized mentions, casing, repeated names, word boundaries, HTML escaping, and italic font synthesis.');
