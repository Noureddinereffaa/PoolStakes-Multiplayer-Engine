import { WebSocket } from 'ws';
import { RoomState, Player, MatchHistory, Ball } from '../types';
import { animatingRoomIds, clientsByRoom, broadcastRoom, pushRoomLog, pushMatchLog, payingOutRooms, pushEventLog } from './state';
import { prisma } from './db';
import { simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame, forceSettleBalls, wakeAllForShot, HEAD_STRING_X, FOOT_SPOT_X, FOOT_SPOT_Y, CUSHION, BALL_R, TABLE_W, TABLE_H, resetYieldTimer, yieldIfNeeded } from './physics';
import { logger } from './logger';
import { sendPushNotification } from './push';

/** Find a valid position for the cue ball that doesn't overlap other balls */
export function findValidCueBallPosition(balls: Ball[], preferHeadArea = false): { x: number; y: number } {
  const minX = CUSHION + BALL_R + 2;
  const maxX = TABLE_W - CUSHION - BALL_R - 2;
  const minY = CUSHION + BALL_R + 2;
  const maxY = TABLE_H - CUSHION - BALL_R - 2;

  const positions = preferHeadArea
    ? [
        { x: 200, y: 200 },
        { x: 150, y: 100 },
        { x: 150, y: 300 },
        { x: 100, y: 150 },
        { x: 100, y: 250 },
        { x: 200, y: 100 },
        { x: 200, y: 300 },
        { x: 120, y: 200 },
        { x: 180, y: 200 },
      ]
    : [
        { x: 200, y: 200 },
        { x: 300, y: 200 },
        { x: 250, y: 100 },
        { x: 250, y: 300 },
        { x: 150, y: 150 },
        { x: 150, y: 250 },
        { x: 350, y: 150 },
        { x: 350, y: 250 },
        { x: 400, y: 200 },
        { x: 200, y: 100 },
        { x: 200, y: 300 },
      ];

  for (const pos of positions) {
    const overlaps = balls.some((b) => {
      if (b.id === 0 || b.isPocketed) return false;
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      return Math.hypot(dx, dy) < BALL_R * 2.0;
    });
    if (!overlaps) {
      return pos;
    }
  }

  // Fallback: try random positions
  for (let attempt = 0; attempt < 50; attempt++) {
    const x = minX + Math.random() * (maxX - minX);
    const y = minY + Math.random() * (maxY - minY);
    const overlaps = balls.some((b) => {
      if (b.id === 0 || b.isPocketed) return false;
      const dx = x - b.x;
      const dy = y - b.y;
      return Math.hypot(dx, dy) < BALL_R * 2.0;
    });
    if (!overlaps) {
      return { x, y };
    }
  }

  // No valid position found after all attempts — table is too crowded
  throw new Error('Unable to find valid cue ball position: table too crowded');
}

export async function concludeMatch(room: RoomState, winner: Player, loser: Player, summaryMessage: string): Promise<void> {
  if (payingOutRooms.has(room.name)) return;

  room.status = 'gameover';
  room.winnerId = winner.id;
  pushRoomLog(room, `🏆 MATCH CONCLUDED! ${summaryMessage}`);

  let commission = 0;
  let prize = 0;

  payingOutRooms.add(room.name);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const esc = await tx.escrow.findFirst({
        where: { roomName: room.name, status: 'locked' }
      });
      if (!esc) return null;

      const updated = await tx.escrow.updateMany({
        where: { id: esc.id, status: 'locked' },
        data: { status: 'payout_completed' }
      });
      if (updated.count === 0) return null;

      const totalPot = Number(esc.amountEach) * 2;
      const c = Math.round(totalPot * (room.commissionRate || 0.05) * 100) / 100;
      const p = totalPot - c;

      const updatedWinner = await tx.user.update({
        where: { id: winner.id },
        data: { balance: { increment: p } }
      });

      await tx.transaction.create({
        data: {
          escrowId: esc.id,
          prize: p,
          commission: c,
          winnerId: winner.id,
          loserId: loser.id
        }
      });

      return { winner: updatedWinner, prize: p, commission: c };
    });

    if (!result) {
      pushRoomLog(room, 'Payout already processed for this match.');
      return;
    }

    prize = result.prize;
    commission = result.commission;
    winner.walletBalance = Number(result.winner.balance);
    const dbLoser = await prisma.user.findUnique({ where: { id: loser.id } });
    if (dbLoser) loser.walletBalance = Number(dbLoser.balance);

    pushRoomLog(room, `💰 Wallet balances updated via Prisma gateway secure callbacks!`);
    pushRoomLog(room, `Winner: ${winner.username} receives prize of $${prize.toFixed(2)} (locked stakes pot minus $${commission.toFixed(2)} commission).`);
    if (room.serverSeed) {
      pushRoomLog(room, `🔑 PROVABLY FAIR REVEAL: Server Seed was ${room.serverSeed}`);
      pushRoomLog(room, `You can verify that SHA256(Server Seed) matches the Integrity Hash shown at the start of the match.`);
    }
  } catch (error) {
    logger.error('Failed to process match payout', { error: String(error), room: room.name });
    pushRoomLog(room, "⚠️ Error processing payout.");
  } finally {
    payingOutRooms.delete(room.name);
  }

  const hist: MatchHistory = {
    id: `match-${Date.now()}`,
    roomName: room.name,
    winnerName: winner.username,
    loserName: loser.username,
    stake: room.stake,
    prizeAmount: prize,
    commission,
    timestamp: new Date().toLocaleTimeString(),
    pocketsByWinner: room.balls.filter(b => b.id !== 0 && b.isPocketed && b.type === (winner.side === 'solids' ? 'solid' : 'stripe')).length
  };
  pushMatchLog(hist);
  pushRoomLog(room, `Match history recorded.`);
  pushEventLog('match_concluded', { winner: winner.username, loser: loser.username, roomId: room.roomId, prize, commission });
  logger.info('Match concluded', { winner: winner.username, loser: loser.username, room: room.roomId, prize, commission });

  // Push notifications
  sendPushNotification(winner.id, '🏆 You won!', `You defeated ${loser.username} in ${room.name}!`, '/');
  sendPushNotification(loser.id, '😔 You lost', `${winner.username} won the match in ${room.name}.`, '/');
}

export function evaluateShotRules(
  room: RoomState,
  pocketedIds: number[],
  cueBallPocketed: boolean,
  firstContactBallId: number | null,
  shooterName: string,
  shooterId: string,
  isBreakShot = false,
  cushionContactOccurred = false
): void {
  const player1 = room.players[0];
  const player2 = room.players[1];
  if (!player1 || !player2) return;

  const currentActivePlayer = room.players.find(p => p.id === shooterId);
  const otherPlayer = room.players.find(p => p.id !== shooterId);
  if (!currentActivePlayer || !otherPlayer) return;

  room.turnTimer = 60;
  room.pocketedThisTurn = false;
  room.scratchOccurred = false;
  room.ballInHandRestriction = undefined;

  // Capture & clear calledPocket for this shot
  const calledPocket = room.calledPocketId ?? null;
  room.calledPocketId = null;

  let isFoul = false;
  let foulReason = '';

  const remainingGroupBalls = room.assignedSides && currentActivePlayer.side
    ? room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed && b.type === (currentActivePlayer.side === 'solids' ? 'solid' : 'stripe'))
    : [];

  if (cueBallPocketed) {
    isFoul = true;
    foulReason = 'Cue Ball Scratched (pocketed).';
    const validPos = findValidCueBallPosition(room.balls, isBreakShot);
    room.balls[0].isPocketed = false;
    room.balls[0].x = validPos.x;
    room.balls[0].y = validPos.y;
    room.balls[0].vx = 0;
    room.balls[0].vy = 0;
  }

  if (!isFoul) {
    if (firstContactBallId === null) {
      isFoul = true;
      foulReason = 'Clean Miss! The Cue Ball struck absolutely nothing.';
    } else if (!room.assignedSides) {
      if (firstContactBallId === 8) {
        isFoul = true;
        foulReason = 'Struck the Black 8-Ball first on an open table.';
      }
    } else {
      const activeSide = currentActivePlayer.side!;
      if (remainingGroupBalls.length > 0) {
        const hitType = firstContactBallId <= 7 ? 'solid' : (firstContactBallId === 8 ? 'black' : 'stripe');
        const expectedType = activeSide === 'solids' ? 'solid' : 'stripe';
        if (hitType !== expectedType) {
          isFoul = true;
          foulReason = firstContactBallId === 8
            ? `Struck the Black 8-Ball first when you still have remaining ${activeSide.toUpperCase()} balls left on the table.`
            : `Struck opponent's ball (${firstContactBallId <= 7 ? 'SOLID' : 'STRIPE'}) first. You must hit a ${activeSide.toUpperCase()} ball.`;
        }
      } else {
        if (firstContactBallId !== 8) {
          isFoul = true;
          foulReason = `Struck an object ball (${firstContactBallId}) first. All your group balls are cleared, you must hit the 8-Ball first!`;
        }
      }
    }
  }

  if (!isFoul && firstContactBallId !== null && pocketedIds.length === 0) {
    if (!cushionContactOccurred) {
      isFoul = true;
      foulReason = 'WPA Cushion Contact Foul: After striking the ball, no ball was pocketed and no ball contacted a cushion rail.';
    }
  }

  if (pocketedIds.includes(8)) {
    if (isFoul && isBreakShot) {
      const blackBall = room.balls.find(b => b.id === 8);
      if (blackBall) {
        blackBall.isPocketed = false;
        blackBall.vx = 0;
        blackBall.vy = 0;
        blackBall.x = FOOT_SPOT_X;
        blackBall.y = FOOT_SPOT_Y;
      }

      room.scratchOccurred = true;
      room.ballInHandRestriction = 'behind_head_string';
      room.currentTurn = otherPlayer.id;
      room.assignedSides = false;
      pushRoomLog(room, `⚠️ Break foul: ${shooterName} pocketed the Black 8-Ball with a foul. ${otherPlayer.username} receives ball-in-hand behind the head string and the 8-Ball is re-spotted.`);
      return;
    }

    if (isFoul) {
      concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball, but committed a FOUL [${foulReason}].`);
    } else if (!room.assignedSides && isBreakShot) {
      concludeMatch(room, currentActivePlayer, otherPlayer, `🎉 ${shooterName} wins on a legal break by pocketing the 8-Ball!`);
    } else if (!room.assignedSides) {
      concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball illegally on an open table.`);
    } else {
      const pocketedOwnGroupBallInSameShot = pocketedIds.some(id => {
        if (id === 0 || id === 8) return false;
        const type = id <= 7 ? 'solid' : 'stripe';
        return (currentActivePlayer.side === 'solids' && type === 'solid') || (currentActivePlayer.side === 'stripes' && type === 'stripe');
      });

      if (pocketedOwnGroupBallInSameShot) {
        concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball in the same shot as their own remaining group ball.`);
      } else if (remainingGroupBalls.length === 0) {
        // ── CALL POCKET enforcement ────────────────────────────
        const eightBall = room.balls.find(b => b.id === 8);
        const actualPocketId = eightBall?.pocketedAtId ?? null;
        if (calledPocket !== null && actualPocketId !== null && actualPocketId !== calledPocket) {
          concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the 8-Ball in the WRONG pocket (called #${calledPocket}, fell in #${actualPocketId}).`);
        } else {
          concludeMatch(room, currentActivePlayer, otherPlayer, `${shooterName} wins the match legally by clearing all their object balls and pocketing the 8-Ball!`);
        }
      } else {
        concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball out of turn while they still had outstanding ${currentActivePlayer.side!.toUpperCase()} balls on the table.`);
      }
    }
    return;
  }

  if (isFoul) {
    room.scratchOccurred = true;
    room.ballInHandRestriction = isBreakShot ? 'behind_head_string' : 'anywhere';
    if (isBreakShot) {
      pushRoomLog(room, `⚠️ BREAK FOUL: ${otherPlayer.username} receives ball-in-hand behind the head string.`);
    }
    pushRoomLog(room, `⚠️ FOUL DETECTED: [${foulReason}] Turn is handed over to ${otherPlayer.username} with FREE Cue Ball placement ${room.ballInHandRestriction === 'behind_head_string' ? 'behind the head string' : 'anywhere'}!`);
    room.currentTurn = otherPlayer.id;
  } else {
    if (pocketedIds.length > 0) {
      pushRoomLog(room, `Pocketed ball(s) this shot: [ ${pocketedIds.join(', ')} ]`);
      if (isBreakShot) {
        const pocketedObjectBalls = pocketedIds.filter(id => id !== 0 && id !== 8);
        if (pocketedObjectBalls.length > 0) {
          pushRoomLog(room, `💣 Break Shot successful! Under WPA Rule 3.4, the table remains OPEN. ${shooterName} pocketed ${pocketedObjectBalls.length} ball(s) and retains the turn.`);
          room.pocketedThisTurn = true;
        } else {
          pushRoomLog(room, `Break shot complete. No object balls pocketed. Table remains OPEN. Turn passes to ${otherPlayer.username}`);
          room.currentTurn = otherPlayer.id;
        }
      } else {
        if (!room.assignedSides) {
          const firstBallId = pocketedIds.find(id => id !== 0 && id !== 8);
          if (firstBallId !== undefined) {
            const assignedType = firstBallId <= 7 ? 'solid' : 'stripe';
            if (assignedType === 'solid') {
              currentActivePlayer.side = 'solids';
              otherPlayer.side = 'stripes';
            } else {
              currentActivePlayer.side = 'stripes';
              otherPlayer.side = 'solids';
            }
            room.assignedSides = true;
            pushRoomLog(room, `🎯 Assigned Sides! ${currentActivePlayer.username} is now ${currentActivePlayer.side.toUpperCase()}; ${otherPlayer.username} is ${otherPlayer.side.toUpperCase()}`);
          }
        }

        const activeSide = currentActivePlayer.side;
        if (activeSide) {
          const pocketedOwnGroup = pocketedIds.some(id => {
            const type = id <= 7 ? 'solid' : 'stripe';
            return (activeSide === 'solids' && type === 'solid') || (activeSide === 'stripes' && type === 'stripe');
          });

          if (pocketedOwnGroup) {
            pushRoomLog(room, `Good strike! ${shooterName} pocketed their assigned group ball and earns an additional turn.`);
            room.pocketedThisTurn = true;
          } else {
            pushRoomLog(room, `Shot turn over. ${shooterName} pocketed only opponent's balls (or did not clear any of their own). Passing turn to ${otherPlayer.username}`);
            room.currentTurn = otherPlayer.id;
          }
        } else {
          room.currentTurn = otherPlayer.id;
        }
      }
    } else {
      pushRoomLog(room, `Clean Hit! No balls pocketed. Turn passes to ${otherPlayer.username}`);
      room.currentTurn = otherPlayer.id;
    }
  }
}


