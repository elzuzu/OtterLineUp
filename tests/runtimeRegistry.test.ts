import test from 'node:test';
import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RuntimeRegistry,
  type RuntimeRegistryOptions,
  type BankSnapshot,
  type GasSnapshot,
} from '../src/core/runtimeRegistry.js';
import { AzuroClient, AzuroClientError } from '../src/clients/azuroClient.js';

test('RuntimeRegistry caches snapshots, enforces TTLs and reuses inflight loads', async () => {
  let nowMs = 1_000;
  const advance = (delta: number) => {
    nowMs += delta;
  };

  let bankCalls = 0;
  const gasCalls = new Map<string, number>();
  let metadataCalls = 0;
  let azuroCalls = 0;
  let sequencerCalls = 0;

  const options: RuntimeRegistryOptions = {
    ttl: { bankMs: 80, gasMs: 80, sxMetadataMs: 80, azuroLimitsMs: 80, sequencerMs: 80 },
    clock: () => nowMs,
    fetchers: {
      bank: async (): Promise<BankSnapshot> => {
        bankCalls += 1;
        return {
          totalUsd: 250,
          perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 },
          fetchedAt: new Date(nowMs),
        };
      },
      gas: async (chain: string): Promise<GasSnapshot> => {
        gasCalls.set(chain, (gasCalls.get(chain) ?? 0) + 1);
        return { chain, priceGwei: chain === 'sx-rollup' ? 0.1 : 0.5, fetchedAt: new Date(nowMs) };
      },
      sxMetadata: async (): Promise<SxMetadataSnapshot> => {
        metadataCalls += 1;
        return { oddsLadder: [1.91, 1.95], bettingDelayMs: 300, heartbeatMs: 2_000, fetchedAt: new Date(nowMs) };
      },
      azuroLimits: async (): Promise<AzuroLimitsSnapshot> => {
        azuroCalls += 1;
        return { maxPayoutUsd: 5_000, quoteMargin: 0.04, fetchedAt: new Date(nowMs) };
      },
      sequencer: async (): Promise<SequencerStatus> => {
        sequencerCalls += 1;
        return { chain: 'arbitrum-one', healthy: true, checkedAt: new Date(nowMs) };
      },
    },
  };

  const registry = new RuntimeRegistry(options);

  const [bankA, bankB] = await Promise.all([registry.getBank(), registry.getBank()]);
  assert.equal(bankA.totalUsd, 250);
  assert.equal(bankB.totalUsd, 250);
  assert.equal(bankCalls, 1);

  advance(40);
  await registry.getBank();
  assert.equal(bankCalls, 1, 'bank cache should remain valid within TTL');

  advance(80);
  await registry.getBank();
  assert.equal(bankCalls, 2, 'bank cache should refresh after TTL');

  const gasA = await registry.getGas('sx-rollup');
  assert.equal(gasA.priceGwei, 0.1);
  await registry.getGas('sx-rollup');
  assert.equal(gasCalls.get('sx-rollup'), 1);

  await registry.getGas('arbitrum-one');
  assert.equal(gasCalls.get('arbitrum-one'), 1);

  await assert.rejects(registry.getGas(''), /chain required/);

  const metadataPromiseA = registry.getSxMetadata();
  const metadataPromiseB = registry.getSxMetadata();
  assert.strictEqual(metadataPromiseA, metadataPromiseB, 'should reuse inflight metadata fetch');
  const metadata = await metadataPromiseA;
  assert.deepEqual(metadata.oddsLadder, [1.91, 1.95]);
  assert.equal(metadataCalls, 1);

  await registry.getAzuroLimits();
  await registry.getAzuroLimits();
  assert.equal(azuroCalls, 1);

  await registry.sequencerHealth();
  await registry.sequencerHealth();
  assert.equal(sequencerCalls, 1);

  registry.invalidate();
  await registry.getSxMetadata();
  assert.equal(metadataCalls, 2, 'invalidate should clear cache entries');
});

test('RuntimeRegistry rejects stale snapshots based on timestamps', async () => {
  const registry = new RuntimeRegistry({
    ttl: { bankMs: 80, gasMs: 80, sxMetadataMs: 80, azuroLimitsMs: 80, sequencerMs: 80 },
    fetchers: {
      bank: async (): Promise<BankSnapshot> => ({
        totalUsd: 500,
        perChainUsd: { 'sx-rollup': 300, 'arbitrum-one': 200 },
        fetchedAt: new Date(Date.now() - 5_000),
      }),
      gas: async (): Promise<GasSnapshot> => {
        throw new Error('unused');
      },
      sxMetadata: async (): Promise<SxMetadataSnapshot> => {
        throw new Error('unused');
      },
      azuroLimits: async (): Promise<AzuroLimitsSnapshot> => {
        throw new Error('unused');
      },
      sequencer: async (): Promise<SequencerStatus> => {
        throw new Error('unused');
      },
    },
  });

  await assert.rejects(registry.getBank(), /snapshot stale/);
});
let nowMs = 1_000;
const tick = (delta: number) => {
  nowMs += delta;
};
const snapshotTime = () => new Date(nowMs);
let bankCalls = 0;
const gasCalls = new Map<string, number>();
let metadataCalls = 0;
let azuroCalls = 0;
let sequencerCalls = 0;

const opts: RuntimeRegistryOptions = {
  ttl: { bankMs: 80, gasMs: 80, sxMetadataMs: 80, azuroLimitsMs: 80, sequencerMs: 80 },
  clock: () => nowMs,
  fetchers: {
    bank: async (): Promise<BankSnapshot> => ({
      totalUsd: (bankCalls += 1, 250),
      perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 },
      fetchedAt: snapshotTime(),
describe('RuntimeRegistry', () => {
  let nowMs: number, registry: RuntimeRegistry, bankCalls: number, metadataCalls: number, azuroCalls: number, sequencerCalls: number;
  const gasCalls = new Map<string, number>();

  const baseFetchers = (): RuntimeRegistryOptions['fetchers'] => ({
    bank: async (): Promise<BankSnapshot> => ({
      totalUsd: (bankCalls += 1, 250),
      perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 },
      fetchedAt: new Date(nowMs),
    }),
    gas: async (chain: string): Promise<GasSnapshot> => ({
      chain,
      priceGwei: (gasCalls.set(chain, (gasCalls.get(chain) ?? 0) + 1), chain === 'sx-rollup' ? 0.1 : 0.5),
      fetchedAt: snapshotTime(),
    }),
    sxMetadata: async (): Promise<SxMetadataSnapshot> => ({
      oddsLadder: [1.91, 1.95],
      bettingDelayMs: 300,
      heartbeatMs: 2_000,
      fetchedAt: (metadataCalls += 1, snapshotTime()),
    }),
    azuroLimits: async (): Promise<AzuroLimitsSnapshot> => ({
      maxPayoutUsd: (azuroCalls += 1, 5_000),
      quoteMargin: 0.04,
      fetchedAt: snapshotTime(),
      fetchedAt: new Date(nowMs),
    }),
    sxMetadata: async () => ({
      oddsLadder: (metadataCalls += 1, [1.91, 1.95]),
      bettingDelayMs: 300,
      heartbeatMs: 2_000,
      fetchedAt: new Date(nowMs),
    }),
    azuroLimits: async () => ({
      maxPayoutUsd: (azuroCalls += 1, 5_000),
      quoteMargin: 0.04,
      fetchedAt: new Date(nowMs),
    }),
    sequencer: async () => ({
      chain: 'arbitrum-one',
      healthy: (sequencerCalls += 1, true),
      checkedAt: snapshotTime(),
    }),
  },
};

const registry = new RuntimeRegistry(opts);
const [bankA, bankB] = await Promise.all([registry.getBank(), registry.getBank()]);
assert.equal(bankA.totalUsd, 250);
assert.equal(bankB.totalUsd, 250);
assert.equal(bankCalls, 1);

tick(40);
await registry.getBank();
assert.equal(bankCalls, 1);

tick(50);
await registry.getBank();
assert.equal(bankCalls, 2);

await registry.getGas('sx-rollup');
await registry.getGas('sx-rollup');
assert.equal(gasCalls.get('sx-rollup'), 1);
await registry.getGas('arbitrum-one');
assert.equal(gasCalls.get('arbitrum-one'), 1);
await assert.rejects(() => registry.getGas(''), /chain required/);

const [metaA, metaB] = await Promise.all([registry.getSxMetadata(), registry.getSxMetadata()]);
assert.strictEqual(metaA, metaB);
assert.equal(metadataCalls, 1);

await registry.getAzuroLimits();
await registry.getAzuroLimits();
assert.equal(azuroCalls, 1);
await registry.sequencerHealth();
await registry.sequencerHealth();
assert.equal(sequencerCalls, 1);

registry.invalidate();
await registry.getBank();
assert.equal(bankCalls, 3);

const staleRegistry = new RuntimeRegistry({
  ttl: opts.ttl,
  clock: () => nowMs,
  fetchers: {
    ...opts.fetchers,
    bank: async (): Promise<BankSnapshot> => ({
      totalUsd: 500,
      perChainUsd: { 'sx-rollup': 300 },
      fetchedAt: new Date(nowMs - 10_000),
      checkedAt: new Date(nowMs),
    }),
  });

  const createRegistry = (overrides?: Partial<RuntimeRegistryOptions['fetchers']>): RuntimeRegistry =>
    new RuntimeRegistry({
      ttl: { bankMs: 80, gasMs: 80, sxMetadataMs: 80, azuroLimitsMs: 80, sequencerMs: 80 },
      clock: () => nowMs,
      fetchers: { ...baseFetchers(), ...overrides },
    });

  beforeEach(() => {
    nowMs = 1_000;
    bankCalls = metadataCalls = azuroCalls = sequencerCalls = 0;
    gasCalls.clear();
    registry = createRegistry();
  });

  it('caches snapshots within ttl and reuses inflight promises', async () => {
    const [bankA, bankB] = await Promise.all([registry.getBank(), registry.getBank()]);
    assert.deepEqual([bankA.totalUsd, bankB.totalUsd], [250, 250]);
    assert.equal(bankCalls, 1);
    nowMs += 40; await registry.getBank(); assert.equal(bankCalls, 1);
    nowMs += 60; await registry.getBank(); assert.equal(bankCalls, 2);
    assert.equal((await registry.getGas('sx-rollup')).priceGwei, 0.1);
    await registry.getGas('sx-rollup'); assert.equal(gasCalls.get('sx-rollup'), 1);
    await registry.getGas('arbitrum-one'); assert.equal(gasCalls.get('arbitrum-one'), 1);
    const metadataPromise = registry.getSxMetadata();
    assert.strictEqual(metadataPromise, registry.getSxMetadata());
    assert.deepEqual((await metadataPromise).oddsLadder, [1.91, 1.95]);
    assert.equal(metadataCalls, 1);
    await Promise.all([registry.getAzuroLimits(), registry.getAzuroLimits()]);
    assert.equal(azuroCalls, 1);
    await Promise.all([registry.sequencerHealth(), registry.sequencerHealth()]);
    assert.equal(sequencerCalls, 1);
  });
  it('requires non-empty chain for gas snapshots', async () => {
    await assert.rejects(() => registry.getGas(''), /chain required/);
  });

  it('invalidates caches on demand', async () => {
    await registry.getBank(); assert.equal(bankCalls, 1);
    registry.invalidate();
    await registry.getBank(); assert.equal(bankCalls, 2);
  });

  it('rejects stale snapshots from fetchers', async () => {
    const staleRegistry = createRegistry({
      bank: async (): Promise<BankSnapshot> => ({
        totalUsd: 500,
        perChainUsd: { 'sx-rollup': 300, 'arbitrum-one': 200 },
        fetchedAt: new Date(nowMs - 5_000),
      }),
    });
    await assert.rejects(staleRegistry.getBank(), /snapshot stale/);
  });
});

await assert.rejects(() => staleRegistry.getBank(), /snapshot stale/);

const azuroEngine = {
  async fetchQuote() {
    return { quotedOdd: 1.84, marginalOdd: 1.85, maxPayoutLimit: 1_000 };
  },
  async maxPayout() {
    return 1_000;
  },
};
const azuroClient = new AzuroClient({ deltaOddReject: 0.02, engine: azuroEngine });
const azuroQuote = await azuroClient.simulateQuote({ stake: 50 });
assert.ok(Math.abs(azuroQuote.delta - 0.01) < 1e-9);
assert.ok(Math.abs(azuroQuote.expectedPayout - 92.5) < 1e-9);
try {
  await new AzuroClient({ deltaOddReject: 0.005, engine: azuroEngine }).simulateQuote({ stake: 50 });
  assert.fail('expected Δodd threshold error');
} catch (error) {
  assert.ok(error instanceof AzuroClientError);
  assert.equal(error.code, 'E-AZU-ΔODD-THRESH');
}
