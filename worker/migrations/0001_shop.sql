-- Lightweight 1-row-per-player schema optimized for Cloudflare D1 Free Tier
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
);
