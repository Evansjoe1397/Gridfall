import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARDS, cardDefinition } from '../shared/game.ts';
import { cardNameHtml, cardTextHtml } from '../src/card-typography.ts';

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
// The app loads upright fonts and disables synthesis globally. The class must permit italic synthesis.
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const rule = css.match(/\.narrative-card-name\s*\{([^}]+)\}/)![1];
assert.match(rule, /font-style:\s*italic\s*;/);
assert.match(rule, /font-synthesis:\s*style\s*;/);
console.log('Card typography checks passed: Narrative titles, bare/parenthesized mentions, casing, repeated names, word boundaries, HTML escaping, and italic font synthesis.');
