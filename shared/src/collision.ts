import { MAP_HEIGHT, MAP_WIDTH } from './maps';
import { TileType, Vec2 } from './types';

export function getTile(grid: Uint8Array, tx: number, ty: number): TileType {
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) {
    return TileType.WALL_SOLID;
  }
  return grid[ty * MAP_WIDTH + tx] as TileType;
}

export function setTile(grid: Uint8Array, tx: number, ty: number, tile: TileType): void {
  if (tx < 0 || ty < 0 || tx >= MAP_WIDTH || ty >= MAP_HEIGHT) return;
  grid[ty * MAP_WIDTH + tx] = tile;
}

export function isTileBlockingMovement(tile: TileType, ignoreWater = false): boolean {
  if (tile === TileType.WALL_BREAKABLE || tile === TileType.WALL_SOLID || tile === TileType.GEM_MINE) {
    return true;
  }
  if (!ignoreWater && tile === TileType.WATER) {
    return true;
  }
  return false;
}

export function isTileBlockingProjectile(tile: TileType): boolean {
  return tile === TileType.WALL_BREAKABLE || tile === TileType.WALL_SOLID || tile === TileType.GEM_MINE;
}

export function isPointInBush(grid: Uint8Array, x: number, y: number): boolean {
  return getTile(grid, Math.floor(x), Math.floor(y)) === TileType.BUSH;
}

export function resolveCircleGridCollision(
  grid: Uint8Array,
  pos: Vec2,
  radius: number,
  ignoreWater = false,
): Vec2 {
  let x = Math.max(1 + radius, Math.min(MAP_WIDTH - 1 - radius, pos.x));
  let y = Math.max(1 + radius, Math.min(MAP_HEIGHT - 1 - radius, pos.y));

  for (let pass = 0; pass < 3; pass++) {
    const minTx = Math.floor(x - radius) - 1;
    const maxTx = Math.floor(x + radius) + 1;
    const minTy = Math.floor(y - radius) - 1;
    const maxTy = Math.floor(y + radius) + 1;

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tile = getTile(grid, tx, ty);
        if (!isTileBlockingMovement(tile, ignoreWater)) continue;

        const closestX = Math.max(tx, Math.min(x, tx + 1));
        const closestY = Math.max(ty, Math.min(y, ty + 1));
        const dx = x - closestX;
        const dy = y - closestY;
        const distSq = dx * dx + dy * dy;

        if (distSq < radius * radius) {
          if (distSq > 1e-8) {
            const dist = Math.sqrt(distSq);
            const push = radius - dist;
            x += (dx / dist) * push;
            y += (dy / dist) * push;
          } else {
            // Center inside tile: push out along nearest edge
            const left = x - tx;
            const right = tx + 1 - x;
            const top = y - ty;
            const bottom = ty + 1 - y;
            const m = Math.min(left, right, top, bottom);
            if (m === left) x = tx - radius;
            else if (m === right) x = tx + 1 + radius;
            else if (m === top) y = ty - radius;
            else y = ty + 1 + radius;
          }
        }
      }
    }
  }

  return {
    x: Math.max(1 + radius, Math.min(MAP_WIDTH - 1 - radius, x)),
    y: Math.max(1 + radius, Math.min(MAP_HEIGHT - 1 - radius, y)),
  };
}

export function destroyBreakableWallsInRadius(
  grid: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
): Array<{ tx: number; ty: number }> {
  const broken: Array<{ tx: number; ty: number }> = [];
  const minTx = Math.max(1, Math.floor(cx - radius));
  const maxTx = Math.min(MAP_WIDTH - 2, Math.floor(cx + radius));
  const minTy = Math.max(1, Math.floor(cy - radius));
  const maxTy = Math.min(MAP_HEIGHT - 2, Math.floor(cy + radius));
  const rSq = radius * radius;

  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (getTile(grid, tx, ty) !== TileType.WALL_BREAKABLE) continue;
      const closestX = Math.max(tx, Math.min(cx, tx + 1));
      const closestY = Math.max(ty, Math.min(cy, ty + 1));
      const dx = cx - closestX;
      const dy = cy - closestY;
      if (dx * dx + dy * dy <= rSq) {
        setTile(grid, tx, ty, TileType.EMPTY);
        broken.push({ tx, ty });
      }
    }
  }
  return broken;
}
