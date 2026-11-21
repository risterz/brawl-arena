import { describe, it, expect } from 'vitest';
import { MatchEngine, TileType, MAP_WIDTH } from '@brawl-arena/shared';
import {
  screenDirToWorldDir,
  screenAimToWorldAngle,
  worldPosToCameraTarget,
  shouldRenderEventVfx,
  stepCameraFollow,
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

  it('I2: hides heal and hit VFX for concealed bush enemies beyond 2.2 tiles', () => {
    const engine = new MatchEngine({
      mapId: 'crystal-cavern',
      slots: [
        { slotIndex: 0, team: 'blue', name: 'B1', isBot: false, brawlerId: 'buck' },
        { slotIndex: 1, team: 'blue', name: 'B2', isBot: true, brawlerId: 'vex' },
        { slotIndex: 2, team: 'blue', name: 'B3', isBot: true, brawlerId: 'lumi' },
        { slotIndex: 3, team: 'red', name: 'R1', isBot: true, brawlerId: 'blaze' },
        { slotIndex: 4, team: 'red', name: 'R2', isBot: true, brawlerId: 'golem' },
        { slotIndex: 5, team: 'red', name: 'R3', isBot: true, brawlerId: 'mort' },
      ],
    });
    engine.state.grid[10 * MAP_WIDTH + 5] = TileType.BUSH;
    engine.state.brawlers[3].x = 5.5;
    engine.state.brawlers[3].y = 10.5;
    engine.state.brawlers[0].x = 5.5;
    engine.state.brawlers[0].y = 20.5;

    expect(
      shouldRenderEventVfx(
        { type: 'heal', targetSlot: 3, amount: 400, x: 5.5, y: 10.5 },
        engine.state,
        'blue',
      ),
    ).toBe(false);
    expect(
      shouldRenderEventVfx(
        { type: 'heal', targetSlot: 3, amount: 400, x: 5.5, y: 10.5 },
        engine.state,
        'red',
      ),
    ).toBe(true);
  });

  it('I3: snaps camera directly to Red spawn on first frame without sweeping from Blue side', () => {
    const current = { camX: 10.5, camY: 18.5, camZ: 32, lookX: 10.5, lookZ: 18 };
    const snapped = stepCameraFollow(current, 10.5, 2.5, 'red', 0.016, false);
    const target = worldPosToCameraTarget(10.5, 2.5, 'red');
    expect(snapped.camZ).toBe(target.camZ);
    expect(snapped.lookZ).toBe(target.lookZ);
  });
});
