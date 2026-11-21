import { describe, it, expect } from 'vitest';
import {
  BotController,
  BRAWL_BALL_MAX_DURATION,
  BRAWL_BALL_RESET_DURATION,
  getTile,
  MAP_HEIGHT,
  MAP_WIDTH,
  MatchEngine,
  SlotSetup,
  TileType,
} from '../src';

function createBrawlBallMatch(mapId: 'crystal-cavern' | 'twin-bridges' | 'iron-foundry' = 'crystal-cavern') {
  const slots: SlotSetup[] = [
    { slotIndex: 0, team: 'blue', name: 'Blue1', isBot: false, brawlerId: 'buck' },
    { slotIndex: 1, team: 'blue', name: 'Blue2', isBot: true, brawlerId: 'vex' },
    { slotIndex: 2, team: 'blue', name: 'Blue3', isBot: true, brawlerId: 'lumi' },
    { slotIndex: 3, team: 'red', name: 'Red1', isBot: true, brawlerId: 'golem' },
    { slotIndex: 4, team: 'red', name: 'Red2', isBot: true, brawlerId: 'blaze' },
    { slotIndex: 5, team: 'red', name: 'Red3', isBot: true, brawlerId: 'mort' },
  ];
  return new MatchEngine({ mapId, mode: 'brawl-ball', slots, seed: 42 });
}

describe('Brawl Ball (3v3) simulation & Bot AI', () => {
  it('initializes center ball, open goal mouths, and kickoff spawns across all maps', () => {
    for (const mapId of ['crystal-cavern', 'twin-bridges', 'iron-foundry'] as const) {
      const engine = createBrawlBallMatch(mapId);
      const { state } = engine;
      expect(state.mode).toBe('brawl-ball');
      expect(state.maxDuration).toBe(BRAWL_BALL_MAX_DURATION);
      expect(state.ball).not.toBeNull();
      expect(state.ball!.x).toBeCloseTo(MAP_WIDTH / 2, 2);
      expect(state.ball!.y).toBeCloseTo(MAP_HEIGHT / 2, 2);
      expect(state.ball!.holderSlot).toBeNull();
      // North & South goal mouths should be open empty tiles
      expect(getTile(state.grid, 10, 0)).toBe(TileType.EMPTY);
      expect(getTile(state.grid, 10, MAP_HEIGHT - 1)).toBe(TileType.EMPTY);
      expect(getTile(state.grid, 10, 1)).toBe(TileType.EMPTY);
      expect(getTile(state.grid, 10, MAP_HEIGHT - 2)).toBe(TileType.EMPTY);
    }
  });

  it('allows dribbling on touch, kicking with primary attack, and bouncing off walls', () => {
    const engine = createBrawlBallMatch('crystal-cavern');
    const blue0 = engine.state.brawlers[0];
    const ball = engine.state.ball!;
    // Place blue0 & ball near East side wall so primary kick hits wall and rebounds
    blue0.x = 17.5;
    blue0.y = 16.5;
    ball.x = 17.5;
    ball.y = 16.5;
    engine.step(0.05);
    expect(ball.holderSlot).toBe(0);

    // Kick ball directly East toward the side wall (x = 20)
    const ammoBefore = blue0.ammo;
    engine.setInput(0, {
      moveX: 0,
      moveY: 0,
      aimAngle: 0,
      fire: true,
      superFire: false,
      autoAim: false,
    });
    const events = engine.step(0.05);
    expect(ball.holderSlot).toBeNull();
    expect(ball.vx).toBeGreaterThan(10);
    expect(blue0.ammo).toBeLessThan(ammoBefore);
    expect(events.some((e) => e.type === 'ball_kick' && !e.isSuper)).toBe(true);

    // Let ball travel until it bounces off the East wall (vx flips negative)
    engine.setInput(0, { moveX: 0, moveY: 0, aimAngle: 0, fire: false, superFire: false, autoAim: false });
    let bounced = false;
    for (let i = 0; i < 30; i++) {
      engine.step(0.05);
      if (ball.vx < -1) {
        bounced = true;
        break;
      }
    }
    expect(bounced).toBe(true);
  });

  it('Super-Kick consumes 100 Super, shoots faster, and smashes breakable walls', () => {
    const engine = createBrawlBallMatch('crystal-cavern');
    const blue0 = engine.state.brawlers[0];
    const ball = engine.state.ball!;

    // Place a breakable wall directly north of center so the Super-Kick hits it
    engine.state.grid[14 * MAP_WIDTH + 10] = TileType.WALL_BREAKABLE;
    blue0.x = 10.5;
    blue0.y = 16.5;
    blue0.superCharge = 100;
    ball.x = 10.5;
    ball.y = 16.5;
    engine.step(0.05);
    expect(ball.holderSlot).toBe(0);

    // Super-Kick straight North (-PI/2)
    engine.setInput(0, {
      moveX: 0,
      moveY: 0,
      aimAngle: -Math.PI / 2,
      fire: false,
      superFire: true,
      autoAim: false,
    });
    const kickEvents = engine.step(0.05);
    expect(blue0.superCharge).toBe(0);
    expect(ball.isSuperKick).toBe(true);
    expect(kickEvents.some((e) => e.type === 'ball_kick' && e.isSuper)).toBe(true);

    let brokeWall = kickEvents.some((e) => e.type === 'wall_break');
    engine.setInput(0, { moveX: 0, moveY: 0, aimAngle: -Math.PI / 2, fire: false, superFire: false, autoAim: false });
    for (let i = 0; i < 15 && !brokeWall; i++) {
      const evs = engine.step(0.05);
      if (evs.some((e) => e.type === 'wall_break')) {
        brokeWall = true;
      }
    }
    expect(brokeWall).toBe(true);
    expect(getTile(engine.state.grid, 10, 14)).toBe(TileType.EMPTY);
  });

  it('prevents own-goals, scores on enemy goal, resets kickoff, and ends match at 2 goals', () => {
    const engine = createBrawlBallMatch('crystal-cavern');
    const ball = engine.state.ball!;

    // Test anti-own-goal: Blue kicks ball into South (Blue's own) goal
    ball.holderSlot = null;
    ball.lastTouchTeam = 'blue';
    ball.lastTouchSlot = 0;
    ball.x = 10.5;
    ball.y = 31.6;
    ball.vx = 0;
    ball.vy = 14;
    engine.step(0.05);
    expect(engine.state.redGems).toBe(0);
    expect(ball.vy).toBeLessThan(0); // bounced back out safely

    // Goal #1 for Blue at North goal (y <= 1.08)
    ball.x = 10.5;
    ball.y = 1.4;
    ball.vx = 0;
    ball.vy = -14;
    ball.lastTouchTeam = 'blue';
    ball.lastTouchSlot = 0;
    const g1Events = engine.step(0.05);
    expect(engine.state.blueGems).toBe(1);
    expect(engine.state.brawlers[0].stats.gemsCollected).toBe(1);
    expect(engine.state.goalResetTimer).toBeCloseTo(BRAWL_BALL_RESET_DURATION, 2);
    expect(engine.state.lastGoalTeam).toBe('blue');
    expect(g1Events.some((e) => e.type === 'goal' && e.team === 'blue')).toBe(true);
    expect(engine.state.phase).toBe('playing');

    // Advance past reset timer -> ball resets to center
    for (let i = 0; i < 45; i++) engine.step(0.05);
    expect(engine.state.goalResetTimer).toBe(0);
    expect(ball.x).toBeCloseTo(MAP_WIDTH / 2, 1);
    expect(ball.y).toBeCloseTo(MAP_HEIGHT / 2, 1);

    // Goal #2 for Blue -> instant Victory!
    ball.x = 10.5;
    ball.y = 1.4;
    ball.vx = 0;
    ball.vy = -14;
    ball.lastTouchTeam = 'blue';
    ball.lastTouchSlot = 0;
    engine.step(0.05);
    expect(engine.state.blueGems).toBe(2);
    expect(engine.state.phase).toBe('ended');
    expect(engine.state.winner).toBe('blue');
  });

  it('triggers Overtime on a tie at regulation end, smashing all breakable walls, and next goal wins', () => {
    const engine = createBrawlBallMatch('crystal-cavern');
    engine.state.elapsed = BRAWL_BALL_MAX_DURATION - 0.02;
    engine.state.blueGems = 1;
    engine.state.redGems = 1;

    // Ensure at least one breakable wall exists prior to Overtime
    const breakableBefore = engine.state.grid.filter((t) => t === TileType.WALL_BREAKABLE).length;
    expect(breakableBefore).toBeGreaterThan(0);

    const events = engine.step(0.05);
    expect(engine.state.phase).toBe('sudden_death');
    expect(events.some((e) => e.type === 'wall_break')).toBe(true);
    const breakableAfter = engine.state.grid.filter((t) => t === TileType.WALL_BREAKABLE).length;
    expect(breakableAfter).toBe(0);

    // Next goal in Overtime ends match immediately
    const ball = engine.state.ball!;
    ball.x = 10.5;
    ball.y = 31.6;
    ball.vx = 0;
    ball.vy = 14;
    ball.lastTouchTeam = 'red';
    ball.lastTouchSlot = 3;
    engine.step(0.05);
    expect(engine.state.redGems).toBe(2);
    expect(engine.state.phase).toBe('ended');
    expect(engine.state.winner).toBe('red');
  });

  it('runs a full 60-second 3v3 Brawl Ball bot match cleanly with active ball touches and kicks', () => {
    const slots: SlotSetup[] = [
      { slotIndex: 0, team: 'blue', name: 'B0', isBot: true, brawlerId: 'buck' },
      { slotIndex: 1, team: 'blue', name: 'B1', isBot: true, brawlerId: 'vex' },
      { slotIndex: 2, team: 'blue', name: 'B2', isBot: true, brawlerId: 'lumi' },
      { slotIndex: 3, team: 'red', name: 'R0', isBot: true, brawlerId: 'golem' },
      { slotIndex: 4, team: 'red', name: 'R1', isBot: true, brawlerId: 'blaze' },
      { slotIndex: 5, team: 'red', name: 'R2', isBot: true, brawlerId: 'mort' },
    ];
    const engine = new MatchEngine({ mapId: 'iron-foundry', mode: 'brawl-ball', slots, seed: 2026 });
    const ai = new BotController();

    let kicks = 0;
    let touches = 0;
    for (let tick = 0; tick < 60 * 20; tick++) {
      if (engine.state.phase === 'ended') break;
      const inputs = ai.computeInputs(engine.state, 0.05);
      for (const [slot, inp] of inputs) {
        engine.setInput(slot, inp);
      }
      const events = engine.step(0.05);
      if (engine.state.ball?.holderSlot !== null) touches++;
      for (const ev of events) {
        if (ev.type === 'ball_kick') kicks++;
      }
    }

    expect(touches).toBeGreaterThan(20);
    expect(kicks).toBeGreaterThan(0);
    for (const b of engine.state.brawlers) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
    }
    expect(Number.isFinite(engine.state.ball!.x)).toBe(true);
    expect(Number.isFinite(engine.state.ball!.y)).toBe(true);
  });
});
