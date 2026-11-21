import { describe, it, expect } from 'vitest';
import {
  BRAWL_BOX_COST,
  DAILY_FREE_COINS,
  DAILY_FREE_GEMS,
  getDailyDealIds,
  getEffectivePrice,
  getShopItem,
  STARTING_COINS,
  STARTING_GEMS,
} from '@brawl-arena/shared';
import { ShopRepository } from '../src/shopDb';

/** Minimal in-memory D1Database mock supporting our 1-table `players` SQL queries. */
function createMockD1(): D1Database {
  const rows = new Map<string, Record<string, unknown>>();

  const makeStmt = (sql: string, params: unknown[] = []) => ({
    bind(...args: unknown[]) {
      return makeStmt(sql, args);
    },
    async first<T = unknown>(): Promise<T | null> {
      if (sql.startsWith('SELECT * FROM players WHERE id =')) {
        const row = rows.get(String(params[0]));
        return row ? ({ ...row } as T) : null;
      }
      return null;
    },
    async run() {
      const trimmed = sql.trim();
      if (trimmed.startsWith('CREATE TABLE')) {
        return { success: true };
      }
      if (trimmed.startsWith('INSERT OR IGNORE INTO players')) {
        const [id, name, coins, gems, owned_json, loadout_json, updated_at] = params;
        const key = String(id);
        if (!rows.has(key)) {
          rows.set(key, {
            id: key,
            name,
            coins,
            gems,
            wins: 0,
            matches_played: 0,
            owned_json,
            loadout_json,
            last_daily_claim: null,
            updated_at,
          });
        }
        return { success: true };
      }
      if (trimmed.startsWith('UPDATE players SET name =')) {
        const [name, updated_at, id] = params;
        const row = rows.get(String(id));
        if (row) {
          row.name = name;
          row.updated_at = updated_at;
        }
        return { success: true };
      }
      if (trimmed.startsWith('UPDATE players SET coins = ?1, gems = ?2, owned_json =')) {
        const [coins, gems, owned_json, loadout_json, updated_at, id] = params;
        const row = rows.get(String(id));
        if (row) {
          row.coins = coins;
          row.gems = gems;
          row.owned_json = owned_json;
          row.loadout_json = loadout_json;
          row.updated_at = updated_at;
        }
        return { success: true };
      }
      if (trimmed.startsWith('UPDATE players SET loadout_json =')) {
        const [loadout_json, updated_at, id] = params;
        const row = rows.get(String(id));
        if (row) {
          row.loadout_json = loadout_json;
          row.updated_at = updated_at;
        }
        return { success: true };
      }
      if (trimmed.startsWith('UPDATE players SET coins = ?1, gems = ?2, last_daily_claim =')) {
        const [coins, gems, last_daily_claim, updated_at, id] = params;
        const row = rows.get(String(id));
        if (row) {
          row.coins = coins;
          row.gems = gems;
          row.last_daily_claim = last_daily_claim;
          row.updated_at = updated_at;
        }
        return { success: true };
      }
      if (trimmed.startsWith('UPDATE players SET coins = ?1, gems = ?2, wins =')) {
        const [coins, gems, wins, matches_played, updated_at, id] = params;
        const row = rows.get(String(id));
        if (row) {
          row.coins = coins;
          row.gems = gems;
          row.wins = wins;
          row.matches_played = matches_played;
          row.updated_at = updated_at;
        }
        return { success: true };
      }
      throw new Error(`Unhandled SQL in mock D1: ${trimmed}`);
    },
  });

  return {
    prepare(sql: string) {
      return makeStmt(sql);
    },
  } as unknown as D1Database;
}

describe('Cloudflare D1 Cosmetic Shop Repository', () => {
  const fixedDay = Date.parse('2026-11-22T12:00:00Z');

  it('auto-creates a profile with starter wallet, claims daily gift once per UTC day, and buys/equips cosmetics', async () => {
    const repo = new ShopRepository(createMockD1());
    const p0 = await repo.getProfile('player_alpha', 'Haris', fixedDay);
    expect(p0.coins).toBe(STARTING_COINS);
    expect(p0.gems).toBe(STARTING_GEMS);
    expect(p0.dailyAvailable).toBe(true);
    expect(p0.dailyDealIds).toHaveLength(2);

    // Claim daily gift (+100 coins, +15 gems)
    const p1 = await repo.claimDaily('player_alpha', fixedDay);
    expect(p1.coins).toBe(STARTING_COINS + DAILY_FREE_COINS);
    expect(p1.gems).toBe(STARTING_GEMS + DAILY_FREE_GEMS);
    expect(p1.dailyAvailable).toBe(false);
    await expect(repo.claimDaily('player_alpha', fixedDay)).rejects.toThrow('already claimed');

    // Buy a skin (respecting daily deal discount if featured!) and verify auto-equip
    const skin = getShopItem('skin_buck_golden')!;
    const expectedCost = getEffectivePrice(skin, getDailyDealIds('2026-11-22'));
    const p2 = await repo.buyItem('player_alpha', 'skin_buck_golden', fixedDay);
    expect(p2.coins).toBe(p1.coins - expectedCost);
    expect(p2.ownedItems).toContain('skin_buck_golden');
    expect(p2.loadout.skins.buck).toBe('skin_buck_golden');

    // Duplicate purchase rejected
    await expect(repo.buyItem('player_alpha', 'skin_buck_golden', fixedDay)).rejects.toThrow('already owned');

    // Unequip skin back to default & re-equip
    const p3 = await repo.equipItem('player_alpha', 'skin', null, 'buck', fixedDay);
    expect(p3.loadout.skins.buck).toBeUndefined();
    const p4 = await repo.equipItem('player_alpha', 'skin', 'skin_buck_golden', 'buck', fixedDay);
    expect(p4.loadout.skins.buck).toBe('skin_buck_golden');
  });

  it('opens Mystery Brawl Boxes and awards match Coins + 3-win Gem milestone', async () => {
    const repo = new ShopRepository(createMockD1());
    await repo.getProfile('player_beta', 'Tester', fixedDay);

    // Deterministic roll < 0.34 -> grants a cosmetic item from Brawl Box
    const boxRes = await repo.openBrawlBox('player_beta', () => 0.1, fixedDay);
    expect(boxRes.rewardType).toBe('item');
    expect(boxRes.itemId).toBeTruthy();
    expect(boxRes.profile.coins).toBe(STARTING_COINS - BRAWL_BOX_COST);
    expect(boxRes.profile.ownedItems).toContain(boxRes.itemId!);

    // Win 3 matches -> 3rd win triggers +10 Gems milestone!
    let r1 = await repo.grantMatchReward(
      { playerId: 'player_beta', mode: 'brawl-ball', outcome: 'victory', kills: 3, objectives: 2, isStarPlayer: true },
      fixedDay,
    );
    expect(r1.coinsEarned).toBeGreaterThan(150);
    expect(r1.gemsEarned).toBe(0);
    expect(r1.milestoneHit).toBe(false);

    await repo.grantMatchReward(
      { playerId: 'player_beta', mode: 'gem-grab', outcome: 'victory', kills: 2, objectives: 6, isStarPlayer: false },
      fixedDay,
    );
    const r3 = await repo.grantMatchReward(
      { playerId: 'player_beta', mode: 'gem-grab', outcome: 'victory', kills: 4, objectives: 9, isStarPlayer: true },
      fixedDay,
    );
    expect(r3.milestoneHit).toBe(true);
    expect(r3.gemsEarned).toBe(10);
    expect(r3.profile.wins).toBe(3);
    expect(r3.profile.gems).toBe(STARTING_GEMS + 10);
  });
});
