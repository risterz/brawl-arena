import { describe, it, expect } from 'vitest';
import { MAP_WIDTH, MatchEngine, SlotSetup, TileType } from '@brawl-arena/shared';
import { CombatFeedTracker } from '../src/ui/combatFeed';

function makeSixSlots(): SlotSetup[] {
  return [
    { slotIndex: 0, team: 'blue', name: 'Hero', isBot: false, brawlerId: 'vex' },
    { slotIndex: 1, team: 'blue', name: 'Ally1', isBot: true, brawlerId: 'buck' },
    { slotIndex: 2, team: 'blue', name: 'Ally2', isBot: true, brawlerId: 'lumi' },
    { slotIndex: 3, team: 'red', name: 'Enemy1', isBot: true, brawlerId: 'blaze' },
    { slotIndex: 4, team: 'red', name: 'Enemy2', isBot: true, brawlerId: 'mort' },
    { slotIndex: 5, team: 'red', name: 'Enemy3', isBot: true, brawlerId: 'golem' },
  ];
}

describe('CombatFeedTracker (floating damage/heal popups, kill feed, multi-kill & team wipe)', () => {
  it('spawns classified damage, crit, heal, and steal popups while respecting bush stealth', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: makeSixSlots() });
    const state = engine.state;
    const tracker = new CombatFeedTracker();

    // Place Enemy1 in open view, Enemy2 hidden in a bush far away
    state.brawlers[0].x = 10.5;
    state.brawlers[0].y = 19.5;
    state.brawlers[3].x = 10.5;
    state.brawlers[3].y = 14.5;
    state.grid[8 * MAP_WIDTH + 3] = TileType.BUSH;
    state.brawlers[4].x = 3.5;
    state.brawlers[4].y = 8.5;
    state.brawlers[4].revealedTimer = 0;

    tracker.ingest(
      [
        { type: 'hit', attackerSlot: 0, targetSlot: 3, amount: 1950, x: 10.5, y: 14.5 },
        { type: 'hit', attackerSlot: 3, targetSlot: 0, amount: 340, x: 10.5, y: 19.5 },
        { type: 'heal', targetSlot: 0, amount: 1200, x: 10.5, y: 19.5 },
        { type: 'hit', attackerSlot: 1, targetSlot: 4, amount: 420, x: 3.5, y: 8.5 }, // hidden in bush -> suppressed!
        { type: 'tackle', slotIndex: 0, targetSlot: 3, stolen: true, x: 10.5, y: 15.0, angle: -Math.PI / 2 },
      ],
      state,
      0,
    );

    const popups = tracker.getPopups();
    expect(popups).toHaveLength(4);
    expect(popups[0]).toMatchObject({ text: '-1950!', kind: 'dmg-dealt', isCrit: true });
    expect(popups[1]).toMatchObject({ text: '-340', kind: 'dmg-taken', isCrit: false });
    expect(popups[2]).toMatchObject({ text: '+1200', kind: 'heal', isCrit: true });
    expect(popups[3]).toMatchObject({ text: 'STOLEN!', kind: 'steal', isCrit: true });

    // Popups rise and expire cleanly
    const startH = popups[0].heightY;
    tracker.update(0.4);
    expect(tracker.getPopups()[0].heightY).toBeGreaterThan(startH);
    tracker.update(1.2);
    expect(tracker.getPopups()).toHaveLength(0);
  });

  it('tracks kill feed entries and triggers DOUBLE KILL, TRIPLE KILL, and TEAM WIPE banners', () => {
    const engine = new MatchEngine({ mapId: 'crystal-cavern', slots: makeSixSlots() });
    const state = engine.state;
    const tracker = new CombatFeedTracker();

    // Kill 1: single kill -> appears in feed, no multi-kill banner yet
    state.brawlers[3].alive = false;
    tracker.ingest([{ type: 'kill', killerSlot: 0, victimSlot: 3, x: 10, y: 14 }], state, 0);
    expect(tracker.getFeed()).toHaveLength(1);
    expect(tracker.getFeed()[0]).toMatchObject({
      killerName: 'Hero',
      victimName: 'Enemy1',
      killerIsLocal: true,
    });
    expect(tracker.getBanner()).toBeNull();

    // Kill 2 within 6.5s -> DOUBLE KILL!
    tracker.update(1.0);
    state.brawlers[4].alive = false;
    tracker.ingest([{ type: 'kill', killerSlot: 0, victimSlot: 4, x: 11, y: 14 }], state, 0);
    expect(tracker.getFeed()).toHaveLength(2);
    expect(tracker.getBanner()?.title).toContain('DOUBLE KILL');
    expect(tracker.getBanner()?.accent).toBe('gold');

    // Kill 3 wipes the entire Red team (slots 3, 4, 5 all down!) -> TEAM WIPE!
    tracker.update(1.0);
    state.brawlers[5].alive = false;
    tracker.ingest([{ type: 'kill', killerSlot: 0, victimSlot: 5, x: 12, y: 14 }], state, 0);
    expect(tracker.getBanner()?.title).toContain('TEAM WIPE');

    // Banner and feed entries expire cleanly over time
    tracker.update(6.0);
    expect(tracker.getBanner()).toBeNull();
    expect(tracker.getFeed()).toHaveLength(0);
  });
});
