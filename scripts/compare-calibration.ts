/**
 * Phase 1.5 — Compare current calibration against stored targets.
 * Run: npx tsx scripts/compare-calibration.ts
 *
 * Loads calibration-targets.json (baseline) and runs a fresh calibration,
 * then prints a diff table. Exits non-zero if any metric drifts beyond tolerance.
 */
import * as fs from 'fs';
import { runCalibration } from './calibrate';

interface Target {
  label: string;
  unit: string;
  baseline_mean: number;
  baseline_std: number;
  tolerance_std: number;
  min_acceptable?: number;
  max_acceptable?: number;
  note?: string;
}

function loadTargets(): Record<string, Record<string, Target>> {
  const raw = JSON.parse(fs.readFileSync('calibration-targets.json', 'utf-8'));
  return raw.targets;
}

function compare(): void {
  const targets = loadTargets();
  const report = runCalibration(10);

  let allPass = true;
  const lines: string[] = [];

  for (const scenario of report.scenarios) {
    const scenarioTargets = targets[scenario.name];
    if (!scenarioTargets) {
      lines.push(`  ⚠  No targets defined for scenario "${scenario.name}"`);
      continue;
    }

    for (const [metricName, metric] of Object.entries(scenario.metrics)) {
      const tgt = scenarioTargets[metricName] as Target | undefined;
      if (!tgt) {
        lines.push(`  ⚠  No target for ${scenario.name}.${metricName}`);
        continue;
      }

      const current = metric.mean;
      const drift = current - tgt.baseline_mean;
      const isDeterministic = tgt.baseline_std === 0;
      const maxDrift = isDeterministic ? 0 : tgt.tolerance_std * tgt.baseline_std;
      const withinBounds = current >= (tgt.min_acceptable ?? -Infinity) && current <= (tgt.max_acceptable ?? Infinity);
      const withinDrift = isDeterministic ? true : Math.abs(drift) <= maxDrift;
      const within = withinDrift && withinBounds;

      const status = within ? '✅' : '❌';
      if (!within) allPass = false;

      let driftStr: string;
      if (isDeterministic) {
        driftStr = 'deterministic (no drift possible)';
      } else {
        driftStr = `${drift > 0 ? '+' : ''}${drift.toFixed(2)} (limit ±${maxDrift.toFixed(2)})`;
      }
      lines.push(`  ${status}  ${scenario.name}.${metricName}: ${current.toFixed(2)} ${tgt.unit}  (drift=${driftStr})`);
    }
  }

  console.log(`\nCalibration Comparison Report`);
  console.log(`═══════════════════════════════`);
  console.log(`Date: ${report.timestamp}`);
  console.log(`Config: COR_BALL=${report.configValues.COR_BALL}, MU_BALL=${report.configValues.MU_BALL}, LONG_FACTOR=${report.configValues.LONG_FACTOR}, STOP_THRESHOLD=${report.configValues.STOP_THRESHOLD}`);
  console.log(`\nResults:`);
  lines.forEach(l => console.log(l));
  console.log(`\nOverall: ${allPass ? '✅ ALL PASS' : '❌ SOME DRIFT DETECTED'}`);

  if (!allPass) process.exit(1);
}

compare();
