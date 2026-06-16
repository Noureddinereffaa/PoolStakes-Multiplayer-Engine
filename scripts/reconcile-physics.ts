/**
 * Phase 1.10 — Physics Reconciliation Layer
 *
 * Bridges spin_pure_metrics (px/s² acceleration in isolation) with
 * spin_game_metrics (px position difference in real play).
 *
 * For each spin constant, sweeps multiple values, runs BOTH pure and game
 * scenarios, and prints a side-by-side comparison with the effective
 * transfer function (game_px_per_pure_pxps).
 *
 * Run: npx tsx scripts/reconcile-physics.ts
 */
import { setPhysicsConfig, resetPhysicsConfig, measurePureSpinEffect } from '../src/server/physics';
import { runCalibration } from './calibrate';

// ── Reconciliation helpers ────────────────────────────────────────

function extractMetric(report: ReturnType<typeof runCalibration>, scenario: string, metric: string): number {
  const s = report.scenarios.find(s => s.name === scenario);
  if (!s) return NaN;
  const m = s.metrics[metric];
  return m ? m.mean : NaN;
}

function pad(s: string, w: number): string { return s.padEnd(w); }

function printHeader(cols: string[]): void {
  const line = cols.map(c => pad(c, c.length > 18 ? 18 : 14)).join(' ');
  console.log(line);
  console.log('─'.repeat(line.length));
}

function printRow(vals: (string | number)[], widths: number[]): void {
  const parts = vals.map((v, i) => {
    const s = typeof v === 'number' ? v.toFixed(2) : v;
    return pad(s, widths[i] || 14);
  });
  console.log(parts.join(' '));
}

// ── Reconciliation sweeps ─────────────────────────────────────────

function reconcileLongFactor(): void {
  const values = [10, 50, 100, 150, 200];
  const iterations = 10;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  LONG_FACTOR — Pure vs Game Reconciliation`);
  console.log(`  Transfer fn: how pure along-motion accel (px/s²) maps to`);
  console.log(`  game-visible draw/follow position difference (px).`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  printHeader(['LONG_FACTOR', 'Pure Accel(ps²)', 'Game Draw(px)', 'Game Follow(px)', 'Draw/Pure', 'Follow/Pure']);

  for (const v of values) {
    setPhysicsConfig({ LONG_FACTOR: v });
    const pure = measurePureSpinEffect(500, 0, 0, 1, 60);
    const report = runCalibration(iterations);
    const draw = extractMetric(report, 'draw', 'drawBack');
    const follow = extractMetric(report, 'follow', 'followThrough');

    const dp = pure.longAccel !== 0 ? draw / pure.longAccel : 0;
    const fp = pure.longAccel !== 0 ? follow / pure.longAccel : 0;

    printRow([v, pure.longAccel, draw, follow, dp, fp], [12, 16, 16, 16, 12, 12]);
  }
  resetPhysicsConfig();
}

function reconcileCurveFactor(): void {
  const values = [5, 10, 20, 30, 40];
  const iterations = 10;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  CURVE_FACTOR — Pure vs Game Reconciliation`);
  console.log(`  Transfer fn: how pure lateral accel (px/s²) maps to`);
  console.log(`  game-visible yDeviation (px).`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  printHeader(['CURVE_FACTOR', 'Pure Accel(ps²)', 'Game Curve(px)', 'Game Swerve(px)', 'Curve/Pure', 'Swerve/Pure']);

  for (const v of values) {
    setPhysicsConfig({ CURVE_FACTOR: v, SWERVE_FACTOR: 1 });
    const pure = measurePureSpinEffect(500, 0, 1, 0, 60);
    const report = runCalibration(iterations);
    const curve = extractMetric(report, 'curve', 'yDeviation');
    const swerve = extractMetric(report, 'swerve', 'finalXDelta');

    const cp = pure.curveAccel !== 0 ? curve / pure.curveAccel : 0;
    const sp = pure.curveAccel !== 0 ? swerve / pure.curveAccel : 0;

    printRow([v, pure.curveAccel, curve, swerve, cp, sp], [14, 16, 16, 16, 12, 12]);
  }
  resetPhysicsConfig();
}

function reconcileSwerveFactor(): void {
  const values = [0.1, 0.5, 1, 2, 5];
  const iterations = 10;

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  SWERVE_FACTOR — Pure vs Game Reconciliation`);
  console.log(`  Transfer fn: how pure swerve accel (px/s²) maps to`);
  console.log(`  game-visible swerve (px).`);
  console.log(`  (CURVE_FACTOR held at 20)`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  printHeader(['SWERVE_FACTOR', 'Pure Accel(ps²)', 'Game Curve(px)', 'Game Swerve(px)', 'Curve/Pure']);

  for (const v of values) {
    setPhysicsConfig({ CURVE_FACTOR: 20, SWERVE_FACTOR: v });
    const pure = measurePureSpinEffect(500, 0, 1, 0, 60);
    const report = runCalibration(iterations);
    const curve = extractMetric(report, 'curve', 'yDeviation');
    const swerve = extractMetric(report, 'swerve', 'finalXDelta');

    printRow([v, pure.curveAccel, curve, swerve, curve / pure.curveAccel], [14, 16, 16, 16, 12]);
  }
  resetPhysicsConfig();
}

// ── Final reconciliation summary ──────────────────────────────────

function printSummary(): void {
  resetPhysicsConfig();

  // Run reference measurement at current config
  const pure = measurePureSpinEffect(500, 0, 1, 1, 60);
  const report = runCalibration(20);

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`  Reconciliation Summary (current config)`);
  console.log(`═══════════════════════════════════════════════════════════════`);

  const sections = [
    { title: 'LONG_FACTOR', constant: 'LONG_FACTOR', pureKey: 'longAccel', game1: { s: 'draw', m: 'drawBack' }, game2: { s: 'follow', m: 'followThrough' } },
    { title: 'CURVE_FACTOR', constant: 'CURVE_FACTOR', pureKey: 'curveAccel', game1: { s: 'curve', m: 'yDeviation' }, game2: { s: 'swerve', m: 'finalXDelta' } },
  ];

  for (const sec of sections) {
    const pv = (pure as any)[sec.pureKey] as number;
    const g1 = extractMetric(report, sec.game1.s, sec.game1.m);
    const g2 = sec.game2 ? extractMetric(report, sec.game2.s, sec.game2.m) : NaN;

    console.log(`\n  ${sec.title}:`);
    console.log(`    Pure acceleration:         ${pv.toFixed(1)} px/s²  (design: constant = pure) ✓`);
    console.log(`    Game metric 1 (${sec.game1.m}):      ${g1.toFixed(2)} px`);
    if (!isNaN(g2)) console.log(`    Game metric 2 (${sec.game2.m}): ${g2.toFixed(2)} px`);
    console.log(`    Transfer ratio (game/pure): ${(g1 / pv).toFixed(4)} px per px/s²`);
  }

  // Swerve reconciliation
  const sCurve = extractMetric(report, 'pure_curve', 'curveAccel_pxps');
  const sSwerve = extractMetric(report, 'pure_swerve', 'swerveAccel_pxps');
  const gameSwerve = extractMetric(report, 'swerve', 'finalXDelta');

  console.log(`\n  SWERVE_FACTOR:`);
  console.log(`    Pure curve+swerve accel:    ${sCurve.toFixed(1)} px/s²`);
  console.log(`    Pure swerve-only accel:     ${sSwerve.toFixed(2)} px/s²`);
  console.log(`    Game swerve (finalXDelta):  ${gameSwerve.toFixed(2)} px`);
  console.log(`    Transfer ratio (game/pure): ${(gameSwerve / sCurve).toFixed(4)} px per px/s²`);

  console.log(`\n  Reference baseline (from calibration-targets.json v4.0):`);
  console.log(`    LONG_FACTOR_effect_pure   = ${pure.longAccel.toFixed(1)} px/s²`);
  console.log(`    CURVE_FACTOR_effect_pure  = ${pure.curveAccel.toFixed(1)} px/s²`);
  console.log(`    SWERVE_FACTOR_effect_pure = ${sSwerve.toFixed(1)} px/s²`);
}

// ── Main ──────────────────────────────────────────────────────────

function main(): void {
  console.log(`Physics Reconciliation Layer`);
  console.log(`============================`);
  console.log(`Compares spin_pure_metrics (isolated acceleration) with`);
  console.log(`spin_game_metrics (real-game position difference).`);

  reconcileLongFactor();
  reconcileCurveFactor();
  reconcileSwerveFactor();
  printSummary();

  resetPhysicsConfig();
  console.log(`\nReconciliation complete.`);
}

try { main(); } catch (e) { console.error(e); process.exit(1); }
resetPhysicsConfig();
