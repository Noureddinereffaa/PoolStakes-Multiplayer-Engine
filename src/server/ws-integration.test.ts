import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WebSocket } from 'ws';
import {
  activeRooms, clientsByRoom, playerRoomMap, userSockets,
  forfeitTimers, activeSockets, DISCONNECT_TIMEOUT_MS,
  getOrCreateRoom, cancelForfeitTimer, cleanupRoom,
} from './state';
import { handleDisconnect, handleReconnect, handleAuthenticate } from './gameActions';
import { getInitialBalls } from './physics';

function makeMockWs(): WebSocket {
  return { readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn(), on: vi.fn(), ping: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
}

function setupTwoPlayerRoom() {
  const room = getOrCreateRoom('ws-test-room', 'WS Test Room', 10);
  room.players = [
    { id: 'p1', username: 'Alice', walletBalance: 500, bettingStake: 10, isConnected: true },
    { id: 'p2', username: 'Bob', walletBalance: 500, bettingStake: 10, isConnected: true },
  ];
  room.status = 'playing';
  room.currentTurn = 'p1';
  room.balls = getInitialBalls();
  room.assignedSides = true;
  room.players[0].side = 'solids';
  room.players[1].side = 'stripes';

  const ws1 = makeMockWs();
  const ws2 = makeMockWs();

  clientsByRoom.set('ws-test-room', new Set([ws1, ws2]));
  playerRoomMap.set(ws1, { roomId: 'ws-test-room', playerId: 'p1' });
  playerRoomMap.set(ws2, { roomId: 'ws-test-room', playerId: 'p2' });
  userSockets.set('p1', ws1);
  userSockets.set('p2', ws2);
  activeSockets.add(ws1);
  activeSockets.add(ws2);

  return { room, ws1, ws2 };
}

function cleanup() {
  cancelForfeitTimer('ws-test-room');
  const room = activeRooms.get('ws-test-room');
  if (room) cleanupRoom('ws-test-room');
  activeSockets.clear();
}

describe('WebSocket disconnect/reconnect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('disconnect marks player as disconnected and starts forfeit timer', async () => {
    const { room, ws1 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);

    const p1 = room.players.find(p => p.id === 'p1')!;
    expect(p1.isConnected).toBe(false);
    expect(room.disconnectedPlayerIds).toContain('p1');
    expect(room.reconnectDeadlines!['p1']).toBeGreaterThan(Date.now());
  });

  it('disconnecting the same player twice is idempotent', async () => {
    const { ws1 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);
    await handleDisconnect(ws1);

    const room = activeRooms.get('ws-test-room')!;
    expect(room.disconnectedPlayerIds!.filter(id => id === 'p1').length).toBe(1);
  });

  it('forfeit timer expires after 30s and voids match', async () => {
    const { room, ws1, ws2 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);
    await handleDisconnect(ws2);

    expect(room.disconnectedPlayerIds!.length).toBe(2);
    expect(room.status).toBe('playing');

    vi.advanceTimersByTime(DISCONNECT_TIMEOUT_MS + 100);

    expect(room.status).toBe('gameover');
    expect(room.winnerId).toBeUndefined();
  });

  it('reconnect restores player state and clears disconnect flag', async () => {
    const { room, ws1 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);

    const newWs = makeMockWs();
    const msg = { type: 'reconnect' as const, token: 'mock-token-for-p1' };
    vi.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: 'p1', username: 'Alice' });

    await handleReconnect(newWs, msg);

    expect(room.disconnectedPlayerIds).not.toContain('p1');
    expect(room.players.find(p => p.id === 'p1')!.isConnected).toBe(true);
  });

  it('reconnect after both disconnected restores game', async () => {
    const { room, ws1, ws2 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);
    await handleDisconnect(ws2);
    expect(room.disconnectedPlayerIds!.length).toBe(2);

    const newWs1 = makeMockWs();
    const msg1 = { type: 'reconnect' as const, token: 'mock-token-for-p1' };
    vi.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: 'p1', username: 'Alice' });
    await handleReconnect(newWs1, msg1);

    expect(room.disconnectedPlayerIds).not.toContain('p1');
    expect(room.disconnectedPlayerIds!.length).toBe(1);
  });

  it('disconnected player cannot shoot', async () => {
    const { room, ws1 } = setupTwoPlayerRoom();
    await handleDisconnect(ws1);

    const p1 = room.players.find(p => p.id === 'p1')!;
    expect(p1.isConnected).toBe(false);
    expect(room.disconnectedPlayerIds).toContain('p1');
  });

  it('reconnect with wrong player ID returns error', async () => {
    setupTwoPlayerRoom();
    const newWs = makeMockWs();
    const msg = { type: 'reconnect' as const, token: 'mock-token-for-wrong-id' };
    vi.spyOn(require('jsonwebtoken'), 'verify').mockReturnValue({ id: 'wrong-id', username: 'Eve' });

    await handleReconnect(newWs, msg);
    expect(newWs.send).toHaveBeenCalledWith(
      expect.stringContaining('No active disconnection found')
    );
  });
});
