export { ConfigManager, type ConfigManagerOptions, type ConfigSnapshot } from './core/configManager.js';
export {
  RiskPolicy,
  type OddsSlippagePolicy,
  type RiskSnapshot,
  type StakeDecision,
  type StakeParameters,
  type StopLossRule,
  type StopLossEvaluation,
} from './core/riskPolicy.js';
export { MetricsTracker, type MetricsSnapshot, type TradeSample } from './ops/metrics.js';
export { RiskPolicy, type OddsSlippagePolicy, type RiskSnapshot, type StakeDecision, type StakeParameters, type StopLossRule } from './core/riskPolicy.js';
export {
  OddsConversionError,
  americanFromDecimal,
  decimalFromAmerican,
  decimalFromProbability,
  normalizedProbabilities,
  probabilityFromDecimal,
  removeCommission,
  applyCommission,
  removeOverround,
  computeNetMargin,
  type NetMarginInputs,
  type NetMarginBreakdown,
} from './core/odds.js';
export { VaultClient, type VaultClientOptions, type VaultSecret, VaultError } from './core/vaultClient.js';
