import { MetricsSnapshot } from './metrics.js';

export interface ComplianceThresholds {
  minFillRatio: number;
  maxP95AcceptTimeMs: number;
  maxDeltaQuoteToFill: number;
  minNetMarginPct: number;
  minSampleSize?: number;
}

export interface ComplianceGuardResult {
  shouldPause: boolean;
  violations: string[];
  metrics: MetricsSnapshot;
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
  }

  return { shouldPause: violations.length > 0, violations, metrics: snapshot };
}
