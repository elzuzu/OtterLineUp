export type BankSnapshot = { totalUsd: number; perChainUsd: Record<string, number>; fetchedAt: Date };
export type GasSnapshot = { chain: string; priceGwei: number; fetchedAt: Date };
export type SxMetadataSnapshot = { oddsLadder: number[]; bettingDelayMs: number; heartbeatMs: number; fetchedAt: Date };
export type AzuroLimitsSnapshot = { maxPayoutUsd: number; quoteMargin: number; fetchedAt: Date };
export type SequencerStatus = { chain: string; healthy: boolean; checkedAt: Date };

export type RuntimeFetchers = {
  bank: () => Promise<BankSnapshot>;
  gas: (chain: string) => Promise<GasSnapshot>;
  sxMetadata: () => Promise<SxMetadataSnapshot>;
  azuroLimits: () => Promise<AzuroLimitsSnapshot>;
  sequencer: () => Promise<SequencerStatus>;
};

export type RuntimeTtls = {
  bankMs: number;
  gasMs: number;
  sxMetadataMs: number;
  azuroLimitsMs: number;
  sequencerMs: number;
};

export type RuntimeRegistryOptions = { ttl: RuntimeTtls; fetchers: RuntimeFetchers; clock?: () => number };

type CacheEntry<T> = { value: T; expiresAt: number };
type CacheSlot<T> = { entry: CacheEntry<T> | null; pending: Promise<T> | null };

const TIMESTAMP_FIELDS: Array<'fetchedAt' | 'checkedAt'> = ['fetchedAt', 'checkedAt'];
const createSlot = <T>(): CacheSlot<T> => ({ entry: null, pending: null });
const extractTimestamp = (value: unknown): number | null => {
  if (!value || typeof value !== 'object') return null;
  for (const field of TIMESTAMP_FIELDS) {
    if (field in value) {
      const candidate = (value as Record<string, unknown>)[field];
      if (candidate instanceof Date) return candidate.getTime();
    }
  }
  return null;
};

const computeExpiry = (value: unknown, ttlMs: number, label: string): number => {
  const timestamp = extractTimestamp(value);
  if (timestamp === null) throw new Error(`RuntimeRegistry: ${label} snapshot missing timestamp`);
  const now = Date.now();
  const age = now - timestamp;
  if (age > ttlMs) throw new Error(`RuntimeRegistry: ${label} snapshot stale (age ${age}ms > ttl ${ttlMs}ms)`);
  return Math.min(now, timestamp) + ttlMs;
};

export class RuntimeRegistry {
  private readonly bankSlot = createSlot<BankSnapshot>();

  private readonly gasSlots = new Map<string, CacheSlot<GasSnapshot>>();

  private readonly sxSlot = createSlot<SxMetadataSnapshot>();

  private readonly azuroSlot = createSlot<AzuroLimitsSnapshot>();

  private readonly seqSlot = createSlot<SequencerStatus>();
  private readonly now: () => number;

  constructor(private readonly options: RuntimeRegistryOptions) {
    this.now = options.clock ?? (() => Date.now());
    for (const [key, ttl] of Object.entries(options.ttl)) {
      if (!Number.isFinite(ttl) || ttl <= 0) {
        throw new Error(`RuntimeRegistry: ttl.${key} must be > 0`);
      }
    }
  }

  async getBank(): Promise<BankSnapshot> {
    return this.resolve(this.bankSlot, this.options.ttl.bankMs, this.options.fetchers.bank, 'bank');
  }

  async getGas(chain: string): Promise<GasSnapshot> {
    if (typeof chain !== 'string' || chain.length === 0) {
      throw new Error('RuntimeRegistry: chain required for gas');
    }
    const slot = this.gasSlots.get(chain) ?? createSlot<GasSnapshot>();
    this.gasSlots.set(chain, slot);
    return this.resolve(slot, this.options.ttl.gasMs, () => this.options.fetchers.gas(chain), `gas:${chain}`);
  }

  async getSxMetadata(): Promise<SxMetadataSnapshot> {
    return this.resolve(this.sxSlot, this.options.ttl.sxMetadataMs, this.options.fetchers.sxMetadata, 'sxMetadata');
  }

  async getAzuroLimits(): Promise<AzuroLimitsSnapshot> {
    return this.resolve(this.azuroSlot, this.options.ttl.azuroLimitsMs, this.options.fetchers.azuroLimits, 'azuroLimits');
  }

  async sequencerHealth(): Promise<SequencerStatus> {
    return this.resolve(this.seqSlot, this.options.ttl.sequencerMs, this.options.fetchers.sequencer, 'sequencer');
  }

  invalidate(): void {
    this.bankSlot.entry = null;
    this.bankSlot.pending = null;
    this.sxSlot.entry = null;
    this.sxSlot.pending = null;
    this.azuroSlot.entry = null;
    this.azuroSlot.pending = null;
    this.seqSlot.entry = null;
    this.seqSlot.pending = null;
    for (const slot of this.gasSlots.values()) {
      slot.entry = null;
      slot.pending = null;
    }
    this.gasSlots.clear();
  }

  private resolve<T>(slot: CacheSlot<T>, ttlMs: number, loader: () => Promise<T>, label: string): Promise<T> {
    const entry = slot.entry;
    const now = this.now();
    if (entry && entry.expiresAt > now) return Promise.resolve(entry.value);
    if (slot.pending) return slot.pending;
    const pending = loader()
      .then((value) => {
        slot.entry = { value, expiresAt: computeExpiry(value, ttlMs, label) };
        slot.pending = null;
        return value;
      })
      .catch((error) => {
        slot.pending = null;
        throw error;
      });
    slot.pending = pending;
    return pending;
  }
}
