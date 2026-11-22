import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MatchEngine, SlotSetup } from '@brawl-arena/shared';
import { BGM_URLS, getMatchResultBgmTrack } from '../src/audio/sfx';

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

describe('match result BGM selection & audio files', () => {
  it('plays victory for the winning team and defeat for the losing team (and draw)', () => {
    const state = new MatchEngine({ mapId: 'crystal-cavern', slots: makeSlots() }).state;
    state.phase = 'ended';

    // Blue wins -> Blue slot (0) hears victory, Red slot (3) hears defeat
    state.winner = 'blue';
    expect(getMatchResultBgmTrack(state, 0)).toBe('victory');
    expect(getMatchResultBgmTrack(state, 3)).toBe('defeat');

    // Red wins -> Red slot (3) hears victory, Blue slot (0) hears defeat
    state.winner = 'red';
    expect(getMatchResultBgmTrack(state, 3)).toBe('victory');
    expect(getMatchResultBgmTrack(state, 0)).toBe('defeat');

    // Draw -> falls back to defeat track
    state.winner = null;
    expect(getMatchResultBgmTrack(state, 0)).toBe('defeat');
  });

  it('ships real non-empty audio files for every BGM track including victory and defeat', () => {
    const publicDir = path.resolve(__dirname, '../public');
    const tracks = Object.entries(BGM_URLS);
    expect(tracks.length).toBe(7);
    for (const [, relUrl] of tracks) {
      const fullPath = path.join(publicDir, relUrl.replace(/^\//, ''));
      expect(fs.existsSync(fullPath), `Missing audio file: ${fullPath}`).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(10_000);
    }
  });
});
