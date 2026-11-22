import {
  BrawlerId,
  BRAWLERS,
  ClientMessage,
  createGridCopy,
  DashState,
  GameMode,
  LobbyState,
  MAP_HEIGHT,
  MAP_WIDTH,
  MapId,
  MatchEvent,
  MatchSnapshot,
  MatchState,
  PlayerInput,
  prepareBrawlBallGrid,
  quantizeInput,
  resolveCircleGridCollision,
  ServerMessage,
  setTile,
  Team,
  TileType,
} from '@brawl-arena/shared';
import { InputThrottle } from '../input/controls';

export interface OnlineCallbacks {
  onLobby: (lobby: LobbyState, mySlot: number, myTeam: Team) => void;
  onMatchStart: (mapId: MapId, mySlot: number, myTeam: Team, state: MatchState) => void;
  onEvents: (events: MatchEvent[]) => void;
  onError: (message: string) => void;
  onDisconnect: (reason?: string) => void;
}

interface TimedSnapshot {
  timeMs: number;
  snapshot: MatchSnapshot;
}

const INTERP_DELAY_MS = 75;

function getOrCreateToken(code: string): string {
  const key = `brawl_arena_token_${code.toUpperCase()}`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = `t_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return `t_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export class OnlineMatchController {
  private ws: WebSocket | null = null;
  private callbacks: OnlineCallbacks;
  private throttle = new InputThrottle(50, 1000);
  private mySlot = 0;
  private myTeam: Team = 'blue';
  private code = '';
  private lobby: LobbyState | null = null;
  private state: MatchState | null = null;
  private snapBuffer: TimedSnapshot[] = [];
  private latestLocalDash: DashState | null = null;
  private predX = 0;
  private predY = 0;
  private predInit = false;
  private intentionalClose = false;

  constructor(callbacks: OnlineCallbacks) {
    this.callbacks = callbacks;
  }

  public getRoomCode(): string {
    return this.code;
  }

  public getMySlot(): number {
    return this.mySlot;
  }

  public getLobby(): LobbyState | null {
    return this.lobby;
  }

  public getState(): MatchState | null {
    return this.state;
  }

  public async createRoom(): Promise<string> {
    const res = await fetch('/api/rooms', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Failed to create room');
    }
    const data = (await res.json()) as { code: string };
    return data.code;
  }

  public connect(rawCode: string, playerName: string): void {
    this.disconnect();
    const code = rawCode.trim().toUpperCase();
    this.code = code;
    this.intentionalClose = false;
    this.throttle.reset();
    this.snapBuffer = [];
    this.latestLocalDash = null;
    this.predInit = false;

    const token = getOrCreateToken(code);
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/room/${code}?token=${encodeURIComponent(token)}&name=${encodeURIComponent(playerName)}`;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data)) as ServerMessage;
      } catch {
        return;
      }

      if (msg.type === 'welcome') {
        this.mySlot = msg.slotIndex;
        this.myTeam = msg.team;
        this.lobby = msg.lobby;
        this.callbacks.onLobby(msg.lobby, this.mySlot, this.myTeam);
      } else if (msg.type === 'lobby') {
        this.lobby = msg.lobby;
        this.state = null;
        this.callbacks.onLobby(msg.lobby, this.mySlot, this.myTeam);
      } else if (msg.type === 'match_start') {
        this.mySlot = msg.slotIndex;
        this.myTeam = msg.team;
        this.snapBuffer = [];
        this.predInit = false;
        this.state = this.buildStateFromSnapshot(msg.snapshot);
        this.snapBuffer.push({ timeMs: performance.now(), snapshot: msg.snapshot });
        this.callbacks.onMatchStart(msg.mapId, this.mySlot, this.myTeam, this.state);
      } else if (msg.type === 'snapshot') {
        const now = performance.now();
        this.snapBuffer.push({ timeMs: now, snapshot: msg.snapshot });
        if (this.snapBuffer.length > 10) this.snapBuffer.shift();
        this.applySnapshotMetadata(msg.snapshot);
        if (msg.snapshot.events.length > 0) {
          this.callbacks.onEvents(msg.snapshot.events);
        }
      } else if (msg.type === 'error') {
        this.callbacks.onError(msg.message);
      }
    };

    ws.onclose = (ev) => {
      if (this.ws === ws) this.ws = null;
      if (!this.intentionalClose) {
        this.callbacks.onDisconnect(ev.reason || undefined);
      }
    };
  }

  public disconnect(): void {
    this.intentionalClose = true;
    if (this.ws) {
      try {
        this.ws.close(1000, 'Leave');
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.state = null;
    this.lobby = null;
    this.snapBuffer = [];
    this.latestLocalDash = null;
  }

  public ingestSnapshotForTest(snap: MatchSnapshot, timeMs: number, mySlot?: number): void {
    if (typeof mySlot === 'number') {
      this.mySlot = mySlot;
      this.myTeam = snap.brawlers[mySlot]?.team ?? 'blue';
    }
    this.snapBuffer.push({ timeMs, snapshot: snap });
    if (this.snapBuffer.length > 10) this.snapBuffer.shift();
    this.applySnapshotMetadata(snap);
  }

  private send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public setName(name: string): void {
    this.send({ type: 'set_name', name });
  }

  public pickBrawler(brawlerId: BrawlerId): void {
    this.send({ type: 'pick_brawler', brawlerId });
  }

  public switchTeam(team: Team): void {
    this.send({ type: 'switch_team', team });
  }

  public pickMap(mapId: MapId): void {
    this.send({ type: 'pick_map', mapId });
  }

  public pickMode(mode: GameMode): void {
    this.send({ type: 'pick_mode', mode });
  }

  public setTeamSizes(blueSize: number, redSize: number): void {
    this.send({ type: 'set_team_sizes', blueSize, redSize });
  }

  public setFillBots(fillBots: boolean): void {
    this.send({ type: 'set_fill_bots', fillBots });
  }

  public startMatch(): void {
    this.send({ type: 'start_match' });
  }

  public returnToLobby(): void {
    this.send({ type: 'return_lobby' });
  }

  private buildStateFromSnapshot(snap: MatchSnapshot): MatchState {
    const grid = createGridCopy(snap.mapId);
    if (snap.mode === 'brawl-ball') {
      prepareBrawlBallGrid(grid);
    }
    for (const w of snap.brokenWalls) {
      setTile(grid, w.tx, w.ty, TileType.EMPTY);
    }
    const me = snap.brawlers[this.mySlot];
    if (me) {
      this.predX = me.x;
      this.predY = me.y;
      this.predInit = true;
      this.latestLocalDash = me.dash ? { ...me.dash } : null;
    } else {
      this.latestLocalDash = null;
    }
    return {
      mapId: snap.mapId,
      mode: snap.mode ?? 'gem-grab',
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      grid,
      phase: snap.phase,
      elapsed: snap.elapsed,
      maxDuration: snap.maxDuration ?? 210,
      suddenDeathRemaining: snap.suddenDeathRemaining,
      gemSpawnTimer: 0,
      gemsSpawnedTotal: 0,
      maxGemsTotal: 29,
      countdownTeam: snap.countdownTeam,
      countdownTimer: snap.countdownTimer,
      goalResetTimer: snap.goalResetTimer ?? 0,
      lastGoalTeam: snap.lastGoalTeam ?? null,
      winner: snap.winner,
      starPlayerSlot: snap.starPlayerSlot,
      brawlers: snap.brawlers.map((b) => ({ ...b, stats: { ...b.stats } })),
      projectiles: snap.projectiles.map((p) => ({ ...p })),
      hazards: snap.hazards.map((h) => ({ ...h })),
      gems: snap.gems.map((g) => ({ ...g })),
      ball: snap.ball ? { ...snap.ball } : null,
      blueGems: snap.blueGems,
      redGems: snap.redGems,
      nextEntityId: 1,
    };
  }

  private applySnapshotMetadata(snap: MatchSnapshot): void {
    if (typeof snap.hostSlot === 'number' && this.lobby) {
      this.lobby.hostSlot = snap.hostSlot;
    }
    if (!this.state) {
      this.state = this.buildStateFromSnapshot(snap);
      return;
    }
    for (const w of snap.brokenWalls) {
      setTile(this.state.grid, w.tx, w.ty, TileType.EMPTY);
    }
    this.state.phase = snap.phase;
    this.state.elapsed = snap.elapsed;
    this.state.suddenDeathRemaining = snap.suddenDeathRemaining;
    this.state.countdownTeam = snap.countdownTeam;
    this.state.countdownTimer = snap.countdownTimer;
    this.state.goalResetTimer = snap.goalResetTimer ?? 0;
    this.state.lastGoalTeam = snap.lastGoalTeam ?? null;
    this.state.winner = snap.winner;
    this.state.starPlayerSlot = snap.starPlayerSlot;
    this.state.blueGems = snap.blueGems;
    this.state.redGems = snap.redGems;
    this.state.hazards = snap.hazards;
    this.state.gems = snap.gems;
    this.state.ball = snap.ball ? { ...snap.ball } : null;

    // Reconcile local prediction gently against authoritative server
    const srvMe = snap.brawlers[this.mySlot];
    if (srvMe) {
      this.latestLocalDash = srvMe.alive && !srvMe.leap && srvMe.dash ? { ...srvMe.dash } : null;
      if (!this.predInit || !srvMe.alive || srvMe.leap) {
        this.predX = srvMe.x;
        this.predY = srvMe.y;
        this.predInit = true;
      } else {
        const drift = Math.hypot(srvMe.x - this.predX, srvMe.y - this.predY);
        const blend = srvMe.dash ? 0.45 : 0.35;
        const threshold = srvMe.dash ? 0.12 : 0.15;
        if (drift > 2.2) {
          this.predX = srvMe.x;
          this.predY = srvMe.y;
        } else if (drift > threshold) {
          this.predX += (srvMe.x - this.predX) * blend;
          this.predY += (srvMe.y - this.predY) * blend;
        }
      }
    } else {
      this.latestLocalDash = null;
    }
  }

  public tick(dt: number, localInput: PlayerInput, nowMs?: number): MatchState | null {
    if (!this.state) return null;
    const now = nowMs ?? performance.now();

    if (this.state.phase !== 'ended' && this.throttle.shouldSend(localInput, now)) {
      this.send({ type: 'input', input: quantizeInput(localInput) });
    }

    // Interpolate remote entities at now - 75ms
    if (this.snapBuffer.length >= 2) {
      const renderTime = now - INTERP_DELAY_MS;
      let a = this.snapBuffer[0];
      let b = this.snapBuffer[this.snapBuffer.length - 1];
      for (let i = 0; i < this.snapBuffer.length - 1; i++) {
        if (this.snapBuffer[i].timeMs <= renderTime && this.snapBuffer[i + 1].timeMs >= renderTime) {
          a = this.snapBuffer[i];
          b = this.snapBuffer[i + 1];
          break;
        }
      }
      const span = Math.max(1, b.timeMs - a.timeMs);
      const t = Math.max(0, Math.min(1, (renderTime - a.timeMs) / span));

      this.state.brawlers = b.snapshot.brawlers.map((sb, idx) => {
        const sa = a.snapshot.brawlers[idx] ?? sb;
        if (idx === this.mySlot) {
          return { ...sb, x: this.predX, y: this.predY, stats: { ...sb.stats } };
        }
        return {
          ...sb,
          x: sa.x + (sb.x - sa.x) * t,
          y: sa.y + (sb.y - sa.y) * t,
          stats: { ...sb.stats },
        };
      });

      const projByIdA = new Map(a.snapshot.projectiles.map((p) => [p.id, p]));
      this.state.projectiles = b.snapshot.projectiles.map((pb) => {
        const pa = projByIdA.get(pb.id);
        if (!pa) return { ...pb };
        return {
          ...pb,
          x: pa.x + (pb.x - pa.x) * t,
          y: pa.y + (pb.y - pa.y) * t,
        };
      });

      if (b.snapshot.ball) {
        const ba = a.snapshot.ball;
        const bb = b.snapshot.ball;
        const jumpDist = ba ? Math.hypot(bb.x - ba.x, bb.y - ba.y) : 99;
        this.state.ball =
          ba && jumpDist < 5.0
            ? { ...bb, x: ba.x + (bb.x - ba.x) * t, y: ba.y + (bb.y - ba.y) * t }
            : { ...bb };
      } else {
        this.state.ball = null;
      }
    } else if (this.snapBuffer.length === 1) {
      const only = this.snapBuffer[0].snapshot;
      this.state.brawlers = only.brawlers.map((b, idx) =>
        idx === this.mySlot ? { ...b, x: this.predX, y: this.predY, stats: { ...b.stats } } : { ...b, stats: { ...b.stats } },
      );
      this.state.projectiles = only.projectiles.map((p) => ({ ...p }));
    }

    // Predict local player movement smoothly at 60fps (or smooth authoritative dash velocity immediately!)
    const me = this.state.brawlers[this.mySlot];
    if (me) {
      me.dash = this.latestLocalDash ? { ...this.latestLocalDash } : null;
    }
    if (me && me.alive && !me.leap && this.state.phase !== 'ended') {
      const cfg = BRAWLERS[me.brawlerId];
      if (this.latestLocalDash) {
        const dash = this.latestLocalDash;
        const resolved = resolveCircleGridCollision(
          this.state.grid,
          {
            x: this.predX + dash.dirX * dash.speed * dt,
            y: this.predY + dash.dirY * dash.speed * dt,
          },
          cfg.radius,
        );
        this.predX = resolved.x;
        this.predY = resolved.y;
        me.x = this.predX;
        me.y = this.predY;
        me.vx = dash.dirX * dash.speed;
        me.vy = dash.dirY * dash.speed;
        me.facing = Math.atan2(dash.dirY, dash.dirX);
      } else {
        const len = Math.hypot(localInput.moveX, localInput.moveY);
        const mx = len > 1 ? localInput.moveX / len : localInput.moveX;
        const my = len > 1 ? localInput.moveY / len : localInput.moveY;
        const resolved = resolveCircleGridCollision(
          this.state.grid,
          {
            x: this.predX + mx * cfg.moveSpeed * dt,
            y: this.predY + my * cfg.moveSpeed * dt,
          },
          cfg.radius,
        );
        this.predX = resolved.x;
        this.predY = resolved.y;
        me.x = this.predX;
        me.y = this.predY;
        if (len > 0.15) {
          me.vx = mx * cfg.moveSpeed;
          me.vy = my * cfg.moveSpeed;
        }
      }
    }

    return this.state;
  }
}
