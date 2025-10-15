export type BankSnapshot = { totalUsd: number; perChainUsd: Record<string, number>; fetchedAt: Date };
export type GasSnapshot = { chain: string; priceGwei: number; fetchedAt: Date };
export type SxMetadataSnapshot = { oddsLadder: number[]; bettingDelayMs: number; heartbeatMs: number; fetchedAt: Date };
export type AzuroLimitsSnapshot = { maxPayoutUsd: number; quoteMargin: number; fetchedAt: Date };
export type SequencerStatus = { chain: string; healthy: boolean; checkedAt: Date };
export type RuntimeFetchers = { bank: () => Promise<BankSnapshot>; gas: (chain: string) => Promise<GasSnapshot>; sxMetadata: () => Promise<SxMetadataSnapshot>; azuroLimits: () => Promise<AzuroLimitsSnapshot>; sequencer: () => Promise<SequencerStatus> };
export type RuntimeTtls = { bankMs: number; gasMs: number; sxMetadataMs: number; azuroLimitsMs: number; sequencerMs: number };
export type RuntimeRegistryOptions = { ttl: RuntimeTtls; fetchers: RuntimeFetchers };
type CacheEntry<T> = { value: T; expiresAt: number };
type CacheSlot<T> = { entry: CacheEntry<T> | null; pending: Promise<T> | null };
const createSlot = <T>(): CacheSlot<T> => ({ entry: null, pending: null });

export class RuntimeRegistry {
  private readonly bankSlot = createSlot<BankSnapshot>();
  private readonly gasSlots = new Map<string, CacheSlot<GasSnapshot>>();
  private readonly sxSlot = createSlot<SxMetadataSnapshot>();
  private readonly azuroSlot = createSlot<AzuroLimitsSnapshot>();
  private readonly seqSlot = createSlot<SequencerStatus>();

  constructor(private readonly options: RuntimeRegistryOptions) {
    for (const [key, ttl] of Object.entries(options.ttl)) if (!Number.isFinite(ttl) || ttl <= 0) throw new Error(`RuntimeRegistry: ttl.${key} must be > 0`);
  }

  async getBank(): Promise<BankSnapshot> { return this.resolve(this.bankSlot, this.options.ttl.bankMs, this.options.fetchers.bank); }

  async getGas(chain: string): Promise<GasSnapshot> {
    if (typeof chain !== 'string' || chain.length === 0) throw new Error('RuntimeRegistry: chain required for gas');
    const slot = this.gasSlots.get(chain) ?? createSlot<GasSnapshot>();
    this.gasSlots.set(chain, slot);
    return this.resolve(slot, this.options.ttl.gasMs, () => this.options.fetchers.gas(chain));
  }

  async getSxMetadata(): Promise<SxMetadataSnapshot> { return this.resolve(this.sxSlot, this.options.ttl.sxMetadataMs, this.options.fetchers.sxMetadata); }

  async getAzuroLimits(): Promise<AzuroLimitsSnapshot> { return this.resolve(this.azuroSlot, this.options.ttl.azuroLimitsMs, this.options.fetchers.azuroLimits); }

  async sequencerHealth(): Promise<SequencerStatus> { return this.resolve(this.seqSlot, this.options.ttl.sequencerMs, this.options.fetchers.sequencer); }

  private resolve<T>(slot: CacheSlot<T>, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const entry = slot.entry;
    if (entry && entry.expiresAt > Date.now()) return Promise.resolve(entry.value);
    if (slot.pending) return slot.pending;
    const pending = loader().then((value) => {
      slot.entry = { value, expiresAt: Date.now() + ttlMs };
      slot.pending = null;
      return value;
    }, (error) => {
      slot.pending = null;
      throw error;
    });
    slot.pending = pending;
    return pending;
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
