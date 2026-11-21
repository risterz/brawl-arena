import { getTile, isTileBlockingMovement } from './collision';
import { MAP_HEIGHT, MAP_WIDTH } from './maps';
import { Vec2 } from './types';

const DIRS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function isWalkable(grid: Uint8Array, tx: number, ty: number): boolean {
  if (tx < 1 || ty < 1 || tx >= MAP_WIDTH - 1 || ty >= MAP_HEIGHT - 1) return false;
  return !isTileBlockingMovement(getTile(grid, tx, ty), false);
}

function findNearestWalkable(grid: Uint8Array, tx: number, ty: number): [number, number] {
  if (isWalkable(grid, tx, ty)) return [tx, ty];
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        if (isWalkable(grid, tx + dx, ty + dy)) return [tx + dx, ty + dy];
      }
    }
  }
  return [10, 14];
}

export function findNextWaypoint(grid: Uint8Array, from: Vec2, to: Vec2): Vec2 {
  const [sx, sy] = findNearestWalkable(grid, Math.floor(from.x), Math.floor(from.y));
  const [gx, gy] = findNearestWalkable(grid, Math.floor(to.x), Math.floor(to.y));

  if (sx === gx && sy === gy) {
    return { x: to.x, y: to.y };
  }

  const total = MAP_WIDTH * MAP_HEIGHT;
  const visited = new Uint8Array(total);
  const parent = new Int16Array(total).fill(-1);
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;

  const startIdx = sy * MAP_WIDTH + sx;
  const goalIdx = gy * MAP_WIDTH + gx;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  let found = false;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goalIdx) {
      found = true;
      break;
    }
    const cx = cur % MAP_WIDTH;
    const cy = (cur - cx) / MAP_WIDTH;

    for (let i = 0; i < DIRS.length; i++) {
      const dx = DIRS[i][0];
      const dy = DIRS[i][1];
      const nx = cx + dx;
      const ny = cy + dy;
      if (!isWalkable(grid, nx, ny)) continue;
      // Prevent corner clipping on diagonals
      if (dx !== 0 && dy !== 0) {
        if (!isWalkable(grid, cx + dx, cy) || !isWalkable(grid, cx, cy + dy)) continue;
      }
      const nIdx = ny * MAP_WIDTH + nx;
      if (visited[nIdx]) continue;
      visited[nIdx] = 1;
      parent[nIdx] = cur;
      queue[tail++] = nIdx;
    }
  }

  if (!found) {
    return { x: sx + 0.5, y: sy + 0.5 };
  }

  // Backtrack to find the first step (or 2nd step if clear) from start
  let node = goalIdx;
  let prev = goalIdx;
  while (parent[node] !== -1 && parent[node] !== startIdx) {
    prev = node;
    node = parent[node];
  }
  const chosen = parent[node] === startIdx ? node : prev;
  const wx = chosen % MAP_WIDTH;
  const wy = (chosen - wx) / MAP_WIDTH;
  return { x: wx + 0.5, y: wy + 0.5 };
}
