export type ArenaId = 'nagrand' | 'lordaeron';
export type ArenaPlayerSlot = 'P1' | 'P2' | 'P3';

export type ArenaDefinition = {
  id: ArenaId;
  name: string;
  playerCount: 2 | 3;
  width: number;
  height: number;
  pillars: readonly string[];
  boxes: readonly string[];
  highground: readonly string[];
  highgroundProtected: readonly string[];
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
  highground: ['D4', 'D5', 'E4', 'E5'],
  highgroundProtected: ['C4', 'C5', 'D3', 'E3', 'D6', 'E6', 'F4', 'F5'],
  drawSquares: ['D1', 'E1', 'D8', 'E8'],
  bases: { P1: ['A4', 'A5'], P2: ['H4', 'H5'], P3: [] },
  startingSquares: { P1: 'A4', P2: 'H5' },
};

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

export const arenaForPlayerCount = (playerCount: number): ArenaDefinition =>
  playerCount >= 3 ? LORDAERON_ARENA : NAGRAND_ARENA;
