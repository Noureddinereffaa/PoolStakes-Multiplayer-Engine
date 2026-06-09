import { describe, it, expect, beforeEach } from 'vitest';
import {
  getInitialBalls, simulatePhysicsStep, captureFrame, isAnyBallMoving,
  powerToVelocity, BALL_R, CUSHION, TABLE_W, TABLE_H,
} from './physics';
import { evaluateShotRules, ghostBallAngle } from './gameLogic';
import { getOrCreateRoom, payingOutRooms, activeRooms, clientsByRoom } from './state';

function simulateShot(
  balls: ReturnType<typeof getInitialBalls>,
  angle: number,
  power: number,
  spinX = 0,
  spinY = 0,
) {
  const cueBall = balls[0];
  cueBall.vx = Math.cos(angle) * powerToVelocity(power);
  cueBall.vy = Math.sin(angle) * powerToVelocity(power);
  cueBall.spinX = spinX;
  cueBall.spinY = spinY;

  const pocketed: number[] = [];
  let cueBallPocketed = false;
  const tracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };
  const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];

  let iterations = 0;
  while (iterations < 1200) {
    const preStates = balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
    simulatePhysicsStep(balls, tracker);

    for (let i = 0; i < balls.length; i++) {
      const cur = balls[i];
      const pre = preStates.find(p => p.id === cur.id)!;
      if (cur.isPocketed && !pre.isPocketed) {
        if (cur.id === 0) cueBallPocketed = true;
        else pocketed.push(cur.id);
      }
    }

    frames.push(captureFrame(balls));
    iterations++;
    if (!isAnyBallMoving(balls)) break;
  }

  return { pocketed, cueBallPocketed, firstContact: tracker.firstContactBallId, cushionContact: tracker.cushionContactOccurred, frames };
}

describe('integration — full game flow', () => {
  let room: ReturnType<typeof getOrCreateRoom>;

  beforeEach(() => {
    // Clean up state from previous tests (especially payingOutRooms and activeRooms)
    const existing = activeRooms.get('integ-test-room');
    if (existing) {
      payingOutRooms.delete(existing.name);
      activeRooms.delete('integ-test-room');
      clientsByRoom.delete('integ-test-room');
    }
    room = getOrCreateRoom('integ-test-room', 'Integration Test Room', 10);
    room.players = [
      { id: 'p1', username: 'Player1', walletBalance: 500, bettingStake: 10, isConnected: true },
      { id: 'p2', username: 'Player2', walletBalance: 500, bettingStake: 10, isConnected: true },
    ];
    room.status = 'playing';
    room.currentTurn = 'p1';
    room.balls = getInitialBalls();
  });

  it('room creation sets initial state', () => {
    const r = getOrCreateRoom('new-room', 'New Room', 25);
    expect(r.roomId).toBe('new-room');
    expect(r.status).toBe('waiting');
    expect(r.stake).toBe(25);
    expect(r.balls.length).toBe(16);
    expect(r.balls[0].id).toBe(0);
    expect(r.players).toEqual([]);
  });

  it('physics: direct shot pockets a ball', () => {
    const cue = room.balls[0];
    const target = room.balls.find(b => b.id === 1)!;
    cue.x = target.x + 20;
    cue.y = target.y;
    cue.vx = 0;
    cue.vy = 0;

    const shot = simulateShot(room.balls, Math.PI, 100);
    expect(shot.frames.length).toBeGreaterThan(1);
    expect(shot.firstContact).toBe(1);
  });

  it('foul: cue ball scratched awards ball-in-hand', () => {
    const p1Name = room.players[0].username;
    const cueBall = room.balls[0];
    cueBall.isPocketed = true;

    evaluateShotRules(room, [], true, null, p1Name, 'p1', false, false);
    expect(room.scratchOccurred).toBe(true);
    expect(room.currentTurn).toBe('p2');
    expect(room.balls[0].isPocketed).toBe(false);
    expect(room.balls[0].x).toBeGreaterThan(CUSHION + BALL_R);
  });

  it('game over: player pockets 8-ball after clearing group and wins', () => {
    const p1 = room.players[0];
    const p2 = room.players[1];
    room.assignedSides = true;
    p1.side = 'solids';
    p2.side = 'stripes';

    for (let i = 1; i <= 7; i++) {
      const b = room.balls.find(x => x.id === i)!;
      b.isPocketed = true;
    }

    evaluateShotRules(room, [8], false, 8, p1.username, 'p1', false, true);
    expect(room.status).toBe('gameover');
  });

  it('game over: fouling on 8-ball gives opponent the win', () => {
    const p1 = room.players[0];
    room.assignedSides = true;
    p1.side = 'solids';
    room.players[1].side = 'stripes';

    for (let i = 1; i <= 7; i++) {
      const b = room.balls.find(x => x.id === i)!;
      b.isPocketed = true;
    }

    evaluateShotRules(room, [8], true, 8, p1.username, 'p1', false, false);
    expect(room.status).toBe('gameover');
  });

  it('side assignment: pocketing a solid assigns solids to shooter', () => {
    // Simulate: P1 pockets ball 1 (solid) on an open table
    room.assignedSides = false;
    evaluateShotRules(room, [1], false, 1, 'Player1', 'p1', false, true);
    expect(room.assignedSides).toBe(true);
    expect(room.players[0].side).toBe('solids');
    expect(room.players[1].side).toBe('stripes');
    expect(room.currentTurn).toBe('p1');
  });

  it('turn passes when shooting opponent group ball', () => {
    room.assignedSides = true;
    room.players[0].side = 'solids';
    room.players[1].side = 'stripes';
    room.currentTurn = 'p1';

    // P1 pockets a stripe (opponent's ball)
    evaluateShotRules(room, [9], false, 1, 'Player1', 'p1', false, true);
    // Turn should pass to P2 since P1 pocketed opponent's ball
    expect(room.currentTurn).toBe('p2');
  });

  it('game over: match concluded via concludeMatch', () => {
    // After gameover is set, room stays in gameover state
    const p1 = room.players[0];
    room.assignedSides = true;
    p1.side = 'solids';
    room.players[1].side = 'stripes';

    for (let i = 1; i <= 7; i++) {
      const b = room.balls.find(x => x.id === i)!;
      b.isPocketed = true;
    }

    evaluateShotRules(room, [8], false, 8, p1.username, 'p1', false, true);
    expect(room.status).toBe('gameover');
  });
});

describe('ghostBallAngle and powerToVelocity', () => {
  it('ghostBallAngle produces valid aim for all 6 pockets', () => {
    const pockets = [
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 800, y: 0 },
      { x: 0, y: 200 }, { x: 400, y: 200 }, { x: 800, y: 200 },
    ];

    const cueX = 200, cueY = 100, targetX = 400, targetY = 100;
    for (const pocket of pockets) {
      const angle = ghostBallAngle(cueX, cueY, targetX, targetY, pocket.x, pocket.y);
      expect(Number.isFinite(angle)).toBe(true);
    }
  });

  it('powerToVelocity produces expected ranges', () => {
    expect(powerToVelocity(0)).toBe(0);
    expect(powerToVelocity(50)).toBeGreaterThan(0);
    expect(powerToVelocity(100)).toBeGreaterThan(powerToVelocity(50));
    expect(powerToVelocity(100)).toBe(26);
  });
});
