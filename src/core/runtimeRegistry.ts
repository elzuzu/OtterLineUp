type PlainObject = Record<string, unknown>;
export interface BankBalance extends PlainObject { balanceUsd: number; }
export interface GasSnapshot extends PlainObject { priceGwei: number; }
export interface SxMetadata extends PlainObject { oddsLadder: number[]; bettingDelayMs: number; heartbeatMs: number; }
export interface AzuroLimits extends PlainObject { maxPayoutUsd: number; quoteDeltaThreshold: number; }
export interface SequencerHealth extends PlainObject { healthy: boolean; }
type CacheKey = 'banks' | 'gas' | 'sxMetadata' | 'azuroLimits' | 'sequencer';
type CacheValueMap = { banks: Record<string, BankBalance>; gas: Record<string, GasSnapshot>; sxMetadata: SxMetadata; azuroLimits: AzuroLimits; sequencer: SequencerHealth; };
type ProviderMap = { [K in CacheKey]: () => Promise<CacheValueMap[K]>; };
type CacheEntry<T> = { value: T | null; expiresAt: number; inflight: Promise<T> | null };
const DEFAULT_TTL: Record<CacheKey, number> = { banks: 15_000, gas: 10_000, sxMetadata: 60_000, azuroLimits: 60_000, sequencer: 5_000 };
export interface RuntimeRegistryOptions { providers: ProviderMap; ttlMs?: Partial<Record<CacheKey, number>>; }
export class RuntimeRegistry {
  private readonly providers: ProviderMap;
  private readonly ttl: Record<CacheKey, number>;
  private readonly cache: Record<CacheKey, CacheEntry<unknown>>;
  constructor(options: RuntimeRegistryOptions) {
    this.providers = options.providers;
    this.ttl = { ...DEFAULT_TTL, ...(options.ttlMs ?? {}) } as Record<CacheKey, number>;
    const entry = () => ({ value: null, expiresAt: 0, inflight: null } as CacheEntry<unknown>);
    this.cache = { banks: entry(), gas: entry(), sxMetadata: entry(), azuroLimits: entry(), sequencer: entry() };
  }
  async getBank(chain?: string): Promise<Record<string, BankBalance> | BankBalance | undefined> {
    const banks = await this.resolve('banks');
    return chain ? banks[chain] : banks;
  }
  async getGas(chain: string): Promise<GasSnapshot | undefined> { return (await this.resolve('gas'))[chain]; }
  async getSxMetadata(): Promise<SxMetadata> { return this.resolve('sxMetadata'); }
  async getAzuroLimits(): Promise<AzuroLimits> { return this.resolve('azuroLimits'); }
  async sequencerHealth(): Promise<SequencerHealth> { return this.resolve('sequencer'); }
  invalidate(key?: CacheKey): void {
    const targets = key ? [key] : (Object.keys(this.cache) as CacheKey[]);
    targets.forEach((bucket) => { this.cache[bucket] = { value: null, expiresAt: 0, inflight: null }; });
  }
  private async resolve<K extends CacheKey>(key: K): Promise<CacheValueMap[K]> {
    const entry = this.cache[key] as CacheEntry<CacheValueMap[K]>;
    const now = Date.now();
    if (entry.value !== null && entry.expiresAt > now) return entry.value;
    if (entry.inflight) return entry.inflight;
    const inflight = this.providers[key]()
      .then((value) => {
        entry.value = value;
        entry.expiresAt = Date.now() + this.ttl[key];
        entry.inflight = null;
        return value;
      })
      .catch((error) => {
        entry.inflight = null;
        throw error;
      });
    entry.inflight = inflight;
    return inflight;
  }
}
