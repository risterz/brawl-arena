import { describe, it, expect } from 'vitest';
import { BRAWLER_LIST, BRAWLERS } from '../src/brawlers';
import { MAPS, MAP_WIDTH, MAP_HEIGHT, createGridCopy } from '../src/maps';
import { TileType } from '../src/types';
import {
  resolveCircleGridCollision,
  isPointInBush,
  destroyBreakableWallsInRadius,
  getTile,
} from '../src/collision';

describe('brawlers and symmetric maps', () => {
  it('defines all 6 required original brawlers with 3 ammo slots', () => {
    expect(BRAWLER_LIST.map((b) => b.id).sort()).toEqual([
      'blaze', 'buck', 'golem', 'lumi', 'mort', 'vex',
    ]);
    for (const b of BRAWLER_LIST) {
      expect(b.maxAmmo).toBe(3);
      expect(b.maxHp).toBeGreaterThan(2000);
      expect(b.moveSpeed).toBeGreaterThan(2.5);
    }
    expect(BRAWLERS.golem.maxHp).toBeGreaterThan(BRAWLERS.vex.maxHp);
  });

  it('builds 21x33 180-degree symmetric maps with center gem mine and valid spawns', () => {
    for (const map of Object.values(MAPS)) {
      expect(map.width).toBe(MAP_WIDTH);
      expect(map.height).toBe(MAP_HEIGHT);
      expect(map.grid.length).toBe(MAP_WIDTH * MAP_HEIGHT);
      expect(getTile(map.grid, 10, 16)).toBe(TileType.GEM_MINE);
      expect(map.spawns.blue).toHaveLength(3);
      expect(map.spawns.red).toHaveLength(3);
      for (let y = 0; y < MAP_HEIGHT; y++) {
        for (let x = 0; x < MAP_WIDTH; x++) {
          const a = getTile(map.grid, x, y);
          const b = getTile(map.grid, MAP_WIDTH - 1 - x, MAP_HEIGHT - 1 - y);
          expect(a).toBe(b);
        }
      }
      for (const s of [...map.spawns.blue, ...map.spawns.red]) {
        expect(getTile(map.grid, Math.floor(s.x), Math.floor(s.y))).toBe(TileType.EMPTY);
      }
    }
  });

  it('pushes circles out of solid/breakable walls and water, detects bushes, and only destroys breakable walls', () => {
    const grid = createGridCopy('crystal-cavern');
    const pushed = resolveCircleGridCollision(grid, { x: 0.9, y: 16.5 }, 0.42);
    expect(pushed.x).toBeGreaterThanOrEqual(1.41);

    grid[5 * MAP_WIDTH + 5] = TileType.WALL_BREAKABLE;
    grid[5 * MAP_WIDTH + 6] = TileType.WALL_SOLID;
    grid[6 * MAP_WIDTH + 5] = TileType.BUSH;

    expect(isPointInBush(grid, 5.5, 6.5)).toBe(true);
    const broken = destroyBreakableWallsInRadius(grid, 5.5, 5.5, 1.4);
    expect(broken).toContainEqual({ tx: 5, ty: 5 });
    expect(getTile(grid, 5, 5)).toBe(TileType.EMPTY);
    expect(getTile(grid, 6, 5)).toBe(TileType.WALL_SOLID);
  });
});
