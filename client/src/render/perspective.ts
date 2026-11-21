import {
  isBrawlerVisibleToTeam,
  MAP_HEIGHT,
  MAP_WIDTH,
  MatchEvent,
  MatchState,
  Team,
  Vec2,
} from '@brawl-arena/shared';

export const CAMERA_FOV = 32;
export const CAMERA_HEIGHT = 18.5;
export const CAMERA_OFFSET_Z = 14.5; // ~52 degree downward pitch

export interface CameraTargetState {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookZ: number;
}

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
): CameraTargetState {
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

export function stepCameraFollow(
  current: CameraTargetState,
  x: number,
  y: number,
  team: Team,
  dt: number,
  snapped: boolean,
): CameraTargetState {
  const target = worldPosToCameraTarget(x, y, team);
  if (!snapped) {
    return target;
  }
  const alpha = Math.min(1, dt * 8.5);
  return {
    camX: current.camX + (target.camX - current.camX) * alpha,
    camY: current.camY + (target.camY - current.camY) * alpha,
    camZ: current.camZ + (target.camZ - current.camZ) * alpha,
    lookX: current.lookX + (target.lookX - current.lookX) * alpha,
    lookZ: current.lookZ + (target.lookZ - current.lookZ) * alpha,
  };
}

export function shouldRenderEventVfx(
  event: MatchEvent,
  state: MatchState | null,
  viewerTeam: Team,
): boolean {
  if (!state) return true;
  if (event.type === 'heal' || event.type === 'hit') {
    const target = state.brawlers[event.targetSlot];
    if (!target) return true;
    return isBrawlerVisibleToTeam(state, target, viewerTeam);
  }
  return true;
}
