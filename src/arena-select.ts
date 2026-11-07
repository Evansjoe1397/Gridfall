import { NAGRAND_ARENA, THE_PIPE_ARENA, THE_TRENCH_ARENA, type ArenaDefinition } from '../shared/arenas.ts';

const duelArenas = [
  [NAGRAND_ARENA, 'Central high ground'],
  [THE_TRENCH_ARENA, 'Raised lanes and slide squares'],
  [THE_PIPE_ARENA, 'Two floodable basins'],
] as const;

function previewTile(arena: ArenaDefinition, square: string) {
  let terrain = 'ground';
  if (arena.highground.includes(square)) terrain = 'ridge';
  else if (arena.trenchSquares?.includes(square)) terrain = arena.waterZones ? 'basin' : 'trench';
  else if (arena.highgroundProtected.includes(square)) terrain = 'slope';

  let mark = '';
  if (Object.values(arena.startingSquares).includes(square)) mark = 'start';
  else if (arena.pillars.includes(square)) mark = 'pillar';
  else if (arena.buttonSquares?.includes(square)) mark = 'switch';
  else if (arena.slideSquares?.includes(square)) mark = 'slide';
  return `<i class="tile-${terrain} ${mark}"></i>`;
}

export function arenaSelectMarkup(flow: 'hotseat' | 'online') {
  const cards = duelArenas.map(([arena, description]) => {
    const tiles = Array.from({ length: arena.width * arena.height }, (_, i) => {
      const column = String.fromCharCode(65 + i % arena.width);
      return previewTile(arena, column + (arena.height - Math.floor(i / arena.width)));
    }).join('');
    return `<button type="button" data-${flow}-arena="${arena.id}">
      <span class="arena-map" style="--columns:${arena.width}" aria-hidden="true">${tiles}</span>
      <strong>${arena.name}</strong><small>${description}</small></button>`;
  }).join('');
  return `<h2>Choose Arena</h2><div class="arena-choices">${cards}</div>
    <div class="map-key"><span><i class="start"></i>Start</span><span><i class="pillar"></i>Pillar</span><span><i class="tile-ridge"></i>High ground</span><span><i class="slide"></i>Slide</span><span><i class="switch"></i>Flood switch</span></div>
    <button class="lobby-back-button" id="${flow === 'online' ? 'backToOnlineFormat' : 'backToFormat'}" type="button">Back to Game Format</button>`;
}
