import type { CardTypeId, CharacterId } from '../shared/game.ts';

export type CombatPortraitRole = 'attack' | 'defend';

const portraitModules = import.meta.glob<string>(
  './assets/combat-portraits/*.{avif,png,webp}',
  { eager: true, query: '?url', import: 'default' },
);

const portraitBySlot = new Map<string, string>();

for (const [path, url] of Object.entries(portraitModules)) {
  const filename = path.split('/').pop();
  const match = filename?.match(/^([^.]+)\.(attack|defend)(?:\.([^.]+))?(?:\.([^.]+))?\.(?:avif|png|webp)$/i);
  if (!match) continue;
  const [, character, role, cardId, variant] = match;
  portraitBySlot.set(`${character.toLowerCase()}:${role.toLowerCase()}:${cardId?.toLowerCase() ?? '*'}:${variant?.toLowerCase() ?? '*'}`, url);
}

export function combatPortrait(character: CharacterId | 'dummy', role: CombatPortraitRole, cardId?: CardTypeId, variant?: string): string | undefined {
  if (character === 'dummy') return undefined;
  return (cardId && variant ? portraitBySlot.get(`${character}:${role}:${cardId}:${variant}`) : undefined)
    ?? (cardId ? portraitBySlot.get(`${character}:${role}:${cardId}:*`) : undefined)
    ?? portraitBySlot.get(`${character}:${role}:*:*`);
}
