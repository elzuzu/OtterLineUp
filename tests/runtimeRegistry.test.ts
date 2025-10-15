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

let bankCalls = 0;
let sxCalls = 0;
let azuroCalls = 0;
let sequencerCalls = 0;
const gasCalls = new Map<string, number>();

const opts: RuntimeRegistryOptions = {
  ttl: { bankMs: 40, gasMs: 40, sxMetadataMs: 40, azuroLimitsMs: 40, sequencerMs: 40 },
  fetchers: {
    bank: async (): Promise<BankSnapshot> => ({ totalUsd: (++bankCalls, 250), perChainUsd: { 'sx-rollup': 150, 'arbitrum-one': 100 }, fetchedAt: new Date() }),
    gas: async (chain: string): Promise<GasSnapshot> => ({ chain, priceGwei: (gasCalls.set(chain, (gasCalls.get(chain) ?? 0) + 1), chain === 'sx-rollup' ? 0.1 : 0.5), fetchedAt: new Date() }),
    sxMetadata: async (): Promise<SxMetadataSnapshot> => ({ oddsLadder: (++sxCalls, [1.91, 1.95]), bettingDelayMs: 300, heartbeatMs: 2_000, fetchedAt: new Date() }),
    azuroLimits: async (): Promise<AzuroLimitsSnapshot> => ({ maxPayoutUsd: (++azuroCalls, 5_000), quoteMargin: 0.04, fetchedAt: new Date() }),
    sequencer: async (): Promise<SequencerStatus> => ({ chain: 'arbitrum-one', healthy: (sequencerCalls += 1, true), checkedAt: new Date() }),
  },
};

const registry = new RuntimeRegistry(opts);
const [bankA, bankB] = await Promise.all([registry.getBank(), registry.getBank()]);
assert.equal(bankA.totalUsd, 250);
assert.equal(bankB.totalUsd, 250);
assert.equal(bankCalls, 1);
await new Promise((resolve) => setTimeout(resolve, 60));
await registry.getBank();
assert.equal(bankCalls, 2);
const gasA = await registry.getGas('sx-rollup');
await registry.getGas('sx-rollup');
assert.equal(gasCalls.get('sx-rollup'), 1);
await registry.getGas('arbitrum-one');
assert.equal(gasCalls.get('arbitrum-one'), 1);
assert.equal(gasA.priceGwei, 0.1);
await Promise.all([registry.getSxMetadata(), registry.getAzuroLimits(), registry.sequencerHealth()]);
assert.equal(sxCalls, 1);
assert.equal(azuroCalls, 1);
assert.equal(sequencerCalls, 1);

await assert.rejects(() => registry.getGas(''));
