import { MatchEvent, MatchState, Team } from '@brawl-arena/shared';
import { shouldRenderEventVfx } from '../render/perspective';

export type FloatingKind = 'dmg-dealt' | 'dmg-taken' | 'dmg-other' | 'heal' | 'steal';

export interface FloatingPopup {
  id: number;
  text: string;
  kind: FloatingKind;
  isCrit: boolean;
  wx: number;
  wy: number;
  heightY: number;
  age: number;
  duration: number;
}

export interface KillFeedEntry {
  id: number;
  killerName: string;
  killerTeam: Team | null;
  victimName: string;
  victimTeam: Team;
  killerIsLocal: boolean;
  victimIsLocal: boolean;
  remaining: number;
}

export interface AnnouncerBanner {
  id: number;
  title: string;
  subtitle: string;
  accent: 'blue' | 'red' | 'gold';
  remaining: number;
  duration: number;
}

const MULTI_KILL_WINDOW = 6.5;
const MAX_POPUPS = 28;
const MAX_FEED_ENTRIES = 4;
const KILL_FEED_TTL = 5.2;
const BANNER_TTL = 2.4;

export class CombatFeedTracker {
  private nextId = 1;
  private popups: FloatingPopup[] = [];
  private feed: KillFeedEntry[] = [];
  private banner: AnnouncerBanner | null = null;
  private streaks: Map<number, { count: number; lastTime: number }> = new Map();
  private clock = 0;

  public clear(): void {
    this.popups = [];
    this.feed = [];
    this.banner = null;
    this.streaks.clear();
    this.clock = 0;
  }

  public getPopups(): readonly FloatingPopup[] {
    return this.popups;
  }

  public getFeed(): readonly KillFeedEntry[] {
    return this.feed;
  }

  public getBanner(): AnnouncerBanner | null {
    return this.banner;
  }

  public ingest(events: MatchEvent[], state: MatchState | null, localSlot: number): void {
    if (!state || events.length === 0) return;
    const local = state.brawlers[localSlot];
    const viewerTeam: Team = local ? local.team : 'blue';

    for (const ev of events) {
      if (ev.type === 'hit') {
        if (!shouldRenderEventVfx(ev, state, viewerTeam)) continue;
        const amount = Math.round(ev.amount);
        if (amount <= 0) continue;
        const isCrit = amount >= 1000;
        const kind: FloatingKind =
          ev.attackerSlot === localSlot
            ? 'dmg-dealt'
            : ev.targetSlot === localSlot
              ? 'dmg-taken'
              : 'dmg-other';
        this.pushPopup({
          text: isCrit ? `-${amount}!` : `-${amount}`,
          kind,
          isCrit,
          wx: ev.x + (Math.random() - 0.5) * 0.52,
          wy: ev.y + (Math.random() - 0.5) * 0.32,
          heightY: 1.55,
          duration: isCrit ? 0.98 : 0.82,
        });
      } else if (ev.type === 'heal') {
        if (!shouldRenderEventVfx(ev, state, viewerTeam)) continue;
        const amount = Math.round(ev.amount);
        if (amount <= 0) continue;
        this.pushPopup({
          text: `+${amount}`,
          kind: 'heal',
          isCrit: amount >= 1000,
          wx: ev.x + (Math.random() - 0.5) * 0.44,
          wy: ev.y + (Math.random() - 0.5) * 0.28,
          heightY: 1.62,
          duration: 0.88,
        });
      } else if (ev.type === 'tackle' && ev.stolen) {
        this.pushPopup({
          text: 'STOLEN!',
          kind: 'steal',
          isCrit: true,
          wx: ev.x,
          wy: ev.y,
          heightY: 1.85,
          duration: 1.05,
        });
      } else if (ev.type === 'kill') {
        this.handleKill(ev, state, localSlot);
      }
    }
  }

  private pushPopup(spec: Omit<FloatingPopup, 'id' | 'age'>): void {
    this.popups.push({
      id: this.nextId++,
      age: 0,
      ...spec,
    });
    if (this.popups.length > MAX_POPUPS) {
      this.popups.shift();
    }
  }

  private handleKill(
    ev: Extract<MatchEvent, { type: 'kill' }>,
    state: MatchState,
    localSlot: number,
  ): void {
    const victim = state.brawlers[ev.victimSlot];
    if (!victim) return;
    const killer = ev.killerSlot >= 0 ? state.brawlers[ev.killerSlot] : undefined;

    this.feed.unshift({
      id: this.nextId++,
      killerName: killer ? killer.name : 'Arena',
      killerTeam: killer ? killer.team : null,
      victimName: victim.name,
      victimTeam: victim.team,
      killerIsLocal: Boolean(killer && killer.slotIndex === localSlot),
      victimIsLocal: victim.slotIndex === localSlot,
      remaining: KILL_FEED_TTL,
    });
    if (this.feed.length > MAX_FEED_ENTRIES) {
      this.feed.length = MAX_FEED_ENTRIES;
    }

    // Track killer multi-kill streak within rolling window
    let streakCount = 1;
    if (killer) {
      const prev = this.streaks.get(killer.slotIndex);
      if (prev && this.clock - prev.lastTime <= MULTI_KILL_WINDOW) {
        streakCount = prev.count + 1;
      }
      this.streaks.set(killer.slotIndex, { count: streakCount, lastTime: this.clock });
    }

    // Check Team Wipe (all >=2 members of victim's team are simultaneously down)
    const victimTeamMembers = state.brawlers.filter((b) => b.team === victim.team);
    const isTeamWipe =
      victimTeamMembers.length >= 2 && victimTeamMembers.every((b) => !b.alive);

    const accent: 'blue' | 'red' | 'gold' =
      killer && killer.slotIndex === localSlot
        ? 'gold'
        : killer
          ? killer.team
          : victim.team === 'blue'
            ? 'red'
            : 'blue';

    if (isTeamWipe) {
      const killerLabel = killer ? `${killer.name} wiped ${victim.team.toUpperCase()}!` : `${victim.team.toUpperCase()} eliminated!`;
      this.banner = {
        id: this.nextId++,
        title: '💀 TEAM WIPE!',
        subtitle: killerLabel,
        accent,
        remaining: BANNER_TTL + 0.35,
        duration: BANNER_TTL + 0.35,
      };
    } else if (killer && streakCount >= 4) {
      this.banner = {
        id: this.nextId++,
        title: '👑 UNSTOPPABLE!',
        subtitle: `${killer.name} • ${streakCount}x Streak`,
        accent,
        remaining: BANNER_TTL,
        duration: BANNER_TTL,
      };
    } else if (killer && streakCount === 3) {
      this.banner = {
        id: this.nextId++,
        title: '⚡ TRIPLE KILL!',
        subtitle: killer.name,
        accent,
        remaining: BANNER_TTL,
        duration: BANNER_TTL,
      };
    } else if (killer && streakCount === 2) {
      this.banner = {
        id: this.nextId++,
        title: '🔥 DOUBLE KILL!',
        subtitle: killer.name,
        accent,
        remaining: BANNER_TTL,
        duration: BANNER_TTL,
      };
    }
  }

  public update(dt: number): void {
    this.clock += dt;

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      p.heightY += dt * (p.isCrit ? 1.55 : 1.25);
      if (p.age >= p.duration) {
        this.popups.splice(i, 1);
      }
    }

    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].remaining -= dt;
      if (this.feed[i].remaining <= 0) {
        this.feed.splice(i, 1);
      }
    }

    if (this.banner) {
      this.banner.remaining -= dt;
      if (this.banner.remaining <= 0) {
        this.banner = null;
      }
    }
  }
}
