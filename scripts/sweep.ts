/**
 * Phase 1.5e — Parameter Sweep Tool
 *
 * Sweeps one physics parameter at a time, runs calibration for each variant,
 * and prints a comparison table. Use to identify which constants most
 * affect each scenario metric.
 *
 * Run: npx tsx scripts/sweep.ts
 */
import { setPhysicsConfig, resetPhysicsConfig } from '../src/server/physics';
import { runCalibration } from './calibrate';

interface SweepVariant {
  label: string;
  params: Record<string, number>;
}

interface SweepResult {
  label: string;
  metrics: Record<string, number>; // scenario.metric → mean value
}

// ── Sweep definitions ─────────────────────────────────────────────
// Each group sweeps one parameter while keeping others at baseline.
const SWEEP_GROUPS: { name: string; variants: SweepVariant[] }[] = [
  {
    name: 'MU_ROLL',
    variants: [
      { label: 'MU_ROLL_0.010', params: { MU_ROLL: 0.010 } },
      { label: 'MU_ROLL_0.015 (baseline)', params: { MU_ROLL: 0.015 } },
      { label: 'MU_ROLL_0.020', params: { MU_ROLL: 0.020 } },
    ],
  },
  {
    name: 'MU_BALL',
    variants: [
      { label: 'MU_BALL_0.005', params: { MU_BALL: 0.005 } },
      { label: 'MU_BALL_0.008 (baseline)', params: { MU_BALL: 0.008 } },
      { label: 'MU_BALL_0.012', params: { MU_BALL: 0.012 } },
    ],
  },
  {
    name: 'COR_BALL',
    variants: [
      { label: 'COR_BALL_0.94', params: { COR_BALL: 0.94 } },
      { label: 'COR_BALL_0.95 (baseline)', params: { COR_BALL: 0.95 } },
      { label: 'COR_BALL_0.96', params: { COR_BALL: 0.96 } },
    ],
  },
  {
    name: 'COR_CUSHION',
    variants: [
      { label: 'COR_CUSHION_0.75', params: { COR_CUSHION: 0.75 } },
      { label: 'COR_CUSHION_0.80 (baseline)', params: { COR_CUSHION: 0.80 } },
      { label: 'COR_CUSHION_0.85', params: { COR_CUSHION: 0.85 } },
    ],
  },
  {
    name: 'LONG_FACTOR',
    variants: [
      { label: 'LONG_FACTOR_0.028', params: { LONG_FACTOR: 0.028 } },
      { label: 'LONG_FACTOR_10', params: { LONG_FACTOR: 10 } },
      { label: 'LONG_FACTOR_50', params: { LONG_FACTOR: 50 } },
      { label: 'LONG_FACTOR_100 (baseline)', params: { LONG_FACTOR: 100 } },
      { label: 'LONG_FACTOR_200', params: { LONG_FACTOR: 200 } },
    ],
  },
  {
    name: 'CURVE_FACTOR',
    variants: [
      { label: 'CURVE_FACTOR_0.035', params: { CURVE_FACTOR: 0.035 } },
      { label: 'CURVE_FACTOR_5', params: { CURVE_FACTOR: 5 } },
      { label: 'CURVE_FACTOR_10', params: { CURVE_FACTOR: 10 } },
      { label: 'CURVE_FACTOR_20 (baseline)', params: { CURVE_FACTOR: 20 } },
      { label: 'CURVE_FACTOR_40', params: { CURVE_FACTOR: 40 } },
    ],
  },
  {
    name: 'SWERVE_FACTOR',
    variants: [
      { label: 'SWERVE_FACTOR_0.012', params: { SWERVE_FACTOR: 0.012 } },
      { label: 'SWERVE_FACTOR_0.1', params: { SWERVE_FACTOR: 0.1 } },
      { label: 'SWERVE_FACTOR_0.5', params: { SWERVE_FACTOR: 0.5 } },
      { label: 'SWERVE_FACTOR_1 (baseline)', params: { SWERVE_FACTOR: 1 } },
      { label: 'SWERVE_FACTOR_5', params: { SWERVE_FACTOR: 5 } },
    ],
  },
  {
    name: 'STOP_THRESHOLD',
    variants: [
      { label: 'STOP_THRESHOLD_0.005', params: { STOP_THRESHOLD: 0.005 } },
      { label: 'STOP_THRESHOLD_0.010 (baseline)', params: { STOP_THRESHOLD: 0.010 } },
      { label: 'STOP_THRESHOLD_0.020', params: { STOP_THRESHOLD: 0.020 } },
    ],
  },
];

// Metrics to display in the table
const METRIC_COLS = [
  { key: 'break.spread', label: 'Spread(px)', decimals: 0 },
  { key: 'break.pockets', label: 'Pockets', decimals: 2 },
  { key: 'draw.drawBack', label: 'Draw(px)', decimals: 1 },
  { key: 'follow.followThrough', label: 'Follow(px)', decimals: 1 },
  { key: 'curve.yDeviation', label: 'Curve(px)', decimals: 2 },
  { key: 'swerve.finalXDelta', label: 'Swerve(px)', decimals: 2 },
  { key: 'pure_long.longAccel_pxps', label: 'PureL(px/s²)', decimals: 1 },
  { key: 'pure_curve.curveAccel_pxps', label: 'PureC(px/s²)', decimals: 1 },
  { key: 'pure_swerve.swerveAccel_pxps', label: 'PureS(px/s²)', decimals: 1 },
  { key: 'bank.finalX', label: 'BankX(px)', decimals: 0 },
];

function flattenMetrics(report: ReturnType<typeof runCalibration>): Record<string, number> {
  const flat: Record<string, number> = {};
  for (const s of report.scenarios) {
    for (const [mName, m] of Object.entries(s.metrics)) {
      flat[`${s.name}.${mName}`] = m.mean;
    }
  }
  return flat;
}

function runVariant(v: SweepVariant, iterations: number): SweepResult {
  resetPhysicsConfig();
  setPhysicsConfig(v.params as any);
  const report = runCalibration(iterations);
  return { label: v.label, metrics: flattenMetrics(report) };
}

function printResults(allResults: { groupName: string; results: SweepResult[] }[]): void {
  // Build header
  const header = ['Param'];
  for (const col of METRIC_COLS) {
    header.push(col.label.padStart(12));
  }
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`  Parameter Sweep Results (${new Date().toISOString()})`);
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(header.join(' '));
  console.log('─'.repeat(header.join(' ').length));

  for (const group of allResults) {
    const baselineMetrics = group.results.find(r => r.label.includes('baseline'))?.metrics;
    for (const r of group.results) {
      const row = [r.label.padEnd(30)];
      for (const col of METRIC_COLS) {
        const val = r.metrics[col.key];
        const dr = val.toFixed(col.decimals).padStart(12);
        row.push(dr);
      }
      console.log(row.join(' '));
    }
    // Print deltas vs baseline
    if (baselineMetrics) {
      for (const r of group.results) {
        if (r.label.includes('baseline')) continue;
        const row = ['  Δ vs baseline'.padEnd(30)];
        for (const col of METRIC_COLS) {
          const base = baselineMetrics[col.key];
          const val = r.metrics[col.key];
          const delta = val - base;
          const sign = delta > 0 ? '+' : '';
          const dr = `${sign}${delta.toFixed(col.decimals)}`.padStart(12);
          row.push(dr);
        }
        console.log(row.join(' '));
      }
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  console.log(`Running parameter sweep (8 iterations per variant)...`);
  const allResults: { groupName: string; results: SweepResult[] }[] = [];

  for (const group of SWEEP_GROUPS) {
    const results: SweepResult[] = [];
    for (const v of group.variants) {
      process.stdout.write(`  ${v.label.padEnd(35)}... `);
      const r = runVariant(v, 8);
      results.push(r);
      console.log(`done`);
    }
    allResults.push({ groupName: group.name, results });
  }

  resetPhysicsConfig();
  printResults(allResults);
  console.log(`Sweep complete.`);
}

main().catch(e => { console.error(e); process.exit(1); });
