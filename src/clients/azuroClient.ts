import type { AzuroLimitsSnapshot } from '../core/runtimeRegistry.js';

export type QuoteRequest = { conditionId: string; outcomeId: string; stakeUsd: number; amountToken?: number };
export type QuoteResponse = { quotedOdd: number; marginalOdd: number; amountToken?: number };
export type QuoteSimulation = { quotedOdd: number; marginalOdd: number; delta: number; stakeUsd: number; amountToken?: number; expectedPayout: number; payoutCap: number; payoutHeadroom: number };
export interface QuoteEngine { fetchQuote(request: QuoteRequest): Promise<QuoteResponse>; }
export interface LimitsProvider { latest(): Promise<AzuroLimitsSnapshot>; }
export type AzuroClientOptions = { engine: QuoteEngine; limits: LimitsProvider; deltaOddReject?: number };
export class AzuroClientError extends Error { constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) { super(message); this.name = 'AzuroClientError'; } }
export class AzuroClient {
  private readonly deltaOddReject: number;
  constructor(private readonly options: AzuroClientOptions) {
    this.deltaOddReject = options.deltaOddReject ?? 0.02;
    if (!(this.deltaOddReject >= 0 && Number.isFinite(this.deltaOddReject))) throw new AzuroClientError('E-AZU-CONFIG', 'deltaOddReject must be a finite non-negative number', { deltaOddReject: options.deltaOddReject });
  }
  async simulateQuote(request: QuoteRequest): Promise<QuoteSimulation> {
    const { stakeUsd } = request;
    if (!(Number.isFinite(stakeUsd) && stakeUsd > 0)) throw new AzuroClientError('E-AZU-STAKE', 'stake must be a positive finite amount', { stakeUsd });
    const limits = await this.options.limits.latest();
    if (!this.isValidLimitsSnapshot(limits)) throw new AzuroClientError('E-AZU-LIMITS', 'invalid azuro limits snapshot', limits);
    const quote = await this.options.engine.fetchQuote(request);
    if (!this.isValidQuote(quote)) throw new AzuroClientError('E-AZU-QUOTE', 'invalid quote response from engine', quote);
    const expectedPayout = stakeUsd * quote.marginalOdd;
    if (expectedPayout > limits.maxPayoutUsd + Number.EPSILON) throw new AzuroClientError('E-AZU-MAX-PAYOUT', 'expected payout exceeds configured cap', { expectedPayout, payoutCap: limits.maxPayoutUsd });
    const delta = Math.abs(quote.marginalOdd - quote.quotedOdd);
    if (delta > this.deltaOddReject + Number.EPSILON) throw new AzuroClientError('E-AZU-DELTA', 'marginal odd delta above configured threshold', { delta, threshold: this.deltaOddReject });
    return { quotedOdd: quote.quotedOdd, marginalOdd: quote.marginalOdd, delta, stakeUsd, amountToken: quote.amountToken ?? request.amountToken, expectedPayout, payoutCap: limits.maxPayoutUsd, payoutHeadroom: Math.max(0, limits.maxPayoutUsd - expectedPayout) };
  }
  private isValidLimitsSnapshot(snapshot: AzuroLimitsSnapshot): boolean { return Number.isFinite(snapshot.maxPayoutUsd) && snapshot.maxPayoutUsd > 0 && snapshot.fetchedAt instanceof Date; }
  private isValidQuote(quote: QuoteResponse): boolean { return [quote.quotedOdd, quote.marginalOdd].every((odd) => Number.isFinite(odd) && odd > 1); }
}
