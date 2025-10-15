export type OrderStatus = 'accepted' | 'partially_accepted' | 'void'; export type QuoteRequest = { marketUid: string; side: string; stake: number; }; export type Quote = { marketUid: string; side: string; odds: number; availableStake: number; }; export type BetRequest = QuoteRequest & { odds: number; oddsSlippage: number; };
export type Fill = { fillId: string; filledStake: number; odds: number; acceptedAt: Date; }; export type OrderResponse = { status: OrderStatus; fills: Fill[]; }; export type BetExecution = { status: OrderStatus; fills: Fill[]; requestedStake: number; remainingStake: number; };
export type SxClientMetadata = {
  oddsLadderStep?: number;
  oddsLadder?: number[];
  bettingDelayMs: number;
  heartbeatMs: number;
  maxOddsSlippage: number;
  fetchedAtMs: number;
};
export type MetadataProvider = { latest(): Promise<SxClientMetadata>; };
export type QuoteSource = { bestQuote(request: QuoteRequest): Promise<Quote>; };
export type PreparedOrder = { marketUid: string; side: string; odds: number; stake: number; oddsSlippage: number; bettingDelayMs: number; heartbeatMs: number; }; export type OrderExecutor = { submit(order: PreparedOrder): Promise<OrderResponse>; };
export type SxClientOptions = { metadataTtlMs: number; metadata: MetadataProvider; quotes: QuoteSource; executor: OrderExecutor; clock?: () => number; };

export class SxClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'SxClientError';
  }
}

export class SxClient {
  private readonly clock: () => number;
  private cachedMetadata?: SxClientMetadata;
  constructor(private readonly options: SxClientOptions) { this.clock = options.clock ?? (() => Date.now()); }

  async getBestQuote(request: QuoteRequest): Promise<Quote> {
    const metadata = await this.loadMetadata();
    const ladder = this.resolveOddsLadder(metadata);
    const quote = await this.options.quotes.bestQuote(request);
    return { ...quote, odds: alignOddsToLadder(quote.odds, ladder) };
  }

  async placeBet(request: BetRequest): Promise<BetExecution> {
    const metadata = await this.loadMetadata();
    const ladder = this.resolveOddsLadder(metadata);
    if (request.oddsSlippage > metadata.maxOddsSlippage) {
      throw new SxClientError('E-SX-ODDS-SLIPPAGE', 'requested slippage exceeds allowed range', {
        requested: request.oddsSlippage,
        max: metadata.maxOddsSlippage,
      });
    }
    const response = await this.withTimeout(safeSum(metadata.bettingDelayMs, metadata.heartbeatMs), () =>
      this.options.executor.submit({
        marketUid: request.marketUid,
        side: request.side,
        odds: alignOddsToLadder(request.odds, ladder),
        stake: request.stake,
        oddsSlippage: request.oddsSlippage,
        bettingDelayMs: metadata.bettingDelayMs,
        heartbeatMs: metadata.heartbeatMs,
      }),
    );
    const filled = response.fills.reduce((total, fill) => total + fill.filledStake, 0);
    const remaining = Math.max(0, request.stake - filled);
    const status: OrderStatus =
      remaining <= Number.EPSILON && response.status === 'accepted'
        ? 'accepted'
        : filled > Number.EPSILON
        ? 'partially_accepted'
        : 'void';
    return { status, fills: response.fills, requestedStake: request.stake, remainingStake: remaining };
  }

  private async loadMetadata(): Promise<SxClientMetadata> {
    const cached = this.cachedMetadata;
    if (cached && this.isMetadataFresh(cached) && this.hasValidOddsLadder(cached)) {
      return cached;
    }
    const metadata = await this.options.metadata.latest();
    this.ensureMetadataFresh(metadata);
    this.resolveOddsLadder(metadata);
    this.cachedMetadata = metadata;
    return metadata;
  }

  private isMetadataFresh(metadata: SxClientMetadata): boolean {
    const age = this.clock() - metadata.fetchedAtMs;
    return age <= this.options.metadataTtlMs;
  }

  private hasValidOddsLadder(metadata: SxClientMetadata): boolean {
    try {
      this.resolveOddsLadder(metadata);
      return true;
    } catch {
      return false;
    }
  }

  private ensureMetadataFresh(metadata: SxClientMetadata): void {
    if (this.isMetadataFresh(metadata)) return;
    const ageMs = this.clock() - metadata.fetchedAtMs;
    throw new SxClientError('E-SX-METADATA-STALE', 'metadata snapshot is stale', { ageMs });
  }

  private resolveOddsLadder(metadata: SxClientMetadata): number | number[] {
    const { oddsLadder, oddsLadderStep } = metadata;
    if (Array.isArray(oddsLadder)) {
      if (oddsLadder.length === 0) {
        throw new SxClientError('E-SX-METADATA-INVALID', 'invalid odds ladder definition', {
          oddsLadder,
          oddsLadderStep,
        });
      }
      for (const value of oddsLadder) {
        if (!Number.isFinite(value) || value <= 0) {
          throw new SxClientError('E-SX-METADATA-INVALID', 'invalid odds ladder definition', {
            oddsLadder,
            oddsLadderStep,
          });
        }
      }
      return oddsLadder;
    }
    if (Number.isFinite(oddsLadderStep) && (oddsLadderStep as number) > 0) {
      return oddsLadderStep as number;
    }
    throw new SxClientError('E-SX-METADATA-INVALID', 'invalid odds ladder definition', {
      oddsLadder,
      oddsLadderStep,
    });
  }

  private async withTimeout<T>(ms: number, task: () => Promise<T>): Promise<T> {
    if (!(ms > 0 && Number.isFinite(ms))) return task();
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new SxClientError('E-SX-PARTIAL-TIMEOUT', 'heartbeat timeout exceeded', { timeoutMs: ms })), ms);
      task().then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    });
  }
}

const TIE_EPSILON = 1e-12;

export function alignOddsToLadder(odds: number, ladder: number | number[]): number {
  if (!Number.isFinite(odds)) {
    throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, ladder });
  }
  if (Array.isArray(ladder)) {
    if (ladder.length === 0) {
      throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, ladder });
    }
    let best = ladder[0];
    if (!Number.isFinite(best)) {
      throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, ladder });
    }
    let bestDiff = Math.abs(best - odds);
    for (let i = 1; i < ladder.length; i += 1) {
      const value = ladder[i];
      if (!Number.isFinite(value)) {
        throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, ladder });
      }
      const diff = Math.abs(value - odds);
      if (diff < bestDiff - TIE_EPSILON || (Math.abs(diff - bestDiff) <= TIE_EPSILON && value > best)) {
        best = value;
        bestDiff = diff;
      }
    }
    return best;
  }
  if (!(Number.isFinite(ladder) && ladder > 0)) {
    throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, ladder });
  }
  const step = ladder as number;
  return Math.round(odds / step) * step;
}

function safeSum(a: number, b: number): number {
  return Number.isFinite(a) && Number.isFinite(b) ? a + b : Number.POSITIVE_INFINITY;
}
