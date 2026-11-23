import { describe, it, expect } from 'vitest';
import {
  BRAWLER_LIST,
  BRAWLERS,
  getTile,
  MAP_WIDTH,
  MatchEngine,
  serializeSnapshot,
  SlotSetup,
  TileType,
} from '../src';

function createKageSlots(brawlerRed: SlotSetup['brawlerId'] = 'golem'): SlotSetup[] {
  return [
    { slotIndex: 0, team: 'blue', name: 'KageP1', isBot: false, brawlerId: 'kage' },
    { slotIndex: 1, team: 'red', name: 'Enemy1', isBot: false, brawlerId: brawlerRed },
    { slotIndex: 2, team: 'red', name: 'Enemy2', isBot: false, brawlerId: 'buck' },
  ];
}

function emptyInput(overrides: Partial<Parameters<MatchEngine['setInput']>[1]> = {}) {
  return {
    moveX: 0,
    moveY: 0,
    aimAngle: 0,
    fire: false,
    superFire: false,
    autoAim: false,
    ...overrides,
  };
}

describe('Kage (Shadow Assassin) config, Shadow Dash, and Phantom Slash', () => {
  it('registers kage in BRAWLERS and BRAWLER_LIST (7 brawlers total) with spec stats', () => {
    expect(BRAWLER_LIST).toHaveLength(7);
    const kage = BRAWLERS.kage;
    expect(kage).toBeDefined();
    expect(kage.id).toBe('kage');
    expect(kage.name).toBe('Kage');
    expect(kage.role).toBe('Assassin');
    expect(kage.primaryColor).toBe('#1b3b4b');
    expect(kage.accentColor).toBe('#ff2e63');
    expect(kage.maxHp).toBe(3600);
    expect(kage.moveSpeed).toBe(4.35);
    expect(kage.radius).toBe(0.39);
    expect(kage.maxAmmo).toBe(3);
    expect(kage.reloadTime).toBe(1.85);
    expect(kage.attackCooldown).toBe(0.28);
    expect(kage.attack.isDash).toBe(true);
    expect(kage.attack.range).toBe(2.7);
    expect(kage.attack.damage).toBe(1200);
    expect(kage.superAttack.passesWalls).toBe(true);
    expect(kage.superAttack.lifestealRatio).toBe(0.8);
    expect(kage.superAttack.damage).toBe(1300);
  });

  it('Shadow Dash lunges ~2.7 tiles over 0.18s, pierces 2 lined-up enemies once each, skips body separation, and clears on finish', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots('golem') });
    // Clear an open horizontal corridor at y = 7
    for (let x = 3; x <= 17; x++) {
      engine.state.grid[7 * MAP_WIDTH + x] = TileType.EMPTY;
    }
    const kage = engine.state.brawlers[0];
    const e1 = engine.state.brawlers[1];
    const e2 = engine.state.brawlers[2];
    kage.x = 6.0;
    kage.y = 7.5;
    e1.x = 7.1;
    e1.y = 7.5;
    e2.x = 8.2;
    e2.y = 7.5;

    const e1HpBefore = e1.hp;
    const e2HpBefore = e2.hp;

    engine.setInput(0, emptyInput({ aimAngle: 0, fire: true }));
    engine.step(0.03);
    expect(kage.dash).not.toBeNull();

    // Release fire and finish the 0.18s dash across 60Hz ticks
    engine.setInput(0, emptyInput({ aimAngle: 0 }));
    for (let i = 0; i < 14; i++) {
      engine.step(0.016);
    }

    expect(kage.dash).toBeNull();
    // Lunged roughly 2.7 tiles East without getting pushed backward by enemies
    expect(kage.x).toBeGreaterThan(8.45);
    expect(kage.x).toBeLessThan(9.05);
    // Each enemy hit exactly once for 1200 damage
    expect(e1HpBefore - e1.hp).toBe(1200);
    expect(e2HpBefore - e2.hp).toBe(1200);
    // 25 super charge per hit -> 50 total
    expect(kage.superCharge).toBe(50);
  });

  it('Review Focus #1: Shadow Dash stops cleanly at solid walls, breakable walls, diagonal wall corners, and water without tunneling', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots() });
    const kage = engine.state.brawlers[0];
    engine.state.brawlers[1].x = 18.5;
    engine.state.brawlers[1].y = 2.5;
    engine.state.brawlers[2].x = 18.5;
    engine.state.brawlers[2].y = 2.5;

    // 1. Diagonal corner wall trap: walls at (10, 7) and (9, 8); dash NE/SE into corner
    for (let y = 5; y <= 10; y++) {
      for (let x = 7; x <= 12; x++) {
        engine.state.grid[y * MAP_WIDTH + x] = TileType.EMPTY;
      }
    }
    engine.state.grid[7 * MAP_WIDTH + 10] = TileType.WALL_SOLID;
    engine.state.grid[8 * MAP_WIDTH + 9] = TileType.WALL_BREAKABLE;
    kage.x = 9.4;
    kage.y = 7.4;

    engine.setInput(0, emptyInput({ aimAngle: Math.PI / 4, fire: true }));
    engine.step(0.05);
    engine.setInput(0, emptyInput({ aimAngle: Math.PI / 4 }));
    for (let i = 0; i < 6; i++) engine.step(0.05);

    const endTile = getTile(engine.state.grid, Math.floor(kage.x), Math.floor(kage.y));
    expect(endTile).toBe(TileType.EMPTY);
    // Must not squeeze diagonally across (9,8)-(10,7) into (10,8)
    expect(kage.x < 10.0 || kage.y < 8.0).toBe(true);

    // 2. Water tile directly ahead
    engine.state.grid[7 * MAP_WIDTH + 10] = TileType.WATER;
    engine.state.grid[8 * MAP_WIDTH + 9] = TileType.EMPTY;
    kage.x = 9.2;
    kage.y = 7.5;
    kage.ammo = 3;
    kage.attackCooldown = 0;

    engine.setInput(0, emptyInput({ aimAngle: 0, fire: true }));
    engine.step(0.05);
    engine.setInput(0, emptyInput({ aimAngle: 0 }));
    for (let i = 0; i < 6; i++) engine.step(0.05);

    expect(kage.x).toBeLessThan(10.0);
    expect(getTile(engine.state.grid, Math.floor(kage.x), Math.floor(kage.y))).toBe(TileType.EMPTY);
  });

  it('cancels active Shadow Dash when hit by enemy knockback', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots('buck') });
    for (let x = 4; x <= 14; x++) {
      engine.state.grid[7 * MAP_WIDTH + x] = TileType.EMPTY;
    }
    const kage = engine.state.brawlers[0];
    const buck = engine.state.brawlers[1];
    kage.x = 6.5;
    kage.y = 7.5;
    buck.x = 9.8;
    buck.y = 7.5;
    buck.superCharge = 100;

    // Kage starts dash East while Buck fires knockback Super West
    engine.setInput(0, emptyInput({ aimAngle: 0, fire: true }));
    engine.setInput(1, emptyInput({ aimAngle: Math.PI, superFire: true }));
    engine.step(0.05);
    expect(kage.dash).not.toBeNull();

    engine.setInput(0, emptyInput());
    engine.setInput(1, emptyInput());
    engine.step(0.05);
    engine.step(0.05);
    expect(kage.dash).toBeNull();
  });

  it('Phantom Slash passes through solid and breakable walls, hits an enemy once across the 3-projectile wave, and heals 80% of actual damage dealt', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots('golem') });
    for (let x = 4; x <= 16; x++) {
      engine.state.grid[7 * MAP_WIDTH + x] = TileType.EMPTY;
    }
    // Place both solid and breakable walls between Kage and enemy
    engine.state.grid[7 * MAP_WIDTH + 8] = TileType.WALL_SOLID;
    engine.state.grid[7 * MAP_WIDTH + 9] = TileType.WALL_BREAKABLE;

    const kage = engine.state.brawlers[0];
    const enemy = engine.state.brawlers[1];
    engine.state.brawlers[2].x = 18.5;
    engine.state.brawlers[2].y = 2.5;
    kage.x = 6.5;
    kage.y = 7.5;
    kage.hp = 2000;
    kage.superCharge = 100;
    enemy.x = 11.5;
    enemy.y = 7.5;
    const enemyHpBefore = enemy.hp;

    engine.setInput(0, emptyInput({ aimAngle: 0, superFire: true }));
    const allEvents = [];
    allEvents.push(...engine.step(0.05));
    engine.setInput(0, emptyInput());
    for (let i = 0; i < 12; i++) {
      allEvents.push(...engine.step(0.05));
    }

    // Walls intact (passes through without breaking)
    expect(getTile(engine.state.grid, 8, 7)).toBe(TileType.WALL_SOLID);
    expect(getTile(engine.state.grid, 9, 7)).toBe(TileType.WALL_BREAKABLE);
    // Hit exactly once for 1300 damage
    expect(enemyHpBefore - enemy.hp).toBe(1300);
    // Healed for 80% of 1300 = 1040 HP
    expect(kage.hp).toBe(3040);
    expect(kage.stats.healingDone).toBe(1040);
    expect(allEvents.some((e) => e.type === 'heal' && e.targetSlot === 0 && e.amount === 1040)).toBe(true);
  });

  it('Review Focus #2: Phantom Slash heals 0 against spawn-invulnerable targets and scales lifesteal to actual HP removed on overkill', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots('golem') });
    for (let x = 4; x <= 16; x++) {
      engine.state.grid[7 * MAP_WIDTH + x] = TileType.EMPTY;
    }
    const kage = engine.state.brawlers[0];
    const shielded = engine.state.brawlers[1];
    const lowHp = engine.state.brawlers[2];

    // Case A: Spawn-invulnerable enemy -> 0 dmg, 0 heal
    kage.x = 6.5;
    kage.y = 7.5;
    kage.hp = 2000;
    kage.superCharge = 100;
    shielded.x = 9.5;
    shielded.y = 7.5;
    shielded.invulnTimer = 2.0;
    lowHp.x = 18.5;
    lowHp.y = 2.5;

    engine.setInput(0, emptyInput({ aimAngle: 0, superFire: true }));
    engine.step(0.05);
    engine.setInput(0, emptyInput());
    for (let i = 0; i < 10; i++) engine.step(0.05);

    expect(shielded.hp).toBe(shielded.maxHp);
    expect(kage.hp).toBe(2000);

    // Case B: 200 HP enemy -> overkill clamped to 200 actual dmg -> heals 160 HP
    shielded.x = 18.5;
    shielded.y = 2.5;
    lowHp.x = 9.5;
    lowHp.y = 7.5;
    lowHp.hp = 200;
    kage.hp = 2000;
    kage.superCharge = 100;
    kage.attackCooldown = 0;

    engine.setInput(0, emptyInput({ aimAngle: 0, superFire: true }));
    engine.step(0.05);
    engine.setInput(0, emptyInput());
    for (let i = 0; i < 10; i++) engine.step(0.05);

    expect(lowHp.alive).toBe(false);
    expect(kage.hp).toBe(2160);
  });

  it('Review Focus #3: Brawl Ball kicks normally while holding ball and cancels Shadow Dash immediately upon loose-ball pickup', () => {
    const engine = new MatchEngine({
      mapId: 'crystal-cavern',
      mode: 'brawl-ball',
      slots: createKageSlots('golem'),
    });
    const kage = engine.state.brawlers[0];
    const ball = engine.state.ball!;
    engine.state.brawlers[1].x = 18.5;
    engine.state.brawlers[1].y = 5.5;
    engine.state.brawlers[2].x = 18.5;
    engine.state.brawlers[2].y = 6.5;

    // 1. Holding ball -> firing kicks ball and never starts dash
    kage.x = 10.5;
    kage.y = 16.5;
    ball.x = 10.5;
    ball.y = 16.5;
    engine.step(0.05);
    expect(ball.holderSlot).toBe(0);

    engine.setInput(0, emptyInput({ aimAngle: -Math.PI / 2, fire: true }));
    const kickEvents = engine.step(0.05);
    expect(kickEvents.some((e) => e.type === 'ball_kick')).toBe(true);
    expect(kage.dash).toBeNull();
    expect(ball.holderSlot).toBeNull();

    // 2. Dashing onto a loose ball -> picks up ball and cancels dash immediately
    kage.x = 10.5;
    kage.y = 17.6;
    kage.ammo = 3;
    kage.attackCooldown = 0;
    ball.x = 10.5;
    ball.y = 16.5;
    ball.vx = 0;
    ball.vy = 0;
    ball.pickupCooldown = 0;
    ball.kickCooldownSlot = null;

    engine.setInput(0, emptyInput({ aimAngle: -Math.PI / 2, fire: true }));
    engine.step(0.05);
    engine.setInput(0, emptyInput({ aimAngle: -Math.PI / 2 }));
    engine.step(0.05);

    expect(ball.holderSlot).toBe(0);
    expect(kage.dash).toBeNull();
  });

  it('serializes active dash state with empty hitSlots in MatchSnapshot', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: createKageSlots() });
    const kage = engine.state.brawlers[0];
    kage.x = 10.5;
    kage.y = 29.0;

    engine.setInput(0, emptyInput({ aimAngle: -Math.PI / 2, fire: true }));
    engine.step(0.05);
    expect(kage.dash).not.toBeNull();

    const snap = serializeSnapshot(engine.state, [], 1, []);
    expect(snap.brawlers[0].dash).not.toBeNull();
    expect(snap.brawlers[0].dash!.hitSlots).toEqual([]);
    expect(snap.brawlers[0].dash!.speed).toBe(15.0);
  });

  it('clears active Shadow Dash immediately when a Brawl Ball goal triggers goalResetTimer freeze', () => {
    const engine = new MatchEngine({
      mapId: 'crystal-cavern',
      mode: 'brawl-ball',
      slots: createKageSlots('golem'),
    });
    const kage = engine.state.brawlers[0];
    const ball = engine.state.ball!;
    kage.x = 10.5;
    kage.y = 16.5;
    kage.dash = {
      dirX: 1,
      dirY: 0,
      speed: 15.0,
      elapsed: 0.05,
      duration: 0.18,
      hitRadius: 0.72,
      damage: 1080,
      superChargePerHit: 22,
      hitSlots: [],
    };
    // Place ball crossing Red's North goal line touched by Blue
    ball.holderSlot = null;
    ball.lastTouchTeam = 'blue';
    ball.lastTouchSlot = 0;
    ball.x = 10.5;
    ball.y = 1.15;
    ball.vx = 0;
    ball.vy = -12;

    const events = engine.step(0.05);
    expect(events.some((e) => e.type === 'goal' && e.team === 'blue')).toBe(true);
    expect(engine.state.goalResetTimer).toBeGreaterThan(0);
    expect(kage.dash).toBeNull();
  });
});
