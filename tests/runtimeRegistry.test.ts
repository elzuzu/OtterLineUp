import { RuntimeRegistry } from '../src/core/runtimeRegistry.js';

let bankCalls = 0;
let gasCalls = 0;
let metadataCalls = 0;
let azuroCalls = 0;
let sequencerCalls = 0;

const registry = new RuntimeRegistry({
  ttlMs: { banks: 30, gas: 30, sxMetadata: 30, azuroLimits: 30, sequencer: 30 },
  providers: {
    banks: async () => {
      bankCalls += 1;
      return { 'sx-rollup': { balanceUsd: 120.5 } };
    },
    gas: async () => {
      gasCalls += 1;
      return { arbitrum: { priceGwei: 0.04 } };
    },
    sxMetadata: async () => {
      metadataCalls += 1;
      return { oddsLadder: [1.8, 1.9], bettingDelayMs: 400, heartbeatMs: 5_000 };
    },
    azuroLimits: async () => {
      azuroCalls += 1;
      return { maxPayoutUsd: 1_000, quoteDeltaThreshold: 0.02 };
    },
    sequencer: async () => {
      sequencerCalls += 1;
      return { healthy: true };
    },
  },
});

await (async () => {
  const bank = await registry.getBank('sx-rollup');
  console.assert(bank && bank.balanceUsd === 120.5, 'bank snapshot mismatch');
  await registry.getBank('sx-rollup');
  console.assert(bankCalls === 1, 'bank provider should be cached');
  await new Promise((resolve) => setTimeout(resolve, 35));
  await registry.getBank('sx-rollup');
  console.assert(bankCalls === 2, 'bank provider should refresh after ttl');

  const gas = await registry.getGas('arbitrum');
  console.assert(gas && gas.priceGwei === 0.04, 'gas snapshot mismatch');
  await registry.getGas('arbitrum');
  console.assert(gasCalls === 1, 'gas provider should be cached');

  const metadata = await registry.getSxMetadata();
  console.assert(Array.isArray(metadata.oddsLadder), 'metadata ladder missing');
  await registry.getSxMetadata();
  console.assert(metadataCalls === 1, 'metadata provider should be cached');

  const limits = await registry.getAzuroLimits();
  console.assert(limits.maxPayoutUsd === 1_000, 'azuro limits mismatch');
  await registry.getAzuroLimits();
  console.assert(azuroCalls === 1, 'azuro provider should be cached');

  const sequencer = await registry.sequencerHealth();
  console.assert(sequencer.healthy, 'sequencer health mismatch');
  await registry.sequencerHealth();
  console.assert(sequencerCalls === 1, 'sequencer provider should be cached');
})();
