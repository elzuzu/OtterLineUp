import { MetricsSnapshot } from './metrics.js';

export interface ComplianceThresholds {
  minFillRatio: number;
  maxP95AcceptTimeMs: number;
  maxDeltaQuoteToFill: number;
  minNetMarginPct: number;
  minSampleSize?: number;
  maxVoidRate?: number;
}

export interface ComplianceGuardResult {
  shouldPause: boolean;
  violations: string[];
  metrics: MetricsSnapshot;
}

export interface ExecConfigEnvelope {
  exec?: {
    real_money?: unknown;
  };
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export function evaluateMetricsCompliance(
  snapshot: MetricsSnapshot,
  thresholds: ComplianceThresholds,
): ComplianceGuardResult {
  if (!thresholds) {
    throw new Error('Compliance thresholds must be provided');
  }
  const {
    minFillRatio,
    maxP95AcceptTimeMs,
    maxDeltaQuoteToFill,
    minNetMarginPct,
    minSampleSize = 1,
    maxVoidRate,
  } = thresholds;

  const violations: string[] = [];

  if (snapshot.count < minSampleSize) {
    return { shouldPause: false, violations, metrics: snapshot };
  }

  if (!isFiniteNumber(snapshot.fillRatio) || snapshot.fillRatio < minFillRatio) {
    violations.push('fill_ratio_below_threshold');
  }

  if (
    !isFiniteNumber(snapshot.p95AcceptTimeMs) ||
    snapshot.p95AcceptTimeMs > maxP95AcceptTimeMs
  ) {
    violations.push('p95_accept_time_above_threshold');
  }

  if (
    !isFiniteNumber(snapshot.deltaQuoteToFill) ||
    snapshot.deltaQuoteToFill > maxDeltaQuoteToFill
  ) {
    violations.push('delta_quote_to_fill_above_threshold');
  }

  if (!isFiniteNumber(snapshot.netMarginAvg) || snapshot.netMarginAvg < minNetMarginPct) {
    violations.push('net_margin_below_threshold');
  }

  if (!isFiniteNumber(snapshot.voidRate) || snapshot.voidRate < 0) {
    violations.push('invalid_void_rate');
  } else if (
    maxVoidRate !== undefined &&
    isFiniteNumber(maxVoidRate) &&
    snapshot.voidRate > maxVoidRate
  ) {
    violations.push('void_rate_above_threshold');
  }

  return { shouldPause: violations.length > 0, violations, metrics: snapshot };
}

export function assertRealMoneyEnabled(config: ExecConfigEnvelope): void {
  if (!config || typeof config !== 'object') {
    throw new Error('Config payload must be an object');
  }
  const flag = config.exec?.real_money;
  if (flag !== true) {
    throw new Error('REAL_MONEY flag must be true in exec config');
  }
}
