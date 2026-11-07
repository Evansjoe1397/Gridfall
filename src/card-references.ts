import { CARDS } from '../shared/game.ts';

export type CardReference = { id: string; name: string; cardId?: string; description?: string };

export const CARD_REFERENCES: readonly CardReference[] = [
  { id: 'spell-echo', name: 'Spell Echo', description: 'Your three slots store Perk Cards at Levels 1, 2 and 3. Place a Perk from Hand into Level 1 to use its Level 1 effects immediately. Later, use a stored Perk to apply all its effects up to its slot’s Level, then cycle it back to Level 1. Each use costs 1 Action and normally counts as your one Perk use for the turn. If you use no Perk during your turn, Level 1 is occupied and the slots are not full, your Perks move down the Spell Echo panel to higher Levels at turn end, leaving Level 1 empty. Stored Perks remain available to use again on future turns, potentially every turn. Outside Perk Mode, only Level 1 can be replaced. In Perk Mode, selecting an occupied higher slot discards that Perk, shifts lower Perks up, and inserts the new Perk at Level 1.' },
  ...CARDS.filter((card) => card.kind === 'status' || card.id === 'overpower' || card.id === 'judgement')
    .map((card) => ({ id: card.id, name: card.name, cardId: card.id })),
  { id: 'lightsaber', name: 'Lightsaber', description: 'Adds +1 to Attack and Defend Card Values and +1 MOV until the end of Shinobi’s next turn. Activates when he ends his turn without moving; movement from his own Attack or Defend Cards does not prevent activation. Card effects may also activate or extend it.' },
  { id: 'spirit-form', name: 'Spirit Form', description: 'On entry, add Judgement to John Christ’s Hand unless it is already held. Attack Cards gain +2 ATT, Attack Range becomes 1, and the Form has 1 MOV unaffected by negative movement effects. Pass through enemies, Objects, Shields and Walls. Each enemy Square refunds its entry MOV and siphons 1 MOV from that enemy once per John turn. Cannot finish movement on an enemy. Cards with “Bless” in their name cannot be used. Exit after an Attack and all its effects and choices, or at turn end; Attack Range returns to 3. Judgement exists only in Hand and is Removed when it leaves Hand or at turn end.' },
  { id: 'summon', name: 'Summon', description: 'Merylin needs an active Summon to use an Attack Card. Using that Attack consumes Summon. If the Attack grants Summon, a fresh Summon is applied afterwards, enabling another Attack. Curse suppresses Swordcraft and prevents Summon from enabling Attacks.' },
  { id: 'rage', name: 'Rage', description: 'Each stack adds +1 Attack Value to Da Orkk’s Attack Card. Applied stacks are consumed after attacking a Character; attacking an Object keeps them. At turn start, gain 1 Rage if the Shield is unequipped, Rage is 0 and the Trait is not blocked. Remove 1 stack at turn end.' },
  { id: 'phylactery-might', name: 'Phylactery of Might', description: 'During Combat Stack selection, spend 1 MOV for +1 Attack Value instead of using a Combat Card.' },
  { id: 'phylactery-wisdom', name: 'Phylactery of Wisdom', description: 'Before choosing a Defend Card, draw 1 Card, then discard 1 Card.' },
  { id: 'phylactery-ritual', name: 'Phylactery of Ritual', description: 'Creating a Phylactery ignores its HP or Tomb sacrifice. Replacing one still requires destroying an active Phylactery.' },
  { id: 'phylactery', name: 'Phylactery', description: 'Wreckna infuses an Object with Phylactery of Might, Phylactery of Wisdom or Phylactery of Ritual. Up to 2 may be active, with no duplicate types. Creating a third requires sacrificing an existing Phylactery.' },
  { id: 'blessing', name: 'Blessing', description: 'John Christ’s positive Status Cards grant their individual effects and create Stoic Shell. The Blessings are Blessing: Light, Blessing: Prayer, Blessing: Might, Blessing: Shield, Blessing: Swiftness and Blessing: Faith. Cards containing “Bless” in their name cannot be used in Spirit Form.' },
  { id: 'stoic-shell', name: 'Stoic Shell', description: 'Restore 1 HP at the start of John Christ’s turn. Does not stack. HP Damage removes Stoic Shell.' },
];

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = new Map(CARD_REFERENCES.map((reference) => [reference.name.toLowerCase(), reference]));
aliases.set('blessings', CARD_REFERENCES.find((reference) => reference.id === 'blessing')!);
aliases.set('phylacteries', CARD_REFERENCES.find((reference) => reference.id === 'phylactery')!);
aliases.set('lightsaber status', CARD_REFERENCES.find((reference) => reference.id === 'lightsaber')!);
const mentions = new RegExp(`(?<![\\p{L}\\p{N}_])(${[...aliases.keys()].sort((a, b) => b.length - a.length).map(escapePattern).join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

/** Match plain text before HTML formatting; longest names win over generic effects. */
export function referenceTextHtml(text: string, format: (part: string) => string): string {
  const parts = text.split(mentions);
  return parts.map((part, index) => {
    if (index % 2 === 0) return format(part);
    // “Summon Lens” is a different Perk, not Merylin’s Summon status.
    const suffix = parts[index + 1] ?? '';
    if (part.toLowerCase() === 'summon' && /^\s+lens\b/i.test(suffix)) return format(part);
    const reference = aliases.get(part.toLowerCase())!;
    return `<span class="card-reference" data-card-reference="${reference.id}" tabindex="0" role="link" aria-haspopup="true">${format(part)}</span>`;
  }).join('');
}
