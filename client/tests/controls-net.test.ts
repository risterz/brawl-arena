import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRAWLER_LIST, MatchEngine, serializeSnapshot } from '@brawl-arena/shared';
import { SFX_URLS } from '../src/audio/sfx';
import { InputThrottle, detectCoarseTouchPointer } from '../src/input/controls';
import { LocalMatchController } from '../src/net/localController';
import { OnlineMatchController } from '../src/net/onlineController';

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

  it('Review Focus #4: OnlineMatchController smoothly advances local Kage dash at 60fps outside the 75ms interp buffer and resumes walk immediately when dash clears', () => {
    const engine = new MatchEngine({
      mapId: 'crystal-cavern',
      slots: [
        { slotIndex: 0, team: 'blue', name: 'KageMe', isBot: false, brawlerId: 'kage' },
        { slotIndex: 1, team: 'red', name: 'BotRed', isBot: true, brawlerId: 'golem' },
      ],
    });
    const kage = engine.state.brawlers[0];
    kage.x = 10.5;
    kage.y = 20.0;

    const online = new OnlineMatchController({
      onLobby: () => {},
      onMatchStart: () => {},
      onEvents: () => {},
      onError: () => {},
      onDisconnect: () => {},
    });

    const idleInput = {
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      fire: false,
      superFire: false,
      autoAim: false,
    };

    // Initial snapshot at t=1000ms (no dash)
    const snap0 = serializeSnapshot(engine.state, [], 1, []);
    online.ingestSnapshotForTest(snap0, 1000, 0);

    // Trigger Shadow Dash East at t=1050ms -> latest snapshot carries dash even while renderTime = now - 75ms lags behind
    engine.setInput(0, { ...idleInput, aimAngle: 0, fire: true });
    engine.step(0.05);
    const snapDash = serializeSnapshot(engine.state, [], 2, []);
    expect(snapDash.brawlers[0].dash).not.toBeNull();
    online.ingestSnapshotForTest(snapDash, 1050, 0);

    // Tick immediately at 60fps (dt=0.016) -> must advance smoothly East along dash velocity without waiting 75ms!
    const st1 = online.tick(0.016, idleInput, 1066)!;
    expect(st1.brawlers[0].dash).not.toBeNull();
    expect(st1.brawlers[0].x).toBeGreaterThan(10.68);
    expect(st1.brawlers[0].x).toBeLessThan(11.0);

    // Clear dash in latest snapshot at t=1230ms -> normal WASD walk North (-Y) must resume immediately!
    engine.setInput(0, idleInput);
    for (let i = 0; i < 6; i++) engine.step(0.05);
    expect(engine.state.brawlers[0].dash).toBeNull();
    const snapDone = serializeSnapshot(engine.state, [], 8, []);
    online.ingestSnapshotForTest(snapDone, 1230, 0);

    const yBeforeWalk = online.getState()!.brawlers[0].y;
    const stWalk = online.tick(0.05, { ...idleInput, moveY: -1 }, 1246)!;
    expect(stWalk.brawlers[0].dash).toBeNull();
    expect(stWalk.brawlers[0].y).toBeLessThan(yBeforeWalk - 0.1);
  });

  it('Review Focus #5: registers SFX_URLS and valid mp3 audio files for every brawler including kage', () => {
    const audioDir = path.resolve(__dirname, '../public/audio');
    for (const b of BRAWLER_LIST) {
      const url = SFX_URLS[b.id];
      expect(url, `Missing SFX_URLS entry for ${b.id}`).toBe(`/audio/sfx_${b.id}.mp3`);
      const fullPath = path.join(audioDir, `sfx_${b.id}.mp3`);
      expect(fs.existsSync(fullPath), `Missing audio file: ${fullPath}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(500);
    }
  });
});
