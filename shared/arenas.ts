export type ArenaId = 'nagrand' | 'lordaeron' | 'trench';
export type ArenaPlayerSlot = 'P1' | 'P2' | 'P3';

export type ArenaDefinition = {
  id: ArenaId;
  name: string;
  playerCount: 2 | 3;
  width: number;
  height: number;
  pillars: readonly string[];
  boxes: readonly string[];
  boxSpawnLocations?: Readonly<{
    highground: readonly string[];
    highgroundProtected: readonly string[];
    lowground: readonly string[];
  }>;
  highground: readonly string[];
  highgroundProtected: readonly string[];
  adjacentHighgroundOnlyTargets?: readonly string[];
  slideSquares?: readonly string[];
  trenchSquares?: readonly string[];
  drawSquares: readonly string[];
  bases: Readonly<Record<ArenaPlayerSlot, readonly string[]>>;
  startingSquares: Readonly<Partial<Record<ArenaPlayerSlot, string>>>;
};

const inclusiveRange = (letter: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => `${letter}${from + index}`);

export const NAGRAND_ARENA: ArenaDefinition = {
  id: 'nagrand', name: 'Nagrand Arena', playerCount: 2, width: 8, height: 8,
  pillars: ['A1', 'A8', 'H1', 'H8', 'C3', 'C6', 'F3', 'F6'],
  boxes: ['E1', 'D8'],
  boxSpawnLocations: {
    highground: ['D4', 'E4', 'D5', 'E5'],
    highgroundProtected: ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'],
    lowground: ['B2', 'G2', 'B7', 'G7'],
  },
  highground: ['D4', 'D5', 'E4', 'E5'],
  highgroundProtected: ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'],
  drawSquares: ['D1', 'E1', 'D8', 'E8'],
  bases: { P1: ['A4', 'A5'], P2: ['H4', 'H5'], P3: [] },
  startingSquares: { P1: 'A4', P2: 'H5' },
};

export const nagrandQuarter = (label: string): 1 | 2 | 3 | 4 => {
  const x = label.charCodeAt(0) - 64;
  const y = Number(label.slice(1));
  if (y <= 4) return x <= 4 ? 1 : 2;
  return x <= 4 ? 3 : 4;
};

export function randomNagrandBoxSpawns(random: () => number = Math.random): string[] {
  const locations = NAGRAND_ARENA.boxSpawnLocations!;
  const quarters = [1, 2, 3, 4] as const;
  const pick = <T>(values: readonly T[]): T => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const highgroundQuarter = pick(quarters);
  const protectedQuarter = pick(quarters.filter((quarter) => quarter !== highgroundQuarter));
  const lowgroundQuarters = quarters.filter((quarter) => quarter !== highgroundQuarter && quarter !== protectedQuarter);
  return [
    pick(locations.highground.filter((label) => nagrandQuarter(label) === highgroundQuarter)),
    pick(locations.highgroundProtected.filter((label) => nagrandQuarter(label) === protectedQuarter)),
    ...lowgroundQuarters.map((quarter) => pick(locations.lowground.filter((label) => nagrandQuarter(label) === quarter))),
  ];
}

export const LORDAERON_ARENA: ArenaDefinition = {
  id: 'lordaeron', name: 'Lordaeron Arena', playerCount: 3, width: 8, height: 11,
  pillars: ['B2', 'G10'],
  boxes: ['B3', 'D10', 'F5'],
  highground: [...inclusiveRange('D', 4, 7), ...inclusiveRange('E', 4, 7)],
  highgroundProtected: [
    ...inclusiveRange('C', 3, 8),
    ...inclusiveRange('F', 3, 8),
    'D3', 'E3', 'D8', 'E8',
  ],
  drawSquares: ['C2', 'B3', 'D9', 'D10'],
  bases: {
    P1: ['B7', 'B8'],
    P2: ['F2', 'G2'],
    P3: ['G7', 'G8'],
  },
  startingSquares: { P1: 'B7', P2: 'F2', P3: 'G7' },
};

export const THE_TRENCH_ARENA: ArenaDefinition = {
  id: 'trench', name: 'The Trench', playerCount: 2, width: 8, height: 8,
  pillars: ['A3', 'A6', 'H3', 'H6'],
  boxes: [],
  highground: ['C3', 'D3', 'E3', 'F3', 'C6', 'D6', 'E6', 'F6'],
  highgroundProtected: ['C2', 'D2', 'E2', 'F2', 'B3', 'G3', 'B6', 'G6', 'C7', 'D7', 'E7', 'F7'],
  adjacentHighgroundOnlyTargets: ['B3', 'G3', 'B6', 'G6'],
  slideSquares: ['C2', 'F2', 'C4', 'F4', 'C5', 'F5', 'C7', 'F7'],
  trenchSquares: ['C4', 'D4', 'E4', 'F4', 'C5', 'D5', 'E5', 'F5'],
  drawSquares: ['A4', 'A5', 'H4', 'H5'],
  bases: { P1: ['D1', 'E1'], P2: ['D8', 'E8'], P3: [] },
  startingSquares: { P1: 'D1', P2: 'E8' },
};

export function randomTrenchBoxSpawns(random: () => number = Math.random): string[] {
  const pick = <T>(values: readonly T[]): T => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const groupOne = ['C3', 'D3', 'E3', 'F3'] as const;
  const groupTwo = ['C6', 'D6', 'E6', 'F6'] as const;
  const groupThree = pick(['B3', 'G3'] as const);
  const groupFour = groupThree === 'B3' ? 'G6' : 'B6';
  return [pick(groupOne), pick(groupTwo), groupThree, groupFour];
}

export const arenaForPlayerCount = (playerCount: number): ArenaDefinition =>
  playerCount >= 3 ? LORDAERON_ARENA : NAGRAND_ARENA;
