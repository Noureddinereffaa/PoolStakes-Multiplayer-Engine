import { RoomState, Player, MatchHistory, Ball } from '../types';
import { animatingRoomIds, clientsByRoom, broadcastRoom, pushRoomLog, pushMatchLog } from './state';
import { prisma } from './db';
import { simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame, HEAD_STRING_X, FOOT_SPOT_X, FOOT_SPOT_Y, CUSHION, BALL_R, TABLE_W, TABLE_H } from './physics';
import { logger } from './logger';
import { WebSocket } from 'ws';

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

  return { x: 200, y: 200 };
}

export async function concludeMatch(room: RoomState, winner: Player, loser: Player, summaryMessage: string) {
  room.status = 'gameover';
  room.winnerId = winner.id;
  pushRoomLog(room, `🏆 MATCH CONCLUDED! ${summaryMessage}`);

  let commission = 0;
  let prize = 0;

  try {
    const esc = await prisma.escrow.findFirst({
      where: { roomName: room.name, status: 'locked' }
    });
    if (!esc) return;

    const totalPot = esc.amountEach * 2;
    commission = Math.round(totalPot * (room.commissionRate || 0.05) * 100) / 100;
    prize = totalPot - commission;

    const dbWinner = await prisma.$transaction(async (tx) => {
      const updatedWinner = await tx.user.update({
        where: { id: winner.id },
        data: { balance: { increment: prize } }
      });

      await tx.escrow.update({
        where: { id: esc.id },
        data: { status: 'payout_completed' }
      });

      await tx.transaction.create({
        data: {
          escrowId: esc.id,
          prize,
          commission,
          winnerId: winner.id,
          loserId: loser.id
        }
      });
      return updatedWinner;
    });

    winner.walletBalance = dbWinner.balance;
    const dbLoser = await prisma.user.findUnique({ where: { id: loser.id } });
    if (dbLoser) loser.walletBalance = dbLoser.balance;

    pushRoomLog(room, `💰 Wallet balances updated via Prisma gateway secure callbacks!`);
    pushRoomLog(room, `Winner: ${winner.username} receives prize of $${prize.toFixed(2)} (locked stakes pot minus $${commission.toFixed(2)} commission).`);
    if (room.serverSeed) {
      pushRoomLog(room, `🔑 PROVABLY FAIR REVEAL: Server Seed was ${room.serverSeed}`);
      pushRoomLog(room, `You can verify that SHA256(Server Seed) matches the Integrity Hash shown at the start of the match.`);
    }
  } catch (error) {
    logger.error('Failed to process match payout', { error: String(error), room: room.name });
    pushRoomLog(room, "⚠️ Error processing payout.");
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
  logger.info('Match concluded', { winner: winner.username, loser: loser.username, room: room.roomId, prize, commission });
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
  room.ballInHandRestriction = undefined;

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
        concludeMatch(room, currentActivePlayer, otherPlayer, `${shooterName} wins the match legally by clearing all their object balls and pocketing the 8-Ball!`);
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

// ─────────────────────────────────────────────────────────────
//  AI CONSTANTS
// ─────────────────────────────────────────────────────────────

/** مواقع الحفر على الطاولة */
const AI_POCKETS = [
  { x: 24,  y: 24  },   // top-left
  { x: 400, y: 19  },   // top-center
  { x: 776, y: 24  },   // top-right
  { x: 24,  y: 376 },   // bottom-left
  { x: 400, y: 381 },   // bottom-center
  { x: 776, y: 376 },   // bottom-right
] as const;

const AI_BALL_R = 10;

/** مركز الطاولة — الموقع المثالي لكرة الضرب بعد الضربة */
const TABLE_CENTER = { x: 400, y: 200 };

/** الزوايا الست للحفر — إحداثيات المركز */
const POCKET_POSITIONS = [
  { x: 23, y: 23 },   // top-left
  { x: 400, y: 18 },  // top-center
  { x: 777, y: 23 },  // top-right
  { x: 23, y: 377 },  // bottom-left
  { x: 400, y: 382 }, // bottom-center
  { x: 777, y: 377 }, // bottom-right
];

// ─────────────────────────────────────────────────────────────
//  AI CORE LOGIC
// ─────────────────────────────────────────────────────────────

export function aiDist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x2 - x1, y2 - y1);
}

/** حساب زاوية القطع (cut angle) — كلما صغرت، كانت الضربة أسهل */
function calcCutAngle(
  cueX: number, cueY: number,
  targetX: number, targetY: number,
  pocketX: number, pocketY: number
): number {
  const ghostDx = targetX - pocketX;
  const ghostDy = targetY - pocketY;
  const ghostLen = Math.hypot(ghostDx, ghostDy) || 1;
  const gx = targetX + (ghostDx / ghostLen) * (AI_BALL_R * 2);
  const gy = targetY + (ghostDy / ghostLen) * (AI_BALL_R * 2);

  const aimDx = gx - cueX;
  const aimDy = gy - cueY;
  const aimLen = Math.hypot(aimDx, aimDy) || 1;

  const pocketDx = pocketX - targetX;
  const pocketDy = pocketY - targetY;
  const pocketLen = Math.hypot(pocketDx, pocketDy) || 1;

  const cosCut = (aimDx / aimLen) * (pocketDx / pocketLen) + (aimDy / aimLen) * (pocketDy / pocketLen);
  return Math.acos(Math.max(-1, Math.min(1, cosCut)));
}

/** تقدير موقع الكرة البيضاء بعد التصادم (انعكاس بسيط) */
function estimateCueBallEndPos(
  cueX: number, cueY: number,
  targetX: number, targetY: number,
  ghostX: number, ghostY: number,
  balls: Ball[]
): { x: number; y: number } {
  const dx = ghostX - cueX;
  const dy = ghostY - cueY;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;

  // كرة الضرب تواصل مسارها بعد التصادم لمسافة تعتمد على القوة
  const travel = 60;
  let ex = ghostX + nx * travel;
  let ey = ghostY + ny * travel;

  // ارتداد بسيط عن الحواف
  if (ex < 30 || ex > 770) { ex = Math.max(30, Math.min(770, ex)); }
  if (ey < 30 || ey > 370) { ey = Math.max(30, Math.min(370, ey)); }

  return { x: ex, y: ey };
}

/** البحث عن أفضل position play — أين يجب أن تكون كرة الضرب بعد هذه الضربة؟ */
function evaluatePositionScore(
  cueEndX: number, cueEndY: number,
  nextTargets: Ball[],
  difficulty: string
): number {
  if (nextTargets.length === 0) return 0;
  if (difficulty === 'easy') return 0;

  // ما هي أقرب مسافة من كرة الضرب المتوقعة إلى أقرب كرة تالية؟
  let minDist = Infinity;
  for (const t of nextTargets) {
    const d = aiDist(cueEndX, cueEndY, t.x, t.y);
    // المسافة المثالية: 30-80 — قريبة كفاية للتصويب لكن ليس قريبة جداً
    const ideal = Math.abs(d - 55);
    if (ideal < minDist) minDist = ideal;
  }

  // عقوبة المسافة البعيدة جداً أو القريبة جداً
  const posScore = Math.min(100, (minDist / 20)) * (difficulty === 'hard' ? 1.0 : 0.5);
  return posScore;
}

/** حساب القوة المثلى — تعتمد على المسافة الكلية التي ستقطعها الكرة */
function calcIdealPower(
  cueToTarget: number,
  targetToPocket: number,
  cutAngle: number,
  isHard: boolean
): number {
  // المسافة الكلية = مسار كرة الضرب + مسار الكرة المستهدفة
  const totalDist = cueToTarget * 0.4 + targetToPocket * 0.6;
  const ratio = Math.min(1, totalDist / 700);

  // القوة الأساسية: 30%-85% حسب المسافة
  let power = 25 + ratio * 60;

  // تخفيف القوة للزوايا الحادة (السرعة الزائدة تسبب انحراف)
  const cutFactor = 1.0 - Math.min(0.3, cutAngle * 0.5);
  power *= cutFactor;

  // تفاوت بشري
  if (!isHard) {
    power *= 0.85 + Math.random() * 0.25;
  }

  return Math.max(20, Math.min(88, Math.round(power)));
}

/** حساب زاوية الكرة الوهمية (Ghost Ball) */
export function ghostBallAngle(
  cueBallX: number, cueBallY: number,
  targetX: number, targetY: number,
  pocketX: number, pocketY: number
): number {
  const dirX = pocketX - targetX;
  const dirY = pocketY - targetY;
  const dirLen = Math.hypot(dirX, dirY) || 1;
  const ghostX = targetX - (dirX / dirLen) * (AI_BALL_R * 2);
  const ghostY = targetY - (dirY / dirLen) * (AI_BALL_R * 2);
  return Math.atan2(ghostY - cueBallY, ghostX - cueBallX);
}

/** إضافة تفاوت بشري واقعي للزاوية — الأخطاء تزداد مع صعوبة الضربة */
function humanizeAngle(
  angle: number,
  cutAngle: number,
  targetToPocket: number,
  difficulty: string,
  isClutch: boolean
): number {
  let baseError: number;

  switch (difficulty) {
    case 'hard':
      // محترف: خطأ صغير جداً، يزداد قليلاً في الضربات الصعبة
      baseError = 0.005 + cutAngle * 0.015 + (targetToPocket / 500) * 0.01;
      baseError *= isClutch ? 1.4 : 1.0;
      break;
    case 'medium':
      baseError = 0.02 + cutAngle * 0.04 + (targetToPocket / 400) * 0.015;
      baseError *= isClutch ? 1.3 : 1.0;
      break;
    default: // easy
      baseError = 0.06 + cutAngle * 0.08 + (targetToPocket / 300) * 0.02;
      baseError *= isClutch ? 1.2 : 1.0;
  }

  // توزيع طبيعي للخطأ (معظم الأخطاء صغيرة، البعض أكبر)
  const u1 = Math.random();
  const u2 = Math.random();
  const normalSample = Math.sqrt(-2 * Math.log(u1 + 0.0001)) * Math.cos(2 * Math.PI * u2);
  const error = baseError * Math.max(0.3, Math.min(3, Math.abs(normalSample)));

  return angle + (Math.random() > 0.5 ? error : -error);
}

/** إضافة تفاوت بشري للقوة */
function humanizePower(power: number, difficulty: string): number {
  const variation = difficulty === 'hard' ? 0.92 + Math.random() * 0.16
    : difficulty === 'medium' ? 0.85 + Math.random() * 0.25
    : 0.70 + Math.random() * 0.35;
  return Math.max(15, Math.min(95, Math.round(power * variation)));
}

/** فحص خط الرؤية بين الكرة البيضاء والهدف */
function isPathClear(x1: number, y1: number, x2: number, y2: number, balls: Ball[]): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1) return true;
  const nx = dx / dist;
  const ny = dy / dist;
  for (const b of balls) {
    if (b.isPocketed || b.id === 0) continue;
    const px = b.x - x1;
    const py = b.y - y1;
    const t = px * nx + py * ny;
    if (t < 0 || t > dist) continue;
    const closestX = x1 + t * nx;
    const closestY = y1 + t * ny;
    const gap = Math.sqrt((b.x - closestX) ** 2 + (b.y - closestY) ** 2);
    if (gap < BALL_R * 2) return false;
  }
  return true;
}

/** البحث عن تسديدة دفاعية (safety) — ضرب كرة بطريقة تُصعّب على الخصم */
function findSafetyShot(
  cueBall: Ball,
  targets: Ball[],
  balls: Ball[]
): { target: Ball; pocket: { x: number; y: number }; score: number } | null {
  let best: { target: Ball; pocket: { x: number; y: number }; score: number } | null = null;

  for (const t of targets) {
    for (const pocket of POCKET_POSITIONS) {
      const distToPocket = aiDist(t.x, t.y, pocket.x, pocket.y);

      // كرة بعيدة عن الحفرة = آمنة (لن تدخل بالصدفة)
      if (distToPocket < 100) continue;

      const angle = ghostBallAngle(cueBall.x, cueBall.y, t.x, t.y, pocket.x, pocket.y);
      if (!isPathClear(cueBall.x, cueBall.y, t.x, t.y, balls)) continue;

      // أين ستنتهي كرة الضرب بعد ضربة خفيفة؟
      const cueEndX = cueBall.x + Math.cos(angle) * 30;
      const cueEndY = cueBall.y + Math.sin(angle) * 30;

      // هل كرة الضرب ستختبئ خلف كرات أخرى؟
      const hidden = balls.some(b =>
        !b.isPocketed && b.id !== 0 && b.id !== t.id &&
        aiDist(b.x, b.y, cueEndX, cueEndY) < 60
      );
      // هل الكرة المستهدفة بعيدة عن الحفرة؟
      const safeDist = Math.max(0, distToPocket - 150);

      const score = safeDist * (hidden ? 0.7 : 1.0) + (Math.random() * 50);
      if (!best || score > best.score) {
        best = { target: t, pocket, score };
      }
    }
  }

  return best;
}

// ─────────────────────────────────────────────────────────────
//  MAIN AI SHOT FUNCTION
// ─────────────────────────────────────────────────────────────

export function triggerAiShot(room: RoomState) {
  if (animatingRoomIds.has(room.roomId)) return;
  animatingRoomIds.add(room.roomId);

  room.animVersion = (room.animVersion || 0) + 1;
  const currentAnimVersion = room.animVersion;

  const diff = room.aiDifficulty || 'medium';
  const isHard = diff === 'hard';

  // تأخير بشري: محترف يفكر أسرع، المبتدئ أبطأ
  const thinkTime = isHard ? 600 + Math.random() * 800
    : diff === 'medium' ? 1000 + Math.random() * 1200
    : 1500 + Math.random() * 2000;

  pushRoomLog(room, `AI (${diff}) is reading the table...`);

  setTimeout(() => {
    if ((room.animVersion || 0) !== currentAnimVersion) return;
    if (room.status !== 'playing' || room.currentTurn !== 'ai-bot') return;

    const cb = room.balls[0];
    const aiPlayer = room.players.find(p => p.id === 'ai-bot');
    const aiSide = aiPlayer?.side;

    // ── 1. تحديد قائمة الكرات المستهدفة ──────────────────────
    let targets = room.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.isPocketed);
    if (room.assignedSides && aiSide) {
      const activeType = aiSide === 'solids' ? 'solid' : 'stripe';
      const ownGroupBalls = targets.filter(b => b.type === activeType);
      targets = ownGroupBalls.length > 0
        ? ownGroupBalls
        : room.balls.filter(b => b.id === 8 && !b.isPocketed);
    }
    if (targets.length === 0) {
      targets = room.balls.filter(b => b.id !== 0 && !b.isPocketed);
    }
    if (targets.length === 0) {
      animatingRoomIds.delete(room.roomId);
      return;
    }

    // ── 2. اختيار الهدف الأفضل ────────────────────────────────
    let bestTarget: Ball | null = null;
    let bestAngle = 0;
    let bestPower = 40;
    let bestPocket: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    let usedSafety = false;

    // تصنيف الأهداف: نفضل السهلة أولاً
    const scoredTargets: Array<{
      target: Ball;
      pocket: { x: number; y: number };
      angle: number;
      power: number;
      cutAngle: number;
      totalScore: number;
    }> = [];

    const nextTargets = targets.length > 1
      ? targets.filter(t => t.id !== 8)
      : targets;

    for (const ball of targets) {
      // جرب كل الحفر
      for (const pocket of POCKET_POSITIONS) {
        const distToPocket = aiDist(ball.x, ball.y, pocket.x, pocket.y);
        const distCueToTarget = aiDist(cb.x, cb.y, ball.x, ball.y);
        const ghostAngle = ghostBallAngle(cb.x, cb.y, ball.x, ball.y, pocket.x, pocket.y);
        const cutAngle = calcCutAngle(cb.x, cb.y, ball.x, ball.y, pocket.x, pocket.y);

        // تجاهل الحفر البعيدة جداً أو الزوايا المستحيلة (> 60°)
        if (cutAngle > Math.PI * 0.55) continue;
        if (distToPocket > 350 && cutAngle > Math.PI * 0.3) continue;

        // فحص مسار الكرة البيضاء إلى الهدف
        if (!isPathClear(cb.x, cb.y, ball.x, ball.y, room.balls)) continue;

        const rawPower = calcIdealPower(distCueToTarget, distToPocket, cutAngle, isHard);
        const power = humanizePower(rawPower, diff);

        // حساب موقع الكرة البيضاء المتوقع بعد الضربة
        const ghostDx = ball.x - pocket.x;
        const ghostDy = ball.y - pocket.y;
        const ghostLen = Math.hypot(ghostDx, ghostDy) || 1;
        const gx = ball.x + (ghostDx / ghostLen) * (AI_BALL_R * 2);
        const gy = ball.y + (ghostDy / ghostLen) * (AI_BALL_R * 2);
        const cueEnd = estimateCueBallEndPos(cb.x, cb.y, ball.x, ball.y, gx, gy, room.balls);

        // position score
        const posScore = evaluatePositionScore(cueEnd.x, cueEnd.y, nextTargets.filter(t => t.id !== ball.id), diff);

        // المسافة الكلية: قرب الهدف من الحفرة + سهولة الوصول
        const easeOfShot = distToPocket * 0.4 + distCueToTarget * 0.1;
        const cutPenalty = cutAngle * 80;
        const totalScore = easeOfShot + cutPenalty + posScore;

        scoredTargets.push({
          target: ball, pocket, angle: ghostAngle, power,
          cutAngle, totalScore,
        });
      }
    }

    // ترتيب حسب الجودة (أقل score أفضل)
    scoredTargets.sort((a, b) => a.totalScore - b.totalScore);

    // هل هناك أهداف ممكنة؟
    const isClutch = targets.length <= 2; // ضغط: كرات قليلة متبقية
    const shouldUseSafety = scoredTargets.length === 0 && isHard;

    if (shouldUseSafety) {
      // ── تسديدة دفاعية ──
      const safety = findSafetyShot(cb, targets, room.balls);
      if (safety) {
        const rawPower = 20 + Math.random() * 15;
        bestPower = humanizePower(rawPower, diff);
        bestAngle = humanizeAngle(
          ghostBallAngle(cb.x, cb.y, safety.target.x, safety.target.y, safety.pocket.x, safety.pocket.y),
          0, aiDist(safety.target.x, safety.target.y, safety.pocket.x, safety.pocket.y),
          diff, isClutch
        );
        bestTarget = safety.target;
        bestPocket = safety.pocket;
        usedSafety = true;
        pushRoomLog(room, `AI plays SAFETY — hiding cue ball behind Ball #${safety.target.id}`);
      } else {
        // لا يوجد أي أمل — ارتطام عشوائي
        bestTarget = targets[0];
        bestPocket = POCKET_POSITIONS[Math.floor(Math.random() * POCKET_POSITIONS.length)];
        bestAngle = ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y);
        bestPower = humanizePower(30 + Math.random() * 20, diff);
      }
    } else if (scoredTargets.length > 0) {
      // اختر أفضل تسديدة
      const pick = scoredTargets[0];
      bestTarget = pick.target;
      bestPocket = pick.pocket;
      bestPower = humanizePower(pick.power, diff);

      // هل هناك كرة سهلة جداً؟ (قريبة من الحفرة + زاوية صغيرة)
      const isEasyShot = pick.cutAngle < 0.15 && aiDist(pick.target.x, pick.target.y, pick.pocket.x, pick.pocket.y) < 80;
      if (isEasyShot && scoredTargets.length > 1 && diff !== 'hard') {
        // أحياناً يختار AI المبتدئ كرة أصعب
        const altPick = scoredTargets[Math.min(scoredTargets.length - 1, 1 + Math.floor(Math.random() * 2))];
        if (altPick && Math.random() < 0.3) {
          bestTarget = altPick.target;
          bestPocket = altPick.pocket;
          bestPower = humanizePower(altPick.power, diff);
        }
      }

      bestAngle = humanizeAngle(
        ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
        pick.cutAngle,
        aiDist(bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
        diff, isClutch
      );
    } else {
      // لم يجد أي هدف — تصويب عشوائي
      bestTarget = targets[0];
      bestPocket = POCKET_POSITIONS[Math.floor(Math.random() * POCKET_POSITIONS.length)];
      bestAngle = ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y);
      bestPower = humanizePower(40, diff);
    }

    const finalAngle = bestAngle;

    if (!usedSafety) {
      pushRoomLog(room,
        `AI targets Ball #${bestTarget.id} → ${bestPocket ? `(${Math.round(bestPocket.x)},${Math.round(bestPocket.y)})` : 'unknown'} ` +
        `| Power: ${bestPower}% | ${diff}`
      );
    }

    // ── 3. إرسال معاينة التصويب ──────────────────────────────
    const wssList = clientsByRoom.get(room.roomId) || [];
    for (const client of wssList) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'preview_aim', angle: finalAngle, power: bestPower }));
      }
    }

    // ── 4. تنفيذ الضربة ──────────────────────────────────────
    const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
    const isBreakShot = objectBallsLeft === 15;

    const aiForce = powerToVelocity(bestPower);
    cb.vx = Math.cos(finalAngle) * aiForce;
    cb.vy = Math.sin(finalAngle) * aiForce;

    const frames: Array<{ id: number; x: number; y: number; isPocketed: boolean }[]> = [];
    frames.push(captureFrame(room.balls));

    let iterations = 0;
    const maxStepsLimit = 1200;
    const ballsPocketed: number[] = [];
    let cueBallPocketed = false;
    const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };

    while (iterations < maxStepsLimit) {
      const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
      simulatePhysicsStep(room.balls, contactTracker);

      for (let i = 0; i < room.balls.length; i++) {
        const currentB = room.balls[i];
        const preB = preStates.find(item => item.id === currentB.id)!;
        if (currentB.isPocketed && !preB.isPocketed) {
          if (currentB.id === 0) cueBallPocketed = true;
          else ballsPocketed.push(currentB.id);
        }
      }

      frames.push(captureFrame(room.balls));
      iterations++;
      if (!isAnyBallMoving(room.balls)) break;
    }

    const compactFrames = frames.map(f => f.map(b => [b.id, b.x, b.y, b.isPocketed ? 1 : 0]));
    for (const client of wssList) {
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'physics_frames', frames: compactFrames }));
      }
    }

    const basePlayMultiplier = frames.length > 350 ? 1.95 : 1.65;
    const animationDurationMs = (frames.length * 16.66) / basePlayMultiplier + 150;

    setTimeout(() => {
      if ((room.animVersion || 0) !== currentAnimVersion) return;
      if (room.status !== 'playing') return;

      animatingRoomIds.delete(room.roomId);
      room.turnTimer = 60;
      evaluateShotRules(
        room, ballsPocketed, cueBallPocketed,
        contactTracker.firstContactBallId,
        'Authoritative_AI_Bot', 'ai-bot',
        isBreakShot, contactTracker.cushionContactOccurred
      );
      broadcastRoom(room.roomId);

      if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
        triggerAiShot(room);
      }
    }, animationDurationMs);
  }, thinkTime);
}
