export type Team = 'blue' | 'red';

export type BrawlerId = 'buck' | 'vex' | 'blaze' | 'golem' | 'mort' | 'lumi';

export type MapId = 'crystal-cavern' | 'twin-bridges';

export enum TileType {
  EMPTY = 0,
  WALL_BREAKABLE = 1,
  WALL_SOLID = 2,
  BUSH = 3,
  WATER = 4,
  GEM_MINE = 5,
}

export type TelegraphShape = 'cone' | 'line' | 'circle' | 'arc';

export interface Vec2 {
  x: number;
  y: number;
}

export interface AttackSpec {
  shape: TelegraphShape;
  range: number;
  spreadRad: number;
  projectiles: number;
  burstCount?: number;
  burstInterval?: number;
  speed: number;
  radius: number;
  damage: number;
  minDamage?: number;
  piercing?: boolean;
  lobbed?: boolean;
  puddleDuration?: number;
  puddleRadius?: number;
  puddleDps?: number;
  knockback?: number;
  breaksWalls?: boolean;
  isLeap?: boolean;
  leapBackwards?: boolean;
  dropBombs?: number;
  isHeal?: boolean;
  healAmount?: number;
  superChargePerHit: number;
}

export interface BrawlerConfig {
  id: BrawlerId;
  name: string;
  title: string;
  role: string;
  primaryColor: string;
  accentColor: string;
  maxHp: number;
  moveSpeed: number;
  radius: number;
  maxAmmo: number;
  reloadTime: number;
  attackCooldown: number;
  attack: AttackSpec;
  superAttack: AttackSpec;
  description: string;
  superDescription: string;
}

export interface MapDefinition {
  id: MapId;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  grid: Uint8Array;
  minePos: Vec2;
  spawns: {
    blue: Vec2[];
    red: Vec2[];
  };
}

export interface LeapState {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  elapsed: number;
  duration: number;
  height: number;
  onLandDamage: number;
  onLandRadius: number;
  onLandKnockback: number;
  breaksWalls: boolean;
  superChargePerHit: number;
}

export interface BurstQueue {
  remaining: number;
  timer: number;
  interval: number;
  angle: number;
  isSuper: boolean;
}

export interface BrawlerStats {
  kills: number;
  deaths: number;
  damageDealt: number;
  healingDone: number;
  gemsCollected: number;
}

export interface BrawlerState {
  slotIndex: number;
  team: Team;
  name: string;
  isBot: boolean;
  brawlerId: BrawlerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  ammo: number;
  attackCooldown: number;
  superCharge: number;
  gems: number;
  alive: boolean;
  respawnTimer: number;
  invulnTimer: number;
  outOfCombatTimer: number;
  healTickTimer: number;
  revealedTimer: number;
  recoilTimer: number;
  leap: LeapState | null;
  burst: BurstQueue | null;
  stats: BrawlerStats;
}

export interface ProjectileState {
  id: number;
  ownerSlot: number;
  team: Team;
  brawlerId: BrawlerId;
  isSuper: boolean;
  x: number;
  y: number;
  startX: number;
  startY: number;
  vx: number;
  vy: number;
  radius: number;
  maxRange: number;
  traveled: number;
  damage: number;
  minDamage: number;
  piercing: boolean;
  lobbed: boolean;
  targetX: number;
  targetY: number;
  flightDuration: number;
  elapsed: number;
  puddleDuration: number;
  puddleRadius: number;
  puddleDps: number;
  knockback: number;
  breaksWalls: boolean;
  isHeal: boolean;
  healAmount: number;
  superChargePerHit: number;
  hitSlots: number[];
}

export interface HazardZoneState {
  id: number;
  ownerSlot: number;
  team: Team;
  brawlerId: BrawlerId;
  kind: 'puddle' | 'bomb';
  x: number;
  y: number;
  radius: number;
  remaining: number;
  duration: number;
  dps: number;
  explodeDamage: number;
  breaksWalls: boolean;
  superChargePerHit: number;
  tickAccum: number;
}

export interface GemState {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
  popTimer: number;
  popDuration: number;
}

export type MatchPhase = 'playing' | 'sudden_death' | 'ended';

export type MatchEvent =
  | { type: 'attack'; slotIndex: number; brawlerId: BrawlerId; isSuper: boolean; x: number; y: number; angle: number }
  | { type: 'hit'; targetSlot: number; attackerSlot: number; amount: number; x: number; y: number }
  | { type: 'heal'; targetSlot: number; amount: number; x: number; y: number }
  | { type: 'kill'; victimSlot: number; killerSlot: number; x: number; y: number }
  | { type: 'wall_break'; tiles: Array<{ tx: number; ty: number }> }
  | { type: 'gem_spawn'; x: number; y: number }
  | { type: 'gem_pickup'; slotIndex: number; x: number; y: number }
  | { type: 'countdown_start'; team: Team }
  | { type: 'countdown_cancel' }
  | { type: 'match_end'; winner: Team | 'draw'; starPlayerSlot: number };

export interface PlayerInput {
  moveX: number;
  moveY: number;
  aimAngle: number;
  fire: boolean;
  superFire: boolean;
  autoAim: boolean;
}

export interface SlotSetup {
  slotIndex: number;
  team: Team;
  name: string;
  isBot: boolean;
  brawlerId: BrawlerId;
}

export interface MatchConfig {
  mapId: MapId;
  slots: SlotSetup[];
  seed?: number;
}

export interface MatchState {
  mapId: MapId;
  width: number;
  height: number;
  grid: Uint8Array;
  phase: MatchPhase;
  elapsed: number;
  maxDuration: number;
  suddenDeathRemaining: number;
  gemSpawnTimer: number;
  gemsSpawnedTotal: number;
  maxGemsTotal: number;
  countdownTeam: Team | null;
  countdownTimer: number;
  winner: Team | 'draw' | null;
  starPlayerSlot: number;
  brawlers: BrawlerState[];
  projectiles: ProjectileState[];
  hazards: HazardZoneState[];
  gems: GemState[];
  blueGems: number;
  redGems: number;
  nextEntityId: number;
}
