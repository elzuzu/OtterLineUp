import assert from 'node:assert/strict';

import {
  OddsConversionError,
  americanFromDecimal,
  computeNetMargin,
  decimalFromAmerican,
  decimalFromProbability,
  meetsNetMarginThreshold,
  probabilityFromDecimal,
} from '../src/index.js';

const american = -110;
const decimal = decimalFromAmerican(american);
assert.ok(Math.abs(decimal - 1.9090909) < 1e-6);
assert.equal(americanFromDecimal(decimal), -110);

const probability = probabilityFromDecimal(2.5);
assert.ok(Math.abs(probability - 0.4) < 1e-9);
assert.ok(Math.abs(decimalFromProbability(probability) - 2.5) < 1e-9);

const baseScenario = {
  oddsSx: 2.1,
  oddsAzuro: 2.05,
  feesSx: 0.004,
  feesAzuro: 0.003,
  gasCost: 0.002,
  slippageSx: 0.002,
  slippageAzuro: 0.0015,
};

const breakdown = computeNetMargin(baseScenario);

const gross = 1 - 1 / 2.1 - 1 / 2.05;
const totalCosts = 0.004 + 0.003 + 0.002 + 0.002 + 0.0015;
assert.ok(Math.abs(breakdown.grossMargin - gross) < 1e-12);
assert.equal(breakdown.feesTotal, 0.007);
assert.equal(breakdown.slippageTotal, 0.0035);
assert.equal(breakdown.gasTotal, 0.002);
assert.ok(Math.abs(breakdown.netMargin - (gross - totalCosts)) < 1e-12);

assert.equal(meetsNetMarginThreshold(baseScenario, 0.015), false);
assert.equal(
  meetsNetMarginThreshold(
    {
      oddsSx: 2.5,
      oddsAzuro: 2.6,
      feesSx: 0.002,
      feesAzuro: 0.002,
      gasCost: 0.001,
      slippageSx: 0.001,
      slippageAzuro: 0.001,
    },
    0.015,
  ),
  true,
);

assert.throws(
  () =>
    meetsNetMarginThreshold(
      {
        oddsSx: 2.5,
        oddsAzuro: 2.4,
        feesSx: 0,
        feesAzuro: 0,
        gasCost: 0,
        slippageSx: 0,
        slippageAzuro: 0,
      },
      1.2,
    ),
  OddsConversionError,
);

assert.throws(
  () =>
    computeNetMargin({
      oddsSx: 1.0,
      oddsAzuro: 2.1,
      feesSx: 0,
      feesAzuro: 0,
      gasCost: 0,
      slippageSx: 0,
      slippageAzuro: 0,
    }),
  OddsConversionError,
);
