import { describe, it, expect } from 'vitest';
import { generateRoomCode, isValidRoomCode, ROOM_CODE_ALPHABET } from '../src/roomCode';
import { RoomManager, SocketLike } from '../src/roomDo';

class MockSocket implements SocketLike {
  public sentMessages: string[] = [];
  public closed = false;
  public closeCode?: number;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number): void {
    this.closed = true;
    this.closeCode = code;
  }
}

describe('Room codes and RoomDurableObject lifecycle', () => {
  it('generates valid 4-char unambiguous codes excluding 0, O, 1, I', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(4);
      expect(isValidRoomCode(code)).toBe(true);
      expect(code).not.toMatch(/[0O1I]/);
    }
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(isValidRoomCode('0O1I')).toBe(false);
    expect(isValidRoomCode('K7MP')).toBe(true);
  });

  it('allows lobby join, brawler/team switch, host start with bot fill, and blocks late joiners with exact message', () => {
    const room = new RoomManager('K7MP');
    const hostWs = new MockSocket();
    room.handleConnect(hostWs, 'tok-1', 'Haris');
    expect(room.getLobby().hostSlot).toBe(0);

    room.handleMessage(hostWs, JSON.stringify({ type: 'pick_brawler', brawlerId: 'vex' }));
    expect(room.getLobby().slots[0].brawlerId).toBe('vex');

    // Join second human and switch to red team
    const p2Ws = new MockSocket();
    room.handleConnect(p2Ws, 'tok-2', 'Friend');
    room.handleMessage(p2Ws, JSON.stringify({ type: 'switch_team', team: 'red' }));
    const p2Slot = room.getLobby().slots.find((s) => s.name === 'Friend');
    expect(p2Slot?.team).toBe('red');

    room.handleMessage(hostWs, JSON.stringify({ type: 'start_match' }));
    expect(room.isMatchRunning()).toBe(true);

    // Review Focus #4: late joiner rejected with exact copy
    const lateWs = new MockSocket();
    room.handleConnect(lateWs, 'tok-late', 'LateFriend');
    expect(lateWs.sentMessages.at(-1)).toContain('Match in progress — join when the round ends');
    expect(lateWs.closed).toBe(true);
  });

  it('converts disconnected player to bot after 3.0s, reclaims slot on token reconnect, and stops ticker when all humans leave', () => {
    const room = new RoomManager('K7MP');
    const ws1 = new MockSocket();
    room.handleConnect(ws1, 'tok-1', 'P1');
    room.handleMessage(ws1, JSON.stringify({ type: 'start_match' }));
    expect(room.hasActiveTicker()).toBe(true);

    room.handleDisconnect(ws1);
    // Advance 3.1s -> slot becomes bot-controlled; 0 humans connected -> ticker stops (Review Focus #5)
    room.advanceTimeForTest(3.1);
    expect(room.getMatchState()!.brawlers[0].isBot).toBe(true);
    expect(room.hasActiveTicker()).toBe(false);

    // Reconnect with same sessionToken reclaims brawler & resumes ticker
    const ws1Re = new MockSocket();
    room.handleConnect(ws1Re, 'tok-1', 'P1');
    expect(ws1Re.closed).toBe(false);
    expect(room.getMatchState()!.brawlers[0].isBot).toBe(false);
    expect(room.hasActiveTicker()).toBe(true);
  });

  it('transfers host in lobby when host disconnects', () => {
    const room = new RoomManager('K7MP');
    const ws1 = new MockSocket();
    const ws2 = new MockSocket();
    room.handleConnect(ws1, 'tok-1', 'Host');
    room.handleConnect(ws2, 'tok-2', 'Guest');
    expect(room.getLobby().hostSlot).toBe(0);

    const guestSlot = room.getLobby().slots.find((s) => s.name === 'Guest')!.slotIndex;
    room.handleDisconnect(ws1);
    expect(room.getLobby().hostSlot).toBe(guestSlot);
  });

  it('preserves original host slot, team, and brawler when restoring hibernated sockets in arbitrary order', () => {
    const room = new RoomManager('K7MP');
    const wsGuest = new MockSocket();
    const wsHost = new MockSocket();

    // Restore guest (slot 3, red) BEFORE host (slot 0, blue) as DO hibernation may return unordered sockets
    room.restoreHibernatedSocket(wsGuest, {
      token: 'tok-guest',
      name: 'Guest',
      slotIndex: 3,
      brawlerId: 'mort',
      isHost: false,
    });
    room.restoreHibernatedSocket(wsHost, {
      token: 'tok-host',
      name: 'Alpha',
      slotIndex: 0,
      brawlerId: 'vex',
      isHost: true,
    });

    const lobby = room.getLobby();
    expect(lobby.hostSlot).toBe(0);
    expect(lobby.slots[0].name).toBe('Alpha');
    expect(lobby.slots[0].brawlerId).toBe('vex');
    expect(lobby.slots[3].name).toBe('Guest');
    expect(lobby.slots[3].team).toBe('red');
    expect(lobby.slots[3].brawlerId).toBe('mort');
  });

  it('C1: transfers host and broadcasts lobby when hibernated host disconnects before any message', () => {
    const room = new RoomManager('K7MP');
    const wsHost = new MockSocket();
    const wsGuest = new MockSocket();
    room.restoreHibernatedSocket(wsHost, {
      token: 'tok-host',
      name: 'Host',
      slotIndex: 0,
      brawlerId: 'buck',
      isHost: true,
    });
    room.restoreHibernatedSocket(wsGuest, {
      token: 'tok-guest',
      name: 'Guest',
      slotIndex: 1,
      brawlerId: 'vex',
      isHost: false,
    });

    // Simulate DO webSocketClose where closing socket may already be missing from getWebSockets()
    room.handleHibernatedDisconnect(wsHost, 'tok-host');
    expect(room.getLobby().hostSlot).toBe(1);
    expect(wsGuest.sentMessages.at(-1)).toContain('"hostSlot":1');
  });

  it('C2: latches fire/super pulses within a tick and sustains held fire without client resend', () => {
    const room = new RoomManager('K7MP');
    const ws = new MockSocket();
    room.handleConnect(ws, 'tok-1', 'Alpha');
    room.handleMessage(ws, JSON.stringify({ type: 'start_match' }));

    // Pulse fire then release BEFORE the 50ms tick fires -> shot must NOT be dropped
    room.handleMessage(ws, JSON.stringify({ type: 'input', input: { md: -1, aa: 54, fl: 1 } }));
    room.handleMessage(ws, JSON.stringify({ type: 'input', input: { md: -1, aa: 54, fl: 0 } }));
    room.stepSimulation(0.05);
    expect(room.getMatchState()!.brawlers[0].ammo).toBeLessThan(2.5);

    // Hold fire continuously (fl: 1 sent once, no resends) -> must fire a second shot after cooldown
    const ammoAfterFirst = room.getMatchState()!.brawlers[0].ammo;
    room.handleMessage(ws, JSON.stringify({ type: 'input', input: { md: -1, aa: 54, fl: 1 } }));
    for (let i = 0; i < 10; i++) room.stepSimulation(0.05);
    expect(room.getMatchState()!.brawlers[0].ammo).toBeLessThan(ammoAfterFirst - 0.3);
  });

  it('I5: transfers host when host disconnects after match end so guest can return to lobby', () => {
    const room = new RoomManager('K7MP');
    const wsHost = new MockSocket();
    const wsGuest = new MockSocket();
    room.handleConnect(wsHost, 'tok-1', 'Host');
    room.handleConnect(wsGuest, 'tok-2', 'Guest');
    room.handleMessage(wsHost, JSON.stringify({ type: 'start_match' }));

    // Force match end and disconnect host
    const guestSlot = room.getLobby().slots.find((s) => s.name === 'Guest')!.slotIndex;
    room.getMatchState()!.phase = 'ended';
    room.handleDisconnect(wsHost);

    expect(room.getLobby().hostSlot).toBe(guestSlot);
    room.handleMessage(wsGuest, JSON.stringify({ type: 'return_lobby' }));
    expect(room.isMatchRunning()).toBe(false);
    expect(room.getMatchState()).toBeNull();
  });

  it('supports Custom 1v1 PvP (players only) with dense slot mapping and clean return to lobby', () => {
    const room = new RoomManager('C1V1');
    const ws1 = new MockSocket();
    const ws2 = new MockSocket();
    room.handleConnect(ws1, 't1', 'Alice');
    room.handleMessage(ws1, JSON.stringify({ type: 'set_team_sizes', blueSize: 1, redSize: 1 }));
    room.handleMessage(ws1, JSON.stringify({ type: 'set_fill_bots', fillBots: false }));

    // Cannot start players-only 1v1 while Red has 0 humans
    room.handleMessage(ws1, JSON.stringify({ type: 'start_match' }));
    expect(room.isMatchRunning()).toBe(false);
    expect(ws1.sentMessages.at(-1)).toContain('Need at least 1 player on both Blue and Red');

    // Second player auto-balances onto Red enabled slot (slot 3)
    room.handleConnect(ws2, 't2', 'Bob');
    const lobby = room.getLobby();
    expect(lobby.blueSize).toBe(1);
    expect(lobby.redSize).toBe(1);
    expect(lobby.slots[0].name).toBe('Alice');
    expect(lobby.slots[3].name).toBe('Bob');

    // 3rd joiner rejected as 2/2 room full
    const ws3 = new MockSocket();
    room.handleConnect(ws3, 't3', 'Extra');
    expect(ws3.closed).toBe(true);
    expect(ws3.sentMessages.at(-1)).toContain('Room is full (2/2 players)');

    room.handleMessage(ws1, JSON.stringify({ type: 'start_match' }));
    expect(room.isMatchRunning()).toBe(true);
    const state = room.getMatchState()!;
    expect(state.brawlers).toHaveLength(2);
    expect(state.brawlers[0].team).toBe('blue');
    expect(state.brawlers[0].name).toBe('Alice');
    expect(state.brawlers[1].team).toBe('red');
    expect(state.brawlers[1].name).toBe('Bob');
    expect(state.brawlers.every((b) => !b.isBot)).toBe(true);

    // Bob (lobby slot 3 -> match slot 1) fires cleanly via dense mapping
    room.handleMessage(ws2, JSON.stringify({ type: 'input', input: { md: -1, aa: 18, fl: 1 } }));
    room.stepSimulation(0.05);
    expect(room.getMatchState()!.brawlers[1].ammo).toBeLessThan(2.5);

    // Return to lobby restores Bob's lobby slotIndex (3) cleanly
    room.handleMessage(ws1, JSON.stringify({ type: 'return_lobby' }));
    expect(room.isMatchRunning()).toBe(false);
    expect(ws2.sentMessages.some((m) => m.includes('"type":"welcome"') && m.includes('"slotIndex":3'))).toBe(true);
  });

  it('supports Custom 1v2 PvP and 2v2 with bots', () => {
    // 1v2 pure PvP (1 Blue vs 2 Red humans)
    const room1v2 = new RoomManager('C1V2');
    const p1 = new MockSocket();
    const p2 = new MockSocket();
    const p3 = new MockSocket();
    room1v2.handleConnect(p1, 'u1', 'SoloBoss');
    room1v2.handleMessage(p1, JSON.stringify({ type: 'set_team_sizes', blueSize: 1, redSize: 2 }));
    room1v2.handleMessage(p1, JSON.stringify({ type: 'set_fill_bots', fillBots: false }));
    room1v2.handleConnect(p2, 'u2', 'HunterA');
    room1v2.handleConnect(p3, 'u3', 'HunterB');
    room1v2.handleMessage(p1, JSON.stringify({ type: 'start_match' }));

    const st1v2 = room1v2.getMatchState()!;
    expect(st1v2.brawlers).toHaveLength(3);
    expect(st1v2.brawlers.filter((b) => b.team === 'blue')).toHaveLength(1);
    expect(st1v2.brawlers.filter((b) => b.team === 'red')).toHaveLength(2);
    expect(st1v2.brawlers.every((b) => !b.isBot)).toBe(true);

    // 2v2 with Fill Bots ON (1 human + 3 bots = 4 brawlers)
    const room2v2 = new RoomManager('C2V2');
    const host = new MockSocket();
    room2v2.handleConnect(host, 'h1', 'DuoHost');
    room2v2.handleMessage(host, JSON.stringify({ type: 'set_team_sizes', blueSize: 2, redSize: 2 }));
    room2v2.handleMessage(host, JSON.stringify({ type: 'set_fill_bots', fillBots: true }));
    room2v2.handleMessage(host, JSON.stringify({ type: 'start_match' }));

    const st2v2 = room2v2.getMatchState()!;
    expect(st2v2.brawlers).toHaveLength(4);
    expect(st2v2.brawlers.filter((b) => b.team === 'blue')).toHaveLength(2);
    expect(st2v2.brawlers.filter((b) => b.team === 'red')).toHaveLength(2);
  });
});
