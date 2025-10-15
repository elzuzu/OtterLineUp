export type OrderStatus = 'accepted' | 'partially_accepted' | 'void'; export type QuoteRequest = { marketUid: string; side: string; stake: number; }; export type Quote = { marketUid: string; side: string; odds: number; availableStake: number; }; export type BetRequest = QuoteRequest & { odds: number; oddsSlippage: number; };
export type Fill = { fillId: string; filledStake: number; odds: number; acceptedAt: Date; }; export type OrderResponse = { status: OrderStatus; fills: Fill[]; }; export type BetExecution = { status: OrderStatus; fills: Fill[]; requestedStake: number; remainingStake: number; };
export type SxClientMetadata = { oddsLadderStep: number; bettingDelayMs: number; heartbeatMs: number; maxOddsSlippage: number; fetchedAtMs: number; }; export type MetadataProvider = { latest(): Promise<SxClientMetadata>; }; export type QuoteSource = { bestQuote(request: QuoteRequest): Promise<Quote>; };
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
    const quote = await this.options.quotes.bestQuote(request);
    return { ...quote, odds: alignOddsToLadder(quote.odds, metadata.oddsLadderStep) };
  }

  async placeBet(request: BetRequest): Promise<BetExecution> {
    const metadata = await this.loadMetadata();
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
        odds: alignOddsToLadder(request.odds, metadata.oddsLadderStep),
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
    if (cached && this.isMetadataFresh(cached)) {
      return cached;
    }
    const metadata = await this.options.metadata.latest();
    if (!this.isMetadataFresh(metadata)) {
      const ageMs = this.clock() - metadata.fetchedAtMs;
      throw new SxClientError('E-SX-METADATA-STALE', 'metadata snapshot is stale', { ageMs });
    }
    if (!(metadata.oddsLadderStep > 0)) {
      throw new SxClientError('E-SX-METADATA-INVALID', 'invalid odds ladder step', { oddsLadderStep: metadata.oddsLadderStep });
    }
    this.cachedMetadata = metadata;
    return metadata;
  }

  private isMetadataFresh(metadata: SxClientMetadata): boolean {
    const age = this.clock() - metadata.fetchedAtMs;
    return age <= this.options.metadataTtlMs;
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

export function alignOddsToLadder(odds: number, step: number): number {
  if (!(step > 0) || !Number.isFinite(odds)) {
    throw new SxClientError('E-SX-ODDS-LADDER', 'odds not compatible with ladder', { odds, step });
  }
  return Math.round(odds / step) * step;
}

function safeSum(a: number, b: number): number {
  return Number.isFinite(a) && Number.isFinite(b) ? a + b : Number.POSITIVE_INFINITY;
}
