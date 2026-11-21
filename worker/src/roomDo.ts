import {
  BotController,
  BRAWLER_LIST,
  BrawlerId,
  BRAWLERS,
  ClientMessage,
  dequantizeInput,
  LobbySlot,
  LobbyState,
  MapId,
  MAPS,
  MatchEngine,
  MatchState,
  serializeSnapshot,
  ServerMessage,
  SlotSetup,
  Team,
} from '@brawl-arena/shared';

export const LATE_JOIN_REJECT_MESSAGE = 'Match in progress — join when the round ends';
export const DISCONNECT_BOT_GRACE_SECONDS = 3.0;
export const SERVER_TICK_MS = 50; // 20 Hz

export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface InternalSlot {
  slotIndex: number;
  team: Team;
  name: string;
  brawlerId: BrawlerId;
  isBot: boolean;
  connected: boolean;
  token: string | null;
  socket: SocketLike | null;
  disconnectTimer: number;
}

const DEFAULT_BOT_BRAWLERS: BrawlerId[] = ['buck', 'vex', 'lumi', 'blaze', 'golem', 'mort'];

function sanitizeName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 16);
  return cleaned || fallback;
}

export class RoomManager {
  public readonly code: string;
  private mapId: MapId = 'crystal-cavern';
  private hostSlot = -1;
  private slots: InternalSlot[];
  private socketToSlot: Map<SocketLike, number> = new Map();
  private engine: MatchEngine | null = null;
  private botAi: BotController | null = null;
  private tickCount = 0;
  private brokenWalls: Array<{ tx: number; ty: number }> = [];
  private ticker: ReturnType<typeof setInterval> | null = null;
  private onActivityChange?: (active: boolean) => void;

  constructor(code: string, onActivityChange?: (active: boolean) => void) {
    this.code = code;
    this.onActivityChange = onActivityChange;
    this.slots = Array.from({ length: 6 }, (_, i) => {
      const brawlerId = DEFAULT_BOT_BRAWLERS[i % DEFAULT_BOT_BRAWLERS.length];
      return {
        slotIndex: i,
        team: i < 3 ? 'blue' : 'red',
        name: `Bot ${BRAWLERS[brawlerId].name}`,
        brawlerId,
        isBot: true,
        connected: false,
        token: null,
        socket: null,
        disconnectTimer: 0,
      };
    });
  }

  public isActive(): boolean {
    return this.isMatchRunning() || this.slots.some((s) => !s.isBot && s.connected);
  }

  public isMatchRunning(): boolean {
    return this.engine !== null && this.engine.state.phase !== 'ended';
  }

  public hasActiveTicker(): boolean {
    return this.ticker !== null;
  }

  public getMatchState(): MatchState | null {
    return this.engine ? this.engine.state : null;
  }

  public getLobby(): LobbyState {
    const lobbySlots: LobbySlot[] = this.slots.map((s) => ({
      slotIndex: s.slotIndex,
      team: s.team,
      name: s.name,
      brawlerId: s.brawlerId,
      isBot: s.isBot,
      connected: s.connected,
      ready: !s.isBot && s.connected,
    }));
    const host = this.hostSlot >= 0 ? this.slots[this.hostSlot] : null;
    return {
      code: this.code,
      mapId: this.mapId,
      hostSlot: this.hostSlot,
      hostToken: host?.token ?? undefined,
      inMatch: this.isMatchRunning(),
      slots: lobbySlots,
    };
  }

  private sendTo(ws: SocketLike, msg: ServerMessage): void {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Socket already closed
    }
  }

  private broadcast(msg: ServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const s of this.slots) {
      if (s.socket && s.connected) {
        try {
          s.socket.send(raw);
        } catch {
          // Ignore broken pipe
        }
      }
    }
  }

  private countConnectedHumans(): number {
    let count = 0;
    for (const s of this.slots) {
      if (!s.isBot && s.connected) count++;
    }
    return count;
  }

  private hasPendingDisconnectGrace(): boolean {
    return this.slots.some((s) => !s.isBot && !s.connected && s.disconnectTimer > 0);
  }

  private ensureTicker(): void {
    if (this.ticker) return;
    if (!this.isMatchRunning()) return;
    if (this.countConnectedHumans() === 0 && !this.hasPendingDisconnectGrace()) return;
    this.ticker = setInterval(() => {
      this.stepSimulation(SERVER_TICK_MS / 1000);
    }, SERVER_TICK_MS);
  }

  public stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  public handleConnect(ws: SocketLike, rawToken: string, rawName?: string): void {
    const token = rawToken.trim() || `tok-${Math.random().toString(36).slice(2, 10)}`;
    const existing = this.slots.find((s) => s.token === token);

    // Match in progress: allow existing players to reclaim, reject new joiners
    if (this.engine !== null) {
      if (existing) {
        if (existing.socket && existing.socket !== ws) {
          this.socketToSlot.delete(existing.socket);
          try {
            existing.socket.close(4002, 'Replaced by reconnect');
          } catch {
            // ignore
          }
        }
        existing.socket = ws;
        existing.connected = true;
        existing.isBot = false;
        existing.disconnectTimer = 0;
        this.socketToSlot.set(ws, existing.slotIndex);

        const brawler = this.engine.state.brawlers[existing.slotIndex];
        if (brawler) {
          brawler.isBot = false;
        }

        const snap = serializeSnapshot(this.engine.state, [], this.tickCount, this.brokenWalls);
        this.sendTo(ws, {
          type: 'welcome',
          slotIndex: existing.slotIndex,
          team: existing.team,
          token,
          lobby: this.getLobby(),
        });
        this.sendTo(ws, {
          type: 'match_start',
          mapId: this.mapId,
          slotIndex: existing.slotIndex,
          team: existing.team,
          snapshot: snap,
        });
        if (this.isMatchRunning()) {
          this.ensureTicker();
        }
        this.onActivityChange?.(true);
        return;
      }

      this.sendTo(ws, { type: 'error', message: LATE_JOIN_REJECT_MESSAGE });
      ws.close(4001, LATE_JOIN_REJECT_MESSAGE);
      return;
    }

    // Lobby join or reconnect
    let slot = existing;
    if (!slot) {
      slot = this.slots.find((s) => s.isBot);
      if (!slot) {
        this.sendTo(ws, { type: 'error', message: 'Room is full (6/6 players)' });
        ws.close(4003, 'Room full');
        return;
      }
      slot.isBot = false;
      slot.token = token;
      slot.name = sanitizeName(rawName ?? '', `Player ${slot.slotIndex + 1}`);
    } else if (rawName) {
      slot.name = sanitizeName(rawName, slot.name);
    }

    if (slot.socket && slot.socket !== ws) {
      this.socketToSlot.delete(slot.socket);
    }
    slot.socket = ws;
    slot.connected = true;
    slot.disconnectTimer = 0;
    this.socketToSlot.set(ws, slot.slotIndex);

    if (this.hostSlot === -1 || this.slots[this.hostSlot].isBot) {
      this.hostSlot = slot.slotIndex;
    }

    this.sendTo(ws, {
      type: 'welcome',
      slotIndex: slot.slotIndex,
      team: slot.team,
      token,
      lobby: this.getLobby(),
    });
    this.broadcast({ type: 'lobby', lobby: this.getLobby() });
    this.onActivityChange?.(true);
  }

  public handleDisconnect(ws: SocketLike): void {
    const slotIdx = this.socketToSlot.get(ws);
    if (slotIdx === undefined) return;
    this.socketToSlot.delete(ws);

    const slot = this.slots[slotIdx];
    if (!slot || slot.socket !== ws) return;
    slot.socket = null;
    slot.connected = false;

    if (this.engine !== null) {
      // Mid-match disconnect: 3.0s grace period before bot takeover
      slot.disconnectTimer = DISCONNECT_BOT_GRACE_SECONDS;
      if (!this.isMatchRunning()) {
        this.stopTicker();
      }
      if (this.countConnectedHumans() === 0) {
        this.onActivityChange?.(false);
      }
      return;
    }

    // Lobby disconnect: reset slot to bot & transfer host if needed
    const fallbackBrawler = DEFAULT_BOT_BRAWLERS[slotIdx % DEFAULT_BOT_BRAWLERS.length];
    slot.isBot = true;
    slot.token = null;
    slot.brawlerId = fallbackBrawler;
    slot.name = `Bot ${BRAWLERS[fallbackBrawler].name}`;

    if (this.hostSlot === slotIdx) {
      const nextHuman = this.slots.find((s) => !s.isBot && s.connected);
      this.hostSlot = nextHuman ? nextHuman.slotIndex : -1;
    }

    this.broadcast({ type: 'lobby', lobby: this.getLobby() });
    if (this.countConnectedHumans() === 0) {
      this.onActivityChange?.(false);
    }
  }

  public handleMessage(ws: SocketLike, rawData: string): void {
    const slotIdx = this.socketToSlot.get(ws);
    if (slotIdx === undefined) return;
    const slot = this.slots[slotIdx];
    if (!slot) return;

    let msg: ClientMessage;
    try {
      msg = JSON.parse(rawData) as ClientMessage;
    } catch {
      return;
    }

    if (msg.type === 'ping') {
      this.sendTo(ws, { type: 'pong', t: msg.t });
      return;
    }

    if (msg.type === 'input') {
      if (this.engine && this.isMatchRunning()) {
        this.engine.setInput(slotIdx, dequantizeInput(msg.input));
      }
      return;
    }

    if (msg.type === 'return_lobby') {
      if (slotIdx !== this.hostSlot) return;
      this.returnToLobby();
      return;
    }

    // Lobby-only actions
    if (this.engine !== null) return;

    if (msg.type === 'set_name') {
      slot.name = sanitizeName(msg.name, slot.name);
      this.broadcast({ type: 'lobby', lobby: this.getLobby() });
    } else if (msg.type === 'pick_brawler') {
      if (BRAWLERS[msg.brawlerId]) {
        slot.brawlerId = msg.brawlerId;
        this.broadcast({ type: 'lobby', lobby: this.getLobby() });
      }
    } else if (msg.type === 'pick_map') {
      if (slotIdx === this.hostSlot && MAPS[msg.mapId]) {
        this.mapId = msg.mapId;
        this.broadcast({ type: 'lobby', lobby: this.getLobby() });
      }
    } else if (msg.type === 'switch_team') {
      this.switchSlotTeam(slotIdx, msg.team);
    } else if (msg.type === 'start_match') {
      if (slotIdx === this.hostSlot) {
        this.startMatch();
      }
    }
  }

  private switchSlotTeam(slotIdx: number, targetTeam: Team): void {
    const current = this.slots[slotIdx];
    if (current.team === targetTeam) return;
    const targetIndices = targetTeam === 'blue' ? [0, 1, 2] : [3, 4, 5];
    const openBotSlot = targetIndices.map((i) => this.slots[i]).find((s) => s.isBot);
    if (!openBotSlot) return;

    // Move human into openBotSlot and restore old slot as bot
    const oldIdx = current.slotIndex;
    const newIdx = openBotSlot.slotIndex;
    const ws = current.socket;

    openBotSlot.isBot = false;
    openBotSlot.connected = current.connected;
    openBotSlot.token = current.token;
    openBotSlot.name = current.name;
    openBotSlot.brawlerId = current.brawlerId;
    openBotSlot.socket = ws;

    const fallbackBrawler = DEFAULT_BOT_BRAWLERS[oldIdx % DEFAULT_BOT_BRAWLERS.length];
    current.isBot = true;
    current.connected = false;
    current.token = null;
    current.name = `Bot ${BRAWLERS[fallbackBrawler].name}`;
    current.brawlerId = fallbackBrawler;
    current.socket = null;

    if (ws) {
      this.socketToSlot.set(ws, newIdx);
      this.sendTo(ws, {
        type: 'welcome',
        slotIndex: newIdx,
        team: openBotSlot.team,
        token: openBotSlot.token ?? '',
        lobby: this.getLobby(),
      });
    }
    if (this.hostSlot === oldIdx) {
      this.hostSlot = newIdx;
    }

    this.broadcast({ type: 'lobby', lobby: this.getLobby() });
  }

  private startMatch(): void {
    // Assign varied distinct brawlers to bot slots
    const usedByTeam: Record<Team, Set<BrawlerId>> = { blue: new Set(), red: new Set() };
    for (const s of this.slots) {
      if (!s.isBot) usedByTeam[s.team].add(s.brawlerId);
    }
    for (const s of this.slots) {
      if (s.isBot) {
        const pick =
          BRAWLER_LIST.find((b) => !usedByTeam[s.team].has(b.id))?.id ??
          DEFAULT_BOT_BRAWLERS[s.slotIndex % DEFAULT_BOT_BRAWLERS.length];
        s.brawlerId = pick;
        s.name = `Bot ${BRAWLERS[pick].name}`;
        usedByTeam[s.team].add(pick);
      }
    }

    const setup: SlotSetup[] = this.slots.map((s) => ({
      slotIndex: s.slotIndex,
      team: s.team,
      name: s.name,
      isBot: s.isBot,
      brawlerId: s.brawlerId,
    }));

    this.engine = new MatchEngine({
      mapId: this.mapId,
      slots: setup,
      seed: Date.now() & 0xfffffff,
    });
    this.botAi = new BotController();
    this.tickCount = 0;
    this.brokenWalls = [];

    const initialSnap = serializeSnapshot(this.engine.state, [], 0, []);
    for (const s of this.slots) {
      if (s.socket && s.connected) {
        this.sendTo(s.socket, {
          type: 'match_start',
          mapId: this.mapId,
          slotIndex: s.slotIndex,
          team: s.team,
          snapshot: initialSnap,
        });
      }
    }
    this.ensureTicker();
  }

  private returnToLobby(): void {
    this.stopTicker();
    this.engine = null;
    this.botAi = null;
    this.brokenWalls = [];

    // Clean up any players who disconnected during match
    for (const s of this.slots) {
      if (!s.isBot && !s.connected) {
        const fallbackBrawler = DEFAULT_BOT_BRAWLERS[s.slotIndex % DEFAULT_BOT_BRAWLERS.length];
        s.isBot = true;
        s.token = null;
        s.brawlerId = fallbackBrawler;
        s.name = `Bot ${BRAWLERS[fallbackBrawler].name}`;
        s.disconnectTimer = 0;
      }
    }
    if (this.hostSlot === -1 || this.slots[this.hostSlot].isBot || !this.slots[this.hostSlot].connected) {
      const next = this.slots.find((s) => !s.isBot && s.connected);
      this.hostSlot = next ? next.slotIndex : -1;
    }

    this.broadcast({ type: 'lobby', lobby: this.getLobby() });
  }

  public stepSimulation(dt: number): void {
    if (!this.engine || !this.botAi) {
      this.stopTicker();
      return;
    }

    // Update disconnect grace timers -> bot takeover after 3.0s
    for (const s of this.slots) {
      if (!s.isBot && !s.connected && s.disconnectTimer > 0) {
        s.disconnectTimer = Math.max(0, s.disconnectTimer - dt);
        if (s.disconnectTimer === 0) {
          const brawler = this.engine.state.brawlers[s.slotIndex];
          if (brawler) brawler.isBot = true;
        }
      }
    }

    const botInputs = this.botAi.computeInputs(this.engine.state, dt);
    for (const [slotIdx, inp] of botInputs) {
      this.engine.setInput(slotIdx, inp);
    }

    const events = this.engine.step(dt);
    this.tickCount += 1;
    for (const ev of events) {
      if (ev.type === 'wall_break') {
        this.brokenWalls.push(...ev.tiles);
      }
    }

    const snap = serializeSnapshot(this.engine.state, events, this.tickCount, this.brokenWalls);
    this.broadcast({ type: 'snapshot', snapshot: snap });

    if (this.engine.state.phase === 'ended') {
      this.stopTicker();
    } else if (this.countConnectedHumans() === 0 && !this.hasPendingDisconnectGrace()) {
      // Stop ticking immediately when all humans are gone so DO can hibernate
      this.stopTicker();
    }
  }

  public advanceTimeForTest(totalSeconds: number): void {
    const steps = Math.max(1, Math.ceil(totalSeconds / 0.05));
    const dt = totalSeconds / steps;
    for (let i = 0; i < steps; i++) {
      this.stepSimulation(dt);
    }
  }

  public resetRoom(): void {
    this.stopTicker();
    for (const s of this.slots) {
      if (s.socket) {
        try {
          s.socket.close(1000, 'Room idle expired');
        } catch {
          // ignore
        }
      }
      const fallback = DEFAULT_BOT_BRAWLERS[s.slotIndex % DEFAULT_BOT_BRAWLERS.length];
      s.isBot = true;
      s.connected = false;
      s.token = null;
      s.socket = null;
      s.brawlerId = fallback;
      s.name = `Bot ${BRAWLERS[fallback].name}`;
      s.disconnectTimer = 0;
    }
    this.socketToSlot.clear();
    this.hostSlot = -1;
    this.engine = null;
    this.botAi = null;
    this.brokenWalls = [];
  }
}

export class RoomDurableObject {
  private ctx: DurableObjectState;
  private manager: RoomManager | null = null;

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
  }

  private getManager(code: string): RoomManager {
    if (!this.manager) {
      this.manager = new RoomManager(code, (active) => {
        if (!active) {
          // Schedule 10-minute idle cleanup alarm
          void this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000);
        }
      });
      // Restore any sockets that survived WebSocket Hibernation
      for (const ws of this.ctx.getWebSockets()) {
        const meta = (ws.deserializeAttachment() as { token?: string; name?: string } | null) ?? {};
        if (meta.token) {
          this.manager.handleConnect(ws, meta.token, meta.name);
        }
      }
    }
    return this.manager;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const code = (url.searchParams.get('code') ?? 'ROOM').toUpperCase();

    if (url.pathname === '/status') {
      const active = this.manager ? this.manager.isActive() : false;
      return Response.json({ active });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const token = url.searchParams.get('token') ?? '';
    const name = url.searchParams.get('name') ?? '';

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Use WebSocket Hibernation API for Cloudflare Free plan efficiency
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ code, token, name });

    const mgr = this.getManager(code);
    mgr.handleConnect(server, token, name);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return;
    const meta = (ws.deserializeAttachment() as { code?: string; token?: string; name?: string } | null) ?? {};
    const mgr = this.getManager(meta.code ?? 'ROOM');
    // Re-attach socket after hibernation wakeup if needed
    if (!mgr.isActive() && meta.token) {
      mgr.handleConnect(ws, meta.token, meta.name);
    }
    mgr.handleMessage(ws, message);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    this.manager?.handleDisconnect(ws);
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.manager?.handleDisconnect(ws);
  }

  async alarm(): Promise<void> {
    if (this.manager && !this.manager.isActive()) {
      this.manager.resetRoom();
    }
  }
}
