/// <reference types="vite/client" />

/** Row-major source sheet order, also used by the PNG export script. */
export const GAME_ICONS = [
  'rage', 'shield', 'lightsaber', 'magic', 'spirit', 'replica',
  'skull', 'attack', 'burning', 'pinned', 'headache', 'exhaust',
  'ice', 'movement', 'movement-blocked', 'dagger', 'range', 'spellbook',
  'highground', 'flag', 'panic', 'boomerang', 'shell', 'double',
  'might', 'wisdom', 'ritual', 'accumulate', 'square', 'pass-through',
] as const;

export type GameIconName = typeof GAME_ICONS[number];

// Inline the tiny PNGs so cached overhead markers cannot retain failed requests.
const iconSources = import.meta.glob<string>('./assets/icons/*.png', {
  eager: true,
  query: '?inline',
  import: 'default',
});

/** Decorative artwork; the enclosing control supplies its name and tooltip. */
export function gameIcon(name: GameIconName): string {
  const source = iconSources[`./assets/icons/${name}.png`];
  if (!source) throw new Error(`Missing game icon: ${name}`);
  return `<img class="game-icon" src="${source}" alt="" aria-hidden="true" width="64" height="64" draggable="false">`;
}
