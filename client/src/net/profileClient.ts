import {
  BrawlBoxReward,
  BrawlerId,
  getDailyDealIds,
  MatchRewardRequest,
  MatchRewardResult,
  PlayerProfile,
  STARTING_COINS,
  STARTING_GEMS,
} from '@brawl-arena/shared';

function getOrCreatePlayerId(): string {
  const key = 'brawl_arena_player_id';
  try {
    const existing = localStorage.getItem(key);
    if (existing && existing.length >= 6) return existing;
    const created = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    localStorage.setItem(key, created);
    return created;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 12)}`;
  }
}

export class ProfileClient {
  public readonly playerId: string;
  private profile: PlayerProfile;

  constructor(initialName: string) {
    this.playerId = getOrCreatePlayerId();
    this.profile = {
      id: this.playerId,
      name: initialName || 'Brawler',
      coins: STARTING_COINS,
      gems: STARTING_GEMS,
      wins: 0,
      matchesPlayed: 0,
      ownedItems: [],
      loadout: { skins: {}, ring: null },
      lastDailyClaim: null,
      dailyAvailable: true,
      dailyDealIds: getDailyDealIds(),
    };
  }

  public getProfile(): PlayerProfile {
    return this.profile;
  }

  public getEquippedSkin(brawlerId: BrawlerId): string | null {
    return this.profile.loadout.skins[brawlerId] ?? null;
  }

  public getEquippedRing(): string | null {
    return this.profile.loadout.ring ?? null;
  }

  public async load(name?: string): Promise<PlayerProfile> {
    const qs = new URLSearchParams({ playerId: this.playerId });
    if (name) qs.set('name', name);
    const res = await fetch(`/api/profile?${qs.toString()}`);
    if (!res.ok) return this.profile;
    const data = (await res.json()) as { profile?: PlayerProfile };
    if (data.profile) this.profile = data.profile;
    return this.profile;
  }

  private async postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || 'Shop request failed');
    }
    return data;
  }

  public async buyItem(itemId: string): Promise<PlayerProfile> {
    const data = await this.postJson<{ profile: PlayerProfile }>('/api/shop/buy', {
      playerId: this.playerId,
      itemId,
    });
    this.profile = data.profile;
    return this.profile;
  }

  public async equipItem(
    category: 'skin' | 'ring',
    itemId: string | null,
    brawlerId?: BrawlerId,
  ): Promise<PlayerProfile> {
    const data = await this.postJson<{ profile: PlayerProfile }>('/api/shop/equip', {
      playerId: this.playerId,
      category,
      itemId,
      brawlerId,
    });
    this.profile = data.profile;
    return this.profile;
  }

  public async claimDaily(): Promise<PlayerProfile> {
    const data = await this.postJson<{ profile: PlayerProfile }>('/api/shop/daily', {
      playerId: this.playerId,
    });
    this.profile = data.profile;
    return this.profile;
  }

  public async openBrawlBox(): Promise<BrawlBoxReward> {
    const data = await this.postJson<BrawlBoxReward>('/api/shop/box', {
      playerId: this.playerId,
    });
    this.profile = data.profile;
    return data;
  }

  public async claimMatchReward(
    req: Omit<MatchRewardRequest, 'playerId'>,
  ): Promise<MatchRewardResult | null> {
    try {
      const data = await this.postJson<MatchRewardResult>('/api/match/reward', {
        ...req,
        playerId: this.playerId,
      });
      this.profile = data.profile;
      return data;
    } catch {
      return null;
    }
  }
}
