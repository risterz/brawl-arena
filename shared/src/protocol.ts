import {
  BallState,
  BrawlerId,
  BrawlerState,
  GameMode,
  GemState,
  HazardZoneState,
  MapId,
  MatchEvent,
  MatchPhase,
  MatchState,
  PlayerInput,
  ProjectileState,
  Team,
} from './types';

export interface LobbySlot {
  slotIndex: number;
  team: Team;
  name: string;
  brawlerId: BrawlerId;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  enabled?: boolean;
  tokenHash?: string;
}

export interface LobbyState {
  code: string;
  mapId: MapId;
  mode: GameMode;
  blueSize?: number;
  redSize?: number;
  fillBots?: boolean;
  hostSlot: number;
  hostToken?: string;
  inMatch: boolean;
  slots: LobbySlot[];
}

export interface CompactInput {
  /** Quantized movement direction (-1..16; -1 = idle, 0..15 = 16 compass directions) */
  md: number;
  /** Quantized aim angle in 5-degree steps (0..71) */
  aa: number;
  /** Bitmask: 1=fire, 2=superFire, 4=autoAim, 8=tackle */
  fl: number;
}

export function quantizeInput(input: PlayerInput): CompactInput {
  const len = Math.hypot(input.moveX, input.moveY);
  let md = -1;
  if (len > 0.15) {
    const ang = Math.atan2(input.moveY, input.moveX);
    const norm = ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    md = Math.round((norm / (Math.PI * 2)) * 16) % 16;
  }
  const aimNorm = ((input.aimAngle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const aa = Math.round((aimNorm / (Math.PI * 2)) * 72) % 72;
  const fl =
    (input.fire ? 1 : 0) |
    (input.superFire ? 2 : 0) |
    (input.autoAim ? 4 : 0) |
    (input.tackle ? 8 : 0);
  return { md, aa, fl };
}

export function dequantizeInput(c: CompactInput): PlayerInput {
  let moveX = 0;
  let moveY = 0;
  if (c.md >= 0 && c.md < 16) {
    const rad = (c.md / 16) * Math.PI * 2;
    moveX = Math.cos(rad);
    moveY = Math.sin(rad);
  }
  const aimAngle = (c.aa / 72) * Math.PI * 2;
  return {
    moveX,
    moveY,
    aimAngle,
    fire: (c.fl & 1) !== 0,
    superFire: (c.fl & 2) !== 0,
    autoAim: (c.fl & 4) !== 0,
    tackle: (c.fl & 8) !== 0,
  };
}

export function inputsDiffer(a: CompactInput | null, b: CompactInput): boolean {
  if (!a) return true;
  return a.md !== b.md || a.aa !== b.aa || a.fl !== b.fl;
}

export interface MatchSnapshot {
  tick: number;
  hostSlot?: number;
  mapId: MapId;
  mode: GameMode;
  phase: MatchPhase;
  elapsed: number;
  maxDuration: number;
  suddenDeathRemaining: number;
  countdownTeam: Team | null;
  countdownTimer: number;
  goalResetTimer: number;
  lastGoalTeam: Team | null;
  winner: Team | 'draw' | null;
  starPlayerSlot: number;
  blueGems: number;
  redGems: number;
  brokenWalls: Array<{ tx: number; ty: number }>;
  brawlers: BrawlerState[];
  projectiles: ProjectileState[];
  hazards: HazardZoneState[];
  gems: GemState[];
  ball: BallState | null;
  events: MatchEvent[];
}

export function serializeSnapshot(
  state: MatchState,
  events: MatchEvent[],
  tick = 0,
  brokenWalls: Array<{ tx: number; ty: number }> = [],
): MatchSnapshot {
  return {
    tick,
    mapId: state.mapId,
    mode: state.mode,
    phase: state.phase,
    elapsed: Number(state.elapsed.toFixed(2)),
    maxDuration: state.maxDuration,
    suddenDeathRemaining: Number(state.suddenDeathRemaining.toFixed(2)),
    countdownTeam: state.countdownTeam,
    countdownTimer: Number(state.countdownTimer.toFixed(2)),
    goalResetTimer: Number(state.goalResetTimer.toFixed(2)),
    lastGoalTeam: state.lastGoalTeam,
    winner: state.winner,
    starPlayerSlot: state.starPlayerSlot,
    blueGems: state.blueGems,
    redGems: state.redGems,
    brokenWalls,
    brawlers: state.brawlers.map((b) => ({
      ...b,
      x: Number(b.x.toFixed(3)),
      y: Number(b.y.toFixed(3)),
      vx: Number(b.vx.toFixed(2)),
      vy: Number(b.vy.toFixed(2)),
      facing: Number(b.facing.toFixed(3)),
      ammo: Number(b.ammo.toFixed(2)),
      superCharge: Math.round(b.superCharge),
      tackleCooldown: Number(b.tackleCooldown.toFixed(2)),
      tackleTimer: Number(b.tackleTimer.toFixed(2)),
      leap: b.leap ? { ...b.leap } : null,
      dash: b.dash ? { ...b.dash, hitSlots: [] } : null,
      burst: null,
      stats: { ...b.stats },
    })),
    projectiles: state.projectiles.map((p) => ({
      ...p,
      x: Number(p.x.toFixed(2)),
      y: Number(p.y.toFixed(2)),
      hitSlots: [],
    })),
    hazards: state.hazards.map((h) => ({
      ...h,
      x: Number(h.x.toFixed(2)),
      y: Number(h.y.toFixed(2)),
      remaining: Number(h.remaining.toFixed(2)),
    })),
    gems: state.gems.map((g) => ({
      ...g,
      x: Number(g.x.toFixed(2)),
      y: Number(g.y.toFixed(2)),
      popTimer: Number(g.popTimer.toFixed(2)),
    })),
    ball: state.ball
      ? {
          ...state.ball,
          x: Number(state.ball.x.toFixed(3)),
          y: Number(state.ball.y.toFixed(3)),
          vx: Number(state.ball.vx.toFixed(2)),
          vy: Number(state.ball.vy.toFixed(2)),
          pickupCooldown: Number(state.ball.pickupCooldown.toFixed(2)),
        }
      : null,
    events,
  };
}

export type ClientMessage =
  | { type: 'set_name'; name: string }
  | { type: 'pick_brawler'; brawlerId: BrawlerId }
  | { type: 'switch_team'; team: Team }
  | { type: 'pick_map'; mapId: MapId }
  | { type: 'pick_mode'; mode: GameMode }
  | { type: 'set_team_sizes'; blueSize: number; redSize: number }
  | { type: 'set_fill_bots'; fillBots: boolean }
  | { type: 'start_match' }
  | { type: 'return_lobby' }
  | { type: 'input'; input: CompactInput }
  | { type: 'ping'; t: number };

export type ServerMessage =
  | { type: 'welcome'; slotIndex: number; team: Team; token: string; lobby: LobbyState }
  | { type: 'lobby'; lobby: LobbyState }
  | { type: 'match_start'; mapId: MapId; mode: GameMode; slotIndex: number; team: Team; snapshot: MatchSnapshot }
  | { type: 'snapshot'; snapshot: MatchSnapshot }
  | { type: 'error'; message: string }
  | { type: 'pong'; t: number };
