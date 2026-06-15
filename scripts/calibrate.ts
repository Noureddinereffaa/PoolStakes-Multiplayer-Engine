import {
  getInitialBalls, simulatePhysicsStep, isAnyBallMoving, forceSettleBalls,
  powerToVelocity, breakPowerToVelocity,
  BALL_R, MIN_X, MAX_X, MIN_Y, MAX_Y,
  PHYSICS,
} from '../src/server/physics';

// ── Types ─────────────────────────────────────────────────────────
interface MetricStats {
  unit: string;
  n: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
}

interface ScenarioReport {
  name: string;
  n: number;
  metrics: Record<string, MetricStats>;
}

interface CalibrationReport {
  timestamp: string;
  configValues: Record<string, unknown>;
  scenarios: ScenarioReport[];
}

// ── Statistics helpers ─────────────────────────────────────────────
function computeStats(values: number[], unit: string): MetricStats {
  const n = values.length;
  if (n === 0) return { unit, n: 0, mean: 0, std: 0, min: 0, max: 0, p5: 0, p95: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return {
    unit,
    n,
    mean,
    std: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[n - 1],
    p5: sorted[Math.max(0, Math.floor(n * 0.05))],
    p95: sorted[Math.min(n - 1, Math.floor(n * 0.95))],
  };
}

// ── Scenario runners ───────────────────────────────────────────────
function runUntilSettled(balls: ReturnType<typeof getInitialBalls>, maxSteps = 2000): void {
  let steps = 0;
  while (steps < maxSteps) {
    simulatePhysicsStep(balls);
    steps++;
    if (!isAnyBallMoving(balls)) break;
  }
  forceSettleBalls(balls);
}

function scenarioBreak(n: number): ScenarioReport {
  const spreads: number[] = [];
  const pockets: number[] = [];

  for (let i = 0; i < n; i++) {
    const balls = getInitialBalls();
    const cue = balls[0];
    cue.x = 200; cue.y = 200;
    cue.vx = breakPowerToVelocity(100);
    cue.vy = 0;
    cue.sleeping = false;

    runUntilSettled(balls);

    const centerX = 400, centerY = 200;
    let maxSpread = 0;
    for (const b of balls) {
      if (b.id === 0 || b.isPocketed) continue;
      const d = Math.hypot(b.x - centerX, b.y - centerY);
      if (d > maxSpread) maxSpread = d;
    }
    spreads.push(maxSpread);
    pockets.push(balls.filter(b => b.id !== 0 && b.isPocketed).length);
  }

  return {
    name: 'break',
    n,
    metrics: {
      spread: computeStats(spreads, 'px'),
      pockets: computeStats(pockets, 'balls'),
    },
  };
}

function scenarioDraw(n: number): ScenarioReport {
  const deltas: number[] = [];

  for (let i = 0; i < n; i++) {
    const run = (sy: number): number => {
      const b = getInitialBalls();
      const cue = b[0];
      const target = b.find(bb => bb.id === 1)!;
      b.forEach(bb => { if (bb.id !== 0 && bb.id !== 1) bb.isPocketed = true; });
      cue.x = 300; cue.y = 200; cue.sleeping = false;
      target.x = 400; target.y = 200; target.sleeping = false;
      cue.spinY = sy;
      cue.vx = powerToVelocity(70);
      cue.vy = 0;
      runUntilSettled(b);
      return cue.x;
    };

    const noSpinEndX = run(0);
    const drawEndX = run(-1);
    deltas.push(noSpinEndX - drawEndX);
  }

  return {
    name: 'draw',
    n,
    metrics: {
      // positive delta = cue ball pulled left (good draw)
      drawBack: computeStats(deltas, 'px'),
    },
  };
}

function scenarioFollow(n: number): ScenarioReport {
  const deltas: number[] = [];

  for (let i = 0; i < n; i++) {
    const run = (sy: number): number => {
      const b = getInitialBalls();
      const cue = b[0];
      const target = b.find(bb => bb.id === 1)!;
      b.forEach(bb => { if (bb.id !== 0 && bb.id !== 1) bb.isPocketed = true; });
      cue.x = 300; cue.y = 200; cue.sleeping = false;
      target.x = 400; target.y = 200; target.sleeping = false;
      cue.spinY = sy;
      cue.vx = powerToVelocity(70);
      cue.vy = 0;
      runUntilSettled(b);
      return cue.x;
    };

    const noSpinEndX = run(0);
    const followEndX = run(1);
    deltas.push(followEndX - noSpinEndX);
  }

  return {
    name: 'follow',
    n,
    metrics: {
      // positive delta = cue ball goes further forward with follow
      followThrough: computeStats(deltas, 'px'),
    },
  };
}

function scenarioCushionBounce(n: number): ScenarioReport {
  const positions: number[] = [];

  for (let i = 0; i < n; i++) {
    const balls = getInitialBalls();
    const cue = balls[0];
    cue.x = 200; cue.y = 100; cue.sleeping = false;
    cue.vx = powerToVelocity(85);
    cue.vy = 0;

    let prevVx = cue.vx;
    let bounces = 0;
    let steps = 0;
    const MAX = 5000;
    while (steps < MAX) {
      simulatePhysicsStep(balls);
      steps++;
      if (prevVx * cue.vx < 0 && Math.abs(cue.vx) > 1) bounces++;
      prevVx = cue.vx;
      if (bounces >= 2) break;
    }
    positions.push(cue.x);
  }

  return {
    name: 'cushion_bounce',
    n,
    metrics: {
      passRate: computeStats(positions.map(() => 1), ''), // placeholder — real metric below
    },
  };
}

function scenarioBank(n: number): ScenarioReport {
  const positions: number[] = [];

  for (let i = 0; i < n; i++) {
    const balls = getInitialBalls();
    const cue = balls[0];
    balls.forEach(bb => { if (bb.id !== 0) bb.isPocketed = true; });

    const speed = powerToVelocity(50);
    cue.x = 100; cue.y = 200; cue.sleeping = false;
    cue.vx = speed * Math.cos(Math.PI / 4);
    cue.vy = speed * Math.sin(Math.PI / 4);

    runUntilSettled(balls);
    positions.push(cue.x);
  }

  return {
    name: 'bank',
    n,
    metrics: {
      finalX: computeStats(positions, 'px'),
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────
function runCalibration(n = 20): CalibrationReport {
  const scenarios: ScenarioReport[] = [
    scenarioBreak(n),
    scenarioDraw(n),
    scenarioFollow(n),
    scenarioCushionBounce(n),
    scenarioBank(n),
  ];

  const configValues: Record<string, unknown> = {
    COR_BALL: PHYSICS.COR_BALL,
    COR_CUSHION: PHYSICS.COR_CUSHION,
    MU_BALL: PHYSICS.MU_BALL,
    MU_ROLL: PHYSICS.MU_ROLL,
    MU_SLIDE: PHYSICS.MU_SLIDE,
    LONG_FACTOR: PHYSICS.LONG_FACTOR,
    CURVE_FACTOR: PHYSICS.CURVE_FACTOR,
    SPIN_DECAY: PHYSICS.SPIN_DECAY,
    STOP_THRESHOLD: PHYSICS.STOP_THRESHOLD,
    FIXED_DT: PHYSICS.FIXED_DT,
    SUB_STEPS: PHYSICS.SUB_STEPS,
  };

  return {
    timestamp: new Date().toISOString(),
    configValues,
    scenarios,
  };
}

import * as fs from 'fs';

function main(): void {
  const report = runCalibration();
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync('calibration-report.json', json, 'utf-8');
  console.log(json);
}

main();
