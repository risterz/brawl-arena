import { describe, expect, it } from 'vitest';
import { MatchEngine, SlotSetup } from '@brawl-arena/shared';
import { computePodiumLineup } from '../src/render/victoryStage';

function makeSlots(): SlotSetup[] {
  return [
    { slotIndex: 0, team: 'blue', brawlerId: 'buck', name: 'PlayerBlue', isBot: false },
    { slotIndex: 1, team: 'blue', brawlerId: 'vex', name: 'BotVex', isBot: true },
    { slotIndex: 2, team: 'blue', brawlerId: 'blaze', name: 'BotBlaze', isBot: true },
    { slotIndex: 3, team: 'red', brawlerId: 'golem', name: 'BotGolem', isBot: true },
    { slotIndex: 4, team: 'red', brawlerId: 'mort', name: 'BotMort', isBot: true },
    { slotIndex: 5, team: 'red', brawlerId: 'lumi', name: 'BotLumi', isBot: true },
  ];
}

describe('Brawl Stars 3D Victory / Defeat Podium Lineup', () => {
  it('shows local team on victory and places team Star Player in the center between the other two', () => {
    const state = new MatchEngine({ mapId: 'crystal-cavern', slots: makeSlots() }).state;
    state.phase = 'ended';
    state.winner = 'blue';
    state.starPlayerSlot = 1; // BotVex is Star Player on Blue
    state.brawlers[0].stats = { kills: 2, deaths: 3, damageDealt: 9000, gemsCollected: 5, healingDone: 0 };
    state.brawlers[1].stats = { kills: 9, deaths: 2, damageDealt: 42000, gemsCollected: 11, healingDone: 0 };
    state.brawlers[2].stats = { kills: 5, deaths: 4, damageDealt: 24000, gemsCollected: 8, healingDone: 0 };

    const lineup = computePodiumLineup(state, 0);
    expect(lineup.outcome).toBe('victory');
    expect(lineup.members).toHaveLength(3);
    expect(lineup.members.every((m) => m.brawler.team === 'blue')).toBe(true);
    expect(lineup.members[1].position).toBe('center');
    expect(lineup.members[1].brawler.slotIndex).toBe(1);
    expect(lineup.members[1].isStarPlayer).toBe(true);
    expect(lineup.members[1].isTeamMvp).toBe(true);
  });

  it('still shows local team on defeat (for Defeat animation) and preserves enemy overall Star Player', () => {
    const state = new MatchEngine({ mapId: 'crystal-cavern', slots: makeSlots() }).state;
    state.phase = 'ended';
    state.winner = 'red';
    state.starPlayerSlot = 4; // Enemy BotMort was overall Star Player
    state.brawlers[0].stats = { kills: 1, deaths: 6, damageDealt: 6000, gemsCollected: 2, healingDone: 0 };
    state.brawlers[1].stats = { kills: 3, deaths: 4, damageDealt: 18000, gemsCollected: 4, healingDone: 0 };
    state.brawlers[2].stats = { kills: 7, deaths: 2, damageDealt: 36000, gemsCollected: 9, healingDone: 0 };

    const lineup = computePodiumLineup(state, 0);
    expect(lineup.outcome).toBe('defeat');
    expect(lineup.members).toHaveLength(3);
    expect(lineup.members.every((m) => m.brawler.team === 'blue')).toBe(true);
    // Blue's top performer (BotBlaze, slot 2) takes center spot on Blue's podium
    expect(lineup.members[1].brawler.slotIndex).toBe(2);
    expect(lineup.members[1].isTeamMvp).toBe(true);
    expect(lineup.members[1].isStarPlayer).toBe(false);
    expect(lineup.overallStarPlayer?.slotIndex).toBe(4);
  });
});
