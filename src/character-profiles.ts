import type { HotseatCharacterId } from '../shared/game.ts';

const profileModules = import.meta.glob<string>(
  './assets/character-profiles/*.{avif,png,webp,svg}',
  { eager: true, query: '?url', import: 'default' },
);

const profileByCharacter = new Map<string, string>();

for (const [path, url] of Object.entries(profileModules)) {
  const filename = path.split('/').pop();
  const match = filename?.match(/^([^.]+)\.(?:avif|png|webp|svg)$/i);
  if (match) profileByCharacter.set(match[1].toLowerCase(), url);
}

export function characterProfile(character: HotseatCharacterId | 'dummy'): string | undefined {
  return character === 'dummy' ? undefined : profileByCharacter.get(character);
}
