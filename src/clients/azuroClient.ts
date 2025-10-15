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
export type AzuroQuoteRequest = { stake: number; amountToken?: number };
export type AzuroQuoteResponse = { quotedOdd: number; marginalOdd: number; maxPayoutLimit: number; amountToken?: number };
export type QuoteEngine = { fetchQuote(request: AzuroQuoteRequest): Promise<AzuroQuoteResponse>; maxPayout(): Promise<number> };
export type AzuroQuoteSimulation = { quotedOdd: number; marginalOdd: number; delta: number; stake: number; amountToken?: number; expectedPayout: number; payoutCap: number; payoutHeadroom: number };
export type AzuroClientOptions = { deltaOddReject: number; engine: QuoteEngine };
const EPSILON = 1e-9;
const ensureFinite = (value: number, code: string, field: string, message: string): number => {
  if (!Number.isFinite(value)) throw new AzuroClientError(code, message, { [field]: value });
  return value;
};
const ensurePositive = (value: number, code: string, field: string, message: string): number => {
  if (!(value > 0)) throw new AzuroClientError(code, message, { [field]: value });
  return value;
};
export class AzuroClientError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'AzuroClientError';
  }
}
export class AzuroClient {
  private readonly threshold: number;
  constructor(private readonly options: AzuroClientOptions) {
    const threshold = ensureFinite(options.deltaOddReject, 'E-AZU-CONFIG', 'deltaOddReject', 'invalid Δodd threshold');
    this.threshold = ensurePositive(threshold, 'E-AZU-CONFIG', 'deltaOddReject', 'invalid Δodd threshold');
  }
  async simulateQuote(request: AzuroQuoteRequest): Promise<AzuroQuoteSimulation> {
    const stake = ensurePositive(ensureFinite(request.stake, 'E-AZU-STAKE', 'stake', 'stake must be finite'), 'E-AZU-STAKE', 'stake', 'stake must be positive');
    const quote = await this.options.engine.fetchQuote(request);
    const quotedOdd = ensurePositive(ensureFinite(quote.quotedOdd, 'E-AZU-INVALID-RESPONSE', 'quotedOdd', 'quoted odd must be finite'), 'E-AZU-INVALID-RESPONSE', 'quotedOdd', 'quoted odd must be positive');
    const marginalOdd = ensurePositive(ensureFinite(quote.marginalOdd, 'E-AZU-INVALID-RESPONSE', 'marginalOdd', 'marginal odd must be finite'), 'E-AZU-INVALID-RESPONSE', 'marginalOdd', 'marginal odd must be positive');
    const payoutCapRaw = await this.options.engine.maxPayout();
    const payoutCapQuote = Number.isFinite(quote.maxPayoutLimit) && quote.maxPayoutLimit > 0 ? quote.maxPayoutLimit : Number.POSITIVE_INFINITY;
    const payoutCap = Math.min(ensurePositive(ensureFinite(payoutCapRaw, 'E-AZU-CONFIG', 'maxPayout', 'max payout must be finite'), 'E-AZU-CONFIG', 'maxPayout', 'max payout must be positive'), payoutCapQuote);
    if (!Number.isFinite(payoutCap) || !(payoutCap > 0)) throw new AzuroClientError('E-AZU-CONFIG', 'max payout must be a positive finite amount', { payoutCap });
    const expectedPayout = stake * marginalOdd;
    if (expectedPayout - payoutCap > EPSILON) throw new AzuroClientError('E-AZU-MAX-PAYOUT', 'max payout exceeded', { expectedPayout, payoutCap });
    const delta = Math.abs(marginalOdd - quotedOdd);
    if (delta - this.threshold > EPSILON) throw new AzuroClientError('E-AZU-ΔODD-THRESH', 'Δodd above configured threshold', { delta, threshold: this.threshold });
    return { quotedOdd, marginalOdd, delta, stake, amountToken: quote.amountToken ?? request.amountToken, expectedPayout, payoutCap, payoutHeadroom: Math.max(0, payoutCap - expectedPayout) };
  }
}
