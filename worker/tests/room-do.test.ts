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

    room.handleDisconnect(ws1);
    expect(room.getLobby().hostSlot).toBe(1);
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
    room.getMatchState()!.phase = 'ended';
    room.handleDisconnect(wsHost);

    expect(room.getLobby().hostSlot).toBe(1);
    room.handleMessage(wsGuest, JSON.stringify({ type: 'return_lobby' }));
    expect(room.isMatchRunning()).toBe(false);
    expect(room.getMatchState()).toBeNull();
  });
});
