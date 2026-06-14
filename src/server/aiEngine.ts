import { WebSocket } from 'ws';
import { RoomState, Ball } from '../types';
import { simulatePhysicsStep, powerToVelocity, isAnyBallMoving, captureFrame, forceSettleBalls, wakeAllForShot, resetYieldTimer, yieldIfNeeded } from './physics';
import { animatingRoomIds, clientsByRoom, broadcastRoom, pushRoomLog } from './state';
import { evaluateShotRules } from './gameLogic';

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
    if (gap < AI_BALL_R * 2) return false;
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

export async function triggerAiShot(room: RoomState, opts?: {
  animSet?: Set<string>;
  clientsMap?: Map<string, Set<WebSocket>>;
  broadcastFn?: (roomId: string) => void;
  logFn?: (room: RoomState, msg: string) => void;
}): Promise<void> {
  const animSet = opts?.animSet ?? animatingRoomIds;
  const clientsMap = opts?.clientsMap ?? clientsByRoom;
  const broadcastFn = opts?.broadcastFn ?? broadcastRoom;
  const logFn = opts?.logFn ?? pushRoomLog;

  if (animSet.has(room.roomId)) return;
  animSet.add(room.roomId);

  room.animVersion = (room.animVersion || 0) + 1;
  const currentAnimVersion = room.animVersion;

  const diff = room.aiDifficulty || 'medium';
  const isHard = diff === 'hard';

  // AI personality: aggressive (0) or cautious (1)
  const personality = Math.random();
  const isAggressive = personality > 0.55;

  // Human-like thinking time with occasional "quick" or "hesitation" shots
  const clutchFactor = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length <= 3 ? 0.7 : 1.0;
  const thinkTime = isHard
    ? (400 + Math.random() * 600) * clutchFactor
    : diff === 'medium'
      ? (800 + Math.random() * 1000) * clutchFactor
      : (1200 + Math.random() * 1500) * clutchFactor;

  logFn(room, `AI (${diff}) is ${isAggressive ? 'playing aggressively' : 'playing cautiously'}...`);

  setTimeout(async () => {
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
      animSet.delete(room.roomId);
      return;
    }

    // ── 2. اختيار الهدف الأفضل ────────────────────────────────
    let bestTarget: Ball | null = null;
    let bestAngle = 0;
    let bestPower = 40;
    let bestPocket: { x: number; y: number } | null = null;
    let bestScore = Infinity;
    let usedSafety = false;

    const scoredTargets: Array<{
      target: Ball;
      pocket: { x: number; y: number };
      angle: number;
      power: number;
      cutAngle: number;
      totalScore: number;
      distToPocket: number;
    }> = [];

    const nextTargets = targets.length > 1
      ? targets.filter(t => t.id !== 8)
      : targets;

    for (const ball of targets) {
      for (const pocket of POCKET_POSITIONS) {
        const distToPocket = aiDist(ball.x, ball.y, pocket.x, pocket.y);
        const distCueToTarget = aiDist(cb.x, cb.y, ball.x, ball.y);
        const ghostAngle = ghostBallAngle(cb.x, cb.y, ball.x, ball.y, pocket.x, pocket.y);
        const cutAngle = calcCutAngle(cb.x, cb.y, ball.x, ball.y, pocket.x, pocket.y);

        if (cutAngle > Math.PI * 0.55) continue;
        if (distToPocket > 350 && cutAngle > Math.PI * 0.3) continue;

        if (!isPathClear(cb.x, cb.y, ball.x, ball.y, room.balls)) continue;

        const rawPower = calcIdealPower(distCueToTarget, distToPocket, cutAngle, isHard);
        const power = humanizePower(rawPower, diff);

        const ghostDx = ball.x - pocket.x;
        const ghostDy = ball.y - pocket.y;
        const ghostLen = Math.hypot(ghostDx, ghostDy) || 1;
        const gx = ball.x + (ghostDx / ghostLen) * (AI_BALL_R * 2);
        const gy = ball.y + (ghostDy / ghostLen) * (AI_BALL_R * 2);
        const cueEnd = estimateCueBallEndPos(cb.x, cb.y, ball.x, ball.y, gx, gy, room.balls);

        const posScore = evaluatePositionScore(cueEnd.x, cueEnd.y, nextTargets.filter(t => t.id !== ball.id), diff);

        const easeOfShot = distToPocket * 0.4 + distCueToTarget * 0.1;
        const cutPenalty = cutAngle * 80;
        const totalScore = easeOfShot + cutPenalty + posScore;

        scoredTargets.push({
          target: ball, pocket, angle: ghostAngle, power,
          cutAngle, totalScore, distToPocket,
        });
      }
    }

    scoredTargets.sort((a, b) => a.totalScore - b.totalScore);

    // AI Lookahead for hard difficulty
    if (diff === 'hard' && scoredTargets.length > 0) {
      const topCandidates = scoredTargets.slice(0, 3);
      for (const cand of topCandidates) {
        const simBalls = room.balls.map(b => ({ ...b }));
        const simCb = simBalls.find(b => b.id === 0);
        if (!simCb) continue;
        const aiForce = powerToVelocity(cand.power);
        simCb.vx = Math.cos(cand.angle) * aiForce;
        simCb.vy = Math.sin(cand.angle) * aiForce;

        let iterations = 0;
        let scratch = false;
        let pocketedTarget = false;
        const contactTracker = { firstContactBallId: null as number | null, cushionContactOccurred: false };
        resetYieldTimer();
        while (iterations < 600 && isAnyBallMoving(simBalls)) {
          simulatePhysicsStep(simBalls, contactTracker);
          iterations++;
          await yieldIfNeeded();
        }
        
        const endCb = simBalls.find(b => b.id === 0);
        if (!endCb || endCb.isPocketed) scratch = true;
        const endTarget = simBalls.find(b => b.id === cand.target.id);
        if (endTarget && endTarget.isPocketed) pocketedTarget = true;
        
        if (scratch) cand.totalScore += 2000;
        if (pocketedTarget) cand.totalScore -= 500;
      }
      scoredTargets.sort((a, b) => a.totalScore - b.totalScore);
    }

    const isClutch = targets.length <= 2;
    const shouldUseSafety = scoredTargets.length === 0 && (isHard || (!isAggressive && diff === 'medium'));

    if (shouldUseSafety) {
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
        logFn(room, `AI plays SAFETY — hiding cue ball behind Ball #${safety.target.id}`);
      } else {
        bestTarget = targets[0];
        bestPocket = POCKET_POSITIONS[Math.floor(Math.random() * POCKET_POSITIONS.length)];
        bestAngle = ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y);
        bestPower = humanizePower(30 + Math.random() * 20, diff);
      }
    } else if (scoredTargets.length > 0) {
      const pick = scoredTargets[0];
      bestTarget = pick.target;
      bestPocket = pick.pocket;
      bestPower = humanizePower(pick.power, diff);

      // AI personality: aggressive players go for harder shots, cautious players prefer easy ones
      const isEasyShot = pick.cutAngle < 0.15 && pick.distToPocket < 80;
      if (isEasyShot && scoredTargets.length > 1 && diff !== 'hard') {
        if (!isAggressive && Math.random() < 0.35) {
          // Cautious AI still picks the easy shot
        } else if (isAggressive && Math.random() < 0.4) {
          // Aggressive AI: go for a harder but potentially more rewarding shot
          const altPick = scoredTargets[Math.min(scoredTargets.length - 1, 1 + Math.floor(Math.random() * 2))];
          if (altPick) {
            bestTarget = altPick.target;
            bestPocket = altPick.pocket;
            bestPower = humanizePower(altPick.power, diff);
          }
        }
      }

      // Medium AI: occasional "human" mistake on easy shots
      if (diff === 'medium' && isEasyShot && Math.random() < 0.08) {
        // Oops, misread the angle
        const errorAngle = (Math.random() - 0.5) * 0.04;
        bestAngle = humanizeAngle(
          ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
          pick.cutAngle,
          aiDist(bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
          diff, isClutch
        ) + errorAngle;
      } else {
        bestAngle = humanizeAngle(
          ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
          pick.cutAngle,
          aiDist(bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y),
          diff, isClutch
        );
      }
    } else {
      bestTarget = targets[0];
      bestPocket = POCKET_POSITIONS[Math.floor(Math.random() * POCKET_POSITIONS.length)];
      bestAngle = ghostBallAngle(cb.x, cb.y, bestTarget.x, bestTarget.y, bestPocket.x, bestPocket.y);
      bestPower = humanizePower(40, diff);
    }

    const finalAngle = bestAngle;

    if (!usedSafety) {
      logFn(room,
        `AI targets Ball #${bestTarget.id} → ${bestPocket ? `(${Math.round(bestPocket.x)},${Math.round(bestPocket.y)})` : 'unknown'} ` +
        `| Power: ${bestPower}% | ${diff}`
      );
    }

    // ── 3. إرسال معاينة التصويب ──────────────────────────────
    const wssList = clientsMap.get(room.roomId) || [];
    for (const client of wssList) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'preview_aim', angle: finalAngle, power: bestPower }));
      }
    }

    // ── 4. تنفيذ الضربة ──────────────────────────────────────
    const objectBallsLeft = room.balls.filter(b => b.id !== 0 && !b.isPocketed).length;
    const isBreakShot = objectBallsLeft === 15;

    wakeAllForShot(room.balls);

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

    resetYieldTimer();
    while (iterations < maxStepsLimit) {
      const preStates = room.balls.map(b => ({ id: b.id, isPocketed: b.isPocketed }));
      simulatePhysicsStep(room.balls, contactTracker);
      await yieldIfNeeded();

      for (let i = 0; i < room.balls.length; i++) {
        const currentB = room.balls[i];
        const preB = preStates.find(item => item.id === currentB.id);
        if (!preB) continue;
        if (currentB.isPocketed && !preB.isPocketed) {
          if (currentB.id === 0) cueBallPocketed = true;
          else ballsPocketed.push(currentB.id);
        }
      }

      frames.push(captureFrame(room.balls));
      iterations++;
      if (!isAnyBallMoving(room.balls)) break;
    }
    forceSettleBalls(room.balls);

    const compactFrames = frames.map(f => f.map(b => [b.id, b.x, b.y, b.isPocketed ? 1 : 0]));
    for (const client of wssList) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'physics_frames', frames: compactFrames, totalSteps: iterations }));
      }
    }

    const basePlayMultiplier = frames.length > 350 ? 2.4 : 2.0;
    const animationDurationMs = (iterations * 16.66) / basePlayMultiplier + 80;

    setTimeout(() => {
      if ((room.animVersion || 0) !== currentAnimVersion) return;
      if (room.status !== 'playing') return;

      animSet.delete(room.roomId);
      room.turnTimer = 60;
      evaluateShotRules(
        room, ballsPocketed, cueBallPocketed,
        contactTracker.firstContactBallId,
        'Authoritative_AI_Bot', 'ai-bot',
        isBreakShot, contactTracker.cushionContactOccurred
      );
      broadcastFn(room.roomId);

      if (room.status === 'playing' && room.currentTurn === 'ai-bot') {
        triggerAiShot(room, opts);
      }
    }, animationDurationMs);
  }, thinkTime);
}
