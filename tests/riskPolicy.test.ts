import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

import type { ConfigSnapshot } from '../src/core/configManager.js';
import { RiskPolicy } from '../src/index.js';

const snapshot: ConfigSnapshot = {
  data: {
    risk: {
      config_hash: 'hash',
      bank: { source: { chain: 'sx-rollup', token: 'USDC', account: 'treasury' } },
      sizing: { stake_pct_cap: 0.05, stake_min: 10, stake_max: 200, stake_step: 5 },
      limits: {
        max_concurrent_trades: 2,
        stop_loss: { type: 'percent', value: 20 },
        alert_balance_usd: 50,
      },
      markets: {
        excluded_leagues: ['SX:SIM'],
        excluded_markets: ['player-props'],
        odds_slippage: { default: 0.02, per_market: { moneyline: 0.015 }, delta_odd_reject: 0.02 },
      },
      thresholds: { m_net_pct: 0.02 },
    },
  },
  sources: {},
  hash: 'hash',
  loadedAt: new Date(),
};

class StubManager extends EventEmitter {
  constructor(private readonly snap: ConfigSnapshot) {
    super();
  }

  getSnapshot(): ConfigSnapshot {
    return this.snap;
  }
}

const manager = new StubManager(snapshot) as any;
const policy = new RiskPolicy(manager);

const stake = policy.computeStake(1_000);
assert.equal(stake.stake, 50);
assert.equal(policy.getOddsSlippage('moneyline'), 0.015);
assert.equal(policy.getOddsSlippage('unknown'), 0.02);
assert.equal(policy.getDeltaOddReject(), 0.02);
assert.equal(policy.getMNetThreshold(), 0.02);
assert.equal(policy.getMaxConcurrentTrades(), 2);
assert.equal(policy.getAlertBalanceUsd(), 50);
assert.equal(policy.shouldAlertBalance(40), true);
assert.equal(policy.shouldAlertBalance(60), false);
assert.equal(policy.isLeagueAllowed('SX:SIM'), false);
assert.equal(policy.isLeagueAllowed('SX:L1'), true);
assert.equal(policy.isMarketAllowed('player-props'), false);
assert.equal(policy.isMarketAllowed('spread'), true);
const stopLoss = policy.evaluateStopLoss(150, 500);
assert.equal(stopLoss.limitUsd, 100);
assert.equal(stopLoss.remainingUsd, 0);
assert.equal(stopLoss.triggered, true);

