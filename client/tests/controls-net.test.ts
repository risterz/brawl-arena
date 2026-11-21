import { describe, it, expect } from 'vitest';
import { InputThrottle, detectCoarseTouchPointer } from '../src/input/controls';
import { LocalMatchController } from '../src/net/localController';

describe('Input throttling and Local Solo controller', () => {
  it('suppresses unchanged idle inputs except 1.0s keepalive and enforces 20Hz cap', () => {
    // Review Focus #5: no 60Hz idle WS spam
    const throttle = new InputThrottle();
    const idle = {
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      fire: false,
      superFire: false,
      autoAim: false,
    };
    expect(throttle.shouldSend(idle, 0)).toBe(true);
    expect(throttle.shouldSend(idle, 16)).toBe(false);
    expect(throttle.shouldSend(idle, 500)).toBe(false);
    expect(throttle.shouldSend(idle, 1005)).toBe(true);

    // Changing input within 50ms waits for 20Hz window unless fire/super edge triggers
    const moving = { ...idle, moveX: 1 };
    expect(throttle.shouldSend(moving, 1020)).toBe(false);
    expect(throttle.shouldSend(moving, 1060)).toBe(true);
    const firing = { ...moving, fire: true };
    expect(throttle.shouldSend(firing, 1070)).toBe(true);
  });

  it('runs a local Solo vs Bots match with 1 human and 5 distinct bots without network calls', () => {
    const local = new LocalMatchController({
      mapId: 'crystal-cavern',
      playerBrawler: 'buck',
      playerName: 'You',
    });
    expect(local.getState().brawlers).toHaveLength(6);
    expect(local.getState().brawlers[0].isBot).toBe(false);
    expect(local.getState().brawlers.slice(1).every((b) => b.isBot)).toBe(true);
    local.tick(0.05, {
      moveX: 0,
      moveY: -1,
      aimAngle: -Math.PI / 2,
      fire: true,
      superFire: false,
      autoAim: false,
    });
    expect(local.getState().elapsed).toBeCloseTo(0.05, 5);
  });

  it('I1: keeps desktop touchscreen laptops with fine pointer out of touch-only mode', () => {
    expect(detectCoarseTouchPointer({ coarsePointer: false, anyFinePointer: true, maxTouchPoints: 10 })).toBe(false);
    expect(detectCoarseTouchPointer({ coarsePointer: true, anyFinePointer: false, maxTouchPoints: 5 })).toBe(true);
  });
});
