export interface TradeSample {
  requestedStake: number;
  filledStake: number;
  acceptTimeMs: number;
  quotedOdd: number;
  filledOdd: number;
  netMarginPct: number;
  voided?: boolean;
  recordedAt?: Date;
}

export interface MetricsSnapshot {
  count: number;
  fillRatio: number;
  p95AcceptTimeMs: number;
  deltaQuoteToFill: number;
  voidRate: number;
  netMarginAvg: number;
  updatedAt: Date | null;
}

const percentile = (values: number[], target: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (target / 100) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
};

export class MetricsTracker {
  private readonly samples: TradeSample[] = [];
  private voidedCount = 0;
  private updatedAt: Date | null = null;

  constructor(private readonly capacity = 200) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('MetricsTracker capacity must be a positive number');
    }
  }

  record(sample: TradeSample): void {
    if (sample.requestedStake <= 0 || sample.filledStake < 0) {
      throw new Error('Invalid stake values provided');
    }
    this.samples.push(sample);
    if (sample.voided) this.voidedCount += 1;
    if (this.samples.length > this.capacity) {
      const removed = this.samples.shift();
      if (removed?.voided) this.voidedCount -= 1;
    }
    this.updatedAt = sample.recordedAt ?? new Date();
  }

  reset(): void {
    this.samples.length = 0;
    this.voidedCount = 0;
    this.updatedAt = null;
  }

  snapshot(): MetricsSnapshot {
    const count = this.samples.length;
    if (!count) {
      return { count: 0, fillRatio: 0, p95AcceptTimeMs: 0, deltaQuoteToFill: 0, voidRate: 0, netMarginAvg: 0, updatedAt: null };
    }
    let requested = 0;
    let filled = 0;
    let deltaAccum = 0;
    let marginAccum = 0;
    const acceptTimes: number[] = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const sample = this.samples[i];
      requested += sample.requestedStake;
      filled += sample.filledStake;
      deltaAccum += Math.abs(sample.filledOdd - sample.quotedOdd);
      marginAccum += sample.netMarginPct;
      acceptTimes[i] = sample.acceptTimeMs;
    }
    const fillRatio = requested === 0 ? 0 : filled / requested;
    const deltaQuoteToFill = deltaAccum / count;
    const netMarginAvg = marginAccum / count;
    const voidRate = this.voidedCount / count;
    return {
      count,
      fillRatio,
      p95AcceptTimeMs: percentile(acceptTimes, 95),
      deltaQuoteToFill,
      voidRate,
      netMarginAvg,
      updatedAt: this.updatedAt,
    };
  }
}

