import { RoomState, Player, MatchHistory } from '../types';
import { animatingRoomIds, clientsByRoom, broadcastRoom, matchLogs } from './state';
import { laravelDb, logLaravelApi } from './laravel';
import { simulatePhysicsStep } from './physics';
import { WebSocket } from 'ws';

export function concludeMatch(room: RoomState, winner: Player, loser: Player, summaryMessage: string) {
  room.status = 'gameover';
  room.winnerId = winner.id;
  room.log.push(`🏆 MATCH CONCLUDED! ${summaryMessage}`);

  const esc = laravelDb.escrows.find(e => e.roomName === room.name && e.status === 'locked');
  if (!esc) {
    return;
  }

  const totalPot = esc.amountEach * 2;
  const commission = Math.round(totalPot * 0.05 * 100) / 100;
  const prize = totalPot - commission;

  const dbWinner = laravelDb.users.find(u => u.id === winner.id);
  const dbLoser = laravelDb.users.find(u => u.id === loser.id);

  if (dbWinner) dbWinner.balance += prize;
  esc.status = 'payout_completed';

  const trxId = `trx-${Math.floor(Math.random() * 899999 + 100000)}`;
  laravelDb.transactions.push({
    id: trxId,
    escrowId: esc.escrowId,
    prize,
    commission,
    winnerId: winner.id,
    loserId: loser.id,
    timestamp: new Date().toISOString()
  });

  winner.walletBalance = dbWinner ? dbWinner.balance : winner.walletBalance;
  if (dbLoser) loser.walletBalance = dbLoser.balance;

  room.log.push(`💰 Wallet balances updated via Laravel platform gateway secure callbacks!`);
  room.log.push(`Winner: ${winner.username} receives prize of $${prize.toFixed(2)} (locked stakes pot minus $${commission.toFixed(2)} commission).`);

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
  matchLogs.push(hist);
  room.log.push(`Match history recorded.`);
  console.log(`Match result: ${winner.username} beat ${loser.username} in room ${room.roomId}`);
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
) {
  const player1 = room.players[0];
  const player2 = room.players[1];
  if (!player1 || !player2) return;

  const currentActivePlayer = room.players.find(p => p.id === shooterId)!;
  const otherPlayer = room.players.find(p => p.id !== shooterId)!;

  room.pocketedThisTurn = false;
  room.scratchOccurred = false;

  let isFoul = false;
  let foulReason = '';

  const remainingGroupBalls = room.assignedSides && currentActivePlayer.side
    ? room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed && b.type === (currentActivePlayer.side === 'solids' ? 'solid' : 'stripe'))
    : [];

  if (cueBallPocketed) {
    isFoul = true;
    foulReason = 'Cue Ball Scratched (pocketed).';
    room.balls[0].isPocketed = false;
    room.balls[0].x = 200;
    room.balls[0].y = 200;
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

  if (!isFoul && firstContactBallId !== null && pocketedIds.length === 0 && !isBreakShot) {
    if (!cushionContactOccurred) {
      isFoul = true;
      foulReason = 'WPA Cushion Contact Foul (خطأ عدم ضرب الحواجز): After striking the ball, no ball was pocketed and no ball contacted a cushion rail.';
    }
  }

  if (pocketedIds.includes(8)) {
    if (isFoul) {
      concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball, but committed a FOUL [${foulReason}].`);
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
        concludeMatch(room, currentActivePlayer, otherPlayer, `${shooterName} wins the match legally by clearing all their object balls and pocketing the 8-Ball!`);
      } else {
        concludeMatch(room, otherPlayer, currentActivePlayer, `Defeat! ${shooterName} pocketed the Black 8-Ball out of turn while they still had outstanding ${currentActivePlayer.side!.toUpperCase()} balls on the table.`);
      }
    }
    return;
  }

  if (isFoul) {
    room.scratchOccurred = true;
    room.log.push(`⚠️ FOUL DETECTED: [${foulReason}] Turn is handed over to ${otherPlayer.username} with FREE Cue Ball placement anywhere!`);
    room.currentTurn = otherPlayer.id;
  } else {
    if (pocketedIds.length > 0) {
      room.log.push(`Pocketed ball(s) this shot: [ ${pocketedIds.join(', ')} ]`);
      if (isBreakShot) {
        const pocketedObjectBalls = pocketedIds.filter(id => id !== 0 && id !== 8);
        if (pocketedObjectBalls.length > 0) {
          room.log.push(`💣 Break Shot successful! Under WPA Rule 3.4, the table remains OPEN. ${shooterName} pocketed ${pocketedObjectBalls.length} ball(s) and retains the turn.`);
          room.pocketedThisTurn = true;
        } else {
          room.log.push(`Break shot complete. No object balls pocketed. Table remains OPEN. Turn passes to ${otherPlayer.username}`);
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
            room.log.push(`🎯 Assigned Sides! ${currentActivePlayer.username} is now ${currentActivePlayer.side.toUpperCase()}; ${otherPlayer.username} is ${otherPlayer.side.toUpperCase()}`);
          }
        }

        const activeSide = currentActivePlayer.side;
        if (activeSide) {
          const pocketedOwnGroup = pocketedIds.some(id => {
            const type = id <= 7 ? 'solid' : 'stripe';
            return (activeSide === 'solids' && type === 'solid') || (activeSide === 'stripes' && type === 'stripe');
          });

          if (pocketedOwnGroup) {
            room.log.push(`Good strike! ${shooterName} pocketed their assigned group ball and earns an additional turn.`);
            room.pocketedThisTurn = true;
          } else {
            room.log.push(`Shot turn over. ${shooterName} pocketed only opponent's balls (or did not clear any of their own). Passing turn to ${otherPlayer.username}`);
            room.currentTurn = otherPlayer.id;
          }
        } else {
          room.currentTurn = otherPlayer.id;
        }
      }
    } else {
      room.log.push(`Clean Hit! No balls pocketed. Turn passes to ${otherPlayer.username}`);
      room.currentTurn = otherPlayer.id;
    }
  }
}

export function triggerAiShot(room: RoomState) {
  animatingRoomIds.add(room.roomId);
  room.log.push('AI Opponent thinking is active...');

  setTimeout(() => {
    if (room.status !== 'playing' || room.currentTurn !== 'ai-bot') return;

    const cb = room.balls[0];
    const aiSide = room.players.find(p => p.id === 'ai-bot')?.side;
    let targets = room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed);
    if (room.assignedSides && aiSide) {
      const activeType = aiSide === 'solids' ? 'solid' : 'stripe';
      targets = targets.filter(b => b.type === activeType);
    }

    if (targets.length === 0) {
      targets = room.balls.filter(b => b.id === 8 && !b.isPocketed);
    }
    if (targets.length === 0) {
      targets = room.balls.filter(b => b.id !== 0 && !b.isPocketed);
    }

    if (targets.length === 0) {
      animatingRoomIds.delete(room.roomId);
      return;
    }

    const closestBall = targets[Math.floor(Math.random() * targets.length)];
    const dx = closestBall.x - cb.x;
    const dy = closestBall.y - cb.y;
    let angle = Math.atan2(dy, dx);
    let errorMargin = 0;
    let randomPower = 40;
    const diff = room.aiDifficulty || 'medium';

    if (diff === 'easy') {
      errorMargin = (Math.random() - 0.5) * 0.28;
      randomPower = Math.floor(Math.random() * 30) + 25;
    } else if (diff === 'hard') {
      errorMargin = (Math.random() - 0.5) * 0.02;
      randomPower = Math.floor(Math.random() * 40) + 50;
    } else {
      errorMargin = (Math.random() - 0.5) * 0.11;
      randomPower = Math.floor(Math.random() * 40) + 35;
    }
    angle += errorMargin;

    const wssList = clientsByRoom.get(room.roomId) || [];
    for (const client of wssList) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'preview_aim', angle, power: randomPower }));
      }
    }

    const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
    const isBreakShot = objectBallsLeft === 15;

    setTimeout(() => {
      cb.vx = Math.cos(angle) * (randomPower / 100 * 22);
      cb.vy = Math.sin(angle) * (randomPower / 100 * 22);
      room.log.push(`AI fires shot: Aimed at Ball #${closestBall.id} (${closestBall.type}) with Power ${randomPower}%.`);

      const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
      frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
      let iterations = 0;
      let anyBallMoving = true;
      const maxStepsLimit = 1200;
      const ballsPocketed: number[] = [];
      let cueBallPocketed = false;
      const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

      while (anyBallMoving && iterations < maxStepsLimit) {
        const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
        simulatePhysicsStep(room.balls, 0.988, 0.95, contactTracker);

        for (let i = 0; i < room.balls.length; i++) {
          const currentB = room.balls[i];
          const preB = preStates.find(item => item.id === currentB.id)!;
          if (currentB.isPocketed && !preB.isPocketed) {
            if (currentB.id === 0) cueBallPocketed = true;
            else ballsPocketed.push(currentB.id);
          }
        }

        anyBallMoving = room.balls.some(b => !b.isPocketed && (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05));
        frames.push(room.balls.map(b => ({ id: b.id, x: b.x, y: b.y, isPocketed: b.isPocketed })));
        iterations++;
      }

      for (const client of wssList) {
        if (client.readyState === client.OPEN) {
          client.send(JSON.stringify({ type: 'physics_frames', frames }));
        }
      }

      const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
      const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150;

      setTimeout(() => {
        animatingRoomIds.delete(room.roomId);
        room.turnTimer = 60;
        evaluateShotRules(room, ballsPocketed, cueBallPocketed, contactTracker.firstContactBallId, 'Authoritative_AI_Bot', 'ai-bot', isBreakShot, contactTracker.cushionContactOccurred);
        broadcastRoom(room.roomId);

        if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
          triggerAiShot(room);
        }
      }, animationDurationMs);
    }, 800);
  }, 1200);
}
