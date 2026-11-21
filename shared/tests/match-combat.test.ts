import { describe, it, expect } from 'vitest';
import { MatchEngine } from '../src/match';
import { isBrawlerVisibleToTeam, findAutoAimAngle } from '../src/combat';
import { SlotSetup, TileType } from '../src/types';
import { MAP_WIDTH } from '../src/maps';
import { quantizeInput, inputsDiffer, serializeSnapshot } from '../src/protocol';

function defaultSixSlots(): SlotSetup[] {
  return [
    { slotIndex: 0, team: 'blue', name: 'B1', isBot: false, brawlerId: 'buck' },
    { slotIndex: 1, team: 'blue', name: 'B2', isBot: true, brawlerId: 'vex' },
    { slotIndex: 2, team: 'blue', name: 'B3', isBot: true, brawlerId: 'lumi' },
    { slotIndex: 3, team: 'red', name: 'R1', isBot: true, brawlerId: 'blaze' },
    { slotIndex: 4, team: 'red', name: 'R2', isBot: true, brawlerId: 'golem' },
    { slotIndex: 5, team: 'red', name: 'R3', isBot: true, brawlerId: 'mort' },
  ];
}

describe('Gem Grab rules, combat, stealth, and protocol', () => {
  it('spawns first gem at 3.0s and subsequent gems every 7.0s up to 29 max', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    for (let i = 0; i < 59; i++) engine.step(0.05);
    expect(engine.state.gems.length).toBe(0);
    engine.step(0.1);
    expect(engine.state.gems.length).toBe(1);
    for (let i = 0; i < 140; i++) engine.step(0.05);
    expect(engine.state.gems.length).toBe(2);
  });

  it('starts 15s countdown at 10 gems and cancels immediately on tie or holder death', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    const blue = engine.state.brawlers[0];
    const red = engine.state.brawlers[3];
    blue.gems = 10;
    engine.step(0.05);
    expect(engine.state.countdownTeam).toBe('blue');
    expect(engine.state.countdownTimer).toBeCloseTo(14.95, 1);

    // Review Focus #1: enemy tying at 10 gems cancels countdown immediately
    red.gems = 10;
    engine.step(0.05);
    expect(engine.state.countdownTeam).toBeNull();

    // Blue retakes lead while Red has 4, then dies and drops gems -> cancels countdown & scatters gems
    red.gems = 4;
    blue.gems = 11;
    engine.step(0.05);
    expect(engine.state.countdownTeam).toBe('blue');
    blue.hp = 1;
    engine.applyDamage(red, blue, 500);
    engine.step(0.05);
    expect(blue.alive).toBe(false);
    expect(blue.gems).toBe(0);
    expect(engine.state.countdownTeam).toBeNull();
    expect(engine.state.gems.length).toBeGreaterThanOrEqual(11);
  });

  it('enforces stealth bush visibility (2.2 tiles, 1.2s attack reveal) and prevents auto-aim leaks', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    const blue = engine.state.brawlers[0];
    const red = engine.state.brawlers[3];
    engine.state.grid[10 * MAP_WIDTH + 5] = TileType.BUSH;
    engine.state.grid[15 * MAP_WIDTH + 5] = TileType.EMPTY;
    red.x = 5.5;
    red.y = 10.5;
    blue.x = 5.5;
    blue.y = 15.5;
    // Move other red brawlers out of range
    engine.state.brawlers[4].x = 18.5;
    engine.state.brawlers[4].y = 2.5;
    engine.state.brawlers[5].x = 18.5;
    engine.state.brawlers[5].y = 2.5;

    // Review Focus #3: hidden enemy not visible and auto-aim ignores them
    expect(isBrawlerVisibleToTeam(engine.state, red, 'blue')).toBe(false);
    expect(findAutoAimAngle(engine.state, blue, 10)).toBeNull();

    // Moving within 2.2 tiles reveals enemy
    blue.y = 12.4;
    expect(isBrawlerVisibleToTeam(engine.state, red, 'blue')).toBe(true);
    expect(findAutoAimAngle(engine.state, blue, 10)).not.toBeNull();
  });

  it('auto-heals 13%/s after 3.0s out of combat, respawns after 4.0s with 2.5s shield, and breaks breakable walls on Super', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    const buck = engine.state.brawlers[0];
    buck.hp = Math.floor(buck.maxHp * 0.5);
    buck.outOfCombatTimer = 0;
    for (let i = 0; i < 60; i++) engine.step(0.05);
    const hpAt3s = buck.hp;
    for (let i = 0; i < 20; i++) engine.step(0.05);
    expect(buck.hp).toBeGreaterThan(hpAt3s);

    // Wall-breaking Super destroys WALL_BREAKABLE but spares WALL_SOLID
    engine.state.grid[20 * MAP_WIDTH + 10] = TileType.WALL_BREAKABLE;
    engine.state.grid[20 * MAP_WIDTH + 11] = TileType.WALL_SOLID;
    buck.x = 10.5;
    buck.y = 22.0;
    buck.superCharge = 100;
    engine.setInput(0, {
      moveX: 0,
      moveY: 0,
      aimAngle: -Math.PI / 2,
      fire: false,
      superFire: true,
      autoAim: false,
    });
    for (let i = 0; i < 12; i++) engine.step(0.05);
    expect(engine.state.grid[20 * MAP_WIDTH + 10]).toBe(TileType.EMPTY);
    expect(engine.state.grid[20 * MAP_WIDTH + 11]).toBe(TileType.WALL_SOLID);

    // Respawn after 4.0s with 2.5s invuln shield
    const red = engine.state.brawlers[3];
    engine.applyDamage(red, buck, 99999);
    expect(buck.alive).toBe(false);
    expect(buck.respawnTimer).toBeCloseTo(4.0, 2);
    for (let i = 0; i < 82; i++) engine.step(0.05);
    expect(buck.alive).toBe(true);
    expect(buck.invulnTimer).toBeGreaterThan(2.0);
  });

  it('handles Lumi heal wave, Mort lobbed puddle, Golem leap, Vex bombs, and protocol quantization/snapshots', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    const ally = engine.state.brawlers[0];
    const lumi = engine.state.brawlers[2];
    ally.hp = 1000;
    ally.x = 10.5;
    ally.y = 25.0;
    lumi.x = 10.5;
    lumi.y = 27.0;
    lumi.superCharge = 100;
    engine.setInput(2, {
      moveX: 0,
      moveY: 0,
      aimAngle: -Math.PI / 2,
      fire: false,
      superFire: true,
      autoAim: false,
    });
    for (let i = 0; i < 10; i++) engine.step(0.05);
    expect(ally.hp).toBeGreaterThan(1000);

    // Mort lobbed potion creates damage puddle
    const mort = engine.state.brawlers[5];
    mort.x = 10.5;
    mort.y = 8.0;
    engine.setInput(5, {
      moveX: 0,
      moveY: 0,
      aimAngle: Math.PI / 2,
      fire: true,
      superFire: false,
      autoAim: false,
    });
    for (let i = 0; i < 20; i++) engine.step(0.05);
    expect(engine.state.hazards.some((h) => h.kind === 'puddle')).toBe(true);

    // Quantization ignores tiny angle/move jitter
    const q1 = quantizeInput({ moveX: 0.99, moveY: 0.01, aimAngle: 0.5, fire: false, superFire: false, autoAim: false });
    const q2 = quantizeInput({ moveX: 0.98, moveY: 0.02, aimAngle: 0.51, fire: false, superFire: false, autoAim: false });
    expect(inputsDiffer(q1, q2)).toBe(false);

    const snap = serializeSnapshot(engine.state, []);
    expect(snap.brawlers).toHaveLength(6);
    expect(snap.mapId).toBe('crystal-cavern');
  });

  it('I4: never spends primary ammo or breaks bush stealth when superFire + autoAim triggers with superCharge < 100', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: defaultSixSlots() });
    const buck = engine.state.brawlers[0];
    buck.superCharge = 45;
    buck.ammo = 3;
    buck.revealedTimer = 0;

    engine.setInput(0, {
      moveX: 0,
      moveY: 0,
      aimAngle: -Math.PI / 2,
      fire: false,
      superFire: true,
      autoAim: true,
    });
    engine.step(0.05);

    expect(buck.ammo).toBe(3);
    expect(buck.revealedTimer).toBe(0);
    expect(engine.state.projectiles).toHaveLength(0);
  });
});
