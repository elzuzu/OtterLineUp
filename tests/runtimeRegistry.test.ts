import test from 'node:test';
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
