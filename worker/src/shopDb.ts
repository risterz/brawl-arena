import {
  BRAWL_BOX_COST,
  BrawlBoxReward,
  BrawlerId,
  BRAWLERS,
  computeMatchReward,
  DAILY_FREE_COINS,
  DAILY_FREE_GEMS,
  getDailyDealIds,
  getEffectivePrice,
  getShopItem,
  getTodayUtcDate,
  MatchRewardRequest,
  MatchRewardResult,
  PlayerLoadout,
  PlayerProfile,
  SHOP_ITEMS,
  STARTING_COINS,
  STARTING_GEMS,
} from '@brawl-arena/shared';

interface PlayerRow {
  id: string;
  name: string;
  coins: number;
  gems: number;
  wins: number;
  matches_played: number;
  owned_json: string;
  loadout_json: string;
  last_daily_claim: string | null;
  updated_at: number;
}

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Brawler',
  coins INTEGER NOT NULL DEFAULT 250,
  gems INTEGER NOT NULL DEFAULT 30,
  wins INTEGER NOT NULL DEFAULT 0,
  matches_played INTEGER NOT NULL DEFAULT 0,
  owned_json TEXT NOT NULL DEFAULT '[]',
  loadout_json TEXT NOT NULL DEFAULT '{"skins":{},"ring":null}',
  last_daily_claim TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);`;

function sanitizePlayerId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return cleaned.length >= 4 ? cleaned : '';
}

function sanitizePlayerName(raw?: string): string {
  if (!raw) return 'Brawler';
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return cleaned || 'Brawler';
}

function parseOwned(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string');
    }
  } catch {
    // ignore corrupt JSON
  }
  return [];
}

function parseLoadout(raw: string): PlayerLoadout {
  try {
    const parsed = JSON.parse(raw) as Partial<PlayerLoadout>;
    return {
      skins: parsed && typeof parsed.skins === 'object' && parsed.skins ? parsed.skins : {},
      ring: typeof parsed?.ring === 'string' ? parsed.ring : null,
    };
  } catch {
    return { skins: {}, ring: null };
  }
}

function rowToProfile(row: PlayerRow, today: string): PlayerProfile {
  return {
    id: row.id,
    name: row.name,
    coins: row.coins,
    gems: row.gems,
    wins: row.wins,
    matchesPlayed: row.matches_played,
    ownedItems: parseOwned(row.owned_json),
    loadout: parseLoadout(row.loadout_json),
    lastDailyClaim: row.last_daily_claim,
    dailyAvailable: row.last_daily_claim !== today,
    dailyDealIds: getDailyDealIds(today),
  };
}

export class ShopRepository {
  private db: D1Database;
  private initialized = false;

  constructor(db: D1Database) {
    this.db = db;
  }

  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;
    await this.db.prepare(CREATE_TABLE_SQL).run();
    this.initialized = true;
  }

  private async fetchOrCreateRow(rawId: string, rawName?: string): Promise<PlayerRow> {
    const id = sanitizePlayerId(rawId);
    if (!id) throw new Error('Invalid playerId');
    await this.ensureSchema();

    const existing = await this.db
      .prepare('SELECT * FROM players WHERE id = ?1')
      .bind(id)
      .first<PlayerRow>();

    if (existing) {
      const nextName = rawName ? sanitizePlayerName(rawName) : existing.name;
      if (rawName && nextName !== existing.name) {
        await this.db
          .prepare('UPDATE players SET name = ?1, updated_at = ?2 WHERE id = ?3')
          .bind(nextName, Date.now(), id)
          .run();
        existing.name = nextName;
      }
      return existing;
    }

    const name = sanitizePlayerName(rawName);
    const now = Date.now();
    const fresh: PlayerRow = {
      id,
      name,
      coins: STARTING_COINS,
      gems: STARTING_GEMS,
      wins: 0,
      matches_played: 0,
      owned_json: '[]',
      loadout_json: '{"skins":{},"ring":null}',
      last_daily_claim: null,
      updated_at: now,
    };

    await this.db
      .prepare(
        `INSERT OR IGNORE INTO players
         (id, name, coins, gems, wins, matches_played, owned_json, loadout_json, last_daily_claim, updated_at)
         VALUES (?1, ?2, ?3, ?4, 0, 0, ?5, ?6, NULL, ?7)`,
      )
      .bind(fresh.id, fresh.name, fresh.coins, fresh.gems, fresh.owned_json, fresh.loadout_json, now)
      .run();

    const confirmed = await this.db
      .prepare('SELECT * FROM players WHERE id = ?1')
      .bind(id)
      .first<PlayerRow>();
    return confirmed ?? fresh;
  }

  public async getProfile(playerId: string, name?: string, nowMs = Date.now()): Promise<PlayerProfile> {
    const row = await this.fetchOrCreateRow(playerId, name);
    return rowToProfile(row, getTodayUtcDate(nowMs));
  }

  public async buyItem(playerId: string, itemId: string, nowMs = Date.now()): Promise<PlayerProfile> {
    const item = getShopItem(itemId);
    if (!item) throw new Error('Unknown shop item');
    const today = getTodayUtcDate(nowMs);
    const dealIds = getDailyDealIds(today);
    const cost = getEffectivePrice(item, dealIds);

    const row = await this.fetchOrCreateRow(playerId);
    const owned = parseOwned(row.owned_json);
    if (owned.includes(item.id)) {
      throw new Error('Item already owned');
    }

    if (item.currency === 'coins') {
      if (row.coins < cost) throw new Error('Not enough Coins');
      row.coins -= cost;
    } else {
      if (row.gems < cost) throw new Error('Not enough Gems');
      row.gems -= cost;
    }

    owned.push(item.id);
    const loadout = parseLoadout(row.loadout_json);
    if (item.category === 'skin' && item.brawlerId) {
      loadout.skins[item.brawlerId] = item.id;
    } else if (item.category === 'ring') {
      loadout.ring = item.id;
    }

    row.owned_json = JSON.stringify(owned);
    row.loadout_json = JSON.stringify(loadout);
    row.updated_at = nowMs;

    await this.db
      .prepare(
        'UPDATE players SET coins = ?1, gems = ?2, owned_json = ?3, loadout_json = ?4, updated_at = ?5 WHERE id = ?6',
      )
      .bind(row.coins, row.gems, row.owned_json, row.loadout_json, row.updated_at, row.id)
      .run();

    return rowToProfile(row, today);
  }

  public async equipItem(
    playerId: string,
    category: 'skin' | 'ring',
    itemId: string | null,
    brawlerId?: BrawlerId,
    nowMs = Date.now(),
  ): Promise<PlayerProfile> {
    const today = getTodayUtcDate(nowMs);
    const row = await this.fetchOrCreateRow(playerId);
    const owned = parseOwned(row.owned_json);
    const loadout = parseLoadout(row.loadout_json);

    if (category === 'ring') {
      if (itemId === null) {
        loadout.ring = null;
      } else {
        const item = getShopItem(itemId);
        if (!item || item.category !== 'ring' || !owned.includes(item.id)) {
          throw new Error('Aura Ring not owned');
        }
        loadout.ring = item.id;
      }
    } else {
      if (itemId === null) {
        if (brawlerId && BRAWLERS[brawlerId]) {
          delete loadout.skins[brawlerId];
        }
      } else {
        const item = getShopItem(itemId);
        if (!item || item.category !== 'skin' || !item.brawlerId || !owned.includes(item.id)) {
          throw new Error('Skin not owned');
        }
        loadout.skins[item.brawlerId] = item.id;
      }
    }

    row.loadout_json = JSON.stringify(loadout);
    row.updated_at = nowMs;

    await this.db
      .prepare('UPDATE players SET loadout_json = ?1, updated_at = ?2 WHERE id = ?3')
      .bind(row.loadout_json, row.updated_at, row.id)
      .run();

    return rowToProfile(row, today);
  }

  public async claimDaily(playerId: string, nowMs = Date.now()): Promise<PlayerProfile> {
    const today = getTodayUtcDate(nowMs);
    const row = await this.fetchOrCreateRow(playerId);
    if (row.last_daily_claim === today) {
      throw new Error('Daily gift already claimed today');
    }

    row.coins += DAILY_FREE_COINS;
    row.gems += DAILY_FREE_GEMS;
    row.last_daily_claim = today;
    row.updated_at = nowMs;

    await this.db
      .prepare(
        'UPDATE players SET coins = ?1, gems = ?2, last_daily_claim = ?3, updated_at = ?4 WHERE id = ?5',
      )
      .bind(row.coins, row.gems, row.last_daily_claim, row.updated_at, row.id)
      .run();

    return rowToProfile(row, today);
  }

  public async openBrawlBox(
    playerId: string,
    rand = Math.random,
    nowMs = Date.now(),
  ): Promise<BrawlBoxReward> {
    const today = getTodayUtcDate(nowMs);
    const row = await this.fetchOrCreateRow(playerId);
    if (row.coins < BRAWL_BOX_COST) {
      throw new Error(`Need ${BRAWL_BOX_COST} Coins to open a Brawl Box`);
    }

    row.coins -= BRAWL_BOX_COST;
    const owned = parseOwned(row.owned_json);
    const unowned = SHOP_ITEMS.filter((it) => !owned.includes(it.id));

    const roll = rand();
    let rewardType: 'item' | 'coins' | 'gems' = 'coins';
    let rewardCoins = 0;
    let rewardGems = 0;
    let itemId: string | undefined;
    let itemName: string | undefined;

    if (roll < 0.34 && unowned.length > 0) {
      const picked = unowned[Math.floor(rand() * unowned.length) % unowned.length];
      owned.push(picked.id);
      rewardType = 'item';
      itemId = picked.id;
      itemName = picked.name;
      const loadout = parseLoadout(row.loadout_json);
      if (picked.category === 'skin' && picked.brawlerId && !loadout.skins[picked.brawlerId]) {
        loadout.skins[picked.brawlerId] = picked.id;
      } else if (picked.category === 'ring' && !loadout.ring) {
        loadout.ring = picked.id;
      }
      row.loadout_json = JSON.stringify(loadout);
      row.owned_json = JSON.stringify(owned);
    } else if (roll < 0.68) {
      rewardType = 'gems';
      rewardGems = 12 + Math.floor(rand() * 17); // 12..28 Gems
      row.gems += rewardGems;
    } else {
      rewardType = 'coins';
      rewardCoins = 130 + Math.floor(rand() * 140); // 130..269 Coins
      row.coins += rewardCoins;
    }

    row.updated_at = nowMs;
    await this.db
      .prepare(
        'UPDATE players SET coins = ?1, gems = ?2, owned_json = ?3, loadout_json = ?4, updated_at = ?5 WHERE id = ?6',
      )
      .bind(row.coins, row.gems, row.owned_json, row.loadout_json, row.updated_at, row.id)
      .run();

    return {
      rewardType,
      itemId,
      itemName,
      coins: rewardCoins,
      gems: rewardGems,
      profile: rowToProfile(row, today),
    };
  }

  public async grantMatchReward(req: MatchRewardRequest, nowMs = Date.now()): Promise<MatchRewardResult> {
    const today = getTodayUtcDate(nowMs);
    const row = await this.fetchOrCreateRow(req.playerId, req.name);
    const { coinsEarned, gemsEarned, milestoneHit } = computeMatchReward(req, row.wins);

    row.coins += coinsEarned;
    row.gems += gemsEarned;
    row.matches_played += 1;
    if (req.outcome === 'victory') {
      row.wins += 1;
    }
    row.updated_at = nowMs;

    await this.db
      .prepare(
        'UPDATE players SET coins = ?1, gems = ?2, wins = ?3, matches_played = ?4, updated_at = ?5 WHERE id = ?6',
      )
      .bind(row.coins, row.gems, row.wins, row.matches_played, row.updated_at, row.id)
      .run();

    return {
      coinsEarned,
      gemsEarned,
      milestoneHit,
      profile: rowToProfile(row, today),
    };
  }
}
