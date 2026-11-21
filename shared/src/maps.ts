import { MapDefinition, MapId, TileType } from './types';

export const MAP_WIDTH = 21;
export const MAP_HEIGHT = 33;

const CHAR_TO_TILE: Record<string, TileType> = {
  '.': TileType.EMPTY,
  'B': TileType.WALL_BREAKABLE,
  'S': TileType.WALL_SOLID,
  'G': TileType.BUSH,
  'W': TileType.WATER,
  'M': TileType.GEM_MINE,
};

/**
 * Builds a strictly 180-degree rotationally symmetric 21x33 map from:
 * - topRows: 16 rows (y = 0..15), each 21 chars
 * - midHalf: 10 chars for y = 16, x = 0..9 (x = 10 is always GEM_MINE 'M', x = 11..20 mirrors 9..0)
 */
function buildSymmetricGrid(topRows: string[], midHalf: string): Uint8Array {
  if (topRows.length !== 16) {
    throw new Error(`Expected 16 top rows, got ${topRows.length}`);
  }
  if (midHalf.length !== 10) {
    throw new Error(`Expected 10 chars for midHalf, got ${midHalf.length}`);
  }
  const grid = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);

  for (let y = 0; y < 16; y++) {
    const row = topRows[y];
    if (row.length !== MAP_WIDTH) {
      throw new Error(`Row ${y} expected length ${MAP_WIDTH}, got ${row.length}`);
    }
    for (let x = 0; x < MAP_WIDTH; x++) {
      const tile = CHAR_TO_TILE[row[x]];
      if (tile === undefined) throw new Error(`Unknown tile char '${row[x]}'`);
      grid[y * MAP_WIDTH + x] = tile;
      // 180-degree symmetric partner
      const mx = MAP_WIDTH - 1 - x;
      const my = MAP_HEIGHT - 1 - y;
      grid[my * MAP_WIDTH + mx] = tile;
    }
  }

  // Middle row y = 16
  for (let x = 0; x < 10; x++) {
    const tile = CHAR_TO_TILE[midHalf[x]];
    if (tile === undefined) throw new Error(`Unknown mid tile char '${midHalf[x]}'`);
    grid[16 * MAP_WIDTH + x] = tile;
    grid[16 * MAP_WIDTH + (MAP_WIDTH - 1 - x)] = tile;
  }
  grid[16 * MAP_WIDTH + 10] = TileType.GEM_MINE;

  return grid;
}

// 21 chars wide, 16 top rows (Red spawn at y=2..3, mirrored to Blue spawn at y=29..30)
const CRYSTAL_CAVERN_TOP = [
  'SSSSSSSSSSSSSSSSSSSSS', // 0
  'S...................S', // 1
  'S...................S', // 2  <- Red spawn line
  'S...................S', // 3
  'S..GG...........GG..S', // 4
  'S..GG..BB...BB..GG..S', // 5
  'S..GG..B.....B..GG..S', // 6
  'S...................S', // 7
  'S.GGG...S...S...GGG.S', // 8
  'S.GGG...........GGG.S', // 9
  'S.GGG..BB...BB..GGG.S', // 10
  'S.GG.............GG.S', // 11
  'S.....BB.....BB.....S', // 12
  'S.GG..B.......B..GG.S', // 13
  'S.GGG...........GGG.S', // 14
  'S.GGG...B...B...GGG.S', // 15
];
const CRYSTAL_CAVERN_MID_HALF = 'S.GGG.....'; // x=0..9 -> M at x=10

const TWIN_BRIDGES_TOP = [
  'SSSSSSSSSSSSSSSSSSSSS', // 0
  'S...................S', // 1
  'S...................S', // 2  <- Red spawn line
  'S...................S', // 3
  'S...BB.........BB...S', // 4
  'S..GGG.........GGG..S', // 5
  'S..GGG...S.S...GGG..S', // 6
  'S...................S', // 7
  'S..BB...........BB..S', // 8
  'S..B...GG...GG...B..S', // 9
  'S.....GGG...GGG.....S', // 10
  'S.WW..B.......B..WW.S', // 11
  'S.WWWW...B.B...WWWW.S', // 12
  'S.GG.............GG.S', // 13
  'S.GGG..B.....B..GGG.S', // 14
  'S.GGG...........GGG.S', // 15
];
const TWIN_BRIDGES_MID_HALF = 'S..GG..B..'; // x=0..9 -> M at x=10

const IRON_FOUNDRY_TOP = [
  'SSSSSSSSSSSSSSSSSSSSS', // 0
  'S...................S', // 1
  'S...................S', // 2  <- Red spawn line
  'S...................S', // 3
  'S..S.............S..S', // 4
  'S..S..GGG...GGG..S..S', // 5
  'S....BBBB...BBBB....S', // 6
  'S..WW...........WW..S', // 7  <- Molten slag flank moats
  'S..WW...S...S...WW..S', // 8
  'S.GGG..BB...BB..GGG.S', // 9
  'S.GGG...........GGG.S', // 10
  'S.....S..WWW..S.....S', // 11 <- Central magma trench + twin bridges
  'S..BB....WWW....BB..S', // 12
  'S..B..GGG...GGG..B..S', // 13
  'S.....GG.....GG.....S', // 14
  'S..S...B.....B...S..S', // 15
];
const IRON_FOUNDRY_MID_HALF = 'S.GGG..B..'; // x=0..9 -> M at x=10

const COMMON_SPAWNS = {
  blue: [
    { x: 10.5, y: 30.5 },
    { x: 6.5, y: 30.5 },
    { x: 14.5, y: 30.5 },
  ],
  red: [
    { x: 10.5, y: 2.5 },
    { x: 14.5, y: 2.5 },
    { x: 6.5, y: 2.5 },
  ],
};

export const MAPS: Record<MapId, MapDefinition> = {
  'crystal-cavern': {
    id: 'crystal-cavern',
    name: 'Crystal Cavern',
    subtitle: 'Classic bush flanks & central breakable cover',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    grid: buildSymmetricGrid(CRYSTAL_CAVERN_TOP, CRYSTAL_CAVERN_MID_HALF),
    minePos: { x: 10.5, y: 16.5 },
    spawns: COMMON_SPAWNS,
  },
  'twin-bridges': {
    id: 'twin-bridges',
    name: 'Twin Bridges',
    subtitle: 'Water channels & triple mid-lane choke crossings',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    grid: buildSymmetricGrid(TWIN_BRIDGES_TOP, TWIN_BRIDGES_MID_HALF),
    minePos: { x: 10.5, y: 16.5 },
    spawns: COMMON_SPAWNS,
  },
  'iron-foundry': {
    id: 'iron-foundry',
    name: 'Iron Foundry',
    subtitle: 'Industrial steelworks, molten lava trenches & bunker cover',
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    grid: buildSymmetricGrid(IRON_FOUNDRY_TOP, IRON_FOUNDRY_MID_HALF),
    minePos: { x: 10.5, y: 16.5 },
    spawns: COMMON_SPAWNS,
  },
};

export const MAP_LIST: MapDefinition[] = [
  MAPS['crystal-cavern'],
  MAPS['twin-bridges'],
  MAPS['iron-foundry'],
];

export const BRAWL_BALL_GOAL_MIN_X = 7;
export const BRAWL_BALL_GOAL_MAX_X = 14; // exclusive tile index (tiles 7..13 = 7 tiles wide!)

export function createGridCopy(mapId: MapId): Uint8Array {
  return new Uint8Array(MAPS[mapId].grid);
}

/**
 * Prepares any symmetric 21x33 map grid for Brawl Ball:
 * - Opens 7-tile goal mouths on North (y=0, Red Goal) and South (y=32, Blue Goal)
 * - Clears goal boxes (y=1..2 and y=30..31) and the 3x3 center kickoff circle
 */
export function prepareBrawlBallGrid(grid: Uint8Array): Uint8Array {
  // Open goal mouths & goal boxes
  for (let x = BRAWL_BALL_GOAL_MIN_X; x < BRAWL_BALL_GOAL_MAX_X; x++) {
    grid[0 * MAP_WIDTH + x] = TileType.EMPTY;
    grid[1 * MAP_WIDTH + x] = TileType.EMPTY;
    grid[2 * MAP_WIDTH + x] = TileType.EMPTY;
    grid[(MAP_HEIGHT - 1) * MAP_WIDTH + x] = TileType.EMPTY;
    grid[(MAP_HEIGHT - 2) * MAP_WIDTH + x] = TileType.EMPTY;
    grid[(MAP_HEIGHT - 3) * MAP_WIDTH + x] = TileType.EMPTY;
  }
  // Clear center kickoff circle (remove GEM_MINE and immediate walls/water)
  for (let y = 15; y <= 17; y++) {
    for (let x = 9; x <= 11; x++) {
      grid[y * MAP_WIDTH + x] = TileType.EMPTY;
    }
  }
  return grid;
}
