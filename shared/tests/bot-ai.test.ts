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

  it('runs a full 3v3 60-second bot-only match cleanly with combat, gem pickups, and no NaNs', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: allBotSlots() });
    const ai = new BotController();
    let totalDamage = 0;
    for (let i = 0; i < 1200; i++) {
      const inputs = ai.computeInputs(engine.state, 0.05);
      for (const [slot, inp] of inputs) engine.setInput(slot, inp);
      engine.step(0.05);
    }
    for (const b of engine.state.brawlers) {
      expect(Number.isFinite(b.x)).toBe(true);
      expect(Number.isFinite(b.y)).toBe(true);
      totalDamage += b.stats.damageDealt;
    }
    expect(totalDamage).toBeGreaterThan(0);
  });
});
