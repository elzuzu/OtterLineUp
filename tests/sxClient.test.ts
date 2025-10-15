import { SxClient, SxClientError, type SxClientMetadata, type Quote, type OrderResponse } from '../src/clients/sxClient.js';

const now = 10_000;
const quote: Quote = { marketUid: 'm1', side: 'back', odds: 1.934, availableStake: 100 };
const baseMeta = (overrides: Partial<SxClientMetadata> = {}): SxClientMetadata => ({
  oddsLadderStep: 0.05,
  oddsLadder: [1.9, 1.95, 2.0],
  bettingDelayMs: 50,
  heartbeatMs: 200,
  maxOddsSlippage: 0.03,
  fetchedAtMs: now,
  ...overrides,
});
const orderExecutor = (response: OrderResponse, delayMs = 0) => ({
  submit: async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return response;
  },
});
const createClient = (response: OrderResponse, metaOverride: Partial<SxClientMetadata> = {}, delayMs = 0) =>
  new SxClient({
    metadataTtlMs: 1_000,
    metadata: { latest: async () => baseMeta(metaOverride) },
    quotes: { bestQuote: async () => quote },
    executor: orderExecutor(response, delayMs),
    clock: () => now,
  });

const createCachingClient = () => {
  let calls = 0;
  const metadata = {
    latest: async () => {
      calls += 1;
      if (calls > 1) {
        throw new Error('metadata refetched despite valid cache');
      }
      return baseMeta();
    },
  };
  const client = new SxClient({
    metadataTtlMs: 1_000,
    metadata,
    quotes: { bestQuote: async () => quote },
    executor: orderExecutor({ status: 'accepted', fills: [] }),
    clock: () => now,
  });
  return { client, getCalls: () => calls };
};

await (async () => {
  const laddered = await createClient({ status: 'accepted', fills: [] }).getBestQuote({ marketUid: 'm1', side: 'back', stake: 50 });
  console.assert(Math.abs(laddered.odds - 1.95) < 1e-9, 'quote should align to ladder');

  const ladderedFromArray = await createClient(
    { status: 'accepted', fills: [] },
    { oddsLadder: [1.83, 1.91, 2.01], oddsLadderStep: undefined },
  ).getBestQuote({ marketUid: 'm1', side: 'back', stake: 50 });
  console.assert(Math.abs(ladderedFromArray.odds - 1.91) < 1e-9, 'array ladder alignment mismatch');

  const partial = await createClient({ status: 'accepted', fills: [{ fillId: 'f1', filledStake: 40, odds: 1.9, acceptedAt: new Date(now) }] }).placeBet({ marketUid: 'm1', side: 'back', stake: 100, odds: 1.91, oddsSlippage: 0.01 });
  console.assert(partial.status === 'partially_accepted', 'partial fill status mismatch');
  console.assert(Math.abs(partial.remainingStake - 60) < 1e-9, 'remaining stake mismatch');

  try {
    await createClient({ status: 'accepted', fills: [] }, {}, 400).placeBet({ marketUid: 'm1', side: 'back', stake: 10, odds: 1.9, oddsSlippage: 0.01 });
    console.assert(false, 'expected heartbeat timeout');
  } catch (error) {
    console.assert(error instanceof SxClientError && error.code === 'E-SX-PARTIAL-TIMEOUT', 'timeout error mismatch');
  }

  try {
    await createClient({ status: 'accepted', fills: [] }, { maxOddsSlippage: 0.01 }).placeBet({ marketUid: 'm1', side: 'back', stake: 10, odds: 1.9, oddsSlippage: 0.02 });
    console.assert(false, 'expected slippage rejection');
  } catch (error) {
    console.assert(error instanceof SxClientError && error.code === 'E-SX-ODDS-SLIPPAGE', 'slippage error mismatch');
  }

  try {
    await createClient({ status: 'accepted', fills: [] }, { oddsLadder: [], oddsLadderStep: undefined }).getBestQuote({
      marketUid: 'm1',
      side: 'back',
      stake: 10,
    });
    console.assert(false, 'expected invalid odds ladder rejection');
  } catch (error) {
    console.assert(error instanceof SxClientError && error.code === 'E-SX-METADATA-INVALID', 'metadata ladder error mismatch');
  }

  const { client, getCalls } = createCachingClient();
  await client.getBestQuote({ marketUid: 'm1', side: 'back', stake: 10 });
  await client.placeBet({ marketUid: 'm1', side: 'back', stake: 10, odds: 1.9, oddsSlippage: 0.01 });
  console.assert(getCalls() === 1, 'metadata should be fetched once while cache is fresh');
})();
