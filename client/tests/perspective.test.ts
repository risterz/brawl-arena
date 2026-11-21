import { describe, it, expect } from 'vitest';
import {
  screenDirToWorldDir,
  screenAimToWorldAngle,
  worldPosToCameraTarget,
} from '../src/render/perspective';

describe('Team perspective flip (Blue bottom-up, Red 180-deg rotated)', () => {
  it('maps screen-up (0, -1) toward center mine (-y for Blue, +y for Red)', () => {
    expect(screenDirToWorldDir(0, -1, 'blue')).toEqual({ x: 0, y: -1 });
    expect(screenDirToWorldDir(0, -1, 'red')).toEqual({ x: 0, y: 1 });
    expect(screenDirToWorldDir(1, 0, 'blue')).toEqual({ x: 1, y: 0 });
    expect(screenDirToWorldDir(1, 0, 'red')).toEqual({ x: -1, y: 0 });
  });

  it('flips aim angle by PI for Red team and positions camera behind player team', () => {
    const blueUp = screenAimToWorldAngle(0, -1, 'blue');
    const redUp = screenAimToWorldAngle(0, -1, 'red');
    expect(blueUp).toBeCloseTo(-Math.PI / 2, 5);
    expect(redUp).toBeCloseTo(Math.PI / 2, 5);

    const blueCam = worldPosToCameraTarget(10.5, 25, 'blue');
    const redCam = worldPosToCameraTarget(10.5, 8, 'red');
    expect(blueCam.camZ).toBeGreaterThan(25);
    expect(redCam.camZ).toBeLessThan(8);
  });
});
