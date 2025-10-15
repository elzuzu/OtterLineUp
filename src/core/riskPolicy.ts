import type { ConfigSnapshot } from './configManager.js';
import { ConfigManager } from './configManager.js';

export type StakeParameters = { stakePctCap: number; stakeMin: number; stakeMax: number; stakeStep?: number };
export type StopLossRule = { type: 'absolute' | 'percent'; value: number };
export type OddsSlippagePolicy = { default: number; perMarket: Record<string, number>; deltaOddReject: number };
export type RiskSnapshot = { hash: string; version?: string; bankSource: { chain: string; token: string; account: string }; sizing: StakeParameters; limits: { maxConcurrentTrades: number; stopLoss: StopLossRule; alertBalanceUsd: number }; thresholds: { mNetPct: number }; markets: { excludedLeagues: string[]; excludedMarkets: string[]; oddsSlippage: OddsSlippagePolicy } };
export type StakeDecision = { stake: number; applied: StakeParameters; snapshotHash: string };
export type StopLossEvaluation = { limitUsd: number; remainingUsd: number; triggered: boolean };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const num = (value: unknown, path: string): number => { if (typeof value !== 'number' || Number.isNaN(value)) throw new Error(`RiskPolicy: expected number at ${path}`); return value; };
const strArray = (value: unknown, path: string): string[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`RiskPolicy: expected array at ${path}`);
  return value.map((entry, index) => { if (typeof entry !== 'string') throw new Error(`RiskPolicy: expected string at ${path}[${index}]`); return entry; });
};

const parse = (snapshot: ConfigSnapshot): RiskSnapshot => {
  const raw = (snapshot.data?.risk ?? {}) as any;
  if (!raw.sizing || !raw.limits?.stop_loss || !raw.markets?.odds_slippage || !raw.thresholds) throw new Error('RiskPolicy: incomplete risk configuration');
  const sizing: StakeParameters = {
    stakePctCap: num(raw.sizing.stake_pct_cap, 'risk.sizing.stake_pct_cap'),
    stakeMin: num(raw.sizing.stake_min, 'risk.sizing.stake_min'),
    stakeMax: num(raw.sizing.stake_max, 'risk.sizing.stake_max'),
    stakeStep: raw.sizing.stake_step === undefined ? undefined : num(raw.sizing.stake_step, 'risk.sizing.stake_step'),
  };
  if (sizing.stakePctCap <= 0 || sizing.stakePctCap >= 1) throw new Error('RiskPolicy: stake_pct_cap must be between 0 and 1');
  if (sizing.stakeMin <= 0 || sizing.stakeMax <= 0 || sizing.stakeMin > sizing.stakeMax) throw new Error('RiskPolicy: invalid stake bounds');
  const stopType = raw.limits.stop_loss.type;
  if (stopType !== 'absolute' && stopType !== 'percent') throw new Error('RiskPolicy: stop_loss.type must be absolute|percent');
  const odds = raw.markets.odds_slippage;
  const perMarket: Record<string, number> = {};
  if (odds.per_market && typeof odds.per_market === 'object' && !Array.isArray(odds.per_market)) {
    for (const [key, value] of Object.entries(odds.per_market)) perMarket[key] = num(value, `risk.markets.odds_slippage.per_market.${key}`);
  }
  const bank = raw.bank?.source ?? {};
  const bankSource = { chain: typeof bank.chain === 'string' ? bank.chain : 'sx-rollup', token: typeof bank.token === 'string' ? bank.token : 'USDC', account: typeof bank.account === 'string' ? bank.account : 'unknown' };
  const limits = {
    maxConcurrentTrades: num(raw.limits.max_concurrent_trades, 'risk.limits.max_concurrent_trades'),
    stopLoss: { type: stopType, value: num(raw.limits.stop_loss.value, 'risk.limits.stop_loss.value') },
    alertBalanceUsd: num(raw.limits.alert_balance_usd, 'risk.limits.alert_balance_usd'),
  };
  const markets = {
    excludedLeagues: strArray(raw.markets.excluded_leagues, 'risk.markets.excluded_leagues'),
    excludedMarkets: strArray(raw.markets.excluded_markets, 'risk.markets.excluded_markets'),
    oddsSlippage: { default: num(odds.default, 'risk.markets.odds_slippage.default'), perMarket, deltaOddReject: num(odds.delta_odd_reject, 'risk.markets.odds_slippage.delta_odd_reject') },
  };
  return {
    hash: typeof raw.config_hash === 'string' ? raw.config_hash : snapshot.hash,
    version: typeof raw.version === 'string' ? raw.version : undefined,
    bankSource,
    sizing,
    limits,
    thresholds: { mNetPct: num(raw.thresholds.m_net_pct, 'risk.thresholds.m_net_pct') },
    markets,
  };
};

export class RiskPolicy {
  private current: RiskSnapshot;

  constructor(private readonly manager: ConfigManager) {
    this.current = parse(manager.getSnapshot());
    this.manager.on('reload', (next) => {
      this.current = parse(next);
    });
  }

  getSnapshot(): RiskSnapshot { return this.current; }

  computeStake(bankUsd: number): StakeDecision {
    if (!Number.isFinite(bankUsd) || bankUsd < 0) throw new Error('RiskPolicy: invalid bank value');
    const { stakePctCap, stakeMin, stakeMax, stakeStep } = this.current.sizing;
    let stake = clamp(bankUsd * stakePctCap, stakeMin, stakeMax);
    if (stakeStep && stakeStep > 0) stake = clamp(Math.round(stake / stakeStep) * stakeStep, stakeMin, stakeMax);
    return { stake, applied: this.current.sizing, snapshotHash: this.current.hash };
  }

  getOddsSlippage(market: string | null | undefined): number {
    if (market) {
      const custom = this.current.markets.oddsSlippage.perMarket[market];
      if (typeof custom === 'number') return custom;
    }
    return this.current.markets.oddsSlippage.default;
  }

  getDeltaOddReject(): number { return this.current.markets.oddsSlippage.deltaOddReject; }

  getMNetThreshold(): number { return this.current.thresholds.mNetPct; }

  getMaxConcurrentTrades(): number { return this.current.limits.maxConcurrentTrades; }

  getAlertBalanceUsd(): number { return this.current.limits.alertBalanceUsd; }

  shouldAlertBalance(bankUsd: number): boolean {
    if (!Number.isFinite(bankUsd) || bankUsd < 0) throw new Error('RiskPolicy: invalid bank value');
    return bankUsd <= this.current.limits.alertBalanceUsd;
  }

  evaluateStopLoss(realizedLossUsd: number, bankUsd: number): StopLossEvaluation {
    if (!Number.isFinite(realizedLossUsd) || realizedLossUsd < 0)
      throw new Error('RiskPolicy: invalid realized loss');
    if (!Number.isFinite(bankUsd) || bankUsd < 0) throw new Error('RiskPolicy: invalid bank value');
    const { stopLoss } = this.current.limits;
    const limit = stopLoss.type === 'absolute' ? stopLoss.value : (bankUsd * stopLoss.value) / 100;
    const remaining = Math.max(0, limit - realizedLossUsd);
    return { limitUsd: limit, remainingUsd: remaining, triggered: remaining <= 0 };
  }

  isLeagueAllowed(league: string | null | undefined): boolean {
    if (!league) return true;
    return !this.current.markets.excludedLeagues.includes(league);
  }

  isMarketAllowed(market: string | null | undefined): boolean {
    if (!market) return true;
    return !this.current.markets.excludedMarkets.includes(market);
  }

  getBankSource(): RiskSnapshot['bankSource'] { return this.current.bankSource; }
}
