import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canonicalFingerprint, marketUidFromIdentifier, MarketUidError, type MarketIdentifier } from '../src/index.js';

const baseIdentifier: MarketIdentifier = {
  operator: 'sx',
  sport: 'Soccer',
  league: 'Premier League',
  event: 'Arsenal vs Chelsea',
  marketType: 'moneyline',
  outcome: 'home',
  variant: 'pre',
  ladder: null,
  eventTimestamp: new Date('2024-08-10T16:30:27.450Z'),
};

assert.equal(canonicalFingerprint(baseIdentifier), 'muid|v1|sx|soccer|premier_league|arsenal_vs_chelsea|moneyline|pre|na|20240810T1630Z|home');
assert.equal(marketUidFromIdentifier(baseIdentifier), 'muid-v1-b05bf41737061f9a2d1595d7');

const accentedIdentifier: MarketIdentifier = {
  operator: 'SX',
  sport: 'Fútbol',
  league: 'Brasileirão Série A',
  event: 'São Paulo  FC vs  Grêmio',
  marketType: 'Moneyline',
  outcome: 'Home',
  eventTimestamp: new Date('2024-03-15T15:30:10Z'),
};

assert.equal(canonicalFingerprint(accentedIdentifier), 'muid|v1|sx|futbol|brasileirao_serie_a|sao_paulo_fc_vs_gremio|moneyline|na|na|20240315T1530Z|home');

assert.throws(() => canonicalFingerprint({ ...baseIdentifier, event: '   ' }), (error: unknown) => {
  assert.ok(error instanceof MarketUidError);
  assert.equal(error.field, 'event');
  return true;
});

assert.throws(
  () => marketUidFromIdentifier({ ...baseIdentifier, eventTimestamp: new Date('invalid-date') }),
  (error: unknown) => {
    assert.ok(error instanceof MarketUidError);
    assert.equal(error.field, 'eventTimestamp');
    return true;
  },
);

const [header, ...rows] = readFileSync('data/market_uid_seed.csv', 'utf8').trim().split('\n');
assert.equal(header, 'operator,sport,league,event,market_type,outcome,variant,ladder,event_timestamp,market_uid');

for (const row of rows) {
  const [operator, sport, league, event, marketType, outcome, variant, ladder, eventTimestamp, marketUid] = row.split(',');
  const identifier: MarketIdentifier = {
    operator,
    sport,
    league,
    event,
    marketType,
    outcome,
    variant: variant || undefined,
    ladder: ladder || undefined,
    eventTimestamp: new Date(eventTimestamp),
  };
  assert.equal(marketUidFromIdentifier(identifier), marketUid);
}
