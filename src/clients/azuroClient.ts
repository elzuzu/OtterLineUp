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
