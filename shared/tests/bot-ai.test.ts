import { describe, it, expect } from 'vitest';
import { MatchEngine } from '../src/match';
import { BotController } from '../src/botAi';
import { findNextWaypoint } from '../src/pathfinding';
import { createGridCopy, MAP_WIDTH } from '../src/maps';
import { SlotSetup, TileType } from '../src/types';

function allBotSlots(): SlotSetup[] {
  return [
    { slotIndex: 0, team: 'blue', name: 'Bot-Buck', isBot: true, brawlerId: 'buck' },
    { slotIndex: 1, team: 'blue', name: 'Bot-Vex', isBot: true, brawlerId: 'vex' },
    { slotIndex: 2, team: 'blue', name: 'Bot-Lumi', isBot: true, brawlerId: 'lumi' },
    { slotIndex: 3, team: 'red', name: 'Bot-Blaze', isBot: true, brawlerId: 'blaze' },
    { slotIndex: 4, team: 'red', name: 'Bot-Golem', isBot: true, brawlerId: 'golem' },
    { slotIndex: 5, team: 'red', name: 'Bot-Mort', isBot: true, brawlerId: 'mort' },
  ];
}

describe('Bot pathfinding and Gem Grab AI', () => {
  it('routes around water and walls on Twin Bridges without walking into blocked tiles', () => {
    const grid = createGridCopy('twin-bridges');
    const wp = findNextWaypoint(grid, { x: 4.5, y: 24.5 }, { x: 4.5, y: 8.5 });
    const tile = grid[Math.floor(wp.y) * MAP_WIDTH + Math.floor(wp.x)];
    expect(tile === TileType.EMPTY || tile === TileType.BUSH).toBe(true);
  });

  it('never fires at an enemy concealed inside a bush outside 2.2 tiles', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const bot = engine.state.brawlers[0];
    const enemy = engine.state.brawlers[3];
    engine.state.grid[10 * MAP_WIDTH + 5] = TileType.BUSH;
    enemy.x = 5.5;
    enemy.y = 10.5;
    bot.x = 5.5;
    bot.y = 15.5;
    engine.state.brawlers[4].alive = false;
    engine.state.brawlers[5].alive = false;

    const ai = new BotController();
    const inputs = ai.computeInputs(engine.state, 0.05);
    expect(inputs.get(0)?.fire).toBe(false);
  });

  it('retreats gem carrier toward home base when holding >= 5 gems or HP < 40%', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const blueCarrier = engine.state.brawlers[0];
    blueCarrier.x = 10.5;
    blueCarrier.y = 18.0;
    blueCarrier.gems = 6;
    const ai = new BotController();
    const input = ai.computeInputs(engine.state, 0.05).get(0)!;
    // Blue home is at y ~ 30 -> retreating moves +y
    expect(input.moveY).toBeGreaterThan(0);
  });

  it('steers away from enemy toxic acid puddles instead of standing in damage', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const bot = engine.state.brawlers[0];
    bot.x = 10.5;
    bot.y = 18.5;
    // Place enemy toxic puddle right above the bot (y = 18.0)
    engine.state.hazards.push({
      id: 99,
      ownerSlot: 5,
      team: 'red',
      brawlerId: 'mort',
      kind: 'puddle',
      x: 10.5,
      y: 18.0,
      radius: 2.2,
      remaining: 3.0,
      duration: 3.5,
      dps: 700,
      explodeDamage: 0,
      breaksWalls: false,
      superChargePerHit: 10,
      tickAccum: 0,
    });
    const ai = new BotController();
    const input = ai.computeInputs(engine.state, 0.05).get(0)!;
    // Bot must steer +y away from puddle center at y = 18.0
    expect(input.moveY).toBeGreaterThan(0.2);
  });

  it('actively sidesteps fast incoming enemy projectiles', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const bot = engine.state.brawlers[0];
    bot.x = 10.5;
    bot.y = 20.0;
    // Hide all enemies so movement goal is clean, and fire a sniper bolt straight down at bot
    for (const e of engine.state.brawlers) {
      if (e.team === 'red') e.alive = false;
    }
    engine.state.projectiles.push({
      id: 42,
      ownerSlot: 3,
      team: 'red',
      brawlerId: 'vex',
      isSuper: false,
      x: 10.4,
      y: 15.0,
      startX: 10.4,
      startY: 14.0,
      vx: 0,
      vy: 18,
      radius: 0.25,
      maxRange: 11,
      traveled: 1,
      damage: 1400,
      minDamage: 700,
      piercing: false,
      lobbed: false,
      targetX: 10.4,
      targetY: 25.0,
      flightDuration: 0,
      elapsed: 0.05,
      puddleDuration: 0,
      puddleRadius: 0,
      puddleDps: 0,
      knockback: 0,
      breaksWalls: false,
      isHeal: false,
      healAmount: 0,
      superChargePerHit: 25,
      hitSlots: [],
    });
    const ai = new BotController();
    const input = ai.computeInputs(engine.state, 0.05).get(0)!;
    // Bot is slightly right (+x) of projectile path -> must dodge strongly in +x
    expect(input.moveX).toBeGreaterThan(0.35);
  });

  it('holds fire while retreating at low HP to allow passive HP regeneration', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const vex = engine.state.brawlers[1];
    const enemy = engine.state.brawlers[3];
    vex.x = 10.5;
    vex.y = 20.5;
    vex.hp = vex.maxHp * 0.25;
    enemy.x = 10.5;
    enemy.y = 13.5; // 7 tiles away (not in immediate face, high HP -> not a finisher)
    enemy.hp = enemy.maxHp;
    engine.state.brawlers[4].alive = false;
    engine.state.brawlers[5].alive = false;

    const ai = new BotController();
    const input = ai.computeInputs(engine.state, 0.05).get(1)!;
    expect(input.fire).toBe(false);
    expect(input.moveY).toBeGreaterThan(0);
  });

  it('kites sniper Vex backwards when an enemy rushes close', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const vex = engine.state.brawlers[1];
    const enemy = engine.state.brawlers[4];
    vex.x = 10.5;
    vex.y = 19.0;
    vex.hp = vex.maxHp;
    enemy.x = 10.5;
    enemy.y = 15.5; // 3.5 tiles north of Vex
    engine.state.brawlers[3].alive = false;
    engine.state.brawlers[5].alive = false;

    const ai = new BotController();
    const input = ai.computeInputs(engine.state, 0.05).get(1)!;
    // Must kite southward (+y) away from close threat!
    expect(input.moveY).toBeGreaterThan(0.25);
  });

  it('runs a full 3v3 60-second bot-only match cleanly on Crystal Cavern and Iron Foundry with combat, gem pickups, and no NaNs', () => {
    for (const mapId of ['crystal-cavern', 'iron-foundry'] as const) {
      const engine = new MatchEngine({ mapId, slots: allBotSlots() });
      const ai = new BotController();
      let totalDamage = 0;
      let totalGems = 0;
      for (let i = 0; i < 1200; i++) {
        const inputs = ai.computeInputs(engine.state, 0.05);
        for (const [slot, inp] of inputs) engine.setInput(slot, inp);
        engine.step(0.05);
      }
      for (const b of engine.state.brawlers) {
        expect(Number.isFinite(b.x)).toBe(true);
        expect(Number.isFinite(b.y)).toBe(true);
        totalDamage += b.stats.damageDealt;
        totalGems += b.stats.gemsCollected;
      }
      expect(totalDamage).toBeGreaterThan(0);
      expect(totalGems).toBeGreaterThan(0);
    }
  });
});
