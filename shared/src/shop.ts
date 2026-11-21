import { BrawlerId, GameMode } from './types';

export type ShopCurrency = 'coins' | 'gems';
export type ShopRarity = 'rare' | 'epic' | 'mythic';
export type ShopItemCategory = 'skin' | 'ring';

export interface SkinVisualSpec {
  tintHex: number;
  tintStrength: number; // 0..1 blend toward tintHex
  emissiveHex: number;
  emissiveIntensity: number;
  metalness: number;
  roughness: number;
  accentHex: string;
}

export interface RingVisualSpec {
  primaryHex: number;
  secondaryHex: number;
  accentHex: string;
}

export interface ShopItem {
  id: string;
  name: string;
  category: ShopItemCategory;
  brawlerId?: BrawlerId;
  rarity: ShopRarity;
  currency: ShopCurrency;
  price: number;
  tagline: string;
  skinSpec?: SkinVisualSpec;
  ringSpec?: RingVisualSpec;
}

export interface PlayerLoadout {
  skins: Partial<Record<BrawlerId, string>>;
  ring: string | null;
}

export interface PlayerProfile {
  id: string;
  name: string;
  coins: number;
  gems: number;
  wins: number;
  matchesPlayed: number;
  ownedItems: string[];
  loadout: PlayerLoadout;
  lastDailyClaim: string | null;
  dailyAvailable: boolean;
  dailyDealIds: string[];
}

export interface MatchRewardRequest {
  playerId: string;
  name?: string;
  mode: GameMode;
  outcome: 'victory' | 'defeat' | 'draw';
  kills: number;
  objectives: number; // gems collected or goals scored
  isStarPlayer: boolean;
}

export interface MatchRewardResult {
  coinsEarned: number;
  gemsEarned: number;
  milestoneHit: boolean;
  profile: PlayerProfile;
}

export interface BrawlBoxReward {
  rewardType: 'item' | 'coins' | 'gems';
  itemId?: string;
  itemName?: string;
  coins: number;
  gems: number;
  profile: PlayerProfile;
}

export const STARTING_COINS = 250;
export const STARTING_GEMS = 30;
export const BRAWL_BOX_COST = 150;
export const DAILY_FREE_COINS = 100;
export const DAILY_FREE_GEMS = 15;
export const DAILY_DEAL_DISCOUNT = 0.25;

export const SHOP_ITEMS: ShopItem[] = [
  // ---- 12 3D Brawler Skins (2 per Brawler) ----
  {
    id: 'skin_buck_golden',
    name: 'Outlaw Gold Buck',
    category: 'skin',
    brawlerId: 'buck',
    rarity: 'epic',
    currency: 'coins',
    price: 300,
    tagline: 'Burnished desert gold duster & gilded shotgun.',
    skinSpec: {
      tintHex: 0xffcc33,
      tintStrength: 0.78,
      emissiveHex: 0x5c3c00,
      emissiveIntensity: 0.22,
      metalness: 0.52,
      roughness: 0.34,
      accentHex: '#ffd43b',
    },
  },
  {
    id: 'skin_buck_cyber',
    name: 'Neon Sheriff Buck',
    category: 'skin',
    brawlerId: 'buck',
    rarity: 'mythic',
    currency: 'gems',
    price: 45,
    tagline: 'Electric cyan cyber-ranger armor & plasma trim.',
    skinSpec: {
      tintHex: 0x26f0ff,
      tintStrength: 0.66,
      emissiveHex: 0x096088,
      emissiveIntensity: 0.34,
      metalness: 0.38,
      roughness: 0.38,
      accentHex: '#38ecff',
    },
  },
  {
    id: 'skin_vex_shadow',
    name: 'Shadow Ops Vex',
    category: 'skin',
    brawlerId: 'vex',
    rarity: 'epic',
    currency: 'coins',
    price: 350,
    tagline: 'Stealth midnight matte coat with violet visor.',
    skinSpec: {
      tintHex: 0x2b2148,
      tintStrength: 0.72,
      emissiveHex: 0x5c14b8,
      emissiveIntensity: 0.28,
      metalness: 0.36,
      roughness: 0.42,
      accentHex: '#a56eff',
    },
  },
  {
    id: 'skin_vex_solar',
    name: 'Solar Valkyrie Vex',
    category: 'skin',
    brawlerId: 'vex',
    rarity: 'mythic',
    currency: 'gems',
    price: 50,
    tagline: 'Radiant solar-gold plating & crimson optics.',
    skinSpec: {
      tintHex: 0xff9f1c,
      tintStrength: 0.74,
      emissiveHex: 0x8f2c00,
      emissiveIntensity: 0.26,
      metalness: 0.55,
      roughness: 0.30,
      accentHex: '#ff9f1c',
    },
  },
  {
    id: 'skin_blaze_frost',
    name: 'Cryo Striker Blaze',
    category: 'skin',
    brawlerId: 'blaze',
    rarity: 'rare',
    currency: 'coins',
    price: 300,
    tagline: 'Sub-zero arctic blue jacket & frost blasters.',
    skinSpec: {
      tintHex: 0x52d6ff,
      tintStrength: 0.72,
      emissiveHex: 0x105c8c,
      emissiveIntensity: 0.24,
      metalness: 0.30,
      roughness: 0.36,
      accentHex: '#52d6ff',
    },
  },
  {
    id: 'skin_blaze_inferno',
    name: 'True Gold Blaze',
    category: 'skin',
    brawlerId: 'blaze',
    rarity: 'mythic',
    currency: 'gems',
    price: 45,
    tagline: 'Solid championship gold finish with fiery glow.',
    skinSpec: {
      tintHex: 0xffd740,
      tintStrength: 0.82,
      emissiveHex: 0x7a4b00,
      emissiveIntensity: 0.28,
      metalness: 0.62,
      roughness: 0.26,
      accentHex: '#ffd740',
    },
  },
  {
    id: 'skin_golem_obsidian',
    name: 'Obsidian Titan Golem',
    category: 'skin',
    brawlerId: 'golem',
    rarity: 'epic',
    currency: 'coins',
    price: 350,
    tagline: 'Volcanic black basalt chassis with magma core.',
    skinSpec: {
      tintHex: 0x26212c,
      tintStrength: 0.76,
      emissiveHex: 0xb82b00,
      emissiveIntensity: 0.34,
      metalness: 0.44,
      roughness: 0.46,
      accentHex: '#ff5226',
    },
  },
  {
    id: 'skin_golem_royal',
    name: 'Royal Mecha Golem',
    category: 'skin',
    brawlerId: 'golem',
    rarity: 'mythic',
    currency: 'gems',
    price: 50,
    tagline: 'Emerald & gold imperial colossus armor.',
    skinSpec: {
      tintHex: 0x26d978,
      tintStrength: 0.68,
      emissiveHex: 0x0a6636,
      emissiveIntensity: 0.26,
      metalness: 0.48,
      roughness: 0.34,
      accentHex: '#2ee882',
    },
  },
  {
    id: 'skin_mort_toxic',
    name: 'Biohazard Neon Mort',
    category: 'skin',
    brawlerId: 'mort',
    rarity: 'rare',
    currency: 'coins',
    price: 300,
    tagline: 'Radioactive lime hazmat suit & glowing flasks.',
    skinSpec: {
      tintHex: 0x7cff38,
      tintStrength: 0.64,
      emissiveHex: 0x267500,
      emissiveIntensity: 0.30,
      metalness: 0.24,
      roughness: 0.44,
      accentHex: '#84ff42',
    },
  },
  {
    id: 'skin_mort_alchemist',
    name: 'Royal Alchemist Mort',
    category: 'skin',
    brawlerId: 'mort',
    rarity: 'mythic',
    currency: 'gems',
    price: 45,
    tagline: 'Amethyst & gold arcane apothecary robes.',
    skinSpec: {
      tintHex: 0xc85cff,
      tintStrength: 0.70,
      emissiveHex: 0x58148c,
      emissiveIntensity: 0.30,
      metalness: 0.40,
      roughness: 0.36,
      accentHex: '#d375ff',
    },
  },
  {
    id: 'skin_lumi_starlight',
    name: 'Starlight Pop Lumi',
    category: 'skin',
    brawlerId: 'lumi',
    rarity: 'rare',
    currency: 'coins',
    price: 300,
    tagline: 'Electric cosmic-violet stage outfit & neon guitar.',
    skinSpec: {
      tintHex: 0x708bff,
      tintStrength: 0.66,
      emissiveHex: 0x24349e,
      emissiveIntensity: 0.30,
      metalness: 0.32,
      roughness: 0.38,
      accentHex: '#7e99ff',
    },
  },
  {
    id: 'skin_lumi_gold',
    name: 'Golden Encore Lumi',
    category: 'skin',
    brawlerId: 'lumi',
    rarity: 'mythic',
    currency: 'gems',
    price: 50,
    tagline: 'Platinum-gold arena headliner edition.',
    skinSpec: {
      tintHex: 0xffd24a,
      tintStrength: 0.78,
      emissiveHex: 0x704800,
      emissiveIntensity: 0.26,
      metalness: 0.58,
      roughness: 0.28,
      accentHex: '#ffd24a',
    },
  },

  // ---- 5 Custom Ground Aura Rings (Global Cosmetic) ----
  {
    id: 'ring_gold',
    name: 'Crown Gold Aura',
    category: 'ring',
    rarity: 'rare',
    currency: 'coins',
    price: 200,
    tagline: 'Radiant golden champion ring beneath your brawler.',
    ringSpec: { primaryHex: 0xffd43b, secondaryHex: 0xfff3a6, accentHex: '#ffd43b' },
  },
  {
    id: 'ring_plasma',
    name: 'Plasma Cyan Aura',
    category: 'ring',
    rarity: 'rare',
    currency: 'coins',
    price: 250,
    tagline: 'High-voltage neon cyan ring pulsing in battle.',
    ringSpec: { primaryHex: 0x26f5ff, secondaryHex: 0xa6fcff, accentHex: '#26f5ff' },
  },
  {
    id: 'ring_sakura',
    name: 'Sakura Rose Aura',
    category: 'ring',
    rarity: 'epic',
    currency: 'coins',
    price: 250,
    tagline: 'Vibrant cherry-blossom pink hero ring.',
    ringSpec: { primaryHex: 0xff66b5, secondaryHex: 0xffc2e2, accentHex: '#ff66b5' },
  },
  {
    id: 'ring_lava',
    name: 'Molten Ember Aura',
    category: 'ring',
    rarity: 'epic',
    currency: 'gems',
    price: 25,
    tagline: 'Blazing foundry-orange ring forged in magma.',
    ringSpec: { primaryHex: 0xff621a, secondaryHex: 0xffd04d, accentHex: '#ff621a' },
  },
  {
    id: 'ring_void',
    name: 'Cosmic Void Aura',
    category: 'ring',
    rarity: 'mythic',
    currency: 'gems',
    price: 35,
    tagline: 'Deep ultraviolet energy halo from the gem rift.',
    ringSpec: { primaryHex: 0xc24dff, secondaryHex: 0x6ef2ff, accentHex: '#c24dff' },
  },
];

export const SHOP_ITEM_MAP: Record<string, ShopItem> = Object.fromEntries(
  SHOP_ITEMS.map((item) => [item.id, item]),
);

export function getShopItem(id: string | null | undefined): ShopItem | null {
  if (!id) return null;
  return SHOP_ITEM_MAP[id] ?? null;
}

export function getTodayUtcDate(nowMs = Date.now()): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Deterministic daily featured deals (1 coin item + 1 gem item, 25% OFF). */
export function getDailyDealIds(dateStr = getTodayUtcDate()): string[] {
  let hash = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const coinItems = SHOP_ITEMS.filter((it) => it.currency === 'coins');
  const gemItems = SHOP_ITEMS.filter((it) => it.currency === 'gems');
  const pickCoin = coinItems[hash % coinItems.length];
  const pickGem = gemItems[(hash >>> 5) % gemItems.length];
  return [pickCoin.id, pickGem.id];
}

export function getEffectivePrice(item: ShopItem, dailyDealIds: string[]): number {
  if (dailyDealIds.includes(item.id)) {
    return Math.max(1, Math.round(item.price * (1 - DAILY_DEAL_DISCOUNT)));
  }
  return item.price;
}

export function computeMatchReward(req: Omit<MatchRewardRequest, 'playerId' | 'name'>, prevWins: number): {
  coinsEarned: number;
  gemsEarned: number;
  milestoneHit: boolean;
} {
  const baseCoins = req.outcome === 'victory' ? 120 : req.outcome === 'draw' ? 60 : 40;
  const clampedKills = Math.max(0, Math.min(25, Math.floor(req.kills)));
  const clampedObj = Math.max(0, Math.min(30, Math.floor(req.objectives)));
  const killBonus = clampedKills * 8;
  const objBonus = req.mode === 'brawl-ball' ? clampedObj * 20 : Math.floor(clampedObj / 3) * 15;
  const starBonus = req.isStarPlayer ? 40 : 0;
  const coinsEarned = Math.min(340, baseCoins + killBonus + objBonus + starBonus);

  const nextWins = prevWins + (req.outcome === 'victory' ? 1 : 0);
  const milestoneHit = req.outcome === 'victory' && nextWins > 0 && nextWins % 3 === 0;
  const gemsEarned = milestoneHit ? 10 : 0;
  return { coinsEarned, gemsEarned, milestoneHit };
}
