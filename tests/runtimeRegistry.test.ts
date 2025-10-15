import assert from 'node:assert/strict';

import {
  RuntimeRegistry,
  type RuntimeRegistryOptions,
  type BankSnapshot,
  type GasSnapshot,
  type SxMetadataSnapshot,
  type AzuroLimitsSnapshot,
  type SequencerStatus,
} from '../src/core/runtimeRegistry.js';

let nowMs = 1_000;
const tick = (delta: number) => {
  nowMs += delta;
};

let bankCalls = 0;
const gasCalls = new Map<string, number>();
let metadataCalls = 0;
let azuroCalls = 0;
let sequencerCalls = 0;

const opts: RuntimeRegistryOptions = {
  ttl: { bankMs: 80, gasMs: 80, sxMetadataMs: 80, azuroLimitsMs: 80, sequencerMs: 80 },
  clock: () => nowMs,
  fetchers: {
    bank: async (): Promise<BankSnapshot> => {
      bankCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { totalUsd: 250, perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 }, fetchedAt: new Date(nowMs) };
    },
    gas: async (chain: string): Promise<GasSnapshot> => {
      gasCalls.set(chain, (gasCalls.get(chain) ?? 0) + 1);
      await new Promise((resolve) => setImmediate(resolve));
      return { chain, priceGwei: chain === 'sx-rollup' ? 0.1 : 0.5, fetchedAt: new Date(nowMs) };
    },
    sxMetadata: async (): Promise<SxMetadataSnapshot> => {
      metadataCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { oddsLadder: [1.91, 1.95], bettingDelayMs: 300, heartbeatMs: 2_000, fetchedAt: new Date(nowMs) };
    },
    azuroLimits: async (): Promise<AzuroLimitsSnapshot> => {
      azuroCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { maxPayoutUsd: 5_000, quoteMargin: 0.04, fetchedAt: new Date(nowMs) };
    },
    sequencer: async (): Promise<SequencerStatus> => {
      sequencerCalls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return { chain: 'arbitrum-one', healthy: true, checkedAt: new Date(nowMs) };
    },
    bank: async (): Promise<BankSnapshot> => ({
      totalUsd: (++bankCalls, 250),
      perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 },
      fetchedAt: new Date(),
    }),
    gas: async (chain: string): Promise<GasSnapshot> => ({
      chain,
      priceGwei: (gasCalls.set(chain, (gasCalls.get(chain) ?? 0) + 1), chain === 'sx-rollup' ? 0.1 : 0.5),
      fetchedAt: new Date(),
    }),
    sxMetadata: async (): Promise<SxMetadataSnapshot> => ({
      oddsLadder: (++sxCalls, [1.91, 1.95]),
      bettingDelayMs: 300,
      heartbeatMs: 2_000,
      fetchedAt: new Date(),
    }),
    azuroLimits: async (): Promise<AzuroLimitsSnapshot> => ({
      maxPayoutUsd: (++azuroCalls, 5_000),
      quoteMargin: 0.04,
      fetchedAt: new Date(),
    }),
    sequencer: async (): Promise<SequencerStatus> => ({
      chain: 'arbitrum-one',
      healthy: (sequencerCalls += 1, true),
      checkedAt: new Date(),
    }),
  },
};

const registry = new RuntimeRegistry(opts);

const [bankA, bankB] = await Promise.all([registry.getBank(), registry.getBank()]);
assert.equal(bankA.totalUsd, 250);
assert.equal(bankB.totalUsd, 250);
assert.equal(bankCalls, 1);

tick(30);
await registry.getBank();
assert.equal(bankCalls, 1, 'bank cache should still be valid');

tick(60);
await registry.getBank();
assert.equal(bankCalls, 2, 'bank cache should refresh after ttl');
await new Promise((resolve) => setTimeout(resolve, 60));
await registry.getBank();
assert.equal(bankCalls, 2);

const gasA = await registry.getGas('sx-rollup');
assert.equal(gasA.priceGwei, 0.1);
await registry.getGas('sx-rollup');
assert.equal(gasCalls.get('sx-rollup'), 1);

await registry.getGas('arbitrum-one');
assert.equal(gasCalls.get('arbitrum-one'), 1);

await assert.rejects(() => registry.getGas(''), /chain required/);

const metadataPromise = registry.getSxMetadata();
const metadataPromise2 = registry.getSxMetadata();
assert.strictEqual(metadataPromise, metadataPromise2, 'metadata calls should reuse inflight promise');
const metadata = await metadataPromise;
assert.deepEqual(metadata.oddsLadder, [1.91, 1.95]);
assert.equal(metadataCalls, 1);

await registry.getAzuroLimits();
await registry.getAzuroLimits();
assert.equal(azuroCalls, 1);

await registry.sequencerHealth();
await registry.sequencerHealth();
assert.equal(gasA.priceGwei, 0.1);

await Promise.all([registry.getSxMetadata(), registry.getAzuroLimits(), registry.sequencerHealth()]);
assert.equal(sxCalls, 1);
assert.equal(azuroCalls, 1);
assert.equal(sequencerCalls, 1);

await assert.rejects(() => registry.getGas(''));
const staleRegistry = new RuntimeRegistry({
  ttl: opts.ttl,
  fetchers: {
    ...opts.fetchers,
    bank: async (): Promise<BankSnapshot> => ({
      totalUsd: 500,
      perChainUsd: { 'sx-rollup': 300, 'arbitrum-one': 200 },
      fetchedAt: new Date(Date.now() - 5_000),
    }),
  },
});

await assert.rejects(staleRegistry.getBank(), /snapshot stale/);
