import { evaluateMetricsCompliance } from '../src/ops/complianceGuards.js';
import { MetricsSnapshot } from '../src/ops/metrics.js';

const baseSnapshot: MetricsSnapshot = {
  count: 20,
  fillRatio: 0.75,
  p95AcceptTimeMs: 800,
  deltaQuoteToFill: 0.015,
  voidRate: 0.05,
  netMarginAvg: 0.018,
  updatedAt: new Date(),
};

const thresholds = {
  minFillRatio: 0.6,
  maxP95AcceptTimeMs: 1000,
  maxDeltaQuoteToFill: 0.02,
  minNetMarginPct: 0.015,
  minSampleSize: 10,
  maxVoidRate: 0.1,
};

const healthy = evaluateMetricsCompliance(baseSnapshot, thresholds);
console.assert(healthy.shouldPause === false, 'healthy snapshot should not pause');
console.assert(healthy.violations.length === 0, 'healthy snapshot should have no violations');

const breachFill = evaluateMetricsCompliance(
  { ...baseSnapshot, fillRatio: 0.4 },
  thresholds,
);
console.assert(breachFill.shouldPause, 'low fill ratio should trigger pause');
console.assert(breachFill.violations.includes('fill_ratio_below_threshold'), 'missing fill ratio violation');

const breachP95 = evaluateMetricsCompliance(
  { ...baseSnapshot, p95AcceptTimeMs: 1200 },
  thresholds,
);
console.assert(breachP95.shouldPause, 'high p95 should trigger pause');
console.assert(breachP95.violations.includes('p95_accept_time_above_threshold'), 'missing p95 violation');

const breachDelta = evaluateMetricsCompliance(
  { ...baseSnapshot, deltaQuoteToFill: 0.05 },
  thresholds,
);
console.assert(breachDelta.shouldPause, 'delta > threshold should trigger pause');
console.assert(breachDelta.violations.includes('delta_quote_to_fill_above_threshold'), 'missing delta violation');

const breachMargin = evaluateMetricsCompliance(
  { ...baseSnapshot, netMarginAvg: 0.001 },
  thresholds,
);
console.assert(breachMargin.shouldPause, 'low net margin should trigger pause');
console.assert(breachMargin.violations.includes('net_margin_below_threshold'), 'missing net margin violation');

const breachVoidRate = evaluateMetricsCompliance(
  { ...baseSnapshot, voidRate: 0.25 },
  thresholds,
);
console.assert(breachVoidRate.shouldPause, 'high void rate should trigger pause');
console.assert(breachVoidRate.violations.includes('void_rate_above_threshold'), 'missing void rate violation');

const insufficientSamples = evaluateMetricsCompliance(
  { ...baseSnapshot, count: 5 },
  thresholds,
);
console.assert(insufficientSamples.shouldPause === false, 'insufficient samples should not pause');
console.assert(insufficientSamples.violations.length === 0, 'insufficient samples should return no violations');

try {
  evaluateMetricsCompliance(baseSnapshot, null as unknown as any);
  console.assert(false, 'missing thresholds should throw');
} catch (error) {
  console.assert(error instanceof Error, 'should throw an Error when thresholds missing');
}
