import { MetricsTracker } from '../src/ops/metrics.js';

const tracker = new MetricsTracker(5);
tracker.record({ requestedStake: 100, filledStake: 80, acceptTimeMs: 300, quotedOdd: 1.9, filledOdd: 1.85, netMarginPct: 0.018 });
tracker.record({ requestedStake: 100, filledStake: 60, acceptTimeMs: 420, quotedOdd: 1.92, filledOdd: 1.88, netMarginPct: 0.02, voided: true });
tracker.record({ requestedStake: 100, filledStake: 100, acceptTimeMs: 180, quotedOdd: 1.94, filledOdd: 1.94, netMarginPct: 0.017 });

const snapshot = tracker.snapshot();
console.assert(snapshot.count === 3, 'count mismatch');
console.assert(snapshot.fillRatio > 0.79 && snapshot.fillRatio < 0.81, 'fill ratio mismatch');
console.assert(snapshot.voidRate > 0 && snapshot.voidRate < 0.5, 'void rate mismatch');
console.assert(snapshot.p95AcceptTimeMs >= 420, 'p95 mismatch');
console.assert(snapshot.deltaQuoteToFill >= 0, 'delta should be non-negative');
console.assert(snapshot.netMarginAvg > 0, 'net margin avg should be positive');
