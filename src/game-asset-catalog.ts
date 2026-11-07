/** Only shipped gameplay assets: exclude source models and abandoned variants. */
export const GAME_MODEL_PATHS = [
  'arena-crate-square', 'arena-lordaeron-pillar', 'arena-wooden-pillar',
  'celestial-archmage', 'da-orkh-optimized-skill03', 'excalibur',
  'john-christ', 'john-christ-scepter', 'john-christ-spirit', 'lightbringer',
  'lordaeron-cemetery-perimeter', 'lordaeron-cemetery-tomb', 'merylin-pendragon',
  'moonlight', 'nagrand-outer-ring', 'obi-wan-meditation', 'obi-wan-optimized',
  'spectre-optimized', 'sting', 'trench-column-1', 'trench-column-2', 'trench-perimeter',
].map(name => `models/${name}.glb`);

export const GAME_TEXTURE_PATHS = [
  ...Array.from({ length: 6 }, (_, i) => `textures/lordaeron/base-${i + 1}.png`),
  ...Array.from({ length: 4 }, (_, i) => `textures/trench/base-${i + 1}.png`),
  ...['C4', 'C5', 'D4', 'D5', 'E4', 'E5', 'F4', 'F5'].map(name => `textures/trench/${name}.png`),
  ...['cliff-rock-v1', 'ground', 'polish-stone-v1'].map(name => `textures/nagrand/${name}.webp`),
];

export const GAME_ASSET_PATHS = [...GAME_MODEL_PATHS, ...GAME_TEXTURE_PATHS];

const characterModels: Record<string, string[]> = {
  magician: ['celestial-archmage'], orkk: ['da-orkh-optimized-skill03'],
  shinobi: ['obi-wan-optimized', 'obi-wan-meditation'], spectre: ['spectre-optimized'],
  'john-christ': ['john-christ', 'john-christ-spirit', 'john-christ-scepter'],
  merylin: ['merylin-pendragon', 'sting', 'excalibur', 'moonlight', 'lightbringer'],
};
const arenaModels: Record<string, string[]> = {
  nagrand: ['arena-crate-square', 'arena-wooden-pillar', 'nagrand-outer-ring'],
  trench: ['arena-crate-square', 'trench-column-1', 'trench-column-2', 'trench-perimeter'],
  lordaeron: ['arena-crate-square', 'arena-lordaeron-pillar', 'lordaeron-cemetery-perimeter', 'lordaeron-cemetery-tomb'],
  pipe: ['arena-crate-square', 'arena-wooden-pillar'],
};

/** No arena or unrelated character assets are needed to open the menu/archive. */
export function assetsForScene(arena: string | undefined, characters: readonly string[]) {
  const models = [...(arena ? arenaModels[arena] ?? [] : []), ...characters.flatMap(character => characterModels[character] ?? [])];
  return [...new Set([
    ...models.map(name => `models/${name}.glb`),
    ...GAME_TEXTURE_PATHS.filter(path => arena && path.startsWith(`textures/${arena}/`)),
  ])];
}
