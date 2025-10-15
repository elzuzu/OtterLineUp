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
    fill_ratio_min?: unknown;
    p95_accept_time_ms_max?: unknown;
    delta_quote_to_fill_max?: unknown;
    delta_odd_reject?: unknown;
    threshold_net_pct?: unknown;
    min_sample_size?: unknown;
    max_void_rate?: unknown;
  };
}

export interface DeriveComplianceOptions {
  minSampleSize?: number;
  maxVoidRate?: number;
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

const ensureFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
};

const optionalFiniteNumber = (
  value: unknown,
  label: string,
): number | undefined => {
  if (value === undefined) return undefined;
  return ensureFiniteNumber(value, label);
};

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

export function deriveComplianceThresholds(
  config: ExecConfigEnvelope,
  options: DeriveComplianceOptions = {},
): ComplianceThresholds {
  if (!config || typeof config !== 'object') {
    throw new Error('Config payload must be an object');
  }
  const exec = config.exec ?? {};
  const minFillRatio = ensureFiniteNumber(exec.fill_ratio_min, 'exec.fill_ratio_min');
  const maxP95AcceptTimeMs = ensureFiniteNumber(
    exec.p95_accept_time_ms_max,
    'exec.p95_accept_time_ms_max',
  );
  const maxDeltaQuoteToFill = ensureFiniteNumber(
    exec.delta_quote_to_fill_max ?? exec.delta_odd_reject,
    'exec.delta_quote_to_fill_max | exec.delta_odd_reject',
  );
  const minNetMarginPct = ensureFiniteNumber(
    exec.threshold_net_pct,
    'exec.threshold_net_pct',
  );
  const minSampleSize = optionalFiniteNumber(
    exec.min_sample_size ?? options.minSampleSize ?? 20,
    'min_sample_size',
  );
  const maxVoidRate = optionalFiniteNumber(
    exec.max_void_rate ?? options.maxVoidRate,
    'max_void_rate',
  );

  return {
    minFillRatio,
    maxP95AcceptTimeMs,
    maxDeltaQuoteToFill,
    minNetMarginPct,
    minSampleSize,
    maxVoidRate,
  };
}
