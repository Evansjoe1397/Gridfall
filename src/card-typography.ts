import { CARDS, type Card } from '../shared/game.ts';

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const narrativeNames = [...new Set(CARDS.filter((card) => card.narrative)
  .flatMap((card) => [card.name, card.name.replace(/^\((.*)\)$/, '$1')]))]
  .sort((a, b) => b.length - a.length);
const narrativeMention = new RegExp(`(?<![\\p{L}\\p{N}_])(${narrativeNames.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

export function cardNameHtml(card: Pick<Card, 'name' | 'narrative'>, uppercase = false): string {
  const name = escapeText(uppercase ? card.name.toUpperCase() : card.name);
  return card.narrative ? `<em class="narrative-card-name">${name}</em>` : name;
}

/** Format plain text only: escape all user/content HTML and mark complete Narrative names once. */
export function cardTextHtml(text: string): string {
  return text.split(narrativeMention).map((part, index) => index % 2
    ? `<em class="narrative-card-name">${escapeText(part)}</em>` : escapeText(part)).join('');
}
