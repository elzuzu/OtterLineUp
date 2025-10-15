const EPSILON = 1e-9;

export class OddsConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OddsConversionError';
  }
}

const ensureFinite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new OddsConversionError(`${label} must be finite`);
  return value;
};

const ensureProbability = (value: number): number => {
  ensureFinite(value, 'probability');
  if (value <= 0 || value >= 1) throw new OddsConversionError('probability must be in (0, 1)');
  return value;
};

const ensureDecimalOdds = (value: number): number => {
  ensureFinite(value, 'decimalOdds');
  if (value <= 1 + EPSILON) throw new OddsConversionError('decimal odds must be greater than 1');
  return value;
};

const ensureCommission = (value: number): number => {
  ensureFinite(value, 'commission');
  if (value < 0 || value >= 1) throw new OddsConversionError('commission must be in [0, 1)');
  return value;
};

export const decimalFromProbability = (probability: number): number => 1 / ensureProbability(probability);

export const probabilityFromDecimal = (decimalOdds: number): number => 1 / ensureDecimalOdds(decimalOdds);

export const decimalFromAmerican = (americanOdds: number): number => {
  ensureFinite(americanOdds, 'americanOdds');
  if (americanOdds === 0) throw new OddsConversionError('american odds cannot be zero');
  return americanOdds > 0 ? 1 + americanOdds / 100 : 1 + 100 / Math.abs(americanOdds);
};

export const americanFromDecimal = (decimalOdds: number): number => {
  const odds = ensureDecimalOdds(decimalOdds);
  if (odds >= 2) return Math.round((odds - 1) * 100);
  return Math.round(-100 / (odds - 1));
};

export const applyCommission = (decimalOdds: number, commissionRate: number): number => {
  const odds = ensureDecimalOdds(decimalOdds);
  const commission = ensureCommission(commissionRate);
  const multiplier = 1 - commission;
  return 1 + (odds - 1) * multiplier;
};

export const removeCommission = (netDecimalOdds: number, commissionRate: number): number => {
  const odds = ensureDecimalOdds(netDecimalOdds);
  const commission = ensureCommission(commissionRate);
  const multiplier = 1 - commission;
  if (multiplier <= 0) throw new OddsConversionError('commission multiplier must be positive');
  return 1 + (odds - 1) / multiplier;
};

export const normalizedProbabilities = (decimalOdds: readonly number[]): number[] => {
  if (!decimalOdds.length) return [];
  const implied = decimalOdds.map((odds) => probabilityFromDecimal(odds));
  const total = implied.reduce((sum, value) => sum + value, 0);
  if (total <= EPSILON) throw new OddsConversionError('total implied probability must be positive');
  return implied.map((value) => value / total);
};

export const removeOverround = (decimalOdds: readonly number[]): number[] => {
  const probabilities = normalizedProbabilities(decimalOdds);
  return probabilities.map((probability) => decimalFromProbability(probability));
};

export type NetMarginInputs = {
  oddsSx: number;
  oddsAzuro: number;
  feesSx: number;
  feesAzuro: number;
  gasCost: number;
  slippageSx: number;
  slippageAzuro: number;
};

export type NetMarginBreakdown = {
  grossMargin: number;
  feesTotal: number;
  slippageTotal: number;
  gasTotal: number;
  netMargin: number;
};

const ensureCost = (value: number, label: string): number => {
  ensureFinite(value, label);
  if (value < 0) throw new OddsConversionError(`${label} must be non-negative`);
  return value;
};

export const computeNetMargin = (inputs: NetMarginInputs): NetMarginBreakdown => {
  const oddsSx = ensureDecimalOdds(inputs.oddsSx);
  const oddsAzuro = ensureDecimalOdds(inputs.oddsAzuro);
  const feesSx = ensureCost(inputs.feesSx, 'feesSx');
  const feesAzuro = ensureCost(inputs.feesAzuro, 'feesAzuro');
  const gasCost = ensureCost(inputs.gasCost, 'gasCost');
  const slippageSx = ensureCost(inputs.slippageSx, 'slippageSx');
  const slippageAzuro = ensureCost(inputs.slippageAzuro, 'slippageAzuro');

  const impliedSx = 1 / oddsSx;
  const impliedAzuro = 1 / oddsAzuro;
  const grossMargin = 1 - impliedSx - impliedAzuro;

  const feesTotal = feesSx + feesAzuro;
  const slippageTotal = slippageSx + slippageAzuro;
  const gasTotal = gasCost;
  const netMargin = grossMargin - (feesTotal + slippageTotal + gasTotal);

  return { grossMargin, feesTotal, slippageTotal, gasTotal, netMargin };
};
