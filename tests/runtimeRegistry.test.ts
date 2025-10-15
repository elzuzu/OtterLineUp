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
import { AzuroClient, AzuroClientError } from '../src/clients/azuroClient.js';

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
    }),
    sequencer: async (): Promise<SequencerStatus> => ({
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
    }),
  },
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
