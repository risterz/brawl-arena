import { MAP_HEIGHT, MAP_WIDTH, Team, Vec2 } from '@brawl-arena/shared';

export const CAMERA_FOV = 32;
export const CAMERA_HEIGHT = 18.5;
export const CAMERA_OFFSET_Z = 14.5; // ~52 degree downward pitch

export function screenDirToWorldDir(dx: number, dy: number, team: Team): Vec2 {
  if (team === 'red') {
    return {
      x: dx === 0 ? 0 : -dx,
      y: dy === 0 ? 0 : -dy,
    };
  }
  return {
    x: dx === 0 ? 0 : dx,
    y: dy === 0 ? 0 : dy,
  };
}

export function screenAimToWorldAngle(dx: number, dy: number, team: Team): number {
  const dir = screenDirToWorldDir(dx, dy, team);
  return Math.atan2(dir.y, dir.x);
}

export function worldPosToCameraTarget(
  x: number,
  y: number,
  team: Team,
): { camX: number; camY: number; camZ: number; lookX: number; lookZ: number } {
  const lookX = Math.max(5.5, Math.min(MAP_WIDTH - 5.5, x));
  const lookZ = Math.max(6.0, Math.min(MAP_HEIGHT - 6.0, y));
  const zSign = team === 'blue' ? 1 : -1;

  return {
    camX: lookX,
    camY: CAMERA_HEIGHT,
    camZ: lookZ + zSign * CAMERA_OFFSET_Z,
    lookX,
    lookZ,
  };
}
